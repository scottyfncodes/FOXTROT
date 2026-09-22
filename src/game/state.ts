import type { DiscoveryLevel, GrowConditions, GrowthStage, SpecimenKind, ToolId, TraitSet, ZoneId } from './types';
import { PLAYER_START } from './data/worldMap';

export const SAVE_VERSION = 3;
export const SAVE_KEY = 'foxtrot-save-v3';

export type Facing = 'up' | 'down' | 'left' | 'right';

export interface PlayerState {
  x: number;
  y: number;
  facing: Facing;
  inGreenhouse: boolean;
}

export interface ClockState {
  totalMinutes: number;
  lastRealTimestamp: number;
}

export type WeatherCondition = 'clear' | 'rain' | 'overcast';

export interface WeatherState {
  condition: WeatherCondition;
  nextChangeAt: number;
}

export interface InventoryItem {
  uid: string;
  defId: string;
  kind: SpecimenKind;
  count: number;
  traits?: TraitSet;
  quality?: number;
  collectedAt: number;
}

export interface PlantInstance {
  id: string;
  defId: string;
  stationId: string;
  stage: GrowthStage;
  traits: TraitSet;
  conditions: GrowConditions;
  progressMinutes: number;
  plantedAt: number;
  dormant: boolean;
  matchQualityAccum: number;
  matchSamples: number;
  qualityEstimate: number;
  harvested: boolean;
}

export interface JournalEntry {
  specimenId: string;
  kind: SpecimenKind;
  level: DiscoveryLevel;
  firstSeenAt: number;
  timesCollected: number;
  propagatedCount: number;
  variantFound: boolean;
}

export interface DiscoveryPointState {
  lastCollectedAt: number | null;
  revealed: boolean;
}

export type FoxBehavior = 'idle' | 'wandering' | 'leading' | 'paused' | 'gone';

export interface FoxState {
  x: number;
  y: number;
  zone: ZoneId;
  behavior: FoxBehavior;
  targetDiscoveryId: string | null;
  nextEventAt: number;
  visible: boolean;
}

export type ScoutBehavior = 'following' | 'idleSit' | 'idleSniff' | 'idleLook' | 'noticing';

export interface ScoutState {
  x: number;
  y: number;
  facing: Facing;
  behavior: ScoutBehavior;
  nextEventAt: number;
}

export interface WildIntroduction {
  defId: string;
  zone: ZoneId;
  introducedAt: number;
}

export type TheoActivity = 'traveling' | 'tinkering' | 'napping' | 'snacking';

export interface TheoState {
  x: number;
  y: number;
  zone: ZoneId;
  facing: Facing;
  activity: TheoActivity;
  currentSpotId: string | null;
  targetSpotId: string;
  nextChangeAt: number;
}

export interface GameState {
  version: number;
  createdAt: number;
  player: PlayerState;
  clock: ClockState;
  weather: WeatherState;
  tools: Record<ToolId, number>;
  inventory: InventoryItem[];
  journal: Record<string, JournalEntry>;
  discoveredRelationships: string[];
  plantInstances: Record<string, PlantInstance>;
  stationOccupancy: Record<string, string | null>;
  discoveryPoints: Record<string, DiscoveryPointState>;
  ecosystem: Record<string, Record<string, number>>; // zone -> speciesId -> population 0-100
  wildIntroductions: WildIntroduction[];
  fox: FoxState;
  scout: ScoutState;
  theo: TheoState;
  toastSeen: string[];
}

let uidCounter = 0;
export function makeUid(prefix: string): string {
  uidCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${uidCounter}`;
}

export function createNewGame(): GameState {
  const now = Date.now();
  return {
    version: SAVE_VERSION,
    createdAt: now,
    player: { x: PLAYER_START.x, y: PLAYER_START.y, facing: 'down', inGreenhouse: false },
    clock: { totalMinutes: 8 * 60, lastRealTimestamp: now },
    weather: { condition: 'clear', nextChangeAt: 8 * 60 + 180 },
    tools: { basket: 1, shears: 0, lens: 0, trowel: 0, lantern: 0, fieldKit: 0 },
    inventory: [],
    journal: {},
    discoveredRelationships: [],
    plantInstances: {},
    stationOccupancy: {},
    discoveryPoints: {},
    ecosystem: {},
    wildIntroductions: [],
    fox: { x: PLAYER_START.x + 4, y: PLAYER_START.y + 2, zone: 'meadow', behavior: 'idle', targetDiscoveryId: null, nextEventAt: 8 * 60 + 5, visible: true },
    scout: { x: PLAYER_START.x - 0.8, y: PLAYER_START.y + 0.8, facing: 'down', behavior: 'following', nextEventAt: 8 * 60 + 10 },
    theo: {
      x: 5,
      y: 7,
      zone: 'greenhouse',
      facing: 'down',
      activity: 'tinkering',
      currentSpotId: 'greenhouse-tinker',
      targetSpotId: 'greenhouse-tinker',
      nextChangeAt: 8 * 60 + 20,
    },
    toastSeen: [],
  };
}
