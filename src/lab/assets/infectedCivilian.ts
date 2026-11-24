import * as THREE from 'three';
import {
  bakeVerticalGradientAO,
  computeAssetStats,
  createChamferedPrism,
  createExtrudedProfile,
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
  createRubberMaterial,
  createStylizedClothMaterial,
  createStylizedMesh,
  createStylizedSkinMaterial,
} from '../stylizedTextures';
import { ASSET_CATALOG, type BuiltLabAsset } from './types';

/**
 * Builds an elongated, skeletal clawed hand with splayed hooked angular fingers.
 */
function createClawedHand(sideSign: 1 | -1): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Gaunt bony palm wedge
  const palm = createLoftedGeometry(
    [
      { profile: makeLimbProfile(0.024, 0.019, 0.80), pos: [0, 0, 0] },
      { profile: makeLimbProfile(0.042, 0.016, 0.86), pos: [0, -0.055, 0.010] },
      { profile: makeLimbProfile(0.046, 0.014, 0.88), pos: [0, -0.092, 0.016] },
    ],
    { capStart: true, capEnd: true, creaseAngleDeg: 34, uvTileScale: 3.2 },
  );
  parts.push(palm);

  // 4 distinct splayed, hooked skeletal fingers (instant silhouette readability!)
  const fingerOffsets = [-0.032, -0.011, 0.011, 0.032];
  const fingerLengths = [0.095, 0.112, 0.106, 0.082];
  fingerOffsets.forEach((fx, i) => {
    const len = fingerLengths[i];
    const splayX = fx * 1.45;
    const finger = createLoftedGeometry(
      [
        { profile: makeFacetedOvalProfile(0.0085, 0.008, 5), pos: [fx, -0.090, 0.016] },
        {
          profile: makeFacetedOvalProfile(0.007, 0.0065, 5),
          pos: [splayX, -0.090 - len * 0.52, 0.048],
          rot: [-0.45, 0, 0],
        },
        {
          profile: makeFacetedOvalProfile(0.0045, 0.0045, 5),
          pos: [splayX * 0.96, -0.090 - len * 0.92, 0.022],
          rot: [-1.15, 0, 0],
        },
      ],
      { capStart: true, capEnd: true, creaseAngleDeg: 32, uvTileScale: 4.0 },
    );
    parts.push(finger);
  });

  // Hooked opposable thumb
  const thumb = createLoftedGeometry(
    [
      { profile: makeFacetedOvalProfile(0.012, 0.011, 5), pos: [-sideSign * 0.030, -0.036, 0.016] },
      { profile: makeFacetedOvalProfile(0.009, 0.0085, 5), pos: [-sideSign * 0.056, -0.082, 0.052] },
      { profile: makeFacetedOvalProfile(0.0055, 0.0055, 5), pos: [-sideSign * 0.044, -0.118, 0.072] },
    ],
    { capStart: true, capEnd: true, creaseAngleDeg: 32, uvTileScale: 4.0 },
  );
  parts.push(thumb);

  return mergeParts(parts);
}

/**
 * Builds a scuffed weathered street shoe for the infected civilian.
 */
function createScuffedShoe(): THREE.BufferGeometry {
  const slice = (hw: number, fz: number, bz: number): ProfilePoint[] => [
    [0, fz],
    [hw * 0.65, fz * 0.82],
    [hw, fz * 0.15],
    [hw * 0.85, -bz * 0.7],
    [hw * 0.5, -bz],
    [-hw * 0.5, -bz],
    [-hw * 0.85, -bz * 0.7],
    [-hw, fz * 0.15],
    [-hw * 0.65, fz * 0.82],
  ];
  return createLoftedGeometry(
    [
      { profile: slice(0.052, 0.155, 0.084), pos: [0, 0.0, 0] },
      { profile: slice(0.056, 0.162, 0.088), pos: [0, 0.024, 0] },
      { profile: slice(0.050, 0.125, 0.080), pos: [0, 0.068, -0.01] },
      { profile: slice(0.044, 0.065, 0.068), pos: [0, 0.105, -0.02] },
    ],
    { capStart: true, capEnd: true, creaseAngleDeg: 34, uvTileScale: 2.2 },
  );
}

