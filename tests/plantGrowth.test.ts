import { describe, it, expect } from 'vitest';
import { rollTraits, conditionMatchScore, plantSpecimen, tickPlantGrowth, DEFAULT_CONDITIONS, biggestMismatchHint } from '../src/game/systems/plantGrowth';
import { createNewGame } from '../src/game/state';
import { PLANTS } from '../src/game/data/plants';

describe('rollTraits', () => {
  it('produces values within a plausible range around the base', () => {
    const traits = rollTraits(PLANTS.bluebell.baseTraits, () => 0.5);
    expect(traits.growthRate).toBeGreaterThanOrEqual(0);
    expect(traits.growthRate).toBeLessThanOrEqual(100);
    expect(traits.colorHue).toBeGreaterThanOrEqual(0);
    expect(traits.colorHue).toBeLessThan(360);
  });
});

describe('conditionMatchScore', () => {
  it('scores a perfect match as 1', () => {
    const score = conditionMatchScore(PLANTS.bluebell.preferredConditions, PLANTS.bluebell.preferredConditions, 50);
    expect(score).toBeCloseTo(1);
  });

  it('scores a poor match lower than a perfect one', () => {
    const bad = conditionMatchScore(
      { soil: 'sandy', water: 'dry', light: 'fullSun', temp: 'warm', nutrients: 'lean' },
      PLANTS.bluebell.preferredConditions,
      50
    );
    const good = conditionMatchScore(PLANTS.bluebell.preferredConditions, PLANTS.bluebell.preferredConditions, 50);
    expect(bad).toBeLessThan(good);
  });

  it('gives hardier specimens more tolerance for mismatched conditions', () => {
    const chosen = { soil: 'loam', water: 'wet', light: 'partialShade', temp: 'temperate', nutrients: 'moderate' } as const;
    const low = conditionMatchScore(chosen, PLANTS.bluebell.preferredConditions, 10);
    const high = conditionMatchScore(chosen, PLANTS.bluebell.preferredConditions, 95);
    expect(high).toBeGreaterThanOrEqual(low);
  });
});

describe('plant growth stage progression', () => {
  it('advances from CULTIVATED to COMPLETE given enough matched-condition time', () => {
    const state = createNewGame();
    const def = PLANTS.meadowClover; // short durations, good for fast test
    const traits = rollTraits(def.baseTraits, () => 0.5);
    const instance = plantSpecimen(state, def.id, traits, 'growBed1', 0, def.preferredConditions);
    expect(instance.stage).toBe('CULTIVATED');

    let guard = 0;
    while (instance.stage !== 'COMPLETE' && guard < 500) {
      tickPlantGrowth(def, instance, 5);
      guard += 1;
    }
    expect(instance.stage).toBe('COMPLETE');
    expect(instance.traits.quality).toBeGreaterThan(0);
  });

  it('never regresses or destroys a plant under mismatched conditions (failed cultivation is safe)', () => {
    const state = createNewGame();
    const def = PLANTS.blueFern; // prefers wet/peaty/shade/cool/rich
    const traits = rollTraits(def.baseTraits, () => 0.5);
    // Deliberately wrong conditions: sun-loving desert setup for a shade fern.
    const badConditions = { soil: 'sandy', water: 'dry', light: 'fullSun', temp: 'warm', nutrients: 'lean' } as const;
    const instance = plantSpecimen(state, def.id, traits, 'growBed1', 0, badConditions);

    for (let i = 0; i < 50; i++) {
      tickPlantGrowth(def, instance, 10);
    }

    expect(instance.dormant).toBe(true);
    expect(instance.progressMinutes).toBeGreaterThanOrEqual(0);
    expect(['CULTIVATED', 'IMPROVED', 'MATURE', 'COMPLETE']).toContain(instance.stage);
    // Nothing about the instance should ever go negative or become invalid.
    expect(instance.qualityEstimate).toBeGreaterThan(0);
  });

  it('grows faster under matched conditions than mismatched ones', () => {
    const def = PLANTS.blueFern; // long stage durations, safe from overflowing a stage in this test
    const traits = rollTraits(def.baseTraits, () => 0.5);
    const good = { ...def.preferredConditions };
    const bad = { soil: 'sandy', water: 'dry', light: 'fullSun', temp: 'warm', nutrients: 'lean' } as const;

    const goodInstance = plantSpecimen(createNewGame(), def.id, { ...traits }, 'growBed1', 0, good);
    const badInstance = plantSpecimen(createNewGame(), def.id, { ...traits }, 'growBed1', 0, bad);
    tickPlantGrowth(def, goodInstance, 3);
    tickPlantGrowth(def, badInstance, 3);
    expect(goodInstance.progressMinutes).toBeGreaterThan(badInstance.progressMinutes);
  });
});

describe('biggestMismatchHint', () => {
  it('returns null when every condition already matches', () => {
    expect(biggestMismatchHint(PLANTS.bluebell.preferredConditions, PLANTS.bluebell.preferredConditions)).toBeNull();
  });

  it('names a direction, never an exact target value', () => {
    const chosen = { soil: 'loam', water: 'dry', light: 'partialShade', temp: 'temperate', nutrients: 'moderate' } as const;
    const hint = biggestMismatchHint(chosen, PLANTS.bluebell.preferredConditions);
    expect(hint).toMatch(/water/i);
    expect(hint).not.toMatch(/moist/i); // shouldn't leak the actual preferred value
  });

  it('picks the single worst-mismatched attribute, not a generic message', () => {
    // Water is off by 2 steps (dry vs wet-preferring plant), light only 1 step off.
    const chosen = { soil: 'clay', water: 'dry', light: 'partialShade', temp: 'temperate', nutrients: 'rich' } as const;
    const hint = biggestMismatchHint(chosen, PLANTS.creekflagIris.preferredConditions);
    expect(hint).toMatch(/water/i);
  });
});
