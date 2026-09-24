import type { PlantDef, Rarity } from '../types';

// The houseplant roster. Every species grows wild somewhere in the
// valley; each has a standard form plus named variants that range from
// "you'll see one eventually" to "you may never see one". A variant's
// look overrides the species look, so rarity is something you can *see*.
//
// Colours are HSL. Variegation colour is [h, s, l].

const CREAM: [number, number, number] = [52, 60, 90];
const WHITE: [number, number, number] = [60, 20, 96];
const GOLD: [number, number, number] = [48, 85, 62];
const PINK: [number, number, number] = [340, 70, 78];
const SILVER: [number, number, number] = [150, 12, 82];

export const PLANTS: Record<string, PlantDef> = {
  // ---------------------------------------------------------------- Meadow
  pothos: {
    id: 'pothos',
    name: 'Pothos',
    latin: 'Epipremnum aureum',
    form: 'trailing',
    rarity: 'common',
    habitat: ['meadow', 'woodland'],
    landscape: 'vine',
    description: 'A forgiving, fast-trailing vine with glossy heart-shaped leaves. It will happily carpet anything you let it.',
    hint: 'Something trails through the long grass near home.',
    look: { hue: 105, sat: 48, light: 38, accentHue: 55, variegation: 'marble', variegationColor: GOLD, size: 1 },
    variants: [
      { id: 'golden', name: 'Golden', rarity: 'common', description: 'Green leaves brushed with gold.', look: {} },
      { id: 'marbleQueen', name: 'Marble Queen', rarity: 'uncommon', description: 'Heavily streaked with cream — more white than green in places.', look: { variegation: 'splash', variegationColor: CREAM, light: 42 } },
      { id: 'neon', name: 'Neon', rarity: 'rare', description: 'Electric chartreuse, almost glowing in the shade.', look: { hue: 72, sat: 85, light: 55, variegation: 'none' } },
      { id: 'manjula', name: 'Manjula', rarity: 'veryRare', description: 'Wavy, rounded leaves splashed silver, cream and green all at once.', look: { variegation: 'splash', variegationColor: WHITE, ruffled: true, leafWidth: 1.25 } },
    ],
    growthRate: 1.35,
    spread: 0.85,
  },

  spiderPlant: {
    id: 'spiderPlant',
    name: 'Spider Plant',
    latin: 'Chlorophytum comosum',
    form: 'strappy',
    rarity: 'common',
    habitat: ['meadow', 'rockyClearing'],
    landscape: 'jungle',
    description: 'Arching ribbons of leaves that throw out little plantlets on long runners. It propagates itself if you let it.',
    hint: 'Arching ribbons, sun-bleached at the edges.',
    look: { hue: 95, sat: 45, light: 44, accentHue: 60, variegation: 'none', size: 0.9 },
    variants: [
      { id: 'green', name: 'Green', rarity: 'common', description: 'Plain, lush green ribbons.', look: {} },
      { id: 'vittatum', name: 'Vittatum', rarity: 'uncommon', description: 'A bright cream stripe down the middle of every leaf.', look: { variegation: 'stripe', variegationColor: CREAM } },
      { id: 'bonnie', name: 'Bonnie', rarity: 'rare', description: 'Curling, corkscrewed leaves with cream margins. Looks like it’s been to a salon.', look: { variegation: 'edge', variegationColor: CREAM, ruffled: true } },
    ],
    growthRate: 1.2,
    spread: 0.7,
  },

  pilea: {
    id: 'pilea',
    name: 'Chinese Money Plant',
    latin: 'Pilea peperomioides',
    form: 'coin',
    rarity: 'uncommon',
    habitat: ['meadow'],
    landscape: 'color',
    description: 'Round, coin-like leaves held out on long stems, like a handful of green pancakes. Pups pop up all around it.',
    hint: 'Little green coins held up to the sun.',
    look: { hue: 110, sat: 40, light: 42, accentHue: 90, variegation: 'none', size: 0.95 },
    variants: [
      { id: 'standard', name: 'Standard', rarity: 'uncommon', description: 'Matte green coins.', look: {} },
      { id: 'sugar', name: 'Sugar', rarity: 'rare', description: 'Every coin is dusted with fine silver speckles.', look: { variegation: 'speckle', variegationColor: SILVER } },
      { id: 'whiteSplash', name: 'White Splash', rarity: 'veryRare', description: 'Coins randomly splashed with pure white — no two alike.', look: { variegation: 'splash', variegationColor: WHITE } },
    ],
    growthRate: 1.0,
    spread: 0.55,
  },

  tradescantia: {
    id: 'tradescantia',
    name: 'Wandering Dude',
    latin: 'Tradescantia zebrina',
    form: 'trailing',
    rarity: 'common',
    habitat: ['meadow', 'overgrownClearing'],
    landscape: 'color',
    description: 'A sprawling trailer striped in silver and violet. It roots wherever a stem touches soil.',
    hint: 'Violet and silver, sprawling low.',
    look: { hue: 285, sat: 35, light: 38, accentHue: 300, variegation: 'stripe', variegationColor: SILVER, size: 0.85, leafWidth: 0.8 },
    variants: [
      { id: 'zebrina', name: 'Zebrina', rarity: 'common', description: 'Silver-striped purple leaves.', look: {} },
      { id: 'nanouk', name: 'Nanouk', rarity: 'rare', description: 'Candy-striped pink, cream and green. Looks like a sweet shop.', look: { hue: 330, sat: 55, light: 62, variegation: 'stripe', variegationColor: [120, 30, 70] } },
    ],
    growthRate: 1.3,
    spread: 0.9,
  },

  // -------------------------------------------------------------- Woodland
  philodendron: {
    id: 'philodendron',
    name: 'Heartleaf Philodendron',
    latin: 'Philodendron hederaceum',
    form: 'heart',
    rarity: 'common',
    habitat: ['woodland', 'creek'],
    landscape: 'jungle',
    description: 'Velvety heart-shaped leaves on a scrambling stem. Where it’s happy, it becomes a jungle.',
    hint: 'Hearts on a scrambling stem, under the trees.',
    look: { hue: 115, sat: 50, light: 34, accentHue: 80, variegation: 'none', size: 1 },
    variants: [
      { id: 'green', name: 'Green', rarity: 'common', description: 'Deep, glossy green hearts.', look: {} },
      { id: 'brasil', name: 'Brasil', rarity: 'uncommon', description: 'A bold lime flame down the centre of each leaf.', look: { variegation: 'stripe', variegationColor: [80, 70, 55] } },
      { id: 'pinkPrincess', name: 'Pink Princess', rarity: 'veryRare', description: 'Near-black leaves splashed with bubblegum pink. Collectors lose sleep over these.', look: { hue: 340, sat: 30, light: 20, variegation: 'splash', variegationColor: PINK } },
    ],
    growthRate: 1.15,
    spread: 0.7,
  },

  monstera: {
    id: 'monstera',
    name: 'Monstera',
    latin: 'Monstera deliciosa',
    form: 'splitleaf',
    rarity: 'uncommon',
    habitat: ['woodland'],
    landscape: 'jungle',
    description: 'Huge, split and holed leaves. Young plants have solid hearts; the famous splits come with age.',
    hint: 'A leaf with holes in it, bigger than your head.',
    look: { hue: 120, sat: 48, light: 30, accentHue: 90, variegation: 'none', size: 1.35 },
    variants: [
      { id: 'deliciosa', name: 'Deliciosa', rarity: 'uncommon', description: 'The classic swiss-cheese giant.', look: {} },
      { id: 'albo', name: 'Albo', rarity: 'veryRare', description: 'Great half-moons of pure white cut through the leaves.', look: { variegation: 'splash', variegationColor: WHITE } },
      { id: 'thaiConstellation', name: 'Thai Constellation', rarity: 'extremelyRare', description: 'Every leaf is scattered with creamy stars, like a night sky turned green.', look: { variegation: 'speckle', variegationColor: CREAM } },
    ],
    growthRate: 0.85,
    spread: 0.45,
  },

  peaceLily: {
    id: 'peaceLily',
    name: 'Peace Lily',
    latin: 'Spathiphyllum wallisii',
    form: 'bloom',
    rarity: 'common',
    habitat: ['woodland', 'creek'],
    landscape: 'flower',
    description: 'Dark glossy leaves and white sail-like blooms that rise up once it’s settled in.',
    hint: 'White sails above dark leaves, in the shade.',
    look: { hue: 125, sat: 42, light: 28, accentHue: 60, accentSat: 20, accentLight: 95, variegation: 'none', size: 1, flowers: true },
    variants: [
      { id: 'standard', name: 'Standard', rarity: 'common', description: 'Classic white blooms.', look: {} },
      { id: 'domino', name: 'Domino', rarity: 'rare', description: 'Leaves streaked and flecked with white, like spilled paint.', look: { variegation: 'marble', variegationColor: WHITE } },
    ],
    growthRate: 1.0,
    spread: 0.4,
  },

  // ----------------------------------------------------------------- Creek
  syngonium: {
    id: 'syngonium',
    name: 'Arrowhead Vine',
    latin: 'Syngonium podophyllum',
    form: 'heart',
    rarity: 'common',
    habitat: ['creek'],
    landscape: 'vine',
    description: 'Arrow-shaped leaves that go from compact clump to rambling vine as it grows.',
    hint: 'Arrowheads pointing down to the water.',
    look: { hue: 100, sat: 40, light: 45, accentHue: 90, variegation: 'veins', variegationColor: [90, 40, 78], size: 0.95, leafWidth: 0.85 },
    variants: [
      { id: 'whiteButterfly', name: 'White Butterfly', rarity: 'common', description: 'Pale green centres with soft white veins.', look: {} },
      { id: 'neonRobusta', name: 'Neon Robusta', rarity: 'rare', description: 'Soft, blushing pink all over.', look: { hue: 345, sat: 55, light: 72, variegation: 'none' } },
      { id: 'albo', name: 'Albo', rarity: 'veryRare', description: 'Stark white sectors, some leaves entirely ghostly.', look: { variegation: 'splash', variegationColor: WHITE, light: 38 } },
    ],
    growthRate: 1.15,
    spread: 0.75,
  },

  calathea: {
    id: 'calathea',
    name: 'Prayer Plant',
    latin: 'Maranta leuconeura',
    form: 'patterned',
    rarity: 'uncommon',
    habitat: ['creek', 'dampForest'],
    landscape: 'color',
    description: 'Its painted leaves fold up at night like hands in prayer. The patterns look hand-drawn.',
    hint: 'Leaves that fold up when the light goes.',
    look: { hue: 110, sat: 38, light: 35, accentHue: 350, accentSat: 60, accentLight: 45, variegation: 'veins', variegationColor: [350, 70, 55], size: 0.9 },
    variants: [
      { id: 'redVein', name: 'Red Vein', rarity: 'uncommon', description: 'Herringbone veins in bright red.', look: {} },
      { id: 'lemonLime', name: 'Lemon Lime', rarity: 'rare', description: 'Zesty yellow-green veins on a lime ground.', look: { hue: 90, light: 42, variegation: 'veins', variegationColor: [65, 80, 68] } },
      { id: 'orbifolia', name: 'Orbifolia', rarity: 'veryRare', description: 'Enormous round leaves, silver-banded like a watermelon rind.', look: { variegation: 'stripe', variegationColor: SILVER, leafWidth: 1.5, size: 1.2 } },
    ],
    growthRate: 0.9,
    spread: 0.35,
  },

  // ----------------------------------------------------------- Damp Forest
  bostonFern: {
    id: 'bostonFern',
    name: 'Boston Fern',
    latin: 'Nephrolepis exaltata',
    form: 'fern',
    rarity: 'common',
    habitat: ['dampForest', 'woodland'],
    landscape: 'fern',
    description: 'A fountain of feathery fronds. In numbers, it turns the forest floor into a soft green sea.',
    hint: 'A fountain of feathers in the wet shade.',
    look: { hue: 100, sat: 50, light: 40, accentHue: 90, variegation: 'none', size: 1.05 },
    variants: [
      { id: 'standard', name: 'Standard', rarity: 'common', description: 'Classic arching fronds.', look: {} },
      { id: 'fluffyRuffles', name: 'Fluffy Ruffles', rarity: 'uncommon', description: 'Dense, frilly, overexcited fronds.', look: { ruffled: true, hue: 92, light: 45 } },
      { id: 'tigerFern', name: 'Tiger Fern', rarity: 'rare', description: 'Fronds striped in gold like a lazy cat.', look: { variegation: 'stripe', variegationColor: GOLD } },
    ],
    growthRate: 1.1,
    spread: 0.8,
  },

  birdsNestFern: {
    id: 'birdsNestFern',
    name: "Bird's Nest Fern",
    latin: 'Asplenium nidus',
    form: 'strappy',
    rarity: 'uncommon',
    habitat: ['dampForest'],
    landscape: 'fern',
    description: 'Broad, glossy, wavy blades unfurling from a fuzzy nest at the centre.',
    hint: 'A nest of wavy green blades.',
    look: { hue: 90, sat: 55, light: 45, accentHue: 30, variegation: 'none', size: 1.2, leafWidth: 1.8, ruffled: true },
    variants: [
      { id: 'standard', name: 'Standard', rarity: 'uncommon', description: 'Glossy apple-green blades.', look: {} },
      { id: 'crispyWave', name: 'Crispy Wave', rarity: 'rare', description: 'Tightly crimped blades, like a green lasagne.', look: { hue: 105, light: 38 } },
    ],
    growthRate: 0.9,
    spread: 0.4,
  },

  alocasia: {
    id: 'alocasia',
    name: 'Dragon Scale Alocasia',
    latin: 'Alocasia baginda',
    form: 'heart',
    rarity: 'rare',
    habitat: ['dampForest'],
    landscape: 'strange',
    description: 'Thick, textured leaves with a metallic sheen, like the hide of something ancient. It only shows itself in the rain.',
    hint: 'Something scaled and silver, glimpsed only in the rain.',
    look: { hue: 160, sat: 18, light: 42, accentHue: 150, variegation: 'veins', variegationColor: [150, 25, 22], size: 1.1, leafWidth: 0.95 },
    variants: [
      { id: 'dragonScale', name: 'Dragon Scale', rarity: 'rare', description: 'Silvery-green scales and dark veins.', look: {} },
      { id: 'silverDragon', name: 'Silver Dragon', rarity: 'veryRare', description: 'Almost entirely pewter-grey, with ghostly veins.', look: { sat: 8, light: 70, variegationColor: [150, 15, 45] } },
    ],
    growthRate: 0.75,
    spread: 0.3,
    appearsWhen: 'rain',
  },

  jewelOrchid: {
    id: 'jewelOrchid',
    name: 'Jewel Orchid',
    latin: 'Ludisia discolor',
    form: 'patterned',
    rarity: 'rare',
    habitat: ['dampForest'],
    landscape: 'strange',
    description: 'Velvet leaves as dark as wine, traced with glittering pink lines that catch lantern light.',
    hint: 'Glittering lines in the dark. You’d need a light to see it.',
    look: { hue: 330, sat: 25, light: 18, accentHue: 50, accentSat: 20, accentLight: 95, variegation: 'veins', variegationColor: [340, 80, 70], size: 0.75, flowers: true },
    variants: [
      { id: 'standard', name: 'Discolor', rarity: 'rare', description: 'Wine-dark velvet with pink veins.', look: {} },
      { id: 'alba', name: 'Alba', rarity: 'veryRare', description: 'Emerald velvet with veins of pure silver.', look: { hue: 140, sat: 35, light: 22, variegationColor: [0, 0, 85] } },
    ],
    growthRate: 0.7,
    spread: 0.3,
    appearsWhen: 'night',
    needsLantern: true,
  },

  // --------------------------------------------------------- Rocky Clearing
  snakePlant: {
    id: 'snakePlant',
    name: 'Snake Plant',
    latin: 'Dracaena trifasciata',
    form: 'spear',
    rarity: 'common',
    habitat: ['rockyClearing'],
    landscape: 'arid',
    description: 'Stiff sword-leaves banded like snakeskin. Almost impossible to kill, and it spreads by stubborn underground runners.',
    hint: 'Green swords standing up out of the rocks.',
    look: { hue: 105, sat: 35, light: 30, accentHue: 55, variegation: 'stripe', variegationColor: [100, 25, 55], size: 1 },
    variants: [
      { id: 'standard', name: 'Standard', rarity: 'common', description: 'Dark banded green swords.', look: {} },
      { id: 'laurentii', name: 'Laurentii', rarity: 'uncommon', description: 'Each sword trimmed in a golden margin.', look: { variegation: 'edge', variegationColor: GOLD } },
      { id: 'moonshine', name: 'Moonshine', rarity: 'rare', description: 'Pale, silvery mint all over, as if carved from moonlight.', look: { sat: 18, light: 72, variegation: 'none' } },
    ],
    growthRate: 0.8,
    spread: 0.5,
  },

  echeveria: {
    id: 'echeveria',
    name: 'Echeveria',
    latin: 'Echeveria elegans',
    form: 'rosette',
    rarity: 'common',
    habitat: ['rockyClearing'],
    landscape: 'arid',
    description: 'A perfect frosted rose made of fat succulent leaves. Offsets huddle round the mother like chicks.',
    hint: 'A stone rose, frosted blue.',
    look: { hue: 165, sat: 22, light: 62, accentHue: 350, accentSat: 50, accentLight: 70, variegation: 'none', size: 0.95 },
    variants: [
      { id: 'elegans', name: 'Mexican Snowball', rarity: 'common', description: 'Powdery blue-green rosettes.', look: {} },
      { id: 'perle', name: 'Perle von Nürnberg', rarity: 'uncommon', description: 'Dusky lavender-pink, pearlescent at the tips.', look: { hue: 300, sat: 25, light: 62 } },
      { id: 'cristata', name: 'Cristata', rarity: 'veryRare', description: 'A mutant crest: the rosette has grown into a wavy fan of brains.', look: { ruffled: true, size: 0.9, hue: 150 } },
    ],
    growthRate: 0.9,
    spread: 0.55,
  },

  stringOfPearls: {
    id: 'stringOfPearls',
    name: 'String of Pearls',
    latin: 'Curio rowleyanus',
    form: 'beads',
    rarity: 'uncommon',
    habitat: ['rockyClearing'],
    landscape: 'vine',
    description: 'Long strands of tiny green peas, spilling over stones like a broken necklace.',
    hint: 'Strands of beads spilling over the rocks.',
    look: { hue: 110, sat: 45, light: 48, accentHue: 90, variegation: 'none', size: 0.8 },
    variants: [
      { id: 'standard', name: 'Standard', rarity: 'uncommon', description: 'Bright green pearls.', look: {} },
      { id: 'variegata', name: 'Variegata', rarity: 'veryRare', description: 'Pearls blushing pink and cream.', look: { variegation: 'splash', variegationColor: PINK } },
    ],
    growthRate: 1.0,
    spread: 0.65,
  },

  zzPlant: {
    id: 'zzPlant',
    name: 'ZZ Plant',
    latin: 'Zamioculcas zamiifolia',
    form: 'spear',
    rarity: 'uncommon',
    habitat: ['rockyClearing', 'woodland'],
    landscape: 'jungle',
    description: 'Waxy leaflets marching up stiff stems. It shrugs off drought, darkness and neglect.',
    hint: 'Waxy ladders of leaves, gleaming.',
    look: { hue: 120, sat: 45, light: 30, accentHue: 100, variegation: 'none', size: 0.95, leafWidth: 1.2 },
    variants: [
      { id: 'standard', name: 'Standard', rarity: 'uncommon', description: 'Glossy green ladders.', look: {} },
      { id: 'raven', name: 'Raven', rarity: 'rare', description: 'Leaves that ripen to a glossy near-black.', look: { hue: 260, sat: 15, light: 13 } },
    ],
    growthRate: 0.8,
    spread: 0.35,
  },

  // ------------------------------------------------------ Overgrown Clearing
  hoya: {
    id: 'hoya',
    name: 'Wax Plant',
    latin: 'Hoya carnosa',
    form: 'trailing',
    rarity: 'uncommon',
    habitat: ['overgrownClearing'],
    landscape: 'flower',
    description: 'Thick waxy leaves on long vines, and — once it’s old enough — clusters of star-shaped flowers that smell of honey at night.',
    hint: 'Waxy stars hanging from the tangle.',
    look: { hue: 120, sat: 35, light: 32, accentHue: 345, accentSat: 55, accentLight: 82, variegation: 'none', size: 1, leafWidth: 0.9, flowers: true },
    variants: [
      { id: 'carnosa', name: 'Carnosa', rarity: 'uncommon', description: 'Glossy green leaves, pale pink stars.', look: {} },
      { id: 'krimsonQueen', name: 'Krimson Queen', rarity: 'rare', description: 'Cream-edged leaves with pink new growth.', look: { variegation: 'edge', variegationColor: [345, 60, 85] } },
      { id: 'compacta', name: 'Hindu Rope', rarity: 'veryRare', description: 'Leaves curled and crumpled into thick green ropes.', look: { ruffled: true, leafWidth: 0.7 } },
    ],
    growthRate: 0.95,
    spread: 0.6,
  },

  begonia: {
    id: 'begonia',
    name: 'Polka Dot Begonia',
    latin: 'Begonia maculata',
    form: 'patterned',
    rarity: 'uncommon',
    habitat: ['overgrownClearing'],
    landscape: 'color',
    description: 'Angel-wing leaves, olive on top with silver polka dots, blood-red underneath. It looks invented.',
    hint: 'Silver polka dots under the brambles.',
    look: { hue: 110, sat: 35, light: 26, accentHue: 355, accentSat: 60, accentLight: 45, variegation: 'speckle', variegationColor: SILVER, size: 0.95, leafWidth: 0.75, flowers: true },
    variants: [
      { id: 'maculata', name: 'Maculata', rarity: 'uncommon', description: 'Silver dots on olive angel wings.', look: {} },
      { id: 'wightii', name: 'Wightii', rarity: 'rare', description: 'Bigger, brighter dots — almost more silver than leaf.', look: { variegationColor: WHITE, leafWidth: 0.85 } },
    ],
    growthRate: 1.05,
    spread: 0.45,
  },

  fittonia: {
    id: 'fittonia',
    name: 'Nerve Plant',
    latin: 'Fittonia albivenis',
    form: 'patterned',
    rarity: 'common',
    habitat: ['overgrownClearing', 'creek'],
    landscape: 'color',
    description: 'Small leaves netted with brilliant veins. En masse it looks like stained glass on the ground.',
    hint: 'A net of bright veins, low to the ground.',
    look: { hue: 115, sat: 40, light: 32, accentHue: 0, variegation: 'veins', variegationColor: [0, 0, 92], size: 0.6 },
    variants: [
      { id: 'white', name: 'White Anne', rarity: 'common', description: 'Crisp white veins on dark green.', look: {} },
      { id: 'ruby', name: 'Ruby Red', rarity: 'uncommon', description: 'Hot-pink veins bleeding into the leaf.', look: { variegationColor: [345, 75, 58] } },
      { id: 'frankie', name: 'Frankie', rarity: 'rare', description: 'Almost entirely soft pink, edged in green.', look: { hue: 345, sat: 55, light: 70, variegation: 'edge', variegationColor: [110, 40, 35] } },
    ],
    growthRate: 1.2,
    spread: 0.7,
  },

  anthurium: {
    id: 'anthurium',
    name: 'Velvet Anthurium',
    latin: 'Anthurium clarinervium',
    form: 'heart',
    rarity: 'veryRare',
    habitat: ['overgrownClearing'],
    landscape: 'strange',
    description: 'Deep velvet hearts with veins like white chalk lines. Grown ones look like they’re lit from inside.',
    hint: 'The fox knows something about this clearing.',
    look: { hue: 135, sat: 45, light: 18, accentHue: 0, variegation: 'veins', variegationColor: [90, 20, 88], size: 1.15, leafWidth: 1.15 },
    variants: [
      { id: 'clarinervium', name: 'Clarinervium', rarity: 'veryRare', description: 'Black-green velvet, chalk-white veins.', look: {} },
      { id: 'crystallinum', name: 'Crystallinum', rarity: 'extremelyRare', description: 'Huge, glittering leaves with crystalline silver veins and blushing new growth.', look: { size: 1.4, light: 24, variegationColor: [180, 30, 92] } },
    ],
    growthRate: 0.65,
    spread: 0.25,
    foxOnly: true,
  },

  foxglowAroid: {
    id: 'foxglowAroid',
    name: 'Foxglow Aroid',
    latin: 'Vulpicarpa nocturna',
    form: 'splitleaf',
    rarity: 'extremelyRare',
    habitat: ['dampForest', 'woodland'],
    landscape: 'strange',
    description: 'Not in any book. Russet leaves with veins that glow faintly amber after dark. The fox seems to tend to it.',
    hint: 'There is something the fox has never shown you.',
    look: { hue: 18, sat: 55, light: 36, accentHue: 38, accentSat: 95, accentLight: 62, variegation: 'glow', variegationColor: [38, 95, 62], size: 1.15 },
    variants: [
      { id: 'ember', name: 'Ember', rarity: 'extremelyRare', description: 'Russet leaves, amber glow.', look: {} },
      { id: 'moonfox', name: 'Moonfox', rarity: 'extremelyRare', description: 'Pale silver leaves with a cold blue glow.', look: { hue: 200, sat: 20, light: 62, accentHue: 190, variegationColor: [190, 90, 70] } },
    ],
    growthRate: 0.7,
    spread: 0.3,
    foxOnly: true,
  },
};

