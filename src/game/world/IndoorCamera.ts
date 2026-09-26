import { Camera } from '../engine/Camera';
import { TILE_SIZE } from '../data/worldMap';
import { INTERIOR_H, INTERIOR_W } from '../data/interior';

/**
 * The house is small and meant to feel close and cozy, so indoors the view
 * zooms in well past a whole-room fit and follows its focus (Ellen, or
 * wherever the player has panned to while arranging), clamped to the walls
 * so it never shows the void beyond them.
 */
export function makeIndoorCamera(outer: Camera, focusX: number, focusY: number): Camera {
  const camera = new Camera();
  camera.viewW = outer.viewW;
  camera.viewH = outer.viewH;
  const shortAxis = Math.min(camera.viewW, camera.viewH);
  // A little closer than the old greenhouse-only 9.5: the interior is wider
  // now, and Ellen should read as the anchor of the room, not a figure in it.
  const targetTilesVisible = 8;
  const fitWholeRoom = Math.min(camera.viewW / (INTERIOR_W * TILE_SIZE), camera.viewH / (INTERIOR_H * TILE_SIZE));
  // The player's zoom applies here too — but zoomed right out, the whole house
  // is the limit: never the void beyond its walls.
  camera.userZoom = outer.userZoom;
  camera.zoom = Math.max(fitWholeRoom, Math.max(fitWholeRoom, shortAxis / (targetTilesVisible * TILE_SIZE)) * outer.userZoom);
  const clampAxis = (world: number, viewSize: number, worldTiles: number): number => {
    const halfView = viewSize / 2 / camera.zoom;
    const worldSize = worldTiles * TILE_SIZE;
    // When the whole room fits on this axis (a phone held upright), still
    // follow her — just never so far that a wall slides off-screen. Pinning
    // the room's centre left Ellen tiles above or below the middle.
    if (worldSize <= viewSize / camera.zoom) {
      // Lean most of the way toward her, so the room stays balanced on screen.
      const leaned = worldSize / 2 + (world - worldSize / 2) * 0.65;
      return Math.min(Math.max(leaned, worldSize - halfView), halfView);
    }
    return Math.min(Math.max(world, halfView), worldSize - halfView);
  };
  camera.x = clampAxis(focusX * TILE_SIZE, camera.viewW, INTERIOR_W);
  camera.y = clampAxis(focusY * TILE_SIZE, camera.viewH, INTERIOR_H);
  return camera;
}

/** Screen (CSS px) → world tiles, for any camera. */
export function screenToTiles(camera: Camera, sx: number, sy: number): { x: number; y: number } {
  return {
    x: ((sx - camera.viewW / 2) / camera.zoom + camera.x) / TILE_SIZE,
    y: ((sy - camera.viewH / 2) / camera.zoom + camera.y) / TILE_SIZE,
  };
}
