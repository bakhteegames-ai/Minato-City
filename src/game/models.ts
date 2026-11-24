import * as THREE from 'three';
import { enableOutlineLayer } from './assetPipeline';
import { buildRetroSedanAsset } from '../lab/assets/retroSedan';
import { buildSculptedDeliveryVan } from './sculptedArchitecture';
import { buildSculptedEnemyRig, buildSculptedSurvivorRig } from './sculptedCharacters';
import type { SecurityShutterSpec } from './rules';
import type { EnemyType, SquadRole, VehicleKind } from './types';
import type { MinatoTextureBank } from './textures';

export interface VehicleBuildResult {
  kind: VehicleKind;
  group: THREE.Group;
  proxyGroup: THREE.Group;
  customSlotMount: THREE.Group;
  sirenSprites?: { red: THREE.Sprite; blue: THREE.Sprite };
  bounds: { hx: number; hz: number };
  setCharred: (charred?: boolean) => void;
}

export interface SurvivorVisual {
  group: THREE.Group;
  bodyPivot: THREE.Group;
  proxyGroup: THREE.Group;
  customSlotMount: THREE.Group;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  laser: THREE.Line;
  laserDot: THREE.Sprite;
  muzzleFlash: THREE.Sprite;
  ring: THREE.Mesh;
  gunOffX: number;
  gunOffZ: number;
}

export interface EnemyVisual {
  group: THREE.Group;
  proxyGroup: THREE.Group;
  customSlotMount: THREE.Group;
  bodyMat: THREE.MeshStandardMaterial;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  armL: THREE.Mesh;
  armR: THREE.Mesh;
  hpBg: THREE.Mesh;
  hpBar: THREE.Mesh;
  telegraphRing: THREE.Mesh;
}

export interface SharedModelAssets {
  outlineMat: THREE.MeshBasicMaterial;
  darkMetalMat: THREE.MeshStandardMaterial;
  chromeMat: THREE.MeshStandardMaterial;
  tireMat: THREE.MeshStandardMaterial;
  rimMat: THREE.MeshStandardMaterial;
  carGlassMat: THREE.MeshPhysicalMaterial;
  hlConeMat: THREE.MeshBasicMaterial;
  wheelGeo: THREE.CylinderGeometry;
  rimGeo: THREE.CylinderGeometry;
  hubGeo: THREE.CylinderGeometry;
  dispose: () => void;
}

