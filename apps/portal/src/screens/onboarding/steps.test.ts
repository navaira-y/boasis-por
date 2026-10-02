import type { AuthorityIndexEntry } from '@boasis/schema';
import { describe, expect, it } from 'vitest';
import { accountErrors, splitName } from './CreateAccount';
import { dateError, dateOf, monthDayOf, NO_DATE, partsOf, uploadError } from './controls';
import { choiceEntry, choiceOfField, definedOnly } from './form';
import { reminderList } from './StepTax';
import { freeZones, searchZones } from './StepWhere';
import { doerOf, taskTitle } from './StepYear';

const TODAY = '2026-09-28';

function zone(id: string, name: string, type: 'free-zone' | 'mainland', aliases: string[] = []) {
  const fact = <T>(value: T) => ({
    value,
    source: 'test',
    lastChecked: TODAY,
    grade: 'confirmed' as const,
  });
  const entry: AuthorityIndexEntry = {
    id,
    name: fact(name),
    emirate: fact('Dubai'),
    type: fact(type),
    visaSponsor: fact(type === 'mainland' ? 'mohre' : 'zone'),
    aliases,
    file: null,
    source: 'test',
    lastChecked: TODAY,
  };
  return entry;
}

describe('step 0', () => {
  it('asks for a name, a valid email, 12 characters and the terms tick', () => {
    expect(accountErrors({ fullName: 'S', email: 'x', password: 'short', terms: false })).toEqual({
      fullName: 'Enter your name, 2 to 100 characters.',
      email: 'Enter a valid email address.',
      password: 'Use at least 12 characters.',
      terms: 'Tick to accept the terms and privacy notice.',
    });
    expect(
      accountErrors({
        fullName: 'Sara Ahmed',
        email: 'sara@example.com',
        password: 'twelve-chars',
        terms: true,
      }),
    ).toEqual({});
  });

  it('splits a full name for the session', () => {
    expect(splitName('  Sara  Al Ahmed ')).toEqual({ firstName: 'Sara', lastName: 'Al Ahmed' });
  });
});

describe('step 1', () => {
  const zones = [
    zone('ifza', 'IFZA', 'free-zone', ['International Free Zone Authority']),
    zone('dubai-mainland', 'Dubai mainland', 'mainland'),
    zone('dmcc', 'Dubai Multi Commodities Centre (DMCC)', 'free-zone', ['DMCC', 'JLT']),
  ];

  it('lists only free zones and finds them by name or alias', () => {
    expect(freeZones(zones).map((entry) => entry.id)).toEqual(['dmcc', 'ifza']);
    expect(searchZones(freeZones(zones), 'jlt').map((entry) => entry.id)).toEqual(['dmcc']);
    expect(searchZones(freeZones(zones), '')).toHaveLength(2);
  });
});

describe('the date pickers (section B.7)', () => {
  it('reads empty, partial and whole dates', () => {
    expect(dateOf(NO_DATE)).toEqual({ kind: 'empty' });
    expect(dateOf({ day: '5', month: '', year: '2027' })).toEqual({ kind: 'partial' });
    expect(dateOf({ day: '5', month: '3', year: '2027' })).toEqual({
      kind: 'date',
      value: '2027-03-05',
    });
    expect(partsOf('2027-03-05')).toEqual({ day: '5', month: '3', year: '2027' });
    expect(monthDayOf({ day: '31', month: '12' })).toEqual({ kind: 'date', value: '12-31' });
  });

  it('asks "Is this right?" of a date more than ten years out until confirmed', () => {
    const far = partsOf('2040-01-01');
    expect(dateError(far, TODAY, false)).toBe('Is this right?');
    expect(dateError(far, TODAY, true)).toBeUndefined();
    expect(dateError({ day: '1', month: '', year: '' }, TODAY, false)).toBe(
      'Choose the day, the month and the year.',
    );
  });
});

describe('uploads (section B.8)', () => {
  it('takes PDF, JPG and PNG up to 20 MB', () => {
    expect(uploadError({ name: 'a.pdf', type: 'application/pdf', size: 1000 })).toBeUndefined();
    expect(uploadError({ name: 'a.gif', type: 'image/gif', size: 1000 })).toBe(
      'Upload a PDF, JPG or PNG file.',
    );
    expect(uploadError({ name: 'a.png', type: 'image/png', size: 21 * 1024 * 1024 })).toBe(
      'The file is larger than 20 MB.',
    );
  });
});

describe('small helpers', () => {
  it('turns a choice with "Not sure" into an entry and back', () => {
    expect(choiceEntry('not-sure')).toEqual({ kind: 'not-sure' });
    expect(choiceEntry('')).toEqual({ kind: 'empty' });
    expect(choiceEntry('yes')).toEqual({ kind: 'value', value: 'yes' });
    expect(choiceOfField({ state: 'unknown', value: null, origin: 'user', enteredOn: TODAY })).toBe(
      'not-sure',
    );
    expect(definedOnly({ a: undefined, b: 'x' })).toEqual({ b: 'x' });
  });

  it('writes a reminder schedule in words', () => {
    expect(reminderList([30, 14, 7, 1])).toBe('30, 14, 7 and 1');
    expect(reminderList([7])).toBe('7');
  });

  it('names the task and who does each item', () => {
    expect(
      taskTitle({
        id: 't',
        companyId: 'co-1',
        item: 'lease-end',
        personId: null,
        reason: 'skipped',
        whoCanAnswer: ['you'],
        status: 'open',
        createdOn: TODAY,
      }),
    ).toBe('Complete: contract or lease end date');
    expect(
      taskTitle({
        id: 't',
        companyId: 'co-1',
        item: 'corporate-tax-registration',
        personId: null,
        reason: 'unknown',
        whoCanAnswer: ['accountant'],
        status: 'open',
        createdOn: TODAY,
      }),
    ).toBe('Check corporate tax registration');
    const agentCompany = {
      id: 'co-1',
      profile: {
        handler: {
          state: 'known' as const,
          value: { kind: 'agent' as const, name: null, email: null },
          origin: 'user' as const,
          enteredOn: TODAY,
        },
      },
    };
    const item = {
      id: 'x',
      kind: 'licence-renewal' as const,
      companyId: 'co-1',
      personId: null,
      personName: null,
      dueOn: TODAY,
      reminders: [],
      basis: [],
    };
    expect(doerOf(item, [agentCompany as never])).toBe('agent');
    expect(doerOf({ ...item, kind: 'vat-return' }, [agentCompany as never])).toBe('you');
  });
});

describe('grade words', () => {
  it('reads a missing fact as unknown, never unverified', async () => {
    const { onboarding } = await import('../../copy/en');
    expect(Object.values(onboarding.grades)).toEqual([
      'confirmed',
      'reported',
      'unknown',
      'your date',
    ]);
  });
});
