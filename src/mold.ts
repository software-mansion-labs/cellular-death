import { randf } from '@typegpu/noise';
import type { World } from 'koota';
import tgpu, { type TgpuRoot, type TgpuTextureView } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as wf from 'wayfare';

const NUM_AGENTS = 800_000;
const AGENT_WORKGROUP_SIZE = 64;
const BLUR_WORKGROUP_SIZE = [4, 4, 4];

const RANDOM_DIRECTION_WEIGHT = 0.3;
const CENTER_BIAS_WEIGHT = 0.7;
const GRAVITY_STRENGTH = 3;

const INACTIVE_POSITION = d.vec3f(-9999, -9999, -9999);
const DEATH_TIME_THRESHOLD = 3.0;
const DENSITY_CHECK_THRESHOLD = 0.01;
const MAX_LIFETIME = 5.0;
const GOAL_CHECK_RADIUS = 5.0;
const GOAL_DENSITY_THRESHOLD = 100.0;
const RAPID_AGING_MULTIPLIER = 5.0;

const DEFAULT_MOVE_SPEED = 50.0;
const DEFAULT_SENSOR_ANGLE = 1;
const DEFAULT_SENSOR_DISTANCE = 4.0;
const DEFAULT_TURN_SPEED = 30.0;
const DEFAULT_EVAPORATION_RATE = 0.04;

const Agent = d.struct({
  position: d.vec3f,
  direction: d.vec3f,
  isActive: d.f32,
  timeSinceContact: d.f32,
  totalLifetime: d.f32,
});

const Params = d.struct({
  deltaTime: d.f32,
  moveSpeed: d.f32,
  sensorAngle: d.f32,
  sensorDistance: d.f32,
  turnSpeed: d.f32,
  evaporationRate: d.f32,
  gravityDir: d.vec3f,
  agingMultiplier: d.f32,
});

const SpawnerConfig = d.struct({
  spawnPoint: d.vec3f,
  spawnRate: d.f32,
  targetCount: d.u32,
});

const SpawnRange = d.struct({
  startIndex: d.u32,
  endIndex: d.u32,
});

const GoalConfig = d.struct({
  position: d.vec3f,
  reached: d.u32,
});