export function createSharedModelAssets(textures: MinatoTextureBank): SharedModelAssets {
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 16);
  wheelGeo.rotateX(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.23, 0.23, 0.3, 12);
  rimGeo.rotateX(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.32, 8);
  hubGeo.rotateX(Math.PI / 2);

  const outlineMat = new THREE.MeshBasicMaterial({ color: 0x090b15, side: THREE.BackSide });
  const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x1d2236, metalness: 0.65, roughness: 0.38 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xcfd8ec, metalness: 0.9, roughness: 0.16 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x14161f, roughness: 0.92, metalness: 0.04 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xa6b1ca, metalness: 0.82, roughness: 0.22 });
  const carGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x101c38,
    emissive: 0x0b1630,
    emissiveIntensity: 0.35,
    roughness: 0.08,
    metalness: 0.55,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
  });
  const hlConeMat = new THREE.MeshBasicMaterial({
    color: 0xffd788,
    map: textures.beamFade,
    transparent: true,
    opacity: 0.14,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  return {
    outlineMat,
    darkMetalMat,
    chromeMat,
    tireMat,
    rimMat,
    carGlassMat,
    hlConeMat,
    wheelGeo,
    rimGeo,
    hubGeo,
    dispose: () => {
      wheelGeo.dispose();
      rimGeo.dispose();
      hubGeo.dispose();
      outlineMat.dispose();
      darkMetalMat.dispose();
      chromeMat.dispose();
      tireMat.dispose();
      rimMat.dispose();
      carGlassMat.dispose();
      hlConeMat.dispose();
    },
  };
}

export function addContactShadow(
  parent: THREE.Object3D,
  textures: MinatoTextureBank,
  w: number,
  d: number,
): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({
      map: textures.contactShadow,
      transparent: true,
      depthWrite: false,
      opacity: 0.84,
    }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.025;
  m.userData.skipOutline = true;
  m.userData.excludeFromExport = true;
  parent.add(m);
  return m;
}

function addPart(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/**
 * Composite 2-tier sculpted 1980s JDM vehicles matching Concept Art Sheet 1 & 4:
 * Lower sculpted fender hull + inward-tapered cabin greenhouse with dark tinted glass, A/B/C pillars,
 * recessed quad headlights, chrome radiator grille, rubber bumpers, plates, mirrors & subtle beams.
 */
export function buildSculptedVehicle(
  kind: VehicleKind,
  assets: SharedModelAssets,
  textures: MinatoTextureBank,
  elevY = 0,
): VehicleBuildResult {
  if (kind === 'van') {
    return buildSculptedDeliveryVan(assets, textures, elevY);
  }
  const rootGroup = new THREE.Group();
  rootGroup.name = `Vehicle_${kind}`;
  const g = new THREE.Group();
  g.name = `VehicleProxy_${kind}`;
  const customSlotMount = new THREE.Group();
  customSlotMount.name = `VehicleCustom_${kind}`;
  rootGroup.add(g, customSlotMount);

  const charredMat = new THREE.MeshStandardMaterial({
    color: 0x1a1c22,
    roughness: 0.94,
    metalness: 0.14,
  });
  const origMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  const makeCharredFn = (charred = true) => {
    g.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        if (!origMaterials.has(mesh)) {
          origMaterials.set(mesh, mesh.material);
        }
        mesh.material = charred ? charredMat : (origMaterials.get(mesh) ?? mesh.material);
      }
    });
    rootGroup.children.forEach((ch) => {
      if (ch !== g && ch !== customSlotMount && (ch as THREE.Mesh).isMesh) {
        const mesh = ch as THREE.Mesh;
        if (mesh.material === assets.hlConeMat) {
          mesh.visible = !charred;
        }
      }
    });
  };

  // Use the Asset Lab multi-station sculpted Retro Sedan for sedan, taxi, and coupe!
  const variantOpts =
    kind === 'taxi'
      ? {
          bodyHex: '#c89228',
          stripeHex: '#252932',
          includeCreaseInk: false,
          roofTaxiSign: true,
          seed: 121,
        }
      : kind === 'coupe'
        ? {
            bodyHex: '#942938',
            stripeHex: '#d4bd90',
            includeCreaseInk: false,
            roofTaxiSign: false,
            seed: 131,
          }
        : {
            bodyHex: '#3f6372',
            stripeHex: '#c88338',
            includeCreaseInk: false,
            roofTaxiSign: false,
            seed: 111,
          };

  const builtLab = buildRetroSedanAsset(variantOpts);
  // Asset Lab Retro Sedan faces +Z; game vehicle slots face +X -> rotate +PI/2 around Y
  builtLab.root.rotation.y = Math.PI / 2;
  builtLab.root.scale.setScalar(1.03);
  g.add(builtLab.root);

  const len = 4.74;
  const wid = 1.98;
  const hlX = 2.34;
  const hlY = 0.62;

  if (elevY <= 0.25) {
    [-wid * 0.3, wid * 0.3].forEach((hz) => {
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: textures.glowHalo,
          color: 0xffd584,
          transparent: true,
          opacity: 0.3,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      sp.position.set(hlX + 0.12, hlY, hz);
      sp.scale.set(1.05, 1.05, 1);
      g.add(sp);

      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.05, 5.4, 12, 1, true), assets.hlConeMat);
      cone.rotation.z = Math.PI / 2;
      cone.position.set(hlX + 2.75, hlY - 0.1, hz);
      cone.userData.skipOutline = true;
      cone.userData.excludeFromExport = true;
      rootGroup.add(cone);
    });
  }

  enableOutlineLayer(g, false);
  addContactShadow(rootGroup, textures, len + 1.0, wid + 0.9);

  return {
    kind,
    group: rootGroup,
    proxyGroup: g,
    customSlotMount,
    bounds: { hx: len / 2, hz: wid / 2 },
    setCharred: makeCharredFn,
  };
}

/**
 * GATE 2: Sculpted DRG + TF2 + Borderlands 2 Tactical Squad Member (~1.92m adult heroic proportions).
 */
export function buildSurvivorModel(
  role: SquadRole,
  accentHex: number,
  jacketHex: number,
  assets: SharedModelAssets,
  textures: MinatoTextureBank,
): SurvivorVisual {
  return buildSculptedSurvivorRig(role, accentHex, jacketHex, assets, textures);
}

/**
 * GATE 2: Sculpted DRG + TF2 + Borderlands 2 Infected Archetypes (hunched lofted anatomy & angular silhouettes).
 */
