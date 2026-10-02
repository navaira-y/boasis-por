import type { AccountPerson, Role } from '@boasis/schema';

// Onboarding v2 step 3 and section D: the rules of the people step that are not dates.

// Ownership across shareholders must not pass 100. The person being edited is counted with the
// share typed now, not the one stored.
export function ownershipTotal(
  roles: readonly Role[],
  editing: { personId: string | null; percent: number | null },
): number {
  const others = roles
    .filter((role) => role.personId !== editing.personId)
    .reduce(
      (sum, role) =>
        sum + (role.ownershipPercent?.state === 'known' ? role.ownershipPercent.value : 0),
      0,
    );
  return others + (editing.percent ?? 0);
}

export function ownershipTooHigh(
  roles: readonly Role[],
  editing: { personId: string | null; percent: number | null },
): boolean {
  return ownershipTotal(roles, editing) > 100;
}

// Section D: when a second or third company is added, the people already on the account are
// offered first: everyone with a role in another company and none in this one. Employees (no
// role anywhere) are not offered.
export function pickList(
  companyId: string,
  people: readonly AccountPerson[],
  roles: readonly Role[],
): AccountPerson[] {
  const here = new Set(roles.filter((role) => role.companyId === companyId).map((r) => r.personId));
  const elsewhere = new Set(
    roles.filter((role) => role.companyId !== companyId).map((role) => role.personId),
  );
  return people.filter((person) => elsewhere.has(person.id) && !here.has(person.id));
}

// A percentage typed on screen, or null when it is not a number from 0 to 100.
export function parsePercent(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed);
  return value >= 0 && value <= 100 ? value : null;
}

// A whole number typed on screen (a quota, a count), or null.
export function parseCount(text: string): number | null {
  const trimmed = text.trim();
  return /^\d{1,4}$/.test(trimmed) ? Number(trimmed) : null;
}

// Step 6 and 7: a tax registration number has 15 digits.
export function isTrn(text: string): boolean {
  return /^\d{15}$/.test(text.replace(/\s+/g, ''));
}

export function isEmail(text: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim());
}
