import type { AccessGrant, Area, Person } from '@boasis/schema';
import { describe, expect, it } from 'vitest';
import { seed } from '../data/mock/seed';
import { AREAS, actorFor, can, levelOf, seesPerson } from './access';

const grant: AccessGrant = {
  id: 'ag-1',
  member: { name: 'A PRO', email: 'pro@example.com' },
  roleName: 'PRO',
  companies: [
    {
      companyId: 'co-1',
      areas: {
        documents: { level: 'view', responsible: false },
        people: { level: 'edit', responsible: false },
      },
    },
    {
      companyId: 'co-2',
      areas: { people: { level: 'view', responsible: true } },
    },
  ],
};

describe('can (spec 4.1)', () => {
  it('lets the owner view and edit every area of every company', () => {
    for (const area of AREAS) {
      expect(can('owner', 'co-any', area, 'view')).toBe(true);
      expect(can('owner', 'co-any', area, 'edit')).toBe(true);
    }
  });

  // The truth table: held level against the level asked for.
  const table: readonly [Area, 'view' | 'edit', boolean][] = [
    ['documents', 'view', true],
    ['documents', 'edit', false],
    ['people', 'view', true],
    ['people', 'edit', true],
    ['banks', 'view', false],
    ['banks', 'edit', false],
  ];
  for (const [area, level, expected] of table) {
    it(`${expected ? 'allows' : 'refuses'} ${level} on ${area} for a grant`, () => {
      expect(can(grant, 'co-1', area, level)).toBe(expected);
    });
  }

  it('gives nothing on a company the grant does not include', () => {
    expect(levelOf(grant, 'co-3', 'documents')).toBe('none');
    expect(can(grant, 'co-3', 'documents', 'view')).toBe(false);
  });

  it('reads each company of the grant on its own', () => {
    expect(can(grant, 'co-2', 'people', 'edit')).toBe(false);
    expect(can(grant, 'co-2', 'people', 'view')).toBe(true);
  });
});

describe('seesPerson (spec 4.1 assignment)', () => {
  const base = seed().people[0];
  if (base === undefined) {
    throw new Error('seed has no people');
  }
  const personOn = (companyId: string, assigneeId: string | null): Person => ({
    ...base,
    companyId,
    assigneeId,
  });

  it('shows a member only the people assigned to them when not responsible', () => {
    expect(seesPerson(grant, personOn('co-1', 'ag-1'))).toBe(true);
    expect(seesPerson(grant, personOn('co-1', null))).toBe(false);
  });

  it('shows everyone to a member responsible for people, and to the owner', () => {
    expect(seesPerson(grant, personOn('co-2', null))).toBe(true);
    expect(seesPerson('owner', personOn('co-1', null))).toBe(true);
  });

  it('shows nobody on a company the member cannot reach', () => {
    expect(seesPerson(grant, personOn('co-3', 'ag-1'))).toBe(false);
  });
});

describe('actorFor', () => {
  it('is the owner unless the session acts as an existing grant', () => {
    expect(actorFor('Layla Haddad', null, [grant])).toEqual({
      kind: 'owner',
      name: 'Layla Haddad',
    });
    expect(actorFor('Layla Haddad', 'ag-1', [grant])).toEqual({
      kind: 'member',
      grantId: 'ag-1',
      name: 'A PRO',
    });
    expect(actorFor('Layla Haddad', 'ag-gone', [grant]).kind).toBe('owner');
  });
});
