import type { GameState } from '../state';
import { GREENHOUSE_DOOR, GREENHOUSE_FOOTPRINT, MARKET_STALL, isInBounds, isWater, rectContains } from '../data/worldMap';
import { DISPLAY_SLOTS, GREENHOUSE_EXIT, GREENHOUSE_FURNITURE, GREENHOUSE_GRID_H, GREENHOUSE_GRID_W, NURSERY_BEDS, STORAGE_CRATES } from '../data/stations';

export function isBlockedOutdoor(x: number, y: number, blockingSet: Set<string>): boolean {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (!isInBounds(tx, ty)) return true;
  if (isWater(tx, ty)) return true;
  if (rectContains(GREENHOUSE_FOOTPRINT, tx, ty) && !(tx === GREENHOUSE_DOOR.x && ty === GREENHOUSE_DOOR.y)) return true;
  if (rectContains(MARKET_STALL, tx, ty)) return true;
  if (blockingSet.has(`${tx},${ty}`)) return true;
  return false;
}

/** Solid greenhouse tiles given what's been bought and placed: beds, stands and shelves block; hanging pots don't. */
export function indoorBlockingSet(state: Pick<GameState, 'owned' | 'furniture'>): Set<string> {
  const { owned } = state;
  const has = (req?: string) => !req || owned.includes(req);
  const tiles = [
    ...GREENHOUSE_FURNITURE,
    ...NURSERY_BEDS.filter((b) => has(b.requires)),
    ...DISPLAY_SLOTS.filter((s) => s.kind !== 'hanging' && has(s.requires)),
    ...(owned.includes('sunRoom') ? [] : STORAGE_CRATES),
    ...state.furniture.filter((f) => f.kind !== 'ceilingHook'),
  ];
  return new Set(tiles.map((s) => `${s.x},${s.y}`));
}

export function isBlockedIndoor(x: number, y: number, solid: Set<string>): boolean {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= GREENHOUSE_GRID_W || ty >= GREENHOUSE_GRID_H) return true;
  const onBorder = tx === 0 || ty === 0 || tx === GREENHOUSE_GRID_W - 1 || ty === GREENHOUSE_GRID_H - 1;
  if (onBorder && !(tx === GREENHOUSE_EXIT.x && ty === GREENHOUSE_EXIT.y)) return true;
  return solid.has(`${tx},${ty}`);
}
