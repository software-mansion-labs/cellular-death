import { clearGridFn, clearGridLayout } from './clearGrid';
import { p2g_1Fn, p2g_1Layout } from './p2g_1';
import { p2g_2Shader, p2g_2Layout } from './p2g_2';
import { g2pShader, g2pLayout } from './g2p';
import { copyPositionFn, copyPositionLayout } from './copyPosition';

import { numParticlesMax, PosVelArray, renderUniforms } from '../common';

import { updateGridShader, updateGridLayout } from './updateGrid';

import * as d from 'typegpu/data';
import { tgpu, type StorageFlag, type TgpuBindGroup, type TgpuBuffer, type TgpuRoot, type UniformFlag } from 'typegpu';

export const mlsmpmParticleStructSize = 80;

export class MLSMPMSimulator {
    max_x_grids = 64;
    max_y_grids = 64;
    max_z_grids = 64;
    cellStructSize = 16;
    realBoxSizeBuffer: TgpuBuffer<d.Vec3f> & UniformFlag;
    initBoxSizeBuffer: TgpuBuffer<d.Vec3f> & UniformFlag;
    numParticles = 0;
    gridCount = 0;

    clearGridPipeline: GPUComputePipeline;
    p2g1Pipeline: GPUComputePipeline;
    p2g2Pipeline: GPUComputePipeline;
    updateGridPipeline: GPUComputePipeline;
    g2pPipeline: GPUComputePipeline;
    copyPositionPipeline: GPUComputePipeline;

    clearGridBindGroup: TgpuBindGroup<(typeof clearGridLayout)['entries']>;
    p2g1BindGroup: TgpuBindGroup<(typeof p2g_1Layout)['entries']>;
    p2g2BindGroup: TgpuBindGroup<(typeof p2g_2Layout)['entries']>;
    updateGridBindGroup: TgpuBindGroup<(typeof updateGridLayout)['entries']>;
    g2pBindGroup: TgpuBindGroup<(typeof g2pLayout)['entries']>;
    copyPositionBindGroup: TgpuBindGroup<
        (typeof copyPositionLayout)['entries']
    >;

    particleBuffer: GPUBuffer;

    device: GPUDevice;

    renderDiameter: number;

    root: TgpuRoot;

