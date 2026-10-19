import { describe, expect, it } from 'vitest';
import { AuthenticatorCode, MfaOperation, MfaReply } from './mfa';
const factorId = '33333333-3333-4333-8333-333333333333';
describe('authenticator contracts', () => {
  it.each(['000123', '123456', ' 123456 '])(
    'accepts six digits including leading zeros: %s',
    (code) => {
      expect(AuthenticatorCode.safeParse(code).success).toBe(true);
    },
  );
  it.each(['', '12345', '1234567', '12a456', '123 45', '１２３４５６'])(
    'rejects invalid codes: %s',
    (code) => {
      expect(AuthenticatorCode.safeParse(code).success).toBe(false);
    },
  );
  it('requires removal proof and rejects extra fields or local enabled flags', () => {
    expect(MfaOperation.safeParse({ operation: 'remove', factorId }).success).toBe(false);
    expect(
      MfaOperation.safeParse({ operation: 'verify', factorId, code: '123456', enabled: true })
        .success,
    ).toBe(false);
    expect(
      MfaOperation.safeParse({ operation: 'enroll', name: 'App', phone: '+971' }).success,
    ).toBe(false);
    expect(MfaOperation.safeParse({ operation: 'enroll', name: 'App\n' }).success).toBe(true);
    expect(MfaOperation.safeParse({ operation: 'enroll', name: 'App\nName' }).success).toBe(false);
  });
  it('does not accept an external QR URL or arbitrary HTML as an enrollment secret', () => {
    const base = { ok: true, state: { enabled: false, requiresVerification: false, factors: [] } };
    expect(
      MfaReply.safeParse({
        ...base,
        enrollment: { factorId, qrCode: 'https://example.com/secret', secret: 'JBSWY3DPEHPK3PXP' },
      }).success,
    ).toBe(false);
    expect(
      MfaReply.safeParse({
        ...base,
        enrollment: { factorId, qrCode: 'data:image/svg+xml;base64,abcd', secret: '<script>' },
      }).success,
    ).toBe(false);
  });
});
