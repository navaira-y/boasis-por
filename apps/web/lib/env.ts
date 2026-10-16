import 'server-only';
import { cleanEnvValue } from './env-value';

/**
 * Every environment read in this app goes through here, so a missing or
 * malformed variable becomes a NAMED error instead of a generic failure deep
 * inside a request. Values are cleaned by cleanEnvValue (trimmed, unquoted),
 * which middleware shares.
 */

export { cleanEnvValue };

export class EnvMissingError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(`Missing environment: ${missing.join(', ')}`);
    this.name = 'EnvMissingError';
    this.missing = missing;
  }
}

/**
 * Runtime read, deliberately by computed name. Next inlines
 * `process.env.NEXT_PUBLIC_X` at build time; a computed lookup cannot be
 * inlined, so the value in the running container always wins over whatever was
 * present when the image was built.
 */
function runtimeEnv(name: string): string | undefined {
  return process.env[name];
}

export interface PublicEnv {
  url: string;
  anonKey: string;
}

/** Public Supabase settings. Both are safe to use on the server; the anon key
 * is never referenced from client code in this app. */
export function readPublicEnv(): PublicEnv {
  const url = cleanEnvValue(runtimeEnv('NEXT_PUBLIC_SUPABASE_URL'));
  const anonKey = cleanEnvValue(runtimeEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'));
  const missing: string[] = [];
  if (url === null) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (anonKey === null) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (url === null || anonKey === null) throw new EnvMissingError(missing);
  return { url, anonKey };
}

/** Server-only key. Returns null instead of throwing so callers can name the
 * failure themselves. NEVER reaches a browser bundle: this module is
 * server-only and the value is only read inside request handlers. */
export function readServiceKey(): string | null {
  return cleanEnvValue(runtimeEnv('SUPABASE_SERVICE_ROLE_KEY'));
}

/** Absolute origin of this app, used for links inside emails. */
export function appUrl(): string {
  return cleanEnvValue(runtimeEnv('NEXT_PUBLIC_APP_URL'))?.replace(/\/+$/, '') ?? 'http://localhost:3000';
}

export interface EnvPresence {
  url: boolean;
  anonKey: boolean;
  serviceKey: boolean;
  appUrl: boolean;
}

export function envPresence(): EnvPresence {
  return {
    url: cleanEnvValue(runtimeEnv('NEXT_PUBLIC_SUPABASE_URL')) !== null,
    anonKey: cleanEnvValue(runtimeEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')) !== null,
    serviceKey: cleanEnvValue(runtimeEnv('SUPABASE_SERVICE_ROLE_KEY')) !== null,
    appUrl: cleanEnvValue(runtimeEnv('NEXT_PUBLIC_APP_URL')) !== null,
  };
}
