import * as THREE from 'three';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canUseCanvas(): boolean {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

function finishTexture(
  canvas: HTMLCanvasElement,
  isColor: boolean,
  repeatX = 1,
  repeatY = 1,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function hexToRgb(hex: string): [number, number, number] {
  const c = new THREE.Color(hex);
  return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
}

function rgba(rgb: [number, number, number], a: number): string {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
}

/**
 * Shared painterly dry-brush + subtle Borderlands ink hatch pass onto an albedo canvas
 * plus matched roughness & bump canvases.
 */
function paintBrushAndHatch(
  albedoCtx: CanvasRenderingContext2D,
  roughCtx: CanvasRenderingContext2D,
  bumpCtx: CanvasRenderingContext2D,
  size: number,
  rand: () => number,
  opts: {
    baseHex: string;
    lightHex: string;
    darkHex: string;
    baseRough: number; // 0..255
    brushCount: number;
    hatchCount: number;
    streakVertical?: boolean;
  },
) {
  const lightRgb = hexToRgb(opts.lightHex);
  const darkRgb = hexToRgb(opts.darkHex);

  albedoCtx.fillStyle = opts.baseHex;
  albedoCtx.fillRect(0, 0, size, size);

  roughCtx.fillStyle = `rgb(${opts.baseRough},${opts.baseRough},${opts.baseRough})`;
  roughCtx.fillRect(0, 0, size, size);

  bumpCtx.fillStyle = 'rgb(128,128,128)';
  bumpCtx.fillRect(0, 0, size, size);

  // Broad TF2 painterly value modulation strokes
  for (let i = 0; i < opts.brushCount; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 18 + rand() * 72;
    const thick = 4 + rand() * 14;
    const isLight = rand() > 0.48;
    const angle = opts.streakVertical
      ? Math.PI * 0.5 + (rand() - 0.5) * 0.22
      : (rand() - 0.5) * 0.45;

    albedoCtx.save();
    albedoCtx.translate(x, y);
    albedoCtx.rotate(angle);
    albedoCtx.fillStyle = rgba(isLight ? lightRgb : darkRgb, 0.06 + rand() * 0.09);
    albedoCtx.fillRect(-len * 0.5, -thick * 0.5, len, thick);
    albedoCtx.restore();

    const rShift = isLight ? opts.baseRough - 16 : opts.baseRough + 18;
    const rc = Math.max(70, Math.min(248, rShift));
    roughCtx.save();
    roughCtx.translate(x, y);
    roughCtx.rotate(angle);
    roughCtx.fillStyle = `rgba(${rc},${rc},${rc},0.22)`;
    roughCtx.fillRect(-len * 0.5, -thick * 0.5, len, thick);
    roughCtx.restore();

    const bVal = isLight ? 142 : 114;
    bumpCtx.save();
    bumpCtx.translate(x, y);
    bumpCtx.rotate(angle);
    bumpCtx.fillStyle = `rgba(${bVal},${bVal},${bVal},0.18)`;
    bumpCtx.fillRect(-len * 0.5, -thick * 0.5, len, thick);
    bumpCtx.restore();
  }

  // Fine Borderlands ink crosshatch / scratch accents
  albedoCtx.strokeStyle = 'rgba(18, 20, 28, 0.24)';
  bumpCtx.strokeStyle = 'rgba(72, 72, 72, 0.35)';
  for (let i = 0; i < opts.hatchCount; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 6 + rand() * 18;
    const a = (rand() - 0.5) * 0.7;
    const lw = 0.8 + rand() * 1.1;
    albedoCtx.lineWidth = lw;
    albedoCtx.beginPath();
    albedoCtx.moveTo(x, y);
    albedoCtx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    albedoCtx.stroke();

    bumpCtx.lineWidth = lw;
    bumpCtx.beginPath();
    bumpCtx.moveTo(x, y);
    bumpCtx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    bumpCtx.stroke();
  }
}

export interface StylizedMaterialOptions {
  baseHex: string;
  lightHex?: string;
  darkHex?: string;
  roughness?: number;
  metalness?: number;
  bumpScale?: number;
  vertexColors?: boolean;
  seed?: number;
  side?: THREE.Side;
}

/**
 * 1. Weathered Painted Metal (retro-futuristic sedan bodywork, vending enamel, steel doors).
 * Matte-satin painted finish (roughness 0.52-0.76) with panel seams, chipped edge highlights,
 * fine Borderlands ink scratches — strictly non-plastic.
 */
export function createPaintedMetalMaterial(
  opts: StylizedMaterialOptions & { panelGrid?: boolean; wearHex?: string },
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: opts.roughness ?? 0.62,
    metalness: opts.metalness ?? 0.28,
    vertexColors: opts.vertexColors ?? true,
    side: opts.side ?? THREE.FrontSide,
  });

  if (!canUseCanvas()) {
    mat.color.set(opts.baseHex);
    return mat;
  }

  const size = 256;
  const rand = mulberry32(opts.seed ?? 101);
  const [ac, actx] = makeCanvas(size);
  const [rc, rctx] = makeCanvas(size);
  const [bc, bctx] = makeCanvas(size);

  const baseColor = new THREE.Color(opts.baseHex);
  const lightHex =
    opts.lightHex ?? '#' + baseColor.clone().offsetHSL(0, -0.04, 0.1).getHexString();
  const darkHex =
    opts.darkHex ?? '#' + baseColor.clone().offsetHSL(0, 0.04, -0.14).getHexString();

  paintBrushAndHatch(actx, rctx, bctx, size, rand, {
    baseHex: opts.baseHex,
    lightHex,
    darkHex,
    baseRough: Math.round((opts.roughness ?? 0.62) * 255),
    brushCount: 150,
    hatchCount: 55,
  });

  // Panel seams + Borderlands edge wear highlight along seams
  if (opts.panelGrid !== false) {
    const seamPositions = [0, 128];
    const wearHex = opts.wearHex ?? '#c9c4b8';
    for (const p of seamPositions) {
      // Dark ink seam
      actx.fillStyle = 'rgba(14, 17, 24, 0.58)';
      actx.fillRect(0, p, size, 2);
      actx.fillRect(p, 0, 2, size);

      bctx.fillStyle = 'rgb(48,48,48)';
      bctx.fillRect(0, p, size, 2);
      bctx.fillRect(p, 0, 2, size);

      // Chipped primer edge catchlight beside seam
      actx.strokeStyle = rgba(hexToRgb(wearHex), 0.34);
      actx.lineWidth = 1.5;
      actx.setLineDash([7, 11, 4, 14]);
      actx.beginPath();
      actx.moveTo(0, p + 3);
      actx.lineTo(size, p + 3);
      actx.moveTo(p + 3, 0);
      actx.lineTo(p + 3, size);
      actx.stroke();
      actx.setLineDash([]);

      // Higher metalness/roughness wear scuff near seams
      rctx.fillStyle = 'rgba(110,110,110,0.45)';
      rctx.fillRect(0, p + 2, size, 3);
    }

    // Small industrial rivet dots near seam intersections
    for (const rx of [10, 118, 138, 246]) {
      for (const ry of [10, 118, 138, 246]) {
        actx.fillStyle = 'rgba(18,22,30,0.5)';
        actx.beginPath();
        actx.arc(rx, ry, 2, 0, Math.PI * 2);
        actx.fill();
        actx.fillStyle = 'rgba(225,220,208,0.28)';
        actx.beginPath();
        actx.arc(rx - 0.8, ry - 0.8, 1.2, 0, Math.PI * 2);
        actx.fill();
      }
    }
  }

  mat.map = finishTexture(ac, true);
  mat.roughnessMap = finishTexture(rc, false);
  mat.bumpMap = finishTexture(bc, false);
  mat.bumpScale = opts.bumpScale ?? 0.018;
  return mat;
}

