import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The row of code boxes burst out of its panel on the live site, drawing over the
 * text beside it: an input keeps its intrinsic 20-character width unless the
 * stylesheet takes that away, and the row was a fixed six-column grid. These read
 * the stylesheet itself, because that is where the bug lived and where a
 * "tidy-up" would bring it straight back.
 */
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`no rule for ${selector}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

describe('the row of code boxes', () => {
  it('lets the boxes share the row, whatever the code length is', () => {
    const row = rule('.code-boxes');
    // A fixed six-column grid is what drew six boxes for an eight-digit code and
    // overflowed the panel.
    expect(row).not.toContain('grid');
    expect(row).toContain('flex');
  });

  it('takes away the input width that made them overflow', () => {
    const box = rule('.code-boxes input');
    expect(box).toContain('min-width: 0');
    expect(box).toContain('flex: 1 1 0');
  });

  it('keeps the boxes inside the panel on a narrow phone', () => {
    const box = rule('.code-boxes input');
    // clamp keeps ten boxes from becoming unreadably small while never letting
    // them grow past the panel.
    expect(box).toContain('clamp(');
    expect(box).toContain('max-width');
  });
});

describe('text that sits beside the boxes', () => {
  it('wraps a long address instead of pushing the panel wide', () => {
    expect(rule('.lede')).toContain('overflow-wrap: anywhere');
  });
});
