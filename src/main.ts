import './style.css';

import * as Tone from 'tone';
import tgpu from 'typegpu';
import * as wf from 'wayfare';
import { createCameraRig } from './cameraRig.ts';
import { createChamber } from './chamber.ts';
import { createControlButtons } from './controlButton.ts';
import { getDialogBox } from './dialogBox.ts';
import { level1dialogue } from './dialogue.ts';
import { createFoggyMaterial } from './foggyMaterial.ts';
import { createInputManager } from './inputManager.ts';
import { LEVELS } from './levels.ts';
import { gameStateManager } from './saveGame.ts';
import { createSun } from './sun.ts';
import { createTerrarium } from './terrarium.ts';

const quality: 'low' | 'high' | 'ultra' = 'ultra';
let showingTitleScreen = true;
let pauseMenuVariant = false;

function initAgingIndicator() {
  const agingIndicator = document.getElementById('agingIndicator');
  if (!agingIndicator) return;

  document.addEventListener('keydown', (event) => {
    if (event.code === 'KeyD') {
      agingIndicator.style.opacity = '1';
    }
  });

  document.addEventListener('keyup', (event) => {
    if (event.code === 'KeyD') {
      agingIndicator.style.opacity = '0';
    }
  });
}

function initButtons() {
  // sound and music
  const clickSfx = new Tone.Player(
    'assets/sfx/ambient-snare.mp3',
  ).toDestination();
  const backgroudMusic = new Tone.Player(
    'assets/sfx/background-music.mp3',
  ).toDestination();
  backgroudMusic.loop = true;

  // biome-ignore lint/style/noNonNullAssertion: it's fine
  const titleScreen = document.getElementById('titleScreen')!;
  if (!titleScreen) throw new Error('titleScreen not found');
  // biome-ignore lint/style/noNonNullAssertion: it's fine
  const startButton = document.getElementById('startButton')!;
  if (!startButton) throw new Error('startButton not found');

  function updateUI() {
    if (showingTitleScreen) {
      titleScreen.dataset.state = 'shown';
    } else {
      titleScreen.dataset.state = 'hidden';
    }

    if (pauseMenuVariant) {
      titleScreen.dataset.variant = 'pause';
    } else {
      titleScreen.dataset.variant = 'title';
    }
  }
  updateUI();

  startButton.addEventListener('click', () => {
    showingTitleScreen = false;
    updateUI();

    // setup Tone
    Tone.start();

    if (pauseMenuVariant) {
      return;
    }

    // Not the pause menu, so we start the game 🍝
    getDialogBox().enqueueMessage(...level1dialogue);

    // play the clickSfx
    Tone.loaded().then(() => {
      clickSfx.start();
      clickSfx.onstop = () => backgroudMusic.start();
    });
  });

  // Pause menu
  document.addEventListener('keydown', (event) => {
    if (showingTitleScreen) {
      // Already shown
      return;
    }

    if (event.code === 'Escape') {
      showingTitleScreen = true;
      pauseMenuVariant = true;
      updateUI();
    }
  });

  // mute button
  const muteButton = document.getElementById('muteButton');
  const unmutedIcon = muteButton?.querySelector('.unmuted');
  const mutedIcon = muteButton?.querySelector('.muted');
  mutedIcon?.setAttribute('style', 'display: none');

  let isMuted = false;

  muteButton?.addEventListener('click', () => {
    isMuted = !isMuted;
    if (isMuted) {
      unmutedIcon?.setAttribute('style', 'display: none');
      mutedIcon?.setAttribute('style', 'display: block');
    } else {
      unmutedIcon?.setAttribute('style', 'display: block');
      mutedIcon?.setAttribute('style', 'display: none');
    }
  });

  muteButton?.addEventListener('click', () => {
    Tone.getDestination().mute = !Tone.getDestination().mute;
  });
}

async function initGame() {
  const root = await tgpu.init({
    device: {
      optionalFeatures: ['float32-filterable'],
    },
  });
  const canvas = document.querySelector('canvas') as HTMLCanvasElement;
  const context = canvas.getContext('webgpu') as GPUCanvasContext;

  const renderer = new wf.Renderer(root, canvas, context);
  const engine = new wf.Engine(root, renderer);

  const resizeCanvas = (canvas: HTMLCanvasElement) => {
    const dpr =
      (window.devicePixelRatio || 1) *
      {
        low: 0.25,
        high: 0.5,
        ultra: 1,
      }[quality];
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    renderer.updateViewport(canvas.width, canvas.height);
  };
  resizeCanvas(canvas);
  window.addEventListener('resize', () => resizeCanvas(canvas));

  const buttons = initButtons();
  initAgingIndicator();

  const world = engine.world;

  // Attaches input controls to the canvas
  const inputManager = createInputManager(world, canvas);

  const sun = createSun(root, engine);

  // Foggy
  const foggy = createFoggyMaterial(root, world, sun);

  // Chamber
  const chamber = createChamber(world, foggy.material);

  // Control buttons
  const controlButtons = createControlButtons(world, foggy.material, () => {
    if (showingTitleScreen) {
      return;
    }

    if (terrarium.goalReached) {
      // Next level
      const nextLevel = currentLevelIndex + 1;
      loadLevel(nextLevel < LEVELS.length ? nextLevel : 0);
    } else {
      // Restart
      loadLevel(currentLevelIndex);
    }
  });

  // Terrarium (preferably last as far as rendered object go, since it's semi-transparent)
  const terrarium = createTerrarium(root, world);

  // Camera rig
  const cameraRig = createCameraRig(world);

  // Reading game state
  const gameState = gameStateManager.state;

  let levelInitialized = false;
  let goalReachedShown = false;

  const goalReachedIndicator = document.getElementById('goalReachedIndicator');
  const levelIndicator = document.getElementById('levelIndicator');

  function updateLevelIndicator() {
    if (levelIndicator) {
      levelIndicator.textContent = LEVELS[gameState.levelIdx].name;
    }
  }

  function loadLevel(index: number) {
    gameState.levelIdx = index;
    gameStateManager.save();
    terrarium.startLevel(LEVELS[index]);
    updateLevelIndicator();
    goalReachedShown = false;
    if (goalReachedIndicator) {
      goalReachedIndicator.style.opacity = '0';
    }
  }

  engine.run(() => {
    inputManager.update();
    cameraRig.update();
    foggy.update();
    terrarium.update();
    sun.update();
    chamber.update();
    controlButtons.update();
    getDialogBox().update(world);

    if (!levelInitialized) {
      levelInitialized = true;
      loadLevel(gameState.levelIdx);
    }

    if (terrarium.goalReached && !goalReachedShown && !showingTitleScreen) {
      goalReachedShown = true;
      if (goalReachedIndicator) {
        goalReachedIndicator.style.opacity = '1';
      }
    }
  });
}

await initGame();
