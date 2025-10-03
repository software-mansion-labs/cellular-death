import { perlin3d } from '@typegpu/noise';
import { trait, type World } from 'koota';
import tgpu, { type TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as wf from 'wayfare';
import { quatn } from 'wgpu-matrix';
import { createBoxMesh } from './boxMesh.ts';
import { InputData } from './inputManager.ts';
import { createMoldSim } from './mold.ts';

const VOLUME_SIZE = 128;
const RAYMARCH_STEPS = 256;
const DENSITY_MULTIPLIER = 20;
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
    terrain: {
      texture: d.texture3d(),
      sampleType: canFilter ? 'float' : 'unfilterable-float',
    },
    cameraPos: { uniform: d.vec3f },
  });

  const getMoldDensity = (coord: d.v3f): number => {
    'kernel';
    return std.textureSampleLevel(renderLayout.$.state, sampler, coord, 0).x;
  };

  const sampler = tgpu['~unstable'].sampler({
    magFilter: canFilter ? 'linear' : 'nearest',
    minFilter: canFilter ? 'linear' : 'nearest',
  });

  const resolution = d.vec3f(VOLUME_SIZE);
  const cache = perlin3d.staticCache({ root, size: d.vec3u(resolution) });

  const terrain = root['~unstable']
    .createTexture({
      size: [resolution.x, resolution.y, resolution.z],
      format: 'r32float',
      dimension: '3d',
    })
    .$usage('sampled', 'storage');

  const terrainWriteView = terrain.createView(
    d.textureStorage3d('r32float', 'write-only'),
  );
  const terrainReadView = terrain.createView(
    d.textureStorage3d('r32float', 'read-only'),
  );
  const terrainSampled = terrain.createView();

  const initTerrain = tgpu['~unstable'].computeFn({
    in: { gid: d.builtin.globalInvocationId },
    workgroupSize: [4, 4, 4],
  })(({ gid }) => {
    const dims = std.textureDimensions(terrainWriteView.$);
    if (gid.x >= dims.x || gid.y >= dims.y || gid.z >= dims.z) return;

    const pos = d.vec3f(gid.xyz);
    const scale = d.f32(0.02);
    const noiseValue = perlin3d.sample(pos.mul(scale));

    std.textureStore(
      terrainWriteView.$,
      gid.xyz,
      d.vec4f(std.saturate(noiseValue), 0, 0, 1),
    );
  });

  const terrainPipeline = root['~unstable']
    .pipe(cache.inject())
    .withCompute(initTerrain)
    .createPipeline();

  terrainPipeline.dispatchWorkgroups(
    Math.ceil(resolution.x / 4),
    Math.ceil(resolution.y / 4),
    Math.ceil(resolution.z / 4),
  );

  const MoldMaterial = wf.createMaterial({
    vertexLayout: wf.POS_NORMAL_UV,
    createPipeline({ root, format, $$ }) {
      const Varying = {
        localPos: d.vec3f,
        cameraPos: d.vec3f,
        localLightDir: d.vec3f,
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

        const worldLightDir = d.vec3f(0, -1, 0);
        const localLightDir = std.normalize(
          $$.invModelMat.mul(d.vec4f(worldLightDir, 0)).xyz,
        );

        return {
          pos,
          localPos: input.pos,
          cameraPos: $$.invModelMat.mul(d.vec4f(renderLayout.$.cameraPos, 1))
            .xyz,
          localLightDir,
        };
      });

      const fragmentFn = tgpu['~unstable'].fragmentFn({
        in: { ...Varying },
        out: d.vec4f,
      })(({ localPos, cameraPos, localLightDir }) => {
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

        const slimeAlbedo = d.vec3f(0.57, 0.44, 0.96);
        const terrainAlbedo = d.vec3f(0.3, 0.24, 0.3);

        const lightDir = localLightDir;
        const ambientLight = d.f32(0.3);
        const diffuseStrength = d.f32(0.7);

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

          const terrainValue = std.textureSampleLevel(
            terrainSampled.$,
            sampler,
            texCoord,
            0,
          ).x;

          if (terrainValue > 0.07) {
            const edgeThreshold = d.f32(0.05);
            let terrainNormal = d.vec3f(0, 1, 0);
            let boxNormal = d.vec3f(0, 0, 0);
            let edgeWeight = d.f32(0);

            const distX = std.min(texCoord.x, 1.0 - texCoord.x);
            const distY = std.min(texCoord.y, 1.0 - texCoord.y);
            const distZ = std.min(texCoord.z, 1.0 - texCoord.z);

            if (distX < edgeThreshold) {
              const weight = 1.0 - distX / edgeThreshold;
              const wallNormal = std.select(
                d.vec3f(1, 0, 0),
                d.vec3f(-1, 0, 0),
                texCoord.x > 0.5,
              );
              boxNormal = boxNormal.add(wallNormal.mul(weight));
              edgeWeight = edgeWeight + weight;
            }
            if (distY < edgeThreshold) {
              const weight = 1.0 - distY / edgeThreshold;
              const wallNormal = std.select(
                d.vec3f(0, 1, 0),
                d.vec3f(0, -1, 0),
                texCoord.y > 0.5,
              );
              boxNormal = boxNormal.add(wallNormal.mul(weight));
              edgeWeight = edgeWeight + weight;
            }
            if (distZ < edgeThreshold) {
              const weight = 1.0 - distZ / edgeThreshold;
              const wallNormal = std.select(
                d.vec3f(0, 0, 1),
                d.vec3f(0, 0, -1),
                texCoord.z > 0.5,
              );
              boxNormal = boxNormal.add(wallNormal.mul(weight));
              edgeWeight = edgeWeight + weight;
            }

            if (edgeWeight > 0) {
              boxNormal = std.normalize(boxNormal);
            }

            let gradientNormal = d.vec3f(0, 1, 0);
            {
              const gradientOffset = d.f32(1.0 / VOLUME_SIZE);
              const texCoordMin = d.vec3f(0.0);
              const texCoordMax = d.vec3f(1.0);

              const texCoordX = std.clamp(
                texCoord.add(d.vec3f(gradientOffset, 0, 0)),
                texCoordMin,
                texCoordMax,
              );
              const texCoordY = std.clamp(
                texCoord.add(d.vec3f(0, gradientOffset, 0)),
                texCoordMin,
                texCoordMax,
              );
              const texCoordZ = std.clamp(
                texCoord.add(d.vec3f(0, 0, gradientOffset)),
                texCoordMin,
                texCoordMax,
              );

              const terrainX = std.textureSampleLevel(
                terrainSampled.$,
                sampler,
                texCoordX,
                0,
              ).x;
              const terrainY = std.textureSampleLevel(
                terrainSampled.$,
                sampler,
                texCoordY,
                0,
              ).x;
              const terrainZ = std.textureSampleLevel(
                terrainSampled.$,
                sampler,
                texCoordZ,
                0,
              ).x;

              const terrainGradient = d.vec3f(
                terrainX - terrainValue,
                terrainY - terrainValue,
                terrainZ - terrainValue,
              );

              const terrainGradientLength = std.length(terrainGradient);
              if (terrainGradientLength > 0.001) {
                gradientNormal = std.normalize(terrainGradient);
              }
            }

            if (edgeWeight > 0) {
              const blendFactor = std.saturate(edgeWeight);
              terrainNormal = std.normalize(
                std.mix(gradientNormal, boxNormal, blendFactor),
              );
            } else {
              terrainNormal = gradientNormal;
            }

            const terrainDiffuse = std.max(
              std.dot(terrainNormal, lightDir),
              0.0,
            );
            const terrainLighting =
              ambientLight + diffuseStrength * terrainDiffuse;

            const terrainContrib = terrainAlbedo
              .mul(terrainLighting)
              .mul(transmittance);
            accum = accum.add(terrainContrib);
            transmittance = d.f32(0);
            break;
          }

          const sampleValue = getMoldDensity(texCoord);
          const d0 = std.smoothstep(thresholdLo, thresholdHi, sampleValue);
          const density = std.pow(d0, gamma);

          if (density > 0.01) {
            const gradientOffset = d.f32(5.0 / VOLUME_SIZE);
            const texCoordMin = d.vec3f(0.0);
            const texCoordMax = d.vec3f(1.0);

            const slimeTexCoordX = std.clamp(
              texCoord.add(d.vec3f(gradientOffset, 0, 0)),
              texCoordMin,
              texCoordMax,
            );
            const slimeTexCoordY = std.clamp(
              texCoord.add(d.vec3f(0, gradientOffset, 0)),
              texCoordMin,
              texCoordMax,
            );
            const slimeTexCoordZ = std.clamp(
              texCoord.add(d.vec3f(0, 0, gradientOffset)),
              texCoordMin,
              texCoordMax,
            );

            const sampleX = std.textureSampleLevel(
              renderLayout.$.state,
              sampler,
              slimeTexCoordX,
              0,
            ).x;
            const sampleY = std.textureSampleLevel(
              renderLayout.$.state,
              sampler,
              slimeTexCoordY,
              0,
            ).x;
            const sampleZ = std.textureSampleLevel(
              renderLayout.$.state,
              sampler,
              slimeTexCoordZ,
              0,
            ).x;

            const gradient = d.vec3f(
              sampleX - sampleValue,
              sampleY - sampleValue,
              sampleZ - sampleValue,
            );

            const gradientLength = std.length(gradient);
            let normal = d.vec3f(0, 1, 0);
            if (gradientLength > 0.001) {
              normal = std.normalize(gradient);
            }

            const diffuse = std.max(std.dot(normal, lightDir), 0.0);
            const lighting = ambientLight + diffuseStrength * diffuse;

            const alphaSrc = 1 - std.exp(-sigmaT * density * stepSize);
            const litColor = slimeAlbedo.mul(lighting);
            const contrib = litColor.mul(alphaSrc);

            accum = accum.add(contrib.mul(transmittance));
            transmittance = transmittance * (1 - alphaSrc);
          }
        }

        const alpha = 1 - transmittance;
        return d.vec4f(accum, alpha);
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

  const sim = createMoldSim(root, VOLUME_SIZE, terrainReadView);
  const cameraPosUniform = root.createUniform(d.vec3f);

  const renderBindGroups = [0, 1].map((i) =>
    root.createBindGroup(renderLayout, {
      state: sim.textures[i],
      terrain: terrainSampled,
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
            ang.x = inputData.dragDeltaY * 2;
            ang.y = inputData.dragDeltaX * 2;
          }
        });
    },
  };
}
