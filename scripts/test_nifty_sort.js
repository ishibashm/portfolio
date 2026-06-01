const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://myhome.nifty.com/rent/aichi/nagoyashinaka_ct/', { waitUntil: 'domcontentloaded' });
  
  // Wait a bit
  await new Promise(r => setTimeout(r, 2000));
  
  const html = await page.content();
  const fs = require('fs');
  fs.writeFileSync('page.html', html);
  
  await browser.close();
})();
