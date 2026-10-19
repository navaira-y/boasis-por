import { z } from 'zod';

export const AuthenticatorCode = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the six-digit code from your authenticator.');
export const AuthenticatorFactor = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: z.enum(['verified', 'unverified']),
});
export type AuthenticatorFactor = z.infer<typeof AuthenticatorFactor>;
export const MfaState = z.object({
  enabled: z.boolean(),
  requiresVerification: z.boolean(),
  factors: z.array(AuthenticatorFactor),
});
export type MfaState = z.infer<typeof MfaState>;
export const AuthenticatorEnrollment = z.object({
  factorId: z.string().uuid(),
  qrCode: z.string().startsWith('data:image/svg+xml;'),
  secret: z
    .string()
    .min(1)
    .max(256)
    .regex(/^[A-Z2-7]+=*$/i),
});
export type AuthenticatorEnrollment = z.infer<typeof AuthenticatorEnrollment>;
const Proof = z.object({ factorId: z.string().uuid(), code: AuthenticatorCode }).strict();
export const MfaOperation = z.discriminatedUnion('operation', [
  z
    .object({
      operation: z.literal('enroll'),
      name: z
        .string()
        .trim()
        .min(1)
        .max(64)
        .regex(/^[^\p{C}]+$/u),
      proof: Proof.optional(),
    })
    .strict(),
  z
    .object({
      operation: z.literal('verify'),
      factorId: z.string().uuid(),
      code: AuthenticatorCode,
    })
    .strict(),
  z.object({ operation: z.literal('cancel'), factorId: z.string().uuid() }).strict(),
  z.object({ operation: z.literal('remove'), factorId: z.string().uuid(), proof: Proof }).strict(),
]);
export type MfaOperation = z.infer<typeof MfaOperation>;
export const MfaReply = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    state: MfaState,
    enrollment: AuthenticatorEnrollment.optional(),
  }),
  z.object({
    ok: z.literal(false),
    code: z.enum(['AUTH_REQUIRED', 'MFA_REQUIRED', 'INVALID', 'RATE_LIMITED', 'UNAVAILABLE']),
    error: z.string(),
  }),
]);
export type MfaReply = z.infer<typeof MfaReply>;

// Minimal server-verified Auth user factor shape, never a display-session flag.
export const AuthFactorRecord = z.object({
  id: z.string().uuid(),
  factor_type: z.string(),
  status: z.enum(['verified', 'unverified']),
  friendly_name: z.string().nullable().optional(),
});
export type AuthFactorRecord = z.infer<typeof AuthFactorRecord>;

export const MFA_RECOVERY_COPY =
  "Before signing out, add and verify a backup authenticator on a separate device, or use your authenticator app's secure backup. Keep setup keys private. Email sign-in does not bypass two-step verification. If all authenticators are lost, contact support; this page cannot remove protection using email alone.";

export const MfaGate = z.enum(['not-required', 'verified', 'required', 'unavailable']);
export type MfaGate = z.infer<typeof MfaGate>;
