import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type ProfilePoint = readonly [number, number];

export interface LoftSection {
  /** Base 2D cross-section polygon in local XZ plane (CCW when viewed from +Y). */
  profile: readonly ProfilePoint[];
  /** World/local center position of this cross-section ring. */
  pos: readonly [number, number, number];
  /** Optional local X/Z scale multipliers. */
  scale?: readonly [number, number];
  /** Optional Euler rotations (radians) for the ring plane. */
  rot?: readonly [number, number, number];
}

export interface LoftOptions {
  capStart?: boolean;
  capEnd?: boolean;
  creaseAngleDeg?: number;
  uvTileScale?: number;
  useBoxUV?: boolean;
}

/**
 * Generates an 8-vertex chamfered rectangle profile in the XZ plane (CCW from +Y).
 * Eliminates raw 90-degree Roblox/box silhouettes in favor of DRG-style hard bevels.
 */
export function makeChamferRectProfile(width: number, depth: number, chamfer: number): ProfilePoint[] {
  const hw = width * 0.5;
  const hd = depth * 0.5;
  const c = Math.max(0.0005, Math.min(chamfer, hw * 0.85, hd * 0.85));
  return [
    [hw - c, hd],
    [hw, hd - c],
    [hw, -hd + c],
    [hw - c, -hd],
    [-hw + c, -hd],
    [-hw, -hd + c],
    [-hw, hd - c],
    [-hw + c, hd],
  ];
}

/**
 * Generates an N-sided angular/faceted ellipse profile (CCW from +Y) with optional
 * front/back flattening for sculpted DRG/TF2 anatomical & mechanical volumes.
 */
export function makeFacetedOvalProfile(
  rx: number,
  rz: number,
  segments = 10,
  frontScale = 1,
  backScale = 1,
  angleOffset = 0,
): ProfilePoint[] {
  const pts: ProfilePoint[] = [];
  for (let i = 0; i < segments; i++) {
    // Clockwise angle in math => CCW in XZ when viewed from +Y (z forward, x right)
    const a = angleOffset - (i / segments) * Math.PI * 2;
    const x = Math.cos(a) * rx;
    const rawZ = Math.sin(a) * rz;
    const z = rawZ >= 0 ? rawZ * frontScale : rawZ * backScale;
    pts.push([x, z]);
  }
  return pts;
}

/**
 * Generates a 12-vertex anatomical torso/jacket cross-section with sternum plane,
 * broad pectorals/deltoids, tapered flanks, and dorsal spine crease.
 */
export function makeAnatomicalTorsoProfile(
  halfWidth: number,
  frontDepth: number,
  backDepth: number,
  chestSquareness = 0.72,
  spineInset = 0.82,
): ProfilePoint[] {
  const w = halfWidth;
  const f = frontDepth;
  const b = backDepth;
  return [
    [0, f], // sternum center
    [w * chestSquareness, f * 0.88], // right pectoral corner
    [w * 0.98, f * 0.34], // right front flank
    [w, -b * 0.12], // right side
    [w * 0.86, -b * 0.68], // right shoulder blade / lat
    [w * 0.38, -b], // right dorsal muscle
    [0, -b * spineInset], // spine valley
    [-w * 0.38, -b], // left dorsal muscle
    [-w * 0.86, -b * 0.68], // left lat
    [-w, -b * 0.12], // left side
    [-w * 0.98, f * 0.34], // left front flank
    [-w * chestSquareness, f * 0.88], // left pectoral corner
  ];
}

/**
 * Generates an 8-vertex sculpted limb/sleeve cross-section with distinct anatomical front ridge
 * (shin/bicep/forearm plane) and tapered rear mass.
 */
export function makeLimbProfile(rx: number, rz: number, frontPinch = 0.82): ProfilePoint[] {
  return [
    [0, rz],
    [rx * frontPinch, rz * 0.65],
    [rx, 0.05 * rz],
    [rx * 0.76, -rz * 0.72],
    [0, -rz * 0.96],
    [-rx * 0.76, -rz * 0.72],
    [-rx, 0.05 * rz],
    [-rx * frontPinch, rz * 0.65],
  ];
}

/**
 * Generates a 12-vertex angular adult head/skull horizontal cross-section
 * with cheekbone planes, jaw/brow angles, and occipital taper.
 */
