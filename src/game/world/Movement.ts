export type BlockedFn = (x: number, y: number) => boolean;

const RADIUS = 0.28;

function boxBlocked(cx: number, cy: number, blockedFn: BlockedFn): boolean {
  return (
    blockedFn(cx - RADIUS, cy - RADIUS) ||
    blockedFn(cx + RADIUS, cy - RADIUS) ||
    blockedFn(cx - RADIUS, cy + RADIUS) ||
    blockedFn(cx + RADIUS, cy + RADIUS)
  );
}

/** Axis-separated movement so the player slides along obstacles instead of sticking. */
export function tryMove(x: number, y: number, dx: number, dy: number, blockedFn: BlockedFn): { x: number; y: number } {
  let nx = x;
  let ny = y;
  if (dx !== 0) {
    const candidate = x + dx;
    if (!boxBlocked(candidate, y, blockedFn)) nx = candidate;
  }
  if (dy !== 0) {
    const candidate = y + dy;
    if (!boxBlocked(nx, candidate, blockedFn)) ny = candidate;
  }
  return { x: nx, y: ny };
}
