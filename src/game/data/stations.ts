import type { StationDef } from '../types';

export const GREENHOUSE_GRID_W = 18;
export const GREENHOUSE_GRID_H = 12;
export const GREENHOUSE_EXIT = { x: 9, y: 11 };

// Grouped into readable work zones (nursery / propagation & storage / potting
// / research & display) instead of scattered individually, with an aisle
// through the middle of each cluster so nothing needs to be walked around.
export const STATIONS: StationDef[] = [
  // Nursery: a 2x2 block of grow beds, top-left.
  { id: 'growBed1', name: 'Growing Bed', x: 3, y: 2, kind: 'growBed' },
  { id: 'growBed2', name: 'Growing Bed', x: 5, y: 2, kind: 'growBed' },
  { id: 'growBed3', name: 'Growing Bed', x: 3, y: 4, kind: 'growBed' },
  { id: 'growBed4', name: 'Growing Bed', x: 5, y: 4, kind: 'growBed' },
  // Propagation & storage bench, top-right.
  { id: 'propagationBench', name: 'Propagation Bench', x: 13, y: 2, kind: 'propagationBench' },
  { id: 'seedStorage', name: 'Seed Storage', x: 15, y: 2, kind: 'seedStorage' },
  // Potting nook, mid-left, below the nursery.
  { id: 'soilStation', name: 'Soil Station', x: 3, y: 7, kind: 'soilStation' },
  { id: 'compost', name: 'Compost Bin', x: 5, y: 7, kind: 'compost' },
  // Research & display corner, mid-right, below propagation.
  { id: 'research', name: 'Research Bench', x: 13, y: 6, kind: 'research' },
  { id: 'display', name: 'Specimen Display', x: 15, y: 6, kind: 'display' },
];

// Ground-level set dressing solid enough that walking through it should be
// blocked, same as a station. Kept separate from STATIONS since it's not
// interactable — just furniture that makes the room read as lived-in.
export const GREENHOUSE_FURNITURE = [
  { id: 'scoutBed', x: 7, y: 9 },
  { id: 'ellenDesk', x: 11, y: 9 },
] as const;

export function stationAt(x: number, y: number): StationDef | undefined {
  return STATIONS.find((s) => s.x === x && s.y === y);
}
