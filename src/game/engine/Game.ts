import type { GameState } from '../state';
import { makeUid } from '../state';
import { loadOrCreate, saveGame, resetGame } from './SaveManager';
import { advanceClock, isNight } from './Clock';
import { Camera } from './Camera';
import { Input } from './Input';
import { AudioManager } from './AudioManager';
import { Renderer } from '../world/Renderer';
import { generateObstacles, buildBlockingSet, type Obstacle } from '../world/Obstacles';
import { isBlockedOutdoor, isBlockedIndoor } from '../world/Collision';
import { tryMove } from '../world/Movement';
import { GREENHOUSE_DOOR, PLAYER_START, zoneAt, TILE_SIZE } from '../data/worldMap';
import { GREENHOUSE_EXIT, STATIONS } from '../data/stations';
import type { StationDef } from '../types';
import { DISCOVERY_POINTS } from '../data/discoveryPoints';
import { TOOL_PICKUPS } from '../data/toolPickups';
import { PLANTS } from '../data/plants';
import { FUNGI } from '../data/fungi';
import { MATERIALS } from '../data/materials';
import { TOOLS } from '../data/tools';
import { isDiscoveryAvailable, collectAt } from '../systems/collection';
import { tickEcosystem, initEcosystem, detectEcologicalAlerts, introduceSpecies } from '../systems/ecosystem';
import { tickPlantGrowth, plantSpecimen, rollTraits, DEFAULT_CONDITIONS, GROWTH_TIME_SCALE } from '../systems/plantGrowth';
import { tickFox } from '../systems/fox';
import { tickScout } from '../systems/scout';
import { tickScott } from '../systems/scott';
import { tickCat } from '../systems/cat';
import { recordCultivated, recordDeveloped, recordMastered, recordPropagated, recordVariant } from '../systems/journal';
import { tickObservation } from '../systems/observation';
import { meetsRequirement, unlockTool } from '../systems/tools';
import { addItem, inventoryFull, removeItem } from '../systems/inventory';
import { attemptPropagation } from '../systems/propagation';
import type { GrowConditions, GrowthStage, ZoneId } from '../types';
import { ZONES } from '../data/zones';

export type InteractableKind = 'discoveryPoint' | 'toolPickup' | 'station' | 'greenhouseDoor' | 'greenhouseExit';

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
  kind: 'info' | 'discovery' | 'growth';
}

const AUTOSAVE_MS = 8000;
const MOVE_SPEED = 3.4; // tiles per second
const INTERACT_RANGE = 1.3;

const STAGE_RANK: Record<GrowthStage, number> = { WILD: 0, CULTIVATED: 1, IMPROVED: 2, MATURE: 3, COMPLETE: 4 };

