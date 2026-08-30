import mongoose from 'mongoose';
import { localizedString, localizedStringOptional } from './localizedString.js';

/**
 * An IMC department.
 *
 * The field that matters most here is `coverageTier` — see docs/00-discovery.md.
 * Our source documents cover departments very unevenly, and the tier is what
 * stops the assistant inventing a procedure for a department we know nothing
 * about:
 *
 *   A = we have real procedural content  → full grounded answers
 *   B = we have a name and a phone number only → "X handles this, contact Y",
 *       and the prompt builder must NOT ask for a procedure
 *   C = referenced somewhere (e.g. the UI mockup) but zero source content
 *       → excluded from the selector entirely
 */
const departmentSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: localizedString,
    description: localizedStringOptional,

    responsibilities: {
      en: [{ type: String, trim: true }],
      hi: [{ type: String, trim: true }],
    },

    coverageTier: { type: String, enum: ['A', 'B', 'C'], required: true },

    // Tier A departments the citizen can pick in the department selector.
    // Cross-cutting content (e.g. general complaint procedure) is tier A but
    // not selectable — it is not a department you choose.
    isSelectable: { type: Boolean, default: false },

    officeTiming: {
      days: { type: String, trim: true }, // e.g. "Monday to Friday"
      from: { type: String, trim: true }, // "10:00"
      to: { type: String, trim: true }, // "18:00"
    },

    displayOrder: { type: Number, default: 100 },
    isActive: { type: Boolean, default: true },

    // Traceability: which file in data/raw/ this department came from.
    sourceDocuments: [{ type: String, trim: true }],
  },
  { timestamps: true }
);

departmentSchema.index({ coverageTier: 1, isSelectable: 1, displayOrder: 1 });

export const Department = mongoose.model('Department', departmentSchema);
