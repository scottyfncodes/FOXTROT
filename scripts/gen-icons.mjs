// Generates simple procedural app icons (fox silhouette on a botanical dark-teal
// background) so the PWA has real PNGs without depending on an external art tool.
import { PNG } from 'pngjs';
import { writeFileSync, mkdirSync } from 'node:fs';

const BG = [13, 36, 32]; // #0d2420
const ACCENT = [45, 122, 111]; // botanical teal accent
const FOX = [214, 122, 61]; // warm fox orange
const CREAM = [244, 236, 216];

function makeIcon(size) {
  const png = new PNG({ width: size, height: size });
  const cx = size / 2;
  const cy = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;
      const dx = (x - cx) / size;
      const dy = (y - cy) / size;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let [r, g, b] = BG;
      // soft vignette gradient
      const t = Math.min(1, dist * 1.6);
      r = BG[0] + (ACCENT[0] - BG[0]) * (1 - t) * 0.35;
      g = BG[1] + (ACCENT[1] - BG[1]) * (1 - t) * 0.35;
      b = BG[2] + (ACCENT[2] - BG[2]) * (1 - t) * 0.35;
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = 255;
    }
  }

  // Fox head silhouette: triangle-ish head + two ears, drawn with simple shapes.
  const s = size / 100;
  const setPx = (px, py, color, a = 1) => {
    px = Math.round(px);
    py = Math.round(py);
    if (px < 0 || py < 0 || px >= size || py >= size) return;
    const idx = (size * py + px) << 2;
    png.data[idx] = png.data[idx] * (1 - a) + color[0] * a;
    png.data[idx + 1] = png.data[idx + 1] * (1 - a) + color[1] * a;
    png.data[idx + 2] = png.data[idx + 2] * (1 - a) + color[2] * a;
  };

  const inTriangle = (px, py, ax, ay, bx, by, cx2, cy2) => {
    const d = (x1, y1, x2, y2, x3, y3) => (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);
    const d1 = d(px, py, ax, ay, bx, by);
    const d2 = d(px, py, bx, by, cx2, cy2);
    const d3 = d(px, py, cx2, cy2, ax, ay);
    const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
    const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(hasNeg && hasPos);
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // head (rounded triangle)
      const headTri = inTriangle(x, y, 50 * s, 32 * s, 24 * s, 78 * s, 76 * s, 78 * s);
      // ears
      const leftEar = inTriangle(x, y, 30 * s, 18 * s, 20 * s, 46 * s, 42 * s, 46 * s);
      const rightEar = inTriangle(x, y, 70 * s, 18 * s, 58 * s, 46 * s, 80 * s, 46 * s);
      if (headTri || leftEar || rightEar) {
        setPx(x, y, FOX, 1);
      }
    }
  }
  // muzzle + cheeks (cream) and nose (dark)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const muzzle = inTriangle(x, y, 50 * s, 55 * s, 38 * s, 78 * s, 62 * s, 78 * s);
      if (muzzle) setPx(x, y, CREAM, 1);
    }
  }
  const noseR = 4.2 * s;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dxn = x - 50 * s;
      const dyn = y - 60 * s;
      if (dxn * dxn + dyn * dyn < noseR * noseR) setPx(x, y, [30, 22, 20], 1);
    }
  }

  return PNG.sync.write(png);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', makeIcon(192));
writeFileSync('public/icons/icon-512.png', makeIcon(512));
writeFileSync('public/icons/apple-touch-icon.png', makeIcon(180));
console.log('Icons generated.');
