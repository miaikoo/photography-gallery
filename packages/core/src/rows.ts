const EPSILON = 1e-6;
const MIN_OWN_ROW_RATIO = 1.4;

export function ratioOf(photo: { width: number; height: number }): number {
  return photo.width / photo.height;
}

export function buildRows<T extends { width: number; height: number }>(
  photos: T[],
  targetRatio = 2,
): T[][] {
  const rows: T[][] = [];
  let row: T[] = [];
  let sum = 0;

  for (const photo of photos) {
    row.push(photo);
    sum += ratioOf(photo);
    if (sum >= targetRatio - EPSILON) {
      rows.push(row);
      row = [];
      sum = 0;
    }
  }

  if (row.length > 0) {
    const previous = rows.at(-1);
    // A leftover landscape can fill the width alone. Squares and portraits would be too tall.
    if (previous && sum < MIN_OWN_ROW_RATIO) previous.push(...row);
    else rows.push(row);
  }
  return rows;
}

const orientations = (row: { width: number; height: number }[]) =>
  row.map((photo) => (ratioOf(photo) >= 1 ? "L" : "P")).join("");

// Two rows in a row with the same shape read as a grid, so the second one is mirrored.
export function alternateRows<T extends { width: number; height: number }>(rows: T[][]): T[][] {
  const result: T[][] = [];
  for (const row of rows) {
    const mirrored = [...row].reverse();
    const repeats = orientations(result.at(-1) ?? []) === orientations(row);
    result.push(repeats && orientations(mirrored) !== orientations(row) ? mirrored : row);
  }
  return result;
}

export function displayOrder<T extends { width: number; height: number }>(photos: T[]): T[] {
  return alternateRows(buildRows(photos)).flat();
}
