import { type } from 'arktype';

export const GameState = type({
  levelIdx: 'number',
});

const defaultGameState = GameState.from({
  levelIdx: 0,
});

const parseJson = type('string').pipe.try(
  (s): object => JSON.parse(s),
  GameState,
);

const saveGameNWJS = (
  gameState: typeof GameState.infer,
  name: string,
): void => {
  const fs = require('node:fs');
  const path = require('node:path');

  // biome-ignore lint/suspicious/noTsIgnore: types package is incomplete
  //@ts-ignore
  const dataPath = nw.App.dataPath;

  const saveFile = path.join(dataPath, `${name}.json`);

  const json = JSON.stringify(gameState, null, 2);
  try {
    fs.writeFileSync(saveFile, json, 'utf-8');
  } catch (err) {
    console.error('Failed to save game:', err);
  }
};

const loadGameNWJS = (name: string): typeof GameState.infer => {
  const fs = require('node:fs');
  const path = require('node:path');

  // biome-ignore lint/suspicious/noTsIgnore: types package is incomplete
  //@ts-ignore
  const dataPath = nw.App.dataPath;

  const saveFile = path.join(dataPath, `${name}.json`);

  try {
    if (fs.existsSync(saveFile)) {
      const json = fs.readFileSync(saveFile, 'utf-8');
      const gameState = parseJson(json);

      if (!(gameState instanceof type.errors)) {
        return gameState as typeof GameState.infer;
      }
    }
  } catch (err) {
    console.error('Failed to load game:', err, 'Returning default game state');
  }
  return defaultGameState as typeof GameState.infer;
};

const saveGameLocalStorage = (
  gameState: typeof GameState.infer,
  name: string,
) => {
  localStorage.setItem(name, JSON.stringify(gameState));
};

const loadGameLocalStorage = (name: string): typeof GameState.infer => {
  const json = localStorage.getItem(name);
  if (json) {
    const gameState = parseJson(json);
    if (!(gameState instanceof type.errors)) {
      return gameState as typeof GameState.infer;
    }
  }
  return defaultGameState as typeof GameState.infer;
};

/**
 * Handles saving and loading the game state.
 *
 * In browser environment, it uses localStorage.
 * In NW.js environment, it stores data in the OS default app data specified by nw.App.dataPath.
 *
 * - `state` can be read and modified by the running game
 * - `save()` stores the modified 'state' value
 */
const onNWJS = typeof nw !== 'undefined';

const saveGame = onNWJS ? saveGameNWJS : saveGameLocalStorage;
const loadGame = onNWJS ? loadGameNWJS : loadGameLocalStorage;

export const gameStateManager = {
  state: loadGame('main'),
  reset() {
    saveGame(defaultGameState, 'main');
    // Reload the page
    window.location.reload();
  },
  save() {
    saveGame(this.state, 'main');
  },
};
