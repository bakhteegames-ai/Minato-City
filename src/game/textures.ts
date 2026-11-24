import * as THREE from 'three';

export interface MinatoTextureBank {
  asphaltMap: THREE.CanvasTexture;
  asphaltRough: THREE.CanvasTexture;
  asphaltBump: THREE.CanvasTexture;
  sidewalkMap: THREE.CanvasTexture;
  brickDark: THREE.CanvasTexture;
  brickCafe: THREE.CanvasTexture;
  brickBlue: THREE.CanvasTexture;
  cityPopBillboard: THREE.CanvasTexture;
  shopfrontRecords: THREE.CanvasTexture;
  cafeWindow: THREE.CanvasTexture;
  awningStripe: THREE.CanvasTexture;
  barricade: THREE.CanvasTexture;
  vendingFront: THREE.CanvasTexture;
  kissatenVertical: THREE.CanvasTexture;
  arcadeVertical: THREE.CanvasTexture;
  glowHalo: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  beamFade: THREE.CanvasTexture;
  steamPuff: THREE.CanvasTexture;
  puddleMask: THREE.CanvasTexture;
  taxiChecker: THREE.CanvasTexture;
  vanSide: THREE.CanvasTexture;
  signRecords: THREE.CanvasTexture;
  signCafe: THREE.CanvasTexture;
  signArcade: THREE.CanvasTexture;
  signOverpass: THREE.CanvasTexture;
  signParking: THREE.CanvasTexture;
  signBiohazard: THREE.CanvasTexture;
  signMed: THREE.CanvasTexture;
  woodFloor: THREE.CanvasTexture;
  courtyardTile: THREE.CanvasTexture;
  parkingB1Sign: THREE.CanvasTexture;
  signGenerator: THREE.CanvasTexture;
  dispose: () => void;
}

function createCanvasTex(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  opts: {
    srgb?: boolean;
    repeatX?: number;
    repeatY?: number;
    anisotropy?: number;
  } = {},
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(c);
  if (opts.srgb !== false) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  if ((opts.repeatX ?? 1) > 1 || (opts.repeatY ?? 1) > 1) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(opts.repeatX ?? 1, opts.repeatY ?? 1);
  }
  if (opts.anisotropy) {
    tex.anisotropy = opts.anisotropy;
  }
  return tex;
}