/**
 * 2. Weathered Urban Concrete / Japanese Facade Tile (modular building walls, pilasters, slabs).
 * Matte 0.86-0.96 roughness, rainwater drip streaks, horizontal seam joints, soot & ink cracks.
 */
export function createUrbanConcreteMaterial(
  opts: StylizedMaterialOptions & { tiled?: boolean; grimeStrength?: number },
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: opts.roughness ?? 0.9,
    metalness: opts.metalness ?? 0.04,
    vertexColors: opts.vertexColors ?? true,
    side: opts.side ?? THREE.FrontSide,
  });

  if (!canUseCanvas()) {
    mat.color.set(opts.baseHex);
    return mat;
  }

  const size = 256;
  const rand = mulberry32(opts.seed ?? 202);
  const [ac, actx] = makeCanvas(size);
  const [rc, rctx] = makeCanvas(size);
  const [bc, bctx] = makeCanvas(size);

  const baseColor = new THREE.Color(opts.baseHex);
  const lightHex =
    opts.lightHex ?? '#' + baseColor.clone().offsetHSL(0, -0.02, 0.09).getHexString();
  const darkHex =
    opts.darkHex ?? '#' + baseColor.clone().offsetHSL(0, 0.03, -0.13).getHexString();

  paintBrushAndHatch(actx, rctx, bctx, size, rand, {
    baseHex: opts.baseHex,
    lightHex,
    darkHex,
    baseRough: 232,
    brushCount: 220,
    hatchCount: 70,
    streakVertical: true,
  });

  if (opts.tiled) {
    // Japanese urban exterior masonry tile grid with individual tonal variation
    const cols = 8;
    const rows = 16;
    const tw = size / cols;
    const th = size / rows;
    for (let r = 0; r < rows; r++) {
      const xOff = (r % 2) * (tw * 0.5);
      for (let c = -1; c <= cols; c++) {
        const shade = (rand() - 0.5) * 24;
        actx.fillStyle = shade > 0 ? `rgba(255,248,236,${shade / 260})` : `rgba(20,22,28,${-shade / 240})`;
        actx.fillRect(c * tw + xOff + 1, r * th + 1, tw - 2, th - 2);
      }
      // Horizontal mortar groove
      actx.fillStyle = 'rgba(26, 26, 30, 0.34)';
      actx.fillRect(0, r * th, size, 1.5);
      bctx.fillStyle = 'rgb(64,64,64)';
      bctx.fillRect(0, r * th, size, 1.5);
    }
  } else {
    // Poured concrete formwork horizontal seams + tie-rod holes
    for (const y of [0, 64, 128, 192]) {
      actx.fillStyle = 'rgba(24, 24, 28, 0.32)';
      actx.fillRect(0, y, size, 2);
      bctx.fillStyle = 'rgb(68,68,68)';
      bctx.fillRect(0, y, size, 2);
      for (const x of [32, 96, 160, 224]) {
        actx.fillStyle = 'rgba(22, 22, 26, 0.45)';
        actx.beginPath();
        actx.arc(x, y + 32, 2.5, 0, Math.PI * 2);
        actx.fill();
      }
    }
  }

  // Rainwater vertical grime drips
  const drips = Math.round(28 * (opts.grimeStrength ?? 1));
  for (let i = 0; i < drips; i++) {
    const x = rand() * size;
    const y0 = rand() * size * 0.4;
    const h = 40 + rand() * 140;
    const w = 2 + rand() * 6;
    const g = actx.createLinearGradient(0, y0, 0, y0 + h);
    g.addColorStop(0, 'rgba(22, 24, 28, 0.28)');
    g.addColorStop(1, 'rgba(22, 24, 28, 0)');
    actx.fillStyle = g;
    actx.fillRect(x, y0, w, h);
  }

  mat.map = finishTexture(ac, true);
  mat.roughnessMap = finishTexture(rc, false);
  mat.bumpMap = finishTexture(bc, false);
  mat.bumpScale = opts.bumpScale ?? 0.026;
  return mat;
}

