// Renders the Foxtail app icon from its SVG source (public/icons/foxtail.svg)
// into the PNG sizes the PWA manifest, iOS home screen and browser tab need.
// Uses the Chromium that Playwright already drives, so the PNGs are properly
// anti-aliased and match the SVG exactly. Set CHROMIUM_PATH to use a
// particular Chromium binary instead of Playwright's own.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const OUT = 'public/icons';
const svg = readFileSync(`${OUT}/foxtail.svg`, 'utf8');

// [file, size, scale]: scale < 1 insets the art for the maskable variant, whose
// edges Android may crop to a circle (the safe zone is the central 80%).
const TARGETS = [
  ['foxtail-apple-touch-180.png', 180, 1],
  ['foxtail-192.png', 192, 1],
  ['foxtail-512.png', 512, 1],
  ['foxtail-maskable-512.png', 512, 0.84],
  ['foxtail-favicon-32.png', 32, 1],
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
for (const [file, size, scale] of TARGETS) {
  // The maskable variant shrinks only the foreground (<g id="art">) toward the
  // centre, so the sunny garden background still runs to every edge.
  const off = (512 * (1 - scale)) / 2;
  const art = scale === 1 ? svg : svg.replace('<g id="art">', `<g id="art" transform="translate(${off} ${off}) scale(${scale})">`);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<!doctype html><html><body style="margin:0">
    <img src="data:image/svg+xml;base64,${Buffer.from(art).toString('base64')}" style="display:block;width:${size}px;height:${size}px">
    </body></html>`);
  await page.waitForLoadState('load');
  writeFileSync(`${OUT}/${file}`, await page.screenshot());
}
await browser.close();
console.log('Icons generated.');
