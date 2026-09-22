import { GREENHOUSE_DOOR, GREENHOUSE_FOOTPRINT, isInBounds, isWater, rectContains } from '../data/worldMap';
import { GREENHOUSE_EXIT, GREENHOUSE_GRID_H, GREENHOUSE_GRID_W, STATIONS } from '../data/stations';

export function isBlockedOutdoor(x: number, y: number, blockingSet: Set<string>): boolean {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (!isInBounds(tx, ty)) return true;
  if (isWater(tx, ty)) return true;
  if (rectContains(GREENHOUSE_FOOTPRINT, tx, ty) && !(tx === GREENHOUSE_DOOR.x && ty === GREENHOUSE_DOOR.y)) return true;
  if (blockingSet.has(`${tx},${ty}`)) return true;
  return false;
}

const STATION_TILES = new Set(STATIONS.map((s) => `${s.x},${s.y}`));

export function isBlockedIndoor(x: number, y: number): boolean {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= GREENHOUSE_GRID_W || ty >= GREENHOUSE_GRID_H) return true;
  const onBorder = tx === 0 || ty === 0 || tx === GREENHOUSE_GRID_W - 1 || ty === GREENHOUSE_GRID_H - 1;
  if (onBorder && !(tx === GREENHOUSE_EXIT.x && ty === GREENHOUSE_EXIT.y)) return true;
  if (STATION_TILES.has(`${tx},${ty}`)) return true;
  return false;
}
