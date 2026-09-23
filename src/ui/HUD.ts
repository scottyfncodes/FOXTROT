import type { Game, ToastEvent } from '../game/engine/Game';
import { el } from './dom';
import { ZONES } from '../game/data/zones';
import { zoneAt } from '../game/data/worldMap';
import { isNight, minuteOfDay } from '../game/engine/Clock';

function formatClock(totalMinutes: number): string {
  const m = minuteOfDay(totalMinutes);
  const h24 = Math.floor(m / 60);
  const min = Math.floor(m % 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const ampm = h24 < 12 ? 'AM' : 'PM';
  return `${h12}:${min.toString().padStart(2, '0')} ${ampm}`;
}

const WEATHER_ICON: Record<string, string> = { clear: '☀', rain: '☔', overcast: '☁' };

function setText(node: Node, text: string) {
  if (node.textContent !== text) node.textContent = text;
}

export class HUD {
  root = el('div', 'hud');
  private zoneChip = el('div', 'hud-chip');
  private timeChip = el('div', 'hud-chip');
  private journalBtn = el('button', 'icon-btn', '\u{1F4D3}');
  private basketBtn = el('button', 'icon-btn', '\u{1F9FA}');
  private interactionPrompt = el('div', 'interaction-prompt');
  private promptLabel = document.createTextNode('');
  private toastStack = el('div', 'toast-stack');
  private joystickZone = el('div', 'joystick-zone');
  private joystickThumb = el('div', 'joystick-thumb');
  private actionBtn = el('button', 'action-btn', 'PLUCK');

  onJournal: (() => void) | null = null;
  onBasket: (() => void) | null = null;

  constructor(private game: Game) {
    const top = el('div', 'hud-top');
    const left = el('div', 'hud-chip-group');
    left.style.display = 'flex';
    left.style.gap = '8px';
    left.append(this.zoneChip, this.timeChip);
    const right = el('div', 'hud-buttons');
    right.append(this.journalBtn, this.basketBtn);
    top.append(left, right);

    this.joystickZone.append(this.joystickThumb);
    const touch = el('div', 'touch-controls');
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice) {
      touch.append(this.joystickZone, this.actionBtn);
    }

    this.interactionPrompt.append(el('kbd', undefined, 'E'), this.promptLabel);
    this.root.append(top, this.interactionPrompt, this.toastStack, touch);

    this.journalBtn.addEventListener('click', () => this.onJournal?.());
    this.basketBtn.addEventListener('click', () => this.onBasket?.());
    this.game.input.bindJoystick(this.joystickZone, this.joystickThumb);
    this.game.input.bindActionButton(this.actionBtn);
    this.game.onToast = (t) => this.showToast(t);
  }

  private showToast(t: ToastEvent) {
    const node = el('div', `toast${t.kind === 'discovery' ? ' discovery' : ''}`, t.text);
    this.toastStack.appendChild(node);
    setTimeout(() => node.remove(), 4200);
  }

  // Called every frame: only touch the DOM when what's shown actually changes.
  update() {
    const state = this.game.state;
    const zone = state.player.inGreenhouse ? 'greenhouse' : zoneAt(Math.floor(state.player.x), Math.floor(state.player.y));
    setText(this.zoneChip, ZONES[zone].name);
    const night = isNight(state.clock.totalMinutes);
    setText(this.timeChip, `${WEATHER_ICON[state.weather.condition]} ${formatClock(state.clock.totalMinutes)}${night ? ' \u{1F319}' : ''}`);

    const n = this.game.nearest;
    this.interactionPrompt.classList.toggle('visible', !!n);
    this.actionBtn.style.opacity = n ? '1' : '0.55';
    if (!n) return;
    setText(this.promptLabel, n.label);
    setText(this.actionBtn, n.kind === 'discoveryPoint' || n.kind === 'toolPickup' ? 'TAKE' : n.kind === 'station' ? 'OPEN' : 'GO');
  }
}
