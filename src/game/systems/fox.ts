import type { DiscoverySpot, ZoneId } from '../types';
import type { GameState } from '../state';
import { spotContent } from './spots';
import { hasFound } from './collection';

const FOX_SPEED = 2.4; // tiles per real second
const PAUSE_MINUTES = 6; // ~3 real seconds at 2 game-min/sec
const COOLDOWN_MIN = 50;
const COOLDOWN_MAX = 140;
const ARRIVE_DIST = 0.6;

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

// The fox shows you things. Its secret patches come first; otherwise it
// trots over to whatever's growing nearby that you've never seen.
function pickCandidate(state: GameState, zone: ZoneId, points: DiscoverySpot[], rand: () => number): DiscoverySpot | null {
  const inZone = points.filter((p) => p.zone === zone);
  const secret = inZone.filter((p) => p.foxLed && !state.spots[p.id]?.revealed);
  if (secret.length > 0) return secret[Math.floor(rand() * secret.length)];
  const unseen = inZone.filter((p) => {
    const c = spotContent(state, p);
    return !!c && !hasFound(state, c.defId, c.variantId);
  });
  if (unseen.length === 0) return null;
  return unseen[Math.floor(rand() * unseen.length)];
}

export interface FoxTickContext {
  playerZone: ZoneId;
  playerX: number;
  playerY: number;
  inGreenhouse: boolean;
  dtSeconds: number;
  now: number; // game-minutes
  discoveryPoints: DiscoverySpot[];
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
          if (dp && dp.foxLed && !state.spots[dp.id]?.revealed) {
            state.spots[dp.id] = { ...(state.spots[dp.id] ?? {}), revealed: true };
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
