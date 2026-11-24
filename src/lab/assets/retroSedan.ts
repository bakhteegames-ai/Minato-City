import * as THREE from 'three';
import {
  applyBoxUVs,
  bakeVerticalGradientAO,
  computeAssetStats,
  createChamferedPrism,
  createExtrudedProfile,
  createLoftedGeometry,
  groundObjectAtZero,
  mergeParts,
  splitCreaseNormals,
  type LoftSection,
  type ProfilePoint,
} from '../meshKernel';
import {
  createPaintedMetalMaterial,
  createRubberMaterial,
  createStylizedMesh,
} from '../stylizedTextures';
import { ASSET_CATALOG, type BuiltLabAsset } from './types';

/**
 * Generates an angular 10-vertex automobile cross-section in local (X=width, Z=height) plane.
 * Lower sill tuck -> rocker flare -> sharp beltline shoulder crease -> deck/hood crown.
 */
function makeCarHullSection(
  halfBottomW: number,
  halfMidW: number,
  halfShoulderW: number,
  halfTopW: number,
  yBottom: number,
  yMid: number,
  yShoulder: number,
  yTop: number,
  centerCrownLift = 0.025,
): ProfilePoint[] {
  return [
    [0, yTop + centerCrownLift],
    [halfTopW, yTop],
    [halfShoulderW, yShoulder],
    [halfMidW, yMid],
    [halfBottomW, yBottom],
    [0, yBottom - 0.015],
    [-halfBottomW, yBottom],
    [-halfMidW, yMid],
    [-halfShoulderW, yShoulder],
    [-halfTopW, yTop],
  ];
}

/**
 * Builds an angular 1980s Lancia/DeLorean-inspired box-fender arch housing.
 */
function createBoxFenderArch(): THREE.BufferGeometry {
  // Trapezoidal arch profile extruded along wheel width
  const pts: ProfilePoint[] = [
    [-0.46, 0.0],
    [-0.42, 0.25],
    [-0.24, 0.42],
    [0.24, 0.42],
    [0.42, 0.25],
    [0.46, 0.0],
    [0.36, 0.0],
    [0.32, 0.2],
    [0.18, 0.33],
    [-0.18, 0.33],
    [-0.32, 0.2],
    [-0.36, 0.0],
  ];
  const geo = createExtrudedProfile(pts, 0.14, 0.02, 0.02, {
    creaseAngleDeg: 34,
    uvTileScale: 0.7,
  });
  // Orient so arch opens along X (side of car) and spans Z
  geo.rotateY(Math.PI * 0.5);
  return geo;
}

/**
 * Builds a deep-dish faceted tire + 5-spoke angular turbine alloy wheel assembly.
 */
