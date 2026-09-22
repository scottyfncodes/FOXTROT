import type { Game } from '../game/engine/Game';
import { Panel } from './Panel';
import { el } from './dom';
import { PLANTS } from '../game/data/plants';
import { FUNGI } from '../game/data/fungi';
import { MATERIALS } from '../game/data/materials';
import { TOOLS } from '../game/data/tools';
import { basketCapacity } from '../game/systems/tools';

export class BasketPanel {
  panel = new Panel('Field Basket');

  constructor(private game: Game) {}

  open() {
    this.render();
    this.panel.open();
  }

  private render() {
    const state = this.game.state;
    this.panel.clearBody();
    this.panel.setTitle(`Field Basket (${state.inventory.length}/${basketCapacity(state)})`);

    if (state.inventory.length === 0) {
      this.panel.body.appendChild(el('div', 'empty-state', 'Empty. The wilderness is out there.'));
    } else {
      const list = el('div', 'entry-list');
      for (const item of state.inventory) {
        const def = item.kind === 'plant' ? PLANTS[item.defId] : item.kind === 'fungus' ? FUNGI[item.defId] : MATERIALS[item.defId];
        const row = el('div', 'entry-row');
        const swatch = el('div', 'entry-swatch');
        const hue = item.traits?.colorHue ?? 160;
        swatch.style.background = item.kind === 'plant' ? `hsl(${hue},45%,45%)` : item.kind === 'fungus' ? '#c9b98a' : '#a89a7c';
        const info = el('div', 'entry-info');
        const nameLine = def?.name ?? item.defId;
        const sub = item.count > 1 ? `x${item.count}` : item.quality ? `Quality ${item.quality}` : item.kind;
        info.append(el('div', 'entry-name', nameLine), el('div', 'entry-sub', sub));
        row.append(swatch, info);
        list.appendChild(row);
      }
      this.panel.body.appendChild(list);
    }

    const toolsHeader = el('h4', undefined, 'Tools');
    toolsHeader.style.marginTop = '18px';
    toolsHeader.style.fontSize = '12px';
    toolsHeader.style.color = 'var(--accent)';
    toolsHeader.style.textTransform = 'uppercase';
    toolsHeader.style.letterSpacing = '0.06em';
    this.panel.body.appendChild(toolsHeader);
    const toolList = el('div', 'entry-list');
    for (const tool of Object.values(TOOLS)) {
      const tier = state.tools[tool.id] ?? 0;
      const row = el('div', 'entry-row');
      const info = el('div', 'entry-info');
      const tierDef = tier > 0 ? tool.tiers[tier - 1] : null;
      info.append(
        el('div', 'entry-name', tierDef ? `${tool.name} — ${tierDef.name}` : `${tool.name} (not yet found)`),
        el('div', 'entry-sub', tierDef ? tierDef.unlocks.join(', ') : tool.description)
      );
      row.appendChild(info);
      if (tier === 0) row.style.opacity = '0.45';
      toolList.appendChild(row);
    }
    this.panel.body.appendChild(toolList);
  }
}
