/**
 * What a Supabase Auth failure means, in one place, with the fix attached.
 *
 * Why this exists: the live signup screen said "We could not send that email
 * right now" and the reason lived only in a log nobody was reading. Every
 * branch below now names the CAUSE and the change that fixes it, because on the
 * entry path an unnamed failure costs a founder an afternoon.
 *
 * Supabase's wording is not stable, so each rule matches the phrases it is
 * actually known to use, and the raw message is kept for the record either way.
 *
 * Pure module: no server-only imports, so it is unit tested directly.
 */

export type AuthFailureKind =
  | 'rate-limit'
  | 'mailer-not-configured'
  | 'address-not-authorized'
  | 'redirect-not-allowed'
  | 'signups-disabled'
  | 'code-wrong-or-expired'
  | 'password-policy'
  | 'already-registered'
  | 'unknown';

export interface AuthFailure {
  kind: AuthFailureKind;
  /** Short machine word for the entry trail. */
  code: string;
  /** What the visitor reads. Plain, kind, actionable. */
  message: string;
  /** What the operator changes. Shown in the entry trail, never to a visitor. */
  fix: string;
}

const RULES: { kind: AuthFailureKind; code: string; test: RegExp; message: string; fix: string }[] = [
  {
    kind: 'rate-limit',
    code: 'AUTH_RATE_LIMIT',
    // Supabase: "Email rate limit exceeded", "For security purposes, you can
    // only request this after 60 seconds", "Too many requests".
    test: /rate limit|too many|for security purposes/i,
    message:
      'A code was already asked for from this address very recently. Please wait a few minutes, then try again.',
    fix: 'A Supabase project on the built-in test mailer allows only a couple of emails an hour. Configure your own SMTP (Authentication, Emails, SMTP settings) to remove that ceiling before launch. Supabase, Authentication, Rate Limits also shows the window.',
  },
  {
    kind: 'mailer-not-configured',
    code: 'AUTH_SMTP_MISSING',
    test: /error sending|smtp|mailer|failed to send|send.*email/i,
    message:
      'We could not send the code email from this project. Please write to support@boasis.ae and we will finish setting it up for you.',
    fix: 'Supabase, Authentication, Emails, SMTP settings: no working sender, or the sender was rejected. Connect the Google Workspace mailbox (support@boasis.ae, app password) as SMTP. Also check Authentication, Rate Limits: the window may simply be spent.',
  },
  {
    kind: 'address-not-authorized',
    code: 'AUTH_EMAIL_NOT_ALLOWED',
    // The built-in mailer only sends to addresses the project is allowed to
    // use, which is why a real founder's address fails while the operator's
    // works.
    // Narrow on purpose: "not allowed" alone also appears in redirect and
    // signup messages, and matching those here sent the operator to the wrong
    // setting (a unit test caught it).
    test: /email address is not authorized|address.*not authorized|not authorized to receive|email.*allow ?list/i,
    message:
      'This address cannot receive codes from the project yet. Please write to support@boasis.ae and we will sort it out.',
    fix: 'The project is using Supabase own mailer, which only sends to authorised addresses. Authentication, Emails, SMTP settings: connect a real sender (support@boasis.ae) and this stops.',
  },
  {
    kind: 'redirect-not-allowed',
    code: 'AUTH_REDIRECT_NOT_ALLOWED',
    test: /redirect|redirect_to|site url/i,
    message: 'We could not send the code email from this project. Please write to support@boasis.ae.',
    fix: 'Supabase, Authentication, URL Configuration: add this app origin to Site URL and Redirect URLs (it must match NEXT_PUBLIC_APP_URL exactly).',
  },
  {
    kind: 'signups-disabled',
    code: 'AUTH_SIGNUPS_DISABLED',
    test: /signups? (are )?(not allowed|disabled)|signup is disabled/i,
    message: 'New accounts are switched off on this project. Please write to support@boasis.ae.',
    fix: 'Supabase, Authentication, Sign In / Providers: enable email signups (and "allow new users to sign up").',
  },
  {
    kind: 'code-wrong-or-expired',
    code: 'AUTH_CODE_INVALID',
    test: /invalid.*(token|otp|code|login|credentials)|token has expired|expired|invalid_grant/i,
    message: 'That code is not right, or it has expired. Ask for a fresh one and try again.',
    fix: 'Nothing to change unless it repeats for every visitor: check Authentication, Emails for a template that drops the code, and the OTP expiry setting.',
  },
  {
    kind: 'password-policy',
    code: 'AUTH_PASSWORD_POLICY',
    test: /password/i,
    message: 'That password is not accepted yet. Please use at least 12 characters.',
    fix: 'Supabase, Authentication, Settings: the required password strength is stricter than the app knows about. Tell the app so the hint matches.',
  },
  {
    kind: 'already-registered',
    code: 'AUTH_ALREADY_REGISTERED',
    test: /already registered|already exists|user already/i,
    message: 'An account with this address already exists. Please sign in instead.',
    fix: 'Nothing to change: the visitor should sign in. One email is one account by design.',
  },
];

export function authFailure(message: string): AuthFailure {
  const text = message.trim();
  for (const rule of RULES) {
    if (rule.test.test(text)) {
      return { kind: rule.kind, code: rule.code, message: rule.message, fix: rule.fix };
    }
  }
  return {
    kind: 'unknown',
    code: 'AUTH_UNKNOWN',
    message:
      'We could not finish that step just now. Please try again in a moment, or write to support@boasis.ae.',
    fix: 'Read the raw message in the entry trail (Railway logs: entry: kind=code_sent) and in Supabase, Authentication, Logs.',
  };
}

/** True when the visitor cannot be helped by retrying. */
export function isOperatorProblem(failure: AuthFailure): boolean {
  return (
    failure.kind === 'mailer-not-configured' ||
    failure.kind === 'address-not-authorized' ||
    failure.kind === 'redirect-not-allowed' ||
    failure.kind === 'signups-disabled'
  );
}
