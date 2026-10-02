import type { AccessGrant, AccessLevel, Area, CompanyFacts } from '@boasis/schema';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Checkbox, Picker, Sheet, TextField, useLayout } from '../components';
import { colourSlot } from '../components/shared/hash';
import { companyColour } from '../lib/brand';
import { ChevronIcon } from '../components/shared/icons';
import { screens } from '../copy/en';
import { queryKeys, useAccessGrants, useCompanies, useRepos } from '../data';
import {
  AREAS,
  AREA_LABELS,
  areasFrom,
  companyAccessOf,
  emptyGrid,
  gridFrom,
  reachCount,
  templateGrid,
  type AreaGrid,
  type TemplateId,
} from '../lib/access';
import { confirmAction } from '../lib/confirm';
import { displayName, initialsOf, useSession } from '../lib/session';
import { IconPlus, IconTrash } from './icons';
import './lite.css';
import './Access.css';

const copy = screens.access;

const LEVELS: readonly { value: AccessLevel; label: string }[] = [
  { value: 'none', label: copy.levels.none },
  { value: 'view', label: copy.levels.view },
  { value: 'edit', label: copy.levels.edit },
];

const TEMPLATES: readonly { value: TemplateId; label: string }[] = [
  { value: 'custom', label: copy.custom },
  { value: 'manager', label: copy.templates.manager },
  { value: 'pro', label: copy.templates.pro },
  { value: 'accountant', label: copy.templates.accountant },
];

const label = (company: CompanyFacts): string => company.identity.tradeName;
const colourOf = (company: CompanyFacts): string => companyColour(company);
const avatarOf = (key: string): string => `var(--avatar-${String(colourSlot(key))})`;

function initials(name: string): string {
  const words = name
    .trim()
    .split(/[\s@.]+/)
    .filter((word) => word !== '');
  return ((words[0]?.[0] ?? '?') + (words[1]?.[0] ?? '')).toUpperCase();
}

// Spec 4.1: for one company, the ten areas with view, edit or nothing, and who is responsible.
function AreaGridEditor({
  grid,
  onChange,
  heading,
}: {
  grid: AreaGrid;
  onChange: (next: AreaGrid) => void;
  heading?: { name: string; colour: string };
}) {
  const set = (area: Area, patch: Partial<AreaGrid[Area]>) => {
    onChange({ ...grid, [area]: { ...grid[area], ...patch } });
  };
  return (
    <div className="agrid">
      {heading !== undefined ? (
        <div className="ah">
          <span className="codot" style={{ background: heading.colour }} />
          {copy.perCompany(heading.name)}
        </div>
      ) : null}
      {AREAS.map((area) => (
        <div className="arow2" key={area}>
          <span className="an">{AREA_LABELS[area]}</span>
          <Picker
            label={`${AREA_LABELS[area]}, ${copy.areas}`}
            value={grid[area].level}
            options={LEVELS}
            size="sm"
            onChange={(level) => {
              set(area, { level });
            }}
          />
          <Checkbox
            label={copy.responsible}
            checked={grid[area].responsible}
            onChange={(responsible) => {
              set(area, { responsible });
            }}
          />
        </div>
      ))}
    </div>
  );
}

