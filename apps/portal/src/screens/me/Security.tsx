import { useState } from 'react';
import { Toggle } from '../../components';
import { ChevronIcon } from '../../components/shared/icons';
import { me, screens } from '../../copy/en';
import { formatLong } from '../../lib/format';
import { updateSession, useSession } from '../../lib/session';
import { today } from '../../lib/today';
import { MeHead } from './rows';
import '../lite.css';
import '../ReminderSettings.css';
import '../Account.css';
import './Security.css';

// Security and passwords (screen 18): change the password, the two-step switch, and where you
// are signed in. Everything writes to the mock session, and each placeholder says so in words.
export function Security() {
  const session = useSession();
  const [changing, setChanging] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  if (session === null) {
    return null;
  }

  const change = () => {
    if (next.length < 8) {
      setError(me.security.short);
      return;
    }
    if (next !== again) {
      setError(me.security.mismatch);
      return;
    }
    updateSession({ passwordChangedOn: today() });
    setChanging(false);
    setCurrent('');
    setNext('');
    setAgain('');
    setError('');
    setDone(true);
  };

  return (
    <div className="pg acct sec">
      <MeHead title={me.security.title} sub={me.security.sub} />

      <div className="abox">
        <div className="hd">
          <h3>{me.security.password}</h3>
          <p>{me.security.placeholderNote}</p>
        </div>
        {changing ? (
          <form
            className="pwform"
            onSubmit={(event) => {
              event.preventDefault();
              change();
            }}
          >
            <label className="pwform__field">
              <span>{me.security.current}</span>
              <input
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(event) => {
                  setCurrent(event.currentTarget.value);
                }}
              />
            </label>
            <label className="pwform__field">
              <span>{me.security.next}</span>
              <input
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(event) => {
                  setNext(event.currentTarget.value);
                }}
              />
            </label>
            <label className="pwform__field">
              <span>{me.security.again}</span>
              <input
                type="password"
                autoComplete="new-password"
                value={again}
                onChange={(event) => {
                  setAgain(event.currentTarget.value);
                }}
              />
            </label>
            {error !== '' ? (
              <div className="ferr" role="alert">
                {error}
              </div>
            ) : null}
            <div className="formfoot">
              <button type="submit" className="p" disabled={next === '' || again === ''}>
                {me.security.save}
              </button>
              <button
                type="button"
                className="g"
                onClick={() => {
                  setChanging(false);
                  setError('');
                }}
              >
                {screens.common.close}
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            className="arow keep"
            onClick={() => {
              setDone(false);
              setChanging(true);
            }}
          >
            <span className="k">{me.security.password}</span>
            <span className="v">
              {me.security.change}
              <small>
                {done
                  ? me.security.saved
                  : session.passwordChangedOn === null
                    ? me.security.neverChanged
                    : me.security.changed(formatLong(session.passwordChangedOn))}
              </small>
            </span>
            <ChevronIcon className="go" />
          </button>
        )}
      </div>

      <div className="abox">
        <div className="hd">
          <h3>{me.security.twoStep}</h3>
          <p>{me.security.twoStepPlaceholder}</p>
        </div>
        <div className="arow keep">
          <span className="k">{me.security.twoStep}</span>
          <span className="v">
            <small>{me.security.twoStepNote}</small>
          </span>
          <Toggle
            label={me.security.twoStep}
            checked={session.twoStepOn}
            onChange={(twoStepOn) => {
              updateSession({ twoStepOn });
            }}
          />
        </div>
      </div>

      <div className="abox">
        <div className="hd">
          <h3>{me.security.sessions}</h3>
          <p>{me.security.sessionsNote}</p>
        </div>
        <div className="arow keep">
          <span className="k">{me.security.thisDevice}</span>
          <span className="v">
            {session.email}
            <small>
              {session.signedInOn === null
                ? me.security.signedInUnknown
                : me.security.signedIn(formatLong(session.signedInOn))}
            </small>
          </span>
        </div>
      </div>
    </div>
  );
}
