import { describe, it, expect } from 'vitest';
import { pickInteractable, INTERACT_PRIORITY } from '../src/game/engine/Game';

describe('interaction priority', () => {
  it('lets the stall win over a wild plant that has grown up closer to Ellen', () => {
    const pick = pickInteractable([
      { kind: 'wildPlant' as const, dist: 0.4 },
      { kind: 'market' as const, dist: 1.4 },
    ]);
    expect(pick?.kind).toBe('market');
  });

  it('never loses a door behind a seedling', () => {
    const pick = pickInteractable([
      { kind: 'wildPlant' as const, dist: 0.2 },
      { kind: 'spot' as const, dist: 0.9 },
      { kind: 'greenhouseDoor' as const, dist: 1.2 },
    ]);
    expect(pick?.kind).toBe('greenhouseDoor');
  });

  it('still picks the nearest among equals', () => {
    const pick = pickInteractable([
      { kind: 'wildPlant' as const, dist: 0.9, id: 'far' },
      { kind: 'wildPlant' as const, dist: 0.3, id: 'near' },
    ]);
    expect(pick?.id).toBe('near');
  });

  it('ranks doors above the stall, the stall above beds, beds above finds, finds above patches, patches above wild plants', () => {
    const order = ['greenhouseDoor', 'market', 'bed', 'foxFind', 'spot', 'wildPlant'] as const;
    for (let i = 1; i < order.length; i++) expect(INTERACT_PRIORITY[order[i]]).toBeGreaterThan(INTERACT_PRIORITY[order[i - 1]]);
  });
});
