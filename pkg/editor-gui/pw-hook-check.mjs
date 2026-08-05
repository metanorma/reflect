import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage();

// With ?e2e=1 → hook present
await page.goto('http://localhost:3333/?e2e=1');
await page.locator('.appwrapper .ProseMirror').waitFor({ state: 'visible' });
const doc = await page.evaluate(() => {
  const w = window;
  return typeof w.__mnGetDoc === 'function' ? w.__mnGetDoc() : null;
});
console.log('WITH ?e2e=1 → typeof doc:', typeof doc, '| has type field:', !!(doc && typeof doc === 'object' && 'type' in doc));

// Without ?e2e=1 → hook absent
await page.goto('http://localhost:3333/');
await page.locator('.appwrapper .ProseMirror').waitFor({ state: 'visible' });
const absent = await page.evaluate(() => typeof window.__mnGetDoc);
console.log('WITHOUT ?e2e=1 → typeof __mnGetDoc:', absent);

await browser.close();
