import { perlin3d } from '@typegpu/noise';
import { sdBox2d, sdBox3d, sdSphere } from '@typegpu/sdf';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { getDialogBox } from './dialogBox';
import {
  endingDialogue,
  firstSlopesDialogue,
  level1dialogue,
  level1EndDialogue,
  voidMonologue,
} from './dialogue';
import { endingState } from './endingState';
import { gameStateManager } from './saveGame';

export function getCurrentLevel(): Level | undefined {
  return LEVELS[gameStateManager.state.levelIdx];
}

const sdfCone = (pos: d.v3f, c: d.v2f, h: number) => {
  'kernel';
  const q = d.vec2f(c.x / c.y, -1).mul(h);
  const w = d.vec2f(std.length(pos.xz), pos.y);
  const a = w.sub(q.mul(std.saturate(std.dot(w, q) / std.dot(q, q))));
  const b = w.sub(d.vec2f(std.saturate(w.x / q.x), 1.0).mul(q));
  const k = std.sign(q.y);
  const e = std.min(std.dot(a, a), std.dot(b, b));
  const s = std.max(k * (w.x * q.y - w.y * q.x), k * (w.y - q.y));

  return std.sqrt(e) * std.sign(s);
};

export interface Level {
  name: string;
  ending?: boolean | undefined;
  onStart?: () => void;
  onFinish?: () => void;
  /**
   * A kernel that initializes the cell in the grid.
   * @param pos Where do we sample (0-1)
   * @returns The density of that cell
   */
  init: (pos: d.v3f, time: number) => number;
  /**
   * Whether the level terrain should be animated by calling init every frame
   * When true, the init function will be called every frame
   * @default false
   */
  animated?: boolean;
  /**
   * The spawner position in the terrarium (0-1 normalized coordinates)
   */
  spawnerPosition: d.v3f;
  /**
   * The goal position in the terrarium (0-1 normalized coordinates)
   */
  goalPosition: d.v3f;
  /**
   * Creature positions in the terrarium (0-1 normalized coordinates)
   */
  creaturePositions?: d.v3f[] | undefined;
}

