import {
  type RenderFlag,
  type SampledFlag,
  type TgpuRoot,
  type TgpuTexture,
  tgpu,
} from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as wf from 'wayfare';
import { mat4n, quatn } from 'wgpu-matrix';

interface Transform {
  position: d.v3f;
  rotation: d.v4f;
  scale: d.v3f;
}

const shadowMapSize = 4096;

export interface Sun {
  readonly viewProjMat: d.m4x4f;
  readonly direction: d.v3f;
  readonly shadowMap: TgpuTexture<{
    size: [number, number];
    format: 'depth32float';
  }> &
    RenderFlag &
    SampledFlag;

  update(): void;
}

export function createSun(root: TgpuRoot, engine: wf.Engine): Sun {
  const shadowMap = root['~unstable']
    .createTexture({
      size: [shadowMapSize, shadowMapSize],
      format: 'depth32float',
    })
    .$usage('render', 'sampled');

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
          .withPrimitive({ topology: 'triangle-list', cullMode: 'front' })
          .withDepthStencil({
            format: 'depth32float',
            depthWriteEnabled: true,
            depthCompare: 'less',
            depthBias: 0,
            depthBiasSlopeScale: 1,
            depthBiasClamp: 0,
          })
          .createPipeline(),
      };
    },
  });

  const orthographicConfig: wf.OrthographicConfig = {
    type: 'orthographic',
    left: -25,
    right: 25,
    bottom: -25,
    top: 25,
    near: 0.1,
    far: 20,
    clearColor: [0, 0, 0, 1],
  };

  const lightOrigin = d.vec3f(0, 16, 0);
  const lightDir = std.normalize(d.vec3f(-0.3, -1, 0.1));

  const lightRotMat = mat4n.cameraAim(
    lightOrigin,
    lightOrigin.add(lightDir),
    d.vec3f(0, 1, 0),
    d.mat4x4f(),
  );

  const lightTransform: Transform = {
    position: lightOrigin,
    rotation: quatn.fromMat(lightRotMat, d.vec4f()),
    scale: d.vec3f(1),
  };

  const viewProjMat = d.mat4x4f();

  const view = mat4n.lookAt(
    lightOrigin,
    lightOrigin.add(lightDir),
    d.vec3f(0, 1, 0),
    d.mat4x4f(),
  );
  const proj = mat4n.ortho(
    orthographicConfig.left,
    orthographicConfig.right,
    orthographicConfig.bottom,
    orthographicConfig.top,
    orthographicConfig.near,
    orthographicConfig.far,
    d.mat4x4f(),
  );
  mat4n.mul(proj, view, viewProjMat);

  return {
    viewProjMat,
    direction: lightDir,
    shadowMap,
    update() {
      engine.renderer.setPOV(lightTransform, orthographicConfig);

      // Rendering to the shadow-map
      engine.renderer.render({
        material: shadowCasterMaterial.material,
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
