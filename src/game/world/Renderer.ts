import { Camera } from '../engine/Camera';
import type { GameState, ScoutState, ScottState, CatState, Facing, OwnedPlant, PlacedDecor } from '../state';
import type { Obstacle } from './Obstacles';
import type { DiscoverySpot, ZoneId } from '../types';
import { TILE_SIZE, GRID_W, GREENHOUSE_FOOTPRINT, GREENHOUSE_DOOR, MARKET_STALL, zoneAt, isWater } from '../data/worldMap';
import { ZONES } from '../data/zones';
import { GREENHOUSE_GRID_W, GREENHOUSE_GRID_H, GREENHOUSE_EXIT, GREENHOUSE_FURNITURE, NURSERY_BEDS, DISPLAY_SLOTS, STORAGE_CRATES, type DisplaySlot } from '../data/stations';
import { PLANTS, lookFor, specimenRarity, rarityRank } from '../data/plants';
import { TOOL_PICKUPS } from '../data/toolPickups';
import { DISCOVERY_SPOTS } from '../data/discoveryPoints';
import { findPotStyle } from '../data/shop';
import { ELLEN_APPEARANCE, SCOUT_APPEARANCE, SCOTT_APPEARANCE, CAT_APPEARANCE } from '../data/character';
import { daylightFactor, isNight } from '../engine/Clock';
import { spotContent } from '../systems/spots';
import { hasFound } from '../systems/collection';
import { stageFloat } from '../systems/growth';
import { demandSpecies } from '../systems/market';
import type { LushField } from '../systems/wild';
import { CHARACTERS } from '../systems/wild';
import { PlantSpriteCache, type PlantMode } from './PlantArt';

/** Ground colour each kind of planting pulls the land toward as it thickens. */
const LUSH_GROUND: Record<string, RGB> = {
  fern: [44, 88, 52],
  jungle: [40, 76, 32],
  vine: [58, 98, 40],
  flower: [74, 104, 50],
  arid: [118, 128, 80],
  color: [70, 86, 58],
  strange: [58, 56, 76],
};

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const p = parseInt(hex.slice(1), 16);
  return [(p >> 16) & 255, (p >> 8) & 255, p & 255];
}

