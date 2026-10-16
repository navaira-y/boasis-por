import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  FAKE_ANON_KEY,
  FAKE_SERVICE_KEY,
  startFakeSupabase,
  type FakeSupabase,
} from '../test/harness/fake-supabase';
import { readEmailMode, resetEmailModeCache } from './email-mode';
import { ENTRY_COPY } from './copy';

/**
 * The live project taught this lesson twice.
 *
 * First the screen assumed six digits while the project sent eight, so the code
 * could not be typed. Then the report assumed the project was on the built-in
 * mailer because the settings did not name a sender, while SMTP was connected and
 * working. So: the length is asked for and never guessed, null means unknown, and
 * the report says what the endpoint actually answered (status and field NAMES,
 * never a value).
 */
let fake: FakeSupabase;

beforeAll(async () => {
  fake = await startFakeSupabase({ anonKey: FAKE_ANON_KEY, serviceKey: FAKE_SERVICE_KEY });
  process.env.NEXT_PUBLIC_SUPABASE_URL = fake.url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = FAKE_ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_SERVICE_KEY;
});

afterAll(async () => {
  await fake.close();
});

describe('the code length', () => {
  it('is taken from the project when the project reports one', async () => {
    fake.setMode('eight-digit-codes');
    resetEmailModeCache();
    const mode = await readEmailMode();
    expect(mode.otpLength).toBe(8);
    expect(mode.codeLength).toBe(8);
    expect(mode.settings.status).toBe(200);
    expect(mode.settings.ok).toBe(true);
  });

  it('is UNKNOWN, not six, when the answer carries no length', async () => {
    // This is the shape the live project answered with. Treating it as six is
    // what capped an eight-digit code at six boxes.
    fake.setMode('healthy');
    resetEmailModeCache();
    const mode = await readEmailMode();
    expect(mode.otpLength).toBeNull();
    expect(mode.codeLength).toBeNull();
    expect(mode.settings.ok).toBe(true);
    expect(mode.settings.fields).toContain('mailer_autoconfirm');
  });

  it('is UNKNOWN when the endpoint refuses, and the reason is kept for the report', async () => {
    fake.setMode('settings-refused');
    resetEmailModeCache();
    const mode = await readEmailMode();
    expect(mode.codeLength).toBeNull();
    expect(mode.settings.ok).toBe(false);
    expect(mode.settings.status).toBe(401);
    expect(mode.settings.note).toContain('Invalid API key');
    expect(mode.settings.fields).toEqual([]);
  });

  it('is UNKNOWN when the project cannot be reached at all', async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:1';
    resetEmailModeCache();
    const mode = await readEmailMode();
    process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    resetEmailModeCache();
    expect(mode.codeLength).toBeNull();
    expect(mode.settings.ok).toBe(false);
    expect(mode.settings.status).toBe(0);
  });
});

describe('the sender', () => {
  it('is reported only from fields that actually carry a value', async () => {
    fake.setMode('smtp-configured');
    resetEmailModeCache();
    const mode = await readEmailMode();
    expect(mode.ownSender).toBe(true);
    expect(mode.settings.senderFields).toContain('smtp_admin_email');
  });

  it('is not claimed either way when the answer says nothing about it', async () => {
    fake.setMode('healthy');
    resetEmailModeCache();
    const mode = await readEmailMode();
    expect(mode.ownSender).toBe(false);
    expect(mode.settings.senderFields).toEqual([]);
    // The names are still listed, which is what makes the report readable.
    expect(mode.settings.fields).toContain('smtp_admin_email');
  });

  it('never carries a VALUE out of the settings response', async () => {
    fake.setMode('smtp-configured');
    resetEmailModeCache();
    const mode = await readEmailMode();
    const printed = JSON.stringify(mode.settings);
    // Names only: an address in the report would be a leak, a name never is.
    expect(printed).not.toContain('support@boasis.ae');
    expect(printed).not.toContain('smtp.gmail.com');
  });
});

describe('the copy for the inbox screen', () => {
  it('names both ways in, so an email with a link only, or a code only, cannot strand anyone', () => {
    expect(ENTRY_COPY.codeBodyTail).toContain('Type the code below');
    expect(ENTRY_COPY.codeBodyTail).toContain('click the link');
    expect(ENTRY_COPY.codeTitle).toContain('inbox');

    // A number in the copy is how a visitor with an eight-digit code was told to
    // type six. The project's own length decides how many boxes there are, so the
    // sentence never names a count.
    for (const said of [ENTRY_COPY.codeBodyLead, ENTRY_COPY.codeBodyTail, ENTRY_COPY.codeTitle]) {
      expect(said).not.toMatch(/six|eight|seven|ten|\d+-digit/i);
    }
  });
});
