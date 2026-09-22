import type { PlantDef } from '../types';

// Stage durations are in game-minutes of *matched* growing conditions.
// Mismatched conditions simply pause progress (dormancy) — they never harm
// or kill the plant. See systems/plantGrowth.ts.

export const PLANTS: Record<string, PlantDef> = {
  bluebell: {
    id: 'bluebell',
    name: 'Bluebell',
    kind: 'plant',
    rarity: 'common',
    zones: ['woodland'],
    description: 'A nodding bell-shaped flower that carpets the woodland edge in early light.',
    silhouetteHint: 'A cluster of drooping bells on a slender stem.',
    preferredConditions: { soil: 'loam', water: 'moist', light: 'partialShade', temp: 'temperate', nutrients: 'moderate' },
    baseTraits: { growthRate: 45, size: 30, colorHue: 225, hardiness: 55, yield: 40, waterTolerance: 35, lightTolerance: 40, pollinatorAttraction: 55 },
    collectMethod: 'pluck',
    stageDurations: { CULTIVATED: 4, IMPROVED: 8, MATURE: 10, COMPLETE: 12 },
    ecologyNotes: {
      known: ['Visited by the Bluewing Butterfly for nectar.', 'Garden Lizards shelter beneath dense clumps.'],
      unknown: ['How its seed behaves once dropped.', 'What happens to it over winter.'],
    },
  },

  meadowClover: {
    id: 'meadowClover',
    name: 'Meadow Clover',
    kind: 'plant',
    rarity: 'common',
    zones: ['meadow'],
    description: 'Low, dense clover that seems to enrich whatever soil it grows in.',
    silhouetteHint: 'Three-lobed leaves, low to the ground.',
    preferredConditions: { soil: 'loam', water: 'moist', light: 'fullSun', temp: 'temperate', nutrients: 'moderate' },
    baseTraits: { growthRate: 65, size: 15, colorHue: 340, hardiness: 70, yield: 55, waterTolerance: 45, lightTolerance: 30, pollinatorAttraction: 60 },
    collectMethod: 'pluck',
    stageDurations: { CULTIVATED: 3, IMPROVED: 5, MATURE: 6, COMPLETE: 7 },
    ecologyNotes: {
      known: ['Draws Honeybees reliably.', 'Seems to leave soil richer than it found it.'],
      unknown: ['Why nearby plants sometimes grow faster.'],
    },
  },

  sundropDaisy: {
    id: 'sundropDaisy',
    name: 'Sundrop Daisy',
    kind: 'plant',
    rarity: 'common',
    zones: ['meadow'],
    description: 'A bright, sun-tracking daisy that pollinators can\'t seem to resist.',
    silhouetteHint: 'A wide yellow face that turns through the day.',
    preferredConditions: { soil: 'sandy', water: 'dry', light: 'fullSun', temp: 'warm', nutrients: 'lean' },
    baseTraits: { growthRate: 55, size: 35, colorHue: 48, hardiness: 60, yield: 50, waterTolerance: 25, lightTolerance: 20, pollinatorAttraction: 85 },
    collectMethod: 'pluck',
    stageDurations: { CULTIVATED: 4, IMPROVED: 7, MATURE: 9, COMPLETE: 11 },
    propagatesTo: ['duskstarBloom'],
    ecologyNotes: {
      known: ['Among the most visited flowers by Honeybees.', 'Rarely bothered by pests.'],
      unknown: ['Whether its pollinator draw can be bred even higher.'],
    },
  },

  creekflagIris: {
    id: 'creekflagIris',
    name: 'Creekflag Iris',
    kind: 'plant',
    rarity: 'uncommon',
    zones: ['creek'],
    description: 'A tall iris that grips the creek bank with a dense root mat.',
    silhouetteHint: 'Sword-like leaves standing in shallow water.',
    preferredConditions: { soil: 'clay', water: 'wet', light: 'fullSun', temp: 'temperate', nutrients: 'rich' },
    baseTraits: { growthRate: 40, size: 55, colorHue: 260, hardiness: 50, yield: 30, waterTolerance: 20, lightTolerance: 45, pollinatorAttraction: 35 },
    collectMethod: 'trowel',
    requiresToolTier: { tool: 'trowel', tier: 1 },
    stageDurations: { CULTIVATED: 5, IMPROVED: 9, MATURE: 12, COMPLETE: 14 },
    propagatesTo: ['duskstarBloom'],
    ecologyNotes: {
      known: ['Roots stabilize the creek bank against erosion.', 'Dragonfly nymphs shelter among its roots.'],
      unknown: ['Whether it could survive somewhere drier.'],
    },
  },

  duskvine: {
    id: 'duskvine',
    name: 'Duskvine',
    kind: 'plant',
    rarity: 'uncommon',
    zones: ['woodland'],
    description: 'A climbing vine whose pale flowers only open after dark.',
    silhouetteHint: 'Closed buds along a twisting vine — until nightfall.',
    preferredConditions: { soil: 'loam', water: 'moist', light: 'partialShade', temp: 'cool', nutrients: 'moderate' },
    baseTraits: { growthRate: 35, size: 40, colorHue: 280, hardiness: 45, yield: 35, waterTolerance: 30, lightTolerance: 55, pollinatorAttraction: 50 },
    collectMethod: 'shears',
    requiresToolTier: { tool: 'shears', tier: 1 },
    weatherRequirement: 'night',
    stageDurations: { CULTIVATED: 5, IMPROVED: 9, MATURE: 11, COMPLETE: 13 },
    ecologyNotes: {
      known: ['Flowers open only at night.', 'Moths visit in numbers after dusk.'],
      unknown: ['What pollinates it in daylight, if anything does.'],
    },
  },

  blueFern: {
    id: 'blueFern',
    name: 'Blue Fern',
    kind: 'plant',
    rarity: 'rare',
    zones: ['dampForest'],
    description: 'A fern with an unmistakable deep blue cast, found only in the wettest shade.',
    silhouetteHint: 'Feathered fronds with an odd, cold-toned sheen.',
    preferredConditions: { soil: 'peaty', water: 'wet', light: 'fullShade', temp: 'cool', nutrients: 'rich' },
    baseTraits: { growthRate: 20, size: 45, colorHue: 210, hardiness: 65, yield: 20, waterTolerance: 15, lightTolerance: 15, pollinatorAttraction: 10 },
    collectMethod: 'trowel',
    requiresToolTier: { tool: 'lens', tier: 2 },
    seedFoundSeparately: true,
    stageDurations: { CULTIVATED: 8, IMPROVED: 14, MATURE: 18, COMPLETE: 22 },
    ecologyNotes: {
      known: ['Slow growing, but the coloration deepens with age.', 'Extremely shade tolerant.'],
      unknown: ['Why the blue coloration occurs at all.'],
    },
  },

  stonecropSedum: {
    id: 'stonecropSedum',
    name: 'Stonecrop Sedum',
    kind: 'plant',
    rarity: 'common',
    zones: ['rockyClearing'],
    description: 'A tough succulent that thrives where almost nothing else can.',
    silhouetteHint: 'Fat, rounded leaves clinging to bare rock.',
    preferredConditions: { soil: 'sandy', water: 'dry', light: 'fullSun', temp: 'warm', nutrients: 'lean' },
    baseTraits: { growthRate: 30, size: 20, colorHue: 100, hardiness: 90, yield: 45, waterTolerance: 10, lightTolerance: 15, pollinatorAttraction: 25 },
    collectMethod: 'pluck',
    stageDurations: { CULTIVATED: 5, IMPROVED: 8, MATURE: 10, COMPLETE: 12 },
    ecologyNotes: {
      known: ['Holds thin rocky soil in place.', 'Rarely damaged by insects.'],
      unknown: ['Whether it competes with anything for this exposed ground.'],
    },
  },

  widowsLace: {
    id: 'widowsLace',
    name: "Widow's Lace",
    kind: 'plant',
    rarity: 'uncommon',
    zones: ['overgrownClearing'],
    description: 'A fast-spreading flowering vine that has taken over the clearing. Beautiful, and a problem.',
    silhouetteHint: 'Delicate white lace-like flowers over a dense tangle.',
    preferredConditions: { soil: 'loam', water: 'moist', light: 'partialShade', temp: 'warm', nutrients: 'rich' },
    baseTraits: { growthRate: 90, size: 60, colorHue: 0, hardiness: 85, yield: 70, waterTolerance: 40, lightTolerance: 50, pollinatorAttraction: 40 },
    collectMethod: 'shears',
    requiresToolTier: { tool: 'shears', tier: 1 },
    stageDurations: { CULTIVATED: 3, IMPROVED: 5, MATURE: 6, COMPLETE: 7 },
    ecologyNotes: {
      known: ['Spreads aggressively, crowding out slower neighbors.', 'Its dense tangle also shelters spiders and ground insects.', 'Stabilizes loose soil quickly.'],
      unknown: ['Whether it can be kept for its benefits without letting it spread.'],
    },
  },

  amberseedGrass: {
    id: 'amberseedGrass',
    name: 'Amberseed Grass',
    kind: 'plant',
    rarity: 'common',
    zones: ['meadow'],
    description: 'A resilient grass that tolerates almost any watering habit.',
    silhouetteHint: 'Golden seed heads nodding above tall blades.',
    preferredConditions: { soil: 'loam', water: 'moist', light: 'fullSun', temp: 'warm', nutrients: 'lean' },
    baseTraits: { growthRate: 60, size: 25, colorHue: 40, hardiness: 80, yield: 60, waterTolerance: 60, lightTolerance: 25, pollinatorAttraction: 20 },
    collectMethod: 'pluck',
    stageDurations: { CULTIVATED: 3, IMPROVED: 5, MATURE: 6, COMPLETE: 7 },
    ecologyNotes: {
      known: ['Tolerant of both drought and flood.', 'Good compost material.'],
      unknown: ['Why it never seems to attract pests.'],
    },
  },

  foxgloveSpire: {
    id: 'foxgloveSpire',
    name: 'Foxglove Spire',
    kind: 'plant',
    rarity: 'rare',
    zones: ['woodland', 'meadow'],
    description: 'A tall, freckled spire of bell-flowers that seems to mark where the fox has been.',
    silhouetteHint: 'A single tall spike of hanging bells, taller than the surrounding grass.',
    preferredConditions: { soil: 'loam', water: 'moist', light: 'partialShade', temp: 'temperate', nutrients: 'moderate' },
    baseTraits: { growthRate: 25, size: 70, colorHue: 320, hardiness: 40, yield: 25, waterTolerance: 25, lightTolerance: 35, pollinatorAttraction: 65 },
    collectMethod: 'shears',
    requiresToolTier: { tool: 'shears', tier: 2 },
    seedFoundSeparately: true,
    stageDurations: { CULTIVATED: 7, IMPROVED: 12, MATURE: 16, COMPLETE: 20 },
    ecologyNotes: {
      known: ['Strongly attractive to Bumblebees.', 'Rabbits and deer leave it alone entirely.'],
      unknown: ['Why nothing seems to graze on it.'],
    },
  },

  nightshadeBell: {
    id: 'nightshadeBell',
    name: '???',
    kind: 'plant',
    rarity: 'unknown',
    zones: ['overgrownClearing'],
    description: 'An unidentified flowering plant. The fox is unusually interested in it.',
    silhouetteHint: 'A dark, bell-shaped bloom, barely visible in the tangle.',
    preferredConditions: { soil: 'peaty', water: 'moist', light: 'partialShade', temp: 'cool', nutrients: 'rich' },
    baseTraits: { growthRate: 30, size: 40, colorHue: 270, hardiness: 35, yield: 15, waterTolerance: 20, lightTolerance: 20, pollinatorAttraction: 30 },
    collectMethod: 'trowel',
    requiresToolTier: { tool: 'fieldKit', tier: 1 },
    stageDurations: { CULTIVATED: 9, IMPROVED: 15, MATURE: 19, COMPLETE: 24 },
    ecologyNotes: {
      known: [],
      unknown: ['Everything. It has never been catalogued before.'],
    },
  },

  duskstarBloom: {
    id: 'duskstarBloom',
    name: 'Duskstar Bloom',
    kind: 'plant',
    rarity: 'rare',
    zones: [],
    description: 'A hybrid that exists nowhere in the wild — only in a greenhouse that made it possible.',
    silhouetteHint: 'A bloom with no wild counterpart.',
    preferredConditions: { soil: 'loam', water: 'moist', light: 'fullSun', temp: 'temperate', nutrients: 'rich' },
    baseTraits: { growthRate: 45, size: 45, colorHue: 285, hardiness: 55, yield: 40, waterTolerance: 35, lightTolerance: 35, pollinatorAttraction: 75 },
    collectMethod: 'pluck',
    stageDurations: { CULTIVATED: 6, IMPROVED: 10, MATURE: 13, COMPLETE: 15 },
    ecologyNotes: {
      known: ['Created in the greenhouse by combining Sundrop Daisy and Creekflag Iris.'],
      unknown: ['What it would do if introduced to the wild.'],
    },
  },
};

export const PLANT_LIST: PlantDef[] = Object.values(PLANTS);

/** Propagation recipes discovered through experimentation: two parent species → offspring. */
export interface PropagationRecipe {
  id: string;
  parentA: string;
  parentB: string;
  result: string;
  /** Minimum quality (0-100) both parents need before the recipe can succeed. */
  minParentQuality: number;
}

export const PROPAGATION_RECIPES: PropagationRecipe[] = [
  { id: 'duskstar', parentA: 'sundropDaisy', parentB: 'creekflagIris', result: 'duskstarBloom', minParentQuality: 55 },
];
