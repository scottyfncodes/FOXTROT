import type { ZoneId } from '../types';

// A single compact overworld grid divided into rectangular zone regions,
// plus a creek band running north-south through the middle. Coordinates are
// in tiles; TILE_SIZE (px) lives in the renderer/camera.

export const GRID_W = 90;
export const GRID_H = 64;
export const TILE_SIZE = 32;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const CREEK_BAND: Rect = { x: 38, y: 0, w: 8, h: GRID_H };
export const CREEK_WATER: Rect = { x: 40, y: 0, w: 4, h: GRID_H };
export const BRIDGES: Rect[] = [
  { x: 40, y: 13, w: 4, h: 3 },
  { x: 40, y: 49, w: 4, h: 3 },
];

export const ZONE_RECTS: { zone: ZoneId; rect: Rect }[] = [
  { zone: 'woodland', rect: { x: 0, y: 0, w: 38, h: 30 } },
  { zone: 'overgrownClearing', rect: { x: 0, y: 30, w: 38, h: 34 } },
  { zone: 'dampForest', rect: { x: 46, y: 0, w: 44, h: 24 } },
  { zone: 'meadow', rect: { x: 46, y: 24, w: 44, h: 22 } },
  { zone: 'rockyClearing', rect: { x: 46, y: 46, w: 44, h: 18 } },
];

export const GREENHOUSE_FOOTPRINT: Rect = { x: 60, y: 32, w: 10, h: 8 };
/** The garden door: the greenhouse opens straight onto the garden. */
export const GREENHOUSE_DOOR = { x: 65, y: 40 };
/**
 * The house the greenhouse is attached to: a third of the building, on its
 * east side. Its front door opens into the living room.
 */
export const HOUSE_FOOTPRINT: Rect = { x: 70, y: 32, w: 5, h: 8 };
export const HOUSE_DOOR = { x: 72, y: 40 };
export const PLAYER_START = { x: 65, y: 43 };
/** The Plant Stand & Supply stall: two tiles wide, just down the path from home. */
export const MARKET_STALL: Rect = { x: 69, y: 42, w: 2, h: 1 };

export function rectContains(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

function inBridge(x: number, y: number): boolean {
  return BRIDGES.some((b) => rectContains(b, x, y));
}

export function isWater(x: number, y: number): boolean {
  if (!rectContains(CREEK_WATER, x, y)) return false;
  return !inBridge(x, y);
}

export function isInsideGreenhouseFootprint(x: number, y: number): boolean {
  return rectContains(GREENHOUSE_FOOTPRINT, x, y) || rectContains(HOUSE_FOOTPRINT, x, y);
}

/** True on the tiles the building stands on, including the house. */
export function isInsideHomeFootprint(x: number, y: number): boolean {
  return isInsideGreenhouseFootprint(x, y);
}

export function zoneAt(x: number, y: number): ZoneId {
  if (isInsideGreenhouseFootprint(x, y)) return 'greenhouse';
  if (rectContains(CREEK_BAND, x, y)) return 'creek';
  for (const { zone, rect } of ZONE_RECTS) {
    if (rectContains(rect, x, y)) return zone;
  }
  return 'meadow';
}

export function isInBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < GRID_W && y < GRID_H;
}
