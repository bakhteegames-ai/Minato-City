import * as THREE from 'three';
import {
  bakeVerticalGradientAO,
  createChamferedPrism,
  createExtrudedProfile,
  createLoftedGeometry,
  makeAnatomicalTorsoProfile,
  makeFacetedOvalProfile,
  makeLimbProfile,
  makeSkullProfile,
  mergeParts,
  type LoftSection,
  type ProfilePoint,
} from '../lab/meshKernel';
import {
  createPaintedMetalMaterial,
  createRubberMaterial,
  createStylizedClothMaterial,
  createStylizedSkinMaterial,
} from '../lab/stylizedTextures';
import { enableOutlineLayer } from './assetPipeline';
import { addContactShadow, type EnemyVisual, type SharedModelAssets, type SurvivorVisual } from './models';
import type { MinatoTextureBank } from './textures';
import type { EnemyType, SquadRole } from './types';

// Cache procedural cloth/skin/metal materials so spawning waves never re-bakes canvas textures.
const matCache = new Map<string, THREE.MeshStandardMaterial>();
function cachedMat(key: string, factory: () => THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  let m = matCache.get(key);
  if (!m) {
    m = factory();
    matCache.set(key, m);
  }
  return m;
}

/** Builds a sculpted adult combat/work boot centered at ankle X=0, Z=0, sole at Y=0. */
function makeCombatBootGeo(scaleW = 1, scaleL = 1): THREE.BufferGeometry {
  const slice = (hw: number, fz: number, bz: number): ProfilePoint[] => [
    [0, fz * scaleL],
    [hw * 0.66 * scaleW, fz * 0.84 * scaleL],
    [hw * scaleW, fz * 0.18 * scaleL],
    [hw * 0.86 * scaleW, -bz * 0.68 * scaleL],
    [hw * 0.54 * scaleW, -bz * scaleL],
    [-hw * 0.54 * scaleW, -bz * scaleL],
    [-hw * 0.86 * scaleW, -bz * 0.68 * scaleL],
    [-hw * scaleW, fz * 0.18 * scaleL],
    [-hw * 0.66 * scaleW, fz * 0.84 * scaleL],
  ];
  const geo = createLoftedGeometry(
    [
      { profile: slice(0.062, 0.18, 0.092), pos: [0, 0.0, 0] },
      { profile: slice(0.068, 0.19, 0.098), pos: [0, 0.032, 0] },
      { profile: slice(0.060, 0.14, 0.088), pos: [0, 0.082, -0.012] },
      { profile: slice(0.054, 0.072, 0.076), pos: [0, 0.145, -0.022] },
      { profile: slice(0.058, 0.068, 0.072), pos: [0, 0.195, -0.024] },
    ],
    { capStart: true, capEnd: true, creaseAngleDeg: 38, uvTileScale: 2.2 },
  );
  bakeVerticalGradientAO(geo, 0.68, 1.04, 0, 0.22);
  return geo;
}

/** Builds an articulated lofted trouser leg + combat boot pivoted at the hip (local Y = 0 down to -hipY). */
function buildArticulatedLeg(
  hipY: number,
  radiusScale: number,
  pantsMat: THREE.MeshStandardMaterial,
  bootMat: THREE.MeshStandardMaterial,
  kneeMat?: THREE.MeshStandardMaterial,
): THREE.Mesh {
  const s = radiusScale;
  const legSections: LoftSection[] = [
    { profile: makeLimbProfile(0.064 * s, 0.068 * s, 0.86), pos: [0, -hipY + 0.16, -0.014] },
    { profile: makeLimbProfile(0.074 * s, 0.078 * s, 0.84), pos: [0, -hipY + 0.34, -0.008] },
    { profile: makeLimbProfile(0.079 * s, 0.084 * s, 0.82), pos: [0, -hipY + 0.50, 0.012] },
    { profile: makeLimbProfile(0.092 * s, 0.098 * s, 0.84), pos: [0, -hipY + 0.68, 0.004] },
    { profile: makeLimbProfile(0.098 * s, 0.104 * s, 0.86), pos: [0, 0.0, 0.0] },
  ];
  const legGeo = createLoftedGeometry(legSections, {
    capStart: true,
    capEnd: true,
    creaseAngleDeg: 44,
    uvTileScale: 1.6,
  });
  bakeVerticalGradientAO(legGeo, 0.66, 1.04, -hipY, 0.02);
  const legMesh = new THREE.Mesh(legGeo, pantsMat);
  legMesh.castShadow = true;
  legMesh.receiveShadow = true;

  const bootGeo = makeCombatBootGeo(s, Math.max(0.95, s * 0.96));
  const bootMesh = new THREE.Mesh(bootGeo, bootMat);
  bootMesh.position.set(0, -hipY, 0.01);
  bootMesh.castShadow = true;
  bootMesh.receiveShadow = true;
  legMesh.add(bootMesh);

  if (kneeMat) {
    const kneeGeo = createChamferedPrism(0.115 * s, 0.125, 0.075 * s, 0.016);
    bakeVerticalGradientAO(kneeGeo, 0.78, 1.05);
    const knee = new THREE.Mesh(kneeGeo, kneeMat);
    knee.position.set(0, -hipY + 0.49, 0.078 * s);
    knee.castShadow = true;
    legMesh.add(knee);
  }
  return legMesh;
}

/** Builds a sculpted TF2/DRG adult head (jaw, cheekbones, brow, nose, ears) centered around local Y = 0. */
function makeSculptedHeadGeo(gaunt = false, scale = 1): THREE.BufferGeometry {
  const g = gaunt ? 0.86 : 1.0;
  const parts: THREE.BufferGeometry[] = [];
  const sections: LoftSection[] = [
    { profile: makeSkullProfile(0.036 * g, 0.088, 0.026, 0.76, 1.02), pos: [0, -0.116, 0.020] },
    { profile: makeSkullProfile(0.066 * g, 0.098, 0.070, 0.84, 1.00), pos: [0, -0.084, 0.014] },
    { profile: makeSkullProfile(0.078 * g, 0.104, 0.092, 0.84, 1.00), pos: [0, -0.048, 0.010] },
    { profile: makeSkullProfile(0.092 * g, 0.108, 0.108, 0.92, 1.00), pos: [0, -0.010, 0.010] },
    { profile: makeSkullProfile(0.086 * g, 0.100, 0.114, 0.86, 0.97), pos: [0, 0.022, 0.008] },
    { profile: makeSkullProfile(0.092 * g, 0.110, 0.118, 0.90, 1.01), pos: [0, 0.050, 0.008] },
    { profile: makeSkullProfile(0.088 * g, 0.096, 0.116, 0.88, 0.98), pos: [0, 0.090, 0.002] },
    { profile: makeSkullProfile(0.054 * g, 0.062, 0.076, 0.86, 0.96), pos: [0, 0.120, -0.004] },
  ];
  parts.push(createLoftedGeometry(sections, { capStart: true, capEnd: true, creaseAngleDeg: 46, uvTileScale: 2.2 }));

  const nose = createLoftedGeometry(
    [
      { profile: makeFacetedOvalProfile(0.012, 0.011, 6), pos: [0, 0.032, 0.108] },
      { profile: makeFacetedOvalProfile(0.016, 0.022, 6), pos: [0, -0.004, 0.125] },
      { profile: makeFacetedOvalProfile(0.013, 0.012, 6), pos: [0, -0.022, 0.110] },
    ],
    { capStart: true, capEnd: true, creaseAngleDeg: 44, uvTileScale: 3.0 },
  );
  parts.push(nose);

  for (const side of [-1, 1] as const) {
    const ear = createChamferedPrism(0.020, 0.054, 0.034, 0.007, { topTaperZ: 0.82 });
    ear.rotateY(side * 0.24);
    ear.translate(side * 0.092 * g, 0.004, 0.006);
    parts.push(ear);
  }

  const merged = mergeParts(parts);
  if (scale !== 1) merged.scale(scale, scale, scale);
  bakeVerticalGradientAO(merged, 0.80, 1.06, -0.14 * scale, 0.14 * scale);
  return merged;
}