export function buildEnemyModel(
  type: EnemyType,
  bodyHex: number,
  accentHex: number,
  armored: boolean,
  ranged: boolean,
  boss: boolean,
  assets: SharedModelAssets,
  textures: MinatoTextureBank,
): EnemyVisual {
  return buildSculptedEnemyRig(type, bodyHex, accentHex, armored, ranged, boss, assets, textures);
}

/**
 * Composite 3D Sakura Tree (multi-branch curved TubeGeometry + layered blossom canopy)
 */
export function buildSakuraTree(): THREE.Group {
  const g = new THREE.Group();
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x463038, roughness: 0.92 });
  const trunkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(-0.25, 1.5, 0.15),
    new THREE.Vector3(0.18, 3.2, -0.1),
    new THREE.Vector3(0.0, 4.4, 0.05),
  ]);
  const trunk = new THREE.Mesh(new THREE.TubeGeometry(trunkCurve, 12, 0.36, 8, false), barkMat);
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  g.add(trunk);

  // 3 Spreading boughs
  [
    [new THREE.Vector3(0.1, 2.8, 0), new THREE.Vector3(-1.8, 4.2, 0.9)],
    [new THREE.Vector3(0.1, 3.0, 0), new THREE.Vector3(1.9, 4.3, 0.6)],
    [new THREE.Vector3(0.0, 3.3, -0.1), new THREE.Vector3(-0.3, 4.5, -1.9)],
  ].forEach(([a, b]) => {
    const mid = a.clone().lerp(b, 0.5);
    mid.y += 0.35;
    const br = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a, mid, b]), 8, 0.16, 6, false),
      barkMat,
    );
    br.castShadow = true;
    g.add(br);
  });

  const sakMat1 = new THREE.MeshStandardMaterial({
    color: 0xf48db8,
    emissive: 0x751f49,
    emissiveIntensity: 0.38,
    roughness: 0.72,
  });
  const sakMat2 = new THREE.MeshStandardMaterial({
    color: 0xffbad8,
    emissive: 0x62183f,
    emissiveIntensity: 0.32,
    roughness: 0.72,
  });

  [
    [0.0, 5.1, 0.0, 2.5],
    [-2.0, 4.5, 1.0, 1.9],
    [2.0, 4.6, 0.7, 2.0],
    [-0.3, 4.6, -2.0, 1.85],
    [1.1, 5.4, -0.9, 1.65],
    [-1.2, 5.3, -0.6, 1.6],
  ].forEach(([cx, cy, cz, cr], idx) => {
    const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(cr, 1), idx % 2 === 0 ? sakMat1 : sakMat2);
    crown.scale.set(1.15, 0.76, 1.1);
    crown.position.set(cx, cy, cz);
    crown.castShadow = true;
    g.add(crown);
  });

  return g;
}

/**
 * Composite Rooftop Japanese Water Tower (braced legs + steel bands + wooden tank + cone cap)
 */
export function buildWaterTower(darkMetalMat: THREE.MeshStandardMaterial): THREE.Group {
  const wt = new THREE.Group();
  const legGeo = new THREE.CylinderGeometry(0.13, 0.18, 3.2, 6);
  [
    [-1.3, -1.3],
    [1.3, -1.3],
    [-1.3, 1.3],
    [1.3, 1.3],
  ].forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(legGeo, darkMetalMat);
    leg.position.set(lx, 1.6, lz);
    wt.add(leg);
  });
  const platform = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.22, 3.5), darkMetalMat);
  platform.position.y = 3.1;
  wt.add(platform);

  const tank = new THREE.Mesh(
    new THREE.CylinderGeometry(2.0, 2.0, 3.1, 16),
    new THREE.MeshStandardMaterial({ color: 0x45455e, roughness: 0.78 }),
  );
  tank.position.y = 4.65;
  tank.castShadow = true;
  wt.add(tank);

  [3.8, 4.65, 5.5].forEach((by) => {
    const band = new THREE.Mesh(new THREE.TorusGeometry(2.03, 0.06, 6, 20), darkMetalMat);
    band.rotation.x = Math.PI / 2;
    band.position.y = by;
    wt.add(band);
  });

  const cap = new THREE.Mesh(new THREE.ConeGeometry(2.26, 1.25, 16), darkMetalMat);
  cap.position.y = 6.8;
  wt.add(cap);
  return wt;
}

