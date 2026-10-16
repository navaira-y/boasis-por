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
  it('is link-led while the project has no sender of its own', async () => {
    fake.setMode('healthy');
    resetEmailModeCache();
    const mode = await readEmailMode();
    expect(mode.codeLed).toBe(false);
    expect(mode.ownSender).toBe(false);
  });

  it('becomes code-led once a sender is configured', async () => {
    fake.setMode('smtp-configured');
    resetEmailModeCache();
    const mode = await readEmailMode();
    expect(mode.codeLed).toBe(true);
    expect(mode.otpLength).toBe(6);
  });

  it('falls back to link-led when the settings cannot be read', async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:1';
    resetEmailModeCache();
    const mode = await readEmailMode();
    process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    resetEmailModeCache();
    expect(mode.codeLed).toBe(false);
  });
});

describe('the copy for the inbox screen', () => {
  it('names both ways in, so an email with a link only, or a code only, cannot strand anyone', () => {
    expect(ENTRY_COPY.codeBody).toContain('six-digit code');
    expect(ENTRY_COPY.codeBody).toContain('click the link');
    expect(ENTRY_COPY.codeTitle).toContain('inbox');
  });
});
