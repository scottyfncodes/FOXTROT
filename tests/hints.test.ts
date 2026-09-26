import { describe, it, expect } from 'vitest';
import { ToastScheduler } from '../src/game/systems/toasts';

describe('hint lifecycle', () => {
  it('drops a queued message whose moment has passed before it could show', () => {
    const s = new ToastScheduler<string>();
    let carrying = true;
    s.push('a', 'New discovery: Alocasia.', 'important', 0);
    s.push('b', 'New discovery: Pothos.', 'important', 0);
    s.tick(0);
    s.push('pot', 'Pot your cutting in a nursery bed.', 'important', 10, { valid: () => carrying });
    expect(s.pending).toBe(1);
    carrying = false;
    s.tick(20);
    expect(s.pending).toBe(0);
    // Room frees up later: the stale hint never appears.
    const r = s.tick(20_000);
    expect(r.show).toEqual([]);
  });

  it('takes a message down early once it stops applying', () => {
    const s = new ToastScheduler<string>();
    let inTool = true;
    s.push('bed', 'Drag across open ground to mark out a bed.', 'important', 0, { valid: () => inTool });
    expect(s.tick(0).show).toEqual(['bed']);
    inTool = false;
    expect(s.tick(100).hide).toEqual(['bed']);
  });

  it('only counts a hint as shown when it actually appears', () => {
    const s = new ToastScheduler<string>();
    let shown = 0;
    s.push('a', 'one', 'important', 0);
    s.push('b', 'two', 'important', 0);
    s.tick(0);
    s.push('c', 'three', 'important', 0, { onShown: () => shown++ });
    s.tick(1);
    expect(shown).toBe(0);
    s.tick(10_000);
    s.tick(10_500);
    expect(shown).toBe(1);
  });

  it('lets even guidance go stale rather than surfacing it minutes later', () => {
    const s = new ToastScheduler<string>();
    s.push('a', 'one', 'important', 0);
    s.push('b', 'two', 'important', 0);
    s.tick(0);
    s.push('late', 'Bring your cutting home.', 'important', 0);
    s.tick(60_000);
    expect(s.showing).not.toContain('late');
    expect(s.pending).toBe(0);
  });
});

describe('a dropped hint can come round again', () => {
  it('reports a drop so the caller can raise it again when it next applies', () => {
    const s = new ToastScheduler<string>();
    let dropped = 0;
    let ok = true;
    s.push('a', 'one', 'important', 0);
    s.push('b', 'two', 'important', 0);
    s.tick(0);
    s.push('h', 'a hint', 'important', 0, { valid: () => ok, onDropped: () => dropped++ });
    ok = false;
    s.tick(10);
    expect(dropped).toBe(1);
    expect(s.pending).toBe(0);
  });
});
