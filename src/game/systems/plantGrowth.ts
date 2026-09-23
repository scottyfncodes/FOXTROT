import type { GrowConditions, GrowthStage, PlantDef, TraitSet } from '../types';
import type { GameState, PlantInstance } from '../state';
import { makeUid } from '../state';

const STAGE_ORDER: GrowthStage[] = ['WILD', 'CULTIVATED', 'IMPROVED', 'MATURE', 'COMPLETE'];

/**
 * Growth is decoupled from the day/weather clock's pace: the clock runs
 * fast enough that day/night and weather visibly change within a play
 * session, but plants shouldn't blaze through every stage (and spam
 * "now IMPROVED" toasts) in a few seconds of real time just because the
 * clock ticked. This scales elapsed game-minutes down before they're
 * applied to growth, so a planted specimen takes on the order of minutes
 * of real, active play to complete rather than seconds — while an
 * offline catch-up (which passes much larger elapsed-minute values)
 * still comfortably finishes it.
 */
export const GROWTH_TIME_SCALE = 0.06;

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

/**
 * A single directional nudge toward whichever chosen condition is furthest
 * from this plant's preference — "it wants more shade", never the exact
 * target. Meant to guide experimentation without handing over the answer;
 * returns null once every condition already matches.
 */
export function biggestMismatchHint(chosen: GrowConditions, preferred: GrowConditions): string | null {
  const candidates: { dist: number; text: string }[] = [
    {
      dist: Math.abs(WATER_SCALE[chosen.water] - WATER_SCALE[preferred.water]),
      text: WATER_SCALE[chosen.water] > WATER_SCALE[preferred.water] ? 'It might be getting too much water.' : 'It could probably use more water.',
    },
    {
      dist: Math.abs(LIGHT_SCALE[chosen.light] - LIGHT_SCALE[preferred.light]),
      text: LIGHT_SCALE[chosen.light] > LIGHT_SCALE[preferred.light] ? 'It may want more direct light.' : 'It might prefer more shade.',
    },
    {
      dist: Math.abs(TEMP_SCALE[chosen.temp] - TEMP_SCALE[preferred.temp]),
      text: TEMP_SCALE[chosen.temp] > TEMP_SCALE[preferred.temp] ? 'This spot may be too warm for it.' : 'It could probably use more warmth.',
    },
    {
      dist: Math.abs(NUTRIENT_SCALE[chosen.nutrients] - NUTRIENT_SCALE[preferred.nutrients]),
      text: NUTRIENT_SCALE[chosen.nutrients] > NUTRIENT_SCALE[preferred.nutrients] ? 'The soil here might be richer than it wants.' : 'It may want richer soil.',
    },
    { dist: chosen.soil === preferred.soil ? 0 : 1, text: 'Something about this soil type doesn\'t feel right for it.' },
  ];
  const worst = candidates.reduce((a, b) => (b.dist > a.dist ? b : a));
  return worst.dist > 0 ? worst.text : null;
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

  // Surplus progress carries into the next stage, so one large catch-up
  // (e.g. returning after a long absence) can pass through several stages.
  let durationKey = STAGE_DURATION_KEY[instance.stage];
  while (durationKey && instance.progressMinutes >= def.stageDurations[durationKey]) {
    instance.progressMinutes -= def.stageDurations[durationKey];
    instance.stage = nextStage(instance.stage);
    result.stageAdvanced = true;
    result.newStage = instance.stage;
    durationKey = STAGE_DURATION_KEY[instance.stage];
  }
  if (instance.stage === 'COMPLETE' && result.stageAdvanced) {
    instance.progressMinutes = 0;
    instance.traits.quality = instance.qualityEstimate;
    result.completed = true;
  }
  return result;
}

export function stageProgress01(def: PlantDef, instance: PlantInstance): number {
  const key = STAGE_DURATION_KEY[instance.stage];
  if (!key) return 1;
  const threshold = def.stageDurations[key];
  return clamp(instance.progressMinutes / threshold, 0, 1);
}
