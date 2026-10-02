import type { CompanyFacts } from '@boasis/schema';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckIcon, ChevronIcon } from '../components/shared/icons';
import { libraryAuthorityFor, type LibraryEntry } from '../content/content';
import { useAuthorityFile, useLibraryEntries } from '../content/hooks';
import { screens } from '../copy/en';
import { useCompanies, usePeople } from '../data';
import { formatLong } from '../lib/dates';
import {
  appliesTo,
  entryText,
  fold,
  sourceCount,
  TOPICS,
  topicOf,
  type Topic,
} from '../lib/library';
import { hostOf, parseBlocks, parseInline, type Block } from '../lib/markdown';
import { IconCompany, IconDoc, IconPeople, IconReceipt, IconSearch, IconSpark } from './icons';
import { CloseIcon } from '../components/shared/icons';
import './lite.css';
import './Library.css';

const copy = screens.library;

function TopicIcon({ topic, size }: { topic: Topic; size: number }) {
  switch (topic) {
    case 'licence':
      return <IconCompany size={size} />;
    case 'tax':
      return <IconReceipt size={size} />;
    case 'people':
      return <IconPeople size={size} />;
    case 'other':
      return <IconSpark size={size} />;
  }
}

interface Shelf {
  authority: string;
  company: CompanyFacts | null;
  entries: LibraryEntry[];
  loading: boolean;
}

// Spec 8: a company sees the library of its own authority. The first company of the account
// decides; one whose authority has no library reads the Dubai mainland one.
function useShelf(): Shelf {
  const companies = useCompanies();
  const company = companies.data?.[0] ?? null;
  const authority = libraryAuthorityFor(company?.identity.authority ?? 'dubai-mainland');
  const entries = useLibraryEntries(authority);
  return {
    authority,
    company,
    entries: entries.data ?? [],
    loading: companies.isPending || entries.isPending,
  };
}