/**
 * 5. Заражённый гражданский (Infected Civilian — Hunched Asymmetric Silhouette).
 * Height: ~1.69m hunched (contrasts immediately against the 1.82m upright healthy adult).
 * Built with sculpted multi-station lofted BufferGeometry: forward-canted spine,
 * uneven crooked shoulders, torn jacket with jagged hanging strips, exposed gaunt forearm & ankle,
 * elongated splayed clawed hands, sunken cheekbones, deep eye hollows & gaping jaw.
 */
export function buildInfectedCivilianAsset(): BuiltLabAsset {
  const meta = ASSET_CATALOG.find((m) => m.id === 'infected')!;
  const root = new THREE.Group();
  root.name = 'Asset_InfectedCivilian';

  // Grim desaturated Borderlands/DRG weathered palette (ZERO neon cartoon green!)
  const necroticSkinMat = createStylizedSkinMaterial({ infected: true, seed: 501 });

  const stainedShirtMat = createStylizedClothMaterial({
    baseHex: '#7d7a6e',
    lightHex: '#9a9688',
    darkHex: '#4f4c44',
    stainHex: '#5a2220',
    stainAmount: 1.4,
    roughness: 0.92,
    seed: 502,
  });

  const tornCoatMat = createStylizedClothMaterial({
    baseHex: '#3c4246',
    lightHex: '#545c61',
    darkHex: '#222629',
    stainHex: '#4b231e',
    stainAmount: 0.9,
    roughness: 0.91,
    seed: 503,
  });

  const tornTrouserMat = createStylizedClothMaterial({
    baseHex: '#282a2f',
    lightHex: '#3d4047',
    darkHex: '#15171a',
    stainHex: '#3c2d23',
    stainAmount: 0.8,
    roughness: 0.92,
    seed: 504,
  });

  const shoeMat = createRubberMaterial(505);

  const mattedHairMat = createStylizedClothMaterial({
    baseHex: '#211e1b',
    lightHex: '#36312c',
    darkHex: '#100e0d',
    roughness: 0.9,
    seed: 506,
  });

  const cavityMat = new THREE.MeshStandardMaterial({
    color: 0x1a0c0e,
    roughness: 0.92,
    metalness: 0.0,
  });

  // ---------------------------------------------------------------------------
  // 1. UNEVEN SHAMBLING SHOES & TORN TROUSERS (left cuff ripped exposing gaunt ankle)
  // ---------------------------------------------------------------------------
  const shoeGeos: THREE.BufferGeometry[] = [];
  const leftShoe = createScuffedShoe();
  leftShoe.rotateY(0.24); // inward pigeon-toed shambling foot
  leftShoe.translate(-0.155, 0, 0.075);
  shoeGeos.push(leftShoe);

  const rightShoe = createScuffedShoe();
  rightShoe.rotateY(-0.12);
  rightShoe.translate(0.165, 0, -0.095);
  shoeGeos.push(rightShoe);

  const mergedShoes = mergeParts(shoeGeos);
  bakeVerticalGradientAO(mergedShoes, 0.62, 0.95);
  root.add(createStylizedMesh(mergedShoes, shoeMat, { name: 'scuffed_shoes', creaseThresholdDeg: 36 }));

  const trouserGeos: THREE.BufferGeometry[] = [];
  // Pelvis tilted slightly forward & shifted off-center
  const pelvis = createLoftedGeometry(
    [
      { profile: makeAnatomicalTorsoProfile(0.148, 0.096, 0.104, 0.72, 0.82), pos: [-0.01, 0.78, -0.01] },
      { profile: makeAnatomicalTorsoProfile(0.165, 0.104, 0.112, 0.74, 0.82), pos: [-0.01, 0.86, 0.005], rot: [0.14, 0, -0.06] },
      { profile: makeAnatomicalTorsoProfile(0.154, 0.100, 0.104, 0.74, 0.82), pos: [-0.01, 0.93, 0.022], rot: [0.18, 0, -0.06] },
    ],
    { capStart: true, capEnd: true, creaseAngleDeg: 36, uvTileScale: 1.6 },
  );
  trouserGeos.push(pelvis);

  // Left trouser leg — ripped off jaggedly mid-calf (Y=0.28) exposing gaunt lower shin!
  const leftTrouser: LoftSection[] = [
    { profile: makeLimbProfile(0.064, 0.068, 0.78), pos: [-0.145, 0.27, 0.088], rot: [0.18, 0.15, 0.05] },
    { profile: makeLimbProfile(0.070, 0.076, 0.78), pos: [-0.122, 0.45, 0.102], rot: [0.22, 0.10, 0.04] }, // bent forward knee
    { profile: makeLimbProfile(0.080, 0.086, 0.80), pos: [-0.108, 0.64, 0.044], rot: [-0.12, 0.04, 0] },
    { profile: makeLimbProfile(0.092, 0.096, 0.82), pos: [-0.092, 0.82, 0.002], rot: [0, 0, 0] },
  ];
  trouserGeos.push(createLoftedGeometry(leftTrouser, { creaseAngleDeg: 36, uvTileScale: 1.6 }));

  // Right trouser leg — dragging rear bent leg down to ankle
  const rightTrouser: LoftSection[] = [
    { profile: makeLimbProfile(0.060, 0.064, 0.80), pos: [0.160, 0.10, -0.102], rot: [-0.08, -0.1, 0] },
    { profile: makeLimbProfile(0.064, 0.068, 0.80), pos: [0.148, 0.26, -0.062], rot: [-0.14, -0.08, 0] },
    { profile: makeLimbProfile(0.072, 0.076, 0.78), pos: [0.132, 0.44, -0.006], rot: [0.14, -0.05, 0] }, // bent knee
    { profile: makeLimbProfile(0.082, 0.088, 0.80), pos: [0.112, 0.64, -0.014], rot: [-0.05, 0, 0] },
    { profile: makeLimbProfile(0.092, 0.096, 0.82), pos: [0.088, 0.82, -0.010], rot: [0, 0, 0] },
  ];
  trouserGeos.push(createLoftedGeometry(rightTrouser, { creaseAngleDeg: 36, uvTileScale: 1.6 }));

  const mergedTrousers = mergeParts(trouserGeos);
  bakeVerticalGradientAO(mergedTrousers, 0.60, 1.02, 0.08, 0.96);
  root.add(
    createStylizedMesh(mergedTrousers, tornTrouserMat, {
      name: 'torn_trousers',
      creaseThresholdDeg: 36,
    }),
  );

  // ---------------------------------------------------------------------------
  // 2. HUNCHED GAUNT TORSO IN STAINED TORN WORK SHIRT
  // ---------------------------------------------------------------------------
  const shirtGeos: THREE.BufferGeometry[] = [];
  // Spine curves strongly forward (+Z) and slightly canted sideways (-X tilt at shoulders)
  const hunchedTorsoSections: LoftSection[] = [
    { profile: makeAnatomicalTorsoProfile(0.145, 0.092, 0.096, 0.70, 0.78), pos: [-0.01, 0.90, 0.016], rot: [0.22, 0, -0.06] },
    { profile: makeAnatomicalTorsoProfile(0.138, 0.090, 0.098, 0.68, 0.74), pos: [-0.015, 1.04, 0.054], rot: [0.32, 0.05, -0.08] }, // gaunt pinched waist
    { profile: makeAnatomicalTorsoProfile(0.178, 0.116, 0.128, 0.72, 0.72), pos: [-0.022, 1.20, 0.114], rot: [0.42, 0.08, -0.10] }, // hunched ribcage
    { profile: makeAnatomicalTorsoProfile(0.194, 0.108, 0.134, 0.74, 0.72), pos: [-0.018, 1.33, 0.168], rot: [0.48, 0.10, -0.14] }, // hunched scapulae
    { profile: makeFacetedOvalProfile(0.082, 0.076, 12), pos: [-0.012, 1.40, 0.212], rot: [0.45, 0.10, -0.12] },
  ];
  shirtGeos.push(
    createLoftedGeometry(hunchedTorsoSections, {
      capStart: true,
      capEnd: true,
      creaseAngleDeg: 34,
      uvTileScale: 1.7,
    }),
  );

  // Ragged loosened collar/necktie strip hanging from forward-tilted chest
  const tiePts: ProfilePoint[] = [
    [-0.018, 0.0],
    [0.018, 0.0],
    [0.032, -0.19],
    [0.008, -0.26],
    [-0.024, -0.21],
  ];
  const tieStrip = createExtrudedProfile(tiePts, 0.012, 0.003, 0.003, { creaseAngleDeg: 34 });
  tieStrip.rotateX(0.32);
  tieStrip.rotateZ(0.16);
  tieStrip.translate(0.01, 1.32, 0.265);
  shirtGeos.push(tieStrip);

  const mergedShirt = mergeParts(shirtGeos);
  bakeVerticalGradientAO(mergedShirt, 0.68, 1.04, 0.85, 1.45);
  root.add(createStylizedMesh(mergedShirt, stainedShirtMat, { name: 'stained_shirt', creaseThresholdDeg: 35 }));

  // ---------------------------------------------------------------------------
  // 3. TORN ASYMMETRIC JACKET SHELL, JAGGED HANGING HEM STRIPS & TORN SLEEVES
  // ---------------------------------------------------------------------------
  const coatGeos: THREE.BufferGeometry[] = [];

  // Open tattered back/shoulder coat shell (asymmetric — shredded higher on right side!)
  const makeTornCoatProfile = (
    hw: number,
    fz: number,
    bz: number,
    rightOpen: number,
    leftOpen: number,
  ): ProfilePoint[] => {
    const t = 0.018;
    return [
      [rightOpen, fz],
      [hw * 0.82, fz * 0.80],
      [hw, fz * 0.05],
      [hw * 0.88, -bz * 0.68],
      [hw * 0.40, -bz],
      [0, -bz * 0.88],
      [-hw * 0.40, -bz],
      [-hw * 0.88, -bz * 0.68],
      [-hw, fz * 0.05],
      [-hw * 0.82, fz * 0.80],
      [-leftOpen, fz],
      [-leftOpen, fz - t],
      [-(hw - t) * 0.84, -(bz - t) * 0.5],
      [0, -(bz - t) * 0.82],
      [(hw - t) * 0.84, -(bz - t) * 0.5],
      [rightOpen, fz - t],
    ];
  };

  const coatSections: LoftSection[] = [
    { profile: makeTornCoatProfile(0.184, 0.118, 0.130, 0.115, 0.075), pos: [-0.014, 0.92, 0.022], rot: [0.22, 0, -0.06] },
    { profile: makeTornCoatProfile(0.172, 0.114, 0.130, 0.105, 0.068), pos: [-0.018, 1.07, 0.068], rot: [0.34, 0.06, -0.08] },
    { profile: makeTornCoatProfile(0.205, 0.132, 0.148, 0.095, 0.064), pos: [-0.022, 1.23, 0.126], rot: [0.44, 0.08, -0.11] },
    { profile: makeTornCoatProfile(0.214, 0.124, 0.152, 0.105, 0.082), pos: [-0.018, 1.35, 0.178], rot: [0.48, 0.10, -0.15] },
  ];
  coatGeos.push(
    createLoftedGeometry(coatSections, {
      capStart: true,
      capEnd: true,
      creaseAngleDeg: 34,
      uvTileScale: 1.6,
    }),
  );

  // Jagged torn hanging coat hem strips around hips (distinct ragged infected silhouette!)
  const ragShapes: { pts: ProfilePoint[]; pos: [number, number, number]; rot: [number, number, number] }[] = [
    {
      pts: [[-0.06, 0], [0.06, 0], [0.05, -0.22], [0.01, -0.15], [-0.04, -0.27], [-0.07, -0.14]],
      pos: [-0.15, 0.93, 0.04],
      rot: [0.12, -0.75, -0.08],
    },
    {
      pts: [[-0.07, 0], [0.07, 0], [0.06, -0.18], [0.02, -0.29], [-0.03, -0.19], [-0.08, -0.24]],
      pos: [0.02, 0.91, -0.10],
      rot: [-0.18, 0.15, 0.05],
    },
    {
      pts: [[-0.05, 0], [0.05, 0], [0.04, -0.16], [-0.01, -0.21], [-0.06, -0.12]],
      pos: [0.14, 0.93, 0.02],
      rot: [0.14, 0.85, 0.12],
    },
  ];
  for (const rag of ragShapes) {
    const g = createExtrudedProfile(rag.pts, 0.016, 0.004, 0.004, { creaseAngleDeg: 32 });
    g.rotateX(rag.rot[0]);
    g.rotateY(rag.rot[1]);
    g.rotateZ(rag.rot[2]);
    g.translate(rag.pos[0], rag.pos[1], rag.pos[2]);
    coatGeos.push(g);
  }

  // Left sleeve (dropped crooked shoulder, ragged long sleeve down to mid-forearm)
  const leftSleeve: LoftSection[] = [
    { profile: makeLimbProfile(0.064, 0.066, 0.80), pos: [-0.215, 1.31, 0.155], rot: [0.32, 0, 0.28] },
    { profile: makeLimbProfile(0.058, 0.060, 0.80), pos: [-0.258, 1.18, 0.196], rot: [0.22, 0, 0.14] },
    { profile: makeLimbProfile(0.052, 0.054, 0.78), pos: [-0.270, 1.05, 0.216], rot: [-0.42, 0, -0.05] }, // crooked elbow
    { profile: makeLimbProfile(0.046, 0.048, 0.78), pos: [-0.252, 0.94, 0.295], rot: [-0.55, 0, -0.08] },
  ];
  coatGeos.push(createLoftedGeometry(leftSleeve, { creaseAngleDeg: 34, uvTileScale: 1.8 }));

  // Right sleeve — torn off raggedly just below the raised bicep!
  const rightSleeve: LoftSection[] = [
    { profile: makeLimbProfile(0.066, 0.068, 0.80), pos: [0.185, 1.37, 0.182], rot: [-0.45, 0, -0.35] },
    { profile: makeLimbProfile(0.058, 0.060, 0.80), pos: [0.242, 1.28, 0.286], rot: [-0.58, 0, -0.18] },
    { profile: makeLimbProfile(0.054, 0.056, 0.76), pos: [0.258, 1.21, 0.365], rot: [-0.62, 0, -0.14] }, // torn ragged edge
  ];
  coatGeos.push(createLoftedGeometry(rightSleeve, { creaseAngleDeg: 34, uvTileScale: 1.8 }));

  const mergedCoat = mergeParts(coatGeos);
  bakeVerticalGradientAO(mergedCoat, 0.64, 1.04, 0.7, 1.44);
  root.add(createStylizedMesh(mergedCoat, tornCoatMat, { name: 'torn_coat', creaseThresholdDeg: 50 }));

  // ---------------------------------------------------------------------------
  // 4. NECROTIC GAUNT SKIN: EXPOSED ANKLE, EXPOSED FOREARMS, CLAWED HANDS, JUTTED NECK & EMACIATED HEAD
  // ---------------------------------------------------------------------------
  const skinGeos: THREE.BufferGeometry[] = [];

  // Exposed gaunt left lower shin & ankle between ripped trouser cuff and shoe
  const exposedAnkle: LoftSection[] = [
    { profile: makeLimbProfile(0.036, 0.040, 0.76), pos: [-0.154, 0.095, 0.062], rot: [0.1, 0.2, 0] },
    { profile: makeLimbProfile(0.042, 0.048, 0.76), pos: [-0.148, 0.21, 0.080], rot: [0.16, 0.16, 0] },
    { profile: makeLimbProfile(0.048, 0.054, 0.78), pos: [-0.144, 0.29, 0.090], rot: [0.18, 0.15, 0] },
  ];
  skinGeos.push(createLoftedGeometry(exposedAnkle, { creaseAngleDeg: 44, uvTileScale: 2.4 }));

  // Left exposed thin wrist & reaching low claw
  const leftWrist: LoftSection[] = [
    { profile: makeLimbProfile(0.034, 0.036, 0.78), pos: [-0.254, 0.95, 0.285], rot: [-0.55, 0, -0.08] },
    { profile: makeLimbProfile(0.027, 0.029, 0.78), pos: [-0.236, 0.86, 0.365], rot: [-0.62, 0, -0.10] },
  ];
  skinGeos.push(createLoftedGeometry(leftWrist, { creaseAngleDeg: 44, uvTileScale: 2.6 }));

  const leftClaw = createClawedHand(-1);
  leftClaw.rotateX(-0.72);
  leftClaw.rotateY(-0.18);
  leftClaw.translate(-0.234, 0.858, 0.368);
  skinGeos.push(leftClaw);

  // Right exposed gaunt elbow + bony forearm reaching forward/upward + splayed claw!
  const rightForearm: LoftSection[] = [
    { profile: makeLimbProfile(0.042, 0.044, 0.74), pos: [0.255, 1.22, 0.352], rot: [-0.62, 0, -0.12] },
    { profile: makeLimbProfile(0.036, 0.038, 0.74), pos: [0.256, 1.18, 0.422], rot: [-1.18, 0.12, 0.08] },
    { profile: makeLimbProfile(0.033, 0.035, 0.76), pos: [0.234, 1.21, 0.525], rot: [-1.32, 0.18, 0.12] },
    { profile: makeLimbProfile(0.026, 0.028, 0.78), pos: [0.205, 1.24, 0.618], rot: [-1.38, 0.22, 0.14] },
  ];
  skinGeos.push(createLoftedGeometry(rightForearm, { creaseAngleDeg: 44, uvTileScale: 2.6 }));

  const rightClaw = createClawedHand(1);
  rightClaw.rotateX(-1.32);
  rightClaw.rotateY(0.22);
  rightClaw.rotateZ(0.28);
  rightClaw.translate(0.204, 1.242, 0.622);
  skinGeos.push(rightClaw);

  // Forward-jutting emaciated corded neck
  const neckLoft = createLoftedGeometry(
    [
      { profile: makeFacetedOvalProfile(0.056, 0.056, 8), pos: [-0.012, 1.38, 0.212], rot: [0.58, 0.08, -0.12] },
      { profile: makeFacetedOvalProfile(0.046, 0.048, 8), pos: [-0.004, 1.44, 0.268], rot: [0.54, 0.10, -0.16] },
      { profile: makeFacetedOvalProfile(0.044, 0.048, 8), pos: [0.008, 1.49, 0.312], rot: [0.40, 0.12, -0.20] },
    ],
    { capStart: true, capEnd: true, creaseAngleDeg: 48, uvTileScale: 2.5 },
  );
  skinGeos.push(neckLoft);

  // Sculpted emaciated angular infected head (gaunt sunken cheeks, deep eye hollows, gaping jaw)
  const craniumSections: LoftSection[] = [
    { profile: makeSkullProfile(0.030, 0.080, 0.024, 0.68, 1.04), pos: [0, -0.118, 0.022] },
    { profile: makeSkullProfile(0.054, 0.090, 0.058, 0.74, 1.02), pos: [0, -0.086, 0.015] },
    { profile: makeSkullProfile(0.064, 0.094, 0.080, 0.70, 1.00), pos: [0, -0.046, 0.010] },
    { profile: makeSkullProfile(0.084, 0.102, 0.098, 0.94, 1.01), pos: [0, -0.010, 0.010] },
    { profile: makeSkullProfile(0.075, 0.088, 0.104, 0.80, 0.94), pos: [0, 0.022, 0.006] },
    { profile: makeSkullProfile(0.082, 0.102, 0.110, 0.88, 1.03), pos: [0, 0.048, 0.008] },
    { profile: makeSkullProfile(0.080, 0.090, 0.108, 0.86, 0.97), pos: [0, 0.088, 0.002] },
    { profile: makeSkullProfile(0.048, 0.054, 0.070, 0.84, 0.95), pos: [0, 0.118, -0.004] },
  ];
  const skullGeo = createLoftedGeometry(craniumSections, {
    capStart: true,
    capEnd: true,
    creaseAngleDeg: 46,
    uvTileScale: 2.5,
  });

  // Sharp angular emaciated nose bridge
  const noseGeo = createLoftedGeometry(
    [
      { profile: makeFacetedOvalProfile(0.011, 0.010, 5), pos: [0, 0.034, 0.102] },
      { profile: makeFacetedOvalProfile(0.013, 0.020, 5), pos: [0, -0.002, 0.118] },
      { profile: makeFacetedOvalProfile(0.011, 0.011, 5), pos: [0, -0.018, 0.102] },
    ],
    { capStart: true, capEnd: true, creaseAngleDeg: 44, uvTileScale: 3.0 },
  );

  // Transform head components into hunched, crooked head pose
  const headMatrix = new THREE.Matrix4();
  headMatrix.compose(
    new THREE.Vector3(0.022, 1.560, 0.344),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0.18, -0.14, -0.24, 'YXZ')),
    new THREE.Vector3(1, 1, 1),
  );
  skullGeo.applyMatrix4(headMatrix);
  noseGeo.applyMatrix4(headMatrix);
  skinGeos.push(skullGeo, noseGeo);

  // Sculpted angular ears on tilted head
  for (const side of [-1, 1] as const) {
    const ear = createChamferedPrism(0.018, 0.050, 0.030, 0.006);
    ear.translate(side * 0.084, 0.006, 0.002);
    ear.applyMatrix4(headMatrix);
    skinGeos.push(ear);
  }

  const mergedSkin = mergeParts(skinGeos);
  bakeVerticalGradientAO(mergedSkin, 0.72, 1.06, 0.08, 1.72);
  // Disable harsh ink fold lines on necrotic face/skin so sculpted cheekbones & sockets read cleanly
  root.add(
    createStylizedMesh(mergedSkin, necroticSkinMat, {
      name: 'necrotic_skin',
      creaseThresholdDeg: 0,
    }),
  );

  // ---------------------------------------------------------------------------
  // 5. DEEP DARK EYE-SOCKET HOLLOWS, GAPING MOUTH CAVITY & DOWNWARD MATTED HAIR LOCKS
  // ---------------------------------------------------------------------------
  const cavityGeos: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1] as const) {
    const socket = createChamferedPrism(0.030, 0.020, 0.018, 0.005);
    socket.translate(side * 0.030, 0.020, 0.088);
    socket.applyMatrix4(headMatrix);
    cavityGeos.push(socket);
  }
  // Gaping dark mouth recess
  const mouthCavity = createChamferedPrism(0.042, 0.034, 0.022, 0.006);
  mouthCavity.translate(0, -0.064, 0.084);
  mouthCavity.applyMatrix4(headMatrix);
  cavityGeos.push(mouthCavity);
  root.add(
    createStylizedMesh(mergeParts(cavityGeos), cavityMat, {
      name: 'sunken_sockets_and_mouth',
      creaseThresholdDeg: 0,
    }),
  );

  // Swept-downward greasy matted hair locks (zero upward "devil horn" spikes!)
  const hairGeos: THREE.BufferGeometry[] = [];
  const hairBase = createLoftedGeometry(
    [
      { profile: makeSkullProfile(0.080, 0.008, 0.114, 0.86, 0.90), pos: [0, -0.012, -0.016] },
      { profile: makeSkullProfile(0.088, 0.060, 0.120, 0.88, 0.95), pos: [0, 0.050, -0.002] },
      { profile: makeSkullProfile(0.086, 0.088, 0.114, 0.88, 0.98), pos: [-0.005, 0.094, 0.002] },
      { profile: makeSkullProfile(0.052, 0.058, 0.072, 0.84, 0.95), pos: [-0.006, 0.124, -0.002] },
    ],
    { capStart: true, capEnd: true, creaseAngleDeg: 44, uvTileScale: 2.5 },
  );
  hairBase.applyMatrix4(headMatrix);
  hairGeos.push(hairBase);

  // Hanging matted strands sweeping naturally across temple hairline & nape
  const locks: { pos: [number, number, number]; rot: [number, number, number]; size: [number, number, number] }[] = [
    { pos: [-0.048, 0.078, 0.072], rot: [0.22, -0.35, 0.52], size: [0.024, 0.076, 0.016] },
    { pos: [0.052, 0.074, 0.064], rot: [0.18, 0.38, -0.46], size: [0.022, 0.072, 0.016] },
    { pos: [-0.082, 0.024, 0.002], rot: [0.06, -0.12, 0.14], size: [0.022, 0.120, 0.046] },
    { pos: [0.078, 0.020, -0.012], rot: [0.04, 0.12, -0.16], size: [0.022, 0.114, 0.044] },
    { pos: [-0.012, 0.010, -0.106], rot: [-0.14, 0.06, 0.08], size: [0.095, 0.115, 0.028] },
  ];
  for (const lk of locks) {
    const strand = createChamferedPrism(lk.size[0], lk.size[1], lk.size[2], 0.006, {
      topTaperX: 1.12,
      topTaperZ: 1.05,
    });
    strand.rotateX(lk.rot[0]);
    strand.rotateY(lk.rot[1]);
    strand.rotateZ(lk.rot[2]);
    strand.translate(lk.pos[0], lk.pos[1], lk.pos[2]);
    strand.applyMatrix4(headMatrix);
    hairGeos.push(strand);
  }

  const mergedHair = mergeParts(hairGeos);
  bakeVerticalGradientAO(mergedHair, 0.66, 1.02, 1.45, 1.74);
  root.add(createStylizedMesh(mergedHair, mattedHairMat, { name: 'matted_hair', creaseThresholdDeg: 48 }));

  groundObjectAtZero(root);
  const stats = computeAssetStats(root);
  return { meta, root, stats };
}
