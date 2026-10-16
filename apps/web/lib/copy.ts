/**
 * Visitor-facing copy that the brief specifies word for word. Kept in one
 * place so a test can hold it to the spec and so nobody "improves" the two
 * door messages by accident.
 */

export const ENTRY_COPY = {
  /** Spec section 4.3, verbatim. */
  waitlistTitle: '🎉 You joined the waitlist.',
  waitlistBody:
    'Early access is yours — set a password and walk straight into your portal. No payment, no card.',

  /** Spec section 4.4, verbatim. */
  plansTitle: 'Welcome to Boasis 👋',
  plansLede: 'Three plans. One choice:',
  soloFreeLine:
    "Solo is free for a year for one company — we won't ask for your card until you add a second company or your year ends.",

  emailLabel: 'Email',
  emailWhy: 'Sign-in and every reminder go here. It is the only way into your portal.',

  passwordTitle: 'Set your password',
  passwordWhy:
    'The code goes to your inbox next, so we can be sure this address is yours before the account exists.',

  codeTitle: 'Check your inbox',
  termsLine: 'I accept the Terms and Privacy Policy (version TERMS_VERSION).',
} as const;

export const TERMS_VERSION = '2026-10-01';

export const CTA = {
  continue: 'Continue',
  checking: 'Checking…',
  useDifferentEmail: 'Use a different one',
  waitlistContinue: 'Continue →',
  plansContinue: 'Continue with Solo free →',
  createAccount: 'Create my account',
  sendingCode: 'Sending code…',
  verify: 'Verify code',
  verifying: 'Checking…',
  resend: 'Resend code',
  sending: 'Sending…',
} as const;

export const SIGNIN_COPY = {
  title: 'Welcome back',
  lede: 'Sign in to open your company file.',
  forgot: 'Forgot your password? Send me a code instead',
  noAccount: 'No account yet?',
  createOne: 'Create one',
} as const;
