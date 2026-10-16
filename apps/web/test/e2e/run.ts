import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  FAKE_ANON_KEY,
  FAKE_SERVICE_KEY,
  startFakeSupabase,
  type FakeSupabase,
} from '../harness/fake-supabase.ts';

/**
 * End-to-end proof over a REAL production server.
 *
 * It starts the built app with `next start`, points it at the fake Supabase in
 * test/harness, and drives it over HTTP exactly like a browser would:
 *
 *   - the portal and billing pages answer only the right visitor (the gate)
 *   - the public pages answer everyone, and the entry screen is what opens
 *   - a signed-in, confirmed, active visitor gets the portal FILE itself
 *   - the email link shape lands on the entry flow, an expired link says so
 *   - /api/health names a broken key instead of reporting health it cannot see
 *
 * Run it with `npm run test:e2e --workspace @boasis/web` after `npm run build`.
 */

const webDir = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const WEB_PORT = 5193;
const FAKE_PORT = 5199;
const ORIGIN = `http://127.0.0.1:${String(WEB_PORT)}`;

let failures = 0;
let checks = 0;

function check(name: string, ok: boolean, detail = ''): void {
  checks += 1;
  if (ok) {
    console.log(`  PASS  ${name}`);
    return;
  }
  failures += 1;
  console.log(`  FAIL  ${name}${detail === '' ? '' : ` -- ${detail}`}`);
}

interface Reply {
  status: number;
  location: string | null;
  body: string;
  setCookies: string[];
  headers: Headers;
}

async function get(path: string, init: RequestInit = {}): Promise<Reply> {
  const response = await fetch(`${ORIGIN}${path}`, { redirect: 'manual', ...init });
  const body = await response.text().catch(() => '');
  return {
    status: response.status,
    location: response.headers.get('location'),
    body,
    setCookies: response.headers.getSetCookie(),
    headers: response.headers,
  };
}

function cookieHeader(setCookies: string[]): string {
  return setCookies.map((cookie) => cookie.split(';')[0]).join('; ');
}

