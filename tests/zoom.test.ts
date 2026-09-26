import { describe, it, expect } from 'vitest';
import { Camera, USER_ZOOM_MAX, USER_ZOOM_MIN } from '../src/game/engine/Camera';
import { makeIndoorCamera } from '../src/game/world/IndoorCamera';
import { INTERIOR_H, INTERIOR_W } from '../src/game/data/interior';
import { TILE_SIZE } from '../src/game/data/worldMap';

function phone() {
  const c = new Camera();
  c.resize(390, 844);
  return c;
}

describe('zoom', () => {
  it('scales the view by the player’s zoom, within limits', () => {
    const c = phone();
    const base = c.zoom;
    expect(c.setUserZoom(1.5)).toBe(1.5);
    expect(c.zoom).toBeCloseTo(base * 1.5, 6);
    expect(c.setUserZoom(99)).toBe(USER_ZOOM_MAX);
    expect(c.setUserZoom(0.01)).toBe(USER_ZOOM_MIN);
    // Zooming out shows more of the valley.
    c.setUserZoom(1);
    const near = c.getViewportTileBounds(0);
    c.setUserZoom(0.6);
    const far = c.getViewportTileBounds(0);
    expect(far.maxX - far.minX).toBeGreaterThan(near.maxX - near.minX);
  });

  it('keeps the zoom across a resize (turning the phone)', () => {
    const c = phone();
    c.setUserZoom(1.8);
    c.resize(844, 390);
    expect(c.userZoom).toBe(1.8);
    expect(c.zoom).toBeCloseTo(c.baseZoom * 1.8, 6);
  });

  it('zooms indoors too, but never out past the whole house', () => {
    const c = phone();
    const normal = makeIndoorCamera(c, 12, 6).zoom;
    c.setUserZoom(1.6);
    expect(makeIndoorCamera(c, 12, 6).zoom).toBeCloseTo(normal * 1.6, 6);
    c.setUserZoom(USER_ZOOM_MIN);
    const out = makeIndoorCamera(c, 12, 6);
    const fitWholeHouse = Math.min(c.viewW / (INTERIOR_W * TILE_SIZE), c.viewH / (INTERIOR_H * TILE_SIZE));
    expect(out.zoom).toBeGreaterThanOrEqual(fitWholeHouse - 1e-9);
    expect(out.zoom).toBeLessThan(normal);
  });
});