export const LEVELS: Level[] = [
  {
    name: 'Knee',
    spawnerPosition: d.vec3f(0.2, 0.5, 0.5),
    goalPosition: d.vec3f(0.8, 0.5, 0.5),
    onStart: () => {
      getDialogBox().enqueueMessage(...level1dialogue);
    },
    onFinish() {
      getDialogBox().enqueueMessage(...level1EndDialogue);
    },
    init: (pos: d.v3f) => {
      'kernel';
      const scale = d.f32(2);
      const noiseValue = perlin3d.sample(pos.mul(scale * 4));
      const noiseValue2 = perlin3d.sample(pos.mul(scale * 8));

      // Level initialization code here
      let dist = d.f32(999999);

      // Floor
      dist = std.min(dist, pos.y - 0.15);

      // Obstacle in the middle
      dist = std.min(
        dist,
        sdBox3d(pos.sub(d.vec3f(1, 0.2, 0.5)), d.vec3f(0.5, 0.3, 1)),
      );

      // Displacement
      dist += noiseValue * 0.04 + noiseValue2 * 0.01;

      // Turning the SDF into a density field
      return -dist;
    },
  },
  {
    name: 'Middle obstacle',
    spawnerPosition: d.vec3f(0.2, 0.5, 0.5),
    goalPosition: d.vec3f(0.8, 0.5, 0.5),
    init: (pos: d.v3f) => {
      'kernel';
      const scale = d.f32(2);
      const noiseValue = perlin3d.sample(pos.mul(scale * 4));
      const noiseValue2 = perlin3d.sample(pos.mul(scale * 8));

      // Level initialization code here
      let dist = d.f32(999999);

      // Floor
      dist = std.min(dist, pos.y - 0.15);

      // Obstacle in the middle
      dist = std.min(
        dist,
        sdBox3d(pos.sub(d.vec3f(0.5, 0.2, 0.5)), d.vec3f(0.2, 0.5, 1)),
      );

      // Displacement
      dist += noiseValue * 0.04 + noiseValue2 * 0.01;

      // Turning the SDF into a density field
      return -dist;
    },
  },
  {
    name: 'Tight squeeze',
    spawnerPosition: d.vec3f(0.2, 0.5, 0.5),
    goalPosition: d.vec3f(0.8, 0.5, 0.5),
    init: (pos: d.v3f) => {
      'kernel';
      const scale = d.f32(2);
      const noiseValue = perlin3d.sample(pos.mul(scale * 4));
      const noiseValue2 = perlin3d.sample(pos.mul(scale * 8));

      // Level initialization code here
      let dist = d.f32(999999);

      // Floor
      dist = std.min(dist, pos.y - 0.15);

      const box3d = sdBox3d(
        pos.sub(d.vec3f(0.5, 0.2, 0.5)),
        d.vec3f(0.1, 1, 1),
      );
      const sphereInTheMiddle = sdSphere(pos.sub(d.vec3f(0.5, 0.5, 0.7)), 0.01);
      // Obstacle in the middle
      dist = std.min(dist, std.max(box3d, -sphereInTheMiddle));

      // Displacement
      dist += noiseValue * 0.04 + noiseValue2 * 0.01;

      // Turning the SDF into a density field
      return -dist;
    },
  },
  {
    name: 'Slopes, just out of reach',
    spawnerPosition: d.vec3f(0.9, 0.9, 0.5),
    goalPosition: d.vec3f(0.8, 0.05, 0.5),
    creaturePositions: [d.vec3f(0.1, 0.85, 0.7), d.vec3f(0.1, 0.85, 0.3)],
    onStart() {
      getDialogBox().enqueueMessage(...firstSlopesDialogue);
    },
    init: (pos: d.v3f) => {
      'kernel';
      const scale = d.f32(2);
      const noiseValue = perlin3d.sample(pos.mul(scale * 4));
      const noiseValue2 = perlin3d.sample(pos.mul(scale * 8));

      let dist = d.f32(999999);

      // Floor and ceiling
      dist = -sdBox2d(pos.xy.sub(d.vec2f(0.5, 0.5)), d.vec2f(0.4, 1));

      const rotMat1 = d.mat3x3f(
        d.vec3f(0.96, -0.26, 0),
        d.vec3f(0.26, 0.96, 0),
        d.vec3f(0, 0, 1),
      );

      const rotMat2 = d.mat3x3f(
        d.vec3f(0.997, -0.087, 0),
        d.vec3f(0.087, 0.997, 0),
        d.vec3f(0, 0, 1),
      );

      const walls = [
        sdBox3d(
          rotMat1.mul(pos.sub(d.vec3f(0.9, 0.33, 0.5))),
          d.vec3f(0.6, 0.12, 1),
        ),
        sdBox3d(
          rotMat2.mul(pos.sub(d.vec3f(0.1, 0.66, 0.5))),
          d.vec3f(0.6, 0.12, 1),
        ),
      ];

      for (let i = 0; i < walls.length; i++) {
        dist = std.min(dist, walls[i]);
      }

      dist += noiseValue * 0.04 + noiseValue2 * 0.01;
      return -dist;
    },
  },
  {
    name: 'Cave system',
    spawnerPosition: d.vec3f(0.5, 0.1, 0.5),
    goalPosition: d.vec3f(0.5, 0.9, 0.5),
    creaturePositions: [
      d.vec3f(0.5, 0.3, 0.5),
      d.vec3f(0.5, 0.5, 0.5),
      d.vec3f(0.5, 0.7, 0.5),
    ],
    init: (pos: d.v3f) => {
      'kernel';
      const scale = d.f32(2);
      const noiseValue = perlin3d.sample(pos.mul(scale));
      const noiseValue2 = perlin3d.sample(pos.mul(scale * 2));
      const noiseValue3 = perlin3d.sample(pos.mul(scale * 4));

      // Level initialization code here
      return noiseValue + noiseValue2 * 0.2 + noiseValue3 * 0.1;
    },
  },
  {
    name: 'Roman Aqueduct',
    spawnerPosition: d.vec3f(0.7, 0.7, 0.5),
    goalPosition: d.vec3f(0.7, 0.35, 0.5),
    init: (pos: d.v3f) => {
      'kernel';
      const rotMat1 = d.mat3x3f(
        d.vec3f(0.9994, -0.0349, 0),
        d.vec3f(0.0349, 0.9994, 0),
        d.vec3f(0, 0, 1),
      );

      const position = rotMat1.mul(pos);
      let dist = d.f32(999999);
      // arches
      const archCount = d.f32(5);
      for (let i = 0; i < archCount; i++) {
        const archX = (i + 0.5) / archCount;
        const archPos = position.sub(d.vec3f(archX, 0, 0));
        const archSquare = sdBox3d(
          archPos.sub(d.vec3f(0.0, 0.4, 0.5)),
          d.vec3f(0.2, 0.2, 0.2),
        );
        const archHalfSphere = sdSphere(
          archPos.sub(d.vec3f(0, 0.3, 0.5)),
          0.08,
        );
        const arch = std.max(archSquare, -archHalfSphere);
        dist = std.min(dist, arch);
      }

      const drain = sdBox3d(
        position.sub(d.vec3f(0.5, 0.6, 0.5)),
        d.vec3f(0.55, 0.05, 0.02),
      ); // lower wall
      dist = std.max(dist, -drain);

      for (let i = 0; i < archCount; i++) {
        const archX = (i + 0.5) / archCount;
        const archPos = position.sub(d.vec3f(archX, 0, 0));
        const archSquare = sdBox3d(
          archPos.sub(d.vec3f(0.0, 0.15, 0.5)),
          d.vec3f(0.2, 0.2, 0.2),
        );
        const archHalfSphere = sdSphere(
          archPos.sub(d.vec3f(0, 0.1, 0.5)),
          0.08,
        );
        const floor = sdBox3d(
          pos.sub(d.vec3f(0.5, 0.0, 0.5)),
          d.vec3f(0.5, 0.14, 0.5),
        );

        const arch = std.max(archSquare, -archHalfSphere);
        const archWithFloor = std.min(arch, floor);
        dist = std.min(dist, archWithFloor);
      }

      return -dist;
    },
  },
  {
    name: 'Volcano',
    spawnerPosition: d.vec3f(0.5, 0.9, 0.5),
    goalPosition: d.vec3f(0.9, 0.9, 0.5),
    init: (pos: d.v3f) => {
      'kernel';
      const scale = d.f32(2);
      const noiseValue = perlin3d.sample(pos.mul(scale * 4));
      const noiseValue2 = perlin3d.sample(pos.mul(scale * 8));

      let dist = d.f32(999999);

      // Floor
      dist = std.min(dist, pos.y - 0.1);

      const volcano = std.max(
        sdfCone(
          pos.sub(d.vec3f(0.5, 0.7, 0.5)),
          d.vec2f(std.sin(d.f32(Math.PI / 6)), std.cos(d.f32(Math.PI / 6))),
          0.8,
        ),
        -sdSphere(pos.sub(d.vec3f(0.5, 0.55, 0.5)), d.f32(0.07)),
      );

      dist = std.min(dist, volcano);

      dist += noiseValue * 0.04 + noiseValue2 * 0.01;

      return -dist;
    },
  },
  {
    name: 'Plinko balls',
    spawnerPosition: d.vec3f(0.05, 0.2, 0.5),
    goalPosition: d.vec3f(0.9, 0.1, 0.5),
    init: (pos: d.v3f) => {
      'kernel';
      const scale = d.f32(2);
      const noiseValue = perlin3d.sample(pos.mul(scale * 4));
      const noiseValue2 = perlin3d.sample(pos.mul(scale * 8));

      let dist = d.f32(999999);

      const sinTheta = std.sin(d.f32(Math.PI / 24));
      const cosTheta = std.cos(d.f32(Math.PI / 24));

      const pins = [
        sdfCone(
          pos.sub(d.vec3f(0.25, 1.5, 0.38)),
          d.vec2f(sinTheta, cosTheta),
          d.f32(2),
        ),
        sdfCone(
          pos.sub(d.vec3f(0.25, 1.5, 0.61)),
          d.vec2f(sinTheta, cosTheta),
          d.f32(2),
        ),
        sdfCone(
          pos.sub(d.vec3f(0.5, 1.5, 0.25)),
          d.vec2f(sinTheta, cosTheta),
          d.f32(2),
        ),
        sdfCone(
          pos.sub(d.vec3f(0.5, 1.5, 0.5)),
          d.vec2f(sinTheta, cosTheta),
          d.f32(2),
        ),
        sdfCone(
          pos.sub(d.vec3f(0.5, 1.5, 0.75)),
          d.vec2f(sinTheta, cosTheta),
          d.f32(2),
        ),
        sdfCone(
          pos.sub(d.vec3f(0.75, 1.5, 0.1)),
          d.vec2f(sinTheta, cosTheta),
          d.f32(2),
        ),
        sdfCone(
          pos.sub(d.vec3f(0.75, 1.5, 0.37)),
          d.vec2f(sinTheta, cosTheta),
          d.f32(2),
        ),
        sdfCone(
          pos.sub(d.vec3f(0.75, 1.5, 0.63)),
          d.vec2f(sinTheta, cosTheta),
          d.f32(2),
        ),
        sdfCone(
          pos.sub(d.vec3f(0.75, 1.5, 0.9)),
          d.vec2f(sinTheta, cosTheta),
          d.f32(2),
        ),
      ];

      for (let i = 0; i < pins.length; i++) {
        dist = std.min(dist, pins[i]);
      }

      dist += noiseValue * 0.04 + noiseValue2 * 0.01;

      return -dist;
    },
  },

  {
    name: 'Moving Waves',
    spawnerPosition: d.vec3f(0.1, 0.5, 0.5),
    goalPosition: d.vec3f(0.9, 0.5, 0.5),
    animated: true,
    init: (pos: d.v3f, time: number) => {
      'kernel';

      const wavesX = std.sin((pos.x * 5 + time) * Math.PI * 2) * 0.1;
      const wavesZ = std.sin((pos.z * 5 - time) * Math.PI * 2) * 0.1;
      const waves = wavesX + wavesZ;

      // flat plane with waves
      let dist = pos.y - 0.4 - waves;

      const moveX = std.sin(pos.x * 10) * 0.2;
      const obstacle1 = sdBox3d(
        pos.sub(d.vec3f(0.3 + moveX, 0.35, 0.5)),
        d.vec3f(0.05, 0.05, 0.05),
      );
      const obstacle2 = sdBox3d(
        pos.sub(d.vec3f(0.6 - moveX, 0.35, 0.5)),
        d.vec3f(0.05, 0.05, 0.05),
      );

      dist = std.min(dist, obstacle1);
      dist = std.min(dist, obstacle2);

      return -dist;
    },
  },
  {
    name: 'The End',
    ending: true,
    goalPosition: d.vec3f(0.5, 0.5, 0.05),
    spawnerPosition: d.vec3f(1, 0.5, 0.5),
    onStart() {
      getDialogBox().enqueueMessage(...endingDialogue);
    },
    onFinish() {
      // Start breaking the wall immediately
      endingState.step++;

      // After 4 seconds, start falling
      setTimeout(() => {
        endingState.step++;
      }, 4000);

      // After 10 seconds, we're in the void
      setTimeout(() => {
        getDialogBox().enqueueMessage(...voidMonologue);
      }, 10000);

      // After 20 seconds, we're done
      setTimeout(() => {
        endingState.step++;
      }, 20000);
    },
    init: (pos: d.v3f) => {
      'kernel';
      let dist = d.f32(999999);

      // Platform
      dist = std.min(
        dist,
        sdBox3d(pos.sub(d.vec3f(0.5, 0.4, 0.5)), d.vec3f(0.3, 0.1, 0.3)),
      );

      // Turning the SDF into a density field
      return -dist;
    },
  },
];
