import { useState } from 'react';
import { Button } from '../../components/Button/Button';
import { DateField } from '../../components/Field/Field';
import { Sheet } from '../../components/Sheet/Sheet';
import { cx } from '../../components/shared/cx';
import { en } from '../../copy/en';
import { useRefresh } from '../../data/bundles';
import { useRepos } from '../../data/ReposProvider';
import type { Bundle } from '../../lib/entries';
import { formatLong } from '../../lib/format';
import { today } from '../../lib/today';
import './sheets.css';
import { addDays } from '@boasis/rules';
import { federalRules } from '../../content/federal';

export interface EventSheetProps {
  readonly open: boolean;
  readonly bundle: Bundle;
  readonly onClose: () => void;
}

// Declaring a change. The register of beneficial owners must be updated within fifteen days of
// a change of shareholder, and no calendar says when someone sells their shares. The answer is
// not to guess: the person says what happened, and the clock starts (packages/rules).
export function EventSheet({ open, bundle, onClose }: EventSheetProps) {
  const repos = useRepos();
  const refresh = useRefresh();
  const [when, setWhen] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [due, setDue] = useState<string | null>(null);

  async function declare() {
    if (busy || when === '') {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await repos.companies.update(bundle.facts.id, {
        ubo: { declaredOn: bundle.facts.ubo?.declaredOn ?? null, lastOwnershipChangeOn: when },
      });
      await refresh();
      setDue(addDays(when, federalRules.ubo.updateDays.value));
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
    setBusy(false);
  }

  return (
    <Sheet
      open={open}
      kicker={bundle.facts.identity.tradeName}
      title={en.event.title}
      subtitle={en.event.sub}
      onClose={onClose}
      footer={
        due !== null ? (
          <Button variant="primary" onClick={onClose}>
            {en.answers.close}
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              {en.answers.close}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                void declare();
              }}
              disabled={busy || when === ''}
              loading={busy}
            >
              {busy ? en.addCompany.busy : en.event.declare}
            </Button>
          </>
        )
      }
    >
      {due !== null ? (
        <p className="sheet-p">
          {en.event.done} <b>{formatLong(due)}</b>
        </p>
      ) : (
        <>
          <div className={cx('pickrow', 'pickrow--on')} role="radio" aria-checked="true">
            <span className="pickrow__bd">
              <span className="pickrow__t">{en.event.ubo}</span>
              <span className="pickrow__s">{en.event.uboHint}</span>
            </span>
            <span className="pickrow__mark" aria-hidden="true" />
          </div>
          <div className="sheet-blk" style={{ marginBlockStart: 18 }}>
            {/* Not in the future: nobody declares what has not happened. */}
            <DateField label={en.event.when} value={when} onChange={setWhen} max={today()} />
          </div>
          {error !== '' ? (
            <div className="sheet-ferr" role="alert">
              {error}
            </div>
          ) : null}
        </>
      )}
    </Sheet>
  );
}
