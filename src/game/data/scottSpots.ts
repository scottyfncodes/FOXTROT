import type { ZoneId } from '../types';

export type ScottSpotKind = 'tinker' | 'nap' | 'snack' | 'golf' | 'putt' | 'tv' | 'drink';

export interface ScottSpot {
  id: string;
  kind: ScottSpotKind;
  zone: ZoneId;
  /** Overworld tile coords for outdoor zones, interior tile coords (greenhouse + living room) for the 'greenhouse' zone. */
  x: number;
  y: number;
}

// Ellen's husband doesn't follow anyone — he potters between a handful of
// favorite spots around the garden, the wilderness, and the house,
// each tied to one of his moods — including a patch of meadow he's quietly
// turned into a driving range, and a putting green by the greenhouse. Adding a new spot (or a new zone
// for him to loaf around in) is just a data entry, same as everything else.
export const SCOTT_SPOTS: ScottSpot[] = [
  { id: 'meadow-garden-tinker', kind: 'tinker', zone: 'meadow', x: 58, y: 44 },
  { id: 'meadow-snack', kind: 'snack', zone: 'meadow', x: 52, y: 36 },
  { id: 'woodland-snack', kind: 'snack', zone: 'woodland', x: 25, y: 8 },
  { id: 'overgrown-snack', kind: 'snack', zone: 'overgrownClearing', x: 20, y: 45 },
  { id: 'meadow-driving-range', kind: 'golf', zone: 'meadow', x: 79, y: 36 },
  { id: 'meadow-putting-green', kind: 'putt', zone: 'meadow', x: 54, y: 41 },
  { id: 'rocky-chipping', kind: 'golf', zone: 'rockyClearing', x: 71, y: 57 },
  { id: 'greenhouse-tinker', kind: 'tinker', zone: 'greenhouse', x: 8, y: 7 },
  { id: 'greenhouse-snack', kind: 'snack', zone: 'greenhouse', x: 9, y: 4 },
  // The living room: the ball game on the couch, a drink with his feet up,
  // the putting mat when it's raining — and the only place he naps,
  // stretched out on the couch (the cat, often, curled at his feet).
  { id: 'living-couch-tv', kind: 'tv', zone: 'greenhouse', x: 21.35, y: 3.5 },
  { id: 'living-couch-drink', kind: 'drink', zone: 'greenhouse', x: 20.8, y: 3.5 },
  { id: 'living-couch-nap', kind: 'nap', zone: 'greenhouse', x: 21.0, y: 3.5 },
  { id: 'living-putting', kind: 'putt', zone: 'greenhouse', x: 19.7, y: 8.55 },
];

/** Spots where he's sitting on the couch, seen from behind. */
export function isCouchSpot(id: string | null): boolean {
  return id === 'living-couch-tv' || id === 'living-couch-drink';
}

/** Where he naps: lying along the couch seat, so drawn raised and in front of it. */
export const COUCH_NAP_LIFT = 0.22;
export function isCouchNap(id: string | null): boolean {
  return id === 'living-couch-nap';
}

export function findScottSpot(id: string): ScottSpot | undefined {
  return SCOTT_SPOTS.find((s) => s.id === id);
}
