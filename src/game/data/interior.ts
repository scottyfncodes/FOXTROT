import { GREENHOUSE_EXIT, GREENHOUSE_GRID_H, GREENHOUSE_GRID_W } from './stations';

// The inside of the building: one continuous interior, two rooms. The west
// two-thirds is the greenhouse (its layout lives in stations.ts, unchanged);
// the east third is the living room of the house it's attached to. A wide
// doorway in the old east glass wall joins them.
//
//   HOME (front door) → living room → greenhouse → garden door → GARDEN → WILD
//
// The rest of the house exists only as doorways: a warm glimpse of a kitchen
// and a hallway that are never entered or drawn.

export const INTERIOR_W = 27;
export const INTERIOR_H = GREENHOUSE_GRID_H;
/** The wall between greenhouse and living room (the greenhouse's old east wall). */
export const PARTITION_X = GREENHOUSE_GRID_W - 1;
/** Rows of the partition that are open: the doorway through to the living room. */
export const PARTITION_DOOR_YS = [7, 8];
/** The front door, in the living room's south wall. */
export const FRONT_DOOR = { x: 22, y: INTERIOR_H - 1 };
export { GREENHOUSE_EXIT };

export type InteriorRoom = 'greenhouse' | 'living';

export function roomAt(x: number): InteriorRoom {
  return x >= PARTITION_X + 0.5 ? 'living' : 'greenhouse';
}

export interface InteriorRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type LivingFixtureKind =
  | 'tv'
  | 'couch'
  | 'coffeeTable'
  | 'sideTable'
  | 'catTree'
  | 'catBed'
  | 'puttingMat'
  | 'rug'
  | 'bookshelf'
  | 'doormat'
  | 'coatRack'
  | 'floorLamp';

export interface LivingFixture extends InteriorRect {
  id: string;
  kind: LivingFixtureKind;
  /** Blocks walking (and furniture placement). */
  solid: boolean;
}

// Rects are in interior tile units, top-left origin.
export const LIVING_FIXTURES: LivingFixture[] = [
  // Sized against Ellen (about one tile tall): a two-seat couch, a modest
  // TV, a mat long enough to putt on — the room frames her, not the other way round.
  { id: 'lr-rug', kind: 'rug', x: 19.6, y: 1.8, w: 3.5, h: 2.5, solid: false },
  { id: 'lr-tv', kind: 'tv', x: 20.7, y: 0.8, w: 1.3, h: 0.42, solid: true },
  { id: 'lr-coffee', kind: 'coffeeTable', x: 20.88, y: 2.2, w: 0.95, h: 0.42, solid: true },
  { id: 'lr-couch', kind: 'couch', x: 20.35, y: 3.2, w: 2.0, h: 0.8, solid: true },
  { id: 'lr-side', kind: 'sideTable', x: 22.5, y: 3.3, w: 0.5, h: 0.5, solid: true },
  { id: 'lr-lamp', kind: 'floorLamp', x: 19.8, y: 3.35, w: 0.35, h: 0.35, solid: true },
  { id: 'lr-bookshelf', kind: 'bookshelf', x: 23.3, y: 0.75, w: 1.0, h: 0.42, solid: true },
  { id: 'lr-cattree', kind: 'catTree', x: 25.0, y: 1.6, w: 0.6, h: 0.6, solid: true },
  { id: 'lr-catbed', kind: 'catBed', x: 24.8, y: 5.9, w: 0.75, h: 0.5, solid: false },
  { id: 'lr-putting', kind: 'puttingMat', x: 19.2, y: 8.3, w: 3.8, h: 0.6, solid: false },
  { id: 'lr-doormat', kind: 'doormat', x: 21.75, y: 10.25, w: 1.5, h: 0.5, solid: false },
  { id: 'lr-coats', kind: 'coatRack', x: 24.7, y: 10.0, w: 0.5, h: 0.5, solid: true },
];

export function findFixture(kind: LivingFixtureKind): LivingFixture {
  return LIVING_FIXTURES.find((f) => f.kind === kind)!;
}

/** The cup at the far end of the putting mat. */
export const PUTTING_CUP = { x: 22.6, y: 8.6 };

/** Openings into the rest of the house — drawn as warm, dim doorways, never entered. */
export const IMPLIED_DOORWAYS = [
  { id: 'kitchen', wall: 'north' as const, x: 18.2, span: 1.5, light: 'rgba(255,196,120,0.55)' },
  { id: 'hallway', wall: 'east' as const, y: 7.2, span: 1.6, light: 'rgba(255,214,150,0.4)' },
];

/** Windows in the living room walls. */
export const LIVING_WINDOWS = [
  { wall: 'north' as const, x: 24.3, span: 1.4 },
  { wall: 'east' as const, y: 3.4, span: 1.5 },
];

/** Wall tiles: the outer border (bar the two exits) and the partition (bar its doorway). */
export function isInteriorWallTile(tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= INTERIOR_W || ty >= INTERIOR_H) return true;
  const onBorder = tx === 0 || ty === 0 || tx === INTERIOR_W - 1 || ty === INTERIOR_H - 1;
  if (onBorder) {
    if (tx === GREENHOUSE_EXIT.x && ty === GREENHOUSE_EXIT.y) return false;
    if (tx === FRONT_DOOR.x && ty === FRONT_DOOR.y) return false;
    return true;
  }
  if (tx === PARTITION_X) return !PARTITION_DOOR_YS.includes(ty);
  return false;
}

export const PARTITION_DOOR_CENTER = {
  x: PARTITION_X + 0.5,
  y: (PARTITION_DOOR_YS[0] + PARTITION_DOOR_YS[PARTITION_DOOR_YS.length - 1] + 1) / 2,
};

/**
 * Where someone walking indoors from (fx, fy) toward (tx, ty) should head
 * next: straight there within a room, or via the doorway between rooms.
 */
export function interiorWaypoint(fx: number, fy: number, tx: number, ty: number): { x: number; y: number } {
  const from = roomAt(fx);
  if (from === roomAt(tx)) return { x: tx, y: ty };
  const d = PARTITION_DOOR_CENTER;
  const side = from === 'greenhouse' ? -1 : 1;
  const approach = { x: d.x + side * 1.0, y: d.y };
  const inDoorway = Math.abs(fx - d.x) < 0.95 && Math.abs(fy - d.y) < 0.6;
  // Line up in front of the doorway first, then step straight through it.
  if (!inDoorway && Math.hypot(fx - approach.x, fy - approach.y) > 0.3) return approach;
  return { x: d.x - side * 1.2, y: d.y };
}

/** Tiles kept clear of furniture so nobody can wall off a way in or out. */
export function isKeepClearTile(tx: number, ty: number): boolean {
  // The garden door and the front door, plus the tile inside each.
  if (tx === GREENHOUSE_EXIT.x && ty >= GREENHOUSE_EXIT.y - 1) return true;
  if (tx === FRONT_DOOR.x && ty >= FRONT_DOOR.y - 1) return true;
  // The doorway between rooms and a tile either side of it.
  if (PARTITION_DOOR_YS.includes(ty) && tx >= PARTITION_X - 1 && tx <= PARTITION_X + 1) return true;
  return false;
}
