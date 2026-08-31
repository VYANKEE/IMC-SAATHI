#!/usr/bin/env node
/**
 * scripts/eval.js
 *
 * `npm run eval` — docs/03-rag.md's Evaluation framework, retrieval half
 * (Phase 5; the generation-quality metrics in that same doc section are
 * Phase 6's, once answer.grounded.md exists). Runs every question in
 * data/eval/golden-set.json through the real retrieve.js module against
 * the live NVIDIA embedder + Atlas vector_index, scores Recall@5,
 * Recall@8, Precision@3 and MRR per slice and per language, and — because
 * three of the eight slices (missing_information / out_of_scope /
 * non_imc_routing) exist specifically to calibrate the confidence gate —
 * prints the MIN_SCORE boundary docs/03-rag.md asks for: the gap between
 * the lowest top-score among questions that SHOULD retrieve something and
 * the highest top-score among questions that should not.
 *
 * Writes data/eval/eval-report.json (commit it — regressions should show
 * up in the diff, per docs/03-rag.md) and prints a summary table.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { createRetriever } from '../src/ai/retrieval/retrieve.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN_SET_PATH = path.join(__dirname, '..', 'data', 'eval', 'golden-set.json');
const REPORT_PATH = path.join(__dirname, '..', 'data', 'eval', 'eval-report.json');

// These three slices have expectedChunkIds: [] by design -- the correct
// retrieval behaviour is "nothing confident enough", not a Recall@k miss.
// They get their own reporting bucket (see buildConfidenceGateSuggestion).
const REFUSAL_SLICES = new Set(['missing_information', 'out_of_scope', 'non_imc_routing']);

function scoreOne(expectedChunkIds, results) {
  const parentIds = results.map((r) => r.parentChunkId ?? r.chunkId);
  const top5 = parentIds.slice(0, 5);
  const top3 = parentIds.slice(0, 3);
  const top8 = parentIds.slice(0, 8);

  const recall5 = expectedChunkIds.some((id) => top5.includes(id)) ? 1 : 0;
  const recall8 = expectedChunkIds.some((id) => top8.includes(id)) ? 1 : 0;
  const precision3 =
    top3.length === 0 ? 0 : top3.filter((id) => expectedChunkIds.includes(id)).length / top3.length;

  let mrr = 0;
  for (let i = 0; i < parentIds.length; i += 1) {
    if (expectedChunkIds.includes(parentIds[i])) {
      mrr = 1 / (i + 1);
      break;
    }
  }

  return {
    recall5,
    recall8,
    precision3,
    mrr,
    topScore: results[0]?.score ?? 0,
    retrievedTop5: results
      .slice(0, 5)
      .map((r) => ({
        chunkId: r.parentChunkId ?? r.chunkId,
        department: r.department,
        score: Number(r.score.toFixed(4)),
      })),
  };
}

function aggregate(rows) {
  if (rows.length === 0) return null;
  const sum = (key) => rows.reduce((s, r) => s + r[key], 0);
  return {
    n: rows.length,
    recall5: sum('recall5') / rows.length,
    recall8: sum('recall8') / rows.length,
    precision3: sum('precision3') / rows.length,
    mrr: sum('mrr') / rows.length,
  };
}

function suggestMinScore(refusalRows, answerableRows) {
  if (refusalRows.length === 0 || answerableRows.length === 0) return null;
  const highestRefusalScore = Math.max(...refusalRows.map((r) => r.topScore));
  const lowestAnswerableHitScore = Math.min(
    ...answerableRows.filter((r) => r.recall5 === 1).map((r) => r.topScore)
  );
  return {
    highestRefusalScore,
    lowestAnswerableHitScore,
    separates: lowestAnswerableHitScore > highestRefusalScore,
    suggestedMinScore:
      lowestAnswerableHitScore > highestRefusalScore
        ? (highestRefusalScore + lowestAnswerableHitScore) / 2
        : null,
  };
}

async function main() {
  const golden = JSON.parse(fs.readFileSync(GOLDEN_SET_PATH, 'utf8'));

  if (!env.NVIDIA_API_KEY) {
    throw new Error('NVIDIA_API_KEY is not set in server/.env.');
  }
  if (!env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set in server/.env.');
  }

  const retriever = createRetriever({
    apiKey: env.NVIDIA_API_KEY,
    model: env.NVIDIA_EMBEDDING_MODEL,
    dimensions: env.EMBEDDING_DIMENSIONS,
  });

  await connectDatabase();

  const rows = [];
  for (let i = 0; i < golden.length; i += 1) {
    const g = golden[i];
    const { results } = await retriever.retrieve(g.query);
    const scored = scoreOne(g.expectedChunkIds, results);
    rows.push({ ...g, ...scored });
    process.stdout.write(`\r  evaluated ${i + 1}/${golden.length}`);
  }
  console.log('');

  await disconnectDatabase();

  const answerableRows = rows.filter((r) => !REFUSAL_SLICES.has(r.slice));
  const refusalRows = rows.filter((r) => REFUSAL_SLICES.has(r.slice));

  const bySlice = {};
  for (const slice of new Set(rows.map((r) => r.slice))) {
    bySlice[slice] = aggregate(rows.filter((r) => r.slice === slice));
  }
  const byLanguage = {};
  for (const lang of new Set(answerableRows.map((r) => r.language))) {
    byLanguage[lang] = aggregate(answerableRows.filter((r) => r.language === lang));
  }

  const overall = aggregate(answerableRows);
  const confidenceGate = suggestMinScore(refusalRows, answerableRows);

  const report = {
    generatedAt: new Date().toISOString(),
    embeddingModel: env.NVIDIA_EMBEDDING_MODEL,
    totalQuestions: rows.length,
    overallRetrieval: overall,
    byLanguageSlice: byLanguage,
    bySlice,
    confidenceGate,
    perQuestion: rows.map((r) => ({
      id: r.id,
      slice: r.slice,
      language: r.language,
      query: r.query,
      recall5: r.recall5,
      recall8: r.recall8,
      precision3: r.precision3,
      mrr: r.mrr,
      topScore: Number(r.topScore.toFixed(4)),
      retrievedTop5: r.retrievedTop5,
    })),
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');

  console.log(`\nOverall retrieval (answerable slices, n=${overall.n}):`);
  console.log(
    `  Recall@5=${overall.recall5.toFixed(3)}  Recall@8=${overall.recall8.toFixed(3)}  Precision@3=${overall.precision3.toFixed(3)}  MRR=${overall.mrr.toFixed(3)}`
  );

  console.log('\nBy language slice:');
  Object.entries(byLanguage).forEach(([lang, m]) => {
    const flag = m.recall5 < (lang === 'en' ? 0.9 : 0.8) ? '  ⚠ below target' : '';
    console.log(`  ${lang.padEnd(10)} n=${m.n}  Recall@5=${m.recall5.toFixed(3)}${flag}`);
  });

  console.log('\nBy question slice:');
  Object.entries(bySlice).forEach(([slice, m]) => {
    console.log(
      `  ${slice.padEnd(22)} n=${m.n}  Recall@5=${m.recall5.toFixed(3)}  Precision@3=${m.precision3.toFixed(3)}  MRR=${m.mrr.toFixed(3)}`
    );
  });

  if (confidenceGate) {
    console.log('\nConfidence gate calibration (docs/03-rag.md):');
    console.log(
      `  highest top-score among refusal-slice questions:    ${confidenceGate.highestRefusalScore.toFixed(4)}`
    );
    console.log(
      `  lowest top-score among correctly-answered questions: ${confidenceGate.lowestAnswerableHitScore.toFixed(4)}`
    );
    if (confidenceGate.separates) {
      console.log(
        `  -> suggested MIN_SCORE: ${confidenceGate.suggestedMinScore.toFixed(4)} (midpoint — the two ranges do not overlap)`
      );
    } else {
      console.log(
        '  ⚠ these ranges OVERLAP — no single MIN_SCORE cleanly separates answerable from unanswerable yet.'
      );
      console.log(
        "    Inspect data/eval/eval-report.json's perQuestion rows before picking a threshold."
      );
    }
  }

  console.log(`\nFull report written to ${path.relative(process.cwd(), REPORT_PATH)}\n`);
}

main().catch((err) => {
  console.error('\neval failed:', err.message);
  process.exitCode = 1;
});
