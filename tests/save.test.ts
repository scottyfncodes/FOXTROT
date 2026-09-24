import { describe, it, expect, beforeEach } from 'vitest';
import { createNewGame, SAVE_KEY, SAVE_VERSION } from '../src/game/state';
import { loadGame, saveGame, loadOrCreate, resetGame, migrateSave, clearAllSaves } from '../src/game/engine/SaveManager';
import { findScottSpot } from '../src/game/data/scottSpots';
import { addToBasket } from '../src/game/systems/basket';

describe('save/load persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when there is no save yet', () => {
    expect(loadGame()).toBeNull();
  });

  it('round-trips a saved game exactly (basket, plants in every location, collection, money, clock)', () => {
    const state = createNewGame();
    addToBasket(state, { defId: 'pothos', variantId: 'neon', seed: 1, growth: 0, generation: 0, origin: 'wild', collectedAt: 0 });
    const base = { seed: 3, plantedAt: 0, lastCuttingAt: null, generation: 1, bornWild: false };
    state.plants.a = { ...base, id: 'a', defId: 'monstera', variantId: 'albo', growth: 900, location: { kind: 'display', slotId: 'stand1', potId: 'copper' } };
    state.plants.b = { ...base, id: 'b', defId: 'bostonFern', variantId: 'standard', growth: 4000, location: { kind: 'wild', x: 55.2, y: 14.1, zone: 'dampForest' } };
    state.plants.c = { ...base, id: 'c', defId: 'pothos', variantId: 'golden', growth: 10, location: { kind: 'nursery', bedId: 'bed1' } };
    state.collection.monstera = { foundAt: 0, variants: ['deliciosa', 'albo'], grown: 2, propagated: 3, sold: 1, earned: 400, plantedOut: 0, displayed: 1 };
    state.coins = 321;
    state.owned.push('growLights');
    state.tools.lantern = 1;
    state.clock.totalMinutes = 1234;

    saveGame(state);
    const loaded = loadGame();

    expect(loaded).not.toBeNull();
    expect(loaded!.basket[0].variantId).toBe('neon');
    expect(loaded!.plants.a.location).toEqual({ kind: 'display', slotId: 'stand1', potId: 'copper' });
    expect(loaded!.plants.b.location).toEqual({ kind: 'wild', x: 55.2, y: 14.1, zone: 'dampForest' });
    expect(loaded!.plants.c.growth).toBe(10);
    expect(loaded!.collection.monstera.variants).toEqual(['deliciosa', 'albo']);
    expect(loaded!.coins).toBe(321);
    expect(loaded!.owned).toContain('growLights');
    expect(loaded!.tools.lantern).toBe(1);
    expect(loaded!.clock.totalMinutes).toBe(1234);
  });

  it('drops anything referring to a species this build does not know, instead of breaking', () => {
    const state = createNewGame();
    state.plants.x = { id: 'x', defId: 'noSuchPlant', variantId: 'v', seed: 1, growth: 0, location: { kind: 'nursery', bedId: 'bed1' }, plantedAt: 0, lastCuttingAt: null, generation: 0, bornWild: false };
    state.basket.push({ uid: 'u', defId: 'bluebell', variantId: 'v', seed: 1, growth: 0, generation: 0, origin: 'wild', collectedAt: 0 });
    const migrated = migrateSave(JSON.parse(JSON.stringify(state)))!;
    expect(migrated.plants.x).toBeUndefined();
    expect(migrated.basket).toHaveLength(0);
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
    addToBasket(state, { defId: 'pothos', variantId: 'golden', seed: 1, growth: 0, generation: 0, origin: 'wild', collectedAt: 0 });
    saveGame(state);
    const reset = resetGame();
    expect(reset.basket.length).toBe(0);
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

  it("recovers an older build's save from its legacy key, keeping the world and its lantern", () => {
    const old = legacyV3Save() as ReturnType<typeof legacyV3Save> & Record<string, unknown>;
    // The old wildflower-and-ecosystem game's data: species that no longer exist.
    old.journal = { bluebell: { specimenId: 'bluebell', kind: 'plant', level: 'CULTIVATED' } };
    old.inventory = [{ uid: 'x', defId: 'bluebell', kind: 'plant', count: 1 }];
    old.tools = { basket: 2, shears: 1, lantern: 1 };
    (old.clock as { totalMinutes: number }).totalMinutes = 7777;
    localStorage.setItem('foxtrot-save-v3', JSON.stringify(old));

    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(SAVE_VERSION);
    expect(loaded!.clock.totalMinutes).toBe(7777);
    expect(loaded!.tools).toEqual({ lantern: 1 });
    expect(loaded!.basket).toEqual([]);
    expect(loaded!.coins).toBeGreaterThan(0);
    expect('journal' in (loaded as unknown as Record<string, unknown>)).toBe(false);
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
