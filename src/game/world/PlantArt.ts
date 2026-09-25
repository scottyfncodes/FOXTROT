import type { PlantForm, PlantLook } from '../types';
import { PLANTS, lookFor } from '../data/plants';
import { mulberry32 } from '../engine/Random';

// Procedural houseplant art. Every species has its own silhouette (form),
// every variant its own colouring and variegation, and every individual its
// own leaf layout (seed). Growth is continuous: a plant gains leaves, size,
// splits, runners and flowers as it moves from cutting to specimen.
//
// Drawing this many leaves every frame would be far too slow, so plants are
// rendered once into offscreen sprites (PlantSpriteCache) keyed by species,
// variant, a growth bucket, a seed bucket and zoom, and blitted with a
// little wind sway.

export type PlantMode = 'ground' | 'pot' | 'hanging';

const STAGE_SCALE = [0.42, 0.62, 0.86, 1.1, 1.34];

export function stageScale(sf: number): number {
  if (sf >= 4) return STAGE_SCALE[4] + Math.min(0.6, sf - 4) * 0.25;
  const i = Math.floor(Math.max(0, sf));
  const f = Math.max(0, sf) - i;
  return STAGE_SCALE[i] + (STAGE_SCALE[i + 1] - STAGE_SCALE[i]) * f;
}

function hsl(h: number, s: number, l: number, a = 1): string {
  const ss = Math.max(0, Math.min(100, s));
  const ll = Math.max(0, Math.min(100, l));
  return a >= 1 ? `hsl(${h},${ss}%,${ll}%)` : `hsla(${h},${ss}%,${ll}%,${a})`;
}

interface Paint {
  ctx: CanvasRenderingContext2D;
  look: PlantLook;
  rand: () => number;
  /** Pixels per tile. */
  unit: number;
  /** Overall plant scale in px (unit × species size × stage scale). */
  S: number;
  sf: number;
  mode: PlantMode;
}

// ------------------------------------------------------------ leaf shapes

type LeafShape = 'heart' | 'oval' | 'lance' | 'succulent' | 'spear' | 'spike';

/** Builds a leaf path at the origin, attached at (0,0), pointing up (−y). */
function leafPath(ctx: CanvasRenderingContext2D, shape: LeafShape, L: number, W: number, ruffle: number) {
  ctx.beginPath();
  if (shape === 'heart') {
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(W * 0.6, W * 0.4, W * 1.2, -L * 0.1, W * 0.98, -L * 0.42);
    ctx.bezierCurveTo(W * 0.8, -L * 0.72, W * 0.22, -L * 0.9, 0, -L);
    ctx.bezierCurveTo(-W * 0.22, -L * 0.9, -W * 0.8, -L * 0.72, -W * 0.98, -L * 0.42);
    ctx.bezierCurveTo(-W * 1.2, -L * 0.1, -W * 0.6, W * 0.4, 0, 0);
  } else if (shape === 'spear') {
    ctx.moveTo(-W, 0);
    ctx.lineTo(-W * 0.85, -L * 0.8);
    ctx.quadraticCurveTo(-W * 0.4, -L * 0.97, 0, -L);
    ctx.quadraticCurveTo(W * 0.4, -L * 0.97, W * 0.85, -L * 0.8);
    ctx.lineTo(W, 0);
    ctx.closePath();
  } else if (shape === 'spike') {
    ctx.moveTo(-W, 0);
    ctx.quadraticCurveTo(-W * 0.9, -L * 0.55, 0, -L);
    ctx.quadraticCurveTo(W * 0.9, -L * 0.55, W, 0);
    ctx.closePath();
  } else if (shape === 'succulent') {
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(W * 1.35, -L * 0.15, W * 1.0, -L * 0.8, 0, -L);
    ctx.bezierCurveTo(-W * 1.0, -L * 0.8, -W * 1.35, -L * 0.15, 0, 0);
  } else {
    const k = shape === 'lance' ? 0.85 : 1.15;
    if (ruffle > 0) {
      // Wavy margin: walk each side in small steps with a sine offset.
      const steps = 14;
      ctx.moveTo(0, 0);
      for (const side of [1, -1]) {
        for (let i = 1; i <= steps; i++) {
          const t = side === 1 ? i / steps : 1 - i / steps;
          const base = Math.sin(Math.PI * Math.pow(t, 0.8)) * W * k;
          const wob = Math.sin(t * Math.PI * 9) * W * 0.16 * ruffle;
          ctx.lineTo(side * (base + wob), -L * t);
        }
      }
      ctx.closePath();
    } else {
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(W * 1.1 * k, -L * 0.12, W * 1.0 * k, -L * 0.78, 0, -L);
      ctx.bezierCurveTo(-W * 1.0 * k, -L * 0.78, -W * 1.1 * k, -L * 0.12, 0, 0);
    }
  }
}

function leafFill(p: Paint, L: number, dim = 0): CanvasGradient {
  const { look, rand } = p;
  const j = (rand() - 0.5) * 8 - dim;
  const g = p.ctx.createLinearGradient(0, 0, 0, -L);
  g.addColorStop(0, hsl(look.hue, look.sat - 4, look.light - 9 + j));
  g.addColorStop(0.6, hsl(look.hue, look.sat, look.light + j));
  g.addColorStop(1, hsl(look.hue + 4, look.sat + 4, look.light + 8 + j));
  return g;
}

