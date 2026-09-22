import type { SpecimenKind, TraitSet } from '../types';
import type { GameState, InventoryItem } from '../state';
import { makeUid } from '../state';
import { basketCapacity } from './tools';

const STACKABLE_KINDS: SpecimenKind[] = ['material'];

export function inventorySlotsUsed(state: GameState): number {
  return state.inventory.length;
}

export function inventoryFull(state: GameState): boolean {
  return inventorySlotsUsed(state) >= basketCapacity(state);
}

export interface AddItemOptions {
  traits?: TraitSet;
  quality?: number;
}

export function addItem(state: GameState, defId: string, kind: SpecimenKind, now: number, opts: AddItemOptions = {}): InventoryItem | null {
  if (STACKABLE_KINDS.includes(kind)) {
    const existing = state.inventory.find((i) => i.defId === defId && i.kind === kind);
    if (existing) {
      existing.count += 1;
      return existing;
    }
  }
  if (inventoryFull(state)) return null;
  const item: InventoryItem = {
    uid: makeUid('item'),
    defId,
    kind,
    count: 1,
    traits: opts.traits,
    quality: opts.quality,
    collectedAt: now,
  };
  state.inventory.push(item);
  return item;
}

export function removeItem(state: GameState, uid: string, count = 1): boolean {
  const idx = state.inventory.findIndex((i) => i.uid === uid);
  if (idx === -1) return false;
  const item = state.inventory[idx];
  if (item.count > count) {
    item.count -= count;
    return true;
  }
  state.inventory.splice(idx, 1);
  return true;
}

export function removeMaterial(state: GameState, defId: string, count: number): boolean {
  const item = state.inventory.find((i) => i.defId === defId);
  if (!item || item.count < count) return false;
  return removeItem(state, item.uid, count);
}

export function consumeMaterials(state: GameState, materials: Record<string, number>): boolean {
  const canAfford = Object.entries(materials).every(([defId, need]) => {
    const item = state.inventory.find((i) => i.defId === defId);
    return (item?.count ?? 0) >= need;
  });
  if (!canAfford) return false;
  for (const [defId, need] of Object.entries(materials)) {
    removeMaterial(state, defId, need);
  }
  return true;
}
