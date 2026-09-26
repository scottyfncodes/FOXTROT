import type { ScottActivity, ScottState } from '../state';
import { SCOTT_SPOTS, findScottSpot, type ScottSpotKind } from '../data/scottSpots';
import { interiorWaypoint } from '../data/interior';

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

  const d = Math.hypot(spot.x - scott.x, spot.y - scott.y);
  if (d > ARRIVE_DIST) {
    // Indoors, the living room and greenhouse are joined by one doorway.
    const wp = scott.zone === 'greenhouse' ? interiorWaypoint(scott.x, scott.y, spot.x, spot.y) : spot;
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

// ---------------------------------------------------------------- the chase
// He takes no notice of Ellen — until she chases him. Keep after him long
// enough and he gives in: turns, dips her, and kisses her.

/** How close counts as on his heels, in tiles. */
export const CHASE_RANGE = 1.6;
/** Real seconds of chasing before he stops and turns round. */
export const CHASE_SECONDS = 4;
/** How long the dip and kiss last, in real seconds. */
export const KISS_SECONDS = 3.6;
/** Real seconds after a kiss before another chase can count. */
export const KISS_COOLDOWN = 30;

export interface ChaseState {
  /** Seconds spent chasing so far; drains away when she stops. */
  chase: number;
  /** The kiss under way, 0 → 1, or null. */
  kiss: { t: number; ellenLeft: boolean } | null;
  cooldown: number;
}

export function newChase(): ChaseState {
  return { chase: 0, kiss: null, cooldown: 0 };
}

/** Busy with something he'd not get up from: asleep, or sat on the couch. */
function settled(scott: ScottState): boolean {
  return scott.activity === 'napping' || scott.activity === 'watchingTV' || scott.activity === 'relaxing';
}

export interface ChaseContext {
  ellenX: number;
  ellenY: number;
  ellenIndoors: boolean;
  ellenMoving: boolean;
  dtSeconds: number;
}

/**
 * Advances the chase. Returns true on the frame the kiss begins; while it
 * runs, Scott and Ellen are held in place (the caller skips their usual
 * updates) and it plays out on its own.
 */
export function tickChase(ch: ChaseState, scott: ScottState, ctx: ChaseContext): boolean {
  if (ch.kiss) {
    ch.kiss.t += ctx.dtSeconds / KISS_SECONDS;
    if (ch.kiss.t >= 1) {
      ch.kiss = null;
      ch.cooldown = KISS_COOLDOWN;
    }
    return false;
  }
  ch.cooldown = Math.max(0, ch.cooldown - ctx.dtSeconds);
  const sameSide = (scott.zone === 'greenhouse') === ctx.ellenIndoors;
  const near = sameSide && Math.hypot(scott.x - ctx.ellenX, scott.y - ctx.ellenY) < CHASE_RANGE;
  if (near && ctx.ellenMoving && !settled(scott) && ch.cooldown === 0) ch.chase += ctx.dtSeconds;
  else ch.chase = Math.max(0, ch.chase - ctx.dtSeconds * 0.5);
  if (ch.chase < CHASE_SECONDS) return false;
  ch.chase = 0;
  const ellenLeft = ctx.ellenX <= scott.x;
  ch.kiss = { t: 0, ellenLeft };
  // He steps in beside her, and they face each other.
  scott.x = ctx.ellenX + (ellenLeft ? 0.5 : -0.5);
  scott.y = ctx.ellenY;
  scott.facing = ellenLeft ? 'left' : 'right';
  return true;
}

/** How far into the dip they are, 0 (standing) → 1 (fully dipped), easing in and out. */
export function dipAmount(t: number): number {
  const ease = (u: number) => u * u * (3 - 2 * u);
  if (t < 0.25) return ease(t / 0.25);
  if (t > 0.8) return ease(Math.max(0, (1 - t) / 0.2));
  return 1;
}
