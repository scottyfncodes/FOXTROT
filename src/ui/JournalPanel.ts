import type { Game } from '../game/engine/Game';
import { Panel } from './Panel';
import { el, clear } from './dom';
import { PLANT_LIST, PLANTS, rarityRank, findVariant } from '../game/data/plants';
import { ZONES } from '../game/data/zones';
import type { OutdoorZoneId } from '../game/types';
import { collectionTotals, speciesCounts, isEstablished, ESTABLISH_THRESHOLD } from '../game/systems/collection';
import { describeRegion } from '../game/systems/wild';
import { note, portrait, rarityBadge } from './common';

type Tab = 'plants' | 'regions';

const REGIONS: OutdoorZoneId[] = ['meadow', 'woodland', 'creek', 'dampForest', 'rockyClearing', 'overgrownClearing'];

/**
 * Ellen's field journal, now a collection: every species in the valley,
 * with the ones not yet found shown as silhouettes and every variant
 * slot visible as "???" until it's been seen — so there's always a gap
 * to wonder about.
 */
export class JournalPanel {
  panel = new Panel('Field Journal', { tabs: true });
  private tab: Tab = 'plants';
  private detail: string | null = null;

  constructor(private game: Game) {
    for (const [id, label] of [
      ['plants', 'Collection'],
      ['regions', 'Regions'],
    ] as [Tab, string][]) {
      const btn = el('button', 'panel-tab', label);
      btn.dataset.tab = id;
      btn.addEventListener('click', () => {
        this.tab = id;
        this.detail = null;
        this.render();
      });
      this.panel.tabsEl.appendChild(btn);
    }
  }

  open() {
    this.detail = null;
    this.render();
    this.panel.open();
  }

  refresh() {
    if (this.panel.isOpen) this.render();
  }

  private render() {
    for (const c of Array.from(this.panel.tabsEl.children) as HTMLElement[]) c.classList.toggle('active', c.dataset.tab === this.tab);
    this.panel.clearBody();
    if (this.tab === 'regions') return this.renderRegions();
    if (this.detail) return this.renderDetail(this.detail);
    this.renderCollection();
  }

