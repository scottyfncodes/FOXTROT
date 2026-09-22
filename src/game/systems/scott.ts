import type { ScottState } from '../state';
import { SCOTT_SPOTS, findScottSpot, type ScottSpotKind } from '../data/scottSpots';

// Ellen's husband, ambient and independent of the player: he potters
// between fixed spots on his own clock, tinkering, napping, or snacking,
// with no awareness of where Ellen or Scout are. Not a companion, not a
// guide — just someone else who lives here.

const TRAVEL_SPEED = 2.0; // tiles/sec, unhurried
const ARRIVE_DIST = 0.3;

const DURATIONS: Record<ScottSpotKind, [number, number]> = {
  tinker: [20, 40],
  nap: [40, 90],
  snack: [15, 30],
};

const ACTIVITY_FOR_KIND: Record<ScottSpotKind, 'tinkering' | 'napping' | 'snacking'> = {
  tinker: 'tinkering',
  nap: 'napping',
  snack: 'snacking',
};

export interface ScottTickContext {
  dtSeconds: number;
  now: number; // game-minutes
  rand: () => number;
}

export function tickScott(scott: ScottState, ctx: ScottTickContext): void {
  if (scott.activity !== 'traveling') {
    if (ctx.now < scott.nextChangeAt) return;
    const options = SCOTT_SPOTS.filter((s) => s.id !== scott.currentSpotId);
    const next = options[Math.floor(ctx.rand() * options.length)] ?? SCOTT_SPOTS[0];
    scott.targetSpotId = next.id;
    scott.activity = 'traveling';
    // Indoor and outdoor coordinates are different spaces entirely (like
    // the player stepping through the greenhouse door) — cross that
    // boundary instantly rather than pretending to walk through a wall.
    const crossingThreshold = (scott.zone === 'greenhouse') !== (next.zone === 'greenhouse');
    if (crossingThreshold) {
      scott.zone = next.zone;
      scott.x = next.x;
      scott.y = next.y;
    }
    return;
  }

  const spot = findScottSpot(scott.targetSpotId);
  if (!spot) {
    // Data changed under him (or a save from an older spot list) — settle
    // wherever he is rather than getting stuck chasing a spot that's gone.
    scott.activity = 'tinkering';
    scott.currentSpotId = null;
    scott.nextChangeAt = ctx.now + 10;
    return;
  }

  const dx = spot.x - scott.x;
  const dy = spot.y - scott.y;
  const d = Math.hypot(dx, dy);
  if (d > ARRIVE_DIST) {
    const step = Math.min(TRAVEL_SPEED * ctx.dtSeconds, d);
    scott.x += (dx / d) * step;
    scott.y += (dy / d) * step;
    const mdx = spot.x - scott.x;
    const mdy = spot.y - scott.y;
    if (Math.abs(mdx) > 0.03 || Math.abs(mdy) > 0.03) {
      scott.facing = Math.abs(mdx) > Math.abs(mdy) ? (mdx > 0 ? 'right' : 'left') : mdy > 0 ? 'down' : 'up';
    }
    return;
  }

  scott.zone = spot.zone;
  scott.currentSpotId = spot.id;
  scott.activity = ACTIVITY_FOR_KIND[spot.kind];
  const [minD, maxD] = DURATIONS[spot.kind];
  scott.nextChangeAt = ctx.now + minD + ctx.rand() * (maxD - minD);
  scott.facing = 'down';
}
