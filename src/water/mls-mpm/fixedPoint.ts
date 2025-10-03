import tgpu from 'typegpu';
import * as d from 'typegpu/data';

export const encodeFixedPoint = tgpu.fn(
    [d.f32 ],
    d.i32
)((args) => d.i32(args * 1e7));

export const decodeFixedPoint = tgpu.fn(
    [d.f32 ],
    d.i32
)((args) => d.f32(args) / 1e7);
