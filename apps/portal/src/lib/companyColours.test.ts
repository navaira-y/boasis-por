import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMPANY_COLOURS } from './companyColours';

// The CEO's rule for company colours, as a test: no company colour may be taken for an orbit
// colour or for the late red or the soon amber, none is grey, and no two are alike. The
// references are read from tokens.css, so a change to an orbit or a state colour is checked
// against the palette too.
const tokens = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');

const MIN_HUE_FROM_REFERENCE = 28;
const MIN_HUE_BETWEEN = 24;
const MIN_CHROMA = 0.08;

type Theme = 'light' | 'dark';

interface Oklch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

// sRGB hex to OKLCH (Bjorn Ottosson's OKLab matrices), hue in degrees 0 to 360.
function oklchOf(hex: string): Oklch {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (match?.[1] === undefined) {
    throw new Error(`not a six digit hex colour: ${hex}`);
  }
  const digits = match[1];
  const [r, g, b] = [0, 2, 4].map((at) => {
    const channel = parseInt(digits.slice(at, at + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bAxis = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const hue = (Math.atan2(bAxis, a) * 180) / Math.PI;
  return { l: lightness, c: Math.hypot(a, bAxis), h: hue < 0 ? hue + 360 : hue };
}

function hueGap(a: number, b: number): number {
  const gap = Math.abs(a - b) % 360;
  return gap > 180 ? 360 - gap : gap;
}

// The custom properties of one block of tokens.css, the block that opens with `opening`.
function block(opening: string): Map<string, string> {
  const start = tokens.indexOf(opening);
  if (start === -1) {
    throw new Error(`tokens.css has no block ${opening}`);
  }
  const end = tokens.indexOf('\n}', start);
  const body = tokens.slice(start + opening.length, end);
  const found = new Map<string, string>();
  for (const line of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    if (line[1] !== undefined && line[2] !== undefined) {
      found.set(line[1], line[2].trim());
    }
  }
  return found;
}

const LIGHT = block(':root {');
const DARK = block(":root[data-theme='dark'] {");
const SYSTEM_DARK = block(":root:not([data-theme='light']) {");

// A token's value in a theme, following var() references; dark falls back to light.
function resolve(name: string, theme: Theme): string {
  const value = (theme === 'dark' ? DARK.get(name) : undefined) ?? LIGHT.get(name);
  if (value === undefined) {
    throw new Error(`tokens.css has no ${name}`);
  }
  const reference = /^var\((--[\w-]+)\)$/.exec(value);
  return reference?.[1] === undefined ? value : resolve(reference[1], theme);
}

// The colours a company colour must never be taken for: the four orbits, the late state and
// its red badge, and the soon amber.
const REFERENCES = [
  ['tax gold', '--family-tax'],
  ['visa purple', '--family-visa'],
  ['licence teal', '--family-licence'],
  ['other grey', '--family-other'],
  ['late red', '--state-overdue'],
  ['late badge red', '--badge'],
  ['soon amber', '--state-action-soon'],
] as const;

const THEMES: readonly Theme[] = ['light', 'dark'];

describe('company colours', () => {
  it('has seven colours, as tokens --company-0 to --company-6 in both themes', () => {
    expect(COMPANY_COLOURS).toHaveLength(7);
    COMPANY_COLOURS.forEach((colour, slot) => {
      const name = `--company-${String(slot)}`;
      expect(LIGHT.get(name)).toBe(colour.light);
      expect(DARK.get(name)).toBe(colour.dark);
      expect(SYSTEM_DARK.get(name)).toBe(colour.dark);
    });
    expect(LIGHT.has(`--company-${String(COMPANY_COLOURS.length)}`)).toBe(false);
  });

  for (const theme of THEMES) {
    describe(`in the ${theme} theme`, () => {
      const palette = COMPANY_COLOURS.map((colour) => ({
        name: colour.name,
        ...oklchOf(colour[theme]),
      }));

      it(`keeps every chroma at ${String(MIN_CHROMA)} or more, so none is grey`, () => {
        for (const colour of palette) {
          expect(colour.c, colour.name).toBeGreaterThanOrEqual(MIN_CHROMA);
        }
      });

      it(`keeps every hue ${String(MIN_HUE_FROM_REFERENCE)} degrees from the orbits and the states`, () => {
        for (const [label, token] of REFERENCES) {
          const reference = oklchOf(resolve(token, theme));
          // A grey has no hue to keep away from: its angle is noise. The chroma floor above is
          // what keeps a company colour from being taken for it, so it is checked here too.
          if (reference.c < MIN_CHROMA) {
            for (const colour of palette) {
              expect(colour.c - reference.c, `${colour.name} against ${label}`).toBeGreaterThan(
                0.04,
              );
            }
            continue;
          }
          for (const colour of palette) {
            expect(
              hueGap(colour.h, reference.h),
              `${colour.name} (${colour.h.toFixed(1)}) against ${label} (${reference.h.toFixed(1)})`,
            ).toBeGreaterThanOrEqual(MIN_HUE_FROM_REFERENCE);
          }
        }
      });

      it(`keeps the colours ${String(MIN_HUE_BETWEEN)} degrees apart from each other`, () => {
        palette.forEach((one, index) => {
          for (const other of palette.slice(index + 1)) {
            expect(
              hueGap(one.h, other.h),
              `${one.name} against ${other.name}`,
            ).toBeGreaterThanOrEqual(MIN_HUE_BETWEEN);
          }
        });
      });
    });
  }
});
