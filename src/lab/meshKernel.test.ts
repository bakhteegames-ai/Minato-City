import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  bakeVerticalGradientAO,
  computeAssetStats,
  createChamferedPrism,
  createLoftedGeometry,
  makeChamferRectProfile,
  splitCreaseNormals,
} from './meshKernel';
import { buildAllLabAssets, getAssetOrder } from './assets/index';

function assertFiniteGeometry(geo: THREE.BufferGeometry, label: string) {
  const pos = geo.getAttribute('position');
  const norm = geo.getAttribute('normal');
  const uv = geo.getAttribute('uv');
  assert.ok(pos && pos.count >= 3, `${label}: position attribute must have >= 3 vertices`);
  assert.ok(norm && norm.count === pos.count, `${label}: normal attribute must match position count`);
  assert.ok(uv && uv.count === pos.count, `${label}: uv attribute must match position count`);

  for (let i = 0; i < pos.count; i++) {
    assert.ok(
      Number.isFinite(pos.getX(i)) && Number.isFinite(pos.getY(i)) && Number.isFinite(pos.getZ(i)),
      `${label}: non-finite position at vertex ${i}`,
    );
    const nx = norm.getX(i);
    const ny = norm.getY(i);
    const nz = norm.getZ(i);
    const len = Math.hypot(nx, ny, nz);
    assert.ok(Number.isFinite(len) && len > 0.5, `${label}: degenerate normal at vertex ${i}`);
    assert.ok(
      Number.isFinite(uv.getX(i)) && Number.isFinite(uv.getY(i)),
      `${label}: non-finite UV at vertex ${i}`,
    );
  }
}

test('createLoftedGeometry generates valid finite creased geometry with UVs and caps', () => {
  const geo = createLoftedGeometry(
    [
      { profile: makeChamferRectProfile(1.0, 1.0, 0.15), pos: [0, 0, 0] },
      { profile: makeChamferRectProfile(0.7, 0.8, 0.12), pos: [0, 1.2, 0.1] },
      { profile: makeChamferRectProfile(0.4, 0.5, 0.08), pos: [0, 2.0, 0.0] },
    ],
    { capStart: true, capEnd: true, creaseAngleDeg: 35 },
  );
  assertFiniteGeometry(geo, 'lofted_test');
  geo.computeBoundingBox();
  assert.ok(Math.abs(geo.boundingBox!.min.y) < 1e-4, 'min.y should sit at 0');
  assert.ok(Math.abs(geo.boundingBox!.max.y - 2.0) < 1e-4, 'max.y should sit at 2.0');
  geo.dispose();
});

test('createChamferedPrism produces beveled multi-face geometry (not a 12-triangle raw box)', () => {
  const prism = createChamferedPrism(2, 1.5, 1, 0.1);
  assertFiniteGeometry(prism, 'chamfer_prism');
  const triCount = prism.index
    ? prism.index.count / 3
    : prism.getAttribute('position').count / 3;
  assert.ok(triCount >= 40, `Expected chamfered prism >= 40 triangles, got ${triCount}`);
  prism.dispose();
});

test('splitCreaseNormals preserves hard 90-degree edges and bakeVerticalGradientAO creates colors', () => {
  const box = new THREE.BoxGeometry(1, 2, 1);
  const creased = splitCreaseNormals(box, 35);
  bakeVerticalGradientAO(creased, 0.6, 1.05);
  assertFiniteGeometry(creased, 'creased_box');
  const colors = creased.getAttribute('color');
  assert.ok(colors && colors.count === creased.getAttribute('position').count);
  box.dispose();
  creased.dispose();
});

test('All 5 Asset Lab benchmark objects build cleanly, ground at Y=0, have realistic scale and finite geometry', () => {
  const assets = buildAllLabAssets();
  const order = getAssetOrder();
  assert.equal(order.length, 5);

  const expectedHeightRanges: Record<string, [number, number]> = {
    sedan: [1.2, 1.6],
    building: [10.0, 14.5],
    vending: [1.85, 2.15],
    civilian: [1.74, 1.92],
    infected: [1.58, 1.82],
  };

  for (const id of order) {
    const built = assets[id];
    const stats = computeAssetStats(built.root);
    assert.equal(stats.triangles, built.stats.triangles, `${id}: cached stats must match recomputed stats`);
    assert.ok(stats.triangles >= 400, `${id}: expected rich sculpted triangle budget (>=400), got ${stats.triangles}`);
    assert.ok(stats.meshes >= 4, `${id}: expected multi-material sub-meshes (>=4), got ${stats.meshes}`);

    const [minH, maxH] = expectedHeightRanges[id];
    assert.ok(
      stats.height >= minH && stats.height <= maxH,
      `${id}: height ${stats.height}m outside realistic range [${minH}, ${maxH}]`,
    );

    // Verify grounding at Y=0 within 1cm tolerance
    built.root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    const tmp = new THREE.Box3();
    built.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh && !obj.userData.isWireOverlay) {
        assertFiniteGeometry(obj.geometry, `${id}/${obj.name}`);
        obj.geometry.computeBoundingBox();
        if (obj.geometry.boundingBox) {
          tmp.copy(obj.geometry.boundingBox).applyMatrix4(obj.matrixWorld);
          box.union(tmp);
        }
      }
    });
    assert.ok(Math.abs(box.min.y) < 0.015, `${id}: expected grounded min.y ~ 0, got ${box.min.y}`);
  }
});
