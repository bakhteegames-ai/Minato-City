import * as THREE from 'three';

export interface AssetInspectionSpec {
  id: string;
  maxTriangles: number;
  minTriangles?: number;
  /** Expected ground contact tolerance in meters (default 0.008m). */
  groundToleranceM?: number;
  /** Whether textured/non-utility meshes must carry UV coordinates (default true). */
  requireUVs?: boolean;
  /** Optional expected world dimensions [minW, maxW, minH, maxH, minD, maxD]. */
  expectedHeightRangeM?: readonly [number, number];
}

export interface AssetInspectionReport {
  id: string;
  meshCount: number;
  triangles: number;
  vertices: number;
  degenerateTriangles: number;
  nanVertices: number;
  meshesMissingUV: string[];
  boundsM: {
    size: [number, number, number];
    min: [number, number, number];
    max: [number, number, number];
  };
  minYM: number;
  issues: string[];
  passedStrict: boolean;
}

const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _cross = new THREE.Vector3();

/**
 * Stage-Gate v2 Strict 3D Asset Inspector (TypeScript equivalent of blender_forge.py inspect --strict).
 * Audits world bounds in meters, ground contact minY, degenerate zero-area triangles,
 * finite vertex coordinates, UV coverage, and triangle budget ceilings.
 */
export function inspectAssetStrict(
  root: THREE.Object3D,
  spec: AssetInspectionSpec,
): AssetInspectionReport {
  root.updateMatrixWorld(true);

  let meshCount = 0;
  let triangles = 0;
  let vertices = 0;
  let degenerateTriangles = 0;
  let nanVertices = 0;
  const meshesMissingUV: string[] = [];
  const meshesMissingVertexColor: string[] = [];

  const box = new THREE.Box3();
  let hasBox = false;

  root.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    if (mesh.userData.excludeFromExport || mesh.userData.skipAudit) return;

    const geo = mesh.geometry as THREE.BufferGeometry | undefined;
    if (!geo) return;
    const pos = geo.getAttribute('position');
    if (!pos || pos.count === 0) return;

    meshCount++;
    vertices += pos.count;

    // Check finite coordinates
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        nanVertices++;
      }
    }

    // Check UVs on standard render meshes
    const uv = geo.getAttribute('uv');
    if ((spec.requireUVs ?? true) && (!uv || uv.count === 0)) {
      meshesMissingUV.push(mesh.name || `mesh_${meshCount}`);
    }

    // Check vertexColors contract (vertexColors: true without geometry 'color' renders pitch black in WebGL!)
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const needsVertexColor = mats.some((m) => Boolean(m && (m as THREE.MeshStandardMaterial).vertexColors));
    const colorAttr = geo.getAttribute('color');
    if (needsVertexColor && (!colorAttr || colorAttr.count === 0)) {
      meshesMissingVertexColor.push(mesh.name || `mesh_${meshCount}`);
    }

    // Count triangles & degenerate faces (area < 1e-8 m^2)
    const idx = geo.getIndex();
    const triCount = idx ? Math.floor(idx.count / 3) : Math.floor(pos.count / 3);
    triangles += triCount;

    for (let t = 0; t < triCount; t++) {
      const i0 = idx ? idx.getX(t * 3) : t * 3;
      const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      _vA.fromBufferAttribute(pos, i0);
      _vB.fromBufferAttribute(pos, i1);
      _vC.fromBufferAttribute(pos, i2);
      _e1.subVectors(_vB, _vA);
      _e2.subVectors(_vC, _vA);
      _cross.crossVectors(_e1, _e2);
      if (_cross.lengthSq() < 1e-12) {
        degenerateTriangles++;
      }
    }

    // Accumulate world AABB
    geo.computeBoundingBox();
    if (geo.boundingBox) {
      const meshBox = geo.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
      if (!hasBox) {
        box.copy(meshBox);
        hasBox = true;
      } else {
        box.union(meshBox);
      }
    }
  });

  const size = hasBox ? box.getSize(new THREE.Vector3()) : new THREE.Vector3();
  const min = hasBox ? box.min.clone() : new THREE.Vector3();
  const max = hasBox ? box.max.clone() : new THREE.Vector3();
  const minYM = Number(min.y.toFixed(4));

  const issues: string[] = [];
  const groundTol = spec.groundToleranceM ?? 0.008;

  if (meshCount === 0) issues.push('No renderable mesh objects found');
  if (nanVertices > 0) issues.push(`Found ${nanVertices} non-finite vertex coordinates`);
  if (degenerateTriangles > 0) issues.push(`Found ${degenerateTriangles} degenerate zero-area triangles`);
  if (triangles > spec.maxTriangles) {
    issues.push(`Triangle count ${triangles} exceeds budget ${spec.maxTriangles}`);
  }
  if (spec.minTriangles !== undefined && triangles < spec.minTriangles) {
    issues.push(`Triangle count ${triangles} below minimum sculpted detail floor ${spec.minTriangles}`);
  }
  if (meshesMissingUV.length > 0) {
    issues.push(`Meshes missing UV map: ${meshesMissingUV.join(', ')}`);
  }
  if (meshesMissingVertexColor.length > 0) {
    issues.push(`Meshes with vertexColors=true missing color attribute: ${meshesMissingVertexColor.join(', ')}`);
  }
  if (hasBox && Math.abs(min.y) > groundTol) {
    issues.push(`Ground contact minY=${min.y.toFixed(4)}m exceeds tolerance ±${groundTol}m`);
  }
  if (spec.expectedHeightRangeM) {
    const [hMin, hMax] = spec.expectedHeightRangeM;
    if (size.y < hMin || size.y > hMax) {
      issues.push(`Height ${size.y.toFixed(2)}m outside expected [${hMin}, ${hMax}]m`);
    }
  }

  return {
    id: spec.id,
    meshCount,
    triangles,
    vertices,
    degenerateTriangles,
    nanVertices,
    meshesMissingUV,
    boundsM: {
      size: [Number(size.x.toFixed(3)), Number(size.y.toFixed(3)), Number(size.z.toFixed(3))],
      min: [Number(min.x.toFixed(3)), Number(min.y.toFixed(3)), Number(min.z.toFixed(3))],
      max: [Number(max.x.toFixed(3)), Number(max.y.toFixed(3)), Number(max.z.toFixed(3))],
    },
    minYM,
    issues,
    passedStrict: issues.length === 0,
  };
}

