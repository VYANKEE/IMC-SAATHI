/**
 * pdf.loader.js
 *
 * Extracts plain text from a PDF, page by page (so a chunk can eventually
 * cite "KB.pdf, page 3"). pdf-parse@1.1.1 is CommonJS and has a known quirk:
 * imported with a plain ESM `import`, its debug-mode detection misfires and
 * it tries to read its own test fixture file. `createRequire` sidesteps
 * that by loading it the way Node's own `require()` would.
 */
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

export async function loadPdf(filePath) {
  const buffer = await readFile(filePath);
  const pages = [];
  await pdfParse(buffer, {
    pagerender: (pageData) =>
      pageData.getTextContent().then((textContent) => {
        const text = textContent.items.map((item) => item.str).join(' ');
        pages.push(text);
        return text;
      }),
  });
  return { pageCount: pages.length, pages };
}
