import { notAvailableJourney } from '@boasis/assistant';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { en } from '../../copy/en';
import { useRefresh } from '../../data/bundles';
import { IconSpark } from '../icons';
import '../lite.css';
import '../AddCompany.css';

// The new-company door. It asks the setup journey to start; today the journey is not
// available, so the screen says in plain words what will be here. When the Brain lands behind
// the same interface, the journey returns a company and the screen opens it.
export function AddNew() {
  const navigate = useNavigate();
  const refresh = useRefresh();
  const [state, setState] = useState<'asking' | 'soon'>('asking');

  useEffect(() => {
    let alive = true;
    notAvailableJourney.start().then(
      async (facts) => {
        if (alive) {
          await refresh();
          void navigate(`/companies/${facts.id}`, { replace: true });
        }
      },
      () => {
        if (alive) {
          setState('soon');
        }
      },
    );
    return () => {
      alive = false;
    };
  }, [navigate, refresh]);

  return (
    <div className="pg addnew">
      <div className="vhead">
        <div>
          <h2>{en.addEntry.newTitle}</h2>
          <p>{en.addEntry.newLine}</p>
        </div>
      </div>
      {state === 'soon' ? (
        <>
          <div className="soon2">
            <span className="ic">
              <IconSpark size={22} />
            </span>
            <h2>{en.addEntry.soonTitle}</h2>
            <p>{en.addEntry.soonBody}</p>
          </div>
          <div className="back2">
            <button
              type="button"
              className="add g"
              onClick={() => {
                void navigate('/add-company');
              }}
            >
              {en.addEntry.back}
            </button>
          </div>
        </>
      ) : (
        <p className="status" role="status">
          {en.addCompany.busy}
        </p>
      )}
    </div>
  );
}
