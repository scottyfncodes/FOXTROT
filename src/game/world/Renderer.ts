import { Camera } from '../engine/Camera';
import type { GameState, ScoutState, ScottState, CatState, Facing } from '../state';
import type { Obstacle } from './Obstacles';
import type { DiscoveryPoint, ZoneId } from '../types';
import { TILE_SIZE, ZONE_RECTS, GREENHOUSE_FOOTPRINT, GREENHOUSE_DOOR, zoneAt, isWater } from '../data/worldMap';
import { ZONES } from '../data/zones';
import { GREENHOUSE_GRID_W, GREENHOUSE_GRID_H, STATIONS, GREENHOUSE_EXIT } from '../data/stations';
import { PLANTS } from '../data/plants';
import { FUNGI } from '../data/fungi';
import { MATERIALS } from '../data/materials';
import { CREATURES } from '../data/creatures';
import { TOOL_PICKUPS } from '../data/toolPickups';
import { ELLEN_APPEARANCE, SCOUT_APPEARANCE, SCOTT_APPEARANCE, CAT_APPEARANCE } from '../data/character';
import { daylightFactor, isNight } from '../engine/Clock';
import { isDiscoveryAvailable } from '../systems/collection';
import { stageProgress01 } from '../systems/plantGrowth';
import { meetsRequirement } from '../systems/tools';
import { DISCOVERY_POINTS } from '../data/discoveryPoints';

const DISCOVERY_POINTS_BY_ID: Record<string, DiscoveryPoint> = Object.fromEntries(DISCOVERY_POINTS.map((d) => [d.id, d]));

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function lerpColor(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ar = (pa >> 16) & 255;
  const ag = (pa >> 8) & 255;
  const ab = pa & 255;
  const br = (pb >> 16) & 255;
  const bg = (pb >> 8) & 255;
  const bb = pb & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
}

export class Renderer {
  private lastEllenX = 0;
  private lastEllenY = 0;

  constructor(private ctx: CanvasRenderingContext2D) {}

