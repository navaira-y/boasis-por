import { z } from 'zod';

export const LegalForm = z.enum([
  'llc',
  'sole-establishment',
  'branch',
  'fzco',
  'fze',
  'free-zone-llc',
  // Onboarding v2 step 2: a legal form the list does not name.
  'other',
  'unknown',
]);
export type LegalForm = z.infer<typeof LegalForm>;
