import mongoose from 'mongoose';

/**
 * An IMC officer or office contact.
 *
 * Contacts live in their OWN collection and are never embedded into knowledge
 * chunks. Two reasons, both from docs/03-rag.md and the source KB itself:
 *
 *  1. Officers rotate and numbers change. If a number were baked into an
 *     embedded chunk, changing it would mean re-embedding the corpus.
 *  2. This collection is the allow-list the output validator checks the model's
 *     answer against. A phone number that is not in here cannot reach a
 *     citizen. That is what makes "never invent a phone number" enforceable
 *     rather than a polite request in a prompt.
 */
const contactSchema = new mongoose.Schema(
  {
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', index: true },

    scope: {
      type: String,
      enum: ['department', 'zone', 'office'],
      default: 'department',
    },

    name: { type: String, required: true, trim: true },
    designation: { type: String, trim: true },

    // Normalised to exactly 10 digits at seed time (data quality register #10:
    // the source dataset stored these as floats, e.g. "7974162847.0").
    mobile: { type: String, trim: true, match: /^[6-9]\d{9}$/ },

    officePhone: { type: String, trim: true },
    officeAddress: { type: String, trim: true },

    isPrimary: { type: Boolean, default: false },

    verified: { type: Boolean, default: true },
    verificationNote: { type: String, trim: true },

    sourceDocument: { type: String, trim: true },
    lastVerified: { type: Date },
  },
  { timestamps: true }
);

contactSchema.index({ departmentId: 1, isPrimary: -1 });

export const Contact = mongoose.model('Contact', contactSchema);
