import type { World } from 'koota';
import * as d from 'typegpu/data';
import * as wf from 'wayfare';
import chamberUrl from './assets/chamber.obj?url';

const chamberMesh = await wf.meshAsset({ url: chamberUrl }).preload();

export function createChamber(world: World) {
  world.spawn(
    wf.MeshTrait(chamberMesh),
    wf.TransformTrait({ position: d.vec3f(0, 0, 0), scale: d.vec3f(0.5) }),
    ...wf.BlinnPhongMaterial.Bundle({ albedo: d.vec3f(1) }),
  );
}
