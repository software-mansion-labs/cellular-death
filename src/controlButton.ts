import { trait, type World } from 'koota';
import * as d from 'typegpu/data';
import * as wf from 'wayfare';
import { quatn } from 'wgpu-matrix';
import { createBoxMesh } from './boxMesh';
import { EmissiveMaterial } from './emissiveMaterial';
import type { FoggyMaterial } from './foggyMaterial';
import { Hoverable } from './hoverable';
import { InputData } from './inputManager';

const ControlButtonTag = trait();
const ControlButtonFaceTag = trait();

const STEM_HEIGHT = 1.1;
const buttonStemMesh = createBoxMesh(0.06, STEM_HEIGHT / 2, 0.06);
const buttonNeckMesh = createBoxMesh(0.15, 0.15, 0.03);
const buttonFaceMesh = createBoxMesh(0.12, 0.12, 0.05);

export function createControlButtons(
  world: World,
  foggyMaterial: FoggyMaterial,
  onPress: () => void,
) {
  const parent = world.spawn(
    ControlButtonTag,
    wf.TransformTrait({ position: d.vec3f(0, -2, 1) }),
  );

  const stem = world.spawn(
    wf.MeshTrait(buttonStemMesh),
    wf.TransformTrait({ position: d.vec3f(0, STEM_HEIGHT / 2, 0) }),
    ...foggyMaterial.Bundle({ albedo: d.vec3f(0.5) }),
  );
  wf.connectAsChild(parent, stem);

  const neck = world.spawn(
    wf.MeshTrait(buttonNeckMesh),
    wf.TransformTrait({
      position: d.vec3f(0, STEM_HEIGHT + 0.1, 0),
      rotation: quatn.fromEuler(-0.4, 0, 0, 'xyz', d.vec4f()),
    }),
    ...foggyMaterial.Bundle({ albedo: d.vec3f(0.5) }),
  );
  wf.connectAsChild(parent, neck);

  const face = world.spawn(
    ControlButtonFaceTag,
    wf.MeshTrait(buttonFaceMesh),
    wf.TransformTrait({ position: d.vec3f(0, 0, 0) }),
    Hoverable({ boundsSize: d.vec3f(0.1) }),
    ...EmissiveMaterial.Bundle({ color: d.vec3f(0.6, 0.6, 0.8) }),
  );
  wf.connectAsChild(neck, face);

  return {
    update() {
      const inputData = wf.getOrThrow(world, InputData);

      world
        .query(ControlButtonFaceTag, Hoverable, EmissiveMaterial.Params)
        .updateEach(([hoverable, params]) => {
          params.color = hoverable.hover
            ? d.vec3f(0.8, 0.8, 1)
            : d.vec3f(0.6, 0.6, 0.8);

          if (hoverable.hover && inputData.dragging) {
            params.color = d.vec3f(0.9, 0.9, 1);
          }

          if (hoverable.hover && inputData.justLeftClicked) {
            onPress();
          }
        });
    },
  };
}
