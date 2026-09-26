import { describe, it, expect } from 'vitest';
import { createNewGame, type GameState, type OwnedPlant } from '../src/game/state';
import {
  bedBlockReason,
  bedContains,
  bedCost,
  canTransplant,
  checkPlanting,
  compostPlant,
  createBed,
  createPath,
  encroachment,
  ENCROACH_MINUTES,
  onPath,
  plantsInBed,
  previewPath,
  removeBed,
  removePath,
  simplifyRoute,
  transplant,
  type LandscapeWorld,
} from '../src/game/systems/landscape';
import { spreadStep, advanceWorld } from '../src/game/systems/wild';
import { STAGE_AT, growthMultiplier } from '../src/game/systems/growth';
import { mulberry32 } from '../src/game/engine/Random';

/** A patch of open meadow with a tree at (60,30) and a bush at (62,30). */
function world(extra: Record<string, 'tree' | 'bush' | 'rock' | 'flower'> = {}): LandscapeWorld {
  const obs: Record<string, string> = { '60,30': 'tree', '62,30': 'bush', '63,31': 'flower', ...extra };
  return {
    obstacleAt: (x, y) => (obs[`${x},${y}`] as 'tree') ?? null,
    isBuiltOrWater: (x, y) => x < 0 || y < 0 || x >= 90 || y >= 64 || (x >= 40 && x < 44),
    isSpot: (x, y) => x === 70 && y === 26,
  };
}

function wild(state: GameState, id: string, x: number, y: number, growth: number, defId = 'pothos', variantId = 'golden'): OwnedPlant {
  const p: OwnedPlant = { id, defId, variantId, seed: 3, growth, location: { kind: 'wild', x, y, zone: 'meadow' }, plantedAt: 0, lastCuttingAt: null, generation: 0, bornWild: false };
  state.plants[id] = p;
  return p;
}

describe('precise outdoor planting', () => {
  it('fits a young plant in between two others when there’s physically room', () => {
    const state = createNewGame();
    wild(state, 'a', 55, 28, STAGE_AT.young, 'snakePlant', 'standard');
    wild(state, 'b', 56.4, 28, STAGE_AT.young, 'snakePlant', 'standard');
    expect(checkPlanting(state, 'snakePlant', 55.7, 28, world(), 0).block).toBeNull();
    // …but not on top of one.
    const c = checkPlanting(state, 'snakePlant', 55.15, 28, world(), 0);
    expect(c.block).toBe('crowded');
    expect(c.blocker?.id).toBe('a');
  });

  it('leaves more room around a plant as it grows', () => {
    const state = createNewGame();
    const m = wild(state, 'm', 55, 28, STAGE_AT.young, 'monstera', 'deliciosa');
    expect(checkPlanting(state, 'fittonia', 55.8, 28, world(), 0).block).toBeNull();
    m.growth = STAGE_AT.specimen;
    expect(checkPlanting(state, 'fittonia', 55.8, 28, world(), 0).block).toBe('crowded');
  });

  it('refuses water, trees, wild patches, paths and garden decor — but not a wildflower', () => {
    const state = createNewGame();
    expect(checkPlanting(state, 'pothos', 41.5, 30.5, world(), 0).block).toBe('water');
    expect(checkPlanting(state, 'pothos', 60.5, 30.5, world(), 0).block).toBe('obstacle');
    expect(checkPlanting(state, 'pothos', 70.5, 26.5, world(), 0).block).toBe('spot');
    expect(checkPlanting(state, 'pothos', 63.5, 31.5, world(), 0).block).toBeNull();
    state.decor.push({ id: 'd', decorId: 'birdbath', x: 50, y: 30 });
    expect(checkPlanting(state, 'pothos', 50.2, 30.1, world(), 0).block).toBe('decor');
    state.paths.push({ id: 'p', points: [48, 34, 52, 34], width: 1.15, createdAt: 0 });
    expect(checkPlanting(state, 'pothos', 50, 34.1, world(), 0).block).toBe('path');
  });

  it('knows when the spot is inside one of your garden beds', () => {
    const state = createNewGame();
    state.gardenBeds.push({ id: 'bed', x: 50, y: 28, w: 3, h: 3, shape: 'rect', createdAt: 0 });
    expect(checkPlanting(state, 'pothos', 51, 29, world(), 0).bedId).toBe('bed');
    expect(checkPlanting(state, 'pothos', 54, 29, world(), 0).bedId).toBeUndefined();
  });
});

