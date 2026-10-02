import type { Office, PremisesType } from '@boasis/schema';
import { PremisesType as PremisesTypeSchema } from '@boasis/schema';
import { useState } from 'react';
import { Button } from '../../components/Button/Button';
import { Checkbox, DateField, Field, TextField } from '../../components/Field/Field';
import { Picker } from '../../components/Picker/Picker';
import { Sheet } from '../../components/Sheet/Sheet';
import { me } from '../../copy/en';
import { useRefresh } from '../../data/bundles';
import { useRepos } from '../../data/ReposProvider';
import { today } from '../../lib/today';
import '../sheets/sheets.css';

const copy = me.office;

export type OfficeSheetMode = 'add' | 'edit' | 'renew' | 'handback';

export interface OfficeSheetProps {
  readonly open: boolean;
  readonly mode: OfficeSheetMode;
  readonly office: Office | null;
  readonly companyId: string;
  readonly companyName: string;
  readonly onClose: () => void;
}

interface Form {
  type: PremisesType;
  address: string;
  sizeSqm: string;
  isRegistered: boolean;
  landlord: string;
  start: string;
  end: string;
  notice: string;
  rent: string;
  deposit: string;
  ejariNumber: string;
  ejariExpiry: string;
  quotaAllowed: string;
  quotaUsed: string;
  electricity: string;
  telecom: string;
  access: string;
  parking: string;
  handedBackOn: string;
}

const TYPES = PremisesTypeSchema.options.map((value) => ({ value, label: copy.types[value] }));

const text = (value: number | string | null): string => (value === null ? '' : String(value));

function fromOffice(office: Office | null): Form {
  return {
    type: office?.premises.type ?? 'dedicated-office',
    address: office?.premises.address ?? '',
    sizeSqm: text(office?.premises.sizeSqm ?? null),
    isRegistered: office?.premises.isRegisteredAddress ?? true,
    landlord: office?.lease.landlord ?? '',
    start: office?.lease.start ?? '',
    end: office?.lease.end ?? '',
    notice: text(office?.lease.noticePeriodDays ?? null),
    rent: text(office?.lease.rentAed ?? null),
    deposit: text(office?.lease.securityDepositAed ?? null),
    ejariNumber: office?.lease.ejari?.number ?? '',
    ejariExpiry: office?.lease.ejari?.expiry ?? '',
    quotaAllowed: text(office?.capacity.quotaAllowed ?? null),
    quotaUsed: text(office?.capacity.quotaUsed ?? 0),
    electricity: office?.services.electricityAndWaterAccount ?? '',
    telecom: office?.services.telecomAccount ?? '',
    access: office?.services.buildingAccess ?? '',
    parking: office?.services.parking ?? '',
    handedBackOn: today(),
  };
}