function welcomeBackMessage(gameMinutes: number, plantsThatGrew: number): string {
  const hours = gameMinutes / 60;
  const span = hours >= 36 ? `${Math.round(hours / 24)} days` : hours >= 20 ? 'about a day' : hours >= 1.5 ? `${Math.round(hours)} hours` : 'a little while';
  if (plantsThatGrew === 0) return `Welcome back — ${span} passed out here.`;
  const plants = plantsThatGrew === 1 ? 'one of your plants' : `${plantsThatGrew} of your plants`;
  return `Welcome back — ${span} passed, and ${plants} grew while you were away.`;
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
  nearest: Interactable | null = null;
  onToast: ((t: ToastEvent) => void) | null = null;
  onStateTouched: (() => void) | null = null;
  onOpenStation: ((stationId: string) => void) | null = null;
  onFrame: (() => void) | null = null;
  private lastFrame = performance.now();
  private autosaveAcc = 0;
  private alertAcc = 0;
  private observeAcc = 0;
  private seenAlertIds = new Set<string>();
  private ecosystemCarry = 0;
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
    if (Object.keys(this.state.ecosystem).length === 0) initEcosystem(this.state);
    this.seenAlertIds = new Set(this.state.toastSeen);
    this.obstacles = generateObstacles();
    this.blockingSet = buildBlockingSet(this.obstacles);

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

  private update(dtMs: number) {
    const dtSeconds = dtMs / 1000;
    // Wall-clock time, not the rAF timestamp: rAF time restarts near zero on
    // every page load, so it can't measure how long the player was away.
    const clockResult = advanceClock(this.state, Date.now());
    const elapsedMinutes = clockResult.elapsedMinutes;

    if (elapsedMinutes > 0) {
      this.ecosystemCarry = tickEcosystem(this.state, this.ecosystemCarry + elapsedMinutes);
      let plantsThatGrew = 0;
      for (const instance of Object.values(this.state.plantInstances)) {
        if (instance.harvested || instance.stage === 'COMPLETE') continue;
        const def = PLANTS[instance.defId];
        if (!def) continue;
        const result = tickPlantGrowth(def, instance, elapsedMinutes * GROWTH_TIME_SCALE);
        if (!result.stageAdvanced) continue;
        plantsThatGrew += 1;
        const now = this.state.clock.totalMinutes;
        if (STAGE_RANK[result.newStage] >= STAGE_RANK.IMPROVED) recordDeveloped(this.state, def.id, 'plant', now);
        if (result.completed) {
          recordMastered(this.state, def.id, 'plant', now);
          if (!clockResult.wasOffline) this.pushToast(`${def.name} has reached its full potential — COMPLETE.`, 'growth');
        } else if (!clockResult.wasOffline) {
          this.pushToast(`${def.name} is now ${result.newStage.toLowerCase()}.`, 'growth');
        }
      }
      if (clockResult.wasOffline) this.pushToast(welcomeBackMessage(elapsedMinutes, plantsThatGrew), 'info');
    }

    // Movement
    const move = this.input.getMoveVector();
    if (move.x !== 0 || move.y !== 0) {
      const dx = move.x * MOVE_SPEED * dtSeconds;
      const dy = move.y * MOVE_SPEED * dtSeconds;
      const blocked = this.state.player.inGreenhouse
        ? (x: number, y: number) => isBlockedIndoor(x, y)
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
      const zone = zoneAt(Math.floor(this.state.player.x), Math.floor(this.state.player.y));
      const foxResult = tickFox(this.state, {
        playerZone: zone,
        playerX: this.state.player.x,
        playerY: this.state.player.y,
        inGreenhouse: false,
        dtSeconds,
        now: this.state.clock.totalMinutes,
        discoveryPoints: DISCOVERY_POINTS,
        rand: Math.random,
      });
      if (foxResult.revealedDiscoveryId) {
        this.pushToast('The fox lingers here, watching something you can\'t quite see yet.', 'info');
        this.audio.playToolChime();
      }
      this.audio.setZone(zone, this.state.weather.condition === 'rain', dtSeconds);
      this.observeAcc += elapsedMinutes;
      if (this.observeAcc > 5) {
        this.observeAcc = 0;
        tickObservation(this.state, zone, this.state.clock.totalMinutes);
      }
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
      nearbyUndiscovered: this.state.player.inGreenhouse ? null : this.findNearbyUndiscovered(),
      rand: Math.random,
    });

    // Scott potters around on his own clock, entirely independent of where
    // Ellen and Scout are.
    tickScott(this.state.scott, { dtSeconds, now: this.state.clock.totalMinutes, rand: Math.random });

    // The cat never leaves the greenhouse, so she ticks regardless of zone —
    // she's simply not drawn while the player is outdoors.
    tickCat(this.state.cat, { dtSeconds, now: this.state.clock.totalMinutes, rand: Math.random });

    this.alertAcc += elapsedMinutes;
    if (this.alertAcc > 15) {
      this.alertAcc = 0;
      const alerts = detectEcologicalAlerts(this.state);
      for (const alert of alerts) {
        if (!this.seenAlertIds.has(alert.id)) {
          this.seenAlertIds.add(alert.id);
          this.state.toastSeen.push(alert.id);
          this.pushToast(alert.message, 'info');
        }
      }
    }

    this.autosaveAcc += dtMs;
    if (this.autosaveAcc > AUTOSAVE_MS) {
      this.autosaveAcc = 0;
      saveGame(this.state);
    }
  }

  private findNearbyUndiscovered(): { x: number; y: number } | null {
    const p = this.state.player;
    let best: { x: number; y: number } | null = null;
    let bestDist = 2.4;
    for (const dp of DISCOVERY_POINTS) {
      if (dp.foxLed && !this.state.discoveryPoints[dp.id]?.revealed) continue;
      const entry = this.state.journal[dp.specimenId];
      if (entry && entry.level !== 'UNDISCOVERED') continue;
      const d = Math.hypot(p.x - (dp.x + 0.5), p.y - (dp.y + 0.5));
      if (d < bestDist) {
        bestDist = d;
        best = { x: dp.x + 0.5, y: dp.y + 0.5 };
      }
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

    const consider = (i: Interactable, x: number, y: number) => {
      const d = Math.hypot(p.x - (x + 0.5), p.y - (y + 0.5));
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    };

    if (!p.inGreenhouse) {
      for (const dp of DISCOVERY_POINTS) {
        const available = isDiscoveryAvailable(this.state, dp);
        if (dp.foxLed && !this.state.discoveryPoints[dp.id]?.revealed) continue;
        const def = dp.specimenKind === 'plant' ? PLANTS[dp.specimenId] : dp.specimenKind === 'fungus' ? FUNGI[dp.specimenId] : MATERIALS[dp.specimenId];
        const known = this.state.journal[dp.specimenId]?.level && this.state.journal[dp.specimenId].level !== 'UNDISCOVERED';
        const label = available ? `Collect ${known ? def?.name ?? '???' : '???'}` : 'Not ready to collect yet';
        consider({ kind: 'discoveryPoint', id: dp.id, x: dp.x, y: dp.y, label, available }, dp.x, dp.y);
      }
      for (const tp of TOOL_PICKUPS) {
        if ((this.state.tools[tp.tool] ?? 0) >= tp.tier) continue;
        if (!meetsRequirement(this.state, tp.requiresToolTier)) continue;
        consider({ kind: 'toolPickup', id: tp.id, x: tp.x, y: tp.y, label: `Pick up ${TOOLS[tp.tool].tiers[tp.tier - 1].name}`, available: true }, tp.x, tp.y);
      }
      if (Math.hypot(p.x - (GREENHOUSE_DOOR.x + 0.5), p.y - (GREENHOUSE_DOOR.y + 0.5)) < INTERACT_RANGE) {
        best = { kind: 'greenhouseDoor', id: 'door', x: GREENHOUSE_DOOR.x, y: GREENHOUSE_DOOR.y, label: 'Enter the Greenhouse', available: true };
      }
    } else {
      for (const station of STATIONS) {
        consider({ kind: 'station', id: station.id, x: station.x, y: station.y, label: this.stationLabel(station), available: true }, station.x, station.y);
      }
      consider(
        { kind: 'greenhouseExit', id: 'exit', x: GREENHOUSE_EXIT.x, y: GREENHOUSE_EXIT.y, label: 'Step Outside', available: true },
        GREENHOUSE_EXIT.x,
        GREENHOUSE_EXIT.y
      );
    }

    this.nearest = best;
  }

  private stationLabel(station: StationDef): string {
    const occupied = this.state.stationOccupancy[station.id];
    if (station.kind === 'growBed') {
      if (!occupied) return 'Empty Growing Bed';
      const inst = this.state.plantInstances[occupied];
      const def = PLANTS[inst.defId];
      return `${def?.name ?? 'Plant'} — ${inst.stage}`;
    }
    const names: Record<string, string> = {
      propagationBench: 'Propagation Bench',
      seedStorage: 'Seed Storage',
      soilStation: 'Soil Station',
      compost: 'Compost Bin',
      research: 'Research Bench',
      display: 'Specimen Display',
    };
    return names[station.kind] ?? station.name;
  }

  interactWithNearest() {
    this.audio.init();
    const n = this.nearest;
    if (!n) return;
    if (n.kind === 'discoveryPoint') {
      const dp = DISCOVERY_POINTS.find((d) => d.id === n.id)!;
      const result = collectAt(this.state, dp);
      if (result.success) {
        this.actionAnimUntil = this.state.clock.totalMinutes + 1.4;
        this.audio.playDiscoveryChime();
        const def = dp.specimenKind === 'plant' ? PLANTS[dp.specimenId] : dp.specimenKind === 'fungus' ? FUNGI[dp.specimenId] : MATERIALS[dp.specimenId];
        const name = result.isNewIdentification || result.isNewDiscovery ? def?.name ?? 'something new' : def && 'name' in def ? def.name : 'a specimen';
        this.pushToast(result.isNewDiscovery ? `New discovery: ${name}` : `Collected ${name}`, result.isNewDiscovery ? 'discovery' : 'info');
      } else if (result.reason === 'inventory-full') {
        this.pushToast('Your basket is full.', 'info');
      }
    } else if (n.kind === 'toolPickup') {
      const tp = TOOL_PICKUPS.find((t) => t.id === n.id)!;
      unlockTool(this.state, tp.tool, tp.tier);
      this.audio.playToolChime();
      this.pushToast(`Found: ${TOOLS[tp.tool].tiers[tp.tier - 1].name}. ${tp.flavor}`, 'discovery');
    } else if (n.kind === 'greenhouseDoor') {
      this.enterGreenhouse();
    } else if (n.kind === 'greenhouseExit') {
      this.exitGreenhouse();
    } else if (n.kind === 'station') {
      this.onOpenStation?.(n.id);
    }
    this.onStateTouched?.();
  }

  // ---- Greenhouse actions invoked by UI ----

  plantAtStation(stationId: string, inventoryUid: string, conditions: GrowConditions = DEFAULT_CONDITIONS) {
    const item = this.state.inventory.find((i) => i.uid === inventoryUid);
    if (!item || item.kind !== 'plant' || !item.traits) return;
    if (this.state.stationOccupancy[stationId]) return;
    plantSpecimen(this.state, item.defId, item.traits, stationId, this.state.clock.totalMinutes, conditions);
    removeItem(this.state, inventoryUid);
    recordCultivated(this.state, item.defId, 'plant', this.state.clock.totalMinutes);
    this.pushToast(`Planted ${PLANTS[item.defId]?.name}.`, 'growth');
    this.onStateTouched?.();
  }

  setStationConditions(stationId: string, conditions: GrowConditions) {
    const instId = this.state.stationOccupancy[stationId];
    if (!instId) return;
    const inst = this.state.plantInstances[instId];
    inst.conditions = conditions;
    this.onStateTouched?.();
  }

  harvestStation(stationId: string) {
    const instId = this.state.stationOccupancy[stationId];
    if (!instId) return;
    const inst = this.state.plantInstances[instId];
    if (inst.stage !== 'COMPLETE') return;
    inst.harvested = true;
    this.state.stationOccupancy[stationId] = null;
    this.pushToast(`${PLANTS[inst.defId]?.name} moved to your collection.`, 'info');
    this.onStateTouched?.();
  }

  /** The outdoor zone Ellen is standing in, or null while she's indoors. */
  currentOutdoorZone(): ZoneId | null {
    if (this.state.player.inGreenhouse) return null;
    return zoneAt(Math.floor(this.state.player.x), Math.floor(this.state.player.y));
  }

  hasIntroduced(defId: string, zone: ZoneId): boolean {
    return this.state.wildIntroductions.some((w) => w.defId === defId && w.zone === zone);
  }

  introduceToWild(inventoryUidOrInstanceId: string, fromPlantInstance: boolean) {
    const zone = this.currentOutdoorZone();
    if (!zone) return;
    let defId: string | null = null;
    if (fromPlantInstance) {
      const inst = this.state.plantInstances[inventoryUidOrInstanceId];
      if (!inst || inst.stage !== 'COMPLETE') return;
      defId = inst.defId;
    } else {
      const item = this.state.inventory.find((i) => i.uid === inventoryUidOrInstanceId);
      if (!item) return;
      defId = item.defId;
    }
    const name = PLANTS[defId]?.name ?? defId;
    if (this.hasIntroduced(defId, zone)) {
      this.pushToast(`${name} already grows wild in ${ZONES[zone].name}.`, 'info');
      return;
    }
    if (!fromPlantInstance) removeItem(this.state, inventoryUidOrInstanceId);
    introduceSpecies(this.state, defId, zone, 18, this.state.clock.totalMinutes);
    this.pushToast(`Introduced ${name} to ${ZONES[zone].name}. The ecosystem will respond in time.`, 'info');
    this.onStateTouched?.();
  }

  propagateAtBench(instanceIdA: string, instanceIdB: string) {
    const a = this.state.plantInstances[instanceIdA];
    const b = this.state.plantInstances[instanceIdB];
    if (!a || !b) return;
    const defA = PLANTS[a.defId];
    const defB = PLANTS[b.defId];
    if (!defA || !defB) return;
    const result = attemptPropagation({ instance: a, def: defA }, { instance: b, def: defB }, (id) => PLANTS[id]);
    if (result.success && result.resultDefId && result.traits) {
      const added = addItem(this.state, result.resultDefId, 'plant', this.state.clock.totalMinutes, { traits: result.traits });
      if (added) {
        recordPropagated(this.state, a.defId, 'plant', this.state.clock.totalMinutes);
        recordPropagated(this.state, b.defId, 'plant', this.state.clock.totalMinutes);
        if (result.isVariant) recordVariant(this.state, result.resultDefId, 'plant', this.state.clock.totalMinutes);
        this.pushToast(result.message, result.isKnownRecipe || result.isVariant ? 'discovery' : 'growth');
        this.audio.playDiscoveryChime();
      } else {
        this.pushToast('Your basket is full — make room before propagating.', 'info');
      }
    } else {
      this.pushToast(result.message, 'info');
    }
    this.onStateTouched?.();
  }

  resetToNewGame() {
    this.state = resetGame();
    initEcosystem(this.state);
    this.seenAlertIds.clear();
    this.ecosystemCarry = 0;
    saveGame(this.state);
    this.onStateTouched?.();
  }

  private render(now: number) {
    this.camera.follow(this.state.player.x, this.state.player.y);
    const crouching = this.state.clock.totalMinutes < this.actionAnimUntil;
    if (this.state.player.inGreenhouse) {
      this.renderer.renderIndoor(this.camera, this.state, now, crouching);
    } else {
      this.renderer.renderOutdoor(this.camera, this.state, this.obstacles, now, crouching);
    }
  }
}
