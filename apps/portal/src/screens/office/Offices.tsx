import type { Office } from '@boasis/schema';
import { isBefore } from '@boasis/rules';
import { useState } from 'react';
import { me } from '../../copy/en';
import type { Bundle } from '../../lib/entries';
import { formatLong } from '../../lib/format';
import { IconChevron, IconCompany, IconPlus } from '../../lib/icons';
import { showsEjari } from '../../lib/offices';
import { OfficeSheet, type OfficeSheetMode } from './OfficeSheet';
import '../lite.css';
import './Offices.css';

const copy = me.office;

export interface OfficesProps {
  readonly bundle: Bundle;
  readonly today: string;
}

type SheetState = { readonly mode: OfficeSheetMode; readonly office: Office | null } | null;

// The next instalment: the first one not yet passed. Dates compare in packages/rules.
export function nextInstalment(office: Office, today: string) {
  return (
    [...office.lease.paymentSchedule]
      .sort((a, b) => (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : 0))
      .find((instalment) => !isBefore(instalment.dueOn, today)) ?? null
  );
}

function quotaLine(office: Office): string {
  const { quotaAllowed, quotaUsed } = office.capacity;
  return quotaAllowed === null
    ? copy.quotaUnknown(quotaUsed)
    : copy.quotaLine(quotaUsed, quotaAllowed);
}

// Screen 4b (spec 5.2): one card per premises with what the calendar reads from it, and the
// four things that happen to an office: add, edit, renew, hand back. A flexi-desk inside a zone
// package collapses to one line: its term follows the licence and it has no instalments.
export function Offices({ bundle, today }: OfficesProps) {
  const [sheet, setSheet] = useState<SheetState>(null);
  const offices = bundle.offices;
  const close = () => {
    setSheet(null);
  };

  return (
    <div className="pg offices">
      <div className="vhead">
        <div>
          <h2>{copy.title}</h2>
          <p>{copy.sub(offices.length)}</p>
        </div>
        <button
          type="button"
          className="add"
          onClick={() => {
            setSheet({ mode: 'add', office: null });
          }}
        >
          <IconPlus />
          {copy.add}
        </button>
      </div>

      {offices.length === 0 ? (
        <div className="soon2">
          <span className="ic">
            <IconCompany size={22} />
          </span>
          <h2>{copy.none}</h2>
          <p>{copy.noneBody}</p>
        </div>
      ) : null}

      {offices.map((office) => {
        const ended = isBefore(office.lease.end, today);
        if (office.premises.type === 'flexi-desk') {
          return (
            <button
              type="button"
              className="frow ofrow"
              key={office.id}
              onClick={() => {
                setSheet({ mode: 'edit', office });
              }}
            >
              <span className="fi">
                <IconCompany size={17} />
              </span>
              <span className="bd">
                <span className="t">
                  {copy.types[office.premises.type]} · {office.lease.landlord}
                </span>
                <span className="s">
                  {copy.flexiLine} {quotaLine(office)}.
                </span>
              </span>
              <span className={`st${ended ? ' bad' : ''}`}>
                {ended ? copy.ended(formatLong(office.lease.end)) : formatLong(office.lease.end)}
              </span>
              <IconChevron className="ofrow__go" size={15} />
            </button>
          );
        }
        const instalment = nextInstalment(office, today);
        return (
          <div className="card ocard" key={office.id}>
            <div className="sh">
              <div className="k">
                {copy.types[office.premises.type]}
                {office.premises.isRegisteredAddress ? ` · ${copy.registered}` : ''}
              </div>
              <h3>
                {office.premises.address === ''
                  ? copy.types[office.premises.type]
                  : office.premises.address}
              </h3>
              {ended ? (
                <div className="due">
                  <span>{copy.ended(formatLong(office.lease.end))}</span>
                </div>
              ) : null}
            </div>
            <div className="sb">
              <ul className="pairs">
                <li>
                  <span>{copy.size}</span>
                  <b>
                    {office.premises.sizeSqm === null
                      ? 'unknown'
                      : copy.sqm(office.premises.sizeSqm)}
                  </b>
                </li>
                <li>
                  <span>{copy.lease}</span>
                  <b>
                    {copy.leaseLine(formatLong(office.lease.start), formatLong(office.lease.end))}
                  </b>
                </li>
                {showsEjari(bundle, office) ? (
                  <li>
                    <span>{copy.ejari}</span>
                    <b>
                      {office.lease.ejari === null
                        ? copy.noEjari
                        : copy.ejariLine(
                            office.lease.ejari.number,
                            formatLong(office.lease.ejari.expiry),
                          )}
                    </b>
                  </li>
                ) : null}
                <li>
                  <span>{copy.nextRent}</span>
                  <b>
                    {instalment === null
                      ? copy.noRent
                      : copy.rentLine(
                          formatLong(instalment.dueOn),
                          instalment.amountAed,
                          copy.methods[instalment.method],
                        )}
                  </b>
                </li>
                <li>
                  <span>{copy.permits}</span>
                  <b>
                    {office.approvals.length === 0
                      ? copy.noPermits
                      : office.approvals
                          .map((approval) =>
                            approval.expiry === null
                              ? copy.approvals[approval.type]
                              : `${copy.approvals[approval.type]} to ${formatLong(approval.expiry)}`,
                          )
                          .join(', ')}
                  </b>
                </li>
                <li>
                  <span>{copy.quota}</span>
                  <b>{quotaLine(office)}</b>
                </li>
              </ul>
            </div>
            <div className="sf ocard__acts">
              <button
                type="button"
                className="btn3"
                onClick={() => {
                  setSheet({ mode: 'edit', office });
                }}
              >
                {copy.edit}
              </button>
              <button
                type="button"
                className="btn3"
                onClick={() => {
                  setSheet({ mode: 'renew', office });
                }}
              >
                {copy.renew}
              </button>
              {ended ? null : (
                <button
                  type="button"
                  className="btn3"
                  onClick={() => {
                    setSheet({ mode: 'handback', office });
                  }}
                >
                  {copy.handBack}
                </button>
              )}
            </div>
          </div>
        );
      })}

      <OfficeSheet
        key={sheet === null ? 'none' : `${sheet.mode}:${sheet.office?.id ?? 'new'}`}
        open={sheet !== null}
        mode={sheet?.mode ?? 'add'}
        office={sheet?.office ?? null}
        companyId={bundle.facts.id}
        companyName={bundle.facts.identity.tradeName}
        onClose={close}
      />
    </div>
  );
}
