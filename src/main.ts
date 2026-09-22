import './styles/main.css';
import { Game } from './game/engine/Game';
import { HUD } from './ui/HUD';
import { JournalPanel } from './ui/JournalPanel';
import { BasketPanel } from './ui/BasketPanel';
import { StationPanel } from './ui/StationPanel';
import { StartOverlay } from './ui/StartOverlay';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const game = new Game(canvas);

const hud = new HUD(game);
document.getElementById('app')!.appendChild(hud.root);

const journal = new JournalPanel(game);
const basket = new BasketPanel(game);
const station = new StationPanel(game);

hud.onJournal = () => journal.open();
hud.onBasket = () => basket.open();
game.onOpenStation = (stationId) => station.open(stationId);
game.onStateTouched = () => {
  if (journal.panel.isOpen) journal.open();
};
game.onFrame = () => hud.update();

if (import.meta.env.DEV) {
  (window as unknown as { __foxtrot: unknown }).__foxtrot = { game };
}

new StartOverlay(() => {
  game.audio.init();
  game.start();
}, game.isNew);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    import('virtual:pwa-register').then(({ registerSW }) => {
      registerSW({ immediate: true });
    }).catch(() => {
      // PWA plugin not available in this build mode; safe to ignore.
    });
  });
}
