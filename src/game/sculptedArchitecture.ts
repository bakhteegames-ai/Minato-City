import * as THREE from 'three';
import {
  applyBoxUVs,
  bakeVerticalGradientAO,
  createChamferedPrism,
  createRecessedFrame,
  groundObjectAtZero,
  mergeParts,
} from '../lab/meshKernel';
import {
  createPaintedMetalMaterial,
  createRubberMaterial,
  createStylizedClothMaterial,
  createUrbanConcreteMaterial,
} from '../lab/stylizedTextures';
import { enableOutlineLayer } from './assetPipeline';
import { addContactShadow, type SharedModelAssets, type VehicleBuildResult } from './models';
import type { MinatoTextureBank } from './textures';

export interface ModularUpperFacadeOptions {
  width: number;
  depth: number;
  baseY: number;
  floors: number;
  floorH?: number;
  concreteHex: string;
  facadeHex: string;
  transparent?: boolean;
  includeBalconies?: boolean;
  includeSideWindows?: boolean;
  includeRoofMech?: boolean;
  seed?: number;
}

export interface BuiltModularUpperFacade {
  group: THREE.Group;
  materials: THREE.MeshStandardMaterial[];
  emissiveWindowsMat: THREE.MeshStandardMaterial;
}

/**
 * GATE 2: Sculpted DRG + TF2 + Borderlands 2 Modular Urban Upper-Story Architectural Block.
 * Replaces flat primitive BoxGeometry building volumes on Intersection A-3 with real structural
 * corner/bay pilasters, chamfered belt courses, deep recessed windows with lintels/sills/mullions,
 * cantilevered iron balconies, wall-mounted AC units, parapet walls & rooftop mechanical penthouses.
 */
