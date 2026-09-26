import type { ScottActivity, ScottState } from '../state';
import { SCOTT_SPOTS, findScottSpot, type ScottSpotKind } from '../data/scottSpots';
import { interiorWaypoint } from '../data/interior';
import { spotPosition, type AnchorOffset } from '../data/catSpots';

// Ellen's husband, ambient and independent of the player: he potters
// between fixed spots on his own clock, tinkering, napping, snacking,
// or practicing his golf swing and putting, with no awareness of where
// Ellen or Scout are. Not a companion, not a guide — just someone else who
// lives here.

const TRAVEL_SPEED = 2.0; // tiles/sec, unhurried
const ARRIVE_DIST = 0.3;

const DURATIONS: Record<ScottSpotKind, [number, number]> = {
  tinker: [20, 40],
  nap: [40, 90],
  snack: [15, 30],
  golf: [30, 60],
  putt: [25, 45],
  tv: [45, 100],
  drink: [25, 50],
};

export const ACTIVITY_FOR_KIND: Record<ScottSpotKind, Exclude<ScottActivity, 'traveling'>> = {
  tinker: 'tinkering',
  nap: 'napping',
  snack: 'snacking',
  golf: 'golfing',
  putt: 'putting',
  tv: 'watchingTV',
  drink: 'relaxing',
};

export interface ScottTickContext {
  dtSeconds: number;
  now: number; // game-minutes
  rand: () => number;
  /** How far the living-room furniture has been moved, so the couch and the mat take him with them. */
  offset?: AnchorOffset;
}

export function tickScott(scott: ScottState, ctx: ScottTickContext): void {
  if (scott.activity !== 'traveling') {
    const here = scott.currentSpotId ? findScottSpot(scott.currentSpotId) : undefined;
    if (here?.anchor) {
      const at = spotPosition(here, ctx.offset);
      scott.x = at.x;
      scott.y = at.y;
    }
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
      const at = spotPosition(next, ctx.offset);
      scott.zone = next.zone;
      scott.x = at.x;
      scott.y = at.y;
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

  const at = spotPosition(spot, ctx.offset);
  const d = Math.hypot(at.x - scott.x, at.y - scott.y);
  if (d > ARRIVE_DIST) {
    // Indoors, the living room and greenhouse are joined by one doorway.
    const wp = scott.zone === 'greenhouse' ? interiorWaypoint(scott.x, scott.y, at.x, at.y) : at;
    const dx = wp.x - scott.x;
    const dy = wp.y - scott.y;
    const wd = Math.hypot(dx, dy) || 1;
    const step = Math.min(TRAVEL_SPEED * ctx.dtSeconds, wd);
    scott.x += (dx / wd) * step;
    scott.y += (dy / wd) * step;
    if (Math.abs(dx) > 0.03 || Math.abs(dy) > 0.03) {
      scott.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    }
    return;
  }

  scott.zone = spot.zone;
  scott.currentSpotId = spot.id;
  scott.activity = ACTIVITY_FOR_KIND[spot.kind];
  const [minD, maxD] = DURATIONS[spot.kind];
  scott.nextChangeAt = ctx.now + minD + ctx.rand() * (maxD - minD);
  // Putting is drawn side-on, lining up toward the hole on his right; on
  // the couch he's facing the TV, back to the room.
  scott.facing = spot.kind === 'putt' ? 'right' : spot.kind === 'tv' || spot.kind === 'drink' ? 'up' : 'down';
}