  clear(color: string) {
    const { ctx } = this;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  renderOutdoor(camera: Camera, state: GameState, obstacles: Obstacle[], now: number, crouching = false) {
    const { ctx } = this;
    const zoneHere = zoneAt(Math.floor(state.player.x), Math.floor(state.player.y));
    this.clear(ZONES[zoneHere].tint);
    const bounds = camera.getViewportTileBounds();
    const tile = TILE_SIZE * camera.zoom;

    // Ground
    for (let ty = bounds.minY; ty <= bounds.maxY; ty++) {
      for (let tx = bounds.minX; tx <= bounds.maxX; tx++) {
        const zone = zoneAt(tx, ty);
        const palette = ZONES[zone].groundColors;
        const water = isWater(tx, ty);
        const screen = camera.worldToScreen(tx * TILE_SIZE, ty * TILE_SIZE);
        if (water) {
          const wobble = Math.sin(now * 0.002 + tx * 0.6 + ty * 0.3) * 0.15 + 0.5;
          ctx.fillStyle = lerpColor('#1c4650', '#3f7f86', wobble);
        } else {
          const n = hash2(tx, ty);
          const idx = Math.floor(n * palette.length);
          ctx.fillStyle = palette[Math.min(idx, palette.length - 1)];
        }
        ctx.fillRect(Math.floor(screen.x), Math.floor(screen.y), Math.ceil(tile) + 1, Math.ceil(tile) + 1);
      }
    }

    // Greenhouse building
    this.drawGreenhouseExterior(camera, state.clock.totalMinutes);

    // Obstacles
    for (const o of obstacles) {
      if (o.x < bounds.minX - 2 || o.x > bounds.maxX + 2 || o.y < bounds.minY - 2 || o.y > bounds.maxY + 2) continue;
      this.drawObstacle(camera, o);
    }

    // Discovery markers
    for (const dp of Object.values(DISCOVERY_POINTS_BY_ID)) {
      if (dp.x < bounds.minX - 1 || dp.x > bounds.maxX + 1 || dp.y < bounds.minY - 1 || dp.y > bounds.maxY + 1) continue;
      this.drawDiscoveryMarker(camera, state, dp, now);
    }

    // Tool pickups
    for (const tp of TOOL_PICKUPS) {
      if ((state.tools[tp.tool] ?? 0) >= tp.tier) continue;
      if (!meetsRequirement(state, tp.requiresToolTier)) continue;
      if (tp.x < bounds.minX - 1 || tp.x > bounds.maxX + 1 || tp.y < bounds.minY - 1 || tp.y > bounds.maxY + 1) continue;
      const screen = camera.worldToScreen((tp.x + 0.5) * TILE_SIZE, (tp.y + 0.5) * TILE_SIZE);
      this.glowMarker(screen.x, screen.y, tile, '#e8c97a', now);
      ctx.fillStyle = '#e8c97a';
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, tile * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }

    // The living ecosystem, made visible: small wandering creatures scaled
    // by the same population numbers driving the simulation underneath.
    this.drawRoamingCreatures(camera, state, zoneHere, bounds, now);

    // Fox
    if (state.fox.visible && !state.player.inGreenhouse) {
      this.drawFox(camera, state.fox.x, state.fox.y, now);
    }

    // Scout, Ellen's companion, always somewhere nearby.
    this.drawScout(camera, state.scout, now);

    // Scott, off doing his own thing somewhere in the wilderness or garden.
    if (state.scott.zone !== 'greenhouse') {
      this.drawScott(camera, state.scott, now);
    }

    // Ellen
    const moving = Math.hypot(state.player.x - this.lastEllenX, state.player.y - this.lastEllenY) > 0.001;
    this.lastEllenX = state.player.x;
    this.lastEllenY = state.player.y;
    this.drawEllen(camera, state.player.x, state.player.y, state.player.facing, now, moving, crouching);

    // Low foreground vegetation drawn last, so tall grass/reeds partially
    // overlap the characters' feet instead of characters always reading on
    // top of everything.
    for (const o of obstacles) {
      if (o.kind !== 'flower' && o.kind !== 'reed') continue;
      if (o.x < bounds.minX - 2 || o.x > bounds.maxX + 2 || o.y < bounds.minY - 2 || o.y > bounds.maxY + 2) continue;
      const nearFeet = Math.hypot(o.x + 0.5 - state.player.x, o.y + 0.5 - state.player.y) < 0.9;
      if (nearFeet) this.drawObstacle(camera, o);
    }

    // Ambient particles: a few, always tasteful, never noise.
    this.drawAmbientParticles(camera, zoneHere, state.weather.condition, now);

    // Weather / lighting overlay
    this.drawWeatherOverlay(camera, state, now);
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

  private drawObstacle(camera: Camera, o: Obstacle) {
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
  }

  private glowMarker(x: number, y: number, tile: number, color: string, now: number) {
    const { ctx } = this;
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.003);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, tile * (0.5 + pulse * 0.15));
    grad.addColorStop(0, color.replace(')', ',0.35)').replace('rgb', 'rgba'));
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, tile * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawDiscoveryMarker(camera: Camera, state: GameState, dp: DiscoveryPoint, now: number) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    if (dp.foxLed && !state.discoveryPoints[dp.id]?.revealed) return; // truly hidden
    const ptState = state.discoveryPoints[dp.id];
    const onCooldown = !!ptState?.lastCollectedAt && !isDiscoveryAvailable(state, dp);
    if (onCooldown) return; // recently plucked, will return later

    const available = isDiscoveryAvailable(state, dp);
    const screen = camera.worldToScreen((dp.x + 0.5) * TILE_SIZE, (dp.y + 0.5) * TILE_SIZE);
    const def = dp.specimenKind === 'plant' ? PLANTS[dp.specimenId] : dp.specimenKind === 'fungus' ? FUNGI[dp.specimenId] : MATERIALS[dp.specimenId];
    const known = !!state.journal[dp.specimenId] && state.journal[dp.specimenId].level !== 'UNDISCOVERED';
    const hue = 'baseTraits' in (def ?? {}) ? (def as { baseTraits: { colorHue?: number } }).baseTraits.colorHue ?? 140 : 140;
    const color = dp.specimenKind === 'fungus' ? '#d9c896' : dp.specimenKind === 'material' ? '#b9ac8e' : `hsl(${hue},55%,60%)`;

    if (!available) {
      // Visible but not yet reachable: a faint hint, not a full render.
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = known ? color : '#8fa89c';
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, tile * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      return;
    }

    this.glowMarker(screen.x, screen.y, tile, color.startsWith('hsl') ? '#9fd6c0' : '#e8dcb8', now);
    ctx.fillStyle = known ? color : '#c9d9c2';
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, tile * 0.16, 0, Math.PI * 2);
    ctx.fill();
    if (!known) {
      ctx.fillStyle = '#1b2420';
      ctx.font = `${Math.round(tile * 0.22)}px Georgia`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', screen.x, screen.y + 1);
    }
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
   * hat, satchel with a hand lens, and the recurring handmade detail, a
   * crocheted scarf. `crouching` renders her brief collect/examine pose.
   */
  private drawEllen(camera: Camera, x: number, y: number, facing: Facing, now: number, moving: boolean, crouching: boolean) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    const screen = camera.worldToScreen(x * TILE_SIZE, y * TILE_SIZE);
    const dir = Renderer.DIR[facing];
    const sideFlip = facing === 'left' ? -1 : 1;
    const facingBack = facing === 'up';

