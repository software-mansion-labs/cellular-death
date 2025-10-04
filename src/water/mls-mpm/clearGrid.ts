import tgpu from 'typegpu';
import { builtin } from 'typegpu/data';
import { CellArray } from './shared';

export const clearGridLayout = tgpu.bindGroupLayout({
    cells: { storage: CellArray, access: 'mutable' },
});

const { cells } = clearGridLayout.bound;

export const clearGridFn = tgpu['~unstable'].computeFn({
    workgroupSize: [64],
    in: { gid: builtin.globalInvocationId },
})((input) => {
    if (input.gid.x < cells.value.length) {
        cells.value[input.gid.x].mass = 0;
        cells.value[input.gid.x].vx = 0;
        cells.value[input.gid.x].vy = 0;
        cells.value[input.gid.x].vz = 0;
    }
});
