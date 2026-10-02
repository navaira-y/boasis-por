import { describe, expect, it } from 'vitest';
import { topItem, type TopBlocker, type TopDated } from './topItem';

function entry(id: string, days: number, status: TopDated['status'] = 'upcoming'): TopDated {
  return { id, date: `day ${String(days)}`, days, status };
}

function blocker(kind: TopBlocker<TopDated>['kind'], of: TopDated | null): TopBlocker<TopDated> {
  return { kind, entry: of };
}

describe('topItem', () => {
  it('returns nothing when there is nothing open', () => {
    expect(topItem([], [])).toBeNull();
    expect(topItem([entry('a', 3, 'done')], [])).toBeNull();
  });

  it('rule 1: the most overdue date wins over a blocked renewal and a date due soon', () => {
    const renewal = entry('visa', 10);
    const top = topItem(
      [entry('soon', 1), entry('late', -2), entry('later', -9), renewal],
      [blocker('passport', renewal)],
    );
    expect(top?.reason).toBe('overdue');
    expect(top?.entry.id).toBe('later');
  });

  it('a blocked renewal 150 days out does not beat an overdue date', () => {
    const renewal = entry('visa', 150);
    const top = topItem([entry('late', -212), renewal], [blocker('passport', renewal)]);
    expect(top?.reason).toBe('overdue');
    expect(top?.entry.id).toBe('late');
  });

  it('rule 2: a blocked renewal within thirty days wins over a date due sooner', () => {
    const renewal = entry('visa', 30);
    const alert = blocker('insurance', renewal);
    const top = topItem([entry('soon', 2), renewal], [alert, blocker('passport', null)]);
    expect(top?.reason).toBe('blocked');
    expect(top?.entry).toBe(renewal);
    expect(top?.alert).toBe(alert);
  });

  it('rule 3: the nearest date within fifteen days', () => {
    const renewal = entry('visa', 31);
    const top = topItem(
      [entry('far', 60), entry('b', 15), entry('a', 6), renewal],
      [blocker('passport', renewal)],
    );
    expect(top?.reason).toBe('soon');
    expect(top?.entry.id).toBe('a');
    expect(topItem([entry('today', 0)], [])?.reason).toBe('soon');
  });

  it('rule 4: otherwise the next date due, a blocked renewal further out by its date', () => {
    const renewal = entry('visa', 40);
    const top = topItem(
      [entry('far', 90), renewal, entry('done', 3, 'done')],
      [blocker('passport', renewal)],
    );
    expect(top?.reason).toBe('next');
    expect(top?.entry).toBe(renewal);
    expect(top?.alert).toBeNull();
  });
});
