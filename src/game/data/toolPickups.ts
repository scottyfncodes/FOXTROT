import type { ToolId, ZoneId } from '../types';

export interface ToolPickup {
  id: string;
  tool: ToolId;
  tier: number;
  zone: ZoneId;
  x: number;
  y: number;
  requiresToolTier?: { tool: ToolId; tier: number };
  flavor: string;
}

// Tools are found as objects left in the world, not handed out behind
// locked doors — the player can often see one before they're ready to
// reach or use it fully. A couple sit slightly deeper and ask for another
// tool tier first, since noticing them takes a closer look.
export const TOOL_PICKUPS: ToolPickup[] = [
  { id: 'tp-shears1', tool: 'shears', tier: 1, zone: 'woodland', x: 12, y: 15, flavor: 'A pair of garden shears, half-buried in leaf litter.' },
  { id: 'tp-trowel1', tool: 'trowel', tier: 1, zone: 'creek', x: 39, y: 10, flavor: 'A hand trowel, its handle worn smooth.' },
  { id: 'tp-lens1', tool: 'lens', tier: 1, zone: 'meadow', x: 68, y: 36, flavor: 'A hand lens, dropped near the old path.' },
  { id: 'tp-lantern1', tool: 'lantern', tier: 1, zone: 'dampForest', x: 50, y: 5, flavor: 'An oil lantern, still with a little fuel in it.' },
  { id: 'tp-fieldkit1', tool: 'fieldKit', tier: 1, zone: 'rockyClearing', x: 60, y: 60, flavor: 'A field analysis kit, its case cracked but usable.' },
  { id: 'tp-shears2', tool: 'shears', tier: 2, zone: 'overgrownClearing', x: 33, y: 60, requiresToolTier: { tool: 'lens', tier: 1 }, flavor: 'A finer pair of shears — you\'d have walked right past these before.' },
  { id: 'tp-lens2', tool: 'lens', tier: 2, zone: 'dampForest', x: 80, y: 20, requiresToolTier: { tool: 'fieldKit', tier: 1 }, flavor: 'A precision loupe, tucked into a mossy crevice.' },
];
