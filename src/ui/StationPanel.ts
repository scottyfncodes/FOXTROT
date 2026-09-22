import type { Game } from '../game/engine/Game';
import { Panel } from './Panel';
import { el } from './dom';
import { PLANTS } from '../game/data/plants';
import { STATIONS } from '../game/data/stations';
import { stageProgress01 } from '../game/systems/plantGrowth';
import { BASKET_RECIPES, canCraftBasketUpgrade } from '../game/systems/tools';
import { consumeMaterials } from '../game/systems/inventory';
import { unlockTool } from '../game/systems/tools';
import type { GrowConditions, SoilType, WaterPref, LightPref, TempPref, NutrientPref } from '../game/types';
import { MATERIALS } from '../game/data/materials';

const SOIL_OPTS: SoilType[] = ['sandy', 'loam', 'clay', 'peaty'];
const WATER_OPTS: WaterPref[] = ['dry', 'moist', 'wet'];
const LIGHT_OPTS: LightPref[] = ['fullSun', 'partialShade', 'fullShade'];
const TEMP_OPTS: TempPref[] = ['cool', 'temperate', 'warm'];
const NUTRIENT_OPTS: NutrientPref[] = ['lean', 'moderate', 'rich'];

function prettify(s: string): string {
  return s.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

export class StationPanel {
  panel = new Panel('Station');
  private propagateSelection: string[] = [];

  constructor(private game: Game) {}

  open(stationId: string) {
    this.propagateSelection = [];
    this.render(stationId);
    this.panel.open();
  }

  private render(stationId: string) {
    const state = this.game.state;
    const station = STATIONS.find((s) => s.id === stationId);
    if (!station) return;
    this.panel.setTitle(station.name);
    this.panel.clearBody();

    if (station.kind === 'growBed') this.renderGrowBed(station.id);
    else if (station.kind === 'propagationBench') this.renderPropagation();
    else if (station.kind === 'soilStation') this.renderCrafting();
    else if (station.kind === 'seedStorage') this.renderSeedStorage();
    else if (station.kind === 'display') this.renderDisplay();
    else if (station.kind === 'compost') {
      this.panel.body.appendChild(el('p', undefined, 'A slow, warm smell of old leaves and soil. Nothing needs composting right now.'));
    } else if (station.kind === 'research') {
      this.panel.body.appendChild(el('p', undefined, 'Notes, sketches, half-finished diagrams. Everything you\'ve learned lives in the Field Journal.'));
    }
  }

  private renderGrowBed(stationId: string) {
    const state = this.game.state;
    const instId = state.stationOccupancy[stationId];
    if (!instId) {
      const plantItems = state.inventory.filter((i) => i.kind === 'plant' && i.traits);
      if (plantItems.length === 0) {
        this.panel.body.appendChild(el('div', 'empty-state', 'Nothing in your basket to plant yet.'));
        return;
      }
      this.panel.body.appendChild(el('h4', undefined, 'Plant a Specimen'));
      const grid = el('div', 'station-choice-grid');
      let selected: string | null = null;
      for (const item of plantItems) {
        const def = PLANTS[item.defId];
        const card = el('div', 'choice-card', def?.name ?? item.defId);
        card.addEventListener('click', () => {
          selected = item.uid;
          for (const c of Array.from(grid.children)) c.classList.remove('selected');
          card.classList.add('selected');
          plantBtn.disabled = false;
        });
        grid.appendChild(card);
      }
      this.panel.body.appendChild(grid);

      const conditions: GrowConditions = { soil: 'loam', water: 'moist', light: 'partialShade', temp: 'temperate', nutrients: 'moderate' };
      this.panel.body.appendChild(this.buildConditionPicker(conditions));

      const plantBtn = el('button', 'primary-btn', 'Plant');
      plantBtn.disabled = true;
      plantBtn.style.marginTop = '14px';
      plantBtn.addEventListener('click', () => {
        if (!selected) return;
        this.game.plantAtStation(stationId, selected, conditions);
        this.render(stationId);
      });
      this.panel.body.appendChild(plantBtn);
      return;
    }

    const inst = state.plantInstances[instId];
    const def = PLANTS[inst.defId];
    const wrap = el('div');
    wrap.appendChild(el('h3', undefined, def?.name ?? inst.defId));
    const track = el('div', 'growth-stage-track');
    const stages = ['CULTIVATED', 'IMPROVED', 'MATURE', 'COMPLETE'];
    const currentIdx = stages.indexOf(inst.stage);
    stages.forEach((_, i) => {
      const dot = el('div', `growth-stage-dot${i <= currentIdx ? ' filled' : ''}`);
      track.appendChild(dot);
    });
    wrap.appendChild(track);
    wrap.appendChild(
      el(
        'p',
        undefined,
        inst.stage === 'COMPLETE'
          ? `Complete. Quality ${inst.qualityEstimate}.`
          : `${prettify(inst.stage)} — ${Math.round(stageProgress01(def!, inst) * 100)}% to ${stages[currentIdx + 1] ?? 'complete'}.${inst.dormant ? ' Conditions are mismatched; growth has nearly stalled, but nothing is at risk.' : ''}`
      )
    ).style.cssText = 'font-size:13px;color:var(--ink-dim);';

    wrap.appendChild(this.buildConditionPicker(inst.conditions, (next) => this.game.setStationConditions(stationId, next)));

    if (inst.stage === 'COMPLETE') {
      const harvestBtn = el('button', 'primary-btn', 'Move to Collection (free this bed)');
      harvestBtn.addEventListener('click', () => {
        this.game.harvestStation(stationId);
        this.render(stationId);
      });
      wrap.appendChild(harvestBtn);
      const introBtn = el('button', 'secondary-btn', 'Introduce to the Wild');
      introBtn.style.marginTop = '8px';
      introBtn.style.width = '100%';
      introBtn.disabled = true;
      introBtn.title = 'Step outside first.';
      wrap.appendChild(introBtn);
    }

    this.panel.body.appendChild(wrap);
  }

  private buildConditionPicker(conditions: GrowConditions, onChange?: (c: GrowConditions) => void): HTMLElement {
    const wrap = el('div');
    const build = (label: string, key: keyof GrowConditions, opts: string[]) => {
      wrap.appendChild(el('div', undefined, label)).style.cssText = 'font-size:12px;color:var(--ink-dim);margin:8px 0 4px;';
      const row = el('div', 'condition-row');
      for (const opt of opts) {
        const btn = el('button', `pill-btn${conditions[key] === opt ? ' active' : ''}`, prettify(opt));
        btn.addEventListener('click', () => {
          (conditions as unknown as Record<string, string>)[key] = opt;
          for (const c of Array.from(row.children)) c.classList.remove('active');
          btn.classList.add('active');
          onChange?.(conditions);
        });
        row.appendChild(btn);
      }
      wrap.appendChild(row);
    };
    build('Soil', 'soil', SOIL_OPTS);
    build('Water', 'water', WATER_OPTS);
    build('Light', 'light', LIGHT_OPTS);
    build('Temperature', 'temp', TEMP_OPTS);
    build('Nutrients', 'nutrients', NUTRIENT_OPTS);
    return wrap;
  }

  private renderPropagation() {
    const state = this.game.state;
    const completed = Object.values(state.plantInstances).filter((p) => p.stage === 'COMPLETE');
    if (completed.length < 2) {
      this.panel.body.appendChild(el('div', 'empty-state', 'Bring two COMPLETE specimens here to try combining them.'));
      return;
    }
    this.panel.body.appendChild(el('p', undefined, 'Choose two completed specimens to combine.')).style.cssText =
      'font-size:13px;color:var(--ink-dim);';
    const grid = el('div', 'station-choice-grid');
    for (const inst of completed) {
      const def = PLANTS[inst.defId];
      const card = el('div', 'choice-card', `${def?.name ?? inst.defId}\nQ${inst.qualityEstimate}`);
      card.style.whiteSpace = 'pre-line';
      card.addEventListener('click', () => {
        const idx = this.propagateSelection.indexOf(inst.id);
        if (idx >= 0) {
          this.propagateSelection.splice(idx, 1);
          card.classList.remove('selected');
        } else if (this.propagateSelection.length < 2) {
          this.propagateSelection.push(inst.id);
          card.classList.add('selected');
        }
        goBtn.disabled = this.propagateSelection.length !== 2;
      });
      grid.appendChild(card);
    }
    this.panel.body.appendChild(grid);
    const goBtn = el('button', 'primary-btn', 'Propagate');
    goBtn.style.marginTop = '14px';
    goBtn.disabled = true;
    goBtn.addEventListener('click', () => {
      const [a, b] = this.propagateSelection;
      this.game.propagateAtBench(a, b);
      this.propagateSelection = [];
      this.render('propagationBench');
    });
    this.panel.body.appendChild(goBtn);
  }

  private renderCrafting() {
    const state = this.game.state;
    this.panel.body.appendChild(el('p', undefined, 'Prepare soil, or work materials into a larger field basket.')).style.cssText =
      'font-size:13px;color:var(--ink-dim);';
    for (const recipe of BASKET_RECIPES) {
      const can = canCraftBasketUpgrade(state, recipe);
      const row = el('div', 'entry-row');
      const info = el('div', 'entry-info');
      const need = Object.entries(recipe.materials)
        .map(([id, n]) => `${n}x ${MATERIALS[id]?.name ?? id}`)
        .join(', ');
      info.append(el('div', 'entry-name', `Basket Tier ${recipe.tier}`), el('div', 'entry-sub', need));
      row.appendChild(info);
      const btn = el('button', 'secondary-btn', 'Craft');
      btn.disabled = !can;
      btn.addEventListener('click', () => {
        if (consumeMaterials(state, recipe.materials)) {
          unlockTool(state, 'basket', recipe.tier);
          this.render('soilStation');
        }
      });
      row.appendChild(btn);
      this.panel.body.appendChild(row);
    }
  }

  private renderSeedStorage() {
    const state = this.game.state;
    const plantItems = state.inventory.filter((i) => i.kind === 'plant');
    if (plantItems.length === 0) {
      this.panel.body.appendChild(el('div', 'empty-state', 'No uncultivated specimens waiting. Bring some back from the wild, or propagate new ones.'));
      return;
    }
    const list = el('div', 'entry-list');
    for (const item of plantItems) {
      const def = PLANTS[item.defId];
      const row = el('div', 'entry-row');
      const info = el('div', 'entry-info');
      info.append(el('div', 'entry-name', def?.name ?? item.defId), el('div', 'entry-sub', 'Ready to plant at a Growing Bed'));
      row.appendChild(info);
      list.appendChild(row);
    }
    this.panel.body.appendChild(list);
  }

  private renderDisplay() {
    const state = this.game.state;
    const completed = Object.values(state.plantInstances).filter((p) => p.stage === 'COMPLETE');
    if (completed.length === 0) {
      this.panel.body.appendChild(el('div', 'empty-state', 'Nothing completed yet — your first finished specimen will be shown here.'));
      return;
    }
    const list = el('div', 'entry-list');
    for (const inst of completed) {
      const def = PLANTS[inst.defId];
      const row = el('div', 'entry-row');
      const swatch = el('div', 'entry-swatch');
      swatch.style.background = `hsl(${inst.traits.colorHue},50%,50%)`;
      const info = el('div', 'entry-info');
      info.append(el('div', 'entry-name', def?.name ?? inst.defId), el('div', 'entry-sub', `Quality ${inst.qualityEstimate}`));
      row.append(swatch, info);
      list.appendChild(row);
    }
    this.panel.body.appendChild(list);
  }
}
