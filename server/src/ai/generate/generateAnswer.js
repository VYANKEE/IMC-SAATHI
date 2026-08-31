/**
 * generateAnswer.js
 *
 * The Phase 6 orchestrator: classify -> route -> (retrieve -> facts ->
 * generate -> validate). This is the one place that wires together every
 * piece built across this phase; each individual step (classifier,
 * retriever, facts lookup, chat client, validator) stays independently
 * testable and independently swappable.
 *
 * Routing, in order -- see docs/03-rag.md and ExternalAuthority.js's own
 * header comment ("the pipeline answers from here -- before retrieval,
 * before the LLM writes anything"):
 *
 *   1. isOutOfScope -> a fixed refusal. No retrieval, no LLM answer call.
 *   2. isNonIMC     -> ExternalAuthority looked up deterministically.
 *                      No retrieval, no LLM answer call.
 *   3. otherwise    -> retrieve -> look up facts -> grounded generation
 *                      -> validateAnswer.
 */
import { createClassifier } from '../classify/classifyQuery.js';
import { createRetriever } from '../retrieval/retrieve.js';
import { lookupFacts } from '../facts/lookupFacts.js';
import { createNvidiaChat } from '../llm/nvidiaChat.js';
import { renderPrompt } from '../prompts/loadPrompt.js';
import { GROUNDED_ANSWER_SCHEMA } from '../schemas/index.js';
import { validateAnswer } from '../validate/validateAnswer.js';
import { findExternalAuthorityByKey } from '../../repositories/externalAuthority.repository.js';

export const OUT_OF_SCOPE_MESSAGE =
  'I can only help with Indore Municipal Corporation services and civic issues — this looks outside that. / Main sirf IMC se judi civic seva aur shikayat mein madad kar sakta hoon.';

export const FALLBACK_TEXT =
  "I don't have verified information to answer that. Please check the official IMC portal or contact the relevant department directly.";

// Ward extraction is intentionally simple (docs/03-rag.md Finding 1: strip
// location noise before embedding, resolve ward -> zone as a separate DB
// lookup, not as part of the embedding call) -- matches "ward 47", "ward
// no. 47", "w/47" written in en/hi/hinglish digits.
const WARD_PATTERN = /\bward\.?\s*(?:no\.?)?\s*(\d{1,2})\b/i;

export function extractWardNumber(query) {
  const match = typeof query === 'string' ? query.match(WARD_PATTERN) : null;
  if (!match) return undefined;
  const n = Number(match[1]);
  return Number.isInteger(n) && n >= 1 && n <= 85 ? n : undefined;
}

export function createGenerator({ apiKey, embeddingModel, chatModel, dimensions }) {
  const classifier = createClassifier({ apiKey, model: chatModel });
  const retriever = createRetriever({ apiKey, model: embeddingModel, dimensions });
  const chat = createNvidiaChat({ apiKey, model: chatModel });

  /**
   * @param {string} query - raw citizen query (en/hi/hinglish).
   * @returns {Promise<object>} `{ route, answer, sources, confidence, ... }`.
   */
  async function generateAnswer(query) {
    const classification = await classifier.classify(query);

    if (classification.isOutOfScope) {
      return {
        route: 'out_of_scope',
        answer: OUT_OF_SCOPE_MESSAGE,
        sources: [],
        confidence: 'high',
        classification,
      };
    }

    if (classification.isNonIMC) {
      const authority = classification.nonImcAuthorityKey
        ? await findExternalAuthorityByKey(classification.nonImcAuthorityKey)
        : null;

      if (!authority) {
        // Classifier said non-IMC but gave no (or a bad) key to look up --
        // do not let the LLM improvise a routing answer; fall back safely
        // rather than guessing an authority.
        return {
          route: 'non_imc_unresolved',
          answer: FALLBACK_TEXT,
          sources: [],
          confidence: 'low',
          classification,
        };
      }

      const phone = [authority.phone, authority.altPhone].filter(Boolean).join(' / ');
      const noteText = authority.note?.en ? ` ${authority.note.en}` : '';
      return {
        route: 'non_imc',
        answer: `${authority.name.en}${phone ? ` handles this — contact ${phone}.` : ' handles this.'}${noteText}`,
        sources: [],
        confidence: 'high',
        externalAuthority: authority,
        classification,
      };
    }

    const { results, departmentFilterApplied, departmentFilterFellBack } = await retriever.retrieve(
      query,
      {
        departmentId: classification.departmentId ?? undefined,
        departmentConfidence: classification.confidence ?? 0,
      }
    );

    const facts = await lookupFacts({
      departmentCode: classification.departmentId ?? undefined,
      wardNumber: extractWardNumber(query),
    });

    const context = results.length
      ? results.map((r) => `[chunkId: ${r.chunkId}]\n${r.text}`).join('\n\n---\n\n')
      : '(no relevant knowledge chunks retrieved)';

    const system = renderPrompt('system.base.md');
    const prompt = renderPrompt('answer.grounded.md', {
      SYSTEM_PROMPT: system.text,
      COVERAGE_TIER: facts.department?.coverageTier ?? 'C',
      FALLBACK_TEXT,
      CONTEXT: context,
      VERIFIED_FACTS: facts.text,
      QUERY: query,
    });

    const raw = await chat.completeJson(
      [{ role: 'user', content: prompt.text }],
      GROUNDED_ANSWER_SCHEMA
    );

    const validated = validateAnswer(raw, {
      phones: facts.phones,
      urls: facts.urls,
      retrievedChunkIds: results.map((r) => r.chunkId),
      fallbackText: FALLBACK_TEXT,
      promptVersion: prompt.version,
    });

    return {
      route: 'grounded',
      ...validated,
      // department/contact are NOT part of GROUNDED_ANSWER_SCHEMA and never
      // come from the LLM -- see docs/11-decisions.md D16 Addendum 2. Both
      // are deterministic facts already fetched above; attaching them here
      // (not asking the model to reproduce them) is what actually fixed the
      // malformed department/contact shape the first real call produced.
      department: facts.department
        ? { id: facts.department.code, name: facts.department.name?.en ?? facts.department.code }
        : null,
      contact: facts.contacts?.[0]
        ? {
            name: facts.contacts[0].name,
            designation: facts.contacts[0].designation ?? null,
            phone: facts.contacts[0].mobile || facts.contacts[0].officePhone || null,
            office: facts.contacts[0].officeAddress ?? null,
          }
        : null,
      classification,
      departmentFilterApplied,
      // true when the classifier's department pick was confident enough to
      // filter on, but that department had zero indexed content for this
      // query and retrieve.js fell back to an unfiltered search instead of
      // returning nothing (docs/11-decisions.md D20). Surfaced here so this
      // is visible/debuggable rather than a silent behind-the-scenes retry.
      departmentFilterFellBack,
      retrievedCount: results.length,
    };
  }

  return { generateAnswer };
}
