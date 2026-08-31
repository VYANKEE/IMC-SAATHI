/**
 * ingestion/index.js
 *
 * Orchestrates the whole ingestion pipeline described in docs/03-rag.md:
 *   raw files -> classify (dedup/format-preference) -> load -> chunk ->
 *   validate -> dedupe -> report.
 *
 * Pure-ish: reads from server/data/raw and server/data/seeds, but never
 * touches MongoDB and never calls an embedding API — this is Phase 3 only.
 * Embedding + writing to the knowledgeChunks collection is Phase 4.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { classifyFiles } from './classifier.js';
import { contentHash } from './contentHash.js';
import { loadCsv } from './loaders/csv.loader.js';
import { loadDocx } from './loaders/docx.loader.js';
import { loadPdf } from './loaders/pdf.loader.js';
import { chunkSimpleQaRow, chunkWideDatasetRow } from './chunkers/qaPair.chunker.js';
import { chunkNarrativeBlocks } from './chunkers/section.chunker.js';
import { extractNumberedFaqs, chunkNumberedFaqs } from './chunkers/numberedFaq.chunker.js';
import { redactContacts, looksLikeContactCard } from './redact.js';
import { validateChunk, dedupeChunks } from './validate.js';
import { buildReport } from './report.js';

const IGNORED_FILES = new Set(['desktop.ini', '.gitkeep']);

async function loadDepartmentLabelFor(seedsDir) {
  const raw = await readFile(path.join(seedsDir, 'departments.json'), 'utf8');
  const departments = JSON.parse(raw);
  const map = new Map(departments.map((d) => [d.code, d.name?.en ?? d.code]));
  return (code) => map.get(code) ?? code ?? 'Unknown Department';
}

export async function runIngestion({ rawDir, seedsDir }) {
  const allFiles = (await readdir(rawDir)).filter(
    (f) => !IGNORED_FILES.has(f) && !f.startsWith('.')
  );

  const hashes = new Map();
  for (const filename of allFiles) {
    const buffer = await readFile(path.join(rawDir, filename));
    hashes.set(filename, contentHash(buffer));
  }

  const decisions = classifyFiles(allFiles, hashes);
  const departmentLabelFor = await loadDepartmentLabelFor(seedsDir);
  const notChunked = [];
  const rawChunks = [];

  for (const decision of decisions) {
    if (decision.action !== 'process') continue;
    const { filename, topic } = decision;
    const filePath = path.join(rawDir, filename);
    const ext = path.extname(filename).slice(1).toLowerCase();

    if (topic.kind === 'facts') {
      notChunked.push({
        filename,
        reason:
          'Structured facts — already served via the Phase 2 database layer, never chunked/embedded.',
      });
      continue;
    }

    if (topic.kind === 'structured_qa') {
      const rows = await loadCsv(filePath);
      const departmentLabel = departmentLabelFor(topic.department);
      rows.forEach((row, i) => {
        rawChunks.push(
          chunkSimpleQaRow(row, { topic, sourceFile: filename, rowIndex: i, departmentLabel })
        );
      });
      continue;
    }

    if (topic.kind === 'wide_dataset') {
      const rows = await loadCsv(filePath);
      rows.forEach((row, i) => {
        rawChunks.push(
          chunkWideDatasetRow(row, { sourceFile: filename, rowIndex: i, departmentLabelFor })
        );
      });
      continue;
    }

    if (topic.kind === 'narrative') {
      if (ext === 'docx') {
        const blocks = await loadDocx(filePath);
        const departmentLabel = departmentLabelFor(topic.department);
        const chunks = await chunkNarrativeBlocks(blocks, {
          department: topic.department,
          category: topic.category,
          sourceFile: filename,
          departmentLabel,
        });
        rawChunks.push(...chunks);
      } else if (ext === 'pdf') {
        const { pages } = await loadPdf(filePath);
        const faqs = extractNumberedFaqs(pages.join(' '));
        rawChunks.push(...chunkNumberedFaqs(faqs, { sourceFile: filename, departmentLabelFor }));
        notChunked.push({
          filename,
          reason:
            'Only the numbered PWD-xxx/REV-xxx FAQ blocks were chunked. The routing table, the "Current Official Data" facts table, and the chatbot-guidance bullets were intentionally skipped — see numberedFaq.chunker.js header comment.',
        });
      } else {
        notChunked.push({ filename, reason: `No narrative loader for .${ext} yet.` });
      }
      continue;
    }
  }

  const redactedChunks = rawChunks.map((chunk) => {
    const { text, redactionCount } = redactContacts(chunk.text);
    return {
      ...chunk,
      text,
      redactionCount,
      looksLikeContactCard: looksLikeContactCard(chunk.text),
    };
  });

  const validated = redactedChunks.map(validateChunk);
  const deduped = dedupeChunks(validated, contentHash);
  const withIds = deduped.map((chunk) => ({
    ...chunk,
    chunkId: contentHash(`${chunk.sourceFile}#${chunk.sourceRowRef}`).slice(0, 16),
  }));

  const report = buildReport({ decisions, chunks: withIds });
  report.notChunked = notChunked;
  return { chunks: withIds, report };
}
