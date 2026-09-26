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
// favorite spots around the garden, the wilderness, and the greenhouse,
// each tied to one of his moods — including a patch of meadow he's quietly
// turned into a driving range, and a putting green by the greenhouse. Adding a new spot (or a new zone
// for him to loaf around in) is just a data entry, same as everything else.
export const SCOTT_SPOTS: ScottSpot[] = [
  { id: 'meadow-garden-tinker', kind: 'tinker', zone: 'meadow', x: 58, y: 44 },
  { id: 'meadow-sun-nap', kind: 'nap', zone: 'meadow', x: 75, y: 30 },
  { id: 'meadow-snack', kind: 'snack', zone: 'meadow', x: 52, y: 36 },
  { id: 'woodland-shade-nap', kind: 'nap', zone: 'woodland', x: 15, y: 15 },
  { id: 'woodland-snack', kind: 'snack', zone: 'woodland', x: 25, y: 8 },
  { id: 'rocky-nap', kind: 'nap', zone: 'rockyClearing', x: 65, y: 55 },
  { id: 'overgrown-nap', kind: 'nap', zone: 'overgrownClearing', x: 10, y: 50 },
  { id: 'overgrown-snack', kind: 'snack', zone: 'overgrownClearing', x: 20, y: 45 },
  { id: 'meadow-driving-range', kind: 'golf', zone: 'meadow', x: 79, y: 36 },
  { id: 'meadow-putting-green', kind: 'putt', zone: 'meadow', x: 54, y: 41 },
  { id: 'rocky-chipping', kind: 'golf', zone: 'rockyClearing', x: 71, y: 57 },
  { id: 'greenhouse-tinker', kind: 'tinker', zone: 'greenhouse', x: 8, y: 7 },
  { id: 'greenhouse-nap', kind: 'nap', zone: 'greenhouse', x: 12, y: 9 },
  { id: 'greenhouse-snack', kind: 'snack', zone: 'greenhouse', x: 9, y: 4 },
  // The living room: the ball game on the couch, a drink with his feet up,
  // and the putting mat when it's raining.
  { id: 'living-couch-tv', kind: 'tv', zone: 'greenhouse', x: 21.35, y: 3.5 },
  { id: 'living-couch-drink', kind: 'drink', zone: 'greenhouse', x: 20.8, y: 3.5 },
  { id: 'living-putting', kind: 'putt', zone: 'greenhouse', x: 19.7, y: 8.55 },
];

/** Spots where he's sitting on the couch, seen from behind. */
export function isCouchSpot(id: string | null): boolean {
  return id === 'living-couch-tv' || id === 'living-couch-drink';
}

export function findScottSpot(id: string): ScottSpot | undefined {
  return SCOTT_SPOTS.find((s) => s.id === id);
}
