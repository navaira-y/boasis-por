import type { SVGProps } from 'react';

// The few glyphs the components need, drawn here so no icon set becomes a dependency.
// Every one is decorative: the element that carries it names itself.

type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'>;

function base(props: IconProps): IconProps {
  return {
    width: 'var(--icon-md)',
    height: 'var(--icon-md)',
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    focusable: false,
    ...props,
  };
}

// Points to the inline end. Mirrored by CSS in a right-to-left document.
export function ChevronIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M7.5 4.5 13 10l-5.5 5.5" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 5l10 10M15 5 5 15" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 10.5 8.2 14.5 16 6" />
    </svg>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5.5 13.5V9a4.5 4.5 0 0 1 9 0v4.5l1.2 1.5H4.3l1.2-1.5Z" />
      <path d="M8.3 17a1.8 1.8 0 0 0 3.4 0" />
    </svg>
  );
}

// The placeholder glyph a compliance card shows until a real icon set is chosen.
export function PlaceholderIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4" y="3" width="12" height="14" rx="2.5" />
      <path d="M7 8h6M7 11.5h4" />
    </svg>
  );
}

export function SpinnerIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10 3a7 7 0 1 1-6.1 3.5" />
    </svg>
  );
}
