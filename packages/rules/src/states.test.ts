import { describe, expect, it } from 'vitest';
import { STATE_PRECEDENCE, mostSevere, severity, stateFor } from './states';

const today = '2026-09-12';

describe('precedence (spec 7.1)', () => {
  it('orders overdue, expiring, action soon, decision needed, unknown, on track, complete', () => {
    expect(STATE_PRECEDENCE).toEqual([
      'overdue',
      'expiring',
      'action-soon',
      'decision-needed',
      'unknown',
      'on-track',
      'complete',
    ]);
    expect(severity('overdue')).toBeLessThan(severity('expiring'));
    expect(severity('unknown')).toBeLessThan(severity('on-track'));
  });

  it('picks the most severe of several', () => {
    expect(mostSevere(['on-track', 'unknown', 'decision-needed'])).toBe('decision-needed');
    expect(mostSevere(['expiring', 'overdue'])).toBe('overdue');
    expect(mostSevere([])).toBe('complete');
  });
});

describe('stateFor', () => {
  it('is on track more than 90 days away', () => {
    expect(stateFor({ dueOn: '2027-01-15', today, leadDays: 90 })).toBe('on-track');
  });

  it('is action soon inside the lead time', () => {
    expect(stateFor({ dueOn: '2026-12-01', today, leadDays: 90 })).toBe('action-soon');
    expect(stateFor({ dueOn: '2026-12-11', today, leadDays: 90 })).toBe('action-soon');
  });

  it('is expiring under 30 days and overdue after the date', () => {
    expect(stateFor({ dueOn: '2026-10-11', today, leadDays: 90 })).toBe('expiring');
    expect(stateFor({ dueOn: '2026-09-12', today, leadDays: 90 })).toBe('expiring');
    expect(stateFor({ dueOn: '2026-09-11', today, leadDays: 90 })).toBe('overdue');
  });

  it('uses the short lead time for a short requirement, with expiring still under 30 days', () => {
    expect(stateFor({ dueOn: '2026-11-15', today, leadDays: 7 })).toBe('on-track');
    expect(stateFor({ dueOn: '2026-10-30', today, leadDays: 7 })).toBe('on-track');
    expect(stateFor({ dueOn: '2026-10-05', today, leadDays: 7 })).toBe('expiring');
    expect(stateFor({ dueOn: '2026-09-18', today, leadDays: 7 })).toBe('expiring');
  });

  it('is action soon when a prerequisite is missing, even 100 days out', () => {
    expect(stateFor({ dueOn: '2026-12-21', today, leadDays: 90, prerequisiteMissing: true })).toBe(
      'action-soon',
    );
    expect(stateFor({ dueOn: null, today, leadDays: 90, pending: true })).toBe('action-soon');
  });

  it('is unknown without a date and without data, and severity still wins', () => {
    expect(stateFor({ dueOn: null, today, leadDays: 90, unknown: true })).toBe('unknown');
    expect(stateFor({ dueOn: '2026-09-01', today, leadDays: 90, unknown: true })).toBe('overdue');
    expect(stateFor({ dueOn: '2027-01-15', today, leadDays: 90, unknown: true })).toBe('unknown');
  });

  it('shows decision needed only when nothing more severe applies', () => {
    expect(stateFor({ dueOn: '2026-12-01', today, leadDays: 90, decisionNeeded: true })).toBe(
      'action-soon',
    );
    expect(stateFor({ dueOn: '2027-01-15', today, leadDays: 90, decisionNeeded: true })).toBe(
      'decision-needed',
    );
  });

  it('is complete once closed, whatever the date', () => {
    expect(stateFor({ dueOn: '2026-09-01', today, leadDays: 90, complete: true })).toBe('complete');
  });

  it('is on track with no date and nothing outstanding', () => {
    expect(stateFor({ dueOn: null, today, leadDays: 90 })).toBe('on-track');
  });
});