    const walkPhase = moving ? now * 0.013 : now * 0.003;
    const walkAmp = moving ? 1 : 0.3;
    const bob = Math.sin(walkPhase) * tile * 0.02 * walkAmp;
    const legSwing = moving ? Math.sin(walkPhase * 2) * tile * 0.06 : 0;
    const squash = crouching ? 0.72 : 1;
    const lift = crouching ? tile * 0.1 : 0;

    const cx = screen.x;
    const cy = screen.y + bob + lift;

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.24)';
    ctx.beginPath();
    ctx.ellipse(cx, screen.y + tile * 0.26, tile * 0.19, tile * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();

    // backpack, slung opposite the way she's facing
    const packX = cx - dir[0] * tile * 0.16;
    const packY = cy - dir[1] * tile * 0.1 - tile * 0.06;
    ctx.fillStyle = ELLEN_APPEARANCE.backpack;
    ctx.beginPath();
    ctx.ellipse(packX, packY, tile * 0.14, tile * 0.17 * squash, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = ELLEN_APPEARANCE.backpackStrap;
    ctx.lineWidth = Math.max(1, tile * 0.02);
    ctx.beginPath();
    ctx.moveTo(packX - tile * 0.12, packY - tile * 0.1);
    ctx.lineTo(packX + tile * 0.12, packY - tile * 0.1);
    ctx.stroke();

    // boots, alternating a little while walking
    ctx.fillStyle = ELLEN_APPEARANCE.boots;
    ctx.beginPath();
    ctx.ellipse(cx - tile * 0.07, screen.y + tile * 0.24 + legSwing, tile * 0.06, tile * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + tile * 0.07, screen.y + tile * 0.24 - legSwing, tile * 0.06, tile * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();

    // pants sliver
    ctx.fillStyle = ELLEN_APPEARANCE.pants;
    ctx.beginPath();
    ctx.ellipse(cx, cy + tile * 0.2 * squash, tile * 0.14, tile * 0.1 * squash, 0, 0, Math.PI * 2);
    ctx.fill();

    // vest / torso
    ctx.fillStyle = ELLEN_APPEARANCE.vest;
    ctx.beginPath();
    ctx.ellipse(cx, cy, tile * 0.17, tile * 0.22 * squash, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = ELLEN_APPEARANCE.vestTrim;
    ctx.lineWidth = Math.max(1, tile * 0.02);
    ctx.beginPath();
    ctx.moveTo(cx, cy - tile * 0.2 * squash);
    ctx.lineTo(cx, cy + tile * 0.18 * squash);
    ctx.stroke();

    // shirt collar
    ctx.fillStyle = ELLEN_APPEARANCE.shirt;
    ctx.beginPath();
    ctx.ellipse(cx, cy - tile * 0.16 * squash, tile * 0.07, tile * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();

    // crocheted scarf — the recurring handmade touch
    ctx.strokeStyle = ELLEN_APPEARANCE.crochetScarf;
    ctx.lineWidth = Math.max(2, tile * 0.045);
    ctx.beginPath();
    ctx.arc(cx, cy - tile * 0.15 * squash, tile * 0.1, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    ctx.strokeStyle = ELLEN_APPEARANCE.crochetScarfAlt;
    ctx.lineWidth = Math.max(1, tile * 0.015);
    for (let i = 0; i < 4; i++) {
      const a = 0.22 * Math.PI + i * 0.16 * Math.PI;
      const sx = cx + Math.cos(a) * tile * 0.1;
      const sy = cy - tile * 0.15 * squash + Math.sin(a) * tile * 0.1;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(a) * tile * 0.02, sy + Math.sin(a) * tile * 0.02);
      ctx.stroke();
    }

    // satchel + hand lens at the hip
    const hipX = cx + sideFlip * tile * 0.13;
    ctx.fillStyle = ELLEN_APPEARANCE.pouch;
    ctx.beginPath();
    ctx.ellipse(hipX, cy + tile * 0.05, tile * 0.06, tile * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#cbb78a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(hipX, cy + tile * 0.01, tile * 0.03, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = ELLEN_APPEARANCE.lensGlint;
    ctx.beginPath();
    ctx.arc(hipX, cy + tile * 0.01, tile * 0.015, 0, Math.PI * 2);
    ctx.fill();

    // head + face
    const headY = cy - tile * 0.32 * squash;
    ctx.fillStyle = ELLEN_APPEARANCE.skin;
    ctx.beginPath();
    ctx.arc(cx, headY, tile * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ELLEN_APPEARANCE.hair;
    ctx.beginPath();
    ctx.arc(cx - dir[0] * tile * 0.02, headY + tile * 0.06, tile * 0.06, 0, Math.PI * 2);
    ctx.fill();
    if (!facingBack) {
      ctx.fillStyle = '#2a2018';
      ctx.beginPath();
      ctx.arc(cx + dir[0] * tile * 0.05 - tile * 0.03, headY + dir[1] * tile * 0.02, tile * 0.015, 0, Math.PI * 2);
      ctx.arc(cx + dir[0] * tile * 0.05 + tile * 0.03, headY + dir[1] * tile * 0.02, tile * 0.015, 0, Math.PI * 2);
      ctx.fill();
    }

    // wide-brim field hat
    ctx.fillStyle = ELLEN_APPEARANCE.hat;
    ctx.beginPath();
    ctx.ellipse(cx, headY - tile * 0.02, tile * 0.16, tile * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx - dir[0] * tile * 0.02, headY - tile * 0.08, tile * 0.09, tile * 0.075, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = ELLEN_APPEARANCE.hatBand;
    ctx.lineWidth = Math.max(1, tile * 0.025);
    ctx.beginPath();
    ctx.ellipse(cx - dir[0] * tile * 0.02, headY - tile * 0.02, tile * 0.09, tile * 0.04, 0, 0, Math.PI);
    ctx.stroke();

    // backpack straps, visible over the shoulders from the front
    if (facing === 'down') {
      ctx.strokeStyle = ELLEN_APPEARANCE.backpackStrap;
      ctx.lineWidth = Math.max(1, tile * 0.025);
      ctx.beginPath();
      ctx.moveTo(cx - tile * 0.1, cy - tile * 0.18 * squash);
      ctx.lineTo(cx - tile * 0.05, cy + tile * 0.05);
      ctx.moveTo(cx + tile * 0.1, cy - tile * 0.18 * squash);
      ctx.lineTo(cx + tile * 0.05, cy + tile * 0.05);
      ctx.stroke();
    }

    // reaching hand while crouched/collecting
    if (crouching) {
      ctx.fillStyle = ELLEN_APPEARANCE.skin;
      ctx.beginPath();
      ctx.arc(cx + dir[0] * tile * 0.22, cy + dir[1] * tile * 0.14 + tile * 0.08, tile * 0.045, 0, Math.PI * 2);
      ctx.fill();
    }
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
    ctx.fillStyle = SCOUT_APPEARANCE.eyePatch;
    ctx.beginPath();
    ctx.arc(headX + dir[1] * tile * 0.05 + dir[0] * tile * 0.01, headY - tile * 0.01, tile * 0.022, 0, Math.PI * 2);
    ctx.fill();

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
   * Small wandering creature icons scaled by the same ecosystem population
   * numbers driving the simulation, so relationships read visually instead
   * of only as numbers behind the scenes. Generic per creature `kind` —
   * new species need no new rendering code.
   */
  private drawRoamingCreatures(
    camera: Camera,
    state: GameState,
    zone: ZoneId,
    bounds: { minX: number; maxX: number; minY: number; maxY: number },
    now: number
  ) {
    const pops = state.ecosystem[zone];
    if (!pops) return;
    const tile = TILE_SIZE * camera.zoom;
    let drawn = 0;
    for (const speciesId of Object.keys(pops)) {
      if (drawn >= 8) break;
      const creature = CREATURES[speciesId];
      if (!creature) continue;
      const pop = pops[speciesId];
      if (pop < 22) continue;
      if (creature.nocturnal && !isNight(state.clock.totalMinutes)) continue;
      const count = Math.min(3, Math.max(1, Math.round((pop / 100) * 3)));
      for (let i = 0; i < count && drawn < 8; i++) {
        const seedA = hash2(speciesId.charCodeAt(0) + i * 3, speciesId.length * 7 + i);
        const seedB = hash2(seedA * 97, i * 5 + speciesId.charCodeAt(speciesId.length - 1));
        const centerX = bounds.minX + seedA * (bounds.maxX - bounds.minX);
        const centerY = bounds.minY + seedB * (bounds.maxY - bounds.minY);
        const wx = centerX + Math.sin(now * 0.0009 + i * 2.1 + seedA * 6) * 1.4;
        const wy = centerY + Math.cos(now * 0.0011 + i * 1.7 + seedB * 6) * 1.4;
        const screen = camera.worldToScreen(wx * TILE_SIZE, wy * TILE_SIZE);
        this.drawCreatureIcon(screen.x, screen.y, tile, creature.kind, now + i * 400);
        drawn++;
      }
    }
  }

  private drawCreatureIcon(x: number, y: number, tile: number, kind: 'insect' | 'animal', now: number) {
    const { ctx } = this;
    if (kind === 'insect') {
      const flutter = Math.sin(now * 0.02) * tile * 0.03;
      ctx.fillStyle = 'rgba(40,40,30,0.85)';
      ctx.beginPath();
      ctx.arc(x, y, tile * 0.025, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(220,220,255,0.55)';
      ctx.beginPath();
      ctx.ellipse(x - tile * 0.03, y - flutter, tile * 0.025, tile * 0.014, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x + tile * 0.03, y + flutter, tile * 0.025, tile * 0.014, -0.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(90,70,50,0.7)';
      ctx.beginPath();
      ctx.ellipse(x, y, tile * 0.05, tile * 0.032, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * Tasteful, capped-count atmosphere: drifting pollen in the shaded
   * zones, a couple of wandering butterflies over open flowers, and
   * falling leaves under the canopy when it's dry. Screen-space and cheap,
   * in the same spirit as the existing rain overlay.
   */
  private drawAmbientParticles(camera: Camera, zone: ZoneId, weather: string, now: number) {
    const { ctx } = this;
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

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
      const w = ctx.canvas.width;
      const h = ctx.canvas.height;
      for (let i = 0; i < 90; i++) {
        const seedX = (i * 977) % w;
        const seedY = ((i * 613 + Math.floor(now * 0.6)) % (h + 40)) - 20;
        ctx.beginPath();
        ctx.moveTo(seedX, seedY);
        ctx.lineTo(seedX - 6, seedY + 16);
        ctx.stroke();
      }
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
    const targetTilesVisible = 7;
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

    for (let y = 0; y < GREENHOUSE_GRID_H; y++) {
      for (let x = 0; x < GREENHOUSE_GRID_W; x++) {
        const border = x === 0 || y === 0 || x === GREENHOUSE_GRID_W - 1 || y === GREENHOUSE_GRID_H - 1;
        const screen = camera.worldToScreen(x * TILE_SIZE, y * TILE_SIZE);
        if (border) {
          ctx.fillStyle = '#3a4a40';
        } else {
          const n = hash2(x, y);
          ctx.fillStyle = n > 0.5 ? '#6b4f36' : '#63492f';
        }
        ctx.fillRect(Math.floor(screen.x), Math.floor(screen.y), Math.ceil(tile) + 1, Math.ceil(tile) + 1);
      }
    }

    // exit door glow
    const exitScreen = camera.worldToScreen(GREENHOUSE_EXIT.x * TILE_SIZE, GREENHOUSE_EXIT.y * TILE_SIZE);
    ctx.fillStyle = 'rgba(150,200,255,0.25)';
    ctx.fillRect(exitScreen.x - tile * 0.3, exitScreen.y, tile * 1.6, tile);

    this.drawGreenhouseProps(camera, now);

    for (const station of STATIONS) {
      this.drawStation(camera, state, station, now);
    }

    const moving = Math.hypot(state.player.x - this.lastEllenX, state.player.y - this.lastEllenY) > 0.001;
    this.lastEllenX = state.player.x;
    this.lastEllenY = state.player.y;
    this.drawScout(camera, state.scout, now);
    if (state.scott.zone === 'greenhouse') {
      this.drawScott(camera, state.scott, now);
    }
    this.drawCat(camera, state.cat, now);
    this.drawEllen(camera, state.player.x, state.player.y, state.player.facing, now, moving, crouching);

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

    // Scout's bed.
    {
      const s = at(11, 9);
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
      const s = at(13, 9);
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

    // Hanging pots, suspended from the roof line.
    const hangSway = Math.sin(now * 0.0012) * tile * 0.02;
    for (const [hx, hy] of [
      [8, 1],
      [10, 1],
      [17, 5],
    ] as const) {
      const s = at(hx, hy);
      const px = s.x + hangSway;
      const py = s.y - tile * 0.55;
      ctx.strokeStyle = 'rgba(60,50,40,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, s.y - tile * 0.9);
      ctx.lineTo(px, py);
      ctx.stroke();
      ctx.fillStyle = '#8a5a3c';
      ctx.beginPath();
      ctx.moveTo(px - tile * 0.13, py);
      ctx.lineTo(px + tile * 0.13, py);
      ctx.lineTo(px + tile * 0.09, py + tile * 0.16);
      ctx.lineTo(px - tile * 0.09, py + tile * 0.16);
      ctx.closePath();
      ctx.fill();
      const green = lerpColor('#3f6b3a', '#5a8a4c', hash2(hx, hy));
      ctx.fillStyle = green;
      ctx.beginPath();
      ctx.arc(px, py - tile * 0.06, tile * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawStation(camera: Camera, state: GameState, station: { id: string; x: number; y: number; kind: string }, now: number) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    const screen = camera.worldToScreen((station.x + 0.5) * TILE_SIZE, (station.y + 0.5) * TILE_SIZE);

    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(screen.x, screen.y + tile * 0.28, tile * 0.32, tile * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();

    switch (station.kind) {
      case 'growBed': {
        ctx.fillStyle = '#4a3323';
        ctx.fillRect(screen.x - tile * 0.32, screen.y - tile * 0.22, tile * 0.64, tile * 0.5);
        ctx.strokeStyle = '#2c1f15';
        ctx.lineWidth = 2;
        ctx.strokeRect(screen.x - tile * 0.32, screen.y - tile * 0.22, tile * 0.64, tile * 0.5);
        const instId = state.stationOccupancy[station.id];
        if (instId) {
          const inst = state.plantInstances[instId];
          if (inst) this.drawPlantIcon(screen.x, screen.y - tile * 0.08, tile, inst, PLANTS[inst.defId]);
        }
        break;
      }
      case 'propagationBench':
        ctx.fillStyle = '#5a4530';
        ctx.fillRect(screen.x - tile * 0.34, screen.y - tile * 0.12, tile * 0.68, tile * 0.24);
        ctx.fillStyle = '#7a9c8a';
        ctx.beginPath();
        ctx.arc(screen.x - tile * 0.12, screen.y - tile * 0.18, tile * 0.08, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(screen.x + tile * 0.12, screen.y - tile * 0.18, tile * 0.08, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'seedStorage':
        ctx.fillStyle = '#6b5335';
        ctx.fillRect(screen.x - tile * 0.28, screen.y - tile * 0.3, tile * 0.56, tile * 0.56);
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = ['#d9a441', '#a8c96a', '#c96a34'][i];
          ctx.fillRect(screen.x - tile * 0.2 + i * tile * 0.16, screen.y - tile * 0.2, tile * 0.12, tile * 0.36);
        }
        break;
      case 'soilStation':
        ctx.fillStyle = '#4a3020';
        ctx.beginPath();
        ctx.ellipse(screen.x, screen.y, tile * 0.28, tile * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'compost':
        ctx.fillStyle = '#3a2f1f';
        ctx.fillRect(screen.x - tile * 0.26, screen.y - tile * 0.2, tile * 0.52, tile * 0.4);
        ctx.fillStyle = '#6a8a4a';
        ctx.beginPath();
        ctx.arc(screen.x, screen.y - tile * 0.06, tile * 0.14, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'research':
        ctx.fillStyle = '#5a4530';
        ctx.fillRect(screen.x - tile * 0.3, screen.y - tile * 0.16, tile * 0.6, tile * 0.32);
        ctx.strokeStyle = '#cbd9d2';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y - tile * 0.24, tile * 0.1, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'display':
        ctx.fillStyle = '#5a4530';
        ctx.fillRect(screen.x - tile * 0.3, screen.y - tile * 0.28, tile * 0.6, tile * 0.5);
        {
          const completed = Object.values(state.plantInstances).filter((p) => p.stage === 'COMPLETE');
          completed.slice(0, 3).forEach((inst, i) => {
            const hue = inst.traits.colorHue;
            ctx.fillStyle = `hsl(${hue},55%,55%)`;
            ctx.beginPath();
            ctx.arc(screen.x - tile * 0.16 + i * tile * 0.16, screen.y - tile * 0.1, tile * 0.06, 0, Math.PI * 2);
            ctx.fill();
          });
        }
        break;
    }

    const pulse = 0.4 + 0.3 * Math.sin(now * 0.002 + station.x);
    ctx.strokeStyle = `rgba(95,201,184,${0.15 + pulse * 0.1})`;
  }

  private drawPlantIcon(x: number, y: number, tile: number, inst: { stage: string; traits: { colorHue: number; size: number } }, def?: { name: string }) {
    const { ctx } = this;
    const hue = inst.traits.colorHue;
    const stageScale: Record<string, number> = { WILD: 0.3, CULTIVATED: 0.45, IMPROVED: 0.65, MATURE: 0.85, COMPLETE: 1 };
    const scale = stageScale[inst.stage] ?? 0.5;
    const size = tile * 0.22 * scale * (0.7 + inst.traits.size / 200);
    ctx.strokeStyle = '#3a5a30';
    ctx.lineWidth = Math.max(1, tile * 0.04);
    ctx.beginPath();
    ctx.moveTo(x, y + size * 0.6);
    ctx.lineTo(x, y - size * 0.6);
    ctx.stroke();
    ctx.fillStyle = `hsl(${hue}, 55%, 58%)`;
    ctx.beginPath();
    ctx.arc(x, y - size * 0.6, size * 0.5, 0, Math.PI * 2);
    ctx.fill();
    if (inst.stage === 'MATURE' || inst.stage === 'COMPLETE') {
      ctx.fillStyle = `hsl(${hue}, 60%, 70%)`;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * size * 0.4, y - size * 0.6 + Math.sin(a) * size * 0.4, size * 0.22, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
