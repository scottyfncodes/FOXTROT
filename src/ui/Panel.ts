import { el, clear } from './dom';

export class Panel {
  backdrop = el('div', 'panel-backdrop');
  panel = el('div', 'panel');
  header = el('div', 'panel-header');
  titleEl = el('h2');
  closeBtn = el('button', 'panel-close', '×');
  tabsEl = el('div', 'panel-tabs');
  body = el('div', 'panel-body');
  /** Called whenever the panel closes, however it was closed. */
  onClose?: () => void;

  constructor(title: string, opts: { tabs?: boolean } = {}) {
    this.titleEl.textContent = title;
    this.closeBtn.addEventListener('click', () => this.close());
    this.header.append(this.titleEl, this.closeBtn);
    this.panel.append(this.header);
    if (opts.tabs) this.panel.append(this.tabsEl);
    this.panel.append(this.body);
    this.backdrop.append(this.panel);
    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) this.close();
    });
    document.body.appendChild(this.backdrop);
  }

  setTitle(t: string) {
    this.titleEl.textContent = t;
  }

  clearBody() {
    clear(this.body);
  }

  open() {
    this.backdrop.classList.add('open');
  }

  close() {
    const wasOpen = this.isOpen;
    this.backdrop.classList.remove('open');
    if (wasOpen) this.onClose?.();
  }

  get isOpen() {
    return this.backdrop.classList.contains('open');
  }
}
