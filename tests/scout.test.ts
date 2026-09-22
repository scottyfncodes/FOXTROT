import { describe, it, expect } from 'vitest';
import { tickScout } from '../src/game/systems/scout';
import { createNewGame } from '../src/game/state';

function baseCtx(overrides: Partial<Parameters<typeof tickScout>[1]> = {}) {
  return {
    playerX: 10,
    playerY: 10,
    playerFacing: 'down' as const,
    playerMoving: false,
    dtSeconds: 1,
    now: 100,
    nearbyUndiscovered: null,
    rand: () => 0.5,
    ...overrides,
  };
}

/** Runs enough "Ellen is walking" ticks that Scout settles into his trailing spot. */
function settleBehindEllen(scout: Parameters<typeof tickScout>[0], playerX = 10, playerY = 10, now = 100) {
  for (let i = 0; i < 10; i++) {
    tickScout(scout, baseCtx({ playerX, playerY, playerMoving: true, now: now + i }));
  }
}

describe('Scout companion behavior', () => {
  it('closes the distance when far behind a moving Ellen', () => {
    const state = createNewGame();
    state.scout.x = 0;
    state.scout.y = 0;
    const before = { x: state.scout.x, y: state.scout.y };
    tickScout(state.scout, baseCtx({ playerX: 10, playerY: 10, playerMoving: true }));
    const after = { x: state.scout.x, y: state.scout.y };
    const movedToward = Math.hypot(10 - after.x, 10 - after.y) < Math.hypot(10 - before.x, 10 - before.y);
    expect(movedToward).toBe(true);
    expect(state.scout.behavior).toBe('following');
  });

  it('settles near Ellen rather than stacking exactly on top of her', () => {
    const state = createNewGame();
    state.scout.x = 10;
    state.scout.y = 10;
    settleBehindEllen(state.scout);
    const distToEllen = Math.hypot(state.scout.x - 10, state.scout.y - 10);
    expect(distToEllen).toBeGreaterThan(0.2);
    expect(distToEllen).toBeLessThan(1.5);
  });

  it('can settle into an idle behavior once close and Ellen has stopped', () => {
    const state = createNewGame();
    state.scout.x = 10;
    state.scout.y = 10;
    settleBehindEllen(state.scout);
    state.scout.nextEventAt = 50; // already due for a decision
    // rand() < IDLE_START_CHANCE (0.55) triggers an idle behavior.
    tickScout(state.scout, baseCtx({ playerX: 10, playerY: 10, playerMoving: false, now: 200, rand: () => 0.1 }));
    expect(['idleSit', 'idleSniff', 'idleLook']).toContain(state.scout.behavior);
  });

  it('resumes following the instant Ellen starts moving again, even mid-idle', () => {
    const state = createNewGame();
    state.scout.behavior = 'idleSit';
    state.scout.nextEventAt = 9999; // idle would otherwise hold for a long time
    tickScout(state.scout, baseCtx({ playerMoving: true, now: 100 }));
    expect(state.scout.behavior).toBe('following');
  });

  it('turns to face something undiscovered nearby rather than always idling blindly', () => {
    const state = createNewGame();
    state.scout.x = 10;
    state.scout.y = 10;
    settleBehindEllen(state.scout);
    state.scout.nextEventAt = 50;
    tickScout(
      state.scout,
      baseCtx({
        playerX: 10,
        playerY: 10,
        playerMoving: false,
        now: 200,
        nearbyUndiscovered: { x: 15, y: 10 },
        rand: () => 0.1, // < 0.7 notice chance
      })
    );
    expect(state.scout.behavior).toBe('noticing');
    expect(state.scout.facing).toBe('right');
  });

  it('is a pure function of its inputs (deterministic given the same context)', () => {
    const a = createNewGame().scout;
    const b = createNewGame().scout;
    const ctx = baseCtx({ playerMoving: true });
    tickScout(a, ctx);
    tickScout(b, ctx);
    expect(a).toEqual(b);
  });
});
