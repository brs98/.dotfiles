// Optional: render a built page in headless Chromium at laptop (light) and phone (dark) widths,
// report script errors and sideways page overflow, and save screenshots next to OUT_PREFIX.
// Usage: PLAYWRIGHT=/path/to/node_modules/playwright node render-check.cjs PAGE.html OUT_PREFIX
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
(async () => {
  const [page, prefix] = process.argv.slice(2);
  if (!page || !prefix) { console.error('usage: render-check.cjs PAGE.html OUT_PREFIX'); process.exit(2); }
  const browser = await chromium.launch();
  let failed = false;
  for (const [name, width, height, scheme] of [['laptop', 1440, 1000, 'light'], ['phone', 400, 900, 'dark']]) {
    const p = await browser.newPage({ viewport: { width, height }, colorScheme: scheme });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await p.goto('file://' + require('path').resolve(page));
    await p.waitForTimeout(600);
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    await p.screenshot({ path: `${prefix}-${name}.png`, fullPage: true });
    console.log(`${name}: overflow ${overflow}px, ${errors.length} errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
    if (errors.length || overflow > 0) failed = true;
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
