import type { CatState } from '../state';
import { CAT_SPOTS, findCatSpot, type CatSpotKind } from '../data/catSpots';

// The greenhouse's cat: ambient, indoor-only, and indifferent to everyone.
// No zone-crossing logic at all — unlike Scott, she never leaves the
// greenhouse grid, so this is simpler than the husband system it's modeled on.

const TRAVEL_SPEED = 2.6; // tiles/sec — quicker, lower steps than Scott's
const ARRIVE_DIST = 0.25;

const DURATIONS: Record<CatSpotKind, [number, number]> = {
  perch: [20, 45],
  sleep: [60, 150],
  groom: [8, 18],
};

const ACTIVITY_FOR_KIND: Record<CatSpotKind, 'sitting' | 'sleeping' | 'grooming'> = {
  perch: 'sitting',
  sleep: 'sleeping',
  groom: 'grooming',
};

export interface CatTickContext {
  dtSeconds: number;
  now: number; // game-minutes
  rand: () => number;
}

export function tickCat(cat: CatState, ctx: CatTickContext): void {
  if (cat.activity !== 'wandering') {
    if (ctx.now < cat.nextChangeAt) return;
    const options = CAT_SPOTS.filter((s) => s.id !== cat.currentSpotId);
    const next = options[Math.floor(ctx.rand() * options.length)] ?? CAT_SPOTS[0];
    cat.targetSpotId = next.id;
    cat.activity = 'wandering';
    return;
  }

  const spot = findCatSpot(cat.targetSpotId);
  if (!spot) {
    cat.activity = 'sitting';
    cat.currentSpotId = null;
    cat.nextChangeAt = ctx.now + 10;
    return;
  }

  const dx = spot.x - cat.x;
  const dy = spot.y - cat.y;
  const d = Math.hypot(dx, dy);
  if (d > ARRIVE_DIST) {
    const step = Math.min(TRAVEL_SPEED * ctx.dtSeconds, d);
    cat.x += (dx / d) * step;
    cat.y += (dy / d) * step;
    const mdx = spot.x - cat.x;
    const mdy = spot.y - cat.y;
    if (Math.abs(mdx) > 0.03 || Math.abs(mdy) > 0.03) {
      cat.facing = Math.abs(mdx) > Math.abs(mdy) ? (mdx > 0 ? 'right' : 'left') : mdy > 0 ? 'down' : 'up';
    }
    return;
  }

  cat.currentSpotId = spot.id;
  cat.activity = ACTIVITY_FOR_KIND[spot.kind];
  const [minD, maxD] = DURATIONS[spot.kind];
  cat.nextChangeAt = ctx.now + minD + ctx.rand() * (maxD - minD);
  cat.facing = 'down';
}