export interface BarrelVisual {
  group: THREE.Group;
  bodyMat: THREE.MeshStandardMaterial;
  dangerRing: THREE.Mesh;
  intactGroup: THREE.Group;
  charredGroup: THREE.Group;
}

/**
 * Composite 3D Explosive Fuel Drum (ribbed crimson drum, yellow hazard stripe,
 * steel rolling hoops, filler cap, ground warning ring, and charred crater debris state)
 */
export function buildExplosiveBarrel(
  assets: SharedModelAssets,
  textures: MinatoTextureBank,
): BarrelVisual {
  const group = new THREE.Group();
  const intactGroup = new THREE.Group();
  const charredGroup = new THREE.Group();
  charredGroup.visible = false;
  group.add(intactGroup, charredGroup);

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xd9303e,
    emissive: 0x3a070d,
    emissiveIntensity: 0.35,
    roughness: 0.42,
    metalness: 0.36,
  });

  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 1.18, 14), bodyMat);
  drum.position.y = 0.59;
  drum.castShadow = true;
  drum.receiveShadow = true;
  intactGroup.add(drum);

  // Dark comic outline
  const outline = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 1.18, 14), assets.outlineMat);
  outline.position.y = 0.59;
  outline.scale.set(1.07, 1.03, 1.07);
  intactGroup.add(outline);

  // High-contrast yellow hazard caution band
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(0.475, 0.475, 0.24, 14),
    new THREE.MeshStandardMaterial({
      color: 0xf4c430,
      emissive: 0x5c4200,
      emissiveIntensity: 0.4,
      roughness: 0.45,
    }),
  );
  band.position.y = 0.62;
  intactGroup.add(band);

  // Steel rolling ribs + top bung cap
  [0.14, 0.44, 0.8, 1.12].forEach((ry) => {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.032, 6, 16), assets.darkMetalMat);
    rib.rotation.x = Math.PI / 2;
    rib.position.y = ry;
    intactGroup.add(rib);
  });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 8), assets.chromeMat);
  cap.position.set(0.18, 1.2, 0.08);
  intactGroup.add(cap);

  // Subtle crimson danger ring on asphalt for instant tactical readability
  const dangerRing = new THREE.Mesh(
    new THREE.RingGeometry(0.68, 0.82, 20),
    new THREE.MeshBasicMaterial({
      color: 0xff4558,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  dangerRing.rotation.x = -Math.PI / 2;
  dangerRing.position.y = 0.04;
  dangerRing.userData.skipOutline = true;
  dangerRing.userData.excludeFromExport = true;
  intactGroup.add(dangerRing);
  addContactShadow(intactGroup, textures, 1.4, 1.4);

  // Charred post-detonation collapsed metal rim
  const charredMat = new THREE.MeshStandardMaterial({ color: 0x161822, roughness: 0.94, metalness: 0.4 });
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.5, 0.16, 12, 1, true), charredMat);
  rim.position.y = 0.08;
  charredGroup.add(rim);

  enableOutlineLayer(intactGroup, false);

  return { group, bodyMat, dangerRing, intactGroup, charredGroup };
}

export interface WaypointChevronVisual {
  group: THREE.Group;
  mat: THREE.MeshBasicMaterial;
}

/**
 * Diegetic 3D ground chevron orbiting the active unit's feet, pointing cleanly toward
 * the active threat cluster, Tank Boss, or unlocked Extraction Zone [F].
 */
export function buildWaypointChevron(): WaypointChevronVisual {
  const group = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.52);
  shape.lineTo(0.36, -0.18);
  shape.lineTo(0.16, -0.18);
  shape.lineTo(0, 0.16);
  shape.lineTo(-0.16, -0.18);
  shape.lineTo(-0.36, -0.18);
  shape.closePath();

  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);

  const mat = new THREE.MeshBasicMaterial({
    color: 0x4ce0e8,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, 0.075, 1.55);
  group.add(mesh);
  return { group, mat };
}

/**
 * Iconic Japanese Curved Convex Road Safety Mirror on striped steel post (Concept Art Sheet 1 right side!)
 */
