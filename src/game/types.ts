// Core shared types for Foxtrot's data-driven systems.
// Adding new content (plants, creatures, tools, zones) means adding data,
// not touching these types or the systems that consume them.

export type ZoneId =
  | 'greenhouse'
  | 'meadow'
  | 'woodland'
  | 'creek'
  | 'dampForest'
  | 'rockyClearing'
  | 'overgrownClearing';

export type LightPref = 'fullSun' | 'partialShade' | 'fullShade';
export type WaterPref = 'dry' | 'moist' | 'wet';
export type TempPref = 'cool' | 'temperate' | 'warm';
export type NutrientPref = 'lean' | 'moderate' | 'rich';
export type SoilType = 'sandy' | 'loam' | 'clay' | 'peaty';

export interface GrowConditions {
  soil: SoilType;
  water: WaterPref;
  light: LightPref;
  temp: TempPref;
  nutrients: NutrientPref;
}

/** Traits are 0-100 unless noted; they roll with variance and can mutate on propagation. */
export interface TraitSet {
  growthRate: number; // higher = faster stage progression
  size: number;
  colorHue: number; // 0-360, purely cosmetic but inheritable
  hardiness: number; // tolerance for imperfect conditions
  yield: number; // seeds/cuttings produced on propagation
  waterTolerance: number; // range width around preferred water
  lightTolerance: number;
  pollinatorAttraction: number; // draws pollinators, boosts local ecosystem
  quality: number; // derived overall score, computed not stored directly
}

export type GrowthStage = 'WILD' | 'CULTIVATED' | 'IMPROVED' | 'MATURE' | 'COMPLETE';

export type DiscoveryLevel =
  | 'UNDISCOVERED'
  | 'DISCOVERED'
  | 'IDENTIFIED'
  | 'CULTIVATED'
  | 'DEVELOPED'
  | 'MASTERED'
  | 'PROPAGATED'
  | 'VARIANT_DISCOVERED';

export type SpecimenKind = 'plant' | 'fungus' | 'insect' | 'animal' | 'material' | 'unknown';

export type ToolId = 'basket' | 'shears' | 'lens' | 'trowel' | 'lantern' | 'fieldKit';

export interface ToolTierDef {
  tier: number;
  name: string;
  description: string;
  /** What this tier unlocks, shown to the player as a capability, not a gate. */
  unlocks: string[];
}

export interface ToolDef {
  id: ToolId;
  name: string;
  description: string;
  tiers: ToolTierDef[];
}

export type CollectMethod = 'pluck' | 'shears' | 'trowel' | 'byHand' | 'observe';

export interface PlantDef {
  id: string;
  name: string;
  kind: 'plant';
  rarity: 'common' | 'uncommon' | 'rare' | 'unknown';
  zones: ZoneId[];
  description: string;
  /** Shown before identification. */
  silhouetteHint: string;
  preferredConditions: GrowConditions;
  baseTraits: Partial<TraitSet>;
  collectMethod: CollectMethod;
  requiresToolTier?: { tool: ToolId; tier: number };
  /** Seeds may exist as a separate collectible found elsewhere in the wild. */
  seedFoundSeparately?: boolean;
  weatherRequirement?: 'rain' | 'clear' | 'night' | null;
  stageDurations: Record<Exclude<GrowthStage, 'WILD'>, number>; // in game-minutes of matched conditions
  propagatesTo?: string[]; // known hybrid results (for discovered recipes)
  ecologyNotes: { known: string[]; unknown: string[] };
}

export interface FungusDef {
  id: string;
  name: string;
  kind: 'fungus';
  rarity: 'common' | 'uncommon' | 'rare';
  zones: ZoneId[];
  description: string;
  silhouetteHint: string;
  weatherRequirement: 'rain' | 'clear' | 'night' | null;
  requiresToolTier?: { tool: ToolId; tier: number };
  ecologyNotes: { known: string[]; unknown: string[] };
}

export type RelationType =
  | 'predation'
  | 'pollination'
  | 'competition'
  | 'shelter'
  | 'soilEffect'
  | 'foodSource';

export interface EcosystemRelationship {
  id: string;
  source: string; // species id (creature or plant)
  target: string;
  type: RelationType;
  /** Positive = source benefits target's population; negative = suppresses it. */
  effect: number;
  description: string;
  discovered: boolean;
}

export interface CreatureDef {
  id: string;
  name: string;
  kind: 'insect' | 'animal';
  zones: ZoneId[];
  description: string;
  silhouetteHint: string;
  nocturnal?: boolean;
  requiresToolTier?: { tool: ToolId; tier: number };
  basePopulation: number;
  ecologyNotes: { known: string[]; unknown: string[] };
}

export interface DiscoveryPoint {
  id: string;
  zone: ZoneId;
  x: number;
  y: number;
  specimenId: string;
  specimenKind: SpecimenKind;
  requiresWeather?: 'rain' | 'clear' | 'night' | null;
  requiresToolTier?: { tool: ToolId; tier: number };
  /** If true, only revealed after the fox has led the player near it once. */
  foxLed?: boolean;
  respawns?: boolean; // seeds/materials that can be found again
}

export interface StationDef {
  id: string;
  name: string;
  x: number;
  y: number;
  kind: 'growBed' | 'propagationBench' | 'seedStorage' | 'soilStation' | 'compost' | 'research' | 'display';
}
