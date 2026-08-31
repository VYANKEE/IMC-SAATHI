#!/usr/bin/env node
/**
 * scripts/ingest.js
 *
 * CLI entry point for the Phase 3 ingestion pipeline. Mirrors scripts/seed.js's
 * shape: no DB connection required (nothing here touches Mongo — that's
 * Phase 4, once embeddings exist), just local file processing.
 *
 *   npm run ingest:check   -> process + print report, write nothing
 *   npm run ingest         -> process + print report + write
 *                             server/data/processed/knowledgeChunks.json
 *                             server/data/processed/ingestion-report.json
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { runIngestion } from '../src/ingestion/index.js';
import { formatSummary } from '../src/ingestion/report.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDryRun = process.argv.includes('--dry-run');

async function main() {
  const rawDir = path.join(__dirname, '..', 'data', 'raw');
  const seedsDir = path.join(__dirname, '..', 'data', 'seeds');
  const processedDir = path.join(__dirname, '..', 'data', 'processed');

  console.log(
    `\n  ingesting from ${path.relative(process.cwd(), rawDir)}${isDryRun ? '  (dry run — nothing will be written)' : ''}`
  );

  const { chunks, report } = await runIngestion({ rawDir, seedsDir });
  console.log(formatSummary(report));

  if (isDryRun) {
    console.log('  dry run complete — nothing written.\n');
    return;
  }

  await mkdir(processedDir, { recursive: true });
  await writeFile(path.join(processedDir, 'knowledgeChunks.json'), JSON.stringify(chunks, null, 2));
  await writeFile(
    path.join(processedDir, 'ingestion-report.json'),
    JSON.stringify(report, null, 2)
  );
  console.log(
    `  wrote ${chunks.length} chunks to data/processed/knowledgeChunks.json\n  wrote ingestion report to data/processed/ingestion-report.json\n`
  );
}

main().catch((err) => {
  console.error('ingestion failed:', err);
  process.exitCode = 1;
});
