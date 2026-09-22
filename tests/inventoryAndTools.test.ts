import { describe, it, expect } from 'vitest';
import { createNewGame } from '../src/game/state';
import { addItem, inventoryFull, removeItem, consumeMaterials } from '../src/game/systems/inventory';
import { hasToolTier, meetsRequirement, unlockTool, basketCapacity, canCraftBasketUpgrade, BASKET_RECIPES } from '../src/game/systems/tools';

describe('inventory', () => {
  it('adds non-stackable plant items as separate slots', () => {
    const state = createNewGame();
    addItem(state, 'bluebell', 'plant', 0, { traits: undefined });
    addItem(state, 'bluebell', 'plant', 0, { traits: undefined });
    expect(state.inventory.length).toBe(2);
  });

  it('stacks material items instead of taking new slots', () => {
    const state = createNewGame();
    addItem(state, 'creekPebbles', 'material', 0);
    addItem(state, 'creekPebbles', 'material', 0);
    expect(state.inventory.length).toBe(1);
    expect(state.inventory[0].count).toBe(2);
  });

  it('refuses to add non-stackable items once the basket is full', () => {
    const state = createNewGame();
    const capacity = basketCapacity(state);
    for (let i = 0; i < capacity; i++) {
      addItem(state, 'bluebell', 'plant', 0);
    }
    expect(inventoryFull(state)).toBe(true);
    const result = addItem(state, 'bluebell', 'plant', 0);
    expect(result).toBeNull();
    expect(state.inventory.length).toBe(capacity);
  });

  it('removes items correctly, including partial stacks', () => {
    const state = createNewGame();
    const item = addItem(state, 'creekPebbles', 'material', 0)!;
    addItem(state, 'creekPebbles', 'material', 0);
    expect(item.count).toBe(2);
    removeItem(state, item.uid, 1);
    expect(state.inventory[0].count).toBe(1);
    removeItem(state, item.uid, 1);
    expect(state.inventory.length).toBe(0);
  });

  it('consumeMaterials only succeeds when enough of every material is present', () => {
    const state = createNewGame();
    addItem(state, 'creekPebbles', 'material', 0);
    addItem(state, 'creekPebbles', 'material', 0);
    expect(consumeMaterials(state, { creekPebbles: 3 })).toBe(false);
    expect(consumeMaterials(state, { creekPebbles: 2 })).toBe(true);
    expect(state.inventory.length).toBe(0);
  });
});

describe('tools', () => {
  it('starts with only the basket unlocked', () => {
    const state = createNewGame();
    expect(hasToolTier(state, 'basket', 1)).toBe(true);
    expect(hasToolTier(state, 'shears', 1)).toBe(false);
  });

  it('unlockTool raises a tool tier and meetsRequirement respects it', () => {
    const state = createNewGame();
    expect(meetsRequirement(state, { tool: 'shears', tier: 1 })).toBe(false);
    unlockTool(state, 'shears', 1);
    expect(meetsRequirement(state, { tool: 'shears', tier: 1 })).toBe(true);
    expect(meetsRequirement(state, { tool: 'shears', tier: 2 })).toBe(false);
  });

  it('unlockTool never downgrades an existing higher tier', () => {
    const state = createNewGame();
    unlockTool(state, 'lens', 2);
    const changed = unlockTool(state, 'lens', 1);
    expect(changed).toBe(false);
    expect(state.tools.lens).toBe(2);
  });

  it('basket capacity increases with tier', () => {
    const state = createNewGame();
    const base = basketCapacity(state);
    state.tools.basket = 2;
    expect(basketCapacity(state)).toBeGreaterThan(base);
  });

  it('basket upgrade crafting requires materials and the right current tier', () => {
    const state = createNewGame();
    const recipe = BASKET_RECIPES[0];
    expect(canCraftBasketUpgrade(state, recipe)).toBe(false);
    for (const [defId, count] of Object.entries(recipe.materials)) {
      for (let i = 0; i < count; i++) addItem(state, defId, 'material', 0);
    }
    expect(canCraftBasketUpgrade(state, recipe)).toBe(true);
  });
});
