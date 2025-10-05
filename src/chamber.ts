import { trait, type World } from 'koota';
import * as d from 'typegpu/data';
import * as wf from 'wayfare';
import { quatn } from 'wgpu-matrix';
import type { FoggyMaterial } from './foggyMaterial';

const [chamberMesh, fanMesh] = await Promise.all([
  wf.meshAsset({ url: '/assets/models/chamber.obj' }).preload(),
  wf.meshAsset({ url: '/assets/models/fan.obj' }).preload(),
]);

const FanTag = trait();

export function createChamber(world: World, foggyMaterial: FoggyMaterial) {
  world.spawn(
    wf.MeshTrait(chamberMesh),
    wf.TransformTrait({ position: d.vec3f(0, 0, 0), scale: d.vec3f(1) }),
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
    },
  };
}
