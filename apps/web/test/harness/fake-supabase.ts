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
  | 'healthy'
  | 'service-key-rejected'
  | 'anon-key-rejected'
  | 'list-empty'
  | 'list-missing'
  | 'grants-missing'
  | 'activation-missing'
  | 'anon-can-read-private'
  | 'privilege-not-proven'
  | 'privilege-unknown'
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
  setSubscriptionStatus(status: string | null): void;
  setList(list: { id: string; email: string; status: string }[]): void;
  setHasProfile(value: boolean): void;
  setEvents(events: { at: string; kind: string; code: string | null; email: string | null }[]): void;
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

export const FAKE_TOKENS = { active: TOKEN_ACTIVE, unconfirmed: TOKEN_UNCONFIRMED };

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
  response.writeHead(status, { 'content-type': 'application/json' });
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
  let list = options.list ?? [
    { id: 'row-1', email: 'navaira.builds@gmail.com', status: 'invited' },
  ];
  let events = options.events ?? [];
  let hasProfile = options.hasProfile ?? false;
  const users: Record<string, FakeUser> = options.users ?? {
    [TOKEN_ACTIVE]: DEFAULT_USER_ACTIVE,
    [TOKEN_UNCONFIRMED]: DEFAULT_USER_UNCONFIRMED,
  };
  let lastSessionUser: FakeUser = DEFAULT_USER_ACTIVE;
  const requests: RecordedRequest[] = [];

  const server: Server = createServer((request, response) => {
    void handle(request, response);
  });

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
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
      send(response, 200, sessionPayload(DEFAULT_USER_ACTIVE));
      return;
    }

    if (path === '/auth/v1/token') {
      send(response, 200, sessionPayload(lastSessionUser));
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
        send(response, 403, { ...GRANT_REFUSED, message: 'permission denied for table entry_events' });
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
        { id: 'solo', name: 'Solo', max_companies: 1, price_fils: 3000, free_months: 12, currency: 'AED' },
        { id: 'trio', name: 'Trio', max_companies: 3, price_fils: 9000, free_months: 0, currency: 'AED' },
        { id: 'enterprise', name: 'Enterprise', max_companies: null, price_fils: null, free_months: 0, currency: 'AED' },
      ]);
      return;
    }

    if (path === '/rest/v1/subscriptions') {
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
      send(response, 200, [{ status: subscriptionStatus }]);
      return;
    }

    if (path === '/rest/v1/profiles') {
      send(response, 200, hasProfile ? [{ id: DEFAULT_USER_ACTIVE.id }] : []);
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
            message: "Could not find the function public.activate_free_year in the schema cache",
          });
          return;
        }
        send(response, 500, { code: 'P0002', details: null, hint: null, message: 'no session' });
        return;
      }
      send(response, 200, { source: 'free-year', period_end: new Date(Date.now() + 31_536_000_000).toISOString() });
      return;
    }

    send(response, 404, { message: `fake supabase has no route for ${request.method ?? 'GET'} ${path}` });
  }

  await new Promise<void>((resolve) => {
    server.listen(options.port ?? 0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('fake supabase did not bind a port');

  return {
    url: `http://127.0.0.1:${String(address.port)}`,
    requests,
    setMode(next: FakeMode): void {
      mode = next;
    },
    setSubscriptionStatus(next: string | null): void {
      subscriptionStatus = next;
    },
    setList(next: { id: string; email: string; status: string }[]): void {
      list = next;
    },
    setHasProfile(value: boolean): void {
      hasProfile = value;
    },
    setEvents(next: { at: string; kind: string; code: string | null; email: string | null }[]): void {
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
export const FAKE_SERVICE_KEY = fakeJwt({ ref: 'fakee2eproject', role: 'service_role', iss: 'supabase' });
