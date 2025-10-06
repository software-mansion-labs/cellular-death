import { trait, type Entity, type World } from 'koota';
import * as d from 'typegpu/data';
import * as wf from 'wayfare';
import { quatn } from 'wgpu-matrix';
import type { FoggyMaterial } from './foggyMaterial.ts';
import { endingState, FALLING_STEP } from './endingState.ts';

const [chamberMesh, chamberBrokenMesh, fanMesh] = await Promise.all([
  wf.meshAsset({ url: 'assets/models/chamber.obj' }).preload(),
  wf.meshAsset({ url: 'assets/models/chamber_broken.obj' }).preload(),
  wf.meshAsset({ url: 'assets/models/fan.obj' }).preload(),
]);

const FanTag = trait();

export function createChamber(world: World, foggyMaterial: FoggyMaterial) {
  const chamberEntity = world.spawn(
    wf.MeshTrait(chamberMesh),
    wf.TransformTrait({ position: d.vec3f(0, 0, 0), scale: d.vec3f(1) }),
    ...foggyMaterial.Bundle({ albedo: d.vec3f(1) }),
  );

  const chamberBrokenEntity = world.spawn(
    wf.MeshTrait(chamberBrokenMesh),
    wf.TransformTrait({ position: d.vec3f(0, 0, 0), scale: d.vec3f(0) }),
    ...foggyMaterial.Bundle({ albedo: d.vec3f(1) }),
  );

  // Fans
  world.spawn(
    FanTag,
    wf.MeshTrait(fanMesh),
    wf.TransformTrait({ position: d.vec3f(0, 12, 0), scale: d.vec3f(2) }),
    ...foggyMaterial.Bundle({ albedo: d.vec3f(1) }),
  );

  return {
    update() {
      world.query(FanTag, wf.TransformTrait).updateEach(([transform]) => {
        quatn.fromEuler(
          0,
          performance.now() * 0.001,
          0,
          'xyz',
          transform.rotation,
        );
      });

      if (endingState.step >= FALLING_STEP && chamberEntity.isAlive()) {
        chamberEntity.destroy();
        chamberBrokenEntity.get(wf.TransformTrait)!.scale.x = 1;
        chamberBrokenEntity.get(wf.TransformTrait)!.scale.y = 1;
        chamberBrokenEntity.get(wf.TransformTrait)!.scale.z = 1;
      }
    },
  };
}
