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

describe('propagation trays', () => {
  it('grow a cutting to Young and no further, while a nursery bed keeps going', async () => {
    const { createNewGame } = await import('../src/game/state');
    const { placeFurniture } = await import('../src/game/systems/furniture');
    const { tickGrowth, stageOf, minutesToNextStage, outgrownTray, TRAY_MAX_GROWTH } = await import('../src/game/systems/growth');
    const state = createNewGame();
    state.furnitureStock = { propagationTray: 1 };
    const tray = placeFurniture(state, 'propagationTray', 3, 8)!;
    const base = { seed: 1, plantedAt: 0, lastCuttingAt: null, generation: 1, bornWild: false };
    state.plants.t = { ...base, id: 't', defId: 'pothos', variantId: 'golden', growth: 0, location: { kind: 'nursery', bedId: tray.id } };
    state.plants.b = { ...base, id: 'b', defId: 'pothos', variantId: 'golden', growth: 0, location: { kind: 'nursery', bedId: 'bed1' } };
    const ups = tickGrowth(state, 100_000);
    expect(stageOf(state.plants.t.growth)).toBe('young');
    expect(state.plants.t.growth).toBe(TRAY_MAX_GROWTH);
    expect(stageOf(state.plants.b.growth)).toBe('specimen');
    expect(ups.filter((u) => u.plantId === 't').map((u) => u.to)).toEqual(['young']);
    expect(minutesToNextStage(state, state.plants.t)).toBeNull();
    expect(outgrownTray(state, state.plants.t)).toBe(true);

    // Moved into a nursery bed, it takes off again.
    state.plants.t.location = { kind: 'nursery', bedId: 'bed2' };
    expect(minutesToNextStage(state, state.plants.t)).not.toBeNull();
    tickGrowth(state, 1000);
    expect(stageOf(state.plants.t.growth)).not.toBe('young');
  });

  it("never shrinks a plant that was already bigger when the limit arrived", async () => {
    const { createNewGame } = await import('../src/game/state');
    const { placeFurniture } = await import('../src/game/systems/furniture');
    const { tickGrowth, STAGE_AT } = await import('../src/game/systems/growth');
    const state = createNewGame();
    state.furnitureStock = { propagationTray: 1 };
    const tray = placeFurniture(state, 'propagationTray', 3, 8)!;
    state.plants.old = { id: 'old', defId: 'pothos', variantId: 'golden', seed: 1, growth: STAGE_AT.large, location: { kind: 'nursery', bedId: tray.id }, plantedAt: 0, lastCuttingAt: null, generation: 1, bornWild: false };
    tickGrowth(state, 5000);
    expect(state.plants.old.growth).toBe(STAGE_AT.large);
  });
});