function buildWetAsphaltTextures(maxAniso: number): {
  map: THREE.CanvasTexture;
  rough: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
} {
  const size = 256;
  const hash = (x: number, y: number, p: number) => {
    const n = Math.sin(((x % p + p) % p) * 127.1 + ((y % p + p) % p) * 311.7 + p * 19.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const vNoise = (u: number, v: number, period: number) => {
    const fx = u * period;
    const fy = v * period;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const a = hash(ix, iy, period);
    const b = hash(ix + 1, iy, period);
    const c = hash(ix, iy + 1, period);
    const d = hash(ix + 1, iy + 1, period);
    return a + (b - a) * sx + (c + (d - c) * sx - (a + (b - a) * sx)) * sy;
  };
  const fbm = (u: number, v: number) =>
    vNoise(u, v, 3) * 0.48 +
    vNoise(u, v, 6) * 0.27 +
    vNoise(u, v, 12) * 0.15 +
    vNoise(u, v, 24) * 0.1;

  const cAlb = document.createElement('canvas');
  const cRgh = document.createElement('canvas');
  const cBmp = document.createElement('canvas');
  cAlb.width = cAlb.height = size;
  cRgh.width = cRgh.height = size;
  cBmp.width = cBmp.height = size;

  const gA = cAlb.getContext('2d')!;
  const gR = cRgh.getContext('2d')!;
  const gB = cBmp.getContext('2d')!;
  const imgA = gA.createImageData(size, size);
  const imgR = gR.createImageData(size, size);
  const imgB = gB.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // Warp domain slightly for realistic organic puddles (zero polka-dots!)
      const warpX = u + (vNoise(u, v, 4) - 0.5) * 0.16;
      const warpY = v + (vNoise(u + 0.37, v + 0.19, 4) - 0.5) * 0.16;
      const n = fbm(warpX, warpY);
      const grain = (hash(x, y, size) - 0.5) * 16;
      const wet = Math.max(0, Math.min(1, (n - 0.49) * 5.6));

      const base = 36 - wet * 16 + grain * (1 - wet * 0.85);
      const idx = (y * size + x) * 4;
      imgA.data[idx] = Math.max(10, Math.min(255, base * 0.92));
      imgA.data[idx + 1] = Math.max(12, Math.min(255, base * 1.02));
      imgA.data[idx + 2] = Math.max(20, Math.min(255, base * 1.48));
      imgA.data[idx + 3] = 255;

      // Wet puddles are glossy (roughness ~22/255), dry asphalt is rough (~205/255)
      const rough = Math.round(205 - wet * 182 + grain * 0.5);
      const rc = Math.max(18, Math.min(238, rough));
      imgR.data[idx] = imgR.data[idx + 1] = imgR.data[idx + 2] = rc;
      imgR.data[idx + 3] = 255;

      const bump = Math.round(128 + grain * 3.5 * (1 - wet * 0.9));
      const bc = Math.max(0, Math.min(255, bump));
      imgB.data[idx] = imgB.data[idx + 1] = imgB.data[idx + 2] = bc;
      imgB.data[idx + 3] = 255;
    }
  }
  gA.putImageData(imgA, 0, 0);
  gR.putImageData(imgR, 0, 0);
  gB.putImageData(imgB, 0, 0);

  const map = new THREE.CanvasTexture(cAlb);
  const rough = new THREE.CanvasTexture(cRgh);
  const bump = new THREE.CanvasTexture(cBmp);
  map.colorSpace = THREE.SRGBColorSpace;
  [map, rough, bump].forEach((t) => {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(10, 8);
    t.anisotropy = maxAniso;
  });

  return { map, rough, bump };
}

function makeJapaneseFacade(
  brickHex: string,
  mortarHex: string,
  litColor: string,
  seed: number,
  maxAniso: number,
): THREE.CanvasTexture {
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  return createCanvasTex(
    512,
    512,
    (g, w, h) => {
      g.fillStyle = brickHex;
      g.fillRect(0, 0, w, h);

      // Textured Japanese tiled / brick masonry courses
      for (let y = 0; y < h; y += 16) {
        const off = ((y / 16) % 2) * 20;
        for (let x = -20 + off; x < w; x += 40) {
          const shade = (rand() - 0.5) * 18;
          g.fillStyle = shade > 0 ? `rgba(255,220,200,${shade / 240})` : `rgba(12,10,24,${-shade / 160})`;
          g.fillRect(x + 1, y + 1, 38, 14);
        }
        g.fillStyle = mortarHex;
        g.fillRect(0, y, w, 2);
      }

      // Atmospheric weathering & rain streaks
      const grime = g.createLinearGradient(0, 0, 0, h);
      grime.addColorStop(0, 'rgba(10,12,24,0.52)');
      grime.addColorStop(0.22, 'rgba(10,12,24,0)');
      grime.addColorStop(0.84, 'rgba(10,12,24,0.14)');
      grime.addColorStop(1, 'rgba(10,12,24,0.6)');
      g.fillStyle = grime;
      g.fillRect(0, 0, w, h);

      // 2 rows x 4 columns of framed retro Tokyo apartment windows
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 4; c++) {
          const wx = 26 + c * 120;
          const wy = 46 + r * 224;
          const ww = 76;
          const wh = 126;

          g.fillStyle = '#111424';
          g.fillRect(wx - 5, wy - 5, ww + 10, wh + 10);
          g.fillStyle = '#565270';
          g.fillRect(wx - 8, wy + wh + 3, ww + 16, 12);
          g.fillStyle = '#111424';
          g.fillRect(wx - 8, wy + wh + 13, ww + 16, 3);

          const lit = rand() > 0.36;
          if (lit) {
            const wg = g.createLinearGradient(wx, wy, wx, wy + wh);
            wg.addColorStop(0, litColor);
            wg.addColorStop(0.65, '#da7c42');
            wg.addColorStop(1, '#6e3038');
            g.fillStyle = wg;
            g.fillRect(wx, wy, ww, wh);
            // Interior blinds / silhouettes
            g.fillStyle = 'rgba(28, 16, 26, 0.35)';
            g.fillRect(wx, wy, ww, wh * 0.25);
          } else {
            const dg = g.createLinearGradient(wx, wy, wx, wy + wh);
            dg.addColorStop(0, '#232e4f');
            dg.addColorStop(1, '#12172b');
            g.fillStyle = dg;
            g.fillRect(wx, wy, ww, wh);
            // Subtle sky reflection diagonal
            g.fillStyle = 'rgba(120, 175, 255, 0.09)';
            g.beginPath();
            g.moveTo(wx, wy + 22);
            g.lineTo(wx + 32, wy);
            g.lineTo(wx + 56, wy);
            g.lineTo(wx, wy + 48);
            g.closePath();
            g.fill();
          }

          // Window mullions
          g.fillStyle = '#131628';
          g.fillRect(wx + ww / 2 - 2, wy, 4, wh);
          g.fillRect(wx, wy + wh * 0.56, ww, 4);
        }
      }
    },
    { anisotropy: maxAniso },
  );
}