// Lite's invite box, extended to spec 4.1: name and email, the role in the owner's words, the
// companies, and per company what they can reach and answer for.
function InviteNew({
  companies,
  grants,
  onDone,
  onCancel,
}: {
  companies: CompanyFacts[];
  grants: AccessGrant[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const repos = useRepos();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [roleName, setRoleName] = useState('');
  const [template, setTemplate] = useState<TemplateId>('custom');
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(companies.length === 1 ? [companies[0]?.id ?? ''] : []),
  );
  const [same, setSame] = useState(true);
  const [shared, setShared] = useState<AreaGrid>(emptyGrid);
  const [perCompany, setPerCompany] = useState<Record<string, AreaGrid>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const flip = (id: string) => {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const applyTemplate = (next: TemplateId) => {
    setTemplate(next);
    const grid = templateGrid(next);
    setShared(grid);
    setPerCompany(Object.fromEntries(companies.map((company) => [company.id, grid])));
    if (next !== 'custom' && roleName.trim() === '') {
      setRoleName(TEMPLATES.find((entry) => entry.value === next)?.label ?? '');
    }
  };

  const gridFor = (id: string): AreaGrid => (same ? shared : (perCompany[id] ?? shared));

  const send = (event: FormEvent) => {
    event.preventDefault();
    if (busy || name.trim() === '' || email.trim() === '' || roleName.trim() === '') {
      return;
    }
    if (picked.size === 0) {
      setError(copy.pickCompany);
      return;
    }
    const known = grants.find(
      (grant) => grant.member.email.toLowerCase() === email.trim().toLowerCase(),
    );
    if (known !== undefined) {
      setError(copy.already);
      return;
    }
    setBusy(true);
    setError('');
    repos.access
      .create({
        member: { name: name.trim(), email: email.trim() },
        roleName: roleName.trim(),
        companies: [...picked].map((companyId) => ({
          companyId,
          areas: areasFrom(gridFor(companyId)),
        })),
      })
      .then(async () => {
        await queryClient.invalidateQueries({ queryKey: queryKeys.access() });
        setBusy(false);
        onDone();
      })
      .catch((failure: unknown) => {
        setBusy(false);
        setError(failure instanceof Error ? failure.message : String(failure));
      });
  };

  return (
    <form className="invite acinv" onSubmit={send}>
      <div className="ivh">{copy.inviteTo}</div>
      <div className="acpick">
        {companies.map((company) => (
          <label key={company.id} className={picked.has(company.id) ? 'on' : ''}>
            <input
              type="checkbox"
              checked={picked.has(company.id)}
              onChange={() => {
                flip(company.id);
              }}
            />
            {label(company)}
          </label>
        ))}
      </div>
      <div className="fpair">
        <TextField
          id="ac-name"
          label={copy.name}
          value={name}
          placeholder={copy.namePlaceholder}
          required
          onChange={setName}
        />
        <TextField
          id="ac-email"
          label={copy.email}
          type="email"
          value={email}
          placeholder={copy.emailPlaceholder}
          required
          autoComplete="off"
          onChange={setEmail}
        />
      </div>
      <div className="fpair">
        <TextField
          id="ac-role"
          label={copy.roleName}
          value={roleName}
          placeholder={copy.roleNamePlaceholder}
          required
          onChange={setRoleName}
        />
        <div className="field">
          <label className="field__label" htmlFor="ac-template">
            {copy.template}
          </label>
          <Picker
            id="ac-template"
            label={copy.template}
            value={template}
            options={TEMPLATES}
            onChange={applyTemplate}
          />
        </div>
      </div>
      {picked.size > 1 ? (
        <Checkbox label={copy.sameEverywhere} checked={same} onChange={setSame} />
      ) : null}
      {same || picked.size <= 1 ? (
        <AreaGridEditor grid={shared} onChange={setShared} />
      ) : (
        companies
          .filter((company) => picked.has(company.id))
          .map((company) => (
            <AreaGridEditor
              key={company.id}
              grid={gridFor(company.id)}
              heading={{ name: label(company), colour: colourOf(company) }}
              onChange={(next) => {
                setPerCompany((current) => ({ ...current, [company.id]: next }));
              }}
            />
          ))
      )}
      <div className="ivr">
        <button className="go" type="submit" disabled={busy}>
          {copy.send}
        </button>
        <button className="cx" type="button" onClick={onCancel}>
          {screens.common.close}
        </button>
      </div>
      <div className="ivn">{copy.remindersNote}</div>
      {error !== '' ? (
        <div className="ferr" role="alert">
          {error}
        </div>
      ) : null}
    </form>
  );
}

// One person's access to one company, edited in a sheet: the grid, save, or remove access.
function AccessSheet({
  target,
  onClose,
}: {
  target: { grant: AccessGrant; company: CompanyFacts } | null;
  onClose: () => void;
}) {
  const repos = useRepos();
  const queryClient = useQueryClient();
  const [grid, setGrid] = useState<AreaGrid | null>(null);
  const [busy, setBusy] = useState(false);
  const open = target !== null;
  const existing = target === null ? null : companyAccessOf(target.grant, target.company.id);
  const current = grid ?? (existing === null ? emptyGrid() : gridFrom(existing.areas));

  const write = (companies: AccessGrant['companies']) => {
    if (target === null) {
      return;
    }
    setBusy(true);
    repos.access
      .update(target.grant.id, { companies })
      .then(async () => {
        await queryClient.invalidateQueries({ queryKey: queryKeys.access() });
        setBusy(false);
        setGrid(null);
        onClose();
      })
      .catch(() => {
        setBusy(false);
      });
  };

  const save = () => {
    if (target === null) {
      return;
    }
    const rest = target.grant.companies.filter((entry) => entry.companyId !== target.company.id);
    write([...rest, { companyId: target.company.id, areas: areasFrom(current) }]);
  };

  const remove = () => {
    if (target === null) {
      return;
    }
    if (!confirmAction(copy.confirmRemoveOne(target.grant.member.name, label(target.company)))) {
      return;
    }
    write(target.grant.companies.filter((entry) => entry.companyId !== target.company.id));
  };

  return (
    <Sheet
      open={open}
      kicker={target === null ? '' : target.grant.roleName}
      title={
        target === null ? '' : copy.editAccess(target.grant.member.name, label(target.company))
      }
      subtitle={copy.areas}
      onClose={() => {
        setGrid(null);
        onClose();
      }}
      className="pg acc"
      footer={
        <>
          {existing !== null ? (
            <button type="button" className="g" onClick={remove} disabled={busy}>
              {copy.removeHere}
            </button>
          ) : null}
          <button type="button" className="p" onClick={save} disabled={busy}>
            {existing === null ? copy.give : screens.common.save}
          </button>
        </>
      }
    >
      <div className="pg acc">
        <AreaGridEditor grid={current} onChange={setGrid} />
        <p className="hintline">{copy.responsibleNote}</p>
      </div>
    </Sheet>
  );
}

// Screen 17 (spec 14): lite's access page, ported and extended to spec 4.1. One row per person,
// one column per company, each cell the role they hold there; a list on a phone.
export function Access() {
  const session = useSession();
  const layout = useLayout();
  const repos = useRepos();
  const queryClient = useQueryClient();
  const companies = useCompanies();
  const grants = useAccessGrants();
  const [inviting, setInviting] = useState(false);
  const [target, setTarget] = useState<{ grant: AccessGrant; company: CompanyFacts } | null>(null);
  const [unfolded, setUnfolded] = useState<Set<string>>(() => new Set());

  const list = companies.data ?? [];
  const people = (grants.data ?? []).filter((grant) => grant.companies.length > 0);
  const flip = (key: string) => {
    setUnfolded((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const removeEverywhere = (grant: AccessGrant) => {
    const names = list
      .filter((company) => companyAccessOf(grant, company.id) !== null)
      .map(label)
      .join(', ');
    if (!confirmAction(copy.confirmRemovePerson(grant.member.name, names))) {
      return;
    }
    repos.access
      .update(grant.id, { companies: [] })
      .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.access() }))
      .catch(() => undefined);
  };

  const myName = session === null ? copy.youTitle : displayName(session);
  const myInitials = session === null ? '?' : initialsOf(session);

  const myCell = () => (
    <span className="cellx">
      <span className="pillx r-owner">
        <span className="lbl">{copy.owner}</span>
      </span>
    </span>
  );

  const personCell = (grant: AccessGrant, company: CompanyFacts) => {
    const access = companyAccessOf(grant, company.id);
    if (access === null) {
      return (
        <button
          type="button"
          className="ghostadd"
          onClick={() => {
            setTarget({ grant, company });
          }}
        >
          <IconPlus size={13} />
          {copy.give}
        </button>
      );
    }
    const reach = reachCount(access.areas);
    return (
      <span className="cellx">
        <button
          type="button"
          className="pillx r-role"
          onClick={() => {
            setTarget({ grant, company });
          }}
        >
          <span className="lbl">{grant.roleName}</span>
          <span className="nt">{reach === 1 ? '1 area' : `${String(reach)} areas`}</span>
        </button>
      </span>
    );
  };

  const table = (
    <div className="atable">
      <div className="ascroll">
        <table>
          <thead>
            <tr>
              <th className="tperson">{copy.person}</th>
              {list.map((company) => (
                <th key={company.id} data-company={label(company)}>
                  <span className="colhd">
                    <span className="codot" style={{ background: colourOf(company) }} />
                    <span className="cn">{label(company)}</span>
                  </span>
                </th>
              ))}
              <th className="tact">
                <span className="sr">{copy.actions}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="selfrow" data-person="me">
              <td className="tperson">
                <span className="who2">
                  <span className="ava" style={{ '--ava': avatarOf(session?.email ?? 'me') }}>
                    {myInitials}
                  </span>
                  <span className="pname">
                    <b>
                      {myName}
                      <em className="youtag">{copy.youTag}</em>
                    </b>
                    <span>{copy.youNote}</span>
                  </span>
                </span>
              </td>
              {list.map((company) => (
                <td key={company.id}>{myCell()}</td>
              ))}
              <td className="tact" />
            </tr>
            {people.map((grant) => (
              <tr key={grant.id} data-person={grant.member.name}>
                <td className="tperson">
                  <span className="who2">
                    <span className="ava" style={{ '--ava': avatarOf(grant.id) }}>
                      {initials(grant.member.name)}
                    </span>
                    <span className="pname">
                      <b>{grant.member.name}</b>
                      <span>{grant.member.email}</span>
                    </span>
                  </span>
                </td>
                {list.map((company) => (
                  <td key={company.id}>{personCell(grant, company)}</td>
                ))}
                <td className="tact">
                  <button
                    type="button"
                    className="rowdel"
                    onClick={() => {
                      removeEverywhere(grant);
                    }}
                    aria-label={copy.removePerson}
                    title={copy.removePerson}
                  >
                    <IconTrash size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {grants.isSuccess && people.length === 0 ? <div className="aempty">{copy.empty}</div> : null}
    </div>
  );

  const rows = [
    {
      key: 'me',
      isMe: true,
      grant: null,
      name: myName,
      ava: myInitials,
      tone: avatarOf(session?.email ?? 'me'),
      has: () => true,
      cell: () => myCell(),
    },
    ...people.map((grant) => ({
      key: grant.id,
      isMe: false,
      grant,
      name: grant.member.name,
      ava: initials(grant.member.name),
      tone: avatarOf(grant.id),
      has: (company: CompanyFacts) => companyAccessOf(grant, company.id) !== null,
      cell: (company: CompanyFacts) => personCell(grant, company),
    })),
  ];

  const asList = (
    <div className="plist">
      {rows.map((row) => {
        const open = unfolded.has(row.key);
        const seen = list.filter(row.has);
        const sub = row.isMe ? copy.youNote : copy.onCompanies(seen.length, list.length);
        return (
          <section
            key={row.key}
            className={`pcard2${open ? ' open' : ''}${row.isMe ? ' self' : ''}`}
            data-person={row.isMe ? 'me' : row.name}
          >
            <button
              type="button"
              className="phead"
              onClick={() => {
                flip(row.key);
              }}
              aria-expanded={open}
            >
              <span className="ava" style={{ '--ava': row.tone }}>
                {row.ava}
              </span>
              <span className="pname">
                <b>
                  {row.name}
                  {row.isMe ? <em className="youtag">{copy.youTag}</em> : null}
                </b>
                <span>{sub}</span>
              </span>
              <span className="pdots" aria-hidden="true">
                {seen.map((company) => (
                  <span
                    key={company.id}
                    className="codot"
                    style={{ background: colourOf(company) }}
                  />
                ))}
              </span>
              <ChevronIcon className="pchev" width="16" height="16" />
            </button>
            {open ? (
              <div className="pbody">
                {list.map((company) => (
                  <div className="prow2" key={company.id} data-company={label(company)}>
                    <span className="pco2">
                      <span className="codot" style={{ background: colourOf(company) }} />
                      <span className="cn">{label(company)}</span>
                    </span>
                    <span className="pval">{row.cell(company)}</span>
                  </div>
                ))}
                {row.grant !== null ? (
                  <button
                    type="button"
                    className="plink danger premove"
                    onClick={() => {
                      removeEverywhere(row.grant);
                    }}
                  >
                    <IconTrash size={14} />
                    {copy.removePerson}
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );

  return (
    <div className="pg acc">
      <div className="vhead">
        <div>
          <h2>{copy.title}</h2>
          <p>{copy.subtitle}</p>
        </div>
        {!inviting ? (
          <button
            type="button"
            className="add"
            onClick={() => {
              setInviting(true);
            }}
          >
            <IconPlus />
            {copy.invite}
          </button>
        ) : null}
      </div>

      {inviting ? (
        <InviteNew
          companies={list}
          grants={grants.data ?? []}
          onCancel={() => {
            setInviting(false);
          }}
          onDone={() => {
            setInviting(false);
          }}
        />
      ) : null}

      {grants.isPending || companies.isPending ? (
        <p className="status" role="status">
          {screens.common.loading}
        </p>
      ) : layout === 'desktop' ? (
        table
      ) : (
        asList
      )}

      <div className="alegend">
        <span className="lg">
          <span className="pillx r-role">
            <span className="lbl">{copy.templates.manager}</span>
          </span>
          {copy.templates.managerNote}
        </span>
        <span className="lg">
          <span className="pillx r-role">
            <span className="lbl">{copy.templates.pro}</span>
          </span>
          {copy.templates.proNote}
        </span>
        <span className="lg">
          <span className="pillx r-role">
            <span className="lbl">{copy.templates.accountant}</span>
          </span>
          {copy.templates.accountantNote}
        </span>
        <span className="lg">
          <span>
            <b>{copy.responsible}</b> {copy.remindersNote}
          </span>
        </span>
      </div>

      <AccessSheet
        target={target}
        onClose={() => {
          setTarget(null);
        }}
      />
    </div>
  );
}
