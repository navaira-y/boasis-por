/**
 * A fetch that gives up, and then stops asking.
 *
 * Supabase's client retries a failing request three times with backoff (1 s,
 * 2 s, 4 s) before it stops, which is right for a blip and wrong for a page
 * load. Measuring it proved the point: with the database down, /signup took
 * 7.0 s to answer. The time was not spent waiting on the network, it was spent
 * sleeping between retries, so a shorter timeout alone changes nothing.
 *
 * So this wrapper does two things:
 *   (a) aborts a request that hangs past the budget;
 *   (b) after ANY network-level failure, answers the rest of the burst itself
 *       with a single non-retryable response, which ends the retry ladder.
 *
 * One page load now costs one failed attempt instead of the whole ladder, and
 * the caller either falls back (plans come from the mirror) or names the
 * problem in a sentence.
 *
 * No server-only imports here: middleware builds a client too, in the edge
 * runtime.
 */

export const SUPABASE_FETCH_TIMEOUT_MS = 2_500;

/**
 * The auth mailer gets a much longer budget, and this is not a detail:
 * GoTrue hands the message to SMTP before it answers, so cutting the request
 * off does NOT cancel the email. On the live project that produced the worst
 * kind of failure: the founder's inbox had the email while the screen said
 * "we could not finish that step". A long budget makes a completed send look
 * completed, and the caller treats a genuine cut-off as "maybe sent" instead of
 * "failed" (see sendCodeAction).
 */
export const SUPABASE_MAILER_TIMEOUT_MS = 20_000;

/** Paths where the request may already have had an effect when it is cut off. */
const MAILER_PATHS = ['/auth/v1/otp', '/auth/v1/verify', '/auth/v1/recover', '/auth/v1/invite'];

/** How long a proven-unreachable project is left alone before trying again. */
export const SUPABASE_COOLDOWN_MS = 10_000;

/** The answer given while the cooldown lasts: 500 is not in the retry list. */
const UNREACHABLE_BODY = JSON.stringify({
  code: 'DB_UNREACHABLE',
  message: 'Supabase did not answer, so the app stopped asking for a few seconds',
  hint: 'Check NEXT_PUBLIC_SUPABASE_URL on this service and that the Supabase project is running (free projects pause when idle).',
  details: '',
});

export function fetchWithTimeout(
  timeoutMs = SUPABASE_FETCH_TIMEOUT_MS,
  cooldownMs = SUPABASE_COOLDOWN_MS,
  mailerTimeoutMs = SUPABASE_MAILER_TIMEOUT_MS,
): typeof fetch {
  let downUntil = 0;

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (Date.now() < downUntil) {
      return new Response(UNREACHABLE_BODY, {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }

    const target = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const budget = MAILER_PATHS.some((path) => target.includes(path)) ? mailerTimeoutMs : timeoutMs;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, budget);
    // Keep the caller's own cancellation working as well (supabase-js passes a
    // signal of its own when a request is abandoned).
    const signal =
      init?.signal == null ? controller.signal : AbortSignal.any([init.signal, controller.signal]);

    try {
      const response = await fetch(input, { ...init, signal });
      // A 5xx from the API layer (503 while the schema cache loads, a 520 from
      // the edge) is retried by the client with backoff. One of those is
      // enough: the cooldown makes the NEXT attempt of the same burst fail
      // instantly and non-retryably, so a page load costs one round trip
      // instead of the whole ladder.
      if (response.status >= 500) downUntil = Date.now() + cooldownMs;
      return response;
    } catch (error) {
      // A hang we aborted, a refused connection, a DNS failure: all of them
      // prove the project is not answering right now.
      downUntil = Date.now() + cooldownMs;
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
}
