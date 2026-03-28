import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const pagePath = `file://${path.join(root, 'docs', 'index.html')}`;
const outputPath = path.join(root, 'artifacts', 'docs-home.png');

await fsMkdir(path.dirname(outputPath));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 2200 } });
await page.goto(pagePath);
await page.waitForTimeout(400);
await page.screenshot({ path: outputPath, fullPage: true });
await browser.close();

console.log(`screenshot saved to ${outputPath}`);

async function fsMkdir(dir) {
  const fs = await import('node:fs/promises');
  await fs.mkdir(dir, { recursive: true });
}
