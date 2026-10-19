import { Account, AccountCompany } from '@boasis/schema';
import type { AccountsRepo, AuthAdapter, BreachedPasswordCheck } from '../types';
import { requireUser } from './actor';
import { supabase } from './client';
import { rethrow, type PostgrestError } from './util';

// The account is a PROJECTION, not a table: auth.users holds the login,
// profiles holds the name and terms, subscriptions holds the plan. One source
// of truth, no sync drift. Single-owner slice: only your own account reads.

// Our plans to the portal's two plans. Enterprise has no portal plan of its
// own; it reads as up-to-three (the plan copy lives with the billing pages).
function toPlan(planId: string | null): 'one-company' | 'up-to-three' {
  return planId === 'trio' || planId === 'enterprise' ? 'up-to-three' : 'one-company';
}

interface ProfileRow {
  readonly full_name: string;
  readonly terms_version: string;
  readonly terms_accepted_at: string;
  readonly created_at: string;
  readonly email_reminders_on: boolean | null;
}

async function readOwnAccount(userId: string, email: string): Promise<Account | null> {
  const { data: profile, error: profileError } = await supabase()
    .from('profiles')
    .select('full_name, terms_version, terms_accepted_at, created_at, email_reminders_on')
    .eq('id', userId)
    .maybeSingle();
  rethrow(profileError as PostgrestError | null);
  if (profile === null || profile === undefined) {
    return null;
  }
  const row = profile as ProfileRow;
  const { data: sub } = await supabase()
    .from('subscriptions')
    .select('plan_id')
    .eq('profile_id', userId)
    .maybeSingle();
  const planId = (sub as { plan_id: string | null } | null)?.plan_id ?? null;
  const { data: userData } = await supabase().auth.getUser();
  const confirmed = userData?.user?.email_confirmed_at ?? null;
  let twoStepOn = false;
  try {
    const { data: factors } = await supabase().auth.mfa.listFactors();
    twoStepOn = factors?.totp?.some((factor) => factor.status === 'verified') === true;
  } catch {
    twoStepOn = false;
  }
  return Account.parse({
    id: userId,
    fullName: row.full_name,
    email,
    plan: toPlan(planId),
    termsVersion: row.terms_version,
    termsAcceptedOn: row.terms_accepted_at.slice(0, 10),
    emailVerifiedOn: confirmed === null || confirmed === undefined ? null : confirmed.slice(0, 10),
    twoStepOn,
    emailRemindersOn: row.email_reminders_on ?? true,
    createdOn: row.created_at.slice(0, 10),
  });
}

export const accounts: AccountsRepo = {
  get: async (id) => {
    const user = await requireUser();
    if (id !== user.id) {
      return null;
    }
    return readOwnAccount(user.id, user.email);
  },
  findByEmail: async (email) => {
    const user = await requireUser();
    if (user.email.trim().toLowerCase() !== email.trim().toLowerCase()) {
      return null;
    }
    return readOwnAccount(user.id, user.email);
  },
  update: async (id, patch) => {
    const user = await requireUser();
    if (id !== user.id) {
      throw new Error(`accounts: no record with id ${id}`);
    }
    const current = await readOwnAccount(user.id, user.email);
    if (current === null) {
      throw new Error(`accounts: no record with id ${id}`);
    }
    // Two-step is enforced by the auth provider, not a flag: refusing loudly
    // beats storing a badge that protects nothing.
    if (patch.twoStepOn !== undefined && patch.twoStepOn !== current.twoStepOn) {
      throw new Error('Use authenticator setup in Security to change two-step verification.');
    }
    // Screens save whole forms, so unmanaged fields (plan, email, terms,
    // verification) are ignored; only owned fields write through.
    const row: { full_name?: string; email_reminders_on?: boolean } = {};
    if (patch.fullName !== undefined) {
      row.full_name = patch.fullName;
    }
    if (patch.emailRemindersOn !== undefined) {
      row.email_reminders_on = patch.emailRemindersOn;
    }
    if (Object.keys(row).length > 0) {
      const { error } = await supabase().from('profiles').update(row).eq('id', user.id);
      rethrow(error as PostgrestError | null);
    }
    const next = await readOwnAccount(user.id, user.email);
    if (next === null) {
      throw new Error(`accounts: no record with id ${id}`);
    }
    return next;
  },
  companies: async (accountId) => {
    const user = await requireUser();
    if (accountId !== user.id) {
      return [];
    }
    const { data, error } = await supabase()
      .from('portal_account_companies')
      .select('account_id, company_id, role, added_on')
      .eq('account_id', user.id)
      .order('created_at', { ascending: true });
    rethrow(error as PostgrestError | null);
    const links: AccountCompany[] = [];
    for (const row of (data ?? []) as {
      account_id: string;
      company_id: string;
      role: string;
      added_on: string;
    }[]) {
      const parsed = AccountCompany.safeParse({
        accountId: row.account_id,
        companyId: row.company_id,
        role: row.role,
        addedOn: row.added_on,
      });
      if (parsed.success) {
        links.push(parsed.data);
      } else {
        console.warn(`accountCompanies: skipping link to ${row.company_id}; shape mismatch.`);
      }
    }
    return links;
  },
  linkCompany: async (link) => {
    const user = await requireUser();
    const parsed = AccountCompany.parse(link);
    if (parsed.accountId !== user.id) {
      throw new Error('Inviting another account is not available yet.');
    }
    const { error } = await supabase().from('portal_account_companies').upsert(
      {
        account_id: parsed.accountId,
        company_id: parsed.companyId,
        role: parsed.role,
        added_on: parsed.addedOn,
      },
      { onConflict: 'account_id,company_id' },
    );
    rethrow(error as PostgrestError | null);
    return parsed;
  },
};

// Sign-up and email verification live on the main site (the pay gate owns
// them). These fail loudly so the portal's auth screens can never mint an
// account that bypasses payment; the middleware would not let it in anyway.
export const auth: AuthAdapter = {
  signUp: () =>
    Promise.reject(
      new Error('Accounts are created on the main site. Sign up there, then open the portal.'),
    ),
  resendVerification: () => Promise.reject(new Error('Email verification lives on the main site.')),
  verifyEmail: () => Promise.reject(new Error('Email verification lives on the main site.')),
};

// Step 0: the real leaked-password check the seam was built for — a
// k-anonymity range query, so the password itself never leaves the browser.
export const passwords: BreachedPasswordCheck = {
  check: async (password) => {
    try {
      const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(password));
      const hex = [...new Uint8Array(digest)]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
      const res = await fetch(`https://api.pwnedpasswords.com/range/${hex.slice(0, 5)}`, {
        headers: { 'Add-Padding': 'true' },
      });
      if (!res.ok) {
        return 'unavailable';
      }
      const suffix = hex.slice(5);
      const hit = (await res.text())
        .split('\n')
        .some((line) => (line.split(':')[0] ?? '').trim() === suffix);
      return hit ? 'breached' : 'ok';
    } catch {
      return 'unavailable';
    }
  },
};
