// Interior tile coords (greenhouse and living room share one space — see
// interior.ts). The cat never goes outside. Kept clear of the fixed
// greenhouse stations and Scott's own spots so nobody visually overlaps.

export type CatSpotKind = 'perch' | 'sleep' | 'groom';

export interface CatSpot {
  id: string;
  kind: CatSpotKind;
  x: number;
  y: number;
  /** She's up on something here (the couch, a table, the TV): drawn raised, and in front of it. */
  lift?: number;
  /** Relative odds of picking this spot (default 1). Odd places are rare. */
  weight?: number;
}

export const CAT_SPOTS: CatSpot[] = [
  // Greenhouse
  { id: 'sunny-perch', kind: 'perch', x: 16, y: 5 },
  { id: 'growbed-nap', kind: 'sleep', x: 4, y: 4, weight: 0.6 },
  { id: 'bench-groom', kind: 'groom', x: 13, y: 5 },
  { id: 'shelf-perch', kind: 'perch', x: 15.4, y: 7.1 },
  { id: 'door-sun-nap', kind: 'sleep', x: 8, y: 10 },
  // Living room
  { id: 'couch-nap', kind: 'sleep', x: 22.5, y: 3.62, lift: 0.22, weight: 1.6 },
  { id: 'cat-bed', kind: 'sleep', x: 25.15, y: 6.2, weight: 1.3 },
  { id: 'window-perch', kind: 'perch', x: 25.35, y: 4.15, lift: 0.3 },
  { id: 'cattree-base', kind: 'groom', x: 25.4, y: 2.45 },
  { id: 'rug-groom', kind: 'groom', x: 21.2, y: 5.0 },
  { id: 'coffee-table', kind: 'perch', x: 21.55, y: 2.5, lift: 0.28, weight: 0.35 },
  { id: 'tv-top', kind: 'sleep', x: 21.55, y: 1.02, lift: 0.52, weight: 0.2 },
  { id: 'putting-mat', kind: 'groom', x: 23.1, y: 8.75, weight: 0.4 },
];

export function findCatSpot(id: string): CatSpot | undefined {
  return CAT_SPOTS.find((s) => s.id === id);
}
