import './style.css';

import tgpu from 'typegpu';
import * as wf from 'wayfare';
import { createCameraRig } from './cameraRig.ts';
import { createChamber } from './chamber.ts';
import { createInputManager } from './inputManager.ts';
import { createSun } from './sun.ts';
import { createTerrarium } from './terrarium.ts';
import * as Tone from 'tone';

let showingTitleScreen = true;

function initButtons() {
  // sound and music
  const clickSfx = new Tone.Player("assets/sfx/ambient-snare.mp3").toDestination();
  const backgroudMusic =  new Tone.Player("assets/sfx/background-music.mp3").toDestination();
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
  }
  updateUI();

  startButton.addEventListener('click', () => {
    showingTitleScreen = false;
    updateUI();
  });

  // Pause menu
  document.addEventListener('keydown', (event) => {
    if (event.code === 'Escape') {
      showingTitleScreen = true;
      updateUI();
    }
  });

  // start button
  startButton?.addEventListener("click", async () => {
    document.getElementById("titleScreen")?.classList.add("hidden");

    // setup Tone
    Tone.start();

    // play the clickSfx
    Tone.loaded().then(() => { 
      clickSfx.start(); 
      clickSfx.onstop = () => backgroudMusic.start();
    } );
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

  muteButton?.addEventListener("click", () => {
    Tone.getDestination().mute = !Tone.getDestination().mute;
  });

  // reset button
  const resetButton = document.getElementById('resetButton');

  resetButton?.addEventListener('click', () => {
    console.log('Reset clicked');
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
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    renderer.updateViewport(canvas.width, canvas.height);
  };
  resizeCanvas(canvas);
  window.addEventListener('resize', () => resizeCanvas(canvas));

  initButtons();

  const world = engine.world;

  // Attaches input controls to the canvas
  createInputManager(world, canvas);

  const sun = createSun(root, engine);

  // Chamber
  const chamber = createChamber(root, world, sun);

  // Terrarium
  const terrarium = createTerrarium(root, world);

  // Camera rig
  const cameraRig = createCameraRig(world);

  engine.run(() => {
    cameraRig.update();
    terrarium.update();
    sun.update();
    chamber.update();
  });
}

await initGame();