    constructor(
        particleBuffer: GPUBuffer,
        posvelBuffer: TgpuBuffer<ReturnType<typeof PosVelArray>> & StorageFlag,
        renderDiameter: number,
        root: TgpuRoot
    ) {
        this.root = root;
        const device = root.device;
        this.device = device;
        this.renderDiameter = renderDiameter;
        const clearGridModule = device.createShaderModule({
            code: tgpu.resolve({ externals: { clearGridFn } }),
        });
        const p2g1Module = device.createShaderModule({
            code: tgpu.resolve({ externals: { p2g_1Fn } }),
        });
        const p2g2Module = device.createShaderModule({ code: p2g_2Shader });
        const updateGridModule = device.createShaderModule({
            code: updateGridShader,
        });
        const g2pModule = device.createShaderModule({ code: g2pShader });
        const copyPositionModule = device.createShaderModule({
            code: tgpu.resolve({ externals: { copyPositionFn } }),
        });

        const constants = {
            stiffness: 3,
            restDensity: 4,
            dynamic_viscosity: 0.1,
            dt: 0.2,
            fixed_point_multiplier: 1e7,
        };

        this.clearGridPipeline = device.createComputePipeline({
            label: 'clear grid pipeline',
            layout: device.createPipelineLayout({
                bindGroupLayouts: [root.unwrap(clearGridLayout)],
            }),
            compute: {
                module: clearGridModule,
            },
        });
        this.p2g1Pipeline = device.createComputePipeline({
            label: 'p2g 1 pipeline',
            layout: device.createPipelineLayout({
                bindGroupLayouts: [root.unwrap(p2g_1Layout)],
            }),
            compute: {
                module: p2g1Module,
            },
        });
        this.p2g2Pipeline = device.createComputePipeline({
            label: 'p2g 2 pipeline',
            layout: device.createPipelineLayout({
                bindGroupLayouts: [root.unwrap(p2g_2Layout)],
            }),
            compute: {
                module: p2g2Module,
                constants: {
                    stiffness: constants.stiffness,
                    rest_density: constants.restDensity,
                    dynamic_viscosity: constants.dynamic_viscosity,
                    dt: constants.dt,
                },
            },
        });
        this.updateGridPipeline = device.createComputePipeline({
            label: 'update grid pipeline',
            layout: device.createPipelineLayout({
                bindGroupLayouts: [root.unwrap(updateGridLayout)],
            }),
            compute: {
                module: updateGridModule,
                constants: {
                    dt: constants.dt,
                },
            },
        });
        this.g2pPipeline = device.createComputePipeline({
            label: 'g2p pipeline',
            layout: device.createPipelineLayout({
                bindGroupLayouts: [root.unwrap(g2pLayout)],
            }),
            compute: {
                module: g2pModule,
                constants: {
                    dt: constants.dt,
                },
            },
        });
        this.copyPositionPipeline = device.createComputePipeline({
            label: 'copy position pipeline',
            layout: device.createPipelineLayout({
                bindGroupLayouts: [root.unwrap(copyPositionLayout)],
            }),
            compute: {
                module: copyPositionModule,
            },
        });

        const maxGridCount =
            this.max_x_grids * this.max_y_grids * this.max_z_grids;

        const cellBuffer = device.createBuffer({
            label: 'cells buffer',
            size: this.cellStructSize * maxGridCount,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        this.realBoxSizeBuffer = root
            .createBuffer(d.vec3f)
            .$usage('uniform')
            .$name('real box size buffer');
        this.initBoxSizeBuffer = root
            .createBuffer(d.vec3f)
            .$usage('uniform')
            .$name('init box size buffer');

        // BindGroup
        this.clearGridBindGroup = root.createBindGroup(clearGridLayout, {
            cells: cellBuffer,
        });
        this.p2g1BindGroup = root.createBindGroup(p2g_1Layout, {
            particles: particleBuffer,
            cells: cellBuffer,
            initBoxSize: this.initBoxSizeBuffer,
        });
        this.p2g2BindGroup = root.createBindGroup(p2g_2Layout, {
            particles: particleBuffer,
            cells: cellBuffer,
            initBoxSize: this.initBoxSizeBuffer,
        });
        this.updateGridBindGroup = root.createBindGroup(updateGridLayout, {
            cells: cellBuffer,
            realBoxSize: this.realBoxSizeBuffer,
            initBoxSize: this.initBoxSizeBuffer,
        });
        this.g2pBindGroup = root.createBindGroup(g2pLayout, {
            particles: particleBuffer,
            cells: cellBuffer,
            realBoxSize: this.realBoxSizeBuffer,
            initBoxSize: this.initBoxSizeBuffer,
        });
        this.copyPositionBindGroup = root.createBindGroup(copyPositionLayout, {
            particles: particleBuffer,
            posvel: posvelBuffer,
        });

        this.particleBuffer = particleBuffer;
    }

    initDambreak(initBoxSize: number[], numParticles: number) {
        let particlesBuf = new ArrayBuffer(
            mlsmpmParticleStructSize * numParticlesMax
        );
        const spacing = 0.65;

        this.numParticles = 0;

        for (
            let j = 0;
            j < initBoxSize[1] * 0.8 && this.numParticles < numParticles;
            j += spacing
        ) {
            for (
                let i = 3;
                i < initBoxSize[0] - 4 && this.numParticles < numParticles;
                i += spacing
            ) {
                for (
                    let k = 3;
                    k < initBoxSize[2] / 2 && this.numParticles < numParticles;
                    k += spacing
                ) {
                    const offset = mlsmpmParticleStructSize * this.numParticles;
                    const particleViews = {
                        position: new Float32Array(particlesBuf, offset + 0, 3),
                        v: new Float32Array(particlesBuf, offset + 16, 3),
                        C: new Float32Array(particlesBuf, offset + 32, 12),
                    };
                    const jitter = 2.0 * Math.random();
                    particleViews.position.set([
                        i + jitter,
                        j + jitter,
                        k + jitter,
                    ]);
                    this.numParticles++;
                }
            }
        }

        let particles = new ArrayBuffer(
            mlsmpmParticleStructSize * this.numParticles
        );
        const oldView = new Uint8Array(particlesBuf);
        const newView = new Uint8Array(particles);
        newView.set(oldView.subarray(0, newView.length));

        return particles;
    }

    reset(numParticles: number, initBoxSize: number[]) {
        renderUniforms.sphere_size = this.renderDiameter;
        const particleData = this.initDambreak(initBoxSize, numParticles);
        const maxGridCount =
            this.max_x_grids * this.max_y_grids * this.max_z_grids;
        this.gridCount =
            Math.ceil(initBoxSize[0]) *
            Math.ceil(initBoxSize[1]) *
            Math.ceil(initBoxSize[2]);
        if (this.gridCount > maxGridCount) {
            throw new Error(
                'gridCount should be equal to or less than maxGridCount'
            );
        }
        this.initBoxSizeBuffer.write(
            d.vec3f(initBoxSize[0], initBoxSize[1], initBoxSize[2])
        );
        this.realBoxSizeBuffer.write(
            d.vec3f(initBoxSize[0], initBoxSize[1], initBoxSize[2])
        );
        this.device.queue.writeBuffer(this.particleBuffer, 0, particleData);
        console.log(this.numParticles);
    }

    execute(commandEncoder: GPUCommandEncoder) {
        const computePass = commandEncoder.beginComputePass();
        for (let i = 0; i < 2; i++) {
            computePass.setBindGroup(
                0,
                this.root.unwrap(this.clearGridBindGroup)
            );
            computePass.setPipeline(this.clearGridPipeline);
            computePass.dispatchWorkgroups(Math.ceil(this.gridCount / 64)); // これは gridCount だよな？

            computePass.setBindGroup(0, this.root.unwrap(this.p2g1BindGroup));
            computePass.setPipeline(this.p2g1Pipeline);
            computePass.dispatchWorkgroups(Math.ceil(this.numParticles / 64));

            computePass.setBindGroup(0, this.root.unwrap(this.p2g2BindGroup));
            computePass.setPipeline(this.p2g2Pipeline);
            computePass.dispatchWorkgroups(Math.ceil(this.numParticles / 64));

            computePass.setBindGroup(
                0,
                this.root.unwrap(this.updateGridBindGroup)
            );
            computePass.setPipeline(this.updateGridPipeline);
            computePass.dispatchWorkgroups(Math.ceil(this.gridCount / 64));

            computePass.setBindGroup(0, this.root.unwrap(this.g2pBindGroup));
            computePass.setPipeline(this.g2pPipeline);
            computePass.dispatchWorkgroups(Math.ceil(this.numParticles / 64));

            computePass.setBindGroup(
                0,
                this.root.unwrap(this.copyPositionBindGroup)
            );
            computePass.setPipeline(this.copyPositionPipeline);
            computePass.dispatchWorkgroups(Math.ceil(this.numParticles / 64));
        }
        computePass.end();
    }

    changeBoxSize(realBoxSize: number[]) {
        this.realBoxSizeBuffer.write(
            d.vec3f(realBoxSize[0], realBoxSize[1], realBoxSize[2])
        );
    }
}
