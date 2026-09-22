import type { Game } from '../game/engine/Game';
import { Panel } from './Panel';
import { el, clear } from './dom';
import { PLANT_LIST, PLANTS } from '../game/data/plants';
import { FUNGI_LIST, FUNGI } from '../game/data/fungi';
import { CREATURE_LIST, CREATURES } from '../game/data/creatures';
import { MATERIAL_LIST, MATERIALS } from '../game/data/materials';
import { RELATIONSHIPS } from '../game/data/relationships';
import { detectEcologicalAlerts } from '../game/systems/ecosystem';
import type { DiscoveryLevel } from '../game/types';

type Tab = 'plants' | 'fungi' | 'insects' | 'animals' | 'ecosystem' | 'unknown';

const LEVEL_LABEL: Record<DiscoveryLevel, string> = {
  UNDISCOVERED: 'Undiscovered',
  DISCOVERED: 'Discovered',
  IDENTIFIED: 'Identified',
  CULTIVATED: 'Cultivated',
  DEVELOPED: 'Developed',
  MASTERED: 'Mastered',
  PROPAGATED: 'Propagated',
  VARIANT_DISCOVERED: 'Variant Found',
};

const TRAIT_LABELS: [string, string][] = [
  ['growthRate', 'Growth Rate'],
  ['size', 'Size'],
  ['hardiness', 'Hardiness'],
  ['yield', 'Yield'],
  ['waterTolerance', 'Water Tolerance'],
  ['lightTolerance', 'Light Tolerance'],
  ['pollinatorAttraction', 'Pollinator Draw'],
];

export class JournalPanel {
  panel = new Panel('Field Journal', { tabs: true });
  private tab: Tab = 'plants';

  constructor(private game: Game) {
    const tabs: [Tab, string][] = [
      ['plants', 'Plants'],
      ['fungi', 'Fungi'],
      ['insects', 'Insects'],
      ['animals', 'Animals'],
      ['ecosystem', 'Ecosystem'],
      ['unknown', 'Unknown'],
    ];
    for (const [id, label] of tabs) {
      const btn = el('button', 'panel-tab', label);
      btn.addEventListener('click', () => {
        this.tab = id;
        this.render();
      });
      this.panel.tabsEl.appendChild(btn);
    }
  }

  open() {
    this.render();
    this.panel.open();
  }

  private isIdentified(specimenId: string): boolean {
    const entry = this.game.state.journal[specimenId];
    return !!entry && entry.level !== 'DISCOVERED' && entry.level !== 'UNDISCOVERED';
  }

  private render() {
    for (const child of Array.from(this.panel.tabsEl.children)) {
      child.classList.toggle('active', (child.textContent ?? '').toLowerCase() === this.tab);
    }
    this.panel.clearBody();
    switch (this.tab) {
      case 'plants':
        this.renderSpeciesList('plant', PLANT_LIST, PLANTS);
        break;
      case 'fungi':
        this.renderSpeciesList('fungus', FUNGI_LIST, FUNGI);
        break;
      case 'insects':
        this.renderSpeciesList(
          'insect',
          CREATURE_LIST.filter((c) => c.kind === 'insect'),
          CREATURES
        );
        break;
      case 'animals':
        this.renderSpeciesList(
          'animal',
          CREATURE_LIST.filter((c) => c.kind === 'animal'),
          CREATURES
        );
        break;
      case 'ecosystem':
        this.renderEcosystem();
        break;
      case 'unknown':
        this.renderUnknown();
        break;
    }
  }

  private renderSpeciesList(kind: string, list: { id: string; name: string; rarity?: string }[], lookup: Record<string, unknown>) {
    const state = this.game.state;
    const known = list.filter((def) => !!state.journal[def.id]);
    if (known.length === 0) {
      this.panel.body.appendChild(el('div', 'empty-state', 'Nothing catalogued here yet. Go explore.'));
      return;
    }
    const list_ = el('div', 'entry-list');
    for (const def of known) {
      const entry = state.journal[def.id];
      const identified = this.isIdentified(def.id);
      const row = el('div', 'entry-row clickable');
      const swatch = el('div', 'entry-swatch');
      const hue = (def as { baseTraits?: { colorHue?: number } }).baseTraits?.colorHue ?? 160;
      swatch.style.background = identified ? `hsl(${hue}, 45%, 45%)` : 'rgba(255,255,255,0.12)';
      const info = el('div', 'entry-info');
      info.append(
        el('div', 'entry-name', identified ? def.name : '???'),
        el('div', 'entry-sub', def.rarity ? `${cap(def.rarity)} · ${kind}` : kind)
      );
      const status = el('div', `entry-status${entry.level === 'DISCOVERED' ? ' unknown' : ''}`, LEVEL_LABEL[entry.level]);
      row.append(swatch, info, status);
      row.addEventListener('click', () => this.renderDetail(def.id, kind, lookup));
      list_.appendChild(row);
    }
    this.panel.body.appendChild(list_);
  }

