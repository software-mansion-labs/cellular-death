import * as d from 'typegpu/data';
import * as wf from 'wayfare';

type MeshData = {
  vertices: { pos: d.v3f; normal: d.v3f; uv: d.v2f }[];
};

/**
 * Creates a UV sphere mesh with the given radius and subdivisions.
 */
export function createSphereMesh(
  radius: number,
  segments = 16,
  rings = 12,
): wf.MeshAsset {
  const data: MeshData = {
    vertices: [],
  };

  // Generate sphere as triangles
  for (let ring = 0; ring < rings; ring++) {
    for (let segment = 0; segment < segments; segment++) {
      // Calculate the four corners of this quad
      const vertices: Array<{
        pos: d.v3f;
        normal: d.v3f;
        uv: d.v2f;
      }> = [];

      for (let i = 0; i <= 1; i++) {
        for (let j = 0; j <= 1; j++) {
          const r = ring + i;
          const s = segment + j;

          const phi = (r * Math.PI) / rings;
          const theta = (s * 2 * Math.PI) / segments;

          const sinPhi = Math.sin(phi);
          const cosPhi = Math.cos(phi);
          const sinTheta = Math.sin(theta);
          const cosTheta = Math.cos(theta);

          const x = radius * sinPhi * cosTheta;
          const y = radius * cosPhi;
          const z = radius * sinPhi * sinTheta;

          const nx = sinPhi * cosTheta;
          const ny = cosPhi;
          const nz = sinPhi * sinTheta;

          const u = s / segments;
          const v = r / rings;

          vertices.push({
            pos: d.vec3f(x, y, z),
            normal: d.vec3f(nx, ny, nz),
            uv: d.vec2f(u, v),
          });
        }
      }

      // First triangle: [0, 2, 3]
      data.vertices.push(vertices[0]);
      data.vertices.push(vertices[2]);
      data.vertices.push(vertices[3]);

      // Second triangle: [0, 3, 1]
      data.vertices.push(vertices[0]);
      data.vertices.push(vertices[3]);
      data.vertices.push(vertices[1]);
    }
  }

  return wf.meshAsset({ data });
}
