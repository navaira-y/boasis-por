import { daysUntil, findRequirement, reminderSchedule, type ReminderFire } from '@boasis/rules';
import type { Card } from '@boasis/schema';
import { useNavigate } from 'react-router-dom';
import { screens } from '../copy/en';
import { useHomeData } from '../data/bundles';
import { useAccessGrants } from '../data/hooks';
import { recipientOf, subjectOf } from '../lib/cards';
import { formatShort } from '../lib/dates';
import type { Bundle } from '../lib/entries';
import { useSettings } from '../lib/settings';
import './lite.css';
import './Inbox.css';

const copy = screens.inbox;

// Spec 9: the weekly digest window, everything due in the next thirty days.
const WINDOW_DAYS = 30;

interface Row {
  key: string;
  bundle: Bundle;
  card: Card;
  fire: ReminderFire;
}

// Screen 15b (spec 14): what the reminder schedule (spec 9) would send in the next thirty days
// across every company, one line each in lite's notifications language, soonest first. The
// bell in the top bar counts what needs someone and lands here.
export function Inbox() {
  const home = useHomeData();
  const navigate = useNavigate();
  const settings = useSettings();
  const grants = useAccessGrants();
  const today = home.today;

  const rows: Row[] = [];
  const pending = home.pending || grants.isPending;
  if (!pending) {
    for (const { bundle } of home.companies) {
      for (const card of bundle.cards) {
        for (const fire of reminderSchedule(card, today)) {
          if (daysUntil(fire.fireOn, today) <= WINDOW_DAYS) {
            rows.push({ key: `${card.id}:${String(fire.offsetDays)}`, bundle, card, fire });
          }
        }
      }
    }
    rows.sort((a, b) => a.fire.fireOn.localeCompare(b.fire.fireOn) || a.key.localeCompare(b.key));
  }

  const channels = [
    settings.email ? copy.by('email').slice(3) : null,
    settings.push ? 'push' : null,
  ]
    .filter((channel): channel is string => channel !== null)
    .join(' and ');

  if (home.error !== null) {
    return <p role="alert">{home.error.message}</p>;
  }

  return (
    <div className="pg inbox">
      <div className="vhead">
        <div>
          <h2>{copy.title}</h2>
          <p>{copy.subtitle}</p>
        </div>
      </div>

      {pending ? (
        <p className="status" role="status">
          {screens.common.loading}
        </p>
      ) : (
        <div className="nlist">
          {rows.length === 0 ? <div className="nempty">{copy.nothing}</div> : null}
          {rows.map(({ key, bundle, card, fire }) => {
            const requirement = findRequirement(card.requirementId);
            const subject = subjectOf(card, bundle).name;
            const when =
              fire.offsetDays > 0
                ? copy.daysBefore(fire.offsetDays)
                : fire.offsetDays === 0
                  ? copy.onTheDay
                  : copy.overdue(-fire.offsetDays);
            const who = recipientOf(card, grants.data ?? []) ?? copy.everyOwner;
            return (
              <button
                type="button"
                className={`n new${fire.overdue ? ' bad' : ''}`}
                key={key}
                onClick={() => {
                  void navigate(
                    `/companies/${bundle.facts.id}/compliance/${encodeURIComponent(card.id)}`,
                  );
                }}
              >
                <span className="dot2" />
                <div>
                  <div className="t">
                    {requirement?.title ?? card.requirementId}
                    {subject === null ? '' : ` · ${subject}`}
                  </div>
                  <div className="s">
                    {[
                      bundle.facts.identity.tradeName,
                      daysUntil(fire.fireOn, today) > 0
                        ? copy.scheduled(formatShort(fire.fireOn))
                        : copy.fires(formatShort(fire.fireOn)),
                      when,
                      copy.to(who),
                      channels === '' ? copy.noChannel : copy.by(channels),
                    ].join(' · ')}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
