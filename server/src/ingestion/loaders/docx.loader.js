/**
 * docx.loader.js
 *
 * Converts a .docx file into an ordered list of typed blocks:
 *   { type: 'heading', level, text }
 *   { type: 'listItem', text }   — a single-item boundary (see below)
 *   { type: 'paragraph', text }  — body prose, including flattened bullets
 *
 * Word's formatting turns out to encode two *different* structural roles
 * with what looks, at first glance, like the same "bullet list" visual
 * style — verified against the actual converted HTML for
 * Electrical_and_mechanical_dept_final.docx, not assumed:
 *
 *   - Some sub-questions ("Street light keeps blinking.") are typed with
 *     the "List Paragraph" *style* -> mammoth emits <p class="docx-list-item">.
 *   - Other, structurally identical sub-questions ("Street light remains
 *     ON during the day.") were instead typed using Word's auto-numbering,
 *     which mammoth renders as a real <ol> — but *only ever with exactly
 *     one <li> inside it*, because the author pressed Enter once after a
 *     numbered "question line" and never continued the list.
 *   - Genuine multi-step instructions ("Steps to Raise the Complaint")
 *     and bullet fact lists ("Major Responsibilities") are also <ol>/<ul>,
 *     but always with more than one <li> — and must NOT become chunk
 *     boundaries, or a 6-step procedure fragments into six meaningless
 *     one-line chunks disconnected from the question they answer.
 *
 * Rule: an <ol> with exactly one <li> is treated the same as a
 * docx-list-item paragraph (a boundary). Every other <ul>/<ol> has its
 * <li> children flattened into "- text" paragraph lines, in document
 * order, as body content of whatever chunk is currently open.
 */
import mammoth from 'mammoth';
import { parseDocument } from 'htmlparser2';

const STYLE_MAP = ["p[style-name='List Paragraph'] => p.docx-list-item:fresh"];
const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

function textOf(node) {
  if (node.type === 'text') return node.data;
  if (!node.children) return '';
  return node.children.map(textOf).join('');
}

function clean(text) {
  return text.replace(/\s+/g, ' ').trim();
}

export async function loadDocx(filePath) {
  const { value: html } = await mammoth.convertToHtml({ path: filePath }, { styleMap: STYLE_MAP });
  const dom = parseDocument(html);
  const blocks = [];

  for (const node of dom.children) {
    if (node.type !== 'tag') continue;
    const { name, attribs } = node;

    if (HEADING_TAGS.has(name)) {
      const text = clean(textOf(node));
      if (text) blocks.push({ type: 'heading', level: Number(name[1]), text });
      continue;
    }

    if (name === 'p') {
      const text = clean(textOf(node));
      if (!text) continue;
      if (attribs.class === 'docx-list-item') {
        blocks.push({ type: 'listItem', text });
      } else {
        blocks.push({ type: 'paragraph', text });
      }
      continue;
    }

    if (name === 'ul' || name === 'ol') {
      const items = (node.children ?? [])
        .filter((c) => c.type === 'tag' && c.name === 'li')
        .map((li) => clean(textOf(li)))
        .filter(Boolean);
      if (name === 'ol' && items.length === 1) {
        blocks.push({ type: 'listItem', text: items[0] });
      } else {
        for (const item of items) {
          blocks.push({ type: 'paragraph', text: `- ${item}` });
        }
      }
    }
  }

  return blocks;
}
