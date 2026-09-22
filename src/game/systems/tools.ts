import type { ToolId } from '../types';
import type { GameState } from '../state';

export function hasToolTier(state: GameState, tool: ToolId, tier: number): boolean {
  return (state.tools[tool] ?? 0) >= tier;
}

export function meetsRequirement(state: GameState, req?: { tool: ToolId; tier: number }): boolean {
  if (!req) return true;
  return hasToolTier(state, req.tool, req.tier);
}

export function unlockTool(state: GameState, tool: ToolId, tier: number): boolean {
  if ((state.tools[tool] ?? 0) >= tier) return false;
  state.tools[tool] = tier;
  return true;
}

export interface BasketCraftRecipe {
  tier: number;
  materials: Record<string, number>;
}

export const BASKET_RECIPES: BasketCraftRecipe[] = [
  { tier: 2, materials: { creekPebbles: 3, oddSeedPod: 2 } },
  { tier: 3, materials: { roughOre: 3, soilSampleMeadow: 2, soilSampleWoodland: 2 } },
];

export function basketCapacity(state: GameState): number {
  const tier = state.tools.basket ?? 1;
  return tier >= 3 ? 20 : tier === 2 ? 12 : 6;
}

export function canCraftBasketUpgrade(state: GameState, recipe: BasketCraftRecipe): boolean {
  if ((state.tools.basket ?? 1) !== recipe.tier - 1) return false;
  return Object.entries(recipe.materials).every(([defId, need]) => {
    const item = state.inventory.find((i) => i.defId === defId);
    return (item?.count ?? 0) >= need;
  });
}
