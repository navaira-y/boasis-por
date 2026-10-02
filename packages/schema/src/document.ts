import { z } from 'zod';
import { Id, IsoDate } from './common';

// Spec section 5.3, the document types the vault knows.
export const DocumentType = z.enum([
  'licence',
  'amended-licence',
  'memorandum',
  // Onboarding v2 step 2: the certificate of incorporation or registration, which carries the
  // incorporation date the licence does not.
  'certificate-of-incorporation',
  // The authority's licence agreement or terms: the source of the cancellation window, fees,
  // notice period and what renews together (build plan 3A).
  'authority-agreement',
  'establishment-card',
  'e-signature-card',
  'pro-card',
  'pro-authorisation-letter',
  'chamber-certificate',
  'lease',
  'ejari-certificate',
  'fit-out-permit',
  'civil-defence-permit',
  'signboard-permit',
  'deposit-receipt',
  'tax-certificate',
  'vat-return',
  'corporate-tax-return',
  'tax-receipt',
  'ubo-declaration',
  'audited-accounts',
  'insurance-policy',
  'insurance-certificate',
  'bank-letter',
  'wages-file',
  'passport',
  'entry-permit',
  'visa',
  'emirates-id',
  'work-permit',
  'labour-contract',
  'offer-letter',
  'medical-result',
  'unemployment-insurance-certificate',
  'signatory-letter',
  'board-resolution',
  'liquidator-appointment',
  'cancellation-certificate',
]);
export type DocumentType = z.infer<typeof DocumentType>;

// Spec 5.1: nothing is written from a document without a human tick. A term the reader pulled
// from a document keeps the day it was confirmed; while confirmedOn is null it is shown next to
// the document and the rules do not use it.
export function extracted<T extends z.ZodTypeAny>(value: T) {
  return z.object({ value: value.nullable(), confirmedOn: IsoDate.nullable() });
}
export interface Extracted<T> {
  value: T | null;
  confirmedOn: IsoDate | null;
}

// The terms the reader pulls from an authority agreement or a lease (build plan 3A). Every
// term may be absent or null: the reader did not find it.
export const DocumentExtracted = z.object({
  cancellationWindowDays: extracted(z.number().int().nonnegative()).nullable().optional(),
  cancellationFeeInsideAed: extracted(z.number().nonnegative()).nullable().optional(),
  cancellationFeeOutsideAed: extracted(z.number().nonnegative()).nullable().optional(),
  noticePeriodDays: extracted(z.number().int().nonnegative()).nullable().optional(),
  // What renews together, for example the licence, the flexi-desk and the establishment card.
  renewalBundle: extracted(z.array(z.string().min(1)))
    .nullable()
    .optional(),
  termMonths: extracted(z.number().int().positive()).nullable().optional(),
  autoRenews: extracted(z.boolean()).nullable().optional(),
});
export type DocumentExtracted = z.infer<typeof DocumentExtracted>;

// A version a replacement superseded (spec 5.3: replacing a document keeps the old one). The
// document keeps its id; each earlier file is kept here with the day it was replaced.
export const DocumentVersion = z.object({
  version: z.number().int().positive(),
  title: z.string().min(1),
  fileName: z.string().min(1),
  issueDate: IsoDate.nullable(),
  expiryDate: IsoDate.nullable(),
  uploadedOn: IsoDate,
  replacedOn: IsoDate,
});
export type DocumentVersion = z.infer<typeof DocumentVersion>;

export const Document = z.object({
  id: Id,
  companyId: Id,
  // What the document is attached to (spec 5.3): the company when both are null, else the one
  // office or the one person named. officeId is optional so an older record still parses.
  personId: Id.nullable(),
  officeId: Id.nullable().optional(),
  type: DocumentType,
  title: z.string().min(1),
  issueDate: IsoDate.nullable(),
  expiryDate: IsoDate.nullable(),
  fileName: z.string().min(1),
  uploadedOn: IsoDate,
  version: z.number().int().positive(),
  // Terms the reader pulled from the document, for type 'authority-agreement' and 'lease'.
  // Optional so a record written before the field existed still parses.
  extracted: DocumentExtracted.nullable().optional(),
  // Earlier versions, newest first. Optional so a record written before the field existed
  // still parses; absent or empty means this is the first version.
  previousVersions: z.array(DocumentVersion).optional(),
});
export type Document = z.infer<typeof Document>;

// What a replacement brings: the new file and its dates. Title and extracted terms carry over
// from the current version unless given.
export const DocumentReplacement = Document.pick({
  fileName: true,
  uploadedOn: true,
  issueDate: true,
  expiryDate: true,
}).extend({
  title: z.string().min(1).optional(),
  extracted: DocumentExtracted.nullable().optional(),
});
export type DocumentReplacement = z.infer<typeof DocumentReplacement>;
