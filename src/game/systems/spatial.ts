// A uniform-grid spatial hash: the valley can hold hundreds of plants, and
// "what's near here?" is asked constantly (spreading, planting, tapping,
// drawing), so those questions look at a few buckets instead of everything.

export class SpatialGrid<T> {
  private cells = new Map<number, T[]>();

  constructor(private cellSize = 2) {}

  private key(cx: number, cy: number): number {
    return (cy + 512) * 4096 + (cx + 512);
  }

  insert(x: number, y: number, item: T) {
    const k = this.key(Math.floor(x / this.cellSize), Math.floor(y / this.cellSize));
    const list = this.cells.get(k);
    if (list) list.push(item);
    else this.cells.set(k, [item]);
  }

  /** Calls fn for every item in the cells overlapping the square around (x, y); return true from fn to stop early. */
  query(x: number, y: number, r: number, fn: (item: T) => boolean | void): void {
    const c0x = Math.floor((x - r) / this.cellSize);
    const c1x = Math.floor((x + r) / this.cellSize);
    const c0y = Math.floor((y - r) / this.cellSize);
    const c1y = Math.floor((y + r) / this.cellSize);
    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const list = this.cells.get(this.key(cx, cy));
        if (!list) continue;
        for (const item of list) if (fn(item) === true) return;
      }
    }
  }

  clear() {
    this.cells.clear();
  }
}
