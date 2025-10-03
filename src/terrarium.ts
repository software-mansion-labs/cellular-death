import { trait, type World } from 'koota';
import tgpu, { type TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as wf from 'wayfare';
import { quatn } from 'wgpu-matrix';
import { createBoxMesh } from './boxMesh.ts';
import { createMoldSim } from './mold.ts';
import { InputData } from './inputManager.ts';
import { sphereFragment, sphereVertex } from './water/render/sphere.ts';

const VOLUME_SIZE = 128;
const RAYMARCH_STEPS = 128;
const DENSITY_MULTIPLIER = 2;
const boxMesh = createBoxMesh(0.5, 0.5, 0.5);

const Terrarium = trait({
  angularMomentum: () => d.vec2f(),
});

export function createTerrarium(root: TgpuRoot, world: World) {
  const canFilter = root.enabledFeatures.has('float32-filterable');

  const renderLayout = tgpu.bindGroupLayout({
    state: {
      texture: d.texture3d(),
      sampleType: canFilter ? 'float' : 'unfilterable-float',
    },
    cameraPos: { uniform: d.vec3f },
  });

  const sampler = tgpu['~unstable'].sampler({
    magFilter: canFilter ? 'linear' : 'nearest',
    minFilter: canFilter ? 'linear' : 'nearest',
  });

  const MoldMaterial = wf.createMaterial({
    vertexLayout: wf.POS_NORMAL_UV,
    createPipeline({ root, format, $$ }) {
      const Varying = {
        localPos: d.vec3f,
        cameraPos: d.vec3f,
      };

      const vertexFn = tgpu['~unstable'].vertexFn({
        in: {
          idx: d.builtin.vertexIndex,
          pos: d.vec3f,
          normal: d.vec3f,
          uv: d.vec2f,
        },
        out: { pos: d.builtin.position, ...Varying },
      })((input) => {
        const worldPos = $$.modelMat.mul(d.vec4f(input.pos, 1));
        const pos = $$.viewProjMat.mul(worldPos);

        return {
          pos,
          localPos: input.pos,
          cameraPos: $$.invModelMat.mul(d.vec4f(renderLayout.$.cameraPos, 1))
            .xyz,
        };
      });

      const fragmentFn = tgpu['~unstable'].fragmentFn({
        in: { ...Varying },
        out: d.vec4f,
      })(({ localPos, cameraPos }) => {
        // The local-space position of the camera (the near-clip plane to be exact).
        const near = cameraPos;

        // We're rendering the box mesh inside-out, so the reported
        // local position is actually the backside of the box.
        const boxFar = localPos;
        const rayDir = std.normalize(boxFar.sub(near));
        // We're just backing up a bit to start marching.
        // Taking the largest possible length through the box (lazy approx)
        const boxNear = boxFar.sub(rayDir.mul(2));

        const rayOrigin = near;

        // March params
        const tStart = std.max(std.dot(rayDir, boxNear.sub(rayOrigin)), 0);
        const tEnd = std.dot(rayDir, boxFar.sub(rayOrigin));
        const numSteps = RAYMARCH_STEPS;
        const stepSize = (tEnd - tStart) / numSteps;

        const thresholdLo = d.f32(0.06);
        const thresholdHi = d.f32(0.25);
        const gamma = d.f32(1.4);
        const sigmaT = d.f32(DENSITY_MULTIPLIER);

        const albedo = d.vec3f(1);

        let transmittance = d.f32(1);
        let accum = d.vec3f();

        const TMin = d.f32(1e-3);

        for (let i = 0; i < numSteps; i++) {
          if (transmittance <= TMin) {
            break;
          }

          const t = tStart + (d.f32(i) + 0.5) * stepSize;
          const pos = rayOrigin.add(rayDir.mul(t));
          const texCoord = pos.add(d.vec3f(0.5, 0.5, 0.5));
          if (
            texCoord.x < 0 ||
            texCoord.x > 1 ||
            texCoord.y < 0 ||
            texCoord.y > 1 ||
            texCoord.z < 0 ||
            texCoord.z > 1
          ) {
            continue;
          }

          const sampleValue = std.textureSampleLevel(
            renderLayout.$.state,
            sampler,
            texCoord,
            0,
          ).x;

          const d0 = std.smoothstep(thresholdLo, thresholdHi, sampleValue);
          const density = std.pow(d0, gamma);

          const alphaSrc = 1 - std.exp(-sigmaT * density * stepSize);

          const contrib = albedo.mul(alphaSrc);

          accum = accum.add(contrib.mul(transmittance));
          transmittance = transmittance * (1 - alphaSrc);
        }

        const alpha = 1 - transmittance;
        return d.vec4f(0.2, 0.2, 0.2, 1).mul(0.4).add(d.vec4f(accum, alpha));
      });

      return {
        pipeline: root['~unstable']
          .withVertex(vertexFn, wf.POS_NORMAL_UV.attrib)
          .withFragment(fragmentFn, {
            format,
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
            },
          })
          .withPrimitive({ topology: 'triangle-list', cullMode: 'front' })
          .withDepthStencil({
            depthWriteEnabled: true,
            depthCompare: 'less',
            format: 'depth24plus',
          })
          .createPipeline(),
      };
    },
  });




const WaterMaterial = wf.createMaterial({
  vertexLayout: wf.POS_NORMAL_UV,
  createPipeline({ root, format, $$ }) {
    const Varying = {
      localPos: d.vec3f,
      cameraPos: d.vec3f,
    };

    return {
      pipeline: root['~unstable']
        .withVertex(sphereVertex, wf.POS_NORMAL_UV.attrib)
        .withFragment(sphereFragment, { fragColor: { format } })
        .withPrimitive({ topology: 'triangle-list', cullMode: 'none' })
        .withDepthStencil({
          depthWriteEnabled: true,
          depthCompare: 'less',
          format: 'depth24plus',
        })
        .createPipeline(),
    };
  },
});


  const sim = createMoldSim(root, VOLUME_SIZE);
  const cameraPosUniform = root.createUniform(d.vec3f);

  const renderBindGroups = [0, 1].map((i) =>
    root.createBindGroup(renderLayout, {
      state: sim.textures[i],
      cameraPos: cameraPosUniform.buffer,
    }),
  );

  // Terrarium
  world.spawn(
    Terrarium(),
    wf.MeshTrait(boxMesh),
    ...MoldMaterial.Bundle(),
    wf.TransformTrait({ position: d.vec3f(0, 0, -1.5) }),
    wf.ExtraBindingTrait({ group: undefined }),
  );

  world.spawn(
    wf.MeshTrait(boxMesh),
    ...WaterMaterial.Bundle(),
    wf.TransformTrait({ position: d.vec3f(0, 0, -1.5) }),
  );

  return {
    update() {
      // Update terrarium logic here
      sim.tick(world);

      const time = wf.getOrThrow(world, wf.Time);

      // biome-ignore lint/style/noNonNullAssertion: there's a camera
      const camera = world.queryFirst(wf.ActiveCameraTag)!;
      const cameraPos = wf.getOrThrow(camera, wf.TransformTrait).position;

      const inputData = wf.getOrThrow(world, InputData);

      world
        .query(Terrarium, wf.TransformTrait, wf.ExtraBindingTrait)
        .updateEach(([terrarium, transform, extraBinding]) => {
          extraBinding.group = renderBindGroups[1 - sim.currentTexture];
          cameraPosUniform.write(cameraPos);

          const ang = terrarium.angularMomentum;
          ang.x = wf.encroach(ang.x, 0, 0.01, time.deltaSeconds);
          ang.y = wf.encroach(ang.y, 0, 0.01, time.deltaSeconds);

          quatn.mul(
            quatn.fromEuler(ang.x, ang.y, 0, 'xyz', d.vec4f()),
            transform.rotation,
            transform.rotation,
          );

          if (inputData.dragging) {
            ang.x = inputData.dragDeltaY * 0.002;
            ang.y = inputData.dragDeltaX * 0.002;
          }
        });
    },
  };
}
