import type { GameState, SpeciesRecord } from '../state';
import { PLANTS } from '../data/plants';

/** Growing this many of a species makes it "established": you know it well enough to display it or plant it out. */
export const ESTABLISH_THRESHOLD = 2;

export function ensureRecord(state: GameState, defId: string, now: number): SpeciesRecord {
  let rec = state.collection[defId];
  if (!rec) {
    rec = { foundAt: now, variants: [], grown: 0, propagated: 0, sold: 0, earned: 0, plantedOut: 0, displayed: 0 };
    state.collection[defId] = rec;
  }
  return rec;
}

export interface FoundResult {
  newSpecies: boolean;
  newVariant: boolean;
}

/** Records that the player has laid eyes on (and hands on) this species/variant. */
export function recordFound(state: GameState, defId: string, variantId: string, now: number): FoundResult {
  const newSpecies = !state.collection[defId];
  const rec = ensureRecord(state, defId, now);
  const newVariant = !rec.variants.includes(variantId);
  if (newVariant) rec.variants.push(variantId);
  return { newSpecies, newVariant: newVariant && !newSpecies };
}

export function hasFound(state: GameState, defId: string, variantId?: string): boolean {
  const rec = state.collection[defId];
  if (!rec) return false;
  return variantId === undefined || rec.variants.includes(variantId);
}

export function isEstablished(state: GameState, defId: string): boolean {
  return (state.collection[defId]?.grown ?? 0) >= ESTABLISH_THRESHOLD;
}

export interface SpeciesCounts {
  carrying: number;
  inNursery: number;
  displayed: number;
  wild: number;
  wildPlanted: number;
  wildSprouted: number;
}

export function speciesCounts(state: GameState, defId: string): SpeciesCounts {
  const c: SpeciesCounts = { carrying: 0, inNursery: 0, displayed: 0, wild: 0, wildPlanted: 0, wildSprouted: 0 };
  for (const b of state.basket) if (b.defId === defId) c.carrying++;
  for (const p of Object.values(state.plants)) {
    if (p.defId !== defId) continue;
    if (p.location.kind === 'nursery') c.inNursery++;
    else if (p.location.kind === 'display') c.displayed++;
    else {
      c.wild++;
      if (p.bornWild) c.wildSprouted++;
      else c.wildPlanted++;
    }
  }
  return c;
}

export function collectionTotals(state: GameState) {
  let species = 0;
  let variants = 0;
  let totalVariants = 0;
  for (const def of Object.values(PLANTS)) {
    totalVariants += def.variants.length;
    const rec = state.collection[def.id];
    if (!rec) continue;
    species++;
    variants += rec.variants.length;
  }
  return { species, totalSpecies: Object.keys(PLANTS).length, variants, totalVariants };
}
