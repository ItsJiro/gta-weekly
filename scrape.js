const cheerio = require('cheerio');
const fs = require('fs');

const BASE_URL = 'https://www.gtabase.com';

function resolveUrl(urlPath) {
  if (!urlPath) return null;
  return urlPath.startsWith('http') ? urlPath : `${BASE_URL}${urlPath}`;
}

// The exact HTML snippet you provided
const htmlContent = `
<span class="field-value "><div class="category-items gta6-database">
<ul class="fields-container">
<li class="gta-bonuses item-scale">
<div class="item-type"><span class="podium-vehicle">Podium Vehicle</span></div><div class="pull-left item-image"><div class="img-fit">
<a href="/grand-theft-auto-v/vehicles/ratel" title="Ratel"><img src="https://www.gtabase.com/images/jch-optimize/ng/images_gta-5_vehicles_off-road_main_resized_ratel__320x180.webp" alt="Ratel" title="Ratel" width="320" height="180" itemprop="thumbnailUrl" loading="lazy"></a>
</div></div>
<div class="item-info">
<h3 class="contentheading noindex"><a href="/grand-theft-auto-v/vehicles/ratel" title="Ratel">Ratel</a></h3>
</div>
</li>
<li class="gta-bonuses item-scale">
<div class="item-type"><span class="prize-ride">LS Car Meet Prize Ride</span></div><div class="pull-left item-image"><div class="img-fit">
<a href="/grand-theft-auto-v/vehicles/postlude" title="Postlude"><img src="https://www.gtabase.com/images/jch-optimize/ng/images_gta-5_vehicles_coupes_main_resized_postlude__320x180.webp" alt="Postlude" title="Postlude" width="320" height="180" itemprop="thumbnailUrl" loading="lazy"></a>
</div></div>
<div class="item-info">
<h3 class="contentheading noindex"><a href="/grand-theft-auto-v/vehicles/postlude" title="Postlude">Postlude</a></h3>
</div>
</li>
<li class="gta-bonuses item-scale">
<div class="item-type"><span class="premium-deluxe-motorsport">Premium Deluxe Motorsport</span></div><div class="pull-left item-image"><div class="img-fit">
<a href="/vehicles/grand-theft-auto-v/laufer" title="Läufer"><img src="/igallery/gta5-database/resized/laufer-360_320x180.jpg" alt="Läufer" title="Läufer" width="320" height="180" itemprop="thumbnailUrl" loading="lazy"></a>
</div></div>
<div class="item-info">
<h3 class="contentheading noindex"><a href="/vehicles/grand-theft-auto-v/laufer" title="Läufer">Läufer</a></h3>
</div>
</li>
<li class="gta-bonuses item-scale">
<div class="item-type"><span class="premium-deluxe-motorsport">Premium Deluxe Motorsport</span></div><div class="pull-left item-image"><div class="img-fit">
<a href="/vehicles/grand-theft-auto-v/veleno-gt" title="Veleno GT"><img src="/igallery/gta5-database/resized/veleno-gt-360_320x180.jpg" alt="Veleno GT" title="Veleno GT" width="320" height="180" itemprop="thumbnailUrl" loading="lazy"></a>
</div></div>
<div class="item-info">
<h3 class="contentheading noindex"><a href="/vehicles/grand-theft-auto-v/veleno-gt" title="Veleno GT">Veleno GT</a></h3>
</div>
</li>
<li class="gta-bonuses item-scale">
<div class="item-type"><span class="luxury-autos">Luxury Autos</span></div><div class="pull-left item-image"><div class="img-fit">
<a href="/grand-theft-auto-v/vehicles/vorschlaghammer" title="Vorschlaghammer"><img src="https://www.gtabase.com/images/jch-optimize/ng/igallery_gta5-database_resized_vorschlaghammer-360__320x180.avif" alt="Vorschlaghammer" title="Vorschlaghammer" width="320" height="180" itemprop="thumbnailUrl" loading="lazy"></a>
</div></div>
<div class="item-info">
<h3 class="contentheading noindex"><a href="/grand-theft-auto-v/vehicles/vorschlaghammer" title="Vorschlaghammer">Vorschlaghammer</a></h3>
</div>
</li>
<li class="gta-bonuses item-scale">
<div class="item-type"><span class="luxury-autos">Luxury Autos</span></div><div class="pull-left item-image"><div class="img-fit">
<a href="/grand-theft-auto-v/vehicles/tulip-m-100" title="Tulip M-100"><img src="https://www.gtabase.com/images/jch-optimize/ng/images_gta-5_vehicles_muscle_main_resized_tulip-m-100__320x180.webp" alt="Tulip M-100" title="Tulip M-100" width="320" height="180" itemprop="thumbnailUrl" loading="lazy"></a>
</div></div>
<div class="item-info">
<h3 class="contentheading noindex"><a href="/grand-theft-auto-v/vehicles/tulip-m-100" title="Tulip M-100">Tulip M-100</a></h3>
</div>
</li>
<li class="gta-bonuses item-scale">
<div class="item-type"><span class="luxury-autos">Luxury Autos</span></div><div class="pull-left item-image"><div class="img-fit">
<a href="/grand-theft-auto-v/vehicles/pfister-811" title="811"><img src="/images/gta-5/vehicles/super/main/resized/811_320x180.jpg" alt="811" title="811" width="320" height="180" itemprop="thumbnailUrl" loading="lazy"></a>
</div></div>
<div class="item-info">
<h3 class="contentheading noindex"><a href="/grand-theft-auto-v/vehicles/pfister-811" title="811">811</a></h3>
</div>
</li>
<li class="gta-bonuses item-scale">
<div class="item-type"><span class="luxury-autos">Luxury Autos</span></div><div class="pull-left item-image"><div class="img-fit">
<a href="/grand-theft-auto-v/vehicles/retinue-mk-ii" title="Retinue Mk II"><img src="/images/gta-5/vehicles/sports-classic/main/resized/retinue-mk-ii_320x180.jpg" alt="Retinue Mk II" title="Retinue Mk II" width="320" height="180" itemprop="thumbnailUrl" loading="lazy"></a>
</div></div>
<div class="item-info">
<h3 class="contentheading noindex"><a href="/grand-theft-auto-v/vehicles/retinue-mk-ii" title="Retinue Mk II">Retinue Mk II</a></h3>
</div>
</li>
<li class="gta-bonuses item-scale">
<div class="item-type"><span class="test-ride">Test Ride</span></div><div class="pull-left item-image"><div class="img-fit">
<a href="/grand-theft-auto-v/vehicles/jb-700w" title="JB 700W"><img src="/images/gta-5/vehicles/sports-classic/main/resized/jb-700w_320x180.jpg" alt="JB 700W" title="JB 700W" width="320" height="180" itemprop="thumbnailUrl" loading="lazy"></a>
</div></div>
<div class="item-info">
<h3 class="contentheading noindex"><a href="/grand-theft-auto-v/vehicles/jb-700w" title="JB 700W">JB 700W</a></h3>
</div>
</li>
<li class="gta-bonuses item-scale">
<div class="item-type"><span class="test-ride">Test Ride</span></div><div class="pull-left item-image"><div class="img-fit">
<a href="/grand-theft-auto-v/vehicles/pegassi-tempesta" title="Tempesta"><img src="/images/gta-5/vehicles/super/main/resized/tempesta_320x180.jpg" alt="Tempesta" title="Tempesta" width="320" height="180" itemprop="thumbnailUrl" loading="lazy"></a>
</div></div>
<div class="item-info">
<h3 class="contentheading noindex"><a href="/grand-theft-auto-v/vehicles/pegassi-tempesta" title="Tempesta">Tempesta</a></h3>
</div>
</li>
<li class="gta-bonuses item-scale">
<div class="item-type"><span class="test-ride">Test Ride</span></div><div class="pull-left item-image"><div class="img-fit">
<a href="/grand-theft-auto-v/vehicles/pegassi-torero" title="Torero"><img src="/images/gta-5/vehicles/sports-classic/main/resized/torero_320x180.jpg" alt="Torero" title="Torero" width="320" height="180" itemprop="thumbnailUrl" loading="lazy"></a>
</div></div>
<div class="item-info">
<h3 class="contentheading noindex"><a href="/grand-theft-auto-v/vehicles/pegassi-torero" title="Torero">Torero</a></h3>
</div>
</li>
<li class="gta-bonuses item-scale">
<div class="item-type"><span class="premium-test-ride">Premium Test Ride</span></div><div class="pull-left item-image"><div class="img-fit">
<a href="/grand-theft-auto-v/vehicles/grotti-brioso-r-a" title="Brioso R/A"><img src="/images/gta-5/vehicles/compacts/main/resized/brioso_320x180.jpg" alt="Brioso R/A" title="Brioso R/A" width="320" height="180" itemprop="thumbnailUrl" loading="lazy"></a>
</div></div>
<div class="item-info">
<h3 class="contentheading noindex"><a href="/grand-theft-auto-v/vehicles/grotti-brioso-r-a" title="Brioso R/A"><span class="badge">HSW</span> Brioso R/A</a></h3>
</div>
</li>
</ul>
</div></span>
`;

