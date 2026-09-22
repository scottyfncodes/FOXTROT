import type { DiscoveryPoint, ZoneId } from '../types';
import type { GameState } from '../state';

const FOX_SPEED = 2.4; // tiles per real second
const PAUSE_MINUTES = 6; // ~3 real seconds at 2 game-min/sec
const COOLDOWN_MIN = 50;
const COOLDOWN_MAX = 140;
const ARRIVE_DIST = 0.6;

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

function pickCandidate(state: GameState, zone: ZoneId, points: DiscoveryPoint[], rand: () => number): DiscoveryPoint | null {
  const inZone = points.filter((p) => p.zone === zone);
  const undiscovered = inZone.filter((p) => {
    const entry = state.journal[p.specimenId];
    return !entry || entry.level === 'UNDISCOVERED';
  });
  if (undiscovered.length === 0) return null;
  const foxLedFirst = undiscovered.filter((p) => p.foxLed && !state.discoveryPoints[p.id]?.revealed);
  const pool = foxLedFirst.length > 0 ? foxLedFirst : undiscovered;
  return pool[Math.floor(rand() * pool.length)];
}

export interface FoxTickContext {
  playerZone: ZoneId;
  playerX: number;
  playerY: number;
  inGreenhouse: boolean;
  dtSeconds: number;
  now: number; // game-minutes
  discoveryPoints: DiscoveryPoint[];
  rand: () => number;
}

export interface FoxTickResult {
  revealedDiscoveryId?: string;
}

export function tickFox(state: GameState, ctx: FoxTickContext): FoxTickResult {
  const fox = state.fox;
  const result: FoxTickResult = {};

  if (ctx.inGreenhouse) {
    fox.visible = false;
    return result;
  }

  switch (fox.behavior) {
    case 'idle':
    case 'gone': {
      if (ctx.now < fox.nextEventAt) return result;
      const wantsToLead = ctx.rand() < 0.65;
      const candidate = wantsToLead ? pickCandidate(state, ctx.playerZone, ctx.discoveryPoints, ctx.rand) : null;
      fox.zone = ctx.playerZone;
      fox.x = ctx.playerX + (ctx.rand() - 0.5) * 3;
      fox.y = ctx.playerY + (ctx.rand() - 0.5) * 3;
      fox.visible = true;
      if (candidate) {
        fox.behavior = 'leading';
        fox.targetDiscoveryId = candidate.id;
      } else {
        fox.behavior = 'wandering';
        fox.targetDiscoveryId = null;
      }
      break;
    }
    case 'leading':
    case 'wandering': {
      let tx: number;
      let ty: number;
      if (fox.behavior === 'leading' && fox.targetDiscoveryId) {
        const dp = ctx.discoveryPoints.find((p) => p.id === fox.targetDiscoveryId);
        tx = dp?.x ?? fox.x;
        ty = dp?.y ?? fox.y;
      } else {
        tx = fox.x;
        ty = fox.y;
      }
      const d = dist(fox.x, fox.y, tx, ty);
      if (d > ARRIVE_DIST) {
        const step = FOX_SPEED * ctx.dtSeconds;
        fox.x += ((tx - fox.x) / d) * Math.min(step, d);
        fox.y += ((ty - fox.y) / d) * Math.min(step, d);
      } else {
        if (fox.behavior === 'leading' && fox.targetDiscoveryId) {
          const dp = ctx.discoveryPoints.find((p) => p.id === fox.targetDiscoveryId);
          if (dp && dp.foxLed && !state.discoveryPoints[dp.id]?.revealed) {
            state.discoveryPoints[dp.id] = { lastCollectedAt: null, revealed: true };
            result.revealedDiscoveryId = dp.id;
          }
        }
        fox.behavior = 'paused';
        fox.nextEventAt = ctx.now + PAUSE_MINUTES;
      }
      break;
    }
    case 'paused': {
      if (ctx.now >= fox.nextEventAt) {
        fox.behavior = 'gone';
        fox.visible = false;
        fox.targetDiscoveryId = null;
        fox.nextEventAt = ctx.now + COOLDOWN_MIN + ctx.rand() * (COOLDOWN_MAX - COOLDOWN_MIN);
      }
      break;
    }
  }
  return result;
}
