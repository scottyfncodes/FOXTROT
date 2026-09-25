import type { ZoneId } from '../types';
import { ZONE_RECTS, GREENHOUSE_FOOTPRINT, HOUSE_FOOTPRINT, rectContains, isWater, type Rect } from '../data/worldMap';
import { LAYOUT_SPOTS } from '../data/discoveryPoints';
import { TOOL_PICKUPS } from '../data/toolPickups';
import { mulberry32 } from '../engine/Random';

export type ObstacleKind = 'tree' | 'bush' | 'rock' | 'flower' | 'reed';

export interface Obstacle {
  x: number;
  y: number;
  kind: ObstacleKind;
  blocking: boolean;
  seed: number;
}

const DENSITY: Record<ZoneId, { kind: ObstacleKind; chance: number; blocking: boolean }[]> = {
  greenhouse: [],
  meadow: [
    { kind: 'flower', chance: 0.05, blocking: false },
    { kind: 'bush', chance: 0.015, blocking: true },
  ],
  woodland: [
    { kind: 'tree', chance: 0.14, blocking: true },
    { kind: 'bush', chance: 0.04, blocking: true },
  ],
  creek: [{ kind: 'reed', chance: 0.06, blocking: false }],
  dampForest: [
    { kind: 'tree', chance: 0.18, blocking: true },
    { kind: 'bush', chance: 0.05, blocking: true },
  ],
  rockyClearing: [
    { kind: 'rock', chance: 0.09, blocking: true },
    { kind: 'flower', chance: 0.02, blocking: false },
  ],
  overgrownClearing: [
    { kind: 'bush', chance: 0.16, blocking: true },
    { kind: 'flower', chance: 0.04, blocking: false },
  ],
};

const KEEPOUT_RADIUS = 1.4;

function nearKeepout(x: number, y: number, keepouts: { x: number; y: number }[]): boolean {
  return keepouts.some((k) => Math.hypot(k.x - x, k.y - y) < KEEPOUT_RADIUS);
}

export function generateObstacles(seed = 1337): Obstacle[] {
  const rand = mulberry32(seed);
  const obstacles: Obstacle[] = [];
  const keepouts = [
    ...LAYOUT_SPOTS.map((p) => ({ x: p.x, y: p.y })),
    ...TOOL_PICKUPS.map((p) => ({ x: p.x, y: p.y })),
    { x: GREENHOUSE_FOOTPRINT.x - 2, y: GREENHOUSE_FOOTPRINT.y + GREENHOUSE_FOOTPRINT.h },
  ];

  const greenhouseBuffer: Rect = {
    x: GREENHOUSE_FOOTPRINT.x - 2,
    y: GREENHOUSE_FOOTPRINT.y - 2,
    w: GREENHOUSE_FOOTPRINT.w + 4,
    h: GREENHOUSE_FOOTPRINT.h + 4,
  };

  for (const { zone, rect } of ZONE_RECTS) {
    const rules = DENSITY[zone];
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        if (rectContains(greenhouseBuffer, x, y)) continue;
        if (isWater(x, y)) continue;
        if (nearKeepout(x + 0.5, y + 0.5, keepouts)) continue;
        for (const rule of rules) {
          if (rand() < rule.chance) {
            obstacles.push({ x, y, kind: rule.kind, blocking: rule.blocking, seed: Math.floor(rand() * 1e6) });
            break;
          }
        }
      }
    }
  }
  // The house went up later, beside the greenhouse. Its ground is cleared
  // after the fact, so the random layout everywhere else stays exactly as
  // it always was.
  const houseYard: Rect = { x: HOUSE_FOOTPRINT.x - 1, y: HOUSE_FOOTPRINT.y - 1, w: HOUSE_FOOTPRINT.w + 2, h: HOUSE_FOOTPRINT.h + 3 };
  return obstacles.filter((o) => !rectContains(houseYard, o.x, o.y));
}

/** Blocking tiles, minus anything the player has cleared away. */
export function buildBlockingSet(obstacles: Obstacle[], cleared: Iterable<string> = []): Set<string> {
  const gone = new Set(cleared);
  const set = new Set<string>();
  for (const o of obstacles) {
    const key = `${o.x},${o.y}`;
    if (o.blocking && !gone.has(key)) set.add(key);
  }
  return set;
}