function makeSign(
  main: string,
  sub: string,
  bg: string,
  fg: string,
  border: string,
  maxAniso: number,
  italic = false,
): THREE.CanvasTexture {
  return createCanvasTex(
    512,
    160,
    (g, w, h) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = border;
      g.lineWidth = 10;
      g.strokeRect(6, 6, w - 12, h - 12);
      g.fillStyle = fg;
      g.textAlign = 'center';
      g.font = `${italic ? 'italic ' : ''}900 ${sub ? 58 : 74}px ${italic ? 'Georgia, serif' : '"Noto Sans JP", sans-serif'}`;
      g.fillText(main, w / 2, sub ? 84 : 108);
      if (sub) {
        g.fillStyle = '#ffe2b0';
        g.font = '800 25px "Chakra Petch", sans-serif';
        g.fillText(sub, w / 2, 132);
      }
    },
    { anisotropy: maxAniso },
  );
}

export function createMinatoTextureBank(maxAniso: number): MinatoTextureBank {
  const created: THREE.CanvasTexture[] = [];
  const track = (t: THREE.CanvasTexture) => {
    created.push(t);
    return t;
  };

  const asphalt = buildWetAsphaltTextures(maxAniso);
  track(asphalt.map);
  track(asphalt.rough);
  track(asphalt.bump);

  const sidewalkMap = track(
    createCanvasTex(
      256,
      256,
      (g, w, h) => {
        g.fillStyle = '#31354f';
        g.fillRect(0, 0, w, h);
        g.strokeStyle = 'rgba(11,14,26,0.58)';
        g.lineWidth = 3;
        for (let i = 0; i <= w; i += 64) {
          g.beginPath();
          g.moveTo(i, 0);
          g.lineTo(i, h);
          g.stroke();
          g.beginPath();
          g.moveTo(0, i);
          g.lineTo(w, i);
          g.stroke();
        }
        // Subtle tactile paving edge
        g.fillStyle = 'rgba(255, 210, 110, 0.14)';
        g.fillRect(0, h - 16, w, 12);
      },
      { repeatX: 6, repeatY: 4, anisotropy: maxAniso },
    ),
  );

  const brickDark = track(makeJapaneseFacade('#46364e', '#1a1426', '#ffc273', 101, maxAniso));
  const brickCafe = track(makeJapaneseFacade('#603948', '#221422', '#ffbc69', 202, maxAniso));
  const brickBlue = track(makeJapaneseFacade('#333c59', '#151a2e', '#ffd89c', 303, maxAniso));

  // Iconic CITY POP 1980s Anime Headphones Billboard matching Concept Art 1 & 3
  const cityPopBillboard = track(
    createCanvasTex(
      512,
      288,
      (g, w, h) => {
        const sky = g.createLinearGradient(0, 0, w, h);
        sky.addColorStop(0, '#46377a');
        sky.addColorStop(0.45, '#c4528a');
        sky.addColorStop(1, '#f6a273');
        g.fillStyle = sky;
        g.fillRect(0, 0, w, h);

        // Retro striped sun
        g.fillStyle = '#ff6b86';
        g.beginPath();
        g.arc(368, 194, 76, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#be4f82';
        for (let y = 186; y < 276; y += 12) g.fillRect(280, y, 174, 5);

        // Ocean twilight reflection
        g.fillStyle = '#302252';
        g.fillRect(0, 234, w, 54);
        g.fillStyle = '#ff98ac';
        for (let y = 242; y < 284; y += 9) g.fillRect(312, y, 112 - (y - 242) * 1.4, 3);

        // Stylized 80s anime woman in headphones (left third)
        g.fillStyle = '#1b1d3c';
        g.beginPath();
        g.arc(138, 134, 74, 0, Math.PI * 2);
        g.fill();
        g.fillRect(66, 134, 88, 154);

        g.fillStyle = '#f8d7de';
        g.beginPath();
        g.moveTo(148, 84);
        g.lineTo(194, 128);
        g.lineTo(209, 146);
        g.lineTo(194, 158);
        g.lineTo(192, 184);
        g.lineTo(170, 196);
        g.lineTo(164, 244);
        g.lineTo(126, 244);
        g.closePath();
        g.fill();

        g.fillStyle = '#202447';
        g.fillRect(174, 131, 13, 5);
        g.fillStyle = '#e5547c';
        g.fillRect(184, 166, 11, 4);

        g.fillStyle = '#262b59';
        g.beginPath();
        g.arc(132, 120, 68, Math.PI * 0.72, Math.PI * 1.98);
        g.fill();

        // Retro cyan/white headphones
        g.strokeStyle = '#6fe8f0';
        g.lineWidth = 11;
        g.beginPath();
        g.arc(130, 126, 58, Math.PI * 1.05, Math.PI * 1.82);
        g.stroke();
        g.fillStyle = '#eef4ff';
        g.strokeStyle = '#181c36';
        g.lineWidth = 4;
        g.beginPath();
        g.ellipse(124, 148, 20, 28, -0.18, 0, Math.PI * 2);
        g.fill();
        g.stroke();

        // Palm tree silhouette on right edge
        g.strokeStyle = '#1f183d';
        g.lineWidth = 9;
        g.beginPath();
        g.moveTo(478, 288);
        g.quadraticCurveTo(465, 205, 444, 152);
        g.stroke();
        for (let a = 0; a < 5; a++) {
          const ang = -2.6 + a * 0.65;
          g.lineWidth = 6;
          g.beginPath();
          g.moveTo(444, 152);
          g.quadraticCurveTo(
            444 + Math.cos(ang) * 32,
            142 + Math.sin(ang) * 24,
            444 + Math.cos(ang) * 58,
            165 + Math.sin(ang) * 36,
          );
          g.stroke();
        }

        // Bold katakana + Latin typography
        g.fillStyle = '#fff5fa';
        g.font = '900 44px "Noto Sans JP", sans-serif';
        g.fillText('シティポップ', 220, 82);
        g.fillStyle = '#64f0f7';
        g.font = '900 34px "Chakra Petch", sans-serif';
        g.fillText('CITY POP', 252, 124);

        g.strokeStyle = '#121526';
        g.lineWidth = 12;
        g.strokeRect(6, 6, w - 12, h - 12);
      },
      { anisotropy: maxAniso },
    ),
  );

  // Warm illuminated Japanese convenience/record store interior window
  const shopfrontRecords = track(
    createCanvasTex(
      512,
      256,
      (g, w, h) => {
        const bg = g.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, '#59291c');
        bg.addColorStop(0.5, '#d67e38');
        bg.addColorStop(1, '#ffd080');
        g.fillStyle = bg;
        g.fillRect(0, 0, w, h);

        // Ceiling fluorescent tubes
        g.fillStyle = '#fff8dc';
        g.fillRect(42, 18, 160, 12);
        g.fillRect(300, 18, 160, 12);

        // Silhouetted vinyl shelves & convenience store aisles
        g.fillStyle = '#331c24';
        for (let x = 28; x < w - 30; x += 86) {
          g.fillRect(x, 125, 68, 115);
          // Colorful album sleeves / goods
          for (let r = 0; r < 3; r++) {
            g.fillStyle = r % 2 === 0 ? '#f45b8a' : '#4ce0e8';
            g.fillRect(x + 6 + r * 20, 134, 15, 22);
            g.fillStyle = '#f5b971';
            g.fillRect(x + 6 + r * 20, 168, 15, 20);
          }
          g.fillStyle = '#331c24';
        }

        // Glass door mullions
        g.fillStyle = '#181829';
        g.fillRect(0, 0, w, 14);
        g.fillRect(0, h - 16, w, 16);
        for (let x = 0; x <= w; x += 128) g.fillRect(x - 6, 0, 12, h);
      },
      { anisotropy: maxAniso },
    ),
  );

  const cafeWindow = track(
    createCanvasTex(
      512,
      256,
      (g, w, h) => {
        const bg = g.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, '#4f221a');
        bg.addColorStop(0.55, '#cb6e32');
        bg.addColorStop(1, '#fabc69');
        g.fillStyle = bg;
        g.fillRect(0, 0, w, h);

        [108, 256, 404].forEach((lx) => {
          g.fillStyle = '#241418';
          g.fillRect(lx - 2, 0, 4, 48);
          g.fillStyle = '#ffe9ab';
          g.beginPath();
          g.arc(lx, 56, 17, 0, Math.PI * 2);
          g.fill();
        });

        g.fillStyle = '#2a151b';
        [86, 228, 368].forEach((tx) => {
          g.fillRect(tx, 172, 60, 10);
          g.fillRect(tx + 26, 182, 8, 72);
          g.fillRect(tx - 24, 158, 12, 96);
          g.fillRect(tx + 72, 158, 12, 96);
        });

        g.fillStyle = '#1a1728';
        g.fillRect(0, 0, w, 14);
        g.fillRect(0, h - 18, w, 18);
        for (let x = 0; x <= w; x += 128) g.fillRect(x - 6, 0, 12, h);
      },
      { anisotropy: maxAniso },
    ),
  );

  const awningStripe = track(
    createCanvasTex(
      256,
      128,
      (g, w, h) => {
        for (let x = 0; x < w; x += 32) {
          g.fillStyle = ((x / 32) | 0) % 2 === 0 ? '#c63649' : '#ebe2d5';
          g.fillRect(x, 0, 32, h);
        }
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.fillRect(0, h - 18, w, 18);
      },
      { anisotropy: maxAniso },
    ),
  );

  const barricade = track(
    createCanvasTex(
      256,
      64,
      (g, w, h) => {
        g.fillStyle = '#555b70';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#ebbf3d';
        for (let x = -40; x < w + 40; x += 48) {
          g.beginPath();
          g.moveTo(x, 0);
          g.lineTo(x + 24, 0);
          g.lineTo(x + 6, h);
          g.lineTo(x - 18, h);
          g.closePath();
          g.fill();
        }
        g.fillStyle = 'rgba(18,22,36,0.62)';
        g.fillRect(0, 0, w, 9);
        g.fillRect(0, h - 11, w, 11);
      },
      { anisotropy: maxAniso },
    ),
  );

  const vendingFront = track(
    createCanvasTex(
      256,
      384,
      (g, w, h) => {
        g.fillStyle = '#bf2a3c';
        g.fillRect(0, 0, w, h);
        // Illuminated drink display panel
        g.fillStyle = '#fff5e6';
        g.fillRect(18, 22, w - 36, 175);
        const colors = ['#4ce0e8', '#f5b971', '#f45b8a', '#6ee782', '#3a7ce0', '#ff6b4a'];
        for (let row = 0; row < 3; row++) {
          g.fillStyle = '#25293b';
          g.fillRect(24, 70 + row * 56, w - 48, 8);
          for (let col = 0; col < 6; col++) {
            g.fillStyle = colors[(row * 3 + col) % colors.length];
            g.fillRect(28 + col * 34, 34 + row * 56, 22, 34);
          }
        }
        // Dispense slot & coin panel
        g.fillStyle = '#1b1f2e';
        g.fillRect(24, 240, w - 48, 76);
        g.fillStyle = '#64e8f0';
        g.fillRect(180, 206, 42, 22);
      },
      { anisotropy: maxAniso },
    ),
  );

  const kissatenVertical = track(
    createCanvasTex(
      128,
      320,
      (g, w, h) => {
        g.fillStyle = '#28111d';
        g.fillRect(0, 0, w, h);
        g.strokeStyle = '#ff6b82';
        g.lineWidth = 8;
        g.strokeRect(6, 6, w - 12, h - 12);
        g.fillStyle = '#ffe2ad';
        g.font = '900 66px "Noto Sans JP", sans-serif';
        g.textAlign = 'center';
        g.fillText('喫', w / 2, 102);
        g.fillText('茶', w / 2, 196);
        g.fillStyle = '#4ce0e8';
        g.font = '900 32px "Chakra Petch", sans-serif';
        g.fillText('CAFÉ', w / 2, 276);
      },
      { anisotropy: maxAniso },
    ),
  );

  const arcadeVertical = track(
    createCanvasTex(
      128,
      320,
      (g, w, h) => {
        g.fillStyle = '#141c38';
        g.fillRect(0, 0, w, h);
        g.strokeStyle = '#4ce0e8';
        g.lineWidth = 8;
        g.strokeRect(6, 6, w - 12, h - 12);
        g.fillStyle = '#ff729b';
        g.font = '900 58px "Noto Sans JP", sans-serif';
        g.textAlign = 'center';
        g.fillText('ゲ', w / 2, 86);
        g.fillText('ー', w / 2, 168);
        g.fillText('ム', w / 2, 250);
      },
      { anisotropy: maxAniso },
    ),
  );

  const glowHalo = track(
    createCanvasTex(128, 128, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.26, 'rgba(255,255,255,0.58)');
      gr.addColorStop(0.62, 'rgba(255,255,255,0.14)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    }),
  );

  const contactShadow = track(
    createCanvasTex(128, 128, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(5,7,14,0.88)');
      gr.addColorStop(0.65, 'rgba(5,7,14,0.44)');
      gr.addColorStop(1, 'rgba(5,7,14,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    }),
  );

  // Smooth tip-to-base fade for headlight & floodlight volumetric cones (eliminates hard triangle edges!)
  const beamFade = track(
    createCanvasTex(64, 128, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, 'rgba(255,255,255,0.92)');
      gr.addColorStop(0.32, 'rgba(255,255,255,0.42)');
      gr.addColorStop(0.75, 'rgba(255,255,255,0.08)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    }),
  );

  // Layered billowing vapor puff for rising street-vent steam plumes
  const steamPuff = track(
    createCanvasTex(128, 128, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const puffs = [
        [64, 66, 48, 0.34],
        [48, 58, 34, 0.24],
        [80, 56, 32, 0.22],
        [62, 44, 30, 0.22],
      ];
      for (const [cx, cy, r, a] of puffs) {
        const gr = g.createRadialGradient(cx, cy, 4, cx, cy, r);
        gr.addColorStop(0, `rgba(220, 232, 255, ${a})`);
        gr.addColorStop(0.55, `rgba(190, 212, 245, ${a * 0.45})`);
        gr.addColorStop(1, 'rgba(180, 200, 240, 0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, w, h);
      }
    }),
  );

  // Organic irregular wet puddle alpha mask for clearcoat specular reflections on asphalt
  const puddleMask = track(
    createCanvasTex(
      128,
      128,
      (g, w, h) => {
        g.fillStyle = '#000000';
        g.fillRect(0, 0, w, h);
        const blobs = [
          [64, 64, 46, 34, 0.2],
          [42, 54, 32, 22, -0.35],
          [84, 70, 30, 20, 0.42],
          [68, 44, 24, 18, -0.18],
        ];
        for (const [cx, cy, rx, ry, rot] of blobs) {
          g.save();
          g.translate(cx, cy);
          g.rotate(rot);
          g.scale(1, ry / rx);
          const gr = g.createRadialGradient(0, 0, rx * 0.15, 0, 0, rx);
          gr.addColorStop(0, 'rgba(255,255,255,0.95)');
          gr.addColorStop(0.65, 'rgba(255,255,255,0.62)');
          gr.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = gr;
          g.beginPath();
          g.arc(0, 0, rx, 0, Math.PI * 2);
          g.fill();
          g.restore();
        }
      },
      { srgb: false },
    ),
  );

  // Iconic 1980s Japanese Minato Taxi checkered side stripe (Concept Art 1 & 4)
  const taxiChecker = track(
    createCanvasTex(
      256,
      32,
      (g, w, h) => {
        g.fillStyle = '#eab52d';
        g.fillRect(0, 0, w, h);
        const sq = 16;
        for (let y = 0; y < h; y += sq) {
          for (let x = 0; x < w; x += sq) {
            const dark = (((x / sq) | 0) + ((y / sq) | 0)) % 2 === 0;
            g.fillStyle = dark ? '#131622' : '#f7f2df';
            g.fillRect(x, y, sq, sq);
          }
        }
      },
      { repeatX: 2, repeatY: 1, anisotropy: maxAniso },
    ),
  );

  // Municipal Cargo Van side livery «港運送» (Concept Art 1 & 4)
  const vanSide = track(
    createCanvasTex(
      256,
      96,
      (g, w, h) => {
        g.fillStyle = '#d8e1ed';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#244b8f';
        g.fillRect(0, h - 24, w, 24);
        g.fillStyle = '#e8a838';
        g.fillRect(0, h - 29, w, 5);
        g.fillStyle = '#1b2c4e';
        g.font = '900 42px "Noto Sans JP", sans-serif';
        g.textAlign = 'center';
        g.fillText('港運送', w / 2, 52);
      },
      { anisotropy: maxAniso },
    ),
  );

  const signRecords = track(makeSign('マルフジ商店', 'RECORDS • CDS • TAPES', '#261a36', '#ff759f', '#f5b971', maxAniso));
  const signCafe = track(makeSign('Café', '', '#2c1220', '#ff6e91', '#ff6e91', maxAniso, true));
  const signArcade = track(makeSign('海風・中央商店街', 'MINATO ARCADE', '#1d1930', '#ffe1a8', '#f5b971', maxAniso));
  const signOverpass = track(makeSign('みなと中央通り', 'MINATO CENTRAL AVE', '#272c42', '#d7e2ff', '#4c5778', maxAniso));
  const signParking = track(makeSign('P 立体駐車場', '← PARKING B1/2F', '#183466', '#ffffff', '#4ce0e8', maxAniso));
  const signBiohazard = track(makeSign('☣ 警戒区域', 'QUARANTINE A-3', '#e5b935', '#151722', '#151722', maxAniso));
  const signMed = track(makeSign('✚ МЕДПУНКТ', 'MEDICAL STATION', '#143628', '#6ee782', '#6ee782', maxAniso));

  // Sprint 3: Warm 1980s Record Shop Hardwood Parquet Floor
  const woodFloor = track(
    createCanvasTex(
      256,
      256,
      (g, w, h) => {
        g.fillStyle = '#4c2c20';
        g.fillRect(0, 0, w, h);
        const plankH = 32;
        for (let row = 0; row < h / plankH; row++) {
          const y = row * plankH;
          const off = (row % 2) * 64;
          for (let col = -1; col < 3; col++) {
            const x = col * 128 + off;
            const shade = ((row * 7 + col * 13) & 3) * 8;
            g.fillStyle = `rgb(${84 + shade}, ${48 + Math.floor(shade * 0.6)}, ${34 + Math.floor(shade * 0.4)})`;
            g.fillRect(x + 2, y + 2, 124, plankH - 4);
            g.strokeStyle = 'rgba(24, 12, 8, 0.35)';
            g.lineWidth = 2;
            g.strokeRect(x + 1, y + 1, 126, plankH - 2);
          }
        }
      },
      { repeatX: 4, repeatY: 4, anisotropy: maxAniso },
    ),
  );

  // Sprint 3: Japanese Residential Courtyard Stone Flagstone Pavers
  const courtyardTile = track(
    createCanvasTex(
      256,
      256,
      (g, w, h) => {
        g.fillStyle = '#1d2236';
        g.fillRect(0, 0, w, h);
        const step = 64;
        for (let gy = 0; gy < h; gy += step) {
          for (let gx = 0; gx < w; gx += step) {
            const v = (((gx / step) * 5 + (gy / step) * 9) % 5) * 4;
            g.fillStyle = `rgb(${44 + v}, ${49 + v}, ${72 + v})`;
            g.fillRect(gx + 3, gy + 3, step - 6, step - 6);
            g.fillStyle = 'rgba(255, 195, 224, 0.08)';
            if (((gx + gy) / step) % 3 === 0) {
              g.fillRect(gx + 10, gy + 12, 8, 5);
            }
          }
        }
      },
      { repeatX: 5, repeatY: 4, anisotropy: maxAniso },
    ),
  );

  // Sprint 3: Bold Concrete Pillar «B1» Parking Stencil (Concept Art Sheet 1!)
  const parkingB1Sign = track(
    createCanvasTex(
      256,
      256,
      (g, w, h) => {
        g.fillStyle = '#33394f';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#e5b935';
        g.fillRect(0, h - 54, w, 54);
        g.fillStyle = '#141724';
        for (let sx = -64; sx < w + 64; sx += 38) {
          g.beginPath();
          g.moveTo(sx, h);
          g.lineTo(sx + 18, h);
          g.lineTo(sx + 38, h - 54);
          g.lineTo(sx + 20, h - 54);
          g.closePath();
          g.fill();
        }
        g.fillStyle = '#ff4d6a';
        g.font = '900 116px "Chakra Petch", sans-serif';
        g.textAlign = 'center';
        g.fillText('B1', w / 2, 132);
        g.fillStyle = '#d4e4ff';
        g.font = '700 24px "Chakra Petch", sans-serif';
        g.fillText('PARKING • 地下1階', w / 2, 174);
      },
      { anisotropy: maxAniso },
    ),
  );

  const signGenerator = track(makeSign('⚡ B1 ГЕНЕРАТОР', 'EMERGENCY POWER', '#211c12', '#f5b971', '#f5b971', maxAniso));

  return {
    asphaltMap: asphalt.map,
    asphaltRough: asphalt.rough,
    asphaltBump: asphalt.bump,
    sidewalkMap,
    brickDark,
    brickCafe,
    brickBlue,
    cityPopBillboard,
    shopfrontRecords,
    cafeWindow,
    awningStripe,
    barricade,
    vendingFront,
    kissatenVertical,
    arcadeVertical,
    glowHalo,
    contactShadow,
    beamFade,
    steamPuff,
    puddleMask,
    taxiChecker,
    vanSide,
    signRecords,
    signCafe,
    signArcade,
    signOverpass,
    signParking,
    signBiohazard,
    signMed,
    woodFloor,
    courtyardTile,
    parkingB1Sign,
    signGenerator,
    dispose: () => {
      created.forEach((t) => t.dispose());
    },
  };
}