  private renderCollection() {
    const state = this.game.state;
    const totals = collectionTotals(state);
    this.panel.body.appendChild(
      el('div', 'collection-summary', `${totals.species} of ${totals.totalSpecies} species · ${totals.variants} of ${totals.totalVariants} variants`)
    );
    const grid = el('div', 'collection-grid');
    const sorted = [...PLANT_LIST].sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity));
    for (const def of sorted) {
      const rec = state.collection[def.id];
      const card = el('div', `collection-card${rec ? ' found clickable' : ''}`);
      if (rec) {
        // Show off the rarest variant found.
        const best = [...rec.variants].sort((a, b) => rarityRank(findVariant(def.id, b)!.rarity) - rarityRank(findVariant(def.id, a)!.rarity))[0] ?? def.variants[0].id;
        card.append(portrait(def.id, best, 3, 4, 76), el('div', 'card-name', def.name));
        const dots = el('div', 'variant-dots');
        for (const v of def.variants) dots.appendChild(el('span', rec.variants.includes(v.id) ? 'vdot on' : 'vdot'));
        card.appendChild(dots);
        if (isEstablished(state, def.id)) card.appendChild(el('div', 'card-flag', 'Established'));
        card.addEventListener('click', () => {
          this.detail = def.id;
          this.render();
        });
      } else {
        card.append(portrait(def.id, def.variants[0].id, 2.6, 4, 76, true), el('div', 'card-name unknown', '???'), el('div', 'card-hint', def.hint));
      }
      grid.appendChild(card);
    }
    this.panel.body.appendChild(grid);
  }

  private renderDetail(defId: string) {
    const state = this.game.state;
    const def = PLANTS[defId];
    const rec = state.collection[defId];
    if (!def || !rec) return this.renderCollection();
    const body = this.panel.body;
    const back = el('button', 'back-link', '← Collection');
    back.addEventListener('click', () => {
      this.detail = null;
      this.render();
    });
    body.appendChild(back);

    const head = el('div', 'plant-head');
    const info = el('div', 'entry-info');
    info.append(el('h3', undefined, def.name), el('div', 'latin', def.latin), rarityBadge(def.rarity));
    const habitat = el('div', 'entry-sub', `Grows wild in ${def.habitat.map((z) => ZONES[z].name.replace(/^The /, 'the ')).join(' and ')}`);
    info.appendChild(habitat);
    head.append(portrait(def.id, rec.variants[0] ?? def.variants[0].id, 3.4, 4, 120), info);
    body.appendChild(head);
    body.appendChild(note(def.description));

    const est = isEstablished(state, defId);
    body.appendChild(
      el('div', `establish${est ? ' done' : ''}`, est ? 'Established — you can display it and plant it out.' : `${rec.grown} of ${ESTABLISH_THRESHOLD} grown — establish it to display it or plant it out.`)
    );

    // Variant checklist: found ones are shown, the rest are "???".
    body.appendChild(el('h4', 'section-head', 'Variants'));
    const vlist = el('div', 'variant-list');
    for (const v of def.variants) {
      const found = rec.variants.includes(v.id);
      const row = el('div', `variant-row${found ? '' : ' missing'}`);
      if (found) {
        row.append(portrait(def.id, v.id, 2.8, 7, 44), el('span', 'variant-name', `✓ ${v.name}`), rarityBadge(v.rarity));
        row.title = v.description;
      } else {
        row.append(portrait(def.id, v.id, 2.8, 7, 44, true), el('span', 'variant-name', '???'));
      }
      vlist.appendChild(row);
    }
    body.appendChild(vlist);

    const c = speciesCounts(state, defId);
    body.appendChild(el('h4', 'section-head', 'Your plants'));
    const stats = el('div', 'stat-grid');
    const stat = (label: string, value: string | number) => {
      const s = el('div', 'stat');
      s.append(el('div', 'stat-value', String(value)), el('div', 'stat-label', label));
      stats.appendChild(s);
    };
    stat('Grown', rec.grown);
    stat('Cuttings taken', rec.propagated);
    stat('In the nursery', c.inNursery);
    stat('On display', c.displayed);
    stat('Carrying', c.carrying);
    stat('Growing wild', c.wild);
    stat('Sold', rec.sold);
    stat('Earned', rec.earned);
    body.appendChild(stats);
    if (c.wild > 0) {
      body.appendChild(note(c.wildSprouted > 0 ? `${c.wildPlanted} you planted, and ${c.wildSprouted} that came up by themselves.` : `${c.wildPlanted} you planted out. Once they’re large, they’ll start to spread.`));
    }
  }

  private renderRegions() {
    const lush = this.game.lush;
    const body = this.panel.body;
    body.appendChild(note('What your plants are doing to the valley. Plants grow fastest in their own kind of country.'));
    const list = el('div', 'entry-list');
    for (const z of REGIONS) {
      const cover = lush.zoneCover[z] ?? 0;
      const count = lush.zoneCount[z] ?? 0;
      const row = el('div', 'entry-row region-row');
      const info = el('div', 'entry-info');
      info.append(el('div', 'entry-name', ZONES[z].name), el('div', 'entry-sub', describeRegion(cover, count, lush.zoneCharacter[z])));
      const natives = PLANT_LIST.filter((p) => p.habitat.includes(z) && !p.foxOnly && this.game.state.collection[p.id]).map((p) => p.name);
      if (natives.length) info.appendChild(el('div', 'entry-sub dim', `Thrives here: ${natives.join(', ')}`));
      const bar = el('div', 'trait-bar-track');
      const fill = el('div', 'trait-bar-fill');
      fill.style.width = `${Math.round(Math.min(1, cover) * 100)}%`;
      bar.appendChild(fill);
      info.appendChild(bar);
      const right = el('div', 'region-stat');
      right.append(el('div', 'stat-value', `${Math.round(cover * 100)}%`), el('div', 'stat-label', `${count} plant${count === 1 ? '' : 's'}`));
      row.append(info, right);
      list.appendChild(row);
    }
    body.appendChild(list);
    void clear;
  }
}