export function buildConvexTrafficMirror(assets: SharedModelAssets): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.075, 3.6, 8), assets.chromeMat);
  pole.position.y = 1.8;
  pole.castShadow = true;
  g.add(pole);

  // Yellow & black Japanese warning bands
  const yellowMat = new THREE.MeshStandardMaterial({ color: 0xf4c430, roughness: 0.45 });
  [0.75, 1.15, 1.55].forEach((by) => {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.078, 0.16, 8), yellowMat);
    band.position.y = by;
    g.add(band);
  });

  // Orange metal visor rim + curved convex reflective glass dome
  const orangeMat = new THREE.MeshStandardMaterial({ color: 0xe86424, roughness: 0.38, metalness: 0.25 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.065, 8, 22), orangeMat);
  rim.position.set(0, 3.25, 0.12);
  g.add(rim);

  const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.22, 18, 1, true, 0, Math.PI), orangeMat);
  hood.rotation.z = Math.PI / 2;
  hood.rotation.y = Math.PI / 2;
  hood.position.set(0, 3.25, 0.2);
  g.add(hood);

  const mirrorGlass = new THREE.Mesh(
    new THREE.SphereGeometry(0.54, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.45),
    new THREE.MeshPhysicalMaterial({
      color: 0xc8daf4,
      metalness: 0.92,
      roughness: 0.05,
      clearcoat: 1.0,
    }),
  );
  mirrorGlass.rotation.x = Math.PI / 2;
  mirrorGlass.scale.set(1, 0.32, 1);
  mirrorGlass.position.set(0, 3.25, 0.12);
  g.add(mirrorGlass);

  return g;
}

/**
 * Stylized 1980s Japanese Commuter Bicycle «ママチャリ» parked along shopfront/guardrail (Concept Art Sheet 1 & 3!)
 */
export function buildParkedBicycle(assets: SharedModelAssets, frameHex = 0x3b7a8c): THREE.Group {
  const g = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: frameHex, metalness: 0.55, roughness: 0.32 });
  const wheelTorus = new THREE.TorusGeometry(0.35, 0.04, 6, 18);

  [-0.56, 0.56].forEach((wx) => {
    const wheel = new THREE.Mesh(wheelTorus, assets.tireMat);
    wheel.position.set(wx, 0.37, 0);
    wheel.castShadow = true;
    g.add(wheel);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.018, 6, 16), assets.chromeMat);
    rim.position.set(wx, 0.37, 0);
    g.add(rim);
  });

  // Tubular step-through commuter frame
  const bar1 = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.95, 6), frameMat);
  bar1.rotation.z = 1.25;
  bar1.position.set(0, 0.58, 0);
  g.add(bar1);

  const seatPost = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.62, 6), frameMat);
  seatPost.rotation.z = 0.24;
  seatPost.position.set(-0.24, 0.68, 0);
  g.add(seatPost);

  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.16), assets.darkMetalMat);
  saddle.position.set(-0.32, 0.98, 0);
  g.add(saddle);

  const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.72, 6), frameMat);
  fork.rotation.z = 0.28;
  fork.position.set(0.45, 0.68, 0);
  g.add(fork);

  // Curved handlebars + front wire basket
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.56, 6), assets.chromeMat);
  handle.rotation.x = Math.PI / 2;
  handle.position.set(0.36, 1.02, 0);
  g.add(handle);

  const basket = new THREE.Mesh(
    new THREE.BoxGeometry(0.26, 0.22, 0.34),
    new THREE.MeshStandardMaterial({ color: 0x262c3f, roughness: 0.6, metalness: 0.5, wireframe: true }),
  );
  basket.position.set(0.62, 0.88, 0);
  g.add(basket);

  return g;
}

export interface B1GeneratorVisual {
  group: THREE.Group;
  rotor: THREE.Mesh;
  beaconMat: THREE.MeshStandardMaterial;
  beaconHalo: THREE.Sprite;
  captureRing: THREE.Mesh;
  captureRingMat: THREE.MeshBasicMaterial;
  progressArc: THREE.Mesh;
}

/**
 * Interactive 1980s Industrial Emergency Power Generator in Parking B1.
 * Features cel-shaded generator chassis, cooling vents, spinning copper coil rotor,
 * warning beacon, and diegetic 3D ground capture ring.
 */
