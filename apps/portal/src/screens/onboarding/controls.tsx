import {
  daysInMonth,
  isFarFuture,
  itemStatus,
  type DatedItem,
  type RuleBasis,
} from '@boasis/rules';
import type { IsoDate, MonthDay } from '@boasis/schema';
import { useId, useState, type ReactNode } from 'react';
import { onboarding as copy } from '../../copy/en';
import { describeFile, type PickedFile } from '../../lib/files';
import { formatLong } from '../../lib/format';
import { today } from '../../lib/today';

// The controls every onboarding step is built from. Each one is a labelled fieldset or field,
// its reason line tied to the control, and its error announced and tied to the control too
// (section B and the brief's accessibility rules).

// ---------------------------------------------------------------------------------------------
// Dates: day, month and year pickers (section B.7)

export interface DateParts {
  readonly day: string;
  readonly month: string;
  readonly year: string;
}

export const NO_DATE: DateParts = { day: '', month: '', year: '' };

export function partsOf(date: IsoDate | null): DateParts {
  if (date === null) {
    return NO_DATE;
  }
  const [year = '', month = '', day = ''] = date.split('-');
  return { day: String(Number(day)), month: String(Number(month)), year };
}

// What the parts spell: nothing chosen, only some chosen, or a date.
export type DateRead<T> = { kind: 'empty' } | { kind: 'partial' } | { kind: 'date'; value: T };

export function dateOf(parts: DateParts): DateRead<IsoDate> {
  const chosen = [parts.day, parts.month, parts.year].filter((part) => part !== '').length;
  if (chosen === 0) {
    return { kind: 'empty' };
  }
  if (chosen < 3) {
    return { kind: 'partial' };
  }
  return {
    kind: 'date',
    value: `${parts.year}-${parts.month.padStart(2, '0')}-${parts.day.padStart(2, '0')}`,
  };
}

