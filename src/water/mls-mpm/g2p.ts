import tgpu from 'typegpu';
import { CellArray, ParticleArray } from './shared';
import { vec3f } from 'typegpu/data';
import { decodeFixedPoint } from './fixedPoint';

export const g2pLayout = tgpu
    .bindGroupLayout({
        particles: { storage: ParticleArray, access: 'mutable' },
        cells: { storage: CellArray },
        realBoxSize: { uniform: vec3f },
        initBoxSize: { uniform: vec3f },
    })

export const g2pShader = tgpu.resolve({
    template: /* wgsl */ `
    override dt: f32;

    @compute @workgroup_size(64)
    fn g2p(@builtin(global_invocation_id) id: vec3<u32>) {
        if (id.x < arrayLength(&particles)) {
            particles[id.x].v = vec3f(0.);
            var weights: array<vec3f, 3>;

            let particle = particles[id.x];
            let cell_idx: vec3f = floor(particle.position);
            let cell_diff: vec3f = particle.position - (cell_idx + 0.5f);
            weights[0] = 0.5f * (0.5f - cell_diff) * (0.5f - cell_diff);
            weights[1] = 0.75f - cell_diff * cell_diff;
            weights[2] = 0.5f * (0.5f + cell_diff) * (0.5f + cell_diff);

            var B: mat3x3f = mat3x3f(vec3f(0.), vec3f(0.), vec3f(0.));
            for (var gx = 0; gx < 3; gx++) {
                for (var gy = 0; gy < 3; gy++) {
                    for (var gz = 0; gz < 3; gz++) {
                        let weight: f32 = weights[gx].x * weights[gy].y * weights[gz].z;
                        let cell_x: vec3f = vec3f(
                            cell_idx.x + f32(gx) - 1.,
                            cell_idx.y + f32(gy) - 1.,
                            cell_idx.z + f32(gz) - 1.
                        );
                        let cell_dist: vec3f = (cell_x + 0.5f) - particle.position;
                        let cell_index: i32 =
                            i32(cell_x.x) * i32(initBoxSize.y) * i32(initBoxSize.z) +
                            i32(cell_x.y) * i32(initBoxSize.z) +
                            i32(cell_x.z);
                        let weighted_velocity: vec3f = vec3f(
                            decodeFixedPoint(cells[cell_index].vx),
                            decodeFixedPoint(cells[cell_index].vy),
                            decodeFixedPoint(cells[cell_index].vz)
                        ) * weight;
                        let term: mat3x3f = mat3x3f(
                            weighted_velocity * cell_dist.x,
                            weighted_velocity * cell_dist.y,
                            weighted_velocity * cell_dist.z
                        );

                        B += term;

                        particles[id.x].v += weighted_velocity;
                    }
                }
            }

            particles[id.x].C = B * 4.0f;
            particles[id.x].position += particles[id.x].v * dt;
            particles[id.x].position = vec3f(
                clamp(particles[id.x].position.x, 1., realBoxSize.x - 2.),
                clamp(particles[id.x].position.y, 1., realBoxSize.y - 2.),
                clamp(particles[id.x].position.z, 1., realBoxSize.z - 2.)
            );

            let k = 3.0;
            let wall_stiffness = 0.3;
            let x_n: vec3f = particles[id.x].position + particles[id.x].v * dt * k;
            let wall_min: vec3f = vec3f(3.);
            let wall_max: vec3f = realBoxSize - 4.;
            if (x_n.x < wall_min.x) { particles[id.x].v.x += wall_stiffness * (wall_min.x - x_n.x); }
            if (x_n.x > wall_max.x) { particles[id.x].v.x += wall_stiffness * (wall_max.x - x_n.x); }
            if (x_n.y < wall_min.y) { particles[id.x].v.y += wall_stiffness * (wall_min.y - x_n.y); }
            if (x_n.y > wall_max.y) { particles[id.x].v.y += wall_stiffness * (wall_max.y - x_n.y); }
            if (x_n.z < wall_min.z) { particles[id.x].v.z += wall_stiffness * (wall_min.z - x_n.z); }
            if (x_n.z > wall_max.z) { particles[id.x].v.z += wall_stiffness * (wall_max.z - x_n.z); }
        }
    }
  `,
    externals: { ...g2pLayout.bound, decodeFixedPoint },
});
