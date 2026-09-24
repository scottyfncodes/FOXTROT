import type { OutdoorZoneId } from '../types';

export interface ToolPickup {
  id: string;
  tool: 'lantern';
  zone: OutdoorZoneId;
  x: number;
  y: number;
  flavor: string;
}

// The one tool left lying in the world: an old lantern at the edge of the
// Damp Forest. Some plants only show themselves to someone carrying a light.
export const TOOL_PICKUPS: ToolPickup[] = [
  { id: 'tp-lantern', tool: 'lantern', zone: 'dampForest', x: 50, y: 5, flavor: 'Still a little oil in it. Some things in the forest only show up in lantern light.' },
];
