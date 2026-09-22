import { describe, it, expect } from 'vitest';
import { attemptPropagation } from '../src/game/systems/propagation';
import { plantSpecimen, rollTraits, tickPlantGrowth } from '../src/game/systems/plantGrowth';
import { createNewGame } from '../src/game/state';
import { PLANTS } from '../src/game/data/plants';

function growToComplete(defId: string) {
  const state = createNewGame();
  const def = PLANTS[defId];
  const traits = rollTraits(def.baseTraits, () => 0.6);
  const instance = plantSpecimen(state, defId, traits, 'growBed1', 0, def.preferredConditions);
  let guard = 0;
  while (instance.stage !== 'COMPLETE' && guard < 2000) {
    tickPlantGrowth(def, instance, 5);
    guard += 1;
  }
  return { instance, def };
}

describe('propagation', () => {
  it('produces a known hybrid when the recipe parents both qualify', () => {
    const a = growToComplete('sundropDaisy');
    const b = growToComplete('creekflagIris');
    // Recipe requires quality >= 55; force it in case variance rolled low.
    a.instance.qualityEstimate = 80;
    b.instance.qualityEstimate = 80;
    const result = attemptPropagation(a, b, (id) => PLANTS[id], () => 0.5);
    expect(result.success).toBe(true);
    expect(result.resultDefId).toBe('duskstarBloom');
    expect(result.isKnownRecipe).toBe(true);
  });

  it('fails a known recipe if parent quality is too low', () => {
    const a = growToComplete('sundropDaisy');
    const b = growToComplete('creekflagIris');
    a.instance.qualityEstimate = 10;
    b.instance.qualityEstimate = 10;
    const result = attemptPropagation(a, b, (id) => PLANTS[id], () => 0.5);
    expect(result.success).toBe(false);
  });

  it('crossing two of the same species always produces an offspring of that species', () => {
    const a = growToComplete('bluebell');
    const b = growToComplete('bluebell');
    const result = attemptPropagation(a, b, (id) => PLANTS[id], () => 0.5);
    expect(result.success).toBe(true);
    expect(result.resultDefId).toBe('bluebell');
    expect(result.traits).not.toBeNull();
  });

  it('can produce a significant variant when parent traits differ enough', () => {
    const a = growToComplete('bluebell');
    const b = growToComplete('bluebell');
    // Push traits far apart so the blended offspring deviates from baseline.
    a.instance.traits.hardiness = 5;
    b.instance.traits.hardiness = 5;
    a.instance.traits.size = 5;
    b.instance.traits.size = 5;
    a.instance.traits.yield = 5;
    b.instance.traits.yield = 5;
    // Use a rand function that maximizes mutation spread.
    const result = attemptPropagation(a, b, (id) => PLANTS[id], () => 1);
    expect(result.success).toBe(true);
    expect(result.isVariant).toBe(true);
  });

  it('unlisted cross-species pairings are unpredictable: some succeed, most do not', () => {
    const a = growToComplete('bluebell');
    const b = growToComplete('stonecropSedum');
    const alwaysFails = attemptPropagation(a, b, (id) => PLANTS[id], () => 0.99);
    expect(alwaysFails.success).toBe(false);
    const alwaysSucceeds = attemptPropagation(a, b, (id) => PLANTS[id], () => 0.01);
    expect(alwaysSucceeds.success).toBe(true);
    expect(alwaysSucceeds.isVariant).toBe(true);
  });
});