describe('moving plants outdoors', () => {
  it('moves a young plant to exactly where you put it, keeping its growth', () => {
    const state = createNewGame();
    const p = wild(state, 'p', 55, 28, STAGE_AT.established);
    expect(canTransplant(p)).toBe(true);
    expect(transplant(state, 'p', 57.35, 29.8, world(), 0)).toBe(true);
    expect(p.location).toMatchObject({ kind: 'wild', x: 57.35, y: 29.8 });
    expect(p.growth).toBe(STAGE_AT.established);
  });

  it('won’t move a plant once it’s large — it has settled in', () => {
    const state = createNewGame();
    const p = wild(state, 'p', 55, 28, STAGE_AT.large);
    expect(canTransplant(p)).toBe(false);
    expect(transplant(state, 'p', 57, 29, world(), 0)).toBe(false);
    expect(p.location).toMatchObject({ x: 55, y: 28 });
  });

  it('moving a plant into a bed makes it part of the bed', () => {
    const state = createNewGame();
    state.gardenBeds.push({ id: 'bed', x: 50, y: 28, w: 3, h: 3, shape: 'rect', createdAt: 0 });
    wild(state, 'p', 55, 28, STAGE_AT.young);
    transplant(state, 'p', 51, 29, world(), 0);
    expect(plantsInBed(state, 'bed').map((x) => x.id)).toEqual(['p']);
  });
});

describe('composting wild plants', () => {
  it('always gives compost — more for bigger plants — and clears the ground', () => {
    const state = createNewGame();
    wild(state, 'small', 55, 28, 10);
    wild(state, 'big', 58, 28, STAGE_AT.specimen);
    const a = compostPlant(state, 'small', 0, () => 0.99)!;
    const b = compostPlant(state, 'big', 0, () => 0.99)!;
    expect(a.compost).toBeLessThan(b.compost);
    expect(state.compost).toBe(a.compost + b.compost);
    expect(state.plants.small).toBeUndefined();
    expect(state.plants.big).toBeUndefined();
    expect(a.cutting).toBeNull();
  });

  it('sometimes saves a cutting — but not guaranteed, and not always true to type', () => {
    const state = createNewGame();
    const outcomes = new Map<string, number>();
    const rand = mulberry32(42);
    for (let i = 0; i < 300; i++) {
      wild(state, `p${i}`, 55, 28, STAGE_AT.large, 'pothos', 'manjula');
      const r = compostPlant(state, `p${i}`, 0, rand)!;
      const key = r.cutting ? (r.cutting.variantId === 'manjula' ? 'same' : 'different') : 'none';
      outcomes.set(key, (outcomes.get(key) ?? 0) + 1);
      state.basket = [];
    }
    expect(outcomes.get('none')).toBeGreaterThan(50);
    expect(outcomes.get('same')).toBeGreaterThan(30);
    expect(outcomes.get('different')).toBeGreaterThan(30);
  });

  it('only composts plants out in the landscape', () => {
    const state = createNewGame();
    state.plants.n = { id: 'n', defId: 'pothos', variantId: 'golden', seed: 1, growth: 999, location: { kind: 'nursery', bedId: 'bed1' }, plantedAt: 0, lastCuttingAt: null, generation: 0, bornWild: false };
    expect(compostPlant(state, 'n', 0)).toBeNull();
    expect(state.plants.n).toBeDefined();
  });
});

