import type { DiscoveryPoint } from '../types';

// Hand-placed collectible locations across the wilderness. Positions are in
// overworld tiles (see worldMap.ts). Not everything is reachable
// immediately — some require a tool tier, some only appear in certain
// weather, and a few are only found by following the fox.

export const DISCOVERY_POINTS: DiscoveryPoint[] = [
  // Woodland
  { id: 'dp-bluebell-1', zone: 'woodland', x: 10, y: 10, specimenId: 'bluebell', specimenKind: 'plant', respawns: true },
  { id: 'dp-bluebell-2', zone: 'woodland', x: 25, y: 20, specimenId: 'bluebell', specimenKind: 'plant', respawns: true },
  { id: 'dp-duskvine', zone: 'woodland', x: 18, y: 8, specimenId: 'duskvine', specimenKind: 'plant', requiresWeather: 'night', requiresToolTier: { tool: 'shears', tier: 1 }, respawns: true },
  { id: 'dp-foxglove', zone: 'woodland', x: 30, y: 25, specimenId: 'foxgloveSpire', specimenKind: 'plant', requiresToolTier: { tool: 'shears', tier: 2 }, foxLed: true, respawns: true },
  { id: 'dp-ashenbracket-1', zone: 'woodland', x: 5, y: 27, specimenId: 'ashenBracket', specimenKind: 'fungus', requiresToolTier: { tool: 'lens', tier: 1 }, respawns: false },
  { id: 'dp-soil-woodland', zone: 'woodland', x: 33, y: 5, specimenId: 'soilSampleWoodland', specimenKind: 'material', requiresToolTier: { tool: 'trowel', tier: 1 }, respawns: true },

  // Overgrown Clearing
  { id: 'dp-lace-1', zone: 'overgrownClearing', x: 10, y: 45, specimenId: 'widowsLace', specimenKind: 'plant', requiresToolTier: { tool: 'shears', tier: 1 }, respawns: true },
  { id: 'dp-lace-2', zone: 'overgrownClearing', x: 20, y: 55, specimenId: 'widowsLace', specimenKind: 'plant', requiresToolTier: { tool: 'shears', tier: 1 }, respawns: true },
  { id: 'dp-nightshade', zone: 'overgrownClearing', x: 28, y: 50, specimenId: 'nightshadeBell', specimenKind: 'plant', requiresToolTier: { tool: 'fieldKit', tier: 1 }, foxLed: true, respawns: false },
  { id: 'dp-oddpod', zone: 'overgrownClearing', x: 15, y: 38, specimenId: 'oddSeedPod', specimenKind: 'material', respawns: true },

  // Damp Forest
  { id: 'dp-bluefern', zone: 'dampForest', x: 55, y: 15, specimenId: 'blueFern', specimenKind: 'plant', requiresToolTier: { tool: 'lens', tier: 2 }, respawns: false },
  { id: 'dp-rainbell', zone: 'dampForest', x: 65, y: 18, specimenId: 'rainbellCap', specimenKind: 'fungus', requiresWeather: 'rain', respawns: true },
  { id: 'dp-embergill', zone: 'dampForest', x: 70, y: 10, specimenId: 'embergillMushroom', specimenKind: 'fungus', requiresWeather: 'rain', requiresToolTier: { tool: 'lantern', tier: 1 }, foxLed: true, respawns: true },

  // Meadow
  { id: 'dp-clover', zone: 'meadow', x: 50, y: 28, specimenId: 'meadowClover', specimenKind: 'plant', respawns: true },
  { id: 'dp-daisy', zone: 'meadow', x: 80, y: 30, specimenId: 'sundropDaisy', specimenKind: 'plant', respawns: true },
  { id: 'dp-amberseed', zone: 'meadow', x: 50, y: 42, specimenId: 'amberseedGrass', specimenKind: 'plant', respawns: true },
  { id: 'dp-soil-meadow', zone: 'meadow', x: 85, y: 26, specimenId: 'soilSampleMeadow', specimenKind: 'material', requiresToolTier: { tool: 'trowel', tier: 1 }, respawns: true },

  // Rocky Clearing
  { id: 'dp-sedum', zone: 'rockyClearing', x: 55, y: 55, specimenId: 'stonecropSedum', specimenKind: 'plant', respawns: true },
  { id: 'dp-ashenbracket-2', zone: 'rockyClearing', x: 80, y: 50, specimenId: 'ashenBracket', specimenKind: 'fungus', requiresToolTier: { tool: 'lens', tier: 1 }, respawns: false },
  { id: 'dp-ore', zone: 'rockyClearing', x: 75, y: 58, specimenId: 'roughOre', specimenKind: 'material', requiresToolTier: { tool: 'trowel', tier: 1 }, respawns: true },

  // Creek
  { id: 'dp-iris-1', zone: 'creek', x: 42, y: 20, specimenId: 'creekflagIris', specimenKind: 'plant', requiresToolTier: { tool: 'trowel', tier: 1 }, respawns: true },
  { id: 'dp-iris-2', zone: 'creek', x: 43, y: 50, specimenId: 'creekflagIris', specimenKind: 'plant', requiresToolTier: { tool: 'trowel', tier: 1 }, respawns: true },
  { id: 'dp-pebbles', zone: 'creek', x: 39, y: 35, specimenId: 'creekPebbles', specimenKind: 'material', respawns: true },
];

export const RESPAWN_MINUTES = 20; // game-minutes before a plucked common specimen reappears
