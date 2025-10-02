import './style.css';

import tgpu from 'typegpu';
import { trait } from 'koota';
import * as d from 'typegpu/data';
import { quatn } from 'wgpu-matrix';
import * as wf from 'wayfare';
import { createBoxMesh } from './boxMesh.ts';
import { normalize } from 'typegpu/std';

const floorMesh = wf.createRectangleMesh({
  width: d.vec3f(10, 0, 0),
  height: d.vec3f(0, 0, -10),
});

const boxMesh = createBoxMesh(1, 1, 1);

const TerrariumTag = trait();

async function initGame() {
  const root = await tgpu.init();
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

  const world = engine.world;

  // Camera
  world.spawn(
    wf.PerspectiveCamera({
      fov: 70,
      clearColor: d.vec4f(0.1, 0.1, 0.4, 1),
      near: 0.1,
      far: 100,
    }),
    wf.ActiveCameraTag,
    wf.TransformTrait({ position: d.vec3f(0, 0, 0) }),
  );

  // Floor
  world.spawn(
    wf.MeshTrait(floorMesh),
    wf.TransformTrait({ position: d.vec3f(0, -5, -10) }),
    ...wf.BlinnPhongMaterial.Bundle({ albedo: d.vec3f(0.7, 0.5, 0.3) }),
  );

  // Terrarium
  world.spawn(
    TerrariumTag,
    wf.MeshTrait(boxMesh),
    wf.TransformTrait({ position: d.vec3f(0, 0, -10) }),
    ...wf.BlinnPhongMaterial.Bundle({ albedo: d.vec3f(1, 1, 1) }),
  );

  engine.run(() => {
    world.query(wf.TransformTrait, TerrariumTag).updateEach(([transform]) => {
      transform.rotation = quatn.fromAxisAngle(
        normalize(d.vec3f(1, 0.6, 0)),
        performance.now() / 1000,
        d.vec4f(),
      );
    });
  });
}

await initGame();
