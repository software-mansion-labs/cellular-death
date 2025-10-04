import { arrayOf, f32, mat4x4f, struct, vec2f, vec3f } from 'typegpu/data';

export const renderUniforms = {
    texel_size: vec2f(),
    sphere_size: 0,
    inv_projection_matrix: mat4x4f(),
    projection_matrix: mat4x4f(),
    view_matrix: mat4x4f(),
    inv_view_matrix: mat4x4f(),
};

export const RenderUniforms = struct({
    texel_size: vec2f,
    sphere_size: f32,
    inv_projection_matrix: mat4x4f,
    projection_matrix: mat4x4f,
    view_matrix: mat4x4f,
    inv_view_matrix: mat4x4f,
});

export const numParticlesMax = 200000;

export const PosVel = struct({
    position: vec3f,
    v: vec3f,
});

export const PosVelArray = (n: number) => arrayOf(PosVel, n);
