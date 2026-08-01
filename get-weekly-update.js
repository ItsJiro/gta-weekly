require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');

// --- SUPABASE CONFIGURATION ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const SUPABASE_TABLE_NAME = 'gta-vehicles';
const SUPABASE_TARGET_TABLE = 'weekly_discounts';
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

    // We will collect rows to push to Supabase here
    const rowsToInsert = [];

    // Helper to push items cleanly
    function addItem(category, name, discount = null, discountedPrice = null) {
      const vehicleId = vehicleMapping[name.toLowerCase()] || name;
      rowsToInsert.push({
        id: vehicleId,
        category: category,
        discount: discount,
        discountedPrice: discountedPrice
      });
    }

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

      if (typeText.includes('podium vehicle')) {
        addItem('podiumVehicle', name);
      } else if (typeText.includes('prize ride')) {
        addItem('prizeRide', name);
      } else if (typeText.includes('premium deluxe motorsport')) {
        addItem('premiumDeluxeMotorsport', name);
      } else if (typeText.includes('luxury autos')) {
        addItem('luxuryAutos', name);
      } else if (typeText.includes('premium test ride')) {
        addItem('premiumTestRide', name);
      } else if (typeText.includes('test ride')) {
        addItem('testRides', name);
      }
    });

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
        addItem('vehicleDiscounts', name, discountPercentage, discountedPrice);
      } else if (url.includes('/properties/') || url.includes('/property-types/')) {
        addItem('propertyDiscounts', name, discountPercentage, discountedPrice);
      }
    });

    // --- 4. UPLOAD TO SUPABASE (NORMAL TABLE) ---
    console.log('Clearing old weekly data from Supabase...');
    // Delete everything currently in the table to reset for the new week
    const { error: deleteError } = await supabase
      .from(SUPABASE_TARGET_TABLE)
      .delete()
      .neq('id', '0'); // Deletes all rows

    if (deleteError) {
      console.warn('Warning clearing old data:', deleteError.message);
    }

    console.log(`Inserting ${rowsToInsert.length} fresh items into Supabase...`);
    const { error: insertError } = await supabase
      .from(SUPABASE_TARGET_TABLE)
      .insert(rowsToInsert);

    if (insertError) {
      throw new Error(`Supabase insert failed: ${insertError.message}`);
    }

    console.log('\n✅ Successfully saved normalized weekly data directly to Supabase table!');

  } catch (error) {
    console.error(`❌ Scraping or database upload failed: ${error.message}`);
    process.exit(1);
  }
}

scrapeShowrooms();
