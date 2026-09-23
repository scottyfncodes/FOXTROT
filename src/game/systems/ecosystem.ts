import type { ZoneId } from '../types';
import type { GameState } from '../state';
import { CREATURES } from '../data/creatures';
import { PLANTS } from '../data/plants';
import { RELATIONSHIPS } from '../data/relationships';

const INVASIVE_IDS = new Set(['widowsLace']);
const CHUNK_MINUTES = 30;
const MAX_CHUNKS_PER_TICK = 200;
// A species Ellen deliberately established somewhere settles at a higher
// level there for good, instead of drifting back to where it started.
const ESTABLISHED_BONUS = 15;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function baselineFor(speciesId: string): number {
  const creature = CREATURES[speciesId];
  if (creature) return creature.basePopulation;
  if (INVASIVE_IDS.has(speciesId)) return 78;
  return 45; // ordinary wild plant coverage baseline
}

export function initEcosystem(state: GameState) {
  for (const creature of Object.values(CREATURES)) {
    for (const zone of creature.zones) {
      ensureZone(state, zone);
      if (state.ecosystem[zone][creature.id] === undefined) {
        state.ecosystem[zone][creature.id] = creature.basePopulation;
      }
    }
  }
  for (const plant of Object.values(PLANTS)) {
    for (const zone of plant.zones) {
      ensureZone(state, zone);
      if (state.ecosystem[zone][plant.id] === undefined) {
        state.ecosystem[zone][plant.id] = baselineFor(plant.id);
      }
    }
  }
}

function ensureZone(state: GameState, zone: ZoneId) {
  if (!state.ecosystem[zone]) state.ecosystem[zone] = {};
}

export function getPopulation(state: GameState, zone: ZoneId, speciesId: string): number {
  return state.ecosystem[zone]?.[speciesId] ?? 0;
}

export function introduceSpecies(state: GameState, defId: string, zone: ZoneId, amount: number, now: number) {
  ensureZone(state, zone);
  const current = state.ecosystem[zone][defId] ?? 0;
  state.ecosystem[zone][defId] = clamp(current + amount, 0, 100);
  state.wildIntroductions.push({ defId, zone, introducedAt: now });
}

/** Removes/thins a species in a zone — used for direct intervention (e.g. clearing an invasive patch). */
export function thinSpecies(state: GameState, defId: string, zone: ZoneId, amount: number) {
  ensureZone(state, zone);
  const current = state.ecosystem[zone][defId] ?? 0;
  state.ecosystem[zone][defId] = clamp(current - amount, 0, 100);
}

function tickChunk(state: GameState, established: Set<string>, rand: () => number) {
  for (const zone of Object.keys(state.ecosystem) as ZoneId[]) {
    const pops = state.ecosystem[zone];
    const deltas: Record<string, number> = {};
    for (const speciesId of Object.keys(pops)) {
      const pop = pops[speciesId];
      let delta = 0;
      for (const rel of RELATIONSHIPS) {
        if (rel.target !== speciesId) continue;
        const sourcePop = pops[rel.source];
        if (sourcePop === undefined || sourcePop <= 0) continue;
        delta += rel.effect * (sourcePop / 100) * 3.2;
      }
      const baseline = baselineFor(speciesId) + (established.has(`${zone}:${speciesId}`) ? ESTABLISHED_BONUS : 0);
      delta += (baseline - pop) * 0.035;
      delta += (rand() - 0.5) * 1.6;
      deltas[speciesId] = delta;
    }
    for (const speciesId of Object.keys(pops)) {
      pops[speciesId] = clamp(pops[speciesId] + deltas[speciesId], 0, 100);
    }
  }
}

/**
 * Simulates whole CHUNK_MINUTES steps and returns the leftover minutes, so
 * callers feeding it small per-frame deltas accumulate time instead of
 * running a full step every frame.
 */
export function tickEcosystem(state: GameState, elapsedMinutes: number, rand: () => number = Math.random): number {
  if (elapsedMinutes <= 0) return 0;
  const whole = Math.floor(elapsedMinutes / CHUNK_MINUTES);
  const chunks = Math.min(MAX_CHUNKS_PER_TICK, whole);
  if (chunks > 0) {
    const established = new Set(state.wildIntroductions.map((w) => `${w.zone}:${w.defId}`));
    for (let i = 0; i < chunks; i++) tickChunk(state, established, rand);
  }
  return elapsedMinutes - whole * CHUNK_MINUTES;
}

export interface EcosystemAlert {
  id: string;
  zone: ZoneId;
  message: string;
}

/** Legible, non-cartoonish signals the player can notice and go investigate. */
export function detectEcologicalAlerts(state: GameState): EcosystemAlert[] {
  const alerts: EcosystemAlert[] = [];
  for (const zone of Object.keys(state.ecosystem) as ZoneId[]) {
    const pops = state.ecosystem[zone];
    const aphid = pops.aphid ?? 0;
    const spider = pops.gardenSpider ?? 0;
    if (aphid > 65 && spider < 20) {
      alerts.push({ id: `aphid-surge-${zone}`, zone, message: 'Aphids seem to be thriving here, unusually so.' });
    }
    const lace = pops.widowsLace ?? 0;
    if (lace > 88) {
      alerts.push({ id: `lace-overrun-${zone}`, zone, message: "Widow's Lace has spread further than seems healthy." });
    }
    const beetle = pops.barkBeetle ?? 0;
    const lizard = pops.gardenLizard ?? 0;
    if (beetle > 60 && lizard < 15) {
      alerts.push({ id: `beetle-surge-${zone}`, zone, message: 'Bark Beetles are unusually numerous, with few lizards to check them.' });
    }
  }
  return alerts;
}
