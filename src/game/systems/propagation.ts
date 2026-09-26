import type { BasketItem, GameState, OwnedPlant, PlantLocation } from '../state';
import { makeUid } from '../state';
import type { OutdoorZoneId, Rarity } from '../types';
import { PLANTS, rarityRank } from '../data/plants';
import { weightedPick } from '../engine/Random';
import { addToBasket, basketFull, takeFromBasket } from './basket';
import { ensureRecord, isEstablished, recordFound } from './collection';
import { isRooted, stageIndexOf } from './growth';

/** Game-minutes a plant needs to recover before another cutting (halved with the rooting kit). */
export const CUTTING_COOLDOWN = 240;
const BASE_SPORT_CHANCE = 0.06;

/** How likely a sport (mutation) is to land on each variant rarity. */
const SPORT_WEIGHT: Record<Rarity, number> = { common: 30, uncommon: 30, rare: 20, veryRare: 12, extremelyRare: 5, mythic: 0 };

export function cuttingCooldown(state: GameState): number {
  return state.owned.includes('rootingKit') ? CUTTING_COOLDOWN / 2 : CUTTING_COOLDOWN;
}

export function sportChance(state: GameState): number {
  return state.owned.includes('rootingKit') ? BASE_SPORT_CHANCE * 2 : BASE_SPORT_CHANCE;
}

/**
 * A "sport": the plant throws a shoot unlike its parent. Picks another of
 * the species' variants, weighted so rarer forms are rarer outcomes.
 */
export function rollSport(defId: string, fromVariantId: string, rand: () => number): string | null {
  const def = PLANTS[defId];
  if (!def) return null;
  const others = def.variants.filter((v) => v.id !== fromVariantId);
  if (others.length === 0) return null;
  return weightedPick(others, (v) => SPORT_WEIGHT[v.rarity], rand)?.id ?? null;
}

export type CuttingBlock = 'not-rooted' | 'recovering' | 'basket-full';

export function cuttingBlockReason(state: GameState, plant: OwnedPlant, now: number): CuttingBlock | null {
  if (!isRooted(plant.growth)) return 'not-rooted';
  if (plant.lastCuttingAt !== null && now - plant.lastCuttingAt < cuttingCooldown(state)) return 'recovering';
  if (basketFull(state)) return 'basket-full';
  return null;
}

export interface CuttingResult {
  item: BasketItem;
  sport: boolean;
  newVariant: boolean;
}

/** Snips a cutting into the basket. The parent is never harmed — it just needs time to recover. */
export function takeCutting(state: GameState, plantId: string, now: number, rand: () => number = Math.random): CuttingResult | null {
  const plant = state.plants[plantId];
  if (!plant || cuttingBlockReason(state, plant, now)) return null;
  let variantId = plant.variantId;
  let sport = false;
  // Bigger, older plants are more likely to throw something unusual.
  const chance = sportChance(state) * (0.6 + stageIndexOf(plant.growth) * 0.25);
  if (rand() < chance) {
    const v = rollSport(plant.defId, plant.variantId, rand);
    if (v) {
      variantId = v;
      sport = true;
    }
  }
  const item = addToBasket(state, {
    defId: plant.defId,
    variantId,
    seed: Math.floor(rand() * 1e9),
    growth: 0,
    generation: plant.generation + 1,
    origin: 'cutting',
    collectedAt: now,
  });
  if (!item) return null;
  plant.lastCuttingAt = now;
  if (plant.unnoticed) plant.unnoticed = false;
  ensureRecord(state, plant.defId, now).propagated += 1;
  const found = recordFound(state, plant.defId, variantId, now);
  return { item, sport, newVariant: found.newVariant };
}

/** For one parent of a cross, its partner and what the two make together. */
export function crossOf(defId: string): { partner: string; child: string } | null {
  for (const def of Object.values(PLANTS)) {
    if (!def.parents) continue;
    const [a, b] = def.parents;
    if (defId === a) return { partner: b, child: def.id };
    if (defId === b) return { partner: a, child: def.id };
  }
  return null;
}

export type CrossBlock = 'no-cross' | 'no-partner' | 'not-rooted' | 'recovering' | 'basket-full';

/** A rooted plant of the partner species the player is growing, ready to give pollen. */
export function crossPartner(state: GameState, plant: OwnedPlant, now: number): OwnedPlant | undefined {
  const cross = crossOf(plant.defId);
  if (!cross) return undefined;
  const ready = (p: OwnedPlant) => isRooted(p.growth) && (p.lastCuttingAt === null || now - p.lastCuttingAt >= cuttingCooldown(state));
  return Object.values(state.plants).find((p) => p.defId === cross.partner && p.id !== plant.id && ready(p));
}

export function crossBlockReason(state: GameState, plant: OwnedPlant, now: number): CrossBlock | null {
  const cross = crossOf(plant.defId);
  if (!cross) return 'no-cross';
  if (!Object.values(state.plants).some((p) => p.defId === cross.partner)) return 'no-partner';
  const own = cuttingBlockReason(state, plant, now);
  if (own) return own;
  if (!crossPartner(state, plant, now)) return 'recovering';
  return null;
}

/**
 * Cross-pollinates a plant with a rooted one of its partner species: the
 * seed that sets comes up as the hybrid, straight into the basket. Both
 * parents then need the same rest they would after a cutting.
 */
