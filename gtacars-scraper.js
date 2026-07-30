const { chromium } = require('playwright');
const fs = require('fs');

async function interceptAPI() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Listen for any network requests made by the page
    page.on('response', async (response) => {
        const url = response.url();
        // Look for API calls or JSON data files loaded by the site
        if (url.includes('.json') || url.includes('/api/')) {
            try {
                const json = await response.json();
                console.log('Intercepted API endpoint:', url);
                // Save captured JSON to disk to inspect its contents
                fs.writeFileSync('intercepted_data.json', JSON.stringify(json, null, 2));
            } catch (e) {
                // Not all responses are JSON, ignore errors
            }
        }
    });

    await page.goto('https://gtacars.net/gta5', { waitUntil: 'networkidle' });
    await browser.close();
}

interceptAPI();