const numberOrNull = (raw: string): number | null => {
  if (raw.trim() === '') {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
};

// One sheet for the four events on an office. Add and edit take the whole record; renew takes
// the new term and the Ejari; hand back takes the day the keys went back, which ends the lease.
// Every write goes through the offices repo and the bundles are read again.
export function OfficeSheet({
  open,
  mode,
  office,
  companyId,
  companyName,
  onClose,
}: OfficeSheetProps) {
  const repos = useRepos();
  const refresh = useRefresh();
  const [form, setForm] = useState<Form>(() => fromOffice(office));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (fields: Partial<Form>) => {
    setForm((current) => ({ ...current, ...fields }));
  };

  const title =
    mode === 'add'
      ? copy.addTitle
      : mode === 'edit'
        ? copy.editTitle
        : mode === 'renew'
          ? copy.renewTitle
          : copy.handBackTitle;
  const subtitle =
    mode === 'renew' ? copy.renewSub : mode === 'handback' ? copy.handBackSub : undefined;

  const ready =
    mode === 'handback'
      ? form.handedBackOn !== ''
      : form.start !== '' && form.end !== '' && (mode === 'renew' || form.landlord.trim() !== '');

  async function save() {
    if (!ready || busy) {
      return;
    }
    if (mode !== 'handback' && form.end <= form.start) {
      setError(copy.needEnd);
      return;
    }
    setBusy(true);
    setError('');
    const ejari =
      form.ejariNumber.trim() !== '' && form.ejariExpiry !== ''
        ? { number: form.ejariNumber.trim(), expiry: form.ejariExpiry }
        : null;
    try {
      if (mode === 'handback' && office !== null) {
        await repos.offices.update(office.id, {
          lease: { ...office.lease, end: form.handedBackOn },
          services: {
            electricityAndWaterAccount:
              form.electricity.trim() === '' ? null : form.electricity.trim(),
            telecomAccount: form.telecom.trim() === '' ? null : form.telecom.trim(),
            buildingAccess: form.access.trim() === '' ? null : form.access.trim(),
            parking: form.parking.trim() === '' ? null : form.parking.trim(),
          },
        });
      } else if (mode === 'renew' && office !== null) {
        await repos.offices.update(office.id, {
          lease: {
            ...office.lease,
            start: form.start,
            end: form.end,
            rentAed: numberOrNull(form.rent),
            ejari,
          },
        });
      } else {
        const record = {
          companyId,
          premises: {
            type: form.type,
            address: form.address.trim(),
            sizeSqm: numberOrNull(form.sizeSqm),
            servesActivityCodes: office?.premises.servesActivityCodes ?? [],
            isRegisteredAddress: form.isRegistered,
          },
          lease: {
            landlord: form.landlord.trim(),
            start: form.start,
            end: form.end,
            noticePeriodDays: numberOrNull(form.notice),
            rentAed: numberOrNull(form.rent),
            securityDepositAed: numberOrNull(form.deposit),
            paymentSchedule: office?.lease.paymentSchedule ?? [],
            ejari,
            tenancyContractDocumentId: office?.lease.tenancyContractDocumentId ?? null,
          },
          approvals: office?.approvals ?? [],
          services: {
            electricityAndWaterAccount:
              form.electricity.trim() === '' ? null : form.electricity.trim(),
            telecomAccount: form.telecom.trim() === '' ? null : form.telecom.trim(),
            buildingAccess: form.access.trim() === '' ? null : form.access.trim(),
            parking: form.parking.trim() === '' ? null : form.parking.trim(),
          },
          capacity: {
            quotaAllowed: numberOrNull(form.quotaAllowed),
            quotaUsed: numberOrNull(form.quotaUsed) ?? 0,
          },
        };
        if (office === null) {
          await repos.offices.create(record);
        } else {
          await repos.offices.update(office.id, record);
        }
      }
      await refresh();
      setBusy(false);
      onClose();
    } catch (failure: unknown) {
      setBusy(false);
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }

  const services = (
    <div className="fgrp">
      <div className="fk">{copy.services}</div>
      <div className="fpair">
        <TextField
          label={copy.electricity}
          value={form.electricity}
          onChange={(electricity) => {
            set({ electricity });
          }}
        />
        <TextField
          label={copy.telecom}
          value={form.telecom}
          onChange={(telecom) => {
            set({ telecom });
          }}
        />
      </div>
      <div className="fpair">
        <TextField
          label={copy.access}
          value={form.access}
          onChange={(access) => {
            set({ access });
          }}
        />
        <TextField
          label={copy.parking}
          value={form.parking}
          onChange={(parking) => {
            set({ parking });
          }}
        />
      </div>
    </div>
  );

  return (
    <Sheet
      open={open}
      kicker={companyName}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          onClick={() => {
            void save();
          }}
          disabled={!ready || busy}
          loading={busy}
        >
          {busy
            ? copy.busy
            : mode === 'add'
              ? copy.saveNew
              : mode === 'handback'
                ? copy.handBackConfirm
                : copy.save}
        </Button>
      }
    >
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {mode === 'handback' ? (
          <>
            <div className="fgrp">
              <DateField
                label={copy.handBackOn}
                value={form.handedBackOn}
                max={today()}
                onChange={(handedBackOn) => {
                  set({ handedBackOn });
                }}
              />
            </div>
            {services}
          </>
        ) : null}

        {mode === 'add' || mode === 'edit' ? (
          <div className="fgrp">
            <div className="fk">{copy.premises}</div>
            <Field label={copy.type} htmlFor="of-type">
              <Picker
                id="of-type"
                label={copy.type}
                value={form.type}
                options={TYPES}
                onChange={(type) => {
                  set({ type });
                }}
              />
            </Field>
            <TextField
              label={copy.address}
              value={form.address}
              onChange={(address) => {
                set({ address });
              }}
            />
            <div className="fpair">
              <TextField
                label={copy.sizeSqm}
                type="number"
                value={form.sizeSqm}
                onChange={(sizeSqm) => {
                  set({ sizeSqm });
                }}
              />
              <Checkbox
                label={copy.isRegistered}
                checked={form.isRegistered}
                onChange={(isRegistered) => {
                  set({ isRegistered });
                }}
              />
            </div>
          </div>
        ) : null}

        {mode !== 'handback' ? (
          <div className="fgrp">
            <div className="fk">{copy.theLease}</div>
            {mode === 'renew' ? null : (
              <TextField
                label={copy.landlord}
                value={form.landlord}
                required
                onChange={(landlord) => {
                  set({ landlord });
                }}
              />
            )}
            <div className="fpair">
              <DateField
                label={copy.start}
                value={form.start}
                onChange={(start) => {
                  set({ start });
                }}
              />
              <DateField
                label={copy.end}
                value={form.end}
                onChange={(end) => {
                  set({ end });
                }}
              />
            </div>
            <div className="fpair">
              <TextField
                label={copy.rent}
                type="number"
                value={form.rent}
                onChange={(rent) => {
                  set({ rent });
                }}
              />
              {mode === 'renew' ? (
                <span />
              ) : (
                <TextField
                  label={copy.deposit}
                  type="number"
                  value={form.deposit}
                  onChange={(deposit) => {
                    set({ deposit });
                  }}
                />
              )}
            </div>
            {mode === 'renew' ? null : (
              <TextField
                label={copy.notice}
                type="number"
                value={form.notice}
                onChange={(notice) => {
                  set({ notice });
                }}
              />
            )}
            <div className="fpair">
              <TextField
                label={copy.ejariNumber}
                value={form.ejariNumber}
                onChange={(ejariNumber) => {
                  set({ ejariNumber });
                }}
              />
              <DateField
                label={copy.ejariExpiry}
                value={form.ejariExpiry}
                onChange={(ejariExpiry) => {
                  set({ ejariExpiry });
                }}
              />
            </div>
          </div>
        ) : null}

        {mode === 'add' || mode === 'edit' ? (
          <>
            <div className="fgrp">
              <div className="fk">{copy.capacity}</div>
              <div className="fpair">
                <TextField
                  label={copy.quotaAllowed}
                  type="number"
                  value={form.quotaAllowed}
                  onChange={(quotaAllowed) => {
                    set({ quotaAllowed });
                  }}
                />
                <TextField
                  label={copy.quotaUsed}
                  type="number"
                  value={form.quotaUsed}
                  onChange={(quotaUsed) => {
                    set({ quotaUsed });
                  }}
                />
              </div>
            </div>
            {services}
          </>
        ) : null}

        {error !== '' ? (
          <div className="sheet-ferr" role="alert">
            {error}
          </div>
        ) : null}
      </form>
    </Sheet>
  );
}