export const PLANT_LIST: PlantDef[] = Object.values(PLANTS);

export const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'veryRare', 'extremelyRare'];

export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  veryRare: 'Very Rare',
  extremelyRare: 'Extremely Rare',
};

export function rarityRank(r: Rarity): number {
  return RARITY_ORDER.indexOf(r);
}

export function findVariant(defId: string, variantId: string) {
  const def = PLANTS[defId];
  return def?.variants.find((v) => v.id === variantId) ?? def?.variants[0];
}

/** A specimen is as rare as the rarer of its species and its variant. */
export function specimenRarity(defId: string, variantId: string): Rarity {
  const def = PLANTS[defId];
  const variant = findVariant(defId, variantId);
  if (!def || !variant) return 'common';
  return rarityRank(variant.rarity) > rarityRank(def.rarity) ? variant.rarity : def.rarity;
}

export function specimenName(defId: string, variantId: string): string {
  const def = PLANTS[defId];
  if (!def) return defId;
  const variant = findVariant(defId, variantId);
  if (!variant || variant.id === def.variants[0].id) return def.name;
  return `${def.name} ‘${variant.name}’`;
}

/** Name that always includes the variant, for "new variant" moments. */
export function fullName(defId: string, variantId: string): string {
  const def = PLANTS[defId];
  const variant = findVariant(defId, variantId);
  return def && variant ? `${def.name} ‘${variant.name}’` : defId;
}

export function lookFor(defId: string, variantId: string) {
  const def = PLANTS[defId];
  const variant = findVariant(defId, variantId);
  return { ...def.look, ...(variant?.look ?? {}) };
}
