# Foxtrot

A cozy botanical exploration and ecosystem game for the browser. Explore a
compact wilderness around an abandoned greenhouse, collect and grow plants,
breed new varieties, and watch (and nudge) a living ecosystem of insects,
animals, and fungi. A wild fox wanders the wilderness as a quiet, wordless
guide.

## Running it

```bash
npm install
npm run dev       # http://localhost:5173
```

```bash
npm run build      # production build + PWA service worker into dist/
npm run preview     # serve the production build locally
npm test            # vitest — core systems (growth, ecosystem, tools, save/load, fox…)
```

Controls: WASD/arrow keys to move, `E` (or the on-screen button on touch
devices) to interact. Progress autosaves to `localStorage`; there's a
"Start a New Game" option on the continue screen to reset.

## Architecture

- `src/game/data/` — all content (plants, fungi, creatures, tools, zones,
  ecosystem relationships, discovery points, stations) as plain data. New
  species/tools/areas are added here, not by touching systems code.
- `src/game/systems/` — pure(ish) functions operating on `GameState`: plant
  growth, ecosystem simulation, propagation/hybridization, tools,
  inventory, journal/discovery tracking, fox behavior, weather-gated
  collection.
- `src/game/engine/` — the game loop, input (keyboard + touch joystick),
  camera, clock/weather, save manager, a small procedural audio layer.
- `src/game/world/` — the tile map, collision, movement, and the Canvas2D
  renderer (procedural graphics, no external art assets).
- `src/ui/` — the HTML/CSS overlay UI (HUD, journal, basket, greenhouse
  station panels) that reads and drives `GameState` via the `Game` class.
- `tests/` — vitest coverage of the systems above.

Time keeps advancing (and plants keep growing, the ecosystem keeps
shifting) whether or not the tab is open — there's no login-streak or
plant-death-by-absence mechanic. See the design notes baked into
`src/game/systems/plantGrowth.ts` and `ecosystem.ts` for how that works.
