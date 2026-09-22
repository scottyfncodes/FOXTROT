import { describe, it, expect } from 'vitest';
import { tickTheo } from '../src/game/systems/theo';
import { THEO_SPOTS, findTheoSpot } from '../src/game/data/theoSpots';
import { createNewGame } from '../src/game/state';

describe('Theo (ambient NPC)', () => {
  it('starts already settled into an activity at his starting spot', () => {
    const state = createNewGame();
    expect(state.theo.activity).not.toBe('traveling');
    expect(state.theo.currentSpotId).toBeTruthy();
  });

  it('stays put until his current activity\'s time is up', () => {
    const state = createNewGame();
    state.theo.nextChangeAt = 9999;
    const before = { x: state.theo.x, y: state.theo.y, activity: state.theo.activity };
    tickTheo(state.theo, { dtSeconds: 1, now: 100, rand: () => 0.3 });
    expect(state.theo).toMatchObject(before);
  });

  it('heads toward a new spot once his time is up, and eventually settles into that spot\'s activity', () => {
    const state = createNewGame();
    state.theo.x = 5;
    state.theo.y = 7;
    state.theo.zone = 'greenhouse';
    state.theo.nextChangeAt = 0; // already due
    tickTheo(state.theo, { dtSeconds: 1, now: 100, rand: () => 0.5 });
    expect(state.theo.activity).toBe('traveling');
    const target = findTheoSpot(state.theo.targetSpotId)!;
    expect(target).toBeTruthy();

    // Walk him all the way there.
    let guard = 0;
    while (state.theo.activity === 'traveling' && guard < 500) {
      tickTheo(state.theo, { dtSeconds: 1, now: 100 + guard, rand: () => 0.5 });
      guard++;
    }
    expect(guard).toBeLessThan(500);
    expect(state.theo.currentSpotId).toBe(target.id);
    const expectedActivity = target.kind === 'tinker' ? 'tinkering' : target.kind === 'nap' ? 'napping' : 'snacking';
    expect(state.theo.activity).toBe(expectedActivity);
    expect(Math.hypot(state.theo.x - target.x, state.theo.y - target.y)).toBeLessThan(0.5);
  });

  it('teleports across the indoor/outdoor boundary rather than trying to walk through a wall', () => {
    const state = createNewGame();
    // Force his next target to be an outdoor spot while he's indoors.
    const outdoorSpot = THEO_SPOTS.find((s) => s.zone !== 'greenhouse')!;
    const indoorIndex = THEO_SPOTS.findIndex((s) => s.zone === 'greenhouse');
    state.theo.zone = 'greenhouse';
    state.theo.currentSpotId = THEO_SPOTS[indoorIndex].id;
    state.theo.x = THEO_SPOTS[indoorIndex].x;
    state.theo.y = THEO_SPOTS[indoorIndex].y;
    state.theo.nextChangeAt = 0;
    // Bias rand toward picking the outdoor spot: keep rolling until we land on it,
    // since spot order/selection is randomized — deterministic rand that always
    // returns the index of our chosen outdoor spot.
    const options = THEO_SPOTS.filter((s) => s.id !== state.theo.currentSpotId);
    const idx = options.findIndex((s) => s.id === outdoorSpot.id);
    tickTheo(state.theo, { dtSeconds: 1, now: 100, rand: () => (idx + 0.5) / options.length });
    expect(state.theo.zone).toBe(outdoorSpot.zone);
    expect(state.theo.x).toBe(outdoorSpot.x);
    expect(state.theo.y).toBe(outdoorSpot.y);
  });

  it('never picks his own current spot as the next destination', () => {
    const state = createNewGame();
    state.theo.currentSpotId = THEO_SPOTS[0].id;
    state.theo.nextChangeAt = 0;
    for (let trial = 0; trial < 20; trial++) {
      state.theo.activity = 'tinkering';
      state.theo.currentSpotId = THEO_SPOTS[0].id;
      state.theo.nextChangeAt = 0;
      tickTheo(state.theo, { dtSeconds: 1, now: 100, rand: () => trial / 20 });
      expect(state.theo.targetSpotId).not.toBe(THEO_SPOTS[0].id);
    }
  });
});
