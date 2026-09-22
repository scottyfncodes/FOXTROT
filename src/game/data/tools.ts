import type { ToolDef } from '../types';

export const TOOLS: Record<string, ToolDef> = {
  basket: {
    id: 'basket',
    name: 'Field Basket',
    description: 'Carries what you collect.',
    tiers: [
      { tier: 1, name: 'Woven Basket', description: 'A simple carrier.', unlocks: ['Carry up to 6 specimens'] },
      { tier: 2, name: 'Reinforced Basket', description: 'Sturdier, with more room.', unlocks: ['Carry up to 12 specimens'] },
      { tier: 3, name: 'Collector\'s Pack', description: 'A proper field pack.', unlocks: ['Carry up to 20 specimens'] },
    ],
  },
  shears: {
    id: 'shears',
    name: 'Shears',
    description: 'For taking cuttings without harming the source plant.',
    tiers: [
      { tier: 1, name: 'Garden Shears', description: 'Clean cuts on soft stems.', unlocks: ['Collect vines and woody cuttings'] },
      { tier: 2, name: 'Precision Shears', description: 'Delicate enough for rare specimens.', unlocks: ['Collect rare and fragile cuttings'] },
    ],
  },
  lens: {
    id: 'lens',
    name: 'Hand Lens',
    description: 'Reveals detail invisible to the naked eye.',
    tiers: [
      { tier: 1, name: 'Hand Lens', description: 'Basic magnification.', unlocks: ['Identify common species on sight', 'Notice subtle wildlife'] },
      { tier: 2, name: 'Loupe', description: 'Sharper, brighter.', unlocks: ['Identify rare species', 'Reveal fine plant traits'] },
    ],
  },
  trowel: {
    id: 'trowel',
    name: 'Trowel',
    description: 'For roots, bulbs, and soil.',
    tiers: [
      { tier: 1, name: 'Hand Trowel', description: 'Digs without disturbing the roots.', unlocks: ['Collect roots and bulbs', 'Take soil samples'] },
    ],
  },
  lantern: {
    id: 'lantern',
    name: 'Lantern',
    description: 'Reveals what only shows itself in darkness.',
    tiers: [
      { tier: 1, name: 'Oil Lantern', description: 'A warm, steady light.', unlocks: ['See in dark areas', 'Notice nocturnal wildlife'] },
    ],
  },
  fieldKit: {
    id: 'fieldKit',
    name: 'Field Kit',
    description: 'Analyzes specimens and soil in detail.',
    tiers: [
      { tier: 1, name: 'Field Analysis Kit', description: 'Basic chemical and structural analysis.', unlocks: ['Identify unknown specimens', 'Read exact soil/water/light preferences'] },
    ],
  },
};

export const TOOL_LIST: ToolDef[] = Object.values(TOOLS);
