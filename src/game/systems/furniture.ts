import type { GameState, PlacedFurniture } from '../state';
import { makeUid } from '../state';
import type { FurnitureId } from '../data/shop';
import { DISPLAY_SLOTS, GREENHOUSE_EXIT, GREENHOUSE_GRID_H, GREENHOUSE_GRID_W, type DisplayKind, type DisplaySlot } from '../data/stations';
import { indoorBlockingSet } from '../world/Collision';
import { occupantOf } from './propagation';

// Greenhouse furniture the player places themselves. Each piece is one more
// display spot, so the room's layout — and how much it can hold — is theirs
// to decide. Pieces can be picked back up (once empty) and moved.

export const FURNITURE_SLOT_KIND: Record<FurnitureId, DisplayKind> = {
  plantStand: 'stand',
  ironPedestal: 'pedestal',
  ceilingHook: 'hanging',
  wallTrellis: 'trellis',
};

/** Every display spot in the greenhouse right now: the built-in ones that are unlocked, plus placed furniture. */
export function displaySlots(state: GameState): DisplaySlot[] {
  const builtIn = DISPLAY_SLOTS.filter((s) => !s.requires || state.owned.includes(s.requires));
  const placed = state.furniture.map((f) => ({ id: f.id, x: f.x, y: f.y, kind: FURNITURE_SLOT_KIND[f.kind] }));
  return [...builtIn, ...placed];
}

export type PlaceBlock = 'none-left' | 'wall' | 'doorway' | 'occupied';

export function placeBlockReason(state: GameState, kind: FurnitureId, x: number, y: number): PlaceBlock | null {
  if ((state.furnitureStock[kind] ?? 0) <= 0) return 'none-left';
  if (x <= 0 || y <= 0 || x >= GREENHOUSE_GRID_W - 1 || y >= GREENHOUSE_GRID_H - 1) return 'wall';
  // Keep the way in and out clear.
  if (x === GREENHOUSE_EXIT.x && y >= GREENHOUSE_EXIT.y - 1) return 'doorway';
  const hanging = FURNITURE_SLOT_KIND[kind] === 'hanging';
  const slots = displaySlots(state).filter((s) => s.x === x && s.y === y);
  if (hanging) {
    // A hook can go above anything, just not above another hanging pot.
    if (slots.some((s) => s.kind === 'hanging')) return 'occupied';
    return null;
  }
  if (slots.some((s) => s.kind !== 'hanging')) return 'occupied';
  if (indoorBlockingSet(state).has(`${x},${y}`)) return 'occupied';
  return null;
}

export function placeFurniture(state: GameState, kind: FurnitureId, x: number, y: number): PlacedFurniture | null {
  if (placeBlockReason(state, kind, x, y)) return null;
  state.furnitureStock[kind] = (state.furnitureStock[kind] ?? 0) - 1;
  const piece: PlacedFurniture = { id: makeUid('furniture'), kind, x, y };
  state.furniture.push(piece);
  return piece;
}

export function findFurniture(state: GameState, id: string): PlacedFurniture | undefined {
  return state.furniture.find((f) => f.id === id);
}

/** Picks an empty piece back up into stock, to set it down somewhere else. */
export function pickUpFurniture(state: GameState, id: string): boolean {
  const idx = state.furniture.findIndex((f) => f.id === id);
  if (idx === -1 || occupantOf(state, { slotId: id })) return false;
  const [f] = state.furniture.splice(idx, 1);
  state.furnitureStock[f.kind] = (state.furnitureStock[f.kind] ?? 0) + 1;
  return true;
}

/** Vines and trailers climb a trellis; anything else just sits in its pot at the foot. */
export function climbsTrellis(form: string): boolean {
  return form === 'trailing' || form === 'beads';
}
