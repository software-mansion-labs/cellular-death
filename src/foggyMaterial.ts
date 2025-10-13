import { perlin3d, randf } from '@typegpu/noise';
import type { World } from 'koota';
import tgpu, { type TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as wf from 'wayfare';
import { endingState, POUR_MOLD_STEP } from './endingState.ts';
import type { Sun } from './sun.ts';

const fogStart = 1;
const fogEnd = 25;
const volumetricSteps = 32;
const fogColor = d.vec3f(0.4, 0.4, 0.55);

const FoggyGlobalParams = d.struct({
  cameraPos: d.vec3f,
  lightDir: d.vec3f,
  lightViewProj: d.mat4x4f,
  time: d.f32,
  alarm: d.f32,
});

const FoggyParams = d.struct({
  albedo: d.vec3f,
});

const comparisonSampler = tgpu['~unstable'].comparisonSampler({
  compare: 'less-equal',
  magFilter: 'linear',
  minFilter: 'linear',
});

export type FoggyMaterial = ReturnType<typeof createFoggyMaterial>['material'];

export const createFoggyMaterial = (root: TgpuRoot, world: World, sun: Sun) => {
  const paramsUniform = root.createUniform(FoggyGlobalParams);
  const shadowMapView = sun.shadowMap.createView(d.textureDepth2d());
  const perlinCache = perlin3d.staticCache({ root, size: d.vec3u(64, 64, 64) });

  const sampleShadowMap = (ndc: d.v3f) => {
    'use gpu';

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
      shadowMapView.$,
      comparisonSampler,
      uv,
      currentDepth,
    );

    return std.select(d.f32(1), shadowFactor, inBounds);
  };

  const material = wf.createMaterial({
    paramsSchema: FoggyParams,
    paramsDefaults: {
      albedo: d.vec3f(1),
    },
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
        const posRelToLight = paramsUniform.$.lightViewProj.mul(worldPos);
        const camRelToLight = paramsUniform.$.lightViewProj.mul(
          d.vec4f(paramsUniform.$.cameraPos, 1),
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
          std.max(0, std.dot(normal, std.neg(paramsUniform.$.lightDir))) *
          shadowFactor;

        const finalColor = std.mul(
          std.add(ambient, std.mul(att, diffuse)),
          // Albedo
          $$.params.albedo,
        );

        // Fog
        const fogStrength = std.saturate(
          (input.pixelCoord.z / input.pixelCoord.w - fogStart) /
            (fogEnd - fogStart),
        );

        // Dust volumetrics
        let dustFactor = d.f32(0);
        for (let i = 0; i < volumetricSteps; i++) {
          randf.seed2(input.uv);
          const ndct = std.mix(
            input.camLNDC,
            input.posLNDC,
            (i / volumetricSteps) * 0.6 + 0.4 + (randf.sample() * 2 - 1) * 0.01,
          );
          const factor = sampleShadowMap(ndct);
          const dustUV = std
            .normalize(input.worldPos)
            .mul(2)
            .add(paramsUniform.$.time * 0.1);
          const dustSmallUV = std
            .normalize(input.worldPos)
            .mul(8)
            .add(paramsUniform.$.time * 0.1);
          const lightNoise =
            perlin3d.sample(dustUV) + perlin3d.sample(dustSmallUV) * 0.4;
          dustFactor += factor * (0.025 + lightNoise * 0.02);
        }

        const foggyColor = d.vec4f(
          std
            .mix(finalColor, fogColor, fogStrength)
            .add(d.vec3f(1, 0.8, 0.8).mul(dustFactor)),
          1,
        );

        const alarmColor = foggyColor
          .mul(d.vec4f(1, 0.5, 0.5, 1))
          .add(d.vec4f(0.4, 0.1, 0.1, 0));

        return std.mix(
          foggyColor,
          alarmColor,
          paramsUniform.$.alarm *
            (0.6 + std.abs(std.sin(paramsUniform.$.time * 2) * 0.4)),
        );
      });

      return {
        pipeline: root['~unstable']
          .pipe(perlinCache.inject())
          .withVertex(vertexFn, wf.POS_NORMAL_UV.attrib)
          .withFragment(fragmentFn, { format })
          .withPrimitive({ topology: 'triangle-list', cullMode: 'back' })
          .withDepthStencil({
            depthWriteEnabled: true,
            depthCompare: 'less',
            format: 'depth24plus',
          })
          .createPipeline(),
      };
    },
  });

  return {
    material: material,
    update() {
      const cameraEntity = world.queryFirst(wf.ActiveCameraTag);
      let cameraPos = d.vec3f();

      // Update camera position uniform
      if (cameraEntity) {
        const cameraTransform = wf.getOrThrow(cameraEntity, wf.TransformTrait);
        cameraPos = cameraTransform.position;
      }

      paramsUniform.write({
        lightViewProj: sun.viewProjMat,
        lightDir: sun.direction,
        cameraPos,
        time: (performance.now() / 1000) % 1000,
        alarm: endingState.step >= POUR_MOLD_STEP ? 1 : 0,
      });
    },
  };
};
