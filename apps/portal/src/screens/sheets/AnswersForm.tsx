import type { Answer, AnswerValue, QuestionId } from '@boasis/schema';
import { questionsToAsk, type Question } from '@boasis/rules';
import { useState } from 'react';
import { TextField } from '../../components/Field/Field';
import { Picker } from '../../components/Picker/Picker';
import { en } from '../../copy/en';
import type { Bundle } from '../../lib/entries';
import { today } from '../../lib/today';
import './sheets.css';

// How each question is answered: yes or no, a number of days or dirhams, or a list of words.
type Shape = 'boolean' | 'number' | 'list';

const SHAPE: Readonly<Record<QuestionId, Shape>> = {
  auditRequiredForRenewal: 'boolean',
  cancellationWindowDays: 'number',
  cancellationFeeInsideAed: 'number',
  cancellationFeeOutsideAed: 'number',
  renewalBundle: 'list',
  wpsApplies: 'boolean',
  ejariRequired: 'boolean',
  generalAssemblyRequired: 'boolean',
  leaseMinimumRemainingDays: 'number',
};

function valueOf(question: Question, raw: string): AnswerValue | null {
  if (raw === '') {
    return null;
  }
  switch (SHAPE[question.id]) {
    case 'boolean':
      return raw === 'true';
    case 'number': {
      const number = Number(raw);
      return Number.isFinite(number) ? number : null;
    }
    case 'list':
      return raw.trim() === '' ? null : raw.trim();
  }
}

export interface AnswersState {
  readonly questions: Question[];
  readonly draft: Partial<Record<QuestionId, string>>;
  readonly set: (id: QuestionId, value: string) => void;
  // Only what was answered, dated today: a question left open stays open.
  readonly answers: () => Answer[];
}

// The questions that buy the dates the licence form cannot compute (packages/rules
// questionsToAsk), shared by the answers sheet and the add company flow.
export function useAnswers(bundle: Bundle): AnswersState {
  const [draft, setDraft] = useState<Partial<Record<QuestionId, string>>>({});
  const questions: Question[] = questionsToAsk({
    facts: bundle.facts,
    authority: bundle.authority,
    documents: bundle.documents,
  });
  const set = (id: QuestionId, value: string) => {
    setDraft((current) => ({ ...current, [id]: value }));
  };
  const answers = (): Answer[] => {
    const day = today();
    const list: Answer[] = [];
    for (const question of questions) {
      const value = valueOf(question, draft[question.id] ?? '');
      if (value !== null) {
        list.push({
          questionId: question.id,
          answer: value,
          answeredOn: day,
          source: 'owner-answer',
        });
      }
    }
    return list;
  };
  return { questions, draft, set, answers };
}

export function AnswerFields({ state }: { readonly state: AnswersState }) {
  const { questions, draft, set } = state;
  return (
    <>
      {questions.length === 0 ? <p className="sheet-p">{en.answers.nothing}</p> : null}
      {questions.map((question) => {
        const raw = draft[question.id] ?? '';
        const shape = SHAPE[question.id];
        return (
          <div className="qgrp" key={question.id}>
            <h4 className="qgrp__q">{question.text}</h4>
            <p className="fq">
              {en.answers.unblocks.replace('{requirement}', question.unblocks.replace(/-/g, ' '))}
            </p>
            {shape === 'boolean' ? (
              <Picker
                label={question.text}
                value={raw === '' ? null : raw}
                placeholder={en.answers.later}
                options={[
                  { value: 'true', label: en.answers.yes },
                  { value: 'false', label: en.answers.no },
                ]}
                onChange={(value) => {
                  set(question.id, value);
                }}
              />
            ) : (
              <TextField
                label={shape === 'number' ? en.answers.number : en.answers.list}
                type={shape === 'number' ? 'number' : 'text'}
                value={raw}
                onChange={(value) => {
                  set(question.id, value);
                }}
                placeholder={shape === 'number' ? '0' : 'licence, flexi-desk'}
              />
            )}
          </div>
        );
      })}
    </>
  );
}
