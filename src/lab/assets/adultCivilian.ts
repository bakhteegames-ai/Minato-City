import * as THREE from 'three';
import {
  bakeVerticalGradientAO,
  computeAssetStats,
  createChamferedPrism,
  createLoftedGeometry,
  groundObjectAtZero,
  makeAnatomicalTorsoProfile,
  makeFacetedOvalProfile,
  makeLimbProfile,
  makeSkullProfile,
  mergeParts,
  type LoftSection,
  type ProfilePoint,
} from '../meshKernel';
import {
  createPaintedMetalMaterial,
  createRubberMaterial,
  createStylizedClothMaterial,
  createStylizedMesh,
  createStylizedSkinMaterial,
} from '../stylizedTextures';
import { ASSET_CATALOG, type BuiltLabAsset } from './types';

/**
 * Builds a sculpted DRG/TF2 adult work boot (thick beveled lugged sole, chamfered toe box,
 * sloped vamp, heel counter, ankle collar) centered at heel-midfoot Y=0.
 */
function createSculptedBoot(sideSign: 1 | -1): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Foot loft profile from sole (Y=0) up to ankle collar (Y=0.145)
  const makeBootSlice = (
    halfW: number,
    frontZ: number,
    backZ: number,
    toePinch = 0.62,
  ): ProfilePoint[] => [
    [0, frontZ],
    [halfW * toePinch, frontZ * 0.84],
    [halfW, frontZ * 0.2],
    [halfW * 0.88, -backZ * 0.65],
    [halfW * 0.55, -backZ],
    [-halfW * 0.55, -backZ],
    [-halfW * 0.88, -backZ * 0.65],
    [-halfW, frontZ * 0.2],
    [-halfW * toePinch, frontZ * 0.84],
  ];

  const bootLoft = createLoftedGeometry(
    [
      { profile: makeBootSlice(0.056, 0.165, 0.088, 0.65), pos: [0, 0.0, 0] },
      { profile: makeBootSlice(0.062, 0.175, 0.094, 0.68), pos: [0, 0.026, 0] },
      { profile: makeBootSlice(0.058, 0.168, 0.086, 0.64), pos: [0, 0.054, 0] },
      { profile: makeBootSlice(0.052, 0.122, 0.082, 0.72), pos: [0, 0.088, -0.012] },
      { profile: makeBootSlice(0.048, 0.068, 0.072, 0.84), pos: [0, 0.125, -0.022] },
      { profile: makeBootSlice(0.051, 0.062, 0.066, 0.86), pos: [0, 0.155, -0.024] },
    ],
    { capStart: true, capEnd: true, creaseAngleDeg: 36, uvTileScale: 2.2 },
  );
  parts.push(bootLoft);

  // Subtle boot tongue ridge
  const tongue = createChamferedPrism(0.056, 0.072, 0.028, 0.008);
  tongue.rotateX(-0.34);
  tongue.translate(0, 0.125, 0.042);
  parts.push(tongue);

  const merged = mergeParts(parts);
  if (sideSign < 0) {
    // Slight natural anatomical arch asymmetry via gentle inward/outward yaw handled on placement
  }
  return merged;
}

/**
 * Builds a sculpted faceted adult hand (palm wedge, angled opposable thumb, tapered curled fingers).
 */
