import * as THREE from 'three';
import { enableOutlineLayer } from './assetPipeline';
import type { EnemyType, SquadRole, VehicleKind } from './types';
import type { MinatoTextureBank } from './textures';

export interface VehicleBuildResult {
  kind: VehicleKind;
  group: THREE.Group;
  proxyGroup: THREE.Group;
  customSlotMount: THREE.Group;
  sirenSprites?: { red: THREE.Sprite; blue: THREE.Sprite };
  bounds: { hx: number; hz: number };
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
  const rootGroup = new THREE.Group();
  rootGroup.name = `Vehicle_${kind}`;
  const g = new THREE.Group();
  g.name = `VehicleProxy_${kind}`;
  const customSlotMount = new THREE.Group();
  customSlotMount.name = `VehicleCustom_${kind}`;
  rootGroup.add(g, customSlotMount);
  const lowerShape = new THREE.Shape();

  let len = 4.78;
  let wid = 1.98;
  let bodyHex = 0x8e97a6;
  let hlY = 0.66;
  let hlX = 2.38;
  let tlX = -2.38;

  if (kind === 'coupe') {
    bodyHex = 0x9e1f36;
    wid = 2.02;
    hlY = 0.62;
    hlX = 2.36;
    lowerShape.moveTo(-2.34, 0.28);
    lowerShape.lineTo(2.38, 0.28);
    lowerShape.lineTo(2.46, 0.54);
    lowerShape.lineTo(2.14, 0.78);
    lowerShape.lineTo(0.84, 0.88);
    lowerShape.lineTo(-2.14, 0.86);
    lowerShape.lineTo(-2.38, 0.62);
    lowerShape.closePath();
  } else if (kind === 'van') {
    bodyHex = 0x8e9eb4;
    len = 4.95;
    wid = 2.14;
    hlY = 0.78;
    hlX = 2.46;
    tlX = -2.44;
    lowerShape.moveTo(-2.42, 0.34);
    lowerShape.lineTo(2.4, 0.34);
    lowerShape.lineTo(2.48, 0.92);
    lowerShape.lineTo(2.34, 1.38);
    lowerShape.lineTo(1.94, 2.08);
    lowerShape.lineTo(-2.34, 2.08);
    lowerShape.lineTo(-2.46, 1.86);
    lowerShape.closePath();
  } else {
    // Rich iconic Crown Comfort Taxi yellow & vintage silver-cream Family Sedan
    bodyHex = kind === 'taxi' ? 0xebb128 : 0xb8c0d0;
    lowerShape.moveTo(-2.36, 0.3);
    lowerShape.lineTo(2.36, 0.3);
    lowerShape.lineTo(2.44, 0.64);
    lowerShape.lineTo(2.34, 0.88);
    lowerShape.lineTo(0.95, 0.93);
    lowerShape.lineTo(-1.56, 0.93);
    lowerShape.lineTo(-2.34, 0.88);
    lowerShape.lineTo(-2.42, 0.62);
    lowerShape.closePath();
  }

