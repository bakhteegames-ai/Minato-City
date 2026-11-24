import * as THREE from 'three';
import {
  applyBoxUVs,
  bakeVerticalGradientAO,
  computeAssetStats,
  createChamferedPrism,
  createRecessedFrame,
  groundObjectAtZero,
  mergeParts,
  splitCreaseNormals,
} from '../meshKernel';
import {
  createPaintedMetalMaterial,
  createShopSignMaterial,
  createStylizedClothMaterial,
  createStylizedMesh,
  createUrbanConcreteMaterial,
} from '../stylizedTextures';
import { ASSET_CATALOG, type BuiltLabAsset } from './types';

/**
 * 2. Модульное трёхэтажное городское здание (Modular 3-Story Urban Commercial Building).
 * Dimensions: ~6.8m W × 10.9m H × 5.6m D.
 * Composed of explicit modular tiers: Ground Storefront + Floor 2 Module + Floor 3 Module +
 * Rooftop Mechanical Module. Features chamfered pilasters, belt courses, deep recessed windows,
 * cantilevered balconies with steel railings, awning, AC units with piping, signage & water tank.
 */
export function buildModularBuildingAsset(): BuiltLabAsset {
  const meta = ASSET_CATALOG.find((m) => m.id === 'building')!;
  const root = new THREE.Group();
  root.name = 'Asset_ModularBuilding';

  // Weathered non-plastic urban palette (warm concrete, terracotta tile, dark steel, canvas)
  const concreteMat = createUrbanConcreteMaterial({
    baseHex: '#928c80',
    lightHex: '#aba496',
    darkHex: '#635e56',
    roughness: 0.91,
    tiled: false,
    grimeStrength: 1.2,
    seed: 211,
  });

  const facadeTileMat = createUrbanConcreteMaterial({
    baseHex: '#84594a',
    lightHex: '#9c6e5e',
    darkHex: '#593930',
    roughness: 0.86,
    tiled: true,
    grimeStrength: 1.0,
    seed: 212,
  });

  const darkSteelMat = createPaintedMetalMaterial({
    baseHex: '#2b323b',
    lightHex: '#434c58',
    darkHex: '#181c22',
    roughness: 0.72,
    metalness: 0.44,
    panelGrid: false,
    seed: 213,
  });

  const utilityMetalMat = createPaintedMetalMaterial({
    baseHex: '#7d858c',
    lightHex: '#a3abb2',
    darkHex: '#4f565d',
    wearHex: '#b48a62',
    roughness: 0.62,
    metalness: 0.48,
    seed: 214,
  });

  const awningRedMat = createStylizedClothMaterial({
    baseHex: '#8d3631',
    lightHex: '#a84a44',
    darkHex: '#5c201d',
    roughness: 0.9,
    seed: 215,
  });

  const awningCreamMat = createStylizedClothMaterial({
    baseHex: '#cfc3ad',
    lightHex: '#e2d7c2',
    darkHex: '#998e7b',
    roughness: 0.9,
    seed: 216,
  });

  const shopSignMat = createShopSignMaterial(217);

  const windowGlassMat = new THREE.MeshStandardMaterial({
    color: 0x202c38,
    roughness: 0.24,
    metalness: 0.58,
    vertexColors: true,
  });

  const warmInteriorMat = new THREE.MeshStandardMaterial({
    color: 0xc29e6d,
    emissive: 0xa87c44,
    emissiveIntensity: 0.36,
    roughness: 0.85,
  });

  const W = 6.4;
  const D = 5.0;
  const halfW = W * 0.5;
  const halfD = D * 0.5;
  const floorH = 3.0;
  const groundH = 3.2;

  const concreteGeos: THREE.BufferGeometry[] = [];
  const tileGeos: THREE.BufferGeometry[] = [];
  const steelGeos: THREE.BufferGeometry[] = [];
  const utilityGeos: THREE.BufferGeometry[] = [];
  const glassGeos: THREE.BufferGeometry[] = [];
  const interiorGeos: THREE.BufferGeometry[] = [];

  // ---------------------------------------------------------------------------
  // A. FOUNDATION PLINTH + STRUCTURAL CORNER PILASTERS + FLOOR BELT COURSES
  // ---------------------------------------------------------------------------
  const plinth = createChamferedPrism(W + 0.24, 0.32, D + 0.24, 0.05);
  plinth.translate(0, 0.16, 0);
  concreteGeos.push(plinth);

  // 4 full-height structural corner concrete pilasters + 1 mid-front divider column
  const totalWallH = groundH + floorH * 2;
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      const pilaster = createChamferedPrism(0.56, totalWallH, 0.56, 0.045);
      pilaster.translate(sx * (halfW - 0.18), totalWallH * 0.5, sz * (halfD - 0.18));
      concreteGeos.push(pilaster);
    }
  }
  const midFrontCol = createChamferedPrism(0.46, totalWallH, 0.44, 0.038);
  midFrontCol.translate(1.22, totalWallH * 0.5, halfD - 0.16);
  concreteGeos.push(midFrontCol);

  // Protruding chamfered concrete floor slab belt-courses between stories
  const slabYs = [groundH, groundH + floorH, totalWallH];
  for (const sy of slabYs) {
    const belt = createChamferedPrism(W + 0.34, 0.28, D + 0.34, 0.04);
    belt.translate(0, sy, 0);
    concreteGeos.push(belt);
  }

  // Structural rear & side masonry core recessed slightly behind pilasters (creates real shadow relief!)
  const rearWall = createChamferedPrism(W - 0.3, totalWallH, 0.44, 0.03);
  rearWall.translate(0, totalWallH * 0.5, -halfD + 0.26);
  tileGeos.push(rearWall);

  for (const sx of [-1, 1] as const) {
    const sideWall = createChamferedPrism(0.30, totalWallH, D - 0.5, 0.03);
    sideWall.translate(sx * (halfW - 0.34), totalWallH * 0.5, 0);
    tileGeos.push(sideWall);
  }

  // ---------------------------------------------------------------------------
  // B. MODULE 1: GROUND FLOOR COMMERCIAL STOREFRONT + STAIRWELL ENTRY (Y = 0..3.2m)
  // ---------------------------------------------------------------------------
  // Recessed dark interior storefront backing behind glass (gives genuine shop depth)
  const shopBack = createChamferedPrism(3.85, 2.55, 0.22, 0.02);
  shopBack.translate(-0.92, 1.56, halfD - 0.92);
  interiorGeos.push(shopBack);

  // Interior wooden/concrete display counter silhouette visible through window
  const shopCounter = createChamferedPrism(3.5, 0.88, 0.46, 0.025);
  shopCounter.translate(-0.92, 0.72, halfD - 0.62);
  concreteGeos.push(shopCounter);

  // Low masonry bulkhead wall below storefront glass
  const shopKneeWall = createChamferedPrism(3.85, 0.58, 0.34, 0.03);
  shopKneeWall.translate(-0.92, 0.48, halfD - 0.24);
  tileGeos.push(shopKneeWall);

  // Recessed steel storefront frame & vertical mullions
  const shopFrame = createRecessedFrame(3.86, 2.28, 0.22, 0.10, 0.015);
  shopFrame.translate(-0.92, 1.90, halfD - 0.22);
  steelGeos.push(shopFrame);

  for (const mx of [-2.05, -0.92, 0.22]) {
    const mullion = createChamferedPrism(0.08, 2.12, 0.14, 0.01);
    mullion.translate(mx, 1.90, halfD - 0.22);
    steelGeos.push(mullion);
  }
  const transom = createChamferedPrism(3.72, 0.08, 0.14, 0.01);
  transom.translate(-0.92, 2.48, halfD - 0.22);
  steelGeos.push(transom);

  // Storefront glass pane
  const shopGlass = new THREE.PlaneGeometry(3.68, 2.12);
  shopGlass.translate(-0.92, 1.90, halfD - 0.28);
  glassGeos.push(shopGlass);

  // Ribbed striped canvas storefront awning on angled steel struts
  const awningRedGeos: THREE.BufferGeometry[] = [];
  const awningCreamGeos: THREE.BufferGeometry[] = [];
  const stripeCount = 8;
  const awningTotalW = 3.92;
  const stripeW = awningTotalW / stripeCount;
  for (let i = 0; i < stripeCount; i++) {
    const sx = -0.92 - awningTotalW * 0.5 + stripeW * (i + 0.5);
    const panel = createChamferedPrism(stripeW - 0.008, 0.065, 1.18, 0.012);
    panel.rotateX(0.36);
    panel.translate(sx, 2.74, halfD + 0.42);

    const valance = createChamferedPrism(stripeW - 0.008, 0.22, 0.045, 0.008);
    valance.translate(sx, 2.45, halfD + 0.94);

    if (i % 2 === 0) {
      awningRedGeos.push(panel, valance);
    } else {
      awningCreamGeos.push(panel, valance);
    }
  }
  // Diagonal steel awning support brackets
  for (const bx of [-2.76, -0.92, 0.92]) {
    const strut = createChamferedPrism(0.055, 0.055, 1.08, 0.008);
    strut.rotateX(-0.42);
    strut.translate(bx, 2.38, halfD + 0.34);
    steelGeos.push(strut);
  }

  // Right-side stairwell steel entry door + concrete rain canopy
  const entryWall = createChamferedPrism(1.62, groundH, 0.34, 0.03);
  entryWall.translate(2.14, groundH * 0.5, halfD - 0.38);
  tileGeos.push(entryWall);

  const doorFrame = createRecessedFrame(1.16, 2.26, 0.24, 0.09, 0.014);
  doorFrame.translate(2.14, 1.38, halfD - 0.16);
  steelGeos.push(doorFrame);

  const doorLeaf = createChamferedPrism(0.98, 2.08, 0.08, 0.012);
  doorLeaf.translate(2.14, 1.38, halfD - 0.19);
  utilityGeos.push(doorLeaf);

  const doorCanopy = createChamferedPrism(1.52, 0.14, 0.86, 0.025, { topTaperZ: 0.92 });
  doorCanopy.rotateX(0.08);
  doorCanopy.translate(2.14, 2.66, halfD + 0.28);
  concreteGeos.push(doorCanopy);

  // Street-level utility meter box on left side facade
  const meterBox = createChamferedPrism(0.18, 0.62, 0.44, 0.02);
  meterBox.translate(-halfW - 0.06, 1.48, 0.95);
  utilityGeos.push(meterBox);

  // ---------------------------------------------------------------------------
  // C. MODULES 2 & 3: REPEATABLE UPPER FLOOR ARCHITECTURAL TIERS
  // ---------------------------------------------------------------------------
  const addUpperFloorModule = (floorIndex: number, yBase: number) => {
    const yMid = yBase + floorH * 0.5;

    // Front recessed masonry spandrel wall sitting cleanly behind window glazing (front face at halfD - 0.28)
    const frontSpandrel = createChamferedPrism(W - 0.5, floorH - 0.14, 0.28, 0.03);
    frontSpandrel.translate(0, yMid, halfD - 0.42);
    tileGeos.push(frontSpandrel);

    // Twin recessed main front window bays (left & center) + stairwell window (right)
    const winCentersX = [-1.72, -0.08, 2.14];
    const winWidths = [1.46, 1.46, 1.06];

    winCentersX.forEach((wx, idx) => {
      const ww = winWidths[idx];
      const wh = idx === 2 ? 1.65 : 1.78;
      const wy = yBase + 1.56;

      // Protruding chamfered concrete lintel & sill
      const lintel = createChamferedPrism(ww + 0.24, 0.18, 0.28, 0.022);
      lintel.translate(wx, wy + wh * 0.5 + 0.08, halfD - 0.14);
      concreteGeos.push(lintel);

      const sill = createChamferedPrism(ww + 0.28, 0.14, 0.34, 0.022);
      sill.translate(wx, wy - wh * 0.5 - 0.05, halfD - 0.10);
      concreteGeos.push(sill);

      // Recessed dark steel window frame + center mullion
      const frame = createRecessedFrame(ww, wh, 0.22, 0.085, 0.012);
      frame.translate(wx, wy, halfD - 0.17);
      steelGeos.push(frame);

      const centerBar = createChamferedPrism(0.06, wh - 0.14, 0.12, 0.008);
      centerBar.translate(wx, wy, halfD - 0.17);
      steelGeos.push(centerBar);

      // Horizontal glazing bar for authentic Japanese apartment sliding sash
      const midTransom = createChamferedPrism(ww - 0.14, 0.05, 0.09, 0.006);
      midTransom.translate(wx, wy + wh * 0.18, halfD - 0.18);
      steelGeos.push(midTransom);

      // Alternating warm lit interior window vs cool dark smoked apartment glass
      if ((floorIndex + idx) % 2 === 0) {
        const glow = new THREE.PlaneGeometry(ww - 0.15, wh - 0.15);
        glow.translate(wx, wy, halfD - 0.22);
        interiorGeos.push(glow);
      } else {
        const glass = new THREE.PlaneGeometry(ww - 0.15, wh - 0.15);
        glass.translate(wx, wy, halfD - 0.22);
        glassGeos.push(glass);
      }
    });

    // Cantilevered concrete balcony slab across the 2 residential bays (left/center)
    const balcW = 3.76;
    const balcX = -0.92;
    const balcD = 0.92;
    const balcSlab = createChamferedPrism(balcW, 0.20, balcD, 0.03);
    balcSlab.translate(balcX, yBase + 0.06, halfD + balcD * 0.5 - 0.04);
    concreteGeos.push(balcSlab);

    // Welded steel balcony railing (top bar, bottom rail, corner posts, vertical pickets)
    const railH = 0.96;
    const railZ = halfD + balcD - 0.10;
    const topRail = createChamferedPrism(balcW - 0.08, 0.055, 0.055, 0.01);
    topRail.translate(balcX, yBase + 0.16 + railH, railZ);
    steelGeos.push(topRail);

    const botRail = createChamferedPrism(balcW - 0.08, 0.045, 0.045, 0.008);
    botRail.translate(balcX, yBase + 0.28, railZ);
    steelGeos.push(botRail);

    for (const side of [-1, 1] as const) {
      const sideTop = createChamferedPrism(0.055, 0.055, balcD - 0.06, 0.01);
      sideTop.translate(balcX + side * (balcW * 0.5 - 0.06), yBase + 0.16 + railH, halfD + balcD * 0.5 - 0.04);
      steelGeos.push(sideTop);
    }

    const picketCount = 11;
    for (let p = 0; p < picketCount; p++) {
      const px = balcX - (balcW * 0.5 - 0.08) + (p / (picketCount - 1)) * (balcW - 0.16);
      const picket = createChamferedPrism(0.036, railH, 0.036, 0.006);
      picket.translate(px, yBase + 0.16 + railH * 0.5, railZ);
      steelGeos.push(picket);
    }

    // Wall-mounted AC outdoor condenser unit on balcony + refrigerant conduit pipe
    const acX = balcX + 1.48;
    const acY = yBase + 0.44;
    const acZ = halfD + 0.30;
    const acBody = createChamferedPrism(0.68, 0.52, 0.34, 0.025);
    acBody.translate(acX, acY, acZ);
    utilityGeos.push(acBody);

    const fanRing = createRecessedFrame(0.36, 0.36, 0.05, 0.035, 0.006);
    fanRing.translate(acX - 0.10, acY, acZ + 0.17);
    steelGeos.push(fanRing);

    const acPipeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(acX + 0.34, acY - 0.08, acZ - 0.04),
      new THREE.Vector3(acX + 0.46, acY - 0.16, acZ - 0.14),
      new THREE.Vector3(acX + 0.42, acY + 0.24, halfD - 0.06),
    ]);
    const acPipe = new THREE.TubeGeometry(acPipeCurve, 10, 0.022, 6, false);
    applyBoxUVs(acPipe, 2.0);
    steelGeos.push(acPipe);

    // Side facade recessed window bays (glass cleanly proud of recessed sideWall!)
    for (const sx of [-1, 1] as const) {
      for (const wz of [-1.05, 0.95]) {
        const sFrame = createRecessedFrame(1.12, 1.38, 0.20, 0.08, 0.012);
        sFrame.rotateY(Math.PI * 0.5);
        sFrame.translate(sx * (halfW - 0.12), yBase + 1.58, wz);
        steelGeos.push(sFrame);

        const sBar = createChamferedPrism(0.08, 1.24, 0.055, 0.006);
        sBar.translate(sx * (halfW - 0.13), yBase + 1.58, wz);
        steelGeos.push(sBar);

        const sGlass = new THREE.PlaneGeometry(0.98, 1.24);
        sGlass.rotateY(sx > 0 ? Math.PI * 0.5 : -Math.PI * 0.5);
        sGlass.translate(sx * (halfW - 0.165), yBase + 1.58, wz);
        glassGeos.push(sGlass);
      }
    }
  };

  addUpperFloorModule(2, groundH);
  addUpperFloorModule(3, groundH + floorH);

  // Full-height corner rainwater drainpipe + mounting collars (left-front corner)
  const drainPipe = new THREE.CylinderGeometry(0.055, 0.055, totalWallH + 0.2, 8);
  drainPipe.translate(-halfW - 0.04, totalWallH * 0.5, halfD - 0.48);
  applyBoxUVs(drainPipe, 1.0);
  steelGeos.push(drainPipe);

  for (const cy of [1.6, 3.6, 5.6, 7.6, 9.0]) {
    const collar = createChamferedPrism(0.14, 0.08, 0.16, 0.01);
    collar.translate(-halfW - 0.02, cy, halfD - 0.48);
    steelGeos.push(collar);
  }

  // Vertical weathered Japanese shop signboard on right-front facade spanning floors 2-3
  const signFrame = createChamferedPrism(0.76, 3.35, 0.18, 0.025);
  signFrame.translate(halfW + 0.36, groundH + 2.55, halfD - 0.12);
  steelGeos.push(signFrame);

  for (const sy of [groundH + 1.35, groundH + 3.75]) {
    const bracket = createChamferedPrism(0.46, 0.08, 0.10, 0.01);
    bracket.translate(halfW + 0.14, sy, halfD - 0.12);
    steelGeos.push(bracket);
  }

  // Sign front & back graphic plates
  const signFaceFront = new THREE.PlaneGeometry(0.66, 3.22);
  signFaceFront.translate(halfW + 0.36, groundH + 2.55, halfD - 0.025);
  const signFaceBack = new THREE.PlaneGeometry(0.66, 3.22);
  signFaceBack.rotateY(Math.PI);
  signFaceBack.translate(halfW + 0.36, groundH + 2.55, halfD - 0.215);
  root.add(
    createStylizedMesh(mergeParts([signFaceFront, signFaceBack]), shopSignMat, {
      name: 'vertical_shop_sign',
      creaseThresholdDeg: 0,
    }),
  );

  // ---------------------------------------------------------------------------
  // D. MODULE 4: ROOFTOP PARAPET, STAIRWELL BULKHEAD, WATER TANK & ANTENNA
  // ---------------------------------------------------------------------------
  const roofY = totalWallH + 0.14;
  const parapetH = 0.72;
  const parapetT = 0.32;

  const pFront = createChamferedPrism(W + 0.16, parapetH, parapetT, 0.03);
  pFront.translate(0, roofY + parapetH * 0.5, halfD - parapetT * 0.5);
  const pBack = createChamferedPrism(W + 0.16, parapetH, parapetT, 0.03);
  pBack.translate(0, roofY + parapetH * 0.5, -halfD + parapetT * 0.5);
  const pLeft = createChamferedPrism(parapetT, parapetH, D - parapetT * 2 + 0.06, 0.03);
  pLeft.translate(-halfW + parapetT * 0.5, roofY + parapetH * 0.5, 0);
  const pRight = createChamferedPrism(parapetT, parapetH, D - parapetT * 2 + 0.06, 0.03);
  pRight.translate(halfW - parapetT * 0.5, roofY + parapetH * 0.5, 0);
  concreteGeos.push(pFront, pBack, pLeft, pRight);

  // Rooftop stair access bulkhead penthouse (rear-right)
  const bulkhead = createChamferedPrism(2.1, 1.85, 2.2, 0.05);
  bulkhead.translate(1.55, roofY + 0.92, -0.95);
  concreteGeos.push(bulkhead);

  const bulkCap = createChamferedPrism(2.3, 0.16, 2.4, 0.03);
  bulkCap.translate(1.55, roofY + 1.88, -0.95);
  concreteGeos.push(bulkCap);

  const bulkDoor = createChamferedPrism(0.92, 1.52, 0.10, 0.015);
  bulkDoor.translate(1.55, roofY + 0.80, 0.16);
  steelGeos.push(bulkDoor);

  // Elevated faceted cylindrical steel rooftop water tank on 4 braced steel legs
  const tankX = -1.65;
  const tankZ = -0.85;
  const tankBaseY = roofY + 0.88;
  const tankPts = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.76, 0.0),
    new THREE.Vector2(0.82, 0.08),
    new THREE.Vector2(0.82, 1.18),
    new THREE.Vector2(0.72, 1.32),
    new THREE.Vector2(0.24, 1.44),
    new THREE.Vector2(0.0, 1.44),
  ];
  const rawTank = new THREE.LatheGeometry(tankPts, 12);
  applyBoxUVs(rawTank, 0.8);
  const tankGeo = splitCreaseNormals(rawTank, 34);
  rawTank.dispose();
  tankGeo.translate(tankX, tankBaseY, tankZ);
  utilityGeos.push(tankGeo);

  // 4 steel support legs + tank riser pipe + roof HVAC duct
  for (const lx of [-0.52, 0.52]) {
    for (const lz of [-0.52, 0.52]) {
      const leg = createChamferedPrism(0.09, 0.96, 0.09, 0.012);
      leg.translate(tankX + lx, roofY + 0.48, tankZ + lz);
      steelGeos.push(leg);
    }
  }
  const riser = new THREE.CylinderGeometry(0.075, 0.075, 0.96, 8);
  riser.translate(tankX, roofY + 0.48, tankZ);
  applyBoxUVs(riser, 1.0);
  steelGeos.push(riser);

  // Roof HVAC blower unit (front-left)
  const roofHvac = createChamferedPrism(1.35, 0.72, 1.05, 0.035);
  roofHvac.translate(-1.35, roofY + 0.36, 1.05);
  utilityGeos.push(roofHvac);

  // Twin rooftop antenna mast + crossbars
  const mast = new THREE.CylinderGeometry(0.025, 0.04, 2.2, 6);
  mast.translate(2.25, roofY + 2.85, -1.55);
  applyBoxUVs(mast, 1.0);
  steelGeos.push(mast);

  for (const ay of [roofY + 3.45, roofY + 3.75]) {
    const bar = createChamferedPrism(1.15, 0.03, 0.03, 0.005);
    bar.translate(2.25, ay, -1.55);
    steelGeos.push(bar);
  }

  // ---------------------------------------------------------------------------
  // E. BAKE TF2/BORDERLANDS VERTICAL AO GRADIENTS & ATTACH ALL MERGED LAYERS
  // ---------------------------------------------------------------------------
  const mergedConcrete = mergeParts(concreteGeos);
  bakeVerticalGradientAO(mergedConcrete, 0.68, 1.06, 0, totalWallH + 2.0);
  root.add(
    createStylizedMesh(mergedConcrete, concreteMat, {
      name: 'concrete_structure',
      creaseThresholdDeg: 46,
    }),
  );

  const mergedTile = mergeParts(tileGeos);
  bakeVerticalGradientAO(mergedTile, 0.66, 1.05, 0, totalWallH);
  root.add(
    createStylizedMesh(mergedTile, facadeTileMat, {
      name: 'masonry_facade',
      creaseThresholdDeg: 48,
    }),
  );

  const mergedSteel = mergeParts(steelGeos);
  bakeVerticalGradientAO(mergedSteel, 0.72, 1.04, 0, totalWallH + 3.5);
  root.add(
    createStylizedMesh(mergedSteel, darkSteelMat, {
      name: 'steel_frames_and_railings',
      creaseThresholdDeg: 0,
    }),
  );

  const mergedUtility = mergeParts(utilityGeos);
  bakeVerticalGradientAO(mergedUtility, 0.74, 1.06, 0, totalWallH + 2.5);
  root.add(
    createStylizedMesh(mergedUtility, utilityMetalMat, {
      name: 'hvac_and_water_tank',
      creaseThresholdDeg: 46,
    }),
  );

  const mergedAwningRed = mergeParts(awningRedGeos);
  bakeVerticalGradientAO(mergedAwningRed, 0.76, 1.04);
  root.add(
    createStylizedMesh(mergedAwningRed, awningRedMat, {
      name: 'awning_red',
      creaseThresholdDeg: 48,
    }),
  );

  const mergedAwningCream = mergeParts(awningCreamGeos);
  bakeVerticalGradientAO(mergedAwningCream, 0.78, 1.05);
  root.add(
    createStylizedMesh(mergedAwningCream, awningCreamMat, {
      name: 'awning_cream',
      creaseThresholdDeg: 48,
    }),
  );

  const mergedGlass = mergeParts(glassGeos);
  bakeVerticalGradientAO(mergedGlass, 0.74, 1.08);
  root.add(
    createStylizedMesh(mergedGlass, windowGlassMat, {
      name: 'window_glass',
      creaseThresholdDeg: 0,
      castShadow: false,
    }),
  );

  const mergedInterior = mergeParts(interiorGeos);
  root.add(
    createStylizedMesh(mergedInterior, warmInteriorMat, {
      name: 'interior_backing',
      creaseThresholdDeg: 0,
      castShadow: false,
    }),
  );

  groundObjectAtZero(root);
  const stats = computeAssetStats(root);
  return { meta, root, stats };
}
