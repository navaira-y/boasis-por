import type { KeyboardEvent, ReactNode } from 'react';
import { cx } from '../shared/cx';
import { useLayout } from '../shared/LayerProvider';
import { DIAL_FAMILIES, familyIndex, type DialFamily } from './families';
import { angleGap, placeInWindow, pointAt, positionFor } from './position';
import './Dial.css';

export interface DialMark {
  readonly id: string;
  readonly date: string;
  // The orbit the mark sits on.
  readonly family: DialFamily;
  readonly label: string;
  // The company's colour from the company palette, as a CSS value: the dot is filled with it.
  readonly colour: string;
  // Days to the date, already worked out by packages/rules; decides how bright the mark is.
  readonly daysLeft?: number;
}

export interface DialProps {
  readonly today: string;
  readonly marks: readonly DialMark[];
  readonly onSelect?: (id: string) => void;
  // What the hub shows: the countdown, worded by the screen.
  readonly children?: ReactNode;
  readonly className?: string;
}

// Lite's dial, ported as it was: the year as a watch face. January at twelve, the year running
// clockwise, week ticks and month indices on the bezel, the month names in the black crown, a
// short chord across the outer track for today with the word at the end of the same ray, the hub
// carrying the light and the countdown. Three changes the CEO asked for: four coloured orbits,
// one per family; marks that are small solid dots in the company's colour on the family orbit,
// no text in them; no family names written on the rings (the legend under the dial says them).
//
// The hub had to hold the countdown and the hands had ten pixels left, so the face grew around
// it rather than the text shrinking: a 340 unit square.
const C = 170;
// The month names live in the black crown, between the bezel and the edge of the case. TODAY
// shares exactly that radius: it takes the place of the month it hides.
const R_LABEL = 163;
const R_TODAY = 163;
// The bezel: week ticks and month indices.
const R_MONTH = 140;
// The hub: it holds the countdown and carries the light.
const R_HUB = 82;
// The orbits are fixed: four families, so a family's place never moves from one screen to the
// next. Under the ticks (which come down to 131) and above the hub (which starts at 82).
const R_OUT = 126;
const R_IN = 90;
const STEP = (R_OUT - R_IN) / (DIAL_FAMILIES.length - 1);
const TICKS = 48;
// The face is drawn at 340 and shown at 230 on a phone, a third smaller: the month names are
// written at 13 so they are still a word and not a texture.
const FACE = { size: 13, pips: 2.6 };
const TODAY_REACH = 13;
const HIDE_MONTH_WITHIN = 16;
const MARK_RADIUS = 4.6;
const MARK_RADIUS_NEXT = 6;
const MARK_HIT = 13;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function orbitOf(family: DialFamily): number {
  return R_OUT - familyIndex(family) * STEP;
}

