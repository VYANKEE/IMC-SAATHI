/**
 * csv.loader.js
 *
 * Loads a CSV file into an array of plain row objects keyed by header.
 * Used for both the simple "Section,Question,Answer" topic CSVs and the
 * 24-column wide FAQ dataset (which was itself exported from the original
 * .numbers file — see docs/11-decisions.md D14).
 */
import { readFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';

export async function loadCsv(filePath) {
  const raw = await readFile(filePath, 'utf8');
  // BOM-safe, header-based, tolerant of embedded newlines inside quoted
  // fields (both source CSVs have long multi-sentence answers).
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: true,
  });
  return rows;
}
