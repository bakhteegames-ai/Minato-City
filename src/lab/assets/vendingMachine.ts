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
  createRubberMaterial,
  createStylizedMesh,
  createVendingGraphicMaterial,
  createVendingHeaderMaterial,
} from '../stylizedTextures';
import { ASSET_CATALOG, type BuiltLabAsset } from './types';

/**
 * Generates an individual faceted beverage can or tall bottle using LatheGeometry.
 */
function createDrinkContainerGeo(isBottle: boolean): THREE.BufferGeometry {
  const pts = isBottle
    ? [
        new THREE.Vector2(0.002, 0.0),
        new THREE.Vector2(0.032, 0.0),
        new THREE.Vector2(0.034, 0.015),
        new THREE.Vector2(0.034, 0.115),
        new THREE.Vector2(0.022, 0.155),
        new THREE.Vector2(0.013, 0.175),
        new THREE.Vector2(0.015, 0.192),
        new THREE.Vector2(0.002, 0.192),
      ]
    : [
        new THREE.Vector2(0.002, 0.0),
        new THREE.Vector2(0.027, 0.0),
        new THREE.Vector2(0.033, 0.012),
        new THREE.Vector2(0.033, 0.118),
        new THREE.Vector2(0.026, 0.132),
        new THREE.Vector2(0.002, 0.132),
      ];
  const raw = new THREE.LatheGeometry(pts, 10);
  applyBoxUVs(raw, 4.0);
  const geo = splitCreaseNormals(raw, 34);
  raw.dispose();
  return geo;
}

/**
 * 3. Уличный торговый автомат (Street Japanese Beverage Vending Machine).
 * Dimensions: ~1.22m W × 1.98m H × 0.80m D.
 * Chamfered industrial steel cabinet with genuine recessed illuminated showcase bay,
 * 18 individual lathed drink cans/bottles, beveled stainless control panel,
 * recessed dispensing chute with hinged flap, side ventilation louvers & power conduit.
 */
