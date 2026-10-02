import { useId, type ReactNode } from 'react';
import { cx } from '../shared/cx';
import './Field.css';

export interface FieldProps {
  readonly label: string;
  // The id of the control the label names. The label is a sibling, never a wrapper, so a
  // menu rendered by the control cannot bounce a click back into it.
  readonly htmlFor: string;
  readonly help?: string;
  readonly error?: string;
  readonly required?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}

// Label over control over help or error. Every input in the app sits inside one of these.
export function Field({ label, htmlFor, help, error, required, className, children }: FieldProps) {
  return (
    <div className={cx('field', error !== undefined && 'field--error', className)}>
      <label className="field__label" htmlFor={htmlFor}>
        {label}
        {required === true ? (
          <span className="field__required" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children}
      {error !== undefined ? (
        <p className="field__error" id={`${htmlFor}-error`} role="alert">
          {error}
        </p>
      ) : help !== undefined ? (
        <p className="field__help" id={`${htmlFor}-help`}>
          {help}
        </p>
      ) : null}
    </div>
  );
}

// The aria attributes a control inside a Field uses to point at its help or error line.
export function describedBy(
  id: string,
  help: string | undefined,
  error: string | undefined,
): string | undefined {
  if (error !== undefined) {
    return `${id}-error`;
  }
  if (help !== undefined) {
    return `${id}-help`;
  }
  return undefined;
}

interface TextControlProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly id?: string;
  readonly placeholder?: string;
  readonly help?: string;
  readonly error?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly className?: string;
}

export interface TextFieldProps extends TextControlProps {
  readonly type?: 'text' | 'email' | 'password' | 'tel' | 'number' | 'url';
  readonly autoComplete?: string;
}

export function TextField({
  label,
  value,
  onChange,
  id,
  type = 'text',
  placeholder,
  help,
  error,
  required,
  disabled,
  autoComplete,
  className,
}: TextFieldProps) {
  const generated = useId();
  const controlId = id ?? generated;
  return (
    <Field
      label={label}
      htmlFor={controlId}
      help={help}
      error={error}
      required={required}
      className={className}
    >
      <input
        id={controlId}
        className="field__input"
        type={type}
        value={value}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        autoComplete={autoComplete}
        aria-invalid={error !== undefined || undefined}
        aria-describedby={describedBy(controlId, help, error)}
        onChange={(event) => {
          onChange(event.currentTarget.value);
        }}
      />
    </Field>
  );
}

export interface TextAreaProps extends TextControlProps {
  readonly rows?: number;
}

export function TextArea({
  label,
  value,
  onChange,
  id,
  rows = 3,
  placeholder,
  help,
  error,
  required,
  disabled,
  className,
}: TextAreaProps) {
  const generated = useId();
  const controlId = id ?? generated;
  return (
    <Field
      label={label}
      htmlFor={controlId}
      help={help}
      error={error}
      required={required}
      className={className}
    >
      <textarea
        id={controlId}
        className="field__input field__input--area"
        rows={rows}
        value={value}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        aria-invalid={error !== undefined || undefined}
        aria-describedby={describedBy(controlId, help, error)}
        onChange={(event) => {
          onChange(event.currentTarget.value);
        }}
      />
    </Field>
  );
}

// A calendar date as the string YYYY-MM-DD, or the empty string for none. The native date
// input produces exactly that; nothing here turns it into a Date.
export type DateFieldValue = string;

export interface DateFieldProps extends Omit<
  TextControlProps,
  'value' | 'onChange' | 'placeholder'
> {
  readonly value: DateFieldValue;
  readonly onChange: (value: DateFieldValue) => void;
  // Inclusive bounds, also YYYY-MM-DD, passed straight to the input.
  readonly min?: DateFieldValue;
  readonly max?: DateFieldValue;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function DateField({
  label,
  value,
  onChange,
  id,
  min,
  max,
  help,
  error,
  required,
  disabled,
  className,
}: DateFieldProps) {
  const generated = useId();
  const controlId = id ?? generated;
  return (
    <Field
      label={label}
      htmlFor={controlId}
      help={help}
      error={error}
      required={required}
      className={className}
    >
      <input
        id={controlId}
        className="field__input field__input--date"
        type="date"
        value={value}
        min={min}
        max={max}
        required={required}
        disabled={disabled}
        aria-invalid={error !== undefined || undefined}
        aria-describedby={describedBy(controlId, help, error)}
        onChange={(event) => {
          const next = event.currentTarget.value;
          onChange(next === '' || ISO_DATE.test(next) ? next : '');
        }}
      />
    </Field>
  );
}

export interface ToggleProps {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly id?: string;
  readonly help?: string;
  readonly disabled?: boolean;
  readonly className?: string;
}

// A switch: label at the start, the knob at the end. The label is a sibling that names the
// button, so a tap on the words flips it.
export function Toggle({ label, checked, onChange, id, help, disabled, className }: ToggleProps) {
  const generated = useId();
  const controlId = id ?? generated;
  return (
    <div className={cx('toggle', disabled === true && 'toggle--disabled', className)}>
      <span className="toggle__text">
        <label className="toggle__label" htmlFor={controlId}>
          {label}
        </label>
        {help !== undefined ? (
          <span className="toggle__help" id={`${controlId}-help`}>
            {help}
          </span>
        ) : null}
      </span>
      <button
        id={controlId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={help !== undefined ? `${controlId}-help` : undefined}
        className={cx('toggle__switch', checked && 'toggle__switch--on')}
        disabled={disabled}
        onClick={() => {
          onChange(!checked);
        }}
      >
        <span className="toggle__knob" aria-hidden="true" />
      </button>
    </div>
  );
}

export interface CheckboxProps {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly id?: string;
  readonly help?: string;
  readonly disabled?: boolean;
  readonly className?: string;
}

export function Checkbox({
  label,
  checked,
  onChange,
  id,
  help,
  disabled,
  className,
}: CheckboxProps) {
  const generated = useId();
  const controlId = id ?? generated;
  return (
    <div className={cx('checkbox', disabled === true && 'checkbox--disabled', className)}>
      <input
        id={controlId}
        type="checkbox"
        className="checkbox__input"
        checked={checked}
        disabled={disabled}
        aria-describedby={help !== undefined ? `${controlId}-help` : undefined}
        onChange={(event) => {
          onChange(event.currentTarget.checked);
        }}
      />
      <span className="checkbox__text">
        <label className="checkbox__label" htmlFor={controlId}>
          {label}
        </label>
        {help !== undefined ? (
          <span className="checkbox__help" id={`${controlId}-help`}>
            {help}
          </span>
        ) : null}
      </span>
    </div>
  );
}