  const lowerExt = new THREE.ExtrudeGeometry(lowerShape, {
    depth: wid - 0.14,
    bevelEnabled: true,
    bevelThickness: 0.07,
    bevelSize: 0.055,
    bevelSegments: 2,
  });
  lowerExt.translate(0, 0, -(wid - 0.14) / 2);

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: bodyHex,
    roughness: kind === 'coupe' ? 0.34 : 0.48,
    metalness: kind === 'coupe' ? 0.28 : 0.14,
    clearcoat: 0.34,
    clearcoatRoughness: 0.34,
  });
  const lowerMesh = new THREE.Mesh(lowerExt, bodyMat);
  lowerMesh.castShadow = true;
  lowerMesh.receiveShadow = true;
  g.add(lowerMesh);

  let sirenSprites: { red: THREE.Sprite; blue: THREE.Sprite } | undefined;

  if (kind === 'van') {
    const ws = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.68, wid - 0.2), assets.carGlassMat);
    ws.position.set(2.16, 1.66, 0);
    ws.rotation.z = 0.42;
    g.add(ws);

    const cabSideGlass = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.54, wid + 0.015), assets.carGlassMat);
    cabSideGlass.position.set(1.36, 1.68, 0);
    g.add(cabSideGlass);

    const rearCargoWin = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.44, wid + 0.015), assets.carGlassMat);
    rearCargoWin.position.set(-0.92, 1.68, 0);
    g.add(rearCargoWin);

    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(len - 0.12, 0.24, wid + 0.04),
      new THREE.MeshStandardMaterial({ color: 0x20447e, roughness: 0.5 }),
    );
    stripe.position.set(0, 0.98, 0);
    g.add(stripe);

    const liveryMat = new THREE.MeshStandardMaterial({ map: textures.vanSide, roughness: 0.6 });
    const livL = new THREE.Mesh(new THREE.PlaneGeometry(2.85, 0.96), liveryMat);
    livL.position.set(-0.68, 1.16, wid / 2 + 0.03);
    g.add(livL);
    const livR = new THREE.Mesh(new THREE.PlaneGeometry(2.85, 0.96), liveryMat);
    livR.position.set(-0.68, 1.16, -wid / 2 - 0.03);
    livR.rotation.y = Math.PI;
    g.add(livR);

    [-wid / 2 - 0.15, wid / 2 + 0.15].forEach((mz) => {
      const mArm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, 0.16), assets.darkMetalMat);
      mArm.position.set(2.05, 1.56, mz);
      g.add(mArm);
    });
    const amberClearMat = new THREE.MeshBasicMaterial({ color: 0xe6ac48 });
    [-0.58, 0, 0.58].forEach((cz) => {
      const cl = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, 0.15), amberClearMat);
      cl.position.set(1.94, 2.13, cz);
      g.add(cl);
    });

    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.18, 1.16), assets.darkMetalMat);
    bar.position.set(1.25, 2.22, 0);
    g.add(bar);

    const spR = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: textures.glowHalo,
        color: 0xff3b52,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    spR.position.set(1.25, 2.36, 0.38);
    spR.scale.set(1.8, 1.8, 1);
    g.add(spR);

    const spB = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: textures.glowHalo,
        color: 0x4ce0e8,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    spB.position.set(1.25, 2.36, -0.38);
    spB.scale.set(1.8, 1.8, 1);
    g.add(spB);
    sirenSprites = { red: spR, blue: spB };
  } else {
    // True Narrower Inward-Tapered Cabin Greenhouse (separate upper tier narrower than fenders!)
    const isCoupe = kind === 'coupe';
    const cabShape = new THREE.Shape();
    if (isCoupe) {
      cabShape.moveTo(-1.82, 0.84);
      cabShape.lineTo(0.84, 0.86);
      cabShape.lineTo(0.16, 1.32);
      cabShape.lineTo(-0.88, 1.32);
      cabShape.closePath();
    } else {
      cabShape.moveTo(-1.54, 0.9);
      cabShape.lineTo(0.92, 0.9);
      cabShape.lineTo(0.42, 1.48);
      cabShape.lineTo(-1.04, 1.48);
      cabShape.closePath();
    }
    const cabWidth = wid - 0.34;
    const cabGlassExt = new THREE.ExtrudeGeometry(cabShape, {
      depth: cabWidth,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.04,
      bevelSegments: 2,
    });
    cabGlassExt.translate(0, 0, -cabWidth / 2);
    const glassCabin = new THREE.Mesh(cabGlassExt, assets.carGlassMat);
    glassCabin.castShadow = true;
    g.add(glassCabin);

    // Sculpted Roof Panel Cap (Body color, cleanly sitting atop the glass greenhouse!)
    const roofCap = new THREE.Mesh(
      new THREE.BoxGeometry(isCoupe ? 1.12 : 1.54, 0.09, cabWidth + 0.06),
      bodyMat,
    );
    roofCap.position.set(isCoupe ? -0.36 : -0.31, isCoupe ? 1.33 : 1.5, 0);
    roofCap.castShadow = true;
    g.add(roofCap);

    // Sculpted A-Pillars, B-Pillars & C-Pillars framing the dark glass windows!
    const pillarZ = cabWidth / 2 + 0.025;
    [-pillarZ, pillarZ].forEach((pz) => {
      // A-pillar (sloped)
      const aP = new THREE.Mesh(new THREE.BoxGeometry(0.08, isCoupe ? 0.72 : 0.72, 0.08), bodyMat);
      aP.position.set(isCoupe ? 0.5 : 0.67, isCoupe ? 1.09 : 1.2, pz);
      aP.rotation.z = isCoupe ? 0.92 : 0.72;
      g.add(aP);
      // B-pillar (dark vertical divider)
      const bP = new THREE.Mesh(new THREE.BoxGeometry(0.11, isCoupe ? 0.42 : 0.56, 0.09), assets.darkMetalMat);
      bP.position.set(isCoupe ? -0.46 : -0.26, isCoupe ? 1.09 : 1.2, pz);
      g.add(bP);
      // C-pillar (body colored rear support)
      const cP = new THREE.Mesh(new THREE.BoxGeometry(isCoupe ? 0.22 : 0.24, isCoupe ? 0.62 : 0.68, 0.09), bodyMat);
      cP.position.set(isCoupe ? -1.32 : -1.26, isCoupe ? 1.09 : 1.2, pz);
      cP.rotation.z = isCoupe ? -1.04 : -0.68;
      g.add(cP);
    });

    // Subtle hood crease + side door rub strips
    const hoodCrease = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.035, wid - 0.62), bodyMat);
    hoodCrease.position.set(1.62, 0.94, 0);
    g.add(hoodCrease);
    [-wid / 2 - 0.015, wid / 2 + 0.015].forEach((sz) => {
      const rubStrip = new THREE.Mesh(new THREE.BoxGeometry(2.75, 0.055, 0.04), assets.darkMetalMat);
      rubStrip.position.set(-0.18, 0.62, sz);
      g.add(rubStrip);
    });

    // Recessed Dark Radiator Grille with Chrome Slats + Wraparound Bumpers + JDM Plates
    const grilleBg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, wid * 0.52), assets.darkMetalMat);
    grilleBg.position.set(hlX - 0.01, hlY - 0.02, 0);
    g.add(grilleBg);
    [-0.05, 0.03].forEach((gy) => {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, wid * 0.48), assets.chromeMat);
      slat.position.set(hlX + 0.01, hlY + gy, 0);
      g.add(slat);
    });

    const bmpGeo = new THREE.BoxGeometry(0.24, 0.2, wid + 0.08);
    const bF = new THREE.Mesh(bmpGeo, assets.darkMetalMat);
    bF.position.set(2.44, 0.41, 0);
    g.add(bF);
    const bR = new THREE.Mesh(bmpGeo, assets.darkMetalMat);
    bR.position.set(-2.42, 0.41, 0);
    g.add(bR);

    const plateMat = new THREE.MeshStandardMaterial({
      color: kind === 'taxi' ? 0x1e6b42 : 0xc8d0dc,
      roughness: 0.48,
    });
    const plateF = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.15, 0.36), plateMat);
    plateF.position.set(2.56, 0.4, 0);
    g.add(plateF);
    const plateR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.15, 0.36), plateMat);
    plateR.position.set(-2.54, 0.4, 0);
    g.add(plateR);

    // 80s JDM Fender Mirrors on Taxi, Door Mirrors on Sedan/Coupe
    [-wid / 2 - 0.09, wid / 2 + 0.09].forEach((mz) => {
      const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.08), assets.darkMetalMat);
      stalk.position.set(kind === 'taxi' ? 1.56 : 0.64, 0.94, mz * 0.92);
      g.add(stalk);
      const mir = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.11, 0.16), assets.darkMetalMat);
      mir.position.set(kind === 'taxi' ? 1.56 : 0.64, 1.01, mz);
      g.add(mir);
    });
  }

  if (kind === 'sedan') {
    // Classic 1980s two-tone teal lower side cladding (Concept Art Sheet 4!)
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(4.56, 0.25, wid + 0.025),
      new THREE.MeshStandardMaterial({ color: 0x22565e, roughness: 0.46 }),
    );
    trim.position.set(0, 0.46, 0);
    g.add(trim);
    [-wid / 2 + 0.24, wid / 2 - 0.24].forEach((rz) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.045, 0.045), assets.chromeMat);
      rail.position.set(-0.31, 1.56, rz);
      g.add(rail);
    });
  } else if (kind === 'taxi') {
    // Authentic checkered 1980s Minato Taxi side band + controlled warm TAXI roof lantern
    const chk = new THREE.Mesh(
      new THREE.BoxGeometry(4.48, 0.16, wid + 0.03),
      new THREE.MeshStandardMaterial({ map: textures.taxiChecker, roughness: 0.6 }),
    );
    chk.position.set(0, 0.72, 0);
    g.add(chk);
    const signBase = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.07, 0.88), assets.darkMetalMat);
    signBase.position.set(-0.24, 1.56, 0);
    g.add(signBase);
    const roofSign = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.22, 0.82),
      new THREE.MeshStandardMaterial({
        color: 0xe8b848,
        emissive: 0xd99622,
        emissiveIntensity: 0.88,
        roughness: 0.34,
      }),
    );
    roofSign.position.set(-0.24, 1.7, 0);
    g.add(roofSign);
  } else if (kind === 'coupe') {
    const wing = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.07, wid - 0.04),
      new THREE.MeshStandardMaterial({ color: 0x7c182c, roughness: 0.36 }),
    );
    wing.position.set(-2.08, 1.18, 0);
    g.add(wing);
    [-0.66, 0.66].forEach((sz) => {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.34, 0.07), assets.darkMetalMat);
      strut.position.set(-2.08, 0.99, sz);
      g.add(strut);
    });
    const louvers = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.05, 1.16), assets.darkMetalMat);
    louvers.position.set(1.38, 0.86, 0);
    g.add(louvers);
    const popLampMat = new THREE.MeshBasicMaterial({ color: 0xf7e3a4 });
    [-0.62, 0.62].forEach((pz) => {
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.36), bodyMat);
      pod.position.set(1.94, 0.84, pz);
      pod.rotation.z = -0.18;
      g.add(pod);
      const lens = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.3), popLampMat);
      lens.position.set(2.11, 0.83, pz);
      g.add(lens);
      const exh = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.22, 8), assets.chromeMat);
      exh.rotation.z = Math.PI / 2;
      exh.position.set(-2.48, 0.34, pz * 0.72);
      g.add(exh);
    });
  }

  // 4 Recessed Wheel Wells + Multi-part Wheels (Tire + Alloy Rim + Hub)
  const wxOff = kind === 'van' ? 1.56 : 1.45;
  const wellMat = new THREE.MeshStandardMaterial({ color: 0x0d0f18, roughness: 0.95 });
  const wellGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.22, 14);
  wellGeo.rotateX(Math.PI / 2);
  [
    [-wxOff, -wid / 2 + 0.03],
    [wxOff, -wid / 2 + 0.03],
    [-wxOff, wid / 2 - 0.03],
    [wxOff, wid / 2 - 0.03],
  ].forEach(([wx, wz]) => {
    const well = new THREE.Mesh(wellGeo, wellMat);
    well.position.set(wx, 0.39, wz * 0.92);
    g.add(well);
    const tire = new THREE.Mesh(assets.wheelGeo, assets.tireMat);
    tire.position.set(wx, 0.36, wz);
    g.add(tire);
    const rim = new THREE.Mesh(assets.rimGeo, assets.rimMat);
    rim.position.set(wx, 0.36, wz);
    g.add(rim);
    const hub = new THREE.Mesh(assets.hubGeo, assets.darkMetalMat);
    hub.position.set(wx, 0.36, wz);
    g.add(hub);
  });

  // Quad 1980s Rectangular Headlights + Amber Corner Signals + Taillights + Soft Volumetric Beams
  const hlMat = new THREE.MeshBasicMaterial({ color: 0xf7e4aa });
  const cornerAmber = new THREE.MeshBasicMaterial({ color: 0xe68b2e });
  const tlMat = new THREE.MeshBasicMaterial({ color: 0xe0263a });
  [-wid * 0.33, wid * 0.33].forEach((hz) => {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.34), hlMat);
    hl.position.set(hlX, hlY, hz);
    g.add(hl);
    const turn = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.14, 0.11), cornerAmber);
    turn.position.set(hlX - 0.02, hlY, hz + (hz > 0 ? 0.24 : -0.24));
    g.add(turn);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.15, 0.38), tlMat);
    tl.position.set(tlX, hlY + 0.04, hz);
    g.add(tl);

    if (elevY === 0) {
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: textures.glowHalo,
          color: 0xffd584,
          transparent: true,
          opacity: 0.34,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      sp.position.set(hlX + 0.16, hlY, hz);
      sp.scale.set(1.15, 1.15, 1);
      g.add(sp);

      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.15, 5.8, 12, 1, true), assets.hlConeMat);
      cone.rotation.z = Math.PI / 2;
      cone.position.set(hlX + 2.95, hlY - 0.1, hz);
      cone.userData.skipOutline = true;
      cone.userData.excludeFromExport = true;
      rootGroup.add(cone);
    }
  });

  enableOutlineLayer(g, false);
  addContactShadow(rootGroup, textures, len + 1.1, wid + 1.0);

  return {
    kind,
    group: rootGroup,
    proxyGroup: g,
    customSlotMount,
    sirenSprites,
    bounds: { hx: len / 2, hz: wid / 2 },
  };
}

