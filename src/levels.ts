import { perlin3d } from '@typegpu/noise';
import { sdBox2d, sdBox3d, sdSphere } from '@typegpu/sdf';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

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
];
