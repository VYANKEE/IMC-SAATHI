/**
 * loadPrompt.js
 *
 * Every prompt is a versioned .md file under src/ai/prompts/ — never
 * inline in a route (docs/03-rag.md's "Prompt architecture" table). This
 * is the one place that reads them and does `{{VAR}}` substitution, and
 * the one place that extracts the version header so it can be logged with
 * every response (a regression should be traceable to a prompt change).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VERSION_HEADER_PATTERN = /^<!--\s*version:\s*(\S+)\s*-->\s*\n/;

const cache = new Map();

function readTemplate(filename) {
  if (cache.has(filename)) return cache.get(filename);
  const raw = readFileSync(path.join(__dirname, filename), 'utf8');
  const match = raw.match(VERSION_HEADER_PATTERN);
  const version = match ? match[1] : 'unversioned';
  const body = match ? raw.slice(match[0].length) : raw;
  const parsed = { version, body };
  cache.set(filename, parsed);
  return parsed;
}

/**
 * @param {string} filename - e.g. 'answer.grounded.md'
 * @param {Record<string, string>} vars - {{KEY}} placeholders to substitute.
 * @returns {{ version: string, text: string }}
 */
export function renderPrompt(filename, vars = {}) {
  const { version, body } = readTemplate(filename);
  const text = body.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (!(key in vars)) {
      throw new Error(`renderPrompt(${filename}): missing template variable {{${key}}}`);
    }
    return vars[key];
  });
  return { version, text };
}
