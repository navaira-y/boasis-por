import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  FAKE_ANON_KEY,
  FAKE_SERVICE_KEY,
  startFakeSupabase,
  type FakeSupabase,
} from '../test/harness/fake-supabase';
import { MAX_CODE_LENGTH, MIN_CODE_LENGTH } from './code-length';
import { readEmailMode, resetEmailModeCache } from './email-mode';
import { ENTRY_COPY } from './copy';

/**
 * With no sender configured, the email carries a link and no digits. Asking the
 * visitor for six digits that are not in their inbox is the exact "the screen
 * lied" failure this project keeps having to fix, so the screen follows the
 * project's own settings instead of a guess.
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

describe('the email mode', () => {
  it('reports that the built-in sender is in use, with a usable code length', async () => {
    fake.setMode('healthy');
    resetEmailModeCache();
    const mode = await readEmailMode();
    expect(mode.ownSender).toBe(false);
    expect(mode.codeLength).toBe(6);
  });

  it('follows the project own code length once one is reported', async () => {
    fake.setMode('smtp-configured');
    resetEmailModeCache();
    const mode = await readEmailMode();
    expect(mode.ownSender).toBe(true);
    expect(mode.otpLength).toBe(6);
    expect(mode.codeLength).toBe(6);
  });

  it('falls back to six digits when the settings cannot be read', async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:1';
    resetEmailModeCache();
    const mode = await readEmailMode();
    process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    resetEmailModeCache();
    expect(mode.codeLength).toBe(6);
  });
});

describe('the project own code length', () => {
  it('is read from the settings, so eight digits render eight boxes', async () => {
    fake.setMode('eight-digit-codes');
    resetEmailModeCache();
    const mode = await readEmailMode();
    expect(mode.otpLength).toBe(8);
    expect(mode.codeLength).toBe(8);
    expect(MAX_CODE_LENGTH).toBeGreaterThanOrEqual(8);
    expect(MIN_CODE_LENGTH).toBe(6);
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
