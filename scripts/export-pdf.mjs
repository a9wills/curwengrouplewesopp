import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const rootDir = process.cwd();
const [inputArg, outputArg] = process.argv.slice(2);

if (!inputArg) {
  console.error('Usage: npm run pdf -- properties/broadwaterRoad.html [dist/pdf/broadwaterRoad.pdf]');
  process.exit(1);
}

const inputPath = path.resolve(rootDir, inputArg);
const inputName = path.basename(inputPath, path.extname(inputPath));
const isPoster = path.relative(rootDir, inputPath).split(path.sep).includes('posters');
const outputPath = outputArg
  ? path.resolve(rootDir, outputArg)
  : path.resolve(rootDir, 'dist/pdf', `${inputName}.pdf`);

await mkdir(path.dirname(outputPath), { recursive: true });

const browser = await chromium.launch();

try {
  const page = await browser.newPage({
    viewport: isPoster
      ? { width: 1600, height: 1131 }
      : { width: 1440, height: 1800 },
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
    const authScreen = document.getElementById('auth-screen');
    const mainContent = document.getElementById('main-content');
    const mobileMenu = document.getElementById('mobile-menu');

    authScreen?.classList.add('hidden');
    mobileMenu?.classList.add('hidden');
    mainContent?.classList.remove('hidden');

    document.querySelectorAll('.reveal').forEach((element) => {
      element.classList.add('active');
    });

    document.querySelectorAll('details').forEach((element) => {
      element.setAttribute('open', '');
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

  if (!isPoster) {
    await page.addStyleTag({
      content: `
      @media print {
        html,
        body {
          background: #FAF9F6 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        #auth-screen,
        nav,
        #mobile-menu,
        #main-content > button[aria-label="Back to top"] {
          display: none !important;
        }

        #main-content,
        main {
          display: block !important;
          min-height: 0 !important;
        }

        main {
          padding-top: 0 !important;
        }

        .reveal {
          opacity: 1 !important;
          transform: none !important;
          transition: none !important;
        }

        section {
          height: auto !important;
          min-height: 0 !important;
          overflow: visible !important;
        }

        main > section:not(#hero) {
          padding-top: 12mm !important;
          padding-bottom: 12mm !important;
        }

        #hero {
          min-height: 260mm !important;
          break-after: page;
          page-break-after: always;
        }

        h1,
        h2,
        h3,
        h4,
        summary {
          break-after: avoid;
          page-break-after: avoid;
        }

        figure,
        table,
        thead,
        tr,
        img {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        section:not(#hero) img {
          max-width: 100% !important;
          height: auto !important;
          object-fit: contain !important;
        }

        .overflow-x-auto {
          overflow: visible !important;
        }
      }
    `,
    });
  }

  await page.pdf({
    path: outputPath,
    ...(isPoster ? {} : { format: 'A4' }),
    printBackground: true,
    preferCSSPageSize: isPoster,
    margin: isPoster
      ? { top: '0', right: '0', bottom: '0', left: '0' }
      : {
          top: '12mm',
          right: '10mm',
          bottom: '12mm',
          left: '10mm',
        },
    timeout: 120_000,
  });

  console.log(`PDF written to ${path.relative(rootDir, outputPath)}`);
} finally {
  await browser.close();
}
