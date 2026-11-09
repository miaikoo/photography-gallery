export function rowSizes(ratio: number, rowRatio: number): string {
  return `(min-width: 640px) ${Math.round((ratio / rowRatio) * 100)}vw, 100vw`;
}