export function createMoldSim(
  root: TgpuRoot,
  volumeSize: number,
  terrainTexture: TgpuTextureView<
    d.WgslStorageTexture3d<'r32float', 'read-only'>
  >,
  spawnerConfig?: {
    spawnPoint?: d.v3f;
    spawnRate?: number;
    targetCount?: number;
  },
  goalPosition?: d.v3f,
) {
  const resolution = d.vec3f(volumeSize);

  const agentsData = root.createMutable(d.arrayOf(Agent, NUM_AGENTS));

  const spawnPoint = spawnerConfig?.spawnPoint ?? resolution.div(2);
  const spawnRate = spawnerConfig?.spawnRate ?? 10000;
  const targetCount = spawnerConfig?.targetCount ?? NUM_AGENTS;
  const goalPos =
    goalPosition ?? d.vec3f(volumeSize / 2, volumeSize - 10, volumeSize / 2);

  const spawnRange = root.createUniform(SpawnRange, {
    startIndex: 0,
    endIndex: 0,
  });

  const goal = root.createMutable(GoalConfig, {
    position: goalPos,
    reached: 0,
  });

  const params = root.createUniform(Params, {
    deltaTime: 0,
    moveSpeed: DEFAULT_MOVE_SPEED,
    sensorAngle: DEFAULT_SENSOR_ANGLE,
    sensorDistance: DEFAULT_SENSOR_DISTANCE,
    turnSpeed: DEFAULT_TURN_SPEED,
    evaporationRate: DEFAULT_EVAPORATION_RATE,
    gravityDir: d.vec3f(0, -1, 0),
    agingMultiplier: 1.0,
  });

  const spawner = root.createUniform(SpawnerConfig, {
    spawnPoint,
    spawnRate,
    targetCount,
  });

  let activeAgentCount = 0;
  let spawnAccumulator = 0;
  let goalReached = false;

  const textures = [0, 1].map(() =>
    root['~unstable']
      .createTexture({
        size: [resolution.x, resolution.y, resolution.z],
        format: 'rg32float',
        dimension: '3d',
      })
      .$usage('sampled', 'storage'),
  );

  const initAgents = tgpu['~unstable'].computeFn({
    in: { gid: d.builtin.globalInvocationId },
    workgroupSize: [AGENT_WORKGROUP_SIZE],
  })(({ gid }) => {
    if (gid.x >= NUM_AGENTS) {
      return;
    }
    agentsData.$[gid.x] = Agent({
      position: INACTIVE_POSITION,
      direction: d.vec3f(0, 1, 0),
      isActive: 0,
      timeSinceContact: 0,
      totalLifetime: 0,
    });
  });

  const spawnAgents = tgpu['~unstable'].computeFn({
    in: { gid: d.builtin.globalInvocationId },
    workgroupSize: [AGENT_WORKGROUP_SIZE],
  })(({ gid }) => {
    if (gid.x >= spawnRange.$.endIndex) {
      return;
    }
    if (gid.x >= spawnRange.$.startIndex && gid.x < spawnRange.$.endIndex) {
      randf.seed(gid.x / NUM_AGENTS);
      const randomOffset = randf.inUnitSphere().mul(5);
      const pos = spawner.$.spawnPoint.add(randomOffset);
      const center = resolution.div(2);
      const dir = std.normalize(center.sub(pos));
      agentsData.$[gid.x] = Agent({
        position: pos,
        direction: dir,
        isActive: 1,
        timeSinceContact: 0,
        totalLifetime: 0,
      });
    }
  });

  const respawnAgents = tgpu['~unstable'].computeFn({
    in: { gid: d.builtin.globalInvocationId },
    workgroupSize: [AGENT_WORKGROUP_SIZE],
  })(({ gid }) => {
    if (gid.x >= spawnRange.$.endIndex) {
      return;
    }
    const agent = agentsData.$[gid.x];
    if (gid.x < spawnRange.$.endIndex && agent.isActive < 0.5) {
      randf.seed(gid.x / NUM_AGENTS + 0.5);
      const randomOffset = randf.inUnitSphere().mul(5);
      const pos = spawner.$.spawnPoint.add(randomOffset);
      const center = resolution.div(2);
      const dir = std.normalize(center.sub(pos));
      agentsData.$[gid.x] = Agent({
        position: pos,
        direction: dir,
        isActive: 1,
        timeSinceContact: 0,
        totalLifetime: 0,
      });
    }
  });

  const computeLayout = tgpu.bindGroupLayout({
    oldState: { storageTexture: d.textureStorage3d('rg32float', 'read-only') },
    newState: { storageTexture: d.textureStorage3d('rg32float', 'write-only') },
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

    const agent = agentsData.$[gid.x];

    if (agent.isActive < 0.5) {
      return;
    }

    randf.seed(gid.x / NUM_AGENTS + 0.1);

    const dims = std.textureDimensions(computeLayout.$.oldState);
    const dimsf = d.vec3f(dims);

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

    const gravityInfluence = params.$.gravityDir.mul(
      GRAVITY_STRENGTH * params.$.deltaTime,
    );
    direction = std.normalize(direction.add(gravityInfluence));

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

    const oldStateVec = std.textureLoad(
      computeLayout.$.oldState,
      d.vec3u(newPos),
    );
    const oldDensity = oldStateVec.x;
    const oldLifetime = oldStateVec.y;

    let newTimeSinceContact = agent.timeSinceContact + params.$.deltaTime;
    const newTotalLifetime =
      agent.totalLifetime + params.$.deltaTime * params.$.agingMultiplier;

    if (oldDensity > DENSITY_CHECK_THRESHOLD) {
      newTimeSinceContact = 0;
    }

    let newIsActive = d.f32(1);
    if (
      newTimeSinceContact > DEATH_TIME_THRESHOLD ||
      newTotalLifetime > MAX_LIFETIME
    ) {
      newIsActive = 0;
    }

    agentsData.$[gid.x] = Agent({
      position: newPos,
      direction,
      isActive: newIsActive,
      timeSinceContact: newTimeSinceContact,
      totalLifetime: newTotalLifetime,
    });

    const newDensity = oldDensity + 1;
    const normalizedLifetime = std.saturate(newTotalLifetime / MAX_LIFETIME);
    const blendedLifetime = std.select(
      normalizedLifetime,
      (oldLifetime * oldDensity + normalizedLifetime) / newDensity,
      oldDensity > 0.1,
    );
    std.textureStore(
      computeLayout.$.newState,
      d.vec3u(newPos),
      d.vec4f(newDensity, blendedLifetime, 0, 1),
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
            const valueVec = std.textureLoad(
              computeLayout.$.oldState,
              d.vec3u(samplePos),
            );
            sum = sum + valueVec.x;
            count = count + 1;
          }
        }
      }
    }

    const blurredDensity = sum / count;
    const newDensity = std.saturate(blurredDensity - params.$.evaporationRate);

    const centerValue = std.textureLoad(computeLayout.$.oldState, gid.xyz);
    let lifetime = centerValue.y;

    if (newDensity < 0.01) {
      lifetime = 0;
    }

    std.textureStore(
      computeLayout.$.newState,
      gid.xyz,
      d.vec4f(newDensity, lifetime, 0, 1),
    );
  });

  const goalCheckLayout = tgpu.bindGroupLayout({
    state: { storageTexture: d.textureStorage3d('rg32float', 'read-only') },
  });

  const checkGoal = tgpu['~unstable'].computeFn({
    in: { gid: d.builtin.globalInvocationId },
    workgroupSize: [1, 1, 1],
  })(({ gid }) => {
    if (gid.x > 0 || gid.y > 0 || gid.z > 0) return;
    if (goal.$.reached > 0) return;

    const goalPos = goal.$.position;
    const radius = d.f32(GOAL_CHECK_RADIUS);
    let totalDensity = d.f32(0);
    let sampleCount = d.f32(0);

    const startX = d.u32(std.max(goalPos.x - radius, 0));
    const endX = d.u32(std.min(goalPos.x + radius, resolution.x - 1));
    const startY = d.u32(std.max(goalPos.y - radius, 0));
    const endY = d.u32(std.min(goalPos.y + radius, resolution.y - 1));
    const startZ = d.u32(std.max(goalPos.z - radius, 0));
    const endZ = d.u32(std.min(goalPos.z + radius, resolution.z - 1));

    for (let x = startX; x <= endX; x = x + 1) {
      for (let y = startY; y <= endY; y = y + 1) {
        for (let z = startZ; z <= endZ; z = z + 1) {
          const pos = d.vec3f(d.f32(x), d.f32(y), d.f32(z));
          const dist = std.length(pos.sub(goalPos));
          if (dist <= radius) {
            const value = std.textureLoad(
              goalCheckLayout.$.state,
              d.vec3u(x, y, z),
            );
            totalDensity = totalDensity + value.x;
            sampleCount = sampleCount + 1;
          }
        }
      }
    }

    if (sampleCount > 0 && totalDensity >= GOAL_DENSITY_THRESHOLD) {
      goal.$.reached = 1;
    }
  });

  const initPipeline = root['~unstable']
    .withCompute(initAgents)
    .createPipeline();

  const spawnPipeline = root['~unstable']
    .withCompute(spawnAgents)
    .createPipeline();

  const respawnPipeline = root['~unstable']
    .withCompute(respawnAgents)
    .createPipeline();

  const computePipeline = root['~unstable']
    .withCompute(updateAgents)
    .createPipeline();

  const blurPipeline = root['~unstable'].withCompute(blur).createPipeline();

  const checkGoalPipeline = root['~unstable']
    .withCompute(checkGoal)
    .createPipeline();

  const bindGroups = [0, 1].map((i) =>
    root.createBindGroup(computeLayout, {
      oldState: textures[i],
      newState: textures[1 - i],
      terrain: terrainTexture,
    }),
  );

  const goalCheckBindGroups = [0, 1].map((i) =>
    root.createBindGroup(goalCheckLayout, {
      state: textures[i],
    }),
  );

  initPipeline.dispatchWorkgroups(Math.ceil(NUM_AGENTS / AGENT_WORKGROUP_SIZE));
  root['~unstable'].flush();

  let currentTexture = 0;

  return {
    textures,
    get currentTexture() {
      return currentTexture;
    },
    get activeAgentCount() {
      return activeAgentCount;
    },
    get goalReached() {
      return goalReached;
    },
    goalPosition: goalPos,
    tick(world: World, gravityDir: d.v3f) {
      const time = wf.getOrThrow(world, wf.Time);
      const deltaTime = time.deltaSeconds;

      const agingMultiplier = wf.Input.isKeyDown('KeyD')
        ? RAPID_AGING_MULTIPLIER
        : 1.0;

      params.writePartial({ deltaTime, gravityDir, agingMultiplier });

      if (activeAgentCount < targetCount) {
        spawnAccumulator += deltaTime * spawnRate;
        const toSpawn = Math.floor(spawnAccumulator);

        if (toSpawn > 0) {
          const newActiveCount = Math.min(
            activeAgentCount + toSpawn,
            targetCount,
          );

          if (newActiveCount > 0) {
            spawnRange.write({
              startIndex: activeAgentCount,
              endIndex: newActiveCount,
            });
            spawnPipeline.dispatchWorkgroups(
              Math.ceil(newActiveCount / AGENT_WORKGROUP_SIZE),
            );
            root['~unstable'].flush();
          }

          activeAgentCount = newActiveCount;
          spawnAccumulator -= toSpawn;
        }
      }

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

      if (activeAgentCount > 0) {
        spawnRange.write({
          startIndex: 0,
          endIndex: activeAgentCount,
        });
        respawnPipeline.dispatchWorkgroups(
          Math.ceil(activeAgentCount / AGENT_WORKGROUP_SIZE),
        );
      }

      if (!goalReached) {
        checkGoalPipeline
          .with(goalCheckLayout, goalCheckBindGroups[currentTexture])
          .dispatchWorkgroups(1, 1, 1);

        goal.read().then((data) => {
          if (data.reached > 0) {
            goalReached = true;
            console.log(
              'Goal reached! Slime density threshold met at goal position.',
            );
          }
        });
      }

      currentTexture = 1 - currentTexture;
    },
  };
}