export function makeSkullProfile(
  halfWidth: number,
  frontDepth: number,
  backDepth: number,
  cheekStrength = 0.86,
  noseProtrusion = 1.0,
): ProfilePoint[] {
  const w = halfWidth;
  const f = frontDepth;
  const b = backDepth;
  return [
    [0, f * noseProtrusion], // center face / nose / chin
    [w * 0.42, f * 0.9], // brow/cheek inner right
    [w * cheekStrength, f * 0.56], // right cheekbone / jaw corner
    [w, 0.02 * f], // right temple / ear line
    [w * 0.86, -b * 0.54], // right parietal
    [w * 0.44, -b * 0.94], // right occiput
    [0, -b], // back center
    [-w * 0.44, -b * 0.94],
    [-w * 0.86, -b * 0.54],
    [-w, 0.02 * f],
    [-w * cheekStrength, f * 0.56],
    [-w * 0.42, f * 0.9],
  ];
}

/**
 * Ensures consistent winding (CCW when viewed from +Y, i.e., positive signed area in X-(-Z) plane
 * so lofted side faces point outward).
 */
function ensureOutwardProfile(profile: readonly ProfilePoint[]): ProfilePoint[] {
  let area2 = 0;
  for (let i = 0; i < profile.length; i++) {
    const [x0, z0] = profile[i];
    const [x1, z1] = profile[(i + 1) % profile.length];
    area2 += x0 * (-z1) - x1 * (-z0);
  }
  // If signed area in (x, -z) is negative, reverse winding
  return area2 < 0 ? [...profile].reverse() : [...profile];
}

/**
 * Builds a continuous sculpted 3D BufferGeometry by lofting sequential cross-section rings.
 * Every ring must have the same vertex count.
 */
