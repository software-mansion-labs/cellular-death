import { trait, type World } from 'koota';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { saturate } from 'typegpu/std';
import * as wf from 'wayfare';
import { mat4n, quatn } from 'wgpu-matrix';
import { endingState, FALLING_STEP } from './endingState';
import { Hoverable } from './hoverable';
import { InputData } from './inputManager';

function curveLookAngle(angle: number) {
  return Math.sign(angle) * angle ** 2;
}

const GameCamera = trait({
  smoothYaw: 0,
  smoothPitch: 0,
  zoom: 0,
});

const RayBoxResult = d.struct({
  tNear: d.f32,
  tFar: d.f32,
  hit: d.bool,
});

// Ray-box intersection
const rayBoxIntersection = (
  rayOrigin: d.v3f,
  rayDir: d.v3f,
  boxMin: d.v3f,
  boxMax: d.v3f,
) => {
  'use gpu';
  const invDir = d.vec3f(1).div(rayDir);
  const t0 = boxMin.sub(rayOrigin).mul(invDir);
  const t1 = boxMax.sub(rayOrigin).mul(invDir);
  const tmin = std.min(t0, t1);
  const tmax = std.max(t0, t1);
  const tNear = std.max(std.max(tmin.x, tmin.y), tmin.z);
  const tFar = std.min(std.min(tmax.x, tmax.y), tmax.z);
  const hit = tFar >= tNear && tFar >= 0;
  return RayBoxResult({ tNear, tFar, hit });
};

export function createCameraRig(world: World) {
  // Camera
  const cameraEntity = world.spawn(
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

  let endingFlySpeed = 0;

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

          // Zoom
          data.zoom = wf.encroach(data.zoom, zooming ? 1 : 0, 0.01, dt);

          perspective.fov = 70 - data.zoom * 40;

          // ENDING fly towards the hole
          if (endingState.step === FALLING_STEP) {
            endingFlySpeed += time.deltaSeconds * 4;
            transform.position.z -= endingFlySpeed * time.deltaSeconds;
          }
        });

      // ---
      // HOVERABLES
      // ---

      const cameraTransform = cameraEntity?.get(wf.TransformTrait);
      const perspectiveConfig = cameraEntity?.get(wf.PerspectiveCamera);

      if (!perspectiveConfig || !cameraTransform) {
        return;
      }

      const rotation = mat4n.fromQuat(cameraTransform.rotation);
      const forward = mat4n.mul(rotation, d.vec4f(0, 0, -1, 0), d.vec4f());
      const up = mat4n.mul(rotation, d.vec4f(0, 1, 0, 0), d.vec4f());

      const view = d.mat4x4f();
      mat4n.identity(view);
      mat4n.lookAt(
        cameraTransform.position,
        cameraTransform.position.add(forward.xyz),
        up.xyz,
        view,
      );

      const proj = d.mat4x4f();
      mat4n.perspective(
        ((perspectiveConfig.fov ?? 45) / 180) * Math.PI, // fov
        window.innerWidth / window.innerHeight, // aspect
        perspectiveConfig.near ?? 0.1, // near
        perspectiveConfig.far ?? 1000.0, // far
        proj,
      );

      const invViewProj = mat4n.mul(proj, view, d.mat4x4f());
      mat4n.invert(invViewProj, invViewProj);

      const worldRayDir = invViewProj.mul(
        d.vec4f(inputData.mouseX * 2 - 1, -(inputData.mouseY * 2 - 1), 1, 1),
      ).xyz;

      world
        .query(Hoverable, wf.MatricesTrait)
        .updateEach(([hoverable, objMatrices]) => {
          const objOrigin = objMatrices.world.mul(d.vec4f(0, 0, 0, 1)).xyz;

          const hit = rayBoxIntersection(
            // It's local space, but we're not parenting the camera to anything here, so it's fine
            // for this game
            cameraTransform.position,
            worldRayDir,
            objOrigin.sub(hoverable.boundsSize),
            objOrigin.add(hoverable.boundsSize),
          );

          hoverable.hover = hit.hit;
        });
    },
  };
}
