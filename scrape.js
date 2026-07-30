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
    .replace(/_resized/g, '')      // Removes '_resized' from filename
    .replace(/\/resized\//g, '/')  // Removes '/resized/' directory segment if present
    .replace(/_+320x180/g, '');    // Removes '_320x180' or '__320x180' resolution tags
}

// Helper to prevent getting IP banned by GTABase during the deep scrape
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

    // 1. Initialize the strict JSON structure
    const showroomsData = {
      podiumVehicle: null,
      prizeRide: null,
      premiumDeluxeMotorsport: [],
      luxuryAutos: [],
      testRides: [],
      premiumTestRide: null
    };

    const vehiclesToScrape = [];
    const $showroomsSection = $('#showrooms-test-rides').closest('.field-entry');

    // 2. Parse the main page and build the base objects
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

      if (vehicleObj.url) {
        vehiclesToScrape.push(vehicleObj);
      }

      if (typeText.includes('podium vehicle')) {
        showroomsData.podiumVehicle = vehicleObj;
      } else if (typeText.includes('prize ride')) {
        showroomsData.prizeRide = vehicleObj;
      } else if (typeText.includes('premium deluxe motorsport')) {
        showroomsData.premiumDeluxeMotorsport.push(vehicleObj);
      } else if (typeText.includes('luxury autos')) {
        showroomsData.luxuryAutos.push(vehicleObj);
      } else if (typeText.includes('premium test ride')) {
        showroomsData.premiumTestRide = vehicleObj;
      } else if (typeText.includes('test ride')) {
        showroomsData.testRides.push(vehicleObj);
      }
    });

    // 3. FIX FOR BACKWARDS TAGGING
    if (showroomsData.luxuryAutos.length > showroomsData.premiumDeluxeMotorsport.length) {
        console.log('⚠️ Detected backwards tags from GTABase. Swapping PDM and Luxury Autos arrays...');
        const temp = showroomsData.premiumDeluxeMotorsport;
        showroomsData.premiumDeluxeMotorsport = showroomsData.luxuryAutos;
        showroomsData.luxuryAutos = temp;
    }

    console.log(`Found ${vehiclesToScrape.length} vehicles. Fetching detailed stats...`);

    // 4. Deep Scrape: Visit each vehicle URL to get the stats
    for (let i = 0; i < vehiclesToScrape.length; i++) {
        const vehicle = vehiclesToScrape[i];
        console.log(`[${i + 1}/${vehiclesToScrape.length}] Scraping stats for: ${vehicle.name}`);

        try {
            const { data: vehicleData } = await axios.get(vehicle.url, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                }
            });
            const $v = cheerio.load(vehicleData);

            vehicle.manufacturer = extractStat($v, 'li.field-entry.manufacturer:not(.purchase)', 'Manufacturer');
            vehicle.acquisition = extractStat($v, 'li.field-entry.purchase.manufacturer', 'Acquisition');
            vehicle.price = extractStat($v, 'li.field-entry.price', 'Price', 'span.field-value');
            vehicle.class = extractStat($v, 'li.field-entry.vehicle-class', 'Vehicle Class');
            vehicle.topSpeed = extractStat($v, 'li.field-entry.speed.speed', 'Speed');
            vehicle.acceleration = extractStat($v, 'li.field-entry.acceleration.acceleration', 'Acceleration');

            await delay(1500);

        } catch (err) {
            console.error(`❌ Failed to scrape stats for ${vehicle.name}:`, err.message);
        }
    }

    // 5. Save the final robust data to JSON
    fs.writeFileSync('showrooms.json', JSON.stringify(showroomsData, null, 2), 'utf-8');
    console.log('\n✅ Successfully compiled all data and saved to showrooms.json');

  } catch (error) {
    console.error(`❌ Main page scraping failed: ${error.message}`);
  }
}

scrapeShowrooms();
