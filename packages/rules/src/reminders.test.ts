import { describe, expect, it } from 'vitest';
import { reminderSchedule } from './reminders';
import { TODAY, card } from './testing/fixtures';

const SRTIP = 'co-srtip';

describe('reminderSchedule (spec 9)', () => {
  const licence = card(SRTIP, 'licence-renewal', {
    id: 'licence-renewal:co-srtip:2026-12-31',
    dueOn: '2026-12-31',
  });

  it('fires at 90, 60, 30, 14, 7 and 1 days, daily to owners from 7, then daily overdue', () => {
    const fires = reminderSchedule(licence, TODAY);
    expect(fires).toHaveLength(6 + 5 + 30);
    const ladder = fires.filter((fire) => fire.offsetDays > 0 && !fire.dailyToOwners);
    expect(ladder.map((fire) => [fire.offsetDays, fire.fireOn])).toEqual([
      [90, '2026-10-02'],
      [60, '2026-11-01'],
      [30, '2026-12-01'],
      [14, '2026-12-17'],
    ]);
    expect(fires.filter((fire) => fire.copyOwners).map((fire) => fire.offsetDays)).toEqual([30, 7]);
    expect(fires.filter((fire) => fire.dailyToOwners).map((fire) => fire.offsetDays)).toEqual([
      7, 6, 5, 4, 3, 2, 1,
    ]);
    const overdue = fires.filter((fire) => fire.overdue);
    expect(overdue).toHaveLength(30);
    expect(overdue[0]).toEqual({
      fireOn: '2027-01-01',
      offsetDays: -1,
      copyOwners: false,
      dailyToOwners: false,
      overdue: true,
    });
    expect(overdue[29]?.fireOn).toBe('2027-01-30');
  });

  it('does not copy the owners once a step is ticked', () => {
    const started = {
      ...licence,
      steps: [{ id: 's', title: 'Started', done: true, doneOn: TODAY, assigneeId: null }],
    };
    expect(reminderSchedule(started, TODAY).some((fire) => fire.copyOwners)).toBe(false);
  });

  it('uses 7 and 1 for a short requirement', () => {
    const rent = card(SRTIP, 'rent-instalment', {
      id: 'rent-instalment:of:2026-12-31',
      dueOn: '2026-12-31',
    });
    const fires = reminderSchedule(rent, TODAY);
    expect(fires.filter((fire) => fire.offsetDays > 0).map((fire) => fire.offsetDays)).toEqual([
      7, 6, 5, 4, 3, 2, 1,
    ]);
    expect(fires.filter((fire) => fire.copyOwners).map((fire) => fire.offsetDays)).toEqual([7]);
    expect(fires[0]?.fireOn).toBe('2026-12-24');
  });

  it('starts at 180 for the mainland LLC decision when told so', () => {
    const fires = reminderSchedule({ ...licence, dueOn: '2027-06-30' }, TODAY, 180);
    expect(fires[0]).toMatchObject({ offsetDays: 180, fireOn: '2027-01-01', copyOwners: false });
    expect(fires[1]?.offsetDays).toBe(90);
  });

  it('drops dates already past and returns nothing for a closed or undated card', () => {
    const soon = { ...licence, dueOn: '2026-09-20' };
    const fires = reminderSchedule(soon, TODAY);
    expect(fires[0]).toMatchObject({ offsetDays: 7, fireOn: '2026-09-13' });
    expect(fires.every((fire) => fire.fireOn >= TODAY)).toBe(true);
    expect(reminderSchedule({ ...licence, state: 'complete' }, TODAY)).toEqual([]);
    expect(reminderSchedule({ ...licence, dueOn: null }, TODAY)).toEqual([]);
  });

  it('falls back to 90 days for a card whose requirement is not in the catalogue', () => {
    const stray = {
      ...licence,
      requirementId: 'not-a-requirement' as typeof licence.requirementId,
    };
    expect(reminderSchedule(stray, TODAY)[0]?.offsetDays).toBe(90);
  });
});