/**
 * Concept-Art-Accurate Sculpted Tactical-Anime Squad Member (~2.02m heroic proportions, zero Roblox cubes!):
 * - leader: Rugged Commander in mustard-ochre bomber jacket + olive plate rig + tactical cap & headset
 * - medic: Khaki field jacket + red-cross armband + white cap with red cross + layered brown ponytail
 * - heavy: Broad muscular athletic Tank with dark sleeveless vest, brass ammo bandolier & rotary gun
 * - sniper: Sleek athletic operative in dark navy tactical rig + swept bangs & flowing ponytail + sniper rifle
 */
export function buildSurvivorModel(
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
  const s = isHeavy ? 1.14 : isSniper ? 0.96 : 1.0;

  const pantsColor = role === 'medic' ? 0x2c3447 : role === 'leader' ? 0x1e2536 : 0x191e2e;
  const pantsMat = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.86 });
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x131620, roughness: 0.68, metalness: 0.24 });
  const gloveMat = new THREE.MeshStandardMaterial({ color: 0x181c28, roughness: 0.72 });
  const jacketColor =
    role === 'leader'
      ? 0xc4882a
      : role === 'medic'
        ? 0xbba88a
        : isHeavy
          ? 0x232735
          : jacketHex;
  const jacketMat = new THREE.MeshStandardMaterial({ color: jacketColor, roughness: 0.66 });
  const vestColor =
    role === 'leader'
      ? 0x3f473c
      : role === 'medic'
        ? 0x4c584a
        : isHeavy
          ? 0x262a38
          : 0x2e3b36;
  const vestMat = new THREE.MeshStandardMaterial({
    color: vestColor,
    roughness: 0.58,
    metalness: 0.2,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 0.55,
    roughness: 0.36,
    metalness: 0.24,
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: isHeavy ? 0xd29c7e : 0xdfbaa0,
    roughness: 0.72,
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: role === 'medic' ? 0x4a2e22 : 0x151824,
    roughness: 0.74,
  });
  const pouchMat = new THREE.MeshStandardMaterial({ color: 0x6b5842, roughness: 0.8 });

  // Heroic Articulated Legs: Tapered Thigh + Tactical Knee Pad + Tapered Calf + Sculpted Combat Boot
  const legSpread = isHeavy ? 0.165 * s : isSniper ? 0.125 : 0.14;
  const makeLeg = (sideX: number) => {
    const legRoot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.095 * s, 0.08 * s, 0.44, 10),
      pantsMat,
    );
    legRoot.position.set(sideX, 0.62, 0);
    legRoot.castShadow = true;
    legRoot.receiveShadow = true;
    bodyPivot.add(legRoot);

    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.078 * s, 0.068 * s, 0.36, 10), pantsMat);
    shin.position.set(0, -0.34, -0.01);
    shin.castShadow = true;
    legRoot.add(shin);

    const knee = new THREE.Mesh(new THREE.BoxGeometry(0.12 * s, 0.12, 0.09 * s), assets.darkMetalMat);
    knee.position.set(0, -0.18, 0.065 * s);
    legRoot.add(knee);

    const bootAnkle = new THREE.Mesh(new THREE.CylinderGeometry(0.078 * s, 0.082 * s, 0.18, 10), bootMat);
    bootAnkle.position.set(0, -0.49, 0.01);
    legRoot.add(bootAnkle);

    const bootFoot = new THREE.Mesh(new THREE.BoxGeometry(0.155 * s, 0.11, 0.27 * s), bootMat);
    bootFoot.position.set(0, -0.56, 0.065 * s);
    bootFoot.castShadow = true;
    legRoot.add(bootFoot);
    return legRoot;
  };
  const legL = makeLeg(-legSpread);
  const legR = makeLeg(legSpread);

  // Pelvis, Utility Belt & Drop-Leg Holster
  addPart(bodyPivot, new THREE.CylinderGeometry(0.195 * s, 0.185 * s, 0.16, 10), pantsMat, 0, 0.85, 0);
  const belt = addPart(bodyPivot, new THREE.CylinderGeometry(0.215 * s, 0.215 * s, 0.085, 12), bootMat, 0, 0.91, 0);
  belt.scale.set(1.12, 1, 0.72);
  [-0.19 * s, 0.19 * s].forEach((px) => {
    addPart(bodyPivot, new THREE.BoxGeometry(0.095 * s, 0.13, 0.11), pouchMat, px, 0.9, 0.12 * s);
  });
  const holster = addPart(bodyPivot, new THREE.BoxGeometry(0.075 * s, 0.18, 0.11), bootMat, legSpread + 0.09 * s, 0.68, 0.02);
  holster.rotation.z = -0.08;

  // Sculpted Athletic V-Tapered Torso (narrower waist -> broader shoulders, NEVER a square block!)
  const torsoTopR = isHeavy ? 0.265 * s : isSniper ? 0.195 : 0.22;
  const torsoBotR = isHeavy ? 0.195 * s : isSniper ? 0.145 : 0.165;
  const torso = addPart(
    bodyPivot,
    new THREE.CylinderGeometry(torsoTopR, torsoBotR, 0.58, 12),
    jacketMat,
    0,
    1.22,
    0,
  );
  torso.scale.set(1.18, 1, 0.68);

  // Layered Tactical Plate Carrier (beveled chest & back plates + shoulder straps)
  const plateW = torsoTopR * 1.48;
  addPart(bodyPivot, new THREE.BoxGeometry(plateW, 0.36, 0.07), vestMat, 0, 1.26, 0.145 * s, -0.06);
  addPart(bodyPivot, new THREE.BoxGeometry(plateW * 0.94, 0.34, 0.065), vestMat, 0, 1.26, -0.145 * s, 0.06);
  [-plateW * 0.36, plateW * 0.36].forEach((sx) => {
    addPart(bodyPivot, new THREE.BoxGeometry(0.085 * s, 0.09, 0.28 * s), vestMat, sx, 1.48, 0);
  });

  // Sculpted Collar & Neck connecting torso to head seamlessly
  const collarMat = role === 'leader' ? new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.88 }) : jacketMat;
  addPart(bodyPivot, new THREE.CylinderGeometry(0.115 * s, 0.14 * s, 0.1, 10), collarMat, 0, 1.53, -0.01);
  addPart(bodyPivot, new THREE.CylinderGeometry(0.078 * s, 0.088 * s, 0.11, 10), skinMat, 0, 1.6, 0.01);

  // Role-specific chest gear
  if (isHeavy) {
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xdba83e, metalness: 0.78, roughness: 0.28 });
    const band = addPart(bodyPivot, new THREE.BoxGeometry(0.095, 0.54, 0.34 * s), brassMat, 0, 1.26, 0.01, 0, 0, 0.64);
    band.receiveShadow = true;
  } else {
    [-0.1, 0, 0.1].forEach((px) => {
      addPart(bodyPivot, new THREE.BoxGeometry(0.075, 0.13, 0.065), pouchMat, px, 1.18, 0.185 * s);
    });
    addPart(bodyPivot, new THREE.BoxGeometry(0.065, 0.065, 0.05), accentMat, -plateW * 0.36, 1.38, 0.175 * s);
  }

  // Compact Tactical Backpack
  addPart(
    bodyPivot,
    new THREE.BoxGeometry(0.29 * s, 0.4, 0.16),
    role === 'medic' ? pouchMat : assets.darkMetalMat,
    0,
    1.24,
    -0.23 * s,
  );
  if (role === 'medic') {
    const medCan = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 0.26, 10),
      new THREE.MeshStandardMaterial({
        color: 0x6ee782,
        emissive: 0x3ec85c,
        emissiveIntensity: 0.9,
        roughness: 0.26,
      }),
    );
    medCan.position.set(0.12, 1.28, -0.32);
    bodyPivot.add(medCan);
  } else if (isSniper) {
    addPart(bodyPivot, new THREE.CylinderGeometry(0.012, 0.016, 0.66, 6), assets.darkMetalMat, -0.12, 1.66, -0.26);
  }

  // Anatomical Proportional Arms (NO giant balloon spheres! Sleek deltoid + upper arm + forearm + gloves)
  const armMat = isHeavy ? skinMat : jacketMat;
  const shoulderX = torsoTopR * 1.18;
  const deltR = isHeavy ? 0.118 * s : isSniper ? 0.078 : 0.09;
  const deltGeo = new THREE.SphereGeometry(deltR, 10, 8);
  const deltL = addPart(bodyPivot, deltGeo, armMat, -shoulderX, 1.42, 0);
  deltL.scale.set(0.95, 1.05, 0.92);
  const deltRMesh = addPart(bodyPivot, deltGeo, armMat, shoulderX, 1.42, 0);
  deltRMesh.scale.set(0.95, 1.05, 0.92);

  if (role === 'medic') {
    const band = addPart(
      bodyPivot,
      new THREE.CylinderGeometry(0.088, 0.086, 0.095, 10),
      new THREE.MeshStandardMaterial({ color: 0xc2c8d2, roughness: 0.75 }),
      -shoulderX - 0.01,
      1.31,
      0.03,
    );
    band.rotation.x = 0.22;
    addPart(
      bodyPivot,
      new THREE.BoxGeometry(0.03, 0.065, 0.065),
      new THREE.MeshBasicMaterial({ color: 0xd93044 }),
      -shoulderX - 0.09,
      1.31,
      0.03,
    );
  }

  // Right arm (trigger arm) & Left arm (support arm reaching to rifle handguard)
  const upArmR = isHeavy ? 0.095 * s : isSniper ? 0.062 : 0.072;
  const foreArmR = isHeavy ? 0.082 * s : isSniper ? 0.054 : 0.062;

  const upperR = addPart(
    bodyPivot,
    new THREE.CylinderGeometry(upArmR, upArmR * 0.88, 0.3, 10),
    armMat,
    shoulderX + 0.01,
    1.28,
    0.07,
    0.45,
    0,
    -0.08,
  );
  upperR.castShadow = true;
  addPart(
    bodyPivot,
    new THREE.CylinderGeometry(foreArmR, foreArmR * 0.85, 0.32, 10),
    isHeavy ? assets.darkMetalMat : armMat,
    shoulderX - 0.01,
    1.19,
    0.29,
    Math.PI / 2 - 0.08,
    -0.08,
    0,
  );

  addPart(
    bodyPivot,
    new THREE.CylinderGeometry(upArmR, upArmR * 0.88, 0.3, 10),
    armMat,
    -shoulderX + 0.01,
    1.28,
    0.1,
    0.58,
    0,
    0.18,
  );
  addPart(
    bodyPivot,
    new THREE.CylinderGeometry(foreArmR, foreArmR * 0.85, 0.38, 10),
    isHeavy ? assets.darkMetalMat : armMat,
    -shoulderX * 0.32,
    1.19,
    0.37,
    Math.PI / 2 - 0.04,
    0.66,
    0,
  );

  const handGeo = new THREE.SphereGeometry(0.058 * s, 8, 8);
  addPart(bodyPivot, handGeo, gloveMat, shoulderX - 0.02, 1.17, 0.44);
  addPart(bodyPivot, handGeo, gloveMat, shoulderX - 0.08, 1.17, 0.64);

  // Refined Heroic Anime-Tactical Head (properly proportioned oval cranium + tapered jaw + headgear/hair)
  const head = addPart(bodyPivot, new THREE.SphereGeometry(0.168, 14, 12), skinMat, 0, 1.75, 0.01);
  head.scale.set(0.92, 1.08, 0.96);

  const eyeDark = new THREE.MeshBasicMaterial({ color: 0x121524 });
  [-0.056, 0.056].forEach((ex) => {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.024, 0.03), eyeDark);
    eye.position.set(ex, 1.76, 0.155);
    bodyPivot.add(eye);
  });

  if (role === 'leader') {
    // Rugged Commander: Sculpted dark beard + tactical cap + comms boom
    const beard = addPart(bodyPivot, new THREE.BoxGeometry(0.21, 0.11, 0.14), hairMat, 0, 1.66, 0.085);
    beard.scale.set(1, 1, 0.9);
    const cap = addPart(
      bodyPivot,
      new THREE.CylinderGeometry(0.165, 0.175, 0.11, 14),
      new THREE.MeshStandardMaterial({ color: 0x222c44, roughness: 0.66 }),
      0,
      1.87,
      -0.01,
    );
    cap.scale.set(0.98, 1, 1.04);
    addPart(
      bodyPivot,
      new THREE.BoxGeometry(0.24, 0.032, 0.15),
      new THREE.MeshStandardMaterial({ color: 0x1a2236, roughness: 0.62 }),
      0,
      1.83,
      0.16,
      0.12,
    );
    addPart(bodyPivot, new THREE.BoxGeometry(0.055, 0.11, 0.1), accentMat, -0.175, 1.75, 0.02);
    addPart(bodyPivot, new THREE.BoxGeometry(0.022, 0.022, 0.18), assets.darkMetalMat, -0.12, 1.69, 0.13, 0, 0.42);
  } else if (role === 'medic') {
    // Medic: Crisp white cap with red cross + warm brown hair & flowing ponytail
    const capMat = new THREE.MeshStandardMaterial({ color: 0xc0c6d0, roughness: 0.74 });
    addPart(bodyPivot, new THREE.CylinderGeometry(0.165, 0.172, 0.11, 14), capMat, 0, 1.87, 0);
    addPart(bodyPivot, new THREE.BoxGeometry(0.23, 0.032, 0.16), capMat, 0, 1.825, 0.165, 0.12);
    const crossMat = new THREE.MeshBasicMaterial({ color: 0xd92c40 });
    addPart(bodyPivot, new THREE.BoxGeometry(0.11, 0.036, 0.03), crossMat, 0, 1.88, 0.175);
    addPart(bodyPivot, new THREE.BoxGeometry(0.036, 0.1, 0.03), crossMat, 0, 1.88, 0.175);
    addPart(bodyPivot, new THREE.SphereGeometry(0.165, 12, 10), hairMat, 0, 1.77, -0.05);
    addPart(bodyPivot, new THREE.ConeGeometry(0.085, 0.34, 10), hairMat, 0.05, 1.66, -0.22, -0.52);
  } else if (isHeavy) {
    // Heavy: Sculpted full beard + short dark military crop
    addPart(bodyPivot, new THREE.BoxGeometry(0.24, 0.15, 0.16), hairMat, 0, 1.64, 0.09);
    const buzz = addPart(bodyPivot, new THREE.SphereGeometry(0.172, 12, 10), hairMat, 0, 1.82, -0.025);
    buzz.scale.set(0.95, 0.88, 0.98);
  } else {
    // Sniper: Layered dark hair crown + swept bangs + multi-segment flowing ponytail
    const crown = addPart(bodyPivot, new THREE.SphereGeometry(0.178, 12, 10), hairMat, 0, 1.81, -0.02);
    crown.scale.set(0.96, 0.96, 1.02);
    addPart(bodyPivot, new THREE.BoxGeometry(0.22, 0.075, 0.09), hairMat, 0, 1.83, 0.145, 0.15);
    addPart(bodyPivot, new THREE.ConeGeometry(0.095, 0.44, 10), hairMat, 0, 1.64, -0.24, -0.56);
    addPart(bodyPivot, new THREE.ConeGeometry(0.055, 0.28, 8), hairMat, 0, 1.44, -0.34, -0.28);
  }

  // Detailed Multi-Part Tactical Firearms (Stock + Receiver + Handguard + Magazine + Barrel + Optic)
  const wLen = isSniper ? 1.56 : isHeavy ? 1.32 : 0.98;
  const gunX = shoulderX - 0.03;
  // Receiver & Stock
  addPart(bodyPivot, new THREE.BoxGeometry(isHeavy ? 0.16 : 0.085, 0.13, wLen * 0.52), assets.darkMetalMat, gunX, 1.18, wLen * 0.32);
  addPart(bodyPivot, new THREE.BoxGeometry(0.065, 0.11, 0.24), bootMat, gunX, 1.17, 0.08);
  // Handguard / Shroud
  addPart(bodyPivot, new THREE.BoxGeometry(isHeavy ? 0.17 : 0.075, 0.095, wLen * 0.34), vestMat, gunX, 1.18, wLen * 0.66);

  if (isHeavy) {
    // Triple-barrel rotary cannon + brass drum magazine
    [
      [-0.045, 1.21],
      [0.045, 1.21],
      [0, 1.14],
    ].forEach(([bx, by]) => {
      addPart(bodyPivot, new THREE.CylinderGeometry(0.022, 0.022, wLen * 0.56, 8), assets.chromeMat, gunX + bx, by, wLen * 0.82, Math.PI / 2);
    });
    addPart(bodyPivot, new THREE.CylinderGeometry(0.14, 0.14, 0.22, 12), accentMat, gunX, 1.03, wLen * 0.42);
  } else {
    // Fluted barrel + muzzle brake
    addPart(bodyPivot, new THREE.CylinderGeometry(0.024, 0.024, wLen * 0.48, 8), assets.chromeMat, gunX, 1.19, wLen * 0.84, Math.PI / 2);
    addPart(bodyPivot, new THREE.CylinderGeometry(0.036, 0.034, 0.1, 8), assets.darkMetalMat, gunX, 1.19, wLen * 1.05, Math.PI / 2);
    // Curved rifle magazine
    addPart(bodyPivot, new THREE.BoxGeometry(0.055, 0.2, 0.095), assets.darkMetalMat, gunX, 1.04, wLen * 0.45, 0.24);
    if (isSniper) {
      addPart(bodyPivot, new THREE.CylinderGeometry(0.036, 0.032, 0.46, 10), assets.darkMetalMat, gunX, 1.29, wLen * 0.42, Math.PI / 2);
      addPart(bodyPivot, new THREE.CylinderGeometry(0.03, 0.03, 0.035, 8), accentMat, gunX, 1.29, wLen * 0.56, Math.PI / 2);
    } else if (role === 'leader') {
      addPart(bodyPivot, new THREE.BoxGeometry(0.06, 0.07, 0.12), accentMat, gunX, 1.27, wLen * 0.4);
    }
  }

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
  muzzleFlash.position.set(gunX, 1.18, wLen * 1.08);
  muzzleFlash.scale.set(1.65, 1.65, 1);
  bodyPivot.add(muzzleFlash);

  const laserGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(gunX, 1.18, wLen * 1.02),
    new THREE.Vector3(gunX, 1.18, 16),
  ]);
  const laser = new THREE.Line(
    laserGeo,
    new THREE.LineBasicMaterial({ color: accentHex, transparent: true, opacity: 0.65 }),
  );
  bodyPivot.add(laser);

  const laserDot = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: textures.glowHalo,
      color: accentHex,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  laserDot.scale.set(0.55, 0.55, 1);
  bodyPivot.add(laserDot);

  // Move procedural body meshes from bodyPivot into proxyGroup so custom GLB models cleanly replace them
  const toMove = bodyPivot.children.filter(
    (ch) => ch !== proxyGroup && ch !== customSlotMount && ch !== muzzleFlash && ch !== laser && ch !== laserDot,
  );
  for (const ch of toMove) {
    proxyGroup.add(ch);
  }
  enableOutlineLayer(proxyGroup, false);

  // Sleek Ground Selection Ring + Contact Shadow
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.62, 0.74, 28),
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
 * Concept-Art-Accurate Sculpted Infected Archetypes (gaunt hunched anatomy, zero Roblox blocks):
 */
