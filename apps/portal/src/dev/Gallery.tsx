import type { CardState } from '@boasis/schema';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Avatar,
  Button,
  Checkbox,
  CompanyMark,
  ComplianceCard,
  DateField,
  Dial,
  DialLegend,
  Empty,
  Field,
  Hero,
  LayerProvider,
  Picker,
  Row,
  Sheet,
  Skeleton,
  StatePill,
  STATE_SEVERITY,
  Tabs,
  TextArea,
  TextField,
  Toggle,
  TopBarActions,
  Urgent,
  type DialMark,
} from '../components';
import './Gallery.css';

// Every component in every state, for review. Registered only in a development build.

type Theme = 'system' | 'light' | 'dark';
type Width = 'full' | 'phone';

const TODAY = '2026-09-12';

const DIAL_MARKS: readonly DialMark[] = [
  {
    id: 'licence',
    date: '2026-10-03',
    family: 'licence',
    label: 'Trade licence renewal',
    colour: 'var(--company-0)',
    daysLeft: 21,
  },
  {
    id: 'vat',
    date: '2026-10-28',
    family: 'tax',
    label: 'VAT return',
    colour: 'var(--company-0)',
    daysLeft: 46,
  },
  {
    id: 'ejari',
    date: '2026-12-15',
    family: 'other',
    label: 'Ejari renewal',
    colour: 'var(--company-1)',
    daysLeft: 94,
  },
  {
    id: 'audit',
    date: '2027-02-28',
    family: 'tax',
    label: 'Audited accounts',
    colour: 'var(--company-0)',
    daysLeft: 169,
  },
  {
    id: 'insurance',
    date: '2027-04-30',
    family: 'visa',
    label: 'Health insurance policy',
    colour: 'var(--company-2)',
    daysLeft: 230,
  },
  {
    id: 'ct',
    date: '2027-06-30',
    family: 'tax',
    label: 'Corporate tax return',
    colour: 'var(--company-1)',
    daysLeft: 291,
  },
  {
    id: 'card',
    date: '2027-08-20',
    family: 'licence',
    label: 'Establishment card',
    colour: 'var(--company-2)',
    daysLeft: 342,
  },
  {
    id: 'wps',
    date: '2026-08-30',
    family: 'visa',
    label: 'Wages file, August',
    colour: 'var(--company-0)',
    daysLeft: -13,
  },
  {
    id: 'lease',
    date: '2027-11-01',
    family: 'other',
    label: 'Lease end',
    colour: 'var(--company-1)',
    daysLeft: 415,
  },
];

const CARD_LINES: Readonly<Record<CardState, string>> = {
  complete: 'Renewed on 2026-06-01, next in 2027',
  'on-track': 'Due 2027-04-30, 230 days left',
  'action-soon': 'Due 2026-10-28, return not started',
  expiring: 'Expires 2026-10-03, 21 days left',
  overdue: 'Was due 2026-08-30, nothing logged',
  unknown: 'VAT status not entered',
  'decision-needed': 'Renew, cancel or shrink by 2026-10-03',
};

const ZONES = [
  { value: 'dubai-mainland', label: 'Dubai mainland', note: 'Dubai' },
  { value: 'srtip', label: 'SRTIP', note: 'Sharjah' },
  { value: 'difc', label: 'DIFC', note: 'Dubai' },
  { value: 'jafza', label: 'JAFZA', note: 'Dubai' },
  { value: 'dmcc', label: 'DMCC', note: 'Dubai' },
  { value: 'rakez', label: 'RAKEZ', note: 'Ras Al Khaimah' },
  { value: 'shams', label: 'SHAMS', note: 'Sharjah' },
  { value: 'ifza', label: 'IFZA', note: 'Dubai' },
] as const;
type ZoneId = (typeof ZONES)[number]['value'];

const LEGAL_FORMS = [
  { value: 'llc', label: 'Limited liability company' },
  { value: 'sole', label: 'Sole establishment' },
  { value: 'branch', label: 'Branch' },
] as const;
type LegalForm = (typeof LEGAL_FORMS)[number]['value'];

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="gallery__section">
      <h2 className="gallery__heading">{title}</h2>
      {note !== undefined ? <p className="gallery__note">{note}</p> : null}
      <div className="gallery__body">{children}</div>
    </section>
  );
}

