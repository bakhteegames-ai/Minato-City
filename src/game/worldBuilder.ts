import * as THREE from 'three';
import { enableOutlineLayer, type AnimatedGlbInstance } from './assetPipeline';
import { buildVendingMachineAsset } from '../lab/assets/vendingMachine';
import type { ColliderBox, LightingMood, VehicleKind } from './types';
import type { MinatoTextureBank } from './textures';
import {
  B1_GENERATOR,
  B1_PIT,
  OVERLOOK_DECK,
  SHUTTER_SPECS,
  getTerrainHeightAt,
  type NeonFlickerStyle,
} from './rules';
import {
  buildB1Generator,
  buildConvexTrafficMirror,
  buildCourtyardLantern,
  buildParkBench,
  buildParkedBicycle,
  buildSakuraTree,
  buildSculptedVehicle,
  buildSecurityShutterVisual,
  buildWaterTower,
  type B1GeneratorVisual,
  type SecurityShutterVisual,
  type SharedModelAssets,
} from './models';
import {
  buildModularUrbanUpperBlock,
  buildSculptedAwning,
  buildSculptedCobraStreetlamp,
} from './sculptedArchitecture';

export interface VehicleSlotInstance {
  kind: VehicleKind;
  group: THREE.Group;
  proxyGroup: THREE.Group;
  customSlotMount: THREE.Group;
  glbInstance: AnimatedGlbInstance | null;
  destructible: boolean;
  x: number;
  z: number;
  elevY: number;
  hx: number;
  hz: number;
  hp: number;
  maxHp: number;
  destroyed: boolean;
  setCharred: (charred?: boolean) => void;
}

export interface OccludableVolume {
  materials: THREE.MeshStandardMaterial[];
  objects?: THREE.Object3D[];
  minOpacity?: number;
  zone: { x1: number; z1: number; x2: number; z2: number };
  extraZones?: Array<{ x1: number; z1: number; x2: number; z2: number }>;
}

export interface NeonFlickerItem {
  mat: THREE.MeshStandardMaterial;
  halo?: THREE.Sprite;
  baseEmissive: number;
  baseHaloOpacity: number;
  phase: number;
  style: NeonFlickerStyle;
}

export interface SteamVentSpec {
  x: number;
  z: number;
  tint: number;
}

export interface MinatoWorldRefs {
  colliders: ColliderBox[];
  occludables: OccludableVolume[];
  neonFlickers: NeonFlickerItem[];
  steamVents: SteamVentSpec[];
  sirenSprites: Array<{ red: THREE.Sprite; blue: THREE.Sprite }>;
  vehicles: VehicleSlotInstance[];
  shutters: SecurityShutterVisual[];
  b1Generator: B1GeneratorVisual;
  parkCyanLight: THREE.PointLight;
  floodHalo: THREE.Sprite;
  lighthouseBeam: THREE.Mesh;
  hemiLight: THREE.HemisphereLight;
  moonLight: THREE.DirectionalLight;
  fog: THREE.FogExp2;
  applyMood: (mood: LightingMood) => void;
}

