// Everything the market sells. One-off upgrades change the player's space
// (and are visible there); pots are cosmetic styles you can then use for
// any displayed plant; garden decor is bought by the piece and placed
// outdoors wherever Ellen is standing.

export type ShopCategory = 'greenhouse' | 'pots' | 'garden' | 'equipment' | 'stall';

export interface ShopItem {
  id: string;
  name: string;
  category: ShopCategory;
  price: number;
  description: string;
  /** Can be bought over and over (garden decor). */
  repeatable?: boolean;
  /** Only offered after this item is owned. */
  after?: string;
}

export const SHOP_ITEMS: ShopItem[] = [
  // Greenhouse
  { id: 'hangingHooks', name: 'Hanging Hooks', category: 'greenhouse', price: 90, description: 'Three ceiling hooks for hanging pots. Trailing plants look spectacular up here.' },
  { id: 'plantShelf', name: 'Wall Shelf', category: 'greenhouse', price: 120, description: 'A reclaimed-wood shelf along the west wall. Room for three more plants.' },
  { id: 'nurseryBeds', name: 'Extra Nursery Beds', category: 'greenhouse', price: 160, description: 'Two more beds for rooting cuttings and raising young plants.' },
  { id: 'moreNurseryBeds', name: 'Two More Nursery Beds', category: 'greenhouse', price: 280, after: 'nurseryBeds', description: 'Another pair of beds below the others. More cuttings rooting at once.' },
  { id: 'tieredStand', name: 'Tiered Plant Stand', category: 'greenhouse', price: 240, description: 'A three-step iron stand by the east glass. Three more display spots in the best light.' },
  { id: 'growLights', name: 'Grow Lights', category: 'greenhouse', price: 360, description: 'Warm lamps over the whole greenhouse. Everything indoors grows half again as fast.' },
  // Greenhouse furniture: bought by the piece and set down wherever you
  // like indoors, then picked up and moved as the collection grows.
  { id: 'plantStand', name: 'Plant Stand', category: 'greenhouse', price: 45, repeatable: true, description: 'A round wooden stand for one plant. Put it anywhere in the greenhouse.' },
  { id: 'ironPedestal', name: 'Iron Pedestal', category: 'greenhouse', price: 80, repeatable: true, description: 'A tall wrought-iron pedestal that lifts one plant up into the light.' },
  { id: 'ceilingHook', name: 'Ceiling Hook', category: 'greenhouse', price: 40, repeatable: true, description: 'Hang one more pot from the roof, above anything you like.' },
  { id: 'wallTrellis', name: 'Wall Trellis', category: 'greenhouse', price: 95, repeatable: true, description: 'A tall cedar lattice. Vines and trailers planted at its foot climb it instead of trailing — best along a wall.' },
  { id: 'propagationTray', name: 'Propagation Tray', category: 'greenhouse', price: 70, repeatable: true, description: 'A shallow tray of damp grit with a clear lid. One more place for a cutting to root — put it anywhere.' },
  { id: 'pottingTable', name: 'Potting Table', category: 'greenhouse', price: 85, repeatable: true, description: 'A long, scrubbed table. Sets one plant at a comfortable height. Turns to fit along any wall.' },
  { id: 'floorPlanter', name: 'Floor Planter', category: 'greenhouse', price: 110, repeatable: true, description: 'A deep glazed planter that sits on the floor. Big plants love the extra root room.' },
  { id: 'growLamp', name: 'Grow Lamp', category: 'greenhouse', price: 150, repeatable: true, description: 'A standing lamp with a warm, pinkish glow. Plants close to it grow a third faster.' },
  { id: 'wateringCan', name: 'Watering Can', category: 'greenhouse', price: 15, repeatable: true, description: 'A dented brass can. Purely for the look of the place.' },
  { id: 'houseRug', name: 'Woven Rug', category: 'greenhouse', price: 40, repeatable: true, description: 'A soft jute rug to put down anywhere indoors. Things stand on it happily.' },
  { id: 'sunRoom', name: 'Clear Out the Sun Room', category: 'greenhouse', price: 700, description: 'Haul away the old crates in the south-east corner and fit it out: four new display spots in full sun.' },

  // Pots
  { id: 'potGlazed', name: 'Teal Glazed Pots', category: 'pots', price: 25, description: 'Deep sea-green glaze with a drip at the rim.' },
  { id: 'potSpeckled', name: 'Speckled Stoneware', category: 'pots', price: 35, description: 'Oatmeal clay flecked with iron.' },
  { id: 'potBasket', name: 'Woven Baskets', category: 'pots', price: 40, description: 'Seagrass baskets. Cosy.' },
  { id: 'potCopper', name: 'Hammered Copper', category: 'pots', price: 70, description: 'Catches the light beautifully.' },
  { id: 'potPorcelain', name: 'Gold-Rim Porcelain', category: 'pots', price: 140, description: 'For the plants you’re most proud of.' },

  // Garden decor (placed outdoors)
  { id: 'compostSack', name: 'Sack of Compost', category: 'garden', price: 20, repeatable: true, description: 'Three scoops of rich compost. Garden beds are dug with it — or compost plants of your own.' },
  { id: 'steppingStones', name: 'Stepping Stones', category: 'garden', price: 6, repeatable: true, description: 'A few flat stones. Lay a path through your plantings.' },
  { id: 'picketFence', name: 'Picket Fence', category: 'garden', price: 12, repeatable: true, description: 'A short run of white fence to frame a bed.' },
  { id: 'gardenLantern', name: 'Garden Lantern', category: 'garden', price: 30, repeatable: true, description: 'Glows warmly after dark.' },
  { id: 'birdbath', name: 'Birdbath', category: 'garden', price: 45, repeatable: true, description: 'A stone basin. Birds and butterflies will visit.' },
  { id: 'gardenBench', name: 'Garden Bench', category: 'garden', price: 60, repeatable: true, description: 'Somewhere to sit and look at what you’ve made.' },
  { id: 'gardenTrellis', name: 'Garden Trellis', category: 'garden', price: 55, repeatable: true, description: 'A freestanding cedar lattice. Plant a vine or trailer at its foot and it climbs instead of sprawling.' },

  // Equipment
  { id: 'basketMedium', name: 'Collector’s Satchel', category: 'equipment', price: 80, description: 'Carry up to 10 plants.' },
  { id: 'basketLarge', name: 'Field Pack', category: 'equipment', price: 340, after: 'basketMedium', description: 'Carry up to 16 plants.' },
  { id: 'rootingKit', name: 'Rooting Kit', category: 'equipment', price: 260, description: 'Hormone powder and sharp snips. Plants recover twice as fast after you take a cutting, and cuttings throw sports (mutations) more often.' },

  // Market stall
  { id: 'stallAwning', name: 'Striped Awning', category: 'stall', price: 120, description: 'Draws a crowd. Everything sells for 10% more.' },
  { id: 'stallCrates', name: 'Display Crates', category: 'stall', price: 260, after: 'stallAwning', description: 'Plants shown off properly. Another 10% on every sale.' },
];

