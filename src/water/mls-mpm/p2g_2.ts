import tgpu from 'typegpu';
import { CellAtomicExceptMassArray, ParticleArray } from './shared';
import { vec3f } from 'typegpu/data';
import { decodeFixedPoint, encodeFixedPoint } from './fixedPoint';

export const p2g_2Layout = tgpu
    .bindGroupLayout({
        particles: { storage: ParticleArray },
        cells: { storage: CellAtomicExceptMassArray, access: 'mutable' },
        initBoxSize: { uniform: vec3f },
    })
    .$idx(0);

export const p2g_2Shader = tgpu.resolve({
    template: `
    override stiffness: f32;
    override rest_density: f32;
    override dynamic_viscosity: f32;
    override dt: f32;

    @compute @workgroup_size(64)
    fn p2g_2(@builtin(global_invocation_id) id: vec3<u32>) {
        if (id.x < arrayLength(&particles)) {
            var weights: array<vec3f, 3>;

            let particle = particles[id.x];
            let cell_idx: vec3f = floor(particle.position);
            let cell_diff: vec3f = particle.position - (cell_idx + 0.5f);
            weights[0] = 0.5f * (0.5f - cell_diff) * (0.5f - cell_diff);
            weights[1] = 0.75f - cell_diff * cell_diff;
            weights[2] = 0.5f * (0.5f + cell_diff) * (0.5f + cell_diff);

            var density: f32 = 0.;
            for (var gx = 0; gx < 3; gx++) {
                for (var gy = 0; gy < 3; gy++) {
                    for (var gz = 0; gz < 3; gz++) {
                        let weight: f32 = weights[gx].x * weights[gy].y * weights[gz].z;
                        let cell_x: vec3f = vec3f(
                                cell_idx.x + f32(gx) - 1.,
                                cell_idx.y + f32(gy) - 1.,
                                cell_idx.z + f32(gz) - 1.
                            );
                        let cell_index: i32 =
                            i32(cell_x.x) * i32(initBoxSize.y) * i32(initBoxSize.z) +
                            i32(cell_x.y) * i32(initBoxSize.z) +
                            i32(cell_x.z);
                        density += decodeFixedPoint(cells[cell_index].mass) * weight;
                    }
                }
            }

            let volume: f32 = 1.0 / density; // particle.mass = 1.0;

            let pressure: f32 = max(-0.0, stiffness * (pow(density / rest_density, 5.) - 1));

            var stress: mat3x3f = mat3x3f(-pressure, 0, 0, 0, -pressure, 0, 0, 0, -pressure);
            let dudv: mat3x3f = particle.C;
            let strain: mat3x3f = dudv + transpose(dudv);
            stress += dynamic_viscosity * strain;

            let eq_16_term0 = -volume * 4 * stress * dt;

            for (var gx = 0; gx < 3; gx++) {
                for (var gy = 0; gy < 3; gy++) {
                    for (var gz = 0; gz < 3; gz++) {
                        let weight: f32 = weights[gx].x * weights[gy].y * weights[gz].z;
                        let cell_x: vec3f = vec3f(
                                cell_idx.x + f32(gx) - 1.,
                                cell_idx.y + f32(gy) - 1.,
                                cell_idx.z + f32(gz) - 1.
                            );
                        let cell_dist = (cell_x + 0.5f) - particle.position;
                        let cell_index: i32 =
                            i32(cell_x.x) * i32(initBoxSize.y) * i32(initBoxSize.z) +
                            i32(cell_x.y) * i32(initBoxSize.z) +
                            i32(cell_x.z);
                        let momentum: vec3f = eq_16_term0 * weight * cell_dist;
                        atomicAdd(&cells[cell_index].vx, encodeFixedPoint(momentum.x));
                        atomicAdd(&cells[cell_index].vy, encodeFixedPoint(momentum.y));
                        atomicAdd(&cells[cell_index].vz, encodeFixedPoint(momentum.z));
                    }
                }
            }
        }
    }
  `,
    externals: { ...p2g_2Layout.bound, encodeFixedPoint, decodeFixedPoint },
});
