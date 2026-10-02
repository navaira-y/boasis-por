import { useNavigate, useParams } from 'react-router-dom';
import { en } from '../copy/en';
import { IconChevron, IconDoc } from '../lib/icons';
import './lite.css';

// The company file route, until its screen is built: lite's coming-soon block and the way back
// to the company. No route parameter is ever shown.
export function CompanyFile() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  return (
    <div className="pg">
      <button
        type="button"
        className="back"
        onClick={() => {
          void navigate(`/companies/${id}`);
        }}
      >
        <IconChevron className="rev" size={15} />
        {en.companyFile.back}
      </button>
      <div className="soon2">
        <span className="ic">
          <IconDoc size={22} />
        </span>
        <h2>{en.companyFile.soonTitle}</h2>
        <p>{en.companyFile.soonBody}</p>
      </div>
    </div>
  );
}
