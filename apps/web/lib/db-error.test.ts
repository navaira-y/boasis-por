import { describe, expect, it } from 'vitest';
import { classifyDbFailure } from './db-error';

/**
 * Every payload below is real: the first two are copied from a live Supabase
 * project, and they are the two the app used to confuse. A rejected key sent
 * the operator to rotate a key that was never wrong, while the actual fault was
 * a missing GRANT that Supabase named in its own hint.
 */

describe('a rejected key', () => {
  it('is what a 401 with "Invalid API key" means', () => {
    expect(
      classifyDbFailure({ status: 401, message: '{"message":"Invalid API key","hint":"double check your Supabase URL"}' }),
    ).toBe('key-rejected');
  });

  it('is what a missing key means', () => {
    expect(classifyDbFailure({ status: 401, message: 'No API key found in request' })).toBe(
      'key-rejected',
    );
  });

  it('covers an expired token as well', () => {
    expect(classifyDbFailure({ status: 401, message: 'JWT expired' })).toBe('key-rejected');
    expect(classifyDbFailure({ message: 'invalid claim: missing sub claim' })).toBe('key-rejected');
  });
});

describe('a missing grant', () => {
  const live = {
    status: 403,
    code: '42501',
    message:
      '{"code":"42501","details":null,"hint":"Grant the required privileges to the current role with: GRANT SELECT ON public.early_access_emails TO service_role;","message":"permission denied for table early_access_emails"}',
  };

  it('is what the live project actually returned', () => {
    expect(classifyDbFailure(live)).toBe('grants-missing');
  });

  it('is not mistaken for a rejected key, whatever the status', () => {
    expect(classifyDbFailure({ ...live, status: 400 })).toBe('grants-missing');
    expect(classifyDbFailure({ status: 500, code: '42501' })).toBe('grants-missing');
  });

  it('covers a bare permission message with no code', () => {
    expect(classifyDbFailure({ message: 'permission denied for table entry_events' })).toBe(
      'grants-missing',
    );
  });
});

describe('a missing object', () => {
  it('names a missing table', () => {
    expect(
      classifyDbFailure({
        status: 404,
        code: 'PGRST205',
        message: "Could not find the table 'public.early_access_emails' in the schema cache",
      }),
    ).toBe('table-missing');
    expect(classifyDbFailure({ code: '42P01', message: 'relation does not exist' })).toBe(
      'table-missing',
    );
  });

  it('names a missing function', () => {
    expect(
      classifyDbFailure({
        status: 404,
        code: 'PGRST202',
        message: 'Could not find the function public.activate_free_year',
      }),
    ).toBe('function-missing');
  });
});

describe('nothing answering', () => {
  it('covers the app own bounded fetch', () => {
    expect(
      classifyDbFailure({ status: 500, message: 'Supabase did not answer, so the app stopped asking' }),
    ).toBe('unreachable');
  });

  it('covers the fetch layer itself', () => {
    expect(classifyDbFailure({ status: 0, message: 'fetch failed' })).toBe('unreachable');
    expect(classifyDbFailure({ message: 'getaddrinfo ENOTFOUND x.supabase.co' })).toBe('unreachable');
    expect(classifyDbFailure({ status: 503, message: 'Service Unavailable' })).toBe('unreachable');
  });
});

describe('anything else', () => {
  it('is reported as unknown rather than guessed', () => {
    expect(classifyDbFailure({ status: 406, message: 'JSON object requested, multiple rows returned' })).toBe(
      'unknown',
    );
    expect(classifyDbFailure({})).toBe('unknown');
  });
});
