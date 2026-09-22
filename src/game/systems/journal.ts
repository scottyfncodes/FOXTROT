import type { DiscoveryLevel, SpecimenKind } from '../types';
import type { GameState, JournalEntry } from '../state';

const LADDER: DiscoveryLevel[] = ['UNDISCOVERED', 'DISCOVERED', 'IDENTIFIED', 'CULTIVATED', 'DEVELOPED', 'MASTERED'];

function rank(level: DiscoveryLevel): number {
  const i = LADDER.indexOf(level);
  return i === -1 ? 0 : i;
}

export function getEntry(state: GameState, specimenId: string): JournalEntry | undefined {
  return state.journal[specimenId];
}

function ensureEntry(state: GameState, specimenId: string, kind: SpecimenKind, now: number): JournalEntry {
  let entry = state.journal[specimenId];
  if (!entry) {
    entry = {
      specimenId,
      kind,
      level: 'UNDISCOVERED',
      firstSeenAt: now,
      timesCollected: 0,
      propagatedCount: 0,
      variantFound: false,
    };
    state.journal[specimenId] = entry;
  }
  return entry;
}

/** Raises a journal entry's level, never lowers it. */
export function advanceLevel(state: GameState, specimenId: string, kind: SpecimenKind, level: DiscoveryLevel, now: number): boolean {
  const entry = ensureEntry(state, specimenId, kind, now);
  if (rank(level) > rank(entry.level)) {
    entry.level = level;
    return true;
  }
  return false;
}

export function recordCollected(state: GameState, specimenId: string, kind: SpecimenKind, now: number) {
  const entry = ensureEntry(state, specimenId, kind, now);
  entry.timesCollected += 1;
  advanceLevel(state, specimenId, kind, 'DISCOVERED', now);
}

export function recordIdentified(state: GameState, specimenId: string, kind: SpecimenKind, now: number) {
  advanceLevel(state, specimenId, kind, 'IDENTIFIED', now);
}

export function recordCultivated(state: GameState, specimenId: string, kind: SpecimenKind, now: number) {
  advanceLevel(state, specimenId, kind, 'CULTIVATED', now);
}

export function recordDeveloped(state: GameState, specimenId: string, kind: SpecimenKind, now: number) {
  advanceLevel(state, specimenId, kind, 'DEVELOPED', now);
}

export function recordMastered(state: GameState, specimenId: string, kind: SpecimenKind, now: number) {
  advanceLevel(state, specimenId, kind, 'MASTERED', now);
}

export function recordPropagated(state: GameState, specimenId: string, kind: SpecimenKind, now: number) {
  const entry = ensureEntry(state, specimenId, kind, now);
  entry.propagatedCount += 1;
}

export function recordVariant(state: GameState, specimenId: string, kind: SpecimenKind, now: number) {
  const entry = ensureEntry(state, specimenId, kind, now);
  entry.variantFound = true;
}

export function recordRelationshipDiscovered(state: GameState, relationshipId: string) {
  if (!state.discoveredRelationships.includes(relationshipId)) {
    state.discoveredRelationships.push(relationshipId);
  }
}
