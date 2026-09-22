export type InteractHandler = () => void;

export class Input {
  private keys = new Set<string>();
  private joyVector = { x: 0, y: 0 };
  private joyActive = false;
  private joyPointerId: number | null = null;
  private joyOrigin = { x: 0, y: 0 };
  private interactQueued = false;
  private interactHandlers: InteractHandler[] = [];

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  destroy() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  onInteract(handler: InteractHandler) {
    this.interactHandlers.push(handler);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
      e.preventDefault();
    }
    this.keys.add(e.key.toLowerCase());
    if (e.key.toLowerCase() === 'e' || e.key === 'Enter' || e.key === ' ') {
      this.fireInteract();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };

  private fireInteract() {
    this.interactQueued = true;
    for (const h of this.interactHandlers) h();
  }

  consumeInteractQueued(): boolean {
    const v = this.interactQueued;
    this.interactQueued = false;
    return v;
  }

  /** Binds the on-screen joystick to a zone element (touch drag area) and thumb visual. */
  bindJoystick(zone: HTMLElement, thumb: HTMLElement) {
    const radius = 40;

    const setThumb = (dx: number, dy: number) => {
      thumb.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const resetThumb = () => setThumb(0, 0);

    const start = (e: PointerEvent) => {
      if (this.joyPointerId !== null) return;
      this.joyPointerId = e.pointerId;
      this.joyActive = true;
      const rect = zone.getBoundingClientRect();
      this.joyOrigin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      zone.setPointerCapture(e.pointerId);
      move(e);
    };
    const move = (e: PointerEvent) => {
      if (!this.joyActive || e.pointerId !== this.joyPointerId) return;
      let dx = e.clientX - this.joyOrigin.x;
      let dy = e.clientY - this.joyOrigin.y;
      const len = Math.hypot(dx, dy);
      if (len > radius) {
        dx = (dx / len) * radius;
        dy = (dy / len) * radius;
      }
      setThumb(dx, dy);
      this.joyVector = { x: dx / radius, y: dy / radius };
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.joyPointerId) return;
      this.joyActive = false;
      this.joyPointerId = null;
      this.joyVector = { x: 0, y: 0 };
      resetThumb();
    };

    zone.addEventListener('pointerdown', start);
    zone.addEventListener('pointermove', move);
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  bindActionButton(btn: HTMLElement) {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.fireInteract();
    });
  }

  /** Returns a normalized movement vector combining keyboard + joystick input. */
  getMoveVector(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) y -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) y += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) x -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) x += 1;

    if (x === 0 && y === 0 && this.joyActive) {
      x = this.joyVector.x;
      y = this.joyVector.y;
    }

    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }
}
