import type { FungusDef } from '../types';

export const FUNGI: Record<string, FungusDef> = {
  rainbellCap: {
    id: 'rainbellCap',
    name: 'Rainbell Cap',
    kind: 'fungus',
    rarity: 'common',
    zones: ['dampForest'],
    description: 'A pale mushroom that pushes up through moss within hours of rain, then vanishes.',
    silhouetteHint: 'Small pale caps, only after rain.',
    weatherRequirement: 'rain',
    ecologyNotes: {
      known: ['A food source for the Wood Mouse.'],
      unknown: ['How it grows and vanishes so quickly.'],
    },
  },
  embergillMushroom: {
    id: 'embergillMushroom',
    name: 'Embergill Mushroom',
    kind: 'fungus',
    rarity: 'uncommon',
    zones: ['woodland'],
    description: 'Gills that hold a faint glow long after the rain that brought them.',
    silhouetteHint: 'A faint warm glow under the canopy, after rain, after dark.',
    weatherRequirement: 'rain',
    requiresToolTier: { tool: 'lantern', tier: 1 },
    ecologyNotes: {
      known: ['Only visible after both rain and nightfall.'],
      unknown: ['What, if anything, the glow attracts.'],
    },
  },
  ashenBracket: {
    id: 'ashenBracket',
    name: 'Ashen Bracket',
    kind: 'fungus',
    rarity: 'rare',
    zones: ['woodland', 'rockyClearing'],
    description: 'A hard shelf fungus growing from dead wood, slowly breaking it down.',
    silhouetteHint: 'A grey shelf jutting from a fallen branch.',
    weatherRequirement: null,
    requiresToolTier: { tool: 'lens', tier: 1 },
    ecologyNotes: {
      known: ['Breaks down dead wood, enriching the soil beneath it.', 'Reduces the amount of dead wood available to Bark Beetles.'],
      unknown: ['Whether it could be introduced deliberately to manage beetle populations.'],
    },
  },
};

export const FUNGI_LIST: FungusDef[] = Object.values(FUNGI);
