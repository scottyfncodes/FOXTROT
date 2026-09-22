import { describe, it, expect } from 'vitest';
import { createNewGame } from '../src/game/state';
import { initEcosystem, tickEcosystem, getPopulation, introduceSpecies, thinSpecies, detectEcologicalAlerts } from '../src/game/systems/ecosystem';

function fixedRand() {
  return 0.5; // deterministic, no jitter noise
}

describe('ecosystem simulation', () => {
  it('initializes populations for every species in its known zones', () => {
    const state = createNewGame();
    initEcosystem(state);
    expect(state.ecosystem.woodland.bluebell).toBeGreaterThan(0);
    expect(state.ecosystem.meadow.honeybee).toBeGreaterThan(0);
  });

  it('a predator suppresses its prey population over time', () => {
    const state = createNewGame();
    initEcosystem(state);
    state.ecosystem.creek = state.ecosystem.creek ?? {};
    state.ecosystem.creek.aphid = 60;
    state.ecosystem.creek.gardenSpider = 90;
    const before = state.ecosystem.creek.aphid;
    tickEcosystem(state, 600, fixedRand);
    expect(state.ecosystem.creek.aphid).toBeLessThan(before);
  });

  it('a sheltering plant helps its dependent species recover', () => {
    const state = createNewGame();
    initEcosystem(state);
    state.ecosystem.creek.creekflagIris = 90;
    state.ecosystem.creek.gardenSpider = 2;
    tickEcosystem(state, 900, fixedRand);
    expect(state.ecosystem.creek.gardenSpider).toBeGreaterThan(2);
  });

  it('invasive species trend toward a much higher carrying capacity than ordinary plants', () => {
    const state = createNewGame();
    initEcosystem(state);
    state.ecosystem.overgrownClearing.widowsLace = 40;
    tickEcosystem(state, 3000, fixedRand);
    expect(state.ecosystem.overgrownClearing.widowsLace).toBeGreaterThan(60);
  });

  it('introduceSpecies raises a population and records the introduction', () => {
    const state = createNewGame();
    initEcosystem(state);
    const before = getPopulation(state, 'meadow', 'stonecropSedum');
    introduceSpecies(state, 'stonecropSedum', 'meadow', 20, 0);
    expect(getPopulation(state, 'meadow', 'stonecropSedum')).toBeGreaterThan(before);
    expect(state.wildIntroductions.length).toBe(1);
  });

  it('thinSpecies reduces a population (e.g. clearing an invasive patch)', () => {
    const state = createNewGame();
    initEcosystem(state);
    state.ecosystem.overgrownClearing.widowsLace = 80;
    thinSpecies(state, 'widowsLace', 'overgrownClearing', 30);
    expect(getPopulation(state, 'overgrownClearing', 'widowsLace')).toBe(50);
  });

  it('flags an ecological alert when aphids surge without enough spiders to check them', () => {
    const state = createNewGame();
    initEcosystem(state);
    state.ecosystem.woodland.aphid = 80;
    state.ecosystem.woodland.gardenSpider = 2;
    const alerts = detectEcologicalAlerts(state);
    expect(alerts.some((a) => a.zone === 'woodland' && a.id.startsWith('aphid-surge'))).toBe(true);
  });

  it('a healthy spider population resolves the aphid-surge alert (ecological intervention works)', () => {
    const state = createNewGame();
    initEcosystem(state);
    state.ecosystem.woodland.aphid = 80;
    state.ecosystem.woodland.gardenSpider = 60;
    const alerts = detectEcologicalAlerts(state);
    expect(alerts.some((a) => a.id.startsWith('aphid-surge') && a.zone === 'woodland')).toBe(false);
  });
});