export function buildB1Generator(assets: SharedModelAssets, textures: MinatoTextureBank): B1GeneratorVisual {
  const group = new THREE.Group();

  const chassisMat = new THREE.MeshStandardMaterial({ color: 0x3a465e, metalness: 0.55, roughness: 0.42 });
  const hazardMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: textures.barricade, roughness: 0.72 });
  const copperMat = new THREE.MeshStandardMaterial({
    color: 0xd98a3c,
    emissive: 0x703810,
    emissiveIntensity: 0.45,
    metalness: 0.72,
    roughness: 0.32,
  });

  // Ground skid base
  addPart(group, new THREE.BoxGeometry(2.3, 0.24, 1.55), hazardMat, 0, 0.12, 0);

  // Heavy generator cabinet + cooling ribs
  addPart(group, new THREE.BoxGeometry(1.95, 1.25, 1.25), chassisMat, -0.05, 0.86, 0);
  for (let i = -2; i <= 2; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.86, 1.32), assets.darkMetalMat);
    fin.position.set(-0.35 + i * 0.22, 0.88, 0);
    group.add(fin);
  }

  // Spinning copper turbine flywheel exposed on east end
  const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.26, 12), copperMat);
  rotor.rotation.z = Math.PI / 2;
  rotor.position.set(1.02, 0.86, 0);
  group.add(rotor);

  // Exhaust muffler stack
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.95, 8), assets.darkMetalMat);
  pipe.position.set(-0.78, 1.85, -0.35);
  group.add(pipe);

  // Overhead warning / status beacon (transitions from pulsing Amber -> bright Cyan when online!)
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0xf5b971,
    emissive: 0xf5b971,
    emissiveIntensity: 1.85,
    roughness: 0.2,
  });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.28, 10), beaconMat);
  beacon.position.set(0.35, 1.66, 0);
  group.add(beacon);

  const beaconHalo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: textures.glowHalo,
      color: 0xf5b971,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  beaconHalo.position.set(0.35, 1.85, 0);
  beaconHalo.scale.set(4.2, 4.2, 1);
  group.add(beaconHalo);

  // Overhead B1 Generator signage plaque
  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(2.1, 0.62),
    new THREE.MeshStandardMaterial({
      map: textures.signGenerator,
      emissive: 0xf5b971,
      emissiveMap: textures.signGenerator,
      emissiveIntensity: 1.15,
      roughness: 0.35,
    }),
  );
  plaque.position.set(0, 2.38, 0.2);
  plaque.rotation.y = -0.35;
  group.add(plaque);

  // Diegetic 3D Ground Activation Ring (radius 3.3m matching B1_GENERATOR.r)
  const captureRingMat = new THREE.MeshBasicMaterial({
    color: 0xf5b971,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const captureRing = new THREE.Mesh(new THREE.RingGeometry(3.02, 3.3, 36), captureRingMat);
  captureRing.rotation.x = -Math.PI / 2;
  captureRing.position.y = 0.055;
  group.add(captureRing);

  const progressArc = new THREE.Mesh(
    new THREE.CircleGeometry(2.96, 32),
    new THREE.MeshBasicMaterial({
      color: 0x4ce0e8,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  progressArc.rotation.x = -Math.PI / 2;
  progressArc.position.y = 0.048;
  progressArc.scale.setScalar(0.01);
  progressArc.visible = false;
  group.add(progressArc);

  return { group, rotor, beaconMat, beaconHalo, captureRing, captureRingMat, progressArc };
}

/**
 * Warm Japanese iron garden lantern for the expanded Sakura Courtyard.
 */
export function buildCourtyardLantern(assets: SharedModelAssets, textures: MinatoTextureBank): THREE.Group {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 2.2, 8), assets.darkMetalMat);
  post.position.y = 1.1;
  post.castShadow = true;
  g.add(post);

  const lamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.38, 0.32),
    new THREE.MeshStandardMaterial({
      color: 0xffdfa0,
      emissive: 0xffa84c,
      emissiveIntensity: 1.55,
      roughness: 0.3,
    }),
  );
  lamp.position.y = 2.34;
  g.add(lamp);

  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.24, 4), assets.darkMetalMat);
  cap.rotation.y = Math.PI / 4;
  cap.position.y = 2.64;
  g.add(cap);

  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: textures.glowHalo,
      color: 0xffb862,
      transparent: true,
      opacity: 0.62,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  halo.position.y = 2.34;
  halo.scale.set(3.4, 3.4, 1);
  g.add(halo);

  return g;
}

/**
 * Wooden Japanese park bench for low tactical cover in the Sakura Courtyard.
 */
export function buildParkBench(assets: SharedModelAssets): THREE.Group {
  const g = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b402c, roughness: 0.78 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 0.56), woodMat);
  seat.position.set(0, 0.46, 0);
  seat.castShadow = true;
  seat.receiveShadow = true;
  g.add(seat);

  const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.42, 0.08), woodMat);
  back.position.set(0, 0.78, -0.24);
  back.rotation.x = -0.15;
  back.castShadow = true;
  g.add(back);

  [-0.85, 0.85].forEach((lx) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.46, 0.5), assets.darkMetalMat);
    leg.position.set(lx, 0.23, 0);
    g.add(leg);
  });

  return g;
}

