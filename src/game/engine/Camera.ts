import { TILE_SIZE } from '../data/worldMap';

/** How far the player can zoom out and in, relative to the screen's natural fit. */
export const USER_ZOOM_MIN = 0.55;
export const USER_ZOOM_MAX = 2.2;

export class Camera {
  x = 0; // world px, center
  y = 0;
  viewW = 0;
  viewH = 0;
  zoom = 1;
  /** The fit for this screen, before the player's own zoom. */
  baseZoom = 1;
  /** The player's pinch/scroll zoom, a multiplier on the fit (see USER_ZOOM_MIN/MAX). */
  userZoom = 1;

  resize(cssW: number, cssH: number) {
    this.viewW = cssW;
    this.viewH = cssH;
    // Zoom out a little on very small phones, in a little on large desktops,
    // keeping roughly 16-20 tiles visible across the shorter axis.
    const shortAxis = Math.min(cssW, cssH);
    const targetTilesVisible = 9;
    this.baseZoom = Math.max(1, Math.min(3.2, shortAxis / (targetTilesVisible * TILE_SIZE)));
    this.zoom = this.baseZoom * this.userZoom;
  }

  /** Sets the player's zoom (clamped), keeping the screen fit underneath it. Returns the value used. */
  setUserZoom(z: number): number {
    this.userZoom = Math.min(USER_ZOOM_MAX, Math.max(USER_ZOOM_MIN, z));
    this.zoom = this.baseZoom * this.userZoom;
    return this.userZoom;
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
