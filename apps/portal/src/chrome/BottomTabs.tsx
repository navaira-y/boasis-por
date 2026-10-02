import { NavLink } from 'react-router-dom';
import { primaryTabs } from './tabs';
import './BottomTabs.css';

// Phone widths only: lite's floating bar, icons alone, edge to edge so each one has its zone.
// The name stays on the link for a screen reader.
export function BottomTabs() {
  return (
    <nav className="bottom-tabs" aria-label="Primary, phone">
      {primaryTabs.map(({ to, label, end, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          aria-label={label}
          title={label}
          className={({ isActive }) => `bottom-tabs__tab${isActive ? ' bottom-tabs__tab--on' : ''}`}
        >
          <Icon size={22} />
        </NavLink>
      ))}
    </nav>
  );
}
