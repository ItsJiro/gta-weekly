require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// --- SUPABASE CONFIGURATION ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const SUPABASE_TABLE_NAME = 'gta-vehicles';
const supabase = createClient(supabaseUrl, supabaseKey);

const TARGET_URL = 'https://www.gtabase.com/gta-online/weekly-update-bonuses-discounts';

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

    // --- 2. PARSE SHOWROOMS & TEST RIDES ---
    const $showroomsSection = $('#showrooms-test-rides').closest('.field-entry');

    $showroomsSection.find('li.gta-bonuses').each((_, itemEl) => {
      const $item = $(itemEl);
      const typeText = $item.find('.item-type').text().trim().toLowerCase();

      const $titleClone = $item.find('h3.contentheading a').clone();
      $titleClone.find('.badge').remove();
      let name = $titleClone.text().trim();

      if (name.toUpperCase().startsWith('HSW ')) {
        name = name.substring(4).trim();
      }

      // Look up the ID. If it fails to find a match, it falls back to the Name string so you can debug what was missed
      const vehicleId = vehicleMapping[name.toLowerCase()] || name;

      const vehicleObj = { id: vehicleId };

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

      if ($item.closest('#showrooms-test-rides').length > 0) return;

      const $titleLink = $item.find('h3.contentheading a, .contentheading a').first();
      if ($titleLink.length === 0) return;

      const $titleClone = $titleLink.clone();
      $titleClone.find('.badge').remove();
      const name = $titleClone.text().trim();
      const url = $titleLink.attr('href') || '';

      const discountPercentage = $item.find('div.discounted-price span.badge.new').text().trim() || null;
      const $discountDivClone = $item.find('div.discounted-price').clone();
      $discountDivClone.find('span.badge').remove();
      const discountedPrice = $discountDivClone.text().trim() || null;

      if (!discountPercentage && !discountedPrice) return;

      if (url.includes('/vehicles/')) {
        const vehicleId = vehicleMapping[name.toLowerCase()] || name;

        weeklyData.vehicleDiscounts.push({
          id: vehicleId,
          discount: discountPercentage,
          discountedPrice: discountedPrice
        });

      } else if (url.includes('/properties/') || url.includes('/property-types/')) {
        // Properties are not in your gta-vehicles database, so we output the Name instead of an ID
        weeklyData.propertyDiscounts.push({
          name: name,
          discount: discountPercentage,
          discountedPrice: discountedPrice
        });
      }
    });

    // Save final output
    fs.writeFileSync('weekly-update.json', JSON.stringify(weeklyData, null, 2), 'utf-8');
    console.log('\n✅ Successfully compiled lightweight data and saved to weekly-update.json');

  } catch (error) {
    console.error(`❌ Main page scraping failed: ${error.message}`);
  }
}

scrapeShowrooms();