export function buildModularUrbanUpperBlock(
  opts: ModularUpperFacadeOptions,
): BuiltModularUpperFacade {
  const {
    width: W,
    depth: D,
    baseY,
    floors,
    floorH = 3.0,
    concreteHex,
    facadeHex,
    transparent = false,
    includeBalconies = true,
    includeSideWindows = true,
    includeRoofMech = true,
    seed = 301,
  } = opts;

  const group = new THREE.Group();
  const halfW = W * 0.5;
  const halfD = D * 0.5;
  const totalH = floors * floorH;

  const concreteMat = createUrbanConcreteMaterial({
    baseHex: concreteHex,
    lightHex: '#' + new THREE.Color(concreteHex).offsetHSL(0, -0.02, 0.08).getHexString(),
    darkHex: '#' + new THREE.Color(concreteHex).offsetHSL(0, 0.01, -0.11).getHexString(),
    roughness: 0.9,
    tiled: false,
    grimeStrength: 1.1,
    seed,
  });
  const facadeMat = createUrbanConcreteMaterial({
    baseHex: facadeHex,
    lightHex: '#' + new THREE.Color(facadeHex).offsetHSL(0, -0.02, 0.07).getHexString(),
    darkHex: '#' + new THREE.Color(facadeHex).offsetHSL(0, 0.02, -0.10).getHexString(),
    roughness: 0.87,
    tiled: true,
    grimeStrength: 0.95,
    seed: seed + 1,
  });
  const steelMat = createPaintedMetalMaterial({
    baseHex: '#2b323d',
    lightHex: '#424c5c',
    darkHex: '#181c24',
    roughness: 0.70,
    metalness: 0.44,
    panelGrid: false,
    seed: seed + 2,
  });
  const utilityMat = createPaintedMetalMaterial({
    baseHex: '#7d858c',
    lightHex: '#a3abb2',
    darkHex: '#4f565d',
    wearHex: '#b38b62',
    roughness: 0.64,
    metalness: 0.46,
    seed: seed + 3,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x223040,
    roughness: 0.24,
    metalness: 0.58,
  });
  const warmWindowMat = new THREE.MeshStandardMaterial({
    color: 0xd4ad74,
    emissive: 0xc28a46,
    emissiveIntensity: 0.72,
    roughness: 0.82,
  });
  warmWindowMat.name = 'emit_window_warm';

  const allMats = [concreteMat, facadeMat, steelMat, utilityMat, glassMat, warmWindowMat];
  if (transparent) {
    for (const m of allMats) {
      m.transparent = true;
    }
  }

  const concreteGeos: THREE.BufferGeometry[] = [];
  const facadeGeos: THREE.BufferGeometry[] = [];
  const steelGeos: THREE.BufferGeometry[] = [];
  const utilityGeos: THREE.BufferGeometry[] = [];
  const glassGeos: THREE.BufferGeometry[] = [];
  const litGeos: THREE.BufferGeometry[] = [];

  // 1. Core masonry volume recessed slightly behind structural corner pilasters
  const core = createChamferedPrism(W - 0.32, totalH, D - 0.32, 0.04);
  core.translate(0, baseY + totalH * 0.5, 0);
  facadeGeos.push(core);

  // 2. Structural corner concrete pilasters + intermediate front vertical bays
  const bayCount = Math.max(2, Math.min(5, Math.round(W / 3.1)));
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      const pilaster = createChamferedPrism(0.56, totalH, 0.56, 0.045);
      pilaster.translate(sx * (halfW - 0.18), baseY + totalH * 0.5, sz * (halfD - 0.18));
      concreteGeos.push(pilaster);
    }
  }
  for (let b = 1; b < bayCount; b++) {
    const px = -halfW + (b * W) / bayCount;
    const midCol = createChamferedPrism(0.40, totalH, 0.36, 0.036);
    midCol.translate(px, baseY + totalH * 0.5, halfD - 0.12);
    concreteGeos.push(midCol);
  }

  // 3. Protruding chamfered floor-slab belt courses & rooftop parapet (flush at baseY)
  for (let f = 0; f <= floors; f++) {
    const by = f === 0 ? baseY + 0.14 : baseY + f * floorH;
    const belt = createChamferedPrism(W + 0.34, 0.28, D + 0.34, 0.04);
    belt.translate(0, by, 0);
    concreteGeos.push(belt);
  }

  const roofY = baseY + totalH + 0.14;
  const pH = 0.72;
  const pT = 0.34;
  concreteGeos.push(
    createChamferedPrism(W + 0.18, pH, pT, 0.03).translate(0, roofY + pH * 0.5, halfD - pT * 0.5),
    createChamferedPrism(W + 0.18, pH, pT, 0.03).translate(0, roofY + pH * 0.5, -halfD + pT * 0.5),
    createChamferedPrism(pT, pH, D - pT * 2 + 0.08, 0.03).translate(-halfW + pT * 0.5, roofY + pH * 0.5, 0),
    createChamferedPrism(pT, pH, D - pT * 2 + 0.08, 0.03).translate(halfW - pT * 0.5, roofY + pH * 0.5, 0),
  );

  // 4. Recessed front windows (lintels, sills, steel sashes, mullions) + balconies + AC units
  const bayW = W / bayCount;
  for (let f = 0; f < floors; f++) {
    const fy = baseY + f * floorH;
    const wy = fy + floorH * 0.54;
    const wh = Math.min(1.74, floorH * 0.58);
    const ww = Math.min(1.92, bayW - 0.84);

    for (let b = 0; b < bayCount; b++) {
      const wx = -halfW + bayW * (b + 0.5);

      const lintel = createChamferedPrism(ww + 0.24, 0.17, 0.28, 0.022);
      lintel.translate(wx, wy + wh * 0.5 + 0.08, halfD - 0.04);
      concreteGeos.push(lintel);

      const sill = createChamferedPrism(ww + 0.28, 0.14, 0.34, 0.022);
      sill.translate(wx, wy - wh * 0.5 - 0.05, halfD - 0.01);
      concreteGeos.push(sill);

      const frame = createRecessedFrame(ww, wh, 0.20, 0.085, 0.012);
      frame.translate(wx, wy, halfD - 0.07);
      steelGeos.push(frame);

      const mull = createChamferedPrism(0.06, wh - 0.14, 0.11, 0.008);
      mull.translate(wx, wy, halfD - 0.07);
      steelGeos.push(mull);

      const transom = createChamferedPrism(ww - 0.14, 0.05, 0.09, 0.006);
      transom.translate(wx, wy + wh * 0.18, halfD - 0.08);
      steelGeos.push(transom);

      const pane = new THREE.PlaneGeometry(ww - 0.14, wh - 0.14);
      pane.translate(wx, wy, halfD - 0.12);
      if ((f * 3 + b + seed) % 2 === 0) {
        litGeos.push(pane);
      } else {
        glassGeos.push(pane);
      }

      // Cantilevered concrete balcony + steel railing on alternating wide bays
      if (includeBalconies && b < Math.min(2, bayCount) && f === 0) {
        const balcW = ww + 0.42;
        const balcD = 0.84;
        const balcSlab = createChamferedPrism(balcW, 0.18, balcD, 0.028);
        balcSlab.translate(wx, fy + 0.08, halfD + balcD * 0.5 - 0.04);
        concreteGeos.push(balcSlab);

        const railH = 0.92;
        const railZ = halfD + balcD - 0.10;
        steelGeos.push(
          createChamferedPrism(balcW - 0.08, 0.052, 0.052, 0.009).translate(wx, fy + 0.16 + railH, railZ),
          createChamferedPrism(balcW - 0.08, 0.044, 0.044, 0.008).translate(wx, fy + 0.28, railZ),
        );
        for (const side of [-1, 1] as const) {
          steelGeos.push(
            createChamferedPrism(0.052, 0.052, balcD - 0.06, 0.009).translate(
              wx + side * (balcW * 0.5 - 0.06),
              fy + 0.16 + railH,
              halfD + balcD * 0.5 - 0.04,
            ),
          );
        }
        const pickets = 6;
        for (let p = 0; p < pickets; p++) {
          const px = wx - (balcW * 0.5 - 0.08) + (p / (pickets - 1)) * (balcW - 0.16);
          steelGeos.push(createChamferedPrism(0.036, railH, 0.036, 0.006).translate(px, fy + 0.16 + railH * 0.5, railZ));
        }

        // AC condenser on right side of first balcony
        if (b === 0) {
          const ac = createChamferedPrism(0.64, 0.50, 0.34, 0.024);
          ac.translate(wx + balcW * 0.28, fy + 0.42, halfD + 0.26);
          utilityGeos.push(ac);
        }
      }
    }

    // Side facade recessed windows
    if (includeSideWindows) {
      const sideBays = Math.max(2, Math.min(3, Math.round(D / 3.6)));
      const sBayD = (D - 1.2) / sideBays;
      for (const sx of [-1, 1] as const) {
        for (let sb = 0; sb < sideBays; sb++) {
          const wz = -(D - 1.2) * 0.5 + sBayD * (sb + 0.5);
          const sFrame = createRecessedFrame(1.24, wh * 0.86, 0.18, 0.08, 0.012);
          sFrame.rotateY(Math.PI * 0.5);
          sFrame.translate(sx * (halfW - 0.08), wy, wz);
          steelGeos.push(sFrame);

          const sPane = new THREE.PlaneGeometry(1.10, wh * 0.86 - 0.14);
          sPane.rotateY(sx > 0 ? Math.PI * 0.5 : -Math.PI * 0.5);
          sPane.translate(sx * (halfW - 0.11), wy, wz);
          if ((f + sb + (sx > 0 ? 1 : 0)) % 2 === 0) litGeos.push(sPane);
          else glassGeos.push(sPane);
        }
      }
    }
  }

  // 5. Rooftop mechanical penthouse & HVAC blowers
  if (includeRoofMech) {
    const bulkW = Math.min(2.6, W * 0.28);
    const bulkD = Math.min(2.4, D * 0.28);
    concreteGeos.push(
      createChamferedPrism(bulkW, 1.75, bulkD, 0.045).translate(halfW * 0.42, roofY + 0.88, -halfD * 0.32),
      createChamferedPrism(bulkW + 0.22, 0.16, bulkD + 0.22, 0.03).translate(halfW * 0.42, roofY + 1.80, -halfD * 0.32),
    );
    utilityGeos.push(
      createChamferedPrism(1.65, 0.85, 1.25, 0.04).translate(-halfW * 0.38, roofY + 0.44, -halfD * 0.18),
      createChamferedPrism(1.15, 0.62, 0.92, 0.035).translate(-halfW * 0.15, roofY + 0.32, halfD * 0.24),
    );
  }

  const addLayer = (geos: THREE.BufferGeometry[], mat: THREE.Material, castShadow = true) => {
    if (geos.length === 0) return;
    const merged = mergeParts(geos);
    bakeVerticalGradientAO(merged, 0.70, 1.05, baseY, roofY + 2.0);
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    group.add(mesh);
  };

  addLayer(concreteGeos, concreteMat, true);
  addLayer(facadeGeos, facadeMat, true);
  addLayer(steelGeos, steelMat, true);
  addLayer(utilityGeos, utilityMat, true);
  addLayer(glassGeos, glassMat, false);
  addLayer(litGeos, warmWindowMat, false);

  return { group, materials: allMats, emissiveWindowsMat: warmWindowMat };
}

