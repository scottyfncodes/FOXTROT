import { describe, it, expect, beforeEach } from 'vitest';
import { createNewGame, SAVE_KEY, SAVE_VERSION } from '../src/game/state';
import { loadGame, saveGame, loadOrCreate, resetGame, migrateSave, clearAllSaves } from '../src/game/engine/SaveManager';
import { findScottSpot } from '../src/game/data/scottSpots';
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

  it('never loads a save written by a newer build', () => {
    const future = { ...createNewGame(), version: SAVE_VERSION + 1 };
    localStorage.setItem(SAVE_KEY, JSON.stringify(future));
    expect(loadGame()).toBeNull();
  });

  it('ignores stored data that is not a recognizable save', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1 }));
    localStorage.setItem('foxtrot-save-v1', 'not json');
    expect(loadGame()).toBeNull();
  });
});

describe('save migration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function legacyV3Save() {
    const s = createNewGame() as unknown as Record<string, unknown>;
    // v3 had the husband NPC under a different key and no cat at all.
    const { scott, cat: _cat, ...rest } = s;
    return { ...rest, version: 3, theo: scott };
  }

  it("recovers an older build's save from its legacy key, keeping progress", () => {
    const old = legacyV3Save() as ReturnType<typeof legacyV3Save> & { inventory: unknown[]; journal: Record<string, unknown> };
    old.journal = { bluebell: { specimenId: 'bluebell', kind: 'plant', level: 'CULTIVATED', firstSeenAt: 0, timesCollected: 2, propagatedCount: 0, variantFound: false } };
    localStorage.setItem('foxtrot-save-v3', JSON.stringify(old));

    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(SAVE_VERSION);
    expect(loaded!.journal.bluebell.level).toBe('CULTIVATED');
    expect(loaded!.cat.currentSpotId).toBeTruthy();
    expect(loaded!.scott.activity).toBeTruthy();
    expect('theo' in (loaded as unknown as Record<string, unknown>)).toBe(false);
  });

  it('prefers the current save over any legacy one', () => {
    const current = createNewGame();
    current.clock.totalMinutes = 5000;
    saveGame(current);
    localStorage.setItem('foxtrot-save-v3', JSON.stringify(legacyV3Save()));
    expect(loadGame()!.clock.totalMinutes).toBe(5000);
  });

  it('fills fields added to a record after the save was written', () => {
    const s = createNewGame() as unknown as { scout: Record<string, unknown> };
    delete s.scout.nextEventAt;
    expect(migrateSave(s)!.scout.nextEventAt).toBeTypeOf('number');
  });

  it('replaces a page-relative timestamp from older builds with wall-clock time', () => {
    const s = createNewGame();
    s.clock.lastRealTimestamp = 8714.8; // what older builds stored: performance.now()
    const migrated = migrateSave(s)!;
    expect(migrated.clock.lastRealTimestamp).toBeGreaterThan(1_000_000_000_000);
  });

  it("re-seats a settled NPC on its spot's current coordinates", () => {
    const s = createNewGame();
    s.scott.currentSpotId = 'greenhouse-tinker';
    s.scott.activity = 'tinkering';
    s.scott.x = 5;
    s.scott.y = 7;
    const migrated = migrateSave(s)!;
    const spot = findScottSpot('greenhouse-tinker')!;
    expect([migrated.scott.x, migrated.scott.y]).toEqual([spot.x, spot.y]);
  });

  it('starting a new game clears legacy saves too, so none resurface', () => {
    localStorage.setItem('foxtrot-save-v3', JSON.stringify(legacyV3Save()));
    saveGame(createNewGame());
    clearAllSaves();
    expect(loadGame()).toBeNull();
  });
});
