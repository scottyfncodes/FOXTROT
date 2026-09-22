import type { GrowConditions, GrowthStage, PlantDef, TraitSet } from '../types';
import type { GameState, PlantInstance } from '../state';
import { makeUid } from '../state';

const STAGE_ORDER: GrowthStage[] = ['WILD', 'CULTIVATED', 'IMPROVED', 'MATURE', 'COMPLETE'];

export function nextStage(stage: GrowthStage): GrowthStage {
  const i = STAGE_ORDER.indexOf(stage);
  return STAGE_ORDER[Math.min(i + 1, STAGE_ORDER.length - 1)];
}

const DEFAULT_TRAITS: TraitSet = {
  growthRate: 50,
  size: 50,
  colorHue: 200,
  hardiness: 50,
  yield: 50,
  waterTolerance: 30,
  lightTolerance: 30,
  pollinatorAttraction: 30,
  quality: 50,
};

/** Rolls a concrete trait set for a freshly-collected wild specimen, with natural variance. */
export function rollTraits(base: Partial<TraitSet>, rand: () => number = Math.random): TraitSet {
  const merged: TraitSet = { ...DEFAULT_TRAITS, ...base };
  const varied: TraitSet = { ...merged };
  for (const key of Object.keys(merged) as (keyof TraitSet)[]) {
    if (key === 'colorHue') {
      varied.colorHue = (merged.colorHue + (rand() - 0.5) * 20 + 360) % 360;
      continue;
    }
    if (key === 'quality') continue;
    const variance = (rand() - 0.5) * 24; // +/-12
    varied[key] = clamp(merged[key] + variance, 0, 100);
  }
  return varied;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

const WATER_SCALE = { dry: 0, moist: 1, wet: 2 };
const LIGHT_SCALE = { fullSun: 0, partialShade: 1, fullShade: 2 };
const TEMP_SCALE = { cool: 0, temperate: 1, warm: 2 };
const NUTRIENT_SCALE = { lean: 0, moderate: 1, rich: 2 };

function scaledMatch(a: number, b: number, tolerance: number): number {
  const dist = Math.abs(a - b);
  if (dist === 0) return 1;
  if (dist === 1) return clamp(0.45 * tolerance, 0, 1);
  return 0;
}

/**
 * Returns 0-1: how well the chosen growing conditions match a plant's
 * preferences. Soil is categorical; the rest are ordered scales, so being
 * "one step off" (e.g. moist vs wet) still gives partial credit, more so
 * for hardier specimens.
 */
export function conditionMatchScore(chosen: GrowConditions, preferred: GrowConditions, hardiness: number): number {
  const tolerance = 0.6 + (hardiness / 100) * 0.8; // 0.6 - 1.4
  const soilScore = chosen.soil === preferred.soil ? 1 : 0.25 * tolerance;
  const waterScore = scaledMatch(WATER_SCALE[chosen.water], WATER_SCALE[preferred.water], tolerance);
  const lightScore = scaledMatch(LIGHT_SCALE[chosen.light], LIGHT_SCALE[preferred.light], tolerance);
  const tempScore = scaledMatch(TEMP_SCALE[chosen.temp], TEMP_SCALE[preferred.temp], tolerance);
  const nutrientScore = scaledMatch(NUTRIENT_SCALE[chosen.nutrients], NUTRIENT_SCALE[preferred.nutrients], tolerance);
  return clamp((soilScore + waterScore + lightScore + tempScore + nutrientScore) / 5, 0, 1);
}

export const DEFAULT_CONDITIONS: GrowConditions = {
  soil: 'loam',
  water: 'moist',
  light: 'partialShade',
  temp: 'temperate',
  nutrients: 'moderate',
};

export function plantSpecimen(
  state: GameState,
  defId: string,
  traits: TraitSet,
  stationId: string,
  now: number,
  conditions: GrowConditions = DEFAULT_CONDITIONS
): PlantInstance {
  const instance: PlantInstance = {
    id: makeUid('plant'),
    defId,
    stationId,
    stage: 'CULTIVATED',
    traits,
    conditions,
    progressMinutes: 0,
    plantedAt: now,
    dormant: false,
    matchQualityAccum: 0,
    matchSamples: 0,
    qualityEstimate: 50,
    harvested: false,
  };
  state.plantInstances[instance.id] = instance;
  state.stationOccupancy[stationId] = instance.id;
  return instance;
}

export interface GrowthTickResult {
  stageAdvanced: boolean;
  completed: boolean;
  newStage: GrowthStage;
}

const STAGE_DURATION_KEY: Record<GrowthStage, keyof PlantDef['stageDurations'] | null> = {
  WILD: null,
  CULTIVATED: 'CULTIVATED',
  IMPROVED: 'IMPROVED',
  MATURE: 'MATURE',
  COMPLETE: null,
};

/** Advances a planted specimen's growth given elapsed game-minutes. Never harms the plant. */
export function tickPlantGrowth(def: PlantDef, instance: PlantInstance, elapsedMinutes: number): GrowthTickResult {
  const result: GrowthTickResult = { stageAdvanced: false, completed: false, newStage: instance.stage };
  if (instance.stage === 'COMPLETE' || elapsedMinutes <= 0) return result;

  const matchScore = conditionMatchScore(instance.conditions, def.preferredConditions, instance.traits.hardiness);
  instance.dormant = matchScore < 0.4;
  instance.matchQualityAccum += matchScore * elapsedMinutes;
  instance.matchSamples += elapsedMinutes;
  const avgMatch = instance.matchSamples > 0 ? instance.matchQualityAccum / instance.matchSamples : matchScore;
  instance.qualityEstimate = clamp(Math.round(35 + avgMatch * 55 + (instance.traits.hardiness - 50) * 0.1), 1, 100);

  const speedMult = 0.7 + (instance.traits.growthRate / 100) * 0.6;
  const effectiveMinutes = elapsedMinutes * (0.12 + 0.88 * matchScore) * speedMult;
  instance.progressMinutes += effectiveMinutes;

  const durationKey = STAGE_DURATION_KEY[instance.stage];
  if (!durationKey) return result;
  const threshold = def.stageDurations[durationKey];
  if (instance.progressMinutes >= threshold) {
    instance.progressMinutes = 0;
    instance.stage = nextStage(instance.stage);
    result.stageAdvanced = true;
    result.newStage = instance.stage;
    if (instance.stage === 'COMPLETE') {
      instance.traits.quality = instance.qualityEstimate;
      result.completed = true;
    }
  }
  return result;
}

export function stageProgress01(def: PlantDef, instance: PlantInstance): number {
  const key = STAGE_DURATION_KEY[instance.stage];
  if (!key) return 1;
  const threshold = def.stageDurations[key];
  return clamp(instance.progressMinutes / threshold, 0, 1);
}