function scrapeShowrooms() {
  console.log('Parsing Showrooms & Test Rides...');

  try {
    const $ = cheerio.load(htmlContent);

    // Strict JSON structure
    const showroomsData = {
      podiumVehicle: null,
      prizeRide: null,
      premiumDeluxeMotorsport: [],
      luxuryAutos: [],
      testRides: [],
      premiumTestRide: null
    };

    $('li.gta-bonuses').each((_, itemEl) => {
      const $item = $(itemEl);
      const typeText = $item.find('.item-type').text().trim().toLowerCase();
      const $titleLink = $item.find('h3.contentheading a');

      // Remove badge text (e.g., HSW) from the title
      const $titleClone = $titleLink.clone();
      $titleClone.find('.badge').remove();
      let name = $titleClone.text().trim();

      // Fallback manual cleanup for HSW prefixes
      if (name.toUpperCase().startsWith('HSW ')) {
        name = name.substring(4).trim();
      }

      const vehicleObj = {
        name,
        url: resolveUrl($titleLink.attr('href')),
        image: resolveUrl($item.find('.item-image img').attr('src'))
      };

      // Map to correct arrays/objects
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

    // --- FIX FOR BACKWARDS TAGGING ---
    // If GTABase tagged them backwards, Luxury Autos will end up with more vehicles than PDM.
    // PDM should have 5, Luxury should have 2. If Luxury has more, swap them.
    if (showroomsData.luxuryAutos.length > showroomsData.premiumDeluxeMotorsport.length) {
        console.log('⚠️ Detected backwards tags from GTABase. Swapping PDM and Luxury Autos arrays...');
        const temp = showroomsData.premiumDeluxeMotorsport;
        showroomsData.premiumDeluxeMotorsport = showroomsData.luxuryAutos;
        showroomsData.luxuryAutos = temp;
    }

    fs.writeFileSync('showrooms.json', JSON.stringify(showroomsData, null, 2), 'utf-8');
    console.log('✅ Successfully extracted showroom vehicles to showrooms.json');

  } catch (error) {
    console.error(`❌ Scraping failed: ${error.message}`);
  }
}

scrapeShowrooms();
