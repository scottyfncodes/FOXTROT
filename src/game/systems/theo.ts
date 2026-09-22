import type { TheoState } from '../state';
import { THEO_SPOTS, findTheoSpot, type TheoSpotKind } from '../data/theoSpots';

// Ellen's husband, ambient and independent of the player: he potters
// between fixed spots on his own clock, tinkering, napping, or snacking,
// with no awareness of where Ellen or Scout are. Not a companion, not a
// guide — just someone else who lives here.

const TRAVEL_SPEED = 2.0; // tiles/sec, unhurried
const ARRIVE_DIST = 0.3;

const DURATIONS: Record<TheoSpotKind, [number, number]> = {
  tinker: [20, 40],
  nap: [40, 90],
  snack: [15, 30],
};

const ACTIVITY_FOR_KIND: Record<TheoSpotKind, 'tinkering' | 'napping' | 'snacking'> = {
  tinker: 'tinkering',
  nap: 'napping',
  snack: 'snacking',
};

export interface TheoTickContext {
  dtSeconds: number;
  now: number; // game-minutes
  rand: () => number;
}

export function tickTheo(theo: TheoState, ctx: TheoTickContext): void {
  if (theo.activity !== 'traveling') {
    if (ctx.now < theo.nextChangeAt) return;
    const options = THEO_SPOTS.filter((s) => s.id !== theo.currentSpotId);
    const next = options[Math.floor(ctx.rand() * options.length)] ?? THEO_SPOTS[0];
    theo.targetSpotId = next.id;
    theo.activity = 'traveling';
    // Indoor and outdoor coordinates are different spaces entirely (like
    // the player stepping through the greenhouse door) — cross that
    // boundary instantly rather than pretending to walk through a wall.
    const crossingThreshold = (theo.zone === 'greenhouse') !== (next.zone === 'greenhouse');
    if (crossingThreshold) {
      theo.zone = next.zone;
      theo.x = next.x;
      theo.y = next.y;
    }
    return;
  }

  const spot = findTheoSpot(theo.targetSpotId);
  if (!spot) {
    // Data changed under him (or a save from an older spot list) — settle
    // wherever he is rather than getting stuck chasing a spot that's gone.
    theo.activity = 'tinkering';
    theo.currentSpotId = null;
    theo.nextChangeAt = ctx.now + 10;
    return;
  }

  const dx = spot.x - theo.x;
  const dy = spot.y - theo.y;
  const d = Math.hypot(dx, dy);
  if (d > ARRIVE_DIST) {
    const step = Math.min(TRAVEL_SPEED * ctx.dtSeconds, d);
    theo.x += (dx / d) * step;
    theo.y += (dy / d) * step;
    const mdx = spot.x - theo.x;
    const mdy = spot.y - theo.y;
    if (Math.abs(mdx) > 0.03 || Math.abs(mdy) > 0.03) {
      theo.facing = Math.abs(mdx) > Math.abs(mdy) ? (mdx > 0 ? 'right' : 'left') : mdy > 0 ? 'down' : 'up';
    }
    return;
  }

  theo.zone = spot.zone;
  theo.currentSpotId = spot.id;
  theo.activity = ACTIVITY_FOR_KIND[spot.kind];
  const [minD, maxD] = DURATIONS[spot.kind];
  theo.nextChangeAt = ctx.now + minD + ctx.rand() * (maxD - minD);
  theo.facing = 'down';
}