/**
 * 3. Stylized Woven Fabric / Denim / Canvas / Leather (adult civilian & infected clothing).
 * High matte roughness (0.85-0.95), directional painterly brushstrokes, weave cross-grain,
 * and optional grime/blood wear for infected clothing.
 */
export function createStylizedClothMaterial(
  opts: StylizedMaterialOptions & { stainHex?: string; stainAmount?: number },
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: opts.roughness ?? 0.89,
    metalness: opts.metalness ?? 0.02,
    vertexColors: opts.vertexColors ?? true,
    side: opts.side ?? THREE.FrontSide,
  });

  if (!canUseCanvas()) {
    mat.color.set(opts.baseHex);
    return mat;
  }

  const size = 256;
  const rand = mulberry32(opts.seed ?? 303);
  const [ac, actx] = makeCanvas(size);
  const [rc, rctx] = makeCanvas(size);
  const [bc, bctx] = makeCanvas(size);

  const baseColor = new THREE.Color(opts.baseHex);
  const lightHex =
    opts.lightHex ?? '#' + baseColor.clone().offsetHSL(0, -0.03, 0.1).getHexString();
  const darkHex =
    opts.darkHex ?? '#' + baseColor.clone().offsetHSL(0, 0.05, -0.15).getHexString();

  paintBrushAndHatch(actx, rctx, bctx, size, rand, {
    baseHex: opts.baseHex,
    lightHex,
    darkHex,
    baseRough: 230,
    brushCount: 200,
    hatchCount: 90,
  });

  // Fine woven canvas/twill diagonal grain
  actx.strokeStyle = 'rgba(18, 18, 24, 0.08)';
  bctx.strokeStyle = 'rgba(102, 102, 102, 0.26)';
  actx.lineWidth = 1;
  bctx.lineWidth = 1;
  for (let i = -size; i < size * 2; i += 6) {
    actx.beginPath();
    actx.moveTo(i, 0);
    actx.lineTo(i + size * 0.5, size);
    actx.stroke();
    bctx.beginPath();
    bctx.moveTo(i, 0);
    bctx.lineTo(i + size * 0.5, size);
    bctx.stroke();
  }

  // Optional grime & dried wound stains for infected civilian
  if (opts.stainHex && (opts.stainAmount ?? 0) > 0) {
    const stainRgb = hexToRgb(opts.stainHex);
    const count = Math.round(24 * (opts.stainAmount ?? 1));
    for (let i = 0; i < count; i++) {
      const sx = rand() * size;
      const sy = rand() * size;
      const sr = 8 + rand() * 34;
      const grad = actx.createRadialGradient(sx, sy, 1, sx, sy, sr);
      grad.addColorStop(0, rgba(stainRgb, 0.55));
      grad.addColorStop(0.65, rgba(stainRgb, 0.24));
      grad.addColorStop(1, rgba(stainRgb, 0));
      actx.fillStyle = grad;
      actx.beginPath();
      actx.arc(sx, sy, sr, 0, Math.PI * 2);
      actx.fill();

      // Dried stains slightly darker & lower roughness
      rctx.fillStyle = 'rgba(175,175,175,0.3)';
      rctx.beginPath();
      rctx.arc(sx, sy, sr * 0.6, 0, Math.PI * 2);
      rctx.fill();
    }
  }

  mat.map = finishTexture(ac, true);
  mat.roughnessMap = finishTexture(rc, false);
  mat.bumpMap = finishTexture(bc, false);
  mat.bumpScale = opts.bumpScale ?? 0.022;
  return mat;
}