function createWheelAssembly(
  sideSign: 1 | -1,
  rubberMat: THREE.Material,
  alloyMat: THREE.Material,
  darkSteelMat: THREE.Material,
  includeCreaseInk: boolean,
): THREE.Group {
  const wheel = new THREE.Group();

  // Tire profile via LatheGeometry (axis Y, then rotateZ 90 deg -> axis X)
  const tireR = 0.335;
  const rimR = 0.21;
  const halfW = 0.125;
  const tirePts = [
    new THREE.Vector2(rimR, -halfW * 0.92),
    new THREE.Vector2(tireR - 0.045, -halfW),
    new THREE.Vector2(tireR, -halfW * 0.76),
    new THREE.Vector2(tireR + 0.008, -halfW * 0.25),
    new THREE.Vector2(tireR + 0.008, halfW * 0.25),
    new THREE.Vector2(tireR, halfW * 0.76),
    new THREE.Vector2(tireR - 0.045, halfW),
    new THREE.Vector2(rimR, halfW * 0.92),
    new THREE.Vector2(rimR, -halfW * 0.92),
  ];
  const rawTire = new THREE.LatheGeometry(tirePts, 18);
  rawTire.rotateZ(Math.PI * 0.5);
  applyBoxUVs(rawTire, 1.8);
  const tireGeo = splitCreaseNormals(rawTire, 34);
  rawTire.dispose();
  bakeVerticalGradientAO(tireGeo, 0.72, 1.04);
  wheel.add(
    createStylizedMesh(tireGeo, rubberMat, {
      name: 'tire',
      creaseThresholdDeg: includeCreaseInk ? 48 : 0,
    }),
  );

  // Deep-dish outer alloy rim barrel
  const rimPts = [
    new THREE.Vector2(rimR + 0.004, -halfW * 0.88),
    new THREE.Vector2(rimR + 0.004, halfW * 0.88),
    new THREE.Vector2(rimR - 0.022, halfW * 0.88),
    new THREE.Vector2(rimR - 0.035, halfW * 0.22),
    new THREE.Vector2(0.06, halfW * 0.12),
    new THREE.Vector2(0.06, -halfW * 0.5),
    new THREE.Vector2(rimR - 0.025, -halfW * 0.75),
  ];
  const rawRim = new THREE.LatheGeometry(rimPts, 16);
  rawRim.rotateZ(sideSign > 0 ? -Math.PI * 0.5 : Math.PI * 0.5);
  applyBoxUVs(rawRim, 2.0);
  const rimGeo = splitCreaseNormals(rawRim, 32);
  rawRim.dispose();
  bakeVerticalGradientAO(rimGeo, 0.78, 1.06);

  // 5 angular retro-turbine spokes + center hub cap
  const spokeGeos: THREE.BufferGeometry[] = [rimGeo];
  const hub = createChamferedPrism(0.08, 0.11, 0.11, 0.015);
  hub.translate(sideSign * 0.045, 0, 0);
  spokeGeos.push(hub);

  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spoke = createChamferedPrism(0.032, 0.046, rimR * 0.82, 0.008);
    spoke.translate(0, 0, rimR * 0.44);
    spoke.rotateX(a);
    spoke.translate(sideSign * 0.055, 0, 0);
    spokeGeos.push(spoke);
  }

  const mergedAlloy = mergeParts(spokeGeos);
  bakeVerticalGradientAO(mergedAlloy, 0.8, 1.08);
  wheel.add(createStylizedMesh(mergedAlloy, alloyMat, { name: 'alloy_rim', creaseThresholdDeg: 0 }));

  // Inner brake disc & dark backing drum
  const brakeGeo = new THREE.CylinderGeometry(0.165, 0.165, 0.04, 14);
  brakeGeo.rotateZ(Math.PI * 0.5);
  brakeGeo.translate(-sideSign * 0.02, 0, 0);
  applyBoxUVs(brakeGeo, 1.5);
  bakeVerticalGradientAO(brakeGeo, 0.7, 0.95);
  wheel.add(
    createStylizedMesh(brakeGeo, darkSteelMat, { name: 'brake_disc', creaseThresholdDeg: 0 }),
  );

  return wheel;
}

/**
 * 1. Угловатый ретрофутуристический седан (Angular 1980s Cyber-Wedge Sedan).
 * Dimensions: ~1.92m W × 1.36m H × 4.58m L.
 * Built via multi-station sculpted BufferGeometry hull loft, separate wedge greenhouse,
 * box fender flares, recessed grille/lamps/louvers, and deep-dish 5-spoke wheels.
 */
export interface RetroSedanVariantOptions {
  bodyHex?: string;
  stripeHex?: string;
  includeCreaseInk?: boolean;
  roofTaxiSign?: boolean;
  seed?: number;
}

