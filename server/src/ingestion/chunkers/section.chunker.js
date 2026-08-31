/**
 * section.chunker.js
 *
 * For narrative documents (heading-structured .docx dossiers, and the
 * heading-structured parts of KB.pdf). Unlike the Q/A chunker, there is no
 * one-row-one-chunk shortcut — we have to decide chunk boundaries from
 * document structure ourselves.
 *
 * Boundary rule (docs/03-rag.md): "1 heading section = 1 chunk", extended
 * here to also boundary on a `listItem` block, because
 * Electrical_and_mechanical_dept_final.docx uses un-numbered
 * "List Paragraph"-styled lines (e.g. "Street light keeps blinking.") as
 * de-facto sub-questions that Word never promoted to a real Heading style.
 * Both act as: flush whatever text has accumulated as one chunk, then start
 * a new one titled by the heading/list-item text.
 *
 * A section over ~500 tokens (~2000 chars, the same rough token estimate
 * used elsewhere in this codebase) is handed to LangChain's
 * RecursiveCharacterTextSplitter — this is the one place LangChain is used
 * in the ingestion pipeline (see docs/11-decisions.md D13): a well-tested
 * recursive splitter for the rare long-section case, not for the atomic
 * Q/A rows, which are hand-chunked above.
 */
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { clean } from '../cleaner.js';
import { detectLanguage } from '../language.js';

const MAX_CHUNK_CHARS = 2000; // ~500 tokens at ~4 chars/token
const OVERLAP_CHARS = 150;

function slugify(text) {
  return (text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

/**
 * Walk the ordered block list and group it into raw sections:
 * { path: string[], title: string, body: string[] }
 * `path` is the chain of enclosing headings (list items are leaves, not
 * pushed onto the path — they don't have children of their own).
 */
function groupIntoSections(blocks) {
  const sections = [];
  const headingStack = []; // [{ level, text }]
  let current = null;

  const flush = () => {
    if (current && (current.title || current.body.length > 0)) {
      sections.push(current);
    }
    current = null;
  };

  for (const block of blocks) {
    if (block.type === 'heading') {
      flush();
      while (headingStack.length && headingStack[headingStack.length - 1].level >= block.level) {
        headingStack.pop();
      }
      const path = headingStack.map((h) => h.text);
      headingStack.push({ level: block.level, text: block.text });
      current = { path, title: block.text, body: [] };
    } else if (block.type === 'listItem') {
      flush();
      current = { path: headingStack.map((h) => h.text), title: block.text, body: [] };
    } else if (block.type === 'paragraph') {
      if (!current) {
        current = { path: headingStack.map((h) => h.text), title: null, body: [] };
      }
      current.body.push(block.text);
    }
  }
  flush();
  return sections;
}

export async function chunkNarrativeBlocks(
  blocks,
  { department, category, sourceFile, departmentLabel }
) {
  const sections = groupIntoSections(blocks);
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: MAX_CHUNK_CHARS,
    chunkOverlap: OVERLAP_CHARS,
    separators: ['\n\n', '\n', '. ', ' '],
  });

  const chunks = [];
  let sectionIndex = 0;
  for (const section of sections) {
    sectionIndex += 1;
    const body = clean(section.body.join('\n\n'));
    if (!body) continue; // heading-only section with no prose under it — nothing to embed

    const headerPath =
      [...section.path, section.title].filter(Boolean).join(' > ') || section.title || '';
    const slug = slugify(section.title) || `section_${sectionIndex}`;
    const header = `[${departmentLabel} | ${category} | ${slug}]`;
    const fullText = section.title ? `${header}\n${section.title}\n${body}` : `${header}\n${body}`;

    if (fullText.length <= MAX_CHUNK_CHARS) {
      chunks.push({
        text: fullText,
        department,
        category,
        intent: slug,
        language: detectLanguage(fullText),
        questionVariants: [],
        sourceFile,
        sourceRowRef: `section_${sectionIndex}`,
        sectionLabel: headerPath,
        needsReview: false,
        needsReviewReason: null,
        sourceFacts: {},
      });
      continue;
    }

    // Overflow: split, and carry the header + section title on every part
    // so a mid-section chunk is still self-describing on its own.
    const parts = await splitter.splitText(body);
    parts.forEach((part, partIndex) => {
      const partText = section.title
        ? `${header}\n${section.title} (part ${partIndex + 1}/${parts.length})\n${part}`
        : `${header}\n${part}`;
      chunks.push({
        text: partText,
        department,
        category,
        intent: slug,
        language: detectLanguage(partText),
        questionVariants: [],
        sourceFile,
        sourceRowRef: `section_${sectionIndex}_part_${partIndex + 1}`,
        sectionLabel: headerPath,
        needsReview: false,
        needsReviewReason: null,
        sourceFacts: {},
      });
    });
  }
  return chunks;
}
