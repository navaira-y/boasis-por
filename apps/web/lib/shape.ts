/**
 * Narrowing helpers for values that come back from the database client or from
 * an HTTP response. Their declared types promise more than a live response can
 * guarantee, so every read goes through one of these: no optional chaining on
 * values that "cannot" be null, and no runtime surprises from a value that is.
 * Pure, so both server modules and client components may use them.
 */

export function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function asRows(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export function asNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
