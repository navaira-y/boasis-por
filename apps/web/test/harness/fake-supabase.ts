import type { AuthFactorRecord } from '@boasis/schema';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

/**
 * A stand-in Supabase for tests: enough of the REST and Auth shapes for the
 * entry flow, the gate and the health probe, and nothing more.
 *
 * It exists because the failures worth proving are the ones a happy-path stub
 * hides: a key that is not a service key, a missing table, a table that answers
 * the public key, a rejected key. Each of those is a mode here, and every
 * request is recorded, so a test can assert WHICH table was asked with WHICH
 * key instead of only what the app replied.
 */

export type FakeMode =
  | 'mfa-not-ready'
  | 'healthy'
  | 'service-key-rejected'
  | 'anon-key-rejected'
  | 'list-empty'
  | 'list-missing'
  | 'grants-missing'
  | 'activation-missing'
  | 'smtp-configured'
  | 'eight-digit-codes'
  | 'settings-refused'
  | 'settings-only-sender-fields'
  | 'anon-can-read-private'
  | 'privilege-not-proven'
  | 'privilege-unknown'
  | 'subscription-down'
  | 'creation-access-down'
  | 'db-down';

export interface FakeUser {
  id: string;
  email: string;
  confirmed: boolean;
}

export interface FakeOptions {
  anonKey: string;
  serviceKey: string;
  /** Access token -> user. The token is what the session cookie carries. */
  users?: Record<string, FakeUser>;
  subscriptionStatus?: string | null;
  hasProfile?: boolean;
  list?: { id: string; email: string; status: string }[];
  events?: { at: string; kind: string; code: string | null; email: string | null }[];
  mode?: FakeMode;
  /** Fixed port for tests that must point the app at it at BUILD time too. */
  port?: number;
}

export interface RecordedRequest {
  method: string;
  path: string;
  query: string;
  /** Which key the caller presented: 'anon', 'service' or 'none'/'other'. */
  keyRole: 'anon' | 'service' | 'none' | 'other';
}

export interface FakeSupabase {
  url: string;
  requests: RecordedRequest[];
  setMode(mode: FakeMode): void;
  setMfa(factors: AuthFactorRecord[]): void;
  setSubscriptionStatus(status: string | null): void;
  setSubscription(patch: Record<string, unknown>): void;
  setList(list: { id: string; email: string; status: string }[]): void;
  setHasProfile(value: boolean): void;
  setOwnedCompanyCount(value: number): void;
  setEvents(
    events: { at: string; kind: string; code: string | null; email: string | null }[],
  ): void;
  close(): Promise<void>;
}

/**
 * Supabase's real answer when the role has no GRANT on a table (this is the
 * message a real project returned, verbatim): 42501 with its own hint naming
 * the SQL to run. It is NOT a rejected key, and the app must not say it is.
 */
const GRANT_REFUSED = {
  code: '42501',
  details: null,
  hint: 'Grant the required privileges to the current role with: GRANT SELECT ON public.early_access_emails TO service_role;',
  message: 'permission denied for table early_access_emails',
};

const TOKEN_ACTIVE = 'e2e-access-active';
const TOKEN_UNCONFIRMED = 'e2e-access-unconfirmed';

const TOKEN_MFA = fakeJwt({
  sub: '11111111-1111-4111-8111-111111111111',
  aal: 'aal1',
  exp: 4070908800,
  amr: [{ method: 'password', timestamp: 1792231200 }],
});
const TOKEN_MFA_VERIFIED = fakeJwt({
  sub: '11111111-1111-4111-8111-111111111111',
  aal: 'aal2',
  exp: 4070908800,
  amr: [{ method: 'totp', timestamp: 1792231200 }],
});
export const FAKE_TOKENS = {
  active: TOKEN_ACTIVE,
  unconfirmed: TOKEN_UNCONFIRMED,
  mfa: TOKEN_MFA,
  mfaVerified: TOKEN_MFA_VERIFIED,
};
export const FAKE_FACTOR_ID = '33333333-3333-4333-8333-333333333333';

const DEFAULT_USER_ACTIVE: FakeUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'navaira.builds@gmail.com',
  confirmed: true,
};

const DEFAULT_USER_UNCONFIRMED: FakeUser = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'fresh.visitor@example.com',
  confirmed: false,
};

