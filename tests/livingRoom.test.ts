import { describe, it, expect, beforeEach } from 'vitest';
import { createNewGame } from '../src/game/state';
import { LIVING_FIXTURES, PUTTING_CUP_OFFSET } from '../src/game/data/interior';
import {
  allFurniture,
  findFurniture,
  footprint,
  fixtureOffset,
  moveFurniture,
  pickUpFurniture,
  placeFurniture,
  puttingCup,
} from '../src/game/systems/furniture';
import { indoorSolids, isBlockedIndoor } from '../src/game/world/Collision';
import { tickCat } from '../src/game/systems/cat';
import { tickScott } from '../src/game/systems/scott';
import { findCatSpot } from '../src/game/data/catSpots';
import { findScottSpot } from '../src/game/data/scottSpots';
import { loadGame, saveGame, migrateSave } from '../src/game/engine/SaveManager';

describe('living-room furniture', () => {
  beforeEach(() => localStorage.clear());

  it('stands exactly where the layout puts it until it is moved', () => {
    const state = createNewGame();
    for (const f of LIVING_FIXTURES) {
      const piece = findFurniture(state, f.id)!;
      expect(piece, f.id).toBeDefined();
      const fp = footprint(piece.kind, piece.x, piece.y);
      expect(fp.x).toBeCloseTo(f.x, 6);
      expect(fp.y).toBeCloseTo(f.y, 6);
      expect(fp.w).toBeCloseTo(f.w, 6);
      expect(fp.h).toBeCloseTo(f.h, 6);
    }
  });

  it('can be moved, but never put away', () => {
    const state = createNewGame();
    const bed = findFurniture(state, 'lr-catbed')!;
    expect(moveFurniture(state, 'lr-catbed', bed.x - 5, bed.y + 0.5)).toBe(true);
    expect(findFurniture(state, 'lr-catbed')!.x).toBeCloseTo(bed.x - 5, 6);
    expect(fixtureOffset(state, 'lr-catbed')).toEqual({ dx: -5, dy: 0.5 });
    expect(pickUpFurniture(state, 'lr-catbed')).toBe(false);
    expect(pickUpFurniture(state, 'lr-couch')).toBe(false);
    expect(allFurniture(state).filter((f) => f.id === 'lr-catbed')).toHaveLength(1);
  });

  it('keeps the couch solid wherever it goes', () => {
    const state = createNewGame();
    const couch = findFurniture(state, 'lr-couch')!;
    const before = footprint(couch.kind, couch.x, couch.y);
    const inside = { x: before.x + before.w / 2, y: before.y + before.h / 2 };
    expect(isBlockedIndoor(inside.x, inside.y, indoorSolids(state))).toBe(true);
    expect(moveFurniture(state, 'lr-couch', couch.x, couch.y + 1.6)).toBe(true);
    expect(isBlockedIndoor(inside.x, inside.y, indoorSolids(state))).toBe(false);
    expect(isBlockedIndoor(inside.x, inside.y + 1.6, indoorSolids(state))).toBe(true);
  });

  it('keeps the cat bed and the putting mat clear of other furniture', () => {
    const state = createNewGame();
    state.furnitureStock = { plantStand: 1 };
    const bed = findFurniture(state, 'lr-catbed')!;
    expect(placeFurniture(state, 'plantStand', bed.x, bed.y)).toBeNull();
    // …and the bed itself can't be dragged under the couch.
    const couch = findFurniture(state, 'lr-couch')!;
    expect(moveFurniture(state, 'lr-catbed', couch.x, couch.y)).toBe(false);
    // A rug, though, goes anywhere.
    const rug = findFurniture(state, 'lr-rug')!;
    expect(moveFurniture(state, 'lr-rug', rug.x - 0.5, rug.y + 2)).toBe(true);
  });

  it('takes the cup with the putting mat', () => {
    const state = createNewGame();
    const mat = LIVING_FIXTURES.find((f) => f.id === 'lr-putting')!;
    expect(puttingCup(state)).toEqual({ x: mat.x + PUTTING_CUP_OFFSET.x, y: mat.y + PUTTING_CUP_OFFSET.y });
    const piece = findFurniture(state, 'lr-putting')!;
    expect(moveFurniture(state, 'lr-putting', piece.x, piece.y - 1)).toBe(true);
    expect(puttingCup(state).y).toBeCloseTo(mat.y + PUTTING_CUP_OFFSET.y - 1, 6);
  });

  it('carries the cat along when her bed is moved, and sends her to its new spot', () => {
    const state = createNewGame();
    const spot = findCatSpot('cat-bed')!;
    Object.assign(state.cat, { activity: 'sleeping', currentSpotId: 'cat-bed', x: spot.x, y: spot.y, nextChangeAt: 1e9 });
    const bed = findFurniture(state, 'lr-catbed')!;
    moveFurniture(state, 'lr-catbed', bed.x - 4, bed.y + 1);
    const offset = (id: string) => fixtureOffset(state, id);
    tickCat(state.cat, { dtSeconds: 0.016, now: 0, rand: () => 0.5, offset });
    expect(state.cat.x).toBeCloseTo(spot.x - 4, 6);
    expect(state.cat.y).toBeCloseTo(spot.y + 1, 6);

    // Walking to her bed later, she heads for where it is now.
    Object.assign(state.cat, { activity: 'wandering', currentSpotId: null, targetSpotId: 'cat-bed', targetX: null, targetY: null, x: spot.x - 4, y: spot.y + 1.1 });
    tickCat(state.cat, { dtSeconds: 0.016, now: 0, rand: () => 0.5, offset });
    expect(state.cat.currentSpotId).toBe('cat-bed');
  });

  it('seats Scott on the couch wherever it ends up', () => {
    const state = createNewGame();
    const spot = findScottSpot('living-couch-tv')!;
    Object.assign(state.scott, { zone: 'greenhouse', activity: 'watchingTV', currentSpotId: spot.id, x: spot.x, y: spot.y, nextChangeAt: 1e9 });
    const couch = findFurniture(state, 'lr-couch')!;
    moveFurniture(state, 'lr-couch', couch.x, couch.y + 1.5);
    tickScott(state.scott, { dtSeconds: 0.016, now: 0, rand: () => 0.5, offset: (id) => fixtureOffset(state, id) });
    expect(state.scott.y).toBeCloseTo(spot.y + 1.5, 6);
  });

  it('remembers where things were moved to across a save', () => {
    const state = createNewGame();
    const bed = findFurniture(state, 'lr-catbed')!;
    moveFurniture(state, 'lr-catbed', bed.x - 3, bed.y);
    saveGame(state);
    const loaded = loadGame()!;
    expect(findFurniture(loaded, 'lr-catbed')!.x).toBeCloseTo(bed.x - 3, 6);
  });

  it('gives an older save the putting record it never had', () => {
    const old = JSON.parse(JSON.stringify(createNewGame()));
    delete old.putting;
    const migrated = migrateSave(old)!;
    expect(migrated.putting).toEqual({ rounds: 0, best: null, aces: [] });
  });
});

