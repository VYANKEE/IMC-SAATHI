import { z } from 'zod';

/** Language is a query param on almost every public endpoint. */
export const langQuery = z.object({
  lang: z.enum(['en', 'hi']).default('en'),
});

export const wardParam = z.object({
  wardNumber: z.coerce.number().int().min(1, 'Ward numbers start at 1').max(85, 'IMC has 85 wards'),
});

export const slugParam = z.object({
  slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/, 'Invalid department slug'),
});