/** Builds a sculpted splayed clawed infected hand centered at wrist Y=0, reaching +Z. */
function makeClawedHandGeo(sideSign: 1 | -1, scale = 1): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const palm = createLoftedGeometry(
    [
      { profile: makeLimbProfile(0.026, 0.022, 0.82), pos: [0, 0, 0] },
      { profile: makeLimbProfile(0.044, 0.018, 0.86), pos: [0, -0.012, 0.058] },
      { profile: makeLimbProfile(0.048, 0.015, 0.88), pos: [0, -0.022, 0.102] },
    ],
    { capStart: true, capEnd: true, creaseAngleDeg: 34, uvTileScale: 3.0 },
  );
  parts.push(palm);

  const offsets = [-0.030, -0.010, 0.010, 0.030];
  offsets.forEach((fx, i) => {
    const len = i === 1 || i === 2 ? 0.105 : 0.088;
    const finger = createLoftedGeometry(
      [
        { profile: makeFacetedOvalProfile(0.009, 0.0085, 5), pos: [fx, -0.020, 0.098] },
        { profile: makeFacetedOvalProfile(0.007, 0.0065, 5), pos: [fx * 1.4, -0.044, 0.098 + len * 0.56] },
        { profile: makeFacetedOvalProfile(0.0045, 0.0045, 5), pos: [fx * 1.3, -0.086, 0.098 + len * 0.84] },
      ],
      { capStart: true, capEnd: true, creaseAngleDeg: 32, uvTileScale: 4.0 },
    );
    parts.push(finger);
  });

  const thumb = createLoftedGeometry(
    [
      { profile: makeFacetedOvalProfile(0.012, 0.011, 5), pos: [-sideSign * 0.032, -0.018, 0.044] },
      { profile: makeFacetedOvalProfile(0.008, 0.008, 5), pos: [-sideSign * 0.056, -0.054, 0.096] },
    ],
    { capStart: true, capEnd: true, creaseAngleDeg: 34, uvTileScale: 4.0 },
  );
  parts.push(thumb);

  const merged = mergeParts(parts);
  if (scale !== 1) merged.scale(scale, scale, scale);
  bakeVerticalGradientAO(merged, 0.72, 1.05);
  return merged;
}

/**
 * GATE 2: Sculpted DRG + TF2 + Borderlands 2 Adult Tactical Squad Archetypes (~1.82m tall).
 * Replaces primitive cylinder/sphere survivor dolls while preserving exact MinatoEngine animation handles.
 */