/**
 * 4. Stylized Skin (TF2 matte painterly skin or desaturated necrotic infected skin).
 * Strictly matte (0.76-0.86 roughness) with warm/cool painterly plane shifts — ZERO wax/plastic!
 */
export function createStylizedSkinMaterial(opts: {
  infected?: boolean;
  seed?: number;
}): THREE.MeshStandardMaterial {
  const infected = Boolean(opts.infected);
  const baseHex = infected ? '#7c8472' : '#c69376';
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: infected ? 0.84 : 0.78,
    metalness: 0.0,
    vertexColors: true,
  });

  if (!canUseCanvas()) {
    mat.color.set(baseHex);
    return mat;
  }

  const size = 256;
  const rand = mulberry32(opts.seed ?? (infected ? 412 : 404));
  const [ac, actx] = makeCanvas(size);
  const [rc, rctx] = makeCanvas(size);
  const [bc, bctx] = makeCanvas(size);

  paintBrushAndHatch(actx, rctx, bctx, size, rand, {
    baseHex,
    lightHex: infected ? '#9aa08c' : '#dda98b',
    darkHex: infected ? '#51564b' : '#9c6852',
    baseRough: infected ? 218 : 204,
    brushCount: 160,
    hatchCount: infected ? 95 : 28,
  });

  if (infected) {
    // Bruised violet-ochre mottling + subtle dark veins/scratches
    for (let i = 0; i < 24; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = 10 + rand() * 28;
      const g = actx.createRadialGradient(x, y, 2, x, y, r);
      g.addColorStop(0, i % 3 === 0 ? 'rgba(92, 34, 38, 0.36)' : 'rgba(66, 62, 74, 0.34)');
      g.addColorStop(1, 'rgba(66, 62, 74, 0)');
      actx.fillStyle = g;
      actx.beginPath();
      actx.arc(x, y, r, 0, Math.PI * 2);
      actx.fill();
    }
  } else {
    // Subtle TF2 warm rosy undertone variation
    for (let i = 0; i < 16; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = 16 + rand() * 34;
      const g = actx.createRadialGradient(x, y, 2, x, y, r);
      g.addColorStop(0, 'rgba(186, 108, 92, 0.14)');
      g.addColorStop(1, 'rgba(186, 108, 92, 0)');
      actx.fillStyle = g;
      actx.beginPath();
      actx.arc(x, y, r, 0, Math.PI * 2);
      actx.fill();
    }
  }

  mat.map = finishTexture(ac, true);
  mat.roughnessMap = finishTexture(rc, false);
  mat.bumpMap = finishTexture(bc, false);
  mat.bumpScale = infected ? 0.018 : 0.008;
  return mat;
}