describe('garden beds', () => {
  it('cost compost, clear the scrub inside, and take in plants already growing there', () => {
    const state = createNewGame();
    state.compost = 10;
    wild(state, 'inside', 62.5, 31.2, STAGE_AT.young);
    const spec = { x: 61.5, y: 29.5, w: 3, h: 3, shape: 'rect' as const };
    const res = createBed(state, spec, world(), 5)!;
    expect(res).not.toBeNull();
    expect(state.compost).toBe(10 - bedCost(3, 3));
    expect(state.clearedObstacles).toEqual(expect.arrayContaining(['62,30', '63,31']));
    expect(state.plants.inside.location).toMatchObject({ bedId: res.bed.id });
  });

  it('can’t be dug through trees, over water, over wild patches, on another bed, or without compost', () => {
    const state = createNewGame();
    state.compost = 50;
    expect(bedBlockReason(state, { x: 59.5, y: 29.5, w: 2, h: 2, shape: 'rect' }, world())).toBe('blocked');
    expect(bedBlockReason(state, { x: 39, y: 20, w: 3, h: 2, shape: 'rect' }, world())).toBe('blocked');
    expect(bedBlockReason(state, { x: 69.5, y: 25.5, w: 2, h: 2, shape: 'rect' }, world())).toBe('patch');
    expect(bedBlockReason(state, { x: 50, y: 20, w: 1, h: 3, shape: 'rect' }, world())).toBe('too-small');
    createBed(state, { x: 50, y: 20, w: 3, h: 3, shape: 'oval' }, world(), 0);
    expect(bedBlockReason(state, { x: 52, y: 21, w: 3, h: 3, shape: 'rect' }, world())).toBe('overlap');
    state.compost = 0;
    expect(bedBlockReason(state, { x: 70, y: 40, w: 3, h: 3, shape: 'rect' }, world())).toBe('compost');
  });

  it('come in round shapes too', () => {
    const oval = { x: 0, y: 0, w: 4, h: 2, shape: 'oval' as const };
    expect(bedContains(oval, 2, 1)).toBe(true);
    expect(bedContains(oval, 0.1, 0.1)).toBe(false);
    expect(bedContains({ ...oval, shape: 'rect' }, 0.1, 0.1)).toBe(true);
  });

  it('keep their plants’ spreading inside the bed — and keep outsiders out', () => {
    const state = createNewGame();
    state.gardenBeds.push({ id: 'bed', x: 50, y: 20, w: 3, h: 3, shape: 'rect', createdAt: 0 });
    const inBed = wild(state, 'in', 51.5, 21.5, STAGE_AT.specimen);
    (inBed.location as { bedId?: string }).bedId = 'bed';
    wild(state, 'out', 55.5, 21.5, STAGE_AT.specimen);
    const rand = mulberry32(9);
    for (let i = 0; i < 600; i++) spreadStep(state, () => true, 0, rand);
    const kids = Object.values(state.plants).filter((p) => p.bornWild && p.location.kind === 'wild');
    const bedKids = kids.filter((k) => (k.location as { bedId?: string }).bedId === 'bed');
    expect(bedKids.length).toBeGreaterThan(0);
    for (const k of kids) {
      const l = k.location as { x: number; y: number; bedId?: string };
      const inside = bedContains(state.gardenBeds[0], l.x, l.y);
      expect(inside).toBe(l.bedId === 'bed');
    }
    // Everything the bed plant spawned stayed inside the bed.
    expect(bedKids.every((k) => bedContains(state.gardenBeds[0], (k.location as { x: number }).x, (k.location as { y: number }).y))).toBe(true);
  });

  it('are good ground: plants in them grow a little faster, and keep growing over time', () => {
    const state = createNewGame();
    const a = wild(state, 'a', 51, 21, STAGE_AT.young);
    const b = wild(state, 'b', 70, 21, STAGE_AT.young);
    state.gardenBeds.push({ id: 'bed', x: 50, y: 20, w: 3, h: 3, shape: 'rect', createdAt: 0 });
    (a.location as { bedId?: string }).bedId = 'bed';
    expect(growthMultiplier(state, a)).toBeGreaterThan(growthMultiplier(state, b));
    advanceWorld(state, 2000, 0, () => true, mulberry32(1));
    expect(a.growth).toBeGreaterThan(b.growth);
    expect(a.growth).toBeGreaterThan(STAGE_AT.large);
  });

  it('can be filled back in: the plants stay, free to roam, with half the compost back', () => {
    const state = createNewGame();
    state.compost = 10;
    wild(state, 'p', 51.5, 21.5, STAGE_AT.young);
    const res = createBed(state, { x: 50, y: 20, w: 3, h: 3, shape: 'rect' }, world(), 0)!;
    const left = state.compost;
    expect(removeBed(state, res.bed.id)).toBe(true);
    expect(state.gardenBeds).toHaveLength(0);
    expect(state.plants.p).toBeDefined();
    expect((state.plants.p.location as { bedId?: string }).bedId).toBeUndefined();
    expect(state.compost).toBe(left + Math.floor(bedCost(3, 3) / 2));
  });
});

