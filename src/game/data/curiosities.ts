import type { OutdoorZoneId, Rarity } from '../types';

// Small wonders that aren't plants: fungi, insects, and the odd thing left
// lying about. They can't be taken home — they're recorded in the journal,
// and only ever turn up at the end of a fox's trail. What decides which one
// is waiting (the region, the hour, the weather) is never spelled out.

export type CuriosityKind = 'fungus' | 'insect' | 'oddity';

export interface CuriosityDef {
  id: string;
  name: string;
  kind: CuriosityKind;
  rarity: Rarity;
  zones: OutdoorZoneId[];
  when?: 'night' | 'rain' | 'day';
  description: string;
}

export const CURIOSITIES: CuriosityDef[] = [
  { id: 'lostGolfBall', name: 'A Lost Golf Ball', kind: 'oddity', rarity: 'common', zones: ['meadow', 'rockyClearing', 'overgrownClearing'], description: 'Scuffed, grass-stained, and a long way from any hole. Someone around here has a slice.' },
  { id: 'flyAgaric', name: 'Fly Agaric', kind: 'fungus', rarity: 'uncommon', zones: ['woodland', 'dampForest'], description: 'Scarlet caps flecked with white, pushing up through the leaf litter in a loose ring.' },
  { id: 'swallowtail', name: 'Swallowtail', kind: 'insect', rarity: 'uncommon', zones: ['meadow', 'overgrownClearing'], when: 'day', description: 'Cream and black, with a blue-and-red eye on each tail. It rests with its wings flat in the sun.' },
  { id: 'emeraldDragonfly', name: 'Emerald Dragonfly', kind: 'insect', rarity: 'uncommon', zones: ['creek', 'meadow'], when: 'day', description: 'Metallic green, hovering and darting and hovering again.' },
  { id: 'fairyRing', name: 'Fairy Ring', kind: 'fungus', rarity: 'rare', zones: ['meadow', 'overgrownClearing'], when: 'rain', description: 'A perfect circle of pale mushrooms, come up overnight in the wet grass.' },
  { id: 'jewelBeetle', name: 'Jewel Beetle', kind: 'insect', rarity: 'rare', zones: ['rockyClearing', 'overgrownClearing'], when: 'day', description: 'Shell like polished copper turning to green as it moves.' },
  { id: 'coralFungus', name: 'Coral Fungus', kind: 'fungus', rarity: 'rare', zones: ['dampForest', 'creek'], description: 'Branching, butter-yellow and soft, like something from the bottom of the sea.' },
  { id: 'splitGeode', name: 'Split Geode', kind: 'oddity', rarity: 'rare', zones: ['rockyClearing', 'creek'], description: 'An ordinary grey stone, broken open. Inside: violet crystal.' },
  { id: 'lunaMoth', name: 'Luna Moth', kind: 'insect', rarity: 'veryRare', zones: ['woodland', 'dampForest'], when: 'night', description: 'Pale green wings as wide as a hand, with long trailing tails. It barely moves.' },
  { id: 'glowworms', name: 'Glow-worms', kind: 'insect', rarity: 'veryRare', zones: ['creek', 'dampForest', 'overgrownClearing'], when: 'night', description: 'A scatter of cold green lights low in the grass, each one waiting.' },
  { id: 'ghostPipe', name: 'Ghost Pipe', kind: 'fungus', rarity: 'veryRare', zones: ['dampForest', 'woodland'], when: 'rain', description: 'Waxy white stems, bowed like pipes. It isn’t a fungus at all, though it looks like one.' },
  { id: 'foxDen', name: 'The Fox’s Den', kind: 'oddity', rarity: 'extremelyRare', zones: ['overgrownClearing', 'woodland'], description: 'A dark mouth under the roots, the ground in front worn smooth. So this is where it goes.' },
];

export function findCuriosity(id: string): CuriosityDef | undefined {
  return CURIOSITIES.find((c) => c.id === id);
}
