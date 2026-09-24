import type { Game } from '../game/engine/Game';
import { Panel } from './Panel';
import { el } from './dom';
import { PLANTS, specimenName, specimenRarity, rarityRank } from '../game/data/plants';
import { SHOP_ITEMS, type ShopCategory } from '../game/data/shop';
import { STAGE_LABEL, stageFloat, stageOf } from '../game/systems/growth';
import { priceOf, demandSpecies, buyBlockReason, DEMAND_BONUS } from '../game/systems/market';
import { button, note, portrait, rarityBadge } from './common';

type Tab = 'sell' | 'shop';

const CATEGORY_LABEL: Record<ShopCategory, string> = {
  greenhouse: 'Greenhouse',
  pots: 'Pots',
  garden: 'Garden',
  equipment: 'Equipment',
  stall: 'Market Stall',
};

export class MarketPanel {
  panel = new Panel('Farmer’s Market', { tabs: true });
  private tab: Tab = 'sell';

  constructor(private game: Game) {
    for (const [id, label] of [
      ['sell', 'Sell'],
      ['shop', 'Buy'],
    ] as [Tab, string][]) {
      const b = el('button', 'panel-tab', label);
      b.dataset.tab = id;
      b.addEventListener('click', () => {
        this.tab = id;
        this.render();
      });
      this.panel.tabsEl.appendChild(b);
    }
  }

  open() {
    this.render();
    this.panel.open();
  }

  refresh() {
    if (this.panel.isOpen) this.render();
  }

  private render() {
    for (const c of Array.from(this.panel.tabsEl.children) as HTMLElement[]) c.classList.toggle('active', c.dataset.tab === this.tab);
    this.panel.clearBody();
    this.panel.setTitle(`Farmer’s Market · ${this.game.state.coins} coins`);
    if (this.tab === 'sell') this.renderSell();
    else this.renderShop();
  }

  private renderSell() {
    const state = this.game.state;
    const body = this.panel.body;
    const want = demandSpecies(state);
    const wanted = el('div', 'wanted');
    wanted.append(portrait(want, PLANTS[want].variants[0].id, 2.5, 3, 48), el('div', undefined, `Wanted today: ${PLANTS[want].name}. People are paying ${Math.round((DEMAND_BONUS - 1) * 100)}% extra.`));
    body.appendChild(wanted);
    if (state.basket.length === 0) {
      body.appendChild(el('div', 'empty-state', 'Nothing in your basket to sell. Bigger plants fetch far more than cuttings.'));
      return;
    }
    const list = el('div', 'entry-list');
    for (const item of state.basket) {
      const row = el('div', 'entry-row plant-row');
      const info = el('div', 'entry-info');
      const rarity = specimenRarity(item.defId, item.variantId);
      info.append(el('div', 'entry-name', specimenName(item.defId, item.variantId)), el('div', 'entry-sub', item.growth === 0 ? 'Cutting' : STAGE_LABEL[stageOf(item.growth)]), rarityBadge(rarity));
      // Selling something irreplaceable should feel like a choice, not a click.
      const others =
        state.basket.filter((b) => b !== item && b.defId === item.defId && b.variantId === item.variantId).length +
        Object.values(state.plants).filter((p) => p.defId === item.defId && p.variantId === item.variantId).length;
      if (rarityRank(rarity) >= 2 && others === 0) info.appendChild(note('Your only one. Propagate it first, and you could keep one and sell one.', 'row-note warn'));
      const price = priceOf(state, item);
      const sell = button(`Sell · ${price}`, () => {
        this.game.sell(item.uid);
        this.render();
      }, 'primary-btn small');
      row.append(portrait(item.defId, item.variantId, Math.max(0.6, stageFloat(item.growth)), item.seed, 56), info, sell);
      list.appendChild(row);
    }
    body.appendChild(list);
  }

  private renderShop() {
    const state = this.game.state;
    const body = this.panel.body;
    const cats: ShopCategory[] = ['greenhouse', 'pots', 'garden', 'equipment', 'stall'];
    for (const cat of cats) {
      const items = SHOP_ITEMS.filter((s) => s.category === cat && (!s.after || state.owned.includes(s.after) || state.owned.includes(s.id)));
      if (!items.length) continue;
      body.appendChild(el('h4', 'section-head', CATEGORY_LABEL[cat]));
      const list = el('div', 'entry-list');
      for (const item of items) {
        const row = el('div', 'entry-row');
        const info = el('div', 'entry-info');
        const stock = item.repeatable ? state.decorStock[item.id as keyof typeof state.decorStock] ?? 0 : 0;
        info.append(el('div', 'entry-name', item.name + (stock ? ` (${stock} unplaced)` : '')), el('div', 'entry-sub', item.description));
        const block = buyBlockReason(state, item.id);
        const label = block === 'owned' ? 'Owned ✓' : `${item.price} coins`;
        row.append(info, button(label, () => {
          this.game.buy(item.id);
          this.render();
        }, block === 'owned' ? 'secondary-btn' : 'primary-btn small', !!block));
        list.appendChild(row);
      }
      body.appendChild(list);
    }
  }
}
