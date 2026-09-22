import type { DiscoveryPoint, SpecimenKind } from '../types';
import type { GameState } from '../state';
import { isNight } from '../engine/Clock';
import { hasToolTier, meetsRequirement } from './tools';
import { addItem, inventoryFull } from './inventory';
import { recordCollected, recordIdentified } from './journal';
import { rollTraits } from './plantGrowth';
import { PLANTS } from '../data/plants';
import { FUNGI } from '../data/fungi';
import { RESPAWN_MINUTES } from '../data/discoveryPoints';

export function weatherSatisfied(state: GameState, req: 'rain' | 'clear' | 'night' | null | undefined): boolean {
  if (!req) return true;
  if (req === 'night') return isNight(state.clock.totalMinutes);
  return state.weather.condition === req;
}

export function isDiscoveryAvailable(state: GameState, dp: DiscoveryPoint): boolean {
  if (dp.foxLed && !state.discoveryPoints[dp.id]?.revealed) return false;
  if (!weatherSatisfied(state, dp.requiresWeather)) return false;
  if (!meetsRequirement(state, dp.requiresToolTier)) return false;
  const ptState = state.discoveryPoints[dp.id];
  if (ptState?.lastCollectedAt != null) {
    const elapsed = state.clock.totalMinutes - ptState.lastCollectedAt;
    if (elapsed < RESPAWN_MINUTES) return false;
  }
  return true;
}

export interface CollectResult {
  success: boolean;
  reason?: string;
  isNewDiscovery?: boolean;
  isNewIdentification?: boolean;
  name?: string;
}

export function collectAt(state: GameState, dp: DiscoveryPoint): CollectResult {
  if (!isDiscoveryAvailable(state, dp)) {
    return { success: false, reason: 'not-available' };
  }
  if (dp.specimenKind !== 'material' && inventoryFull(state)) {
    return { success: false, reason: 'inventory-full' };
  }
  const now = state.clock.totalMinutes;
  const wasKnown = !!state.journal[dp.specimenId];
  const kind: SpecimenKind = dp.specimenKind;

  let traits;
  if (kind === 'plant') {
    const def = PLANTS[dp.specimenId];
    traits = rollTraits(def.baseTraits);
  }

  const added = addItem(state, dp.specimenId, kind, now, { traits });
  if (!added) return { success: false, reason: 'inventory-full' };

  recordCollected(state, dp.specimenId, kind, now);

  let isNewIdentification = false;
  const canIdentify = kind === 'material' || hasToolTier(state, 'lens', 1) || hasToolTier(state, 'fieldKit', 1);
  if (canIdentify) {
    const entry = state.journal[dp.specimenId];
    const wasIdentified = entry.level !== 'DISCOVERED' && entry.level !== 'UNDISCOVERED' ? true : false;
    recordIdentified(state, dp.specimenId, kind, now);
    isNewIdentification = !wasIdentified;
  }

  if (!state.discoveryPoints[dp.id]) {
    state.discoveryPoints[dp.id] = { lastCollectedAt: null, revealed: true };
  }
  state.discoveryPoints[dp.id].lastCollectedAt = now;
  state.discoveryPoints[dp.id].revealed = true;

  const name = kind === 'plant' ? PLANTS[dp.specimenId]?.name : kind === 'fungus' ? FUNGI[dp.specimenId]?.name : undefined;

  return { success: true, isNewDiscovery: !wasKnown, isNewIdentification, name };
}
