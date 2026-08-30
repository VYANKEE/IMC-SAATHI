import mongoose from 'mongoose';
import { localizedString } from './localizedString.js';

/**
 * An authority that is NOT the Indore Municipal Corporation.
 *
 * This table exists so that "ghar ki light chali gayi" (Discom, 1912) and
 * "street light kharab hai" (IMC Electrical) can be told apart by a lookup
 * rather than by hoping the model remembers the difference. The classifier
 * sets isNonIMC and the pipeline answers from here — before retrieval, before
 * the LLM writes anything. See docs/03-rag.md and docs/00-discovery.md.
 */
const externalAuthoritySchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: localizedString,

    // Plain-language phrases a citizen might use. Used to build the classifier's
    // label space, not for fuzzy matching at query time.
    handles: [{ type: String, trim: true }],

    phone: { type: String, trim: true },
    altPhone: { type: String, trim: true },

    note: {
      en: { type: String, trim: true },
      hi: { type: String, trim: true },
    },

    isActive: { type: Boolean, default: true },
    sourceDocument: { type: String, trim: true },
  },
  { timestamps: true }
);

export const ExternalAuthority = mongoose.model('ExternalAuthority', externalAuthoritySchema);
