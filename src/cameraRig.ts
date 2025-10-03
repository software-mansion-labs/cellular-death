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
});

export function createCameraRig(world: World) {
  // Camera
  world.spawn(
    GameCamera(),
    wf.PerspectiveCamera({
      fov: 70,
      clearColor: d.vec4f(0.1, 0.1, 0.4, 1),
      near: 0.1,
      far: 100,
    }),
    wf.ActiveCameraTag,
    wf.TransformTrait({ position: d.vec3f(0, 0, 0) }),
  );

  return {
    update() {
      // Making the camera follow around the mouse
      const inputData = wf.getOrThrow(world, InputData);

      world
        .query(wf.TransformTrait, GameCamera)
        .updateEach(([transform, data]) => {
          const time = wf.getOrThrow(world, wf.Time);
          const dt = time.deltaSeconds;
          const mx = (saturate(inputData.mouseX) - 0.5) * 2;
          const my = (saturate(inputData.mouseY) - 0.5) * 2;

          if (!inputData.dragging) {
            data.smoothYaw = wf.encroach(
              data.smoothYaw,
              curveLookAngle(mx),
              0.1,
              dt,
            );
            data.smoothPitch = wf.encroach(
              data.smoothPitch,
              curveLookAngle(my),
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
        });
    },
  };
}
