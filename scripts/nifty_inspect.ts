import { chromium } from 'playwright';
import * as fs from 'fs';

async function inspect() {
  const browser = await chromium.launch({
    headless: true,
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
  });
  const page = await context.newPage();
  
  // Mask webdriver
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
  });

  await page.goto('https://myhome.nifty.com/rent/tokyo/', { waitUntil: 'domcontentloaded' });
  const html = await page.content();
  fs.writeFileSync('nifty_tokyo.html', html);
  console.log('Saved to nifty_tokyo.html');
  await browser.close();
}

inspect().catch(console.error);
