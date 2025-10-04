import tgpu from 'typegpu';
import { CellAtomicArray, ParticleArray } from './shared';
import { builtin, f32, i32, vec3f } from 'typegpu/data';
import { encodeFixedPoint } from './fixedPoint';
import { add, atomicAdd, floor, mul, sub } from 'typegpu/std';

export const p2g_1Layout = tgpu
    .bindGroupLayout({
        particles: { storage: ParticleArray },
        cells: { storage: CellAtomicArray, access: 'mutable' },
        initBoxSize: { uniform: vec3f },
    })
    .$idx(0);

const { particles, cells, initBoxSize } = p2g_1Layout.bound;

export const p2g_1Fn = tgpu['~unstable'].computeFn({
    workgroupSize: [64],
    in: { id: builtin.globalInvocationId },
})((input) => {
    if (input.id.x < particles.value.length) {
        const weights = [vec3f(), vec3f(), vec3f()];

        const particle = particles.value[input.id.x];
        const cell_idx = floor(particle.position);
        const cell_diff = sub(particle.position, add(cell_idx, vec3f(0.5)));

        weights[0] = mul(
            0.5,
            mul(sub(vec3f(0.5), cell_diff), sub(vec3f(0.5), cell_diff))
        );
        weights[1] = sub(vec3f(0.75), mul(cell_diff, cell_diff));
        weights[2] = mul(
            0.5,
            mul(add(vec3f(0.5), cell_diff), add(vec3f(0.5), cell_diff))
        );

        const C = particle.C;

        for (let gx = 0; gx < 3; gx++) {
            for (let gy = 0; gy < 3; gy++) {
                for (let gz = 0; gz < 3; gz++) {
                    let weight = weights[gx].x * weights[gy].y * weights[gz].z;
                    let cell_x = vec3f(
                        cell_idx.x + f32(gx) - 1,
                        cell_idx.y + f32(gy) - 1,
                        cell_idx.z + f32(gz) - 1
                    );
                    let cell_dist = sub(
                        add(cell_x, vec3f(0.5)),
                        particle.position
                    );

                    const Q = mul(C, cell_dist);

                    let mass_contrib = weight * 1.0; // assuming particle.mass = 1.0
                    let vel_contrib = mul(mass_contrib, add(particle.v, Q));
                    let cell_index =
                        i32(cell_x.x) *
                            i32(initBoxSize.value.y) *
                            i32(initBoxSize.value.z) +
                        i32(cell_x.y) * i32(initBoxSize.value.z) +
                        i32(cell_x.z);
                    atomicAdd(
                        cells.value[cell_index].mass,
                        encodeFixedPoint(mass_contrib)
                    );
                    atomicAdd(
                        cells.value[cell_index].vx,
                        encodeFixedPoint(vel_contrib.x)
                    );
                    atomicAdd(
                        cells.value[cell_index].vy,
                        encodeFixedPoint(vel_contrib.y)
                    );
                    atomicAdd(
                        cells.value[cell_index].vz,
                        encodeFixedPoint(vel_contrib.z)
                    );
                }
            }
        }
    }
});
