import type { World } from 'koota';
import { type TgpuRoot, tgpu } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as wf from 'wayfare';
import { mat4n } from 'wgpu-matrix';

const shadowMapSize = 2048;

// Data structures
const Camera = d.struct({
  projection: d.mat4x4f,
  view: d.mat4x4f,
  position: d.vec3f,
});

const DirectionalLight = d.struct({
  direction: d.vec3f,
  color: d.vec3f,
});

const LightSpace = d.struct({
  viewProj: d.mat4x4f,
});

const layout = tgpu.bindGroupLayout({
  shadowMap: { texture: d.textureDepth2d() },
  comparisonSampler: { sampler: 'comparison' },
});

// Utility functions
function makeLightViewProj(lightDir: d.v3f, center: d.v3f = d.vec3f()) {
  const dir = std.normalize(lightDir);
  const dist = 10;
  const eye = center.add(dir.mul(-dist));
  const view = mat4n.lookAt(eye, center, [0, 1, 0], d.mat4x4f());
  const proj = mat4n.ortho(-2, 2, -2, 2, 0.1, 30, d.mat4x4f());
  return mat4n.mul(proj, view, d.mat4x4f());
}

export function createSun(root: TgpuRoot, world: World, engine: wf.Engine) {
  const comparisonSampler = tgpu['~unstable'].comparisonSampler({
    compare: 'less-equal',
    magFilter: 'linear',
    minFilter: 'linear',
  });

  const shadowMap = root['~unstable']
    .createTexture({
      size: [shadowMapSize, shadowMapSize],
      format: 'depth32float',
    })
    .$usage('render', 'sampled');

  const bindGroup = root.createBindGroup(layout, {
    shadowMap: shadowMap,
    comparisonSampler: comparisonSampler,
  });

  const shadowCasterMaterial = wf.createMaterial({
    vertexLayout: wf.POS_NORMAL_UV,
    createPipeline({ root, $$ }) {
      const shadowVert = tgpu['~unstable'].vertexFn({
        in: { pos: d.vec4f },
        out: { pos: d.builtin.position },
      })(({ pos }) => {
        const world = $$.modelMat.mul(pos);
        const clip = $$.viewProjMat.mul(world);
        return { pos: clip };
      });

      return {
        pipeline: root['~unstable']
          .withVertex(shadowVert, wf.POS_NORMAL_UV.attrib)
          .withPrimitive({ topology: 'triangle-list', cullMode: 'back' })
          .withDepthStencil({
            format: 'depth32float',
            depthWriteEnabled: true,
            depthCompare: 'less',
            depthBias: 1,
            depthBiasSlopeScale: 4,
            depthBiasClamp: 0,
          })
          .createPipeline()
          .with(layout, bindGroup),
      };
    },
  });

  /*
  const dir = std.normalize(lightDir);
  const dist = 10;
  const eye = center.add(dir.mul(-dist));
  const view = mat4n.lookAt(eye, center, [0, 1, 0], d.mat4x4f());
  const proj = mat4n.ortho(-2, 2, -2, 2, 0.1, 30, d.mat4x4f());
  return mat4n.mul(proj, view, d.mat4x4f()); */

  const orthographicConfig: wf.OrthographicConfig = {
    type: 'orthographic',
    left: -2,
    right: 2,
    bottom: -2,
    top: 2,
    near: 0.1,
    far: 30,
    clearColor: [0, 0, 0, 1],
  };

  return {
    shadowMap,
    update() {
      // Rendering to the shadow-map
      engine.renderer.render({
        colorAttachments: [],
        depthStencilAttachment: {
          view: root.unwrap(shadowMap).createView(),
          depthLoadOp: 'clear',
          depthStoreOp: 'store',
          depthClearValue: 1.0,
        },
      });
    },
  };
}