/**
 * 5. Stylized Vending Machine Graphic Panel & Header Signage Canvas Textures
 * Aspect-matched 4:1 (512x128) so Japanese retro typography renders razor-sharp without distortion.
 */
export function createVendingGraphicMaterial(seed = 505): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.64,
    metalness: 0.16,
    vertexColors: false,
  });

  if (!canUseCanvas()) {
    mat.color.set('#a83c32');
    return mat;
  }

  const w = 512;
  const h = 128;
  const rand = mulberry32(seed);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;

  const rc = document.createElement('canvas');
  rc.width = w;
  rc.height = h;
  const rctx = rc.getContext('2d')!;

  ctx.fillStyle = '#a53b31';
  ctx.fillRect(0, 0, w, h);

  // Cream framed service plate
  ctx.fillStyle = '#d8ccb6';
  ctx.fillRect(18, 14, w - 36, h - 28);
  ctx.strokeStyle = '#1e232c';
  ctx.lineWidth = 4;
  ctx.strokeRect(18, 14, w - 36, h - 28);

  // Left accent seal block
  ctx.fillStyle = '#252c36';
  ctx.fillRect(28, 24, 96, h - 48);
  ctx.fillStyle = '#e2a348';
  ctx.font = 'bold 26px "Noto Sans JP", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('港都', 76, 62);
  ctx.fillStyle = '#d8ccb6';
  ctx.font = 'bold 12px monospace';
  ctx.fillText('A-3 UNIT', 76, 86);

  // Main crisp Japanese & price lettering
  ctx.textAlign = 'left';
  ctx.fillStyle = '#1d222b';
  ctx.font = 'bold 34px "Noto Sans JP", sans-serif';
  ctx.fillText('自動販売機 · 冷温', 142, 62);
  ctx.fillStyle = '#8b2f28';
  ctx.font = 'bold 19px monospace';
  ctx.fillText('¥120 / ¥150   COLD · HOT DRINKS', 142, 92);

  // Bottom street grime gradient + scuff scratches
  const grime = ctx.createLinearGradient(0, 70, 0, h);
  grime.addColorStop(0, 'rgba(20,22,26,0)');
  grime.addColorStop(1, 'rgba(18,20,24,0.48)');
  ctx.fillStyle = grime;
  ctx.fillRect(0, 70, w, h - 70);

  rctx.fillStyle = 'rgb(168,168,168)';
  rctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 48; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const len = 10 + rand() * 32;
    ctx.strokeStyle = rand() > 0.5 ? 'rgba(220,214,200,0.22)' : 'rgba(20,22,28,0.28)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y + (rand() - 0.5) * 6);
    ctx.stroke();
    rctx.fillStyle = 'rgba(220,220,220,0.4)';
    rctx.fillRect(x, y, len * 0.7, 3);
  }

  const mapTex = new THREE.CanvasTexture(c);
  mapTex.colorSpace = THREE.SRGBColorSpace;
  mapTex.anisotropy = 4;
  const roughTex = new THREE.CanvasTexture(rc);
  roughTex.colorSpace = THREE.NoColorSpace;
  mat.map = mapTex;
  mat.roughnessMap = roughTex;
  return mat;
}

export function createVendingHeaderMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.56,
    metalness: 0.14,
  });
  if (!canUseCanvas()) {
    mat.color.set('#d8ccb6');
    return mat;
  }
  const w = 512;
  const h = 64;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = '#d8ccb6';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#252c36';
  ctx.fillRect(0, h - 9, w, 9);
  ctx.fillStyle = '#a53b31';
  ctx.fillRect(14, 10, 86, 36);
  ctx.fillStyle = '#f2e8d5';
  ctx.font = 'bold 20px "Noto Sans JP", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('港都', 57, 35);

  ctx.fillStyle = '#1e242d';
  ctx.font = 'bold 26px "Noto Sans JP", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('MINATO DRINKS · 港都ドリンク', 114, 37);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  mat.map = tex;
  return mat;
}

