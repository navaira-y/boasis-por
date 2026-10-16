import { FAKE_ANON_KEY, FAKE_SERVICE_KEY, startFakeSupabase } from './fake-supabase.ts';

/**
 * Runs the fake Supabase on its own, for looking at the entry flow in a browser
 * without touching the real project:
 *
 *   node --experimental-strip-types test/harness/serve-fake.ts
 *
 * Then, in another shell, in apps/web:
 *
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:5199 \
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=<printed below> \
 *   SUPABASE_SERVICE_ROLE_KEY=<printed below> \
 *   NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000 \
 *   ../../node_modules/.bin/next dev -p 3000
 *
 * The listed address in the fake list is navaira.builds@gmail.com, so the
 * waitlist door can be seen end to end, and any other address takes the plans
 * door.
 */
const fake = await startFakeSupabase({
  anonKey: FAKE_ANON_KEY,
  serviceKey: FAKE_SERVICE_KEY,
  port: Number(process.env.FAKE_PORT ?? 5199),
});

console.log(`fake Supabase listening on ${fake.url}`);
console.log(`NEXT_PUBLIC_SUPABASE_ANON_KEY=${FAKE_ANON_KEY}`);
console.log(`SUPABASE_SERVICE_ROLE_KEY=${FAKE_SERVICE_KEY}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void fake.close().then(() => process.exit(0));
  });
}
