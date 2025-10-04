import tgpu from 'typegpu';
import { vec3f } from 'typegpu/data';
import { CellArray } from './shared';
import { decodeFixedPoint, encodeFixedPoint } from './fixedPoint';

export const updateGridLayout = tgpu
    .bindGroupLayout({
        cells: { storage: CellArray, access: 'mutable' },
        realBoxSize: { uniform: vec3f },
        initBoxSize: { uniform: vec3f },
    })
    .$idx(0);

export const updateGridShader = tgpu.resolve({
    template: `
    override dt: f32;

    @compute @workgroup_size(64)
    fn updateGrid(@builtin(global_invocation_id) id: vec3<u32>) {
      if (id.x < arrayLength(&_EXT_.cells)) {
        if (_EXT_.cells[id.x].mass > 0) { // 0 との比較は普通にしてよい
          var float_v: vec3f = vec3f(
            decodeFixedPoint(_EXT_.cells[id.x].vx),
            decodeFixedPoint(_EXT_.cells[id.x].vy),
            decodeFixedPoint(_EXT_.cells[id.x].vz)
          );
          float_v /= decodeFixedPoint(_EXT_.cells[id.x].mass);
          _EXT_.cells[id.x].vx = encodeFixedPoint(float_v.x);
          _EXT_.cells[id.x].vy = encodeFixedPoint(float_v.y + -0.3 * dt);
          _EXT_.cells[id.x].vz = encodeFixedPoint(float_v.z);

          var x: i32 = i32(id.x) / i32(_EXT_.initBoxSize.z) / i32(_EXT_.initBoxSize.y);
          var y: i32 = (i32(id.x) / i32(_EXT_.initBoxSize.z)) % i32(_EXT_.initBoxSize.y);
          var z: i32 = i32(id.x) % i32(_EXT_.initBoxSize.z);
          // 整数を ceil したら，その整数に一致するかは確認する必要があり
          if (x < 2 || x > i32(ceil(_EXT_.realBoxSize.x) - 3)) { _EXT_.cells[id.x].vx = 0; }
          if (y < 2 || y > i32(ceil(_EXT_.realBoxSize.y) - 3)) { _EXT_.cells[id.x].vy = 0; }
          if (z < 2 || z > i32(ceil(_EXT_.realBoxSize.z) - 3)) { _EXT_.cells[id.x].vz = 0; }
        }
      }
    }
  `,
    externals: {
        _EXT_: updateGridLayout.bound,
        encodeFixedPoint,
        decodeFixedPoint,
    },
});
