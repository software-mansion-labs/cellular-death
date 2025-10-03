import tgpu, { type TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';


export const lightDirection = d.vec3f(0.5773502691896258, 0.5773502691896258, 0.5773502691896258); // ?

const vertexOutput = {
    position: d.builtin.position,
    uv: d.vec2f,
    viewPosition: d.vec3f,
    speed: d.f32,
};

export const RenderUniforms = d.struct({
    texelSize: d.vec2f,
	sphereSize: d.f32,
	invProjectionMatrix: d.mat4x4f,
	projectionMatrix: d.mat4x4f,
	viewMatrix: d.mat4x4f,
	invViewMatrix: d.mat4x4f,
});


export const PosVel = d.struct({ position: d.vec3f, v: d.vec3f });

export const valueToColor = tgpu.fn(
    [d.f32],
    d.vec3f
)((value) => {
    const col0 = d.vec3f(0, 0.4, 0.8);
    const col1 = d.vec3f(35, 161, 165).div(256);
    const col2 = d.vec3f(95, 254, 150).div(256);
    const col3 = d.vec3f(243, 250, 49).div(256);
    const col4 = d.vec3f(255, 165, 0).div(256);

    if (0 <= value && value < 0.25) {
        let t = value / 0.25;
        return std.mix(col0, col1, t);
    } else if (0.25 <= value && value < 0.50) {
        let t = (value - 0.25) / 0.25;
        return std.mix(col1, col2, t);
    } else if (0.50 <= value && value < 0.75) {
        let t = (value - 0.50) / 0.25;
        return std.mix(col2, col3, t);
    } else {
        let t = (value - 0.75) / 0.25;
        return std.mix(col3, col4, t);
    }
});




export const sphereVertex = tgpu['~unstable'].vertexFn({
	in: {
		vertexIndex: d.builtin.vertexIndex,
		instanceIndex: d.builtin.instanceIndex,
	},
	out: vertexOutput,
})(({ vertexIndex, instanceIndex }) => {
    const cornerOffsets = [
        d.vec2f(0.5, 0.5),
        d.vec2f(0.5, -0.5),
        d.vec2f(-0.5, -0.5),
        d.vec2f(0.5, 0.5),
        d.vec2f(-0.5, -0.5),
        d.vec2f(-0.5, 0.5),
    ];

	const corner = cornerOffsets[vertexIndex];
	const scaledCorner = corner.mul(renderLayout.$.uniforms.sphereSize);
	const corner3 = d.vec3f(scaledCorner.x, scaledCorner.y, 0);
	const uv = corner.add(d.vec2f(0.5, 0.5));

	const particle = renderLayout.$.particles[instanceIndex];
	const realPosition = particle.position;
	const viewPosition = std.mul(renderLayout.$.uniforms.viewMatrix, d.vec4f(realPosition, 1)).xyz;
	const outPosition = std.mul(renderLayout.$.uniforms.projectionMatrix, d.vec4f(viewPosition.add(corner3), 1));

	const velocity = particle.v;
	const speed = std.sqrt(std.dot(velocity, velocity));

	return {
		position: outPosition,
		uv,
		viewPosition,
		speed,
	};
});


export const renderLayout = tgpu.bindGroupLayout({
	particles: { storage: d.arrayOf(PosVel), access: 'readonly' },
	uniforms: { uniform: RenderUniforms },
});

export const sphereFragment = tgpu['~unstable'].fragmentFn({
	in: {
		uv: d.vec2f,
		viewPosition: d.vec3f,
		speed: d.f32,
	},
	out: {
		fragColor: d.vec4f,
		fragDepth: d.builtin.fragDepth,
	},
})(({ uv, viewPosition, speed }) => {
	const normalXY = uv.mul(2).sub(d.vec2f(1, 1));
	const r2 = std.dot(normalXY, normalXY);
	if (r2 > 1) {
		std.discard();
	}

	const normalZ = std.sqrt(1 - r2);
	const normal = d.vec3f(normalXY.x, normalXY.y, normalZ);

	const radius = renderLayout.$.uniforms.sphereSize / 2;
	const offset = normal.mul(radius);
	const realViewPos = d.vec4f(viewPosition.add(offset), 1);
	const clipSpacePos = std.mul(renderLayout.$.uniforms.projectionMatrix, realViewPos);

	const diffuse = std.max(0, std.dot(normal, lightDirection));
	const color = valueToColor(speed / 1.5);

	return {
		fragColor: d.vec4f(color.mul(diffuse), 1),
		fragDepth: clipSpacePos.z / clipSpacePos.w,
	};
});