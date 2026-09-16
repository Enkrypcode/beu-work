import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const sourceDirectory = process.env.BEU_AVATAR_SOURCE || 'C:/Users/ASUS/Downloads';
const outputDirectory = new URL('../supabase/avatar-uploads/', import.meta.url);
const photos = [
  ['Kamal Fikri Nabawi.png', 'kamal-fikri-nabawi.webp'],
  ['Gisela Luigi Septiana.png', 'gisela-luigi-septiana.webp'],
  ['Riski Nova Sari.png', 'riski-nova-sari.webp'],
  ['Advira Yunita S Yunan.png', 'advira-yunita-s-yunan.webp'],
];

await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({ channel: process.env.BEU_TEST_BROWSER || 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
  for (const [source, target] of photos) {
    const bytes = await readFile(`${sourceDirectory}/${source}`);
    const dataUrl = `data:image/png;base64,${bytes.toString('base64')}`;
    const webp = await page.evaluate(async ({ dataUrl }) => {
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      const side = Math.min(image.naturalWidth, image.naturalHeight);
      const x = Math.round((image.naturalWidth - side) / 2);
      const y = 0;
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      canvas.getContext('2d').drawImage(image, x, y, side, side, 0, 0, 512, 512);
      return canvas.toDataURL('image/webp', 0.86);
    }, { dataUrl });
    await writeFile(new URL(target, outputDirectory), Buffer.from(webp.split(',')[1], 'base64'));
  }
} finally {
  await browser.close();
}
