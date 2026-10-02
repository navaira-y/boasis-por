import { Link } from 'react-router-dom';
import { en } from '../copy/en';
import { IconChevron } from '../lib/icons';
import { IconSpark, IconUpload } from './icons';
import './lite.css';
import './AddCompany.css';

// Screen 19 (spec 14): two doors, in lite's card language. A new company hands over to the
// Brain (the guided setup); one you already hold is brought in with its licence.
export function AddCompany() {
  const doors = [
    {
      to: '/add-company/new',
      title: en.addEntry.newTitle,
      line: en.addEntry.newLine,
      Icon: IconSpark,
    },
    {
      to: '/add-company/existing',
      title: en.addEntry.existingTitle,
      line: en.addEntry.existingLine,
      Icon: IconUpload,
    },
  ] as const;
  return (
    <div className="pg addco">
      <div className="vhead">
        <div>
          <h2>{en.addEntry.title}</h2>
          <p>{en.addEntry.sub}</p>
        </div>
      </div>
      {doors.map(({ to, title, line, Icon }) => (
        <Link key={to} to={to} className="door">
          <span className="door__ic">
            <Icon size={22} />
          </span>
          <span className="door__bd">
            <span className="door__t">{title}</span>
            <span className="door__s">{line}</span>
          </span>
          <IconChevron className="door__go" size={16} />
        </Link>
      ))}
    </div>
  );
}
