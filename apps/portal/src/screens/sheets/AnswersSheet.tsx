import { useState } from 'react';
import { Button } from '../../components/Button/Button';
import { Sheet } from '../../components/Sheet/Sheet';
import { en } from '../../copy/en';
import { useRefresh } from '../../data/bundles';
import { useRepos } from '../../data/ReposProvider';
import type { Bundle } from '../../lib/entries';
import { plural } from '../../lib/format';
import { AnswerFields, useAnswers } from './AnswersForm';
import './sheets.css';

export interface AnswersSheetProps {
  readonly open: boolean;
  readonly bundle: Bundle;
  readonly onClose: () => void;
}

// The questions that buy the dates the licence form cannot compute (packages/rules
// questionsToAsk). Two rules hold this screen: you can close it at any time, because a rule
// without its field produces nothing and nothing beats a guess; and only what was answered is
// written, so a question left open stays open rather than being wiped.
export function AnswersSheet({ open, bundle, onClose }: AnswersSheetProps) {
  const repos = useRepos();
  const refresh = useRefresh();
  const state = useAnswers(bundle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (busy) {
      return;
    }
    const answers = state.answers();
    if (answers.length === 0) {
      onClose();
      return;
    }
    setBusy(true);
    setError('');
    try {
      await repos.companies.update(bundle.facts.id, {
        answers: [...(bundle.facts.answers ?? []), ...answers],
      });
      await refresh();
      setBusy(false);
      onClose();
    } catch (failure: unknown) {
      setBusy(false);
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }

  return (
    <Sheet
      open={open}
      kicker={bundle.facts.identity.tradeName}
      title={en.answers.title}
      subtitle={
        state.questions.length === 0
          ? en.answers.nothing
          : plural(state.questions.length, en.answers.sub.one, en.answers.sub.other)
      }
      onClose={onClose}
      footer={
        <>
          {/* Closing without answering is a normal exit, not giving up. */}
          <Button variant="secondary" onClick={onClose}>
            {en.answers.close}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              void save();
            }}
            disabled={busy}
            loading={busy}
          >
            {busy ? en.addCompany.busy : en.answers.save}
          </Button>
        </>
      }
    >
      <AnswerFields state={state} />
      {error !== '' ? (
        <div className="sheet-ferr" role="alert">
          {error}
        </div>
      ) : null}
    </Sheet>
  );
}
