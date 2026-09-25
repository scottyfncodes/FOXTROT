import type { Game } from '../game/engine/Game';
import { Panel } from './Panel';
import { el } from './dom';
import { findBed, plantsInBed, bedDiversity, bedCost, routeLength } from '../game/systems/landscape';
import { MINUTES_PER_DAY } from '../game/engine/Clock';
import { button, note } from './common';

/** A garden bed or a path, tapped on: a few words about it, and the option to undo it. */
export class GroundCard {
  panel = new Panel('');
  private target: { kind: 'bed' | 'path'; id: string } | null = null;
  private confirm = false;

  constructor(private game: Game) {}

  open(target: { kind: 'bed' | 'path'; id: string }) {
    this.target = target;
    this.confirm = false;
    this.render();
    this.panel.open();
  }

  refresh() {
    if (this.panel.isOpen) this.render();
  }

  private age(createdAt: number): string {
    const days = Math.floor((this.game.state.clock.totalMinutes - createdAt) / MINUTES_PER_DAY);
    return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  }

  private render() {
    const t = this.target;
    const state = this.game.state;
    this.panel.clearBody();
    const body = this.panel.body;
    if (!t) return;
    if (t.kind === 'bed') {
      const bed = findBed(state, t.id);
      if (!bed) return this.panel.close();
      this.panel.setTitle('Garden Bed');
      const plants = plantsInBed(state, bed.id);
      const species = bedDiversity(state, bed.id);
      body.appendChild(note(`Dug ${this.age(bed.createdAt)}. ${plants.length ? `${plants.length} plant${plants.length === 1 ? '' : 's'} of ${species} kind${species === 1 ? '' : 's'}.` : 'Nothing growing in it yet — plant something from your basket.'}`));
      body.appendChild(note('Whatever grows here spreads only within the bed. A good mix of plants makes for a livelier bed.', 'row-note'));
      if (!this.confirm) {
        body.appendChild(button('Fill it in…', () => {
          this.confirm = true;
          this.render();
        }, 'secondary-btn'));
      } else {
        body.appendChild(note(`The plants stay where they are, free to wander. You’ll get ${Math.floor(bedCost(bed.w, bed.h) / 2)} compost back.`, 'row-note'));
        const row = el('div', 'action-row');
        row.append(
          button('Keep it', () => {
            this.confirm = false;
            this.render();
          }, 'secondary-btn'),
          button('Fill it in', () => {
            this.game.fillInBed(bed.id);
            this.panel.close();
          }, 'primary-btn danger')
        );
        body.appendChild(row);
      }
    } else {
      const path = state.paths.find((p) => p.id === t.id);
      if (!path) return this.panel.close();
      this.panel.setTitle('Path');
      body.appendChild(note(`About ${Math.round(routeLength(path.points))} paces long, carved ${this.age(path.createdAt)}. The verges are slowly growing back in.`));
      if (!this.confirm) {
        body.appendChild(button('Let it grow over…', () => {
          this.confirm = true;
          this.render();
        }, 'secondary-btn'));
      } else {
        body.appendChild(note('Your plants will be free to spread across it again. You can always carve a new one.', 'row-note'));
        const row = el('div', 'action-row');
        row.append(
          button('Keep it', () => {
            this.confirm = false;
            this.render();
          }, 'secondary-btn'),
          button('Let it go', () => {
            this.game.letPathGrowOver(path.id);
            this.panel.close();
          }, 'primary-btn danger')
        );
        body.appendChild(row);
      }
    }
  }
}
