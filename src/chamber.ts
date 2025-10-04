import { perlin2d, randf } from '@typegpu/noise';
import type { World } from 'koota';
import tgpu, { type TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as wf from 'wayfare';
import chamberUrl from './assets/chamber.obj?url';
import type { Sun } from './sun';

const fogStart = 1;
const fogEnd = 25;
const volumetricSteps = 32;
const fogColor = d.vec3f(0.4, 0.4, 0.55);
const chamberMesh = await wf.meshAsset({ url: chamberUrl }).preload();

const layout = tgpu
  .bindGroupLayout({
    cameraPos: { uniform: d.vec3f },
    lightDir: { uniform: d.vec3f },
    lightViewProj: { uniform: d.mat4x4f },
    time: { uniform: d.f32 },
    shadowMap: { texture: d.textureDepth2d() },
    comparisonSampler: { sampler: 'comparison' },
  })
  .$name('chamberLayout');

const sampleShadowMap = (ndc: d.v3f) => {
  'kernel';

  let uv = ndc.xy.mul(0.5).add(0.5);
  uv = d.vec2f(uv.x, 1.0 - uv.y);
  /**
   * Depth of the pixel in the light's local space
   */
  const currentDepth = ndc.z;

  const inBounds =
    std.all(std.ge(uv, d.vec2f(0.0, 0.0))) &&
    std.all(std.le(uv, d.vec2f(1.0, 1.0)));

  const shadowFactor = std.textureSampleCompare(
    layout.$.shadowMap,
    layout.$.comparisonSampler,
    uv,
    currentDepth,
  );

  return std.select(d.f32(1), shadowFactor, inBounds);
};

export function createChamber(root: TgpuRoot, world: World, sun: Sun) {
  const comparisonSampler = tgpu['~unstable'].comparisonSampler({
    compare: 'less-equal',
    magFilter: 'linear',
    minFilter: 'linear',
  });

  // TODO: Update every frame
  const lightViewProjUniform = root.createUniform(d.mat4x4f, sun.viewProjMat);
  const lightDirUniform = root.createUniform(d.vec3f, sun.direction);
  const cameraPosUniform = root.createUniform(d.vec3f);
  const timeUniform = root.createUniform(d.f32);

  const ChamberMaterial = wf.createMaterial({
    vertexLayout: wf.POS_NORMAL_UV,

    createPipeline({ root, format, $$ }) {
      const Varying = {
        normal: d.vec3f,
        uv: d.vec2f,
        /**
         * Pixel's position in light's NDC space.
         */
        posLNDC: d.vec3f,
        /**
         * Camera's position in light's NDC space.
         */
        camLNDC: d.vec3f,
        worldPos: d.vec3f,
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
        const posRelToLight = layout.$.lightViewProj.mul(worldPos);
        const camRelToLight = layout.$.lightViewProj.mul(
          d.vec4f(layout.$.cameraPos, 1),
        );
        const posLNDC = posRelToLight.xyz.div(posRelToLight.w);
        const camLNDC = camRelToLight.xyz.div(camRelToLight.w);

        return {
          pos: $$.viewProjMat.mul(worldPos),
          normal: std.mul($$.normalModelMat, d.vec4f(input.normal, 0)).xyz,
          uv: input.uv,
          posLNDC,
          camLNDC,
          worldPos: worldPos.xyz,
        };
      });

      const fragmentFn = tgpu['~unstable'].fragmentFn({
        in: { ...Varying, pixelCoord: d.builtin.position },
        out: d.vec4f,
      })((input) => {
        const shadowFactor = sampleShadowMap(input.posLNDC);
        const normal = std.normalize(input.normal);

        const diffuse = d.vec3f(1.0, 0.9, 0.7);
        const ambient = d.vec3f(0.1, 0.15, 0.2);
        const att =
          std.max(0, std.dot(normal, std.neg(layout.$.lightDir))) *
          shadowFactor;

        const finalColor = std.mul(
          std.add(ambient, std.mul(att, diffuse)),
          // Albedo
          d.vec3f(1, 1, 1),
        );

        // Fog
        const fogStrength = std.saturate(
          (input.pixelCoord.z / input.pixelCoord.w - fogStart) /
            (fogEnd - fogStart),
        );

        // Dust volumetrics
        const dustUV = std.normalize(input.worldPos).mul(10);
        const lightNoise =
          perlin2d.sample(dustUV.xy.add(layout.$.time)) * 0.005;
        const dustDisp = randf.inUnitSphere().mul(0.001);
        let dustFactor = d.f32(0);
        for (let i = 0; i < volumetricSteps; i++) {
          const ndct = std.mix(
            input.camLNDC,
            input.posLNDC,
            (i / volumetricSteps) * 0.6 + 0.4,
          );
          const factor = sampleShadowMap(ndct.add(dustDisp));
          dustFactor += factor * (0.025 + lightNoise * 0.02);
          // if (factor > 0) {
          //   dustFactor = 1;
          // }
        }

        return d.vec4f(
          std
            .mix(finalColor, fogColor, fogStrength)
            .add(d.vec3f(1, 0.8, 0.8).mul(dustFactor)),
          1,
        );
      });

      const bindGroup = root.createBindGroup(layout, {
        time: timeUniform.buffer,
        cameraPos: cameraPosUniform.buffer,
        lightDir: lightDirUniform.buffer,
        lightViewProj: lightViewProjUniform.buffer,
        shadowMap: sun.shadowMap,
        comparisonSampler: comparisonSampler,
      });

      return {
        pipeline: root['~unstable']
          .withVertex(vertexFn, wf.POS_NORMAL_UV.attrib)
          .withFragment(fragmentFn, { format })
          .withPrimitive({ topology: 'triangle-list', cullMode: 'back' })
          .withDepthStencil({
            depthWriteEnabled: true,
            depthCompare: 'less',
            format: 'depth24plus',
          })
          .createPipeline()
          .with(layout, bindGroup),
      };
    },
  });

  world.spawn(
    wf.MeshTrait(chamberMesh),
    wf.TransformTrait({ position: d.vec3f(0, 0, 0), scale: d.vec3f(1) }),
    ...ChamberMaterial.Bundle({ albedo: d.vec3f(1) }),
  );

  return {
    update() {
      timeUniform.write((performance.now() / 1000) % 1000);

      const cameraEntity = world.queryFirst(wf.ActiveCameraTag);

      // Update camera position uniform
      if (cameraEntity) {
        const cameraTransform = wf.getOrThrow(cameraEntity, wf.TransformTrait);
        cameraPosUniform.write(cameraTransform.position);
      }
    },
  };
}
