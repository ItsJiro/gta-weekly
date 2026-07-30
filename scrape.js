const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const BASE_URL = 'https://www.gtabase.com';
const TARGET_URL = 'https://www.gtabase.com/gta-online/weekly-update-bonuses-discounts';

// Helper to resolve partial URLs
function resolveUrl(urlPath) {
  if (!urlPath) return null;
  return urlPath.startsWith('http') ? urlPath : `${BASE_URL}${urlPath}`;
}

// Helper to clean image URLs and retrieve full-resolution assets
function cleanImageUrl(urlPath) {
  const fullUrl = resolveUrl(urlPath);
  if (!fullUrl) return null;

  return fullUrl
    .replace(/_resized/g, '')
    .replace(/\/resized\//g, '/')
    .replace(/_+320x180/g, '');
}

// Helper to prevent getting IP banned by GTABase
const delay = ms => new Promise(res => setTimeout(res, ms));

// Helper to safely extract text from GTABase's specific list structures
function extractStat($v, selector, labelToReplace, valueSelector = 'div.field-value') {
  let text = $v(`${selector} ${valueSelector}`).text().trim();
  if (!text) {
      text = $v(selector).text().replace(labelToReplace, '').trim();
  }
  return text.replace(/\s+/g, ' ') || "Unknown";
}

async function scrapeShowrooms() {
  console.log('Fetching weekly update from GTABase...');

  try {
    const { data } = await axios.get(TARGET_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const $ = cheerio.load(data);

    // 1. Initialize the complete JSON structure
    const weeklyData = {
      podiumVehicle: null,
      prizeRide: null,
      premiumDeluxeMotorsport: [],
      luxuryAutos: [],
      testRides: [],
      premiumTestRide: null,
      vehicleDiscounts: [],
      propertyDiscounts: []
    };

    // We will store every vehicle object reference here to update them later
    const allScrapedVehicles = [];

    // --- PARSE SHOWROOMS & TEST RIDES ---
    const $showroomsSection = $('#showrooms-test-rides').closest('.field-entry');

    $showroomsSection.find('li.gta-bonuses').each((_, itemEl) => {
      const $item = $(itemEl);
      const typeText = $item.find('.item-type').text().trim().toLowerCase();
      const $titleLink = $item.find('h3.contentheading a');

      const $titleClone = $titleLink.clone();
      $titleClone.find('.badge').remove();
      let name = $titleClone.text().trim();
      if (name.toUpperCase().startsWith('HSW ')) {
        name = name.substring(4).trim();
      }

      const vehicleObj = {
        name,
        manufacturer: null,
        acquisition: null,
        price: null,
        class: null,
        topSpeed: null,
        acceleration: null,
        url: resolveUrl($titleLink.attr('href')),
        image: cleanImageUrl($item.find('.item-image img').attr('src'))
      };

      if (vehicleObj.url) allScrapedVehicles.push(vehicleObj);

      if (typeText.includes('podium vehicle')) {
        weeklyData.podiumVehicle = vehicleObj;
      } else if (typeText.includes('prize ride')) {
        weeklyData.prizeRide = vehicleObj;
      } else if (typeText.includes('premium deluxe motorsport')) {
        weeklyData.premiumDeluxeMotorsport.push(vehicleObj);
      } else if (typeText.includes('luxury autos')) {
        weeklyData.luxuryAutos.push(vehicleObj);
      } else if (typeText.includes('premium test ride')) {
        weeklyData.premiumTestRide = vehicleObj;
      } else if (typeText.includes('test ride')) {
        weeklyData.testRides.push(vehicleObj);
      }
    });

    // Backwards tagging fix
    if (weeklyData.luxuryAutos.length > weeklyData.premiumDeluxeMotorsport.length) {
        const temp = weeklyData.premiumDeluxeMotorsport;
        weeklyData.premiumDeluxeMotorsport = weeklyData.luxuryAutos;
        weeklyData.luxuryAutos = temp;
    }

    // --- PARSE IN-GAME DISCOUNTS ---
    // Specifically target the class you identified
    $('li.gta-bonuses.item-scale').each((_, itemEl) => {
      const $item = $(itemEl);

      // EXCLUDE GTA+ Benefits by checking the main header of its section
      const sectionLabel = $item.closest('.field-entry').find('.field-label, h2, h3').first().text().toLowerCase();
      if (sectionLabel.includes('gta+')) {
          return; // Skip this iteration entirely
      }

      const $titleLink = $item.find('h3.contentheading a, .contentheading a').first();
      if ($titleLink.length === 0) return;

      const $titleClone = $titleLink.clone();

      // Extract discount text from the badge (or fallback to item-type)
      let discountText = $titleClone.find('.badge').text().trim() || $item.find('.item-type').text().trim();

      $titleClone.find('.badge').remove();
      const name = $titleClone.text().trim();
      const url = resolveUrl($titleLink.attr('href'));
      const image = cleanImageUrl($item.find('.item-image img').attr('src'));

      if (!url) return;

      if (url.includes('/vehicles/')) {
        const vehicleDiscountObj = {
          name,
          discount: discountText || "Discounted",
          manufacturer: null,
          acquisition: null,
          price: null,
          class: null,
          topSpeed: null,
          acceleration: null,
          url,
          image
        };

        weeklyData.vehicleDiscounts.push(vehicleDiscountObj);
        allScrapedVehicles.push(vehicleDiscountObj); // Queue for deep scraping

      } else if (url.includes('/properties/') || url.includes('/property-types/')) {
        weeklyData.propertyDiscounts.push({
          name,
          discount: discountText || "Discounted",
          url,
          image
        });
      }
    });

    // --- DEEP SCRAPE FOR VEHICLES ---
    // Deduplicate URLs so we don't scrape the same vehicle twice (e.g. if it's in a showroom AND on discount)
    const uniqueUrls = [...new Set(allScrapedVehicles.map(v => v.url).filter(Boolean))];

    console.log(`Found ${uniqueUrls.length} unique vehicles to scrape stats for...`);

    for (let i = 0; i < uniqueUrls.length; i++) {
        const url = uniqueUrls[i];

        // Find all JSON objects that share this URL so we can update them simultaneously
        const instancesToUpdate = allScrapedVehicles.filter(v => v.url === url);
        console.log(`[${i + 1}/${uniqueUrls.length}] Scraping stats for: ${instancesToUpdate[0].name}`);

        try {
            const { data: vehicleData } = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
            });
            const $v = cheerio.load(vehicleData);

            const manufacturer = extractStat($v, 'li.field-entry.manufacturer:not(.purchase)', 'Manufacturer');
            const acquisition = extractStat($v, 'li.field-entry.purchase.manufacturer', 'Acquisition');
            const price = extractStat($v, 'li.field-entry.price', 'Price', 'span.field-value');
            const vClass = extractStat($v, 'li.field-entry.vehicle-class', 'Vehicle Class');
            const topSpeed = extractStat($v, 'li.field-entry.speed.speed', 'Speed');
            const acceleration = extractStat($v, 'li.field-entry.acceleration.acceleration', 'Acceleration');

            // Apply stats to all matching objects in our data arrays
            instancesToUpdate.forEach(vehicle => {
                vehicle.manufacturer = manufacturer;
                vehicle.acquisition = acquisition;
                vehicle.price = price;
                vehicle.class = vClass;
                vehicle.topSpeed = topSpeed;
                vehicle.acceleration = acceleration;
            });

            await delay(1500);

        } catch (err) {
            console.error(`❌ Failed to scrape stats for ${url}:`, err.message);
        }
    }

    // Save final output
    fs.writeFileSync('showrooms.json', JSON.stringify(weeklyData, null, 2), 'utf-8');
    console.log('\n✅ Successfully compiled all data and saved to showrooms.json');

  } catch (error) {
    console.error(`❌ Main page scraping failed: ${error.message}`);
  }
}

scrapeShowrooms();
