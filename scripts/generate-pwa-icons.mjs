import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const svg = await readFile(new URL('../public/assets/logo-mark.svg', import.meta.url), 'utf8');
const dataUrl = `data:image/svg+xml,${encodeURIComponent(svg)}`;
const icons = [
  ['favicon-16x16.png', 16], ['favicon-32x32.png', 32], ['icon-64.png', 64],
  ['icon-128.png', 128], ['apple-touch-icon.png', 180], ['icon-192.png', 192],
  ['icon-256.png', 256], ['icon-512.png', 512], ['maskable-icon-512.png', 512],
];
const browser = await chromium.launch({ channel: process.env.BEU_TEST_BROWSER || 'chrome', headless: true });
try {
  const page = await browser.newPage();
  for (const [file, size] of icons) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;overflow:hidden}img{display:block;width:100%;height:100%}</style><img id="mark" src="${dataUrl}">`);
    await page.locator('#mark').screenshot({ path: fileURLToPath(new URL(`../public/${file}`, import.meta.url)) });
  }
} finally {
  await browser.close();
}
