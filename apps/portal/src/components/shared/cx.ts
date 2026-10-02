// Joins class names, dropping the falsy ones. Small enough not to be a dependency.
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter((part): part is string => typeof part === 'string' && part !== '').join(' ');
}
