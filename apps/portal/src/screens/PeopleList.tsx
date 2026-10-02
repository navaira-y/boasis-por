import type { Person } from '@boasis/schema';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthorityFile } from '../content/hooks';
import { screens } from '../copy/en';
import { useCompany, usePeople } from '../data';
import { daysLine, formatLong } from '../lib/dates';
import { hasLeft, isSoon, personFlags, visaState } from '../lib/people';
import { todayIso } from '../lib/today';
import { IconPen, IconPeople, IconPlus } from './icons';
import { PersonForm } from './PersonForm';
import './lite.css';
import './People.css';

const copy = screens.people;

// Lite's two initials on a person's line.
export function twoLetters(name: string): string {
  const letters = name.trim().slice(0, 2).toUpperCase();
  return letters === '' ? '?' : letters;
}

// Screen 6 (spec 14): lite's Visas page, ported. Every person the company sponsors, one line
// each with the visa date, and the two conditions that stop a renewal flagged on the line.
export function PeopleList() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const company = useCompany(id);
  const people = usePeople(id);
  const [editing, setEditing] = useState<Person | 'new' | null>(null);
  const today = todayIso();

  const authorityQuery = useAuthorityFile(company.data?.identity.authority ?? null);
  const authority = authorityQuery.data ?? null;
  const list = (people.data ?? []).filter((person) => !hasLeft(person, today));
  const missing = list.filter((person) => person.identity.passportExpiry === null).length;
  const missingInsurance = list.filter((person) => person.cover.healthInsurance === null).length;

  const done = () => {
    setEditing(null);
  };

  return (
    <div className="pg people">
      <div className="vhead">
        <div>
          <h2>{copy.title}</h2>
          <p>
            {copy.subtitle(list.length)}
            {missing > 0 ? <span className="warn2">{copy.missingPassports(missing)}</span> : null}
            {missingInsurance > 0 ? (
              <span className="warn2">{copy.missingInsurance(missingInsurance)}</span>
            ) : null}
          </p>
        </div>
        {editing === null ? (
          <button
            type="button"
            className="add"
            onClick={() => {
              setEditing('new');
            }}
          >
            <IconPlus />
            {copy.add}
          </button>
        ) : null}
      </div>

      {editing !== null ? (
        <PersonForm
          person={editing === 'new' ? null : editing}
          companyId={id}
          onDone={done}
          onCancel={done}
        />
      ) : null}

      {people.isPending ? (
        <p className="status" role="status">
          {screens.common.loading}
        </p>
      ) : null}
      {people.isError ? <p role="alert">{people.error.message}</p> : null}

      {people.isSuccess && list.length === 0 && editing === null ? (
        <div className="soon2">
          <span className="ic">
            <IconPeople size={22} />
          </span>
          <h2>{copy.none}</h2>
          <p>{copy.noneBody}</p>
        </div>
      ) : null}

      {list.map((person) => {
        const flags = personFlags(person, authority, today);
        const state = visaState(person, today);
        const expiry = person.status.visaExpiry;
        const line = [person.identity.role, person.identity.nationality]
          .filter((part) => part !== '')
          .join(' · ');
        return (
          <div className={`visa${isSoon(state) ? ' soon' : ''}`} key={person.id}>
            <button
              type="button"
              className="open"
              onClick={() => {
                void navigate(`/companies/${id}/people/${person.id}`);
              }}
              aria-label={person.identity.name}
            />
            <span className="av3">{twoLetters(person.identity.name)}</span>
            <span className="bd">
              <span className="t">
                {person.identity.name}
                {flags.passport === 'blocks' ? (
                  <em className="flag">{copy.passportFirst}</em>
                ) : null}
                {flags.passport === 'missing' ? (
                  <em className="flag soft">{copy.passportMissing}</em>
                ) : null}
                {flags.insurance === 'blocks' ? (
                  <em className="flag">{copy.insuranceFirst}</em>
                ) : null}
                {flags.insurance === 'missing' ? (
                  <em className="flag soft">{copy.insuranceMissing}</em>
                ) : null}
              </span>
              <span className="s">{line}</span>
            </span>
            <span className="rt">
              {expiry !== null ? (
                <>
                  <span className="d">{formatLong(expiry)}</span>
                  <span className="c">{daysLine(expiry, today)}</span>
                </>
              ) : (
                <span className="c">{screens.common.noDate}</span>
              )}
            </span>
            <span className="acts">
              <button
                type="button"
                onClick={() => {
                  setEditing(person);
                }}
                aria-label={screens.common.edit}
              >
                <IconPen size={15} />
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}