export interface AmmoCrateVisual {
  group: THREE.Group;
  stripMat: THREE.MeshStandardMaterial;
  beacon: THREE.Mesh;
  beaconMat: THREE.MeshStandardMaterial;
  ringMat: THREE.MeshBasicMaterial;
}

/**
 * Interactive tactical military ammo & flare supply crate with cooldown status glow.
 */
export function buildAmmoCrate(assets: SharedModelAssets, textures: MinatoTextureBank): AmmoCrateVisual {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x263442, roughness: 0.72, metalness: 0.25 });
  const lidMat = new THREE.MeshStandardMaterial({ color: 0x344658, roughness: 0.65, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.74, 0.88), bodyMat);
  body.position.y = 0.37;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.14, 0.94), lidMat);
  lid.position.y = 0.79;
  lid.castShadow = true;
  group.add(lid);

  [-0.52, 0.52].forEach((lx) => {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.84, 0.96), assets.darkMetalMat);
    strap.position.set(lx, 0.44, 0);
    group.add(strap);
  });

  const stripMat = new THREE.MeshStandardMaterial({
    color: 0x4ce0e8,
    emissive: 0x4ce0e8,
    emissiveIntensity: 1.55,
    roughness: 0.25,
  });
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.08, 0.26), stripMat);
  strip.position.y = 0.89;
  group.add(strip);

  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0x4ce0e8,
    emissive: 0x4ce0e8,
    emissiveIntensity: 1.4,
    roughness: 0.2,
  });
  const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), beaconMat);
  beacon.position.y = 1.48;
  group.add(beacon);

  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: textures.glowHalo,
      color: 0x4ce0e8,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  halo.position.y = 1.4;
  halo.scale.set(2.6, 2.6, 1);
  group.add(halo);

  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x4ce0e8,
    transparent: true,
    opacity: 0.65,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.45, 1.68, 28), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  ring.userData.skipOutline = true;
  ring.userData.excludeFromExport = true;
  group.add(ring);

  enableOutlineLayer(group, false);

  return { group, stripMat, beacon, beaconMat, ringMat };
}

export interface HoldBeaconVisual {
  group: THREE.Group;
  ring: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  core: THREE.Mesh;
}

/**
 * Diegetic 3D Ground Beacon marking the squad's Hold Position anchor when [Q] is set to HOLD.
 */
export function buildHoldBeacon(): HoldBeaconVisual {
  const group = new THREE.Group();
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xf5b971,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.65, 2.9, 36), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.065;
  group.add(ring);

  const innerRing = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.72, 16),
    new THREE.MeshBasicMaterial({
      color: 0xf5b971,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  innerRing.rotation.x = -Math.PI / 2;
  innerRing.position.y = 0.07;
  group.add(innerRing);

  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.24, 0),
    new THREE.MeshStandardMaterial({
      color: 0xf5b971,
      emissive: 0xf5b971,
      emissiveIntensity: 1.5,
      roughness: 0.2,
    }),
  );
  core.position.y = 1.05;
  group.add(core);
  group.visible = false;

  return { group, ring, ringMat, core };
}

/**
 * Diegetic 3D Focus-Fire Target Lock ring placed under the prioritized enemy in FOCUS stance.
 */