/**
 * 6. Weathered Vertical Shop Signboard Canvas Texture for the 3-story Modular Building.
 */
export function createShopSignMaterial(seed = 606): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.74,
    metalness: 0.12,
  });

  if (!canUseCanvas()) {
    mat.color.set('#d2c5ac');
    return mat;
  }

  const w = 128;
  const h = 512;
  const rand = mulberry32(seed);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = '#d3c4a8';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#252a33';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, w - 10, h - 10);

  // Top red seal badge
  ctx.fillStyle = '#99362e';
  ctx.fillRect(18, 22, w - 36, 54);
  ctx.fillStyle = '#efe5d1';
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('港都', w * 0.5, 58);

  // Vertical Japanese shop lettering
  const chars = ['喫', '茶', '・', '商', '店'];
  ctx.fillStyle = '#1f2530';
  ctx.font = 'bold 56px "Noto Sans JP", sans-serif';
  chars.forEach((ch, idx) => {
    ctx.fillText(ch, w * 0.5, 145 + idx * 72);
  });

  // Weathering rust streaks from bolts
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = 'rgba(72, 46, 32, 0.16)';
    ctx.fillRect(rand() * w, rand() * h, 4 + rand() * 14, 14 + rand() * 36);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  mat.map = tex;
  return mat;
}

/**
 * 7. Vulcanized Matte Rubber / Tire Tread Material (car tires, bumpers, heavy boots).
 */
export function createRubberMaterial(seed = 707): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.91,
    metalness: 0.04,
    vertexColors: true,
  });

  if (!canUseCanvas()) {
    mat.color.set('#22252b');
    return mat;
  }

  const size = 128;
  const rand = mulberry32(seed);
  const [ac, actx] = makeCanvas(size);
  const [rc, rctx] = makeCanvas(size);
  const [bc, bctx] = makeCanvas(size);

  paintBrushAndHatch(actx, rctx, bctx, size, rand, {
    baseHex: '#25282f',
    lightHex: '#3a3f47',
    darkHex: '#15171c',
    baseRough: 235,
    brushCount: 80,
    hatchCount: 30,
  });

  // Directional tire/sole tread grooves
  for (let y = 0; y < size; y += 16) {
    actx.fillStyle = 'rgba(12, 14, 18, 0.55)';
    actx.fillRect(0, y, size, 4);
    bctx.fillStyle = 'rgb(40,40,40)';
    bctx.fillRect(0, y, size, 4);
  }

  mat.map = finishTexture(ac, true, 2, 2);
  mat.roughnessMap = finishTexture(rc, false, 2, 2);
  mat.bumpMap = finishTexture(bc, false, 2, 2);
  mat.bumpScale = 0.032;
  return mat;
}

/**
 * Shared dark charcoal-indigo Borderlands crease line material.
 */
let sharedCreaseLineMat: THREE.LineBasicMaterial | null = null;
function getCreaseLineMaterial(): THREE.LineBasicMaterial {
  if (!sharedCreaseLineMat) {
    sharedCreaseLineMat = new THREE.LineBasicMaterial({
      color: 0x11141c,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
    });
  }
  return sharedCreaseLineMat;
}

/**
 * Helper to create a shadow-casting Mesh with optional Borderlands crease edge ink lines.
 * Crease lines are tagged `userData.isCreaseInk = true` so they can be toggled cleanly
 * and excluded from GLB geometry export and triangle counts.
 */
export function createStylizedMesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  options: {
    name?: string;
    castShadow?: boolean;
    receiveShadow?: boolean;
    creaseThresholdDeg?: number; // 0 disables crease ink lines
  } = {},
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  if (options.name) mesh.name = options.name;
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;

  const thresh = options.creaseThresholdDeg ?? 32;
  if (thresh > 0) {
    const edges = new THREE.EdgesGeometry(geometry, thresh);
    const lines = new THREE.LineSegments(edges, getCreaseLineMaterial());
    lines.name = `${mesh.name || 'mesh'}_ink`;
    lines.userData.isCreaseInk = true;
    lines.raycast = () => {};
    mesh.add(lines);
  }
  return mesh;
}
