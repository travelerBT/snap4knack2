/**
 * Snap4Knack Product Screenshot Capture
 *
 * Usage:
 *   1. Make sure the dev server is running:  npm run dev
 *   2. Set credentials:
 *        export SCREENSHOT_EMAIL=you@example.com
 *        export SCREENSHOT_PASSWORD=yourpassword
 *   3. Run:  node scripts/take-screenshots.js
 *
 * Screenshots are saved to public/screenshots/
 */

import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'public', 'screenshots');

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const BASE = process.env.SCREENSHOT_BASE_URL || 'https://snap4knack2.web.app';
const EMAIL = process.env.SCREENSHOT_EMAIL;
const PASSWORD = process.env.SCREENSHOT_PASSWORD;
const VIEWPORT = { width: 1440, height: 900 };

if (!EMAIL || !PASSWORD) {
  console.error('\n❌  Missing credentials. Please set:\n');
  console.error('   export SCREENSHOT_EMAIL=you@example.com');
  console.error('   export SCREENSHOT_PASSWORD=yourpassword\n');
  process.exit(1);
}

const SHOTS = [
  { route: '/dashboard',    filename: 'dashboard.png',    label: 'Dashboard' },
  { route: '/snap-feed',    filename: 'snap-feed.png',    label: 'Snap Feed (Kanban)', kanban: true },
  { route: '/connections',  filename: 'connections.png',  label: 'Connections' },
  { route: '/snap-plugins', filename: 'snap-plugins.png', label: 'Snap Plugins' },
  { route: '/account',      filename: 'account.png',      label: 'Account Settings' },
];

async function capture(page, filename) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join(OUT_DIR, filename),
    clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height },
  });
}

async function main() {
  console.log('\n🎬  Snap4Knack Screenshot Capture\n');

  // Check dev server is up
  try {
    const res = await fetch(BASE);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.log(`✅  Dev server reachable at ${BASE}\n`);
  } catch (err) {
    console.error(`❌  Dev server not reachable at ${BASE}`);
    console.error('   Run "npm run dev" in another terminal first.\n');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  const page = await context.newPage();

  // ── Log in ──────────────────────────────────────────────────────────────
  console.log(`🔐  Logging in as ${EMAIL}…`);
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });

  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');

  try {
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
    console.log('✅  Logged in!\n');
  } catch {
    const errPath = path.join(OUT_DIR, '_login-error.png');
    await page.screenshot({ path: errPath, fullPage: true });
    console.error('❌  Login failed. Check SCREENSHOT_EMAIL / SCREENSHOT_PASSWORD.');
    console.error(`   Screenshot: public/screenshots/_login-error.png\n`);
    await browser.close();
    process.exit(1);
  }

  await page.waitForTimeout(1000);

  // ── Capture each page ───────────────────────────────────────────────────
  for (const shot of SHOTS) {
    console.log(`📸  ${shot.label}`);
    try {
      await page.goto(`${BASE}${shot.route}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('h1', { timeout: 8000 });
      await page.waitForTimeout(1200);

      if (shot.kanban) {
        const btn = await page.$('button[title="Kanban view"]');
        if (btn) { await btn.click(); await page.waitForTimeout(800); }
      }

      await capture(page, shot.filename);
      console.log(`   ✓  public/screenshots/${shot.filename}`);
    } catch (err) {
      console.error(`   ✗  Failed: ${err.message}`);
    }
  }

  // ── Snap Detail ─────────────────────────────────────────────────────────
  console.log('📸  Snap Detail');
  try {
    await page.goto(`${BASE}/snap-feed`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const listBtn = await page.$('button[title="List view"]');
    if (listBtn) { await listBtn.click(); await page.waitForTimeout(500); }

    const firstRow = await page.$('a[href^="/snap-feed/"]');
    if (firstRow) {
      await firstRow.click();
      await page.waitForSelector('h1', { timeout: 8000 });
      await page.waitForTimeout(1500);
      await capture(page, 'snap-detail.png');
      console.log('   ✓  public/screenshots/snap-detail.png');
    } else {
      console.log('   ℹ  No snaps found — skipping detail screenshot.');
    }
  } catch (err) {
    console.error(`   ✗  Failed: ${err.message}`);
  }

  await browser.close();
  console.log('\n✨  Done! Screenshots saved to public/screenshots/\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