function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function rgbCss(c: RGB): string {
  return `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
}

function lerpColor(a: string, b: string, t: number): string {
  return rgbCss(mixRgb(hexToRgb(a), hexToRgb(b), t));
}

/** Bilinear value noise over the hash lattice: smooth, organic patches. */
function smoothNoise(x: number, y: number, scale: number): number {
  const gx = x / scale;
  const gy = y / scale;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0);
  const b = hash2(x0 + 1, y0);
  const c = hash2(x0, y0 + 1);
  const d = hash2(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function luminance(c: RGB): number {
  return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
}

// Each zone's ground palette as a dark-to-light gradient, so tiles can be
// sampled continuously instead of flipping between discrete swatches.
const GROUND_GRADIENTS = Object.fromEntries(
  Object.values(ZONES).map((z) => [z.id, z.groundColors.map(hexToRgb).sort((a, b) => luminance(a) - luminance(b))])
) as Record<ZoneId, RGB[]>;

function sampleGradient(stops: RGB[], t: number): RGB {
  if (stops.length === 1) return stops[0];
  const pos = Math.max(0, Math.min(0.9999, t)) * (stops.length - 1);
  const i = Math.floor(pos);
  return mixRgb(stops[i], stops[i + 1], pos - i);
}

type GroundDetail = 'grass' | 'litter' | 'moss' | 'pebbles';
const GROUND_DETAIL: Partial<Record<ZoneId, GroundDetail>> = {
  meadow: 'grass',
  overgrownClearing: 'grass',
  woodland: 'litter',
  dampForest: 'moss',
  rockyClearing: 'pebbles',
  creek: 'pebbles',
};
const BLOB_COLORS: Record<GroundDetail, string> = {
  grass: 'rgba(0,0,0,0)',
  litter: 'rgba(122,88,48,0.24)',
  moss: 'rgba(150,196,120,0.16)',
  pebbles: 'rgba(58,52,42,0.26)',
};
const NEIGHBORS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export class Renderer {
  private lastEllenX = 0;
  private lastEllenY = 0;
  private sprites = new PlantSpriteCache();
  private dpr = 1;

  constructor(private ctx: CanvasRenderingContext2D) {}

  clear(color: string) {
    const { ctx } = this;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  renderOutdoor(camera: Camera, state: GameState, obstacles: Obstacle[], now: number, crouching = false, lush: LushField | null = null) {
    const zoneHere = zoneAt(Math.floor(state.player.x), Math.floor(state.player.y));
    this.clear(ZONES[zoneHere].tint);
    this.sprites.beginFrame();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const bounds = camera.getViewportTileBounds();
    const inView = (x: number, y: number, pad = 2) => x > bounds.minX - pad && x < bounds.maxX + pad && y > bounds.minY - pad && y < bounds.maxY + pad;

    this.drawGround(camera, bounds, now, lush);
    this.drawGreenhouseExterior(camera, state.clock.totalMinutes);

    for (const o of obstacles) {
      if (!inView(o.x, o.y)) continue;
      this.drawObstacle(camera, o, lush ? lush.lush[o.y * GRID_W + o.x] : 0);
    }

    // Everything that stands up off the ground is depth-sorted together, so
    // Ellen can walk behind a big monstera and in front of a small one.
    const drawables: { y: number; draw: () => void }[] = [];
    for (const p of Object.values(state.plants)) {
      if (p.location.kind !== 'wild' || !inView(p.location.x, p.location.y, 3)) continue;
      const loc = p.location;
      drawables.push({ y: loc.y, draw: () => this.drawWildPlant(camera, state, p, loc.x, loc.y, now) });
    }
    for (const spot of DISCOVERY_SPOTS) {
      if (!inView(spot.x, spot.y)) continue;
      drawables.push({ y: spot.y + 0.5, draw: () => this.drawSpot(camera, state, spot, now) });
    }
    for (const d of state.decor) {
      if (!inView(d.x, d.y)) continue;
      drawables.push({ y: d.y, draw: () => this.drawDecor(camera, d, state, now) });
    }
    for (const tp of TOOL_PICKUPS) {
      if (state.tools[tp.tool] || !inView(tp.x, tp.y)) continue;
      drawables.push({ y: tp.y + 0.5, draw: () => this.drawLanternPickup(camera, tp.x + 0.5, tp.y + 0.5, now) });
    }
    if (inView(MARKET_STALL.x, MARKET_STALL.y, 4)) {
      drawables.push({ y: MARKET_STALL.y + 0.8, draw: () => this.drawMarketStall(camera, state, now) });
    }
    if (state.fox.visible && !state.player.inGreenhouse) {
      drawables.push({ y: state.fox.y, draw: () => this.drawFox(camera, state.fox.x, state.fox.y, now) });
    }
    drawables.push({ y: state.scout.y, draw: () => this.drawScout(camera, state.scout, now) });
    if (state.scott.zone !== 'greenhouse') {
      drawables.push({ y: state.scott.y, draw: () => this.drawScott(camera, state.scott, now) });
    }
    const moving = Math.hypot(state.player.x - this.lastEllenX, state.player.y - this.lastEllenY) > 0.001;
    this.lastEllenX = state.player.x;
    this.lastEllenY = state.player.y;
    drawables.push({ y: state.player.y, draw: () => this.drawEllen(camera, state.player.x, state.player.y, state.player.facing, now, moving, crouching) });
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();

    // Low foreground vegetation drawn last, so tall grass/reeds partially
    // overlap the characters' feet instead of characters always reading on
    // top of everything.
    for (const o of obstacles) {
      if (o.kind !== 'flower' && o.kind !== 'reed') continue;
      if (!inView(o.x, o.y)) continue;
      const nearFeet = Math.hypot(o.x + 0.5 - state.player.x, o.y + 0.5 - state.player.y) < 0.9;
      if (nearFeet) this.drawObstacle(camera, o, 0);
    }

    this.drawPollinators(camera, state, bounds, now);
    this.drawAmbientParticles(camera, zoneHere, state.weather.condition, now);
    this.drawWeatherOverlay(camera, state, now);
    this.drawNightLights(camera, state, bounds, now);
  }

  /**
   * Ground colour comes from smooth value noise sampled along each zone's
   * palette, so neighbouring tiles differ gently instead of reading as a
   * checkerboard; tiles bordering another zone lean toward its colour to
   * soften the straight seams. Small per-zone detail (grass blades, leaf
   * litter, moss, pebbles) is batched into one path per layer.
   */
  private drawGround(camera: Camera, bounds: { minX: number; maxX: number; minY: number; maxY: number }, now: number, lush: LushField | null) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    const size = Math.ceil(tile) + 1;
    const dark = new Path2D();
    const light = new Path2D();
    const blobs: Partial<Record<GroundDetail, Path2D>> = {};
    // Ground cover under the player's plantings: leaf litter and runners,
    // plus petals or glints depending on what's been planted there.
    const coverDark = new Path2D();
    const coverLight = new Path2D();
    const petals: Record<string, Path2D> = {};
    const petalColors: Record<string, string> = {
      flower: 'rgba(250,244,236,0.85)',
      color: 'rgba(236,140,190,0.8)',
      strange: 'rgba(190,150,255,0.7)',
      arid: 'rgba(200,210,170,0.6)',
    };

    for (let ty = bounds.minY; ty <= bounds.maxY; ty++) {
      for (let tx = bounds.minX; tx <= bounds.maxX; tx++) {
        const screen = camera.worldToScreen(tx * TILE_SIZE, ty * TILE_SIZE);
        const sx = Math.floor(screen.x);
        const sy = Math.floor(screen.y);
        if (isWater(tx, ty)) {
          const wobble = Math.sin(now * 0.002 + tx * 0.6 + ty * 0.3) * 0.15 + 0.5;
          ctx.fillStyle = lerpColor('#1c4650', '#3f7f86', wobble);
          ctx.fillRect(sx, sy, size, size);
          continue;
        }

        const zone = zoneAt(tx, ty);
        const t = 0.78 * smoothNoise(tx, ty, 6) + 0.22 * hash2(tx + 17.3, ty - 4.1);
        let color = sampleGradient(GROUND_GRADIENTS[zone], t);
        for (const [dx, dy] of NEIGHBORS) {
          const nz = zoneAt(tx + dx, ty + dy);
          if (nz === zone || nz === 'greenhouse' || isWater(tx + dx, ty + dy)) continue;
          color = mixRgb(color, sampleGradient(GROUND_GRADIENTS[nz], t), 0.2);
        }
        const li = ty * GRID_W + tx;
        const lushHere = lush ? Math.min(1, lush.lush[li] / 0.9) : 0;
        if (lushHere > 0.01) {
          const ch = CHARACTERS[lush!.character[li]] ?? 'jungle';
          const target = LUSH_GROUND[ch];
          const shade = 0.85 + 0.3 * smoothNoise(tx + 40, ty + 40, 3);
          color = mixRgb(color, [target[0] * shade, target[1] * shade, target[2] * shade], lushHere * 0.85);
          // Scatter cover detail in proportion to how overgrown the tile is.
          const count = Math.floor(lushHere * 5);
          for (let k = 0; k < count; k++) {
            const px = sx + hash2(tx * 1.3 + k * 7.7, ty * 0.7) * tile;
            const py = sy + hash2(tx * 0.9, ty * 1.1 + k * 5.3) * tile;
            const r = tile * (0.05 + 0.05 * hash2(tx + k, ty - k));
            const path = k % 2 === 0 ? coverDark : coverLight;
            path.moveTo(px + r, py);
            path.ellipse(px, py, r, r * 0.55, hash2(tx - k, ty + k) * Math.PI, 0, Math.PI * 2);
            if (petalColors[ch] && k % 2 === 1 && hash2(tx + k * 3, ty) < lushHere) {
              const pp = (petals[ch] ??= new Path2D());
              const pr = tile * 0.025;
              pp.moveTo(px + tile * 0.08 + pr, py - tile * 0.04);
              pp.arc(px + tile * 0.08, py - tile * 0.04, pr, 0, Math.PI * 2);
            }
          }
        }
        ctx.fillStyle = rgbCss(color);
        ctx.fillRect(sx, sy, size, size);

        const detail = lushHere > 0.55 ? undefined : GROUND_DETAIL[zone];
        const d = hash2(tx * 3.1, ty * 1.7);
        if (!detail || d > 0.62) continue;
        for (let k = 0; k < 3; k++) {
          const px = sx + (0.12 + 0.76 * hash2(tx + k * 5.3, ty * 2.1)) * tile;
          const py = sy + (0.2 + 0.7 * hash2(tx * 2.3, ty + k * 3.7)) * tile;
          if (detail === 'grass') {
            const lean = (hash2(tx + k, ty - k) - 0.5) * tile * 0.08;
            const path = k % 2 === 0 ? dark : light;
            path.moveTo(px, py);
            path.lineTo(px + lean, py - tile * 0.13);
          } else if (k < 2) {
            const r = tile * (detail === 'pebbles' ? 0.045 : 0.05) * (0.7 + d);
            const path = (blobs[detail] ??= new Path2D());
            path.moveTo(px + r, py);
            path.ellipse(px, py, r, r * 0.62, hash2(tx, ty + k) * Math.PI, 0, Math.PI * 2);
          }
        }
      }
    }

    ctx.lineWidth = Math.max(1, tile * 0.022);
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(28,52,22,0.32)';
    ctx.stroke(dark);
    ctx.strokeStyle = 'rgba(214,236,160,0.2)';
    ctx.stroke(light);
    ctx.lineCap = 'butt';
    for (const kind of Object.keys(blobs) as GroundDetail[]) {
      ctx.fillStyle = BLOB_COLORS[kind];
      ctx.fill(blobs[kind]!);
    }
    ctx.fillStyle = 'rgba(16,40,14,0.35)';
    ctx.fill(coverDark);
    ctx.fillStyle = 'rgba(120,170,80,0.28)';
    ctx.fill(coverLight);
    for (const [ch, path] of Object.entries(petals)) {
      ctx.fillStyle = petalColors[ch];
      ctx.fill(path);
    }
  }

  private drawGreenhouseExterior(camera: Camera, gameMinutes: number) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    const topLeft = camera.worldToScreen(GREENHOUSE_FOOTPRINT.x * TILE_SIZE, GREENHOUSE_FOOTPRINT.y * TILE_SIZE);
    const w = GREENHOUSE_FOOTPRINT.w * tile;
    const h = GREENHOUSE_FOOTPRINT.h * tile;
    const grad = ctx.createLinearGradient(topLeft.x, topLeft.y, topLeft.x, topLeft.y + h);
    const night = isNight(gameMinutes);
    grad.addColorStop(0, night ? '#8fae9e' : '#bcd8c8');
    grad.addColorStop(1, night ? '#3c5a4d' : '#6f8f7c');
    ctx.fillStyle = grad;
    ctx.fillRect(topLeft.x, topLeft.y, w, h);
    ctx.strokeStyle = '#2c3d33';
    ctx.lineWidth = Math.max(1, tile * 0.06);
    ctx.strokeRect(topLeft.x, topLeft.y, w, h);
    // Pane lines
    ctx.strokeStyle = 'rgba(40,60,50,0.4)';
    ctx.lineWidth = 1;
    for (let i = 1; i < GREENHOUSE_FOOTPRINT.w; i++) {
      ctx.beginPath();
      ctx.moveTo(topLeft.x + i * tile, topLeft.y);
      ctx.lineTo(topLeft.x + i * tile, topLeft.y + h);
      ctx.stroke();
    }
    // Warm interior glow
    ctx.fillStyle = night ? 'rgba(255,200,120,0.18)' : 'rgba(255,220,150,0.08)';
    ctx.fillRect(topLeft.x + tile, topLeft.y + tile, w - tile * 2, h - tile * 2);
    // Door
    const doorScreen = camera.worldToScreen(GREENHOUSE_DOOR.x * TILE_SIZE, GREENHOUSE_DOOR.y * TILE_SIZE);
    ctx.fillStyle = '#4a3623';
    ctx.fillRect(doorScreen.x, doorScreen.y - tile * 0.3, tile, tile * 0.5);
  }

  private drawObstacle(camera: Camera, o: Obstacle, lushHere: number) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    const screen = camera.worldToScreen((o.x + 0.5) * TILE_SIZE, (o.y + 0.5) * TILE_SIZE);
    const jitter = hash2(o.x, o.y) - 0.5;
    switch (o.kind) {
      case 'tree': {
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath();
        ctx.ellipse(screen.x, screen.y + tile * 0.32, tile * 0.34, tile * 0.14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#4a3423';
        ctx.fillRect(screen.x - tile * 0.05, screen.y - tile * 0.1, tile * 0.1, tile * 0.4);
        // Two-tone canopy: a darker under-layer for depth, then the lit
        // clumps on top, so the tree reads as a volume, not a flat blob.
        const shade = lerpColor('#1f331f', '#2a4526', hash2(o.x + 2, o.y + 5));
        ctx.fillStyle = shade;
        ctx.beginPath();
        ctx.arc(screen.x + jitter * tile * 0.15, screen.y - tile * 0.28, tile * 0.37, 0, Math.PI * 2);
        ctx.fill();
        const green = lerpColor('#2f4a2c', '#3f6b3a', hash2(o.x + 1, o.y + 1));
        ctx.fillStyle = green;
        ctx.beginPath();
        ctx.arc(screen.x + jitter * tile * 0.15, screen.y - tile * 0.34, tile * 0.32, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(screen.x - tile * 0.2, screen.y - tile * 0.2, tile * 0.23, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(screen.x + tile * 0.22, screen.y - tile * 0.18, tile * 0.21, 0, Math.PI * 2);
        ctx.fill();
        // sunlit highlight clump
        const highlight = lerpColor('#4d7a44', '#6a9a5a', hash2(o.x + 9, o.y + 4));
        ctx.fillStyle = highlight;
        ctx.beginPath();
        ctx.arc(screen.x + jitter * tile * 0.1 - tile * 0.08, screen.y - tile * 0.4, tile * 0.14, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'bush': {
        const green = lerpColor('#3a5a34', '#4d7040', hash2(o.x, o.y + 3));
        ctx.fillStyle = green;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, tile * 0.26, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(screen.x - tile * 0.16, screen.y + tile * 0.06, tile * 0.18, 0, Math.PI * 2);
        ctx.fill();
        const highlight = lerpColor('#5a8a4c', '#78ac68', hash2(o.x + 4, o.y + 1));
        ctx.fillStyle = highlight;
        ctx.beginPath();
        ctx.arc(screen.x + tile * 0.08, screen.y - tile * 0.1, tile * 0.1, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'rock': {
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.beginPath();
        ctx.ellipse(screen.x, screen.y + tile * 0.16, tile * 0.28, tile * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = lerpColor('#7c7460', '#93876a', hash2(o.x, o.y));
        ctx.beginPath();
        ctx.moveTo(screen.x - tile * 0.26, screen.y + tile * 0.14);
        ctx.lineTo(screen.x - tile * 0.12, screen.y - tile * 0.2);
        ctx.lineTo(screen.x + tile * 0.16, screen.y - tile * 0.16);
        ctx.lineTo(screen.x + tile * 0.26, screen.y + tile * 0.12);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'flower': {
        const hue = 300 + hash2(o.x, o.y) * 80;
        ctx.fillStyle = `hsl(${hue}, 55%, 65%)`;
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(screen.x + Math.cos(a) * tile * 0.08, screen.y + Math.sin(a) * tile * 0.08, tile * 0.07, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#e8d873';
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, tile * 0.05, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'reed': {
        ctx.strokeStyle = '#4d7a5a';
        ctx.lineWidth = Math.max(1, tile * 0.05);
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(screen.x + i * tile * 0.1, screen.y + tile * 0.2);
          ctx.lineTo(screen.x + i * tile * 0.1 + jitter * 4, screen.y - tile * 0.28);
          ctx.stroke();
        }
        break;
      }
    }
    // Once the player's plants have taken the ground around it, the old
    // landscape starts disappearing under them: rocks and shrubs get
    // smothered in leaves, trunks wear vines.
    if (lushHere > 0.5) this.drawOvergrowth(screen.x, screen.y, tile, o, Math.min(1, (lushHere - 0.5) / 0.5));
  }

  private drawOvergrowth(x: number, y: number, tile: number, o: Obstacle, amount: number) {
    const { ctx } = this;
    const n = Math.round(3 + amount * 6);
    if (o.kind === 'tree') {
      ctx.strokeStyle = 'rgba(52,96,40,0.9)';
      ctx.lineWidth = Math.max(1, tile * 0.03);
      ctx.beginPath();
      ctx.moveTo(x - tile * 0.05, y + tile * 0.28);
      ctx.bezierCurveTo(x + tile * 0.08, y + tile * 0.1, x - tile * 0.08, y, x + tile * 0.04, y - tile * 0.12);
      ctx.stroke();
    }
    for (let i = 0; i < n; i++) {
      const a = hash2(o.x + i, o.y - i) * Math.PI * 2;
      const r = tile * (0.08 + 0.18 * hash2(o.x * 2 + i, o.y));
      const lx = x + Math.cos(a) * r;
      const ly = y + (o.kind === 'tree' ? tile * 0.2 : 0) + Math.sin(a) * r * 0.6;
      ctx.fillStyle = lerpColor('#2c5a26', '#5a8e3e', hash2(o.x + i * 3, o.y + i));
      ctx.beginPath();
      ctx.ellipse(lx, ly, tile * (0.08 + amount * 0.05), tile * (0.045 + amount * 0.03), a, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private glowMarker(x: number, y: number, tile: number, hexColor: string, now: number) {
    const { ctx } = this;
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.003);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, tile * (0.5 + pulse * 0.15));
    const [r, g, b] = hexToRgb(hexColor);
    grad.addColorStop(0, `rgba(${r},${g},${b},0.45)`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, tile * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Blits a cached plant sprite with its base at (x, y) screen px, with a
   * gentle wind sway (a skew about the base) and a per-plant mirror flip.
   */
  private drawPlantSprite(x: number, y: number, unit: number, defId: string, variantId: string, sf: number, seed: number, mode: PlantMode, now: number, windy = false): boolean {
    const sprite = this.sprites.get(defId, variantId, sf, seed, unit, mode, this.dpr);
    if (!sprite) return false;
    const { ctx } = this;
    const sway = Math.sin(now * 0.0015 + (seed % 97)) * (windy ? 0.07 : 0.03) + Math.sin(now * 0.0041 + seed) * 0.01;
    ctx.save();
    ctx.translate(x, y);
    ctx.transform(1, 0, mode === 'hanging' ? 0 : sway, 1, 0, 0);
    if (seed % 2 === 1) ctx.scale(-1, 1);
    ctx.drawImage(sprite.canvas, -sprite.ox, -sprite.oy, sprite.w, sprite.h);
    ctx.restore();
    return true;
  }

  private drawWildPlant(camera: Camera, state: GameState, p: OwnedPlant, wx: number, wy: number, now: number) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    const s = camera.worldToScreen(wx * TILE_SIZE, wy * TILE_SIZE);
    const sf = stageFloat(p.growth);
    const look = lookFor(p.defId, p.variantId);
    const spread = tile * (0.12 + sf * 0.1) * look.size;
    ctx.fillStyle = 'rgba(10,24,8,0.22)';
    ctx.beginPath();
    ctx.ellipse(s.x, s.y + tile * 0.04, spread, spread * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Foliage between the camera and Ellen fades, so she never gets lost in
    // the jungle she planted.
    const dx = wx - state.player.x;
    const dy = wy - state.player.y;
    const hides = dy > 0 && dy < 0.6 + sf * 0.3 && Math.abs(dx) < 0.5 + sf * 0.25;
    if (hides) ctx.globalAlpha = 0.45;
    this.drawPlantSprite(s.x, s.y + tile * 0.05, tile, p.defId, p.variantId, sf, p.seed, 'ground', now, state.weather.condition === 'rain');
    ctx.globalAlpha = 1;
    if (p.unnoticed) this.drawSparkle(s.x, s.y - tile * 0.35, tile, now, '#fff4c2', 3);
  }

  /** A few twinkling points: something here is worth walking over to. */
  private drawSparkle(x: number, y: number, tile: number, now: number, color: string, count: number) {
    const { ctx } = this;
    ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const ph = now * 0.003 + i * 2.1;
      const a = 0.5 + 0.5 * Math.sin(ph);
      const px = x + Math.cos(i * 2.4 + now * 0.0007) * tile * 0.28;
      const py = y + Math.sin(i * 1.7 + now * 0.0009) * tile * 0.18;
      const r = tile * 0.05 * a;
      ctx.globalAlpha = 0.35 + a * 0.6;
      ctx.beginPath();
      ctx.moveTo(px, py - r * 2);
      ctx.lineTo(px + r * 0.5, py - r * 0.5);
      ctx.lineTo(px + r * 2, py);
      ctx.lineTo(px + r * 0.5, py + r * 0.5);
      ctx.lineTo(px, py + r * 2);
      ctx.lineTo(px - r * 0.5, py + r * 0.5);
      ctx.lineTo(px - r * 2, py);
      ctx.lineTo(px - r * 0.5, py - r * 0.5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /**
   * A wild patch shows the actual plant growing there — the plant itself
   * is the clue. Things you've never seen get a curious sparkle; rarer
   * finds shimmer more.
   */
  private drawSpot(camera: Camera, state: GameState, spot: DiscoverySpot, now: number) {
    const { ctx } = this;
    const content = spotContent(state, spot);
    if (!content) return;
    const tile = TILE_SIZE * camera.zoom;
    const s = camera.worldToScreen((spot.x + 0.5) * TILE_SIZE, (spot.y + 0.65) * TILE_SIZE);
    const rank = rarityRank(specimenRarity(content.defId, content.variantId));
    const unseen = !hasFound(state, content.defId, content.variantId);
    // Soft disturbed-earth patch so it reads as "something's growing here".
    ctx.fillStyle = 'rgba(58,40,22,0.35)';
    ctx.beginPath();
    ctx.ellipse(s.x, s.y + tile * 0.02, tile * 0.3, tile * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    if (rank >= 2) this.glowMarker(s.x, s.y - tile * 0.2, tile, rank >= 3 ? '#f0d27a' : '#bfe6d4', now);
    this.drawPlantSprite(s.x, s.y + tile * 0.04, tile, content.defId, content.variantId, 1.5, content.seed, 'ground', now);
    if (unseen) this.drawSparkle(s.x, s.y - tile * 0.35, tile, now, rank >= 3 ? '#ffe28a' : '#ffffff', 2 + Math.min(3, rank));
  }

  private drawLanternPickup(camera: Camera, wx: number, wy: number, now: number) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    const s = camera.worldToScreen(wx * TILE_SIZE, wy * TILE_SIZE);
    this.glowMarker(s.x, s.y - tile * 0.1, tile, '#f2c86a', now);
    ctx.fillStyle = '#3a3026';
    ctx.fillRect(s.x - tile * 0.09, s.y - tile * 0.26, tile * 0.18, tile * 0.04);
    ctx.fillStyle = 'rgba(255,214,120,0.9)';
    ctx.fillRect(s.x - tile * 0.07, s.y - tile * 0.22, tile * 0.14, tile * 0.18);
    ctx.strokeStyle = '#3a3026';
    ctx.lineWidth = Math.max(1, tile * 0.025);
    ctx.strokeRect(s.x - tile * 0.07, s.y - tile * 0.22, tile * 0.14, tile * 0.18);
    ctx.beginPath();
    ctx.arc(s.x, s.y - tile * 0.28, tile * 0.05, Math.PI, 0);
    ctx.stroke();
  }

  private drawPot(x: number, y: number, tile: number, potId: string, scale = 1) {
    const { ctx } = this;
    const pot = findPotStyle(potId);
    const w = tile * 0.2 * scale;
    const h = tile * 0.26 * scale;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(x, y + h, w * 1.2, w * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w * 0.75, y + h);
    ctx.lineTo(x - w * 0.75, y + h);
    ctx.closePath();
    const g = ctx.createLinearGradient(x - w, 0, x + w, 0);
    g.addColorStop(0, pot.shade);
    g.addColorStop(0.35, pot.body);
    g.addColorStop(1, pot.shade);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    ctx.clip();
    if (pot.pattern === 'speckle') {
      ctx.fillStyle = 'rgba(80,60,40,0.55)';
      for (let i = 0; i < 14; i++) ctx.fillRect(x - w + hash2(i, 3) * w * 2, y + hash2(3, i) * h, 1.2, 1.2);
    } else if (pot.pattern === 'weave') {
      ctx.strokeStyle = 'rgba(90,70,40,0.5)';
      ctx.lineWidth = 1;
      for (let k = 1; k < 4; k++) {
        ctx.beginPath();
        ctx.moveTo(x - w, y + (h * k) / 4);
        ctx.lineTo(x + w, y + (h * k) / 4);
        ctx.stroke();
      }
    } else if (pot.pattern === 'hammered') {
      ctx.fillStyle = 'rgba(255,220,170,0.25)';
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.arc(x - w + hash2(i, 9) * w * 2, y + hash2(9, i) * h, w * 0.14, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (pot.pattern === 'drip') {
      ctx.fillStyle = 'rgba(20,60,58,0.7)';
      ctx.fillRect(x - w, y, w * 2, h * 0.28);
    } else if (pot.pattern === 'gold') {
      ctx.strokeStyle = '#d8b24a';
      ctx.lineWidth = Math.max(1, tile * 0.012);
      ctx.beginPath();
      ctx.moveTo(x - w, y + h * 0.55);
      ctx.lineTo(x + w, y + h * 0.55);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = pot.rim;
    ctx.fillRect(x - w * 1.08, y - h * 0.08, w * 2.16, h * 0.18);
    ctx.fillStyle = '#3a2a1c';
    ctx.beginPath();
    ctx.ellipse(x, y - h * 0.02, w * 0.95, h * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * The farmer's market stall: a trestle table, crates of plants for sale,
   * and a chalkboard advertising what people are asking for today.
   * Upgrades show up on the stall itself.
   */
  private drawMarketStall(camera: Camera, state: GameState, now: number) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    const tl = camera.worldToScreen(MARKET_STALL.x * TILE_SIZE, MARKET_STALL.y * TILE_SIZE);
    const w = MARKET_STALL.w * tile;
    const awning = state.owned.includes('stallAwning');
    const crates = state.owned.includes('stallCrates');
    const top = tl.y - tile * 0.9;
    // posts
    ctx.fillStyle = '#5a3f28';
    ctx.fillRect(tl.x + tile * 0.05, top, tile * 0.07, tile * 1.7);
    ctx.fillRect(tl.x + w - tile * 0.12, top, tile * 0.07, tile * 1.7);
    // canopy
    const stripes = 6;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = awning ? (i % 2 ? '#f1e7cf' : '#c8553d') : i % 2 ? '#d9cba6' : '#c9b98f';
      ctx.fillRect(tl.x - tile * 0.1 + (i * (w + tile * 0.2)) / stripes, top - tile * 0.28, (w + tile * 0.2) / stripes + 1, tile * 0.3);
    }
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = awning ? (i % 2 ? '#f1e7cf' : '#c8553d') : i % 2 ? '#d9cba6' : '#c9b98f';
      ctx.beginPath();
      const x0 = tl.x - tile * 0.1 + (i * (w + tile * 0.2)) / stripes;
      const ww = (w + tile * 0.2) / stripes;
      ctx.arc(x0 + ww / 2, top + tile * 0.02, ww / 2, 0, Math.PI);
      ctx.fill();
    }
    // table
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(tl.x, tl.y + tile * 0.75, w, tile * 0.12);
    ctx.fillStyle = '#7a5636';
    ctx.fillRect(tl.x, tl.y + tile * 0.18, w, tile * 0.2);
    ctx.fillStyle = '#946a44';
    ctx.fillRect(tl.x, tl.y + tile * 0.1, w, tile * 0.1);
    ctx.fillStyle = '#5a3f28';
    ctx.fillRect(tl.x + tile * 0.1, tl.y + tile * 0.38, tile * 0.06, tile * 0.4);
    ctx.fillRect(tl.x + w - tile * 0.16, tl.y + tile * 0.38, tile * 0.06, tile * 0.4);
    // wares: potted plants of species the player has found (or a few commons)
    const found = Object.keys(state.collection).filter((id) => PLANTS[id]);
    const wares = (found.length ? found : ['pothos', 'spiderPlant', 'snakePlant']).slice(0, crates ? 5 : 3);
    wares.forEach((id, i) => {
      const px = tl.x + tile * 0.3 + (i * (w - tile * 0.6)) / Math.max(1, wares.length - 1);
      const py = tl.y + tile * 0.02;
      this.drawPot(px, py, tile, crates ? (i % 2 ? 'speckled' : 'terracotta') : 'terracotta', 0.7);
      this.drawPlantSprite(px, py + tile * 0.02, tile * 0.7, id, PLANTS[id].variants[0].id, 2.2, 11 + i, 'pot', now);
    });
    if (crates) {
      ctx.fillStyle = '#a07a4a';
      ctx.fillRect(tl.x - tile * 0.35, tl.y + tile * 0.4, tile * 0.4, tile * 0.35);
      ctx.fillRect(tl.x + w - tile * 0.05, tl.y + tile * 0.4, tile * 0.4, tile * 0.35);
    }
    // chalkboard: today's demand, shown as a little picture of the plant
    const bx = tl.x + w + tile * 0.1;
    const by = tl.y - tile * 0.35;
    ctx.fillStyle = '#5a3f28';
    ctx.fillRect(bx + tile * 0.18, by + tile * 0.5, tile * 0.05, tile * 0.55);
    ctx.fillStyle = '#2d3a33';
    ctx.fillRect(bx, by, tile * 0.42, tile * 0.52);
    ctx.strokeStyle = '#8a6a44';
    ctx.lineWidth = Math.max(1, tile * 0.03);
    ctx.strokeRect(bx, by, tile * 0.42, tile * 0.52);
    const want = demandSpecies(state);
    this.drawPlantSprite(bx + tile * 0.21, by + tile * 0.42, tile * 0.5, want, PLANTS[want].variants[0].id, 2, 5, 'ground', now);
    ctx.fillStyle = '#e8e2c8';
    ctx.font = `bold ${Math.max(8, Math.round(tile * 0.13))}px Georgia`;
    ctx.textAlign = 'center';
    ctx.fillText('WANTED', bx + tile * 0.21, by + tile * 0.12);
  }

  private drawDecor(camera: Camera, d: PlacedDecor, state: GameState, now: number) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    const s = camera.worldToScreen(d.x * TILE_SIZE, d.y * TILE_SIZE);
    switch (d.decorId) {
      case 'steppingStones':
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = lerpColor('#9a9484', '#b8b09c', hash2(d.x * 3 + i, d.y));
          ctx.beginPath();
          ctx.ellipse(s.x + (i - 1) * tile * 0.26, s.y + (i % 2) * tile * 0.12 - tile * 0.05, tile * 0.13, tile * 0.08, 0.2 * i, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case 'picketFence': {
        ctx.fillStyle = '#efe9da';
        ctx.fillRect(s.x - tile * 0.5, s.y - tile * 0.2, tile, tile * 0.05);
        ctx.fillRect(s.x - tile * 0.5, s.y - tile * 0.06, tile, tile * 0.05);
        for (let i = 0; i < 5; i++) {
          const px = s.x - tile * 0.45 + i * tile * 0.22;
          ctx.beginPath();
          ctx.moveTo(px, s.y + tile * 0.05);
          ctx.lineTo(px, s.y - tile * 0.3);
          ctx.lineTo(px + tile * 0.04, s.y - tile * 0.36);
          ctx.lineTo(px + tile * 0.08, s.y - tile * 0.3);
          ctx.lineTo(px + tile * 0.08, s.y + tile * 0.05);
          ctx.fill();
        }
        break;
      }
      case 'gardenLantern': {
        ctx.fillStyle = '#3a3026';
        ctx.fillRect(s.x - tile * 0.025, s.y - tile * 0.5, tile * 0.05, tile * 0.5);
        const night = isNight(state.clock.totalMinutes);
        ctx.fillStyle = night ? 'rgba(255,214,120,0.95)' : 'rgba(230,220,190,0.8)';
        ctx.fillRect(s.x - tile * 0.07, s.y - tile * 0.66, tile * 0.14, tile * 0.16);
        ctx.strokeStyle = '#3a3026';
        ctx.lineWidth = Math.max(1, tile * 0.02);
        ctx.strokeRect(s.x - tile * 0.07, s.y - tile * 0.66, tile * 0.14, tile * 0.16);
        break;
      }
      case 'birdbath': {
        ctx.fillStyle = '#a8a292';
        ctx.fillRect(s.x - tile * 0.06, s.y - tile * 0.3, tile * 0.12, tile * 0.3);
        ctx.beginPath();
        ctx.ellipse(s.x, s.y - tile * 0.32, tile * 0.26, tile * 0.09, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = lerpColor('#6fa8b8', '#9fd0dc', 0.5 + 0.5 * Math.sin(now * 0.002));
        ctx.beginPath();
        ctx.ellipse(s.x, s.y - tile * 0.33, tile * 0.2, tile * 0.06, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'gardenBench': {
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(s.x - tile * 0.45, s.y - tile * 0.02, tile * 0.9, tile * 0.08);
        ctx.fillStyle = '#6b4a2e';
        ctx.fillRect(s.x - tile * 0.42, s.y - tile * 0.2, tile * 0.05, tile * 0.2);
        ctx.fillRect(s.x + tile * 0.37, s.y - tile * 0.2, tile * 0.05, tile * 0.2);
        ctx.fillStyle = '#8f6540';
        ctx.fillRect(s.x - tile * 0.46, s.y - tile * 0.26, tile * 0.92, tile * 0.08);
        ctx.fillRect(s.x - tile * 0.46, s.y - tile * 0.48, tile * 0.92, tile * 0.07);
        ctx.fillRect(s.x - tile * 0.46, s.y - tile * 0.37, tile * 0.92, tile * 0.05);
        break;
      }
    }
  }

  /**
   * Butterflies and bees drift around the player's flowering and colourful
   * plants — a living sign that what they planted is doing something.
   */
  private drawPollinators(camera: Camera, state: GameState, bounds: { minX: number; maxX: number; minY: number; maxY: number }, now: number) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    let drawn = 0;
    for (const p of Object.values(state.plants)) {
      if (drawn >= 12) break;
      if (p.location.kind !== 'wild') continue;
      const { x, y } = p.location;
      if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) continue;
      const def = PLANTS[p.defId];
      if (!def || (def.landscape !== 'flower' && def.landscape !== 'color') || stageFloat(p.growth) < 2) continue;
      if (p.seed % 3 !== 0 && def.landscape !== 'flower') continue;
      const look = lookFor(p.defId, p.variantId);
      const ph = now * 0.0011 + (p.seed % 50);
      const bx = x + Math.sin(ph) * 0.7;
      const by = y - 0.6 + Math.cos(ph * 1.3) * 0.35;
      const sc = camera.worldToScreen(bx * TILE_SIZE, by * TILE_SIZE);
      const flap = Math.abs(Math.sin(now * 0.025 + p.seed)) * tile * 0.06 + tile * 0.01;
      ctx.fillStyle = `hsla(${(look.accentHue + 40) % 360},70%,72%,0.9)`;
      ctx.beginPath();
      ctx.ellipse(sc.x - flap * 0.6, sc.y, flap, tile * 0.045, 0.3, 0, Math.PI * 2);
      ctx.ellipse(sc.x + flap * 0.6, sc.y, flap, tile * 0.045, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2a2018';
      ctx.fillRect(sc.x - 0.75, sc.y - tile * 0.03, 1.5, tile * 0.06);
      drawn++;
    }
  }

  /** Light sources that punch through the night: garden lanterns and glowing plants. */
  private drawNightLights(camera: Camera, state: GameState, bounds: { minX: number; maxX: number; minY: number; maxY: number }, now: number) {
    const darkness = 1 - daylightFactor(state.clock.totalMinutes);
    if (darkness < 0.2) return;
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = (wx: number, wy: number, r: number, color: [number, number, number], a: number) => {
      if (wx < bounds.minX - 3 || wx > bounds.maxX + 3 || wy < bounds.minY - 3 || wy > bounds.maxY + 3) return;
      const s = camera.worldToScreen(wx * TILE_SIZE, wy * TILE_SIZE);
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * tile);
      g.addColorStop(0, `rgba(${color[0]},${color[1]},${color[2]},${a * darkness})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(s.x - r * tile, s.y - r * tile, r * tile * 2, r * tile * 2);
    };
    for (const d of state.decor) if (d.decorId === 'gardenLantern') glow(d.x, d.y - 0.55, 2.2, [255, 190, 100], 0.45);
    for (const p of Object.values(state.plants)) {
      if (p.location.kind !== 'wild') continue;
      const look = lookFor(p.defId, p.variantId);
      if (look.variegation !== 'glow' || !look.variegationColor) continue;
      const pulse = 0.8 + 0.2 * Math.sin(now * 0.002 + p.seed);
      const c = look.variegationColor[0] < 100 ? ([255, 170, 70] as [number, number, number]) : ([110, 190, 255] as [number, number, number]);
      glow(p.location.x, p.location.y - 0.4, 1 + stageFloat(p.growth) * 0.35, c, 0.4 * pulse);
    }
    if (state.tools.lantern && !state.player.inGreenhouse) glow(state.player.x + 0.2, state.player.y - 0.3, 3, [255, 200, 120], 0.3);
    ctx.restore();
  }

  private drawFox(camera: Camera, x: number, y: number, now: number) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    const screen = camera.worldToScreen(x * TILE_SIZE, y * TILE_SIZE);
    const bob = Math.sin(now * 0.006) * tile * 0.03;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(screen.x, screen.y + tile * 0.2, tile * 0.22, tile * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c96a34';
    ctx.beginPath();
    ctx.ellipse(screen.x, screen.y + bob, tile * 0.2, tile * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(screen.x - tile * 0.1, screen.y - tile * 0.08 + bob);
    ctx.lineTo(screen.x - tile * 0.16, screen.y - tile * 0.22 + bob);
    ctx.lineTo(screen.x - tile * 0.02, screen.y - tile * 0.12 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(screen.x + tile * 0.1, screen.y - tile * 0.08 + bob);
    ctx.lineTo(screen.x + tile * 0.16, screen.y - tile * 0.22 + bob);
    ctx.lineTo(screen.x + tile * 0.02, screen.y - tile * 0.12 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f4ecd8';
    ctx.beginPath();
    ctx.arc(screen.x + tile * 0.1, screen.y + tile * 0.02 + bob, tile * 0.07, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c96a34';
    ctx.beginPath();
    ctx.ellipse(screen.x - tile * 0.2, screen.y + tile * 0.06 + bob, tile * 0.14, tile * 0.06, -0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  private static readonly DIR: Record<Facing, [number, number]> = {
    up: [0, -1],
    down: [0, 1],
    left: [-1, 0],
    right: [1, 0],
  };

  /**
   * Ellen: a field botanist, not a generic sprite — vest, backpack, wide
   * hat, satchel with a hand lens, a long dark ponytail, and the recurring
   * handmade detail, a crocheted scarf. `crouching` renders her brief
   * collect/examine pose.
   *
   * Layering depends on facing: from the front her face is always on top and
   * the ponytail hangs behind her; from behind the ponytail falls down her
   * back over the pack; in profile it streams off the back of her head.
   */
  private drawEllen(camera: Camera, x: number, y: number, facing: Facing, now: number, moving: boolean, crouching: boolean) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    const screen = camera.worldToScreen(x * TILE_SIZE, y * TILE_SIZE);
    const dir = Renderer.DIR[facing];
    const s = facing === 'left' ? -1 : 1;
    const isSide = facing === 'left' || facing === 'right';
    const isBack = facing === 'up';
    const isFront = facing === 'down';

    const walkPhase = moving ? now * 0.013 : now * 0.003;
    const walkAmp = moving ? 1 : 0.3;
    const bob = Math.abs(Math.sin(walkPhase)) * -tile * 0.025 * walkAmp;
    const stride = moving ? Math.sin(walkPhase) : 0;
    const squash = crouching ? 0.72 : 1;
    const lift = crouching ? tile * 0.1 : 0;

    const cx = screen.x;
    const cy = screen.y + bob + lift;
    const footY = screen.y + tile * 0.25;

    // A thin dark outline on every silhouette-defining shape, so she reads
    // as a distinct figure against any background at small zoom instead of
    // blurring into a same-toned blob.
    const OUTLINE = 'rgba(28,20,12,0.55)';
    const outlineWidth = Math.max(1, tile * 0.016);
    const outline = () => {
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = outlineWidth;
      ctx.stroke();
    };

    // Slim, upright proportions: narrow shoulders, a clearly tapered waist,
    // and legs rather than a single pants blob. Profile is narrower still.
    const shoulderY = cy - tile * 0.17 * squash;
    const waistY = cy + tile * 0.06 * squash;
    const hipY = cy + tile * 0.12 * squash;
    const shoulderW = tile * (isSide ? 0.075 : 0.11);
    const waistW = tile * (isSide ? 0.058 : 0.068);
    const hipW = tile * (isSide ? 0.062 : 0.074);
    const headR = tile * 0.1;
    const headY = cy - tile * 0.3 * squash;

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.24)';
    ctx.beginPath();
    ctx.ellipse(cx, screen.y + tile * 0.26, tile * (isSide ? 0.13 : 0.12), tile * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();

    const tailSway = Math.sin(walkPhase - 0.8) * tile * 0.03 * walkAmp;

    const drawPack = () => {
      const packX = isSide ? cx - s * tile * 0.1 : cx;
      const packY = cy - tile * 0.04 * squash;
      const packW = tile * (isSide ? 0.065 : 0.1);
      const packH = tile * 0.13 * squash;
      ctx.fillStyle = ELLEN_APPEARANCE.backpack;
      ctx.beginPath();
      ctx.roundRect(packX - packW, packY - packH, packW * 2, packH * 2, tile * 0.04);
      ctx.fill();
      outline();
      // flap + buckle
      ctx.fillStyle = ELLEN_APPEARANCE.backpackStrap;
      ctx.beginPath();
      ctx.roundRect(packX - packW, packY - packH, packW * 2, packH * 0.7, tile * 0.04);
      ctx.fill();
      if (isBack) {
        ctx.fillStyle = '#cbb78a';
        ctx.fillRect(packX - tile * 0.012, packY - packH * 0.35, tile * 0.024, tile * 0.03);
      }
    };

    const drawLegs = () => {
      const legW = Math.max(2, tile * 0.05);
      ctx.lineCap = 'round';
      const legs: Array<[number, number]> = isSide
        ? [[-1, -stride], [1, stride]]
        : [[-1, stride], [1, -stride]];
      for (const [side, swing] of legs) {
        const topX = isSide ? cx + side * tile * 0.012 : cx + side * tile * 0.038;
        const footX = isSide ? topX + s * swing * tile * 0.07 : topX;
        const fy = isSide ? footY : footY - Math.max(0, swing) * tile * 0.03;
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = legW + outlineWidth * 2;
        ctx.beginPath();
        ctx.moveTo(topX, hipY);
        ctx.lineTo(footX, fy - tile * 0.03);
        ctx.stroke();
        ctx.strokeStyle = ELLEN_APPEARANCE.pants;
        ctx.lineWidth = legW;
        ctx.stroke();
        // boot
        ctx.fillStyle = ELLEN_APPEARANCE.boots;
        ctx.beginPath();
        if (isSide) {
          ctx.ellipse(footX + s * tile * 0.015, fy, tile * 0.045, tile * 0.03, 0, 0, Math.PI * 2);
        } else {
          ctx.ellipse(footX, fy, tile * 0.034, tile * 0.034, 0, 0, Math.PI * 2);
        }
        ctx.fill();
        outline();
      }
      ctx.lineCap = 'butt';
    };

    // Slim shirt-sleeved arms, swinging opposite the legs.
    const drawArm = (side: number, swing: number) => {
      const armW = Math.max(2, tile * 0.04);
      const sx = isSide ? cx + side * tile * 0.01 : cx + side * (shoulderW - tile * 0.01);
      const sy = shoulderY + tile * 0.025;
      const hx = isSide ? sx + s * swing * tile * 0.08 : sx + side * tile * 0.022;
      const hy = isSide ? cy + tile * 0.07 * squash : cy + tile * 0.07 * squash - swing * tile * 0.025;
      ctx.lineCap = 'round';
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = armW + outlineWidth * 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      ctx.strokeStyle = ELLEN_APPEARANCE.shirt;
      ctx.lineWidth = armW;
      ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.fillStyle = ELLEN_APPEARANCE.skin;
      ctx.beginPath();
      ctx.arc(hx, hy + tile * 0.012, tile * 0.024, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawTorso = () => {
      ctx.fillStyle = ELLEN_APPEARANCE.vest;
      ctx.beginPath();
      ctx.moveTo(cx - shoulderW, shoulderY);
      ctx.quadraticCurveTo(cx - waistW * 1.05, cy - tile * 0.04 * squash, cx - waistW, waistY);
      ctx.quadraticCurveTo(cx - hipW, (waistY + hipY) / 2, cx - hipW, hipY);
      ctx.lineTo(cx + hipW, hipY);
      ctx.quadraticCurveTo(cx + hipW, (waistY + hipY) / 2, cx + waistW, waistY);
      ctx.quadraticCurveTo(cx + waistW * 1.05, cy - tile * 0.04 * squash, cx + shoulderW, shoulderY);
      ctx.quadraticCurveTo(cx, shoulderY - tile * 0.03 * squash, cx - shoulderW, shoulderY);
      ctx.closePath();
      ctx.fill();
      outline();
      // belt line
      ctx.fillStyle = ELLEN_APPEARANCE.pants;
      ctx.fillRect(cx - waistW, waistY - tile * 0.008, waistW * 2, tile * 0.03);
      if (isFront) {
        // open vest over the shirt
        ctx.fillStyle = ELLEN_APPEARANCE.shirt;
        ctx.beginPath();
        ctx.moveTo(cx - tile * 0.03, shoulderY);
        ctx.lineTo(cx + tile * 0.03, shoulderY);
        ctx.lineTo(cx, waistY - tile * 0.01);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = ELLEN_APPEARANCE.vestTrim;
        ctx.lineWidth = Math.max(1, tile * 0.015);
        ctx.stroke();
      } else if (isSide) {
        ctx.strokeStyle = ELLEN_APPEARANCE.vestTrim;
        ctx.lineWidth = Math.max(1, tile * 0.015);
        ctx.beginPath();
        ctx.moveTo(cx + s * shoulderW * 0.7, shoulderY + tile * 0.01);
        ctx.lineTo(cx + s * waistW * 0.8, waistY - tile * 0.01);
        ctx.stroke();
      }
    };

    // crocheted scarf — the recurring handmade touch
    const drawScarf = () => {
      const scarfY = shoulderY - tile * 0.005;
      ctx.fillStyle = ELLEN_APPEARANCE.crochetScarf;
      ctx.beginPath();
      ctx.ellipse(cx, scarfY, tile * (isSide ? 0.055 : 0.07), tile * 0.03, 0, 0, Math.PI * 2);
      ctx.fill();
      outline();
      if (!isBack) {
        // a trailing end, knotted at the front
        const endX = cx + (isSide ? s * tile * 0.035 : tile * 0.03);
        ctx.beginPath();
        ctx.moveTo(endX - tile * 0.018, scarfY);
        ctx.lineTo(endX + tile * 0.018, scarfY);
        ctx.lineTo(endX + tile * 0.012 + tailSway * 0.3, scarfY + tile * 0.1);
        ctx.lineTo(endX - tile * 0.02 + tailSway * 0.3, scarfY + tile * 0.09);
        ctx.closePath();
        ctx.fill();
        outline();
      }
      ctx.fillStyle = ELLEN_APPEARANCE.crochetScarfAlt;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.arc(cx + i * tile * (isSide ? 0.02 : 0.026), scarfY, Math.max(0.6, tile * 0.008), 0, Math.PI * 2);
        ctx.fill();
      }
    };

    // satchel + hand lens at the hip
    const drawSatchel = () => {
      const hipX = isSide ? cx + s * tile * 0.03 : cx + tile * 0.1;
      const py = hipY - tile * 0.02;
      ctx.strokeStyle = ELLEN_APPEARANCE.backpackStrap;
      ctx.lineWidth = Math.max(1, tile * 0.014);
      ctx.beginPath();
      ctx.moveTo(isSide ? cx - s * tile * 0.03 : cx - tile * 0.08, shoulderY + tile * 0.01);
      ctx.lineTo(hipX, py - tile * 0.04);
      ctx.stroke();
      ctx.fillStyle = ELLEN_APPEARANCE.pouch;
      ctx.beginPath();
      ctx.roundRect(hipX - tile * 0.04, py - tile * 0.04, tile * 0.08, tile * 0.07, tile * 0.02);
      ctx.fill();
      outline();
      ctx.strokeStyle = '#cbb78a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(hipX, py - tile * 0.005, tile * 0.02, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = ELLEN_APPEARANCE.lensGlint;
      ctx.beginPath();
      ctx.arc(hipX, py - tile * 0.005, tile * 0.01, 0, Math.PI * 2);
      ctx.fill();
    };

    // long dark ponytail, gathered with a crocheted tie
    const drawPonytail = (base: [number, number], ctrl: [number, number], tip: [number, number], width: number) => {
      this.fillTaperedStrand(base, ctrl, tip, width, width * 0.35, ELLEN_APPEARANCE.hair, OUTLINE, outlineWidth);
      ctx.fillStyle = ELLEN_APPEARANCE.crochetScarf;
      ctx.beginPath();
      ctx.arc(base[0], base[1], width * 0.5, 0, Math.PI * 2);
      ctx.fill();
      outline();
    };

    const drawHead = () => {
      // neck
      ctx.fillStyle = ELLEN_APPEARANCE.skin;
      ctx.fillRect(cx - tile * 0.025, headY + headR * 0.6, tile * 0.05, shoulderY - headY - headR * 0.4);

      // hair mass (the whole back of her head)
      ctx.fillStyle = ELLEN_APPEARANCE.hair;
      ctx.beginPath();
      ctx.arc(cx, headY, headR, 0, Math.PI * 2);
      ctx.fill();
      outline();
      if (isBack) return;

      // face, set toward whichever way she's looking
      const faceX = cx + (isSide ? s * headR * 0.28 : 0);
      ctx.fillStyle = ELLEN_APPEARANCE.skin;
      ctx.beginPath();
      ctx.ellipse(faceX, headY + headR * 0.14, headR * (isSide ? 0.72 : 0.8), headR * 0.84, 0, 0, Math.PI * 2);
      ctx.fill();
      if (isSide) {
        // nose + ear
        ctx.beginPath();
        ctx.arc(cx + s * headR * 0.95, headY + headR * 0.22, headR * 0.16, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx - s * headR * 0.1, headY + headR * 0.25, headR * 0.16, 0, Math.PI * 2);
        ctx.fill();
      }

      // side-swept fringe under the brim
      ctx.fillStyle = ELLEN_APPEARANCE.hair;
      ctx.beginPath();
      if (isSide) {
        ctx.moveTo(cx - s * headR * 0.2, headY - headR * 0.75);
        ctx.quadraticCurveTo(cx + s * headR * 0.9, headY - headR * 0.75, cx + s * headR * 0.95, headY - headR * 0.25);
        ctx.quadraticCurveTo(cx + s * headR * 0.4, headY - headR * 0.35, cx - s * headR * 0.05, headY - headR * 0.1);
      } else {
        ctx.moveTo(cx - headR * 0.85, headY + headR * 0.1);
        ctx.quadraticCurveTo(cx - headR * 0.6, headY - headR * 0.75, cx + headR * 0.2, headY - headR * 0.72);
        ctx.quadraticCurveTo(cx + headR * 0.75, headY - headR * 0.6, cx + headR * 0.88, headY - headR * 0.05);
        ctx.quadraticCurveTo(cx + headR * 0.5, headY - headR * 0.4, cx - headR * 0.1, headY - headR * 0.35);
        ctx.quadraticCurveTo(cx - headR * 0.55, headY - headR * 0.2, cx - headR * 0.85, headY + headR * 0.1);
      }
      ctx.closePath();
      ctx.fill();

      // eyes, brows, blush, mouth — all below the brim, never under it
      const eyeY = headY + headR * 0.12;
      const eyeR = Math.max(1, headR * 0.13);
      const eyes = isSide ? [cx + s * headR * 0.55] : [cx - headR * 0.36, cx + headR * 0.36];
      ctx.fillStyle = '#2a2018';
      for (const ex of eyes) {
        ctx.beginPath();
        ctx.ellipse(ex, eyeY, eyeR, eyeR * 1.25, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (tile >= 40) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        for (const ex of eyes) {
          ctx.beginPath();
          ctx.arc(ex + eyeR * 0.35, eyeY - eyeR * 0.45, eyeR * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = ELLEN_APPEARANCE.hair;
        ctx.lineWidth = Math.max(1, headR * 0.08);
        ctx.lineCap = 'round';
        for (const ex of eyes) {
          ctx.beginPath();
          ctx.moveTo(ex - eyeR * 1.2, eyeY - eyeR * 2.1);
          ctx.lineTo(ex + eyeR * 1.2, eyeY - eyeR * 2.3);
          ctx.stroke();
        }
        ctx.lineCap = 'butt';
      }
      ctx.fillStyle = ELLEN_APPEARANCE.blush;
      const blushX = isSide ? [cx + s * headR * 0.45] : [cx - headR * 0.52, cx + headR * 0.52];
      for (const bx of blushX) {
        ctx.beginPath();
        ctx.ellipse(bx, headY + headR * 0.45, headR * 0.17, headR * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = '#8a4a3a';
      ctx.lineWidth = Math.max(1, headR * 0.08);
      ctx.beginPath();
      const mouthX = isSide ? cx + s * headR * 0.62 : cx;
      ctx.arc(mouthX, headY + headR * 0.5, headR * 0.16, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
    };

    // wide-brim field hat, sitting high enough to frame the face
    const drawHat = () => {
      const brimY = headY - headR * 0.62;
      ctx.fillStyle = ELLEN_APPEARANCE.hat;
      ctx.beginPath();
      ctx.ellipse(cx + (isSide ? s * tile * 0.012 : 0), brimY, tile * (isSide ? 0.15 : 0.16), tile * 0.042, 0, 0, Math.PI * 2);
      ctx.fill();
      outline();
      ctx.beginPath();
      ctx.moveTo(cx - tile * 0.075, brimY);
      ctx.quadraticCurveTo(cx - tile * 0.075, brimY - tile * 0.1, cx, brimY - tile * 0.1);
      ctx.quadraticCurveTo(cx + tile * 0.075, brimY - tile * 0.1, cx + tile * 0.075, brimY);
      ctx.closePath();
      ctx.fill();
      outline();
      ctx.fillStyle = ELLEN_APPEARANCE.hatBand;
      ctx.fillRect(cx - tile * 0.075, brimY - tile * 0.03, tile * 0.15, tile * 0.024);
    };

    const armSwing = stride;
    if (isBack) {
      drawLegs();
      drawArm(-1, -armSwing);
      drawArm(1, armSwing);
      drawTorso();
      drawScarf();
      drawPack();
      drawHead();
      drawHat();
      drawPonytail(
        [cx, headY + headR * 0.35],
        [cx + tailSway * 0.5, headY + tile * 0.14],
        [cx + tailSway, headY + tile * 0.3],
        tile * 0.055
      );
    } else if (isSide) {
      drawPack();
      drawArm(-1, -armSwing);
      drawLegs();
      drawTorso();
      drawScarf();
      drawSatchel();
      drawPonytail(
        [cx - s * headR * 0.85, headY - headR * 0.05],
        [cx - s * tile * 0.17, headY + tile * 0.04],
        [cx - s * tile * (moving ? 0.19 : 0.13) + tailSway, headY + tile * (moving ? 0.2 : 0.25)],
        tile * 0.05
      );
      drawHead();
      drawHat();
      drawArm(1, armSwing);
    } else {
      // Front: the ponytail hangs behind her, peeking out past her shoulder
      // as it sways, so it never crosses her face.
      drawPonytail(
        [cx + headR * 0.4, headY + headR * 0.2],
        [cx + tile * 0.1 + tailSway * 0.5, headY + tile * 0.12],
        [cx + tile * 0.1 + tailSway, headY + tile * 0.26],
        tile * 0.05
      );
      drawLegs();
      drawTorso();
      drawArm(-1, -armSwing);
      drawArm(1, armSwing);
      drawScarf();
      drawSatchel();
      // backpack straps over the shoulders
      ctx.strokeStyle = ELLEN_APPEARANCE.backpackStrap;
      ctx.lineWidth = Math.max(1, tile * 0.02);
      ctx.beginPath();
      ctx.moveTo(cx - shoulderW * 0.72, shoulderY + tile * 0.01);
      ctx.lineTo(cx - waistW * 0.75, waistY - tile * 0.02);
      ctx.moveTo(cx + shoulderW * 0.72, shoulderY + tile * 0.01);
      ctx.lineTo(cx + waistW * 0.75, waistY - tile * 0.02);
      ctx.stroke();
      drawHead();
      drawHat();
    }

    // reaching hand while crouched/collecting
    if (crouching) {
      ctx.fillStyle = ELLEN_APPEARANCE.skin;
      ctx.beginPath();
      ctx.arc(cx + dir[0] * tile * 0.2, cy + dir[1] * tile * 0.14 + tile * 0.08, tile * 0.035, 0, Math.PI * 2);
      ctx.fill();
      outline();
    }
  }

  /**
   * A strand of hair along a quadratic curve that tapers from `w0` at the
   * base to `w1` at the tip, with a slight fullness through the middle.
   */
  private fillTaperedStrand(
    p0: [number, number],
    c: [number, number],
    p1: [number, number],
    w0: number,
    w1: number,
    fill: string,
    stroke: string,
    strokeWidth: number
  ) {
    const { ctx } = this;
    const steps = 12;
    const left: Array<[number, number]> = [];
    const right: Array<[number, number]> = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const mt = 1 - t;
      const px = mt * mt * p0[0] + 2 * mt * t * c[0] + t * t * p1[0];
      const py = mt * mt * p0[1] + 2 * mt * t * c[1] + t * t * p1[1];
      const tx = 2 * mt * (c[0] - p0[0]) + 2 * t * (p1[0] - c[0]);
      const ty = 2 * mt * (c[1] - p0[1]) + 2 * t * (p1[1] - c[1]);
      const len = Math.hypot(tx, ty) || 1;
      const half = ((w0 + (w1 - w0) * t) * (1 + 0.3 * Math.sin(Math.PI * t))) / 2;
      left.push([px - (ty / len) * half, py + (tx / len) * half]);
      right.push([px + (ty / len) * half, py - (tx / len) * half]);
    }
    ctx.beginPath();
    ctx.moveTo(left[0][0], left[0][1]);
    for (const [px, py] of left) ctx.lineTo(px, py);
    ctx.arc(p1[0], p1[1], w1 / 2, Math.atan2(left[steps][1] - p1[1], left[steps][0] - p1[0]), Math.atan2(right[steps][1] - p1[1], right[steps][0] - p1[0]), true);
    for (let i = steps; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
  }

  /** Scout: Ellen's scruffy one-eyed field companion. */
  private drawScout(camera: Camera, scout: ScoutState, now: number) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    const screen = camera.worldToScreen(scout.x * TILE_SIZE, scout.y * TILE_SIZE);
    const dir = Renderer.DIR[scout.facing];

    const sitting = scout.behavior === 'idleSit';
    const sniffing = scout.behavior === 'idleSniff';
    const alert = scout.behavior === 'idleLook' || scout.behavior === 'noticing';
    const moving = scout.behavior === 'following';

    const bodyScaleY = sitting ? 0.62 : 1;
    const headDrop = sniffing ? tile * 0.09 : 0;
    const earPerk = alert ? 1.3 : 1;
    const legPhase = moving ? now * 0.02 : now * 0.004;
    const legSwing = moving ? Math.sin(legPhase) * tile * 0.045 : Math.sin(legPhase) * tile * 0.01;

    const cx = screen.x;
    const cy = screen.y;

    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + tile * 0.14, tile * 0.16, tile * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();

    // tail: curled at rest, wagging when moving or content
    const tailBaseX = cx - dir[0] * tile * 0.14;
    const tailBaseY = cy - dir[1] * tile * 0.14 * bodyScaleY;
    const wag = sitting ? 0.3 : Math.sin(now * 0.012) * (moving ? 0.5 : 0.25);
    ctx.strokeStyle = SCOUT_APPEARANCE.furDark;
    ctx.lineWidth = Math.max(1, tile * 0.045);
    ctx.beginPath();
    ctx.moveTo(tailBaseX, tailBaseY);
    ctx.quadraticCurveTo(
      tailBaseX - dir[0] * tile * 0.14 + wag * tile * 0.1,
      tailBaseY - dir[1] * tile * 0.14 - tile * 0.06,
      tailBaseX - dir[0] * tile * 0.05 + wag * tile * 0.16,
      tailBaseY - tile * 0.14
    );
    ctx.stroke();

    // body with a scruffy darker patch
    ctx.fillStyle = SCOUT_APPEARANCE.furBase;
    ctx.beginPath();
    ctx.ellipse(cx, cy - tile * 0.02, tile * 0.15, tile * 0.11 * bodyScaleY, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = SCOUT_APPEARANCE.furDark;
    ctx.beginPath();
    ctx.ellipse(cx - dir[0] * tile * 0.03, cy - tile * 0.05 - dir[1] * tile * 0.02, tile * 0.08, tile * 0.05 * bodyScaleY, 0, 0, Math.PI * 2);
    ctx.fill();

    if (!sitting) {
      ctx.fillStyle = SCOUT_APPEARANCE.furDark;
      ctx.beginPath();
      ctx.ellipse(cx - tile * 0.07, cy + tile * 0.1 + legSwing, tile * 0.03, tile * 0.035, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + tile * 0.07, cy + tile * 0.1 - legSwing, tile * 0.03, tile * 0.035, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // head
    const headX = cx + dir[0] * tile * 0.14;
    const headY = cy + dir[1] * tile * 0.1 - tile * 0.03 + headDrop;
    ctx.fillStyle = SCOUT_APPEARANCE.furBase;
    ctx.beginPath();
    ctx.arc(headX, headY, tile * 0.09, 0, Math.PI * 2);
    ctx.fill();

    // ears — one a little crooked
    ctx.fillStyle = SCOUT_APPEARANCE.furDark;
    ctx.beginPath();
    ctx.moveTo(headX - tile * 0.07, headY - tile * 0.04);
    ctx.lineTo(headX - tile * 0.1, headY - tile * 0.12 * earPerk);
    ctx.lineTo(headX - tile * 0.02, headY - tile * 0.06);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(headX + tile * 0.06, headY - tile * 0.04);
    ctx.lineTo(headX + tile * 0.11, headY - tile * 0.1 * earPerk);
    ctx.lineTo(headX + tile * 0.02, headY - tile * 0.06);
    ctx.closePath();
    ctx.fill();

    // muzzle + nose
    ctx.fillStyle = SCOUT_APPEARANCE.furLight;
    ctx.beginPath();
    ctx.ellipse(headX + dir[0] * tile * 0.06, headY + dir[1] * tile * 0.04 + tile * 0.02, tile * 0.055, tile * 0.04, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = SCOUT_APPEARANCE.nose;
    ctx.beginPath();
    ctx.arc(headX + dir[0] * tile * 0.1, headY + dir[1] * tile * 0.06 + tile * 0.02, tile * 0.018, 0, Math.PI * 2);
    ctx.fill();

    // one good eye, one patch — a plain, recognizable detail
    ctx.fillStyle = SCOUT_APPEARANCE.eye;
    ctx.beginPath();
    ctx.arc(headX - dir[1] * tile * 0.05 + dir[0] * tile * 0.01, headY - tile * 0.01, tile * 0.016, 0, Math.PI * 2);
    ctx.fill();
    // the missing eye, marked with a small "x" rather than a blank patch
    {
      const mx = headX + dir[1] * tile * 0.05 + dir[0] * tile * 0.01;
      const my = headY - tile * 0.01;
      const r = tile * 0.017;
      ctx.strokeStyle = SCOUT_APPEARANCE.eyePatch;
      ctx.lineWidth = Math.max(1, tile * 0.018);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(mx - r, my - r);
      ctx.lineTo(mx + r, my + r);
      ctx.moveTo(mx + r, my - r);
      ctx.lineTo(mx - r, my + r);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }

    // handmade collar, matching Ellen's crochet accent
    ctx.strokeStyle = SCOUT_APPEARANCE.collar;
    ctx.lineWidth = Math.max(1, tile * 0.03);
    ctx.beginPath();
    ctx.arc(headX, headY + tile * 0.07, tile * 0.06, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();
  }

  /**
   * Scott: tall, blonde, ambient, and entirely uninterested in whatever the
   * player is doing. Tinkers, naps, or snacks depending on `activity`,
   * which the scott system drives on its own independent clock.
   */
  private drawScott(camera: Camera, scott: ScottState, now: number) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    const screen = camera.worldToScreen(scott.x * TILE_SIZE, scott.y * TILE_SIZE);

    if (scott.activity === 'napping') {
      this.drawScottNapping(screen, tile, now);
      return;
    }

    const dir = Renderer.DIR[scott.facing];
    const scale = 1.15; // he reads a little taller than Ellen
    const moving = scott.activity === 'traveling';
    const tinkering = scott.activity === 'tinkering';
    const snacking = scott.activity === 'snacking';

    const walkPhase = moving ? now * 0.011 : now * 0.0025;
    const walkAmp = moving ? 1 : 0.25;
    const bob = Math.sin(walkPhase) * tile * 0.02 * walkAmp;
    const legSwing = moving ? Math.sin(walkPhase * 2) * tile * 0.055 : 0;
    const squash = tinkering ? 0.68 : 1;
    const lift = tinkering ? tile * 0.12 : 0;

    const cx = screen.x;
    const cy = screen.y + bob + lift;

    ctx.fillStyle = 'rgba(0,0,0,0.24)';
    ctx.beginPath();
    ctx.ellipse(cx, screen.y + tile * 0.3 * scale, tile * 0.2 * scale, tile * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = SCOTT_APPEARANCE.boots;
    ctx.beginPath();
    ctx.ellipse(cx - tile * 0.075 * scale, screen.y + tile * 0.27 * scale + legSwing, tile * 0.065, tile * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + tile * 0.075 * scale, screen.y + tile * 0.27 * scale - legSwing, tile * 0.065, tile * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();

    // overalls (lower)
    ctx.fillStyle = SCOTT_APPEARANCE.overalls;
    ctx.beginPath();
    ctx.ellipse(cx, cy + tile * 0.14 * scale * squash, tile * 0.15 * scale, tile * 0.16 * scale * squash, 0, 0, Math.PI * 2);
    ctx.fill();

    // chambray shirt (upper torso)
    ctx.fillStyle = SCOTT_APPEARANCE.shirt;
    ctx.beginPath();
    ctx.ellipse(cx, cy - tile * 0.02 * scale * squash, tile * 0.16 * scale, tile * 0.18 * scale * squash, 0, 0, Math.PI * 2);
    ctx.fill();

    // overall straps
    ctx.strokeStyle = SCOTT_APPEARANCE.overallsTrim;
    ctx.lineWidth = Math.max(1, tile * 0.025);
    ctx.beginPath();
    ctx.moveTo(cx - tile * 0.08 * scale, cy - tile * 0.15 * scale * squash);
    ctx.lineTo(cx - tile * 0.05 * scale, cy + tile * 0.05 * scale * squash);
    ctx.moveTo(cx + tile * 0.08 * scale, cy - tile * 0.15 * scale * squash);
    ctx.lineTo(cx + tile * 0.05 * scale, cy + tile * 0.05 * scale * squash);
    ctx.stroke();

    // head, tall and blonde
    const headY = cy - tile * 0.34 * scale * squash;
    ctx.fillStyle = SCOTT_APPEARANCE.skin;
    ctx.beginPath();
    ctx.arc(cx, headY, tile * 0.115 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = SCOTT_APPEARANCE.hair;
    ctx.beginPath();
    ctx.arc(cx - dir[0] * tile * 0.01, headY - tile * 0.06 * scale, tile * 0.1 * scale, Math.PI, Math.PI * 2.15);
    ctx.fill();
    if (scott.facing !== 'up') {
      ctx.fillStyle = '#2a2018';
      ctx.beginPath();
      ctx.arc(cx + dir[0] * tile * 0.05 - tile * 0.03, headY + dir[1] * tile * 0.02, tile * 0.014, 0, Math.PI * 2);
      ctx.arc(cx + dir[0] * tile * 0.05 + tile * 0.03, headY + dir[1] * tile * 0.02, tile * 0.014, 0, Math.PI * 2);
      ctx.fill();
    }

    if (tinkering) {
      const wiggle = Math.sin(now * 0.01) * tile * 0.03;
      const tx = cx + dir[0] * tile * 0.2;
      const ty = cy + tile * 0.14 + dir[1] * tile * 0.1 + wiggle;
      ctx.strokeStyle = SCOTT_APPEARANCE.toolHandle;
      ctx.lineWidth = Math.max(1, tile * 0.025);
      ctx.beginPath();
      ctx.moveTo(cx + dir[0] * tile * 0.08, cy + tile * 0.02);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.fillStyle = SCOTT_APPEARANCE.tool;
      ctx.beginPath();
      ctx.arc(tx, ty, tile * 0.03, 0, Math.PI * 2);
      ctx.fill();
    }

    if (snacking) {
      const chew = Math.sin(now * 0.012) * tile * 0.012;
      ctx.fillStyle = SCOTT_APPEARANCE.snack;
      ctx.beginPath();
      ctx.arc(cx + dir[0] * tile * 0.14, headY + tile * 0.02 + chew, tile * 0.035, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawScottNapping(screen: { x: number; y: number }, tile: number, now: number) {
    const { ctx } = this;
    const breathe = Math.sin(now * 0.003) * tile * 0.015;

    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(screen.x, screen.y + tile * 0.1, tile * 0.3, tile * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = SCOTT_APPEARANCE.overalls;
    ctx.beginPath();
    ctx.ellipse(screen.x, screen.y + tile * 0.06 + breathe, tile * 0.26, tile * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();

    // a borrowed crochet blanket
    ctx.fillStyle = SCOTT_APPEARANCE.napBlanket;
    ctx.beginPath();
    ctx.ellipse(screen.x + tile * 0.03, screen.y + tile * 0.08 + breathe, tile * 0.16, tile * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = SCOTT_APPEARANCE.skin;
    ctx.beginPath();
    ctx.arc(screen.x - tile * 0.22, screen.y + tile * 0.02 + breathe, tile * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = SCOTT_APPEARANCE.hair;
    ctx.beginPath();
    ctx.arc(screen.x - tile * 0.25, screen.y - tile * 0.02 + breathe, tile * 0.09, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(240,236,216,0.75)';
    ctx.font = `${Math.round(tile * 0.13)}px Georgia`;
    ctx.textAlign = 'center';
    for (let i = 0; i < 2; i++) {
      const t = (now * 0.0006 + i * 0.5) % 1;
      const zx = screen.x - tile * 0.3 - t * tile * 0.1;
      const zy = screen.y - tile * 0.18 - t * tile * 0.4;
      ctx.globalAlpha = 1 - t;
      ctx.fillText('z', zx, zy);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * The greenhouse cat: small, orange, indoor-only, and drawn only from
   * `renderIndoor` — she has no outdoor coordinate space to speak of.
   */
  private drawCat(camera: Camera, cat: CatState, now: number) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    const screen = camera.worldToScreen(cat.x * TILE_SIZE, cat.y * TILE_SIZE);

    if (cat.activity === 'sleeping') {
      this.drawCatSleeping(screen, tile, now);
      return;
    }

    const dir = Renderer.DIR[cat.facing];
    const moving = cat.activity === 'wandering';
    const sitting = cat.activity === 'sitting';
    const grooming = cat.activity === 'grooming';

    const walkPhase = now * 0.015;
    const bob = moving ? Math.sin(walkPhase) * tile * 0.015 : 0;
    const legSwing = moving ? Math.sin(walkPhase * 2) * tile * 0.03 : 0;
    const bodyScaleY = sitting || grooming ? 1.15 : 1;

    const cx = screen.x;
    const cy = screen.y + bob;

    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(cx, screen.y + tile * 0.13, tile * 0.13, tile * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();

    // tail: curled up at rest, low and out while walking
    const tailBaseX = cx - dir[0] * tile * 0.1;
    const tailBaseY = cy - tile * 0.02;
    ctx.strokeStyle = CAT_APPEARANCE.furDark;
    ctx.lineWidth = Math.max(1, tile * 0.03);
    ctx.beginPath();
    ctx.moveTo(tailBaseX, tailBaseY);
    if (sitting || grooming) {
      ctx.quadraticCurveTo(tailBaseX - dir[0] * tile * 0.1, tailBaseY - tile * 0.14, tailBaseX + tile * 0.03, tailBaseY - tile * 0.16);
    } else {
      ctx.quadraticCurveTo(
        tailBaseX - dir[0] * tile * 0.12,
        tailBaseY - tile * 0.02 + Math.sin(now * 0.01) * tile * 0.03,
        tailBaseX - dir[0] * tile * 0.16,
        tailBaseY - tile * 0.08
      );
    }
    ctx.stroke();

    if (!sitting && !grooming) {
      ctx.fillStyle = CAT_APPEARANCE.furDark;
      ctx.beginPath();
      ctx.ellipse(cx - tile * 0.05, cy + tile * 0.08 + legSwing, tile * 0.02, tile * 0.025, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + tile * 0.05, cy + tile * 0.08 - legSwing, tile * 0.02, tile * 0.025, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // body, orange tabby
    ctx.fillStyle = CAT_APPEARANCE.furBase;
    ctx.beginPath();
    ctx.ellipse(cx, cy - tile * 0.02, tile * 0.1, tile * 0.075 * bodyScaleY, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = CAT_APPEARANCE.furDark;
    ctx.lineWidth = Math.max(1, tile * 0.015);
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i * tile * 0.025, cy - tile * 0.07 * bodyScaleY);
      ctx.lineTo(cx + i * tile * 0.025, cy + tile * 0.01);
      ctx.stroke();
    }

    // head
    const headX = cx + dir[0] * tile * 0.1;
    const headY = cy + dir[1] * tile * 0.06 - tile * 0.06;
    ctx.fillStyle = CAT_APPEARANCE.furBase;
    ctx.beginPath();
    ctx.arc(headX, headY, tile * 0.065, 0, Math.PI * 2);
    ctx.fill();

    // pointed ears
    ctx.fillStyle = CAT_APPEARANCE.furBase;
    ctx.beginPath();
    ctx.moveTo(headX - tile * 0.05, headY - tile * 0.03);
    ctx.lineTo(headX - tile * 0.07, headY - tile * 0.1);
    ctx.lineTo(headX - tile * 0.01, headY - tile * 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(headX + tile * 0.05, headY - tile * 0.03);
    ctx.lineTo(headX + tile * 0.07, headY - tile * 0.1);
    ctx.lineTo(headX + tile * 0.01, headY - tile * 0.05);
    ctx.closePath();
    ctx.fill();

    // muzzle + nose
    ctx.fillStyle = CAT_APPEARANCE.belly;
    ctx.beginPath();
    ctx.ellipse(headX + dir[0] * tile * 0.02, headY + tile * 0.03, tile * 0.035, tile * 0.025, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = CAT_APPEARANCE.nose;
    ctx.beginPath();
    ctx.arc(headX + dir[0] * tile * 0.03, headY + tile * 0.02, tile * 0.012, 0, Math.PI * 2);
    ctx.fill();

    // eyes
    ctx.fillStyle = CAT_APPEARANCE.eye;
    ctx.beginPath();
    ctx.arc(headX - dir[1] * tile * 0.03 + dir[0] * tile * 0.005, headY - tile * 0.005, tile * 0.012, 0, Math.PI * 2);
    ctx.arc(headX + dir[1] * tile * 0.03 + dir[0] * tile * 0.005, headY - tile * 0.005, tile * 0.012, 0, Math.PI * 2);
    ctx.fill();

    if (grooming) {
      // one paw raised to the side of her head, mid-lick
      const liftPhase = Math.sin(now * 0.018) * tile * 0.02;
      ctx.fillStyle = CAT_APPEARANCE.furLight;
      ctx.beginPath();
      ctx.ellipse(headX - dir[0] * tile * 0.02, headY + tile * 0.06 + liftPhase, tile * 0.02, tile * 0.03, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawCatSleeping(screen: { x: number; y: number }, tile: number, now: number) {
    const { ctx } = this;
    const breathe = Math.sin(now * 0.004) * tile * 0.01;

    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.beginPath();
    ctx.ellipse(screen.x, screen.y + tile * 0.06, tile * 0.14, tile * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();

    // curled into a ball
    ctx.fillStyle = CAT_APPEARANCE.furBase;
    ctx.beginPath();
    ctx.ellipse(screen.x, screen.y + tile * 0.02 + breathe, tile * 0.11, tile * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = CAT_APPEARANCE.furDark;
    ctx.lineWidth = Math.max(1, tile * 0.015);
    ctx.beginPath();
    ctx.arc(screen.x, screen.y + tile * 0.02 + breathe, tile * 0.09, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();

    // tail wrapped over the nose
    ctx.strokeStyle = CAT_APPEARANCE.furDark;
    ctx.lineWidth = Math.max(1, tile * 0.025);
    ctx.beginPath();
    ctx.arc(screen.x, screen.y + tile * 0.02 + breathe, tile * 0.1, -0.3 * Math.PI, 0.15 * Math.PI);
    ctx.stroke();

    ctx.fillStyle = 'rgba(240,236,216,0.7)';
    ctx.font = `${Math.round(tile * 0.1)}px Georgia`;
    ctx.textAlign = 'center';
    for (let i = 0; i < 2; i++) {
      const t = (now * 0.0006 + i * 0.5) % 1;
      const zx = screen.x + tile * 0.14 + t * tile * 0.08;
      const zy = screen.y - tile * 0.1 - t * tile * 0.3;
      ctx.globalAlpha = 1 - t;
      ctx.fillText('z', zx, zy);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Tasteful, capped-count atmosphere: drifting pollen in the shaded
   * zones, a couple of wandering butterflies over open flowers, and
   * falling leaves under the canopy when it's dry. Screen-space and cheap,
   * in the same spirit as the existing rain overlay.
   */
  private drawAmbientParticles(camera: Camera, zone: ZoneId, weather: string, now: number) {
    const { ctx } = this;
    // CSS pixels, matching the DPR-scaled transform; canvas.width would be
    // 2x on a phone and push most particles off-screen.
    const w = camera.viewW;
    const h = camera.viewH;

    if (zone === 'woodland' || zone === 'dampForest') {
      for (let i = 0; i < 10; i++) {
        const seed = i * 137.5;
        const x = (seed * 3 + now * 0.01 * (0.5 + (i % 3) * 0.2)) % w;
        const y = h - ((now * 0.02 + seed * 5) % (h + 40));
        const alpha = Math.max(0, 0.15 + 0.1 * Math.sin(now * 0.002 + i));
        ctx.fillStyle = `rgba(230,225,190,${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      if (weather !== 'rain') {
        for (let i = 0; i < 4; i++) {
          const seed = i * 211.3;
          const fx = (seed * 2 + Math.sin(now * 0.0006 + i) * 40 + w) % w;
          const fy = ((now * 0.03 + seed * 4) % (h + 30)) - 15;
          ctx.save();
          ctx.translate(fx, fy);
          ctx.rotate(now * 0.001 + i);
          ctx.fillStyle = 'rgba(150,110,60,0.4)';
          ctx.beginPath();
          ctx.ellipse(0, 0, 3, 1.6, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    } else if (zone === 'meadow' || zone === 'overgrownClearing') {
      for (let i = 0; i < 3; i++) {
        const bx = (w * (0.15 + i * 0.35) + Math.sin(now * 0.0015 + i * 2) * w * 0.12 + w) % w;
        const by = h * 0.3 + Math.cos(now * 0.0021 + i * 3) * h * 0.15;
        const flap = Math.sin(now * 0.02 + i) * 3;
        ctx.fillStyle = i % 2 === 0 ? 'rgba(240,220,120,0.75)' : 'rgba(230,180,220,0.75)';
        ctx.beginPath();
        ctx.ellipse(bx - 3, by - flap, 3, 2, 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(bx + 3, by + flap, 3, 2, -0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawWeatherOverlay(camera: Camera, state: GameState, now: number) {
    const { ctx } = this;
    const daylight = daylightFactor(state.clock.totalMinutes);
    const darkness = 1 - daylight;
    if (darkness > 0.02) {
      ctx.fillStyle = `rgba(8,16,28,${darkness * 0.55})`;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
    if (state.weather.condition === 'overcast') {
      ctx.fillStyle = 'rgba(120,130,120,0.12)';
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
    if (state.weather.condition === 'rain') {
      ctx.fillStyle = 'rgba(150,170,190,0.15)';
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.strokeStyle = 'rgba(200,220,235,0.35)';
      ctx.lineWidth = 1;
      const w = camera.viewW;
      const h = camera.viewH;
      ctx.beginPath();
      for (let i = 0; i < 90; i++) {
        const seedX = (i * 977) % w;
        const seedY = ((i * 613 + Math.floor(now * 0.6)) % (h + 40)) - 20;
        ctx.moveTo(seedX, seedY);
        ctx.lineTo(seedX - 6, seedY + 16);
      }
      ctx.stroke();
    }
  }

  // ---------------- Indoor (greenhouse) ----------------

  renderIndoor(outerCamera: Camera, state: GameState, now: number, crouching = false) {
    const { ctx } = this;
    this.clear('#241a12');

    // The greenhouse is small and meant to feel close and cozy, so it
    // zooms in well past a whole-room fit and instead follows the player
    // with the view clamped to the room's own bounds — never showing the
    // void beyond its walls, but zoomed in noticeably more than a static
    // fit-the-whole-room camera would allow.
    const camera = new Camera();
    camera.viewW = outerCamera.viewW;
    camera.viewH = outerCamera.viewH;
    const shortAxis = Math.min(camera.viewW, camera.viewH);
    const targetTilesVisible = 9.5;
    const fitWholeRoom = Math.min(
      camera.viewW / (GREENHOUSE_GRID_W * TILE_SIZE),
      camera.viewH / (GREENHOUSE_GRID_H * TILE_SIZE)
    );
    camera.zoom = Math.max(fitWholeRoom, shortAxis / (targetTilesVisible * TILE_SIZE));

    const clampAxis = (playerWorld: number, viewSize: number, worldTiles: number): number => {
      const halfView = viewSize / 2 / camera.zoom;
      const worldSize = worldTiles * TILE_SIZE;
      if (worldSize <= viewSize / camera.zoom) return worldSize / 2;
      return Math.min(Math.max(playerWorld, halfView), worldSize - halfView);
    };
    camera.x = clampAxis(state.player.x * TILE_SIZE, camera.viewW, GREENHOUSE_GRID_W);
    camera.y = clampAxis(state.player.y * TILE_SIZE, camera.viewH, GREENHOUSE_GRID_H);
    const tile = TILE_SIZE * camera.zoom;

    // Floorboards: three-tile planks, staggered row to row, each plank one
    // slightly different tone, with dark seams between them.
    const seams = new Path2D();
    const grain = new Path2D();
    for (let y = 0; y < GREENHOUSE_GRID_H; y++) {
      const stagger = (y * 2) % 3;
      for (let x = 0; x < GREENHOUSE_GRID_W; x++) {
        const border = x === 0 || y === 0 || x === GREENHOUSE_GRID_W - 1 || y === GREENHOUSE_GRID_H - 1;
        const screen = camera.worldToScreen(x * TILE_SIZE, y * TILE_SIZE);
        const sx = Math.floor(screen.x);
        const sy = Math.floor(screen.y);
        if (border) {
          ctx.fillStyle = '#3a4a40';
          ctx.fillRect(sx, sy, Math.ceil(tile) + 1, Math.ceil(tile) + 1);
          continue;
        }
        const plank = Math.floor((x + stagger) / 3);
        ctx.fillStyle = lerpColor('#6e5238', '#5f4630', hash2(plank * 7.1, y * 3.3));
        ctx.fillRect(sx, sy, Math.ceil(tile) + 1, Math.ceil(tile) + 1);
        seams.moveTo(sx, sy);
        seams.lineTo(sx + tile, sy);
        if ((x + stagger) % 3 === 0) {
          seams.moveTo(sx, sy);
          seams.lineTo(sx, sy + tile);
        }
        const gy = sy + tile * (0.3 + 0.4 * hash2(x * 1.9, y * 2.7));
        grain.moveTo(sx + tile * 0.1, gy);
        grain.lineTo(sx + tile * 0.9, gy + tile * 0.02);
      }
    }
    ctx.lineWidth = Math.max(1, tile * 0.02);
    ctx.strokeStyle = 'rgba(40,26,14,0.55)';
    ctx.stroke(seams);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(40,26,14,0.18)';
    ctx.stroke(grain);

    // exit door glow
    const exitScreen = camera.worldToScreen(GREENHOUSE_EXIT.x * TILE_SIZE, GREENHOUSE_EXIT.y * TILE_SIZE);
    ctx.fillStyle = 'rgba(150,200,255,0.25)';
    ctx.fillRect(exitScreen.x - tile * 0.3, exitScreen.y, tile * 1.6, tile);

    this.sprites.beginFrame();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.drawGreenhouseProps(camera, now);
    if (!state.owned.includes('sunRoom')) {
      for (const c of STORAGE_CRATES) this.drawCrate(camera, c.x, c.y);
    }

    const plantAt = (kind: 'nursery' | 'display', id: string) =>
      Object.values(state.plants).find((p) => (kind === 'nursery' ? p.location.kind === 'nursery' && p.location.bedId === id : p.location.kind === 'display' && p.location.slotId === id));

    const drawables: { y: number; draw: () => void }[] = [];
    for (const bed of NURSERY_BEDS) {
      if (bed.requires && !state.owned.includes(bed.requires)) continue;
      drawables.push({ y: bed.y + 0.5, draw: () => this.drawNurseryBed(camera, bed.x, bed.y, plantAt('nursery', bed.id), now) });
    }
    const hanging: DisplaySlot[] = [];
    for (const slot of DISPLAY_SLOTS) {
      if (slot.requires && !state.owned.includes(slot.requires)) continue;
      if (slot.kind === 'hanging') {
        hanging.push(slot);
        continue;
      }
      drawables.push({ y: slot.y + 0.5, draw: () => this.drawDisplaySlot(camera, slot, plantAt('display', slot.id), now) });
    }

    const moving = Math.hypot(state.player.x - this.lastEllenX, state.player.y - this.lastEllenY) > 0.001;
    this.lastEllenX = state.player.x;
    this.lastEllenY = state.player.y;
    drawables.push({ y: state.scout.y, draw: () => this.drawScout(camera, state.scout, now) });
    if (state.scott.zone === 'greenhouse') drawables.push({ y: state.scott.y, draw: () => this.drawScott(camera, state.scott, now) });
    drawables.push({ y: state.cat.y, draw: () => this.drawCat(camera, state.cat, now) });
    drawables.push({ y: state.player.y, draw: () => this.drawEllen(camera, state.player.x, state.player.y, state.player.facing, now, moving, crouching) });
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();
    // Hanging pots are overhead, so they draw over everyone.
    for (const slot of hanging) this.drawDisplaySlot(camera, slot, plantAt('display', slot.id), now);

    if (state.owned.includes('growLights')) this.drawGrowLights(camera, now);

    // Warm ambient tint + light shafts
    ctx.fillStyle = 'rgba(255,200,130,0.05)';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  /**
   * Set dressing that makes the greenhouse read as somewhere Ellen actually
   * lives and works: Scout's own resting spot, her notebook and crochet
   * basket, and a row of hanging pots suspended from the glass roof (drawn
   * with an upward screen offset so they read as overhead, not underfoot).
   */
  private drawGreenhouseProps(camera: Camera, now: number) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    const at = (x: number, y: number) => camera.worldToScreen((x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE);

    const scoutBedSpot = GREENHOUSE_FURNITURE.find((f) => f.id === 'scoutBed')!;
    const ellenDeskSpot = GREENHOUSE_FURNITURE.find((f) => f.id === 'ellenDesk')!;

    // Scout's bed.
    {
      const s = at(scoutBedSpot.x, scoutBedSpot.y);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(s.x, s.y + tile * 0.24, tile * 0.34, tile * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = SCOUT_APPEARANCE.collar;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y + tile * 0.14, tile * 0.32, tile * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = SCOUT_APPEARANCE.furLight;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y + tile * 0.12, tile * 0.22, tile * 0.13, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ellen's notebook + crochet basket.
    {
      const s = at(ellenDeskSpot.x, ellenDeskSpot.y);
      ctx.fillStyle = '#5a4530';
      ctx.fillRect(s.x - tile * 0.3, s.y - tile * 0.16, tile * 0.6, tile * 0.32);
      // notebook
      ctx.save();
      ctx.translate(s.x - tile * 0.1, s.y - tile * 0.04);
      ctx.rotate(-0.15);
      ctx.fillStyle = ELLEN_APPEARANCE.shirt;
      ctx.fillRect(-tile * 0.12, -tile * 0.09, tile * 0.24, tile * 0.18);
      ctx.strokeStyle = 'rgba(60,45,30,0.5)';
      ctx.lineWidth = 1;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(-tile * 0.09, i * tile * 0.05);
        ctx.lineTo(tile * 0.09, i * tile * 0.05);
        ctx.stroke();
      }
      ctx.restore();
      // crochet basket with a hook of yarn
      ctx.fillStyle = '#8a6a42';
      ctx.beginPath();
      ctx.ellipse(s.x + tile * 0.16, s.y + tile * 0.04, tile * 0.11, tile * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ELLEN_APPEARANCE.crochetScarf;
      ctx.beginPath();
      ctx.arc(s.x + tile * 0.16, s.y - tile * 0.02, tile * 0.07, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = ELLEN_APPEARANCE.crochetScarfAlt;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(s.x + tile * 0.1, s.y - tile * 0.05);
      ctx.quadraticCurveTo(s.x + tile * 0.02, s.y - tile * 0.12, s.x - tile * 0.05, s.y - tile * 0.08);
      ctx.stroke();
    }

  }

  private drawNurseryBed(camera: Camera, x: number, y: number, plant: OwnedPlant | undefined, now: number) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    const s = camera.worldToScreen((x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(s.x - tile * 0.4, s.y + tile * 0.26, tile * 0.8, tile * 0.1);
    ctx.fillStyle = '#6b4a2e';
    ctx.fillRect(s.x - tile * 0.42, s.y - tile * 0.1, tile * 0.84, tile * 0.38);
    ctx.fillStyle = '#3d2a1a';
    ctx.fillRect(s.x - tile * 0.36, s.y - tile * 0.12, tile * 0.72, tile * 0.16);
    ctx.strokeStyle = '#4a3220';
    ctx.lineWidth = Math.max(1, tile * 0.03);
    ctx.strokeRect(s.x - tile * 0.42, s.y - tile * 0.1, tile * 0.84, tile * 0.38);
    // little seed-tray grid
    ctx.strokeStyle = 'rgba(30,20,10,0.4)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(s.x - tile * 0.42 + i * tile * 0.21, s.y + tile * 0.04);
      ctx.lineTo(s.x - tile * 0.42 + i * tile * 0.21, s.y + tile * 0.28);
      ctx.stroke();
    }
    if (plant) this.drawPlantSprite(s.x, s.y - tile * 0.02, tile * 0.85, plant.defId, plant.variantId, stageFloat(plant.growth), plant.seed, 'pot', now);
  }

  private drawDisplaySlot(camera: Camera, slot: DisplaySlot, plant: OwnedPlant | undefined, now: number) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    const s = camera.worldToScreen((slot.x + 0.5) * TILE_SIZE, (slot.y + 0.5) * TILE_SIZE);
    let potY = s.y;
    let mode: PlantMode = 'pot';
    switch (slot.kind) {
      case 'stand':
      case 'sunroom': {
        // round wooden plant stand
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath();
        ctx.ellipse(s.x, s.y + tile * 0.32, tile * 0.28, tile * 0.08, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = slot.kind === 'sunroom' ? '#d8cdb4' : '#7a5636';
        for (const dx of [-0.16, 0.13]) ctx.fillRect(s.x + dx * tile, s.y + tile * 0.06, tile * 0.04, tile * 0.28);
        ctx.fillStyle = slot.kind === 'sunroom' ? '#efe6d0' : '#946a44';
        ctx.beginPath();
        ctx.ellipse(s.x, s.y + tile * 0.06, tile * 0.24, tile * 0.07, 0, 0, Math.PI * 2);
        ctx.fill();
        potY = s.y - tile * 0.2;
        break;
      }
      case 'tiered': {
        ctx.fillStyle = '#2f2f2c';
        const rise = (slot.y % 4) * 0.04;
        ctx.fillRect(s.x - tile * 0.3, s.y + tile * 0.1 - rise * tile, tile * 0.6, tile * 0.05);
        ctx.fillRect(s.x - tile * 0.28, s.y + tile * 0.1 - rise * tile, tile * 0.03, tile * (0.25 + rise));
        ctx.fillRect(s.x + tile * 0.25, s.y + tile * 0.1 - rise * tile, tile * 0.03, tile * (0.25 + rise));
        potY = s.y - tile * 0.16 - rise * tile;
        break;
      }
      case 'shelf': {
        ctx.fillStyle = '#6b4a2e';
        ctx.fillRect(s.x - tile * 0.45, s.y + tile * 0.08, tile * 0.9, tile * 0.08);
        ctx.fillStyle = '#4a3220';
        ctx.fillRect(s.x - tile * 0.45, s.y + tile * 0.16, tile * 0.08, tile * 0.14);
        potY = s.y - tile * 0.18;
        break;
      }
      case 'hanging': {
        const sway = Math.sin(now * 0.0012 + slot.x) * tile * 0.02;
        ctx.strokeStyle = 'rgba(60,50,40,0.7)';
        ctx.lineWidth = 1;
        potY = s.y - tile * 0.35;
        ctx.beginPath();
        ctx.moveTo(s.x + sway, s.y - tile * 1.0);
        ctx.lineTo(s.x + sway - tile * 0.14, potY);
        ctx.moveTo(s.x + sway, s.y - tile * 1.0);
        ctx.lineTo(s.x + sway + tile * 0.14, potY);
        ctx.stroke();
        mode = 'hanging';
        if (!plant) {
          ctx.fillStyle = '#5a4030';
          ctx.beginPath();
          ctx.arc(s.x + sway, s.y - tile * 1.0, tile * 0.03, 0, Math.PI * 2);
          ctx.fill();
          return;
        }
        this.drawPot(s.x + sway, potY, tile, plant.location.kind === 'display' ? plant.location.potId : 'terracotta', 0.9);
        this.drawPlantSprite(s.x + sway, potY + tile * 0.02, tile * 0.9, plant.defId, plant.variantId, stageFloat(plant.growth), plant.seed, mode, now);
        return;
      }
    }
    if (!plant) {
      // An empty spot waiting for something special.
      ctx.strokeStyle = 'rgba(240,230,200,0.25)';
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(s.x, potY + tile * 0.12, tile * 0.18, tile * 0.07, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }
    const potId = plant.location.kind === 'display' ? plant.location.potId : 'terracotta';
    this.drawPot(s.x, potY, tile, potId);
    this.drawPlantSprite(s.x, potY + tile * 0.02, tile, plant.defId, plant.variantId, stageFloat(plant.growth), plant.seed, mode, now);
    if (rarityRank(specimenRarity(plant.defId, plant.variantId)) >= 3) this.drawSparkle(s.x, potY - tile * 0.5, tile, now, '#ffe9a8', 2);
  }

  private drawCrate(camera: Camera, x: number, y: number) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    const s = camera.worldToScreen(x * TILE_SIZE, y * TILE_SIZE);
    ctx.fillStyle = '#7c5c3a';
    ctx.fillRect(s.x + tile * 0.06, s.y + tile * 0.1, tile * 0.88, tile * 0.8);
    ctx.strokeStyle = '#4e3822';
    ctx.lineWidth = Math.max(1, tile * 0.03);
    ctx.strokeRect(s.x + tile * 0.06, s.y + tile * 0.1, tile * 0.88, tile * 0.8);
    ctx.beginPath();
    ctx.moveTo(s.x + tile * 0.06, s.y + tile * 0.1);
    ctx.lineTo(s.x + tile * 0.94, s.y + tile * 0.9);
    ctx.stroke();
    ctx.fillStyle = 'rgba(220,210,190,0.18)';
    ctx.fillRect(s.x + tile * 0.1, s.y + tile * 0.12, tile * 0.3, tile * 0.08);
  }

  private drawGrowLights(camera: Camera, now: number) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const [lx, ly] of [
      [3, 3],
      [5, 3],
      [12, 4],
      [12, 7],
    ] as const) {
      const s = camera.worldToScreen(lx * TILE_SIZE, ly * TILE_SIZE);
      const flicker = 0.9 + 0.1 * Math.sin(now * 0.003 + lx);
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, tile * 2.2);
      g.addColorStop(0, `rgba(255,170,220,${0.12 * flicker})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(s.x - tile * 2.2, s.y - tile * 2.2, tile * 4.4, tile * 4.4);
    }
    ctx.restore();
  }
}
