# Foxtrot

A cozy houseplant collecting, propagating and world-transforming game for
the browser. You're **Ellen**, a plant collector, with **Scout** — scruffy,
one-eyed, never far — at your side. You start with a little greenhouse, an
empty market stall and a valley of mostly bare wilderness. Wild houseplants
grow in patches all over it.

**Explore → discover → propagate → grow → display, sell or plant out → watch the valley change → explore further.**

- **Discover.** Every wild patch shows the actual plant growing there, and
  re-rolls what grows in it over time, weighted by rarity (Common → Uncommon →
  Rare → Very Rare → Extremely Rare). 22 species, 57 variants: variegated,
  dark-leaved, crested, glowing… Some only appear in the rain, some only by
  lantern light, and a few only where the fox leads you.
- **Propagate.** Pot a cutting in a nursery bed; it roots, then grows from
  *cutting → young → established → large → specimen*. Rooted plants give
  cuttings of their own, and every so often a cutting comes out as a *sport*
  — a different, often rarer variant.
- **Establish, then choose.** Once you've raised two of a species, it's
  established and you choose what each plant is for: a pot in the
  greenhouse gallery (it stays and keeps growing), or a place out in the wild.
- **Transform the world.** Plants in the wild grow on their own, fastest in
  their native region. Large ones spread; seedlings sometimes come up as
  variants you've never seen. The ground itself changes under them, and each
  region takes on the character of what you planted: fern glades, vine
  carpets, aroid jungles, painted gardens.
- **Sell and build.** The farmer's market buys plants (rarer and bigger is
  worth more; there's a daily "wanted" bonus) and sells pots, shelves,
  hanging hooks, grow lights, a sun-room expansion, garden decor and stall
  upgrades.
- **Collect.** The field journal tracks every species and variant, with
  unfound ones shown as silhouettes and "???" until you see them.

Time keeps passing (up to three game days per absence) while the tab is
closed, and the welcome-back message tells you what grew and what spread.
Nothing ever dies.

## Running it

```bash
npm install
npm run dev       # http://localhost:5173
```

```bash
npm run build      # production build + PWA service worker into dist/
npm run preview     # serve the production build locally
npm test            # vitest — growth, propagation, spots, spreading, market, save/load, NPCs
```

Controls: WASD/arrow keys to move, `E` (or the on-screen button on touch
devices) to interact. The basket (🧺) is where you plant things out and
place garden decor. Progress autosaves to `localStorage`.

## Architecture

- `src/game/data/` — content as plain data: the plant roster and variants
  (`plants.ts`), wild patches (`discoveryPoints.ts`), greenhouse layout
  (`stations.ts`), shop and pot styles (`shop.ts`), zones, map, NPC spots.
- `src/game/systems/` — pure functions on `GameState`:
  `growth` (stages), `propagation` (cuttings, sports, the two-plant threshold,
  potting/display/planting out), `spots` (what grows in a patch),
  `wild` (spreading, sports in the wild, the lushness field that repaints the
  ground), `market` (prices, buying/selling), `collection`, `basket`, `decor`,
  plus the fox, Scout, Scott and the cat.
- `src/game/engine/` — game loop, input, camera, clock/weather, save manager
  (with migration from older builds), audio.
- `src/game/world/` — map, collision, and the Canvas2D renderer. All art is
  procedural: `PlantArt.ts` draws every species/variant at any growth stage and
  caches plants as sprites so a region with hundreds of plants stays fast.
- `src/ui/` — HUD, basket, greenhouse, market and journal panels.
- `tests/` — vitest coverage of the systems above.

Every owned plant is one record with a location (nursery bed, display spot,
or a spot in the wild), so growth, saving and rendering treat the whole
collection the same way wherever it lives.
