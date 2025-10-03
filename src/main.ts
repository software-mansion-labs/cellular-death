import './style.css';

import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as wf from 'wayfare';
import { createCameraRig } from './cameraRig.ts';
import { createChamber } from './chamber.ts';
import { createInputManager } from './inputManager.ts';
import { createTerrarium } from './terrarium.ts';
import { createSun } from './sun.ts';

const floorMesh = wf.createRectangleMesh({
  width: d.vec3f(10, 0, 0),
  height: d.vec3f(0, 0, -10),
});

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

  // Main menu dismiss
  document.querySelector('#startButton')?.addEventListener('click', () => {
    document.getElementById('titleScreen')?.classList.add('hidden');
  });

  const world = engine.world;

  // Floor
  world.spawn(
    wf.MeshTrait(floorMesh),
    wf.TransformTrait({ position: d.vec3f(0, -5, -10) }),
    ...wf.BlinnPhongMaterial.Bundle({ albedo: d.vec3f(0.7, 0.5, 0.3) }),
  );

  // Attaches input controls to the canvas
  createInputManager(world, canvas);

  const sun = createSun(root, engine);

  // Chamber
  createChamber(root, world, sun);

  // Terrarium
  const terrarium = createTerrarium(root, world);

  // Camera rig
  const cameraRig = createCameraRig(world);

  engine.run(() => {
    terrarium.update();
    cameraRig.update();
    sun.update();
  });
}

await initGame();
