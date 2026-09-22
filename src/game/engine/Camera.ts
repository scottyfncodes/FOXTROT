import { TILE_SIZE } from '../data/worldMap';

export class Camera {
  x = 0; // world px, center
  y = 0;
  viewW = 0;
  viewH = 0;
  zoom = 1;

  resize(cssW: number, cssH: number) {
    this.viewW = cssW;
    this.viewH = cssH;
    // Zoom out a little on very small phones, in a little on large desktops,
    // keeping roughly 16-20 tiles visible across the shorter axis.
    const shortAxis = Math.min(cssW, cssH);
    const targetTilesVisible = 14;
    this.zoom = Math.max(1, Math.min(2.2, shortAxis / (targetTilesVisible * TILE_SIZE)));
  }

  follow(worldTileX: number, worldTileY: number) {
    this.x = worldTileX * TILE_SIZE;
    this.y = worldTileY * TILE_SIZE;
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: (wx - this.x) * this.zoom + this.viewW / 2,
      y: (wy - this.y) * this.zoom + this.viewH / 2,
    };
  }

  getViewportTileBounds(padding = 3) {
    const halfW = this.viewW / 2 / this.zoom / TILE_SIZE;
    const halfH = this.viewH / 2 / this.zoom / TILE_SIZE;
    const cx = this.x / TILE_SIZE;
    const cy = this.y / TILE_SIZE;
    return {
      minX: Math.floor(cx - halfW - padding),
      maxX: Math.ceil(cx + halfW + padding),
      minY: Math.floor(cy - halfH - padding),
      maxY: Math.ceil(cy + halfH + padding),
    };
  }
}
