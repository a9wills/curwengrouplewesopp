import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const rootDir = process.cwd();
const [inputArg, outputArg] = process.argv.slice(2);

if (!inputArg) {
  console.error('Usage: npm run poster:pdf -- posters/broadwaterRoadSenPoster.html [pdf/broadwaterRoadSenPoster.pdf]');
  process.exit(1);
}

const inputPath = path.resolve(rootDir, inputArg);
const inputName = path.basename(inputPath, path.extname(inputPath));
const outputPath = outputArg
  ? path.resolve(rootDir, outputArg)
  : path.resolve(rootDir, 'pdf', `${inputName}.pdf`);

await mkdir(path.dirname(outputPath), { recursive: true });

const browser = await chromium.launch();

try {
  const page = await browser.newPage({
    viewport: { width: 794, height: 1123 },
    deviceScaleFactor: 1,
  });

  page.on('pageerror', (error) => {
    console.warn(`Page error: ${error.message}`);
  });

  page.on('requestfailed', (request) => {
    console.warn(`Request failed: ${request.url()} (${request.failure()?.errorText ?? 'unknown error'})`);
  });

  await page.goto(pathToFileURL(inputPath).href, {
    waitUntil: 'networkidle',
    timeout: 120_000,
  });

  await page.emulateMedia({ media: 'print' });

  await page.evaluate(async () => {
    document.querySelectorAll('.screen-actions').forEach((element) => {
      element.remove();
    });

    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    await Promise.all(
      Array.from(document.images)
        .filter((image) => !image.complete)
        .map((image) => new Promise((resolve) => {
          image.addEventListener('load', resolve, { once: true });
          image.addEventListener('error', resolve, { once: true });
        })),
    );
  });

  await page.addStyleTag({
    content: `
      @page {
        size: A4 portrait;
        margin: 0;
      }

      html,
      body {
        width: 210mm !important;
        height: 297mm !important;
        min-height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
        background: #fff !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      .poster-page {
        width: 210mm !important;
        height: 297mm !important;
        min-height: 0 !important;
        margin: 0 !important;
        box-shadow: none !important;
        overflow: hidden !important;
      }
    `,
  });

  await page.pdf({
    path: outputPath,
    format: 'A4',
    landscape: false,
    printBackground: true,
    preferCSSPageSize: false,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
    timeout: 120_000,
  });

  console.log(`Poster PDF written to ${path.relative(rootDir, outputPath)}`);
} finally {
  await browser.close();
}