export function createLoftedGeometry(
  sections: readonly LoftSection[],
  options: LoftOptions = {},
): THREE.BufferGeometry {
  if (sections.length < 2) {
    throw new Error('createLoftedGeometry requires at least 2 sections');
  }
  const ringLen = sections[0].profile.length;
  if (ringLen < 3) {
    throw new Error('Loft profile must have at least 3 vertices');
  }
  for (let s = 1; s < sections.length; s++) {
    if (sections[s].profile.length !== ringLen) {
      throw new Error(
        `Loft section ${s} has ${sections[s].profile.length} vertices, expected ${ringLen}`,
      );
    }
  }

  const {
    capStart = true,
    capEnd = true,
    creaseAngleDeg = 42,
    uvTileScale = 0.55,
    useBoxUV = true,
  } = options;

  // Transform all ring vertices to 3D
  const rings: THREE.Vector3[][] = [];
  const euler = new THREE.Euler();
  const quat = new THREE.Quaternion();

  for (const sec of sections) {
    const ordered = ensureOutwardProfile(sec.profile);
    const sx = sec.scale ? sec.scale[0] : 1;
    const sz = sec.scale ? sec.scale[1] : 1;
    if (sec.rot) {
      euler.set(sec.rot[0], sec.rot[1], sec.rot[2], 'YXZ');
      quat.setFromEuler(euler);
    } else {
      quat.identity();
    }
    const cx = sec.pos[0];
    const cy = sec.pos[1];
    const cz = sec.pos[2];

    const ringVerts: THREE.Vector3[] = [];
    for (let i = 0; i < ringLen; i++) {
      const v = new THREE.Vector3(ordered[i][0] * sx, 0, ordered[i][1] * sz);
      if (sec.rot) v.applyQuaternion(quat);
      v.x += cx;
      v.y += cy;
      v.z += cz;
      ringVerts.push(v);
    }
    rings.push(ringVerts);
  }

  // Determine vertical direction to guarantee outward face winding
  const firstCenter = new THREE.Vector3(...sections[0].pos);
  const lastCenter = new THREE.Vector3(...sections[sections.length - 1].pos);
  const loftDir = lastCenter.clone().sub(firstCenter);
  // Check orientation against ring 0 normal using first two edges
  const ringNormal = new THREE.Vector3();
  const e1 = rings[0][1].clone().sub(rings[0][0]);
  const e2 = rings[0][2].clone().sub(rings[0][0]);
  ringNormal.crossVectors(e1, e2);
  const flipWinding = ringNormal.dot(loftDir) < 0;

  // Accumulate arc-length V coordinates along the loft
  const vCoords: number[] = [0];
  for (let s = 1; s < sections.length; s++) {
    const d = Math.hypot(
      sections[s].pos[0] - sections[s - 1].pos[0],
      sections[s].pos[1] - sections[s - 1].pos[1],
      sections[s].pos[2] - sections[s - 1].pos[2],
    );
    vCoords.push(vCoords[s - 1] + d * uvTileScale);
  }

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // Ring vertices (duplicate seam vertex at i === ringLen for clean cylindrical UVs)
  const stride = ringLen + 1;
  for (let s = 0; s < rings.length; s++) {
    const ring = rings[s];
    // Compute ring perimeter for U mapping
    let perim = 0;
    const uAcc: number[] = [0];
    for (let i = 0; i < ringLen; i++) {
      perim += ring[i].distanceTo(ring[(i + 1) % ringLen]);
      uAcc.push(perim);
    }
    const safePerim = perim > 1e-5 ? perim : 1;
    for (let i = 0; i <= ringLen; i++) {
      const v = ring[i % ringLen];
      positions.push(v.x, v.y, v.z);
      uvs.push((uAcc[i] / safePerim) * Math.max(0.5, safePerim * uvTileScale), vCoords[s]);
    }
  }

  // Side quad triangles
  for (let s = 0; s < rings.length - 1; s++) {
    const rowA = s * stride;
    const rowB = (s + 1) * stride;
    for (let i = 0; i < ringLen; i++) {
      const a = rowA + i;
      const b = rowA + i + 1;
      const c = rowB + i + 1;
      const d = rowB + i;
      if (!flipWinding) {
        indices.push(a, b, c, a, c, d);
      } else {
        indices.push(a, c, b, a, d, c);
      }
    }
  }

  // Helper to cap start or end cleanly with centroid fan
  const addCap = (ring: THREE.Vector3[], isEnd: boolean) => {
    const centroid = new THREE.Vector3();
    for (const v of ring) centroid.add(v);
    centroid.multiplyScalar(1 / ring.length);

    const centerIdx = positions.length / 3;
    positions.push(centroid.x, centroid.y, centroid.z);
    uvs.push(0.5, 0.5);

    const baseIdx = positions.length / 3;
    for (let i = 0; i < ring.length; i++) {
      const v = ring[i];
      positions.push(v.x, v.y, v.z);
      uvs.push(0.5 + (v.x - centroid.x) * uvTileScale, 0.5 + (v.z - centroid.z) * uvTileScale);
    }

    const outwardEnd = flipWinding ? !isEnd : isEnd;
    for (let i = 0; i < ring.length; i++) {
      const i0 = baseIdx + i;
      const i1 = baseIdx + ((i + 1) % ring.length);
      if (outwardEnd) {
        indices.push(centerIdx, i0, i1);
      } else {
        indices.push(centerIdx, i1, i0);
      }
    }
  };

  if (capStart) addCap(rings[0], false);
  if (capEnd) addCap(rings[rings.length - 1], true);

  let geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);

  if (useBoxUV) {
    applyBoxUVs(geo, uvTileScale);
  }

  geo = splitCreaseNormals(geo, creaseAngleDeg);
  return geo;
}

/**
 * Builds a true 3-axis chamfered DRG-style hard-surface prism centered at origin.
 * Unlike THREE.BoxGeometry, every edge has a deliberate light-catching angled bevel.
 */
export function createChamferedPrism(
  width: number,
  height: number,
  depth: number,
  bevel = 0.04,
  options: { creaseAngleDeg?: number; uvTileScale?: number; topTaperX?: number; topTaperZ?: number } = {},
): THREE.BufferGeometry {
  const b = Math.max(0.002, Math.min(bevel, width * 0.35, height * 0.35, depth * 0.35));
  const hh = height * 0.5;
  const tx = options.topTaperX ?? 1;
  const tz = options.topTaperZ ?? 1;

  const botInset = makeChamferRectProfile(Math.max(0.004, width - b * 2), Math.max(0.004, depth - b * 2), b * 0.65);
  const midFull = makeChamferRectProfile(width, depth, b);
  const topFull = makeChamferRectProfile(width * tx, depth * tz, b * Math.min(tx, tz));
  const topInset = makeChamferRectProfile(
    Math.max(0.004, width * tx - b * 2),
    Math.max(0.004, depth * tz - b * 2),
    b * 0.65 * Math.min(tx, tz),
  );

  return createLoftedGeometry(
    [
      { profile: botInset, pos: [0, -hh, 0] },
      { profile: midFull, pos: [0, -hh + b, 0] },
      { profile: topFull, pos: [0, hh - b, 0] },
      { profile: topInset, pos: [0, hh, 0] },
    ],
    {
      capStart: true,
      capEnd: true,
      creaseAngleDeg: options.creaseAngleDeg ?? 34,
      uvTileScale: options.uvTileScale ?? 0.55,
      useBoxUV: true,
    },
  );
}

