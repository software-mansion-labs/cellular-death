import { randf } from '@typegpu/noise';
import type { World } from 'koota';
import tgpu, {
  prepareDispatch,
  type TgpuRoot,
  type TgpuTextureView,
} from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as wf from 'wayfare';

const NUM_AGENTS = 800_000;
const AGENT_WORKGROUP_SIZE = 64;
const BLUR_WORKGROUP_SIZE = [4, 4, 4];

const RANDOM_DIRECTION_WEIGHT = 0.3;
const CENTER_BIAS_WEIGHT = 0.7;

const DEFAULT_MOVE_SPEED = 30.0;
const DEFAULT_SENSOR_ANGLE = 0.5;
const DEFAULT_SENSOR_DISTANCE = 9.0;
const DEFAULT_TURN_SPEED = 10.0;
const DEFAULT_EVAPORATION_RATE = 0.05;

const Agent = d.struct({
  position: d.vec3f,
  direction: d.vec3f,
});

const Params = d.struct({
  deltaTime: d.f32,
  moveSpeed: d.f32,
  sensorAngle: d.f32,
  sensorDistance: d.f32,
  turnSpeed: d.f32,
  evaporationRate: d.f32,
});

export function createMoldSim(
  root: TgpuRoot,
  volumeSize: number,
  terrainTexture: TgpuTextureView<
    d.WgslStorageTexture3d<'r32float', 'read-only'>
  >,
) {
  const resolution = d.vec3f(volumeSize);

  const agentsData = root.createMutable(d.arrayOf(Agent, NUM_AGENTS));

  prepareDispatch(root, (x) => {
    'kernel';
    randf.seed(x / NUM_AGENTS);
    const pos = randf
      .inUnitSphere()
      .mul(resolution.x / 4)
      .add(resolution.div(2));
    const center = resolution.div(2);
    const dir = std.normalize(center.sub(pos));
    agentsData.$[x] = Agent({ position: pos, direction: dir });
  }).dispatch(NUM_AGENTS);

  const params = root.createUniform(Params, {
    deltaTime: 0,
    moveSpeed: DEFAULT_MOVE_SPEED,
    sensorAngle: DEFAULT_SENSOR_ANGLE,
    sensorDistance: DEFAULT_SENSOR_DISTANCE,
    turnSpeed: DEFAULT_TURN_SPEED,
    evaporationRate: DEFAULT_EVAPORATION_RATE,
  });

  const textures = [0, 1].map(() =>
    root['~unstable']
      .createTexture({
        size: [resolution.x, resolution.y, resolution.z],
        format: 'r32float',
        dimension: '3d',
      })
      .$usage('sampled', 'storage'),
  );

  const computeLayout = tgpu.bindGroupLayout({
    oldState: { storageTexture: d.textureStorage3d('r32float', 'read-only') },
    newState: { storageTexture: d.textureStorage3d('r32float', 'write-only') },
    terrain: { storageTexture: d.textureStorage3d('r32float', 'read-only') },
  });

  const SenseResult = d.struct({
    weightedDir: d.vec3f,
    totalWeight: d.f32,
  });

  const getPerpendicular = (dir: d.v3f) => {
    'kernel';
    let axis = d.vec3f(1, 0, 0);

    // Find the axis that is least aligned
    const absX = std.abs(dir.x);
    const absY = std.abs(dir.y);
    const absZ = std.abs(dir.z);

    if (absY <= absX && absY <= absZ) {
      axis = d.vec3f(0, 1, 0);
    } else if (absZ <= absX && absZ <= absY) {
      axis = d.vec3f(0, 0, 1);
    }

    return std.normalize(std.cross(dir, axis));
  };

  const getTerrainNormal = (pos: d.v3f, dimsf: d.v3f) => {
    'kernel';
    const offset = d.f32(2);
    const bounds = d.vec3f();
    const maxBounds = dimsf.sub(d.vec3f(1));

    const px = std.textureLoad(
      computeLayout.$.terrain,
      d.vec3u(std.clamp(pos.add(d.vec3f(offset, 0, 0)), bounds, maxBounds)),
    ).x;
    const nx = std.textureLoad(
      computeLayout.$.terrain,
      d.vec3u(std.clamp(pos.add(d.vec3f(-offset, 0, 0)), bounds, maxBounds)),
    ).x;
    const py = std.textureLoad(
      computeLayout.$.terrain,
      d.vec3u(std.clamp(pos.add(d.vec3f(0, offset, 0)), bounds, maxBounds)),
    ).x;
    const ny = std.textureLoad(
      computeLayout.$.terrain,
      d.vec3u(std.clamp(pos.add(d.vec3f(0, -offset, 0)), bounds, maxBounds)),
    ).x;
    const pz = std.textureLoad(
      computeLayout.$.terrain,
      d.vec3u(std.clamp(pos.add(d.vec3f(0, 0, offset)), bounds, maxBounds)),
    ).x;
    const nz = std.textureLoad(
      computeLayout.$.terrain,
      d.vec3u(std.clamp(pos.add(d.vec3f(0, 0, -offset)), bounds, maxBounds)),
    ).x;

    const gradient = d.vec3f(px - nx, py - ny, pz - nz);

    return std.select(
      d.vec3f(0, 1, 0),
      std.normalize(gradient),
      std.length(gradient) > 0.001,
    );
  };

  const sense3D = (pos: d.v3f, direction: d.v3f) => {
    'kernel';
    const dims = std.textureDimensions(computeLayout.$.oldState);
    const dimsf = d.vec3f(dims);

    let weightedDir = d.vec3f();
    let totalWeight = d.f32();

    const perp1 = getPerpendicular(direction);
    const perp2 = std.cross(direction, perp1);

    const numSamples = 8;
    for (let i = 0; i < numSamples; i++) {
      const theta = (i / numSamples) * 2 * Math.PI;

      const coneOffset = perp1
        .mul(std.cos(theta))
        .add(perp2.mul(std.sin(theta)));
      const sensorDir = std.normalize(
        direction.add(coneOffset.mul(std.sin(params.$.sensorAngle))),
      );

      const sensorPos = pos.add(sensorDir.mul(params.$.sensorDistance));
      const sensorPosInt = d.vec3u(
        std.clamp(sensorPos, d.vec3f(), dimsf.sub(d.vec3f(1))),
      );

      const weight = std.textureLoad(computeLayout.$.oldState, sensorPosInt).x;

      // Check if sensor position hits terrain
      const terrainValue = std.textureLoad(
        computeLayout.$.terrain,
        sensorPosInt,
      ).x;
      const terrainPenalty = std.select(1.0, 0.01, terrainValue > 0.07);

      weightedDir = weightedDir.add(sensorDir.mul(weight * terrainPenalty));
      totalWeight = totalWeight + weight * terrainPenalty;
    }

    return SenseResult({ weightedDir, totalWeight });
  };

  const updateAgents = tgpu['~unstable'].computeFn({
    in: { gid: d.builtin.globalInvocationId },
    workgroupSize: [AGENT_WORKGROUP_SIZE],
  })(({ gid }) => {
    if (gid.x >= NUM_AGENTS) {
      return;
    }

    randf.seed(gid.x / NUM_AGENTS + 0.1);

    const dims = std.textureDimensions(computeLayout.$.oldState);
    const dimsf = d.vec3f(dims);

    const agent = agentsData.$[gid.x];
    const random = randf.sample();

    let direction = std.normalize(agent.direction);
    const senseResult = sense3D(agent.position, direction);

    if (senseResult.totalWeight > 0.01) {
      const targetDir = std.normalize(senseResult.weightedDir);
      direction = std.normalize(
        direction.add(targetDir.mul(params.$.turnSpeed * params.$.deltaTime)),
      );
    } else {
      const perp = getPerpendicular(direction);
      const randomOffset = perp.mul(
        (random * 2 - 1) * params.$.turnSpeed * params.$.deltaTime,
      );
      direction = std.normalize(direction.add(randomOffset));
    }

    // Predictive collision detection - check ahead of agent
    const moveDistance = params.$.moveSpeed * params.$.deltaTime;
    const lookAheadDistance = moveDistance * 2.0;
    const lookAheadPos = agent.position.add(direction.mul(lookAheadDistance));

    const terrainValue = std.textureLoad(
      computeLayout.$.terrain,
      d.vec3u(std.clamp(lookAheadPos, d.vec3f(), dimsf.sub(d.vec3f(1)))),
    ).x;

    if (terrainValue > 0.07) {
      const terrainNormal = getTerrainNormal(lookAheadPos, dimsf);
      const reflectedDir = direction.sub(
        terrainNormal.mul(2.0 * std.dot(direction, terrainNormal)),
      );

      const randomOffset = randf.inUnitSphere().mul(0.2);
      direction = std.normalize(reflectedDir.add(randomOffset));
    }

    let newPos = agent.position.add(direction.mul(moveDistance));

    const finalTerrainCheck = std.textureLoad(
      computeLayout.$.terrain,
      d.vec3u(std.clamp(newPos, d.vec3f(), dimsf.sub(d.vec3f(1)))),
    ).x;
    if (finalTerrainCheck > 0.07) {
      const terrainNormal = getTerrainNormal(newPos, dimsf);
      newPos = agent.position.add(terrainNormal.mul(1.0));
    }

    const center = dimsf.div(2);

    if (newPos.x < 0 || newPos.x >= dimsf.x) {
      newPos.x = std.clamp(newPos.x, 0, dimsf.x - 1);
      let normal = d.vec3f(1, 0, 0);
      if (newPos.x > 1) {
        normal = d.vec3f(-1, 0, 0);
      }
      const randomDir = randf.inHemisphere(normal);
      const toCenter = std.normalize(center.sub(newPos));

      direction = std.normalize(
        randomDir
          .mul(RANDOM_DIRECTION_WEIGHT)
          .add(toCenter.mul(CENTER_BIAS_WEIGHT)),
      );
    }
    if (newPos.y < 0 || newPos.y >= dimsf.y) {
      newPos.y = std.clamp(newPos.y, 0, dimsf.y - 1);
      let normal = d.vec3f(0, 1, 0);
      if (newPos.y > 1) {
        normal = d.vec3f(0, -1, 0);
      }
      const randomDir = randf.inHemisphere(normal);
      const toCenter = std.normalize(center.sub(newPos));
      direction = std.normalize(
        randomDir
          .mul(RANDOM_DIRECTION_WEIGHT)
          .add(toCenter.mul(CENTER_BIAS_WEIGHT)),
      );
    }
    if (newPos.z < 0 || newPos.z >= dimsf.z) {
      newPos.z = std.clamp(newPos.z, 0, dimsf.z - 1);
      let normal = d.vec3f(0, 0, 1);
      if (newPos.z > 1) {
        normal = d.vec3f(0, 0, -1);
      }
      const randomDir = randf.inHemisphere(normal);
      const toCenter = std.normalize(center.sub(newPos));
      direction = std.normalize(
        randomDir
          .mul(RANDOM_DIRECTION_WEIGHT)
          .add(toCenter.mul(CENTER_BIAS_WEIGHT)),
      );
    }

    agentsData.$[gid.x] = Agent({
      position: newPos,
      direction,
    });

    const oldState = std.textureLoad(
      computeLayout.$.oldState,
      d.vec3u(newPos),
    ).x;
    const newState = oldState + 1;
    std.textureStore(
      computeLayout.$.newState,
      d.vec3u(newPos),
      d.vec4f(newState, 0, 0, 1),
    );
  });

  const blur = tgpu['~unstable'].computeFn({
    in: { gid: d.builtin.globalInvocationId },
    workgroupSize: BLUR_WORKGROUP_SIZE,
  })(({ gid }) => {
    const dims = std.textureDimensions(computeLayout.$.oldState);
    if (gid.x >= dims.x || gid.y >= dims.y || gid.z >= dims.z) return;

    let sum = d.f32();
    let count = d.f32();

    for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
      for (let offsetY = -1; offsetY <= 1; offsetY++) {
        for (let offsetX = -1; offsetX <= 1; offsetX++) {
          const samplePos = d
            .vec3i(gid.xyz)
            .add(d.vec3i(offsetX, offsetY, offsetZ));
          const dimsi = d.vec3i(dims);

          if (
            samplePos.x >= 0 &&
            samplePos.x < dimsi.x &&
            samplePos.y >= 0 &&
            samplePos.y < dimsi.y &&
            samplePos.z >= 0 &&
            samplePos.z < dimsi.z
          ) {
            const value = std.textureLoad(
              computeLayout.$.oldState,
              d.vec3u(samplePos),
            ).x;
            sum = sum + value;
            count = count + 1;
          }
        }
      }
    }

    const blurred = sum / count;
    const newValue = std.saturate(blurred - params.$.evaporationRate);
    std.textureStore(
      computeLayout.$.newState,
      gid.xyz,
      d.vec4f(newValue, 0, 0, 1),
    );
  });

  const computePipeline = root['~unstable']
    .withCompute(updateAgents)
    .createPipeline();

  const blurPipeline = root['~unstable'].withCompute(blur).createPipeline();

  const bindGroups = [0, 1].map((i) =>
    root.createBindGroup(computeLayout, {
      oldState: textures[i],
      newState: textures[1 - i],
      terrain: terrainTexture,
    }),
  );

  let currentTexture = 0;

  return {
    textures,
    get currentTexture() {
      return currentTexture;
    },
    tick(world: World) {
      const time = wf.getOrThrow(world, wf.Time);
      const deltaTime = time.deltaSeconds;
      params.writePartial({ deltaTime });

      blurPipeline
        .with(computeLayout, bindGroups[currentTexture])
        .dispatchWorkgroups(
          Math.ceil(resolution.x / BLUR_WORKGROUP_SIZE[0]),
          Math.ceil(resolution.y / BLUR_WORKGROUP_SIZE[1]),
          Math.ceil(resolution.z / BLUR_WORKGROUP_SIZE[2]),
        );

      computePipeline
        .with(computeLayout, bindGroups[currentTexture])
        .dispatchWorkgroups(Math.ceil(NUM_AGENTS / AGENT_WORKGROUP_SIZE));

      root['~unstable'].flush();

      currentTexture = 1 - currentTexture;
    },
  };
}
