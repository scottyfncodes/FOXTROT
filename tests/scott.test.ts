import { describe, it, expect } from 'vitest';
import { tickScott, ACTIVITY_FOR_KIND } from '../src/game/systems/scott';
import { SCOTT_SPOTS, findScottSpot } from '../src/game/data/scottSpots';
import { createNewGame } from '../src/game/state';
import { generateObstacles, buildBlockingSet } from '../src/game/world/Obstacles';
import { zoneAt } from '../src/game/data/worldMap';

describe('Scott (ambient NPC)', () => {
  it('starts already settled into an activity at his starting spot', () => {
    const state = createNewGame();
    expect(state.scott.activity).not.toBe('traveling');
    expect(state.scott.currentSpotId).toBeTruthy();
  });

  it('stays put until his current activity\'s time is up', () => {
    const state = createNewGame();
    state.scott.nextChangeAt = 9999;
    const before = { x: state.scott.x, y: state.scott.y, activity: state.scott.activity };
    tickScott(state.scott, { dtSeconds: 1, now: 100, rand: () => 0.3 });
    expect(state.scott).toMatchObject(before);
  });

  it('heads toward a new spot once his time is up, and eventually settles into that spot\'s activity', () => {
    const state = createNewGame();
    state.scott.x = 5;
    state.scott.y = 7;
    state.scott.zone = 'greenhouse';
    state.scott.nextChangeAt = 0; // already due
    tickScott(state.scott, { dtSeconds: 1, now: 100, rand: () => 0.5 });
    expect(state.scott.activity).toBe('traveling');
    const target = findScottSpot(state.scott.targetSpotId)!;
    expect(target).toBeTruthy();

    // Walk him all the way there.
    let guard = 0;
    while (state.scott.activity === 'traveling' && guard < 500) {
      tickScott(state.scott, { dtSeconds: 1, now: 100 + guard, rand: () => 0.5 });
      guard++;
    }
    expect(guard).toBeLessThan(500);
    expect(state.scott.currentSpotId).toBe(target.id);
    expect(state.scott.activity).toBe(ACTIVITY_FOR_KIND[target.kind]);
    expect(Math.hypot(state.scott.x - target.x, state.scott.y - target.y)).toBeLessThan(0.5);
  });

  it('teleports across the indoor/outdoor boundary rather than trying to walk through a wall', () => {
    const state = createNewGame();
    // Force his next target to be an outdoor spot while he's indoors.
    const outdoorSpot = SCOTT_SPOTS.find((s) => s.zone !== 'greenhouse')!;
    const indoorIndex = SCOTT_SPOTS.findIndex((s) => s.zone === 'greenhouse');
    state.scott.zone = 'greenhouse';
    state.scott.currentSpotId = SCOTT_SPOTS[indoorIndex].id;
    state.scott.x = SCOTT_SPOTS[indoorIndex].x;
    state.scott.y = SCOTT_SPOTS[indoorIndex].y;
    state.scott.nextChangeAt = 0;
    // Bias rand toward picking the outdoor spot: keep rolling until we land on it,
    // since spot order/selection is randomized — deterministic rand that always
    // returns the index of our chosen outdoor spot.
    const options = SCOTT_SPOTS.filter((s) => s.id !== state.scott.currentSpotId);
    const idx = options.findIndex((s) => s.id === outdoorSpot.id);
    tickScott(state.scott, { dtSeconds: 1, now: 100, rand: () => (idx + 0.5) / options.length });
    expect(state.scott.zone).toBe(outdoorSpot.zone);
    expect(state.scott.x).toBe(outdoorSpot.x);
    expect(state.scott.y).toBe(outdoorSpot.y);
  });

  it('never picks his own current spot as the next destination', () => {
    const state = createNewGame();
    state.scott.currentSpotId = SCOTT_SPOTS[0].id;
    state.scott.nextChangeAt = 0;
    for (let trial = 0; trial < 20; trial++) {
      state.scott.activity = 'tinkering';
      state.scott.currentSpotId = SCOTT_SPOTS[0].id;
      state.scott.nextChangeAt = 0;
      tickScott(state.scott, { dtSeconds: 1, now: 100, rand: () => trial / 20 });
      expect(state.scott.targetSpotId).not.toBe(SCOTT_SPOTS[0].id);
    }
  });

  it('has a driving range and a putting green, and every outdoor spot is on open ground in its own region', () => {
    expect(SCOTT_SPOTS.some((s) => s.kind === 'golf')).toBe(true);
    expect(SCOTT_SPOTS.some((s) => s.kind === 'putt')).toBe(true);
    const blocked = buildBlockingSet(generateObstacles());
    for (const spot of SCOTT_SPOTS.filter((s) => s.zone !== 'greenhouse')) {
      expect(zoneAt(spot.x, spot.y)).toBe(spot.zone);
      expect(blocked.has(`${spot.x},${spot.y}`)).toBe(false);
    }
  });

  it('settles into golfing or putting at those spots, lining up side-on to putt', () => {
    const state = createNewGame();
    const green = SCOTT_SPOTS.find((s) => s.kind === 'putt')!;
    Object.assign(state.scott, { zone: green.zone, x: green.x, y: green.y, activity: 'traveling', targetSpotId: green.id });
    tickScott(state.scott, { dtSeconds: 1, now: 100, rand: () => 0.5 });
    expect(state.scott.activity).toBe('putting');
    expect(state.scott.facing).toBe('right');
  });
});