/** Builds a sculpted ribbed striped canvas storefront awning with steel struts. */
export function buildSculptedAwning(
  width: number,
  depth: number,
  primaryHex: string,
  creamHex: string,
  transparent = false,
  seed = 340,
): { group: THREE.Group; materials: THREE.MeshStandardMaterial[] } {
  const group = new THREE.Group();
  const primaryMat = createStylizedClothMaterial({
    baseHex: primaryHex,
    lightHex: '#' + new THREE.Color(primaryHex).offsetHSL(0, -0.02, 0.08).getHexString(),
    darkHex: '#' + new THREE.Color(primaryHex).offsetHSL(0, 0.02, -0.10).getHexString(),
    roughness: 0.9,
    seed,
  });
  const creamMat = createStylizedClothMaterial({
    baseHex: creamHex,
    lightHex: '#ebe1cd',
    darkHex: '#9e9482',
    roughness: 0.9,
    seed: seed + 1,
  });
  const strutMat = createPaintedMetalMaterial({
    baseHex: '#282e38',
    lightHex: '#3f4856',
    darkHex: '#151920',
    roughness: 0.65,
    metalness: 0.5,
    panelGrid: false,
    seed: seed + 2,
  });

  if (transparent) {
    primaryMat.transparent = true;
    creamMat.transparent = true;
    strutMat.transparent = true;
  }

  const stripes = Math.max(6, Math.round(width / 0.72));
  const sw = width / stripes;
  const pGeos: THREE.BufferGeometry[] = [];
  const cGeos: THREE.BufferGeometry[] = [];
  const sGeos: THREE.BufferGeometry[] = [];

  for (let i = 0; i < stripes; i++) {
    const sx = -width * 0.5 + sw * (i + 0.5);
    const roof = createChamferedPrism(sw - 0.012, 0.07, depth, 0.014);
    roof.rotateX(0.32);
    roof.translate(sx, 0.04, depth * 0.48);

    const valance = createChamferedPrism(sw - 0.012, 0.28, 0.048, 0.009);
    valance.translate(sx, -depth * 0.16 - 0.12, depth * 0.94);

    if (i % 2 === 0) pGeos.push(roof, valance);
    else cGeos.push(roof, valance);
  }

  const strutCount = Math.max(3, Math.round(width / 3.2) + 1);
  for (let k = 0; k < strutCount; k++) {
    const bx = -width * 0.46 + (k / (strutCount - 1)) * width * 0.92;
    const strut = createChamferedPrism(0.055, 0.055, depth * 0.92, 0.008);
    strut.rotateX(-0.34);
    strut.translate(bx, -0.34, depth * 0.40);
    sGeos.push(strut);
  }

  const add = (geos: THREE.BufferGeometry[], mat: THREE.Material) => {
    const merged = mergeParts(geos);
    bakeVerticalGradientAO(merged, 0.78, 1.06);
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  };
  add(pGeos, primaryMat);
  add(cGeos, creamMat);
  add(sGeos, strutMat);

  return { group, materials: [primaryMat, creamMat, strutMat] };
}

