import { createNewGame, SAVE_KEY, SAVE_VERSION, type GameState } from '../state';

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameState;
    if (!parsed || parsed.version !== SAVE_VERSION) {
      // Future migrations would translate old saves here; for v1 we just
      // start fresh if the shape doesn't match.
      return null;
    }
    return parsed;
  } catch (err) {
    console.warn('Foxtrot: failed to load save, starting fresh.', err);
    return null;
  }
}

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Foxtrot: failed to save game.', err);
  }
}

export function resetGame(): GameState {
  localStorage.removeItem(SAVE_KEY);
  return createNewGame();
}

export function loadOrCreate(): { state: GameState; isNew: boolean } {
  const loaded = loadGame();
  if (loaded) return { state: loaded, isNew: false };
  return { state: createNewGame(), isNew: true };
}
