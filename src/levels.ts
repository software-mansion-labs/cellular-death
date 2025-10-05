import { perlin3d } from '@typegpu/noise';
import { sdBox2d, sdBox3d } from '@typegpu/sdf';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

export interface Level {
  name: string;
  ending?: boolean | undefined;
  /**
   * A kernel that initializes the cell in the grid.
   * @param pos Where do we sample (0-1)
   * @returns The density of that cell
   */
  init: (pos: d.v3f) => number;
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
    name: 'Slopes, just out of reach',
    spawnerPosition: d.vec3f(0.9, 0.9, 0.5),
    goalPosition: d.vec3f(0.8, 0.05, 0.5),
    creaturePositions: [d.vec3f(0.1, 0.85, 0.7), d.vec3f(0.1, 0.85, 0.3)],
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
    name: 'The End',
    ending: true,
    goalPosition: d.vec3f(0.5, 0.5, 0.05),
    spawnerPosition: d.vec3f(0, 0.5, 0.5),
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
