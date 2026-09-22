import { describe, it, expect, beforeEach } from 'vitest';
import { createNewGame } from '../src/game/state';
import { loadGame, saveGame, loadOrCreate, resetGame } from '../src/game/engine/SaveManager';
import { addItem } from '../src/game/systems/inventory';
import { unlockTool } from '../src/game/systems/tools';

describe('save/load persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when there is no save yet', () => {
    expect(loadGame()).toBeNull();
  });

  it('round-trips a saved game exactly (inventory, tools, journal, clock)', () => {
    const state = createNewGame();
    addItem(state, 'bluebell', 'plant', 0, { traits: undefined, quality: 42 });
    unlockTool(state, 'shears', 2);
    state.journal.bluebell = { specimenId: 'bluebell', kind: 'plant', level: 'MASTERED', firstSeenAt: 0, timesCollected: 3, propagatedCount: 1, variantFound: false };
    state.clock.totalMinutes = 1234;

    saveGame(state);
    const loaded = loadGame();

    expect(loaded).not.toBeNull();
    expect(loaded!.inventory.length).toBe(1);
    expect(loaded!.tools.shears).toBe(2);
    expect(loaded!.journal.bluebell.level).toBe('MASTERED');
    expect(loaded!.clock.totalMinutes).toBe(1234);
  });

  it('loadOrCreate reports isNew correctly for fresh vs. existing saves', () => {
    const fresh = loadOrCreate();
    expect(fresh.isNew).toBe(true);
    saveGame(fresh.state);
    const existing = loadOrCreate();
    expect(existing.isNew).toBe(false);
  });

  it('resetGame clears the save and returns a brand-new game state', () => {
    const state = createNewGame();
    addItem(state, 'bluebell', 'plant', 0);
    saveGame(state);
    const reset = resetGame();
    expect(reset.inventory.length).toBe(0);
    expect(loadGame()).toBeNull();
  });

  it('never loads a save with a mismatched version', () => {
    localStorage.setItem('foxtrot-save-v1', JSON.stringify({ version: 999 }));
    expect(loadGame()).toBeNull();
  });
});
