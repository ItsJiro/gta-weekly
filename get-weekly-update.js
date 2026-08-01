require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// --- SUPABASE CONFIGURATION ---
// Replace these with your actual Supabase project URL, Anon Key, and Table Name
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const SUPABASE_TABLE_NAME = 'gta-vehicles';
const supabase = createClient(supabaseUrl, supabaseKey);

const BASE_URL = 'https://www.gtabase.com';
const TARGET_URL = 'https://www.gtabase.com/gta-online/weekly-update-bonuses-discounts';

// Helper to resolve partial URLs
function resolveUrl(urlPath) {
  if (!urlPath) return null;
  return urlPath.startsWith('http') ? urlPath : `${BASE_URL}${urlPath}`;
}

// Fetch ID Mapping from Supabase
async function getVehicleMapping() {
  console.log('Fetching vehicle ID mapping from Supabase...');

  const { data, error } = await supabase
    .from(SUPABASE_TABLE_NAME)
    .select('ID, Name');

  if (error) {
    console.error('Error fetching mapping:', error);
    return {};
  }

  const mapping = {};
  data.forEach(vehicle => {
    if (vehicle.Name && vehicle.ID) {
      mapping[vehicle.Name.toLowerCase().trim()] = vehicle.ID;
    }
  });

  return mapping;
}

// Generate Image URL using the Dictionary
function getImageUrlFromId(vehicleName, mappingDictionary) {
  if (!vehicleName) return null;

  const normalizedName = vehicleName.toLowerCase().trim();
  const modelId = mappingDictionary[normalizedName];

  if (!modelId) {
    console.warn(`⚠️ No ID mapping found for: ${vehicleName}`);
    return null;
  }

  // Ensure the extension matches what you use in your bucket (.png, .jpg, etc.)
  return `${supabaseUrl}/storage/v1/object/public/images/vehicles/${modelId}.webp`;
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

// Helper to recursively remove URL properties from the final object
function removeUrlsFromData(obj) {
  if (Array.isArray(obj)) {
    obj.forEach(removeUrlsFromData);
  } else if (obj !== null && typeof obj === 'object') {
    if (obj.hasOwnProperty('url')) {
      delete obj.url;
    }
    Object.values(obj).forEach(removeUrlsFromData);
  }
}

async function scrapeShowrooms() {
  // 1. Initialize mapping dictionary before scraping
  const vehicleMapping = await getVehicleMapping();

  console.log('Fetching weekly update from GTABase...');

  try {
    const { data } = await axios.get(TARGET_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const $ = cheerio.load(data);

    // --- 1. DOM PURGE FOR GTA+ SECTION ---
    $('h2.section-title, h2, h3').each((_, el) => {
      const $h2 = $(el);
      const text = $h2.text().toUpperCase();
      const hasGtaPlusSpan = $h2.find('span[id*="gta-monthly-benefits"], span[id*="gta-plus"]').length > 0;

      if (text.includes('GTA+ MONTHLY BENEFITS') || hasGtaPlusSpan) {
        console.log('✂️ Found GTA+ section in DOM. Purging section and all trailing elements...');
        $h2.nextAll().remove();
        const $parentEntry = $h2.closest('.field-entry');
        if ($parentEntry.length) {
          $parentEntry.nextAll().remove();
          $parentEntry.remove();
        } else {
          $h2.remove();
        }
      }
    });

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

    const allScrapedVehicles = [];

    // --- 2. PARSE SHOWROOMS & TEST RIDES ---
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
        image: getImageUrlFromId(name, vehicleMapping)
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

    if (weeklyData.luxuryAutos.length > weeklyData.premiumDeluxeMotorsport.length) {
        const temp = weeklyData.premiumDeluxeMotorsport;
        weeklyData.premiumDeluxeMotorsport = weeklyData.luxuryAutos;
        weeklyData.luxuryAutos = temp;
    }

    // --- 3. PARSE IN-GAME DISCOUNTS ---
    $('li.gta-bonuses.item-scale').each((_, itemEl) => {
      const $item = $(itemEl);

      if ($item.closest('#showrooms-test-rides').length > 0) {
        return;
      }

      const $titleLink = $item.find('h3.contentheading a, .contentheading a').first();
      if ($titleLink.length === 0) return;

      const $titleClone = $titleLink.clone();
      $titleClone.find('.badge').remove();
      const name = $titleClone.text().trim();
      const url = resolveUrl($titleLink.attr('href'));

      if (!url) return;

      const discountPercentage = $item.find('div.discounted-price span.badge.new').text().trim() || null;
      const $discountDivClone = $item.find('div.discounted-price').clone();
      $discountDivClone.find('span.badge').remove();
      const discountedPrice = $discountDivClone.text().trim() || null;

      let basePrice = $item.find('div.article-info s').text().trim();
      if (!basePrice) {
        basePrice = $item.find('div.article-info').text().trim();
      }
      basePrice = basePrice ? basePrice.replace(/\s+/g, ' ') : null;

      if (!discountPercentage && !discountedPrice) {
        return;
      }

      if (url.includes('/vehicles/')) {
        const vehicleDiscountObj = {
          name,
          discount: discountPercentage,
          discountedPrice: discountedPrice,
          manufacturer: null,
          acquisition: null,
          basePrice: null,
          class: null,
          topSpeed: null,
          acceleration: null,
          url,
          image: getImageUrlFromId(name, vehicleMapping)
        };

        weeklyData.vehicleDiscounts.push(vehicleDiscountObj);
        allScrapedVehicles.push(vehicleDiscountObj);

      } else if (url.includes('/properties/') || url.includes('/property-types/')) {
        weeklyData.propertyDiscounts.push({
          name,
          discount: discountPercentage,
          basePrice: basePrice,
          discountedPrice: discountedPrice,
          url,
          image: getImageUrlFromId(name, vehicleMapping)
        });
      }
    });

    // --- 4. DEEP SCRAPE FOR VEHICLES ---
    const uniqueUrls = [...new Set(allScrapedVehicles.map(v => v.url).filter(Boolean))];

    console.log(`Found ${uniqueUrls.length} unique vehicles to scrape stats for...`);

    for (let i = 0; i < uniqueUrls.length; i++) {
        const url = uniqueUrls[i];

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

            instancesToUpdate.forEach(vehicle => {
                vehicle.manufacturer = manufacturer;
                vehicle.acquisition = acquisition;

                if (vehicle.hasOwnProperty('basePrice')) {
                    vehicle.basePrice = price;
                } else {
                    vehicle.price = price;
                }

                vehicle.class = vClass;
                vehicle.topSpeed = topSpeed;
                vehicle.acceleration = acceleration;
            });

            await delay(1500);

        } catch (err) {
            console.error(`❌ Failed to scrape stats for ${url}:`, err.message);
        }
    }

    // --- 5. CLEANUP ---
    // Sweep through the data one final time to delete the GTABase URLs before saving
    removeUrlsFromData(weeklyData);

    // Save final output
    fs.writeFileSync('weekly-update.json', JSON.stringify(weeklyData, null, 2), 'utf-8');
    console.log('\n✅ Successfully compiled all data and saved to weekly-update.json');

  } catch (error) {
    console.error(`❌ Main page scraping failed: ${error.message}`);
  }
}

scrapeShowrooms();