function SheetDemo() {
  const [open, setOpen] = useState(false);
  const [zone, setZone] = useState<ZoneId | null>(null);
  const [form, setForm] = useState<LegalForm | null>('llc');
  const [expiry, setExpiry] = useState('2026-10-03');
  const [name, setName] = useState('');
  return (
    <>
      <Button
        variant="primary"
        onClick={() => {
          setOpen(true);
        }}
      >
        Open a sheet
      </Button>
      <Sheet
        open={open}
        title="Add an existing company"
        kicker="New company"
        subtitle="The licence fills the file; confirm what the reader found."
        onClose={() => {
          setOpen(false);
        }}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setOpen(false);
              }}
            >
              Not now
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setOpen(false);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="gallery__stack">
          <TextField
            label="Trade name"
            value={name}
            onChange={setName}
            placeholder="As printed on the licence"
          />
          <Field
            label="Authority"
            htmlFor="gallery-sheet-zone"
            help="Where the licence was issued."
          >
            <Picker
              id="gallery-sheet-zone"
              label="Authority"
              value={zone}
              options={ZONES}
              onChange={setZone}
            />
          </Field>
          <DateField label="Licence expiry" value={expiry} onChange={setExpiry} />
          <p className="gallery__filler">
            The picker below sits at the bottom of a scrolling body, so its menu has to flip above
            the button on a short screen and must never be cut by the sheet edge.
          </p>
          <Field label="Legal form" htmlFor="gallery-sheet-form">
            <Picker
              id="gallery-sheet-form"
              label="Legal form"
              value={form}
              options={LEGAL_FORMS}
              onChange={setForm}
            />
          </Field>
        </div>
      </Sheet>
    </>
  );
}

function PickerDemo() {
  const [zone, setZone] = useState<ZoneId | null>('srtip');
  const [form, setForm] = useState<LegalForm | null>(null);
  return (
    <div className="gallery__grid gallery__grid--two">
      <Field label="Authority" htmlFor="gallery-zone">
        <Picker
          id="gallery-zone"
          label="Authority"
          value={zone}
          options={ZONES}
          onChange={setZone}
        />
      </Field>
      <Field label="Legal form" htmlFor="gallery-form" help="Nothing chosen yet.">
        <Picker
          id="gallery-form"
          label="Legal form"
          value={form}
          options={LEGAL_FORMS}
          onChange={setForm}
        />
      </Field>
      <Field label="Disabled" htmlFor="gallery-disabled">
        <Picker
          id="gallery-disabled"
          label="Disabled"
          value={zone}
          options={ZONES}
          onChange={setZone}
          disabled
        />
      </Field>
      <Field label="No options" htmlFor="gallery-empty">
        <Picker
          id="gallery-empty"
          label="No options"
          value={null}
          options={[]}
          onChange={() => undefined}
        />
      </Field>
      <Field label="Small" htmlFor="gallery-small">
        <Picker
          id="gallery-small"
          label="Small"
          value={zone}
          options={ZONES}
          onChange={setZone}
          size="sm"
        />
      </Field>
      <Field label="Large" htmlFor="gallery-large">
        <Picker
          id="gallery-large"
          label="Large"
          value={zone}
          options={ZONES}
          onChange={setZone}
          size="lg"
        />
      </Field>
    </div>
  );
}

function FieldsDemo() {
  const [text, setText] = useState('Al Reef Trading LLC');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState('');
  const [reminders, setReminders] = useState(true);
  const [notice, setNotice] = useState(false);
  const [agree, setAgree] = useState(false);
  return (
    <div className="gallery__stack">
      <TextField
        label="Trade name"
        value={text}
        onChange={setText}
        help="As printed on the licence."
        required
      />
      <TextField
        label="Email"
        type="email"
        value=""
        onChange={() => undefined}
        placeholder="name@company.ae"
      />
      <TextField
        label="Licence number"
        value=""
        onChange={() => undefined}
        error="Enter the number on the licence."
      />
      <TextField
        label="Read only"
        value="Locked by the reader"
        onChange={() => undefined}
        disabled
      />
      <DateField
        label="Licence expiry"
        value={date}
        onChange={setDate}
        help="YYYY-MM-DD, as the licence says."
      />
      <TextArea
        label="Notes"
        value={notes}
        onChange={setNotes}
        placeholder="Anything the file should remember."
      />
      <Toggle
        label="Reminders by email"
        checked={reminders}
        onChange={setReminders}
        help="Sent at 09:00 Asia/Dubai."
      />
      <Toggle label="Employee notices" checked={notice} onChange={setNotice} />
      <Toggle label="Disabled" checked onChange={() => undefined} disabled />
      <Checkbox
        label="I confirm the values match the licence"
        checked={agree}
        onChange={setAgree}
      />
      <Checkbox
        label="Disabled"
        checked={false}
        onChange={() => undefined}
        disabled
        help="Needs an owner."
      />
    </div>
  );
}

