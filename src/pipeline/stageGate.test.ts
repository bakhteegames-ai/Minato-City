import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createSharedModelAssets, buildSculptedVehicle } from '../game/models';
import {
  buildModularUrbanUpperBlock,
  buildSculptedAwning,
  buildSculptedCobraStreetlamp,
  buildSculptedDeliveryVan,
} from '../game/sculptedArchitecture';
import { buildSculptedEnemyRig, buildSculptedSurvivorRig } from '../game/sculptedCharacters';
import {
  B1_GENERATOR,
  B1_PIT,
  getMoodPostProcessConfig,
  getTerrainHeightAt,
} from '../game/rules';
import type { MinatoTextureBank } from '../game/textures';
import type { EnemyType, SquadRole } from '../game/types';
import { buildVendingMachineAsset } from '../lab/assets/vendingMachine';
import { auditScenePlacements, inspectAssetStrict, type RectXZ } from './stageGateAudit';

function makeStubTextures(): MinatoTextureBank {
  return {
    glowHalo: null,
    contactShadow: null,
    beamFade: null,
    vanSide: null,
  } as unknown as MinatoTextureBank;
}

test('Stage-Gate v2: Sculpted Squad (all 4 roles) pass strict geometry, UV, budget & ground audit', () => {
  const textures = makeStubTextures();
  const assets = createSharedModelAssets(textures);
  const roles: Array<{ role: SquadRole; accent: number; jacket: number; minH: number; maxH: number }> = [
    { role: 'leader', accent: 0xf45b8a, jacket: 0xc4882a, minH: 1.75, maxH: 2.15 },
    { role: 'medic', accent: 0x4ce0e8, jacket: 0xbba88a, minH: 1.72, maxH: 2.12 },
    { role: 'heavy', accent: 0xf5b971, jacket: 0x2a3040, minH: 1.92, maxH: 2.38 },
    { role: 'sniper', accent: 0x9b6eff, jacket: 0x263448, minH: 1.70, maxH: 2.10 },
  ];

  for (const cfg of roles) {
    const built = buildSculptedSurvivorRig(cfg.role, cfg.accent, cfg.jacket, assets, textures);
    const report = inspectAssetStrict(built.proxyGroup, {
      id: `squad_${cfg.role}`,
      minTriangles: 1400,
      maxTriangles: 14000,
      groundToleranceM: 0.015,
      expectedHeightRangeM: [cfg.minH, cfg.maxH],
    });
    assert.equal(
      report.passedStrict,
      true,
      `squad_${cfg.role} failed strict inspect: ${report.issues.join('; ')} (tris=${report.triangles}, minY=${report.minYM}, h=${report.boundsM.size[1]})`,
    );
  }
  assets.dispose();
});

test('Stage-Gate v2: Sculpted Infected (all 5 archetypes) pass strict geometry, UV, budget & ground audit', () => {
  const textures = makeStubTextures();
  const assets = createSharedModelAssets(textures);
  const archetypes: Array<{
    type: EnemyType;
    accent: number;
    armored: boolean;
    ranged: boolean;
    boss: boolean;
    minH: number;
    maxH: number;
  }> = [
    { type: 'walker', accent: 0xe6455a, armored: false, ranged: false, boss: false, minH: 1.55, maxH: 2.05 },
    { type: 'runner', accent: 0xff8040, armored: false, ranged: false, boss: false, minH: 1.45, maxH: 1.98 },
    { type: 'armored', accent: 0x4ce0e8, armored: true, ranged: false, boss: false, minH: 1.85, maxH: 2.45 },
    { type: 'spitter', accent: 0x7cff57, armored: false, ranged: true, boss: false, minH: 1.55, maxH: 2.08 },
    { type: 'tank', accent: 0xff3b52, armored: false, ranged: false, boss: true, minH: 2.85, maxH: 3.95 },
  ];

  for (const cfg of archetypes) {
    const built = buildSculptedEnemyRig(
      cfg.type,
      0x626e5c,
      cfg.accent,
      cfg.armored,
      cfg.ranged,
      cfg.boss,
      assets,
      textures,
    );
    const report = inspectAssetStrict(built.proxyGroup, {
      id: `infected_${cfg.type}`,
      minTriangles: 1200,
      maxTriangles: 14000,
      groundToleranceM: 0.015,
      expectedHeightRangeM: [cfg.minH, cfg.maxH],
    });
    assert.equal(
      report.passedStrict,
      true,
      `infected_${cfg.type} failed strict inspect: ${report.issues.join('; ')} (tris=${report.triangles}, minY=${report.minYM}, h=${report.boundsM.size[1]})`,
    );
  }
  assets.dispose();
});

