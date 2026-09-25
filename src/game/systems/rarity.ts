import type { Rarity } from '../types';
import { rarityRank } from '../data/plants';

// How a discovery lands. The rarity ladder is the heart of the game —
// common → rare → extremely rare → a sport rarer still — so finding
// something far up it should feel different in the world itself, not just
// in a toast. It's the same quiet flourish all the way to the top: the
// rarest thing in the valley gets no fanfare the others don't.

export type Flourish = 'none' | 'glint' | 'bloom';

export function discoveryFlourish(r: Rarity, isNew: boolean): Flourish {
  if (!isNew) return 'none';
  const rank = rarityRank(r);
  if (rank >= 3) return 'bloom';
  if (rank >= 2) return 'glint';
  return 'none';
}

/** The quiet line under a discovery toast: “Wait… this one is different.” */
export function discoveryAside(r: Rarity): string {
  const rank = rarityRank(r);
  if (rank >= 3) return 'Wait… this one is different.';
  if (rank >= 2) return 'Not one you see every day.';
  return '';
}