export function buildFocusTargetRing(): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(0.88, 1.12, 24),
    new THREE.MeshBasicMaterial({
      color: 0xf45b8a,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.08;
  mesh.visible = false;
  return mesh;
}

export interface SecurityShutterVisual {
  spec: SecurityShutterSpec;
  group: THREE.Group;
  curtainMesh: THREE.Mesh;
  beaconMat: THREE.MeshStandardMaterial;
  panelRingMat: THREE.MeshBasicMaterial;
  setOpenRatio: (closedAmount: number, status: 'open' | 'sealed' | 'cooldown') => void;
}

/**
 * Interactive Japanese Urban Security Rolling Shutter (Рольставня) mounted across tactical bottlenecks.
 * Pressing [E] near the illuminated keypad drops the ribbed steel curtain to seal off flanking hordes.
 */
export function buildSecurityShutterVisual(
  spec: SecurityShutterSpec,
  assets: SharedModelAssets,
  textures: MinatoTextureBank,
): SecurityShutterVisual {
  const group = new THREE.Group();
  group.name = `SecurityShutter_${spec.id}`;
  group.position.set(spec.x, 0, spec.z);
  const rotY = spec.axis === 'z' ? Math.PI / 2 : 0;

  const frameGroup = new THREE.Group();
  frameGroup.rotation.y = rotY;
  group.add(frameGroup);

  const housingH = 3.55;
  const shutterW = spec.width;

  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x3b4454,
    roughness: 0.68,
    metalness: 0.48,
  });
  const curtainMat = new THREE.MeshStandardMaterial({
    color: 0x626c7c,
    map: textures.barricade,
    roughness: 0.62,
    metalness: 0.54,
  });

  // Overhead roller drum housing
  const drumBox = new THREE.Mesh(new THREE.BoxGeometry(shutterW + 0.5, 0.58, 0.62), steelMat);
  drumBox.position.set(0, housingH, 0);
  drumBox.castShadow = true;
  frameGroup.add(drumBox);

  // Left & Right vertical steel guide rails
  [-shutterW / 2 - 0.14, shutterW / 2 + 0.14].forEach((rx) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.24, housingH, 0.32), assets.darkMetalMat);
    rail.position.set(rx, housingH / 2, 0);
    rail.castShadow = true;
    frameGroup.add(rail);
  });

  // Animated corrugated steel curtain (scales down from overhead drum housing)
  const curtainMesh = new THREE.Mesh(new THREE.BoxGeometry(shutterW, 3.28, 0.18), curtainMat);
  curtainMesh.position.set(0, housingH - 0.35, 0);
  curtainMesh.scale.y = 0.05;
  curtainMesh.castShadow = true;
  curtainMesh.receiveShadow = true;
  frameGroup.add(curtainMesh);

  // Painted yellow/black floor threshold hazard strip
  const floorStrip = new THREE.Mesh(
    new THREE.PlaneGeometry(shutterW + 0.2, 0.65),
    new THREE.MeshStandardMaterial({
      map: textures.barricade,
      roughness: 0.85,
      transparent: true,
      opacity: 0.72,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
  );
  floorStrip.rotation.x = -Math.PI / 2;
  floorStrip.position.set(0, 0.032, 0);
  floorStrip.userData.skipOutline = true;
  frameGroup.add(floorStrip);

  // Interactive Control Keypad Pillar (placed in world-relative offset at panelX, panelZ)
  const panelGrp = new THREE.Group();
  panelGrp.position.set(spec.panelX - spec.x, 0, spec.panelZ - spec.z);
  group.add(panelGrp);

  const post = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.38, 0.28), assets.darkMetalMat);
  post.position.y = 0.69;
  post.castShadow = true;
  panelGrp.add(post);

  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0x4ce0e8,
    emissive: 0x4ce0e8,
    emissiveIntensity: 1.4,
    roughness: 0.25,
  });
  const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.28, 0.32), beaconMat);
  beacon.position.y = 1.24;
  panelGrp.add(beacon);

  const panelRingMat = new THREE.MeshBasicMaterial({
    color: 0x4ce0e8,
    transparent: true,
    opacity: 0.62,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const panelRing = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.05, 24), panelRingMat);
  panelRing.rotation.x = -Math.PI / 2;
  panelRing.position.y = 0.06;
  panelRing.userData.skipOutline = true;
  panelRing.userData.excludeFromExport = true;
  panelGrp.add(panelRing);

  enableOutlineLayer(group, false);

  const setOpenRatio = (closedAmount: number, status: 'open' | 'sealed' | 'cooldown') => {
    const clamped = Math.max(0.05, Math.min(1, closedAmount));
    curtainMesh.scale.y = clamped;
    curtainMesh.position.y = housingH - 0.24 - (3.28 * clamped) / 2;

    if (status === 'sealed') {
      beaconMat.color.setHex(0xf5b971);
      beaconMat.emissive.setHex(0xf5b971);
      panelRingMat.color.setHex(0xf5b971);
    } else if (status === 'cooldown') {
      beaconMat.color.setHex(0xff4c5e);
      beaconMat.emissive.setHex(0xff4c5e);
      panelRingMat.color.setHex(0xff4c5e);
    } else {
      beaconMat.color.setHex(0x4ce0e8);
      beaconMat.emissive.setHex(0x4ce0e8);
      panelRingMat.color.setHex(0x4ce0e8);
    }
  };

  return { spec, group, curtainMesh, beaconMat, panelRingMat, setOpenRatio };
}