export function crossPollinate(state: GameState, plantId: string, now: number, rand: () => number = Math.random): { item: BasketItem; newSpecies: boolean } | null {
  const plant = state.plants[plantId];
  if (!plant || crossBlockReason(state, plant, now)) return null;
  const partner = crossPartner(state, plant, now)!;
  const child = crossOf(plant.defId)!.child;
  const item = addToBasket(state, {
    defId: child,
    variantId: PLANTS[child].variants[0].id,
    seed: Math.floor(rand() * 1e9),
    growth: 0,
    generation: Math.max(plant.generation, partner.generation) + 1,
    origin: 'cutting',
    collectedAt: now,
  });
  if (!item) return null;
  plant.lastCuttingAt = now;
  partner.lastCuttingAt = now;
  ensureRecord(state, plant.defId, now).propagated += 1;
  const found = recordFound(state, child, item.variantId, now);
  return { item, newSpecies: found.newSpecies };
}

function newPlantFrom(item: BasketItem, location: PlantLocation, now: number): OwnedPlant {
  return {
    id: makeUid('plant'),
    defId: item.defId,
    variantId: item.variantId,
    seed: item.seed,
    growth: item.growth,
    location,
    plantedAt: now,
    lastCuttingAt: null,
    generation: item.generation,
    bornWild: false,
    countedGrown: item.countedGrown,
  };
}

export function occupantOf(state: GameState, where: { bedId?: string; slotId?: string }): OwnedPlant | undefined {
  return Object.values(state.plants).find(
    (p) =>
      (where.bedId && p.location.kind === 'nursery' && p.location.bedId === where.bedId) ||
      (where.slotId && p.location.kind === 'display' && p.location.slotId === where.slotId)
  );
}

/** Pots a cutting (or any carried plant) into a nursery bed. */
export function potInNursery(state: GameState, uid: string, bedId: string, now: number): OwnedPlant | null {
  if (occupantOf(state, { bedId })) return null;
  const item = takeFromBasket(state, uid);
  if (!item) return null;
  const plant = newPlantFrom(item, { kind: 'nursery', bedId }, now);
  state.plants[plant.id] = plant;
  return plant;
}

export type PlacementBlock = 'not-established' | 'not-rooted';

/** Displaying or planting out needs a rooted plant of a species you've grown twice. */
export function placementBlockReason(state: GameState, item: BasketItem): PlacementBlock | null {
  if (!isRooted(item.growth)) return 'not-rooted';
  if (!isEstablished(state, item.defId)) return 'not-established';
  return null;
}

export function placeOnDisplay(state: GameState, uid: string, slotId: string, potId: string, now: number): OwnedPlant | null {
  if (occupantOf(state, { slotId })) return null;
  const item = state.basket.find((i) => i.uid === uid);
  if (!item || placementBlockReason(state, item)) return null;
  takeFromBasket(state, uid);
  const plant = newPlantFrom(item, { kind: 'display', slotId, potId }, now);
  state.plants[plant.id] = plant;
  ensureRecord(state, item.defId, now).displayed += 1;
  return plant;
}

/** Plants a carried plant into the ground outdoors, for good. */
export function plantOutdoors(state: GameState, uid: string, x: number, y: number, zone: OutdoorZoneId, now: number): OwnedPlant | null {
  const item = state.basket.find((i) => i.uid === uid);
  if (!item || placementBlockReason(state, item)) return null;
  takeFromBasket(state, uid);
  const plant = newPlantFrom(item, { kind: 'wild', x, y, zone }, now);
  state.plants[plant.id] = plant;
  ensureRecord(state, item.defId, now).plantedOut += 1;
  return plant;
}

/** Lifts a nursery or display plant back into the basket, pot and all. Outdoor plants stay put. */
export function liftPlant(state: GameState, plantId: string, now: number): BasketItem | null {
  const plant = state.plants[plantId];
  if (!plant || plant.location.kind === 'wild' || basketFull(state)) return null;
  const item = addToBasket(state, {
    defId: plant.defId,
    variantId: plant.variantId,
    seed: plant.seed,
    growth: plant.growth,
    generation: plant.generation,
    origin: 'lifted',
    collectedAt: now,
    countedGrown: plant.countedGrown,
  });
  if (!item) return null;
  delete state.plants[plantId];
  return item;
}

export function setPot(state: GameState, plantId: string, potId: string) {
  const plant = state.plants[plantId];
  if (plant && plant.location.kind === 'display') plant.location.potId = potId;
}

/**
 * Counts plants reaching "established" in the player's care toward the
 * species' establishment. Returns the species that just crossed the line.
 */
export function creditGrown(state: GameState, plantId: string, now: number): string | null {
  const plant = state.plants[plantId];
  if (!plant || plant.bornWild || plant.countedGrown) return null;
  if (stageIndexOf(plant.growth) < 2) return null;
  plant.countedGrown = true;
  const rec = ensureRecord(state, plant.defId, now);
  const wasEstablished = isEstablished(state, plant.defId);
  rec.grown += 1;
  return !wasEstablished && isEstablished(state, plant.defId) ? plant.defId : null;
}

export function isRarerThanStandard(defId: string, variantId: string): boolean {
  const def = PLANTS[defId];
  const v = def?.variants.find((x) => x.id === variantId);
  return !!def && !!v && rarityRank(v.rarity) > rarityRank(def.variants[0].rarity);
}