export function buildSculptedSurvivorRig(
  role: SquadRole,
  accentHex: number,
  jacketHex: number,
  assets: SharedModelAssets,
  textures: MinatoTextureBank,
): SurvivorVisual {
  const group = new THREE.Group();
  group.name = `Squad_${role}`;
  const bodyPivot = new THREE.Group();
  const proxyGroup = new THREE.Group();
  proxyGroup.name = `SquadProxy_${role}`;
  const customSlotMount = new THREE.Group();
  customSlotMount.name = `SquadCustom_${role}`;
  bodyPivot.add(proxyGroup, customSlotMount);
  group.add(bodyPivot);

  const isHeavy = role === 'heavy';
  const isSniper = role === 'sniper';
  const isMedic = role === 'medic';
  const s = isHeavy ? 1.13 : isSniper ? 0.96 : 1.0;

  // Distinct TF2 class color palettes (weathered matte cloth + metal, ZERO plastic!)
  const jacketMat = cachedMat(`sq_jacket_${role}`, () => {
    if (role === 'leader') {
      return createStylizedClothMaterial({
        baseHex: '#b87f2c',
        lightHex: '#d49d46',
        darkHex: '#734d18',
        roughness: 0.86,
        seed: 701,
      });
    }
    if (isMedic) {
      return createStylizedClothMaterial({
        baseHex: '#b7b3a4',
        lightHex: '#d2cec0',
        darkHex: '#7d7a6e',
        roughness: 0.88,
        seed: 702,
      });
    }
    if (isHeavy) {
      return createStylizedClothMaterial({
        baseHex: '#373e4a',
        lightHex: '#505a6b',
        darkHex: '#20242c',
        roughness: 0.84,
        seed: 703,
      });
    }
    const hexStr = '#' + jacketHex.toString(16).padStart(6, '0');
    return createStylizedClothMaterial({
      baseHex: hexStr === '#000000' ? '#2c384a' : '#2e3c4e',
      lightHex: '#465870',
      darkHex: '#1a232e',
      roughness: 0.88,
      seed: 704,
    });
  });

  const vestMat = cachedMat(`sq_vest_${role}`, () =>
    createStylizedClothMaterial({
      baseHex: isHeavy ? '#2c313b' : isMedic ? '#3e544c' : '#3a423b',
      lightHex: isHeavy ? '#434a59' : isMedic ? '#567368' : '#535e54',
      darkHex: '#1c2026',
      roughness: 0.82,
      seed: 710 + role.length,
    }),
  );

  const pantsMat = cachedMat(`sq_pants_${role}`, () =>
    createStylizedClothMaterial({
      baseHex: isMedic ? '#323c4c' : '#262d3b',
      lightHex: '#3e4a60',
      darkHex: '#161a24',
      roughness: 0.9,
      seed: 720 + role.length,
    }),
  );

  const bootMat = cachedMat('sq_boot', () => createRubberMaterial(731));
  const leatherMat = cachedMat('sq_leather', () =>
    createStylizedClothMaterial({
      baseHex: '#4d3728',
      lightHex: '#6b4e3a',
      darkHex: '#2e2017',
      roughness: 0.78,
      seed: 732,
    }),
  );
  const skinMat = cachedMat(`sq_skin_${isHeavy ? 'h' : 'n'}`, () =>
    createStylizedSkinMaterial({ infected: false, seed: isHeavy ? 741 : 742 }),
  );
  const hairMat = cachedMat(`sq_hair_${isMedic ? 'b' : 'd'}`, () =>
    createStylizedClothMaterial({
      baseHex: isMedic ? '#4d3326' : '#1e1b1d',
      lightHex: isMedic ? '#6b4938' : '#363034',
      darkHex: '#100e10',
      roughness: 0.84,
      seed: isMedic ? 745 : 746,
    }),
  );
  const gunSteelMat = cachedMat('sq_gunsteel', () =>
    createPaintedMetalMaterial({
      baseHex: '#2c333f',
      lightHex: '#4b5566',
      darkHex: '#171b22',
      roughness: 0.56,
      metalness: 0.55,
      panelGrid: false,
      seed: 750,
    }),
  );
  const accentMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 0.45,
    roughness: 0.38,
    metalness: 0.22,
  });

  // 1. ARTICULATED LOFTED LEGS & COMBAT BOOTS (hip pivot at Y=0.86m -> soles flush at Y=0.00m!)
  const hipY = 0.86;
  const legSpread = isHeavy ? 0.165 : isSniper ? 0.125 : 0.14;
  const legL = buildArticulatedLeg(hipY, s, pantsMat, bootMat, gunSteelMat);
  legL.position.set(-legSpread, hipY, 0);
  proxyGroup.add(legL);

  const legR = buildArticulatedLeg(hipY, s, pantsMat, bootMat, gunSteelMat);
  legR.position.set(legSpread, hipY, 0);
  proxyGroup.add(legR);

  // 2. SCULPTED PELVIS, UTILITY BELT & POUCHES
  const pelvisParts: THREE.BufferGeometry[] = [];
  pelvisParts.push(
    createLoftedGeometry(
      [
        { profile: makeAnatomicalTorsoProfile(0.165 * s, 0.106 * s, 0.114 * s, 0.76, 0.86), pos: [0, 0.80, 0] },
        { profile: makeAnatomicalTorsoProfile(0.184 * s, 0.116 * s, 0.120 * s, 0.78, 0.88), pos: [0, 0.90, 0] },
        { profile: makeAnatomicalTorsoProfile(0.174 * s, 0.112 * s, 0.112 * s, 0.78, 0.88), pos: [0, 0.97, 0] },
      ],
      { capStart: true, capEnd: true, creaseAngleDeg: 44, uvTileScale: 1.5 },
    ),
  );
  const pelvisGeo = mergeParts(pelvisParts);
  bakeVerticalGradientAO(pelvisGeo, 0.68, 1.04, 0.78, 0.98);
  const pelvisMesh = new THREE.Mesh(pelvisGeo, pantsMat);
  pelvisMesh.castShadow = true;
  pelvisMesh.receiveShadow = true;
  proxyGroup.add(pelvisMesh);

  const gearLeatherParts: THREE.BufferGeometry[] = [];
  gearLeatherParts.push(
    createLoftedGeometry(
      [
        { profile: makeAnatomicalTorsoProfile(0.194 * s, 0.124 * s, 0.126 * s, 0.80, 0.88), pos: [0, 0.91, 0] },
        { profile: makeAnatomicalTorsoProfile(0.196 * s, 0.125 * s, 0.127 * s, 0.80, 0.88), pos: [0, 0.975, 0] },
      ],
      { capStart: true, capEnd: true, creaseAngleDeg: 38, uvTileScale: 2.0 },
    ),
  );
  for (const side of [-1, 1] as const) {
    const pouch = createChamferedPrism(0.092 * s, 0.125, 0.088, 0.015);
    pouch.translate(side * 0.18 * s, 0.94, 0.095 * s);
    gearLeatherParts.push(pouch);
  }
  const holster = createChamferedPrism(0.068 * s, 0.19, 0.10, 0.014);
  holster.rotateZ(-0.08);
  holster.translate(legSpread + 0.082 * s, 0.72, 0.02);
  gearLeatherParts.push(holster);

  const packGeo = createChamferedPrism(0.28 * s, 0.39, 0.15, 0.026);
  packGeo.translate(0, 1.24, -0.215 * s);
  gearLeatherParts.push(packGeo);

  const mergedLeather = mergeParts(gearLeatherParts);
  bakeVerticalGradientAO(mergedLeather, 0.70, 1.05, 0.65, 1.48);
  const leatherMesh = new THREE.Mesh(mergedLeather, leatherMat);
  leatherMesh.castShadow = true;
  leatherMesh.receiveShadow = true;
  proxyGroup.add(leatherMesh);

  // 3. SCULPTED ANATOMICAL V-TAPERED TORSO + LOFTED ARMS IN AIMING STANCE
  const torsoParts: THREE.BufferGeometry[] = [];
  const shoulderW = isHeavy ? 0.255 * s : isSniper ? 0.198 : 0.222;
  const waistW = isHeavy ? 0.185 * s : isSniper ? 0.148 : 0.164;
  torsoParts.push(
    createLoftedGeometry(
      [
        { profile: makeAnatomicalTorsoProfile(waistW, 0.112 * s, 0.112 * s, 0.76, 0.86), pos: [0, 0.94, 0.0] },
        { profile: makeAnatomicalTorsoProfile(waistW * 1.08, 0.122 * s, 0.118 * s, 0.76, 0.84), pos: [0, 1.12, 0.008] },
        { profile: makeAnatomicalTorsoProfile(shoulderW, 0.142 * s, 0.132 * s, 0.80, 0.82), pos: [0, 1.32, 0.010] },
        { profile: makeAnatomicalTorsoProfile(shoulderW * 0.96, 0.124 * s, 0.124 * s, 0.82, 0.84), pos: [0, 1.45, 0.004] },
        { profile: makeFacetedOvalProfile(0.094 * s, 0.088 * s, 12), pos: [0, 1.52, 0.0] },
      ],
      { capStart: true, capEnd: true, creaseAngleDeg: 44, uvTileScale: 1.5 },
    ),
  );

  // Structured upturned jacket collar
  torsoParts.push(
    createLoftedGeometry(
      [
        { profile: makeFacetedOvalProfile(0.104 * s, 0.098 * s, 10), pos: [0, 1.49, -0.006] },
        { profile: makeFacetedOvalProfile(0.112 * s, 0.104 * s, 10), pos: [0, 1.565, -0.010] },
      ],
      { capStart: true, capEnd: true, creaseAngleDeg: 40, uvTileScale: 2.0 },
    ),
  );

  // Sniper asymmetric tactical recon shoulder mantle
  if (isSniper) {
    const mantle = createChamferedPrism(0.46, 0.16, 0.30, 0.032, { topTaperX: 0.72, topTaperZ: 0.82 });
    mantle.rotateZ(0.14);
    mantle.translate(-0.04, 1.44, -0.02);
    torsoParts.push(mantle);
  }

  // Lofted aiming arms (Right trigger arm + Left forward handguard support arm)
  const shoulderX = shoulderW * 0.96;
  const armR = isHeavy ? 0.084 : isSniper ? 0.058 : 0.068;
  const gunX = shoulderX - 0.03;

  const rightArmGeo = createLoftedGeometry(
    [
      { profile: makeLimbProfile(armR * 0.92, armR * 0.98, 0.84), pos: [shoulderX * 0.88, 1.44, 0.0], rot: [0, 0, -0.45] },
      { profile: makeLimbProfile(armR * 1.05, armR * 1.08, 0.84), pos: [shoulderX + 0.04, 1.35, 0.04], rot: [0.32, 0, -0.18] },
      { profile: makeLimbProfile(armR * 0.90, armR * 0.92, 0.82), pos: [shoulderX + 0.02, 1.21, 0.14], rot: [1.18, -0.08, 0] },
      { profile: makeLimbProfile(armR * 0.76, armR * 0.78, 0.84), pos: [gunX + 0.01, 1.18, 0.36], rot: [1.46, -0.10, 0] },
    ],
    { capStart: true, capEnd: true, creaseAngleDeg: 44, uvTileScale: 1.8 },
  );
  const leftArmGeo = createLoftedGeometry(
    [
      { profile: makeLimbProfile(armR * 0.92, armR * 0.98, 0.84), pos: [-shoulderX * 0.88, 1.44, 0.0], rot: [0, 0, 0.45] },
      { profile: makeLimbProfile(armR * 1.05, armR * 1.08, 0.84), pos: [-shoulderX - 0.03, 1.34, 0.06], rot: [0.42, 0, 0.18] },
      { profile: makeLimbProfile(armR * 0.88, armR * 0.90, 0.82), pos: [-shoulderX * 0.76, 1.20, 0.24], rot: [1.34, 0.48, 0] },
      { profile: makeLimbProfile(armR * 0.74, armR * 0.76, 0.84), pos: [gunX - 0.06, 1.18, 0.56], rot: [1.48, 0.58, 0] },
    ],
    { capStart: true, capEnd: true, creaseAngleDeg: 44, uvTileScale: 1.8 },
  );

  // Heavy wears short-sleeved armored vest showing muscular forearms; others wear full jacket sleeves
  if (!isHeavy) {
    torsoParts.push(rightArmGeo, leftArmGeo);
  }
  const mergedTorso = mergeParts(torsoParts);
  bakeVerticalGradientAO(mergedTorso, 0.70, 1.06, 0.90, 1.58);
  const torsoMesh = new THREE.Mesh(mergedTorso, jacketMat);
  torsoMesh.castShadow = true;
  torsoMesh.receiveShadow = true;
  proxyGroup.add(torsoMesh);

  if (isHeavy) {
    const heavyArms = mergeParts([rightArmGeo, leftArmGeo]);
    bakeVerticalGradientAO(heavyArms, 0.76, 1.05);
    const heavyArmMesh = new THREE.Mesh(heavyArms, skinMat);
    heavyArmMesh.castShadow = true;
    proxyGroup.add(heavyArmMesh);
  }

  // 4. CHAMFERED BALLISTIC PLATE CARRIER & HEAVY PAULDRONS
  const vestParts: THREE.BufferGeometry[] = [];
  const frontPlate = createChamferedPrism(shoulderW * 1.38, 0.38, 0.072, 0.018, { topTaperX: 0.84 });
  frontPlate.rotateX(-0.05);
  frontPlate.translate(0, 1.26, 0.135 * s);
  vestParts.push(frontPlate);

  const backPlate = createChamferedPrism(shoulderW * 1.30, 0.36, 0.066, 0.016, { topTaperX: 0.86 });
  backPlate.rotateX(0.05);
  backPlate.translate(0, 1.26, -0.132 * s);
  vestParts.push(backPlate);

  for (const side of [-1, 1] as const) {
    const strap = createChamferedPrism(0.076 * s, 0.072, 0.26 * s, 0.014);
    strap.translate(side * shoulderW * 0.44, 1.47, 0);
    vestParts.push(strap);

    if (isHeavy) {
      const pauldron = createChamferedPrism(0.14, 0.16, 0.22, 0.028, { topTaperX: 0.74 });
      pauldron.rotateZ(-side * 0.32);
      pauldron.translate(side * (shoulderX + 0.03), 1.42, 0.01);
      vestParts.push(pauldron);
    }
  }
  const mergedVest = mergeParts(vestParts);
  bakeVerticalGradientAO(mergedVest, 0.74, 1.06, 1.05, 1.54);
  const vestMesh = new THREE.Mesh(mergedVest, vestMat);
  vestMesh.castShadow = true;
  vestMesh.receiveShadow = true;
  proxyGroup.add(vestMesh);

  // Class distinguishing badges / packs
  if (isHeavy) {
    const brassMat = cachedMat('sq_brass', () =>
      createPaintedMetalMaterial({
        baseHex: '#c89b3c',
        lightHex: '#e6ba5a',
        darkHex: '#82601e',
        roughness: 0.42,
        metalness: 0.72,
        panelGrid: false,
        seed: 755,
      }),
    );
    const bandGeo = bakeVerticalGradientAO(createChamferedPrism(0.088, 0.50, 0.31 * s, 0.014), 0.78, 1.08);
    const band = new THREE.Mesh(bandGeo, brassMat);
    band.position.set(0, 1.26, 0.01);
    band.rotation.z = 0.62;
    proxyGroup.add(band);
  } else if (isMedic) {
    const medCan = new THREE.Mesh(
      createChamferedPrism(0.10, 0.26, 0.10, 0.022),
      new THREE.MeshStandardMaterial({
        color: 0x64d97c,
        emissive: 0x2ea84b,
        emissiveIntensity: 0.75,
        roughness: 0.34,
      }),
    );
    medCan.position.set(0.11, 1.28, -0.30);
    proxyGroup.add(medCan);

    const crossMat = new THREE.MeshBasicMaterial({ color: 0xc82a3d });
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.036, 0.095), crossMat);
    crossH.position.set(-shoulderX - 0.065, 1.33, 0.04);
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.095, 0.036), crossMat);
    crossV.position.set(-shoulderX - 0.065, 1.33, 0.04);
    proxyGroup.add(crossH, crossV);
  } else {
    const patch = new THREE.Mesh(createChamferedPrism(0.068, 0.056, 0.032, 0.008), accentMat);
    patch.position.set(-shoulderW * 0.42, 1.37, 0.172 * s);
    proxyGroup.add(patch);
  }

  // Gloved hands on weapon grip & forend
  const gloveParts = [
    createChamferedPrism(0.072, 0.078, 0.082, 0.016).translate(gunX, 1.17, 0.39),
    createChamferedPrism(0.072, 0.076, 0.084, 0.016).translate(gunX - 0.02, 1.17, 0.60),
  ];
  const glovesGeo = bakeVerticalGradientAO(mergeParts(gloveParts), 0.74, 1.04);
  const glovesMesh = new THREE.Mesh(glovesGeo, bootMat);
  proxyGroup.add(glovesMesh);

  // 5. SCULPTED ADULT NECK, HEAD & CLASS HEADGEAR/HAIR
  const neckGeo = createLoftedGeometry(
    [
      { profile: makeFacetedOvalProfile(0.064 * s, 0.064 * s, 10), pos: [0, 1.49, 0.002] },
      { profile: makeFacetedOvalProfile(0.056 * s, 0.058 * s, 10), pos: [0, 1.60, 0.008] },
    ],
    { capStart: true, capEnd: true, creaseAngleDeg: 52, uvTileScale: 2.2 },
  );
  const headGeo = makeSculptedHeadGeo(false, isHeavy ? 1.05 : 1.0);
  headGeo.translate(0, 1.71, 0.01);
  const skinGeo = bakeVerticalGradientAO(mergeParts([neckGeo, headGeo]), 0.78, 1.06, 1.48, 1.85);
  const skinMesh = new THREE.Mesh(skinGeo, skinMat);
  skinMesh.castShadow = true;
  proxyGroup.add(skinMesh);

  // Subtle adult brow/eye recess shadow bars
  const eyeDark = new THREE.MeshBasicMaterial({ color: 0x161822 });
  for (const ex of [-0.036, 0.036]) {
    const brow = new THREE.Mesh(createChamferedPrism(0.034, 0.016, 0.020, 0.004), eyeDark);
    brow.position.set(ex, 1.728, 0.112);
    proxyGroup.add(brow);
  }

  if (role === 'leader') {
    const capMat = cachedMat('sq_cap_leader', () =>
      createStylizedClothMaterial({ baseHex: '#253147', lightHex: '#394b6b', darkHex: '#151c29', roughness: 0.8, seed: 760 }),
    );
    const capParts = [
      createLoftedGeometry(
        [
          { profile: makeSkullProfile(0.098, 0.112, 0.122, 0.90, 1.0), pos: [0, 1.77, 0.006] },
          { profile: makeSkullProfile(0.092, 0.104, 0.114, 0.90, 1.0), pos: [0, 1.845, 0.004] },
          { profile: makeSkullProfile(0.054, 0.060, 0.068, 0.86, 0.98), pos: [0, 1.875, 0.0] },
        ],
        { capStart: true, capEnd: true, creaseAngleDeg: 40 },
      ),
      createChamferedPrism(0.185, 0.026, 0.135, 0.008, { topTaperX: 0.86 }).rotateX(0.12).translate(0, 1.785, 0.145),
    ];
    proxyGroup.add(new THREE.Mesh(bakeVerticalGradientAO(mergeParts(capParts), 0.78, 1.06), capMat));

    // Angular beard & comms earpiece
    const beardGeo = bakeVerticalGradientAO(
      createChamferedPrism(0.155, 0.088, 0.115, 0.020, { topTaperX: 1.12 }),
      0.76,
      1.04,
    );
    const beard = new THREE.Mesh(beardGeo, hairMat);
    beard.position.set(0, 1.638, 0.062);
    proxyGroup.add(beard);
    const earCom = new THREE.Mesh(createChamferedPrism(0.042, 0.092, 0.078, 0.012), accentMat);
    earCom.position.set(-0.115, 1.72, 0.015);
    proxyGroup.add(earCom);
  } else if (isMedic) {
    const medCapMat = cachedMat('sq_cap_medic', () =>
      createStylizedClothMaterial({ baseHex: '#c8c6bc', lightHex: '#e0ded4', darkHex: '#949288', roughness: 0.82, seed: 761 }),
    );
    const capParts = [
      createLoftedGeometry(
        [
          { profile: makeSkullProfile(0.096, 0.108, 0.120, 0.90, 1.0), pos: [0, 1.77, 0.006] },
          { profile: makeSkullProfile(0.088, 0.100, 0.110, 0.90, 1.0), pos: [0, 1.84, 0.004] },
        ],
        { capStart: true, capEnd: true, creaseAngleDeg: 40 },
      ),
      createChamferedPrism(0.175, 0.024, 0.13, 0.008, { topTaperX: 0.84 }).rotateX(0.10).translate(0, 1.785, 0.142),
    ];
    proxyGroup.add(new THREE.Mesh(bakeVerticalGradientAO(mergeParts(capParts), 0.80, 1.06), medCapMat));

    const hairBack = createChamferedPrism(0.16, 0.15, 0.11, 0.024).translate(0, 1.71, -0.075);
    const pony = createChamferedPrism(0.075, 0.28, 0.075, 0.018, { topTaperX: 0.55, topTaperZ: 0.55 })
      .rotateX(-0.48)
      .translate(0.02, 1.63, -0.18);
    proxyGroup.add(new THREE.Mesh(bakeVerticalGradientAO(mergeParts([hairBack, pony]), 0.74, 1.05), hairMat));
  } else if (isHeavy) {
    const heavyHair = bakeVerticalGradientAO(
      mergeParts([
        createLoftedGeometry(
          [
            { profile: makeSkullProfile(0.096, 0.036, 0.124, 0.88, 0.92), pos: [0, 1.72, -0.014] },
            { profile: makeSkullProfile(0.100, 0.102, 0.126, 0.90, 1.0), pos: [0, 1.815, 0.004] },
            { profile: makeSkullProfile(0.062, 0.068, 0.080, 0.88, 0.98), pos: [0, 1.862, 0.0] },
          ],
          { capStart: true, capEnd: true, creaseAngleDeg: 44 },
        ),
        createChamferedPrism(0.185, 0.125, 0.135, 0.024, { topTaperX: 1.08 }).translate(0, 1.628, 0.065),
      ]),
      0.74,
      1.05,
    );
    proxyGroup.add(new THREE.Mesh(heavyHair, hairMat));
  } else {
    // Sniper: sculpted layered hair crown + swept bangs + flowing multi-tier ponytail + recon visor
    const sniperHair = bakeVerticalGradientAO(
      mergeParts([
        createLoftedGeometry(
          [
            { profile: makeSkullProfile(0.094, 0.028, 0.122, 0.88, 0.92), pos: [0, 1.70, -0.014] },
            { profile: makeSkullProfile(0.100, 0.104, 0.126, 0.90, 1.0), pos: [0, 1.79, 0.006] },
            { profile: makeSkullProfile(0.058, 0.066, 0.076, 0.86, 0.98), pos: [0, 1.845, 0.0] },
          ],
          { capStart: true, capEnd: true, creaseAngleDeg: 44 },
        ),
        createChamferedPrism(0.16, 0.055, 0.11, 0.016, { topTaperX: 0.8 }).rotateZ(-0.14).translate(0.015, 1.805, 0.088),
        createChamferedPrism(0.088, 0.34, 0.085, 0.020, { topTaperX: 0.5, topTaperZ: 0.5 })
          .rotateX(-0.54)
          .translate(0, 1.62, -0.19),
      ]),
      0.74,
      1.05,
    );
    proxyGroup.add(new THREE.Mesh(sniperHair, hairMat));

    const visor = new THREE.Mesh(createChamferedPrism(0.145, 0.042, 0.058, 0.010), accentMat);
    visor.position.set(0, 1.73, 0.105);
    proxyGroup.add(visor);
  }

  // 6. CHAMFERED MULTI-PART TACTICAL FIREARMS (DRG/TF2 chunky silhouette!)
  const wLen = isSniper ? 1.54 : isHeavy ? 1.24 : isMedic ? 0.84 : 1.04;
  const gunSteelParts: THREE.BufferGeometry[] = [];
  const gunTrimParts: THREE.BufferGeometry[] = [];

  gunSteelParts.push(createChamferedPrism(isHeavy ? 0.115 : 0.078, 0.125, wLen * 0.48, 0.015).translate(gunX, 1.19, wLen * 0.30));
  gunTrimParts.push(createChamferedPrism(0.064, 0.115, 0.24, 0.014).translate(gunX, 1.17, 0.08));
  gunTrimParts.push(createChamferedPrism(isHeavy ? 0.12 : 0.072, 0.092, wLen * 0.32, 0.014).translate(gunX, 1.19, wLen * 0.64));

  if (isHeavy) {
    // Pump Combat Shotgun (over-under heavy barrel + tube mag + chunky ribbed pump grip)
    const barrel = new THREE.CylinderGeometry(0.032, 0.032, wLen * 0.60, 8);
    barrel.rotateX(Math.PI / 2);
    barrel.translate(gunX, 1.22, wLen * 0.78);
    const tubeMag = new THREE.CylinderGeometry(0.024, 0.024, wLen * 0.52, 8);
    tubeMag.rotateX(Math.PI / 2);
    tubeMag.translate(gunX, 1.16, wLen * 0.74);
    gunSteelParts.push(barrel, tubeMag);

    const pump = new THREE.Mesh(createChamferedPrism(0.105, 0.092, 0.27, 0.016), accentMat);
    pump.position.set(gunX, 1.15, wLen * 0.66);
    proxyGroup.add(pump);
  } else {
    const barrel = new THREE.CylinderGeometry(0.022, 0.024, wLen * 0.46, 8);
    barrel.rotateX(Math.PI / 2);
    barrel.translate(gunX, 1.20, wLen * 0.84);
    const muzzle = new THREE.CylinderGeometry(0.034, 0.032, 0.10, 8);
    muzzle.rotateX(Math.PI / 2);
    muzzle.translate(gunX, 1.20, wLen * 1.04);
    const mag = createChamferedPrism(0.048, 0.19, 0.088, 0.010).rotateX(0.24).translate(gunX, 1.05, wLen * 0.44);
    gunSteelParts.push(barrel, muzzle, mag);

    if (isSniper) {
      const scope = new THREE.CylinderGeometry(0.034, 0.030, 0.44, 10);
      scope.rotateX(Math.PI / 2);
      scope.translate(gunX, 1.29, wLen * 0.42);
      gunSteelParts.push(scope);
      const lens = new THREE.Mesh(createChamferedPrism(0.044, 0.044, 0.036, 0.008), accentMat);
      lens.position.set(gunX, 1.29, wLen * 0.58);
      proxyGroup.add(lens);
    } else if (role === 'leader') {
      const holo = new THREE.Mesh(createChamferedPrism(0.056, 0.068, 0.11, 0.010), accentMat);
      holo.position.set(gunX, 1.28, wLen * 0.40);
      proxyGroup.add(holo);
    }
  }

  const gunMesh = new THREE.Mesh(bakeVerticalGradientAO(mergeParts(gunSteelParts), 0.78, 1.06), gunSteelMat);
  gunMesh.castShadow = true;
  const gunTrimMesh = new THREE.Mesh(bakeVerticalGradientAO(mergeParts(gunTrimParts), 0.74, 1.04), vestMat);
  gunTrimMesh.castShadow = true;
  proxyGroup.add(gunMesh, gunTrimMesh);

  // 7. MUZZLE FLASH, LASER SIGHT & SELECTION RING
  const muzzleFlash = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: textures.glowHalo,
      color: 0xffe49c,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  muzzleFlash.position.set(gunX, 1.20, wLen * 1.08);
  muzzleFlash.scale.set(1.65, 1.65, 1);
  bodyPivot.add(muzzleFlash);

  const laserGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(gunX, 1.20, wLen * 1.02),
    new THREE.Vector3(gunX, 1.20, 16),
  ]);
  const laser = new THREE.Line(
    laserGeo,
    new THREE.LineBasicMaterial({ color: accentHex, transparent: true, opacity: 0.58 }),
  );
  bodyPivot.add(laser);

  const laserDot = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: textures.glowHalo,
      color: accentHex,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  laserDot.scale.set(0.52, 0.52, 1);
  bodyPivot.add(laserDot);

  if (isHeavy) {
    proxyGroup.scale.set(1.03, 1.07, 1.03);
  }
  enableOutlineLayer(proxyGroup, false);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.60, 0.72, 28),
    new THREE.MeshBasicMaterial({
      color: accentHex,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.045;
  ring.userData.skipOutline = true;
  ring.userData.excludeFromExport = true;
  group.add(ring);
  addContactShadow(group, textures, 1.38 * s, 1.38 * s);

  return {
    group,
    bodyPivot,
    proxyGroup,
    customSlotMount,
    legL,
    legR,
    laser,
    laserDot,
    muzzleFlash,
    ring,
    gunOffX: gunX,
    gunOffZ: wLen * 1.02,
  };
}

/**
 * GATE 2: Sculpted DRG + TF2 + Borderlands 2 Hunched Infected Archetypes.
 * Multi-station lofted anatomy, torn coats, articulated bent arms with splayed claws,
 * angular gaunt skulls with sunken eye sockets, and chamfered riot armor on Enforcers.
 */
export function buildSculptedEnemyRig(
  type: EnemyType,
  _bodyHex: number,
  accentHex: number,
  armored: boolean,
  ranged: boolean,
  boss: boolean,
  _assets: SharedModelAssets,
  textures: MinatoTextureBank,
): EnemyVisual {
  const group = new THREE.Group();
  group.name = `Enemy_${type}`;
  const proxyGroup = new THREE.Group();
  proxyGroup.name = `EnemyProxy_${type}`;
  const customSlotMount = new THREE.Group();
  customSlotMount.name = `EnemyCustom_${type}`;
  group.add(proxyGroup, customSlotMount);

  const s = boss ? 1.76 : armored ? 1.16 : type === 'runner' ? 0.94 : 1.0;

  // Clone skin base material per instance so hit-flash emissive doesn't flash all enemies simultaneously
  const baseSkin = cachedMat(`en_skin_${boss ? 'b' : ranged ? 's' : 'n'}`, () =>
    createStylizedSkinMaterial({ infected: true, seed: boss ? 805 : ranged ? 804 : 801 }),
  );
  const bodyMat = baseSkin.clone();
  if (boss) bodyMat.color.setHex(0x745056);
  else if (ranged) bodyMat.color.setHex(0x64785a);
  else bodyMat.color.setHex(0x8a907e);

  const coatMat = cachedMat(`en_coat_${type}`, () => {
    const palette =
      type === 'runner'
        ? { base: '#6e343a', light: '#8a484e', dark: '#3d1a1e', stain: '#2c1114' }
        : type === 'armored'
          ? { base: '#273040', light: '#3b485e', dark: '#161b26', stain: '#221c1a' }
          : type === 'spitter'
            ? { base: '#465446', light: '#5e705c', dark: '#273028', stain: '#4a5c22' }
            : type === 'tank'
              ? { base: '#4a2830', light: '#663a44', dark: '#291419', stain: '#3b0f18' }
              : { base: '#4b5054', light: '#666c70', dark: '#292c2f', stain: '#4a211d' };
    return createStylizedClothMaterial({
      baseHex: palette.base,
      lightHex: palette.light,
      darkHex: palette.dark,
      stainHex: palette.stain,
      stainAmount: 1.1,
      roughness: 0.92,
      seed: 810 + type.length,
    });
  });

  const pantsMat = cachedMat('en_pants', () =>
    createStylizedClothMaterial({
      baseHex: '#252830',
      lightHex: '#383d48',
      darkHex: '#13151a',
      stainHex: '#38291f',
      stainAmount: 0.7,
      roughness: 0.92,
      seed: 820,
    }),
  );
  const bootMat = cachedMat('en_boot', () => createRubberMaterial(821));

  // 1. ARTICULATED SHAMBLING LOFTED LEGS (hip pivot at Y = 0.80*s, soles flush at Y = 0.00m!)
  const hipY = 0.80 * s;
  const legSpread = 0.145 * s;
  const legL = buildArticulatedLeg(hipY, s * 0.94, pantsMat, bootMat);
  legL.position.set(-legSpread, hipY, 0.01 * s);
  proxyGroup.add(legL);

  const legR = buildArticulatedLeg(hipY, s * 0.94, pantsMat, bootMat);
  legR.position.set(legSpread, hipY, -0.01 * s);
  proxyGroup.add(legR);

  // 2. FORWARD-HUNCHED ANATOMICAL TORSO + RAGGED COAT HEM STRIPS
  const hunchZ = (type === 'runner' ? 0.24 : boss ? 0.20 : 0.16) * s;
  const torsoParts: THREE.BufferGeometry[] = [];
  const torsoW = boss ? 0.26 : armored ? 0.22 : 0.19;

  torsoParts.push(
    createLoftedGeometry(
      [
        { profile: makeAnatomicalTorsoProfile(0.155 * s, 0.10 * s, 0.108 * s, 0.72, 0.82), pos: [0, 0.78 * s, 0] },
        { profile: makeAnatomicalTorsoProfile(0.146 * s, 0.095 * s, 0.104 * s, 0.70, 0.78), pos: [0, 0.96 * s, hunchZ * 0.28], rot: [0.22, 0, -0.05] },
        { profile: makeAnatomicalTorsoProfile(torsoW * s, 0.126 * s, 0.132 * s, 0.74, 0.74), pos: [0, 1.18 * s, hunchZ * 0.68], rot: [0.36, 0, -0.07] },
        { profile: makeAnatomicalTorsoProfile((torsoW + 0.018) * s, 0.118 * s, 0.138 * s, 0.76, 0.74), pos: [0, 1.34 * s, hunchZ], rot: [0.44, 0, -0.09] },
        { profile: makeFacetedOvalProfile(0.082 * s, 0.076 * s, 12), pos: [0, 1.42 * s, hunchZ * 1.15], rot: [0.42, 0, -0.08] },
      ],
      { capStart: true, capEnd: true, creaseAngleDeg: 38, uvTileScale: 1.6 },
    ),
  );

  // Ragged coat hem strips breaking up the silhouette (not on clean armored riot troopers)
  if (!armored) {
    const ragPts: ProfilePoint[] = [
      [-0.065, 0],
      [0.065, 0],
      [0.052, -0.20],
      [0.008, -0.14],
      [-0.042, -0.25],
      [-0.068, -0.12],
    ];
    for (const [rx, rz, ry] of [
      [-0.14 * s, 0.02 * s, -0.7],
      [0.0, -0.10 * s, 0.1],
      [0.14 * s, 0.02 * s, 0.75],
    ]) {
      const rag = createExtrudedProfile(ragPts, 0.016, 0.004, 0.004, { creaseAngleDeg: 34 });
      rag.scale(s, s, s);
      rag.rotateY(ry);
      rag.translate(rx, 0.86 * s, rz);
      torsoParts.push(rag);
    }
  }

  const mergedTorso = mergeParts(torsoParts);
  bakeVerticalGradientAO(mergedTorso, 0.62, 1.04, 0.60 * s, 1.48 * s);
  const torsoMesh = new THREE.Mesh(mergedTorso, coatMat);
  torsoMesh.castShadow = true;
  torsoMesh.receiveShadow = true;
  proxyGroup.add(torsoMesh);

  // 3. ARTICULATED HUNCHED ARMS WITH BENT ELBOWS & SPLAYED CLAWS (pivoted at shoulder!)
  const shoulderY = 1.29 * s;
  const shoulderZ = hunchZ * 0.92;
  const makeReachingArm = (side: -1 | 1, thickScale: number) => {
    const as = s * thickScale;
    const armGeo = createLoftedGeometry(
      [
        { profile: makeLimbProfile(0.064 * as, 0.068 * as, 0.80), pos: [0, 0, 0] },
        { profile: makeLimbProfile(0.052 * as, 0.056 * as, 0.78), pos: [side * 0.05 * as, -0.22 * as, 0.14 * as], rot: [0.65, 0, -side * 0.12] },
        { profile: makeLimbProfile(0.042 * as, 0.044 * as, 0.78), pos: [side * 0.03 * as, -0.26 * as, 0.36 * as], rot: [1.35, -side * 0.18, 0] },
        { profile: makeLimbProfile(0.032 * as, 0.034 * as, 0.80), pos: [-side * 0.01 * as, -0.22 * as, 0.56 * as], rot: [1.55, -side * 0.22, 0] },
      ],
      { capStart: true, capEnd: true, creaseAngleDeg: 40, uvTileScale: 2.0 },
    );
    bakeVerticalGradientAO(armGeo, 0.68, 1.04);
    const armMesh = new THREE.Mesh(armGeo, armored ? coatMat : bodyMat);
    armMesh.castShadow = true;

    const clawGeo = makeClawedHandGeo(side, as * (boss && side === 1 ? 1.25 : 0.96));
    const clawMesh = new THREE.Mesh(clawGeo, bodyMat);
    clawMesh.position.set(-side * 0.01 * as, -0.22 * as, 0.56 * as);
    clawMesh.castShadow = true;
    armMesh.add(clawMesh);
    return armMesh;
  };

  const armL = makeReachingArm(-1, 1.0);
  armL.position.set(-(torsoW + 0.05) * s, shoulderY, shoulderZ);
  proxyGroup.add(armL);

  const armR = makeReachingArm(1, boss ? 1.48 : 1.0);
  armR.position.set((torsoW + 0.05) * s, shoulderY - (boss ? 0.04 * s : 0), shoulderZ);
  proxyGroup.add(armR);

  // 4. SCULPTED GAUNT ANGULAR SKULL, SUNKEN SOCKETS & ARCHETYPE SILHOUETTES
  const headPos = new THREE.Vector3(0, 1.54 * s, hunchZ * 1.45);
  const skullGeo = makeSculptedHeadGeo(true, s * (boss ? 0.94 : 1.0));
  skullGeo.rotateX(0.18);
  skullGeo.rotateZ(-0.14);
  skullGeo.translate(headPos.x, headPos.y, headPos.z);
  const skullMesh = new THREE.Mesh(skullGeo, bodyMat);
  skullMesh.castShadow = true;
  proxyGroup.add(skullMesh);

  // Sunken dark eye-sockets & gaping jaw recess (subtle ember glint, NO cartoon headlight balls)
  const cavityMat = new THREE.MeshStandardMaterial({ color: 0x160a0d, roughness: 0.92 });
  const glintMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 1.2,
    roughness: 0.3,
  });
  for (const side of [-1, 1] as const) {
    const sock = new THREE.Mesh(createChamferedPrism(0.032 * s, 0.022 * s, 0.020 * s, 0.005), cavityMat);
    sock.position.set(headPos.x + side * 0.032 * s, headPos.y + 0.020 * s, headPos.z + 0.092 * s);
    proxyGroup.add(sock);

    const glint = new THREE.Mesh(createChamferedPrism(0.015 * s, 0.010 * s, 0.010 * s, 0.003), glintMat);
    glint.position.set(headPos.x + side * 0.032 * s, headPos.y + 0.020 * s, headPos.z + 0.104 * s);
    proxyGroup.add(glint);
  }
  const jawCavity = new THREE.Mesh(createChamferedPrism(0.044 * s, 0.034 * s, 0.024 * s, 0.006), cavityMat);
  jawCavity.position.set(headPos.x, headPos.y - 0.056 * s, headPos.z + 0.090 * s);
  proxyGroup.add(jawCavity);

  // Archetype-specific tactical silhouette layers
  if (armored && !boss) {
    const armorMat = cachedMat('en_riot_armor', () =>
      createPaintedMetalMaterial({
        baseHex: '#2b3648',
        lightHex: '#465670',
        darkHex: '#171d29',
        wearHex: '#7a8a9e',
        roughness: 0.48,
        metalness: 0.56,
        panelGrid: false,
        seed: 830,
      }),
    );
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x121e30,
      emissive: 0x246b82,
      emissiveIntensity: 0.45,
      roughness: 0.22,
      metalness: 0.72,
    });
    const armorParts = [
      // Chamfered ballistic riot helmet
      createChamferedPrism(0.24 * s, 0.19 * s, 0.26 * s, 0.042 * s, { topTaperX: 0.82, topTaperZ: 0.86 })
        .translate(headPos.x, headPos.y + 0.05 * s, headPos.z - 0.01 * s),
      // Heavy front ballistic breastplate (visual cue for 0.38x frontal deflection!)
      createChamferedPrism(0.46 * s, 0.38 * s, 0.11 * s, 0.026 * s, { topTaperX: 0.86 })
        .rotateX(0.32)
        .translate(0, 1.18 * s, hunchZ * 0.95 + 0.12 * s),
      // Sloped riot shoulder pauldrons
      createChamferedPrism(0.15 * s, 0.18 * s, 0.24 * s, 0.030 * s)
        .rotateZ(0.34)
        .translate(-(torsoW + 0.07) * s, 1.33 * s, shoulderZ),
      createChamferedPrism(0.15 * s, 0.18 * s, 0.24 * s, 0.030 * s)
        .rotateZ(-0.34)
        .translate((torsoW + 0.07) * s, 1.33 * s, shoulderZ),
    ];
    const armorMesh = new THREE.Mesh(bakeVerticalGradientAO(mergeParts(armorParts), 0.74, 1.06), armorMat);
    armorMesh.castShadow = true;
    proxyGroup.add(armorMesh);

    const visor = new THREE.Mesh(createChamferedPrism(0.22 * s, 0.095 * s, 0.08 * s, 0.014 * s), visorMat);
    visor.position.set(headPos.x, headPos.y + 0.01 * s, headPos.z + 0.11 * s);
    proxyGroup.add(visor);
  }

  if (ranged) {
    const bioMat = new THREE.MeshStandardMaterial({
      color: 0x86c454,
      emissive: 0x529c28,
      emissiveIntensity: 0.95,
      roughness: 0.42,
    });
    const sacParts = [
      createChamferedPrism(0.26 * s, 0.28 * s, 0.18 * s, 0.055 * s).translate(0, 1.24 * s, hunchZ * 0.25 - 0.14 * s),
      createChamferedPrism(0.15 * s, 0.16 * s, 0.13 * s, 0.035 * s).translate(-0.15 * s, 1.36 * s, hunchZ * 0.4 - 0.08 * s),
      createChamferedPrism(0.14 * s, 0.15 * s, 0.12 * s, 0.032 * s).translate(0.15 * s, 1.32 * s, hunchZ * 0.4 - 0.10 * s),
    ];
    proxyGroup.add(new THREE.Mesh(mergeParts(sacParts), bioMat));
  }

  if (boss) {
    const ridgeMat = cachedMat('en_boss_ridge', () =>
      createStylizedClothMaterial({ baseHex: '#4f2430', lightHex: '#6e3645', darkHex: '#2b1018', roughness: 0.82, seed: 840 }),
    );
    const fissureMat = new THREE.MeshStandardMaterial({
      color: 0xe64568,
      emissive: 0xc9224a,
      emissiveIntensity: 1.05,
      roughness: 0.36,
    });
    const hump = bakeVerticalGradientAO(
      createChamferedPrism(0.46 * s, 0.34 * s, 0.38 * s, 0.085 * s, { topTaperX: 0.72 })
        .rotateZ(0.22)
        .translate(-0.12 * s, 1.44 * s, hunchZ * 0.3 - 0.06 * s),
      0.72,
      1.05,
    );
    proxyGroup.add(new THREE.Mesh(hump, ridgeMat));

    const fissures = mergeParts([
      createChamferedPrism(0.16 * s, 0.15 * s, 0.15 * s, 0.04 * s).translate(-0.26 * s, 1.48 * s, 0.02 * s),
      createChamferedPrism(0.14 * s, 0.14 * s, 0.14 * s, 0.035 * s).translate(0.22 * s, 1.38 * s, 0.10 * s),
      createChamferedPrism(0.13 * s, 0.13 * s, 0.13 * s, 0.035 * s).translate(-0.08 * s, 1.56 * s, -0.14 * s),
    ]);
    proxyGroup.add(new THREE.Mesh(fissures, fissureMat));
  }

  enableOutlineLayer(proxyGroup, false);

  const hpBg = new THREE.Mesh(
    new THREE.PlaneGeometry(1.06 * s, 0.13),
    new THREE.MeshBasicMaterial({ color: 0x0e1120, side: THREE.DoubleSide }),
  );
  hpBg.position.y = 2.15 * s;
  hpBg.visible = false;
  hpBg.userData.skipOutline = true;
  hpBg.userData.excludeFromExport = true;

  const hpBar = new THREE.Mesh(
    new THREE.PlaneGeometry(1.0 * s, 0.085),
    new THREE.MeshBasicMaterial({ color: armored ? 0x4ce0e8 : 0xff3b52, side: THREE.DoubleSide }),
  );
  hpBar.position.set(0, 2.15 * s, 0.01);
  hpBar.visible = false;
  hpBar.userData.skipOutline = true;
  hpBar.userData.excludeFromExport = true;
  group.add(hpBg, hpBar);

  const telegraphRing = new THREE.Mesh(
    new THREE.RingGeometry(boss ? 3.2 : 1.1, boss ? 3.6 : 1.35, 28),
    new THREE.MeshBasicMaterial({
      color: boss ? 0xff3b52 : 0x7cff57,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    }),
  );
  telegraphRing.rotation.x = -Math.PI / 2;
  telegraphRing.position.y = 0.07;
  telegraphRing.visible = false;
  telegraphRing.userData.skipOutline = true;
  telegraphRing.userData.excludeFromExport = true;
  group.add(telegraphRing);

  addContactShadow(group, textures, 1.35 * s, 1.35 * s);

  return {
    group,
    proxyGroup,
    customSlotMount,
    bodyMat,
    legL,
    legR,
    armL,
    armR,
    hpBg,
    hpBar,
    telegraphRing,
  };
}