function createSculptedHand(sideSign: 1 | -1): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Tapered palm wedge loft from wrist (y=0) down to knuckle line (y=-0.085)
  const palm = createLoftedGeometry(
    [
      { profile: makeLimbProfile(0.029, 0.024, 0.84), pos: [0, 0.0, 0] },
      { profile: makeLimbProfile(0.044, 0.021, 0.88), pos: [sideSign * 0.004, -0.042, 0.006] },
      { profile: makeLimbProfile(0.046, 0.018, 0.90), pos: [sideSign * 0.005, -0.084, 0.010] },
    ],
    { capStart: true, capEnd: true, creaseAngleDeg: 38, uvTileScale: 3.0 },
  );
  parts.push(palm);

  // Curled 4-finger sculpted block (tapered faceted mitten-wedge with crisp knuckle plane — TF2/DRG signature)
  const fingers = createLoftedGeometry(
    [
      { profile: makeLimbProfile(0.043, 0.017, 0.90), pos: [sideSign * 0.004, -0.082, 0.010] },
      {
        profile: makeLimbProfile(0.039, 0.015, 0.86),
        pos: [sideSign * 0.001, -0.128, 0.020],
        rot: [-0.32, 0, -sideSign * 0.08],
      },
      {
        profile: makeLimbProfile(0.028, 0.012, 0.82),
        pos: [-sideSign * 0.006, -0.162, 0.036],
        rot: [-0.68, 0, -sideSign * 0.14],
      },
    ],
    { capStart: true, capEnd: true, creaseAngleDeg: 36, uvTileScale: 3.0 },
  );
  parts.push(fingers);

  // Opposable thumb loft angled forward-inward
  const thumb = createLoftedGeometry(
    [
      { profile: makeFacetedOvalProfile(0.017, 0.016, 6), pos: [-sideSign * 0.028, -0.032, 0.014] },
      {
        profile: makeFacetedOvalProfile(0.015, 0.014, 6),
        pos: [-sideSign * 0.042, -0.072, 0.036],
        rot: [0.35, 0, sideSign * 0.25],
      },
      {
        profile: makeFacetedOvalProfile(0.011, 0.010, 6),
        pos: [-sideSign * 0.034, -0.104, 0.056],
        rot: [0.55, 0, -sideSign * 0.1],
      },
    ],
    { capStart: true, capEnd: true, creaseAngleDeg: 38, uvTileScale: 3.0 },
  );
  parts.push(thumb);

  return mergeParts(parts);
}

/**
 * 4. Взрослый персонаж в повседневной одежде (Adult Character in Casual Urban Clothing).
 * Height: ~1.82m (true 7.8-head TF2/DRG adult proportions, grounded contrapposto stance).
 * Sculpted entirely via multi-station lofted BufferGeometry (zero primitive boxes/spheres/cylinders!).
 * Open weathered olive-slate field jacket over charcoal henley, worn denim trousers,
 * sculpted leather boots, adult faceted face/jaw/nose/brow/ears and layered hair planes.
 */
