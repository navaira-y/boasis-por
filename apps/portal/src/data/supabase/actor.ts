import type { Actor } from '@boasis/schema';
import { supabase } from './client';

export interface SessionUser {
  readonly id: string;
  readonly email: string;
}

// Every write needs a signed-in user: rows are owned by auth.uid(), and RLS would refuse an
// anonymous write anyway. Failing fast keeps the error readable.
export async function requireUser(): Promise<SessionUser> {
  const { data, error } = await supabase().auth.getUser();
  const user = error === null ? data.user : null;
  if (user === null || user.email === undefined || user.email === null || user.email === '') {
    throw new Error('Sign in is required.');
  }
  return { id: user.id, email: user.email };
}

// The owner, as the history and the audit trail write her. Slice 1 has no member grants, so
// every write is the owner's. The name is the account name from our profiles table when it
// reads, else the start of the email.
export async function currentActor(): Promise<Actor> {
  const user = await requireUser();
  let name: string | null = null;
  try {
    const { data } = await supabase()
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle();
    const row = data as { full_name: string | null } | null;
    name = row?.full_name ?? null;
  } catch {
    name = null;
  }
  const fallback = user.email.split('@')[0] ?? user.email;
  return { kind: 'owner', name: name !== null && name !== '' ? name : fallback };
}