export function findShopItem(id: string): ShopItem | undefined {
  return SHOP_ITEMS.find((s) => s.id === id);
}

export interface PotStyle {
  id: string;
  name: string;
  /** Shop item that unlocks it; terracotta is free. */
  requires?: string;
  body: string;
  rim: string;
  shade: string;
  pattern?: 'speckle' | 'weave' | 'hammered' | 'gold' | 'drip';
}

export const POT_STYLES: PotStyle[] = [
  { id: 'terracotta', name: 'Terracotta', body: '#b8653e', rim: '#cf7a4f', shade: '#8f4a2b' },
  { id: 'glazed', name: 'Teal Glaze', requires: 'potGlazed', body: '#2f7f7a', rim: '#4aa39b', shade: '#1f5a56', pattern: 'drip' },
  { id: 'speckled', name: 'Speckled', requires: 'potSpeckled', body: '#d9ccb2', rim: '#e8dcc4', shade: '#b3a58a', pattern: 'speckle' },
  { id: 'basket', name: 'Woven', requires: 'potBasket', body: '#b99a62', rim: '#d1b67e', shade: '#8a7044', pattern: 'weave' },
  { id: 'copper', name: 'Copper', requires: 'potCopper', body: '#b76e3a', rim: '#e0a066', shade: '#7e4522', pattern: 'hammered' },
  { id: 'porcelain', name: 'Porcelain', requires: 'potPorcelain', body: '#f1efe8', rim: '#d8b24a', shade: '#cfcac0', pattern: 'gold' },
];

export function findPotStyle(id: string): PotStyle {
  return POT_STYLES.find((p) => p.id === id) ?? POT_STYLES[0];
}

export type DecorId = 'steppingStones' | 'picketFence' | 'gardenLantern' | 'birdbath' | 'gardenBench' | 'gardenTrellis';
export const DECOR_IDS: DecorId[] = ['steppingStones', 'picketFence', 'gardenLantern', 'birdbath', 'gardenBench', 'gardenTrellis'];

/**
 * Everything that can stand (or hang) indoors. The first group is sold at
 * the market; the second is the greenhouse's own original fittings, which
 * can be moved or stored like anything else once the player picks them up;
 * the third is the living room's furniture, which can be moved but stays.
 * FURNITURE_IDS lists only what can ever be in stock.
 */
export type FurnitureId =
  | 'plantStand'
  | 'ironPedestal'
  | 'ceilingHook'
  | 'wallTrellis'
  | 'propagationTray'
  | 'pottingTable'
  | 'floorPlanter'
  | 'growLamp'
  | 'wateringCan'
  | 'houseRug'
  | 'nurseryBed'
  | 'wallShelf'
  | 'tieredStand'
  | 'sunroomStand'
  // The living room's own furniture: moved like anything else, never put away.
  | 'tv'
  | 'couch'
  | 'coffeeTable'
  | 'sideTable'
  | 'catTree'
  | 'catBed'
  | 'puttingMat'
  | 'rug'
  | 'bookshelf'
  | 'doormat'
  | 'coatRack'
  | 'floorLamp'
  // The greenhouse's own set dressing: moved like anything else, never put away.
  | 'scoutBed'
  | 'ellenDesk';
export const FURNITURE_IDS: FurnitureId[] = [
  'plantStand',
  'ironPedestal',
  'ceilingHook',
  'wallTrellis',
  'propagationTray',
  'pottingTable',
  'floorPlanter',
  'growLamp',
  'wateringCan',
  'houseRug',
  'nurseryBed',
  'wallShelf',
  'tieredStand',
  'sunroomStand',
];

/** Compost you get from a sack bought at the market. */
export const COMPOST_PER_SACK = 3;
