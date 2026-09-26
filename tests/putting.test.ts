import { describe, it, expect } from 'vitest';
import {
  COURSE,
  COURSE_L,
  COURSE_W,
  BALL_R,
  CAPTURE_SPEED,
  ROLL,
  STROKE_LIMIT,
  simulatePutt,
  stepBall,
  strike,
  scoreName,
  toPar,
  type Ball,
  type Hole,
} from '../src/game/systems/putting';

/** A patient golfer: tries a fan of putts and takes the one that sinks, or leaves it closest. */
function playHole(hole: Hole): number {
  let at = { ...hole.tee };
  for (let stroke = 1; stroke <= STROKE_LIMIT; stroke++) {
    let best: { d: number; ball: Ball } | null = null;
    for (let a = -Math.PI; a < Math.PI; a += Math.PI / 180) {
      for (let p = 0.05; p <= 1.001; p += 0.025) {
        const r = simulatePutt(hole, at, a, p);
        if (r.sunk) return stroke;
        const d = Math.hypot(r.ball.x - hole.cup.x, r.ball.y - hole.cup.y);
        if (!best || d < best.d) best = { d, ball: r.ball };
      }
    }
    at = { x: best!.ball.x, y: best!.ball.y };
  }
  return STROKE_LIMIT + 1;
}

describe('putt-putt physics', () => {
  it('rolls to a stop on a level mat', () => {
    const hole = COURSE[0];
    const r = simulatePutt(hole, hole.tee, Math.PI / 2, 0.3);
    expect(r.sunk).toBe(false);
    expect(r.ball.vx).toBe(0);
    expect(r.ball.vy).toBe(0);
  });

  it('keeps the ball on the mat, bouncing off the edges', () => {
    const hole = COURSE[0];
    const r = simulatePutt(hole, hole.tee, 0.3, 1);
    expect(r.events).toContain('wall');
    expect(r.ball.x).toBeGreaterThanOrEqual(BALL_R - 1e-9);
    expect(r.ball.x).toBeLessThanOrEqual(COURSE_W - BALL_R + 1e-9);
    expect(r.ball.y).toBeGreaterThanOrEqual(BALL_R - 1e-9);
    expect(r.ball.y).toBeLessThanOrEqual(COURSE_L - BALL_R + 1e-9);
  });

  it('drops a gentle putt into the cup but lips out a screamer', () => {
    const hole = COURSE[0];
    const gentle: Ball = { x: hole.cup.x, y: hole.cup.y + 0.5, vx: 0, vy: -1.0 };
    let e = null;
    for (let i = 0; i < 400 && e !== 'sunk'; i++) e = stepBall(gentle, hole, 1 / 240);
    expect(e).toBe('sunk');

    const hot: Ball = { x: hole.cup.x + 0.08, y: hole.cup.y + 0.5, vx: 0, vy: -(CAPTURE_SPEED + 2.5) };
    const events = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const ev = stepBall(hot, hole, 1 / 240);
      if (ev) events.add(ev);
    }
    expect(events.has('sunk')).toBe(false);
    expect(events.has('lip')).toBe(true);
  });

  it('bounces off whatever is lying on the mat', () => {
    const hole = COURSE.find((h) => h.id === 'mug')!;
    const r = simulatePutt(hole, hole.tee, -Math.PI / 2, 0.9);
    expect(r.events).toContain('hit');
  });

  it('never lets a slope beat friction, so every ball comes to rest', () => {
    for (const hole of COURSE) expect(Math.hypot(hole.slope.x, hole.slope.y)).toBeLessThan(ROLL);
  });

  it('turns the putter into speed along the aim', () => {
    const b: Ball = { x: 1, y: 1, vx: 0, vy: 0 };
    strike(b, -Math.PI / 2, 1);
    expect(b.vx).toBeCloseTo(0, 6);
    expect(b.vy).toBeLessThan(0);
  });
});

describe('the course', () => {
  it('has six holes, every one laid out on the mat', () => {
    expect(COURSE).toHaveLength(6);
    for (const h of COURSE) {
      for (const p of [h.tee, h.cup]) {
        expect(p.x).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(COURSE_W);
        expect(p.y).toBeGreaterThan(0);
        expect(p.y).toBeLessThan(COURSE_L);
      }
    }
  });

  it('is playable: every hole can be made in par or better', () => {
    for (const hole of COURSE) expect(playHole(hole), hole.name).toBeLessThanOrEqual(hole.par);
  });

  it('allows a hole in one on the straight first hole', () => {
    expect(playHole(COURSE[0])).toBe(1);
  });

  it('names scores the golf way', () => {
    expect(scoreName(1, 3)).toBe('Hole in one!');
    expect(scoreName(2, 3)).toBe('Birdie!');
    expect(scoreName(3, 3)).toBe('Par.');
    expect(scoreName(4, 3)).toBe('Bogey.');
    expect(toPar(20, 15)).toBe('+5');
    expect(toPar(15, 15)).toBe('E');
  });
});

describe('the putting record', () => {
  it('pays for the first ace on each hole only, and keeps the best round', async () => {
    const { recordAce, recordRound } = await import('../src/game/systems/putting');
    const rec = { rounds: 0, best: null as number | null, aces: [] as string[] };
    expect(recordAce(rec, 'hallway')).toBe(true);
    expect(recordAce(rec, 'hallway')).toBe(false);
    expect(recordRound(rec, 18)).toBe(true);
    expect(recordRound(rec, 20)).toBe(false);
    expect(recordRound(rec, 16)).toBe(true);
    expect(rec).toEqual({ rounds: 3, best: 16, aces: ['hallway'] });
  });
});