function send(response: ServerResponse, status: number, body: unknown): void {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers':
      'authorization, apikey, content-type, x-client-info, x-supabase-api-version, prefer',
    'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  });
  response.end(text);
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    request.on('data', (chunk: Buffer) => {
      data += chunk.toString('utf8');
      if (data.length > 1_000_000) request.destroy();
    });
    request.on('end', () => {
      resolve(data);
    });
    request.on('error', () => {
      resolve('');
    });
  });
}

function sessionPayload(user: FakeUser): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: user.confirmed ? TOKEN_ACTIVE : TOKEN_UNCONFIRMED,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: `e2e-refresh-${user.id}`,
    user: {
      id: user.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: user.email,
      email_confirmed_at: user.confirmed ? new Date(now * 1000).toISOString() : null,
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: new Date(now * 1000).toISOString(),
    },
  };
}

export async function startFakeSupabase(options: FakeOptions): Promise<FakeSupabase> {
  let mode: FakeMode = options.mode ?? 'healthy';
  let subscriptionStatus: string | null = options.subscriptionStatus ?? 'active';
  let subscriptionFields: Record<string, unknown> = {
    plan_id: 'solo',
    provider: 'free',
    current_period_start: '2026-10-17T09:00:00Z',
    current_period_end: '2027-10-17T09:00:00Z',
    free_year_used_at: '2026-10-17T09:00:00Z',
  };
  let list = options.list ?? [
    { id: 'row-1', email: 'navaira.builds@gmail.com', status: 'invited' },
  ];
  let events = options.events ?? [];
  let hasProfile = options.hasProfile ?? false;
  let ownedCompanyCount = 0;
  let mfaFactors: AuthFactorRecord[] = [];
  const users: Record<string, FakeUser> = options.users ?? {
    [TOKEN_ACTIVE]: DEFAULT_USER_ACTIVE,
    [TOKEN_MFA]: DEFAULT_USER_ACTIVE,
    [TOKEN_MFA_VERIFIED]: DEFAULT_USER_ACTIVE,
    [TOKEN_UNCONFIRMED]: DEFAULT_USER_UNCONFIRMED,
  };
  let lastSessionUser: FakeUser = DEFAULT_USER_ACTIVE;
  const requests: RecordedRequest[] = [];

  const server: Server = createServer((request, response) => {
    void handle(request, response);
  });

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method === 'OPTIONS') {
      send(response, 204, '');
      return;
    }
    const raw = request.url ?? '/';
    const parsed = new URL(raw, 'http://127.0.0.1');
    const path = parsed.pathname;
    const apikey = request.headers.apikey;
    const key = typeof apikey === 'string' ? apikey : '';
    const keyRole: RecordedRequest['keyRole'] =
      key === options.serviceKey
        ? 'service'
        : key === options.anonKey
          ? 'anon'
          : key === ''
            ? 'none'
            : 'other';
    requests.push({ method: request.method ?? 'GET', path, query: parsed.search, keyRole });

    if (mode === 'db-down') {
      send(response, 503, { message: 'Service Unavailable' });
      return;
    }
    if (mode === 'service-key-rejected' && key === options.serviceKey) {
      send(response, 401, { message: 'Invalid API key', hint: 'double check your Supabase URL' });
      return;
    }
    if (mode === 'anon-key-rejected' && key === options.anonKey && keyRole === 'anon') {
      send(response, 401, { message: 'Invalid API key' });
      return;
    }

    // ---- Auth -----------------------------------------------------------
    if (path === '/auth/v1/health') {
      send(response, 200, { name: 'goTrue', version: 'fake' });
      return;
    }

    if (path === '/auth/v1/verify' && request.method === 'POST') {
      const body = await readBody(request);
      if (body.includes('e2e-expired')) {
        send(response, 403, {
          code: 403,
          error_code: 'otp_expired',
          message: 'Email link is invalid or has expired',
        });
        return;
      }
      if (body.includes('e2e-unconfirmed')) {
        lastSessionUser = DEFAULT_USER_UNCONFIRMED;
        send(response, 200, sessionPayload(DEFAULT_USER_UNCONFIRMED));
        return;
      }
      lastSessionUser = DEFAULT_USER_ACTIVE;
      send(response, 200, {
        ...sessionPayload(DEFAULT_USER_ACTIVE),
        ...(mfaFactors.length > 0 ? { access_token: TOKEN_MFA } : {}),
      });
      return;
    }

    if (path === '/auth/v1/settings') {
      // The shapes this endpoint has taken in the wild, so the app is tested
      // against each one instead of against a hope:
      //
      //   healthy        answers, reports no length (the screen grows its row)
      //   smtp-configured names a sender and a length of six
      //   eight-digit-codes reports eight, as the live project sends
      //   settings-only-sender-fields names a sender but no length
      //   settings-refused   refuses, the way it did on the live project
      if (mode === 'settings-refused') {
        send(response, 401, { message: 'Invalid API key' });
        return;
      }
      const smtp = mode === 'smtp-configured' || mode === 'settings-only-sender-fields';
      const eightDigits = mode === 'eight-digit-codes';
      send(response, 200, {
        external: { email: true },
        mailer_autoconfirm: false,
        mailer_otp_length: eightDigits
          ? 8
          : smtp && mode !== 'settings-only-sender-fields'
            ? 6
            : null,
        smtp_admin_email: smtp ? 'support@boasis.ae' : '',
        smtp_host: smtp ? 'smtp.gmail.com' : '',
      });
      return;
    }

    if (path === '/auth/v1/token') {
      send(response, 200, {
        ...sessionPayload(lastSessionUser),
        ...(mfaFactors.length > 0 ? { access_token: TOKEN_MFA } : {}),
      });
      return;
    }

    if (path === '/auth/v1/user') {
      const header = request.headers.authorization ?? '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : '';
      const user = users[token];
      if (user === undefined) {
        send(response, 401, { message: 'invalid claim: missing sub claim' });
        return;
      }
      send(response, 200, {
        id: user.id,
        aud: 'authenticated',
        role: 'authenticated',
        email: user.email,
        email_confirmed_at: user.confirmed ? new Date().toISOString() : null,
        factors: mfaFactors,
      });
      return;
    }

    if (path === '/auth/v1/logout') {
      send(response, 204, '');
      return;
    }

    if (path === '/auth/v1/otp' && request.method === 'POST') {
      // Signup step 1 and step 3 (send the inbox code).
      send(response, 200, {});
      return;
    }

    // Provider-shape fixtures only, not proof of the real Auth service.
    if (path === '/rest/v1/rpc/mfa_guard_ready') {
      send(response, 200, mode !== 'mfa-not-ready');
      return;
    }
    if (path === '/auth/v1/factors' && request.method === 'POST') {
      const body = JSON.parse(await readBody(request)) as { friendly_name: string };
      const factorId = mfaFactors.some((factor) => factor.id === FAKE_FACTOR_ID)
        ? '55555555-5555-4555-8555-555555555555'
        : FAKE_FACTOR_ID;
      mfaFactors.push({
        id: factorId,
        factor_type: 'totp',
        status: 'unverified',
        friendly_name: body.friendly_name,
      });
      send(response, 200, {
        id: factorId,
        type: 'totp',
        totp: {
          qr_code: '<svg xmlns="http://www.w3.org/2000/svg"/>',
          secret: 'JBSWY3DPEHPK3PXP',
          uri: 'otpauth://totp/Boasis:test?secret=JBSWY3DPEHPK3PXP&issuer=Boasis',
        },
      });
      return;
    }
    if (path.startsWith('/auth/v1/factors/')) {
      const id = path.split('/')[4];
      const factor = mfaFactors.find((entry) => entry.id === id);
      if (factor === undefined) {
        send(response, 404, { msg: 'Factor not found' });
        return;
      }
      if (request.method === 'DELETE') {
        mfaFactors = mfaFactors.filter((entry) => entry.id !== id);
        send(response, 200, { id });
        return;
      }
      if (path.endsWith('/challenge')) {
        send(response, 200, {
          id: '44444444-4444-4444-8444-444444444444',
          type: 'totp',
          expires_at: 4070908800,
        });
        return;
      }
      if (path.endsWith('/verify')) {
        const body = JSON.parse(await readBody(request)) as { code: string };
        if (body.code !== '123456') {
          send(response, 422, { msg: 'Invalid TOTP code', code: 'mfa_verification_failed' });
          return;
        }
        factor.status = 'verified';
        send(response, 200, {
          ...sessionPayload(DEFAULT_USER_ACTIVE),
          access_token: TOKEN_MFA_VERIFIED,
        });
        return;
      }
    }

    // ---- REST -----------------------------------------------------------
    if (path === '/rest/v1/') {
      // Newer Supabase projects refuse this root endpoint even to a perfect
      // service key, which is how a healthy project was reported as broken.
      // The app must not depend on it; the fake models that refusal.
      send(response, 403, {
        code: '42501',
        hint: 'Only the service_role API key can be used for this endpoint.',
        message: 'The OpenAPI schema is not available on this project.',
      });
      return;
    }

    if (path === '/rest/v1/early_access_emails') {
      if (request.method === 'POST' || request.method === 'PATCH') {
        if (keyRole !== 'service') {
          send(response, 401, { message: 'permission denied for table early_access_emails' });
          return;
        }
        send(response, 201, '');
        return;
      }
      if (keyRole !== 'service' && mode !== 'anon-can-read-private') {
        // This is the leak check: the public key must be refused.
        send(response, 401, { message: 'permission denied for table early_access_emails' });
        return;
      }
      if (mode === 'grants-missing') {
        if (keyRole !== 'service') {
          send(response, 401, { message: 'permission denied for table early_access_emails' });
          return;
        }
        send(response, 403, GRANT_REFUSED);
        return;
      }
      if (mode === 'privilege-not-proven' || mode === 'privilege-unknown') {
        // A key that looks privileged but gets an empty answer: exactly the
        // silent empty read, and it must never be believed.
        send(response, 200, []);
        return;
      }
      if (mode === 'list-missing') {
        send(response, 404, {
          code: 'PGRST205',
          message: "Could not find the table 'public.early_access_emails' in the schema cache",
        });
        return;
      }
      const rows = mode === 'list-empty' ? [] : list;
      const normalized = parsed.searchParams.get('email_norm');
      const exact = parsed.searchParams.get('email');
      const wanted = normalized?.startsWith('eq.') === true ? normalized.slice(3) : null;
      const wantedExact = exact?.startsWith('eq.') === true ? exact.slice(3) : null;
      const filtered = rows.filter((row) => {
        if (wanted !== null && row.email.trim().toLowerCase() !== wanted) return false;
        if (wantedExact !== null && row.email !== wantedExact) return false;
        return true;
      });
      send(response, 200, filtered);
      return;
    }

    if (path === '/rest/v1/entry_events') {
      if (keyRole !== 'service' && mode !== 'anon-can-read-private') {
        send(response, 401, { message: 'permission denied for table entry_events' });
        return;
      }
      if (request.method === 'POST') {
        send(response, 201, '');
        return;
      }
      // entry_events is the app's privilege witness: it is private by design,
      // so a 200 here proves the caller is a granted service key.
      if (mode === 'privilege-not-proven') {
        send(response, 403, {
          ...GRANT_REFUSED,
          message: 'permission denied for table entry_events',
        });
        return;
      }
      if (mode === 'privilege-unknown') {
        send(response, 404, {
          code: 'PGRST205',
          message: "Could not find the table 'public.entry_events' in the schema cache",
        });
        return;
      }
      send(response, 200, events);
      return;
    }

    if (path === '/rest/v1/audit_log' || path === '/rest/v1/webhook_events') {
      if (keyRole !== 'service' && mode !== 'anon-can-read-private') {
        send(response, 401, { message: `permission denied for table ${path.slice(9)}` });
        return;
      }
      send(response, 200, []);
      return;
    }

    if (path === '/rest/v1/plans') {
      if (mode === 'grants-missing' && keyRole !== 'service') {
        // A public-key grant problem: every visitor's page loses its plan list.
        send(response, 403, { ...GRANT_REFUSED, message: 'permission denied for table plans' });
        return;
      }
      send(response, 200, [
        {
          id: 'solo',
          name: 'Solo',
          max_companies: 1,
          price_fils: 3000,
          free_months: 12,
          currency: 'AED',
        },
        {
          id: 'trio',
          name: 'Trio',
          max_companies: 3,
          price_fils: 9000,
          free_months: 0,
          currency: 'AED',
        },
        {
          id: 'enterprise',
          name: 'Enterprise',
          max_companies: null,
          price_fils: null,
          free_months: 0,
          currency: 'AED',
        },
      ]);
      return;
    }

    if (path === '/rest/v1/subscriptions') {
      if (mode === 'subscription-down') {
        send(response, 503, { message: 'Subscription read unavailable' });
        return;
      }
      const filter = parsed.searchParams.get('profile_id');
      const wanted = filter?.startsWith('eq.') === true ? filter.slice(3) : null;
      if (wanted !== null && wanted !== DEFAULT_USER_ACTIVE.id) {
        send(response, 200, []);
        return;
      }
      if (subscriptionStatus === null) {
        send(response, 200, []);
        return;
      }
      send(response, 200, [{ ...subscriptionFields, status: subscriptionStatus }]);
      return;
    }

    if (path === '/rest/v1/profiles') {
      send(
        response,
        200,
        hasProfile
          ? [
              {
                id: DEFAULT_USER_ACTIVE.id,
                full_name: 'Test Owner',
                terms_version: 'test',
                terms_accepted_at: '2026-10-17T00:00:00Z',
                created_at: '2026-10-17T00:00:00Z',
                email_reminders_on: true,
              },
            ]
          : [],
      );
      return;
    }

    // A fresh account has no company data. Browser proof uses the real adapter,
    // not the mock adapter or seeded companies.
    if (
      [
        '/rest/v1/companies',
        '/rest/v1/portal_account_companies',
        '/rest/v1/portal_onboarding_starts',
        '/rest/v1/portal_access_grants',
        '/rest/v1/portal_account_people',
      ].includes(path)
    ) {
      send(response, 200, []);
      return;
    }

    if (path === '/rest/v1/rpc/company_creation_access') {
      if (mode === 'creation-access-down') {
        send(response, 503, { message: 'Company allowance is unavailable.' });
        return;
      }
      const active = subscriptionStatus === 'active';
      send(response, 200, {
        canCreate: active && ownedCompanyCount === 0,
        reason: !active
          ? 'subscription-inactive'
          : ownedCompanyCount > 0
            ? 'payment-coming-soon'
            : 'allowed',
        ownedCompanies: ownedCompanyCount,
        companyLimit: 1,
      });
      return;
    }

    if (path.startsWith('/rest/v1/rpc/')) {
      // activate_free_year is called with the service key and no session, so
      // auth.uid() is null and the real function raises P0002 "no session".
      // Modelling that faithfully is the point: a healthy project answers 500
      // here, and the report must still be green.
      if (path === '/rest/v1/rpc/activate_free_year') {
        if (mode === 'activation-missing') {
          send(response, 404, {
            code: 'PGRST202',
            message: 'Could not find the function public.activate_free_year in the schema cache',
          });
          return;
        }
        send(response, 500, { code: 'P0002', details: null, hint: null, message: 'no session' });
        return;
      }
      send(response, 200, {
        source: 'free-year',
        period_end: new Date(Date.now() + 31_536_000_000).toISOString(),
      });
      return;
    }

    send(response, 404, {
      message: `fake supabase has no route for ${request.method ?? 'GET'} ${path}`,
    });
  }

  await new Promise<void>((resolve) => {
    server.listen(options.port ?? 0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('fake supabase did not bind a port');

  return {
    url: `http://127.0.0.1:${String(address.port)}`,
    requests,
    setMfa(factors: AuthFactorRecord[]): void {
      mfaFactors = factors.map((factor) => ({ ...factor }));
    },
    setMode(next: FakeMode): void {
      mode = next;
    },
    setSubscription(patch: Record<string, unknown>): void {
      subscriptionFields = { ...subscriptionFields, ...patch };
    },
    setSubscriptionStatus(next: string | null): void {
      subscriptionStatus = next;
    },
    setList(next: { id: string; email: string; status: string }[]): void {
      list = next;
    },
    setOwnedCompanyCount(value: number): void {
      ownedCompanyCount = value;
    },
    setHasProfile(value: boolean): void {
      hasProfile = value;
    },
    setEvents(
      next: { at: string; kind: string; code: string | null; email: string | null }[],
    ): void {
      events = next;
    },
    close(): Promise<void> {
      return new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}

/** A syntactically valid JWT carrying the claims the app inspects. */
export function fakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature-not-a-real-signature`;
}

export const FAKE_ANON_KEY = fakeJwt({ ref: 'fakee2eproject', role: 'anon', iss: 'supabase' });
export const FAKE_SERVICE_KEY = fakeJwt({
  ref: 'fakee2eproject',
  role: 'service_role',
  iss: 'supabase',
});
