import { arrayOf, atomic, i32, mat3x3f, struct, vec3f } from 'typegpu/data';

export const Particle = struct({
    position: vec3f,
    v: vec3f,
    C: mat3x3f,
}).$name('Particle');

export const ParticleArray = (n: number) => arrayOf(Particle, n);

export const Cell = struct({
    vx: i32,
    vy: i32,
    vz: i32,
    mass: i32,
}).$name('Cell');

export const CellAtomic = struct({
    vx: atomic(i32),
    vy: atomic(i32),
    vz: atomic(i32),
    mass: atomic(i32),
}).$name('Cell');

export const CellAtomicExceptMass = struct({
    vx: atomic(i32),
    vy: atomic(i32),
    vz: atomic(i32),
    mass: i32,
}).$name('Cell');

export const CellArray = (n: number) => arrayOf(Cell, n);

export const CellAtomicArray = (n: number) => arrayOf(CellAtomic, n);

export const CellAtomicExceptMassArray = (n: number) =>
    arrayOf(CellAtomicExceptMass, n);
