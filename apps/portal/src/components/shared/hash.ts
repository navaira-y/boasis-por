// A stable small integer from a string: the same input gives the same slot on every device,
// forever, with no setting stored. Used to pick an avatar or company colour from the tokens.
// FNV-1a over UTF-16 code units, folded to 32 bits.
export function stableHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

// The number of --avatar-N tokens in tokens.css. Company colours have their own palette
// (lib/companyColours.ts).
export const COLOUR_SLOTS = 8;

export function colourSlot(input: string): number {
  return stableHash(input) % COLOUR_SLOTS;
}
