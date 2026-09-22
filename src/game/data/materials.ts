export interface MaterialDef {
  id: string;
  name: string;
  description: string;
  silhouetteHint: string;
  /** What this material is useful for, shown once identified. */
  use: string;
  unknown?: boolean;
}

export const MATERIALS: Record<string, MaterialDef> = {
  soilSampleWoodland: {
    id: 'soilSampleWoodland',
    name: 'Woodland Soil Sample',
    description: 'Dark, loose loam rich with leaf litter.',
    silhouetteHint: 'A handful of dark earth.',
    use: 'Used at the Soil Station to prepare loam for growing beds.',
  },
  soilSampleMeadow: {
    id: 'soilSampleMeadow',
    name: 'Meadow Soil Sample',
    description: 'Sandy, sun-warmed topsoil.',
    silhouetteHint: 'A handful of pale, gritty earth.',
    use: 'Used at the Soil Station to prepare sandy soil for growing beds.',
  },
  oddSeedPod: {
    id: 'oddSeedPod',
    name: 'Odd Seed Pod',
    description: 'A dry, woody pod of uncertain origin. Nothing in the journal matches it yet.',
    silhouetteHint: 'A strange, ridged pod.',
    use: 'Unclear. Might be worth analyzing with a Field Kit.',
    unknown: true,
  },
  roughOre: {
    id: 'roughOre',
    name: 'Rough Mineral Ore',
    description: 'A dense fragment of stone with faint mineral veins.',
    silhouetteHint: 'A heavy, streaked stone.',
    use: 'Used at the Soil Station to prepare mineral-rich nutrients.',
  },
  creekPebbles: {
    id: 'creekPebbles',
    name: 'Creek Pebbles',
    description: 'Smooth stones worn round by moving water.',
    silhouetteHint: 'A handful of smooth, wet stones.',
    use: 'Used at the Propagation Bench to improve drainage.',
  },
};

export const MATERIAL_LIST: MaterialDef[] = Object.values(MATERIALS);
