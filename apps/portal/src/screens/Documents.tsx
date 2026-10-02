import type { Document } from '@boasis/schema';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Sheet } from '../components';
import { screens } from '../copy/en';
import { libraryAuthorityFor } from '../content/content';
import { useLibraryEntries } from '../content/hooks';
import { useCompany, useDocuments, usePeople } from '../data';
import { formatLong } from '../lib/dates';
import { bankPack, documentFlag, documentTypeLabel } from '../lib/documents';
import { todayIso } from '../lib/today';
import { IconDoc, IconPlus } from './icons';
import { UploadSheet } from './UploadSheet';
import './lite.css';
import './Documents.css';

const copy = screens.documents;

function DocRow({ document, today }: { document: Document; today: string }) {
  const flag = documentFlag(document.expiryDate, today);
  const line = [
    documentTypeLabel(document.type),
    document.expiryDate !== null
      ? copy.expiresOn(formatLong(document.expiryDate))
      : copy.uploadedOn(formatLong(document.uploadedOn)),
  ].join(' · ');
  return (
    <div className="frow doc">
      <div className="main">
        <span className="fi">
          <IconDoc size={15} />
        </span>
        <span className="bd">
          <span className="t">{document.title}</span>
          <span className="s">{line}</span>
        </span>
        {flag === 'expired' ? <span className="st bad">{copy.expired}</span> : null}
        {flag === 'due-soon' ? <span className="st soon">{screens.common.dueSoon}</span> : null}
      </div>
    </div>
  );
}

// Screen 5 (spec 14): lite's vault, ported. Every document of the company, newest first, with
// its type and its date, the upload sheet, and the bank KYC pack (spec 5.3).
export function Documents() {
  const { id = '' } = useParams();
  const company = useCompany(id);
  const documents = useDocuments(id);
  const people = usePeople(id);
  const [adding, setAdding] = useState(false);
  // The pack sheet mounts when it opens and stays a moment after closing, as useSheets does for
  // every other sheet: mounted open, its veil is dimmed at once and the panel rises into place.
  const [packMounted, setPackMounted] = useState(false);
  const [packOpen, setPackOpen] = useState(false);
  useEffect(() => {
    if (packOpen) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setPackMounted(false);
    }, 260);
    return () => {
      window.clearTimeout(timer);
    };
  }, [packOpen]);
  const today = todayIso();

  const list = [...(documents.data ?? [])].sort((a, b) => b.uploadedOn.localeCompare(a.uploadedOn));
  const facts = company.data ?? null;
  const companyName = facts?.identity.tradeName ?? '';
  const library = useLibraryEntries(
    libraryAuthorityFor(facts?.identity.authority ?? 'dubai-mainland'),
  );
  const bankEntry =
    (library.data ?? []).find((entry) => entry.frontMatter.id === 'your-bank') ?? null;
  const pack = bankPack(bankEntry, list, today);

  return (
    <div className="pg documents">
      <div className="vhead">
        <div>
          <h2>{copy.title}</h2>
          <p>{copy.subtitle(list.length)}</p>
        </div>
        <div className="acts2">
          <button
            type="button"
            className="add g"
            onClick={() => {
              setPackMounted(true);
              setPackOpen(true);
            }}
          >
            {copy.pack}
          </button>
          <button
            type="button"
            className="add"
            onClick={() => {
              setAdding(true);
            }}
          >
            <IconPlus />
            {copy.add}
          </button>
        </div>
      </div>

      {documents.isPending ? (
        <p className="status" role="status">
          {screens.common.loading}
        </p>
      ) : null}
      {documents.isError ? <p role="alert">{documents.error.message}</p> : null}

      {documents.isSuccess && list.length === 0 ? (
        <div className="soon2">
          <span className="ic">
            <IconDoc size={22} />
          </span>
          <h2>{copy.noneTitle}</h2>
          <p>{copy.noneBody}</p>
        </div>
      ) : null}

      {list.map((document) => (
        <DocRow key={document.id} document={document} today={today} />
      ))}

      {facts !== null ? (
        <UploadSheet
          open={adding}
          companyId={id}
          companyName={companyName}
          people={people.data ?? []}
          onClose={() => {
            setAdding(false);
          }}
          onSaved={() => undefined}
        />
      ) : null}

      {packMounted ? (
        <Sheet
          open={packOpen}
          kicker={companyName}
          title={copy.packTitle}
          subtitle={copy.packNote}
          onClose={() => {
            setPackOpen(false);
          }}
        >
          <div className="pg">
            {pack.map((line) => (
              <div key={line.label} className={`frow${line.document === null ? ' miss' : ''}`}>
                <span className="fi">
                  <IconDoc size={15} />
                </span>
                <span className="bd">
                  <span className="t">{line.label}</span>
                  <span className="s">
                    {line.document === null
                      ? line.types.map(documentTypeLabel).join(' · ')
                      : [
                          line.document.title,
                          line.document.expiryDate === null
                            ? null
                            : copy.expiresOn(formatLong(line.document.expiryDate)),
                        ]
                          .filter((part) => part !== null)
                          .join(' · ')}
                  </span>
                </span>
                <span
                  className={`st${line.state === 'expired' ? ' bad' : line.state === 'missing' ? ' soon' : ''}`}
                >
                  {line.state === 'present'
                    ? copy.present
                    : line.state === 'expired'
                      ? copy.expired
                      : copy.missing}
                </span>
              </div>
            ))}
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}
