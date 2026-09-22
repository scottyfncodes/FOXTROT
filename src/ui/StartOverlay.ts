import { el } from './dom';
import { SAVE_KEY } from '../game/state';

export class StartOverlay {
  root = el('div', 'start-overlay');

  constructor(private onStart: () => void, isNew: boolean) {
    this.root.appendChild(el('h1', undefined, 'FOXTROT'));
    this.root.appendChild(
      el(
        'p',
        undefined,
        isNew
          ? "You're Ellen, a field botanist, with Scout — scruffy, one-eyed, never far — at your side. An abandoned greenhouse behind you. A living wilderness ahead. Something in the tree line is watching."
          : 'The greenhouse is as you and Scout left it. The wilderness may not be.'
      )
    );
    const btn = el('button', 'primary-btn', isNew ? 'Step Outside' : 'Continue');
    btn.addEventListener('click', () => {
      this.root.remove();
      this.onStart();
    });
    this.root.appendChild(btn);

    const resetLink = el('button', 'secondary-btn', 'Start a New Game Instead');
    resetLink.style.marginTop = '4px';
    resetLink.addEventListener('click', () => {
      if (confirm('This will erase your current progress. Start fresh?')) {
        localStorage.removeItem(SAVE_KEY);
        location.reload();
      }
    });
    if (!isNew) this.root.appendChild(resetLink);

    document.body.appendChild(this.root);
  }
}
