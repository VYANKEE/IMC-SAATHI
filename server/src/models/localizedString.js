/**
 * Reusable sub-schema for anything a citizen reads.
 *
 * Why an object and not a plain String: docs/06-frontend.md says the whole UI
 * localises, not just the buttons. If `name` were a String, every Hindi user
 * would see English department names coming back from the API. Storing both
 * lets the API return the right one based on ?lang=.
 */
export const localizedString = {
  en: { type: String, required: true, trim: true },
  hi: { type: String, required: true, trim: true },
};

export const localizedStringOptional = {
  en: { type: String, trim: true },
  hi: { type: String, trim: true },
};
