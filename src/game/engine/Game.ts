import type { GameState, OwnedPlant } from '../state';
import { makeUid } from '../state';
import { loadOrCreate, saveGame, resetGame } from './SaveManager';
import { advanceClock } from './Clock';
import { Camera } from './Camera';
import { Input } from './Input';
import { AudioManager } from './AudioManager';
import { Renderer } from '../world/Renderer';
import { generateObstacles, buildBlockingSet, type Obstacle } from '../world/Obstacles';
import { isBlockedOutdoor, isBlockedIndoor, indoorBlockingSet } from '../world/Collision';
import { tryMove } from '../world/Movement';
import { GREENHOUSE_DOOR, MARKET_STALL, zoneAt, rectContains, GREENHOUSE_FOOTPRINT } from '../data/worldMap';
import { GREENHOUSE_EXIT, NURSERY_BEDS } from '../data/stations';
import { displaySlots, placeFurniture, placeBlockReason, pickUpFurniture } from '../systems/furniture';
import { DISCOVERY_SPOTS } from '../data/discoveryPoints';
import { TOOL_PICKUPS } from '../data/toolPickups';
import { PLANTS, specimenName, specimenRarity, rarityRank, RARITY_LABEL, fullName } from '../data/plants';
import { findShopItem, type DecorId, type FurnitureId } from '../data/shop';
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

export type InteractableKind = 'spot' | 'wildPlant' | 'market' | 'lantern' | 'greenhouseDoor' | 'greenhouseExit' | 'bed' | 'display';

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
  kind: 'info' | 'discovery' | 'growth' | 'hint' | 'coins';
}

