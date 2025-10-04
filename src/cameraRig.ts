import { trait, type World } from 'koota';
import * as d from 'typegpu/data';
import { saturate } from 'typegpu/std';
import * as wf from 'wayfare';
import { quatn } from 'wgpu-matrix';
import { InputData } from './inputManager';

function curveLookAngle(angle: number) {
  return Math.sign(angle) * angle ** 2;
}

const GameCamera = trait({
  smoothYaw: 0,
  smoothPitch: 0,
  zoom: 0,
});

export function createCameraRig(world: World) {
  // Camera
  world.spawn(
    GameCamera(),
    wf.PerspectiveCamera({
      fov: 70,
      clearColor: d.vec4f(1),
      near: 0.1,
      far: 100,
    }),
    wf.ActiveCameraTag,
    wf.TransformTrait({ position: d.vec3f(0, 0, 2) }),
  );

  return {
    update() {
      // Making the camera follow around the mouse
      const inputData = wf.getOrThrow(world, InputData);

      world
        .query(wf.TransformTrait, GameCamera, wf.PerspectiveCamera)
        .updateEach(([transform, data, perspective]) => {
          const time = wf.getOrThrow(world, wf.Time);
          const dt = time.deltaSeconds;
          const mx = (saturate(inputData.mouseX) - 0.5) * 2;
          const my = (saturate(inputData.mouseY) - 0.5) * 2;

          const zooming = wf.Input.isKeyDown('Space');

          if (!inputData.dragging) {
            data.smoothYaw = wf.encroach(
              data.smoothYaw,
              zooming ? mx * 1.5 : curveLookAngle(mx),
              0.1,
              dt,
            );
            data.smoothPitch = wf.encroach(
              data.smoothPitch,
              zooming ? my * 1.5 : curveLookAngle(my),
              0.1,
              dt,
            );

            transform.rotation = quatn.fromEuler(
              -data.smoothPitch,
              -data.smoothYaw,
              0,
              'zyx',
              d.vec4f(),
            );
          }

          // Zoom
          data.zoom = wf.encroach(data.zoom, zooming ? 1 : 0, 0.01, dt);

          perspective.fov = 70 - data.zoom * 40;
        });
    },
  };
}
