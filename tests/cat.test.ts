import { describe, it, expect } from 'vitest';
import { tickCat } from '../src/game/systems/cat';
import { CAT_SPOTS, findCatSpot } from '../src/game/data/catSpots';
import { createNewGame } from '../src/game/state';

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

  it('never wanders outside the greenhouse grid bounds', () => {
    const state = createNewGame();
    for (const spot of CAT_SPOTS) {
      expect(spot.x).toBeGreaterThan(0);
      expect(spot.y).toBeGreaterThan(0);
      expect(spot.x).toBeLessThan(18); // GREENHOUSE_GRID_W
      expect(spot.y).toBeLessThan(12); // GREENHOUSE_GRID_H
    }
  });
});
