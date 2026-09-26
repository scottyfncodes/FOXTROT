import type { GameState, PlacedDecor } from '../state';
import { makeUid } from '../state';
import type { DecorId } from '../data/shop';

/** Puts a piece of stocked garden decor down at (x, y). */
export function placeDecor(state: GameState, decorId: DecorId, x: number, y: number): PlacedDecor | null {
  if ((state.decorStock[decorId] ?? 0) <= 0) return null;
  if (state.decor.some((d) => Math.hypot(d.x - x, d.y - y) < 0.7)) return null;
  state.decorStock[decorId] = (state.decorStock[decorId] ?? 0) - 1;
  const placed: PlacedDecor = { id: makeUid('decor'), decorId, x, y };
  state.decor.push(placed);
  return placed;
}

export function nearestDecor(state: GameState, x: number, y: number, range: number): PlacedDecor | null {
  let best: PlacedDecor | null = null;
  let bestD = range;
  for (const d of state.decor) {
    const dist = Math.hypot(d.x - x, d.y - y);
    if (dist < bestD) {
      bestD = dist;
      best = d;
    }
  }
  return best;
}

/** Room for a piece at (x, y): not on top of another piece (ignoring the one being moved). */
export function decorFits(state: GameState, x: number, y: number, ignoreId?: string): boolean {
  return !state.decor.some((d) => d.id !== ignoreId && Math.hypot(d.x - x, d.y - y) < 0.7);
}

/** Moves a placed piece straight to (x, y), if there's room for it there. */
export function moveDecor(state: GameState, id: string, x: number, y: number): boolean {
  const piece = state.decor.find((d) => d.id === id);
  if (!piece || !decorFits(state, x, y, id)) return false;
  piece.x = x;
  piece.y = y;
  return true;
}

/** Picks a placed piece back up into stock, to move it somewhere else. */
export function pickUpDecor(state: GameState, id: string): boolean {
  const idx = state.decor.findIndex((d) => d.id === id);
  if (idx === -1) return false;
  const [d] = state.decor.splice(idx, 1);
  state.decorStock[d.decorId] = (state.decorStock[d.decorId] ?? 0) + 1;
  return true;
}
