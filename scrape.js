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

// Helper to prevent getting IP banned by GTABase during the deep scrape
const delay = ms => new Promise(res => setTimeout(res, ms));

// Helper to safely extract text from GTABase's specific list structures
function extractStat($v, selector, labelToReplace) {
  // Looks for the specific div.field-value inside the provided li selector
  let text = $v(`${selector} div.field-value`).text().trim();

  // Fallback in case the structure changes slightly
  if (!text) {
      text = $v(selector).text().replace(labelToReplace, '').trim();
  }

  // Clean up excessive spaces or line breaks
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

    // Keep a flat array of references so we can easily loop through them for the deep scrape later
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
        acquisition: null, // New field for the dealership
        class: null,
        topSpeed: null,
        acceleration: null,
        url: resolveUrl($titleLink.attr('href')),
        image: resolveUrl($item.find('.item-image img').attr('src'))
      };

      // Add to our flat list for stat scraping
      if (vehicleObj.url) {
        vehiclesToScrape.push(vehicleObj);
      }

      // Slot the object into the correct JSON category (passed by reference)
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

            // Extract Manufacturer (Uses :not(.purchase) to exclude the dealership name)
            vehicle.manufacturer = extractStat($v, 'li.field-entry.manufacturer:not(.purchase)', 'Manufacturer');

            // Extract Acquisition (Dealership)
            vehicle.acquisition = extractStat($v, 'li.field-entry.purchase.manufacturer', 'Acquisition');

            // Extract Vehicle Class
            vehicle.class = extractStat($v, 'li.field-entry.vehicle-class', 'Vehicle Class');

            // Extract Speed
            vehicle.topSpeed = extractStat($v, 'li.field-entry.speed.speed', 'Speed');

            // Extract Acceleration
            vehicle.acceleration = extractStat($v, 'li.field-entry.acceleration.acceleration', 'Acceleration');

            // Wait 1.5 seconds so GitHub Actions doesn't trigger a firewall block
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