// Screen 15 (spec 14): lite's guides shelf, ported. The entries for you first, then the rest,
// with a search and one chip per shelf.
export function Library() {
  const navigate = useNavigate();
  const { authority, company, entries, loading } = useShelf();
  const people = usePeople(company?.id ?? '');
  const file = useAuthorityFile(company?.identity.authority ?? null);
  const [shelf, setShelf] = useState<'all' | 'mine' | Topic>('all');
  const [query, setQuery] = useState('');

  const relevant = new Set(
    entries
      .filter((entry) => appliesTo(entry, company, people.data ?? [], file.data ?? null))
      .map((entry) => entry.frontMatter.id),
  );
  const mine = entries.filter((entry) => relevant.has(entry.frontMatter.id));
  const q = fold(query.trim());
  const shown = entries.filter(
    (entry) =>
      (shelf === 'all' ||
        (shelf === 'mine' ? relevant.has(entry.frontMatter.id) : topicOf(entry) === shelf)) &&
      (q === '' || fold(entryText(entry)).includes(q)),
  );
  const split = shelf === 'all' && q === '' && mine.length > 0 && mine.length < entries.length;
  const featured = split ? shown.filter((entry) => relevant.has(entry.frontMatter.id)) : [];
  const rest = split ? shown.filter((entry) => !relevant.has(entry.frontMatter.id)) : shown;

  const chips: { id: 'all' | 'mine' | Topic; label: string; count: number }[] = [
    { id: 'all', label: copy.all, count: entries.length },
    ...(split ? [{ id: 'mine' as const, label: copy.mine, count: mine.length }] : []),
    ...TOPICS.map((topic) => ({
      id: topic,
      label: copy.topics[topic],
      count: entries.filter((entry) => topicOf(entry) === topic).length,
    })).filter((chip) => chip.count > 0),
  ];

  const open = (entry: LibraryEntry) => {
    void navigate(`/library/${entry.frontMatter.id}`);
  };

  return (
    <div className="pg lib">
      <div className="vhead">
        <div>
          <h2>{copy.title}</h2>
          <p>{copy.subtitle}</p>
        </div>
      </div>

      {loading ? (
        <p className="status" role="status">
          {screens.common.loading}
        </p>
      ) : entries.length === 0 ? (
        <div className="soon2">
          <span className="ic">
            <IconDoc size={22} />
          </span>
          <h2>{copy.none}</h2>
          <p>{copy.noneBody}</p>
        </div>
      ) : (
        <>
          <div className="libbar">
            <label className="libsearch">
              <IconSearch />
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.currentTarget.value);
                }}
                placeholder={copy.search}
                aria-label={copy.search}
              />
              {query !== '' ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                  }}
                  aria-label={copy.clear}
                >
                  <CloseIcon width="14" height="14" />
                </button>
              ) : null}
            </label>
            <div className="libchips">
              {chips.map((chip) => {
                const topical = TOPICS.includes(chip.id as Topic);
                return (
                  <button
                    key={chip.id}
                    type="button"
                    className={`libchip${topical ? ` tp-${chip.id}` : ''}${shelf === chip.id ? ' on' : ''}`}
                    aria-pressed={shelf === chip.id}
                    onClick={() => {
                      setShelf(chip.id);
                    }}
                  >
                    {topical ? <span className="l-dot" /> : null}
                    {chip.label}
                    <span className="l-n">{chip.count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {featured.length > 0 ? (
            <section>
              <div className="sect">{copy.forYou}</div>
              <div className="libgrid feat">
                {featured.map((entry, index) => (
                  <EntryCard
                    key={entry.frontMatter.id}
                    entry={entry}
                    onOpen={open}
                    big
                    index={index}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {rest.length > 0 ? (
            <section>
              {featured.length > 0 ? <div className="sect">{copy.everythingElse}</div> : null}
              <div className="libgrid">
                {rest.map((entry, index) => (
                  <EntryCard key={entry.frontMatter.id} entry={entry} onOpen={open} index={index} />
                ))}
              </div>
            </section>
          ) : null}

          {shown.length === 0 ? <p className="libnone">{copy.noMatch(query.trim())}</p> : null}
          <p className="hintline">{copy.authority(authority)}</p>
        </>
      )}
    </div>
  );
}

function EntryCard({
  entry,
  onOpen,
  big = false,
  index = 0,
}: {
  entry: LibraryEntry;
  onOpen: (entry: LibraryEntry) => void;
  big?: boolean;
  index?: number;
}) {
  const topic = topicOf(entry);
  const sources = sourceCount(entry);
  return (
    <button
      type="button"
      className={`libcard tp-${topic}${big ? ' big' : ''}`}
      data-entry={entry.frontMatter.id}
      style={{ '--i': index }}
      onClick={() => {
        onOpen(entry);
      }}
    >
      <span className="l-top">
        <span className="libic">
          <TopicIcon topic={topic} size={big ? 22 : 19} />
        </span>
        <span className="libeye">{copy.topics[topic]}</span>
      </span>
      <span className="libt">{entry.frontMatter.title}</span>
      <span className="libs">{entry.summary}</span>
      <span className="libm">
        <CheckIcon width="13" height="13" />
        {copy.checked(formatLong(entry.frontMatter.lastChecked))}
        {sources > 0 ? (
          <>
            <i />
            {sources === 1 ? '1 source' : `${String(sources)} sources`}
          </>
        ) : null}
      </span>
    </button>
  );
}

// Screen 15, the entry page: the written content of spec 8.1, rendered from the Markdown
// sections, ending on the sources it was checked against.
export function LibraryEntryPage() {
  const { entryId = '' } = useParams();
  const navigate = useNavigate();
  const { company, entries, loading } = useShelf();
  const entry = entries.find((candidate) => candidate.frontMatter.id === entryId) ?? null;
  const bar = useRef<HTMLDivElement>(null);

  // How far down the page you are, as a thin line in the entry's colour, painted straight onto
  // the element on each scroll of the shell body.
  useEffect(() => {
    const scroller = document.querySelector('.shell__body');
    if (scroller === null) {
      return undefined;
    }
    scroller.scrollTo({ top: 0 });
    const paint = () => {
      const max = scroller.scrollHeight - scroller.clientHeight;
      bar.current?.style.setProperty(
        '--read',
        max > 0 ? String(Math.min(1, scroller.scrollTop / max)) : '0',
      );
    };
    paint();
    scroller.addEventListener('scroll', paint, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', paint);
    };
  }, [entryId]);

  if (entry === null) {
    return (
      <div className="pg">
        {loading ? (
          <p className="status" role="status">
            {screens.common.loading}
          </p>
        ) : (
          <p role="alert">Nothing here</p>
        )}
      </div>
    );
  }

  const topic = topicOf(entry);
  const blocks = parseBlocks(entry.body);
  const heads = blocks
    .map((block, index) =>
      block.kind === 'heading' && block.level === 2 ? { index, block } : null,
    )
    .filter((head): head is { index: number; block: Block & { kind: 'heading' } } => head !== null)
    .filter((head) => head.block.text !== 'Sources' && head.block.text !== 'Matching card');
  const jump = (index: number) => {
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document
      .getElementById(`${entry.frontMatter.id}-${String(index)}`)
      ?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
  };

  // The hero already shows the title and the summary line; the body skips both. Ids follow
  // the index in the whole block list, so the table of contents finds every heading.
  const titleAt = blocks.findIndex((block) => block.kind === 'heading' && block.level === 1);
  const summaryAt = blocks.findIndex(
    (block, index) => index > titleAt && block.kind === 'paragraph',
  );
  const skip = new Set([titleAt, summaryAt]);

  return (
    <div className="pg libart-page">
      <article className={`libart tp-${topic}`} data-entry={entry.frontMatter.id}>
        <div className="libread" ref={bar} aria-hidden="true">
          <span />
        </div>
        <button
          type="button"
          className="back"
          onClick={() => {
            void navigate('/library');
          }}
        >
          <ChevronIcon className="rev" width="15" height="15" />
          {copy.back}
        </button>

        <header className="libhero">
          <span className="libic">
            <TopicIcon topic={topic} size={24} />
          </span>
          <div className="libhd">
            <span className="libeye">{copy.topics[topic]}</span>
            <h2>{entry.frontMatter.title}</h2>
            <p className="l-lede">{entry.summary}</p>
            <div className="libmeta">
              <span>
                <CheckIcon width="13" height="13" />
                {copy.checked(formatLong(entry.frontMatter.lastChecked))}
              </span>
            </div>
          </div>
        </header>

        {heads.length >= 3 ? (
          <nav className="libtoc" aria-label={copy.onThisPage}>
            <span className="l-label">{copy.onThisPage}</span>
            {heads.map((head) => (
              <button
                key={head.index}
                type="button"
                onClick={() => {
                  jump(head.index);
                }}
              >
                {head.block.text}
              </button>
            ))}
          </nav>
        ) : null}

        <div className="libbody">
          <Sections
            blocks={blocks}
            skip={skip}
            entryId={entry.frontMatter.id}
            cardId={entry.frontMatter.cardId}
            companyId={company?.id ?? null}
          />
        </div>

        <p className="libnote">{copy.disclaimer}</p>
      </article>
    </div>
  );
}

function Sections({
  blocks,
  skip,
  entryId,
  cardId,
  companyId,
}: {
  blocks: Block[];
  skip: ReadonlySet<number>;
  entryId: string;
  cardId: string;
  companyId: string | null;
}) {
  let section = '';
  const out: ReactNode[] = [];
  blocks.forEach((block, index) => {
    if (skip.has(index)) {
      return;
    }
    const id = `${entryId}-${String(index)}`;
    if (block.kind === 'heading') {
      section = block.text;
      if (section === 'Sources') {
        out.push(
          <section className="libsrcs" key={id}>
            <h3 id={id}>{copy.sources}</h3>
          </section>,
        );
        return;
      }
      out.push(
        <h3 id={id} className="libh" key={id}>
          {block.text}
        </h3>,
      );
      return;
    }
    if (section === 'Sources') {
      const items = block.kind === 'paragraph' ? [block.text] : block.items;
      for (const item of items) {
        const pieces = parseInline(item);
        const research = pieces
          .filter((piece) => piece.kind === 'text')
          .map((piece) => piece.text)
          .join('')
          .replace(/[:;\s]+$/, '');
        for (const piece of pieces) {
          if (piece.kind === 'link') {
            out.push(
              <a
                key={`${id}-${piece.url}`}
                className="libsrc"
                href={piece.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="l-bd">
                  <span className="l-pub">{hostOf(piece.url)}</span>
                  <span className="l-rt">{research}</span>
                  <span className="l-host">{piece.url}</span>
                </span>
              </a>,
            );
          }
        }
      }
      return;
    }
    if (section === 'Matching card') {
      out.push(
        <p className="libp" key={id}>
          {companyId === null ? (
            <code>{cardId}</code>
          ) : (
            <Link className="libcardlink" to={`/companies/${companyId}/compliance`}>
              {copy.matchingCard}: <code>{cardId}</code>
            </Link>
          )}
        </p>,
      );
      return;
    }
    if (block.kind === 'paragraph') {
      out.push(
        <p className="libp" key={id}>
          <Inline text={block.text} />
        </p>,
      );
      return;
    }
    if (block.kind === 'ordered') {
      out.push(
        <ol className="libsteps" key={id}>
          {block.items.map((item, at) => {
            const colon = item.indexOf(':');
            const who = colon === -1 ? null : item.slice(0, colon);
            const text = colon === -1 ? item : item.slice(colon + 1).trim();
            return (
              <li key={at}>
                <span className="l-n">{at + 1}</span>
                <span className="l-bd">
                  {who !== null ? <b>{who}</b> : null}
                  <span>
                    <Inline text={text} />
                  </span>
                </span>
              </li>
            );
          })}
        </ol>,
      );
      return;
    }
    out.push(
      <ul className="liblist" key={id}>
        {block.items.map((item, at) => (
          <li key={at}>
            <Inline text={item} />
          </li>
        ))}
      </ul>,
    );
  });
  return <>{out}</>;
}

function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((piece, index) => {
        if (piece.kind === 'code') {
          return <code key={index}>{piece.text}</code>;
        }
        if (piece.kind === 'link') {
          return (
            <a key={index} href={piece.url} target="_blank" rel="noopener noreferrer">
              {hostOf(piece.url)}
            </a>
          );
        }
        return <span key={index}>{piece.text}</span>;
      })}
    </>
  );
}