export function buildAdultCivilianAsset(): BuiltLabAsset {
  const meta = ASSET_CATALOG.find((m) => m.id === 'civilian')!;
  const root = new THREE.Group();
  root.name = 'Asset_AdultCivilian';

  // TF2/Borderlands adult color hierarchy (primary jacket, secondary denim, dark boots/shirt, warm skin)
  const jacketMat = createStylizedClothMaterial({
    baseHex: '#4b5a4d',
    lightHex: '#677868',
    darkHex: '#2f3a32',
    roughness: 0.88,
    seed: 401,
  });

  const shirtMat = createStylizedClothMaterial({
    baseHex: '#2c2f36',
    lightHex: '#42464f',
    darkHex: '#191b20',
    roughness: 0.9,
    seed: 402,
  });

  const denimMat = createStylizedClothMaterial({
    baseHex: '#334254',
    lightHex: '#4c6078',
    darkHex: '#1e2835',
    roughness: 0.9,
    seed: 403,
  });

  const leatherMat = createStylizedClothMaterial({
    baseHex: '#4a3326',
    lightHex: '#664938',
    darkHex: '#2b1c14',
    roughness: 0.72,
    seed: 404,
  });

  const rubberSoleMat = createRubberMaterial(405);
  const skinMat = createStylizedSkinMaterial({ infected: false, seed: 406 });

  const hairMat = createStylizedClothMaterial({
    baseHex: '#27201c',
    lightHex: '#3f342e',
    darkHex: '#14100e',
    roughness: 0.84,
    seed: 407,
  });

  const buckleMat = createPaintedMetalMaterial({
    baseHex: '#b3894c',
    lightHex: '#d4ab6a',
    darkHex: '#735428',
    roughness: 0.48,
    metalness: 0.62,
    panelGrid: false,
    seed: 408,
  });

  // ---------------------------------------------------------------------------
  // 1. SCULPTED LEATHER WORK BOOTS (contrapposto planted stance at Y=0)
  // ---------------------------------------------------------------------------
  const bootGeos: THREE.BufferGeometry[] = [];
  const soleGeos: THREE.BufferGeometry[] = [];

  const leftBoot = createSculptedBoot(-1);
  leftBoot.rotateY(-0.14);
  leftBoot.translate(-0.14, 0, 0.045);
  bootGeos.push(leftBoot);

  const rightBoot = createSculptedBoot(1);
  rightBoot.rotateY(0.18);
  rightBoot.translate(0.145, 0, -0.035);
  bootGeos.push(rightBoot);

  // Heavy rubber outsole treads aligned precisely under boot footprint (centered on foot Z)
  const soleL = createSculptedBoot(-1);
  soleL.scale(1.04, 0.22, 1.03);
  soleL.rotateY(-0.14);
  soleL.translate(-0.14, 0, 0.045);
  soleGeos.push(soleL);

  const soleR = createSculptedBoot(1);
  soleR.scale(1.04, 0.22, 1.03);
  soleR.rotateY(0.18);
  soleR.translate(0.145, 0, -0.035);
  soleGeos.push(soleR);

  // Belt strap also uses weathered leather
  const beltLoft = createLoftedGeometry(
    [
      { profile: makeAnatomicalTorsoProfile(0.188, 0.122, 0.118, 0.78, 0.88), pos: [0, 0.96, 0.005] },
      { profile: makeAnatomicalTorsoProfile(0.192, 0.125, 0.120, 0.78, 0.88), pos: [0, 1.008, 0.005] },
    ],
    { capStart: true, capEnd: true, creaseAngleDeg: 38, uvTileScale: 2.0 },
  );
  bootGeos.push(beltLoft);

  const mergedLeather = mergeParts(bootGeos);
  bakeVerticalGradientAO(mergedLeather, 0.64, 1.04, 0, 1.05);
  root.add(createStylizedMesh(mergedLeather, leatherMat, { name: 'boots_and_belt', creaseThresholdDeg: 48 }));

  const mergedSoles = mergeParts(soleGeos);
  bakeVerticalGradientAO(mergedSoles, 0.65, 0.95);
  root.add(createStylizedMesh(mergedSoles, rubberSoleMat, { name: 'boot_soles', creaseThresholdDeg: 0 }));

  // Brass belt buckle
  const buckle = createChamferedPrism(0.068, 0.056, 0.024, 0.007);
  buckle.translate(0, 0.985, 0.13);
  bakeVerticalGradientAO(buckle, 0.82, 1.08);
  root.add(createStylizedMesh(buckle, buckleMat, { name: 'belt_buckle', creaseThresholdDeg: 38 }));

  // ---------------------------------------------------------------------------
  // 2. LOFTED CREASED DENIM TROUSERS & SCULPTED PELVIS
  // ---------------------------------------------------------------------------
  const denimGeos: THREE.BufferGeometry[] = [];

  // Sculpted pelvis/hip block
  const pelvisLoft = createLoftedGeometry(
    [
      { profile: makeAnatomicalTorsoProfile(0.168, 0.108, 0.116, 0.74, 0.86), pos: [0, 0.83, -0.004] },
      { profile: makeAnatomicalTorsoProfile(0.188, 0.118, 0.124, 0.78, 0.88), pos: [0, 0.90, 0.0] },
      { profile: makeAnatomicalTorsoProfile(0.182, 0.116, 0.114, 0.78, 0.88), pos: [0, 0.98, 0.004] },
    ],
    { capStart: true, capEnd: true, creaseAngleDeg: 44, uvTileScale: 1.4 },
  );
  denimGeos.push(pelvisLoft);

  // Left trouser leg (weight-bearing forward leg)
  const leftLegSections: LoftSection[] = [
    { profile: makeLimbProfile(0.066, 0.070, 0.86), pos: [-0.138, 0.125, 0.022], rot: [0, -0.14, 0] },
    { profile: makeLimbProfile(0.072, 0.075, 0.86), pos: [-0.135, 0.22, 0.020], rot: [0, -0.12, 0] },
    { profile: makeLimbProfile(0.077, 0.081, 0.82), pos: [-0.128, 0.36, 0.024], rot: [0.04, -0.1, 0] },
    { profile: makeLimbProfile(0.080, 0.086, 0.80), pos: [-0.122, 0.50, 0.032], rot: [0.05, -0.08, 0] }, // knee crease
    { profile: makeLimbProfile(0.092, 0.096, 0.84), pos: [-0.112, 0.68, 0.016], rot: [-0.03, -0.05, 0] },
    { profile: makeLimbProfile(0.102, 0.106, 0.86), pos: [-0.095, 0.86, 0.004], rot: [0, 0, 0] },
  ];
  denimGeos.push(createLoftedGeometry(leftLegSections, { creaseAngleDeg: 44, uvTileScale: 1.5 }));

  // Right trouser leg (slightly stepped back contrapposto)
  const rightLegSections: LoftSection[] = [
    { profile: makeLimbProfile(0.066, 0.070, 0.86), pos: [0.142, 0.125, -0.058], rot: [0, 0.16, 0] },
    { profile: makeLimbProfile(0.072, 0.075, 0.86), pos: [0.138, 0.22, -0.052], rot: [0, 0.14, 0] },
    { profile: makeLimbProfile(0.077, 0.081, 0.82), pos: [0.128, 0.36, -0.036], rot: [-0.04, 0.12, 0] },
    { profile: makeLimbProfile(0.080, 0.086, 0.80), pos: [0.120, 0.50, -0.016], rot: [-0.04, 0.08, 0] },
    { profile: makeLimbProfile(0.092, 0.096, 0.84), pos: [0.108, 0.68, -0.010], rot: [0.02, 0.05, 0] },
    { profile: makeLimbProfile(0.102, 0.106, 0.86), pos: [0.095, 0.86, -0.004], rot: [0, 0, 0] },
  ];
  denimGeos.push(createLoftedGeometry(rightLegSections, { creaseAngleDeg: 44, uvTileScale: 1.5 }));

  const mergedDenim = mergeParts(denimGeos);
  bakeVerticalGradientAO(mergedDenim, 0.64, 1.04, 0.1, 1.0);
  root.add(createStylizedMesh(mergedDenim, denimMat, { name: 'denim_trousers', creaseThresholdDeg: 52 }));

  // ---------------------------------------------------------------------------
  // 3. INNER CHARCOAL HENLEY TORSO (visible through open field jacket V-front)
  // ---------------------------------------------------------------------------
  const innerTorsoSections: LoftSection[] = [
    { profile: makeAnatomicalTorsoProfile(0.162, 0.106, 0.104, 0.76, 0.86), pos: [0, 0.96, 0.004] },
    { profile: makeAnatomicalTorsoProfile(0.170, 0.114, 0.110, 0.76, 0.84), pos: [0, 1.12, 0.008] },
    { profile: makeAnatomicalTorsoProfile(0.198, 0.128, 0.118, 0.78, 0.80), pos: [0, 1.30, 0.012] },
    { profile: makeAnatomicalTorsoProfile(0.202, 0.116, 0.114, 0.80, 0.84), pos: [0, 1.42, 0.008] },
    { profile: makeFacetedOvalProfile(0.088, 0.080, 12), pos: [0, 1.49, 0.004] },
  ];
  const innerTorsoGeo = createLoftedGeometry(innerTorsoSections, {
    creaseAngleDeg: 46,
    uvTileScale: 1.6,
  });
  bakeVerticalGradientAO(innerTorsoGeo, 0.72, 1.04, 0.94, 1.52);
  root.add(createStylizedMesh(innerTorsoGeo, shirtMat, { name: 'inner_henley', creaseThresholdDeg: 52 }));

  // ---------------------------------------------------------------------------
  // 4. SCULPTED OPEN OLIVE-SLATE FIELD JACKET (natural sloped shoulders + lofted sleeves)
  // ---------------------------------------------------------------------------
  const jacketGeos: THREE.BufferGeometry[] = [];

  const makeOpenJacketShell = (
    halfW: number,
    frontZ: number,
    backZ: number,
    openingHalfW: number,
    thickness = 0.022,
  ): ProfilePoint[] => {
    const iw = halfW - thickness;
    const ib = backZ - thickness;
    return [
      [openingHalfW, frontZ],
      [halfW * 0.78, frontZ * 0.94],
      [halfW, frontZ * 0.12],
      [halfW * 0.90, -backZ * 0.65],
      [halfW * 0.42, -backZ],
      [0, -backZ * 0.90],
      [-halfW * 0.42, -backZ],
      [-halfW * 0.90, -backZ * 0.65],
      [-halfW, frontZ * 0.12],
      [-halfW * 0.78, frontZ * 0.94],
      [-openingHalfW, frontZ],
      [-openingHalfW, frontZ - thickness * 1.15],
      [-iw * 0.84, -ib * 0.45],
      [0, -ib * 0.84],
      [iw * 0.84, -ib * 0.45],
      [openingHalfW, frontZ - thickness * 1.15],
    ];
  };

  const jacketShellSections: LoftSection[] = [
    { profile: makeOpenJacketShell(0.208, 0.140, 0.142, 0.072, 0.022), pos: [0, 0.87, 0.002] },
    { profile: makeOpenJacketShell(0.192, 0.130, 0.132, 0.068, 0.022), pos: [0, 1.04, 0.006] },
    { profile: makeOpenJacketShell(0.214, 0.144, 0.138, 0.064, 0.022), pos: [0, 1.24, 0.010] },
    { profile: makeOpenJacketShell(0.222, 0.136, 0.134, 0.076, 0.022), pos: [0, 1.39, 0.008] },
    { profile: makeOpenJacketShell(0.148, 0.100, 0.108, 0.070, 0.022), pos: [0, 1.48, 0.002] },
  ];
  jacketGeos.push(
    createLoftedGeometry(jacketShellSections, {
      capStart: true,
      capEnd: true,
      creaseAngleDeg: 44,
      uvTileScale: 1.5,
    }),
  );

  // Upturned structured field-jacket collar wrapping back & sides of neck
  const collarSections: LoftSection[] = [
    { profile: makeOpenJacketShell(0.104, 0.086, 0.096, 0.062, 0.018), pos: [0, 1.47, -0.002] },
    { profile: makeOpenJacketShell(0.112, 0.084, 0.104, 0.074, 0.018), pos: [0, 1.535, -0.006] },
  ];
  jacketGeos.push(
    createLoftedGeometry(collarSections, {
      capStart: true,
      capEnd: true,
      creaseAngleDeg: 40,
      uvTileScale: 2.0,
    }),
  );

  // Folded angular lapels + 2 chamfered utility chest pockets + 2 hip flap pockets
  for (const side of [-1, 1] as const) {
    const lapel = createChamferedPrism(0.056, 0.22, 0.024, 0.007, { topTaperX: 1.12 });
    lapel.rotateY(-side * 0.24);
    lapel.rotateZ(side * 0.12);
    lapel.translate(side * 0.088, 1.36, 0.138);
    jacketGeos.push(lapel);

    const chestPocket = createChamferedPrism(0.082, 0.090, 0.024, 0.006);
    chestPocket.rotateY(-side * 0.22);
    chestPocket.translate(side * 0.126, 1.24, 0.134);
    jacketGeos.push(chestPocket);

    const hipPocket = createChamferedPrism(0.098, 0.110, 0.026, 0.007);
    hipPocket.rotateY(-side * 0.36);
    hipPocket.translate(side * 0.158, 1.00, 0.104);
    jacketGeos.push(hipPocket);
  }

  // Sculpted sleeves with smooth natural downward deltoid slope (eliminating boxy shoulders!)
  const leftSleeveSections: LoftSection[] = [
    { profile: makeLimbProfile(0.052, 0.062, 0.84), pos: [-0.188, 1.435, 0.006], rot: [0, 0, 0.56] },
    { profile: makeLimbProfile(0.064, 0.068, 0.84), pos: [-0.228, 1.355, 0.004], rot: [0.05, 0, 0.24] },
    { profile: makeLimbProfile(0.060, 0.063, 0.82), pos: [-0.246, 1.22, -0.004], rot: [0.08, 0, 0.08] },
    { profile: makeLimbProfile(0.056, 0.058, 0.80), pos: [-0.250, 1.10, -0.008], rot: [-0.22, 0, -0.04] },
    { profile: makeLimbProfile(0.052, 0.054, 0.82), pos: [-0.244, 0.99, 0.028], rot: [-0.30, 0, -0.06] },
    { profile: makeLimbProfile(0.045, 0.048, 0.86), pos: [-0.234, 0.91, 0.060], rot: [-0.30, 0, -0.06] },
  ];
  jacketGeos.push(createLoftedGeometry(leftSleeveSections, { creaseAngleDeg: 46, uvTileScale: 1.7 }));

  const rightSleeveSections: LoftSection[] = [
    { profile: makeLimbProfile(0.052, 0.062, 0.84), pos: [0.188, 1.435, 0.006], rot: [0, 0, -0.56] },
    { profile: makeLimbProfile(0.064, 0.068, 0.84), pos: [0.228, 1.355, 0.008], rot: [-0.04, 0, -0.24] },
    { profile: makeLimbProfile(0.060, 0.063, 0.82), pos: [0.246, 1.22, 0.004], rot: [-0.10, 0, -0.10] },
    { profile: makeLimbProfile(0.056, 0.058, 0.80), pos: [0.250, 1.10, 0.006], rot: [-0.46, 0, 0.08] },
    { profile: makeLimbProfile(0.052, 0.054, 0.82), pos: [0.236, 1.00, 0.058], rot: [-0.52, 0, 0.12] },
    { profile: makeLimbProfile(0.045, 0.048, 0.86), pos: [0.218, 0.93, 0.104], rot: [-0.52, 0, 0.12] },
  ];
  jacketGeos.push(createLoftedGeometry(rightSleeveSections, { creaseAngleDeg: 46, uvTileScale: 1.7 }));

  const mergedJacket = mergeParts(jacketGeos);
  bakeVerticalGradientAO(mergedJacket, 0.72, 1.06, 0.85, 1.56);
  root.add(createStylizedMesh(mergedJacket, jacketMat, { name: 'field_jacket', creaseThresholdDeg: 50 }));

  // ---------------------------------------------------------------------------
  // 5. SCULPTED SKIN MASSES: NECK, ANGULAR ADULT HEAD (JAW/CHEEKS/NOSE/EARS) & HANDS
  // ---------------------------------------------------------------------------
  const skinGeos: THREE.BufferGeometry[] = [];

  // Tapered sternocleidomastoid neck loft
  const neckLoft = createLoftedGeometry(
    [
      { profile: makeFacetedOvalProfile(0.062, 0.062, 10), pos: [0, 1.46, 0.004] },
      { profile: makeFacetedOvalProfile(0.055, 0.057, 10), pos: [0, 1.535, 0.010] },
      { profile: makeFacetedOvalProfile(0.053, 0.055, 10), pos: [0, 1.59, 0.014] },
    ],
    { capStart: true, capEnd: true, creaseAngleDeg: 54, uvTileScale: 2.2 },
  );
  skinGeos.push(neckLoft);

  // Balanced TF2/DRG adult head (22cm tall, fuller cheekbones & cranium, crisp sculptural jaw)
  const headSections: LoftSection[] = [
    { profile: makeSkullProfile(0.038, 0.086, 0.026, 0.80, 1.02), pos: [0, 1.592, 0.026] },
    { profile: makeSkullProfile(0.068, 0.096, 0.072, 0.88, 1.00), pos: [0, 1.622, 0.020] },
    { profile: makeSkullProfile(0.078, 0.102, 0.094, 0.86, 1.00), pos: [0, 1.656, 0.016] },
    { profile: makeSkullProfile(0.088, 0.104, 0.106, 0.92, 1.00), pos: [0, 1.690, 0.015] },
    { profile: makeSkullProfile(0.085, 0.098, 0.112, 0.88, 0.97), pos: [0, 1.718, 0.014] },
    { profile: makeSkullProfile(0.089, 0.106, 0.116, 0.90, 1.01), pos: [0, 1.742, 0.014] },
    { profile: makeSkullProfile(0.085, 0.094, 0.114, 0.88, 0.98), pos: [0, 1.780, 0.008] },
    { profile: makeSkullProfile(0.054, 0.060, 0.076, 0.86, 0.96), pos: [0, 1.810, 0.004] },
  ];
  const headGeo = createLoftedGeometry(headSections, {
    capStart: true,
    capEnd: true,
    creaseAngleDeg: 48,
    uvTileScale: 2.2,
  });
  skinGeos.push(headGeo);

  // Subtle sculpted adult nose bridge & tip
  const nose = createLoftedGeometry(
    [
      { profile: makeFacetedOvalProfile(0.012, 0.011, 6), pos: [0, 1.726, 0.112] },
      { profile: makeFacetedOvalProfile(0.015, 0.019, 6), pos: [0, 1.698, 0.124] },
      { profile: makeFacetedOvalProfile(0.017, 0.020, 6), pos: [0, 1.682, 0.126] },
      { profile: makeFacetedOvalProfile(0.013, 0.012, 6), pos: [0, 1.672, 0.114] },
    ],
    { capStart: true, capEnd: true, creaseAngleDeg: 46, uvTileScale: 3.0 },
  );
  skinGeos.push(nose);

  // Sculpted angular ears
  for (const side of [-1, 1] as const) {
    const ear = createChamferedPrism(0.018, 0.052, 0.034, 0.007, { topTaperZ: 0.82 });
    ear.rotateY(side * 0.24);
    ear.rotateZ(-side * 0.12);
    ear.translate(side * 0.091, 1.700, 0.010);
    skinGeos.push(ear);
  }

  // Sculpted adult hands attached cleanly at refined sleeve cuffs
  const leftHand = createSculptedHand(-1);
  leftHand.rotateY(-0.22);
  leftHand.rotateX(-0.24);
  leftHand.translate(-0.232, 0.905, 0.064);
  skinGeos.push(leftHand);

  const rightHand = createSculptedHand(1);
  rightHand.rotateY(0.32);
  rightHand.rotateX(-0.42);
  rightHand.translate(0.214, 0.922, 0.110);
  skinGeos.push(rightHand);

  const mergedSkin = mergeParts(skinGeos);
  bakeVerticalGradientAO(mergedSkin, 0.82, 1.06, 0.72, 1.82);
  // Zero harsh face ink lines — let sculpted facets & TF2 vertex-AO model the face naturally!
  root.add(createStylizedMesh(mergedSkin, skinMat, { name: 'head_and_hands', creaseThresholdDeg: 0 }));

  // ---------------------------------------------------------------------------
  // 6. FACETED LAYERED ADULT HAIR & SUBTLE BROW PLANES
  // ---------------------------------------------------------------------------
  const hairGeos: THREE.BufferGeometry[] = [];

  const hairCapSections: LoftSection[] = [
    { profile: makeSkullProfile(0.086, 0.012, 0.122, 0.88, 0.90), pos: [0, 1.682, -0.016] },
    { profile: makeSkullProfile(0.095, 0.072, 0.128, 0.90, 0.95), pos: [0, 1.744, 0.004] },
    { profile: makeSkullProfile(0.097, 0.106, 0.126, 0.92, 1.02), pos: [0.005, 1.790, 0.008] },
    { profile: makeSkullProfile(0.075, 0.084, 0.098, 0.88, 1.00), pos: [0.008, 1.825, 0.006] },
    { profile: makeSkullProfile(0.038, 0.044, 0.050, 0.85, 0.96), pos: [0.006, 1.842, 0.002] },
  ];
  hairGeos.push(
    createLoftedGeometry(hairCapSections, {
      capStart: true,
      capEnd: true,
      creaseAngleDeg: 44,
      uvTileScale: 2.4,
    }),
  );

  // Swept asymmetric front hair crest
  const hairCrest = createChamferedPrism(0.122, 0.054, 0.145, 0.018, { topTaperX: 0.78 });
  hairCrest.rotateZ(-0.16);
  hairCrest.rotateY(0.14);
  hairCrest.translate(0.020, 1.812, 0.040);
  hairGeos.push(hairCrest);

  // Subtle grounded adult eyebrows
  for (const side of [-1, 1] as const) {
    const brow = createChamferedPrism(0.032, 0.009, 0.012, 0.003);
    brow.rotateZ(-side * 0.08);
    brow.rotateY(-side * 0.22);
    brow.translate(side * 0.030, 1.734, 0.112);
    hairGeos.push(brow);
  }

  const mergedHair = mergeParts(hairGeos);
  bakeVerticalGradientAO(mergedHair, 0.72, 1.06, 1.65, 1.85);
  root.add(createStylizedMesh(mergedHair, hairMat, { name: 'hair_and_brows', creaseThresholdDeg: 48 }));

  groundObjectAtZero(root);
  const stats = computeAssetStats(root);
  return { meta, root, stats };
}
