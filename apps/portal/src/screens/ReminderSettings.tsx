import type { Person } from '@boasis/schema';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Picker, Toggle } from '../components';
import { BellIcon } from '../components/shared/icons';
import { screens } from '../copy/en';
import { queryKeys, useCompanies, usePeople, useRepos } from '../data';
import { useSettings, writeSettings } from '../lib/settings';
import { applyTheme, readTheme, type ThemeChoice } from '../lib/theme';
import { twoLetters } from './PeopleList';
import './lite.css';
import './People.css';
import './ReminderSettings.css';

const copy = screens.settings;

const HOURS = Array.from({ length: 24 }, (_, hour) => ({
  value: String(hour),
  label: `${String(hour).padStart(2, '0')}:00`,
}));

const THEMES: readonly ThemeChoice[] = ['light', 'dark', 'system'];

// Screen 16 (spec 14): channels, quiet hours, appearance, and the notice switch of every
// person, in lite's settings rows.
export function ReminderSettings() {
  const settings = useSettings();
  const [theme, setTheme] = useState<ThemeChoice>(readTheme);
  const companies = useCompanies();

  const chooseTheme = (choice: ThemeChoice) => {
    applyTheme(choice);
    setTheme(choice);
  };

  return (
    <div className="pg settings">
      <div className="vhead">
        <div>
          <h2>{copy.title}</h2>
          <p>{copy.subtitle}</p>
        </div>
      </div>

      <div className="sect">{copy.channels}</div>
      <div className="rule line">
        <span className="bd">
          <span className="t">{copy.email}</span>
          <span className="s">{copy.channelsBody}</span>
        </span>
        <span className="rt">
          <Toggle
            label={copy.email}
            checked={settings.email}
            onChange={(email) => {
              writeSettings({ email });
            }}
          />
        </span>
      </div>
      <div className="rule line">
        <span className="bd">
          <span className="t">{copy.push}</span>
          <span className="s">{copy.pushNote}</span>
        </span>
        <span className="rt">
          <Toggle
            label={copy.push}
            checked={settings.push}
            onChange={(push) => {
              writeSettings({ push });
            }}
          />
        </span>
      </div>
      <div className="rule line">
        <span className="bd">
          <span className="t">{copy.whatsapp}</span>
        </span>
        <span className="rt">
          <span className="fixed">{copy.whatsappNote}</span>
        </span>
      </div>

      <div className="sect">{copy.quiet}</div>
      <div className="rule">
        <span className="bd">
          <span className="t">{copy.quiet}</span>
          <span className="s">{copy.quietNote}</span>
        </span>
        <span className="rt">
          <Picker
            label={copy.from}
            value={String(settings.quietFrom)}
            options={HOURS}
            size="sm"
            onChange={(value) => {
              writeSettings({ quietFrom: Number(value) });
            }}
          />
          <Picker
            label={copy.to}
            value={String(settings.quietTo)}
            options={HOURS}
            size="sm"
            onChange={(value) => {
              writeSettings({ quietTo: Number(value) });
            }}
          />
        </span>
      </div>

      <div className="sect">{copy.appearance}</div>
      <div className="rule">
        <span className="bd">
          <span className="t">{copy.appearance}</span>
        </span>
        <span className="rt">
          <span className="seg" role="group" aria-label={copy.appearance}>
            {THEMES.map((choice) => (
              <button
                key={choice}
                type="button"
                className={theme === choice ? 'on' : ''}
                aria-pressed={theme === choice}
                onClick={() => {
                  chooseTheme(choice);
                }}
              >
                {copy[choice]}
              </button>
            ))}
          </span>
        </span>
      </div>

      <div className="sect">{copy.notices}</div>
      <p className="hintline">{copy.noticesBody}</p>
      {(companies.data ?? []).map((company) => (
        <CompanyNotices key={company.id} companyId={company.id} />
      ))}
      {companies.isSuccess && companies.data.length === 0 ? (
        <p className="quiet">{copy.noPeople}</p>
      ) : null}
    </div>
  );
}

// Spec 4.4: each person has a notify switch; on with no contact, the record is flagged.
function CompanyNotices({ companyId }: { companyId: string }) {
  const people = usePeople(companyId);
  const repos = useRepos();
  const queryClient = useQueryClient();
  const list = people.data ?? [];

  const ring = (person: Person, notify: boolean) => {
    repos.people
      .update(person.id, { notify })
      .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.people(companyId) }))
      .catch(() => undefined);
  };

  if (people.isSuccess && list.length === 0) {
    return <p className="quiet">{copy.noPeople}</p>;
  }

  return (
    <>
      {list.map((person) => {
        const contact = person.contact.email ?? person.contact.phone;
        const line = [person.identity.role, contact].filter((part) => part !== '' && part !== null);
        const text = person.notify ? copy.notifyOn : copy.notifyOff;
        return (
          <div className="rule line" key={person.id}>
            <span className="av3">{twoLetters(person.identity.name)}</span>
            <span className="bd">
              <span className="t">{person.identity.name}</span>
              {person.notify && contact === null ? (
                <span className="s warn">{copy.cannotNotify}</span>
              ) : (
                <span className="s">{line.join(' · ')}</span>
              )}
            </span>
            <span className="rt">
              <button
                type="button"
                className={`bell2 live${person.notify ? ' on' : ''}`}
                onClick={() => {
                  ring(person, !person.notify);
                }}
                aria-pressed={person.notify}
                aria-label={text}
                title={text}
              >
                <BellIcon width="14" height="14" />
              </button>
            </span>
          </div>
        );
      })}
    </>
  );
}
