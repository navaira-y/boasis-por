import type { ZodType, ZodTypeDef } from 'zod';
import { supabase } from './client';

// Shared helpers for the Supabase data layer. (repos.ts predates this module
// and keeps its own copies; new slices import from here.)

export function newId(): string {
  return crypto.randomUUID();
}

export function noRecord(label: string, id: string): never {
  throw new Error(`${label}: no record with id ${id}`);
}

export interface PostgrestError {
  readonly message: string;
  readonly code: string;
}

export function rethrow(error: PostgrestError | null | undefined): void {
  if (error !== null && error !== undefined) {
    throw new Error(error.message);
  }
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

export function parseOrWarn<T>(
  schema: ZodType<T, ZodTypeDef, unknown>,
  label: string,
  id: string,
  raw: unknown,
): T | null {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    console.warn(`${label}: skipping row ${id}; it does not match the schema.`);
    return null;
  }
  return parsed.data;
}

export function docOf(row: { data: unknown }, id: string): Record<string, unknown> {
  return { ...asObject(row.data), id };
}

// The company must be visible to the caller (RLS hides the rest), so one
// message covers missing and not-mine without revealing which.
export async function requireOwnCompany(companyId: string): Promise<void> {
  const { data, error } = await supabase()
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .maybeSingle();
  rethrow(error as PostgrestError | null);
  if (data === null || data === undefined) {
    throw new Error(`companies: no record with id ${companyId}`);
  }
}
