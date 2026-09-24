import type { BasketItem, GameState } from '../state';
import { makeUid } from '../state';

export function basketCapacity(state: GameState): number {
  if (state.owned.includes('basketLarge')) return 16;
  if (state.owned.includes('basketMedium')) return 10;
  return 6;
}

export function basketFull(state: GameState): boolean {
  return state.basket.length >= basketCapacity(state);
}

export function addToBasket(state: GameState, item: Omit<BasketItem, 'uid'>): BasketItem | null {
  if (basketFull(state)) return null;
  const full: BasketItem = { uid: makeUid('item'), ...item };
  state.basket.push(full);
  return full;
}

export function takeFromBasket(state: GameState, uid: string): BasketItem | null {
  const idx = state.basket.findIndex((i) => i.uid === uid);
  if (idx === -1) return null;
  return state.basket.splice(idx, 1)[0];
}