export interface RectXZ {
  name: string;
  x1: number;
  z1: number;
  x2: number;
  z2: number;
}

export interface GroundedPlacement {
  name: string;
  x: number;
  z: number;
  y: number;
}

export interface ScenePlacementAuditResult {
  overlaps: string[];
  groundingErrors: string[];
  passed: boolean;
}

/**
 * Stage-Gate v2 Cross-Asset Placement & Terrain Grounding Audit
 * (TypeScript equivalent of Godot SliceSmokeTest.gd `_check_no_prop_storefront_overlap`).
 */
export function auditScenePlacements(
  buildings: readonly RectXZ[],
  props: readonly RectXZ[],
  groundedItems: readonly GroundedPlacement[],
  terrainHeightFn: (x: number, z: number) => number,
  options?: { shrinkMarginM?: number; groundTolM?: number },
): ScenePlacementAuditResult {
  const margin = options?.shrinkMarginM ?? 0.04;
  const groundTol = options?.groundTolM ?? 0.04;
  const overlaps: string[] = [];
  const groundingErrors: string[] = [];

  for (const p of props) {
    for (const b of buildings) {
      const bx1 = b.x1 + margin;
      const bz1 = b.z1 + margin;
      const bx2 = b.x2 - margin;
      const bz2 = b.z2 - margin;
      const hitX = p.x1 < bx2 && p.x2 > bx1;
      const hitZ = p.z1 < bz2 && p.z2 > bz1;
      if (hitX && hitZ) {
        overlaps.push(`Prop '${p.name}' overlaps building '${b.name}'`);
      }
    }
  }

  for (const item of groundedItems) {
    const expectedY = terrainHeightFn(item.x, item.z);
    const delta = Math.abs(item.y - expectedY);
    if (delta > groundTol) {
      groundingErrors.push(
        `Item '${item.name}' at (${item.x.toFixed(2)}, ${item.z.toFixed(2)}) has y=${item.y.toFixed(3)}m vs terrain ${expectedY.toFixed(3)}m`,
      );
    }
  }

  return {
    overlaps,
    groundingErrors,
    passed: overlaps.length === 0 && groundingErrors.length === 0,
  };
}
