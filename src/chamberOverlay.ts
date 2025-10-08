import type { Entity, World } from 'koota';
import tgpu, { type TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as wf from 'wayfare';
import { createBoxMesh } from './boxMesh.ts';
import { getCurrentLevel } from './levels.ts';
import type { createMoldSim } from './mold.ts';

const VOLUME_SIZE = 128;
const RAYMARCH_STEPS = 32;
const DENSITY_MULTIPLIER = 20;

const boxMesh = createBoxMesh(0.5, 0.5, 0.5);

const blendState = {
  color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
} as const;

export function createChamberOverlay(
  root: TgpuRoot,
  world: World,
  sim: ReturnType<typeof createMoldSim>,
) {
  const canFilter = root.enabledFeatures.has('float32-filterable');

  const sampler = tgpu['~unstable'].sampler({
    magFilter: canFilter ? 'linear' : 'nearest',
    minFilter: canFilter ? 'linear' : 'nearest',
  });

  const MoldMaterial = wf.createMaterial({
    vertexLayout: wf.POS_NORMAL_UV,
    paramsSchema: d.struct({
      time: d.f32,
      cameraPos: d.vec3f,
    }),
    bindings: {
      state: {
        texture: d.texture3d(),
        sampleType: canFilter ? 'float' : 'unfilterable-float',
      },
    },
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
          cameraPos: $$.invModelMat.mul(d.vec4f($$.params.cameraPos, 1)).xyz,
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
        const boxNear = boxFar.sub(rayDir.mul(1));

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

        // const terrainAlbedo = d.vec3f(0.25, 0.23, 0.2).mul(0.5);

        const lightDir = localLightDir;
        const ambientLight = d.f32(0.3);
        const diffuseStrength = d.f32(0.6);

        let transmittance = d.f32(1);
        let accum = d.vec3f();

        const TMin = d.f32(1e-3);
        const creatureRadius = d.f32(0.05);
        const creatureColor = d.vec3f(1, 1, 0);

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

          const volumePos = texCoord.mul(VOLUME_SIZE);
          for (let c = d.u32(0); c < creatureCount.$; c = c + 1) {
            const isEaten = sim.creaturesReadonly.$[c].eaten;
            if (isEaten === 0) {
              const distToCreature = std.length(
                volumePos.sub(sim.creaturesReadonly.$[c].position),
              );

              if (distToCreature < creatureRadius * VOLUME_SIZE) {
                const creatureNormal = std.normalize(
                  volumePos.sub(sim.creaturesReadonly.$[c].position),
                );
                const creatureDiffuse = std.max(
                  std.dot(creatureNormal, lightDir),
                  0.0,
                );
                const creatureLighting =
                  ambientLight + diffuseStrength * creatureDiffuse;
                const creatureContrib = creatureColor
                  .mul(creatureLighting)
                  .mul(transmittance);

                accum = accum.add(creatureContrib);
                transmittance = d.f32(0);
                break;
              }
            }
          }

          if (transmittance <= TMin) {
            break;
          }

          const sampleVec = std.textureSampleLevel(
            $$.bindings.state,
            sampler,
            texCoord,
            0,
          );
          const sampleValue = sampleVec.x;
          const lifetimeNormalized = sampleVec.y;
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
              $$.bindings.state,
              sampler,
              slimeTexCoordX,
              0,
            ).x;
            const sampleY = std.textureSampleLevel(
              $$.bindings.state,
              sampler,
              slimeTexCoordY,
              0,
            ).x;
            const sampleZ = std.textureSampleLevel(
              $$.bindings.state,
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

            const clampedLifetime = std.min(lifetimeNormalized, 1.0);
            const deathIntensity = std.saturate(
              (lifetimeNormalized - 1.0) * 2.0,
            );

            const t1 = std.smoothstep(0.0, 0.4, clampedLifetime);
            const t2 = std.smoothstep(0.4, 0.85, clampedLifetime);
            const t3 = std.smoothstep(0.85, 1.0, clampedLifetime);

            const green = d.vec3f(0.2, 1.0, 0.4);
            const yellow = d.vec3f(1.0, 0.85, 0.0);
            const orange = d.vec3f(0.9, 0.4, 0.1);
            const darkRed = d.vec3f(0.4, 0.0, 0.0);
            const brightRed = d.vec3f(1.0, 0.1, 0.05);

            const c1 = std.mix(green, yellow, t1);
            const c2 = std.mix(c1, orange, t2);
            const baseColor = std.mix(c2, darkRed, t3);

            const deathPulse = std.sin($$.params.time * 4.0) * 0.15 + 0.85;
            const slimeAlbedo = std.mix(
              baseColor,
              brightRed.mul(deathPulse),
              deathIntensity,
            );

            const emission =
              (1.0 - clampedLifetime) * 0.35 + deathIntensity * 0.6;

            const alphaSrc = 1 - std.exp(-sigmaT * density * stepSize);
            const litColor = slimeAlbedo.mul(lighting + emission);
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
          .withFragment(fragmentFn, { format, blend: blendState })
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

  const timeUniform = root.createUniform(d.f32);
  const cameraPosUniform = root.createUniform(d.vec3f);
  const creatureCount = root.createMutable(d.u32, 0);

  // Ray-marched volume
  let overlay: Entity | undefined;

  return {
    update() {
      const now = (performance.now() / 1000) % 1000;
      timeUniform.write(now);

      // biome-ignore lint/style/noNonNullAssertion: there's a camera
      const camera = world.queryFirst(wf.ActiveCameraTag)!;
      const cameraPos = wf.getOrThrow(camera, wf.TransformTrait).position;
      cameraPosUniform.write(cameraPos);

      world
        .query(MoldMaterial.Params, MoldMaterial.Bindings)
        .updateEach(([params, bindings]) => {
          params.cameraPos = cameraPos;
          params.time = now;
          bindings.state = sim.textures[1 - sim.currentTexture];
        });

      if (getCurrentLevel()?.ending) {
        if (!overlay) {
          overlay = world.spawn(
            wf.MeshTrait(boxMesh),
            // ...wf.BlinnPhongMaterial.Bundle({ albedo: d.vec3f(1, 0, 0) }),
            ...MoldMaterial.Bundle(),
            wf.TransformTrait({ position: d.vec3f(0), scale: d.vec3f(10.9) }),
            wf.ExtraBindingTrait({ group: undefined }),
          );
        }
      } else {
        if (overlay) {
          overlay.destroy();
          overlay = undefined;
        }
      }
    },
  };
}
