// Where an anchored menu goes. Pure geometry: the anchor's box, the menu's natural size and the
// box it must stay inside (the viewport, or the frame that holds the picker). Below the anchor
// when it fits, above when it does not, and never past an edge in either axis.

export interface Box {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

export interface Placement {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly maxHeight: number;
  readonly side: 'below' | 'above';
}

export interface PlaceInput {
  readonly anchor: Box;
  readonly menu: { readonly width: number; readonly height: number };
  readonly bounds: Box;
  readonly gap: number;
  readonly margin: number;
  readonly maxWidth: number;
}

export function placeMenu({ anchor, menu, bounds, gap, margin, maxWidth }: PlaceInput): Placement {
  const boundsRight = bounds.left + bounds.width;
  const boundsBottom = bounds.top + bounds.height;

  const width = Math.min(Math.max(anchor.width, menu.width), maxWidth, bounds.width - margin * 2);
  const left = Math.min(
    Math.max(anchor.left, bounds.left + margin),
    Math.max(boundsRight - margin - width, bounds.left + margin),
  );

  const roomBelow = boundsBottom - margin - (anchor.top + anchor.height + gap);
  const roomAbove = anchor.top - gap - (bounds.top + margin);

  if (menu.height <= roomBelow || roomBelow >= roomAbove) {
    const maxHeight = Math.max(Math.min(menu.height, roomBelow), 0);
    return { top: anchor.top + anchor.height + gap, left, width, maxHeight, side: 'below' };
  }
  const maxHeight = Math.max(Math.min(menu.height, roomAbove), 0);
  return { top: anchor.top - gap - maxHeight, left, width, maxHeight, side: 'above' };
}