test('Stage-Gate v2: Sculpted Vehicles (Sedan, Taxi, Coupe, Delivery Van) pass strict audit', () => {
  const textures = makeStubTextures();
  const assets = createSharedModelAssets(textures);

  for (const kind of ['sedan', 'taxi', 'coupe'] as const) {
    const built = buildSculptedVehicle(kind, assets, textures, 0);
    const report = inspectAssetStrict(built.proxyGroup, {
      id: `vehicle_${kind}`,
      minTriangles: 2500,
      maxTriangles: 20000,
      groundToleranceM: 0.012,
      expectedHeightRangeM: [1.35, 1.85],
    });
    assert.equal(
      report.passedStrict,
      true,
      `vehicle_${kind} failed strict inspect: ${report.issues.join('; ')}`,
    );
  }

  const van = buildSculptedDeliveryVan(assets, textures, 0);
  const vanReport = inspectAssetStrict(van.proxyGroup, {
    id: 'vehicle_van',
    minTriangles: 900,
    maxTriangles: 14000,
    groundToleranceM: 0.012,
    expectedHeightRangeM: [2.1, 2.65],
  });
  assert.equal(
    vanReport.passedStrict,
    true,
    `vehicle_van failed strict inspect: ${vanReport.issues.join('; ')}`,
  );
  assets.dispose();
});

test('Stage-Gate v2: Sculpted Architecture, Ribbed Awning, Cobra Streetlamp & Vending Machine pass strict audit', () => {
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x222838 });

  const cafeUpper = buildModularUrbanUpperBlock({
    width: 12.4,
    depth: 11.5,
    baseY: 0,
    floors: 2,
    floorH: 3.0,
    concreteHex: '#948d81',
    facadeHex: '#7d4d42',
    includeBalconies: true,
    includeSideWindows: true,
    includeRoofMech: true,
  });
  const bldgReport = inspectAssetStrict(cafeUpper.group, {
    id: 'arch_modular_upper_2f',
    minTriangles: 1500,
    maxTriangles: 25000,
    groundToleranceM: 0.08,
    expectedHeightRangeM: [6.0, 9.2],
  });
  assert.equal(
    bldgReport.passedStrict,
    true,
    `arch_modular_upper_2f failed: ${bldgReport.issues.join('; ')}`,
  );

  const awning = buildSculptedAwning(10.0, 2.4, '#963434', '#d4c9b4', false, 345);
  const awningReport = inspectAssetStrict(awning.group, {
    id: 'arch_ribbed_awning',
    minTriangles: 200,
    maxTriangles: 6000,
    groundToleranceM: 1.0, // wall-mounted canopy
  });
  assert.equal(
    awningReport.passedStrict,
    true,
    `arch_ribbed_awning failed: ${awningReport.issues.join('; ')}`,
  );

  const lamp = buildSculptedCobraStreetlamp(1, darkMetal);
  const lampReport = inspectAssetStrict(lamp.group, {
    id: 'prop_cobra_streetlamp',
    minTriangles: 400,
    maxTriangles: 6000,
    groundToleranceM: 0.01,
    expectedHeightRangeM: [8.5, 9.5],
  });
  assert.equal(
    lampReport.passedStrict,
    true,
    `prop_cobra_streetlamp failed: ${lampReport.issues.join('; ')}`,
  );
  assert.equal(lamp.lensMat.name, 'emit_lamp');

  const vending = buildVendingMachineAsset({ includeCreaseInk: false });
  const vendReport = inspectAssetStrict(vending.root, {
    id: 'prop_vending_machine',
    minTriangles: 800,
    maxTriangles: 10000,
    groundToleranceM: 0.01,
    expectedHeightRangeM: [1.85, 2.15],
  });
  assert.equal(
    vendReport.passedStrict,
    true,
    `prop_vending_machine failed: ${vendReport.issues.join('; ')}`,
  );
});

