const MIN_DISTANCE = 10;
const DISTANCE_THRESHOLD = 80;
const VELOCITY_THRESHOLD = 0.11; // px per ms, so a quick flick is enough
const END_RESISTANCE = 0.3;

export function classifySwipe({ dx, dy, ms }: { dx: number; dy: number; ms: number }): "prev" | "next" | null {
  const distance = Math.abs(dx);
  if (distance < MIN_DISTANCE || Math.abs(dy) > distance) return null;
  if (distance < DISTANCE_THRESHOLD && distance / Math.max(ms, 1) <= VELOCITY_THRESHOLD) return null;
  return dx < 0 ? "next" : "prev";
}

export function dampedOffset(dx: number, atEnd: boolean): number {
  return atEnd ? dx * END_RESISTANCE : dx;
}
