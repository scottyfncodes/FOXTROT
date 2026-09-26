import { describe, it, expect } from 'vitest';
import { createNewGame } from '../src/game/state';
import { GREENHOUSE_PLAY_AREA, endPlay, startPlay, tickPlay, type PlayState } from '../src/game/systems/play';
import { roomAt } from '../src/game/data/interior';

function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function setup(seed = 1) {
  const state = createNewGame();
  Object.assign(state.scout, { x: 5, y: 6, behavior: 'following' });
  Object.assign(state.cat, { x: 12, y: 5, activity: 'sitting', currentSpotId: 'sunny-perch' });
  const rand = rng(seed);
  return { state, rand, play: startPlay(rand) };
}

function run(play: PlayState, state: ReturnType<typeof createNewGame>, rand: () => number, seconds: number, onStep?: () => void) {
  for (let t = 0; t < seconds; t += 1 / 60) {
    tickPlay(play, state.scout, state.cat, { dtSeconds: 1 / 60, rand });
    onStep?.();
  }
}

describe('Scout and the cat at play', () => {
  it('keeps catching each other and swapping who hunts', () => {
    const { state, rand, play } = setup();
    const chasers = new Set<string>();
    run(play, state, rand, 120, () => chasers.add(play.chaser));
    expect(play.tags).toBeGreaterThan(6);
    expect(chasers).toEqual(new Set(['cat', 'scout']));
  });

  it('never catches again the instant after a catch: every chase is a real one', () => {
    const { state, rand, play } = setup(11);
    let t = 0;
    let lastTag = -Infinity;
    let tags = 0;
    run(play, state, rand, 120, () => {
      t += 1 / 60;
      if (play.tags > tags) {
        tags = play.tags;
        expect(t - lastTag).toBeGreaterThan(1.5);
        lastTag = t;
      }
    });
    expect(tags).toBeGreaterThan(6);
  });

  it('stays in the greenhouse, running all over it', () => {
    const { state, rand, play } = setup(7);
    const a = GREENHOUSE_PLAY_AREA;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    run(play, state, rand, 120, () => {
      for (const b of [state.scout, state.cat]) {
        expect(roomAt(b.x)).toBe('greenhouse');
        expect(b.x).toBeGreaterThan(a.minX - 0.6);
        expect(b.x).toBeLessThan(a.maxX + 0.6);
        expect(b.y).toBeGreaterThan(a.minY - 0.6);
        expect(b.y).toBeLessThan(a.maxY + 0.6);
        minX = Math.min(minX, b.x); maxX = Math.max(maxX, b.x); minY = Math.min(minY, b.y); maxY = Math.max(maxY, b.y);
      }
    });
    // They cover the room, not one corner of it.
    expect(maxX - minX).toBeGreaterThan(6);
    expect(maxY - minY).toBeGreaterThan(4);
  });

  it('stalks first: the quarry carries on, the hunter creeps in', () => {
    const { state, rand, play } = setup(3);
    Object.assign(play, { chaser: 'cat', phase: 'stalk', timer: 3 });
    const scoutAt = { x: state.scout.x, y: state.scout.y };
    const d0 = Math.hypot(state.cat.x - state.scout.x, state.cat.y - state.scout.y);
    run(play, state, rand, 2);
    expect(play.phase).toBe('stalk');
    expect(state.scout).toMatchObject(scoutAt);
    expect(state.scout.behavior).toBe('idleSniff');
    expect(Math.hypot(state.cat.x - state.scout.x, state.cat.y - state.scout.y)).toBeLessThan(d0);
  });

  it('brings the cat in from the living room, through the doorway', () => {
    const { state, rand, play } = setup(5);
    Object.assign(state.cat, { x: 23, y: 5 });
    let crossedAt: number | null = null;
    run(play, state, rand, 30, () => {
      if (crossedAt === null && roomAt(state.cat.x) === 'greenhouse') crossedAt = state.cat.y;
    });
    expect(crossedAt).not.toBeNull();
    // The doorway is rows 7–8 of the wall between the rooms.
    expect(crossedAt!).toBeGreaterThan(6.5);
    expect(crossedAt!).toBeLessThan(9.5);
  });

  it('ends cleanly: Scout back to Ellen, the cat back to her own business', () => {
    const { state, rand, play } = setup();
    run(play, state, rand, 5);
    endPlay(state.scout, state.cat, 123);
    expect(state.scout.behavior).toBe('following');
    expect(state.cat.activity).toBe('sitting');
    expect(state.cat.nextChangeAt).toBe(123);
  });
});