describe('carved paths', () => {
  const route = [
    { x: 58, y: 34 },
    { x: 60, y: 34.2 },
    { x: 62.5, y: 34.4 },
    { x: 65, y: 34.5 },
  ];

  it('are traced as a compact, thinned route', () => {
    const pts = simplifyRoute([...route, { x: 65.05, y: 34.5 }]);
    expect(pts.length % 2).toBe(0);
    expect(pts.length / 2).toBeLessThanOrEqual(8);
    expect(pts.slice(0, 2)).toEqual([58, 34]);
  });

  it('clear the scrub in the way and compost your plants that stood on the route', () => {
    const state = createNewGame();
    wild(state, 'inWay', 61, 34.2, STAGE_AT.large);
    wild(state, 'besides', 61, 36.5, STAGE_AT.large);
    const pts = simplifyRoute(route);
    const w = world({ '61,34': 'bush' });
    const preview = previewPath(state, pts, w);
    expect(preview.block).toBeNull();
    expect(preview.plants.map((p) => p.id)).toEqual(['inWay']);
    const res = createPath(state, pts, w, 100)!;
    expect(res.composted).toBe(1);
    expect(state.plants.inWay).toBeUndefined();
    expect(state.plants.besides).toBeDefined();
    expect(state.compost).toBe(res.compost);
    expect(state.clearedObstacles).toContain('61,34');
    expect(onPath(state, 62, 34.3, 100)).toBeDefined();
  });

  it('won’t go through trees, rocks, water or a garden bed', () => {
    const state = createNewGame();
    expect(previewPath(state, simplifyRoute([{ x: 58, y: 30.5 }, { x: 62, y: 30.5 }]), world()).block).toBe('blocked');
    expect(previewPath(state, simplifyRoute([{ x: 38, y: 20 }, { x: 45, y: 20 }]), world()).block).toBe('blocked');
    state.gardenBeds.push({ id: 'bed', x: 59, y: 33, w: 3, h: 3, shape: 'rect', createdAt: 0 });
    expect(previewPath(state, simplifyRoute(route), world()).block).toBe('bed');
    expect(previewPath(state, simplifyRoute([{ x: 50, y: 50 }, { x: 50.5, y: 50 }]), world()).block).toBe('too-short');
  });

  it('stay clear down the middle, while the verges slowly grow back in', () => {
    const state = createNewGame();
    const pts = simplifyRoute(route);
    const path = createPath(state, pts, world(), 0)!.path;
    // New seedlings can't come up on a fresh path at all…
    expect(onPath(state, 61, 34.2 + 0.5, 0, true)).toBeDefined();
    // …but after a few days they can take hold along its edges, never the middle.
    const later = ENCROACH_MINUTES;
    expect(encroachment(path, later)).toBe(1);
    expect(onPath(state, 61, 34.2 + 0.5, later, true)).toBeUndefined();
    expect(onPath(state, 61, 34.25, later, true)).toBeDefined();
    // Spreading respects it: nothing seeds onto the walking line.
    wild(state, 'p', 61, 36, STAGE_AT.specimen);
    const rand = mulberry32(5);
    for (let i = 0; i < 400; i++) spreadStep(state, () => true, 0, rand);
    for (const k of Object.values(state.plants).filter((p) => p.bornWild)) {
      expect(onPath(state, (k.location as { x: number }).x, (k.location as { y: number }).y, 0, true)).toBeUndefined();
    }
  });

  it('can be let go again, and reshaped by carving a new one', () => {
    const state = createNewGame();
    const res = createPath(state, simplifyRoute(route), world(), 0)!;
    expect(removePath(state, res.path.id)).toBe(true);
    expect(state.paths).toHaveLength(0);
    expect(createPath(state, simplifyRoute(route.map((p) => ({ x: p.x, y: p.y + 2 }))), world(), 0)).not.toBeNull();
    expect(state.paths).toHaveLength(1);
  });
});

describe('garden trellis', () => {
  it('is sold as garden decor, and a vine planted at its foot climbs it', async () => {
    const { createNewGame } = await import('../src/game/state');
    const { buyItem } = await import('../src/game/systems/market');
    const { placeDecor, trellisAt } = await import('../src/game/systems/decor');
    const { climbsTrellis } = await import('../src/game/systems/furniture');
    const { PLANTS } = await import('../src/game/data/plants');
    const state = createNewGame();
    state.coins = 500;
    expect(buyItem(state, 'gardenTrellis')).toBe(true);
    expect(state.decorStock.gardenTrellis).toBe(1);
    const t = placeDecor(state, 'gardenTrellis', 60.5, 42.5)!;
    expect(t).not.toBeNull();
    // Right at its foot, in front: climbs. Behind it, or off to one side: doesn't.
    expect(trellisAt(state, t.x, t.y + 0.3)?.id).toBe(t.id);
    expect(trellisAt(state, t.x + 0.4, t.y + 0.6)?.id).toBe(t.id);
    expect(trellisAt(state, t.x, t.y - 0.5)).toBeNull();
    expect(trellisAt(state, t.x + 1.2, t.y + 0.3)).toBeNull();
    expect(climbsTrellis(PLANTS.pothos.form)).toBe(true);
    expect(climbsTrellis(PLANTS.monstera.form)).toBe(false);
  });

  it('lets a plant go in right at its foot, where other decor needs room around it', async () => {
    const { createNewGame } = await import('../src/game/state');
    const { checkPlanting } = await import('../src/game/systems/landscape');
    const state = createNewGame();
    const world = { isBuiltOrWater: () => false, obstacleAt: () => null, isSpot: () => false };
    state.decor.push({ id: 't', decorId: 'gardenTrellis', x: 60.5, y: 42.5 }, { id: 'b', decorId: 'birdbath', x: 64.5, y: 42.5 });
    expect(checkPlanting(state, 'pothos', 60.5, 42.8, world as never, 0).block).not.toBe('decor');
    expect(checkPlanting(state, 'pothos', 64.5, 42.8, world as never, 0).block).toBe('decor');
    // Not behind it, though: that's where the lattice is.
    expect(checkPlanting(state, 'pothos', 60.5, 42.2, world as never, 0).block).toBe('decor');
  });
});
