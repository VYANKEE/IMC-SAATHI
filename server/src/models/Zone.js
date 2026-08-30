import mongoose from 'mongoose';
import { localizedString } from './localizedString.js';

/**
 * One of IMC's 22 zonal offices.
 *
 * This is the cleanest data in the whole source set: 22 zones covering wards
 * 1-85 with no gaps and no duplicates (verified in tests/seed-data.test.js).
 *
 * It is STRUCTURED DATA, not RAG content — see docs/03-rag.md. That is what
 * makes a multi-hop answer reliable: "ward 47 mein garbage van nahi aa raha"
 * becomes ward -> zone -> zonal office phone, by lookup, not by a language
 * model recalling a number.
 */
const zoneSchema = new mongoose.Schema(
  {
    zoneNumber: { type: Number, required: true, unique: true, min: 1, max: 22 },
    name: localizedString,

    // Multikey index — this is what makes ward -> zone an O(1) lookup.
    wards: [{ type: Number, min: 1 }],

    officePhone: { type: String, trim: true },

    zonalOfficer: { name: String, mobile: String },
    csiHealth: { mobile: String },
    asstRevenueOfficer: { name: String, mobile: String },

    // false = the number failed a validation rule (wrong STD code, too few
    // digits). Visible to admins, never injected into a citizen-facing answer.
    verified: { type: Boolean, default: true },
    verificationNote: { type: String, trim: true },

    sourceDocument: { type: String, trim: true },
  },
  { timestamps: true }
);

zoneSchema.index({ wards: 1 });

export const Zone = mongoose.model('Zone', zoneSchema);
