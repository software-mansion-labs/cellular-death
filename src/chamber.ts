import type { World } from 'koota';
import tgpu, { type TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as wf from 'wayfare';
import chamberUrl from './assets/chamber.obj?url';
import type { Sun } from './sun';

const chamberMesh = await wf.meshAsset({ url: chamberUrl }).preload();

const layout = tgpu
  .bindGroupLayout({
    lightViewProj: { uniform: d.mat4x4f },
    shadowMap: { texture: d.textureDepth2d() },
    comparisonSampler: { sampler: 'comparison' },
  })
  .$name('chamberLayout');

export function createChamber(root: TgpuRoot, world: World, sun: Sun) {
  const comparisonSampler = tgpu['~unstable'].comparisonSampler({
    compare: 'less-equal',
    magFilter: 'linear',
    minFilter: 'linear',
  });

  // TODO: Update every frame
  const lightViewProjUniform = root.createUniform(d.mat4x4f, sun.viewProjMat);

  const ChamberMaterial = wf.createMaterial({
    vertexLayout: wf.POS_NORMAL_UV,

    createPipeline({ root, format, $$ }) {
      const Varying = {
        normal: d.vec3f,
        uv: d.vec2f,
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
        return {
          pos: $$.viewProjMat.mul(worldPos),
          normal: std.mul($$.normalModelMat, d.vec4f(input.normal, 0)).xyz,
          uv: input.uv,
          worldPos: worldPos.xyz,
        };
      });

      const sunDir = std.normalize(d.vec3f(-0.5, 2, -0.5));

      const fragmentFn = tgpu['~unstable'].fragmentFn({
        in: { ...Varying },
        out: d.vec4f,
      })((input) => {
        const lp4 = layout.$.lightViewProj.mul(d.vec4f(input.worldPos, 1));
        const ndc = lp4.xyz.div(lp4.w);
        let uv = ndc.xy.mul(0.5).add(0.5);
        uv = d.vec2f(uv.x, 1.0 - uv.y);
        const currentDepth = ndc.z;

        const inBounds =
          std.all(std.ge(uv, d.vec2f(0.0, 0.0))) &&
          std.all(std.le(uv, d.vec2f(1.0, 1.0)));

        let shadowFactor = std.textureSampleCompare(
          layout.$.shadowMap,
          layout.$.comparisonSampler,
          uv,
          currentDepth,
        );
        if (!inBounds) {
          shadowFactor = d.f32(1);
        }

        const normal = std.normalize(input.normal);

        const diffuse = d.vec3f(1.0, 0.9, 0.7);
        const ambient = d.vec3f(0.1, 0.15, 0.2);
        const att = std.max(0, std.dot(normal, sunDir)) * shadowFactor;

        const finalColor = std.mul(
          std.add(ambient, std.mul(att, diffuse)),
          // Albedo
          d.vec3f(1, 1, 1),
        );
        return d.vec4f(finalColor, 1.0);

        // TEST
        // if (inBounds) {
        //   return d.vec4f(d.vec3f(shadowFactor), 1.0);
        // } else {
        //   return d.vec4f(d.vec3f(1, 0, 0), 1.0);
        // }
      });

      const bindGroup = root.createBindGroup(layout, {
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
}
