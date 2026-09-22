import { Camera } from '../engine/Camera';
import type { GameState } from '../state';
import type { Obstacle } from './Obstacles';
import type { DiscoveryPoint } from '../types';
import { TILE_SIZE, ZONE_RECTS, CREEK_WATER, GREENHOUSE_FOOTPRINT, GREENHOUSE_DOOR, zoneAt, isWater, rectContains } from '../data/worldMap';
import { ZONES } from '../data/zones';
import { GREENHOUSE_GRID_W, GREENHOUSE_GRID_H, STATIONS, GREENHOUSE_EXIT } from '../data/stations';
import { PLANTS } from '../data/plants';
import { FUNGI } from '../data/fungi';
import { MATERIALS } from '../data/materials';
import { TOOL_PICKUPS } from '../data/toolPickups';
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
  constructor(private ctx: CanvasRenderingContext2D) {}

  clear(color: string) {
    const { ctx } = this;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  renderOutdoor(camera: Camera, state: GameState, obstacles: Obstacle[], now: number) {
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

    // Fox
    if (state.fox.visible && !state.player.inGreenhouse) {
      this.drawFox(camera, state.fox.x, state.fox.y, now);
    }

    // Player
    this.drawPlayer(camera, state.player.x, state.player.y, state.player.facing);

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
        const green = lerpColor('#2f4a2c', '#3f6b3a', hash2(o.x + 1, o.y + 1));
        ctx.fillStyle = green;
        ctx.beginPath();
        ctx.arc(screen.x + jitter * tile * 0.15, screen.y - tile * 0.32, tile * 0.34, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(screen.x - tile * 0.2, screen.y - tile * 0.18, tile * 0.24, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(screen.x + tile * 0.22, screen.y - tile * 0.16, tile * 0.22, 0, Math.PI * 2);
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

  private drawPlayer(camera: Camera, x: number, y: number, facing: string) {
    const { ctx } = this;
    const tile = TILE_SIZE * camera.zoom;
    const screen = camera.worldToScreen(x * TILE_SIZE, y * TILE_SIZE);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(screen.x, screen.y + tile * 0.22, tile * 0.2, tile * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3d5a52';
    ctx.beginPath();
    ctx.ellipse(screen.x, screen.y, tile * 0.18, tile * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f0d9b5';
    ctx.beginPath();
    ctx.arc(screen.x, screen.y - tile * 0.2, tile * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5fc9b8';
    const dir = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[facing] ?? [0, 1];
    ctx.beginPath();
    ctx.arc(screen.x + dir[0] * tile * 0.12, screen.y - tile * 0.2 + dir[1] * tile * 0.06, tile * 0.03, 0, Math.PI * 2);
    ctx.fill();
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

  renderIndoor(outerCamera: Camera, state: GameState, now: number) {
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

    for (const station of STATIONS) {
      this.drawStation(camera, state, station, now);
    }

    this.drawPlayer(camera, state.player.x, state.player.y, state.player.facing);

    // Warm ambient tint + light shafts
    ctx.fillStyle = 'rgba(255,200,130,0.05)';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
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