  private renderDetail(specimenId: string, kind: string, lookup: Record<string, unknown>) {
    const state = this.game.state;
    const entry = state.journal[specimenId];
    const identified = this.isIdentified(specimenId);
    clear(this.panel.body);

    const back = el('button', 'back-link', '← Back');
    back.addEventListener('click', () => this.render());
    this.panel.body.appendChild(back);

    const def = lookup[specimenId] as {
      name: string;
      description: string;
      silhouetteHint: string;
      rarity?: string;
      zones?: string[];
      ecologyNotes?: { known: string[]; unknown: string[] };
      baseTraits?: Record<string, number>;
    };

    const wrap = el('div', 'detail-view');
    wrap.appendChild(el('h3', undefined, identified ? def.name : '???'));
    if (def.rarity) wrap.appendChild(el('span', 'detail-tag', cap(def.rarity)));
    if (def.zones && def.zones.length) wrap.appendChild(el('span', 'detail-tag', def.zones.join(', ')));
    wrap.appendChild(el('span', 'detail-tag', LEVEL_LABEL[entry.level]));

    const desc = el('p', undefined, identified ? def.description : def.silhouetteHint);
    desc.style.color = 'var(--ink-dim)';
    desc.style.fontSize = '13px';
    desc.style.lineHeight = '1.6';
    wrap.appendChild(desc);

    if (identified && def.ecologyNotes && (def.ecologyNotes.known.length || def.ecologyNotes.unknown.length)) {
      const section = el('div', 'detail-section');
      section.appendChild(el('h4', undefined, 'Known'));
      const ul = el('ul');
      for (const k of def.ecologyNotes.known) ul.appendChild(el('li', undefined, k));
      if (def.ecologyNotes.known.length === 0) ul.appendChild(el('li', undefined, 'Nothing recorded yet.'));
      section.appendChild(ul);
      const section2 = el('div', 'detail-section');
      section2.appendChild(el('h4', undefined, 'Unknown'));
      const ul2 = el('ul');
      for (const u of def.ecologyNotes.unknown) ul2.appendChild(el('li', undefined, u));
      if (def.ecologyNotes.unknown.length === 0) ul2.appendChild(el('li', undefined, 'Fully understood — for now.'));
      section2.appendChild(ul2);
      wrap.append(section, section2);
    }

    if (kind === 'plant' && identified) {
      const instances = Object.values(state.plantInstances).filter((p) => p.defId === specimenId);
      const best = instances.sort((a, b) => b.qualityEstimate - a.qualityEstimate)[0];
      if (best) {
        const section = el('div', 'detail-section');
        section.appendChild(el('h4', undefined, `Traits (Quality ${best.qualityEstimate})`));
        for (const [key, label] of TRAIT_LABELS) {
          const v = (best.traits as unknown as Record<string, number>)[key] ?? 0;
          const row = el('div', 'trait-bar-row');
          row.appendChild(el('span', 'label', label));
          const track = el('div', 'trait-bar-track');
          const fill = el('div', 'trait-bar-fill');
          fill.style.width = `${Math.round(v)}%`;
          track.appendChild(fill);
          row.append(track);
          section.appendChild(row);
        }
        wrap.appendChild(section);
      }

      const completed = instances.filter((p) => p.stage === 'COMPLETE');
      if (completed.length > 0) {
        const introBtn = el('button', 'primary-btn', state.player.inGreenhouse ? 'Step outside to introduce to the wild' : 'Introduce to the Wild, Here');
        introBtn.disabled = state.player.inGreenhouse;
        introBtn.addEventListener('click', () => {
          this.game.introduceToWild(completed[0].id, true);
          this.renderDetail(specimenId, kind, lookup);
        });
        wrap.appendChild(introBtn);
      }
    }

    this.panel.body.appendChild(wrap);
  }

  private renderEcosystem() {
    const discovered = RELATIONSHIPS.filter((r) => this.game.state.discoveredRelationships.includes(r.id));
    const alerts = detectEcologicalAlerts(this.game.state);
    const wrap = el('div');
    wrap.appendChild(el('h4', undefined, 'Signs Worth Investigating'));
    if (alerts.length === 0) {
      wrap.appendChild(el('div', 'empty-state', 'Nothing seems out of balance right now.'));
    } else {
      const ul = el('ul');
      for (const a of alerts) ul.appendChild(el('li', undefined, `${a.message} (${a.zone})`));
      wrap.appendChild(ul);
    }
    wrap.appendChild(el('h4', undefined, 'Relationships You\'ve Noticed'));
    if (discovered.length === 0) {
      wrap.appendChild(el('div', 'empty-state', 'Nothing confirmed yet — keep observing.'));
    } else {
      const list = el('div', 'entry-list');
      for (const r of discovered) {
        const row = el('div', 'entry-row');
        const info = el('div', 'entry-info');
        info.append(el('div', 'entry-name', r.description), el('div', 'entry-sub', r.type));
        row.appendChild(info);
        list.appendChild(row);
      }
      wrap.appendChild(list);
    }
    this.panel.body.appendChild(wrap);
  }

  private renderUnknown() {
    const state = this.game.state;
    const wrap = el('div', 'entry-list');
    let any = false;
    for (const p of PLANT_LIST.filter((p) => p.rarity === 'unknown')) {
      if (!state.journal[p.id]) continue;
      any = true;
      const row = el('div', 'entry-row');
      const info = el('div', 'entry-info');
      info.append(el('div', 'entry-name', '??? (unclassified plant)'), el('div', 'entry-sub', p.silhouetteHint));
      row.appendChild(info);
      wrap.appendChild(row);
    }
    for (const m of MATERIAL_LIST.filter((m) => m.unknown)) {
      if (!state.journal[m.id]) continue;
      any = true;
      const row = el('div', 'entry-row');
      const info = el('div', 'entry-info');
      info.append(el('div', 'entry-name', m.name), el('div', 'entry-sub', m.description));
      row.appendChild(info);
      wrap.appendChild(row);
    }
    if (!any) {
      this.panel.body.appendChild(el('div', 'empty-state', 'No unsolved mysteries catalogued yet.'));
      return;
    }
    this.panel.body.appendChild(wrap);
  }
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
