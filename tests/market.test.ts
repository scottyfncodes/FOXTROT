import { describe, it, expect } from 'vitest';
import { createNewGame } from '../src/game/state';
import { priceOf, sellItem, buyItem, buyBlockReason, demandSpecies } from '../src/game/systems/market';
import { addToBasket, basketCapacity } from '../src/game/systems/basket';
import { placeDecor, pickUpDecor } from '../src/game/systems/decor';
import { STAGE_AT } from '../src/game/systems/growth';

describe('farmer’s market', () => {
  it('pays more for rarer plants and for bigger ones', () => {
    const state = createNewGame();
    state.clock.totalMinutes = 0;
    const not = (id: string) => demandSpecies(state) !== id;
    const cutting = { defId: 'monstera', variantId: 'deliciosa', growth: 0 };
    const grown = { ...cutting, growth: STAGE_AT.large };
    const albo = { ...cutting, variantId: 'albo' };
    const thai = { ...cutting, variantId: 'thaiConstellation' };
    expect(priceOf(state, grown)).toBeGreaterThan(priceOf(state, cutting));
    expect(priceOf(state, albo)).toBeGreaterThan(priceOf(state, cutting) * 4);
    expect(priceOf(state, thai)).toBeGreaterThan(priceOf(state, albo));
    if (not('pothos') && not('monstera')) {
      expect(priceOf(state, { defId: 'pothos', variantId: 'golden', growth: 0 })).toBeLessThan(priceOf(state, cutting));
    }
  });

  it('selling pays out, removes the plant and keeps a record', () => {
    const state = createNewGame();
    const item = addToBasket(state, { defId: 'pothos', variantId: 'neon', seed: 1, growth: 0, generation: 0, origin: 'wild', collectedAt: 0 })!;
    const expected = priceOf(state, item);
    const before = state.coins;
    expect(sellItem(state, item.uid, 0)).toBe(expected);
    expect(state.coins).toBe(before + expected);
    expect(state.basket).toHaveLength(0);
    expect(state.collection.pothos.sold).toBe(1);
    expect(state.collection.pothos.earned).toBe(expected);
  });

  it('upgrades cost money, can only be bought once, and some unlock others', () => {
    const state = createNewGame();
    state.coins = 0;
    expect(buyBlockReason(state, 'basketMedium')).toBe('coins');
    state.coins = 1000;
    expect(buyBlockReason(state, 'basketLarge')).toBe('locked');
    expect(buyItem(state, 'basketMedium')).toBe(true);
    expect(basketCapacity(state)).toBe(10);
    expect(buyBlockReason(state, 'basketMedium')).toBe('owned');
    expect(buyItem(state, 'basketLarge')).toBe(true);
    expect(basketCapacity(state)).toBe(16);
  });

  it('the stall awning raises every price', () => {
    const state = createNewGame();
    const item = { defId: 'monstera', variantId: 'albo', growth: STAGE_AT.large };
    const before = priceOf(state, item);
    state.coins = 1000;
    buyItem(state, 'stallAwning');
    expect(priceOf(state, item)).toBeGreaterThan(before);
  });

  it('garden decor is bought by the piece, placed, and can be picked up again', () => {
    const state = createNewGame();
    state.coins = 1000;
    buyItem(state, 'gardenBench');
    buyItem(state, 'gardenBench');
    expect(state.decorStock.gardenBench).toBe(2);
    const d = placeDecor(state, 'gardenBench', 60, 30)!;
    expect(state.decor).toHaveLength(1);
    expect(placeDecor(state, 'gardenBench', 60.2, 30)).toBeNull(); // too close
    expect(pickUpDecor(state, d.id)).toBe(true);
    expect(state.decorStock.gardenBench).toBe(2);
  });
});
