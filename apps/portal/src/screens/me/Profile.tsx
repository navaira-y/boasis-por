import { me, screens } from '../../copy/en';
import { displayName, initialsOf, updateSession, useSession } from '../../lib/session';
import { EditLine, MeHead, PickLine } from './rows';
import '../lite.css';
import '../ReminderSettings.css';
import '../Account.css';

const copy = screens.account;

// Profile (screen 18): the initials, the name, the email, the mobile, and the language, which
// is English for now. Each row is saved as it is left, into the mock session.
export function Profile() {
  const session = useSession();
  if (session === null) {
    return null;
  }
  return (
    <div className="pg acct">
      <MeHead title={me.profile.title} sub={me.profile.sub} />
      <div className="abox">
        <div className="pic">
          <div className="big">{initialsOf(session)}</div>
          <div>
            <div className="nm">{displayName(session)}</div>
            <div className="em">{session.email}</div>
          </div>
        </div>
        <EditLine
          label={copy.firstName}
          value={session.firstName}
          placeholder="Layla"
          onSave={(firstName) => {
            updateSession({ firstName });
          }}
        />
        <EditLine
          label={copy.lastName}
          value={session.lastName}
          placeholder="Haddad"
          onSave={(lastName) => {
            updateSession({ lastName });
          }}
        />
        <div className="arow keep">
          <span className="k">{copy.email}</span>
          <span className="v">
            {session.email}
            <small>{copy.emailNote}</small>
          </span>
        </div>
        <EditLine
          label={copy.mobile}
          value={session.phone}
          type="tel"
          placeholder={copy.mobilePlaceholder}
          note={copy.mobileNote}
          onSave={(phone) => {
            updateSession({ phone });
          }}
        />
        <PickLine
          label={copy.language}
          value="en"
          options={[{ value: 'en', label: 'English' }]}
          note={me.profile.languageNote}
          disabled
          onSave={() => undefined}
        />
      </div>
    </div>
  );
}
