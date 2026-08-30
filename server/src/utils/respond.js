/**
 * One response envelope for the whole API — see docs/05-api.md.
 *   success: { success: true, data }
 *   error:   { success: false, message, code }
 *
 * Codes (not free text) so the frontend can localise the message into
 * English or Hindi instead of showing an English string to a Hindi user.
 */
export const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

export const fail = (res, status, code, message) =>
  res.status(status).json({ success: false, code, message });
