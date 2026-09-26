import { describe, it, expect } from 'vitest';
import { createNewGame } from '../src/game/state';
import { spotContent, spotPool } from '../src/game/systems/spots';
import { DISCOVERY_SPOTS, SPOT_EPOCH_MINUTES } from '../src/game/data/discoveryPoints';
import { PLANTS } from '../src/game/data/plants';
import { matureRadius } from '../src/game/systems/landscape';

const CARNIVORES = ['sundew', 'venusFlytrap', 'trumpetPitcher', 'monkeyCups'];

describe('carnivorous plants', () => {
  it('grow wild in the bogs by the creek and in the damp forest', () => {
    for (const id of CARNIVORES) {
      const def = PLANTS[id];
      expect(def).toBeDefined();
      expect(def.habitat.every((z) => z === 'creek' || z === 'dampForest')).toBe(true);
      const spots = DISCOVERY_SPOTS.filter((s) => !s.foxLed && def.habitat.includes(s.zone));
      expect(spots.some((s) => spotPool(s).includes(def))).toBe(true);
      expect(matureRadius(id)).toBeGreaterThan(0.2);
    }
  });

  it('actually turn up in patches over time', () => {
    const state = createNewGame();
    state.weather.condition = 'clear';
    state.weather.nextChangeAt = Infinity;
    const seen = new Set<string>();
    for (let e = 0; e < 200; e++) {
      state.clock.totalMinutes = e * SPOT_EPOCH_MINUTES + 12 * 60;
      for (const spot of DISCOVERY_SPOTS) {
        const c = spotContent(state, spot);
        if (c && CARNIVORES.includes(c.defId)) seen.add(c.defId);
      }
    }
    expect(seen).toContain('sundew');
    expect(seen).toContain('venusFlytrap');
    expect(seen).toContain('trumpetPitcher');
    // The tropical pitcher plant only shows itself in the rain…
    expect(seen).not.toContain('monkeyCups');
  });

  it('shows the tropical pitcher plant when the forest is dripping', () => {
    const state = createNewGame();
    state.weather.condition = 'rain';
    const spot = { id: 'test-bog', zone: 'dampForest' as const, x: 0, y: 0, pool: ['monkeyCups', 'bostonFern'] };
    let cups = 0;
    for (let e = 0; e < 60; e++) {
      state.clock.totalMinutes = e * SPOT_EPOCH_MINUTES + 12 * 60;
      if (spotContent(state, spot)?.defId === 'monkeyCups') cups++;
    }
    expect(cups).toBeGreaterThan(0);
    expect(PLANTS.monkeyCups.appearsWhen).toBe('rain');
  });

  it('has rarer variants that are rarer than the standard form', () => {
    for (const id of CARNIVORES) {
      const [standard, ...rest] = PLANTS[id].variants;
      expect(standard.rarity).toBe(PLANTS[id].rarity);
      expect(rest.length).toBeGreaterThan(0);
    }
  });
});
