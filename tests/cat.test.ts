import { describe, it, expect } from 'vitest';
import { tickCat } from '../src/game/systems/cat';
import { CAT_SPOTS, findCatSpot } from '../src/game/data/catSpots';
import { createNewGame } from '../src/game/state';
import { INTERIOR_H, INTERIOR_W, PARTITION_DOOR_YS, isInteriorWallTile, roomAt } from '../src/game/data/interior';
import { catLift } from '../src/game/systems/cat';

describe('greenhouse cat (ambient NPC)', () => {
  it('starts already settled into an activity at her starting spot', () => {
    const state = createNewGame();
    expect(state.cat.activity).not.toBe('wandering');
    expect(state.cat.currentSpotId).toBeTruthy();
  });

  it('stays put until her current activity\'s time is up', () => {
    const state = createNewGame();
    state.cat.nextChangeAt = 9999;
    const before = { x: state.cat.x, y: state.cat.y, activity: state.cat.activity };
    tickCat(state.cat, { dtSeconds: 1, now: 100, rand: () => 0.3 });
    expect(state.cat).toMatchObject(before);
  });

  it('heads toward a new spot once her time is up, and eventually settles into that spot\'s activity', () => {
    const state = createNewGame();
    state.cat.nextChangeAt = 0; // already due
    tickCat(state.cat, { dtSeconds: 1, now: 100, rand: () => 0.5 });
    expect(state.cat.activity).toBe('wandering');
    const target = findCatSpot(state.cat.targetSpotId)!;
    expect(target).toBeTruthy();

    let guard = 0;
    while (state.cat.activity === 'wandering' && guard < 500) {
      tickCat(state.cat, { dtSeconds: 1, now: 100 + guard, rand: () => 0.5 });
      guard++;
    }
    expect(guard).toBeLessThan(500);
    expect(state.cat.currentSpotId).toBe(target.id);
    const expectedActivity = target.kind === 'perch' ? 'sitting' : target.kind === 'sleep' ? 'sleeping' : 'grooming';
    expect(state.cat.activity).toBe(expectedActivity);
    expect(Math.hypot(state.cat.x - target.x, state.cat.y - target.y)).toBeLessThan(0.5);
  });

  it('never picks her own current spot as the next destination', () => {
    const state = createNewGame();
    for (let trial = 0; trial < 20; trial++) {
      state.cat.activity = 'sitting';
      state.cat.currentSpotId = CAT_SPOTS[0].id;
      state.cat.nextChangeAt = 0;
      tickCat(state.cat, { dtSeconds: 1, now: 100, rand: () => trial / 20 });
      expect(state.cat.targetSpotId).not.toBe(CAT_SPOTS[0].id);
    }
  });

  it('never wanders outside the house, and none of her spots are inside a wall', () => {
    for (const spot of CAT_SPOTS) {
      expect(spot.x).toBeGreaterThan(0);
      expect(spot.y).toBeGreaterThan(0);
      expect(spot.x).toBeLessThan(INTERIOR_W);
      expect(spot.y).toBeLessThan(INTERIOR_H);
      expect(isInteriorWallTile(Math.floor(spot.x), Math.floor(spot.y))).toBe(false);
    }
  });

  it('has places of her own in the living room as well as the greenhouse', () => {
    expect(CAT_SPOTS.some((s) => roomAt(s.x) === 'living' && s.kind === 'sleep')).toBe(true);
    expect(CAT_SPOTS.some((s) => roomAt(s.x) === 'greenhouse')).toBe(true);
    // A fresh game finds her asleep on the couch.
    expect(createNewGame().cat.currentSpotId).toBe('couch-nap');
  });

  it('walks through the doorway between rooms rather than through the wall', () => {
    const state = createNewGame();
    const cat = state.cat;
    cat.x = 4.5;
    cat.y = 2.5;
    cat.activity = 'wandering';
    cat.targetSpotId = 'cat-bed';
    let crossedAt: { x: number; y: number } | null = null;
    for (let i = 0; i < 400 && cat.activity === 'wandering'; i++) {
      const before = roomAt(cat.x);
      tickCat(cat, { dtSeconds: 0.1, now: 100, rand: () => 0.5 });
      if (before !== roomAt(cat.x)) crossedAt = { x: cat.x, y: cat.y };
      expect(isInteriorWallTile(Math.floor(cat.x), Math.floor(cat.y))).toBe(false);
    }
    expect(cat.currentSpotId).toBe('cat-bed');
    expect(crossedAt).not.toBeNull();
    expect(PARTITION_DOOR_YS).toContain(Math.floor(crossedAt!.y));
  });

  it('now and then goes to sniff at a plant, or tucks herself behind a big one', () => {
    const state = createNewGame();
    const cat = state.cat;
    cat.nextChangeAt = 0;
    const interests = [{ x: 10.5, y: 3.5, big: true }];
    tickCat(cat, { dtSeconds: 1, now: 100, rand: () => 0.1, interests });
    expect(cat.targetActivity).toBe('investigating');
    for (let i = 0; i < 300 && cat.activity === 'wandering'; i++) tickCat(cat, { dtSeconds: 0.2, now: 100, rand: () => 0.1, interests });
    expect(cat.activity).toBe('investigating');
    expect(Math.abs(cat.x - 10.5)).toBeLessThan(0.7);
    expect(cat.facing).toBe(cat.x < 10.5 ? 'right' : 'left');

    cat.nextChangeAt = 0;
    tickCat(cat, { dtSeconds: 1, now: 1000, rand: () => 0.25, interests });
    expect(cat.targetActivity).toBe('hiding');
    // Behind the plant: just above its base, so its leaves draw over her.
    expect(cat.targetY!).toBeLessThan(3.5);
  });

  it('may curl up in an empty propagation tray, raised a little off the floor', () => {
    const state = createNewGame();
    const cat = state.cat;
    cat.nextChangeAt = 0;
    const interests = [{ x: 6.5, y: 6.5, big: false, emptyTray: true }];
    tickCat(cat, { dtSeconds: 1, now: 100, rand: () => 0.34, interests });
    for (let i = 0; i < 300 && cat.activity === 'wandering'; i++) tickCat(cat, { dtSeconds: 0.2, now: 100, rand: () => 0.34, interests });
    expect(cat.activity).toBe('sleeping');
    expect(catLift(cat)).toBeGreaterThan(0);
  });
});
