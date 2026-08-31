/**
 * report.js
 *
 * Turns the classifier decisions + validated chunks into one structured
 * report — written to server/data/processed/ingestion-report.json — and a
 * short human-readable console summary, same spirit as scripts/seed.js.
 * The report's whole purpose is data-quality-register.md's own stated
 * goal: decisions about what got excluded and why must stay visible, not
 * silently applied.
 */

export function buildReport({ decisions, chunks }) {
  const filesProcessed = decisions.filter((d) => d.action === 'process').map((d) => d.filename);
  const filesSuperseded = decisions.filter((d) => d.action === 'superseded');
  const filesSkippedUnknown = decisions.filter((d) => d.action === 'skip_unknown');
  const filesConflict = decisions.filter((d) => d.action === 'conflict');

  const byDepartment = {};
  const byLanguage = {};
  const quarantineBreakdown = {};
  const nonBlockingFlagBreakdown = {};
  let active = 0;
  let quarantined = 0;

  for (const chunk of chunks) {
    byDepartment[chunk.department ?? 'UNKNOWN'] =
      (byDepartment[chunk.department ?? 'UNKNOWN'] ?? 0) + 1;
    byLanguage[chunk.language] = (byLanguage[chunk.language] ?? 0) + 1;
    if (chunk.status === 'active') active += 1;
    else quarantined += 1;
    for (const f of chunk.flags) {
      const bucket = f.blocking ? quarantineBreakdown : nonBlockingFlagBreakdown;
      bucket[f.code] = (bucket[f.code] ?? 0) + 1;
    }
  }

  const flaggedChunks = chunks
    .filter((c) => c.flags.length > 0)
    .map((c) => ({
      sourceFile: c.sourceFile,
      sourceRowRef: c.sourceRowRef,
      department: c.department,
      status: c.status,
      flags: c.flags.map((f) => ({ code: f.code, message: f.message, blocking: f.blocking })),
    }));

  return {
    generatedAt: new Date().toISOString(),
    files: {
      processed: filesProcessed,
      superseded: filesSuperseded.map(({ filename, reason }) => ({ filename, reason })),
      skippedUnknown: filesSkippedUnknown.map(({ filename, reason }) => ({ filename, reason })),
      conflict: filesConflict.map(({ filename, reason }) => ({ filename, reason })),
    },
    chunks: {
      total: chunks.length,
      active,
      quarantined,
      byDepartment,
      byLanguage,
    },
    quarantineBreakdown,
    nonBlockingFlagBreakdown,
    flaggedChunks,
  };
}

export function formatSummary(report) {
  const lines = [];
  lines.push('');
  lines.push(
    `  files: ${report.files.processed.length} processed, ${report.files.superseded.length} superseded, ${report.files.skippedUnknown.length} unknown, ${report.files.conflict.length} conflict`
  );
  lines.push(
    `  chunks: ${report.chunks.total} total  →  ${report.chunks.active} active, ${report.chunks.quarantined} quarantined`
  );
  lines.push('');
  lines.push('  by department:');
  for (const [dept, count] of Object.entries(report.chunks.byDepartment).sort(
    (a, b) => b[1] - a[1]
  )) {
    lines.push(`    ${dept.padEnd(20)} ${count}`);
  }
  lines.push('');
  lines.push('  by language:');
  for (const [lang, count] of Object.entries(report.chunks.byLanguage)) {
    lines.push(`    ${lang.padEnd(20)} ${count}`);
  }
  if (Object.keys(report.quarantineBreakdown).length > 0) {
    lines.push('');
    lines.push('  quarantined (blocking) reasons:');
    for (const [code, count] of Object.entries(report.quarantineBreakdown)) {
      lines.push(`    ${code.padEnd(28)} ${count}`);
    }
  }
  if (Object.keys(report.nonBlockingFlagBreakdown).length > 0) {
    lines.push('');
    lines.push('  flagged (non-blocking) reasons:');
    for (const [code, count] of Object.entries(report.nonBlockingFlagBreakdown)) {
      lines.push(`    ${code.padEnd(28)} ${count}`);
    }
  }
  if (report.files.skippedUnknown.length > 0) {
    lines.push('');
    lines.push('  ! unrecognised files (add to topicMap.js):');
    for (const f of report.files.skippedUnknown) lines.push(`    · ${f.filename}`);
  }
  if (report.files.conflict.length > 0) {
    lines.push('');
    lines.push('  ! conflicting duplicates (manual review needed):');
    for (const f of report.files.conflict) lines.push(`    · ${f.filename} — ${f.reason}`);
  }
  lines.push('');
  return lines.join('\n');
}
