import { describe, it, expect, beforeEach } from 'vitest';
import { createNewGame } from '../src/game/state';
import { collectAt, isDiscoveryAvailable, weatherSatisfied } from '../src/game/systems/collection';
import { DISCOVERY_POINTS } from '../src/game/data/discoveryPoints';
import { unlockTool } from '../src/game/systems/tools';
import { recordCultivated, recordMastered, getEntry } from '../src/game/systems/journal';

function dp(id: string) {
  const found = DISCOVERY_POINTS.find((d) => d.id === id);
  if (!found) throw new Error(`missing discovery point ${id}`);
  return found;
}

describe('weather-gated discovery', () => {
  it('a rain-only specimen is unavailable in clear weather and available in rain', () => {
    const state = createNewGame();
    state.weather.condition = 'clear';
    expect(weatherSatisfied(state, 'rain')).toBe(false);
    expect(isDiscoveryAvailable(state, dp('dp-rainbell'))).toBe(false);
    state.weather.condition = 'rain';
    expect(isDiscoveryAvailable(state, dp('dp-rainbell'))).toBe(true);
  });

  it('a night-only specimen respects the day/night cycle', () => {
    const state = createNewGame();
    state.clock.totalMinutes = 12 * 60; // noon
    unlockTool(state, 'shears', 1);
    expect(isDiscoveryAvailable(state, dp('dp-duskvine'))).toBe(false);
    state.clock.totalMinutes = 23 * 60; // 11pm
    expect(isDiscoveryAvailable(state, dp('dp-duskvine'))).toBe(true);
  });
});

describe('tool-gated discovery', () => {
  it('requires the right tool tier before a specimen can be collected', () => {
    const state = createNewGame();
    const point = dp('dp-iris-1');
    expect(isDiscoveryAvailable(state, point)).toBe(false);
    unlockTool(state, 'trowel', 1);
    expect(isDiscoveryAvailable(state, point)).toBe(true);
  });
});

describe('fox-led discovery', () => {
  it('stays unavailable until the point has been revealed', () => {
    const state = createNewGame();
    unlockTool(state, 'fieldKit', 1);
    const point = dp('dp-nightshade');
    expect(isDiscoveryAvailable(state, point)).toBe(false);
    state.discoveryPoints[point.id] = { lastCollectedAt: null, revealed: true };
    expect(isDiscoveryAvailable(state, point)).toBe(true);
  });
});

describe('collectAt', () => {
  it('adds an item, records a journal entry, and enforces the respawn cooldown', () => {
    const state = createNewGame();
    const point = dp('dp-clover');
    const result = collectAt(state, point);
    expect(result.success).toBe(true);
    expect(result.isNewDiscovery).toBe(true);
    expect(state.inventory.length).toBe(1);
    expect(getEntry(state, 'meadowClover')?.level).not.toBe('UNDISCOVERED');

    const second = collectAt(state, point);
    expect(second.success).toBe(false);
    expect(second.reason).toBe('not-available');
  });

  it('marks a specimen collected but not identified without a lens or field kit', () => {
    const state = createNewGame();
    const point = dp('dp-clover');
    collectAt(state, point);
    const entry = getEntry(state, 'meadowClover')!;
    expect(entry.level).toBe('DISCOVERED');
  });

  it('identifies the specimen immediately when the player already has a Hand Lens', () => {
    const state = createNewGame();
    unlockTool(state, 'lens', 1);
    collectAt(state, dp('dp-clover'));
    const entry = getEntry(state, 'meadowClover')!;
    expect(entry.level).toBe('IDENTIFIED');
  });
});

describe('journal progression', () => {
  it('never lowers a discovery level once reached', () => {
    const state = createNewGame();
    recordMastered(state, 'bluebell', 'plant', 0);
    recordCultivated(state, 'bluebell', 'plant', 0);
    expect(getEntry(state, 'bluebell')!.level).toBe('MASTERED');
  });
});
