// Greenhouse-interior tile coords only — the cat never leaves. Kept clear of
// STATIONS tiles (stations.ts) and Scott's own greenhouse spots (scottSpots.ts)
// so nobody visually overlaps.

export type CatSpotKind = 'perch' | 'sleep' | 'groom';

export interface CatSpot {
  id: string;
  kind: CatSpotKind;
  x: number;
  y: number;
}

export const CAT_SPOTS: CatSpot[] = [
  { id: 'sunny-perch', kind: 'perch', x: 16, y: 5 },
  { id: 'growbed-nap', kind: 'sleep', x: 4, y: 4 },
  { id: 'bench-groom', kind: 'groom', x: 13, y: 5 },
  { id: 'shelf-perch', kind: 'perch', x: 16, y: 8 },
  { id: 'door-sun-nap', kind: 'sleep', x: 8, y: 10 },
];

export function findCatSpot(id: string): CatSpot | undefined {
  return CAT_SPOTS.find((s) => s.id === id);
}
