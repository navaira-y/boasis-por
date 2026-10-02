import { z } from 'zod';
import {
  AccessGrant,
  Account,
  AccountCompany,
  AccountPerson,
  AuditEvent,
  Card,
  CompanyFacts,
  CompanyReminderEmail,
  Document,
  HistoryEntry,
  Office,
  OnboardingProgress,
  OnboardingStart,
  OnboardingTask,
  Person,
  Role,
  WaitlistEntry,
} from '@boasis/schema';

// The whole mock database is one JSON document. It lives in localStorage in the browser and in
// memory in tests, behind a two-method adapter so nothing else touches a browser API.
export const MOCK_STORAGE_KEY = 'boasis.portal.mock';

// Bump MOCK_VERSION whenever the demo seed changes shape or content: a stored copy with the old
// version fails to parse and the browser reseeds itself instead of keeping stale demo data.
export const MOCK_VERSION = 6;

// Version 5 had the company data only. Version 6 adds the account and the onboarding records
// (onboarding v2 section F); a stored version 5 copy is migrated, not thrown away, so a demo
// someone has been editing keeps its changes.
const CompanyData = z.object({
  companies: z.array(CompanyFacts),
  offices: z.array(Office),
  people: z.array(Person),
  documents: z.array(Document),
  access: z.array(AccessGrant),
  cards: z.array(Card),
  history: z.array(HistoryEntry),
  audit: z.array(AuditEvent),
});

export const OnboardingData = z.object({
  accounts: z.array(Account),
  accountCompanies: z.array(AccountCompany),
  accountPeople: z.array(AccountPerson),
  roles: z.array(Role),
  onboardingStarts: z.array(OnboardingStart),
  onboardingProgress: z.array(OnboardingProgress),
  tasks: z.array(OnboardingTask),
  reminderEmails: z.array(CompanyReminderEmail),
  waitlist: z.array(WaitlistEntry),
});
export type OnboardingData = z.infer<typeof OnboardingData>;

export const MockData = CompanyData.merge(OnboardingData).extend({
  version: z.literal(MOCK_VERSION),
});
export type MockData = z.infer<typeof MockData>;

const MockDataV5 = CompanyData.extend({ version: z.literal(5) });

// A stored copy from an older version, brought up to this one; null when it cannot be.
export function migrate(
  raw: unknown,
  onboarding: (companyIds: string[]) => OnboardingData,
): MockData | null {
  const current = MockData.safeParse(raw);
  if (current.success) {
    return current.data;
  }
  const v5 = MockDataV5.safeParse(raw);
  if (v5.success) {
    // Every company in a version 5 copy was the demo owner's.
    const ids = v5.data.companies.map((company) => company.id);
    return { ...v5.data, ...onboarding(ids), version: MOCK_VERSION };
  }
  return null;
}

export interface StorageAdapter {
  read(): string | null;
  write(value: string): void;
}

export function localStorageAdapter(): StorageAdapter {
  return {
    read() {
      try {
        return window.localStorage.getItem(MOCK_STORAGE_KEY);
      } catch {
        return null;
      }
    },
    write(value) {
      try {
        window.localStorage.setItem(MOCK_STORAGE_KEY, value);
      } catch {
        // Storage can be unavailable (private mode, quota); the session then lives in memory.
      }
    },
  };
}

export function memoryAdapter(): StorageAdapter {
  let value: string | null = null;
  return {
    read: () => value,
    write: (next) => {
      value = next;
    },
  };
}

export class MockStore {
  private data: MockData;

  constructor(
    private readonly adapter: StorageAdapter,
    seed: () => MockData,
    // The onboarding records a migrated older copy starts with, given its company ids.
    onboarding: (companyIds: string[]) => OnboardingData,
  ) {
    this.data = MockStore.restore(adapter, onboarding) ?? seed();
    this.persist();
  }

  private static restore(
    adapter: StorageAdapter,
    onboarding: (companyIds: string[]) => OnboardingData,
  ): MockData | null {
    const raw = adapter.read();
    if (raw === null) {
      return null;
    }
    try {
      return migrate(JSON.parse(raw), onboarding);
    } catch {
      return null;
    }
  }

  read(): MockData {
    return this.data;
  }

  write(next: MockData): void {
    this.data = next;
    this.persist();
  }

  private persist(): void {
    this.adapter.write(JSON.stringify(this.data));
  }
}