describe("the greenhouse's own furniture", () => {
  it("moves Scout's bed and Ellen's desk like anything else, but never puts them away", () => {
    const state = createNewGame();
    for (const id of ['scoutBed', 'ellenDesk']) {
      const piece = findFurniture(state, id)!;
      expect(piece, id).toBeDefined();
      expect(moveFurniture(state, id, piece.x - 2, piece.y - 1.5)).toBe(true);
      expect(findFurniture(state, id)!.x).toBeCloseTo(piece.x - 2, 6);
      expect(pickUpFurniture(state, id)).toBe(false);
    }
  });

  it("keeps Scout's bed clear of other furniture", () => {
    const state = createNewGame();
    state.furnitureStock = { plantStand: 1 };
    const bed = findFurniture(state, 'scoutBed')!;
    expect(placeFurniture(state, 'plantStand', bed.x, bed.y)).toBeNull();
  });

  it('leaves the old spot walkable once the desk has moved', () => {
    const state = createNewGame();
    const desk = findFurniture(state, 'ellenDesk')!;
    const fp = footprint(desk.kind, desk.x, desk.y);
    const inside = { x: fp.x + fp.w / 2, y: fp.y + fp.h / 2 };
    expect(isBlockedIndoor(inside.x, inside.y, indoorSolids(state))).toBe(true);
    expect(moveFurniture(state, 'ellenDesk', desk.x - 3, desk.y - 2)).toBe(true);
    expect(isBlockedIndoor(inside.x, inside.y, indoorSolids(state))).toBe(false);
  });
});
