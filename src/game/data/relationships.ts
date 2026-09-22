import type { EcosystemRelationship } from '../types';

// The ecosystem web. `effect` is applied to the target's population each
// simulation tick, scaled by the source's own population — see
// systems/ecosystem.ts. Positive = source helps target thrive; negative =
// source suppresses target. Relationships are undiscovered until the player
// observes enough evidence (see Journal "Ecosystem" section).

export const RELATIONSHIPS: EcosystemRelationship[] = [
  {
    id: 'ant-shelters-aphid',
    source: 'gardenAnt',
    target: 'aphid',
    type: 'shelter',
    effect: 0.55,
    description: 'Garden Ants protect Aphids from predators in exchange for honeydew.',
    discovered: false,
  },
  {
    id: 'aphid-feeds-on-bluebell',
    source: 'aphid',
    target: 'bluebell',
    type: 'predation',
    effect: -0.45,
    description: 'Aphids feed on Bluebell sap, weakening the population.',
    discovered: false,
  },
  {
    id: 'aphid-feeds-on-iris',
    source: 'aphid',
    target: 'creekflagIris',
    type: 'predation',
    effect: -0.3,
    description: 'Aphids feed on Creekflag Iris.',
    discovered: false,
  },
  {
    id: 'spider-preys-aphid',
    source: 'gardenSpider',
    target: 'aphid',
    type: 'predation',
    effect: -0.7,
    description: 'Garden Spiders prey heavily on Aphids.',
    discovered: false,
  },
  {
    id: 'spider-preys-ant',
    source: 'gardenSpider',
    target: 'gardenAnt',
    type: 'predation',
    effect: -0.35,
    description: 'Garden Spiders also prey on Garden Ants.',
    discovered: false,
  },
  {
    id: 'iris-shelters-spider',
    source: 'creekflagIris',
    target: 'gardenSpider',
    type: 'shelter',
    effect: 0.5,
    description: 'Dense Creekflag Iris growth gives Garden Spiders places to build webs.',
    discovered: false,
  },
  {
    id: 'iris-shelters-dragonfly',
    source: 'creekflagIris',
    target: 'dragonfly',
    type: 'shelter',
    effect: 0.4,
    description: 'Dragonfly nymphs shelter among Creekflag Iris roots.',
    discovered: false,
  },
  {
    id: 'lace-shelters-spider',
    source: 'widowsLace',
    target: 'gardenSpider',
    type: 'shelter',
    effect: 0.3,
    description: "Widow's Lace tangles also provide spider habitat.",
    discovered: false,
  },
  {
    id: 'lace-competes-nightshade',
    source: 'widowsLace',
    target: 'nightshadeBell',
    type: 'competition',
    effect: -0.5,
    description: "Widow's Lace crowds out the slower-growing plant beside it.",
    discovered: false,
  },
  {
    id: 'bee-pollinates-clover',
    source: 'honeybee',
    target: 'meadowClover',
    type: 'pollination',
    effect: 0.5,
    description: 'Honeybees pollinate Meadow Clover.',
    discovered: false,
  },
  {
    id: 'bee-pollinates-daisy',
    source: 'honeybee',
    target: 'sundropDaisy',
    type: 'pollination',
    effect: 0.6,
    description: 'Honeybees pollinate Sundrop Daisy.',
    discovered: false,
  },
  {
    id: 'lizard-preys-beetle',
    source: 'gardenLizard',
    target: 'barkBeetle',
    type: 'predation',
    effect: -0.5,
    description: 'Garden Lizards hunt Bark Beetles.',
    discovered: false,
  },
  {
    id: 'lizard-preys-aphid',
    source: 'gardenLizard',
    target: 'aphid',
    type: 'predation',
    effect: -0.25,
    description: 'Garden Lizards also pick off Aphids.',
    discovered: false,
  },
  {
    id: 'bluebell-shelters-lizard',
    source: 'bluebell',
    target: 'gardenLizard',
    type: 'shelter',
    effect: 0.3,
    description: 'Dense Bluebell clumps give Garden Lizards cover.',
    discovered: false,
  },
  {
    id: 'sedum-shelters-lizard',
    source: 'stonecropSedum',
    target: 'gardenLizard',
    type: 'shelter',
    effect: 0.3,
    description: 'Stonecrop Sedum cover shelters Garden Lizards on open rock.',
    discovered: false,
  },
  {
    id: 'bracket-suppresses-beetle',
    source: 'ashenBracket',
    target: 'barkBeetle',
    type: 'competition',
    effect: -0.35,
    description: 'Ashen Bracket breaks down the dead wood Bark Beetles depend on.',
    discovered: false,
  },
  {
    id: 'dragonfly-preys-aphid',
    source: 'dragonfly',
    target: 'aphid',
    type: 'predation',
    effect: -0.2,
    description: 'Dragonflies pick off small insects near the water, including Aphids.',
    discovered: false,
  },
  {
    id: 'clover-enriches-amberseed',
    source: 'meadowClover',
    target: 'amberseedGrass',
    type: 'soilEffect',
    effect: 0.2,
    description: "Meadow Clover's soil enrichment helps neighboring Amberseed Grass.",
    discovered: false,
  },
];

export function getRelationshipsForSource(id: string): EcosystemRelationship[] {
  return RELATIONSHIPS.filter((r) => r.source === id);
}

export function getRelationshipsForTarget(id: string): EcosystemRelationship[] {
  return RELATIONSHIPS.filter((r) => r.target === id);
}
