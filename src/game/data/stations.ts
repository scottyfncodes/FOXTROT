import type { StationDef } from '../types';

export const GREENHOUSE_GRID_W = 18;
export const GREENHOUSE_GRID_H = 12;
export const GREENHOUSE_EXIT = { x: 9, y: 11 };

export const STATIONS: StationDef[] = [
  { id: 'growBed1', name: 'Growing Bed', x: 3, y: 3, kind: 'growBed' },
  { id: 'growBed2', name: 'Growing Bed', x: 6, y: 3, kind: 'growBed' },
  { id: 'growBed3', name: 'Growing Bed', x: 3, y: 6, kind: 'growBed' },
  { id: 'growBed4', name: 'Growing Bed', x: 6, y: 6, kind: 'growBed' },
  { id: 'propagationBench', name: 'Propagation Bench', x: 12, y: 3, kind: 'propagationBench' },
  { id: 'seedStorage', name: 'Seed Storage', x: 15, y: 3, kind: 'seedStorage' },
  { id: 'soilStation', name: 'Soil Station', x: 3, y: 9, kind: 'soilStation' },
  { id: 'compost', name: 'Compost Bin', x: 6, y: 9, kind: 'compost' },
  { id: 'research', name: 'Research Bench', x: 14, y: 7, kind: 'research' },
  { id: 'display', name: 'Specimen Display', x: 15, y: 9, kind: 'display' },
];

export function stationAt(x: number, y: number): StationDef | undefined {
  return STATIONS.find((s) => s.x === x && s.y === y);
}
