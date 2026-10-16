#!/usr/bin/env node
/**
 * Put the team's built portal where the web app serves it, and make its asset
 * paths survive the URL it is served at.
 *
 * Why the second half is needed: the portal is built with Vite's relative base
 * (`base: './'`), so its index.html asks for `./assets/index-hash.js`. That resolves
 * against the DOCUMENT url. Served at `/portal/` it means `/portal/assets/...`, but
 * served at `/portal` (no trailing slash) it means `/assets/...`, which does not
 * exist: the HTML loads, every script and stylesheet 404s, and the founder sees a
 * completely blank white page with nothing to explain it. That is exactly what
 * happened in production.
 *
 * The fix is one `<base href="/portal/">` in the SERVED copy (their build stays
 * untouched): it pins every relative reference - scripts, styles, the icon, the
 * service worker, the manifest - under /portal/ whatever the document url is.
 *
 *   node --experimental-strip-types apps/web/scripts/prepare-portal.ts
 *
 * Defaults: apps/portal/dist -> apps/web/public/portal. The Dockerfile calls this
 * same script, so the image and a local run cannot drift apart.
 */
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

const source = resolve(repoRoot, 'apps/portal/dist');
const dest = resolve(repoRoot, 'apps/web/public/portal');

/** Where the web app serves the portal. One place, so a change is deliberate. */
const SERVE_AT = '/portal/';

async function main(): Promise<void> {
  await stat(join(source, 'index.html')).catch(() => {
    throw new Error(`no index.html in ${source}: build the portal first (npm run build --workspace @boasis/portal)`);
  });

  // A clean copy: a nested dist from an earlier layout must not linger and 404
  // in place of the real assets.
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });
  await cp(source, dest, { recursive: true });

  const indexPath = join(dest, 'index.html');
  const html = await readFile(indexPath, 'utf8');
  const withBase = html.replace('<head>', `<head>\n    <base href="${SERVE_AT}">`);
  if (html.includes('<base ') || withBase === html) {
    throw new Error('Expected a <head> with no existing <base>: the portal build changed shape');
  }
  await writeFile(indexPath, withBase);

  // Prove it: every relative reference in the page must exist in the copy, under
  // the path the browser will actually request.
  const refs = [...withBase.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)].map((match) => match[1] ?? '');
  const missing: string[] = [];
  for (const ref of refs) {
    const onDisk = join(dest, ref.replace(/^\.\//, ''));
    const exists = await stat(onDisk).then(
      () => true,
      () => false,
    );
    if (!exists) missing.push(`${ref} (the browser would ask for ${SERVE_AT}${ref.replace(/^\.\//, '')})`);
    else process.stdout.write(`  ok  ${SERVE_AT}${ref.replace(/^\.\//, '')}\n`);
  }
  if (missing.length > 0) {
    throw new Error(`the portal page points at files that are not there:\n    ${missing.join('\n    ')}`);
  }

  process.stdout.write(
    `portal prepared: ${dest} served at ${SERVE_AT} with ${String(refs.length)} relative references pinned\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
