/** Frozen `search-v1`: trim → NFKC → default Unicode lowercase → letters/decimal digits only. */
export function normalizeCatalogSearch(value: string): string {
  return value.trim().normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{Nd}]/gu, '');
}

/**
 * Unicode-code-point Levenshtein with an early cutoff. Transposition is intentionally two edits.
 * Returns `maxDistance + 1` as soon as the threshold cannot be recovered.
 */
export function boundedLevenshtein(left: string, right: string, maxDistance: number): number {
  const a = [...left];
  const b = [...right];
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;
  if (a.length === 0) return b.length <= maxDistance ? b.length : maxDistance + 1;
  if (b.length === 0) return a.length <= maxDistance ? a.length : maxDistance + 1;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    let rowBest = row;
    for (let column = 1; column <= b.length; column += 1) {
      const value = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1),
      );
      current[column] = value;
      rowBest = Math.min(rowBest, value);
    }
    if (rowBest > maxDistance) return maxDistance + 1;
    previous = current;
  }
  return previous[b.length] <= maxDistance ? previous[b.length] : maxDistance + 1;
}

export function typoDistanceLimit(normalizedQuery: string): number {
  const length = [...normalizedQuery].length;
  if (length < 4) return 0;
  return length <= 6 ? 1 : 2;
}