export function buildVendingMachineAsset(opts: { includeCreaseInk?: boolean } = {}): BuiltLabAsset {
  const meta = ASSET_CATALOG.find((m) => m.id === 'vending')!;
  const root = new THREE.Group();
  root.name = 'Asset_VendingMachine';
  const ink = opts.includeCreaseInk ?? true;

  // Weathered retro Japanese vermilion-rust + aged cream + dark gunmetal steel
  const cabinetRedMat = createPaintedMetalMaterial({
    baseHex: '#a53b31',
    lightHex: '#c25447',
    darkHex: '#71221d',
    wearHex: '#d5cbb8',
    roughness: 0.64,
    metalness: 0.24,
    seed: 301,
  });

  const creamEnamelMat = createPaintedMetalMaterial({
    baseHex: '#d3c8b4',
    lightHex: '#e6dcc9',
    darkHex: '#9f9482',
    wearHex: '#6c665d',
    roughness: 0.68,
    metalness: 0.16,
    panelGrid: false,
    seed: 302,
  });

  const gunmetalMat = createPaintedMetalMaterial({
    baseHex: '#2c323b',
    lightHex: '#434b57',
    darkHex: '#181c22',
    roughness: 0.72,
    metalness: 0.42,
    panelGrid: false,
    seed: 303,
  });

  const brushedSteelMat = createPaintedMetalMaterial({
    baseHex: '#8d969f',
    lightHex: '#b4bcc4',
    darkHex: '#5a626a',
    roughness: 0.46,
    metalness: 0.64,
    panelGrid: false,
    seed: 304,
  });

  const graphicDecalMat = createVendingGraphicMaterial(305);
  const headerDecalMat = createVendingHeaderMaterial();
  const rubberFootMat = createRubberMaterial(306);

  const backlitPanelMat = new THREE.MeshStandardMaterial({
    color: 0xf4ecd8,
    emissive: 0xfff0cf,
    emissiveIntensity: 0.65,
    roughness: 0.7,
    metalness: 0.05,
  });

  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xaad0dc,
    roughness: 0.14,
    metalness: 0.2,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
  });

  const buttonWarmMat = new THREE.MeshStandardMaterial({
    color: 0xd99b43,
    emissive: 0xd98828,
    emissiveIntensity: 0.35,
    roughness: 0.5,
  });

  const buttonColdMat = new THREE.MeshStandardMaterial({
    color: 0x3b86a8,
    emissive: 0x2c789c,
    emissiveIntensity: 0.35,
    roughness: 0.5,
  });

  // ---------------------------------------------------------------------------
  // 1. MAIN CHAMFERED CABINET BODY (recessed front layout — NOT a solid box!)
  // ---------------------------------------------------------------------------
  const redGeos: THREE.BufferGeometry[] = [];

  // Rear structural core (Z from -0.38 to +0.16)
  const rearCore = createChamferedPrism(1.16, 1.88, 0.54, 0.032);
  rearCore.translate(0, 1.02, -0.11);
  redGeos.push(rearCore);

  // Left & right full-height chamfered front side cheeks forming the recessed cavities
  for (const side of [-1, 1] as const) {
    const cheek = createChamferedPrism(0.11, 1.86, 0.24, 0.022);
    cheek.translate(side * 0.525, 1.02, 0.24);
    redGeos.push(cheek);
  }

  // Top rain-drip visor overhang cap
  const topCap = createChamferedPrism(1.22, 0.11, 0.80, 0.026, { topTaperX: 0.96, topTaperZ: 0.96 });
  topCap.translate(0, 1.94, 0.01);
  redGeos.push(topCap);

  // Mid structural divider beam between showcase and dispensing bay
  const midDivider = createChamferedPrism(0.96, 0.22, 0.22, 0.018);
  midDivider.translate(0, 0.80, 0.24);
  redGeos.push(midDivider);

  // Lower front kick-beam under dispensing chute
  const lowBeam = createChamferedPrism(0.96, 0.26, 0.22, 0.018);
  lowBeam.translate(0, 0.22, 0.24);
  redGeos.push(lowBeam);

  const mergedCabinet = mergeParts(redGeos);
  bakeVerticalGradientAO(mergedCabinet, 0.66, 1.05, 0.08, 2.0);
  root.add(
    createStylizedMesh(mergedCabinet, cabinetRedMat, {
      name: 'vending_cabinet',
      creaseThresholdDeg: ink ? 44 : 0,
    }),
  );

  // ---------------------------------------------------------------------------
  // 2. CREAM ENAMEL HEADER & DISPLAY BEZEL SURROUND
  // ---------------------------------------------------------------------------
  const creamGeos: THREE.BufferGeometry[] = [];
  const displayFrame = createRecessedFrame(1.02, 0.90, 0.12, 0.055, 0.012);
  displayFrame.translate(0, 1.38, 0.31);
  creamGeos.push(displayFrame);

  // Top fascia trim bar
  const topTrim = createChamferedPrism(1.02, 0.11, 0.12, 0.014);
  topTrim.translate(0, 1.855, 0.30);
  creamGeos.push(topTrim);

  const mergedCream = mergeParts(creamGeos);
  bakeVerticalGradientAO(mergedCream, 0.78, 1.06);
  root.add(
    createStylizedMesh(mergedCream, creamEnamelMat, {
      name: 'cream_bezel',
      creaseThresholdDeg: ink ? 44 : 0,
    }),
  );

  // Dedicated aspect-matched top header & lower instruction graphic plates
  const topHeaderGeo = new THREE.PlaneGeometry(0.92, 0.095);
  topHeaderGeo.translate(0, 1.855, 0.364);
  root.add(
    createStylizedMesh(topHeaderGeo, headerDecalMat, {
      name: 'top_header_plate',
      creaseThresholdDeg: 0,
      castShadow: false,
    }),
  );

  const lowerDecalGeo = new THREE.PlaneGeometry(0.88, 0.22);
  lowerDecalGeo.translate(0, 0.22, 0.354);
  root.add(
    createStylizedMesh(lowerDecalGeo, graphicDecalMat, {
      name: 'front_graphic_plate',
      creaseThresholdDeg: 0,
      castShadow: false,
    }),
  );

  // ---------------------------------------------------------------------------
  // 3. ILLUMINATED SHOWCASE INTERIOR + 3 SHELVES + 18 DRINKS + GLASS PANE
  // ---------------------------------------------------------------------------
  const backlitGeo = new THREE.PlaneGeometry(0.92, 0.78);
  backlitGeo.translate(0, 1.38, 0.175);
  root.add(
    createStylizedMesh(backlitGeo, backlitPanelMat, {
      name: 'vitrine_backlight',
      creaseThresholdDeg: 0,
      castShadow: false,
    }),
  );

  const shelfGeos: THREE.BufferGeometry[] = [];
  const shelfYs = [1.06, 1.31, 1.56];
  for (const sy of shelfYs) {
    const shelf = createChamferedPrism(0.90, 0.022, 0.15, 0.005);
    shelf.translate(0, sy, 0.235);
    shelfGeos.push(shelf);
    // Front price rail lip
    const lip = createChamferedPrism(0.90, 0.032, 0.018, 0.004);
    lip.translate(0, sy - 0.005, 0.305);
    shelfGeos.push(lip);
  }
  const mergedShelves = mergeParts(shelfGeos);
  bakeVerticalGradientAO(mergedShelves, 0.85, 1.04);
  root.add(createStylizedMesh(mergedShelves, brushedSteelMat, { name: 'drink_shelves', creaseThresholdDeg: 0 }));

  // 18 individual faceted cans & bottles grouped by 5 muted retro drink colors
  const drinkColors = ['#2e6a4f', '#b84232', '#355f85', '#c88d36', '#d8cfbe'];
  const drinkMats = drinkColors.map((hex, i) =>
    createPaintedMetalMaterial({
      baseHex: hex,
      roughness: 0.48,
      metalness: 0.35,
      panelGrid: false,
      seed: 330 + i,
    }),
  );
  const groupedDrinkGeos: THREE.BufferGeometry[][] = drinkColors.map(() => []);

  shelfYs.forEach((sy, rowIdx) => {
    const isBottleRow = rowIdx === 2;
    for (let col = 0; col < 6; col++) {
      const colorIdx = (rowIdx * 2 + Math.floor(col / 2)) % drinkColors.length;
      const g = createDrinkContainerGeo(isBottleRow);
      const x = -0.35 + col * 0.14;
      g.translate(x, sy + 0.011, 0.245);
      bakeVerticalGradientAO(g, 0.8, 1.08);
      groupedDrinkGeos[colorIdx].push(g);
    }
  });

  groupedDrinkGeos.forEach((list, idx) => {
    if (list.length === 0) return;
    root.add(
      createStylizedMesh(mergeParts(list), drinkMats[idx], {
        name: `drinks_group_${idx + 1}`,
        creaseThresholdDeg: 0,
      }),
    );
  });

  // Vitrine translucent protective glass pane
  const vitrineGlass = new THREE.PlaneGeometry(0.91, 0.79);
  vitrineGlass.translate(0, 1.38, 0.335);
  root.add(
    createStylizedMesh(vitrineGlass, glassMat, {
      name: 'vitrine_glass',
      creaseThresholdDeg: 0,
      castShadow: false,
      receiveShadow: false,
    }),
  );

  // ---------------------------------------------------------------------------
  // 4. CONTROL FASCIA, COIN / BILL ACCEPTOR, SELECTION BUTTONS
  // ---------------------------------------------------------------------------
  const controlGeos: THREE.BufferGeometry[] = [];
  // Brushed stainless payment bezel on right side of mid divider
  const payBezel = createChamferedPrism(0.32, 0.20, 0.06, 0.01);
  payBezel.translate(0.28, 0.80, 0.35);
  controlGeos.push(payBezel);

  // Coin return pocket & slot trims
  const coinHood = createChamferedPrism(0.11, 0.08, 0.04, 0.008);
  coinHood.translate(0.35, 0.76, 0.38);
  controlGeos.push(coinHood);

  const billBezel = createChamferedPrism(0.12, 0.055, 0.035, 0.006);
  billBezel.translate(0.20, 0.84, 0.38);
  controlGeos.push(billBezel);

  // Side protective stainless bumper strips framing pickup chute
  for (const side of [-1, 1] as const) {
    const rail = createChamferedPrism(0.045, 0.38, 0.07, 0.008);
    rail.translate(side * 0.44, 0.52, 0.34);
    controlGeos.push(rail);
  }

  const mergedControl = mergeParts(controlGeos);
  bakeVerticalGradientAO(mergedControl, 0.76, 1.06);
  root.add(
    createStylizedMesh(mergedControl, brushedSteelMat, {
      name: 'control_hardware',
      creaseThresholdDeg: 0,
    }),
  );

  // Tactile selection buttons (6 cold + 6 hot along the mid control bar)
  const coldBtnGeos: THREE.BufferGeometry[] = [];
  const hotBtnGeos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const x = -0.37 + i * 0.088;
    const coldBtn = createChamferedPrism(0.058, 0.032, 0.03, 0.005);
    coldBtn.translate(x, 0.845, 0.355);
    coldBtnGeos.push(coldBtn);

    const hotBtn = createChamferedPrism(0.058, 0.032, 0.03, 0.005);
    hotBtn.translate(x, 0.765, 0.355);
    hotBtnGeos.push(hotBtn);
  }
  root.add(
    createStylizedMesh(mergeParts(coldBtnGeos), buttonColdMat, {
      name: 'buttons_cold',
      creaseThresholdDeg: 0,
    }),
  );
  root.add(
    createStylizedMesh(mergeParts(hotBtnGeos), buttonWarmMat, {
      name: 'buttons_hot',
      creaseThresholdDeg: 0,
    }),
  );

  // ---------------------------------------------------------------------------
  // 5. RECESSED DISPENSING CHUTE, HINGED FLAP, SIDE LOUVERS, REAR CONDUIT & FEET
  // ---------------------------------------------------------------------------
  const darkGeos: THREE.BufferGeometry[] = [];

  // Dispensing chute inner dark cavity walls + angled hinged flap
  const chuteFrame = createRecessedFrame(0.84, 0.36, 0.16, 0.045, 0.01);
  chuteFrame.translate(0, 0.52, 0.27);
  darkGeos.push(chuteFrame);

  const chuteFlap = createChamferedPrism(0.72, 0.24, 0.03, 0.008);
  chuteFlap.rotateX(-0.24);
  chuteFlap.translate(0, 0.54, 0.25);
  darkGeos.push(chuteFlap);

  // Lower recessed shadow kickplate
  const kickplate = createChamferedPrism(1.06, 0.08, 0.66, 0.012);
  kickplate.translate(0, 0.08, -0.02);
  darkGeos.push(kickplate);

  // Side heat-exchange louver vents (6 angled slats on each side)
  for (const side of [-1, 1] as const) {
    const ventBezel = createRecessedFrame(0.36, 0.38, 0.04, 0.03, 0.006);
    ventBezel.rotateY(Math.PI * 0.5);
    ventBezel.translate(side * 0.585, 0.42, -0.10);
    darkGeos.push(ventBezel);

    for (let s = 0; s < 5; s++) {
      const slat = createChamferedPrism(0.03, 0.022, 0.28, 0.004);
      slat.rotateZ(side * 0.32);
      slat.translate(side * 0.59, 0.29 + s * 0.064, -0.10);
      darkGeos.push(slat);
    }
  }

  // Rear industrial junction box + bent power conduit pipe
  const jBox = createChamferedPrism(0.24, 0.28, 0.09, 0.012);
  jBox.translate(-0.28, 0.46, -0.41);
  darkGeos.push(jBox);

  const conduitCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.28, 0.32, -0.41),
    new THREE.Vector3(-0.28, 0.14, -0.43),
    new THREE.Vector3(-0.08, 0.08, -0.41),
    new THREE.Vector3(0.18, 0.08, -0.36),
  ]);
  const conduitGeo = new THREE.TubeGeometry(conduitCurve, 14, 0.018, 7, false);
  applyBoxUVs(conduitGeo, 2.0);
  darkGeos.push(conduitGeo);

  const mergedDark = mergeParts(darkGeos);
  bakeVerticalGradientAO(mergedDark, 0.62, 1.0);
  root.add(createStylizedMesh(mergedDark, gunmetalMat, { name: 'chute_and_vents', creaseThresholdDeg: 0 }));

  // 4 heavy rubber leveling feet
  const footGeos: THREE.BufferGeometry[] = [];
  for (const fx of [-0.46, 0.46]) {
    for (const fz of [-0.28, 0.22]) {
      const foot = createChamferedPrism(0.11, 0.06, 0.11, 0.014, { topTaperX: 0.75, topTaperZ: 0.75 });
      foot.translate(fx, 0.03, fz);
      footGeos.push(foot);
    }
  }
  const mergedFeet = mergeParts(footGeos);
  bakeVerticalGradientAO(mergedFeet, 0.65, 0.95);
  root.add(createStylizedMesh(mergedFeet, rubberFootMat, { name: 'leveling_feet', creaseThresholdDeg: 0 }));

  groundObjectAtZero(root);
  const stats = computeAssetStats(root);
  return { meta, root, stats };
}