/**
 * Builds a beveled 2D profile extrusion centered on Z, with controlled 1-step angular DRG bevel
 * and box-projected UVs + crease normals.
 */
export function createExtrudedProfile(
  points2D: readonly ProfilePoint[],
  depth: number,
  bevelSize = 0.025,
  bevelThickness = 0.025,
  options: { creaseAngleDeg?: number; uvTileScale?: number } = {},
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(points2D[0][0], points2D[0][1]);
  for (let i = 1; i < points2D.length; i++) {
    shape.lineTo(points2D[i][0], points2D[i][1]);
  }
  shape.closePath();

  const raw = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevelSize > 0 && bevelThickness > 0,
    bevelSegments: 1,
    steps: 1,
    bevelSize,
    bevelThickness,
  });
  raw.translate(0, 0, -depth * 0.5);
  applyBoxUVs(raw, options.uvTileScale ?? 0.55);
  const creased = splitCreaseNormals(raw, options.creaseAngleDeg ?? 36);
  raw.dispose();
  return creased;
}

/**
 * Builds a recessed 4-member beveled architectural/machinery frame (top lintel, bottom sill,
 * left & right jambs) around an open inner bay.
 */
export function createRecessedFrame(
  outerWidth: number,
  outerHeight: number,
  depth: number,
  frameThick: number,
  bevel = 0.015,
): THREE.BufferGeometry {
  const innerH = Math.max(0.05, outerHeight - frameThick * 2);
  const top = createChamferedPrism(outerWidth, frameThick, depth, bevel);
  top.translate(0, outerHeight * 0.5 - frameThick * 0.5, 0);

  const bot = createChamferedPrism(outerWidth, frameThick, depth, bevel);
  bot.translate(0, -outerHeight * 0.5 + frameThick * 0.5, 0);

  const left = createChamferedPrism(frameThick, innerH, depth * 0.94, bevel * 0.8);
  left.translate(-outerWidth * 0.5 + frameThick * 0.5, 0, 0);

  const right = createChamferedPrism(frameThick, innerH, depth * 0.94, bevel * 0.8);
  right.translate(outerWidth * 0.5 - frameThick * 0.5, 0, 0);

  return mergeParts([top, bot, left, right]);
}

/**
 * Projects triplanar-style box UVs onto every triangle based on its dominant face normal axis.
 * Guarantees crisp hand-painted texture scale across sloped roofs, car hoods, and jackets.
 */
export function applyBoxUVs(geo: THREE.BufferGeometry, tilesPerMeter = 0.5): THREE.BufferGeometry {
  const work = geo.index ? geo.toNonIndexed() : geo;
  const pos = work.getAttribute('position') as THREE.BufferAttribute;
  const uvArr = new Float32Array(pos.count * 2);

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const n = new THREE.Vector3();

  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    n.crossVectors(ab, ac);
    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    const az = Math.abs(n.z);

    for (let k = 0; k < 3; k++) {
      const idx = i + k;
      const vx = pos.getX(idx);
      const vy = pos.getY(idx);
      const vz = pos.getZ(idx);
      if (ay >= ax && ay >= az) {
        uvArr[idx * 2] = vx * tilesPerMeter;
        uvArr[idx * 2 + 1] = vz * tilesPerMeter;
      } else if (ax >= ay && ax >= az) {
        uvArr[idx * 2] = vz * tilesPerMeter;
        uvArr[idx * 2 + 1] = vy * tilesPerMeter;
      } else {
        uvArr[idx * 2] = vx * tilesPerMeter;
        uvArr[idx * 2 + 1] = vy * tilesPerMeter;
      }
    }
  }

  work.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
  if (work !== geo) {
    geo.setIndex(null);
    geo.setAttribute('position', work.getAttribute('position'));
    geo.setAttribute('uv', work.getAttribute('uv'));
    if (work.getAttribute('normal')) {
      geo.setAttribute('normal', work.getAttribute('normal'));
    }
    if (work.getAttribute('color')) {
      geo.setAttribute('color', work.getAttribute('color'));
    }
  }
  return geo;
}

