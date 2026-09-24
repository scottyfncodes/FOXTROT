import type { BasketItem, GameState } from '../state';
import type { Rarity } from '../types';
import { PLANTS, PLANT_LIST, specimenRarity } from '../data/plants';
import { findShopItem, type DecorId, DECOR_IDS } from '../data/shop';
import { MINUTES_PER_DAY } from '../engine/Clock';
import { hashString } from '../engine/Random';
import { takeFromBasket } from './basket';
import { ensureRecord } from './collection';
import { stageIndexOf } from './growth';

// The farmer's market: the game's money loop. Commons pay the bills;
// something genuinely rare can pay for a whole greenhouse wing — which is
// exactly what makes selling one a real decision.

export const RARITY_PRICE: Record<Rarity, number> = {
  common: 18,
  uncommon: 40,
  rare: 100,
  veryRare: 260,
  extremelyRare: 700,
};

/** Bigger plants are worth much more than a snipped cutting. */
export const STAGE_PRICE_MULT = [0.5, 0.9, 1.5, 2.4, 3.6];
export const DEMAND_BONUS = 1.5;

/** Today's sought-after species: people are asking for it at the stall. */
export function demandSpecies(state: GameState): string {
  const day = Math.floor(state.clock.totalMinutes / MINUTES_PER_DAY);
  // Prefer something the player has actually found, so the tip is usable.
  const found = PLANT_LIST.filter((p) => state.collection[p.id] && !p.foxOnly);
  const pool = found.length >= 2 ? found : PLANT_LIST.filter((p) => p.rarity === 'common' || p.rarity === 'uncommon');
  return pool[hashString(`demand:${day}`) % pool.length].id;
}

export function stallBonus(state: GameState): number {
  let b = 1;
  if (state.owned.includes('stallAwning')) b += 0.1;
  if (state.owned.includes('stallCrates')) b += 0.1;
  return b;
}

export function priceOf(state: GameState, item: Pick<BasketItem, 'defId' | 'variantId' | 'growth'>): number {
  const rarity = specimenRarity(item.defId, item.variantId);
  let p = RARITY_PRICE[rarity] * STAGE_PRICE_MULT[stageIndexOf(item.growth)];
  if (demandSpecies(state) === item.defId) p *= DEMAND_BONUS;
  return Math.max(1, Math.round(p * stallBonus(state)));
}

export function sellItem(state: GameState, uid: string, now: number): number | null {
  const item = state.basket.find((i) => i.uid === uid);
  if (!item || !PLANTS[item.defId]) return null;
  const price = priceOf(state, item);
  takeFromBasket(state, uid);
  state.coins += price;
  const rec = ensureRecord(state, item.defId, now);
  rec.sold += 1;
  rec.earned += price;
  return price;
}

export type BuyBlock = 'owned' | 'locked' | 'coins';

export function buyBlockReason(state: GameState, itemId: string): BuyBlock | null {
  const item = findShopItem(itemId);
  if (!item) return 'locked';
  if (!item.repeatable && state.owned.includes(itemId)) return 'owned';
  if (item.after && !state.owned.includes(item.after)) return 'locked';
  if (state.coins < item.price) return 'coins';
  return null;
}

export function buyItem(state: GameState, itemId: string): boolean {
  const item = findShopItem(itemId);
  if (!item || buyBlockReason(state, itemId)) return false;
  state.coins -= item.price;
  if (item.repeatable && (DECOR_IDS as string[]).includes(itemId)) {
    const id = itemId as DecorId;
    state.decorStock[id] = (state.decorStock[id] ?? 0) + 1;
  } else {
    state.owned.push(itemId);
  }
  return true;
}
