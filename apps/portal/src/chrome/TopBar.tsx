import { useCallback, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { primaryTabs } from './tabs';
import { ProfilePanel } from './ProfilePanel';
import { useHomeData } from '../data/bundles';
import { alertsOf } from '../lib/alerts';
import { IconBell, Logo } from '../lib/icons';
import { initialsOf, useSession } from '../lib/session';
import { en } from '../copy/en';
import { plural } from '../lib/format';
import { cx } from '../components/shared/cx';
import './TopBar.css';

// Lite's header: the mark, then the bell and the account at the end. The count on the bell,
// not only a dot: "there is something" and "there are three things" are not decided the same
// way. Beyond nine it says 9+, or the badge stretches and pushes the bell over. The bell opens
// the inbox; the avatar opens the profile panel.
export function TopBar() {
  const session = useSession();
  const home = useHomeData();
  const { pathname } = useLocation();
  // The panel remembers where it was opened: a new screen closes it, because it was the way
  // there and not a companion.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const close = useCallback(() => {
    setOpenAt(null);
  }, []);
  const unread = home.companies.reduce(
    (sum, company) => sum + alertsOf(company.bundle, company.entries, home.today).length,
    0,
  );
  const inside = pathname.startsWith('/me');
  return (
    <header className="top-bar">
      <NavLink to="/" className="top-bar__mark" aria-label="Boasis home">
        <Logo size={28} />
        <span className="top-bar__name">{en.brand.name}</span>
      </NavLink>
      <div className="top-bar__right">
        <NavLink
          to="/inbox"
          className="top-bar__icon-button"
          aria-label={
            unread > 0
              ? plural(unread, en.nav.notificationsCount.one, en.nav.notificationsCount.other)
              : en.nav.notifications
          }
        >
          <IconBell />
          {unread > 0 ? (
            <span className="top-bar__badge">{unread > 9 ? '9+' : String(unread)}</span>
          ) : null}
        </NavLink>
        <div className="top-bar__account">
          <button
            type="button"
            className={cx('top-bar__me', (open || inside) && 'top-bar__me--on')}
            aria-label={en.nav.account}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => {
              setOpenAt(open ? null : pathname);
            }}
          >
            {session === null ? '?' : initialsOf(session)}
          </button>
          {session === null ? null : (
            <ProfilePanel
              open={open}
              session={session}
              initials={initialsOf(session)}
              onClose={close}
            />
          )}
        </div>
      </div>
    </header>
  );
}

// The rail on a wide screen: fixed width, every tab says its name. A rail that resizes when you
// change screen is a moving target.
export function Rail() {
  return (
    <nav className="rail" aria-label="Primary">
      {primaryTabs.map(({ to, label, end, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          title={label}
          className={({ isActive }) => `rail__tab${isActive ? ' rail__tab--on' : ''}`}
        >
          <Icon />
          <span className="rail__label">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
