import type { GameState, GrowthStage, OwnedPlant } from '../state';
import { PLANTS } from '../data/plants';

export const STAGES: GrowthStage[] = ['cutting', 'young', 'established', 'large', 'specimen'];

export const STAGE_LABEL: Record<GrowthStage, string> = {
  cutting: 'Cutting',
  young: 'Young',
  established: 'Established',
  large: 'Large',
  specimen: 'Specimen',
};

/**
 * Cumulative growth (effective game-minutes) needed to reach each stage.
 * At 2 game-minutes per real second: a cutting roots in about a minute and
 * a half, is established a few minutes later, and takes the better part of
 * half an hour of real time (or one long absence) to become a specimen.
 */
export const STAGE_AT: Record<GrowthStage, number> = {
  cutting: 0,
  young: 180,
  established: 540,
  large: 1500,
  specimen: 3600,
};

export function stageIndexOf(growth: number): number {
  let i = 0;
  while (i < STAGES.length - 1 && growth >= STAGE_AT[STAGES[i + 1]]) i++;
  return i;
}

export function stageOf(growth: number): GrowthStage {
  return STAGES[stageIndexOf(growth)];
}

/** 0 (fresh cutting) … 4 (specimen), continuous, for drawing growth smoothly between stages. */
export function stageFloat(growth: number): number {
  const i = stageIndexOf(growth);
  if (i === STAGES.length - 1) return Math.min(4.6, 4 + (growth - STAGE_AT.specimen) / (STAGE_AT.specimen * 2));
  const a = STAGE_AT[STAGES[i]];
  const b = STAGE_AT[STAGES[i + 1]];
  return i + (growth - a) / (b - a);
}

export function isRooted(growth: number): boolean {
  return growth >= STAGE_AT.young;
}

/** Growth per game-minute for this plant where it currently lives. */
export function growthMultiplier(state: GameState, plant: OwnedPlant): number {
  const def = PLANTS[plant.defId];
  if (!def) return 0;
  let m = def.growthRate;
  if (plant.location.kind === 'wild') {
    // Planted out in its own kind of country, a plant romps away; anywhere
    // else it still grows, just more slowly.
    m *= def.habitat.includes(plant.location.zone) ? 1.3 : 0.85;
  } else if (state.owned.includes('growLights')) {
    m *= 1.5;
  }
  return m;
}

/** Game-minutes until the next stage, or null if it's already a specimen. */
export function minutesToNextStage(state: GameState, plant: OwnedPlant): number | null {
  const i = stageIndexOf(plant.growth);
  if (i >= STAGES.length - 1) return null;
  const need = STAGE_AT[STAGES[i + 1]] - plant.growth;
  return need / Math.max(0.01, growthMultiplier(state, plant));
}

export interface StageUp {
  plantId: string;
  from: GrowthStage;
  to: GrowthStage;
}

/** Advances every owned plant by `minutes` of game time. Nothing ever dies or shrinks. */
export function tickGrowth(state: GameState, minutes: number): StageUp[] {
  const ups: StageUp[] = [];
  if (minutes <= 0) return ups;
  for (const plant of Object.values(state.plants)) {
    const before = stageIndexOf(plant.growth);
    plant.growth += minutes * growthMultiplier(state, plant);
    const after = stageIndexOf(plant.growth);
    if (after !== before) ups.push({ plantId: plant.id, from: STAGES[before], to: STAGES[after] });
  }
  return ups;
}