/**
 * GATE 2: Sculpted 1980s Japanese Cab-Over Delivery Van («港運送»).
 * Replaces the primitive extruded van block with sculpted chamfered cab/cargo body,
 * 6-spoke wheels flush at Y=0, slatted grille, mirrors, lightbar & siren sprites.
 */
export function buildSculptedDeliveryVan(
  assets: SharedModelAssets,
  textures: MinatoTextureBank,
  elevY = 0,
): VehicleBuildResult {
  const rootGroup = new THREE.Group();
  rootGroup.name = 'Vehicle_van';
  const g = new THREE.Group();
  g.name = 'VehicleProxy_van';
  const customSlotMount = new THREE.Group();
  customSlotMount.name = 'VehicleCustom_van';
  rootGroup.add(g, customSlotMount);

  const bodyMat = createPaintedMetalMaterial({
    baseHex: '#b4bcc8',
    lightHex: '#ced6e0',
    darkHex: '#7d8796',
    wearHex: '#8d7a64',
    roughness: 0.68,
    metalness: 0.24,
    panelGrid: true,
    seed: 180,
  });
  const stripeMat = createPaintedMetalMaterial({
    baseHex: '#244778',
    lightHex: '#35609c',
    darkHex: '#152b4a',
    roughness: 0.64,
    metalness: 0.22,
    panelGrid: false,
    seed: 181,
  });
  const darkMetalMat = createPaintedMetalMaterial({
    baseHex: '#252b34',
    lightHex: '#3e4654',
    darkHex: '#14181e',
    roughness: 0.58,
    metalness: 0.52,
    panelGrid: false,
    seed: 182,
  });
  const tireMat = createRubberMaterial(183);
  const rimMat = createPaintedMetalMaterial({
    baseHex: '#a4adb8',
    lightHex: '#c6cfd8',
    darkHex: '#6b737d',
    roughness: 0.36,
    metalness: 0.72,
    panelGrid: false,
    seed: 184,
  });
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfff0c8,
    emissive: 0xffd27a,
    emissiveIntensity: 1.5,
    roughness: 0.22,
  });
  headMat.name = 'emit_headlamp';
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xd93832,
    emissive: 0xc2241e,
    emissiveIntensity: 1.2,
    roughness: 0.26,
  });
  tailMat.name = 'emit_tail';

  const len = 4.92;
  const wid = 2.06;

  // Lower chassis + sculpted cab-over front + chamfered cargo box
  const bodyParts = [
    createChamferedPrism(len - 0.14, 0.86, wid - 0.08, 0.08).translate(0, 0.76, 0),
    createChamferedPrism(3.38, 1.04, wid - 0.14, 0.075, { topTaperZ: 0.94 }).translate(-0.72, 1.56, 0),
    createChamferedPrism(1.38, 0.98, wid - 0.16, 0.075, { topTaperX: 0.78, topTaperZ: 0.92 }).translate(1.62, 1.52, 0),
  ];
  const bodyGeo = mergeParts(bodyParts);
  bakeVerticalGradientAO(bodyGeo, 0.72, 1.06, 0.3, 2.2);
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  g.add(bodyMesh);

  // Blue corporate livery stripe + side Kanji plates
  const stripeGeo = createChamferedPrism(len - 0.08, 0.24, wid - 0.02, 0.025);
  stripeGeo.translate(0, 0.96, 0);
  bakeVerticalGradientAO(stripeGeo, 0.84, 1.04);
  g.add(new THREE.Mesh(stripeGeo, stripeMat));

  const liveryMat = new THREE.MeshStandardMaterial({ map: textures.vanSide, roughness: 0.72 });
  const livL = new THREE.Mesh(new THREE.PlaneGeometry(2.75, 0.92), liveryMat);
  livL.position.set(-0.68, 1.24, wid * 0.5 - 0.01);
  const livR = livL.clone();
  livR.position.z = -wid * 0.5 + 0.01;
  livR.rotation.y = Math.PI;
  g.add(livL, livR);

  // Dark recessed windshield, side cab glass, bumpers, grille & side mirrors
  const ws = new THREE.Mesh(createChamferedPrism(0.14, 0.66, wid - 0.34, 0.02), assets.carGlassMat);
  ws.position.set(2.14, 1.62, 0);
  ws.rotation.z = 0.28;
  const cabGlass = new THREE.Mesh(createChamferedPrism(1.06, 0.54, wid - 0.10, 0.016), assets.carGlassMat);
  cabGlass.position.set(1.48, 1.64, 0);
  g.add(ws, cabGlass);

  const trimParts = [
    createChamferedPrism(0.24, 0.24, wid + 0.06, 0.04).translate(len * 0.5 - 0.02, 0.44, 0),
    createChamferedPrism(0.22, 0.24, wid + 0.06, 0.04).translate(-len * 0.5 + 0.02, 0.44, 0),
    createChamferedPrism(0.10, 0.34, 1.24, 0.02).translate(len * 0.5 - 0.03, 0.84, 0),
    createChamferedPrism(0.36, 0.16, 1.14, 0.028).translate(1.38, 2.14, 0), // roof lightbar housing
    // Wing mirrors
    createChamferedPrism(0.10, 0.34, 0.18, 0.016).translate(2.12, 1.54, wid * 0.5 + 0.14),
    createChamferedPrism(0.10, 0.34, 0.18, 0.016).translate(2.12, 1.54, -wid * 0.5 - 0.14),
    // Roof cargo rack rails
    createChamferedPrism(2.8, 0.07, 0.07, 0.01).translate(-0.72, 2.14, wid * 0.36),
    createChamferedPrism(2.8, 0.07, 0.07, 0.01).translate(-0.72, 2.14, -wid * 0.36),
  ];
  const trimGeo = mergeParts(trimParts);
  bakeVerticalGradientAO(trimGeo, 0.74, 1.05, 0.3, 2.2);
  const trimMesh = new THREE.Mesh(trimGeo, darkMetalMat);
  trimMesh.castShadow = true;
  g.add(trimMesh);

  // Quad headlights & taillights
  for (const lz of [-0.66, 0.66]) {
    const hl = new THREE.Mesh(createChamferedPrism(0.08, 0.20, 0.34, 0.016), headMat);
    hl.position.set(len * 0.5 - 0.02, 0.84, lz);
    const tl = new THREE.Mesh(createChamferedPrism(0.08, 0.26, 0.22, 0.016), tailMat);
    tl.position.set(-len * 0.5 + 0.02, 0.86, lz * 1.12);
    g.add(hl, tl);
  }

  // 4 Sculpted Wheels grounded strictly at Y = 0 (radius 0.37m -> center Y = 0.37m)
  const wheelPositions: Array<[number, number]> = [
    [1.56, wid * 0.46],
    [1.56, -wid * 0.46],
    [-1.44, wid * 0.46],
    [-1.44, -wid * 0.46],
  ];
  const tireGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.28, 16);
  bakeVerticalGradientAO(tireGeo, 0.78, 1.02);
  const rimGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.30, 10);
  bakeVerticalGradientAO(rimGeo, 0.84, 1.06);
  for (const [wx, wz] of wheelPositions) {
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.rotation.x = Math.PI / 2;
    tire.position.set(wx, 0.37, wz);
    tire.castShadow = true;
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(wx, 0.37, wz);
    g.add(tire, rim);
  }

  // Emergency roof siren sprites
  const spR = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: textures.glowHalo,
      color: 0xff3b52,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  spR.position.set(1.38, 2.30, 0.38);
  spR.scale.set(1.6, 1.6, 1);
  const spB = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: textures.glowHalo,
      color: 0x4ce0e8,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  spB.position.set(1.38, 2.30, -0.38);
  spB.scale.set(1.6, 1.6, 1);
  g.add(spR, spB);

  if (elevY <= 0.25) {
    for (const hz of [-0.66, 0.66]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.05, 5.2, 12, 1, true), assets.hlConeMat);
      cone.rotation.z = Math.PI / 2;
      cone.position.set(len * 0.5 + 2.6, 0.72, hz);
      cone.userData.skipOutline = true;
      cone.userData.excludeFromExport = true;
      rootGroup.add(cone);
    }
  }

  groundObjectAtZero(g);
  enableOutlineLayer(g, false);
  addContactShadow(rootGroup, textures, len + 1.0, wid + 0.9);

  return {
    kind: 'van',
    group: rootGroup,
    proxyGroup: g,
    customSlotMount,
    sirenSprites: { red: spR, blue: spB },
    bounds: { hx: len / 2, hz: wid / 2 },
    setCharred: () => {},
  };
}

