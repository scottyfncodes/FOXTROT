import { describe, it, expect } from 'vitest';
import { createNewGame } from '../src/game/state';
import { tickFox } from '../src/game/systems/fox';
import { DISCOVERY_SPOTS } from '../src/game/data/discoveryPoints';

describe('fox behavior', () => {
  it('stays invisible while the player is inside the greenhouse', () => {
    const state = createNewGame();
    state.fox.visible = true;
    tickFox(state, {
      playerZone: 'meadow',
      playerX: 10,
      playerY: 10,
      inGreenhouse: true,
      dtSeconds: 1,
      now: state.clock.totalMinutes,
      discoveryPoints: DISCOVERY_SPOTS,
      rand: () => 0.5,
    });
    expect(state.fox.visible).toBe(false);
  });

  it('eventually starts a leading or wandering sequence once its cooldown has passed', () => {
    const state = createNewGame();
    state.fox.behavior = 'idle';
    state.fox.nextEventAt = 0;
    tickFox(state, {
      playerZone: 'woodland',
      playerX: 10,
      playerY: 10,
      inGreenhouse: false,
      dtSeconds: 1,
      now: 100,
      discoveryPoints: DISCOVERY_SPOTS,
      rand: () => 0.1, // < 0.65 so it chooses to lead if a candidate exists
    });
    expect(['leading', 'wandering']).toContain(state.fox.behavior);
    expect(state.fox.visible).toBe(true);
  });

  it('reveals a fox-led patch once the fox arrives at it', () => {
    const state = createNewGame();
    const target = DISCOVERY_SPOTS.find((d) => d.id === 'sp-over-fox')!;
    state.fox.behavior = 'leading';
    state.fox.targetDiscoveryId = target.id;
    state.fox.x = target.x + 0.01;
    state.fox.y = target.y;
    state.fox.zone = target.zone;
    expect(state.spots[target.id]?.revealed).toBeFalsy();

    const result = tickFox(state, {
      playerZone: target.zone,
      playerX: target.x,
      playerY: target.y,
      inGreenhouse: false,
      dtSeconds: 0.1,
      now: state.clock.totalMinutes,
      discoveryPoints: DISCOVERY_SPOTS,
      rand: () => 0.5,
    });

    expect(result.revealedDiscoveryId).toBe(target.id);
    expect(state.spots[target.id]?.revealed).toBe(true);
    expect(state.fox.behavior).toBe('paused');
  });

  it('sometimes wanders without leading anywhere in particular', () => {
    const state = createNewGame();
    state.fox.behavior = 'idle';
    state.fox.nextEventAt = 0;
    // rand > 0.65 means "don't lead" on the decision roll.
    tickFox(state, {
      playerZone: 'meadow',
      playerX: 66,
      playerY: 30,
      inGreenhouse: false,
      dtSeconds: 1,
      now: 0,
      discoveryPoints: DISCOVERY_SPOTS,
      rand: () => 0.9,
    });
    expect(state.fox.behavior).toBe('wandering');
    expect(state.fox.targetDiscoveryId).toBeNull();
  });
});