function TabsDemo() {
  const [tab, setTab] = useState<'file' | 'offices' | 'documents' | 'people'>('file');
  return (
    <Tabs
      label="Company"
      value={tab}
      onChange={setTab}
      items={[
        { value: 'file', label: 'File' },
        { value: 'offices', label: 'Offices' },
        { value: 'documents', label: 'Documents', dot: true },
        { value: 'people', label: 'People' },
      ]}
    />
  );
}

function DialDemo() {
  const [picked, setPicked] = useState<string | null>(null);
  const mark = DIAL_MARKS.find((item) => item.id === picked);
  return (
    <div className="gallery__dial">
      <Hero>
        <Dial today={TODAY} marks={DIAL_MARKS} onSelect={setPicked}>
          <span className="dial__number">21</span>
          <span className="dial__unit">days left</span>
          <span className="dial__word">Trade licence renewal</span>
          <span className="dial__company">Al Reef Trading</span>
        </Dial>
        <DialLegend />
      </Hero>
      <p className="gallery__note" role="status">
        {mark === undefined ? 'Tap a mark.' : `${mark.label}, ${mark.date}`}
      </p>
    </div>
  );
}

export function Gallery() {
  const [theme, setTheme] = useState<Theme>('system');
  const [width, setWidth] = useState<Width>('full');
  const [frame, setFrame] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', theme);
    }
    return () => {
      root.removeAttribute('data-theme');
    };
  }, [theme]);

  const phone = width === 'phone';

  const content = (
    <div className="gallery__content">
      <Section title="Button" note="Four variants, three sizes, loading and disabled.">
        <div className="gallery__wrap">
          <Button variant="primary">Save</Button>
          <Button variant="secondary">Not now</Button>
          <Button variant="quiet">Back</Button>
          <Button variant="danger">Delete</Button>
        </div>
        <div className="gallery__wrap">
          <Button variant="primary" size="sm">
            Small
          </Button>
          <Button variant="primary" size="md">
            Medium
          </Button>
          <Button variant="primary" size="lg">
            Large
          </Button>
          <Button variant="primary" loading>
            Saving
          </Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
          <Button variant="secondary" disabled>
            Disabled
          </Button>
        </div>
      </Section>

      <Section title="StatePill" note="The seven states of spec 7.1, most severe first.">
        <div className="gallery__wrap">
          {STATE_SEVERITY.map((state) => (
            <StatePill key={state} state={state} />
          ))}
        </div>
        <div className="gallery__wrap">
          {STATE_SEVERITY.map((state) => (
            <StatePill key={state} state={state} size="sm" />
          ))}
        </div>
      </Section>

      <Section
        title="ComplianceCard"
        note="Spec 7.2: icon top start, state top end, a title, one line. All tappable."
      >
        <div className="gallery__grid gallery__grid--cards">
          {STATE_SEVERITY.map((state) => (
            <ComplianceCard
              key={state}
              title={state === 'decision-needed' ? 'Licence' : 'Corporate tax'}
              line={CARD_LINES[state]}
              state={state}
              onSelect={() => undefined}
            />
          ))}
          <ComplianceCard
            title="Health insurance"
            line="Not tappable: a plain card."
            state="on-track"
          />
        </div>
      </Section>

      <Section
        title="Row"
        note="Leading mark, title and subtitle, a value or a chevron at the end."
      >
        <div className="gallery__list">
          <Row
            leading={<CompanyMark name="Al Reef Trading" id="c1" size="sm" />}
            title="Trade licence renewal"
            subtitle="Al Reef Trading LLC, Dubai mainland"
            value="3 Oct"
            valueNote="21 days"
            state="expiring"
            onSelect={() => undefined}
          />
          <Row
            leading={<Avatar name="Hind Al Marzouqi" id="p1" size="sm" />}
            title="Visa renewal, Hind Al Marzouqi"
            subtitle="Stage: medical"
            value="14 Nov"
            valueNote="63 days"
            daysLeft={63}
            onSelect={() => undefined}
          />
          <Row
            title="Ejari certificate"
            subtitle="Office 1204, Business Bay"
            onSelect={() => undefined}
          />
          <Row title="Bank KYC refresh" subtitle="Emirates NBD" value="Done" state="complete" />
          <Row
            title="Wages file, August"
            subtitle="Not uploaded"
            value="30 Aug"
            valueNote="13 days late"
            state="overdue"
            onSelect={() => undefined}
          />
          <Row
            title="A very long title that has to be cut with an ellipsis rather than wrap onto a second line"
            subtitle="And a subtitle that is also far too long for the space it has been given"
            value="1 Jan"
            onSelect={() => undefined}
          />
        </div>
      </Section>

      <Section
        title="Sheet"
        note="Bottom sheet on a phone, centred dialog on a desktop. Escape closes one layer at a time."
      >
        <SheetDemo />
      </Section>

      <Section
        title="Picker"
        note="Anchored menu in a portal on a desktop, a Sheet of options on a phone."
      >
        <PickerDemo />
      </Section>

      <Section
        title="Field"
        note="TextField, DateField, TextArea, Toggle, Checkbox, with help, error and disabled."
      >
        <FieldsDemo />
      </Section>

      <Section title="Tabs and TopBarActions">
        <TabsDemo />
        <div className="gallery__bar">
          <span className="gallery__bar-title">Company file</span>
          <TopBarActions
            actions={[
              { id: 'export', label: 'Export', onSelect: () => undefined },
              { id: 'edit', label: 'Edit', onSelect: () => undefined, primary: true },
            ]}
          />
        </div>
      </Section>

      <Section title="Avatar and CompanyMark" note="Colour from a stable hash of the id.">
        <div className="gallery__wrap">
          <Avatar name="Hind Al Marzouqi" id="p1" size="sm" />
          <Avatar name="Hind Al Marzouqi" id="p1" />
          <Avatar name="Hind Al Marzouqi" id="p1" size="lg" />
          <Avatar name="Omar" id="p2" />
          <Avatar name="Sara Khan" id="p3" />
          <Avatar name="Yusuf Ali" id="p4" />
          <Avatar name="" id="p5" />
        </div>
        <div className="gallery__wrap">
          <CompanyMark name="Al Reef Trading" id="c1" size="sm" />
          <CompanyMark name="Al Reef Trading" id="c1" />
          <CompanyMark name="Al Reef Trading" id="c1" size="lg" />
          <CompanyMark name="Boasis" id="c2" />
          <CompanyMark name="Clause and Code" id="c3" />
          <CompanyMark name="Nour Holdings" id="c4" />
        </div>
      </Section>

      <Section title="Urgent" note="Nothing rendered when the count is zero.">
        <div className="gallery__stack">
          <Urgent
            count={3}
            line="Wages file for August was due 2026-08-30"
            onSelect={() => undefined}
          />
          <Urgent count={1} line="Trade licence expired 2026-09-01" onSelect={() => undefined} />
          <Urgent count={0} line="Never shown" onSelect={() => undefined} />
        </div>
      </Section>

      <Section title="Empty and Skeleton">
        <Empty
          title="No documents yet"
          line="Upload the licence and the file fills itself."
          action={{ label: 'Upload', onSelect: () => undefined }}
        />
        <Empty title="Nothing shared with you" line="A company someone shares appears here." />
        <div className="gallery__stack">
          <div className="gallery__skeleton-row">
            <Skeleton shape="circle" />
            <div className="gallery__stack gallery__stack--tight">
              <Skeleton inlineSize="60%" />
              <Skeleton inlineSize="40%" />
            </div>
          </div>
          <Skeleton shape="card" />
        </div>
      </Section>

      <Section
        title="Dial"
        note={`Today is ${TODAY}. One mark is beyond twelve months and is not drawn. Four orbits: tax, visa, licence, other; each mark is a dot in its company's colour.`}
      >
        <DialDemo />
      </Section>
    </div>
  );

  return (
    <div className="gallery">
      <header className="gallery__top">
        <h1 className="gallery__title">Component gallery</h1>
        <div className="gallery__controls">
          <Tabs
            label="Theme"
            value={theme}
            onChange={setTheme}
            items={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
          <Tabs
            label="Width"
            value={width}
            onChange={setWidth}
            items={[
              { value: 'full', label: 'Full width' },
              { value: 'phone', label: 'Phone 375' },
            ]}
          />
        </div>
      </header>
      {phone ? (
        <div className="gallery__stage">
          <div className="gallery__frame" ref={setFrame}>
            <div className="gallery__frame-scroll">
              <LayerProvider container={frame} layout="phone">
                {content}
              </LayerProvider>
            </div>
          </div>
        </div>
      ) : (
        <LayerProvider container={null} layout={null}>
          {content}
        </LayerProvider>
      )}
    </div>
  );
}