/**
 * GATE 2: Sculpted Japanese Cobra-Head Streetlight & Utility Pole.
 * Applies Antigravity's gs-b3 Post-Mortem fix: protruding faceted amber drop-diffuser
 * hanging cleanly below the cobra hood so it reads warmly from elevated 3/4 gameplay camera!
 */
export function buildSculptedCobraStreetlamp(
  sideSign: 1 | -1,
  darkMetalMat: THREE.MeshStandardMaterial,
): { group: THREE.Group; lensMat: THREE.MeshStandardMaterial; lampLocalX: number } {
  const g = new THREE.Group();
  g.name = 'Prop_CobraStreetlamp';

  const poleSteel = createPaintedMetalMaterial({
    baseHex: '#353d4a',
    lightHex: '#4f5a6d',
    darkHex: '#1d222b',
    roughness: 0.62,
    metalness: 0.52,
    panelGrid: false,
    seed: 190,
  });

  // Base anchor flange + tapered pole shaft + crossarm + cylindrical transformer drum
  const baseCollar = createChamferedPrism(0.46, 0.42, 0.46, 0.05, { topTaperX: 0.72, topTaperZ: 0.72 });
  baseCollar.translate(0, 0.21, 0);
  const pole = new THREE.CylinderGeometry(0.11, 0.18, 9.0, 10);
  applyBoxUVs(pole, 0.5);
  pole.translate(0, 4.5, 0);
  const cross = createChamferedPrism(2.2, 0.12, 0.14, 0.02);
  cross.translate(0, 8.5, 0);
  const transformer = new THREE.CylinderGeometry(0.26, 0.26, 0.84, 10);
  applyBoxUVs(transformer, 1.0);
  transformer.translate(0.32, 7.55, 0);

  // Curved cantilevered cobra luminaire arm reaching over the street
  const lampLocalX = sideSign * 1.45;
  const armCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 6.85, 0),
    new THREE.Vector3(sideSign * 0.55, 7.30, 0),
    new THREE.Vector3(lampLocalX, 7.42, 0),
  ]);
  const armGeo = new THREE.TubeGeometry(armCurve, 10, 0.055, 8, false);
  applyBoxUVs(armGeo, 1.0);

  // Sculpted chamfered cobra hood
  const hood = createChamferedPrism(0.74, 0.16, 0.36, 0.032, { topTaperX: 0.76, topTaperZ: 0.78 });
  hood.translate(lampLocalX + sideSign * 0.16, 7.42, 0);

  const poleMerged = mergeParts([baseCollar, pole, cross, transformer, armGeo, hood]);
  bakeVerticalGradientAO(poleMerged, 0.72, 1.06, 0, 9.0);
  const poleMesh = new THREE.Mesh(poleMerged, poleSteel);
  poleMesh.castShadow = true;
  poleMesh.receiveShadow = true;
  g.add(poleMesh);

  // Protruding faceted octagonal drop-diffuser hanging BELOW the hood (gs-b3 visibility fix!)
  const lensMat = new THREE.MeshStandardMaterial({
    color: 0xffe4a8,
    emissive: 0xffb84d,
    emissiveIntensity: 2.2,
    roughness: 0.24,
    metalness: 0.05,
  });
  lensMat.name = 'emit_lamp';
  const lensGeo = createChamferedPrism(0.50, 0.18, 0.24, 0.035, { topTaperX: 1.15, topTaperZ: 1.12 });
  const lens = new THREE.Mesh(lensGeo, lensMat);
  lens.position.set(lampLocalX + sideSign * 0.18, 7.26, 0);
  g.add(lens);

  // Ceramic crossarm insulators
  for (const ix of [-0.9, -0.35, 0.35, 0.9]) {
    const ins = new THREE.Mesh(createChamferedPrism(0.08, 0.14, 0.08, 0.015), darkMetalMat);
    ins.position.set(ix, 8.62, 0);
    g.add(ins);
  }

  return { group: g, lensMat, lampLocalX: lampLocalX + sideSign * 0.18 };
}