/**
 * Splits hard creases above `creaseAngleDeg` while smoothing normals across shallower angles.
 * Core DRG / TF2 faceted-yet-sculpted shading signature.
 */
export function splitCreaseNormals(
  sourceGeo: THREE.BufferGeometry,
  creaseAngleDeg = 38,
): THREE.BufferGeometry {
  const nonIndexed = sourceGeo.index ? sourceGeo.toNonIndexed() : sourceGeo.clone();
  const posAttr = nonIndexed.getAttribute('position') as THREE.BufferAttribute;
  const vertCount = posAttr.count;
  const triCount = Math.floor(vertCount / 3);
  const cosThreshold = Math.cos(THREE.MathUtils.degToRad(creaseAngleDeg));

  // Compute flat face normals for every triangle
  const faceNormals: THREE.Vector3[] = new Array(triCount);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();

  for (let t = 0; t < triCount; t++) {
    const i0 = t * 3;
    a.fromBufferAttribute(posAttr, i0);
    b.fromBufferAttribute(posAttr, i0 + 1);
    c.fromBufferAttribute(posAttr, i0 + 2);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    const fn = new THREE.Vector3().crossVectors(ab, ac);
    if (fn.lengthSq() > 1e-12) {
      fn.normalize();
    } else {
      fn.set(0, 1, 0);
    }
    faceNormals[t] = fn;
  }

  // Spatial bucket by quantized position to gather incident triangles
  const bucketMap = new Map<string, number[]>();
  const keyOf = (x: number, y: number, z: number) =>
    `${Math.round(x * 2000)},${Math.round(y * 2000)},${Math.round(z * 2000)}`;

  for (let i = 0; i < vertCount; i++) {
    const key = keyOf(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
    let list = bucketMap.get(key);
    if (!list) {
      list = [];
      bucketMap.set(key, list);
    }
    list.push(Math.floor(i / 3));
  }

  const normalArr = new Float32Array(vertCount * 3);
  const accum = new THREE.Vector3();

  for (let i = 0; i < vertCount; i++) {
    const triIdx = Math.floor(i / 3);
    const fn = faceNormals[triIdx];
    const key = keyOf(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
    const incident = bucketMap.get(key)!;
    accum.set(0, 0, 0);

    for (let k = 0; k < incident.length; k++) {
      const otherFn = faceNormals[incident[k]];
      if (fn.dot(otherFn) >= cosThreshold) {
        accum.add(otherFn);
      }
    }
    if (accum.lengthSq() > 1e-12) {
      accum.normalize();
    } else {
      accum.copy(fn);
    }
    normalArr[i * 3] = accum.x;
    normalArr[i * 3 + 1] = accum.y;
    normalArr[i * 3 + 2] = accum.z;
  }

  nonIndexed.setAttribute('normal', new THREE.BufferAttribute(normalArr, 3));
  nonIndexed.computeBoundingBox();
  nonIndexed.computeBoundingSphere();
  return nonIndexed;
}

/**
 * Bakes a Team Fortress 2 / Borderlands vertical value & ground-AO gradient into vertex colors.
 * Anchors props/characters visually (darker near feet/ground, crisper near focal top)
 * and subtly darkens downward-facing normals for directional bounce feel.
 */
export function bakeVerticalGradientAO(
  geo: THREE.BufferGeometry,
  bottomShade = 0.68,
  topShade = 1.06,
  yMinOverride?: number,
  yMaxOverride?: number,
  tintHex = 0xffffff,
): THREE.BufferGeometry {
  geo.computeBoundingBox();
  const box = geo.boundingBox!;
  const yMin = yMinOverride ?? box.min.y;
  const yMax = yMaxOverride ?? box.max.y;
  const span = Math.max(1e-4, yMax - yMin);

  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const norm = geo.getAttribute('normal') as THREE.BufferAttribute | undefined;
  const tint = new THREE.Color(tintHex);
  const colors = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp((pos.getY(i) - yMin) / span, 0, 1);
    let shade = THREE.MathUtils.lerp(bottomShade, topShade, Math.pow(t, 0.85));
    if (norm) {
      const ny = norm.getY(i);
      // Subtle upward hemisphere lift & underside grounding occlusion
      shade *= 0.92 + ny * 0.1;
    }
    shade = THREE.MathUtils.clamp(shade, 0.35, 1.15);
    colors[i * 3] = Math.min(1, tint.r * shade);
    colors[i * 3 + 1] = Math.min(1, tint.g * shade);
    colors[i * 3 + 2] = Math.min(1, tint.b * shade);
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/**
 * Normalizes attributes and merges an array of BufferGeometries into one clean geometry,
 * disposing the temporary input pieces.
 */
export function mergeParts(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (geometries.length === 0) {
    throw new Error('mergeParts called with empty geometry list');
  }
  const hasAnyColor = geometries.some((g) => Boolean(g.getAttribute('color')));
  const normalized: THREE.BufferGeometry[] = [];

  for (const raw of geometries) {
    const g = raw.index ? raw.toNonIndexed() : raw;
    if (!g.getAttribute('normal')) {
      g.computeVertexNormals();
    }
    if (!g.getAttribute('uv')) {
      applyBoxUVs(g, 0.5);
    }
    if (hasAnyColor && !g.getAttribute('color')) {
      const count = g.getAttribute('position').count;
      const white = new Float32Array(count * 3).fill(1);
      g.setAttribute('color', new THREE.BufferAttribute(white, 3));
    }
    // Strip extraneous attributes that might mismatch across parts
    for (const key of Object.keys(g.attributes)) {
      if (key !== 'position' && key !== 'normal' && key !== 'uv' && key !== 'color') {
        g.deleteAttribute(key);
      }
    }
    normalized.push(g);
  }

  const merged = BufferGeometryUtils.mergeGeometries(normalized, false);
  if (!merged) {
    throw new Error('mergeGeometries failed to combine parts');
  }
  for (const g of geometries) {
    g.dispose();
  }
  for (const g of normalized) {
    if (!geometries.includes(g)) g.dispose();
  }
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Centers an asset horizontally on X/Z and grounds its lowest mesh vertex precisely at Y = 0.
 */
export function groundObjectAtZero(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const tempBox = new THREE.Box3();

  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && !obj.userData.isWireOverlay) {
      obj.geometry.computeBoundingBox();
      if (obj.geometry.boundingBox) {
        tempBox.copy(obj.geometry.boundingBox).applyMatrix4(obj.matrixWorld);
        box.union(tempBox);
      }
    }
  });

  if (!box.isEmpty()) {
    const center = new THREE.Vector3();
    box.getCenter(center);
    root.position.x -= center.x;
    root.position.z -= center.z;
    root.position.y -= box.min.y;
    root.updateMatrixWorld(true);
    box.translate(new THREE.Vector3(-center.x, -box.min.y, -center.z));
  }
  return box;
}

export interface ComputedAssetStats {
  triangles: number;
  vertices: number;
  meshes: number;
  materials: number;
  width: number;
  height: number;
  depth: number;
}

/**
 * Pure topology & bounding-box analyzer for a 3D asset root (ignores helper lines/wireframe clones).
 */
export function computeAssetStats(root: THREE.Object3D): ComputedAssetStats {
  root.updateMatrixWorld(true);
  let triangles = 0;
  let vertices = 0;
  let meshes = 0;
  const materialSet = new Set<THREE.Material>();
  const box = new THREE.Box3();
  const tempBox = new THREE.Box3();

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (obj.userData.isWireOverlay) return;

    meshes += 1;
    const geo = obj.geometry;
    const pos = geo.getAttribute('position');
    if (pos) {
      vertices += pos.count;
      if (geo.index) {
        triangles += Math.floor(geo.index.count / 3);
      } else {
        triangles += Math.floor(pos.count / 3);
      }
    }
    if (Array.isArray(obj.material)) {
      for (const m of obj.material) materialSet.add(m);
    } else if (obj.material) {
      materialSet.add(obj.material);
    }

    geo.computeBoundingBox();
    if (geo.boundingBox) {
      tempBox.copy(geo.boundingBox).applyMatrix4(obj.matrixWorld);
      box.union(tempBox);
    }
  });

  const size = new THREE.Vector3();
  if (!box.isEmpty()) {
    box.getSize(size);
  }

  return {
    triangles,
    vertices,
    meshes,
    materials: materialSet.size,
    width: Number(size.x.toFixed(2)),
    height: Number(size.y.toFixed(2)),
    depth: Number(size.z.toFixed(2)),
  };
}
