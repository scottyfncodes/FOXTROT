import type { GameState, OwnedPlant } from '../state';
import { makeUid } from '../state';
import { loadOrCreate, saveGame, resetGame } from './SaveManager';
import { advanceClock } from './Clock';
import { Camera } from './Camera';
import { Input } from './Input';
import { AudioManager } from './AudioManager';
import { Renderer } from '../world/Renderer';
import { generateObstacles, buildBlockingSet, type Obstacle } from '../world/Obstacles';
import { isBlockedOutdoor, isBlockedIndoor, indoorSolids, type IndoorSolids } from '../world/Collision';
import { tryMove } from '../world/Movement';
import { GREENHOUSE_DOOR, HOUSE_DOOR, MARKET_STALL, zoneAt, rectContains, isInBounds, isWater, isInsideHomeFootprint } from '../data/worldMap';
import { GREENHOUSE_EXIT } from '../data/stations';
import { FRONT_DOOR, roomAt } from '../data/interior';
import { FURNITURE_DEFS } from '../data/furniture';
import { displaySlots, nurserySpots, placeFurniture, placeBlockReason, pickUpFurniture, findFurniture, fixtureOffset, footprint } from '../systems/furniture';
import { ACE_REWARD, COURSE_PAR, bestRound, recordAce, recordRound, toPar } from '../systems/putting';
import { endPlay, startPlay, tickPlay, type PlayState } from '../systems/play';
import { makeIndoorCamera, screenToTiles } from '../world/IndoorCamera';
import { Camera as CameraClass } from './Camera';
import { ToolController, type ToolOutcome } from './Tools';
import {
  compostPlant,
  removeBed,
  removePath,
  onPath,
  bedAt,
  pathAt,
  wildGrid,
  currentRadius,
  type LandscapeWorld,
} from '../systems/landscape';
import { createFoxFinds, collectFoxFind, expireFoxFinds } from '../systems/foxFinds';
import { findCuriosity } from '../data/curiosities';
import { discoveryFlourish, discoveryAside, type Flourish } from '../systems/rarity';
import type { CatInterest } from '../systems/cat';
import { KIND_SIGNIFICANCE, type Significance, type ToastKind } from '../systems/toasts';
import { isNight } from './Clock';
import type { Rarity } from '../types';
import { DISCOVERY_SPOTS } from '../data/discoveryPoints';
import { TOOL_PICKUPS } from '../data/toolPickups';
import { PLANTS, specimenName, specimenRarity, rarityRank, RARITY_LABEL, fullName } from '../data/plants';
import { findShopItem, COMPOST_PER_SACK, type DecorId, type FurnitureId } from '../data/shop';
import { ZONES } from '../data/zones';
import type { OutdoorZoneId, ZoneId } from '../types';
import { tickFox } from '../systems/fox';
import { tickScout } from '../systems/scout';
import { tickScott } from '../systems/scott';
import { tickCat } from '../systems/cat';
import { spotContent, collectSpot } from '../systems/spots';
import { advanceWorld, canPlantAt, computeLushness, type LushField } from '../systems/wild';
import { STAGE_LABEL, stageIndexOf } from '../systems/growth';
import { hasFound, recordFound, isEstablished } from '../systems/collection';
import {
  takeCutting,
  cuttingBlockReason,
  potInNursery,
  placeOnDisplay,
  plantOutdoors,
  liftPlant,
  setPot,
  creditGrown,
  occupantOf,
} from '../systems/propagation';
import { sellItem, buyItem } from '../systems/market';
import { placeDecor, pickUpDecor, nearestDecor } from '../systems/decor';

export type InteractableKind =
  | 'spot'
  | 'wildPlant'
  | 'market'
  | 'lantern'
  | 'greenhouseDoor'
  | 'greenhouseExit'
  | 'houseDoor'
  | 'frontDoor'
  | 'foxFind'
  | 'bed'
  | 'display'
  | 'puttingMat';

export interface Interactable {
  kind: InteractableKind;
  id: string;
  x: number;
  y: number;
  label: string;
  available: boolean;
}

export interface ToastEvent {
  id: string;
  text: string;
  kind: ToastKind;
  /** How much it matters: decides how long it stays and what may interrupt it. */
  significance: Significance;
}

const AUTOSAVE_MS = 8000;
const MOVE_SPEED = 3.4; // tiles per second
/** Walking a path you carved is easy going… */
const PATH_SPEED = 1.2;
/** …pushing through thick growth is not. */
const MAX_THICKET_SLOW = 0.45;
/** How far away you can tap a plant or bed to look at it. */
const TAP_REACH = 7;
const FADE_MS = 380;
const CAT_INTEREST_MS = 2500;

/** A brief shimmer in the world where something rare was just found. */
export interface WorldFlourish {
  x: number;
  y: number;
  kind: Flourish;
  rarity: Rarity;
  start: number;
}
const INTERACT_RANGE = 1.3;
const NOTICE_RANGE = 2.2;
const LUSH_REFRESH_MS = 1500;

function spanText(gameMinutes: number): string {
  const hours = gameMinutes / 60;
  return hours >= 36 ? `${Math.round(hours / 24)} days` : hours >= 20 ? 'about a day' : hours >= 1.5 ? `${Math.round(hours)} hours` : 'a little while';
}

/** "the Meadow" — for use mid-sentence. */
export function zoneLabel(z: ZoneId): string {
  return ZONES[z].name.replace(/^The /, 'the ');
}

