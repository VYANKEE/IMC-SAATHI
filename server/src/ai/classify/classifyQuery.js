/**
 * classifyQuery.js
 *
 * Phase 6's first LLM call: turn a raw citizen query into a routing
 * decision (department guess, or out-of-scope / non-IMC) using
 * prompts/classify.department.md + schemas/CLASSIFY_SCHEMA. This module
 * never does retrieval or generation itself -- see generate/generateAnswer.js
 * for how its output is used.
 */
import { createNvidiaChat } from '../llm/nvidiaChat.js';
import { renderPrompt } from '../prompts/loadPrompt.js';
import { CLASSIFY_SCHEMA } from '../schemas/index.js';
import { findAllDepartments } from '../../repositories/department.repository.js';
import { findAllExternalAuthorities } from '../../repositories/externalAuthority.repository.js';

// "code | tier | name" — matches the header classify.department.md's prompt
// text tells the model to expect.
function formatDepartmentList(departments) {
  return departments.map((d) => `${d.code} | ${d.coverageTier} | ${d.name.en}`).join('\n');
}

// "key | handles summary | name" — handles is the citizen-phrase array on
// ExternalAuthority, used to build the classifier's label space (see that
// model's own header comment), not for fuzzy matching at query time.
function formatExternalAuthorityList(authorities) {
  return authorities
    .map(
      (a) => `${a.key} | ${(a.handles || []).join(', ') || '(no examples on file)'} | ${a.name.en}`
    )
    .join('\n');
}

export function createClassifier({ apiKey, model }) {
  const chat = createNvidiaChat({ apiKey, model });

  /**
   * @param {string} query - raw citizen query (en/hi/hinglish).
   * @returns {Promise<object>} CLASSIFY_SCHEMA shape + a `promptVersion`.
   */
  async function classify(query) {
    const [departments, authorities] = await Promise.all([
      findAllDepartments(),
      findAllExternalAuthorities(),
    ]);

    const system = renderPrompt('system.base.md');
    const prompt = renderPrompt('classify.department.md', {
      SYSTEM_PROMPT: system.text,
      DEPARTMENT_LIST: formatDepartmentList(departments) || '(no departments on file)',
      EXTERNAL_AUTHORITY_LIST: formatExternalAuthorityList(authorities) || '(none on file)',
      QUERY: query,
    });

    const result = await chat.completeJson(
      [{ role: 'user', content: prompt.text }],
      CLASSIFY_SCHEMA
    );

    return { ...result, promptVersion: prompt.version };
  }

  return { classify };
}