export function buildEnemyModel(
  type: EnemyType,
  _bodyHex: number,
  accentHex: number,
  armored: boolean,
  ranged: boolean,
  boss: boolean,
  assets: SharedModelAssets,
  textures: MinatoTextureBank,
): EnemyVisual {
  const group = new THREE.Group();
  group.name = `Enemy_${type}`;
  const proxyGroup = new THREE.Group();
  proxyGroup.name = `EnemyProxy_${type}`;
  const customSlotMount = new THREE.Group();
  customSlotMount.name = `EnemyCustom_${type}`;
  group.add(proxyGroup, customSlotMount);
  const s = boss ? 1.92 : armored ? 1.2 : type === 'runner' ? 0.94 : 1.0;

  const bodyMat = new THREE.MeshStandardMaterial({
    color: boss ? 0x70454e : ranged ? 0x4f684e : type === 'runner' ? 0x766460 : 0x626e5c,
    roughness: 0.86,
  });
  const shirtHex =
    type === 'runner'
      ? 0x542230
      : type === 'armored'
        ? 0x1a2336
        : type === 'spitter'
          ? 0x26382b
          : type === 'tank'
            ? 0x3e1724
            : 0x4b515c;
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirtHex, roughness: 0.92 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x181d2b, roughness: 0.92 });
  const woundMat = new THREE.MeshStandardMaterial({ color: 0x64121e, roughness: 0.58 });

  // Tapered Legs & Boots
  const legGeo = new THREE.CylinderGeometry(0.092 * s, 0.072 * s, 0.78 * s, 10);
  const legL = addPart(group, legGeo, pantsMat, -0.15 * s, 0.42 * s, 0);
  const legR = addPart(group, legGeo, pantsMat, 0.15 * s, 0.42 * s, 0);
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x12151e, roughness: 0.7 });
  [legL, legR].forEach((leg) => {
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.16 * s, 0.14 * s, 0.26 * s), bootMat);
    boot.position.set(0, -0.34 * s, 0.05 * s);
    leg.add(boot);
  });

  // Hunched Tapered Spine & Torso
  const hunchPitch = type === 'runner' ? 0.42 : boss ? 0.3 : 0.24;
  const torso = addPart(
    group,
    new THREE.CylinderGeometry((boss ? 0.32 : 0.22) * s, (boss ? 0.23 : 0.15) * s, 0.66 * s, 10),
    shirtMat,
    0,
    1.08 * s,
    0.05 * s,
    hunchPitch,
  );
  torso.scale.set(1.18, 1, 0.72);

  if (!armored && !boss) {
    addPart(group, new THREE.BoxGeometry(0.26 * s, 0.1 * s, 0.04 * s), woundMat, 0.04 * s, 1.12 * s, 0.21 * s, 0, 0, -0.35);
    addPart(group, new THREE.CylinderGeometry(0.18 * s, 0.21 * s, 0.16 * s, 8), shirtMat, 0, 0.74 * s, 0.02 * s, 0, 0, 0.12);
  }

  // Gaunt Reaching Arms + Claws (Asymmetrical Colossal Smash-Arm on Tank!)
  const armLGeo = new THREE.CylinderGeometry(0.068 * s, 0.052 * s, 0.74 * s, 8);
  armLGeo.rotateX(Math.PI / 2);
  const armL = addPart(
    group,
    armLGeo,
    armored ? shirtMat : bodyMat,
    -(boss ? 0.42 : 0.31) * s,
    1.22 * s,
    0.34 * s,
    0.12,
  );
  const armRGeo = new THREE.CylinderGeometry(
    (boss ? 0.185 : 0.072) * s,
    (boss ? 0.145 : 0.054) * s,
    (boss ? 0.96 : 0.76) * s,
    8,
  );
  armRGeo.rotateX(Math.PI / 2);
  const armR = addPart(
    group,
    armRGeo,
    armored ? shirtMat : bodyMat,
    (boss ? 0.48 : 0.33) * s,
    1.18 * s,
    (boss ? 0.42 : 0.36) * s,
    0.1,
  );
  const fistGeo = new THREE.DodecahedronGeometry((boss ? 0.19 : 0.075) * s, 0);
  const fistL = new THREE.Mesh(fistGeo, bodyMat);
  fistL.position.set(0, 0, 0.38 * s);
  armL.add(fistL);
  const fistR = new THREE.Mesh(fistGeo, boss ? woundMat : bodyMat);
  fistR.position.set(0, 0, (boss ? 0.5 : 0.38) * s);
  armR.add(fistR);

  // Sculpted Necrotic Head + Snarling Jaw + Glowing Eyes
  const headZ = (type === 'runner' ? 0.25 : 0.17) * s;
  const head = addPart(group, new THREE.SphereGeometry(0.175 * s, 12, 10), bodyMat, 0, 1.56 * s, headZ);
  head.scale.set(0.92, 1.08, 0.96);
  addPart(
    group,
    new THREE.BoxGeometry(0.13 * s, 0.06 * s, 0.08 * s),
    new THREE.MeshBasicMaterial({ color: ranged ? 0x6eff4a : 0x380a12 }),
    0,
    1.46 * s,
    headZ + 0.14 * s,
  );

  const eyeMat = new THREE.MeshBasicMaterial({ color: accentHex });
  [-0.06 * s, 0.06 * s].forEach((ex) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.036 * s, 6, 6), eyeMat);
    eye.position.set(ex, 1.58 * s, headZ + 0.155 * s);
    group.add(eye);
  });

  if (type === 'runner') {
    const spikeMat = new THREE.MeshStandardMaterial({ color: 0x161522, roughness: 0.88 });
    [-0.08, 0, 0.08].forEach((hx, hi) => {
      addPart(group, new THREE.ConeGeometry(0.055 * s, 0.24 * s, 6), spikeMat, hx * s, 1.72 * s, headZ - 0.06 * s, -0.68 - hi * 0.1);
    });
  }

  if (armored && !boss) {
    const armorMat = new THREE.MeshStandardMaterial({ color: 0x202b44, metalness: 0.55, roughness: 0.36 });
    const visorMat = new THREE.MeshPhysicalMaterial({
      color: 0x0d162c,
      emissive: 0x1c6884,
      emissiveIntensity: 0.5,
      roughness: 0.14,
      metalness: 0.65,
    });
    const helm = addPart(group, new THREE.SphereGeometry(0.22 * s, 12, 10), armorMat, 0, 1.65 * s, headZ - 0.02 * s);
    helm.scale.set(1.02, 0.94, 1.04);
    addPart(group, new THREE.BoxGeometry(0.28 * s, 0.12 * s, 0.12 * s), visorMat, 0, 1.59 * s, headZ + 0.16 * s);
    addPart(group, new THREE.BoxGeometry(0.56 * s, 0.42 * s, 0.38 * s), armorMat, 0, 1.18 * s, 0.06 * s, hunchPitch);
    [-0.34 * s, 0.34 * s].forEach((px) => {
      addPart(group, new THREE.SphereGeometry(0.14 * s, 10, 8), armorMat, px, 1.35 * s, 0.06 * s);
    });
  }

  if (boss) {
    const humpMat = new THREE.MeshStandardMaterial({ color: 0x4f1f30, roughness: 0.74 });
    addPart(group, new THREE.DodecahedronGeometry(0.4 * s, 1), humpMat, -0.16 * s, 1.48 * s, -0.12 * s);
    const cystMat = new THREE.MeshStandardMaterial({
      color: 0xf44b82,
      emissive: 0xe6245e,
      emissiveIntensity: 1.15,
      roughness: 0.3,
    });
    [
      [-0.34, 1.54, -0.04, 0.17],
      [-0.14, 1.62, -0.24, 0.15],
      [0.32, 1.44, 0.08, 0.14],
      [0.08, 1.36, -0.26, 0.13],
    ].forEach(([cx, cy, cz, cr]) => {
      addPart(group, new THREE.SphereGeometry(cr * s, 8, 8), cystMat, cx * s, cy * s, cz * s);
    });
    const bossGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: textures.glowHalo,
        color: 0xff3b6b,
        transparent: true,
        opacity: 0.36,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    bossGlow.position.set(-0.2 * s, 1.56 * s, -0.1 * s);
    bossGlow.scale.set(2.0, 2.0, 1);
    group.add(bossGlow);
  }

  if (ranged) {
    const acidMat = new THREE.MeshStandardMaterial({
      color: 0x8ef264,
      emissive: 0x52d62a,
      emissiveIntensity: 1.25,
      roughness: 0.26,
    });
    [
      [0, 1.24, -0.2, 0.21],
      [-0.2, 1.36, -0.1, 0.13],
      [0.18, 1.32, -0.14, 0.12],
      [0.06, 1.44, -0.18, 0.11],
    ].forEach(([sx, sy, sz, sr]) => {
      addPart(group, new THREE.SphereGeometry(sr * s, 8, 8), acidMat, sx * s, sy * s, sz * s);
    });
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: textures.glowHalo,
        color: 0x7cff57,
        transparent: true,
        opacity: 0.36,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    halo.position.set(0, 1.26 * s, -0.2 * s);
    halo.scale.set(1.5, 1.5, 1);
    group.add(halo);
  }

  // Move procedural enemy geometry into proxyGroup so custom GLB rigs can replace it cleanly
  const enemyParts = group.children.filter((ch) => ch !== proxyGroup && ch !== customSlotMount);
  for (const ch of enemyParts) {
    proxyGroup.add(ch);
  }
  enableOutlineLayer(proxyGroup, false);

  const hpBg = new THREE.Mesh(
    new THREE.PlaneGeometry(1.06 * s, 0.13),
    new THREE.MeshBasicMaterial({ color: 0x0e1120, side: THREE.DoubleSide }),
  );
  hpBg.position.y = 2.18 * s;
  hpBg.visible = false;
  hpBg.userData.skipOutline = true;
  hpBg.userData.excludeFromExport = true;

  const hpBar = new THREE.Mesh(
    new THREE.PlaneGeometry(1.0 * s, 0.085),
    new THREE.MeshBasicMaterial({ color: armored ? 0x4ce0e8 : 0xff3b52, side: THREE.DoubleSide }),
  );
  hpBar.position.set(0, 2.18 * s, 0.01);
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



