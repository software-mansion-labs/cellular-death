import { perlin3d } from '@typegpu/noise';
import { sdBox3d } from '@typegpu/sdf';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

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
}

export const LEVELS: Level[] = [
  {
    name: 'Level 1',
    spawnerPosition: d.vec3f(0.2, 0.5, 0.5),
    goalPosition: d.vec3f(0.8, 0.5, 0.5),
    init: (pos: d.v3f) => {
      'kernel';
      const scale = d.f32(2);
      const noiseValue = perlin3d.sample(pos.mul(scale * 4));

      // Level initialization code here
      let density = d.f32(0);

      // Floor
      density += std.select(d.f32(1.1), d.f32(0), pos.y > 0.1);

      // Obstacle in the middle
      density += -sdBox3d(
        pos.sub(d.vec3f(0.5, 0.2, 0.5)),
        d.vec3f(0.2, 0.5, 1),
      );

      density += noiseValue * 0.05;
      return density;
    },
  },
  {
    name: 'Level 2',
    spawnerPosition: d.vec3f(0.5, 0.1, 0.5),
    goalPosition: d.vec3f(0.5, 0.9, 0.5),
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
];