test('Stage-Gate v2: Intersection A-3 scene placements have zero prop-building overlaps & exact terrain grounding', () => {
  const buildings: RectXZ[] = [
    { name: 'RecordsShop', x1: -28.0, z1: -9.5, x2: -13.5, z2: 2.0 },
    { name: 'CafeBuilding', x1: -6.8, z1: -9.5, x2: 5.6, z2: 2.0 },
    { name: 'ArcadeNW', x1: -2.0, z1: -26.5, x2: 5.6, z2: -15.8 },
    { name: 'ArcadeEast', x1: 17.2, z1: -26.5, x2: 28.0, z2: -9.5 },
  ];

  const streetProps: RectXZ[] = [
    { name: 'VendingMachine', x1: -26.85, z1: 2.15, x2: -25.45, z2: 3.18 },
    { name: 'PoleWest', x1: -14.0, z1: 2.9, x2: -13.6, z2: 3.3 },
    { name: 'PoleCafe', x1: 5.7, z1: 2.9, x2: 6.1, z2: 3.3 },
    { name: 'PoleEast', x1: 17.1, z1: 2.9, x2: 17.5, z2: 3.3 },
    { name: 'SedanMain', x1: -11.5, z1: 7.4, x2: -6.9, z2: 9.8 },
    { name: 'CoupeMain', x1: 2.3, z1: 10.2, x2: 6.9, z2: 12.6 },
    { name: 'TaxiWest', x1: -24.5, z1: 9.5, x2: -19.9, z2: 11.7 },
    { name: 'DeliveryVan', x1: 12.0, z1: 1.3, x2: 14.4, z2: 6.3 },
  ];

  const grounded = [
    { name: 'SedanMain', x: -9.2, z: 8.6, y: 0 },
    { name: 'DeliveryVan', x: 13.2, z: 3.8, y: 0 },
    { name: 'B1Generator', x: B1_GENERATOR.x, z: B1_GENERATOR.z, y: B1_PIT.depth },
    { name: 'B1ParkedSedan', x: 26.5, z: 7.4, y: B1_PIT.depth },
  ];

  const audit = auditScenePlacements(buildings, streetProps, grounded, getTerrainHeightAt);
  assert.equal(
    audit.passed,
    true,
    `Scene placement audit failed: overlaps=[${audit.overlaps.join(', ')}] grounding=[${audit.groundingErrors.join(', ')}]`,
  );
});

test('Stage-Gate v2: Dual-Lighting contract (Neutral Daylight has zero bloom, Night stays restrained)', () => {
  const day = getMoodPostProcessConfig('day');
  const night = getMoodPostProcessConfig('night');

  assert.equal(day.bloomStrength, 0, 'Neutral daylight must have zero bloom');
  assert.ok(night.bloomStrength <= 0.2, `Night bloom ${night.bloomStrength} too high for restrained noir`);
  assert.ok(night.bloomThreshold >= 1.35, `Night bloom threshold ${night.bloomThreshold} must keep facades unbloomed`);
});

test('Stage-Gate v2 Negative Regressions: floating asset, NaN vertex, and overlapping prop are caught', () => {
  // 1. Floating asset (minY = +0.05m > 0.008m tolerance) must fail strict inspect
  const floating = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  box.position.y = 0.55; // minY = 0.05m
  floating.add(box);
  const floatReport = inspectAssetStrict(floating, { id: 'bad_float', maxTriangles: 100 });
  assert.equal(floatReport.passedStrict, false);
  assert.ok(floatReport.issues.some((i) => i.includes('Ground contact')));

  // 2. Non-finite vertex must fail strict inspect
  const badGeo = new THREE.BufferGeometry();
  badGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, Number.NaN, 1, 0, 1, 0, 0], 3));
  badGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 0], 2));
  const nanGroup = new THREE.Group();
  nanGroup.add(new THREE.Mesh(badGeo, new THREE.MeshStandardMaterial()));
  const nanReport = inspectAssetStrict(nanGroup, { id: 'bad_nan', maxTriangles: 100 });
  assert.equal(nanReport.passedStrict, false);
  assert.ok(nanReport.nanVertices > 0);

  // 3. Prop overlapping building must fail placement audit
  const badPlacement = auditScenePlacements(
    [{ name: 'Cafe', x1: -6.8, z1: -9.5, x2: 5.6, z2: 2.0 }],
    [{ name: 'ClippedVending', x1: -2.0, z1: 1.5, x2: -1.0, z2: 2.5 }],
    [{ name: 'FloatingProp', x: 0, z: 10, y: 0.35 }],
    getTerrainHeightAt,
  );
  assert.equal(badPlacement.passed, false);
  assert.equal(badPlacement.overlaps.length, 1);
  assert.equal(badPlacement.groundingErrors.length, 1);
});