export function buildRetroSedanAsset(opts: RetroSedanVariantOptions = {}): BuiltLabAsset {
  const meta = ASSET_CATALOG.find((m) => m.id === 'sedan')!;
  const root = new THREE.Group();
  root.name = 'Asset_RetroSedan';

  const includeInk = opts.includeCreaseInk ?? true;
  const seedBase = opts.seed ?? 111;
  const bodyHex = opts.bodyHex ?? '#3c5e6c';
  const stripeHex = opts.stripeHex ?? '#c88338';

  // Curated DRG/TF2/Borderlands non-plastic material palette
  const bodyPaintMat = createPaintedMetalMaterial({
    baseHex: bodyHex,
    wearHex: '#cfc6b4',
    roughness: 0.56,
    metalness: 0.32,
    seed: seedBase,
  });

  const accentStripeMat = createPaintedMetalMaterial({
    baseHex: stripeHex,
    roughness: 0.62,
    metalness: 0.18,
    panelGrid: false,
    seed: seedBase + 1,
  });

  const darkTrimMat = createPaintedMetalMaterial({
    baseHex: '#252931',
    lightHex: '#383e49',
    darkHex: '#15171d',
    roughness: 0.78,
    metalness: 0.22,
    panelGrid: false,
    seed: seedBase + 2,
  });

  const alloyMat = createPaintedMetalMaterial({
    baseHex: '#9da5ad',
    lightHex: '#c4cbd2',
    darkHex: '#636a72',
    roughness: 0.44,
    metalness: 0.68,
    panelGrid: false,
    seed: 114,
  });

  const rubberMat = createRubberMaterial(115);

  const smokedGlassMat = new THREE.MeshStandardMaterial({
    color: 0x18232d,
    roughness: 0.22,
    metalness: 0.65,
    vertexColors: true,
  });

  const headlampMat = new THREE.MeshStandardMaterial({
    color: 0xf0e4c8,
    emissive: 0xffe4b0,
    emissiveIntensity: 0.42,
    roughness: 0.28,
    metalness: 0.15,
  });

  const amberLampMat = new THREE.MeshStandardMaterial({
    color: 0xd97a28,
    emissive: 0xd96e1c,
    emissiveIntensity: 0.38,
    roughness: 0.34,
    metalness: 0.12,
  });

  const tailLampMat = new THREE.MeshStandardMaterial({
    color: 0xb52b28,
    emissive: 0xb82220,
    emissiveIntensity: 0.52,
    roughness: 0.3,
    metalness: 0.15,
  });

  // ---------------------------------------------------------------------------
  // 1. MULTI-STATION SCULPTED WEDGE FUSELAGE (lofted along local Y, then rotated to Z)
  // Cross-section Z coordinate maps to world +Y (height) after rotateX(-PI/2) + translate
  // Wait: rotateX(-PI/2) maps (x, y, z) -> (x, z, -y). So y runs +rear to -front, or
  // rotateX(PI/2) maps (x, y, z) -> (x, -z, y) -> let's use rotateX(-PI/2) where:
  // local Y = -Z_world (rear = +2.25 -> Z = -2.25; front = -2.25 -> Z = +2.25), local Z = +Y_world!
  // ---------------------------------------------------------------------------
  const hullStations: LoftSection[] = [
    // Rear tail lip (Z = -2.22)
    {
      profile: makeCarHullSection(0.76, 0.85, 0.84, 0.72, 0.38, 0.62, 0.86, 0.96, 0.01),
      pos: [0, 2.22, 0],
    },
    // Rear deck & ducktail rise (Z = -2.02)
    {
      profile: makeCarHullSection(0.81, 0.90, 0.89, 0.77, 0.32, 0.60, 0.88, 0.99, 0.015),
      pos: [0, 2.02, 0],
    },
    // Rear fender rear edge (Z = -1.78)
    {
      profile: makeCarHullSection(0.83, 0.92, 0.91, 0.79, 0.28, 0.58, 0.88, 0.95, 0.012),
      pos: [0, 1.78, 0],
    },
    // Rear axle station (Z = -1.32)
    {
      profile: makeCarHullSection(0.84, 0.93, 0.92, 0.80, 0.28, 0.58, 0.88, 0.94, 0.012),
      pos: [0, 1.32, 0],
    },
    // C-pillar base / rear door beltline (Z = -0.82)
    {
      profile: makeCarHullSection(0.84, 0.92, 0.91, 0.81, 0.26, 0.56, 0.87, 0.92, 0.01),
      pos: [0, 0.82, 0],
    },
    // Mid-door waist (Z = 0.0)
    {
      profile: makeCarHullSection(0.84, 0.91, 0.90, 0.81, 0.25, 0.55, 0.85, 0.89, 0.01),
      pos: [0, 0.0, 0],
    },
    // A-pillar cowl base (Z = +0.72)
    {
      profile: makeCarHullSection(0.83, 0.91, 0.90, 0.80, 0.25, 0.54, 0.84, 0.88, 0.015),
      pos: [0, -0.72, 0],
    },
    // Front axle station — hood slopes aggressively forward (Z = +1.36)
    {
      profile: makeCarHullSection(0.82, 0.91, 0.89, 0.78, 0.27, 0.52, 0.79, 0.83, 0.022),
      pos: [0, -1.36, 0],
    },
    // Front fender nose taper (Z = +1.96)
    {
      profile: makeCarHullSection(0.79, 0.88, 0.86, 0.74, 0.30, 0.50, 0.73, 0.76, 0.018),
      pos: [0, -1.96, 0],
    },
    // Wedge front nose tip (Z = +2.24)
    {
      profile: makeCarHullSection(0.73, 0.82, 0.80, 0.68, 0.34, 0.48, 0.68, 0.70, 0.01),
      pos: [0, -2.24, 0],
    },
  ];

  const hullGeo = createLoftedGeometry(hullStations, {
    capStart: true,
    capEnd: true,
    creaseAngleDeg: 32,
    uvTileScale: 0.48,
    useBoxUV: true,
  });
  hullGeo.rotateX(-Math.PI * 0.5);

  // Add sculpted hood power-bulge, ducktail lip, and 4 Lancia-style box fender flares into body paint
  const bodyGeos: THREE.BufferGeometry[] = [hullGeo];

  const hoodBulge = createChamferedPrism(0.72, 0.08, 1.18, 0.032, {
    topTaperX: 0.76,
    topTaperZ: 0.84,
  });
  hoodBulge.rotateX(0.085);
  hoodBulge.translate(0, 0.84, 1.38);
  bodyGeos.push(hoodBulge);

  const ducktail = createChamferedPrism(1.56, 0.13, 0.24, 0.025, {
    topTaperX: 0.92,
    topTaperZ: 0.55,
  });
  ducktail.rotateX(-0.28);
  ducktail.translate(0, 0.99, -2.06);
  bodyGeos.push(ducktail);

  // 4 sculpted box-fender arches around wheel wells
  const axleZ = [1.34, -1.34];
  for (const zPos of axleZ) {
    for (const side of [-1, 1] as const) {
      const arch = createBoxFenderArch();
      arch.translate(side * 0.895, 0.31, zPos);
      bodyGeos.push(arch);
    }
  }

  // Sculpted angular roof cap (sits atop recessed smoked glass greenhouse & structural A/B/C pillars)
  const roofCap = createChamferedPrism(1.28, 0.09, 1.38, 0.035, {
    topTaperX: 0.90,
    topTaperZ: 0.92,
  });
  roofCap.translate(0, 1.345, -0.28);
  bodyGeos.push(roofCap);

  // Sculpted structural A-pillars, B-pillars, C-pillars & roof side drip rails framing the glass cleanly
  for (const side of [-1, 1] as const) {
    // Raked A-pillar (front windshield frame)
    const aPillar = createChamferedPrism(0.085, 0.68, 0.11, 0.014);
    aPillar.rotateX(-0.76);
    aPillar.rotateZ(side * 0.24);
    aPillar.translate(side * 0.665, 1.11, 0.64);
    bodyGeos.push(aPillar);

    // Wide retro-futuristic fastback C-pillar sail panel tucked flush into roof cant rail
    const cPillar = createChamferedPrism(0.105, 0.54, 0.28, 0.016);
    cPillar.rotateX(0.72);
    cPillar.rotateZ(side * 0.24);
    cPillar.translate(side * 0.655, 1.105, -1.16);
    bodyGeos.push(cPillar);

    // Roof side cant rail joining A-pillar to C-pillar
    const cantRail = createChamferedPrism(0.09, 0.08, 1.44, 0.015);
    cantRail.translate(side * 0.615, 1.335, -0.28);
    bodyGeos.push(cantRail);
  }

  // Side mirror housings (painted body color)
  for (const side of [-1, 1] as const) {
    const mirror = createChamferedPrism(0.17, 0.09, 0.12, 0.02, { topTaperX: 0.84 });
    mirror.translate(side * 0.92, 0.95, 0.56);
    bodyGeos.push(mirror);
  }

  const mergedBody = mergeParts(bodyGeos);
  bakeVerticalGradientAO(mergedBody, 0.72, 1.06, 0.22, 1.40);
  root.add(
    createStylizedMesh(mergedBody, bodyPaintMat, {
      name: 'sedan_body',
      creaseThresholdDeg: includeInk ? 46 : 0,
    }),
  );

  // ---------------------------------------------------------------------------
  // 2. RETRO OCHRE SIDE BELTLINE ACCENT STRIPE
  // ---------------------------------------------------------------------------
  const stripeGeos: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1] as const) {
    const strip = createChamferedPrism(0.03, 0.075, 1.72, 0.008);
    strip.translate(side * 0.915, 0.67, 0.0);
    stripeGeos.push(strip);
    const frontTip = createChamferedPrism(0.03, 0.065, 0.44, 0.008);
    frontTip.translate(side * 0.875, 0.66, 1.98);
    stripeGeos.push(frontTip);
    const rearTip = createChamferedPrism(0.03, 0.065, 0.42, 0.008);
    rearTip.translate(side * 0.895, 0.68, -1.96);
    stripeGeos.push(rearTip);
  }
  const mergedStripe = mergeParts(stripeGeos);
  bakeVerticalGradientAO(mergedStripe, 0.85, 1.05);
  root.add(
    createStylizedMesh(mergedStripe, accentStripeMat, {
      name: 'accent_stripe',
      creaseThresholdDeg: includeInk ? 44 : 0,
    }),
  );

  // ---------------------------------------------------------------------------
  // 3. CONTINUOUS RECESSED SMOKED GREENHOUSE GLASS CORE (cleanly framed by A/B/C pillars)
  // ---------------------------------------------------------------------------
  const glassStations: LoftSection[] = [
    // Rear fastback glass base (Z = -1.46)
    {
      profile: makeCarHullSection(0.68, 0.68, 0.67, 0.64, 0.90, 0.92, 0.96, 0.98, 0.005),
      pos: [0, 1.46, 0],
    },
    // Rear roof line (Z = -0.90)
    {
      profile: makeCarHullSection(0.73, 0.70, 0.63, 0.56, 0.87, 1.02, 1.21, 1.31, 0.008),
      pos: [0, 0.90, 0],
    },
    // Mid greenhouse (Z = -0.18)
    {
      profile: makeCarHullSection(0.74, 0.71, 0.63, 0.57, 0.85, 1.02, 1.22, 1.32, 0.008),
      pos: [0, 0.18, 0],
    },
    // Windshield top header (Z = +0.34)
    {
      profile: makeCarHullSection(0.73, 0.70, 0.62, 0.56, 0.84, 1.01, 1.20, 1.30, 0.008),
      pos: [0, -0.34, 0],
    },
    // Steeply raked windshield bottom cowl (Z = +0.90)
    {
      profile: makeCarHullSection(0.71, 0.71, 0.69, 0.66, 0.83, 0.85, 0.88, 0.89, 0.005),
      pos: [0, -0.90, 0],
    },
  ];
  const mergedGlass = createLoftedGeometry(glassStations, {
    capStart: true,
    capEnd: true,
    creaseAngleDeg: 34,
    uvTileScale: 0.6,
    useBoxUV: true,
  });
  mergedGlass.rotateX(-Math.PI * 0.5);
  bakeVerticalGradientAO(mergedGlass, 0.74, 1.14, 0.84, 1.34);
  root.add(
    createStylizedMesh(mergedGlass, smokedGlassMat, {
      name: 'smoked_glass',
      creaseThresholdDeg: includeInk ? 48 : 0,
    }),
  );

  // ---------------------------------------------------------------------------
  // 4. DARK URETHANE BUMPERS, RECESSED GRILLE, LOUVERS, WHEEL WELLS, TRIM
  // ---------------------------------------------------------------------------
  const trimGeos: THREE.BufferGeometry[] = [];

  // Front wrap-around chamfered urethane bumper + chin splitter
  const frontBumper = createChamferedPrism(1.76, 0.17, 0.28, 0.03, { topTaperZ: 0.86 });
  frontBumper.translate(0, 0.38, 2.24);
  trimGeos.push(frontBumper);

  const frontChin = createChamferedPrism(1.62, 0.11, 0.22, 0.02);
  frontChin.rotateX(0.18);
  frontChin.translate(0, 0.26, 2.18);
  trimGeos.push(frontChin);

  // Recessed matte front grille bay
  const frontGrille = createChamferedPrism(1.52, 0.20, 0.10, 0.015);
  frontGrille.translate(0, 0.58, 2.21);
  trimGeos.push(frontGrille);

  // Horizontal grille slats (3 crisp ribs)
  for (const sy of [0.53, 0.58, 0.63]) {
    const slat = createChamferedPrism(0.76, 0.022, 0.06, 0.004);
    slat.translate(0, sy, 2.25);
    trimGeos.push(slat);
  }

  // Rear wrap-around bumper + lower diffuser ribs
  const rearBumper = createChamferedPrism(1.78, 0.19, 0.26, 0.03);
  rearBumper.translate(0, 0.42, -2.23);
  trimGeos.push(rearBumper);

  const rearPanel = createChamferedPrism(1.58, 0.22, 0.09, 0.015);
  rearPanel.translate(0, 0.72, -2.20);
  trimGeos.push(rearPanel);

  // Rocker skirts along bottom sides + dark underbody chassis pan
  const underPan = createChamferedPrism(1.48, 0.10, 3.85, 0.02);
  underPan.translate(0, 0.25, 0);
  trimGeos.push(underPan);

  for (const side of [-1, 1] as const) {
    const skirt = createChamferedPrism(0.12, 0.12, 1.72, 0.02);
    skirt.translate(side * 0.86, 0.26, 0);
    trimGeos.push(skirt);

    // Structural B-pillar & mirror stalk & recessed door handles
    const bPillar = createChamferedPrism(0.055, 0.39, 0.09, 0.01);
    bPillar.rotateZ(side * 0.28);
    bPillar.translate(side * 0.725, 1.12, -0.13);
    trimGeos.push(bPillar);

    const stalk = createChamferedPrism(0.11, 0.04, 0.05, 0.008);
    stalk.translate(side * 0.84, 0.91, 0.58);
    trimGeos.push(stalk);

    for (const hz of [0.06, -0.58]) {
      const handle = createChamferedPrism(0.035, 0.045, 0.14, 0.008);
      handle.translate(side * 0.91, 0.79, hz);
      trimGeos.push(handle);
    }

    // Hood NACA intake slots
    const naca = createChamferedPrism(0.16, 0.035, 0.28, 0.008);
    naca.rotateX(0.1);
    naca.translate(side * 0.44, 0.82, 1.48);
    trimGeos.push(naca);
  }

  // Iconic 80s rear window stepped louvers (5 horizontal slats)
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const louver = createChamferedPrism(1.16, 0.026, 0.09, 0.006);
    louver.rotateX(-0.14);
    louver.translate(0, 1.29 - t * 0.28, -0.96 - t * 0.48);
    trimGeos.push(louver);
  }

  // 4 dark cylindrical wheel well housings inside fenders
  for (const zPos of axleZ) {
    for (const side of [-1, 1] as const) {
      const well = new THREE.CylinderGeometry(0.39, 0.39, 0.34, 14);
      well.rotateZ(Math.PI * 0.5);
      well.translate(side * 0.72, 0.35, zPos);
      applyBoxUVs(well, 1.0);
      trimGeos.push(well);
    }
  }

  const mergedTrim = mergeParts(trimGeos);
  bakeVerticalGradientAO(mergedTrim, 0.64, 1.0);
  root.add(
    createStylizedMesh(mergedTrim, darkTrimMat, {
      name: 'dark_trim',
      creaseThresholdDeg: 0,
    }),
  );

  // ---------------------------------------------------------------------------
  // 5. QUAD RECESSED HEADLAMPS, AMBER MARKERS, FULL-WIDTH TAIL LIGHT BAR & EXHAUSTS
  // ---------------------------------------------------------------------------
  const headGeos: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1] as const) {
    for (const xOff of [0.49, 0.67]) {
      const lamp = createChamferedPrism(0.145, 0.11, 0.06, 0.012);
      lamp.translate(side * xOff, 0.59, 2.25);
      headGeos.push(lamp);
    }
  }
  root.add(
    createStylizedMesh(mergeParts(headGeos), headlampMat, {
      name: 'quad_headlamps',
      creaseThresholdDeg: 0,
    }),
  );

  const amberGeos: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1] as const) {
    const frontTurn = createChamferedPrism(0.14, 0.06, 0.08, 0.01);
    frontTurn.translate(side * 0.74, 0.42, 2.35);
    amberGeos.push(frontTurn);

    const sideMarker = createChamferedPrism(0.035, 0.045, 0.13, 0.006);
    sideMarker.translate(side * 0.87, 0.50, 1.88);
    amberGeos.push(sideMarker);
  }
  root.add(
    createStylizedMesh(mergeParts(amberGeos), amberLampMat, {
      name: 'amber_markers',
      creaseThresholdDeg: 0,
    }),
  );

  const tailGeos: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1] as const) {
    const tailMain = createChamferedPrism(0.56, 0.11, 0.06, 0.012);
    tailMain.translate(side * 0.49, 0.73, -2.24);
    tailGeos.push(tailMain);
  }
  const centerBar = createChamferedPrism(0.34, 0.055, 0.05, 0.008);
  centerBar.translate(0, 0.76, -2.23);
  tailGeos.push(centerBar);
  root.add(
    createStylizedMesh(mergeParts(tailGeos), tailLampMat, {
      name: 'tail_lights',
      creaseThresholdDeg: 0,
    }),
  );

  // Optional glowing 1980s Japanese rooftop taxi lantern
  if (opts.roofTaxiSign) {
    const lanternMat = new THREE.MeshStandardMaterial({
      color: 0xf6c95e,
      emissive: 0xf4a836,
      emissiveIntensity: 0.95,
      roughness: 0.35,
    });
    const taxiSign = createChamferedPrism(0.46, 0.16, 0.22, 0.025, { topTaperX: 0.82, topTaperZ: 0.82 });
    taxiSign.translate(0, 1.46, -0.18);
    root.add(
      createStylizedMesh(taxiSign, lanternMat, {
        name: 'taxi_roof_sign',
        creaseThresholdDeg: 0,
      }),
    );
  }

  // Twin chamfered metallic exhaust pipes
  const exhaustGeos: THREE.BufferGeometry[] = [];
  for (const xPos of [-0.52, -0.38]) {
    const pipe = new THREE.CylinderGeometry(0.036, 0.04, 0.24, 10);
    pipe.rotateX(Math.PI * 0.5);
    pipe.translate(xPos, 0.27, -2.24);
    applyBoxUVs(pipe, 2.0);
    exhaustGeos.push(pipe);
  }
  const mergedExhaust = mergeParts(exhaustGeos);
  bakeVerticalGradientAO(mergedExhaust, 0.72, 1.04);
  root.add(createStylizedMesh(mergedExhaust, alloyMat, { name: 'twin_exhaust', creaseThresholdDeg: 0 }));

  // ---------------------------------------------------------------------------
  // 6. 4 SCULPTED DEEP-DISH WHEELS
  // ---------------------------------------------------------------------------
  const wheelCoords: readonly [number, number, 1 | -1][] = [
    [0.84, 1.34, 1],
    [-0.84, 1.34, -1],
    [0.84, -1.34, 1],
    [-0.84, -1.34, -1],
  ];
  wheelCoords.forEach(([wx, wz, side], idx) => {
    const w = createWheelAssembly(side, rubberMat, alloyMat, darkTrimMat, includeInk);
    w.name = `wheel_${idx + 1}`;
    w.position.set(wx, 0.34, wz);
    root.add(w);
  });

  groundObjectAtZero(root);
  const stats = computeAssetStats(root);
  return { meta, root, stats };
}
