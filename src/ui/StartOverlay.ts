import { el, clear } from './dom';

export class StartOverlay {
  root = el('div', 'start-overlay');

  constructor(
    private onStart: () => void,
    private onReset: () => void,
    isNew: boolean
  ) {
    this.render(isNew);
    document.body.appendChild(this.root);
  }

  private render(isNew: boolean) {
    clear(this.root);
    this.root.appendChild(el('h1', undefined, 'FOXTROT'));
    this.root.appendChild(
      el(
        'p',
        undefined,
        isNew
          ? "You're Ellen, a plant collector, with Scout — scruffy, one-eyed, never far — at your side. A little greenhouse, an empty market stall, and a whole valley of wild houseplants waiting to be found. What will you discover first?"
          : 'Your plants have been growing while you were away. The valley may look a little different.'
      )
    );
    const btn = el('button', 'primary-btn', isNew ? 'Step Outside' : 'Continue');
    btn.addEventListener('click', () => {
      this.root.remove();
      this.onStart();
    });
    this.root.appendChild(btn);

    if (isNew) return;
    const resetLink = el('button', 'secondary-btn', 'Start a New Game Instead');
    resetLink.style.marginTop = '4px';
    resetLink.addEventListener('click', () => {
      if (confirm('This will erase your current progress. Start fresh?')) {
        this.onReset();
        this.render(true);
      }
    });
    this.root.appendChild(resetLink);
  }
}
