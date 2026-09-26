// How long a message stays up, and what may interrupt it.
//
// Small feedback ("Took a cutting") should be quick and get out of the way;
// a new species or a garden milestone should stay long enough to read and
// absorb, and not be shoved off-screen by the next bit of chatter. This is
// pure bookkeeping — no DOM — so the HUD just renders what it's told.

export type Significance = 'minor' | 'normal' | 'important' | 'major';
export type ToastKind = 'info' | 'discovery' | 'growth' | 'hint' | 'coins';

/** What a message of each kind usually means; callers can say otherwise. */
export const KIND_SIGNIFICANCE: Record<ToastKind, Significance> = {
  info: 'minor',
  coins: 'minor',
  growth: 'normal',
  hint: 'important',
  discovery: 'important',
};

const RANK: Record<Significance, number> = { minor: 0, normal: 1, important: 2, major: 3 };

/** Base time on screen, before accounting for how much there is to read. */
const BASE_MS: Record<Significance, number> = { minor: 2400, normal: 3600, important: 5500, major: 7500 };
/** Extra time per character beyond a short phrase: slower for things that matter. */
const PER_CHAR_MS: Record<Significance, number> = { minor: 30, normal: 45, important: 55, major: 65 };
const MAX_MS: Record<Significance, number> = { minor: 4500, normal: 8000, important: 12000, major: 16000 };
/** Characters that read at a glance and earn no extra time. */
const GLANCE_CHARS = 32;

/** A quiet beat after something important leaves, before the next message. */
const PAUSE_AFTER_MS: Record<Significance, number> = { minor: 0, normal: 0, important: 400, major: 1100 };
/** Queued chatter that's waited this long is no longer worth showing. */
const STALE_MS: Record<Significance, number> = { minor: 3500, normal: 8000, important: Infinity, major: Infinity };

/** A major moment has the screen to itself this long; after that others may join below it. */
export const MOMENT_MS = 2500;

/** At most this many messages on screen at once — a phone is small. */
export const MAX_VISIBLE = 2;

export function toastDuration(text: string, sig: Significance): number {
  const extra = Math.max(0, text.length - GLANCE_CHARS) * PER_CHAR_MS[sig];
  return Math.min(MAX_MS[sig], BASE_MS[sig] + extra);
}

export function significanceRank(sig: Significance): number {
  return RANK[sig];
}

interface Entry<T> {
  item: T;
  text: string;
  sig: Significance;
  queuedAt: number;
  shownAt: number;
  expiresAt: number;
}

export interface ToastChanges<T> {
  show: T[];
  hide: T[];
}

export class ToastScheduler<T> {
  private visible: Entry<T>[] = [];
  private queue: Entry<T>[] = [];
  private holdUntil = 0;

  push(item: T, text: string, sig: Significance, now: number) {
    // The same line again while it's still up or waiting is just noise.
    if (this.visible.some((e) => e.text === text) || this.queue.some((e) => e.text === text)) return;
    this.queue.push({ item, text, sig, queuedAt: now, shownAt: 0, expiresAt: 0 });
  }

  get showing(): readonly T[] {
    return this.visible.map((e) => e.item);
  }

  get pending(): number {
    return this.queue.length;
  }

  tick(now: number): ToastChanges<T> {
    const out: ToastChanges<T> = { show: [], hide: [] };

    for (const e of [...this.visible]) {
      if (e.expiresAt > now) continue;
      this.remove(e, out);
      this.holdUntil = Math.max(this.holdUntil, now + PAUSE_AFTER_MS[e.sig]);
    }
    this.queue = this.queue.filter((e) => now - e.queuedAt < STALE_MS[e.sig]);

    while (this.queue.length > 0 && now >= this.holdUntil) {
      // Highest significance first; among equals, first come first served.
      let next = this.queue[0];
      for (const e of this.queue) if (RANK[e.sig] > RANK[next.sig]) next = e;

      // A major moment gets the stage to itself for a beat.
      if (this.visible.some((e) => e.sig === 'major' && now - e.shownAt < MOMENT_MS)) break;
      if (next.sig === 'major') {
        // Clear the chatter; anything important already up may stay beside it.
        for (const e of [...this.visible]) if (RANK[e.sig] < RANK.important) this.remove(e, out);
        if (this.visible.length >= MAX_VISIBLE) break;
      } else if (this.visible.length >= MAX_VISIBLE) {
        // Make room only by retiring something no more important than the newcomer.
        const victim = this.visible.find((e) => RANK[e.sig] <= Math.min(RANK[next.sig], RANK.normal));
        if (!victim) break;
        this.remove(victim, out);
      }

      this.queue.splice(this.queue.indexOf(next), 1);
      next.shownAt = now;
      next.expiresAt = now + toastDuration(next.text, next.sig);
      this.visible.push(next);
      out.show.push(next.item);
    }
    return out;
  }

  private remove(e: Entry<T>, out: ToastChanges<T>) {
    this.visible.splice(this.visible.indexOf(e), 1);
    out.hide.push(e.item);
  }
}
