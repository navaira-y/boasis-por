import {
  Area,
  type AccessGrant,
  type AccessLevel,
  type Actor,
  type AreaAccess,
  type CompanyAccess,
  type Person,
} from '@boasis/schema';

// Spec 4.1, as the access screen reads it: the ten areas in the spec's order, their names in
// words, and the three templates that ship with the app.
export const AREAS: readonly Area[] = Area.options;

export const AREA_LABELS: Readonly<Record<Area, string>> = {
  'company-file': 'Company file',
  offices: 'Offices',
  documents: 'Documents',
  people: 'People',
  'licence-and-cards': 'Licence and cards',
  'tax-and-accounts': 'Tax and accounts',
  banks: 'Banks',
  'calendar-and-costs': 'Calendar and costs',
  access: 'Access',
  billing: 'Billing',
};

// The grid the form edits: every area, a level, and whether the person is responsible.
export type AreaGrid = Record<Area, AreaAccess>;

export function emptyGrid(): AreaGrid {
  const grid = {} as AreaGrid;
  for (const area of AREAS) {
    grid[area] = { level: 'none', responsible: false };
  }
  return grid;
}

export function gridFrom(areas: CompanyAccess['areas']): AreaGrid {
  const grid = emptyGrid();
  for (const area of AREAS) {
    const given = areas[area];
    if (given !== undefined) {
      grid[area] = given;
    }
  }
  return grid;
}

// What is stored: only the areas the person can reach or answers for.
export function areasFrom(grid: AreaGrid): CompanyAccess['areas'] {
  const areas: CompanyAccess['areas'] = {};
  for (const area of AREAS) {
    const access = grid[area];
    if (access.level !== 'none' || access.responsible) {
      areas[area] = access;
    }
  }
  return areas;
}

export type TemplateId = 'custom' | 'manager' | 'pro' | 'accountant';

function fill(levels: Partial<Record<Area, AccessLevel>>): AreaGrid {
  const grid = emptyGrid();
  for (const area of AREAS) {
    const level = levels[area];
    if (level !== undefined) {
      grid[area] = { level, responsible: false };
    }
  }
  return grid;
}

// Spec 4.1: Manager edits everything except access and billing; PRO has documents view and
// people edit; the Accountant has tax and documents view plus what they answer for (4.3: with
// edit on tax and accounts, and the calendar of tax dates and the cost view).
export function templateGrid(template: TemplateId): AreaGrid {
  switch (template) {
    case 'manager':
      return fill({
        'company-file': 'edit',
        offices: 'edit',
        documents: 'edit',
        people: 'edit',
        'licence-and-cards': 'edit',
        'tax-and-accounts': 'edit',
        banks: 'edit',
        'calendar-and-costs': 'edit',
      });
    case 'pro':
      return fill({ documents: 'view', people: 'edit' });
    case 'accountant':
      return fill({
        'company-file': 'view',
        documents: 'view',
        'tax-and-accounts': 'edit',
        'calendar-and-costs': 'view',
      });
    case 'custom':
      return emptyGrid();
  }
}

export function reachCount(areas: CompanyAccess['areas']): number {
  return AREAS.filter((area) => (areas[area]?.level ?? 'none') !== 'none').length;
}

export function companyAccessOf(grant: AccessGrant, companyId: string): CompanyAccess | null {
  return grant.companies.find((entry) => entry.companyId === companyId) ?? null;
}

// Who a check is made for: the account owner, or a member through their grant.
export type GrantOrOwner = AccessGrant | 'owner';

// The level a person holds on one area of one company. The owner edits everything (spec 4.2);
// a member holds what their grant gives for that company, and nothing on a company not in it.
export function levelOf(who: GrantOrOwner, companyId: string, area: Area): AccessLevel {
  if (who === 'owner') {
    return 'edit';
  }
  return companyAccessOf(who, companyId)?.areas[area]?.level ?? 'none';
}

// Spec 4.1: view needs view or edit; edit needs edit.
export function can(
  who: GrantOrOwner,
  companyId: string,
  area: Area,
  level: 'view' | 'edit',
): boolean {
  const held = levelOf(who, companyId, area);
  return level === 'view' ? held !== 'none' : held === 'edit';
}

// Spec 4.1 and 4.3: assignment is finer than responsibility. A member with people access who is
// responsible for people in that company sees everyone; otherwise only the people assigned to
// them. The owner sees everyone.
export function seesPerson(who: GrantOrOwner, person: Person): boolean {
  if (who === 'owner') {
    return true;
  }
  if (!can(who, person.companyId, 'people', 'view')) {
    return false;
  }
  if (companyAccessOf(who, person.companyId)?.areas.people?.responsible === true) {
    return true;
  }
  return person.assigneeId === who.id;
}

// The grant the demo is acting as, or null for the owner. A grant id that no longer exists
// (access removed) falls back to the owner.
export function actingGrantOf(
  actingAs: string | null,
  grants: readonly AccessGrant[],
): AccessGrant | null {
  return actingAs === null ? null : (grants.find((grant) => grant.id === actingAs) ?? null);
}

// The actor written to the history and the audit trail for the current session.
export function actorFor(
  ownerName: string,
  actingAs: string | null,
  grants: readonly AccessGrant[],
): Actor {
  const grant = actingGrantOf(actingAs, grants);
  return grant === null
    ? { kind: 'owner', name: ownerName }
    : { kind: 'member', grantId: grant.id, name: grant.member.name };
}
