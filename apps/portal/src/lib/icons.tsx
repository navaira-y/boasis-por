import type { SVGProps } from 'react';

// Lite's icons, inline so they inherit currentColor and cost no request.
type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { readonly size?: number };

function svg(
  size: number,
  { size: _size, ...rest }: IconProps,
  strokeWidth = 1.9,
): SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    focusable: false,
    ...rest,
  };
}

export const IconYear = (p: IconProps) => (
  <svg {...svg(p.size ?? 20, p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
export const IconDoc = (p: IconProps) => (
  <svg {...svg(p.size ?? 20, p)}>
    <path d="M7 3h7l5 5v13H7z" />
    <path d="M14 3v5h5" />
  </svg>
);
export const IconCompany = (p: IconProps) => (
  <svg {...svg(p.size ?? 20, p)}>
    <path d="M4 21V7l8-4 8 4v14" />
    <path d="M9.5 21v-6h5v6" />
  </svg>
);
export const IconBook = (p: IconProps) => (
  <svg {...svg(p.size ?? 20, p)}>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v13a1.6 1.6 0 0 0-1.6-1.6H5.5A1.5 1.5 0 0 1 4 15.9Z" />
    <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v13a1.6 1.6 0 0 1 1.6-1.6h4.9A1.5 1.5 0 0 0 20 15.9Z" />
  </svg>
);
export const IconClose = (p: IconProps) => (
  <svg {...svg(p.size ?? 17, p, 2.1)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const IconScan = (p: IconProps) => (
  <svg {...svg(p.size ?? 22, p)}>
    <path d="M4 8V6a2 2 0 0 1 2-2h2" />
    <path d="M16 4h2a2 2 0 0 1 2 2v2" />
    <path d="M20 16v2a2 2 0 0 1-2 2h-2" />
    <path d="M8 20H6a2 2 0 0 1-2-2v-2" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
export const IconPen = (p: IconProps) => (
  <svg {...svg(p.size ?? 22, p)}>
    <path d="M16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1 1-4Z" />
    <path d="M14.5 6.5l3 3" />
  </svg>
);
export const IconPeople = (p: IconProps) => (
  <svg {...svg(p.size ?? 20, p)}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
    <path d="M16 5.2a3.2 3.2 0 0 1 0 5.9" />
    <path d="M17.6 14.2A5.5 5.5 0 0 1 20.5 19" />
  </svg>
);
export const IconPerson = (p: IconProps) => (
  <svg {...svg(p.size ?? 18, p)}>
    <circle cx="12" cy="8.5" r="3.6" />
    <path d="M5 20a7 7 0 0 1 14 0" />
  </svg>
);
export const IconBell = (p: IconProps) => (
  <svg {...svg(p.size ?? 18, p)}>
    <path d="M18 8.5a6 6 0 1 0-12 0c0 6-3 7.5-3 7.5h18s-3-1.5-3-7.5" />
    <path d="M13.7 19.5a2 2 0 0 1-3.4 0" />
  </svg>
);
export const IconChevron = (p: IconProps) => (
  <svg {...svg(p.size ?? 16, p, 2.2)}>
    <path d="m9 6 6 6-6 6" />
  </svg>
);
export const IconPlus = (p: IconProps) => (
  <svg {...svg(p.size ?? 15, p, 2.4)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconCheck = (p: IconProps) => (
  <svg {...svg(p.size ?? 16, p, 2.3)}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
export const IconUpload = (p: IconProps) => (
  <svg {...svg(p.size ?? 24, p, 1.8)}>
    <path d="M12 16V4M8 8l4-4 4 4" />
    <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </svg>
);
export const IconArchive = (p: IconProps) => (
  <svg {...svg(p.size ?? 18, p)}>
    <path d="M3 7h18v3H3z" />
    <path d="M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" />
    <path d="M10 14h4" />
  </svg>
);
export const IconKey = (p: IconProps) => (
  <svg {...svg(p.size ?? 20, p)}>
    <circle cx="8" cy="15" r="4" />
    <path d="M11 12l9-9" />
    <path d="M16 7l3 3" />
    <path d="M14 9l2 2" />
  </svg>
);
export const IconTrash = (p: IconProps) => (
  <svg {...svg(p.size ?? 20, p)}>
    <path d="M4 7h16" />
    <path d="M10 11v6M14 11v6" />
    <path d="M6 7l1 13h10l1-13" />
    <path d="M9 7V4h6v3" />
  </svg>
);

// The compliance board: a list with a tick on each line, in lite's stroke.
export const IconBoard = (p: IconProps) => (
  <svg {...svg(p.size ?? 20, p)}>
    <path d="M4 6.5l1.5 1.5L8 5.5" />
    <path d="M11 6.5h9" />
    <path d="M4 12.5l1.5 1.5L8 11.5" />
    <path d="M11 12.5h9" />
    <path d="M4 18.5l1.5 1.5L8 17.5" />
    <path d="M11 18.5h9" />
  </svg>
);
// Services: a hand offering, in lite's stroke.
export const IconServices = (p: IconProps) => (
  <svg {...svg(p.size ?? 20, p)}>
    <path d="M12 3v3" />
    <path d="M5 13a7 7 0 0 1 14 0" />
    <path d="M3 13h18" />
    <path d="M4 17h16" />
  </svg>
);
export const IconSignOut = (p: IconProps) => (
  <svg {...svg(p.size ?? 18, p)}>
    <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
    <path d="M15 8l4 4-4 4" />
    <path d="M9 12h10" />
  </svg>
);
export const IconShield = (p: IconProps) => (
  <svg {...svg(p.size ?? 18, p)}>
    <path d="M12 3l8 3v6c0 4.5-3.5 7.5-8 9-4.5-1.5-8-4.5-8-9V6z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);
export const IconCard = (p: IconProps) => (
  <svg {...svg(p.size ?? 18, p)}>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M3 10h18" />
    <path d="M7 14h4" />
  </svg>
);

// The Boasis mark: twelve dots on a ring, teal and light teal alternating.
export function Logo({
  size = 28,
  className,
}: {
  readonly size?: number;
  readonly className?: string;
}) {
  const teal = '#15A6BA';
  const light = '#46CADB';
  const dots: readonly (readonly [number, number, number, string])[] = [
    [50, 14, 6, teal],
    [68, 18.8, 5.5, light],
    [81.2, 32, 6, teal],
    [86, 50, 5.5, light],
    [81.2, 68, 6, teal],
    [68, 81.2, 5.5, light],
    [50, 86, 6, teal],
    [32, 81.2, 5.5, light],
    [18.8, 68, 6, teal],
    [14, 50, 5.5, light],
    [18.8, 32, 6, teal],
    [32, 18.8, 5.5, light],
  ];
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
    >
      {dots.map(([cx, cy, r, fill], index) => (
        <circle key={index} cx={cx} cy={cy} r={r} fill={fill} />
      ))}
    </svg>
  );
}
