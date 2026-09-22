import type { ZoneId } from '../types';
import type { GameState } from '../state';
import { CREATURES } from '../data/creatures';
import { RELATIONSHIPS } from '../data/relationships';
import { getPopulation } from './ecosystem';
import { meetsRequirement, hasToolTier } from './tools';
import { recordCollected, recordIdentified, recordRelationshipDiscovered } from './journal';
import { isNight } from '../engine/Clock';

const PRESENCE_THRESHOLD = 22;

/** Quietly notices wildlife that's clearly present, without a "collect" action — you just observe it. */
export function tickObservation(state: GameState, zone: ZoneId, now: number) {
  if (zone === 'greenhouse') return;
  for (const creature of Object.values(CREATURES)) {
    if (!creature.zones.includes(zone)) continue;
    if (creature.nocturnal && !isNight(now)) continue;
    if (!meetsRequirement(state, creature.requiresToolTier)) continue;
    const pop = getPopulation(state, zone, creature.id);
    if (pop < PRESENCE_THRESHOLD) continue;
    const before = state.journal[creature.id]?.level;
    recordCollected(state, creature.id, creature.kind, now);
    if (hasToolTier(state, 'lens', 1) || hasToolTier(state, 'fieldKit', 1) || !creature.requiresToolTier) {
      recordIdentified(state, creature.id, creature.kind, now);
    }
    void before;
  }

  for (const rel of RELATIONSHIPS) {
    if (rel.discovered || state.discoveredRelationships.includes(rel.id)) continue;
    const sourceKnown = !!state.journal[rel.source] && state.journal[rel.source].level !== 'UNDISCOVERED';
    const targetKnown = !!state.journal[rel.target] && state.journal[rel.target].level !== 'UNDISCOVERED';
    if (sourceKnown && targetKnown) {
      recordRelationshipDiscovered(state, rel.id);
    }
  }
}
