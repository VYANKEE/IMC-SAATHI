/**
 * redact.js
 *
 * Belt-and-suspenders scrub applied to every chunk's embedded text right
 * after it's assembled, regardless of which chunker produced it. The
 * structured chunkers (qaPair, wide dataset) already keep contact fields
 * out of `text` by construction — this should be a no-op for them. It
 * earns its keep on the narrative sources, where a phone number can be
 * sitting inside a sentence of otherwise-good procedural prose (e.g.
 * Electrical_and_mechanical_dept_final.docx: "...call the IMC helpline at
 * 0731-4071717 or..."). Register #11's own instruction — contacts must be
 * "stripped out of the embedded chunk text" — is a redaction, not a
 * reason to throw away the whole chunk's procedural content.
 */
const PHONE_LIKE_PATTERN = /\b(?:0731[-\s]?\d{6,8}|\+?91[-\s]?\d{10}|\d{10})\b/g;
const REDACTION_PLACEHOLDER = '[contact number removed — see department contact details]';

export function redactContacts(text) {
  let redactionCount = 0;
  const redacted = text.replace(PHONE_LIKE_PATTERN, () => {
    redactionCount += 1;
    return REDACTION_PLACEHOLDER;
  });
  return { text: redacted, redactionCount };
}

// A handful of source blocks (e.g. a trailing "Name: ... Designation: ...
// Mobile No.:" paragraph) are pure contact cards with no procedural
// content at all — redacting the number leaves a useless, label-only
// fragment. These are better excluded entirely than embedded half-scrubbed.
const CONTACT_CARD_PATTERN =
  /\bDesignation\s*:|\bMobile No\.?\s*:|\bName\s*:\s*(Mr|Ms|Mrs|Shri|Smt)\b/i;

export function looksLikeContactCard(text) {
  return CONTACT_CARD_PATTERN.test(text);
}
