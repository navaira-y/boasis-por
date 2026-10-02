// A small reader for the library entries: headings, paragraphs, ordered and bulleted lists,
// and the links they carry. The format is fixed by the library entry format, so nothing more
// is needed and no Markdown library is added.
export type Block =
  | { kind: 'heading'; level: 1 | 2; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'ordered'; items: string[] }
  | { kind: 'bullets'; items: string[] };

export function parseBlocks(body: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { kind: 'ordered' | 'bullets'; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list !== null) {
      blocks.push(list);
      list = null;
    }
  };

  for (const rawLine of body.split('\n')) {
    const line = rawLine.trimEnd();
    if (line.trim() === '') {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = /^(#{1,2}) (.+)$/.exec(line);
    if (heading !== null) {
      flushParagraph();
      flushList();
      blocks.push({ kind: 'heading', level: heading[1] === '#' ? 1 : 2, text: heading[2] ?? '' });
      continue;
    }
    const ordered = /^\d+\.\s+(.+)$/.exec(line);
    if (ordered !== null) {
      flushParagraph();
      if (list?.kind !== 'ordered') {
        flushList();
        list = { kind: 'ordered', items: [] };
      }
      list.items.push(ordered[1] ?? '');
      continue;
    }
    const bullet = /^[-*]\s+(.+)$/.exec(line);
    if (bullet !== null) {
      flushParagraph();
      if (list?.kind !== 'bullets') {
        flushList();
        list = { kind: 'bullets', items: [] };
      }
      list.items.push(bullet[1] ?? '');
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  return blocks;
}

// Inline code spans and bare URLs, as pieces a screen can render: text, code or a link.
export type Piece =
  { kind: 'text'; text: string } | { kind: 'code'; text: string } | { kind: 'link'; url: string };

const INLINE = /(`[^`]+`|https?:\/\/[^\s;)]+)/g;

export function parseInline(text: string): Piece[] {
  const pieces: Piece[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const at = match.index;
    const token = match[0];
    if (at > last) {
      pieces.push({ kind: 'text', text: text.slice(last, at) });
    }
    if (token.startsWith('`')) {
      pieces.push({ kind: 'code', text: token.slice(1, -1) });
    } else {
      pieces.push({ kind: 'link', url: token });
    }
    last = at + token.length;
  }
  if (last < text.length) {
    pieces.push({ kind: 'text', text: text.slice(last) });
  }
  return pieces;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