// A short mark laid across a track, not a hand from the centre: a ray across the whole dial gives
// an object to follow rather than a position to read.
function chord(angle: number, radius: number, reach: number) {
  const a = pointAt(C, radius - reach, angle);
  const b = pointAt(C, radius + reach, angle);
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

export function Dial({ today, marks, onSelect, children, className }: DialProps) {
  const layout = useLayout();
  const todayAngle = positionFor(today) ?? -90;

  // Soonest first, as lite orders its entries: the first one gets the larger mark. A date more
  // than twelve months out is not drawn: it would land on the wrong month.
  const shown: { mark: DialMark; angle: number }[] = [];
  for (const mark of marks) {
    const angle = positionFor(mark.date);
    if (angle === null || placeInWindow(mark.date, today) === 'beyond') {
      continue;
    }
    shown.push({ mark, angle });
  }
  shown.sort((a, b) => (a.mark.date < b.mark.date ? -1 : a.mark.date > b.mark.date ? 1 : 0));

  // The bezel: four ticks per month, one a week. It is what makes this read as a watch rather
  // than a pie chart, and it costs one line.
  const ticks = [];
  for (let index = 0; index < TICKS; index += 1) {
    const angle = (index / TICKS) * 360 - 90;
    const major = index % 4 === 0;
    const from = pointAt(C, R_MONTH - (major ? 9 : 5), angle);
    const to = pointAt(C, R_MONTH - 1, angle);
    ticks.push(
      <line
        key={index}
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        className={cx('dial__tick', major && 'dial__tick--major')}
        strokeLinecap="round"
      />,
    );
  }

  const months = MONTHS.map((name, index) => {
    const angle = (index / 12) * 360 - 90;
    const pip = pointAt(C, R_MONTH, angle);
    const label = pointAt(C, R_LABEL, angle);
    // Under the word "today" the month name steps aside rather than being overlapped: the
    // position says which month it is.
    const hidden = angleGap(angle, todayAngle) < HIDE_MONTH_WITHIN;
    return (
      <g key={name}>
        <circle cx={pip.x} cy={pip.y} r={FACE.pips} className="dial__pip" />
        {hidden ? null : (
          <text
            x={label.x}
            y={label.y}
            textAnchor="middle"
            dominantBaseline="central"
            className="dial__month"
          >
            {name}
          </text>
        )}
      </g>
    );
  });

  const todayMark = chord(todayAngle, R_OUT, TODAY_REACH);
  const todayLabel = pointAt(C, R_TODAY, todayAngle);

  const onMarkKey = (event: KeyboardEvent<SVGGElement>, id: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect?.(id);
    }
  };

  const summary = `${String(shown.length)} dates on the dial`;

  return (
    <div className={cx('dial', `dial--${layout}`, className)}>
      <div className="dial__case">
        <svg
          className="dial__face"
          viewBox={`0 0 ${String(C * 2)} ${String(C * 2)}`}
          role="img"
          aria-label={summary}
          style={{ fontSize: FACE.size }}
        >
          <circle cx={C} cy={C} r={R_MONTH} className="dial__bezel" />
          {ticks}
          {months}

          {/* Today: a mark across the track, and the word at the end of the same ray. */}
          <line {...todayMark} className="dial__today" strokeLinecap="round" />
          <text
            x={todayLabel.x}
            y={todayLabel.y}
            textAnchor="middle"
            dominantBaseline="central"
            className="dial__today-label"
          >
            TODAY
          </text>

          {/* The four orbits, each in its family's colour, outermost first. */}
          {DIAL_FAMILIES.map((family) => (
            <circle
              key={family.id}
              cx={C}
              cy={C}
              r={orbitOf(family.id)}
              className={cx('dial__orbit', `dial__orbit--${family.id}`)}
            />
          ))}

          {shown.map(({ mark, angle }, index) => {
            const point = pointAt(C, orbitOf(mark.family), angle);
            const nearest = index === 0;
            const radius = nearest ? MARK_RADIUS_NEXT : MARK_RADIUS;
            // The orbit says what, the colour says whose, and the brightness says how close:
            // the first one and anything inside ninety days are full, the rest step back.
            const near = nearest || mark.daysLeft === undefined || mark.daysLeft <= 90;
            const tappable = onSelect !== undefined;
            return (
              <g
                key={mark.id}
                className={cx(
                  'dial__mark',
                  nearest && 'dial__mark--nearest',
                  !near && 'dial__mark--far',
                  tappable && 'dial__mark--tappable',
                )}
                role={tappable ? 'button' : undefined}
                tabIndex={tappable ? 0 : undefined}
                style={{ '--mark-colour': mark.colour }}
                aria-label={`${mark.label}, ${mark.date}`}
                onClick={
                  tappable
                    ? () => {
                        onSelect(mark.id);
                      }
                    : undefined
                }
                onKeyDown={
                  tappable
                    ? (event) => {
                        onMarkKey(event, mark.id);
                      }
                    : undefined
                }
              >
                <circle cx={point.x} cy={point.y} r={MARK_HIT} className="dial__mark-hit" />
                <circle cx={point.x} cy={point.y} r={radius} className="dial__mark-dot" />
              </g>
            );
          })}

          <circle cx={C} cy={C} r={R_HUB} className="dial__hub-fill" />
          <circle cx={C} cy={C} r={R_HUB} className="dial__hub-line" />

          {/* The wire: continuous, never interrupted. The glow behind, the filament in front.
              What moves is not the wire but the light on it, added on top in CSS. */}
          <g className="dial__thread" aria-hidden="true">
            <circle cx={C} cy={C} r={R_HUB} className="dial__thread-glow" />
            <circle cx={C} cy={C} r={R_HUB} className="dial__thread-core" />
          </g>
        </svg>

        {/* The crest: a brighter stretch drifting along the wire. Wide and soft, so it reads as
            a wave and not an object going round. */}
        <div className="dial__crest" aria-hidden="true">
          <i />
        </div>
        {/* The same wire around the case: the ring that borders the dial, its light drifting in
            step with the hub's. */}
        <div className="dial__rim" aria-hidden="true">
          <i />
        </div>

        <div className="dial__hub">{children}</div>
      </div>
    </div>
  );
}

export interface DialLegendCompany {
  readonly id: string;
  readonly name: string;
  // The company's colour from the company palette, as a CSS value.
  readonly colour: string;
}

// The legend under the dial, small enough to blend in: the four families as short coloured
// dashes in the smallest capitals, then, smaller still, one dot per company in its colour with
// its trade name.
export function DialLegend({
  companies = [],
  className,
}: {
  readonly companies?: readonly DialLegendCompany[];
  readonly className?: string;
}) {
  return (
    <div className={cx('dial-legend', className)}>
      <dl className="dial-legend__row" aria-label="Dial legend">
        {DIAL_FAMILIES.map((family) => (
          <div key={family.id} className="dial-legend__item">
            <dt className={cx('dial-legend__line', `dial-legend__line--${family.id}`)} />
            <dd className="dial-legend__label">{family.label}</dd>
          </div>
        ))}
      </dl>
      {companies.length > 0 ? (
        <ul className="dial-legend__row dial-legend__companies" aria-label="Companies">
          {companies.map((company) => (
            <li
              key={company.id}
              className="dial-legend__item dial-legend__company"
              style={{ '--company-colour': company.colour }}
            >
              <span className="dial-legend__dot" aria-hidden="true" />
              {company.name}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
