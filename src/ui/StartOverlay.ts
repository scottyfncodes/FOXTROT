import { el } from './dom';

export class StartOverlay {
  root = el('div', 'start-overlay');

  constructor(private onStart: () => void, isNew: boolean) {
    this.root.appendChild(el('h1', undefined, 'FOXTROT'));
    this.root.appendChild(
      el(
        'p',
        undefined,
        isNew
          ? 'An abandoned greenhouse. A living wilderness just beyond it. Something is watching from the tree line.'
          : 'The greenhouse is as you left it. The wilderness may not be.'
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
        localStorage.removeItem('foxtrot-save-v1');
        location.reload();
      }
    });
    if (!isNew) this.root.appendChild(resetLink);

    document.body.appendChild(this.root);
  }
}
