import { el } from './dom';
import { drawPortrait } from '../game/world/PlantArt';
import { RARITY_LABEL, rarityRank } from '../game/data/plants';
import type { Rarity } from '../game/types';
import { GAME_MINUTES_PER_REAL_SECOND } from '../game/engine/Clock';

/** A small canvas painting of a plant, drawn with the same art as the world. */
export function portrait(defId: string, variantId: string, sf: number, seed: number, size: number, silhouette = false): HTMLCanvasElement {
  const c = el('canvas', 'portrait');
  c.width = size;
  c.height = size;
  c.style.width = `${size}px`;
  c.style.height = `${size}px`;
  drawPortrait(c, defId, variantId, sf, seed, silhouette);
  return c;
}

/** Leaf pips plus a word: rarity you can read at a glance without it shouting. */
export function rarityBadge(r: Rarity): HTMLElement {
  const rank = Math.min(4, rarityRank(r));
  const wrap = el('span', `rarity rarity-${r}`);
  // The top tier fills every pip and gains one more, in the same quiet style.
  const pips = r === 'mythic' ? '●●●●●✦' : '●'.repeat(rank + 1) + '○'.repeat(4 - rank);
  wrap.append(el('span', 'rarity-pips', pips), el('span', 'rarity-word', RARITY_LABEL[r]));
  return wrap;
}

/** Game-minutes rendered as the real time the player will actually wait. */
export function realTime(gameMinutes: number): string {
  const secs = gameMinutes / GAME_MINUTES_PER_REAL_SECOND;
  if (secs < 60) return 'under a minute';
  const mins = Math.round(secs / 60);
  if (mins < 90) return `about ${mins} min`;
  return `about ${Math.round(mins / 60)} h`;
}

export function note(text: string, cls = 'panel-note'): HTMLElement {
  return el('p', cls, text);
}

export function button(label: string, onClick: () => void, cls = 'primary-btn', disabled = false): HTMLButtonElement {
  const b = el('button', cls, label);
  b.disabled = disabled;
  b.addEventListener('click', onClick);
  return b;
}