function listZones(zones: string[]): string {
  const names = zones.map((z) => ZONES[z as ZoneId].name.replace(/^The /, 'the '));
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export class Game {
  state: GameState;
  isNew = false;
  camera = new Camera();
  input = new Input();
  audio = new AudioManager();
  renderer: Renderer;
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  obstacles: Obstacle[];
  blockingSet: Set<string>;
  indoorSolid: IndoorSolids;
  nearest: Interactable | null = null;
  lush: LushField;
  onToast: ((t: ToastEvent) => void) | null = null;
  onStateTouched: (() => void) | null = null;
  onOpenGreenhouse: ((target: { kind: 'bed' | 'display'; id: string }) => void) | null = null;
  onOpenMarket: (() => void) | null = null;
  onOpenPutting: (() => void) | null = null;
  onOpenPlantCard: ((plantId: string) => void) | null = null;
  onOpenGroundCard: ((target: { kind: 'bed' | 'path'; id: string }) => void) | null = null;
  onFrame: (() => void) | null = null;
  tools: ToolController;
  world: LandscapeWorld;
  obstacleMap = new Map<string, Obstacle>();
  cleared = new Set<string>();
  flourishes: WorldFlourish[] = [];
  /** performance.now() when the last doorway was stepped through, for a soft fade. */
  fadeFrom = 0;
  /** Indoors while arranging, the view can be panned away from Ellen. */
  indoorFocus: { x: number; y: number } | null = null;
  private catInterests: CatInterest[] = [];
  private catInterestAcc = CAT_INTEREST_MS;
  private press: { id: number; sx: number; sy: number; kind: 'tool' | 'pan' | 'tap'; lastSX: number; lastSY: number; moved: boolean; touch: boolean } | null = null;
  private lastFrame = performance.now();
  private autosaveAcc = 0;
  private spreadCarry = 0;
  private lushAcc = 0;
  private lushDirty = true;
  private started = false;
  private rafId = 0;
  /** Game-minute timestamp until which Ellen renders in her brief collect/crouch pose. */
  actionAnimUntil = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;
    this.renderer = new Renderer(ctx);
    const { state, isNew } = loadOrCreate();
    this.state = state;
    this.isNew = isNew;
    this.obstacles = generateObstacles();
    for (const o of this.obstacles) this.obstacleMap.set(`${o.x},${o.y}`, o);
    this.cleared = new Set(this.state.clearedObstacles);
    this.blockingSet = buildBlockingSet(this.obstacles, this.cleared);
    this.indoorSolid = indoorSolids(this.state);
    this.lush = computeLushness(this.state);
    this.world = {
      obstacleAt: (tx, ty) => {
        const key = `${tx},${ty}`;
        const o = this.obstacleMap.get(key);
        return o && !this.cleared.has(key) ? o.kind : null;
      },
      isBuiltOrWater: (tx, ty) =>
        !isInBounds(tx, ty) ||
        isWater(tx, ty) ||
        isInsideHomeFootprint(tx, ty) ||
        rectContains(MARKET_STALL, tx, ty) ||
        (tx === GREENHOUSE_DOOR.x && (ty === GREENHOUSE_DOOR.y || ty === GREENHOUSE_DOOR.y + 1)) ||
        (tx === HOUSE_DOOR.x && (ty === HOUSE_DOOR.y || ty === HOUSE_DOOR.y + 1)),
      isSpot: (tx, ty) => DISCOVERY_SPOTS.some((s) => s.x === tx && s.y === ty),
    };
    this.tools = new ToolController({
      state: this.state,
      world: this.world,
      now: () => this.state.clock.totalMinutes,
      player: () => ({ x: this.state.player.x, y: this.state.player.y }),
    });
    this.tools.onChange = () => {
      if (this.tools.mode.kind !== 'arrange') this.indoorFocus = null;
      this.onToolsChanged?.();
    };

    this.input.onInteract(() => {
      if (!this.tools.active) this.interactWithNearest();
    });
    window.addEventListener('keydown', this.onToolKey);
    this.bindPointer();
    window.addEventListener('resize', this.handleResize);
    document.addEventListener('visibilitychange', this.saveWhenHidden);
    window.addEventListener('pagehide', this.saveNow);
    this.handleResize();
  }

  // Mobile browsers often kill a backgrounded tab without warning, so don't
  // wait for the next autosave tick to persist what just happened.
  private saveNow = () => {
    if (this.started) saveGame(this.state);
  };
  private saveWhenHidden = () => {
    if (document.visibilityState === 'hidden') this.saveNow();
  };

  private handleResize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.camera.resize(w, h);
  };

  start() {
    this.started = true;
    this.lastFrame = performance.now();
    if (this.isNew) {
      this.hint('start', 'Wild houseplants grow in patches all over the valley. Walk up to one and take a cutting.');
    }
    const loop = (now: number) => {
      const dtMs = Math.min(100, now - this.lastFrame);
      this.lastFrame = now;
      this.update(dtMs);
      this.render(now);
      this.onFrame?.();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  onToolsChanged: (() => void) | null = null;

  stop() {
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('keydown', this.onToolKey);
    this.input.destroy();
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('visibilitychange', this.saveWhenHidden);
    window.removeEventListener('pagehide', this.saveNow);
  }

  private pushToast(text: string, kind: ToastKind = 'info', significance: Significance = KIND_SIGNIFICANCE[kind]) {
    this.onToast?.({ id: makeUid('toast'), text, kind, significance });
  }

  /** One-time guidance, shown the first time it's relevant and never again. */
  hint(id: string, text: string, significance: Significance = 'important'): boolean {
    if (this.state.hints.includes(id)) return false;
    this.state.hints.push(id);
    this.pushToast(text, 'hint', significance);
    return true;
  }

  /** Open outdoor ground: no tree/rock, not the house, stall or a wild patch. */
  isOpenGround = (tx: number, ty: number): boolean => {
    if (this.blockingSet.has(`${tx},${ty}`)) return false;
    if (this.world.isBuiltOrWater(tx, ty)) return false;
    return !this.world.isSpot(tx, ty);
  };

  /** Rebuilds everything that depends on which wild scrub has been cleared. */
  private refreshCleared() {
    this.cleared = new Set(this.state.clearedObstacles);
    this.blockingSet = buildBlockingSet(this.obstacles, this.cleared);
    this.lushDirty = true;
    this.lushAcc = LUSH_REFRESH_MS;
  }

  /** Rebuilds indoor collision after furniture moved. */
  refreshIndoor() {
    this.indoorSolid = indoorSolids(this.state);
    this.catInterestAcc = CAT_INTEREST_MS;
  }

  /** Marks a find in the world, if it's special enough to deserve it. */
  flourish(x: number, y: number, rarity: Rarity, isNew: boolean) {
    const kind = discoveryFlourish(rarity, isNew);
    if (kind === 'none') return;
    this.flourishes.push({ x, y, kind, rarity, start: performance.now() });
    if (this.flourishes.length > 6) this.flourishes.shift();
  }

  /** Advances the living world by `elapsed` game-minutes and reports what changed. */
  private simulate(elapsed: number, offline: boolean) {
    const result = advanceWorld(this.state, elapsed, this.spreadCarry, this.isOpenGround);
    this.spreadCarry = result.carry;
    const now = this.state.clock.totalMinutes;
    if (result.ups.length || result.spreads.length) this.lushDirty = true;

    const grew = new Set<string>();
    for (const up of result.ups) {
      const plant = this.state.plants[up.plantId];
      if (!plant) continue;
      grew.add(plant.id);
      const established = creditGrown(this.state, plant.id, now);
      const def = PLANTS[plant.defId];
      if (established) {
        const first = this.hint(
          'established',
          `${def.name} is established! Lift one into your basket, then give it a pot in the greenhouse gallery — or plant it out in the wild, where it will grow and spread on its own.`,
          'major'
        );
        if (!first) this.pushToast(`${def.name} is now established — you know it well enough to display it or plant it out.`, 'discovery', 'major');
      }
      if (offline) continue;
      const name = specimenName(plant.defId, plant.variantId);
      if (plant.location.kind === 'nursery' || plant.location.kind === 'display') {
        if (up.to === 'young') {
          this.pushToast(`Your ${name} cutting has rooted.`, 'growth');
          this.hint('rooted', 'Rooted plants can give cuttings of their own. Grow two of a species to establish it.');
        } else this.pushToast(`Your ${name} is now ${STAGE_LABEL[up.to].toLowerCase()}.`, 'growth');
      } else if (up.to === 'large' && !plant.bornWild) {
        this.pushToast(`Your ${name} in ${zoneLabel(plant.location.zone)} has grown large — it may start to spread.`, 'growth');
      } else if (up.to === 'specimen' && !plant.bornWild) {
        this.pushToast(`Your ${name} in ${zoneLabel(plant.location.zone)} is a magnificent specimen now.`, 'growth', 'important');
      }
    }

    const sports = result.spreads.filter((s) => this.state.plants[s.childId]?.unnoticed);
    if (!offline) {
      if (result.spreads.length > 0) {
        const child = this.state.plants[result.spreads[0].childId];
        if (child?.location.kind === 'wild') {
          this.hint('spread', `A ${PLANTS[child.defId].name} seedling has come up by itself in ${zoneLabel(child.location.zone)}. Your plants are spreading.`, 'major');
        }
      }
      for (const s of sports) {
        const child = this.state.plants[s.childId];
        if (child?.location.kind === 'wild') this.pushToast(`Something unusual has sprouted among your ${PLANTS[child.defId].name} plants in ${zoneLabel(child.location.zone)}…`, 'discovery');
      }
    }

    if (offline) {
      const zones = [...new Set(result.spreads.map((s) => this.state.plants[s.childId]).filter((p) => p?.location.kind === 'wild').map((p) => (p!.location as { zone: string }).zone))];
      const parts: string[] = [];
      if (grew.size > 0) parts.push(grew.size === 1 ? 'one of your plants grew' : `${grew.size} of your plants grew`);
      if (result.spreads.length > 0) parts.push(`${result.spreads.length} new seedling${result.spreads.length === 1 ? '' : 's'} came up in ${listZones(zones)}`);
      const body = parts.length ? `: ${parts.join(', and ')}` : '';
      this.pushToast(`Welcome back — ${spanText(elapsed)} passed${body}.`, 'info', 'normal');
      if (sports.length > 0) this.pushToast(`And something you’ve never seen before is growing among them. Go and look.`, 'discovery');
    }
  }

  private update(dtMs: number) {
    const dtSeconds = dtMs / 1000;
    // Wall-clock time, not the rAF timestamp: rAF time restarts near zero on
    // every page load, so it can't measure how long the player was away.
    const clockResult = advanceClock(this.state, Date.now());
    if (clockResult.elapsedMinutes > 0) this.simulate(clockResult.elapsedMinutes, clockResult.wasOffline);

    this.lushAcc += dtMs;
    if (this.lushDirty && this.lushAcc > LUSH_REFRESH_MS) {
      this.lush = computeLushness(this.state);
      this.lushDirty = false;
      this.lushAcc = 0;
    }

    const move = this.input.getMoveVector();
    if (move.x !== 0 || move.y !== 0) {
      const speed = MOVE_SPEED * this.groundSpeed();
      const dx = move.x * speed * dtSeconds;
      const dy = move.y * speed * dtSeconds;
      const blocked = this.state.player.inGreenhouse
        ? (x: number, y: number) => isBlockedIndoor(x, y, this.indoorSolid)
        : (x: number, y: number) => isBlockedOutdoor(x, y, this.blockingSet);
      const next = tryMove(this.state.player.x, this.state.player.y, dx, dy, blocked);
      this.state.player.x = next.x;
      this.state.player.y = next.y;
      if (Math.abs(move.x) > Math.abs(move.y)) {
        this.state.player.facing = move.x > 0 ? 'right' : 'left';
      } else if (move.y !== 0) {
        this.state.player.facing = move.y > 0 ? 'down' : 'up';
      }
    }

    this.handleDoorTransitions();
    this.updateNearestInteractable();
    if (expireFoxFinds(this.state, this.state.clock.totalMinutes) > 0) this.onStateTouched?.();

    if (!this.state.player.inGreenhouse) {
      this.noticeNearbySports();
      const zone = zoneAt(Math.floor(this.state.player.x), Math.floor(this.state.player.y));
      const foxResult = tickFox(this.state, {
        playerZone: zone,
        playerX: this.state.player.x,
        playerY: this.state.player.y,
        inGreenhouse: false,
        dtSeconds,
        now: this.state.clock.totalMinutes,
        discoveryPoints: DISCOVERY_SPOTS,
        rand: Math.random,
        pickTrailDestination: (rand) => this.pickTrailDestination(rand),
        isOpen: (x, y) => this.isOpenGround(Math.floor(x), Math.floor(y)) && !isBlockedOutdoor(x, y, this.blockingSet),
      });
      if (foxResult.revealedDiscoveryId) {
        this.pushToast('The fox lingers here, watching something growing in the shadows.', 'discovery');
        this.audio.playToolChime();
      }
      if (foxResult.trailEnded && foxResult.trailEnded.reward !== 'nothing') {
        const { x, y, reward } = foxResult.trailEnded;
        const z = zoneAt(Math.floor(x), Math.floor(y));
        if (z !== 'greenhouse') {
          createFoxFinds(
            this.state,
            x,
            y,
            z,
            reward,
            { night: isNight(this.state.clock.totalMinutes), rain: this.state.weather.condition === 'rain' },
            this.state.clock.totalMinutes,
            Math.random,
            (gx, gy) => this.isOpenGround(Math.floor(gx), Math.floor(gy))
          );
        }
      }
      this.audio.setZone(zone, this.state.weather.condition === 'rain', dtSeconds);
    } else {
      this.audio.setZone('greenhouse', false, dtSeconds);
    }

    // In the greenhouse, Scout and the cat play chase instead of their usual routines.
    const playing = this.state.player.inGreenhouse && roomAt(this.state.player.x) === 'greenhouse';
    if (playing) {
      this.play ??= startPlay(Math.random);
      tickPlay(this.play, this.state.scout, this.state.cat, { dtSeconds, rand: Math.random, isOpen: this.isOpenIndoors });
    } else if (this.play) {
      this.play = null;
      endPlay(this.state.scout, this.state.cat, this.state.clock.totalMinutes);
    }

    if (!playing) {
      tickScout(this.state.scout, {
        playerX: this.state.player.x,
        playerY: this.state.player.y,
        playerFacing: this.state.player.facing,
        playerMoving: move.x !== 0 || move.y !== 0,
        dtSeconds,
        now: this.state.clock.totalMinutes,
        nearbyUndiscovered: this.state.player.inGreenhouse ? null : this.findNearbyUnseen(),
        rand: Math.random,
        indoors: this.state.player.inGreenhouse,
      });
    }
    tickScott(this.state.scott, { dtSeconds, now: this.state.clock.totalMinutes, rand: Math.random, offset: this.fixtureOffset });
    this.catInterestAcc += dtMs;
    if (this.catInterestAcc >= CAT_INTEREST_MS) {
      this.catInterestAcc = 0;
      this.catInterests = this.computeCatInterests();
    }
    if (!playing) tickCat(this.state.cat, { dtSeconds, now: this.state.clock.totalMinutes, rand: Math.random, interests: this.catInterests, offset: this.fixtureOffset });
    const nowMs = performance.now();
    this.flourishes = this.flourishes.filter((f) => nowMs - f.start < 2600);

    this.autosaveAcc += dtMs;
    if (this.autosaveAcc > AUTOSAVE_MS) {
      this.autosaveAcc = 0;
      saveGame(this.state);
    }
  }

  /**
   * Walking up to a sport that came up by itself among your plants is a
   * discovery in its own right: "what is that thing?"
   */
  private noticeNearbySports() {
    const p = this.state.player;
    for (const plant of Object.values(this.state.plants)) {
      if (!plant.unnoticed || plant.location.kind !== 'wild') continue;
      if (Math.hypot(plant.location.x - p.x, plant.location.y - p.y) > NOTICE_RANGE) continue;
      plant.unnoticed = false;
      const found = recordFound(this.state, plant.defId, plant.variantId, this.state.clock.totalMinutes);
      const r = specimenRarity(plant.defId, plant.variantId);
      const rarity = RARITY_LABEL[r];
      this.audio.playDiscoveryChime();
      if (found.newSpecies) this.announce(`Something new has come up among your plants: ${fullName(plant.defId, plant.variantId)} (${rarity}).`, r);
      else if (found.newVariant) this.announce(`New variant: ${fullName(plant.defId, plant.variantId)} (${rarity}) — it sprouted by itself among your plants!`, r);
      else this.pushToast(`A ${specimenName(plant.defId, plant.variantId)} has come up among your plants.`, 'discovery', 'normal');
      this.flourish(plant.location.x, plant.location.y, r, found.newSpecies || found.newVariant);
      this.onStateTouched?.();
    }
  }

  private findNearbyUnseen(): { x: number; y: number } | null {
    const p = this.state.player;
    let best: { x: number; y: number } | null = null;
    let bestDist = 2.6;
    for (const spot of DISCOVERY_SPOTS) {
      const d = Math.hypot(p.x - (spot.x + 0.5), p.y - (spot.y + 0.5));
      if (d >= bestDist) continue;
      const c = spotContent(this.state, spot);
      if (!c || hasFound(this.state, c.defId, c.variantId)) continue;
      bestDist = d;
      best = { x: spot.x + 0.5, y: spot.y + 0.5 };
    }
    return best;
  }

  private handleDoorTransitions() {
    const p = this.state.player;
    const tx = Math.floor(p.x);
    const ty = Math.floor(p.y);
    if (!p.inGreenhouse) {
      if (tx === GREENHOUSE_DOOR.x && ty === GREENHOUSE_DOOR.y) this.enterGreenhouse();
      else if (tx === HOUSE_DOOR.x && ty === HOUSE_DOOR.y) this.enterHouse();
    } else if (tx === GREENHOUSE_EXIT.x && ty >= GREENHOUSE_EXIT.y) {
      this.exitGreenhouse();
    } else if (tx === FRONT_DOOR.x && ty >= FRONT_DOOR.y) {
      this.exitHouse();
    }
  }

  /** In through the garden door, straight into the greenhouse. */
  private enterGreenhouse() {
    const p = this.state.player;
    if (this.tools.active) this.tools.cancel();
    p.inGreenhouse = true;
    p.x = GREENHOUSE_EXIT.x + 0.5;
    p.y = GREENHOUSE_EXIT.y - 1.5;
    p.facing = 'up';
    this.fadeFrom = performance.now();
    this.bringScoutAlong();
    if (this.state.basket.some((b) => b.growth === 0)) {
      this.hint('pot', 'Pot your cutting in one of the nursery beds on the left. It will root and grow on its own.');
    }
  }

  /** In through the front door: home. */
  private enterHouse() {
    const p = this.state.player;
    if (this.tools.active) this.tools.cancel();
    p.inGreenhouse = true;
    p.x = FRONT_DOOR.x + 0.5;
    p.y = FRONT_DOOR.y - 1.5;
    p.facing = 'up';
    this.fadeFrom = performance.now();
    this.bringScoutAlong();
  }

  private exitGreenhouse() {
    const p = this.state.player;
    if (this.tools.active) this.tools.cancel();
    this.indoorFocus = null;
    p.inGreenhouse = false;
    p.x = GREENHOUSE_DOOR.x + 0.5;
    p.y = GREENHOUSE_DOOR.y + 1.5;
    p.facing = 'down';
    this.fadeFrom = performance.now();
    this.bringScoutAlong();
  }

  private exitHouse() {
    const p = this.state.player;
    if (this.tools.active) this.tools.cancel();
    this.indoorFocus = null;
    p.inGreenhouse = false;
    p.x = HOUSE_DOOR.x + 0.5;
    p.y = HOUSE_DOOR.y + 1.5;
    p.facing = 'down';
    this.fadeFrom = performance.now();
    this.bringScoutAlong();
  }

  // Indoor and outdoor coordinates are different spaces, so Scout is
  // placed beside Ellen rather than left at a position that means nothing
  // on the other side of the door.
  private bringScoutAlong() {
    const p = this.state.player;
    const scout = this.state.scout;
    scout.x = p.x - 0.7;
    scout.y = p.y + 0.5;
    scout.behavior = 'following';
  }

  private updateNearestInteractable() {
    const p = this.state.player;
    let best: Interactable | null = null;
    let bestDist = INTERACT_RANGE;
    const now = this.state.clock.totalMinutes;

    const consider = (i: Interactable, cx: number, cy: number, range = INTERACT_RANGE) => {
      const d = Math.hypot(p.x - cx, p.y - cy);
      if (d < Math.min(bestDist, range)) {
        bestDist = d;
        best = i;
      }
    };

    if (!p.inGreenhouse) {
      for (const spot of DISCOVERY_SPOTS) {
        const c = spotContent(this.state, spot);
        if (!c) continue;
        const seen = hasFound(this.state, c.defId, c.variantId);
        const known = hasFound(this.state, c.defId);
        const label = seen ? `Take a cutting — ${specimenName(c.defId, c.variantId)}` : known ? `Take a cutting — an unusual ${PLANTS[c.defId].name}?` : 'Take a cutting — something you’ve never seen';
        consider({ kind: 'spot', id: spot.id, x: spot.x, y: spot.y, label, available: true }, spot.x + 0.5, spot.y + 0.5);
      }
      for (const plant of Object.values(this.state.plants)) {
        if (plant.location.kind !== 'wild') continue;
        const block = cuttingBlockReason(this.state, plant, now);
        const name = specimenName(plant.defId, plant.variantId);
        const label =
          block === 'not-rooted'
            ? `${name} seedling — too young for cuttings`
            : block === 'recovering'
              ? `${name} — recovering from its last cutting`
              : `Take a cutting from ${name}`;
        consider({ kind: 'wildPlant', id: plant.id, x: plant.location.x, y: plant.location.y, label, available: !block || block === 'basket-full' }, plant.location.x, plant.location.y, 1.0);
      }
      for (const tp of TOOL_PICKUPS) {
        if (this.state.tools[tp.tool]) continue;
        consider({ kind: 'lantern', id: tp.id, x: tp.x, y: tp.y, label: 'Pick up the old lantern', available: true }, tp.x + 0.5, tp.y + 0.5);
      }
      for (const f of this.state.foxFinds) {
        const label = f.kind === 'curiosity' ? 'Something here… look closer' : 'Something unusual is growing here';
        consider({ kind: 'foxFind', id: f.id, x: f.x, y: f.y, label, available: true }, f.x, f.y, 1.2);
      }
      const mx = MARKET_STALL.x + MARKET_STALL.w / 2;
      const my = MARKET_STALL.y + 1.1;
      consider({ kind: 'market', id: 'market', x: mx, y: my, label: 'Farmer’s Market', available: true }, mx, my, 1.6);
      if (Math.hypot(p.x - (GREENHOUSE_DOOR.x + 0.5), p.y - (GREENHOUSE_DOOR.y + 0.5)) < INTERACT_RANGE) {
        best = { kind: 'greenhouseDoor', id: 'door', x: GREENHOUSE_DOOR.x, y: GREENHOUSE_DOOR.y, label: 'Into the Greenhouse', available: true };
      }
      if (Math.hypot(p.x - (HOUSE_DOOR.x + 0.5), p.y - (HOUSE_DOOR.y + 0.5)) < INTERACT_RANGE) {
        best = { kind: 'houseDoor', id: 'house', x: HOUSE_DOOR.x, y: HOUSE_DOOR.y, label: 'Go inside — home', available: true };
      }
    } else {
      for (const bed of nurserySpots(this.state)) {
        const plant = occupantOf(this.state, { bedId: bed.id });
        const kindName = bed.kind === 'propagationTray' ? 'propagation tray' : 'nursery bed';
        const label = plant ? `${specimenName(plant.defId, plant.variantId)} — ${STAGE_LABEL[stageName(plant)]}` : `Empty ${kindName}`;
        consider({ kind: 'bed', id: bed.id, x: bed.x, y: bed.y, label, available: true }, bed.x + 0.5, bed.y + 0.5);
      }
      for (const slot of displaySlots(this.state)) {
        const plant = occupantOf(this.state, { slotId: slot.id });
        const label = plant ? `${specimenName(plant.defId, plant.variantId)} — ${STAGE_LABEL[stageName(plant)]}` : 'Empty display spot';
        const cy = slot.kind === 'hanging' ? slot.y + 1.2 : slot.y + 0.5;
        consider({ kind: 'display', id: slot.id, x: slot.x, y: slot.y, label, available: true }, slot.x + 0.5, cy);
      }
      const mat = findFurniture(this.state, 'lr-putting');
      if (mat) {
        const fp = footprint(mat.kind, mat.x, mat.y, mat.rot ?? 0);
        const best = bestRound(this.state.putting);
        const label = best === null ? 'Play a round of putt-putt' : `Play putt-putt · best ${best} (${toPar(best, COURSE_PAR)})`;
        consider({ kind: 'puttingMat', id: mat.id, x: fp.x, y: fp.y, label, available: true }, fp.x + fp.w / 2, fp.y + fp.h / 2, 1.2);
      }
      consider(
        { kind: 'greenhouseExit', id: 'exit', x: GREENHOUSE_EXIT.x, y: GREENHOUSE_EXIT.y, label: 'Out to the garden', available: true },
        GREENHOUSE_EXIT.x + 0.5,
        GREENHOUSE_EXIT.y + 0.5
      );
      consider({ kind: 'frontDoor', id: 'front', x: FRONT_DOOR.x, y: FRONT_DOOR.y, label: 'Out the front door', available: true }, FRONT_DOOR.x + 0.5, FRONT_DOOR.y + 0.5);
    }
    this.nearest = best;
  }

  interactWithNearest() {
    this.audio.init();
    const n = this.nearest;
    if (!n) return;
    const now = this.state.clock.totalMinutes;
    if (n.kind === 'spot') {
      const spot = DISCOVERY_SPOTS.find((d) => d.id === n.id)!;
      const result = collectSpot(this.state, spot, now);
      if (result.ok && result.content) {
        this.actionAnimUntil = now + 1.4;
        this.audio.playDiscoveryChime();
        const { defId, variantId } = result.content;
        const name = specimenName(defId, variantId);
        const rarity = specimenRarity(defId, variantId);
        const rare = rarityRank(rarity) >= 2 ? ` ${RARITY_LABEL[rarity]}!` : '';
        if (result.newSpecies) this.announce(`New discovery: ${name}.${rare}`, rarity);
        else if (result.newVariant) this.announce(`New variant: ${fullName(defId, variantId)}.${rare}`, rarity);
        else this.pushToast(`Took a cutting of ${name}.`, 'info');
        this.flourish(spot.x + 0.5, spot.y + 0.5, rarity, !!(result.newSpecies || result.newVariant));
        this.hint('firstCutting', 'Bring your cutting home to the greenhouse and pot it in a nursery bed.');
        if (this.state.basket.length >= 3) this.hint('market', 'The market stall down the path buys plants — and sells pots, shelves and more. Rare plants fetch a lot.');
        this.lushDirty = true;
      } else if (result.reason === 'basket-full') {
        this.pushToast('Your basket is full.', 'info');
      }
    } else if (n.kind === 'wildPlant') {
      this.cutFrom(n.id);
    } else if (n.kind === 'lantern') {
      this.state.tools.lantern = 1;
      this.audio.playToolChime();
      this.pushToast(`Found an old lantern. ${TOOL_PICKUPS[0].flavor}`, 'discovery');
    } else if (n.kind === 'market') {
      this.onOpenMarket?.();
    } else if (n.kind === 'greenhouseDoor') {
      this.enterGreenhouse();
    } else if (n.kind === 'houseDoor') {
      this.enterHouse();
    } else if (n.kind === 'greenhouseExit') {
      this.exitGreenhouse();
    } else if (n.kind === 'frontDoor') {
      this.exitHouse();
    } else if (n.kind === 'foxFind') {
      this.collectFind(n.id);
    } else if (n.kind === 'bed' || n.kind === 'display') {
      this.onOpenGreenhouse?.({ kind: n.kind, id: n.id });
    } else if (n.kind === 'puttingMat') {
      this.onOpenPutting?.();
    }
    this.onStateTouched?.();
  }

  // ---- Actions invoked by the UI ----

  cutFrom(plantId: string) {
    const plant = this.state.plants[plantId];
    if (!plant) return;
    const now = this.state.clock.totalMinutes;
    const block = cuttingBlockReason(this.state, plant, now);
    if (block === 'basket-full') return this.pushToast('Your basket is full.', 'info');
    if (block === 'not-rooted') return this.pushToast('It needs to root and grow a little before you can take cuttings.', 'info');
    if (block === 'recovering') return this.pushToast('It’s still recovering from the last cutting.', 'info');
    const res = takeCutting(this.state, plantId, now);
    if (!res) return;
    this.actionAnimUntil = now + 1.4;
    this.audio.playDiscoveryChime();
    const name = specimenName(res.item.defId, res.item.variantId);
    if (res.sport) {
      const r = specimenRarity(res.item.defId, res.item.variantId);
      this.announce(`${res.newVariant ? 'New variant! ' : ''}This cutting came out different — a ${fullName(res.item.defId, res.item.variantId)} (${RARITY_LABEL[r]}).`, r);
      if (plant.location.kind === 'wild') this.flourish(plant.location.x, plant.location.y, r, res.newVariant);
    } else {
      this.pushToast(`Took a cutting of ${name}.`, 'info');
    }
    this.onStateTouched?.();
  }

  potInBed(uid: string, bedId: string) {
    const plant = potInNursery(this.state, uid, bedId, this.state.clock.totalMinutes);
    if (!plant) return;
    this.pushToast(`Potted ${specimenName(plant.defId, plant.variantId)} in the nursery.`, 'growth');
    this.onStateTouched?.();
  }

  display(uid: string, slotId: string, potId: string) {
    const plant = placeOnDisplay(this.state, uid, slotId, potId, this.state.clock.totalMinutes);
    if (!plant) return;
    this.pushToast(`${specimenName(plant.defId, plant.variantId)} is on display. It will keep growing here.`, 'growth');
    this.onStateTouched?.();
  }

  lift(plantId: string) {
    const item = liftPlant(this.state, plantId, this.state.clock.totalMinutes);
    if (!item) return this.pushToast('Your basket is full.', 'info');
    this.pushToast(`Lifted ${specimenName(item.defId, item.variantId)} into your basket.`, 'info');
    this.onStateTouched?.();
  }

  changePot(plantId: string, potId: string) {
    setPot(this.state, plantId, potId);
    this.onStateTouched?.();
  }

  /** Where a plant would go if planted right now: just ahead of Ellen's feet. */
  plantingSpot(): { x: number; y: number; zone: OutdoorZoneId } | null {
    const p = this.state.player;
    if (p.inGreenhouse) return null;
    const off: Record<string, [number, number]> = { up: [0, -0.7], down: [0, 0.6], left: [-0.7, 0.1], right: [0.7, 0.1] };
    const [dx, dy] = off[p.facing];
    const x = p.x + dx;
    const y = p.y + dy;
    const zone = zoneAt(Math.floor(x), Math.floor(y));
    if (zone === 'greenhouse' || !canPlantAt(this.state, x, y, this.isOpenGround)) return null;
    return { x, y, zone };
  }

  plantHere(uid: string) {
    const where = this.plantingSpot();
    if (!where) return this.pushToast('There’s no room to plant right here. Try a patch of open ground.', 'info');
    const plant = plantOutdoors(this.state, uid, where.x, where.y, where.zone, this.state.clock.totalMinutes);
    if (!plant) return;
    this.lushDirty = true;
    this.lushAcc = LUSH_REFRESH_MS;
    this.actionAnimUntil = this.state.clock.totalMinutes + 1.4;
    const native = PLANTS[plant.defId].habitat.includes(where.zone);
    this.pushToast(
      `Planted ${specimenName(plant.defId, plant.variantId)} in ${zoneLabel(where.zone)}.${native ? ' It’s at home here and will grow fast.' : ''}`,
      'growth'
    );
    this.hint('plantedOut', 'It’s part of the landscape now. It will grow on its own — and once it’s large, it will start to spread.');
    this.onStateTouched?.();
  }

  /** Starts choosing exactly where a basket plant goes, beginning just ahead of Ellen. */
  beginPlanting(uid: string) {
    const p = this.state.player;
    if (p.inGreenhouse) return;
    const off: Record<string, [number, number]> = { up: [0, -1.1], down: [0, 1.0], left: [-1.1, 0.2], right: [1.1, 0.2] };
    const [dx, dy] = off[p.facing];
    this.tools.startPlanting(uid, p.x + dx, p.y + dy);
    this.hint('placing', 'Drag the plant to exactly where you want it, then tap ✓. Plants get much bigger — give them room.');
  }

  beginTransplant(plantId: string) {
    if (this.tools.startTransplant(plantId)) this.hint('transplant', 'Drag it to its new spot. Only young plants can be moved — once they’re large, they’ve settled in.');
  }

  beginArrange(stock?: FurnitureId, selectId?: string) {
    if (!this.state.player.inGreenhouse) return;
    this.indoorFocus = { x: this.state.player.x, y: this.state.player.y };
    this.tools.startArrange(stock, stock ? this.viewCentre() : undefined);
    if (selectId) this.tools.select(selectId);
  }

  beginBed(shape: 'rect' | 'oval' = 'rect') {
    if (this.state.player.inGreenhouse) return;
    this.tools.startBed(shape);
    this.hint('bed', 'Drag across open ground to mark out a bed. Plants in a bed spread only within it — and a mix of species makes for a livelier bed.');
  }

  beginPath() {
    if (this.state.player.inGreenhouse) return;
    this.tools.startPath();
    this.hint('path', 'Trace a route with your finger. Scrub is cleared along it, and anything of yours in the way goes to compost.');
  }

  addFromStock(kind: FurnitureId) {
    this.tools.addFromStock(kind, this.viewCentre());
  }

  /** ✓ in any tool. */
  confirmTool() {
    const res = this.tools.confirm();
    this.applyToolOutcome(res);
  }

  cancelTool() {
    this.tools.cancel();
    this.indoorFocus = null;
    this.onStateTouched?.();
  }

  private applyToolOutcome(res: ToolOutcome) {
    if (res.kind === 'none') return;
    const now = this.state.clock.totalMinutes;
    if (res.kind === 'planted') {
      const plant = res.plant;
      if (plant.location.kind !== 'wild') return;
      this.lushDirty = true;
      this.lushAcc = LUSH_REFRESH_MS;
      this.actionAnimUntil = now + 1.4;
      const zone = plant.location.zone;
      const native = PLANTS[plant.defId].habitat.includes(zone);
      const inBed = plant.location.bedId ? ' in your garden bed' : '';
      this.pushToast(`Planted ${specimenName(plant.defId, plant.variantId)}${inBed} in ${zoneLabel(zone)}.${native ? ' It’s at home here and will grow fast.' : ''}`, 'growth');
      this.hint('plantedOut', 'It’s part of the landscape now. It will grow on its own — and once it’s large, it will start to spread.');
    } else if (res.kind === 'transplanted') {
      this.lushDirty = true;
      const p = this.state.plants[res.plantId];
      if (p) this.pushToast(`Moved the ${specimenName(p.defId, p.variantId)}.`, 'growth');
    } else if (res.kind === 'placed') {
      this.refreshIndoor();
    } else if (res.kind === 'bed') {
      this.refreshCleared();
      const r = res.result;
      this.pushToast(`Dug a garden bed.${r.adopted ? ` ${r.adopted} of your plants are in it now.` : ''}`, 'growth');
    } else if (res.kind === 'path') {
      this.refreshCleared();
      const r = res.result;
      this.pushToast(`Carved a path.${r.composted ? ` ${r.composted} plant${r.composted === 1 ? '' : 's'} went on the compost (+${r.compost}).` : ''}`, 'growth');
    }
    this.onStateTouched?.();
  }

  /** Composts one of your outdoor plants, clearing its ground. */
  compost(plantId: string) {
    const p = this.state.plants[plantId];
    if (!p || p.location.kind !== 'wild') return;
    const where = { x: p.location.x, y: p.location.y };
    const res = compostPlant(this.state, plantId, this.state.clock.totalMinutes);
    if (!res) return;
    this.lushDirty = true;
    this.lushAcc = LUSH_REFRESH_MS;
    this.actionAnimUntil = this.state.clock.totalMinutes + 1.4;
    let msg = `Composted the ${res.name}: +${res.compost} compost.`;
    if (res.cutting) {
      const r = specimenRarity(res.cutting.defId, res.cutting.variantId);
      if (res.cutting.changed) msg += ` You saved a cutting — though it’s a ${fullName(res.cutting.defId, res.cutting.variantId)}, not quite the same.`;
      else msg += ' You saved a cutting from it.';
      this.flourish(where.x, where.y, r, res.cutting.newVariant);
    } else if (res.noRoom) msg += ' There was a cutting worth saving, but your basket was full.';
    this.pushToast(msg, 'info');
    this.hint('compost', `Compost digs garden beds. The market sells it too, ${COMPOST_PER_SACK} scoops a sack.`);
    this.onStateTouched?.();
  }

  fillInBed(id: string) {
    if (removeBed(this.state, id)) {
      this.pushToast('Filled the bed back in. Its plants stay, free to wander again.', 'info');
      this.onStateTouched?.();
    }
  }

  letPathGrowOver(id: string) {
    if (removePath(this.state, id)) {
      this.lushDirty = true;
      this.pushToast('You’ll let that path grow back over.', 'info');
      this.onStateTouched?.();
    }
  }

  private collectFind(id: string) {
    const now = this.state.clock.totalMinutes;
    const res = collectFoxFind(this.state, id, now);
    if (!res.ok || !res.find) {
      if (res.reason === 'basket-full') this.pushToast('Your basket is full.', 'info');
      return;
    }
    const f = res.find;
    this.actionAnimUntil = now + 1.4;
    this.audio.playDiscoveryChime();
    if (f.kind === 'curiosity') {
      const c = findCuriosity(f.curiosityId ?? '');
      if (c) {
        if (res.newCuriosity) this.announce(`${c.name}. ${c.description}`, c.rarity);
        else this.pushToast(`${c.name} again.`, 'discovery', 'normal');
        this.flourish(f.x, f.y, c.rarity, !!res.newCuriosity);
      }
    } else if (f.defId && f.variantId) {
      const r = specimenRarity(f.defId, f.variantId);
      const name = fullName(f.defId, f.variantId);
      if (res.newSpecies) this.announce(`New discovery: ${name}.`, r);
      else if (res.newVariant) this.announce(`New variant: ${name}.`, r);
      else this.pushToast(`Took a cutting of ${specimenName(f.defId, f.variantId)}.`, 'info');
      this.flourish(f.x, f.y, r, !!(res.newSpecies || res.newVariant));
    }
    this.onStateTouched?.();
  }

  /** A discovery toast, with a quiet aside when it's a rare one. Rare finds are moments. */
  private announce(text: string, rarity: Rarity) {
    const aside = discoveryAside(rarity);
    this.pushToast(aside ? `${text} ${aside}` : text, 'discovery', rarityRank(rarity) >= 2 ? 'major' : 'important');
  }

  /** Somewhere far off and overgrown for the fox to run to, or null. */
  private pickTrailDestination(rand: () => number): { x: number; y: number } | null {
    const p = this.state.player;
    let best: { x: number; y: number } | null = null;
    let bestScore = -Infinity;
    for (let i = 0; i < 40; i++) {
      const a = rand() * Math.PI * 2;
      const r = 16 + rand() * 16;
      const x = p.x + Math.cos(a) * r;
      const y = p.y + Math.sin(a) * r;
      const tx = Math.floor(x);
      const ty = Math.floor(y);
      if (!this.isOpenGround(tx, ty)) continue;
      const zone = zoneAt(tx, ty);
      if (zone === 'greenhouse') continue;
      if (onPath(this.state, x, y, this.state.clock.totalMinutes)) continue;
      // It likes the thick of things: old woods, the overgrown clearing, your own jungles.
      const wild = zone === 'overgrownClearing' || zone === 'woodland' || zone === 'dampForest' ? 1.5 : 0;
      const lush = this.lush.lush[ty * 90 + tx] ?? 0;
      const score = wild + lush * 1.5 + rand();
      if (score > bestScore) {
        bestScore = score;
        best = { x: tx + 0.5, y: ty + 0.5 };
      }
    }
    return best;
  }

  /** Scout and the cat's game of chase, while Ellen is in the greenhouse with them. */
  private play: PlayState | null = null;

  /** Open indoor floor: somewhere for a playing animal to run to. */
  private isOpenIndoors = (x: number, y: number) => !isBlockedIndoor(x, y, this.indoorSolid) && !isBlockedIndoor(x + 0.3, y, this.indoorSolid) && !isBlockedIndoor(x - 0.3, y, this.indoorSolid);

  /** How far a living-room piece has been moved, for the cat's and Scott's spots on it. */
  private fixtureOffset = (id: string) => fixtureOffset(this.state, id);

  /** Plants and trays around the house, for the cat to take an interest in. */
  private computeCatInterests(): CatInterest[] {
    const out: CatInterest[] = [];
    for (const p of Object.values(this.state.plants)) {
      if (p.location.kind === 'wild') continue;
      const pieceId = p.location.kind === 'nursery' ? p.location.bedId : p.location.slotId;
      const piece = findFurniture(this.state, pieceId);
      if (!piece || FURNITURE_DEFS[piece.kind].layer === 'overhead') continue;
      out.push({ x: piece.x + 0.5, y: piece.y + 0.5, big: stageIndexOf(p.growth) >= 3 });
    }
    for (const n of nurserySpots(this.state)) {
      if (!occupantOf(this.state, { bedId: n.id })) out.push({ x: n.x + 0.5, y: n.y + 0.5, big: false, emptyTray: true });
    }
    return out;
  }

  /** How easily Ellen moves over the ground she's on. */
  private groundSpeed(): number {
    const p = this.state.player;
    if (p.inGreenhouse) return 1;
    if (this.state.paths.length && onPath(this.state, p.x, p.y, this.state.clock.totalMinutes)) return PATH_SPEED;
    const lush = this.lush.lush[Math.floor(p.y) * 90 + Math.floor(p.x)] ?? 0;
    return 1 - Math.min(MAX_THICKET_SLOW, Math.max(0, lush - 0.25) * 0.35);
  }

  // ---- Pointer: the finger as gardening tool ----

  /** The camera the current scene is drawn with. */
  sceneCamera(): CameraClass {
    if (!this.state.player.inGreenhouse) return this.camera;
    // A panned view belongs to arranging only; normal play always frames Ellen.
    const f = this.tools.mode.kind === 'arrange' && this.indoorFocus ? this.indoorFocus : this.state.player;
    return makeIndoorCamera(this.camera, f.x, f.y);
  }

  private viewCentre(): { x: number; y: number } {
    const cam = this.sceneCamera();
    return screenToTiles(cam, cam.viewW / 2, cam.viewH / 2);
  }

  private toWorld(sx: number, sy: number) {
    return screenToTiles(this.sceneCamera(), sx, sy);
  }

  private bindPointer() {
    const c = this.canvas;
    c.style.touchAction = 'none';
    c.addEventListener('pointerdown', this.onPointerDown);
    c.addEventListener('pointermove', this.onPointerMove);
    c.addEventListener('pointerup', this.onPointerUp);
    c.addEventListener('pointercancel', this.onPointerCancel);
  }

  /** On touch, the plant preview floats a little above the fingertip so it isn't hidden under it. */
  private toolPoint(e: PointerEvent, touch: boolean) {
    const w = this.toWorld(e.clientX, e.clientY);
    if (touch && this.tools.mode.kind === 'plant') w.y -= 0.9;
    return w;
  }

  private onPointerDown = (e: PointerEvent) => {
    if (this.press) return;
    this.audio.init();
    const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
    const base = { id: e.pointerId, sx: e.clientX, sy: e.clientY, lastSX: e.clientX, lastSY: e.clientY, moved: false, touch };
    if (this.tools.active) {
      const w = this.toolPoint(e, touch);
      const r = this.tools.pointerDown(w.x, w.y);
      this.press = { ...base, kind: r === 'pan' ? 'pan' : 'tool' };
    } else {
      this.press = { ...base, kind: 'tap' };
    }
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic events in tests can't be captured; harmless.
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    const pr = this.press;
    if (!pr || pr.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - pr.sx, e.clientY - pr.sy) > 8) pr.moved = true;
    if (pr.kind === 'tool') {
      const w = this.toolPoint(e, pr.touch);
      this.tools.pointerMove(w.x, w.y);
    } else if (pr.kind === 'pan' && this.state.player.inGreenhouse && this.indoorFocus) {
      const cam = this.sceneCamera();
      const k = cam.zoom * 32;
      this.indoorFocus = { x: this.indoorFocus.x - (e.clientX - pr.lastSX) / k, y: this.indoorFocus.y - (e.clientY - pr.lastSY) / k };
      // Keep the focus inside the rooms so panning back is immediate.
      const c2 = makeIndoorCamera(this.camera, this.indoorFocus.x, this.indoorFocus.y);
      this.indoorFocus = { x: c2.x / 32, y: c2.y / 32 };
    }
    pr.lastSX = e.clientX;
    pr.lastSY = e.clientY;
  };

  private onPointerUp = (e: PointerEvent) => {
    const pr = this.press;
    if (!pr || pr.id !== e.pointerId) return;
    this.press = null;
    if (pr.kind === 'tool') {
      const w = this.toolPoint(e, pr.touch);
      this.applyToolOutcome(this.tools.pointerUp(w.x, w.y));
      if (this.state.player.inGreenhouse) this.refreshIndoor();
    } else if (pr.kind === 'pan') {
      this.tools.pointerUp(NaN, NaN);
    } else if (!pr.moved) {
      this.tapWorld(e.clientX, e.clientY);
    }
  };

  private onPointerCancel = (e: PointerEvent) => {
    if (this.press?.id !== e.pointerId) return;
    const kind = this.press.kind;
    this.press = null;
    if (kind === 'tool') this.tools.pointerUp(NaN, NaN);
  };

  private onToolKey = (e: KeyboardEvent) => {
    if (!this.tools.active) return;
    if (e.key === 'Escape') this.cancelTool();
    else if (e.key === 'Enter' && this.tools.canConfirm()) this.confirmTool();
    else if ((e.key === 'r' || e.key === 'R') && this.tools.mode.kind === 'arrange') this.tools.rotateSelected();
  };

  /** A tap on the world: look at the plant, bed or path under the finger. */
  tapWorld(sx: number, sy: number) {
    const w = this.toWorld(sx, sy);
    const p = this.state.player;
    if (p.inGreenhouse) {
      // Tapping a pot or tray opens it, same as walking up to it.
      const probe = new ToolController({ state: this.state, world: this.world, now: () => 0, player: () => p });
      const id = probe.pieceAt(w.x, w.y);
      if (!id) return;
      const piece = findFurniture(this.state, id);
      if (!piece) return;
      const role = FURNITURE_DEFS[piece.kind].role;
      if (role === 'nursery') this.onOpenGreenhouse?.({ kind: 'bed', id });
      else if (role === 'display') this.onOpenGreenhouse?.({ kind: 'display', id });
      return;
    }
    if (Math.hypot(w.x - p.x, w.y - p.y) > TAP_REACH) return;
    // Plants are drawn above their base, so tapping the leaves counts.
    let best: string | null = null;
    let bestD = Infinity;
    wildGrid(this.state).query(w.x, w.y + 0.4, 2, (plant) => {
      if (plant.location.kind !== 'wild') return;
      const r = Math.max(0.45, currentRadius(plant) * 0.8);
      const d = Math.min(Math.hypot(w.x - plant.location.x, w.y - plant.location.y), Math.hypot(w.x - plant.location.x, w.y - (plant.location.y - 0.45)));
      if (d < r && d < bestD) {
        bestD = d;
        best = plant.id;
      }
    });
    if (best) return this.onOpenPlantCard?.(best);
    const path = pathAt(this.state, w.x, w.y);
    if (path) return this.onOpenGroundCard?.({ kind: 'path', id: path.id });
    const bed = bedAt(this.state, w.x, w.y);
    if (bed) return this.onOpenGroundCard?.({ kind: 'bed', id: bed.id });
  }

  /** A hole in one on the living-room mat: the first on each hole is worth a few coins. */
  puttingAce(holeId: string): number {
    if (!recordAce(this.state.putting, holeId)) return 0;
    this.state.coins += ACE_REWARD;
    this.audio.playDiscoveryChime();
    this.onStateTouched?.();
    saveGame(this.state);
    return ACE_REWARD;
  }

  /** A full round of putt-putt finished; true if it's a new best. */
  finishPuttingRound(total: number): boolean {
    const best = recordRound(this.state.putting, total);
    if (best && this.state.putting.rounds > 1) this.audio.playToolChime();
    this.onStateTouched?.();
    saveGame(this.state);
    return best;
  }

  sell(uid: string) {
    const item = this.state.basket.find((i) => i.uid === uid);
    const price = sellItem(this.state, uid, this.state.clock.totalMinutes);
    if (price === null || !item) return;
    this.audio.playToolChime();
    this.pushToast(`Sold ${specimenName(item.defId, item.variantId)} for ${price} coins.`, 'coins');
    this.onStateTouched?.();
  }

  buy(itemId: string) {
    if (!buyItem(this.state, itemId)) return;
    const item = findShopItem(itemId)!;
    this.refreshIndoor();
    this.audio.playToolChime();
    this.pushToast(
      itemId === 'compostSack'
        ? `Bought a sack of compost: +${COMPOST_PER_SACK}. You have ${this.state.compost}.`
        : item.category === 'garden'
        ? `Bought ${item.name}. Place it outdoors from your basket.`
        : item.category === 'greenhouse'
          ? item.repeatable
            ? `Bought a ${item.name}. Set it down indoors: tap the arrange button at home.`
            : `${item.name} — done. Go and see.`
          : `Bought ${item.name}.`,
      'coins',
      item.category === 'greenhouse' && !item.repeatable ? 'important' : 'minor'
    );
    this.onStateTouched?.();
  }

  placeDecorHere(decorId: DecorId) {
    const p = this.state.player;
    if (p.inGreenhouse) return;
    const x = p.x;
    const y = p.y + 0.4;
    if (!this.isOpenGround(Math.floor(x), Math.floor(y))) return this.pushToast('Not enough room here.', 'info');
    if (placeDecor(this.state, decorId, x, y)) this.onStateTouched?.();
  }

  /** Where a piece set down "in front of Ellen" would go. */
  furnitureTile(): { x: number; y: number } {
    const p = this.state.player;
    const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[p.facing];
    return { x: Math.round((p.x - 0.5 + dx) * 8) / 8, y: Math.round((p.y - 0.5 + dy) * 8) / 8 };
  }

  furnitureBlock(kind: FurnitureId) {
    if (!this.state.player.inGreenhouse) return 'outdoors' as const;
    const { x, y } = this.furnitureTile();
    return placeBlockReason(this.state, kind, x, y, { avoid: [this.state.player] });
  }

  placeFurnitureHere(kind: FurnitureId) {
    if (!this.state.player.inGreenhouse) return;
    const { x, y } = this.furnitureTile();
    const block = placeBlockReason(this.state, kind, x, y, { avoid: [this.state.player] });
    if (block === 'wall' || block === 'occupied') return this.pushToast('No room there. Face an open patch of floor.', 'info');
    if (block === 'doorway') return this.pushToast('Keep the doorway clear.', 'info');
    if (!placeFurniture(this.state, kind, x, y, { avoid: [this.state.player] })) return;
    this.refreshIndoor();
    this.onStateTouched?.();
  }

  pickUpFurniture(id: string) {
    if (!pickUpFurniture(this.state, id)) return;
    this.refreshIndoor();
    this.onStateTouched?.();
  }

  nearbyDecor() {
    return this.state.player.inGreenhouse ? null : nearestDecor(this.state, this.state.player.x, this.state.player.y + 0.4, 1.2);
  }

  pickUpNearbyDecor() {
    const d = this.nearbyDecor();
    if (d && pickUpDecor(this.state, d.id)) this.onStateTouched?.();
  }

  /** The outdoor zone Ellen is standing in, or null while she's indoors. */
  currentOutdoorZone(): ZoneId | null {
    if (this.state.player.inGreenhouse) return null;
    return zoneAt(Math.floor(this.state.player.x), Math.floor(this.state.player.y));
  }

  isEstablished(defId: string) {
    return isEstablished(this.state, defId);
  }

  resetToNewGame() {
    this.state = resetGame();
    this.spreadCarry = 0;
    this.tools.cancel();
    this.tools = new ToolController({
      state: this.state,
      world: this.world,
      now: () => this.state.clock.totalMinutes,
      player: () => ({ x: this.state.player.x, y: this.state.player.y }),
    });
    this.tools.onChange = () => {
      if (this.tools.mode.kind !== 'arrange') this.indoorFocus = null;
      this.onToolsChanged?.();
    };
    this.refreshCleared();
    this.refreshIndoor();
    this.lush = computeLushness(this.state);
    saveGame(this.state);
    this.onStateTouched?.();
  }

  private render(now: number) {
    this.camera.follow(this.state.player.x, this.state.player.y);
    const crouching = this.state.clock.totalMinutes < this.actionAnimUntil;
    const scene = { tools: this.tools.mode, flourishes: this.flourishes, cleared: this.cleared, fade: Math.max(0, 1 - (now - this.fadeFrom) / FADE_MS) };
    if (this.state.player.inGreenhouse) {
      this.renderer.renderIndoor(this.sceneCamera(), this.state, now, crouching, scene);
    } else {
      this.renderer.renderOutdoor(this.camera, this.state, this.obstacles, now, crouching, this.lush, scene);
    }
  }

  /** Which room Ellen is in, for the HUD. */
  currentRoom(): 'living' | 'greenhouse' | null {
    return this.state.player.inGreenhouse ? roomAt(this.state.player.x) : null;
  }
}

function stageName(plant: OwnedPlant) {
  return (['cutting', 'young', 'established', 'large', 'specimen'] as const)[stageIndexOf(plant.growth)];
}
