import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as wf from 'wayfare';

export const EmissiveMaterial = wf.createMaterial({
  paramsSchema: d.struct({
    color: d.vec3f,
  }),
  vertexLayout: wf.POS_NORMAL_UV,

  createPipeline({ root, format, $$ }) {
    const vertexFn = tgpu['~unstable'].vertexFn({
      in: { pos: d.vec3f },
      out: { pos: d.builtin.position },
    })((input) => {
      const worldPos = $$.modelMat.mul(d.vec4f(input.pos, 1));
      return {
        pos: $$.viewProjMat.mul(worldPos),
      };
    });

    const fragmentFn = tgpu['~unstable'].fragmentFn({
      out: d.vec4f,
    })(() => d.vec4f($$.params.color, 1.0));

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
        .createPipeline(),
    };
  },
});