/** Paints the variegation pattern inside the current (already built) leaf path. */
function variegate(p: Paint, L: number, W: number, opts: { bands?: boolean } = {}) {
  const { ctx, look, rand } = p;
  if (look.variegation === 'none' || !look.variegationColor) return;
  const [vh, vs, vl] = look.variegationColor;
  const vc = (a = 1) => hsl(vh, vs, vl, a);
  ctx.save();
  ctx.clip();
  switch (look.variegation) {
    case 'marble': {
      ctx.strokeStyle = vc(0.8);
      ctx.lineCap = 'round';
      const n = 3 + Math.floor(rand() * 3);
      for (let i = 0; i < n; i++) {
        ctx.lineWidth = W * (0.08 + rand() * 0.22);
        const y0 = -L * (0.1 + rand() * 0.5);
        ctx.beginPath();
        ctx.moveTo((rand() - 0.5) * W * 0.6, y0);
        ctx.quadraticCurveTo((rand() - 0.5) * W * 2, y0 - L * 0.25, (rand() - 0.5) * W * 1.6, y0 - L * (0.3 + rand() * 0.3));
        ctx.stroke();
      }
      break;
    }
    case 'splash': {
      ctx.fillStyle = vc(0.95);
      if (rand() < 0.12) {
        ctx.fillRect(-W * 2, -L * 1.2, W * 4, L * 1.4);
      } else {
        const side = rand() < 0.5 ? -1 : 1;
        ctx.beginPath();
        ctx.ellipse(side * W * (0.3 + rand() * 0.6), -L * (0.3 + rand() * 0.4), W * (0.5 + rand() * 0.7), L * (0.2 + rand() * 0.3), rand() - 0.5, 0, Math.PI * 2);
        ctx.fill();
        if (rand() < 0.6) {
          ctx.beginPath();
          ctx.ellipse(-side * W * 0.5, -L * (0.2 + rand() * 0.6), W * 0.25, L * 0.12, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case 'edge': {
      ctx.strokeStyle = vc(0.95);
      ctx.lineWidth = Math.max(1.2, W * 0.42);
      ctx.stroke();
      break;
    }
    case 'speckle': {
      ctx.fillStyle = vc(0.9);
      const n = 10 + Math.floor(rand() * 16);
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.arc((rand() - 0.5) * W * 2, -rand() * L, W * (0.04 + rand() * 0.08), 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'stripe': {
      ctx.strokeStyle = vc(0.75);
      if (opts.bands) {
        // The floor shrinks with the leaf so bands on a small plant don't merge into one.
        ctx.lineWidth = Math.max(L * 0.035, Math.min(1, L * 0.05));
        for (let y = -L * 0.08; y > -L; y -= L * 0.11) {
          ctx.beginPath();
          ctx.moveTo(-W * 1.2, y);
          for (let x = -W; x <= W * 1.2; x += W * 0.4) ctx.lineTo(x, y + (Math.round(x / (W * 0.4)) % 2 ? L * 0.02 : -L * 0.02));
          ctx.stroke();
        }
      } else {
        ctx.lineWidth = Math.max(1, W * 0.28);
        for (const s of [-0.5, 0.5]) {
          ctx.beginPath();
          ctx.moveTo(s * W, 0);
          ctx.quadraticCurveTo(s * W * 1.2, -L * 0.5, 0, -L);
          ctx.stroke();
        }
      }
      break;
    }
    case 'veins':
    case 'glow': {
      if (look.variegation === 'glow') {
        ctx.shadowColor = vc(1);
        ctx.shadowBlur = Math.max(2, W * 0.5);
      }
      ctx.strokeStyle = vc(look.variegation === 'glow' ? 1 : 0.85);
      ctx.lineWidth = Math.max(0.8, W * 0.07);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -L * 0.95);
      for (let t = 0.14; t < 0.9; t += 0.13) {
        for (const s of [-1, 1]) {
          ctx.moveTo(0, -L * t);
          ctx.quadraticCurveTo(s * W * 0.5, -L * (t + 0.02), s * W * 1.05, -L * (t + 0.1));
        }
      }
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

interface LeafOpts {
  shape: LeafShape;
  L: number;
  W: number;
  dim?: number;
  bands?: boolean;
  midrib?: boolean;
}

/** A complete, shaded, variegated leaf at the current transform. */
function leaf(p: Paint, o: LeafOpts) {
  const { ctx, look } = p;
  const ruffle = look.ruffled ? 1 : 0;
  leafPath(ctx, o.shape, o.L, o.W, o.shape === 'oval' || o.shape === 'lance' ? ruffle : 0);
  ctx.fillStyle = leafFill(p, o.L, o.dim);
  ctx.fill();
  variegate(p, o.L, o.W, { bands: o.bands });
  leafPath(ctx, o.shape, o.L, o.W, o.shape === 'oval' || o.shape === 'lance' ? ruffle : 0);
  ctx.strokeStyle = hsl(look.hue, look.sat, look.light - 20, 0.55);
  ctx.lineWidth = Math.max(0.6, o.W * 0.05);
  ctx.stroke();
  if (o.midrib !== false && look.variegation !== 'veins' && look.variegation !== 'glow') {
    ctx.strokeStyle = hsl(look.hue, look.sat - 10, look.light - 14, 0.45);
    ctx.lineWidth = Math.max(0.6, o.W * 0.07);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -o.L * 0.9);
    ctx.stroke();
  }
}

function withTransform(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, fn: () => void) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  fn();
  ctx.restore();
}

function stemColor(look: PlantLook, dl = 0): string {
  return hsl(look.hue, Math.max(10, look.sat - 12), Math.max(12, look.light - 10 + dl));
}

function stroke(ctx: CanvasRenderingContext2D, color: string, width: number, build: () => void) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  build();
  ctx.stroke();
}

// ------------------------------------------------------------ forms

function drawFern(p: Paint) {
  const { ctx, look, rand, S, sf } = p;
  const n = Math.min(18, Math.round(4 + sf * 3.2));
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => Math.abs(b - (n - 1) / 2) - Math.abs(a - (n - 1) / 2));
  for (const i of order) {
    const bend = -1 + (2 * (i + 0.5)) / n + (rand() - 0.5) * 0.25;
    const len = S * (0.8 + rand() * 0.35) * (1 - Math.abs(bend) * 0.12);
    const droop = Math.abs(bend) * len * 0.55;
    const x2 = bend * len * 0.85;
    const y2 = -len * 0.72 + droop;
    const cx = bend * len * 0.25;
    const cy = -len * 0.95;
    const dim = Math.abs(bend) < 0.4 ? 0 : 6;
    stroke(ctx, stemColor(look, -dim), Math.max(0.8, S * 0.018), () => {
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(cx, cy, x2, y2);
    });
    const step = look.ruffled ? 0.045 : 0.062;
    const path = new Path2D();
    const gold = new Path2D();
    let k = 0;
    for (let t = 0.1; t < 0.97; t += step, k++) {
      const mt = 1 - t;
      const px = 2 * mt * t * cx + t * t * x2;
      const py = 2 * mt * t * cy + t * t * y2;
      const tx = 2 * mt * cx + 2 * t * (x2 - cx);
      const ty = 2 * mt * cy + 2 * t * (y2 - cy);
      const ang = Math.atan2(ty, tx);
      const ll = len * 0.24 * (1 - t * 0.7) * (look.ruffled ? 1.15 : 1);
      const lw = ll * 0.38;
      const target = look.variegation === 'stripe' && k % 4 < 2 ? gold : path;
      for (const s of [-1, 1]) {
        const a = ang + s * 1.15;
        const ex = px + Math.cos(a) * ll;
        const ey = py + Math.sin(a) * ll;
        const nx = -Math.sin(a) * lw;
        const ny = Math.cos(a) * lw;
        target.moveTo(px, py);
        target.quadraticCurveTo((px + ex) / 2 + nx, (py + ey) / 2 + ny, ex, ey);
        target.quadraticCurveTo((px + ex) / 2 - nx, (py + ey) / 2 - ny, px, py);
      }
    }
    ctx.fillStyle = hsl(look.hue, look.sat, look.light - dim + (rand() - 0.5) * 6);
    ctx.fill(path);
    if (look.variegationColor) {
      const [vh, vs, vl] = look.variegationColor;
      ctx.fillStyle = hsl(vh, vs, vl - 8);
      ctx.fill(gold);
    }
  }
}

function petioleLeaves(p: Paint, opts: { n: number; spread: number; stemLen: [number, number]; L: [number, number]; widthK: number; shape: LeafShape; splits?: boolean }) {
  const { ctx, look, rand, S, sf } = p;
  const leaves = Array.from({ length: opts.n }, (_, i) => {
    const t = opts.n === 1 ? 0.5 : i / (opts.n - 1);
    const a = -Math.PI / 2 + (t - 0.5) * 2 * opts.spread + (rand() - 0.5) * 0.35;
    return { a, stem: S * (opts.stemLen[0] + rand() * (opts.stemLen[1] - opts.stemLen[0])), L: S * (opts.L[0] + rand() * (opts.L[1] - opts.L[0])) };
  });
  // Outer leaves first so the upright centre sits in front.
  leaves.sort((a, b) => Math.abs(b.a + Math.PI / 2) - Math.abs(a.a + Math.PI / 2));
  for (const lf of leaves) {
    const ex = Math.cos(lf.a) * lf.stem;
    const ey = Math.sin(lf.a) * lf.stem * 0.9;
    stroke(ctx, stemColor(look), Math.max(0.8, S * 0.022), () => {
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(ex * 0.3, ey * 0.8, ex, ey);
    });
    const W = lf.L * opts.widthK * (look.leafWidth ?? 1);
    // Leaves hang off the petiole, tipping outward and a little down.
    const tilt = lf.a + Math.PI / 2 + (lf.a + Math.PI / 2) * 0.6;
    withTransform(ctx, ex, ey, tilt, () => {
      leaf(p, { shape: opts.shape, L: lf.L, W, dim: Math.abs(lf.a + Math.PI / 2) > 0.8 ? 5 : 0 });
      if (opts.splits && sf >= 1.5) {
        // Fenestration: slits from the margin toward the midrib, and holes
        // once it's older. Drawn in deep shadow so they read as gaps.
        const gap = 'rgba(16,28,18,0.88)';
        const slits = Math.min(5, 1 + Math.floor((sf - 1.5) * 2));
        ctx.strokeStyle = gap;
        ctx.lineWidth = Math.max(1, W * 0.09);
        ctx.lineCap = 'round';
        for (let k = 0; k < slits; k++) {
          const t = 0.2 + (k / Math.max(1, slits)) * 0.62;
          for (const s of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(s * W * 1.02 * Math.sin(Math.PI * t), -lf.L * t);
            ctx.lineTo(s * W * 0.32, -lf.L * (t + 0.05));
            ctx.stroke();
          }
        }
        if (sf >= 2.6) {
          ctx.fillStyle = gap;
          for (let k = 0; k < 3; k++) {
            for (const s of [-1, 1]) {
              ctx.beginPath();
              ctx.ellipse(s * W * 0.2, -lf.L * (0.3 + k * 0.18), W * 0.06, lf.L * 0.035, 0, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }
    });
  }
}

function drawSplitleaf(p: Paint) {
  const n = Math.min(8, Math.round(1 + p.sf * 1.6));
  petioleLeaves(p, { n, spread: 1.15, stemLen: [0.25, 0.5], L: [0.45, 0.6], widthK: 0.52, shape: 'heart', splits: true });
}

function drawHeart(p: Paint) {
  const n = Math.min(14, Math.round(2 + p.sf * 2.3));
  petioleLeaves(p, { n, spread: 1.3, stemLen: [0.12, 0.42], L: [0.3, 0.42], widthK: 0.48, shape: 'heart' });
}

function drawPatterned(p: Paint) {
  const n = Math.min(14, Math.round(3 + p.sf * 2.2));
  petioleLeaves(p, { n, spread: 1.35, stemLen: [0.08, 0.3], L: [0.34, 0.46], widthK: 0.36, shape: 'oval' });
  if (p.look.flowers && p.sf >= 2.4) drawSprays(p, Math.floor(p.sf - 1.5));
}

function drawSprays(p: Paint, count: number) {
  const { ctx, look, rand, S } = p;
  for (let i = 0; i < count; i++) {
    const x = (rand() - 0.5) * S * 0.5;
    const top = -S * (0.65 + rand() * 0.25);
    stroke(ctx, stemColor(look, 8), Math.max(0.7, S * 0.012), () => {
      ctx.moveTo(x * 0.3, 0);
      ctx.quadraticCurveTo(x, top * 0.5, x, top);
    });
    ctx.fillStyle = hsl(look.accentHue, look.accentSat ?? 60, look.accentLight ?? 70);
    for (let k = 0; k < 7; k++) {
      ctx.beginPath();
      ctx.arc(x + (rand() - 0.5) * S * 0.08, top + k * S * 0.03, S * 0.022, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawTrailing(p: Paint) {
  const { ctx, look, rand, S, sf, mode } = p;
  const leafL = S * 0.2;
  const vineN = Math.min(9, Math.round(2 + sf * 1.6));
  const vines: { pts: [number, number][] }[] = [];
  for (let i = 0; i < vineN; i++) {
    const len = S * (0.45 + sf * 0.28) * (0.7 + rand() * 0.45) * (mode === 'hanging' ? 1.35 : 1);
    const pts: [number, number][] = [];
    if (mode === 'ground') {
      const a = rand() * Math.PI * 2;
      const wob = (rand() - 0.5) * 1.2;
      for (let t = 0; t <= 1.001; t += 0.1) {
        const aa = a + Math.sin(t * 3) * wob * 0.4;
        pts.push([Math.cos(aa) * len * t, Math.sin(aa) * len * t * 0.55 + S * 0.02]);
      }
    } else {
      const side = i % 2 === 0 ? -1 : 1;
      const sx = side * S * (0.12 + rand() * 0.16);
      const out = side * S * (0.05 + rand() * 0.2);
      for (let t = 0; t <= 1.001; t += 0.1) {
        pts.push([sx + out * Math.sin(t * Math.PI * 0.8) + Math.sin(t * 5 + i) * S * 0.03, -S * 0.02 + len * t]);
      }
    }
    vines.push({ pts });
  }
  const drawVines = () => {
    for (const v of vines) {
      stroke(ctx, stemColor(look, -4), Math.max(0.8, S * 0.016), () => {
        ctx.moveTo(v.pts[0][0], v.pts[0][1]);
        for (const [x, y] of v.pts) ctx.lineTo(x, y);
      });
      for (let k = 1; k < v.pts.length; k++) {
        const [x, y] = v.pts[k];
        const [px, py] = v.pts[k - 1];
        const along = Math.atan2(y - py, x - px);
        const side = k % 2 === 0 ? 1 : -1;
        const sz = leafL * (1 - k * 0.04) * (0.8 + rand() * 0.3);
        withTransform(ctx, x, y, along + Math.PI / 2 + side * 1.1, () => leaf(p, { shape: 'heart', L: sz, W: sz * 0.5 * (look.leafWidth ?? 1), dim: 4 }));
      }
      if (look.flowers && sf >= 3 && v.pts.length > 6) drawStarCluster(p, v.pts[6][0], v.pts[6][1]);
    }
  };
  const drawMound = () => {
    const mound = Math.min(10, Math.round(3 + sf * 1.6));
    for (let i = 0; i < mound; i++) {
      const a = -Math.PI / 2 + (rand() - 0.5) * 2.4;
      const r = S * (0.05 + rand() * 0.14);
      const sz = leafL * (1 + rand() * 0.3);
      withTransform(ctx, Math.cos(a) * r, Math.sin(a) * r * 0.8 - S * 0.04, a + Math.PI / 2 + (rand() - 0.5) * 0.6, () =>
        leaf(p, { shape: 'heart', L: sz, W: sz * 0.5 * (look.leafWidth ?? 1) })
      );
    }
  };
  if (mode === 'ground') {
    drawVines();
    drawMound();
  } else {
    drawMound();
    drawVines();
  }
}

function drawStarCluster(p: Paint, x: number, y: number) {
  const { ctx, look, S } = p;
  ctx.fillStyle = hsl(look.accentHue, look.accentSat ?? 55, look.accentLight ?? 82);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    const cx = x + Math.cos(a) * S * 0.045;
    const cy = y + Math.sin(a) * S * 0.035;
    ctx.beginPath();
    for (let j = 0; j < 5; j++) {
      const aa = (j / 5) * Math.PI * 2 - Math.PI / 2;
      ctx.lineTo(cx + Math.cos(aa) * S * 0.025, cy + Math.sin(aa) * S * 0.025);
      ctx.lineTo(cx + Math.cos(aa + Math.PI / 5) * S * 0.01, cy + Math.sin(aa + Math.PI / 5) * S * 0.01);
    }
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(160,40,60,0.8)';
  ctx.beginPath();
  ctx.arc(x, y, S * 0.012, 0, Math.PI * 2);
  ctx.fill();
}

/** A ribbon leaf following a curve, tapering to a point. */
function ribbon(p: Paint, dir: number, len: number, width: number, upright: number, dim: number) {
  const { ctx, look, rand } = p;
  const cx = dir * len * (0.3 + (1 - upright) * 0.35);
  const cy = -len * (0.75 + upright * 0.35);
  const ex = dir * len * (0.45 + (1 - upright) * 0.6);
  const ey = -len * (0.15 + upright * 0.8);
  const n = 16;
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  const mid: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const mt = 1 - t;
    const x = 2 * mt * t * cx + t * t * ex;
    const y = 2 * mt * t * cy + t * t * ey;
    const tx = 2 * mt * cx + 2 * t * (ex - cx);
    const ty = 2 * mt * cy + 2 * t * (ey - cy);
    const l = Math.hypot(tx, ty) || 1;
    let w = width * (1 - t * 0.85);
    if (look.ruffled) w *= 1 + Math.sin(t * 22) * 0.25;
    left.push([x - (ty / l) * w, y + (tx / l) * w]);
    right.push([x + (ty / l) * w, y - (tx / l) * w]);
    mid.push([x, y]);
  }
  const build = () => {
    ctx.beginPath();
    ctx.moveTo(left[0][0], left[0][1]);
    for (const [x, y] of left) ctx.lineTo(x, y);
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
    ctx.closePath();
  };
  build();
  ctx.fillStyle = hsl(look.hue, look.sat, look.light - dim + (rand() - 0.5) * 6);
  ctx.fill();
  if (look.variegationColor && (look.variegation === 'stripe' || look.variegation === 'edge')) {
    const [vh, vs, vl] = look.variegationColor;
    ctx.save();
    build();
    ctx.clip();
    ctx.strokeStyle = hsl(vh, vs, vl, 0.95);
    if (look.variegation === 'stripe') {
      ctx.lineWidth = width * 0.7;
      ctx.beginPath();
      mid.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    } else {
      ctx.lineWidth = width * 0.55;
      build();
      ctx.stroke();
    }
    ctx.restore();
  }
  build();
  ctx.strokeStyle = hsl(look.hue, look.sat, look.light - 22, 0.5);
  ctx.lineWidth = Math.max(0.5, width * 0.12);
  ctx.stroke();
}

function drawStrappy(p: Paint) {
  const { ctx, look, rand, S, sf } = p;
  const wide = (look.leafWidth ?? 1) > 1.4;
  const n = wide ? Math.min(12, Math.round(3 + sf * 2)) : Math.min(26, Math.round(5 + sf * 4));
  const blades = Array.from({ length: n }, (_, i) => ({
    dir: (i % 2 === 0 ? -1 : 1) * (0.2 + rand() * 0.8),
    len: S * (wide ? 0.75 + rand() * 0.3 : 0.7 + rand() * 0.4),
    up: wide ? 0.6 + rand() * 0.35 : 0.35 + rand() * 0.55,
  })).sort((a, b) => a.up - b.up);
  for (const b of blades) ribbon(p, b.dir, b.len, S * (wide ? 0.085 : 0.045) * (look.leafWidth ?? 1) * (wide ? 0.6 : 1), b.up, b.up < 0.4 ? 6 : 0);
  if (!wide && sf >= 3) {
    // Runners with baby plantlets dangling off the ends.
    const runners = Math.min(4, Math.floor(sf - 1.5));
    for (let i = 0; i < runners; i++) {
      const dir = i % 2 === 0 ? -1 : 1;
      const ex = dir * S * (0.7 + rand() * 0.3);
      const ey = -S * 0.05 + (p.mode === 'ground' ? 0 : S * 0.3);
      stroke(ctx, hsl(look.accentHue, 30, 70), Math.max(0.6, S * 0.01), () => {
        ctx.moveTo(0, -S * 0.1);
        ctx.quadraticCurveTo(dir * S * 0.45, -S * 0.55, ex, ey);
      });
      ctx.save();
      ctx.translate(ex, ey);
      for (let k = 0; k < 5; k++) ribbon({ ...p, S: S * 0.3 }, (k % 2 ? 1 : -1) * (0.3 + rand() * 0.6), S * 0.14, S * 0.012, 0.3 + rand() * 0.4, 0);
      ctx.restore();
    }
  }
  if (wide) {
    // Fuzzy nest at the heart of a bird's nest fern.
    ctx.fillStyle = hsl(30, 35, 25);
    ctx.beginPath();
    ctx.ellipse(0, -S * 0.03, S * 0.09, S * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSpear(p: Paint) {
  const { look, rand, S, sf } = p;
  if ((look.leafWidth ?? 1) >= 1.15) return drawLadder(p);
  const n = Math.min(13, Math.round(2 + sf * 2.2));
  const blades = Array.from({ length: n }, (_, i) => ({ x: (rand() - 0.5) * S * 0.28, a: (rand() - 0.5) * 0.7, h: S * (0.55 + rand() * 0.45) * (i === 0 ? 1.1 : 1) })).sort(
    (a, b) => Math.abs(b.a) - Math.abs(a.a)
  );
  for (const b of blades) {
    withTransform(p.ctx, b.x, 0, b.a, () => leaf(p, { shape: 'spear', L: b.h, W: S * 0.07, bands: look.variegation === 'stripe', midrib: false, dim: Math.abs(b.a) > 0.25 ? 5 : 0 }));
  }
}

function drawLadder(p: Paint) {
  const { ctx, look, rand, S, sf } = p;
  const n = Math.min(10, Math.round(2 + sf * 1.7));
  for (let i = 0; i < n; i++) {
    const a = (rand() - 0.5) * 1.0;
    const h = S * (0.5 + rand() * 0.45);
    withTransform(ctx, (rand() - 0.5) * S * 0.15, 0, a, () => {
      stroke(ctx, stemColor(look, -6), Math.max(1, S * 0.03), () => {
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -h);
      });
      for (let t = 0.3; t <= 1.0; t += 0.12) {
        for (const s of [-1, 1]) {
          withTransform(ctx, 0, -h * t, s * (0.9 - t * 0.3), () => leaf(p, { shape: 'oval', L: S * 0.13, W: S * 0.045 }));
        }
      }
      withTransform(ctx, 0, -h, 0, () => leaf(p, { shape: 'oval', L: S * 0.13, W: S * 0.045 }));
    });
  }
}

function rosette(p: Paint, cx: number, cy: number, R: number, layers: number) {
  const { ctx, look, rand } = p;
  for (let layer = 0; layer < layers; layer++) {
    const t = layer / Math.max(1, layers);
    const count = 7 + (layer % 2);
    const L = R * (1 - t * 0.55);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + layer * 0.4 + rand() * 0.1;
      withTransform(ctx, cx, cy, a + Math.PI / 2, () => {
        ctx.scale(1, 0.62);
        leaf(p, { shape: 'succulent', L, W: L * 0.36, dim: (layers - layer) * 3, midrib: false });
        // Blushing tips.
        ctx.fillStyle = hsl(look.accentHue, look.accentSat ?? 45, look.accentLight ?? 70, 0.7);
        ctx.beginPath();
        ctx.arc(0, -L * 0.93, L * 0.07, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }
  ctx.fillStyle = hsl(look.hue, look.sat, look.light + 10);
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.12, 0, Math.PI * 2);
  ctx.fill();
}

function drawRosette(p: Paint) {
  const { look, rand, S, sf } = p;
  if (look.ruffled) {
    // Cristata: the growing point smeared into a wavy crest.
    const segs = Math.round(4 + sf * 3);
    for (let i = 0; i < segs; i++) {
      const t = i / Math.max(1, segs - 1) - 0.5;
      rosette(p, t * S * 1.1, -S * 0.14 - Math.sin(t * 6) * S * 0.1, S * 0.28, 2);
    }
    return;
  }
  const pups = sf >= 2 ? Math.min(6, Math.floor((sf - 1.5) * 2)) : 0;
  for (let i = 0; i < pups; i++) {
    const a = (i / Math.max(1, pups)) * Math.PI * 2 + rand();
    rosette(p, Math.cos(a) * S * 0.55, Math.sin(a) * S * 0.25 - S * 0.05, S * (0.2 + rand() * 0.08), 2);
  }
  rosette(p, 0, -S * 0.12, S * 0.52, 2 + Math.floor(sf / 1.5));
}

function drawCoin(p: Paint) {
  const { ctx, look, rand, S, sf } = p;
  const n = Math.min(16, Math.round(3 + sf * 3));
  const trunk = S * (0.1 + sf * 0.06);
  stroke(ctx, stemColor(look, -4), Math.max(1, S * 0.035), () => {
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -trunk);
  });
  const leaves = Array.from({ length: n }, () => ({ a: -Math.PI / 2 + (rand() - 0.5) * 2.7, len: S * (0.25 + rand() * 0.3), r: S * (0.1 + rand() * 0.06) })).sort(
    (a, b) => Math.sin(a.a) - Math.sin(b.a)
  );
  for (const lf of leaves) {
    const ex = Math.cos(lf.a) * lf.len;
    const ey = -trunk + Math.sin(lf.a) * lf.len * 0.85;
    stroke(ctx, stemColor(look, 4), Math.max(0.6, S * 0.012), () => {
      ctx.moveTo(0, -trunk);
      ctx.quadraticCurveTo(ex * 0.5, -trunk + (ey + trunk) * 0.2 - S * 0.08, ex, ey);
    });
    ctx.save();
    ctx.translate(ex, ey);
    ctx.scale(1, 0.8);
    ctx.beginPath();
    ctx.arc(0, 0, lf.r, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(-lf.r * 0.3, -lf.r * 0.3, 0, 0, 0, lf.r);
    g.addColorStop(0, hsl(look.hue, look.sat, look.light + 9));
    g.addColorStop(1, hsl(look.hue, look.sat, look.light - 6));
    ctx.fillStyle = g;
    ctx.fill();
    variegate(p, lf.r * 2, lf.r);
    ctx.beginPath();
    ctx.arc(0, 0, lf.r, 0, Math.PI * 2);
    ctx.strokeStyle = hsl(look.hue, look.sat, look.light - 20, 0.5);
    ctx.lineWidth = Math.max(0.5, lf.r * 0.08);
    ctx.stroke();
    ctx.fillStyle = hsl(look.hue, look.sat, look.light - 16, 0.6);
    ctx.beginPath();
    ctx.arc(0, 0, lf.r * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawBeads(p: Paint) {
  const { ctx, look, rand, S, sf, mode } = p;
  const strands = Math.min(12, Math.round(3 + sf * 2));
  const r = S * 0.036;
  const beads: [number, number][] = [];
  for (let i = 0; i < strands; i++) {
    const len = S * (0.35 + sf * 0.22) * (0.7 + rand() * 0.5) * (mode === 'hanging' ? 1.4 : 1);
    const a = rand() * Math.PI * 2;
    const side = i % 2 === 0 ? -1 : 1;
    const pts: [number, number][] = [];
    for (let d = 0; d <= len; d += r * 2.1) {
      const t = d / len;
      if (mode === 'ground') pts.push([Math.cos(a + Math.sin(t * 4) * 0.3) * d, Math.sin(a) * d * 0.5 + S * 0.02]);
      else pts.push([side * S * 0.15 + side * Math.sin(t * 2) * S * 0.12 + Math.sin(t * 7 + i) * S * 0.02, d - S * 0.03]);
    }
    stroke(ctx, stemColor(look, 10), Math.max(0.5, S * 0.008), () => pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))));
    beads.push(...pts);
  }
  for (let i = 0; i < 6 + sf * 3; i++) beads.push([(rand() - 0.5) * S * 0.3, -rand() * S * 0.15]);
  for (const [x, y] of beads) {
    const pink = look.variegation === 'splash' && rand() < 0.35;
    const [vh, vs, vl] = look.variegationColor ?? [0, 0, 0];
    ctx.fillStyle = pink ? hsl(vh, vs, vl) : hsl(look.hue, look.sat, look.light + (rand() - 0.5) * 8);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBloom(p: Paint) {
  const { ctx, look, rand, S, sf } = p;
  const n = Math.min(14, Math.round(3 + sf * 2.4));
  const leaves = Array.from({ length: n }, () => ({ a: (rand() - 0.5) * 1.6, L: S * (0.42 + rand() * 0.22) })).sort((a, b) => Math.abs(b.a) - Math.abs(a.a));
  for (const lf of leaves) {
    withTransform(ctx, 0, 0, lf.a, () => leaf(p, { shape: 'lance', L: lf.L, W: lf.L * 0.2, dim: Math.abs(lf.a) > 0.5 ? 5 : 0 }));
  }
  if (!look.flowers || sf < 1.8) return;
  const flowers = Math.min(7, Math.floor((sf - 1.2) * 1.8));
  for (let i = 0; i < flowers; i++) {
    const x = (rand() - 0.5) * S * 0.45;
    const top = -S * (0.72 + rand() * 0.22);
    stroke(ctx, stemColor(look, 6), Math.max(0.7, S * 0.014), () => {
      ctx.moveTo(x * 0.2, 0);
      ctx.quadraticCurveTo(x * 0.8, top * 0.6, x, top);
    });
    withTransform(ctx, x, top + S * 0.02, (rand() - 0.5) * 0.4, () => {
      ctx.fillStyle = hsl(look.accentHue, look.accentSat ?? 20, look.accentLight ?? 95);
      leafPath(ctx, 'oval', S * 0.2, S * 0.08, 0);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.fillStyle = hsl(52, 70, 70);
      ctx.beginPath();
      ctx.ellipse(0, -S * 0.08, S * 0.016, S * 0.05, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

// ------------------------------------------------------------ cacti & succulents

function spineColor(look: PlantLook, a = 1): string {
  const [h, s, l] = look.spines ?? [50, 30, 88];
  return hsl(h, s, l, a);
}

/** A woolly areole at (x, y) with a tuft of spines (none when len is 0). */
function areole(p: Paint, x: number, y: number, len: number, dot: number) {
  const { ctx, look, rand } = p;
  ctx.fillStyle = spineColor(look, 0.95);
  ctx.beginPath();
  ctx.arc(x, y, dot, 0, Math.PI * 2);
  ctx.fill();
  if (len <= 0) return;
  ctx.strokeStyle = spineColor(look, 0.8);
  ctx.lineWidth = Math.max(0.35, len * 0.08);
  ctx.lineCap = 'round';
  ctx.beginPath();
  const n = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len * 0.75);
  }
  ctx.stroke();
}

function cactusFlower(p: Paint, x: number, y: number, r: number) {
  const { ctx, look } = p;
  const petal = hsl(look.accentHue, look.accentSat ?? 75, look.accentLight ?? 64);
  for (let i = 0; i < 8; i++) {
    const a = (i / 7 - 0.5) * 2.4;
    withTransform(ctx, x, y, a, () => {
      ctx.fillStyle = petal;
      leafPath(ctx, 'lance', r * 1.3, r * 0.34, 0);
      ctx.fill();
    });
  }
  ctx.fillStyle = hsl(52, 80, 72);
  ctx.beginPath();
  ctx.arc(x, y - r * 0.25, r * 0.28, 0, Math.PI * 2);
  ctx.fill();
}

function columnPath(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.beginPath();
  ctx.moveTo(-w * 0.92, 0);
  ctx.lineTo(-w, -h + w);
  ctx.bezierCurveTo(-w, -h - w * 0.28, w, -h - w * 0.28, w, -h + w);
  ctx.lineTo(w * 0.92, 0);
  ctx.closePath();
}

/** One ribbed, spined cactus stem of half-width w and height h, rising from (0,0). */
function cactusColumn(p: Paint, w: number, h: number, ribs: number) {
  const { ctx, look, rand } = p;
  columnPath(ctx, w, h);
  const g = ctx.createLinearGradient(-w, 0, w, 0);
  g.addColorStop(0, hsl(look.hue, look.sat - 6, look.light - 12));
  g.addColorStop(0.38, hsl(look.hue, look.sat, look.light + 6));
  g.addColorStop(1, hsl(look.hue, look.sat - 4, look.light - 14));
  ctx.fillStyle = g;
  ctx.fill();
  variegate(p, h, w);
  // Ribs are meridians seen side-on, so they bunch up toward the edges.
  const ribX = (t: number) => Math.sin((t - 0.5) * Math.PI) * w * 0.92;
  for (let j = 0; j < ribs; j++) {
    const x = ribX((j + 0.5) / ribs);
    stroke(ctx, hsl(look.hue, look.sat, look.light - 18, 0.5), Math.max(0.5, w * 0.06), () => {
      ctx.moveTo(x * 0.92, 0);
      ctx.lineTo(x, -h + w);
      ctx.quadraticCurveTo(x, -h + w * 0.1, x * 0.2, -h + w * 0.05);
    });
  }
  const spine = look.spineLength ?? 1;
  for (let j = 1; j < ribs; j++) {
    const x = ribX(j / ribs);
    const face = 1 - Math.abs(x / w) * 0.5;
    for (let y = w * 0.4; y < h - w * 0.3; y += w * 0.55) {
      areole(p, x, -y, w * 0.34 * spine * face, Math.max(0.4, w * 0.06));
    }
  }
  columnPath(ctx, w, h);
  ctx.strokeStyle = hsl(look.hue, look.sat, look.light - 24, 0.6);
  ctx.lineWidth = Math.max(0.5, w * 0.05);
  ctx.stroke();
  if (look.hairy) {
    ctx.strokeStyle = spineColor(look, 0.8);
    ctx.lineWidth = Math.max(0.4, w * 0.05);
    ctx.lineCap = 'round';
    const n = Math.round((h / w) * 7);
    for (let i = 0; i < n; i++) {
      const x = (rand() - 0.5) * w * 2;
      const y = -w * 0.2 - rand() * (h - w * 0.2);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + (rand() - 0.5) * w, y + w * 0.5, x + (rand() - 0.5) * w * 1.4, y + w, x + (rand() - 0.5) * w * 1.2, y + w * (1.1 + rand()));
      ctx.stroke();
    }
    ctx.fillStyle = spineColor(look, 0.7);
    ctx.beginPath();
    ctx.ellipse(0, -h + w * 0.1, w * 0.75, w * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawColumn(p: Paint) {
  const { ctx, look, rand, S, sf } = p;
  const n = Math.min(7, 1 + Math.floor(sf * 1.4));
  const stems = Array.from({ length: n }, (_, i) => ({
    x: i === 0 ? 0 : (rand() - 0.5) * S * 0.62,
    h: S * (i === 0 ? 1.0 : 0.4 + rand() * 0.5),
    w: S * (0.1 + rand() * 0.025) * (look.leafWidth ?? 1),
    arm: rand(),
    flower: rand(),
  })).sort((a, b) => b.h - a.h);
  for (const s of stems) {
    withTransform(ctx, s.x, 0, (s.x / S) * 0.25, () => {
      // Older, taller stems throw out an elbowed arm, drawn behind the stem.
      if (sf >= 2.6 && s.h > S * 0.7 && s.arm < 0.6) {
        const side = s.arm < 0.3 ? -1 : 1;
        const ay = -s.h * (0.35 + s.arm * 0.3);
        const aw = s.w * 0.72;
        withTransform(ctx, side * s.w * 0.5, ay, (side * Math.PI) / 2, () => cactusColumn(p, aw, s.w * 1.5, 3));
        withTransform(ctx, side * s.w * 1.75, ay + aw * 0.9, 0, () => cactusColumn(p, aw, s.h * 0.42, 4));
      }
      cactusColumn(p, s.w, s.h, 5);
      if (look.flowers && sf >= 2.4 && s.flower < 0.6) cactusFlower(p, 0, -s.h - s.w * 0.1, s.w * 0.9);
    });
  }
}

/** A ribbed ball cactus of radius R sitting on (cx, cy). */
function cactusGlobe(p: Paint, cx: number, cy: number, R: number, ribs: number) {
  const { ctx, look } = p;
  const ry = R * 0.9;
  withTransform(ctx, cx, cy, 0, () => {
    const body = () => {
      ctx.beginPath();
      ctx.ellipse(0, -ry, R, ry, 0, 0, Math.PI * 2);
    };
    body();
    const g = ctx.createRadialGradient(-R * 0.35, -ry * 1.4, R * 0.1, 0, -ry, R * 1.05);
    g.addColorStop(0, hsl(look.hue, look.sat, look.light + 10));
    g.addColorStop(0.7, hsl(look.hue, look.sat, look.light - 2));
    g.addColorStop(1, hsl(look.hue, look.sat - 6, look.light - 16));
    ctx.fillStyle = g;
    ctx.fill();
    body();
    variegate(p, ry * 2, R);
    const meridian = (t: number, phi: number): [number, number] => [R * t * Math.cos(phi), -ry - ry * Math.sin(phi)];
    for (let j = 0; j < ribs; j++) {
      const t = Math.sin(((j + 0.5) / ribs - 0.5) * Math.PI);
      stroke(ctx, hsl(look.hue, look.sat, look.light - 18, 0.5), Math.max(0.5, R * 0.025), () => {
        for (let k = 0; k <= 12; k++) {
          const [x, y] = meridian(t, -Math.PI / 2 + (k / 12) * Math.PI);
          if (k) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
      });
    }
    const spine = look.spineLength ?? 1;
    for (let j = 1; j < ribs; j++) {
      const t = Math.sin((j / ribs - 0.5) * Math.PI);
      for (let phi = -0.9; phi < 1.35; phi += 0.32) {
        const [x, y] = meridian(t, phi);
        areole(p, x, y, R * 0.24 * spine * (1 - Math.abs(t) * 0.4), Math.max(0.4, R * 0.035));
      }
    }
    body();
    ctx.strokeStyle = hsl(look.hue, look.sat, look.light - 24, 0.6);
    ctx.lineWidth = Math.max(0.5, R * 0.025);
    ctx.stroke();
    if (look.spines && spine > 0) {
      // The woolly crown where new spines come from.
      ctx.fillStyle = spineColor(look, 0.6);
      ctx.beginPath();
      ctx.ellipse(0, -ry * 1.92, R * 0.2, R * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function drawGlobe(p: Paint) {
  const { look, rand, S, sf } = p;
  const R = S * 0.36 * (look.leafWidth ?? 1);
  if (look.grafted) {
    // A plain green rootstock with the bright, chlorophyll-less ball perched on top.
    const stock: PlantLook = { ...look, hue: 115, sat: 40, light: 36, variegation: 'none', spines: [50, 20, 80], spineLength: 0.5, flowers: false };
    const sh = S * (0.3 + Math.min(sf, 4) * 0.07);
    cactusColumn({ ...p, look: stock }, S * 0.085, sh, 3);
    cactusGlobe(p, 0, -sh + S * 0.06, R * 0.62, 9);
    if (look.flowers && sf >= 2.6) cactusFlower(p, 0, -sh - R * 1.05, R * 0.2);
    return;
  }
  const pups = sf >= 2.2 ? Math.min(5, Math.floor((sf - 1.8) * 2)) : 0;
  const around = Array.from({ length: pups }, (_, i) => {
    const a = (i / Math.max(1, pups)) * Math.PI * 2 + rand();
    return { x: Math.cos(a) * R * 1.15, y: Math.sin(a) * R * 0.3, r: R * (0.3 + rand() * 0.15) };
  });
  for (const b of around.filter((b) => b.y < 0)) cactusGlobe(p, b.x, b.y, b.r, 8);
  cactusGlobe(p, 0, 0, R, 12);
  for (const b of around.filter((b) => b.y >= 0)) cactusGlobe(p, b.x, b.y, b.r, 8);
  if (look.flowers && sf >= 2.6) {
    const k = Math.min(4, Math.floor(sf - 1.5));
    for (let i = 0; i < k; i++) cactusFlower(p, (i - (k - 1) / 2) * R * 0.3, -R * 1.7, R * 0.17);
  }
}

/** One flat pad of half-width w and height h, standing on (0,0). */
function cactusPad(p: Paint, w: number, h: number) {
  const { ctx, look } = p;
  const ry = h / 2;
  const body = () => {
    ctx.beginPath();
    ctx.ellipse(0, -ry, w, ry, 0, 0, Math.PI * 2);
  };
  body();
  const g = ctx.createRadialGradient(-w * 0.3, -ry * 1.3, w * 0.1, 0, -ry, ry * 1.1);
  g.addColorStop(0, hsl(look.hue, look.sat, look.light + 9));
  g.addColorStop(1, hsl(look.hue, look.sat - 4, look.light - 10));
  ctx.fillStyle = g;
  ctx.fill();
  body();
  variegate(p, h, w);
  body();
  ctx.strokeStyle = hsl(look.hue, look.sat, look.light - 22, 0.55);
  ctx.lineWidth = Math.max(0.5, w * 0.05);
  ctx.stroke();
  const spine = look.spineLength ?? 1;
  let row = 0;
  for (let y = -h * 0.12; y > -h * 0.92; y -= h * 0.15, row++) {
    for (let x = -w + (row % 2) * w * 0.28; x < w; x += w * 0.56) {
      const nx = x / w;
      const ny = (y + ry) / ry;
      if (nx * nx + ny * ny < 0.72) areole(p, x, y, w * 0.2 * spine, Math.max(0.5, w * 0.07));
    }
  }
}

function drawPaddle(p: Paint) {
  const { ctx, look, rand, S, sf } = p;
  const pw = S * 0.19 * (look.leafWidth ?? 1);
  const ph = S * 0.3;
  const n = Math.min(13, 1 + Math.round(sf * 2.6));
  const pads = [{ x: 0, y: 0, a: (rand() - 0.5) * 0.2, k: 1, depth: 0 }];
  while (pads.length < n) {
    const parent = pads[Math.floor(rand() * pads.length)];
    if (parent.depth >= 3) continue;
    const side = rand() < 0.5 ? -1 : 1;
    const rim = parent.a + side * (0.25 + rand() * 0.35);
    const top = ph * parent.k * 0.9;
    pads.push({
      x: parent.x + Math.sin(rim) * top,
      y: parent.y - Math.cos(rim) * top,
      a: Math.max(-1.3, Math.min(1.3, parent.a + side * (0.35 + rand() * 0.55))),
      k: parent.k * (0.76 + rand() * 0.12),
      depth: parent.depth + 1,
    });
  }
  for (const pad of pads) withTransform(ctx, pad.x, pad.y, pad.a, () => cactusPad(p, pw * pad.k, ph * pad.k));
  if (look.flowers && sf >= 3) {
    for (const pad of pads.filter((q) => q.depth >= 2).slice(0, 4)) {
      withTransform(ctx, pad.x, pad.y, pad.a, () => cactusFlower(p, 0, -ph * pad.k * 0.98, pw * pad.k * 0.45));
    }
  }
}

function drawJade(p: Paint) {
  const { ctx, look, rand, S, sf } = p;
  // Young stems are green; older wood browns and thickens.
  const age = Math.min(1, sf / 3.5);
  const bark = hsl(look.hue + (28 - look.hue) * age, 22 + (1 - age) * 10, 30 + (1 - age) * 6);
  const tips: [number, number, number][] = [];
  const branch = (x: number, y: number, a: number, len: number, width: number, depth: number) => {
    const ex = x + Math.sin(a) * len;
    const ey = y - Math.cos(a) * len;
    stroke(ctx, bark, width, () => {
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.sin(a) * len * 0.5 + (rand() - 0.5) * len * 0.25, y - Math.cos(a) * len * 0.5, ex, ey);
    });
    if (depth <= 0) {
      tips.push([ex, ey, a]);
      return;
    }
    const kids = rand() < 0.3 ? 3 : 2;
    for (let k = 0; k < kids; k++) branch(ex, ey, a + (k - (kids - 1) / 2) * (0.55 + rand() * 0.3), len * (0.62 + rand() * 0.15), width * 0.68, depth - 1);
  };
  const depth = sf < 1 ? 0 : sf < 2.2 ? 1 : sf < 3.4 ? 2 : 3;
  branch(0, 0, (rand() - 0.5) * 0.15, S * (0.18 + Math.min(sf, 4) * 0.06), Math.max(1, S * (0.035 + Math.min(sf, 4) * 0.012)), depth);
  const narrow = (look.leafWidth ?? 1) < 0.7;
  for (const [x, y, a] of tips) {
    const n = 4 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const L = S * (0.12 + rand() * 0.05);
      withTransform(ctx, x, y, a + (i / (n - 1) - 0.5) * 2.4, () => {
        leaf(p, { shape: 'succulent', L, W: L * 0.44 * (look.leafWidth ?? 1), midrib: false, dim: i % 2 ? 4 : 0 });
        // Gollum's tube leaves end in a little red suction cup; the rest just blush.
        ctx.fillStyle = hsl(look.accentHue, look.accentSat ?? 55, look.accentLight ?? 50, narrow ? 0.85 : 0.35);
        ctx.beginPath();
        ctx.ellipse(0, -L * 0.94, L * (narrow ? 0.12 : 0.1), L * 0.06, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }
}

function drawSpiky(p: Paint) {
  const { ctx, look, rand, S, sf } = p;
  const pups = sf >= 2.5 ? Math.min(4, Math.floor((sf - 2) * 2)) : 0;
  for (let i = 0; i < pups; i++) {
    const side = i % 2 ? 1 : -1;
    withTransform(ctx, side * S * (0.55 + rand() * 0.2), S * (rand() - 0.5) * 0.1, 0, () => drawSpiky({ ...p, S: S * (0.4 + rand() * 0.12), sf: 1 }));
  }
  const n = Math.min(18, Math.round(4 + sf * 3));
  const W = S * 0.075 * (look.leafWidth ?? 1);
  const blades = Array.from({ length: n }, () => {
    const a = (rand() - 0.5) * 2.5;
    return { a, L: S * (0.45 + rand() * 0.3) * (1 - Math.abs(a) * 0.2) };
  }).sort((a, b) => Math.abs(b.a) - Math.abs(a.a));
  for (const b of blades) {
    withTransform(ctx, Math.sin(b.a) * S * 0.04, 0, b.a, () => {
      leaf(p, { shape: 'spike', L: b.L, W, bands: look.variegation === 'stripe', midrib: false, dim: Math.abs(b.a) > 0.7 ? 6 : 0 });
      if (!look.spines) return;
      // Soft teeth along both margins.
      ctx.strokeStyle = spineColor(look, 0.85);
      ctx.lineWidth = Math.max(0.4, W * 0.08);
      ctx.beginPath();
      for (let t = 0.12; t < 0.85; t += 0.1) {
        for (const s of [-1, 1]) {
          const u = 1 - t;
          const x = s * (u * u * W + 2 * u * t * W * 0.9);
          const y = -2 * u * t * b.L * 0.55 - t * t * b.L;
          ctx.moveTo(x, y);
          ctx.lineTo(x + s * W * 0.22, y - W * 0.12);
        }
      }
      ctx.stroke();
    });
  }
  if (!look.flowers || sf < 3) return;
  // A tall flower spike hung with tubular blooms.
  const top = -S * 1.3;
  stroke(ctx, stemColor(look, 4), Math.max(0.8, S * 0.018), () => {
    ctx.moveTo(0, -S * 0.2);
    ctx.quadraticCurveTo(S * 0.05, top * 0.6, 0, top);
  });
  ctx.fillStyle = hsl(look.accentHue, look.accentSat ?? 80, look.accentLight ?? 60);
  for (let i = 0; i < 9; i++) {
    const y = top + i * S * 0.035;
    const x = (i % 2 ? 1 : -1) * S * 0.025;
    ctx.beginPath();
    ctx.ellipse(x, y + S * 0.03, S * 0.014, S * 0.04, x > 0 ? 0.4 : -0.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A living stone: two fat leaves pressed into a squat dome, split down the middle. */
function stone(p: Paint, r: number) {
  const { ctx, look, rand } = p;
  const h = r * 1.2;
  for (const s of [-1, 1]) {
    const body = () => {
      ctx.beginPath();
      ctx.moveTo(s * r * 0.04, 0);
      ctx.lineTo(s * r * 0.95, 0);
      ctx.bezierCurveTo(s * r * 1.05, -h * 0.6, s * r * 0.85, -h, s * r * 0.45, -h);
      ctx.quadraticCurveTo(s * r * 0.1, -h, s * r * 0.04, -h * 0.82);
      ctx.closePath();
    };
    body();
    const g = ctx.createLinearGradient(0, -h, 0, 0);
    g.addColorStop(0, hsl(look.hue, look.sat, look.light + 8));
    g.addColorStop(1, hsl(look.hue, look.sat - 6, look.light - 14));
    ctx.fillStyle = g;
    ctx.fill();
    body();
    variegate(p, h, r);
    // The translucent "window" on top, mottled like the stones it hides among.
    body();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = hsl(look.accentHue, look.accentSat ?? 25, look.accentLight ?? 40, 0.55);
    ctx.beginPath();
    ctx.ellipse(s * r * 0.5, -h * 0.94, r * 0.42, h * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hsl(look.accentHue, look.accentSat ?? 25, (look.accentLight ?? 40) - 12, 0.6);
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(s * r * (0.2 + rand() * 0.6), -h * (0.82 + rand() * 0.14), r * (0.04 + rand() * 0.05), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    body();
    ctx.strokeStyle = hsl(look.hue, look.sat, look.light - 26, 0.6);
    ctx.lineWidth = Math.max(0.5, r * 0.04);
    ctx.stroke();
  }
}

function drawStones(p: Paint) {
  const { ctx, look, rand, S, sf } = p;
  const n = Math.min(7, 1 + Math.floor(sf * 1.3));
  const r = S * 0.17;
  const bodies = Array.from({ length: n }, (_, i) =>
    i === 0 ? { x: 0, y: 0, k: 1 } : { x: (rand() - 0.5) * S * 0.75, y: (rand() - 0.5) * S * 0.18, k: 0.75 + rand() * 0.3 }
  ).sort((a, b) => a.y - b.y);
  for (const b of bodies) withTransform(ctx, b.x, b.y, 0, () => stone(p, r * b.k));
  if (!look.flowers || sf < 2.8) return;
  // Daisies push up out of the split.
  for (const b of bodies.slice(-Math.min(3, Math.floor(sf - 1.8)))) {
    const cx = b.x;
    const cy = b.y - r * b.k * 1.25;
    for (let i = 0; i < 14; i++) {
      withTransform(ctx, cx, cy, (i / 14) * Math.PI * 2, () => {
        ctx.fillStyle = hsl(50, 90, 66);
        ctx.scale(1, 0.6);
        leafPath(ctx, 'lance', r * 0.55, r * 0.07, 0);
        ctx.fill();
      });
    }
    ctx.fillStyle = hsl(42, 80, 55);
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.14, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** One narrow, saw-edged leaflet pointing up from the origin. */
function serratedLeaflet(p: Paint, L: number, W: number, dim: number) {
  const { ctx, look } = p;
  const teeth = Math.max(4, Math.round(L / Math.max(1.2, W * 0.9)));
  const build = () => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    // Right edge up, with small forward-pointing teeth.
    for (let i = 1; i <= teeth; i++) {
      const t = i / teeth;
      const w = Math.sin(Math.PI * Math.min(1, t * 1.05)) * W * 0.5;
      ctx.lineTo(w + W * 0.08, -L * (t - 0.5 / teeth));
      ctx.lineTo(w * 0.8, -L * t);
    }
    ctx.lineTo(0, -L * 1.02);
    for (let i = teeth; i >= 1; i--) {
      const t = i / teeth;
      const w = Math.sin(Math.PI * Math.min(1, t * 1.05)) * W * 0.5;
      ctx.lineTo(-w * 0.8, -L * t);
      ctx.lineTo(-w - W * 0.08, -L * (t - 0.5 / teeth));
    }
    ctx.closePath();
  };
  build();
  ctx.fillStyle = leafFill(p, L, dim);
  ctx.fill();
  ctx.strokeStyle = hsl(look.hue, look.sat, look.light - 18, 0.5);
  ctx.lineWidth = Math.max(0.5, W * 0.06);
  ctx.stroke();
  ctx.strokeStyle = hsl(look.hue, look.sat - 12, look.light + 10, 0.55);
  ctx.lineWidth = Math.max(0.5, W * 0.08);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -L * 0.92);
  ctx.stroke();
}

/** A palmate leaf: an odd number of leaflets fanned from the end of a petiole, longest in the middle. */
function palmateLeaf(p: Paint, size: number, dim: number) {
  const { ctx, rand, look } = p;
  const n = size > p.S * 0.3 ? 7 : 5;
  const spread = 2.3 + rand() * 0.3;
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1) - 0.5;
    const L = size * (1 - Math.abs(k) * 1.05);
    withTransform(ctx, 0, 0, k * spread, () => serratedLeaflet(p, L, L * 0.2 * (look.leafWidth ?? 1), dim + Math.abs(k) * 6));
  }
}

function drawPalmate(p: Paint) {
  const { ctx, look, rand, S, sf } = p;
  const height = S * (0.7 + Math.min(4.4, sf) * 0.2);
  const stems = sf < 1.5 ? 1 : sf < 3 ? 2 : 3;
  const stem = stemColor(look, 4);
  for (let s = 0; s < stems; s++) {
    const lean = (s - (stems - 1) / 2) * 0.28 + (rand() - 0.5) * 0.08;
    const h = height * (s === Math.floor(stems / 2) ? 1 : 0.78 + rand() * 0.1);
    const tipX = Math.sin(lean) * h;
    const tipY = -Math.cos(lean) * h;
    stroke(ctx, stem, Math.max(1, S * 0.03), () => {
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(tipX * 0.4, tipY * 0.55, tipX, tipY);
    });
    // Leaves in opposite pairs up the stem, shrinking toward the top.
    const nodes = Math.max(1, Math.min(5, Math.round(1 + sf)));
    for (let i = 0; i < nodes; i++) {
      const t = 0.3 + (i / nodes) * 0.62;
      const nx = tipX * t * (0.4 + 0.6 * t);
      const ny = tipY * t;
      const size = S * (0.42 - t * 0.2) * (0.9 + rand() * 0.2);
      for (const side of [-1, 1]) {
        const petiole = size * 0.35;
        const a = side * (0.95 + rand() * 0.25) + lean;
        const px = nx + Math.sin(a) * petiole;
        const py = ny - Math.cos(a) * petiole * 0.7;
        stroke(ctx, stem, Math.max(0.6, S * 0.012), () => {
          ctx.moveTo(nx, ny);
          ctx.lineTo(px, py);
        });
        withTransform(ctx, px, py, a * 0.75, () => palmateLeaf(p, size, i % 2 ? 4 : 0));
      }
    }
    // The growing tip: a small upright cluster of young leaves.
    withTransform(ctx, tipX, tipY, lean * 0.5, () => palmateLeaf(p, S * 0.2, -4));
  }
}

const FORM_DRAW: Record<PlantForm, (p: Paint) => void> = {
  fern: drawFern,
  splitleaf: drawSplitleaf,
  heart: drawHeart,
  trailing: drawTrailing,
  strappy: drawStrappy,
  spear: drawSpear,
  rosette: drawRosette,
  coin: drawCoin,
  patterned: drawPatterned,
  beads: drawBeads,
  bloom: drawBloom,
  column: drawColumn,
  globe: drawGlobe,
  paddle: drawPaddle,
  jade: drawJade,
  spiky: drawSpiky,
  stones: drawStones,
  palmate: drawPalmate,
};

/**
 * Draws a plant with its base at (0,0) of the current transform.
 * `unit` is pixels per tile.
 */
export function paintPlant(ctx: CanvasRenderingContext2D, defId: string, variantId: string, sf: number, seed: number, unit: number, mode: PlantMode) {
  const def = PLANTS[defId];
  if (!def) return;
  const look = lookFor(defId, variantId);
  const S = unit * look.size * stageScale(sf) * 0.62;
  const p: Paint = { ctx, look, rand: mulberry32(seed * 7919 + 13), unit, S, sf, mode };
  ctx.save();
  FORM_DRAW[def.form](p);
  ctx.restore();
}

/** Bounding box (in units of S) each form needs around its base. */
function extent(form: PlantForm, mode: PlantMode): { w: number; up: number; down: number } {
  const trailing = form === 'trailing' || form === 'beads';
  if (trailing && mode === 'ground') return { w: 2.6, up: 1.2, down: 1.3 };
  if (trailing) return { w: 1.4, up: 1.1, down: mode === 'hanging' ? 3.4 : 2.6 };
  if (form === 'strappy') return { w: 1.9, up: 1.5, down: mode === 'ground' ? 0.4 : 0.9 };
  if (form === 'fern') return { w: 1.8, up: 1.4, down: 0.6 };
  if (form === 'coin') return { w: 1.2, up: 1.5, down: 0.4 };
  if (form === 'paddle' || form === 'jade' || form === 'spiky') return { w: 1.6, up: 1.6, down: 0.4 };
  if (form === 'stones') return { w: 1.0, up: 0.9, down: 0.4 };
  if (form === 'palmate') return { w: 1.5, up: 2.35, down: 0.4 };
  return { w: 1.35, up: 1.6, down: 0.5 };
}

export interface PlantSprite {
  canvas: HTMLCanvasElement;
  /** Anchor (plant base) inside the sprite, in CSS pixels. */
  ox: number;
  oy: number;
  w: number;
  h: number;
}

export class PlantSpriteCache {
  private map = new Map<string, PlantSprite>();
  private pixels = 0;
  private budget = 26_000_000;
  private builtThisFrame = 0;
  maxBuildsPerFrame = 28;

  beginFrame() {
    this.builtThisFrame = 0;
  }

  get(defId: string, variantId: string, sf: number, seed: number, unit: number, mode: PlantMode, dpr: number): PlantSprite | null {
    const def = PLANTS[defId];
    if (!def) return null;
    const sfB = Math.round(Math.min(4.6, sf) * 3) / 3;
    const seedB = seed % 5;
    const unitB = Math.max(8, Math.round(unit / 4) * 4);
    // Match the world canvas density exactly; a lower-res sprite stretched up reads as blur.
    const scale = dpr;
    const key = `${defId}|${variantId}|${sfB}|${seedB}|${unitB}|${mode}|${scale}`;
    const hit = this.map.get(key);
    if (hit) {
      // Refresh LRU position.
      this.map.delete(key);
      this.map.set(key, hit);
      return hit;
    }
    if (this.builtThisFrame >= this.maxBuildsPerFrame) return null;
    this.builtThisFrame++;

    const look = lookFor(defId, variantId);
    const S = unitB * look.size * stageScale(sfB) * 0.62;
    const e = extent(def.form, mode);
    const pad = 4;
    const w = Math.ceil(S * e.w * 2 + pad * 2);
    const h = Math.ceil(S * (e.up + e.down) + pad * 2);
    const ox = w / 2;
    const oy = S * e.up + pad;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(w * scale));
    canvas.height = Math.max(1, Math.ceil(h * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(scale, 0, 0, scale, ox * scale, oy * scale);
    paintPlant(ctx, defId, variantId, sfB, seedB + 1, unitB, mode);
    const sprite: PlantSprite = { canvas, ox, oy, w, h };
    this.map.set(key, sprite);
    this.pixels += canvas.width * canvas.height;
    while (this.pixels > this.budget && this.map.size > 1) {
      const oldest = this.map.keys().next().value as string;
      const old = this.map.get(oldest)!;
      this.pixels -= old.canvas.width * old.canvas.height;
      this.map.delete(oldest);
    }
    return sprite;
  }
}

/**
 * Renders a plant portrait into a canvas element for the UI (collection
 * cards, basket rows). A silhouette is a dark shape only — enough to make
 * you wonder what it is.
 */
export function drawPortrait(canvas: HTMLCanvasElement, defId: string, variantId: string, sf: number, seed: number, silhouette = false) {
  const ctx = canvas.getContext('2d');
  const def = PLANTS[defId];
  if (!ctx || !def) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const cssW = canvas.clientWidth || canvas.width;
  const cssH = canvas.clientHeight || canvas.height;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);

  // Paint at a generous size offscreen, then crop to the pixels the plant
  // actually covers, so every form — a sprawling vine or a tidy rosette —
  // is framed snugly in the card. A fresh cutting is framed as if slightly
  // bigger, so it reads as a small plant rather than filling the card.
  const unit = 90;
  const look = lookFor(defId, variantId);
  const e = extent(def.form, 'ground');
  const S = unit * look.size * stageScale(sf) * 0.62;
  const Sref = unit * look.size * stageScale(Math.max(sf, 1.6)) * 0.62;
  const w = Math.ceil(Sref * e.w * 2 + 20);
  const h = Math.ceil(Sref * (e.up + e.down) + 20);
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const octx = off.getContext('2d');
  if (!octx) return;
  octx.translate(w / 2, Sref * e.up + 10);
  paintPlant(octx, defId, variantId, sf, seed, unit, 'ground');
  const data = octx.getImageData(0, 0, w, h).data;
  let x0 = w;
  let y0 = h;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (x1 <= x0 || y1 <= y0) return;
  // Growth shows as size: scale relative to the reference framing.
  const boxW = x1 - x0 + 1;
  const boxH = y1 - y0 + 1;
  const growScale = Math.min(1, S / Sref) * 0.35 + 0.65;
  const fit = Math.min((canvas.width * 0.92) / boxW, (canvas.height * 0.92) / boxH) * (sf < 1.6 ? growScale : 1);
  const dw = boxW * fit;
  const dh = boxH * fit;
  const dx = (canvas.width - dw) / 2;
  const dy = (canvas.height - dh) / 2 + (canvas.height - dh) * 0.2;
  // The pass above only measures. Stretching its bitmap to fit would blur
  // thin forms and young cuttings (their crop is tiny), so paint the plant
  // again straight onto the card at the final scale — the art is all vector
  // paths, so it stays crisp at any size.
  ctx.save();
  ctx.beginPath();
  ctx.rect(dx, dy, dw, dh);
  ctx.clip();
  ctx.translate(dx - x0 * fit, dy - y0 * fit);
  ctx.scale(fit, fit);
  ctx.translate(w / 2, Sref * e.up + 10);
  paintPlant(ctx, defId, variantId, sf, seed, unit, 'ground');
  ctx.restore();
  if (silhouette) {
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = 'rgba(60,48,32,0.55)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';
  }
}