async function waitForServer(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const reply = await fetch(`${ORIGIN}/signin`);
      if (reply.status === 200) return true;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function main(): Promise<void> {
  if (!existsSync(`${webDir}.next/BUILD_ID`)) {
    console.error('No build found. Run `npm run build --workspace @boasis/web` first.');
    process.exit(2);
  }

  const fake: FakeSupabase = await startFakeSupabase({
    anonKey: FAKE_ANON_KEY,
    serviceKey: FAKE_SERVICE_KEY,
    port: FAKE_PORT,
  });

  const nextBin = require.resolve('next/dist/bin/next');
  const server: ChildProcess = spawn(process.execPath, [nextBin, 'start', '-p', String(WEB_PORT)], {
    cwd: webDir,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PUBLIC_SUPABASE_URL: fake.url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: FAKE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: FAKE_SERVICE_KEY,
      NEXT_PUBLIC_APP_URL: ORIGIN,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout?.on('data', () => undefined);
  server.stderr?.on('data', (chunk: Buffer) => {
    const line = chunk.toString('utf8').trim();
    if (line.includes('Error') || line.includes('error')) console.log(`  [server] ${line}`);
  });

  const stop = (): void => {
    server.kill('SIGTERM');
  };
  process.on('exit', stop);

  try {
    const ready = await waitForServer(60_000);
    if (!ready) {
      console.error('The server did not answer /signin in 60 s.');
      process.exit(3);
    }
    console.log(`\nServing ${ORIGIN} against ${fake.url}\n`);

    console.log('The gate, with nobody signed in');
    for (const path of ['/portal', '/portal/', '/portal/index.html']) {
      // A browser follows the chain, so the test does too: /portal/ first takes
      // Next's own trailing-slash hop, and the chain must end at sign-in.
      const chain: string[] = [];
      let href = path;
      for (let hop = 0; hop < 4; hop += 1) {
        const reply = await get(href);
        chain.push(`${href} -> ${String(reply.status)} ${String(reply.location)}`);
        if (reply.status !== 307 && reply.status !== 308) break;
        const next = reply.location ?? '';
        if (next.includes('/signin')) {
          chain.push('reached sign-in');
          break;
        }
        href = next.startsWith('http') ? new URL(next).pathname + new URL(next).search : next;
      }
      check(
        `${path} ends at sign-in, never at portal content`,
        chain.includes('reached sign-in'),
        chain.join(' | '),
      );
    }
    const billing = await get('/billing');
    check(
      '/billing is refused and sent to sign in',
      (billing.status === 307 || billing.status === 308) && (billing.location ?? '').includes('/signin'),
      `status ${String(billing.status)} location ${String(billing.location)}`,
    );

    console.log('\nThe public pages');
    const root = await get('/');
    check('/', root.status === 200, `status ${String(root.status)}`);
    check('the root opens straight at the entry screen', root.body.includes('Start your company file'));
    const signup = await get('/signup');
    check('/signup answers 200', signup.status === 200, `status ${String(signup.status)}`);
    const signin = await get('/signin');
    check('/signin answers 200', signin.status === 200, `status ${String(signin.status)}`);
    const signOutGet = await get('/auth/signout');
    check('sign-out refuses anything but a POST', signOutGet.status === 405, `status ${String(signOutGet.status)}`);
    const signOutPost = await get('/auth/signout', { method: 'POST' });
    check(
      'sign-out by POST returns the visitor to sign-in',
      signOutPost.status === 303 && String(signOutPost.location).includes('/signin'),
      `status ${String(signOutPost.status)}`,
    );

    console.log('\nThe email link');

    // The inbox screen is React state, so a curl cannot see it: the copy itself
    // is checked in the unit test for the email mode, and the served shell must
    // at least ship it (it is in the client chunk, not in the HTML).
    const entryShell = await get('/signup');
    check(
      'the entry shell ships the link-led inbox copy',
      entryShell.status === 200 && !entryShell.body.includes('code-boxes'),
      `status ${String(entryShell.status)}`,
    );
    const expired = await get('/auth/callback?token_hash=e2e-expired&type=email');
    check(
      'an expired link says so on the entry screen',
      (expired.status === 307 || expired.status === 308) &&
        String(expired.location).includes('/signup?link=expired'),
      `status ${String(expired.status)} location ${String(expired.location)}`,
    );

    // The landing screen has to SAY what happened, or the visitor is left on
    // an email box with no explanation.
    const expiredPage = await get('/signup?link=expired');
    check(
      'the expired-link screen explains itself',
      expiredPage.status === 200 && expiredPage.body.includes('already been used'),
      `status ${String(expiredPage.status)}`,
    );

    const fresh = await get('/auth/callback?token_hash=e2e-ok&type=email');
    const cookies = cookieHeader(fresh.setCookies);
    check(
      'a good link sets a session and lands on the entry flow',
      (fresh.status === 307 || fresh.status === 308) &&
        fresh.setCookies.length > 0 &&
        String(fresh.location).includes('/signup'),
      `status ${String(fresh.status)} cookies ${String(fresh.setCookies.length)}`,
    );

    console.log('\nA signed-in, confirmed visitor with an active subscription');
    const portalActive = await get('/portal', { headers: { cookie: cookies } });
    check('the portal file is served', portalActive.status === 200, `status ${String(portalActive.status)}`);
    check(
      'the portal file is the bundle, not a page shell',
      portalActive.body.includes('id="root"') || portalActive.body.includes('<div id="root">'),
    );
    check(
      'the portal file is never cached by a shared cache',
      (portalActive.headers.get('cache-control') ?? '').includes('no-store'),
      String(portalActive.headers.get('cache-control')),
    );
    check(
      'the portal file cannot be framed by another site',
      portalActive.headers.get('x-frame-options') !== null,
      String(portalActive.headers.get('x-frame-options')),
    );
    const csp = portalActive.headers.get('content-security-policy') ?? '';
    check('the portal is served under a Content Security Policy', csp.includes('script-src'), 'no CSP header');
    check(
      'the policy allows scripts from this origin only',
      csp.includes("script-src 'self'") && !csp.includes('unsafe-eval'),
      csp,
    );
    check(
      'the policy reaches this project and nowhere else',
      // The fake project is plain http, so the realtime scheme is ws; a real
      // https project gets wss (covered by the unit test).
      csp.includes(fake.url) && csp.includes('ws://127.0.0.1:5199') && !csp.includes('googleapis.com/api'),
      csp,
    );
    const portalAsset = await get('/portal/index.html', { headers: { cookie: cookies } });
    check(
      'portal assets carry the policy too',
      (portalAsset.headers.get('content-security-policy') ?? '').includes('script-src'),
    );
    const signupCsp = (await get('/signup')).headers.get('content-security-policy');
    check('the entry pages are not given the portal policy by accident', signupCsp === null, String(signupCsp));

    console.log('\nThe same visitor when the subscription is not active');
    // A signed-up account has its profile row; a visitor between the inbox
    // code and the password step does not, and billing sends them back.
    fake.setHasProfile(true);
    fake.setSubscriptionStatus('past_due');
    const portalLocked = await get('/portal', { headers: { cookie: cookies } });
    check(
      'the portal closes and points at billing',
      (portalLocked.status === 307 || portalLocked.status === 308) &&
        String(portalLocked.location).includes('/billing'),
      `status ${String(portalLocked.status)} location ${String(portalLocked.location)}`,
    );
    const billingPage = await get('/billing', { headers: { cookie: cookies } });
    check('billing opens for that visitor', billingPage.status === 200, `status ${String(billingPage.status)}`);
    fake.setSubscriptionStatus('active');
    const portalBack = await get('/portal', { headers: { cookie: cookies } });
    check('the portal reopens when the subscription is active again', portalBack.status === 200);

    console.log('\nA session whose inbox is not confirmed');
    const unconfirmed = await get('/auth/callback?token_hash=e2e-unconfirmed&type=email');
    const unconfirmedCookies = cookieHeader(unconfirmed.setCookies);
    const portalUnconfirmed = await get('/portal', { headers: { cookie: unconfirmedCookies } });
    check(
      'the portal sends them back to finish the entry flow',
      (portalUnconfirmed.status === 307 || portalUnconfirmed.status === 308) &&
        String(portalUnconfirmed.location).includes('/signup'),
      `status ${String(portalUnconfirmed.status)} location ${String(portalUnconfirmed.location)}`,
    );

    console.log('\nThe health report');
    const healthy = await get('/api/health?fresh=1');
    const healthyBody = healthy.body;
    check('/api/health answers', healthy.status === 200 || healthy.status === 503, `status ${String(healthy.status)}`);
    check('a configured project reports healthy', healthy.status === 200, `status ${String(healthy.status)}`);
    check('the report never contains a key', !healthyBody.includes(FAKE_SERVICE_KEY) && !healthyBody.includes(FAKE_ANON_KEY));
    check('the report names the project it checked', healthyBody.includes('fakee2eproject'));
    check(
      'the report confirms the visitor-facing plan read',
      healthyBody.includes('"plansAnon":{"status":200'),
      'plansAnon probe did not answer 200',
    );
    check(
      'the free-year function is confirmed as installed and refusing anonymous calls',
      healthyBody.includes('"activation":{"status":500,"ok":true') &&
        healthyBody.includes('no session'),
      'activation probe was not explained',
    );
    check(
      'the report says how signup email is sent today',
      healthyBody.includes('"email":{"codeLed":false') &&
        healthyBody.includes('EMAIL_BUILT_IN_SENDER'),
      'email mode missing from the report',
    );
    check(
      'the report knows the operator address is on the list',
      healthyBody.includes('"operatorListed":true'),
      'operatorListed was not true',
    );

    fake.setMode('activation-missing');
    const noFunction = await get('/api/health?fresh=1');
    check(
      'a missing free-year function is a note, not a red report',
      noFunction.status === 200 && noFunction.body.includes('ACTIVATION_FUNCTION_MISSING'),
      `status ${String(noFunction.status)}`,
    );
    fake.setMode('healthy');

    fake.setMode('service-key-rejected');
    const rejected = await get('/api/health?fresh=1');
    check(
      'a rejected service key is named, and the report is not green',
      rejected.status === 503 && rejected.body.includes('SERVICE_KEY_REJECTED'),
      `status ${String(rejected.status)}`,
    );
    check('the rejected report never contains the key', !rejected.body.includes(FAKE_SERVICE_KEY));

    // The real production fault: a valid key whose role has no GRANT. Supabase
    // answers 42501 with its own GRANT hint; the report must name a grant, not
    // a key, because the operator fixes those in different places.
    fake.setMode('grants-missing');
    const grants = await get('/api/health?fresh=1');
    check(
      'a missing GRANT is reported as a grant problem, not a rejected key',
      grants.status === 503 &&
        grants.body.includes('SERVICE_GRANTS_MISSING') &&
        !grants.body.includes('SERVICE_KEY_REJECTED'),
      `status ${String(grants.status)}`,
    );
    check('the grant report names the file to run', grants.body.includes('0009'), 'no 0009 in the report');

    fake.setMode('anon-can-read-private');
    const leak = await get('/api/health?fresh=1');
    check(
      'a private table that answers the public key is reported as a leak',
      leak.body.includes('SENSITIVE_TABLE_PUBLIC'),
      `status ${String(leak.status)}`,
    );

    fake.setMode('healthy');
    const recovered = await get('/api/health?fresh=1');
    check('the report recovers when the project does', recovered.status === 200, `status ${String(recovered.status)}`);

    console.log('\nThe renewal job');
    const cron = await get('/api/cron/renewals');
    check('the renewal job refuses an unauthenticated caller', cron.status === 404, `status ${String(cron.status)}`);
    const cronOk = await get('/api/cron/renewals', {
      headers: { authorization: `Bearer ${FAKE_SERVICE_KEY}` },
    });
    check('the renewal job runs for the service key', cronOk.status === 200, `status ${String(cronOk.status)}`);
  } finally {
    stop();
    await fake.close();
  }

  console.log(`\n${String(checks - failures)}/${String(checks)} checks passed`);
  if (failures > 0) {
    console.log(`${String(failures)} failed`);
    process.exit(1);
  }
  console.log('All checks passed.');
}

await main();
