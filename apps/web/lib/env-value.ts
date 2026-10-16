/**
 * Environment value hygiene, kept free of server-only imports so middleware
 * (edge runtime) can use the same rules as the app.
 *
 * A trailing newline or a pair of quotes pasted into a host dashboard is a
 * real cause of "the value is right but every request fails", so both are
 * removed here instead of being discovered in production.
 */
export function cleanEnvValue(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  let value = raw.trim();
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      value = value.slice(1, -1).trim();
    }
  }
  return value.length > 0 ? value : null;
}