// The date the parts spell, or null.
export function dateValue(parts: DateParts): IsoDate | null {
  const read = dateOf(parts);
  return read.kind === 'date' ? read.value : null;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

// The years offered: thirty back, twenty ahead, so the "more than ten years" check can be met.
function yearsAround(today: IsoDate): number[] {
  const now = Number(today.slice(0, 4));
  const years: number[] = [];
  for (let year = now + 20; year >= now - 30; year -= 1) {
    years.push(year);
  }
  return years;
}

export interface DateEntryProps {
  readonly label: string;
  readonly why?: string;
  readonly value: DateParts;
  readonly onChange: (value: DateParts) => void;
  readonly today: IsoDate;
  readonly error?: string;
  readonly required?: boolean;
  // Section B.7: a date more than ten years out asks "Is this right?" before it is accepted.
  readonly confirmed?: boolean;
  readonly onConfirm?: (confirmed: boolean) => void;
  readonly testId?: string;
}

export function DateEntry({
  label,
  why,
  value,
  onChange,
  today,
  error,
  required,
  confirmed,
  onConfirm,
  testId,
}: DateEntryProps) {
  const id = useId();
  const whyId = `${id}-why`;
  const errorId = `${id}-error`;
  const described = [why !== undefined ? whyId : null, error !== undefined ? errorId : null]
    .filter((entry) => entry !== null)
    .join(' ');
  const year = Number(value.year);
  const month = Number(value.month);
  const dayCount = value.month !== '' && value.year !== '' ? daysInMonth(year, month) : 31;
  const date = dateValue(value);
  const far = date !== null && isFarFuture(date, today);
  const set = (patch: Partial<DateParts>) => {
    const next = { ...value, ...patch };
    // A day the month does not have is cleared rather than silently moved.
    if (next.day !== '' && next.month !== '' && next.year !== '') {
      if (Number(next.day) > daysInMonth(Number(next.year), Number(next.month))) {
        next.day = '';
      }
    }
    onChange(next);
    onConfirm?.(false);
  };
  return (
    <fieldset
      className={`ob-date${error !== undefined ? ' ob-date--error' : ''}`}
      aria-describedby={described === '' ? undefined : described}
      data-testid={testId}
    >
      <legend className="ob-label">
        {label}
        {required === true ? <span className="ob-req"> ({copy.common.required})</span> : null}
      </legend>
      <div className="ob-date__row">
        <label className="ob-date__part">
          <span className="ob-date__name">{copy.common.day}</span>
          <select
            className="ob-select"
            value={value.day}
            aria-invalid={error !== undefined || undefined}
            onChange={(event) => {
              set({ day: event.currentTarget.value });
            }}
          >
            <option value="">{copy.common.day}</option>
            {Array.from({ length: dayCount }, (_, index) => String(index + 1)).map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
        </label>
        <label className="ob-date__part ob-date__part--month">
          <span className="ob-date__name">{copy.common.month}</span>
          <select
            className="ob-select"
            value={value.month}
            aria-invalid={error !== undefined || undefined}
            onChange={(event) => {
              set({ month: event.currentTarget.value });
            }}
          >
            <option value="">{copy.common.month}</option>
            {MONTHS.map((name, index) => (
              <option key={name} value={String(index + 1)}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="ob-date__part">
          <span className="ob-date__name">{copy.common.year}</span>
          <select
            className="ob-select"
            value={value.year}
            aria-invalid={error !== undefined || undefined}
            onChange={(event) => {
              set({ year: event.currentTarget.value });
            }}
          >
            <option value="">{copy.common.year}</option>
            {yearsAround(today).map((entry) => (
              <option key={entry} value={String(entry)}>
                {entry}
              </option>
            ))}
          </select>
        </label>
      </div>
      {why !== undefined ? (
        <p className="ob-why" id={whyId}>
          {why}
        </p>
      ) : null}
      {far && onConfirm !== undefined ? (
        <div className="ob-confirm" role="status">
          <span>{copy.common.farFuture}</span>
          <label className="ob-check">
            <input
              type="checkbox"
              aria-label={copy.common.farFutureConfirm}
              checked={confirmed === true}
              onChange={(event) => {
                onConfirm(event.currentTarget.checked);
              }}
            />
            <span>{copy.common.farFutureConfirm}</span>
          </label>
        </div>
      ) : null}
      {error !== undefined ? (
        <p className="ob-error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

// The check section B.7 asks of every date field. Returns the error to show, or undefined.
export function dateError(
  parts: DateParts,
  today: IsoDate,
  confirmed: boolean,
): string | undefined {
  const date = dateOf(parts);
  if (date.kind === 'partial') {
    return copy.common.incompleteDate;
  }
  if (date.kind === 'date' && isFarFuture(date.value, today) && !confirmed) {
    return copy.common.farFuture;
  }
  return undefined;
}

// A day and a month with no year, for the financial year end.
export interface MonthDayEntryProps {
  readonly label: string;
  readonly why?: string;
  readonly value: { day: string; month: string };
  readonly onChange: (value: { day: string; month: string }) => void;
  readonly error?: string;
}

export function monthDayOf(value: { day: string; month: string }): DateRead<MonthDay> {
  if (value.day === '' && value.month === '') {
    return { kind: 'empty' };
  }
  if (value.day === '' || value.month === '') {
    return { kind: 'partial' };
  }
  return { kind: 'date', value: `${value.month.padStart(2, '0')}-${value.day.padStart(2, '0')}` };
}

export function MonthDayEntry({ label, why, value, onChange, error }: MonthDayEntryProps) {
  const id = useId();
  const described = [
    why !== undefined ? `${id}-why` : null,
    error !== undefined ? `${id}-error` : null,
  ]
    .filter((entry) => entry !== null)
    .join(' ');
  // A leap year, so 29 February can be chosen as a year end.
  const dayCount = value.month === '' ? 31 : daysInMonth(2028, Number(value.month));
  return (
    <fieldset
      className={`ob-date${error !== undefined ? ' ob-date--error' : ''}`}
      aria-describedby={described === '' ? undefined : described}
    >
      <legend className="ob-label">{label}</legend>
      <div className="ob-date__row">
        <label className="ob-date__part">
          <span className="ob-date__name">{copy.common.day}</span>
          <select
            className="ob-select"
            value={value.day}
            onChange={(event) => {
              onChange({ ...value, day: event.currentTarget.value });
            }}
          >
            <option value="">{copy.common.day}</option>
            {Array.from({ length: dayCount }, (_, index) => String(index + 1)).map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
        </label>
        <label className="ob-date__part ob-date__part--month">
          <span className="ob-date__name">{copy.common.month}</span>
          <select
            className="ob-select"
            value={value.month}
            onChange={(event) => {
              const month = event.currentTarget.value;
              const max = month === '' ? 31 : daysInMonth(2028, Number(month));
              onChange({
                month,
                day: value.day !== '' && Number(value.day) > max ? '' : value.day,
              });
            }}
          >
            <option value="">{copy.common.month}</option>
            {MONTHS.map((name, index) => (
              <option key={name} value={String(index + 1)}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {why !== undefined ? (
        <p className="ob-why" id={`${id}-why`}>
          {why}
        </p>
      ) : null}
      {error !== undefined ? (
        <p className="ob-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------------------------
// A choice among a few answers, as a radio group

export interface ChoiceOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

export interface ChoiceProps<T extends string> {
  readonly label: string;
  readonly why?: string;
  readonly options: readonly ChoiceOption<T>[];
  readonly value: T | '';
  readonly onChange: (value: T) => void;
  readonly error?: string;
  readonly required?: boolean;
  readonly name?: string;
}

export function Choice<T extends string>({
  label,
  why,
  options,
  value,
  onChange,
  error,
  required,
  name,
}: ChoiceProps<T>) {
  const id = useId();
  const groupName = name ?? id;
  const described = [
    why !== undefined ? `${id}-why` : null,
    error !== undefined ? `${id}-error` : null,
  ]
    .filter((entry) => entry !== null)
    .join(' ');
  return (
    <fieldset
      className={`ob-choice${error !== undefined ? ' ob-choice--error' : ''}`}
      aria-describedby={described === '' ? undefined : described}
    >
      <legend className="ob-label">
        {label}
        {required === true ? <span className="ob-req"> ({copy.common.required})</span> : null}
      </legend>
      <div className="ob-choice__row">
        {options.map((option) => (
          <label
            key={option.value}
            className={`ob-pill${value === option.value ? ' ob-pill--on' : ''}`}
          >
            <input
              type="radio"
              name={groupName}
              value={option.value}
              aria-label={option.label}
              checked={value === option.value}
              aria-invalid={error !== undefined || undefined}
              onChange={() => {
                onChange(option.value);
              }}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      {why !== undefined ? (
        <p className="ob-why" id={`${id}-why`}>
          {why}
        </p>
      ) : null}
      {error !== undefined ? (
        <p className="ob-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------------------------
// A text answer

export interface TextEntryProps {
  readonly label: string;
  readonly why?: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly error?: string;
  readonly required?: boolean;
  readonly type?: 'text' | 'email' | 'password' | 'url';
  readonly inputMode?: 'text' | 'numeric' | 'decimal' | 'email' | 'url';
  readonly autoComplete?: string;
  readonly multiline?: boolean;
}

export function TextEntry({
  label,
  why,
  value,
  onChange,
  error,
  required,
  type = 'text',
  inputMode,
  autoComplete,
  multiline,
}: TextEntryProps) {
  const id = useId();
  const described = [
    why !== undefined ? `${id}-why` : null,
    error !== undefined ? `${id}-error` : null,
  ]
    .filter((entry) => entry !== null)
    .join(' ');
  const common = {
    id,
    className: 'ob-input',
    value,
    required,
    'aria-invalid': error !== undefined || undefined,
    'aria-describedby': described === '' ? undefined : described,
  };
  return (
    <div className={`ob-field${error !== undefined ? ' ob-field--error' : ''}`}>
      <label className="ob-label" htmlFor={id}>
        {label}
        {required === true ? <span className="ob-req"> ({copy.common.required})</span> : null}
      </label>
      {multiline === true ? (
        <textarea
          {...common}
          rows={3}
          onChange={(event) => {
            onChange(event.currentTarget.value);
          }}
        />
      ) : (
        <input
          {...common}
          type={type}
          inputMode={inputMode}
          autoComplete={autoComplete}
          onChange={(event) => {
            onChange(event.currentTarget.value);
          }}
        />
      )}
      {why !== undefined ? (
        <p className="ob-why" id={`${id}-why`}>
          {why}
        </p>
      ) : null}
      {error !== undefined ? (
        <p className="ob-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Uploads (section B.8): PDF, JPG or PNG up to 20 MB, kept in the vault only

export const UPLOAD_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
export const UPLOAD_MAX_BYTES = 20 * 1024 * 1024;

export function uploadError(file: PickedFile): string | undefined {
  if (!UPLOAD_TYPES.includes(file.type)) {
    return copy.upload.wrongType;
  }
  if (file.size > UPLOAD_MAX_BYTES) {
    return copy.upload.tooBig;
  }
  return undefined;
}

export interface UploadEntryProps {
  readonly label: string;
  readonly files: readonly PickedFile[];
  readonly onAdd: (file: PickedFile) => void;
}

export function UploadEntry({ label, files, onAdd }: UploadEntryProps) {
  const id = useId();
  const [error, setError] = useState<string | undefined>(undefined);
  return (
    <div className="ob-upload">
      <label className="ob-upload__button" htmlFor={id}>
        <span className="ob-upload__label">{label}</span>
        <span className="ob-upload__hint">
          {copy.upload.choose}. {copy.upload.types}
        </span>
      </label>
      <input
        id={id}
        className="ob-upload__input"
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
        aria-describedby={error !== undefined ? `${id}-error` : undefined}
        onChange={(event) => {
          const picked = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (picked === undefined) {
            return;
          }
          const file = describeFile(picked);
          const problem = uploadError(file);
          setError(problem);
          if (problem === undefined) {
            onAdd(file);
          }
        }}
      />
      {files.map((file) => (
        <p key={file.name} className="ob-upload__kept">
          {copy.upload.kept(file.name)}
        </p>
      ))}
      {error !== undefined ? (
        <p className="ob-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// A rule result with its source and grade (section B.6)

export function GradeChip({ grade }: { grade: RuleBasis['grade'] | 'own' }) {
  return <span className={`ob-grade ob-grade--${grade}`}>{copy.grades[grade]}</span>;
}

export interface RuleNoteProps {
  readonly basis: readonly RuleBasis[];
  readonly tone?: 'info' | 'warn' | 'late';
  readonly children: ReactNode;
  readonly testId?: string;
}

export function RuleNote({ basis, tone = 'info', children, testId }: RuleNoteProps) {
  const grade = basis.some((entry) => entry.grade === 'unclear')
    ? 'unclear'
    : basis.some((entry) => entry.grade === 'reported')
      ? 'reported'
      : basis.length > 0
        ? 'confirmed'
        : null;
  return (
    <div className={`ob-note ob-note--${tone}`} data-testid={testId}>
      <div className="ob-note__text">
        {children}
        {grade !== null ? (
          <>
            {' '}
            <GradeChip grade={grade} />
          </>
        ) : null}
      </div>
      {basis.length > 0 ? <Sources basis={basis} /> : null}
    </div>
  );
}

export function Sources({ basis }: { basis: readonly RuleBasis[] }) {
  return (
    <details className="ob-source">
      <summary>{copy.common.source}</summary>
      {basis.map((entry) => (
        <p key={entry.source}>
          {entry.source}{' '}
          <span className="ob-source__date">
            {copy.common.lastChecked(formatLong(entry.lastChecked))}
          </span>
        </p>
      ))}
    </details>
  );
}

// A rule with no source: "unknown" and who can tell you (section B.6).
export function UnknownRule({ who }: { who: string }) {
  return (
    <div className="ob-note ob-note--unknown">
      <div className="ob-note__text">
        {copy.common.unknownRule} <GradeChip grade="unclear" />
      </div>
      <p className="ob-why">{copy.common.whoCanTell(who)}</p>
    </div>
  );
}

// Section C step 8: a deadline whose day has passed is late; a reminder or warning marker whose
// day has come reads "now" (action needed), never late.
export function StatusChip({ entry }: { entry: Pick<DatedItem, 'kind' | 'dueOn'> }) {
  const status = itemStatus(entry, today());
  if (status === 'upcoming') {
    return null;
  }
  return (
    <span className={`ob-grade ob-grade--${status}`}>
      {status === 'late' ? copy.year.late : copy.year.now}
    </span>
  );
}