const AUTOSAVE_MS = 8000;
const MOVE_SPEED = 3.4; // tiles per second
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
  indoorSolid: Set<string>;
  nearest: Interactable | null = null;
  lush: LushField;
  onToast: ((t: ToastEvent) => void) | null = null;
  onStateTouched: (() => void) | null = null;
  onOpenGreenhouse: ((target: { kind: 'bed' | 'display'; id: string }) => void) | null = null;
  onOpenMarket: (() => void) | null = null;
  onFrame: (() => void) | null = null;
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
    this.blockingSet = buildBlockingSet(this.obstacles);
    this.indoorSolid = indoorBlockingSet(this.state);
    this.lush = computeLushness(this.state);

    this.input.onInteract(() => this.interactWithNearest());
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

  stop() {
    cancelAnimationFrame(this.rafId);
    this.input.destroy();
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('visibilitychange', this.saveWhenHidden);
    window.removeEventListener('pagehide', this.saveNow);
  }

  private pushToast(text: string, kind: ToastEvent['kind'] = 'info') {
    this.onToast?.({ id: makeUid('toast'), text, kind });
  }

  /** One-time guidance, shown the first time it's relevant and never again. */
  hint(id: string, text: string): boolean {
    if (this.state.hints.includes(id)) return false;
    this.state.hints.push(id);
    this.pushToast(text, 'hint');
    return true;
  }

  /** Open outdoor ground: no tree/rock, not the house, stall or a wild patch. */
  isOpenGround = (tx: number, ty: number): boolean => {
    if (this.blockingSet.has(`${tx},${ty}`)) return false;
    if (rectContains(GREENHOUSE_FOOTPRINT, tx, ty) || rectContains(MARKET_STALL, tx, ty)) return false;
    if (tx === GREENHOUSE_DOOR.x && (ty === GREENHOUSE_DOOR.y || ty === GREENHOUSE_DOOR.y + 1)) return false;
    return !DISCOVERY_SPOTS.some((s) => s.x === tx && s.y === ty);
  };

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
          `${def.name} is established! Lift one into your basket, then give it a pot in the greenhouse gallery — or plant it out in the wild, where it will grow and spread on its own.`
        );
        if (!first) this.pushToast(`${def.name} is now established — you know it well enough to display it or plant it out.`, 'discovery');
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
        this.pushToast(`Your ${name} in ${zoneLabel(plant.location.zone)} is a magnificent specimen now.`, 'growth');
      }
    }

    const sports = result.spreads.filter((s) => this.state.plants[s.childId]?.unnoticed);
    if (!offline) {
      if (result.spreads.length > 0) {
        const child = this.state.plants[result.spreads[0].childId];
        if (child?.location.kind === 'wild') {
          this.hint('spread', `A ${PLANTS[child.defId].name} seedling has come up by itself in ${zoneLabel(child.location.zone)}. Your plants are spreading.`);
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
      this.pushToast(`Welcome back — ${spanText(elapsed)} passed${body}.`, 'info');
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
      const dx = move.x * MOVE_SPEED * dtSeconds;
      const dy = move.y * MOVE_SPEED * dtSeconds;
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
      });
      if (foxResult.revealedDiscoveryId) {
        this.pushToast('The fox lingers here, watching something growing in the shadows.', 'discovery');
        this.audio.playToolChime();
      }
      this.audio.setZone(zone, this.state.weather.condition === 'rain', dtSeconds);
    } else {
      this.audio.setZone('greenhouse', false, dtSeconds);
    }

    tickScout(this.state.scout, {
      playerX: this.state.player.x,
      playerY: this.state.player.y,
      playerFacing: this.state.player.facing,
      playerMoving: move.x !== 0 || move.y !== 0,
      dtSeconds,
      now: this.state.clock.totalMinutes,
      nearbyUndiscovered: this.state.player.inGreenhouse ? null : this.findNearbyUnseen(),
      rand: Math.random,
    });
    tickScott(this.state.scott, { dtSeconds, now: this.state.clock.totalMinutes, rand: Math.random });
    tickCat(this.state.cat, { dtSeconds, now: this.state.clock.totalMinutes, rand: Math.random });

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
      const rarity = RARITY_LABEL[specimenRarity(plant.defId, plant.variantId)];
      this.audio.playDiscoveryChime();
      this.pushToast(
        found.newVariant || found.newSpecies
          ? `New variant: ${fullName(plant.defId, plant.variantId)} (${rarity}) — it sprouted by itself among your plants!`
          : `A ${specimenName(plant.defId, plant.variantId)} has come up among your plants.`,
        'discovery'
      );
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
    if (!p.inGreenhouse) {
      if (Math.floor(p.x) === GREENHOUSE_DOOR.x && Math.floor(p.y) === GREENHOUSE_DOOR.y) this.enterGreenhouse();
    } else if (Math.floor(p.x) === GREENHOUSE_EXIT.x && Math.floor(p.y) >= GREENHOUSE_EXIT.y) {
      this.exitGreenhouse();
    }
  }

  private enterGreenhouse() {
    const p = this.state.player;
    p.inGreenhouse = true;
    p.x = GREENHOUSE_EXIT.x + 0.5;
    p.y = GREENHOUSE_EXIT.y - 1.5;
    p.facing = 'up';
    this.bringScoutAlong();
    if (this.state.basket.some((b) => b.growth === 0)) {
      this.hint('pot', 'Pot your cutting in one of the nursery beds on the left. It will root and grow on its own.');
    }
  }

  private exitGreenhouse() {
    const p = this.state.player;
    p.inGreenhouse = false;
    p.x = GREENHOUSE_DOOR.x + 0.5;
    p.y = GREENHOUSE_DOOR.y + 1.5;
    p.facing = 'down';
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
      const mx = MARKET_STALL.x + MARKET_STALL.w / 2;
      const my = MARKET_STALL.y + 1.1;
      consider({ kind: 'market', id: 'market', x: mx, y: my, label: 'Farmer’s Market', available: true }, mx, my, 1.6);
      if (Math.hypot(p.x - (GREENHOUSE_DOOR.x + 0.5), p.y - (GREENHOUSE_DOOR.y + 0.5)) < INTERACT_RANGE) {
        best = { kind: 'greenhouseDoor', id: 'door', x: GREENHOUSE_DOOR.x, y: GREENHOUSE_DOOR.y, label: 'Enter the Greenhouse', available: true };
      }
    } else {
      for (const bed of NURSERY_BEDS) {
        if (bed.requires && !this.state.owned.includes(bed.requires)) continue;
        const plant = occupantOf(this.state, { bedId: bed.id });
        const label = plant ? `${specimenName(plant.defId, plant.variantId)} — ${STAGE_LABEL[stageName(plant)]}` : 'Empty nursery bed';
        consider({ kind: 'bed', id: bed.id, x: bed.x, y: bed.y, label, available: true }, bed.x + 0.5, bed.y + 0.5);
      }
      for (const slot of displaySlots(this.state)) {
        const plant = occupantOf(this.state, { slotId: slot.id });
        const label = plant ? `${specimenName(plant.defId, plant.variantId)} — ${STAGE_LABEL[stageName(plant)]}` : 'Empty display spot';
        const cy = slot.kind === 'hanging' ? slot.y + 1.2 : slot.y + 0.5;
        consider({ kind: 'display', id: slot.id, x: slot.x, y: slot.y, label, available: true }, slot.x + 0.5, cy);
      }
      consider(
        { kind: 'greenhouseExit', id: 'exit', x: GREENHOUSE_EXIT.x, y: GREENHOUSE_EXIT.y, label: 'Step Outside', available: true },
        GREENHOUSE_EXIT.x + 0.5,
        GREENHOUSE_EXIT.y + 0.5
      );
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
        if (result.newSpecies) this.pushToast(`New discovery: ${name}.${rare}`, 'discovery');
        else if (result.newVariant) this.pushToast(`New variant: ${fullName(defId, variantId)}.${rare}`, 'discovery');
        else this.pushToast(`Took a cutting of ${name}.`, 'info');
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
    } else if (n.kind === 'greenhouseExit') {
      this.exitGreenhouse();
    } else if (n.kind === 'bed' || n.kind === 'display') {
      this.onOpenGreenhouse?.({ kind: n.kind, id: n.id });
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
      const rarity = RARITY_LABEL[specimenRarity(res.item.defId, res.item.variantId)];
      this.pushToast(`${res.newVariant ? 'New variant! ' : ''}This cutting came out different — a ${fullName(res.item.defId, res.item.variantId)} (${rarity}).`, 'discovery');
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
    this.indoorSolid = indoorBlockingSet(this.state);
    this.audio.playToolChime();
    this.pushToast(
      item.category === 'garden'
        ? `Bought ${item.name}. Place it outdoors from your basket.`
        : item.category === 'greenhouse'
          ? item.repeatable
            ? `Bought a ${item.name}. Set it down in the greenhouse from your basket.`
            : `${item.name} — done. Go and see.`
          : `Bought ${item.name}.`,
      'coins'
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

  /** The greenhouse tile just in front of Ellen, where furniture gets set down. */
  furnitureTile(): { x: number; y: number } {
    const p = this.state.player;
    const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[p.facing];
    return { x: Math.floor(p.x) + dx, y: Math.floor(p.y) + dy };
  }

  furnitureBlock(kind: FurnitureId) {
    if (!this.state.player.inGreenhouse) return 'outdoors' as const;
    const { x, y } = this.furnitureTile();
    return placeBlockReason(this.state, kind, x, y);
  }

  placeFurnitureHere(kind: FurnitureId) {
    if (!this.state.player.inGreenhouse) return;
    const { x, y } = this.furnitureTile();
    const block = placeBlockReason(this.state, kind, x, y);
    if (block === 'wall' || block === 'occupied') return this.pushToast('No room there. Face an open patch of floor.', 'info');
    if (block === 'doorway') return this.pushToast('Keep the doorway clear.', 'info');
    if (!placeFurniture(this.state, kind, x, y)) return;
    this.indoorSolid = indoorBlockingSet(this.state);
    this.onStateTouched?.();
  }

  pickUpFurniture(id: string) {
    if (!pickUpFurniture(this.state, id)) return;
    this.indoorSolid = indoorBlockingSet(this.state);
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
    this.indoorSolid = indoorBlockingSet(this.state);
    this.lush = computeLushness(this.state);
    saveGame(this.state);
    this.onStateTouched?.();
  }

  private render(now: number) {
    this.camera.follow(this.state.player.x, this.state.player.y);
    const crouching = this.state.clock.totalMinutes < this.actionAnimUntil;
    if (this.state.player.inGreenhouse) {
      this.renderer.renderIndoor(this.camera, this.state, now, crouching);
    } else {
      this.renderer.renderOutdoor(this.camera, this.state, this.obstacles, now, crouching, this.lush);
    }
  }
}

function stageName(plant: OwnedPlant) {
  return (['cutting', 'young', 'established', 'large', 'specimen'] as const)[stageIndexOf(plant.growth)];
}
