import { useEffect, useRef, useState } from 'react';
import { Picker } from '../../components';
import { ChevronIcon } from '../../components/shared/icons';
import { screens } from '../../copy/en';

const copy = screens.account;

// Lite's account rows (src/pages/AccountPage.jsx), shared by the screens under /me: a row you
// edit in place, a row whose value is picked from a list, and the saved flash.
export type SaveState = '' | 'saving' | 'saved' | { error: string };

export function Status({ state }: { state: SaveState }) {
  if (state === '') {
    return null;
  }
  if (state === 'saving') {
    return <span className="stt">{copy.saving}</span>;
  }
  if (state === 'saved') {
    return <span className="stt ok">{copy.saved}</span>;
  }
  return <span className="stt bad">{state.error}</span>;
}

export function useSavedFlash(state: SaveState, reset: () => void) {
  useEffect(() => {
    if (state !== 'saved') {
      return undefined;
    }
    const timer = setTimeout(reset, 1800);
    return () => {
      clearTimeout(timer);
    };
  }, [state, reset]);
}

// A row you can edit in place: click, type, press Enter or click away.
export function EditLine({
  label,
  value,
  note,
  placeholder,
  type = 'text',
  validate,
  onSave,
}: {
  label: string;
  value: string;
  note?: string;
  placeholder?: string;
  type?: 'text' | 'tel' | 'email';
  validate?: (next: string) => string | null;
  onSave: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [state, setState] = useState<SaveState>('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      input.current?.focus();
    }
  }, [editing]);
  useSavedFlash(state, () => {
    setState('');
  });

  const commit = (next: string) => {
    setEditing(false);
    if (next === value) {
      return;
    }
    const invalid = validate?.(next) ?? null;
    if (invalid !== null) {
      setState({ error: invalid });
      setDraft(value);
      return;
    }
    setState('saving');
    onSave(next);
    setState('saved');
  };

  if (editing) {
    return (
      <div className="arow keep">
        <span className="k">{label}</span>
        <span className="v">
          <input
            ref={input}
            className="inl"
            type={type}
            value={draft}
            placeholder={placeholder}
            aria-label={label}
            onChange={(event) => {
              setDraft(event.currentTarget.value);
            }}
            onBlur={() => {
              commit(draft.trim());
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                commit(draft.trim());
              }
              if (event.key === 'Escape') {
                setDraft(value);
                setEditing(false);
              }
            }}
          />
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="arow keep"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
    >
      <span className="k">{label}</span>
      <span className="v">
        {value !== '' ? value : <span className="notset">{placeholder ?? copy.notSet}</span>}
        {note !== undefined ? <small>{note}</small> : null}
      </span>
      <Status state={state} />
      <ChevronIcon className="go" />
    </button>
  );
}

// A row whose value is chosen from a list rather than typed.
export function PickLine<V extends string>({
  label,
  value,
  options,
  note,
  disabled,
  onSave,
}: {
  label: string;
  value: V;
  options: readonly { value: V; label: string; note?: string }[];
  note?: string;
  disabled?: boolean;
  onSave: (next: V) => void;
}) {
  const [state, setState] = useState<SaveState>('');
  useSavedFlash(state, () => {
    setState('');
  });
  return (
    <div className="arow keep">
      <span className="k">{label}</span>
      <span className="v pk">
        <Picker
          label={label}
          value={value}
          options={options}
          size="sm"
          disabled={disabled}
          onChange={(next) => {
            setState('saving');
            onSave(next);
            setState('saved');
          }}
        />
        {note !== undefined ? <small>{note}</small> : null}
      </span>
      <Status state={state} />
    </div>
  );
}

// The head of every screen under /me: the title and one line, in lite's vhead.
export function MeHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="vhead">
      <div>
        <h2>{title}</h2>
        <p>{sub}</p>
      </div>
    </div>
  );
}
