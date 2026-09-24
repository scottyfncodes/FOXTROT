import type { GameState, WeatherCondition } from '../state';

// Pacing: 2 game-minutes pass per real second, so a full day/night cycle
// (1440 game-minutes) takes 12 real minutes — enough for weather and
// day/night to visibly shift within a single play session, and enough that
// coming back later always shows a changed world.
export const GAME_MINUTES_PER_REAL_SECOND = 2;
export const MINUTES_PER_DAY = 1440;
// Cap how much time we simulate for a single "welcome back" catch-up so an
// abandoned tab doesn't spin the world through weeks of growth at once.
export const OFFLINE_CAP_MINUTES = 3 * MINUTES_PER_DAY;

export const DAWN = 5 * 60;
export const DUSK = 20 * 60;

export function minuteOfDay(totalMinutes: number): number {
  return ((totalMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

export function isNight(totalMinutes: number): boolean {
  const m = minuteOfDay(totalMinutes);
  return m < DAWN || m >= DUSK;
}

/** 0 = full night, 1 = full day, smoothly blended through dawn/dusk. */
export function daylightFactor(totalMinutes: number): number {
  const m = minuteOfDay(totalMinutes);
  const fade = 90;
  if (m < DAWN - fade || m >= DUSK + fade) return 0;
  if (m < DAWN + fade) return clamp01((m - (DAWN - fade)) / (fade * 2));
  if (m < DUSK - fade) return 1;
  return clamp01(1 - (m - (DUSK - fade)) / (fade * 2));
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

const WEATHER_WEIGHTS: [WeatherCondition, number][] = [
  ['clear', 0.55],
  ['overcast', 0.25],
  ['rain', 0.2],
];

function rollWeather(rand: () => number): WeatherCondition {
  const total = WEATHER_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [cond, w] of WEATHER_WEIGHTS) {
    if (r < w) return cond;
    r -= w;
  }
  return 'clear';
}

export interface ClockAdvanceResult {
  elapsedMinutes: number;
  wasOffline: boolean;
  weatherChanged: boolean;
}

/**
 * Advances the game clock from the last recorded real timestamp to `nowMs`,
 * updating weather along the way. Safe to call every frame (small deltas)
 * and once on load (large "offline" delta).
 */
export function advanceClock(state: GameState, nowMs: number, rand: () => number = Math.random): ClockAdvanceResult {
  const realDeltaMs = Math.max(0, nowMs - state.clock.lastRealTimestamp);
  const wasOffline = realDeltaMs > 60_000;
  let elapsedMinutes = (realDeltaMs / 1000) * GAME_MINUTES_PER_REAL_SECOND;
  if (wasOffline) {
    elapsedMinutes = Math.min(elapsedMinutes, OFFLINE_CAP_MINUTES);
  }
  state.clock.totalMinutes += elapsedMinutes;
  state.clock.lastRealTimestamp = nowMs;

  let weatherChanged = false;
  let guard = 0;
  while (state.clock.totalMinutes >= state.weather.nextChangeAt && guard < 64) {
    guard += 1;
    const next = rollWeather(rand);
    state.weather.condition = next;
    const duration = 90 + rand() * 180;
    state.weather.nextChangeAt = state.weather.nextChangeAt + duration;
    weatherChanged = true;
  }
  // If we jumped far ahead (offline), make sure nextChangeAt is back in the future.
  if (state.weather.nextChangeAt < state.clock.totalMinutes) {
    state.weather.nextChangeAt = state.clock.totalMinutes + 60 + rand() * 120;
  }

  return { elapsedMinutes, wasOffline, weatherChanged };
}
