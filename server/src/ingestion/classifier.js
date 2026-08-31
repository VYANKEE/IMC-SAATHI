/**
 * classifier.js
 *
 * Decides, for a directory of raw source files, which ones actually get
 * processed. Two distinct duplicate problems live in this corpus and this
 * module resolves both, deterministically:
 *
 *  1. Byte-identical duplicate exports of the same file — data quality
 *     register #2 (…Dataset_Updated (1).numbers vs …Dataset_Updated.numbers,
 *     converted to CSV — see docs/11-decisions.md D14). Same topic, same
 *     extension, same hash -> keep one, log the rest as `superseded`.
 *  2. The *same content re-typed in a different format* — e.g. Fire_NOC.csv
 *     and Fire_NOC.docx are the same FAQ set, one as a structured table,
 *     one as narrative Q:/A: prose. Same topic, different extension ->
 *     keep the more structured one (FORMAT_PRIORITY), the narrative
 *     duplicate would only add embedding cost and a second, differently-
 *     chunked copy of the same answer to the vector index.
 *
 * A same-topic, same-extension pair whose hashes DON'T match is a real
 * conflict — the pipeline refuses to guess which one is authoritative and
 * reports it for a human to resolve instead.
 */
import { extname } from 'node:path';
import { topicFor, topicKeyFor, FORMAT_PRIORITY } from './topicMap.js';

function extOf(filename) {
  return extname(filename).slice(1).toLowerCase();
}

/**
 * @param {string[]} filenames
 * @param {Map<string,string>} fileHashes filename -> content hash
 * @returns {{filename, topic, action: 'process'|'superseded'|'skip_unknown'|'conflict', reason: string|null}[]}
 */
export function classifyFiles(filenames, fileHashes = new Map()) {
  const groups = new Map();
  for (const filename of filenames) {
    const key = topicKeyFor(filename);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(filename);
  }

  const decisions = [];

  for (const [topicKey, files] of groups) {
    const topic = topicFor(files[0]);

    if (topic.kind === 'unknown') {
      for (const filename of files) {
        decisions.push({
          filename,
          topic,
          action: 'skip_unknown',
          reason: `No topicMap entry for "${topicKey}" — add one in src/ingestion/topicMap.js before this file can be ingested.`,
        });
      }
      continue;
    }

    // Resolve same-extension, same-topic groups first (byte-duplicate check).
    const byExt = new Map();
    for (const filename of files) {
      const ext = extOf(filename);
      if (!byExt.has(ext)) byExt.set(ext, []);
      byExt.get(ext).push(filename);
    }

    const survivorsByExt = [];
    for (const [ext, extFiles] of byExt) {
      if (extFiles.length === 1) {
        survivorsByExt.push(extFiles[0]);
        continue;
      }
      const hashes = extFiles.map((f) => fileHashes.get(f));
      const allMatch = hashes.every((h) => h && h === hashes[0]);
      if (allMatch) {
        const [winner, ...rest] = extFiles;
        survivorsByExt.push(winner);
        for (const loser of rest) {
          decisions.push({
            filename: loser,
            topic,
            action: 'superseded',
            reason: `Byte-identical duplicate of ${winner} (data-quality-register.md #2) — same content, skipped.`,
          });
        }
      } else {
        // Can't tell which is right — surface it, don't guess.
        for (const filename of extFiles) {
          decisions.push({
            filename,
            topic,
            action: 'conflict',
            reason: `Same topic ("${topicKey}") and format (.${ext}) as ${extFiles.filter((f) => f !== filename).join(', ')}, but content differs — needs manual review, not auto-resolved.`,
          });
        }
      }
    }

    if (survivorsByExt.length === 1) {
      decisions.push({ filename: survivorsByExt[0], topic, action: 'process', reason: null });
      continue;
    }
    if (survivorsByExt.length === 0) continue; // every extension group was a conflict, already reported

    // Cross-format duplicates: prefer the most structured surviving format.
    const sorted = [...survivorsByExt].sort(
      (a, b) => FORMAT_PRIORITY.indexOf(extOf(a)) - FORMAT_PRIORITY.indexOf(extOf(b))
    );
    const [winner, ...rest] = sorted;
    decisions.push({ filename: winner, topic, action: 'process', reason: null });
    for (const loser of rest) {
      decisions.push({
        filename: loser,
        topic,
        action: 'superseded',
        reason: `Same topic as ${winner} in a less-structured format (.${extOf(loser)} vs .${extOf(winner)}) — kept the structured version to avoid embedding the same FAQ twice under two different chunkings.`,
      });
    }
  }

  return decisions;
}
