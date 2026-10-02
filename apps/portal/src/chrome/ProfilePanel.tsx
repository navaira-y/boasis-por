import { useEffect, useRef, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sheet } from '../components/Sheet/Sheet';
import { useLayout } from '../components/shared/LayerProvider';
import { me } from '../copy/en';
import {
  IconBell,
  IconCard,
  IconCompany,
  IconKey,
  IconPerson,
  IconShield,
  IconSignOut,
} from '../lib/icons';
import { displayName, signOut, type Session } from '../lib/session';
import './ProfilePanel.css';

interface Entry {
  readonly to: string;
  readonly label: string;
  readonly Icon: ComponentType<{ readonly size?: number }>;
}

// The six screens behind the avatar, each a route under /me, and sign out at the bottom.
export const PROFILE_ENTRIES: readonly Entry[] = [
  { to: '/me/profile', label: me.panel.profile, Icon: IconPerson },
  { to: '/me/security', label: me.panel.security, Icon: IconShield },
  { to: '/me/access', label: me.panel.access, Icon: IconKey },
  { to: '/me/notifications', label: me.panel.notifications, Icon: IconBell },
  { to: '/me/billing', label: me.panel.billing, Icon: IconCard },
  { to: '/me/companies', label: me.panel.companies, Icon: IconCompany },
];

export interface ProfilePanelProps {
  readonly open: boolean;
  readonly session: Session;
  readonly initials: string;
  readonly onClose: () => void;
}

// Tapping the avatar: a sheet on a phone, a menu panel under the avatar on a desktop. One list
// in both, so the two cannot drift.
export function ProfilePanel({ open, session, initials, onClose }: ProfilePanelProps) {
  const layout = useLayout();
  const navigate = useNavigate();
  const panel = useRef<HTMLDivElement>(null);

  const go = (to: string) => {
    onClose();
    void navigate(to);
  };
  const leave = () => {
    onClose();
    signOut();
    void navigate('/auth');
  };

  // The desktop menu closes on a click outside and on Escape, as lite's picker menu does.
  useEffect(() => {
    if (!open || layout !== 'desktop') {
      return undefined;
    }
    const onDown = (event: MouseEvent) => {
      const node = panel.current;
      if (node !== null && event.target instanceof Node && !node.contains(event.target)) {
        onClose();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, layout, onClose]);

  const list = (
    <div className="pmenu__list" role="menu" aria-label={me.panel.title}>
      {PROFILE_ENTRIES.map(({ to, label, Icon }) => (
        <button
          key={to}
          type="button"
          role="menuitem"
          className="pmenu__item"
          onClick={() => {
            go(to);
          }}
        >
          <Icon size={18} />
          <span className="pmenu__label">{label}</span>
        </button>
      ))}
      <button
        type="button"
        role="menuitem"
        className="pmenu__item pmenu__item--out"
        onClick={leave}
      >
        <IconSignOut size={18} />
        <span className="pmenu__label">{me.panel.signOut}</span>
      </button>
    </div>
  );

  if (layout === 'phone') {
    return (
      <Sheet
        open={open}
        title={displayName(session)}
        subtitle={session.email}
        onClose={onClose}
        className="pmenu-sheet"
      >
        {list}
      </Sheet>
    );
  }

  if (!open) {
    return null;
  }
  return (
    <div ref={panel} className="pmenu" data-testid="profile-panel">
      <div className="pmenu__who">
        <span className="pmenu__big">{initials}</span>
        <span className="pmenu__text">
          <span className="pmenu__name">{displayName(session)}</span>
          <span className="pmenu__email">{session.email}</span>
        </span>
      </div>
      {list}
    </div>
  );
}