export function buildMinatoWorld(
  scene: THREE.Scene,
  textures: MinatoTextureBank,
  assets: SharedModelAssets,
  isSoftwareGl: boolean,
): MinatoWorldRefs {
  const colliders: ColliderBox[] = [];
  const occludables: OccludableVolume[] = [];
  const neonFlickers: NeonFlickerItem[] = [];
  const steamVents: SteamVentSpec[] = [];
  const sirenSprites: Array<{ red: THREE.Sprite; blue: THREE.Sprite }> = [];
  const vehicles: VehicleSlotInstance[] = [];

  // Stage-Gate v2 Dual-Lighting Registry: cleanly switches between Restrained Noir Night and Neutral Daylight!
  const nightOnlyVisuals: THREE.Object3D[] = [];
  const nightEmissives: Array<{ mat: THREE.MeshStandardMaterial; night: number; day: number }> = [];
  const registerNightEmissive = (mat: THREE.MeshStandardMaterial, nightIntensity: number, dayIntensity = 0.08) => {
    nightEmissives.push({ mat, night: nightIntensity, day: dayIntensity });
  };

  // Base atmospheric fog & sky — Restrained Noir Night (no monochrome blue-violet crush!)
  const fog = new THREE.FogExp2(0x161e2c, 0.0082);
  scene.background = new THREE.Color(0x111722);
  scene.fog = fog;

  // Balanced 3-Point Lighting Rig: Neutral Slate Sky Fill + Cool Moonlight Key + Warm Storefront Rim
  const hemiLight = new THREE.HemisphereLight(0x7b92b8, 0x2f3440, 1.12);
  scene.add(hemiLight);

  const moonLight = new THREE.DirectionalLight(0xc4d4e8, 1.32);
  moonLight.position.set(28, 46, -34);
  if (!isSoftwareGl) {
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.set(1024, 1024);
    moonLight.shadow.camera.near = 6;
    moonLight.shadow.camera.far = 135;
    moonLight.shadow.camera.left = -46;
    moonLight.shadow.camera.right = 46;
    moonLight.shadow.camera.top = 40;
    moonLight.shadow.camera.bottom = -40;
    moonLight.shadow.bias = -0.0005;
    moonLight.shadow.normalBias = 0.02;
  }
  scene.add(moonLight);

  // Subtle warm storefront fill from the south-west so heroes, retro sedans & facades read with crisp 3D volume
  const streetFill = new THREE.DirectionalLight(0xffb874, 0.62);
  streetFill.position.set(-22, 18, 26);
  scene.add(streetFill);

  // Helpers (calibrated opacity so additive halos create crisp neon auras without white bloom washout!)
  const addGlowHalo = (x: number, y: number, z: number, colorHex: number, sx: number, sy = sx, opacity = 0.72) => {
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: textures.glowHalo,
        color: colorHex,
        transparent: true,
        opacity: opacity * 0.44,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    sp.position.set(x, y, z);
    sp.scale.set(sx, sy, 1);
    scene.add(sp);
    nightOnlyVisuals.push(sp);
    return sp;
  };

  const addWetReflection = (x: number, z: number, w: number, l: number, colorHex: number, opacity = 0.28) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, l),
      new THREE.MeshBasicMaterial({
        map: textures.glowHalo,
        color: colorHex,
        transparent: true,
        opacity: opacity * 0.52,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.026, z);
    scene.add(m);
    nightOnlyVisuals.push(m);
    return m;
  };

  const addSignPlane = (
    tex: THREE.CanvasTexture,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    rotY = 0,
    emHex = 0xffffff,
    emInt = 0.95,
  ) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({
        map: tex,
        emissive: emHex,
        emissiveMap: tex,
        emissiveIntensity: Math.min(emInt * 0.72, 1.05),
        roughness: 0.42,
      }),
    );
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    scene.add(m);
    return m;
  };

  // Segmented Wet Asphalt Ground Planes (leaves true physical opening for the -1.25m Sunken Parking B1 Pit!)
  const asphaltMat = new THREE.MeshStandardMaterial({
    color: 0x7e88a6,
    map: textures.asphaltMap,
    roughnessMap: textures.asphaltRough,
    bumpMap: textures.asphaltBump,
    bumpScale: 0.04,
    roughness: 0.88,
    metalness: 0.04,
  });
  const addGroundSlab = (x1: number, z1: number, x2: number, z2: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x2 - x1, z2 - z1), asphaltMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2);
    m.receiveShadow = true;
    m.userData.skipOutline = true;
    scene.add(m);
  };
  addGroundSlab(-90, -80, B1_PIT.rampX1, 80); // West & main intersection street
  addGroundSlab(B1_PIT.floorX2, -80, 90, 80); // Far east beyond B1
  addGroundSlab(B1_PIT.rampX1, -80, B1_PIT.floorX2, B1_PIT.z1); // North of B1 pit
  addGroundSlab(B1_PIT.rampX1, B1_PIT.z2, B1_PIT.floorX2, 80); // South of B1 pit

  // Raised Sidewalk Curbs
  const swMat = new THREE.MeshStandardMaterial({
    color: 0xd0d6e4,
    map: textures.sidewalkMap,
    roughness: 0.78,
  });
  const addSidewalk = (x1: number, z1: number, x2: number, z2: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x2 - x1, 0.18, z2 - z1), swMat);
    m.position.set((x1 + x2) / 2, 0.09, (z1 + z2) / 2);
    m.receiveShadow = true;
    scene.add(m);
  };
  addSidewalk(-29, -12, 6, 3.6);
  addSidewalk(-29, -28, 6, -12);
  addSidewalk(6, -28, 17.5, 2.5);

  // Crisp Crosswalk Stripes & Lane Markings (offset by +0.025 on Y with polygonOffset to avoid Z-fighting)
  const paintMat = new THREE.MeshBasicMaterial({
    color: 0xbac6e4,
    transparent: true,
    opacity: 0.28,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  for (let x = -14; x <= 11; x += 2.15) {
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 4.4), paintMat);
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(x, 0.024, 14.5);
    scene.add(stripe);
  }
  const yellowPaint = new THREE.MeshBasicMaterial({
    color: 0xf4cc50,
    transparent: true,
    opacity: 0.36,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  for (let z = -22; z <= 10; z += 4.2) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 2.2), yellowPaint);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(11.4, 0.024, z);
    scene.add(dash);
  }

  // Playable Perimeter Colliders (Low curbs on South so camera is NEVER blocked!)
  colliders.push({ x1: -32, z1: -28, x2: 34, z2: -26.5, tall: true });
  colliders.push({ x1: -32, z1: 19.5, x2: 34, z2: 21, tall: false });
  colliders.push({ x1: -31, z1: -28, x2: -29, z2: 21, tall: true });
  colliders.push({ x1: 31, z1: -28, x2: 33, z2: 21, tall: true });

  // Architectural Materials (crisp detailed brickwork & awnings in nocturnal lighting)
  const brickDark = new THREE.MeshStandardMaterial({ color: 0xe6eaf6, map: textures.brickDark, roughness: 0.86 });
  const brickCafe = new THREE.MeshStandardMaterial({ color: 0xeee4ec, map: textures.brickCafe, roughness: 0.84 });
  const brickBlue = new THREE.MeshStandardMaterial({ color: 0xe0e8f6, map: textures.brickBlue, roughness: 0.86 });
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x4e5674, roughness: 0.84 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x222844, roughness: 0.9 });

  const addSolidBox = (
    x1: number,
    z1: number,
    x2: number,
    z2: number,
    h: number,
    mat: THREE.Material | THREE.Material[],
    tall = true,
    y0 = 0,
  ) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x2 - x1, h, z2 - z1), mat);
    m.position.set((x1 + x2) / 2, y0 + h / 2, (z1 + z2) / 2);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    colliders.push({ x1, z1, x2, z2, tall });
    return m;
  };

  // Shared physical glass glazing & warm interior materials for 3D Recessed Storefront Alcoves
  const shopGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x3b5888,
    roughness: 0.08,
    metalness: 0.25,
    clearcoat: 0.85,
    clearcoatRoughness: 0.06,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  });
  const timberFrameMat = new THREE.MeshStandardMaterial({ color: 0x1a1524, roughness: 0.72, metalness: 0.2 });
  const warmWoodMat = new THREE.MeshStandardMaterial({ color: 0x452620, roughness: 0.76 });
  const bulbEmissiveMat = new THREE.MeshStandardMaterial({
    color: 0xffe8a6,
    emissive: 0xffb84d,
    emissiveIntensity: 1.55,
    roughness: 0.25,
  });

  /**
   * Builds a genuine 3D recessed Japanese storefront bay with perimeter timber frame,
   * glowing back wall, 3D interior furniture/vinyl racks/pendant lamps, and clearcoat reflective glass!
   */
  const addRecessedStorefront = (
    kind: 'records' | 'cafe',
    tex: THREE.CanvasTexture,
    cx: number,
    cy: number,
    cz: number,
    w: number,
    h: number,
    rotY = 0,
  ) => {
    const grp = new THREE.Group();
    grp.position.set(cx, cy, cz);
    grp.rotation.y = rotY;
    const depth = 0.56;

    // Warm interior back wall (kept below HDR bloom threshold so interior stays crisp and rich!)
    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(w - 0.16, h - 0.16),
      new THREE.MeshStandardMaterial({
        map: tex,
        emissive: 0xffa44f,
        emissiveMap: tex,
        emissiveIntensity: 0.68,
        roughness: 0.62,
      }),
    );
    back.position.set(0, 0, 0.04);
    grp.add(back);

    // Recessed perimeter timber box (top soffit, base kickplate, left/right jambs)
    const topBar = new THREE.Mesh(new THREE.BoxGeometry(w + 0.14, 0.18, depth + 0.06), timberFrameMat);
    topBar.position.set(0, h / 2, depth / 2);
    const botBar = new THREE.Mesh(new THREE.BoxGeometry(w + 0.14, 0.34, depth + 0.06), timberFrameMat);
    botBar.position.set(0, -h / 2 + 0.08, depth / 2);
    const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.18, h, depth + 0.04), timberFrameMat);
    sideL.position.set(-w / 2, 0, depth / 2);
    const sideR = new THREE.Mesh(new THREE.BoxGeometry(0.18, h, depth + 0.04), timberFrameMat);
    sideR.position.set(w / 2, 0, depth / 2);
    grp.add(topBar, botBar, sideL, sideR);

    // 3D Interior Props visible through glass (real parallax depth!)
    if (kind === 'records') {
      // Glowing ceiling fluorescent strips
      [-w * 0.25, w * 0.25].forEach((fx) => {
        const tube = new THREE.Mesh(new THREE.BoxGeometry(w * 0.32, 0.07, 0.09), bulbEmissiveMat);
        tube.position.set(fx, h / 2 - 0.18, 0.26);
        grp.add(tube);
      });
      // 3D Vinyl Record Display Bins + Colorful Album Sleeves
      const sleevePalette = [0xf45b8a, 0x4ce0e8, 0xf5b971, 0x9b6eff];
      const count = Math.max(2, Math.floor(w / 2.2));
      for (let i = 0; i < count; i++) {
        const bx = -w * 0.34 + (i * (w * 0.68)) / Math.max(1, count - 1);
        const rack = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.92, 0.34), warmWoodMat);
        rack.position.set(bx, -h / 2 + 0.68, 0.28);
        grp.add(rack);
        for (let sIdx = 0; sIdx < 3; sIdx++) {
          const sleeve = new THREE.Mesh(
            new THREE.BoxGeometry(0.32, 0.36, 0.05),
            new THREE.MeshStandardMaterial({
              color: sleevePalette[(i + sIdx) % sleevePalette.length],
              emissive: sleevePalette[(i + sIdx) % sleevePalette.length],
              emissiveIntensity: 0.28,
              roughness: 0.45,
            }),
          );
          sleeve.position.set(bx - 0.42 + sIdx * 0.42, -h / 2 + 1.24, 0.32);
          sleeve.rotation.x = -0.18;
          grp.add(sleeve);
        }
      }
    } else {
      // Café / Kissaten 3D Interior: Hanging glowing pendant lamps + wooden tables & stools!
      const cols = Math.max(2, Math.floor(w / 3.0));
      for (let i = 0; i < cols; i++) {
        const tx = -w * 0.34 + (i * (w * 0.68)) / Math.max(1, cols - 1);
        // Pendant lamp cord + warm glowing globe
        const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.68, 6), timberFrameMat);
        cord.position.set(tx, h / 2 - 0.38, 0.3);
        const globe = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), bulbEmissiveMat);
        globe.position.set(tx, h / 2 - 0.72, 0.3);
        grp.add(cord, globe);

        // Wooden café table & pair of stools
        const tTop = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.09, 0.36), warmWoodMat);
        tTop.position.set(tx, -h / 2 + 0.88, 0.3);
        const tLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.72, 8), timberFrameMat);
        tLeg.position.set(tx, -h / 2 + 0.48, 0.3);
        grp.add(tTop, tLeg);
      }
    }

    // Exterior timber mullions + clearcoat reflective glass glazing
    const panes = Math.max(3, Math.round(w / 2.6));
    for (let m = 1; m < panes; m++) {
      const mx = -w / 2 + (m * w) / panes;
      const mull = new THREE.Mesh(new THREE.BoxGeometry(0.1, h, 0.1), timberFrameMat);
      mull.position.set(mx, 0, depth);
      grp.add(mull);
    }
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.14, h - 0.24), shopGlassMat);
    glass.position.set(0, 0.04, depth + 0.02);
    grp.add(glass);

    scene.add(grp);
  };

  // =========================================================================
  // LANDMARK 1 (WEST): WALKABLE «マルフジ商店 / レコード» INTERIOR + CITY POP BILLBOARD
  // =========================================================================
  // Perimeter Ground-Floor Walls (Height 3.85m) with open 3.4m Front & Back Doorways (x: -22.2 .. -18.8)!
  const wallH = 3.85;
  addSolidBox(-28.0, -9.5, -27.2, 2.0, wallH, brickDark, true); // West outer wall
  addSolidBox(-14.3, -9.5, -13.5, 2.0, wallH, brickDark, true); // East outer wall
  // South front wall left & right of open entrance doorway (-22.2 .. -18.8)
  addSolidBox(-28.0, 1.35, -22.2, 2.0, wallH, brickDark, true);
  addSolidBox(-18.8, 1.35, -13.5, 2.0, wallH, brickDark, true);
  // North back wall left & right of open courtyard service exit (-22.2 .. -18.8)
  addSolidBox(-28.0, -9.5, -22.2, -8.85, wallH, brickDark, true);
  addSolidBox(-18.8, -9.5, -13.5, -8.85, wallH, brickDark, true);

  // Warm 1980s Hardwood Parquet Interior Floor + Subtle Doorway Threshold Glow
  const shopFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(13.2, 10.6),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.woodFloor,
      roughness: 0.58,
      metalness: 0.08,
    }),
  );
  shopFloor.rotation.x = -Math.PI / 2;
  shopFloor.position.set(-20.75, 0.2, -3.75);
  shopFloor.receiveShadow = true;
  shopFloor.userData.skipOutline = true;
  scene.add(shopFloor);

  // Glowing front & back open doorway lintel bars (clear visual affordance that the shop is walkable!)
  const doorGlowMat = new THREE.MeshStandardMaterial({
    color: 0xffe4a8,
    emissive: 0xffb454,
    emissiveIntensity: 1.35,
    roughness: 0.3,
  });
  [1.68, -9.15].forEach((dz) => {
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.22, 0.55), timberFrameMat);
    lintel.position.set(-20.5, 3.65, dz);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.09, 0.14), doorGlowMat);
    strip.position.set(-20.5, 3.5, dz + (dz > 0 ? 0.24 : -0.24));
    scene.add(lintel, strip);
  });
  addWetReflection(-20.5, 2.5, 3.2, 2.2, 0xffb85c, 0.38);
  addWetReflection(-20.5, -9.8, 3.2, 2.2, 0xffb85c, 0.32);

  // 3D Walkable Interior Furniture: Checkout Counter (East) + Vinyl Listening Display Islands (Low Cover!)
  const counterMat = new THREE.MeshStandardMaterial({ color: 0x5c3424, roughness: 0.65 });
  addSolidBox(-16.8, -5.8, -14.8, -1.6, 1.08, counterMat, false, 0.2);
  // Retro Cash Register & Warm Desk Lamp on Checkout Counter
  const register = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.42, 0.48), assets.darkMetalMat);
  register.position.set(-15.8, 1.48, -3.4);
  const deskLamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), bulbEmissiveMat);
  deskLamp.position.set(-15.7, 1.62, -4.6);
  scene.add(register, deskLamp);
  addGlowHalo(-15.7, 1.8, -4.6, 0xffbc62, 4.6, 4.6, 0.56);

  // 2 Freestanding Vinyl Record Bin Islands (West-Center) with colorful City Pop album sleeves (low cover!)
  const vinylPalette = [0xf45b8a, 0x4ce0e8, 0xf5b971, 0x9b6eff];
  [-5.8, -1.8].forEach((rz, ri) => {
    addSolidBox(-25.8, rz - 0.55, -23.0, rz + 0.55, 0.96, warmWoodMat, false, 0.2);
    for (let s = 0; s < 4; s++) {
      const sl = new THREE.Mesh(
        new THREE.BoxGeometry(0.46, 0.44, 0.08),
        new THREE.MeshStandardMaterial({
          color: vinylPalette[(ri * 2 + s) % vinylPalette.length],
          emissive: vinylPalette[(ri * 2 + s) % vinylPalette.length],
          emissiveIntensity: 0.38,
          roughness: 0.42,
        }),
      );
      sl.position.set(-25.3 + s * 0.6, 1.36, rz);
      sl.rotation.x = -0.2;
      scene.add(sl);
    }
  });
  // Warm ambient glow halo inside the record shop
  addGlowHalo(-20.8, 2.8, -3.8, 0xffad5c, 9.5, 6.5, 0.34);

  // Flanking Recessed 3D Storefront Display Windows left & right of open front entrance
  addRecessedStorefront('records', textures.shopfrontRecords, -25.0, 1.78, 2.0, 4.4, 3.1, 0);
  addRecessedStorefront('records', textures.shopfrontRecords, -16.2, 1.78, 2.0, 4.2, 3.1, 0);

  // GATE 2: Sculpted Modular Upper Story, Ribbed Striped Awning, Sign & Giant CITY POP Billboard (smoothly fades when squad walks inside!)
  const recUpperGroup = new THREE.Group();
  scene.add(recUpperGroup);

  const recUpperSculpted = buildModularUrbanUpperBlock({
    width: 14.5,
    depth: 11.5,
    baseY: 3.85,
    floors: 2,
    floorH: 3.35,
    concreteHex: '#8c867c',
    facadeHex: '#5f4d4b',
    transparent: true,
    includeBalconies: false,
    includeSideWindows: true,
    includeRoofMech: true,
    seed: 311,
  });
  recUpperSculpted.group.position.set(-20.75, 0, -3.75);
  recUpperGroup.add(recUpperSculpted.group);
  registerNightEmissive(recUpperSculpted.emissiveWindowsMat, 0.78, 0.06);

  const recAwningSculpted = buildSculptedAwning(9.8, 2.35, '#8f3432', '#cfc4ae', true, 341);
  recAwningSculpted.group.position.set(-20.5, 3.82, 2.02);
  recUpperGroup.add(recAwningSculpted.group);

  const recLampMat = assets.darkMetalMat.clone();
  recLampMat.transparent = true;

  const signRecordsMesh = addSignPlane(textures.signRecords, -20.5, 4.48, 2.24, 8.6, 1.48, 0, 0xffffff, 1.15);
  (signRecordsMesh.material as THREE.MeshStandardMaterial).transparent = true;
  recUpperGroup.add(signRecordsMesh);
  neonFlickers.push({
    mat: signRecordsMesh.material as THREE.MeshStandardMaterial,
    baseEmissive: 0.86,
    baseHaloOpacity: 0,
    phase: 0.7,
    style: 'steady',
  });

  const cityPopMesh = addSignPlane(textures.cityPopBillboard, -20.5, 7.85, 2.26, 10.6, 5.1, 0, 0xffffff, 0.9);
  (cityPopMesh.material as THREE.MeshStandardMaterial).transparent = true;
  recUpperGroup.add(cityPopMesh);

  [-23.5, -17.5].forEach((lx) => {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.55), recLampMat);
    lamp.position.set(lx, 10.75, 2.65);
    recUpperGroup.add(lamp);
    const halo = addGlowHalo(lx, 10.45, 2.75, 0xffd088, 2.7, 2.7, 0.62);
    recUpperGroup.add(halo);
  });

  occludables.push({
    materials: [
      ...recUpperSculpted.materials,
      ...recAwningSculpted.materials,
      recLampMat,
      signRecordsMesh.material as THREE.MeshStandardMaterial,
      cityPopMesh.material as THREE.MeshStandardMaterial,
    ],
    objects: [recUpperGroup],
    minOpacity: 0,
    zone: { x1: -28.5, z1: -9.8, x2: -13.0, z2: 2.4 },
    extraZones: [{ x1: -28.5, z1: -26.5, x2: -2.0, z2: -9.4 }],
  });

  // Asset Lab Stylized Japanese Vending Machine mounted flush on sidewalk (+0.18m)
  const labVending = buildVendingMachineAsset({ includeCreaseInk: false });
  labVending.root.position.set(-26.15, 0.18, 2.68);
  labVending.root.scale.setScalar(1.06);
  scene.add(labVending.root);
  colliders.push({ x1: -26.85, z1: 2.15, x2: -25.45, z2: 3.18, tall: false });
  addGlowHalo(-26.15, 1.55, 3.35, 0xffd29c, 3.0, 3.0, 0.46);

  // Local warm + magenta point lights (within 5-light budget)
  const cityPopLight = new THREE.PointLight(0xf45b8a, 3.2, 24);
  cityPopLight.position.set(-20.5, 5.5, 6.2);
  scene.add(cityPopLight);
  addWetReflection(-20.5, 7.2, 9.8, 8.2, 0xf45b8a, 0.24);
  addWetReflection(-20.5, 5.4, 6.8, 5.8, 0xffa652, 0.28);

  // Hanging warm Japanese chōchin paper lanterns along マルフジ商店 eaves
  const chochinRed = new THREE.MeshStandardMaterial({
    color: 0xff5e4d,
    emissive: 0xff4532,
    emissiveIntensity: 1.35,
    roughness: 0.4,
  });
  const chochinWarm = new THREE.MeshStandardMaterial({
    color: 0xffc870,
    emissive: 0xff9f40,
    emissiveIntensity: 1.3,
    roughness: 0.4,
  });
  [
    [-25.4, 3.05, 3.55, true],
    [-23.6, 3.05, 3.55, false],
    [-16.4, 3.05, 3.55, true],
  ].forEach(([lx, ly, lz, isRed]) => {
    const lan = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), isRed ? chochinRed : chochinWarm);
    lan.scale.set(0.85, 1.25, 0.85);
    lan.position.set(lx as number, ly as number, lz as number);
    scene.add(lan);
    addGlowHalo(lx as number, ly as number, (lz as number) + 0.15, isRed ? 0xff5a45 : 0xffb85c, 2.2, 2.2, 0.56);
  });

  // Stacked Japanese beverage crates beside マルフジ商店
  const crateBlue = new THREE.MeshStandardMaterial({ color: 0x2c4e8a, roughness: 0.72 });
  const crateAmber = new THREE.MeshStandardMaterial({ color: 0xb5692c, roughness: 0.74 });
  [
    [-24.6, 0.32, 2.65, crateBlue],
    [-24.6, 0.84, 2.65, crateAmber],
    [-23.85, 0.32, 2.68, crateAmber],
  ].forEach(([cx, cy, cz, mat]) => {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.48, 0.54), mat as THREE.Material);
    c.position.set(cx as number, cy as number, cz as number);
    c.castShadow = true;
    c.receiveShadow = true;
    scene.add(c);
  });

  // =========================================================================
  // LANDMARK 2 (WEST-CENTER): GROUNDED QUARANTINE STONE ARCHWAY (Walkable!)
  // =========================================================================
  // Grounded stone pilasters supporting both ends of the archway flush to sidewalk
  addSolidBox(-13.5, -4.2, -12.6, 2.0, 4.4, concreteMat, true);
  addSolidBox(-7.7, -4.2, -6.8, 2.0, 4.4, concreteMat, true);

  // Decorative stone capitals where the arch springs from the pilasters
  const capL = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.32, 6.45), concreteMat);
  capL.position.set(-13.05, 4.05, -1.1);
  scene.add(capL);
  const capR = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.32, 6.45), concreteMat);
  capR.position.set(-7.25, 4.05, -1.1);
  scene.add(capR);

  // Upper masonry bridge & grounded stone arch ring terminating cleanly into pilasters (fadeable when squad walks underneath!)
  const archBrickMat = brickDark.clone();
  archBrickMat.transparent = true;
  const archStoneMat = concreteMat.clone();
  archStoneMat.transparent = true;

  const archBridge = new THREE.Mesh(new THREE.BoxGeometry(6.8, 3.6, 6.2), archBrickMat);
  archBridge.position.set(-10.15, 7.2, -1.1);
  archBridge.castShadow = true;
  scene.add(archBridge);

  const archRing = new THREE.Mesh(new THREE.TorusGeometry(2.75, 0.42, 8, 22, Math.PI), archStoneMat);
  archRing.position.set(-10.15, 3.9, 1.95);
  scene.add(archRing);

  occludables.push({
    materials: [archBrickMat, archStoneMat],
    objects: [archBridge, archRing],
    minOpacity: 0,
    zone: { x1: -13.6, z1: -6.5, x2: -6.6, z2: 3.0 },
    extraZones: [{ x1: -28.5, z1: -26.5, x2: -2.0, z2: -9.4 }],
  });

  // Mount biohazard quarantine sign cleanly on left pilaster face (zero clipping!)
  addSignPlane(textures.signBiohazard, -13.05, 2.35, 2.08, 1.15, 1.55, 0, 0xf2c94c, 0.42);

  // =========================================================================
  // LANDMARK 3 (CENTER): CORNER «Café / 喫茶» + ROOFTOP WATER TOWER
  // =========================================================================
  // Ground floor (h = 3.85) stays solid; upper story + rooftop water tower cut away cleanly when squad enters Sakura Courtyard behind it!
  addSolidBox(-6.8, -9.5, 5.6, 2.0, 3.85, [brickCafe, brickCafe, roofMat, roofMat, brickCafe, brickCafe], true);

  // GATE 2: Sculpted Modular Upper Story for Corner Café (pilasters, recessed windows, balconies, ribbed awning)
  const cafeUpperGroup = new THREE.Group();
  scene.add(cafeUpperGroup);

  const cafeUpperSculpted = buildModularUrbanUpperBlock({
    width: 12.4,
    depth: 11.5,
    baseY: 3.85,
    floors: 2,
    floorH: 3.0,
    concreteHex: '#948d81',
    facadeHex: '#7d4d42',
    transparent: true,
    includeBalconies: true,
    includeSideWindows: true,
    includeRoofMech: false,
    seed: 321,
  });
  cafeUpperSculpted.group.position.set(-0.6, 0, -3.75);
  cafeUpperGroup.add(cafeUpperSculpted.group);
  registerNightEmissive(cafeUpperSculpted.emissiveWindowsMat, 0.85, 0.06);

  addRecessedStorefront('cafe', textures.cafeWindow, -0.6, 1.78, 2.0, 10.4, 3.1, 0);
  addRecessedStorefront('cafe', textures.cafeWindow, 5.6, 1.78, -2.5, 7.6, 3.1, Math.PI / 2);

  const cafeAwningSculpted = buildSculptedAwning(11.4, 2.45, '#963434', '#d4c9b4', false, 345);
  cafeAwningSculpted.group.position.set(-0.6, 3.76, 2.02);
  scene.add(cafeAwningSculpted.group);

  const signCafeMesh = addSignPlane(textures.signCafe, -0.6, 5.42, 2.24, 5.6, 1.8, 0, 0xff5e87, 1.05);
  (signCafeMesh.material as THREE.MeshStandardMaterial).transparent = true;
  const signCafeHalo = addGlowHalo(-0.6, 5.42, 2.55, 0xff5a82, 7.4, 3.6, 0.42);
  cafeUpperGroup.add(signCafeMesh, signCafeHalo);
  neonFlickers.push({
    mat: signCafeMesh.material as THREE.MeshStandardMaterial,
    halo: signCafeHalo,
    baseEmissive: 1.02,
    baseHaloOpacity: 0.2,
    phase: 1.4,
    style: 'buzz',
  });
  const kissatenMesh = addSignPlane(textures.kissatenVertical, 6.2, 6.7, 1.6, 1.5, 3.8, 0, 0xff6e7a, 1.05);
  (kissatenMesh.material as THREE.MeshStandardMaterial).transparent = true;
  const kissatenHalo = addGlowHalo(6.2, 6.7, 2.0, 0xff5e73, 4.2, 5.4, 0.4);
  cafeUpperGroup.add(kissatenMesh, kissatenHalo);
  neonFlickers.push({
    mat: kissatenMesh.material as THREE.MeshStandardMaterial,
    halo: kissatenHalo,
    baseEmissive: 1.0,
    baseHaloOpacity: 0.18,
    phase: 4.1,
    style: 'buzz',
  });

  // Rooftop Water Tower seated cleanly on the sculpted Café roof slab (Y = 3.85 + 6.0 = 9.85m)
  const waterTower = buildWaterTower(assets.darkMetalMat);
  waterTower.position.set(1.2, 9.9, -3.5);
  cafeUpperGroup.add(waterTower);

  occludables.push({
    materials: [
      ...cafeUpperSculpted.materials,
      signCafeMesh.material as THREE.MeshStandardMaterial,
      kissatenMesh.material as THREE.MeshStandardMaterial,
    ],
    objects: [cafeUpperGroup],
    minOpacity: 0,
    zone: { x1: -26.5, z1: -26.5, x2: 5.8, z2: -9.6 },
    extraZones: [{ x1: 4.8, z1: -24.5, x2: 17.5, z2: -2.0 }],
  });

  const cafeLight = new THREE.PointLight(0xffa452, 2.3, 24);
  cafeLight.position.set(-0.6, 4.2, 5.4);
  scene.add(cafeLight);
  addWetReflection(-0.6, 6.6, 10.8, 8.8, 0xff9b4a, 0.3);
  addWetReflection(5.8, 4.8, 4.6, 6.2, 0xff5e87, 0.24);

  // =========================================================================
  // LANDMARK 4 (CENTER-EAST): «海風・中央商店街» SHOPPING ARCADE + WALKABLE SERVICE PASSAGE
  // =========================================================================
  // Split north-west arcade building so z: -15.8..-10.5 is a 4.3m walkable Service Passage to Sakura Courtyard!
  addSolidBox(-2.0, -26.5, 5.6, -15.8, 2.9, [brickBlue, brickBlue, roofMat, roofMat, brickBlue, brickBlue], true);
  const arcNWUpper = buildModularUrbanUpperBlock({
    width: 7.6,
    depth: 10.7,
    baseY: 2.9,
    floors: 2,
    floorH: 2.9,
    concreteHex: '#868d94',
    facadeHex: '#4b5c6e',
    transparent: false,
    includeBalconies: true,
    includeSideWindows: true,
    includeRoofMech: true,
    seed: 331,
  });
  arcNWUpper.group.position.set(1.8, 0, -21.15);
  scene.add(arcNWUpper.group);
  registerNightEmissive(arcNWUpper.emissiveWindowsMat, 0.78, 0.06);

  // Overhead masonry bridge above Service Passage (fades when squad flanks through!)
  const svcBridgeMat = brickBlue.clone();
  svcBridgeMat.transparent = true;
  const svcBridge = new THREE.Mesh(new THREE.BoxGeometry(7.6, 4.2, 5.2), svcBridgeMat);
  svcBridge.position.set(1.8, 6.4, -13.2);
  svcBridge.castShadow = true;
  scene.add(svcBridge);
  occludables.push({
    materials: [svcBridgeMat],
    objects: [svcBridge],
    minOpacity: 0,
    zone: { x1: -2.6, z1: -16.4, x2: 6.2, z2: -10.2 },
    extraZones: [{ x1: 4.8, z1: -24.5, x2: 17.5, z2: -2.0 }],
  });
  // Warm amber wall sconce inside the Service Passage
  addGlowHalo(1.8, 3.1, -13.2, 0xffa852, 5.2, 4.2, 0.45);
  addWetReflection(1.8, -13.2, 6.4, 3.6, 0xffa852, 0.24);

  // East Arcade Building: Solid ground plinth + Sculpted 2-Story Modular Urban Upper Block
  addSolidBox(17.2, -26.5, 28.0, -9.5, 2.9, [brickDark, brickDark, roofMat, roofMat, brickDark, brickDark], true);
  const arcEastUpper = buildModularUrbanUpperBlock({
    width: 10.8,
    depth: 17.0,
    baseY: 2.9,
    floors: 2,
    floorH: 3.0,
    concreteHex: '#8d877e',
    facadeHex: '#6c5c52',
    transparent: false,
    includeBalconies: true,
    includeSideWindows: true,
    includeRoofMech: true,
    seed: 335,
  });
  arcEastUpper.group.position.set(22.6, 0, -18.0);
  scene.add(arcEastUpper.group);
  registerNightEmissive(arcEastUpper.emissiveWindowsMat, 0.82, 0.06);

  // Overhead arched Shopping Arcade canopy ribs + lanterns (auto-cutaway when fighting inside Arcade!)
  const arcadeCanopyGroup = new THREE.Group();
  scene.add(arcadeCanopyGroup);
  const archTrussGeo = new THREE.TorusGeometry(5.8, 0.16, 6, 20, Math.PI);
  const arcadeRibMat = assets.darkMetalMat.clone();
  arcadeRibMat.transparent = true;
  const lanternMat = new THREE.MeshBasicMaterial({ color: 0xffd78e, transparent: true });
  for (let z = 0.5; z >= -24; z -= 4.2) {
    const rib = new THREE.Mesh(archTrussGeo, arcadeRibMat);
    rib.position.set(11.4, 5.4, z);
    arcadeCanopyGroup.add(rib);
    [7.4, 15.4].forEach((lx) => {
      const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), lanternMat);
      lantern.position.set(lx, 5.0, z);
      arcadeCanopyGroup.add(lantern);
      if (z > -15) {
        const halo = addGlowHalo(lx, 5.0, z, 0xffbd66, 2.6, 2.6, 0.44);
        arcadeCanopyGroup.add(halo);
      }
    });
  }
  occludables.push({
    materials: [arcadeRibMat],
    objects: [arcadeCanopyGroup],
    minOpacity: 0,
    zone: { x1: 4.8, z1: -24.5, x2: 17.5, z2: -2.0 },
  });

  const gateBar = new THREE.Mesh(new THREE.BoxGeometry(11.8, 0.5, 0.45), assets.darkMetalMat);
  gateBar.position.set(11.4, 6.4, 1.0);
  scene.add(gateBar);
  const signArcadeMesh = addSignPlane(textures.signArcade, 11.4, 6.4, 1.28, 7.2, 1.75, 0, 0xffca7a, 1.42);
  const signArcadeHalo = addGlowHalo(11.4, 6.4, 1.5, 0xffb85c, 8.8, 3.3, 0.46);
  neonFlickers.push({
    mat: signArcadeMesh.material as THREE.MeshStandardMaterial,
    halo: signArcadeHalo,
    baseEmissive: 0.96,
    baseHaloOpacity: 0.22,
    phase: 2.2,
    style: 'steady',
  });
  const arcadeVertMesh = addSignPlane(textures.arcadeVertical, 16.8, 6.2, 1.4, 1.4, 3.6, 0, 0x4ce0e8, 1.12);
  neonFlickers.push({
    mat: arcadeVertMesh.material as THREE.MeshStandardMaterial,
    baseEmissive: 1.08,
    baseHaloOpacity: 0,
    phase: 5.5,
    style: 'pulse',
  });

  // Iconic Background Steel Footbridge «みなと中央通り» (High & Far North so it frames the vista, NEVER blocking camera!)
  const overpass = new THREE.Mesh(new THREE.BoxGeometry(24, 1.8, 2.6), concreteMat);
  overpass.position.set(11.4, 9.6, -24.5);
  scene.add(overpass);
  addSignPlane(textures.signOverpass, 11.4, 9.6, -23.15, 11.5, 1.45, 0, 0x8fb8ff, 0.45);

  const arcadeMistLight = new THREE.PointLight(0x4ce0e8, 3.6, 28);
  arcadeMistLight.position.set(11.4, 3.2, -16.5);
  scene.add(arcadeMistLight);
  addGlowHalo(11.4, 2.8, -19.5, 0x4ce0e8, 18, 10, 0.5);
  addWetReflection(11.4, -7.5, 8.5, 16, 0x4ce0e8, 0.24);

  // =========================================================================
  // LANDMARK 5 (NORTH COURTYARD): EXPANDED SAKURA PLAZA + LANTERNS + BENCHES + MED STATION
  // =========================================================================
  const courtyardFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(26.5, 15.8),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.courtyardTile,
      roughness: 0.78,
    }),
  );
  courtyardFloor.rotation.x = -Math.PI / 2;
  courtyardFloor.position.set(-15.2, 0.195, -18.2);
  courtyardFloor.receiveShadow = true;
  courtyardFloor.userData.skipOutline = true;
  scene.add(courtyardFloor);

  // Main Blooming Sakura Tree + Raised Stone Planter Curb
  const sakura = buildSakuraTree();
  sakura.position.set(-15.6, 0.2, -19.6);
  scene.add(sakura);
  const planter = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.42, 2.6), concreteMat);
  planter.position.set(-15.6, 0.36, -19.6);
  planter.receiveShadow = true;
  scene.add(planter);
  colliders.push({ x1: -16.9, z1: -20.9, x2: -14.3, z2: -18.3, tall: false });

  // Secondary Sakura Sapling near Service Passage entrance
  const sakuraSmall = buildSakuraTree();
  sakuraSmall.position.set(-4.8, 0.2, -22.2);
  sakuraSmall.scale.setScalar(0.74);
  sakuraSmall.rotation.y = 1.4;
  scene.add(sakuraSmall);
  colliders.push({ x1: -5.5, z1: -22.9, x2: -4.1, z2: -21.5, tall: false });

  // Wooden Japanese Park Benches (low tactical cover inside courtyard!)
  const bench1 = buildParkBench(assets);
  bench1.position.set(-15.6, 0.19, -15.4);
  scene.add(bench1);
  colliders.push({ x1: -16.8, z1: -15.8, x2: -14.4, z2: -15.0, tall: false });

  const bench2 = buildParkBench(assets);
  bench2.position.set(-10.2, 0.19, -20.2);
  bench2.rotation.y = -Math.PI / 2;
  scene.add(bench2);
  colliders.push({ x1: -10.6, z1: -21.4, x2: -9.8, z2: -19.0, tall: false });

  // Warm Iron Courtyard Garden Lanterns
  [
    [-19.2, -14.4],
    [-11.8, -14.4],
    [-6.8, -17.2],
  ].forEach(([lx, lz]) => {
    const lantern = buildCourtyardLantern(assets, textures);
    lantern.position.set(lx, 0.19, lz);
    scene.add(lantern);
  });

  addSolidBox(
    -27.5,
    -26.5,
    -21.0,
    -21.5,
    4.4,
    new THREE.MeshStandardMaterial({ color: 0x2c3a54, roughness: 0.76 }),
    true,
  );
  addSignPlane(textures.signMed, -24.25, 2.9, -21.4, 5.4, 1.55, 0, 0x6ee782, 1.05);
  addGlowHalo(-24.25, 2.9, -21.1, 0x6ee782, 6.4, 3.4, 0.44);

  // =========================================================================
  // LANDMARK 6 (EAST): SUNKEN PARKING «B1 / 立体駐車場» (-1.25m) + SLOPED RAMP + GENERATOR
  // =========================================================================
  const b1FloorMat = new THREE.MeshStandardMaterial({
    color: 0x3b4358,
    roughness: 0.86,
    metalness: 0.08,
  });
  const b1SpanZ = B1_PIT.z2 - B1_PIT.z1;
  const b1MidZ = (B1_PIT.z1 + B1_PIT.z2) / 2;
  const b1FlatW = B1_PIT.floorX2 - B1_PIT.rampX2;
  const b1FlatFloor = new THREE.Mesh(new THREE.BoxGeometry(b1FlatW, 0.24, b1SpanZ), b1FloorMat);
  b1FlatFloor.position.set((B1_PIT.rampX2 + B1_PIT.floorX2) / 2, B1_PIT.depth - 0.12, b1MidZ);
  b1FlatFloor.receiveShadow = true;
  b1FlatFloor.userData.skipOutline = true;
  scene.add(b1FlatFloor);

  // Sloped concrete ramp connecting main street (Y=0) down to B1 floor (Y=-1.25m)
  const rampRun = B1_PIT.rampX2 - B1_PIT.rampX1;
  const rampRise = Math.abs(B1_PIT.depth);
  const rampHyp = Math.hypot(rampRun, rampRise);
  const rampAngle = Math.atan2(rampRise, rampRun);
  const b1Ramp = new THREE.Mesh(new THREE.BoxGeometry(rampHyp, 0.24, b1SpanZ), b1FloorMat);
  b1Ramp.position.set((B1_PIT.rampX1 + B1_PIT.rampX2) / 2, B1_PIT.depth / 2 - 0.12, b1MidZ);
  b1Ramp.rotation.z = -rampAngle;
  b1Ramp.receiveShadow = true;
  b1Ramp.userData.skipOutline = true;
  scene.add(b1Ramp);

  // Yellow safety hazard stripes across the B1 descent ramp lip
  const rampHazard = new THREE.Mesh(
    new THREE.PlaneGeometry(0.55, b1SpanZ - 0.8),
    new THREE.MeshStandardMaterial({ map: textures.barricade, roughness: 0.82 }),
  );
  rampHazard.rotation.x = -Math.PI / 2;
  rampHazard.position.set(B1_PIT.rampX1 - 0.28, 0.032, b1MidZ);
  rampHazard.userData.skipOutline = true;
  scene.add(rampHazard);

  // Retaining side walls along north & south edges of the sunken pit (north rises slightly as a garage safety parapet)
  const pitWallN = new THREE.Mesh(
    new THREE.BoxGeometry(B1_PIT.floorX2 - B1_PIT.rampX1 + 0.4, rampRise + 0.95, 0.36),
    concreteMat,
  );
  pitWallN.position.set((B1_PIT.rampX1 + B1_PIT.floorX2) / 2, B1_PIT.depth + (rampRise + 0.95) / 2, B1_PIT.z1 - 0.12);
  pitWallN.castShadow = true;
  pitWallN.receiveShadow = true;
  const pitWallS = new THREE.Mesh(
    new THREE.BoxGeometry(B1_PIT.floorX2 - B1_PIT.rampX1 + 0.4, rampRise + 0.35, 0.36),
    concreteMat,
  );
  pitWallS.position.set((B1_PIT.rampX1 + B1_PIT.floorX2) / 2, B1_PIT.depth + (rampRise + 0.35) / 2, B1_PIT.z2 + 0.12);
  pitWallS.receiveShadow = true;
  scene.add(pitWallN, pitWallS);

  [
    [18.4, -6],
    [18.4, 2.5],
    [18.4, 10.5],
    [29.5, -6],
    [29.5, 2.5],
    [29.5, 10.5],
  ].forEach(([px, pz]) => {
    const colBaseY = getTerrainHeightAt(px + 0.55, pz + 0.55);
    addSolidBox(px, pz, px + 1.1, pz + 1.1, 4.2 - colBaseY, concreteMat, true, colBaseY);
  });
  // Bold «B1» concrete column stencils facing the intersection & arcade (Concept Art Sheet 1!)
  addSignPlane(textures.parkingB1Sign, 18.36, 1.85, 3.05, 1.06, 2.15, -Math.PI / 2, 0xffffff, 0.52);
  addSignPlane(textures.parkingB1Sign, 18.36, 1.85, 11.05, 1.06, 2.15, -Math.PI / 2, 0xffffff, 0.52);
  addSignPlane(textures.parkingB1Sign, 18.95, 1.85, 11.64, 1.06, 2.15, 0, 0xffffff, 0.52);

  // Painted B1 Parking Stall Stripes flush on the sunken -1.25m floor
  for (let sz = -4.2; sz <= 9.2; sz += 3.35) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 0.14), paintMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(26.6, B1_PIT.depth + 0.025, sz);
    scene.add(line);
  }

  addSolidBox(29.8, -6.5, 31.2, 11.8, 7.6 - B1_PIT.depth, concreteMat, true, B1_PIT.depth);

  const parkingDeckMat = concreteMat.clone();
  parkingDeckMat.transparent = true;
  const parkingUpperGroup = new THREE.Group();
  scene.add(parkingUpperGroup);

  const pDeck = new THREE.Mesh(new THREE.BoxGeometry(13.2, 0.55, 18.6), parkingDeckMat);
  pDeck.position.set(24.6, 4.3, 2.6);
  pDeck.castShadow = true;
  pDeck.receiveShadow = true;
  parkingUpperGroup.add(pDeck);
  const pParapet = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.35, 18.6), parkingDeckMat);
  pParapet.position.set(18.2, 5.2, 2.6);
  pParapet.castShadow = true;
  parkingUpperGroup.add(pParapet);

  const signParkingMesh = addSignPlane(textures.signParking, 17.92, 5.25, 6.2, 6.4, 2.0, -Math.PI / 2, 0x4ce0e8, 0.9);
  (signParkingMesh.material as THREE.MeshStandardMaterial).transparent = true;
  const signParkingHalo = addGlowHalo(17.7, 5.25, 6.2, 0x4ce0e8, 7.0, 3.8, 0.36);
  parkingUpperGroup.add(signParkingMesh, signParkingHalo);

  // Parent ceiling fluorescent tubes to parkingUpperGroup so they hide cleanly when camera looks inside B1
  const cyanTubeMat = new THREE.MeshStandardMaterial({
    color: 0x72f4fc,
    emissive: 0x4ce0e8,
    emissiveIntensity: 1.4,
    roughness: 0.25,
    transparent: true,
    opacity: 1,
  });
  [-2, 6].forEach((tz) => {
    const tube = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 3.8), cyanTubeMat);
    tube.position.set(22.5, 3.95, tz);
    parkingUpperGroup.add(tube);
    const tubeHalo = addGlowHalo(22.5, 3.8, tz, 0x4ce0e8, 5.8, 2.8, 0.42);
    parkingUpperGroup.add(tubeHalo);
  });

  occludables.push({
    materials: [parkingDeckMat, signParkingMesh.material as THREE.MeshStandardMaterial, cyanTubeMat],
    objects: [parkingUpperGroup],
    minOpacity: 0,
    zone: { x1: 17.2, z1: -7.5, x2: 31.5, z2: 12.6 },
  });

  const parkCyanLight = new THREE.PointLight(0x4ce0e8, 2.8, 24);
  parkCyanLight.position.set(23.5, 2.4, 1.5);
  scene.add(parkCyanLight);

  // Interactive B1 Emergency Power Generator seated flush on sunken B1 floor (-1.25m)
  const b1Generator = buildB1Generator(assets, textures);
  b1Generator.group.position.set(B1_GENERATOR.x, B1_PIT.depth, B1_GENERATOR.z);
  scene.add(b1Generator.group);
  colliders.push({
    x1: B1_GENERATOR.x - 1.15,
    z1: B1_GENERATOR.z - 0.85,
    x2: B1_GENERATOR.x + 1.15,
    z2: B1_GENERATOR.z + 0.85,
    tall: false,
  });

  // =========================================================================
  // LANDMARK 7 (SOUTH HIGH GROUND): ELEVATED TACTICAL OVERLOOK DECK (+1.50m)
  // =========================================================================
  const deckW = OVERLOOK_DECK.deckX2 - OVERLOOK_DECK.deckX1;
  const deckD = OVERLOOK_DECK.z2 - OVERLOOK_DECK.z1;
  const deckMidX = (OVERLOOK_DECK.deckX1 + OVERLOOK_DECK.deckX2) / 2;
  const deckMidZ = (OVERLOOK_DECK.z1 + OVERLOOK_DECK.z2) / 2;

  // Darker weathered industrial slate concrete matching Minato night value hierarchy
  const overlookDeckMat = new THREE.MeshStandardMaterial({
    color: 0x343c4e,
    roughness: 0.9,
    metalness: 0.08,
  });
  const overlookParapetMat = new THREE.MeshStandardMaterial({
    color: 0x414a5e,
    roughness: 0.86,
    metalness: 0.1,
  });

  const deckBody = new THREE.Mesh(
    new THREE.BoxGeometry(deckW, OVERLOOK_DECK.height, deckD),
    overlookDeckMat,
  );
  deckBody.position.set(deckMidX, OVERLOOK_DECK.height / 2, deckMidZ);
  deckBody.castShadow = true;
  deckBody.receiveShadow = true;
  scene.add(deckBody);

  // Subtle top caution lip on Overlook Deck north edge
  const deckTopStripe = new THREE.Mesh(
    new THREE.PlaneGeometry(deckW, 0.32),
    new THREE.MeshStandardMaterial({ map: textures.barricade, roughness: 0.84 }),
  );
  deckTopStripe.rotation.x = -Math.PI / 2;
  deckTopStripe.position.set(deckMidX, OVERLOOK_DECK.height + 0.015, OVERLOOK_DECK.z1 + 0.2);
  deckTopStripe.userData.skipOutline = true;
  scene.add(deckTopStripe);

  // Solid poured-concrete wedge ramps (West & East) up to +1.50m deck (no floating underside gaps)
  const buildOverlookRamp = (x1: number, x2: number, risesRight: boolean) => {
    const run = x2 - x1;
    const shape = new THREE.Shape();
    if (risesRight) {
      shape.moveTo(0, 0);
      shape.lineTo(run, 0);
      shape.lineTo(run, OVERLOOK_DECK.height);
      shape.closePath();
    } else {
      shape.moveTo(0, 0);
      shape.lineTo(run, 0);
      shape.lineTo(0, OVERLOOK_DECK.height);
      shape.closePath();
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: deckD, bevelEnabled: false });
    const ramp = new THREE.Mesh(geo, overlookDeckMat);
    ramp.position.set(x1, 0, OVERLOOK_DECK.z1);
    ramp.castShadow = true;
    ramp.receiveShadow = true;
    scene.add(ramp);
  };
  buildOverlookRamp(OVERLOOK_DECK.westRampX1, OVERLOOK_DECK.deckX1, true);
  buildOverlookRamp(OVERLOOK_DECK.deckX2, OVERLOOK_DECK.eastRampX2, false);

  // 2 Waist-High Concrete Parapet Cover Blocks on north edge of Overlook Deck (leaves clear sightlines & ramps!)
  addSolidBox(-4.8, OVERLOOK_DECK.z1, -1.6, OVERLOOK_DECK.z1 + 0.42, 0.92, overlookParapetMat, false, OVERLOOK_DECK.height);
  addSolidBox(0.8, OVERLOOK_DECK.z1, 3.6, OVERLOOK_DECK.z1 + 0.42, 0.92, overlookParapetMat, false, OVERLOOK_DECK.height);

  // Warm work-lamp beacon marking the Tactical High Ground
  const overlookPole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 2.2, 6), assets.darkMetalMat);
  overlookPole.position.set(4.1, OVERLOOK_DECK.height + 1.1, OVERLOOK_DECK.z2 - 0.35);
  scene.add(overlookPole);
  addGlowHalo(4.1, OVERLOOK_DECK.height + 2.25, OVERLOOK_DECK.z2 - 0.35, 0xffc66e, 3.6, 3.6, 0.65);

  // =========================================================================
  // INTERACTIVE SECURITY SHUTTERS (РОЛЬСТАВНИ — [E])
  // =========================================================================
  const shutters: SecurityShutterVisual[] = SHUTTER_SPECS.map((spec) => {
    const sh = buildSecurityShutterVisual(spec, assets, textures);
    scene.add(sh.group);
    return sh;
  });

  // Rooftop Red Security Floodlight Beacon
  const floodPole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 3.4, 6), assets.darkMetalMat);
  floodPole.position.set(18.6, 7.2, -3.2);
  scene.add(floodPole);
  const floodHalo = addGlowHalo(18.6, 8.8, -3.2, 0xff3b52, 5.4, 5.4, 0.88);
  const floodCone = new THREE.Mesh(
    new THREE.ConeGeometry(3.2, 9.5, 14, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xff3b52,
      map: textures.beamFade,
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  floodCone.position.set(15.6, 5.2, -1.2);
  floodCone.rotation.z = -0.62;
  floodCone.rotation.x = 0.25;
  scene.add(floodCone);

  // =========================================================================
  // =========================================================================
  // GATE 2: SCULPTED COBRA-HEAD STREETLAMPS, UTILITY POLES & CATENARY CABLES
  // =========================================================================
  const addUtilityPole = (x: number, z: number) => {
    const sideSign: 1 | -1 = x < 0 ? 1 : -1;
    const built = buildSculptedCobraStreetlamp(sideSign, assets.darkMetalMat);
    built.group.position.set(x, 0.18, z);
    scene.add(built.group);
    registerNightEmissive(built.lensMat, 2.2, 0.15);
    addGlowHalo(x + built.lampLocalX, 7.25, z, 0xffbe66, 3.6, 3.6, 0.56);
    return new THREE.Vector3(x, 8.68, z);
  };

  const p1 = addUtilityPole(-13.8, 3.1);
  const p2 = addUtilityPole(5.9, 3.1);
  const p3 = addUtilityPole(17.3, 3.1);
  const p4 = addUtilityPole(17.3, -8.5);
  const cableMat = new THREE.MeshBasicMaterial({ color: 0x0b0e19 });
  [
    [p1, p2],
    [p2, p3],
    [p3, p4],
  ].forEach(([a, b]) => {
    [-0.55, 0.55].forEach((off) => {
      const mid = a.clone().lerp(b, 0.5);
      mid.y -= 1.05;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(a.x, a.y, a.z + off * 0.4),
        mid,
        new THREE.Vector3(b.x, b.y, b.z + off * 0.4),
      ]);
      scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.028, 4, false), cableMat));
    });
  });

  // =========================================================================
  // DISTANT HARBOR SKYLINE, SHIPYARD CRANES, LIGHTHOUSE ON HILL & MOON!
  // =========================================================================
  const skylineMat = new THREE.MeshStandardMaterial({ color: 0x161c36, roughness: 0.94 });
  [
    [-34, -44, 12, 24, 10],
    [-18, -48, 14, 30, 10],
    [2, -52, 16, 26, 12],
    [22, -46, 14, 34, 10],
    [42, -38, 12, 28, 10],
  ].forEach(([bx, bz, bw, bh, bd], bi) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), skylineMat);
    m.position.set(bx, bh / 2, bz);
    scene.add(m);
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.Mesh(
        new THREE.PlaneGeometry(0.95, 0.65),
        new THREE.MeshBasicMaterial({ color: (i + bi) % 3 === 0 ? 0x4ce0e8 : 0xffbe6b }),
      );
      sp.position.set(bx + (((i * 37 + bi * 13) % 10) / 10 - 0.5) * (bw - 2.5), 6 + ((i * 5) % (bh - 8)), bz + bd / 2 + 0.12);
      scene.add(sp);
    }
  });

  // Harbor Crane Silhouette
  const craneGrp = new THREE.Group();
  craneGrp.position.set(34, 0, -40);
  const cMat = new THREE.MeshBasicMaterial({ color: 0x1b2444 });
  const cTower = new THREE.Mesh(new THREE.BoxGeometry(1.1, 24, 1.1), cMat);
  cTower.position.y = 12;
  craneGrp.add(cTower);
  const cBoom = new THREE.Mesh(new THREE.BoxGeometry(18, 0.8, 0.8), cMat);
  cBoom.position.set(-4, 22, 0);
  cBoom.rotation.z = 0.22;
  craneGrp.add(cBoom);
  addGlowHalo(34, 24.5, -40, 0xff3b52, 3.2, 3.2, 0.85);
  scene.add(craneGrp);

  // Coastal Hill + Minato Lighthouse (Image 1 & 3 iconic backdrop!)
  const hill = new THREE.Mesh(
    new THREE.ConeGeometry(18, 12, 16),
    new THREE.MeshStandardMaterial({ color: 0x151b33, roughness: 0.96 }),
  );
  hill.position.set(16, 5.5, -62);
  scene.add(hill);
  const lhTower = new THREE.Mesh(
    new THREE.CylinderGeometry(0.65, 1.15, 7.5, 10),
    new THREE.MeshStandardMaterial({ color: 0xdde6f8, roughness: 0.7 }),
  );
  lhTower.position.set(16, 14.5, -62);
  scene.add(lhTower);
  addGlowHalo(16, 18.6, -62, 0xfff0b5, 5.5, 5.5, 0.82);
  const lighthouseBeam = new THREE.Mesh(
    new THREE.ConeGeometry(4.2, 24, 14, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffe9a6,
      map: textures.beamFade,
      transparent: true,
      opacity: 0.24,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  lighthouseBeam.position.set(16, 18.6, -62);
  lighthouseBeam.rotation.z = Math.PI / 2;
  lighthouseBeam.userData.skipOutline = true;
  lighthouseBeam.userData.excludeFromExport = true;
  scene.add(lighthouseBeam);

  // Full Moon + Glowing Sky Halo
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(4.2, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0xeef5ff, fog: false }),
  );
  moon.position.set(40, 36, -72);
  moon.userData.skipOutline = true;
  moon.userData.excludeFromExport = true;
  scene.add(moon);
  addGlowHalo(40, 36, -71, 0x80b0ff, 26, 26, 0.56);

  // =========================================================================
  // SCULPTED 1980s JDM VEHICLES & STREET DRESSING PROPS
  // =========================================================================
  const placeCar = (
    kind: VehicleKind,
    cx: number,
    cz: number,
    rotY: number,
    elevY = 0,
    addCollider = true,
    parent: THREE.Object3D = scene,
  ) => {
    const built = buildSculptedVehicle(kind, assets, textures, elevY);
    built.group.position.set(cx, elevY, cz);
    built.group.rotation.y = rotY;
    parent.add(built.group);
    if (built.sirenSprites) sirenSprites.push(built.sirenSprites);

    const len = built.bounds.hx * 2;
    const wid = built.bounds.hz * 2;
    const hx = (Math.abs(Math.cos(rotY)) * len + Math.abs(Math.sin(rotY)) * wid) / 2;
    const hz = (Math.abs(Math.sin(rotY)) * len + Math.abs(Math.cos(rotY)) * wid) / 2;

    vehicles.push({
      kind,
      group: built.group,
      proxyGroup: built.proxyGroup,
      customSlotMount: built.customSlotMount,
      glbInstance: null,
      destructible: addCollider && kind !== 'van' && elevY <= 0.25,
      x: cx,
      z: cz,
      elevY,
      hx,
      hz,
      hp: 110,
      maxHp: 110,
      destroyed: false,
      setCharred: built.setCharred,
    });

    if (addCollider) {
      colliders.push({ x1: cx - hx, z1: cz - hz, x2: cx + hx, z2: cz + hz, tall: false });
    }
  };

  placeCar('sedan', -9.2, 8.6, 0.32);
  placeCar('coupe', 4.6, 11.4, -2.65);
  placeCar('taxi', -22.2, 10.6, 0.16);
  placeCar('van', 13.2, 3.8, 1.72);
  // Sunken B1 parked sedan inside east bay (seated flush at -1.25m!)
  placeCar('sedan', 26.5, 7.4, Math.PI, B1_PIT.depth, true);
  // 2nd Floor Parking Cars (attached to parkingUpperGroup so they hide cleanly during B1 interior cutaway!)
  placeCar('sedan', 22.8, 4.8, 0.0, 4.58, false, parkingUpperGroup);
  placeCar('coupe', 22.8, -1.6, Math.PI, 4.58, false, parkingUpperGroup);

  // Street Barricades, Traffic Cones & Military Crates
  const barrMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: textures.barricade, roughness: 0.8 });
  addSolidBox(-25.5, 14.5, -20.0, 15.6, 1.05, barrMat, false);
  addSolidBox(0.5, 4.8, 6.2, 5.8, 1.0, barrMat, false);
  addSolidBox(11.8, 14.2, 17.5, 15.2, 1.05, barrMat, false);

  const coneGeo = new THREE.ConeGeometry(0.24, 0.65, 10);
  const coneMat = new THREE.MeshStandardMaterial({ color: 0xee6228, roughness: 0.52 });
  [
    [-16.5, 5.2],
    [0.2, 6.2],
    [6.4, 6.1],
    [8.8, 15.5],
    [17.8, 12.6],
  ].forEach(([cx, cz]) => {
    const cn = new THREE.Mesh(coneGeo, coneMat);
    cn.position.set(cx, 0.32, cz);
    cn.castShadow = true;
    scene.add(cn);
  });

  const crateMat = new THREE.MeshStandardMaterial({ color: 0x3c4d3a, roughness: 0.82 });
  addSolidBox(-26.5, 10.5, -24.8, 12.2, 0.9, crateMat, false);
  addSolidBox(-26.2, 8.8, -24.9, 10.1, 0.7, crateMat, false);

  // =========================================================================
  // SPRINT 2 LOOK-DEV: GLOSSY NEON PUDDLES, STEAM MANHOLES & JAPANESE STREET PROPS
  // =========================================================================
  const puddleGeo = new THREE.PlaneGeometry(1, 1);
  puddleGeo.rotateX(-Math.PI / 2);
  const puddleSpecs: Array<[number, number, number, number, number, number]> = [
    [-16.2, 11.4, 5.8, 4.2, 0xf45b8a, 0.25], // Taxi / Records magenta puddle
    [-6.2, 13.8, 6.4, 3.8, 0xffb262, -0.18], // Crosswalk amber Café sheen
    [1.8, 8.6, 5.2, 4.4, 0xff6b8c, 0.4], // Café corner neon sheen
    [10.2, 12.4, 5.4, 3.6, 0x4ce0e8, -0.32], // Arcade & flare cyan reflection
    [11.4, -2.5, 4.8, 6.4, 0x4ce0e8, 0.1], // Shopping arcade interior puddle
    [-10.2, 4.8, 4.4, 3.6, 0xffbd70, 0.52], // Quarantine arch mouth puddle
    [18.8, 10.4, 4.6, 3.8, 0x56d8e8, -0.2], // Parking entrance puddle
  ];
  for (const [px, pz, pw, pd, tint, rot] of puddleSpecs) {
    const pMat = new THREE.MeshPhysicalMaterial({
      color: 0x0b1224,
      emissive: tint,
      emissiveIntensity: 0.18,
      roughness: 0.42,
      metalness: 0.24,
      clearcoat: 0.18,
      clearcoatRoughness: 0.36,
      alphaMap: textures.puddleMask,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const puddle = new THREE.Mesh(puddleGeo, pMat);
    puddle.position.set(px, 0.022, pz);
    puddle.scale.set(pw, 1, pd);
    puddle.rotation.y = rot;
    scene.add(puddle);
    nightOnlyVisuals.push(puddle);
  }

  // 4 Cast-Iron Street Manhole Grates + Rising Volumetric Steam Vent Coordinates
  const manholeMat = new THREE.MeshStandardMaterial({ color: 0x1e2436, metalness: 0.72, roughness: 0.45 });
  const grateRimGeo = new THREE.RingGeometry(0.42, 0.56, 16);
  grateRimGeo.rotateX(-Math.PI / 2);
  const grateDiscGeo = new THREE.CircleGeometry(0.44, 14);
  grateDiscGeo.rotateX(-Math.PI / 2);
  const ventDefs: SteamVentSpec[] = [
    { x: -5.4, z: 10.6, tint: 0xffd0a8 }, // Main intersection crosswalk vent (warm Café tint)
    { x: 8.6, z: 1.8, tint: 0xb8f0ff }, // Arcade mouth steam vent (cyan neon tint)
    { x: -13.2, z: 6.4, tint: 0xffb5d2 }, // West street vent (City Pop rose tint)
    { x: 17.6, z: 7.4, tint: 0x9de8f8 }, // Parking B1 vent
  ];
  for (const v of ventDefs) {
    const disc = new THREE.Mesh(grateDiscGeo, manholeMat);
    disc.position.set(v.x, 0.028, v.z);
    const rim = new THREE.Mesh(grateRimGeo, assets.darkMetalMat);
    rim.position.set(v.x, 0.031, v.z);
    scene.add(disc, rim);
    steamVents.push(v);
  }

  // Iconic Orange-Rimmed Japanese Convex Traffic Mirror on East Corner (Concept Art Sheet 1!)
  const trafficMirror = buildConvexTrafficMirror(assets);
  trafficMirror.position.set(16.6, 0.18, 3.6);
  trafficMirror.rotation.y = -0.68;
  scene.add(trafficMirror);

  // Parked 1980s Japanese Commuter Bicycles «ママチャリ» (Concept Art Sheet 1 & 3!)
  const bikeShop = buildParkedBicycle(assets, 0x3b8a96);
  bikeShop.position.set(-24.0, 0.18, 3.25);
  bikeShop.rotation.y = 0.18;
  bikeShop.rotation.x = -0.14;
  scene.add(bikeShop);

  const bikeGuardrail = buildParkedBicycle(assets, 0xa8384e);
  bikeGuardrail.position.set(17.55, 0.18, 12.6);
  bikeGuardrail.rotation.y = Math.PI / 2 - 0.12;
  bikeGuardrail.rotation.x = 0.12;
  scene.add(bikeGuardrail);

  // White Japanese Pedestrian Curb Guardrail (East Foreground, Concept Art Sheet 1!)
  const railMat = new THREE.MeshStandardMaterial({ color: 0xcfd6e4, roughness: 0.45, metalness: 0.35 });
  for (let gz = 11.4; gz <= 15.0; gz += 1.2) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.92, 6), railMat);
    post.position.set(17.15, 0.64, gz);
    scene.add(post);
  }
  [0.98, 0.62].forEach((ry) => {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 3.7, 6), railMat);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(17.15, ry, 13.2);
    scene.add(bar);
  });

  nightOnlyVisuals.push(floodCone, lighthouseBeam, moon);

  // Stage-Gate v2 Dual-Lighting Mood Controller:
  // - 'night': Restrained Noir Night (lifted neutral slate shadows, warm amber practicals, zero monochrome violet crush)
  // - 'day': Neutral Daylight (mandatory honest asset inspection lighting — clear sky, warm sun, dimmed night emissives)
  // - 'sunset': Warm City Pop Sunset
  // - 'mist': Harbor Mist
  const applyMood = (mood: LightingMood) => {
    const isDay = mood === 'day';

    // Toggle night-only additive glow halos, wet neon puddles, beams, headlight cones, and moon cleanly
    for (const v of nightOnlyVisuals) {
      v.visible = !isDay;
    }
    assets.hlConeMat.opacity = isDay ? 0.0 : 0.14;
    for (const entry of nightEmissives) {
      entry.mat.emissiveIntensity = isDay ? entry.day : entry.night;
    }

    // Calibrate street asphalt, concrete, sidewalk & skyline albedo so Neutral Daylight reads like real sunlit concrete
    asphaltMat.color.setHex(isDay ? 0xbec4cc : 0x7e88a6);
    asphaltMat.roughness = isDay ? 0.94 : 0.88;
    swMat.color.setHex(isDay ? 0xe6e8ec : 0xd0d6e4);
    concreteMat.color.setHex(isDay ? 0x9e9a92 : 0x4e5674);
    roofMat.color.setHex(isDay ? 0x5c6068 : 0x222844);
    b1FloorMat.color.setHex(isDay ? 0x8d919a : 0x3b4358);
    overlookDeckMat.color.setHex(isDay ? 0x868a92 : 0x343c4e);
    overlookParapetMat.color.setHex(isDay ? 0x999da6 : 0x414a5e);
    skylineMat.color.setHex(isDay ? 0x6e8096 : 0x161c36);
    paintMat.opacity = isDay ? 0.62 : 0.28;

    // Scale local nocturnal point lights down in neutral daylight so sun shadows dominate honestly
    cityPopLight.intensity = isDay ? 0.0 : 2.6;
    cafeLight.intensity = isDay ? 0.15 : 2.2;
    arcadeMistLight.intensity = isDay ? 0.25 : 2.9;
    parkCyanLight.intensity = isDay ? 0.85 : 2.6;

    if (mood === 'day') {
      scene.background = new THREE.Color(0xacc8e2);
      fog.color.setHex(0xc4d8ea);
      fog.density = 0.0022;
      hemiLight.color.setHex(0xd4e8fa);
      hemiLight.groundColor.setHex(0x7c746a);
      hemiLight.intensity = 1.52;
      moonLight.color.setHex(0xfff6e4);
      moonLight.intensity = 2.55;
      streetFill.color.setHex(0xdce8f4);
      streetFill.intensity = 0.72;
    } else if (mood === 'night') {
      scene.background = new THREE.Color(0x111722);
      fog.color.setHex(0x161e2c);
      fog.density = 0.0082;
      hemiLight.color.setHex(0x7b92b8);
      hemiLight.groundColor.setHex(0x2f3440);
      hemiLight.intensity = 1.12;
      moonLight.color.setHex(0xc4d4e8);
      moonLight.intensity = 1.32;
      streetFill.color.setHex(0xffb874);
      streetFill.intensity = 0.62;
    } else if (mood === 'sunset') {
      scene.background = new THREE.Color(0x362442);
      fog.color.setHex(0x462d50);
      fog.density = 0.0088;
      hemiLight.color.setHex(0xffaa8c);
      hemiLight.groundColor.setHex(0x3a2a42);
      hemiLight.intensity = 1.2;
      moonLight.color.setHex(0xffbc7a);
      moonLight.intensity = 1.48;
      streetFill.color.setHex(0xff92a4);
      streetFill.intensity = 0.48;
    } else {
      scene.background = new THREE.Color(0x122230);
      fog.color.setHex(0x1a3242);
      fog.density = 0.0145;
      hemiLight.color.setHex(0x6cc2d4);
      hemiLight.groundColor.setHex(0x222e38);
      hemiLight.intensity = 1.08;
      moonLight.color.setHex(0x98dce8);
      moonLight.intensity = 1.18;
      streetFill.color.setHex(0x8ad4e0);
      streetFill.intensity = 0.38;
    }
  };

  // Tag all solid architectural volumes, props, signage & vehicles onto OUTLINE_LAYER
  // for crisp screen-space Depth+Normal comic ink outlines (skipping ground, puddles, beams & decals)
  floodCone.userData.skipOutline = true;
  floodCone.userData.excludeFromExport = true;
  enableOutlineLayer(scene, true);

  return {
    colliders,
    occludables,
    neonFlickers,
    steamVents,
    sirenSprites,
    vehicles,
    shutters,
    b1Generator,
    parkCyanLight,
    floodHalo,
    lighthouseBeam,
    hemiLight,
    moonLight,
    fog,
    applyMood,
  };
}
