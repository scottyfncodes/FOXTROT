import type { GameState } from '../state';
import { GREENHOUSE_DOOR, GREENHOUSE_FOOTPRINT, HOUSE_FOOTPRINT, MARKET_STALL, isInBounds, isWater, rectContains } from '../data/worldMap';
import { isInteriorWallTile, type InteriorRect } from '../data/interior';
import { FURNITURE_DEFS } from '../data/furniture';
import { allFurniture, footprint, staticSolids } from '../systems/furniture';

export function isBlockedOutdoor(x: number, y: number, blockingSet: Set<string>): boolean {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (!isInBounds(tx, ty)) return true;
  if (isWater(tx, ty)) return true;
  if (rectContains(GREENHOUSE_FOOTPRINT, tx, ty) && !(tx === GREENHOUSE_DOOR.x && ty === GREENHOUSE_DOOR.y)) return true;
  if (rectContains(HOUSE_FOOTPRINT, tx, ty)) return true;
  if (rectContains(MARKET_STALL, tx, ty)) return true;
  if (blockingSet.has(`${tx},${ty}`)) return true;
  return false;
}

/** Everything indoors you'd bump into: furniture standing on the floor and the fixed set dressing. */
export interface IndoorSolids {
  rects: InteriorRect[];
}

export function indoorSolids(state: Pick<GameState, 'owned' | 'furniture' | 'seededFixtures'>): IndoorSolids {
  const rects = staticSolids(state);
  for (const f of allFurniture(state)) {
    if (FURNITURE_DEFS[f.kind]?.layer !== 'floor') continue;
    rects.push(footprint(f.kind, f.x, f.y, f.rot ?? 0));
  }
  return { rects };
}

/** The tiles solid indoor things stand on (coarse; movement uses the exact footprints). */
export function indoorBlockingSet(state: Pick<GameState, 'owned' | 'furniture' | 'seededFixtures'>): Set<string> {
  const set = new Set<string>();
  for (const r of indoorSolids(state).rects) {
    for (let ty = Math.floor(r.y + 0.001); ty <= Math.floor(r.y + r.h - 0.001); ty++) {
      for (let tx = Math.floor(r.x + 0.001); tx <= Math.floor(r.x + r.w - 0.001); tx++) set.add(`${tx},${ty}`);
    }
  }
  return set;
}

export function isBlockedIndoor(x: number, y: number, solids: IndoorSolids): boolean {
  if (isInteriorWallTile(Math.floor(x), Math.floor(y))) return true;
  for (const r of solids.rects) if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return true;
  return false;
}
