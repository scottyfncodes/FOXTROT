import type { OutdoorZoneId, ZoneId } from './types';
import type { DecorId, FurnitureId } from './data/shop';
import { PLAYER_START } from './data/worldMap';

// Bump SAVE_VERSION when the state shape changes; SaveManager.migrateSave
// fills new fields from createNewGame(). The storage key stays fixed.
export const SAVE_VERSION = 5;
export const SAVE_KEY = 'foxtrot-save-v4';

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

export type GrowthStage = 'cutting' | 'young' | 'established' | 'large' | 'specimen';

/** Where an owned plant lives. Every plant the player has is exactly one of these. */
export type PlantLocation =
  | { kind: 'nursery'; bedId: string }
  | { kind: 'display'; slotId: string; potId: string }
  | { kind: 'wild'; x: number; y: number; zone: OutdoorZoneId };

export interface OwnedPlant {
  id: string;
  defId: string;
  variantId: string;
  /** Drives this individual's shape: leaf angles, lean, flip. */
  seed: number;
  /** Accumulated growth, in effective game-minutes. Stage is derived from it. */
  growth: number;
  location: PlantLocation;
  plantedAt: number;
  lastCuttingAt: number | null;
  /** 0 for a plant raised from a wild find; +1 for every cutting or seedling down the line. */
  generation: number;
  /** Sprouted by itself from one of the player's outdoor plants. */
  bornWild: boolean;
  /** A wild-born sport the player hasn't walked up to yet. */
  unnoticed?: boolean;
  /** Has counted toward its species' "grown" tally (reached established while in the player's care). */
  countedGrown?: boolean;
}

/** A plant being carried: a fresh cutting (growth 0) or a potted plant lifted from somewhere. */
export interface BasketItem {
  uid: string;
  defId: string;
  variantId: string;
  seed: number;
  growth: number;
  generation: number;
  origin: 'wild' | 'cutting' | 'lifted';
  collectedAt: number;
  countedGrown?: boolean;
}

export interface SpeciesRecord {
  foundAt: number;
  variants: string[];
  grown: number;
  propagated: number;
  sold: number;
  earned: number;
  plantedOut: number;
  displayed: number;
}

export interface SpotState {
  collectedEpoch?: number;
  revealed?: boolean;
}

export interface PlacedFurniture {
  id: string;
  kind: FurnitureId;
  /** Greenhouse tile. */
  x: number;
  y: number;
}

export interface PlacedDecor {
  id: string;
  decorId: DecorId;
  x: number;
  y: number;
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

export type ScottActivity = 'traveling' | 'tinkering' | 'napping' | 'snacking' | 'golfing' | 'putting';

export interface ScottState {
  x: number;
  y: number;
  zone: ZoneId;
  facing: Facing;
  activity: ScottActivity;
  currentSpotId: string | null;
  targetSpotId: string;
  nextChangeAt: number;
}

export type CatActivity = 'wandering' | 'sitting' | 'grooming' | 'sleeping';

export interface CatState {
  x: number;
  y: number;
  facing: Facing;
  activity: CatActivity;
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
  coins: number;
  /** One-off shop purchases. */
  owned: string[];
  /** Garden decor bought but not yet placed. */
  decorStock: Partial<Record<DecorId, number>>;
  decor: PlacedDecor[];
  /** Greenhouse furniture bought but not yet placed. */
  furnitureStock: Partial<Record<FurnitureId, number>>;
  /** Stands, hooks and trellises the player has placed indoors; each holds one plant. */
  furniture: PlacedFurniture[];
  tools: { lantern: number };
  basket: BasketItem[];
  plants: Record<string, OwnedPlant>;
  collection: Record<string, SpeciesRecord>;
  spots: Record<string, SpotState>;
  /** One-time guidance already shown. */
  hints: string[];
  fox: FoxState;
  scout: ScoutState;
  scott: ScottState;
  cat: CatState;
  /** Today's sales by species, so repeat sales of one plant fetch less. */
  market: { day: number; sold: Record<string, number> };
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
    coins: 20,
    owned: [],
    decorStock: {},
    decor: [],
    furnitureStock: {},
    furniture: [],
    tools: { lantern: 0 },
    basket: [],
    plants: {},
    collection: {},
    spots: {},
    hints: [],
    fox: { x: PLAYER_START.x + 4, y: PLAYER_START.y + 2, zone: 'meadow', behavior: 'idle', targetDiscoveryId: null, nextEventAt: 8 * 60 + 5, visible: true },
    scout: { x: PLAYER_START.x - 0.8, y: PLAYER_START.y + 0.8, facing: 'down', behavior: 'following', nextEventAt: 8 * 60 + 10 },
    scott: {
      x: 8,
      y: 7,
      zone: 'greenhouse',
      facing: 'down',
      activity: 'tinkering',
      currentSpotId: 'greenhouse-tinker',
      targetSpotId: 'greenhouse-tinker',
      nextChangeAt: 8 * 60 + 20,
    },
    market: { day: 0, sold: {} },
    cat: {
      x: 16,
      y: 5,
      facing: 'down',
      activity: 'sitting',
      currentSpotId: 'sunny-perch',
      targetSpotId: 'sunny-perch',
      nextChangeAt: 8 * 60 + 15,
    },
  };
}
