import { describe, it, expect } from 'vitest';
import { createNewGame, type OwnedPlant } from '../src/game/state';
import { STAGE_AT, stageOf, stageFloat, tickGrowth, growthMultiplier, minutesToNextStage } from '../src/game/systems/growth';

function plant(overrides: Partial<OwnedPlant> = {}): OwnedPlant {
  return {
    id: 'p1',
    defId: 'pothos',
    variantId: 'golden',
    seed: 1,
    growth: 0,
    location: { kind: 'nursery', bedId: 'bed1' },
    plantedAt: 0,
    lastCuttingAt: null,
    generation: 0,
    bornWild: false,
    ...overrides,
  };
}

describe('growth stages', () => {
  it('moves through cutting → young → established → large → specimen as growth accumulates', () => {
    expect(stageOf(0)).toBe('cutting');
    expect(stageOf(STAGE_AT.young)).toBe('young');
    expect(stageOf(STAGE_AT.established + 1)).toBe('established');
    expect(stageOf(STAGE_AT.large)).toBe('large');
    expect(stageOf(STAGE_AT.specimen * 5)).toBe('specimen');
  });

  it('reports a continuous growth value for drawing, rising within a stage', () => {
    expect(stageFloat(0)).toBe(0);
    const mid = (STAGE_AT.young + STAGE_AT.established) / 2;
    expect(stageFloat(mid)).toBeCloseTo(1.5);
    expect(stageFloat(STAGE_AT.specimen)).toBe(4);
  });

  it('grows every owned plant over time and reports where it started and ended up', () => {
    const state = createNewGame();
    state.plants.p1 = plant();
    const ups = tickGrowth(state, 2000);
    expect(ups).toHaveLength(1);
    expect(ups[0]).toMatchObject({ plantId: 'p1', from: 'cutting', to: 'large' });
    expect(state.plants.p1.growth).toBeGreaterThan(2000);
  });

  it('never shrinks or kills a plant, however much or little time passes', () => {
    const state = createNewGame();
    state.plants.p1 = plant({ growth: 700 });
    tickGrowth(state, 0);
    tickGrowth(state, -50);
    expect(state.plants.p1.growth).toBe(700);
  });

  it('grows faster outdoors in its own habitat than somewhere foreign', () => {
    const state = createNewGame();
    const home = plant({ location: { kind: 'wild', x: 60, y: 30, zone: 'meadow' } });
    const away = plant({ location: { kind: 'wild', x: 60, y: 55, zone: 'rockyClearing' } });
    expect(growthMultiplier(state, home)).toBeGreaterThan(growthMultiplier(state, away));
  });

  it('grow lights speed up everything indoors', () => {
    const state = createNewGame();
    const p = plant();
    const before = growthMultiplier(state, p);
    state.owned.push('growLights');
    expect(growthMultiplier(state, p)).toBeCloseTo(before * 1.5);
    expect(minutesToNextStage(state, p)).toBeGreaterThan(0);
  });
});
