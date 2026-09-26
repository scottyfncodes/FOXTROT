import { describe, it, expect } from 'vitest';
import { createNewGame } from '../src/game/state';
import {
  advanceClock,
  clockRate,
  gameMinutesFor,
  isNight,
  daylightFactor,
  rollWeather,
  weatherDuration,
  WEATHER_DURATION,
  DAY_RATE,
  NIGHT_RATE,
  MINUTES_PER_DAY,
  GAME_MINUTES_PER_REAL_SECOND,
} from '../src/game/engine/Clock';
import type { WeatherCondition } from '../src/game/state';

/** Small deterministic PRNG so the long-run numbers are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Real seconds spent in each part of one full day, walking the clock second by second. */
function oneDay() {
  let t = 0;
  let real = 0;
  let night = 0;
  let fullDay = 0;
  while (t < MINUTES_PER_DAY) {
    if (isNight(t)) night += 1;
    if (daylightFactor(t) === 1) fullDay += 1;
    t += gameMinutesFor(t, 1);
    real += 1;
  }
  return { real, night, fullDay };
}

describe('day and night pacing', () => {
  it('runs slowly by day and quickly by night, easing through dusk', () => {
    expect(clockRate(12 * 60)).toBe(DAY_RATE);
    expect(clockRate(2 * 60)).toBe(NIGHT_RATE);
    const dusk = clockRate(20 * 60);
    expect(dusk).toBeGreaterThan(DAY_RATE);
    expect(dusk).toBeLessThan(NIGHT_RATE);
  });

  it('keeps a full cycle about twelve real minutes, so growth per real hour is unchanged', () => {
    const { real } = oneDay();
    const nominal = MINUTES_PER_DAY / GAME_MINUTES_PER_REAL_SECOND;
    expect(real).toBeGreaterThan(nominal * 0.95);
    expect(real).toBeLessThan(nominal * 1.05);
  });

  it('makes sunny daytime the dominant state and night a short contrast', () => {
    const { real, night, fullDay } = oneDay();
    expect(night / real).toBeLessThan(0.22); // was 37.5% with an even clock
    expect(night / real).toBeGreaterThan(0.1); // …but night is still there
    expect(fullDay / real).toBeGreaterThan(0.65);
    // one unbroken stretch of full daylight lasts well over seven real minutes
    expect(fullDay).toBeGreaterThan(7 * 60);
  });

  it('advances by the day rate per frame at noon', () => {
    const state = createNewGame();
    state.clock.totalMinutes = 12 * 60;
    state.clock.lastRealTimestamp = 1_000_000;
    const r = advanceClock(state, 1_000_000 + 1000, () => 0.5);
    expect(r.elapsedMinutes).toBeCloseTo(DAY_RATE, 5);
    expect(r.wasOffline).toBe(false);
  });
});

describe('weather rhythm', () => {
  it('always returns to clear skies from rain, mostly from cloud', () => {
    const conds: WeatherCondition[] = [];
    for (let i = 0; i < 100; i++) conds.push(rollWeather('rain', () => i / 100));
    expect(conds.filter((c) => c === 'clear').length).toBeGreaterThanOrEqual(75);
    expect(conds).not.toContain('rain');
    for (let i = 0; i < 100; i++) expect(rollWeather('overcast', () => i / 100)).not.toBe('overcast');
  });

  it('lets clear spells last much longer than rain or cloud', () => {
    const [clearMin] = WEATHER_DURATION.clear;
    expect(clearMin).toBeGreaterThanOrEqual(WEATHER_DURATION.rain[1]);
    expect(clearMin).toBeGreaterThanOrEqual(WEATHER_DURATION.overcast[1]);
    expect(weatherDuration('clear', () => 0)).toBe(WEATHER_DURATION.clear[0]);
    expect(weatherDuration('rain', () => 1)).toBe(WEATHER_DURATION.rain[1]);
  });

  it('spends most of the time clear, with rain an occasional event — but never gone', () => {
    const state = createNewGame();
    const rand = mulberry32(7);
    const time: Record<WeatherCondition, number> = { clear: 0, overcast: 0, rain: 0 };
    const clearStretches: number[] = [];
    let stretch = 0;
    let t = state.clock.lastRealTimestamp;
    // ~40 real hours in 10-second steps
    for (let i = 0; i < 14_400; i++) {
      const before = state.weather.condition;
      t += 10_000;
      const r = advanceClock(state, t, rand);
      time[before] += r.elapsedMinutes;
      if (before === 'clear') stretch += 10;
      if (before === 'clear' && state.weather.condition !== 'clear') {
        clearStretches.push(stretch);
        stretch = 0;
      }
    }
    const total = time.clear + time.overcast + time.rain;
    expect(time.clear / total).toBeGreaterThan(0.72);
    expect(time.rain / total).toBeGreaterThan(0.03);
    expect(time.rain / total).toBeLessThan(0.15);
    expect(time.overcast / total).toBeGreaterThan(0.03);
    // Sunny spells are long: on average well over five real minutes of unbroken sun.
    const mean = clearStretches.reduce((a, b) => a + b, 0) / clearStretches.length;
    expect(mean).toBeGreaterThan(5 * 60);
  });

  it('never flips weather faster than its shortest spell', () => {
    const state = createNewGame();
    const rand = mulberry32(3);
    let t = state.clock.lastRealTimestamp;
    let lastChangeAt = state.clock.totalMinutes;
    const shortest = Math.min(...Object.values(WEATHER_DURATION).map(([min]) => min));
    for (let i = 0; i < 20_000; i++) {
      t += 5_000;
      if (advanceClock(state, t, rand).weatherChanged) {
        expect(state.clock.totalMinutes - lastChangeAt).toBeGreaterThanOrEqual(shortest - NIGHT_RATE * 5);
        lastChangeAt = state.clock.totalMinutes;
      }
    }
  });

  it('still reaches rain, which some wild plants depend on', () => {
    const state = createNewGame();
    const rand = mulberry32(11);
    let t = state.clock.lastRealTimestamp;
    let sawRain = false;
    for (let i = 0; i < 5_000 && !sawRain; i++) {
      t += 10_000;
      advanceClock(state, t, rand);
      sawRain = state.weather.condition === 'rain';
    }
    expect(sawRain).toBe(true);
  });
});
