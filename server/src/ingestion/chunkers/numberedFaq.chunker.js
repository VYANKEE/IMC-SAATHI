/**
 * numberedFaq.chunker.js
 *
 * IMC_PWD_Revenue_Chatbot_FAQ_Knowledge_Base.pdf uses its own structure —
 * neither a clean table (Fire_NOC.csv) nor Word headings
 * (Electrical_and_mechanical_dept_final.docx), but inline numbered FAQ
 * codes running through the prose: "PWD-004. My road is broken. Which
 * department...? If the issue concerns... REV-001. What does the Revenue
 * Department..." — exactly the "`KB.pdf` numbered FAQs (PWD-001…, REV-001…)
 * → 1 numbered FAQ = 1 chunk" rule in docs/03-rag.md's chunk-rule table.
 *
 * Deliberately NOT handled here (see docs/13-build-plan.md /
 * ingestion-report.json `notChunked` for the honest record of the gap):
 *   - page 1's "Department Scope & Routing" table — tabular data collapses
 *     into a flat text stream once PDF-extracted; needs real table
 *     extraction, not implemented in v1.
 *   - page 7's "Current Official Data" table — a facts table (contacts,
 *     rates), which belongs in typed collections, not RAG chunks, same as
 *     every other facts document in this corpus.
 *   - page 8's chatbot-guidance bullets — not citizen-facing content at
 *     all; candidate system-prompt material for Phase 6, out of scope here.
 */
import { clean } from '../cleaner.js';
import { detectLanguage } from '../language.js';

const FAQ_CODE_PATTERN = /\b(PWD|REV)-(\d{3})\.\s/g;
const PREFIX_TO_DEPARTMENT = { PWD: 'PWD', REV: 'REVENUE' };

// The document's own section headers, which run straight into the
// preceding FAQ's answer with no code to stop at (verified against the
// real extracted text — PWD-020's answer was silently swallowing all of
// "3. Revenue Department — FAQ..." up to REV-001, and REV-036 — the last
// FAQ in the document — was swallowing the entire page 7/8 facts table
// and guidance section with nothing after it to bound it).
const SECTION_BOUNDARY_MARKERS = [
  '3. Revenue Department',
  '4. Current Official Data',
  '7. Source Register',
];

// Every page of the PDF repeats this running header/footer; left in place
// it contaminates any FAQ answer that happens to span a page boundary
// (verified: it was leaking into PWD-020 and REV-036's answers).
const PAGE_HEADER_PATTERN =
  /IMC PWD & Revenue Chatbot FAQ\s*[—-]\s*verified 18 Aug 2026\s*Page\s*\d+/g;

export function extractNumberedFaqs(rawFullText) {
  const fullText = rawFullText.replace(PAGE_HEADER_PATTERN, ' ');
  const matches = [...fullText.matchAll(FAQ_CODE_PATTERN)];
  const faqs = [];
  for (let i = 0; i < matches.length; i += 1) {
    const start = matches[i].index + matches[i][0].length;
    let end = i + 1 < matches.length ? matches[i + 1].index : fullText.length;
    for (const marker of SECTION_BOUNDARY_MARKERS) {
      const markerIndex = fullText.indexOf(marker, start);
      if (markerIndex !== -1 && markerIndex < end) end = markerIndex;
    }
    const block = clean(fullText.slice(start, end));
    if (!block) continue;
    const code = `${matches[i][1]}-${matches[i][2]}`;
    const questionEnd = block.indexOf('?');
    const question = questionEnd === -1 ? block : block.slice(0, questionEnd + 1).trim();
    const answer = questionEnd === -1 ? '' : block.slice(questionEnd + 1).trim();
    faqs.push({ code, department: PREFIX_TO_DEPARTMENT[matches[i][1]], question, answer });
  }
  return faqs;
}

export function chunkNumberedFaqs(faqs, { sourceFile, departmentLabelFor }) {
  return faqs.map((faq) => {
    const header = `[${departmentLabelFor(faq.department)} | pwd_revenue_faq | ${faq.code.toLowerCase()}]`;
    const text = `${header}\nQ: ${faq.question}\nA: ${faq.answer}`;
    return {
      text,
      department: faq.department,
      category: 'pwd_revenue_faq',
      intent: faq.code.toLowerCase(),
      language: detectLanguage(text),
      questionVariants: [],
      sourceFile,
      sourceRowRef: faq.code,
      needsReview: false,
      needsReviewReason: null,
      sourceFacts: {},
    };
  });
}
