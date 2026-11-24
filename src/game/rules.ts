import type {
  AssetSlotCategory,
  AssetSlotId,
  CircleEntity,
  ColliderBox,
  EnemyType,
  GamePhaseState,
  MusicIntensity,
  RunGrade,
  SquadStance,
  WaveSpawnSpec,
} from './types';

export const EVAC_ZONE = {
  x: -1.5,
  z: 13.5,
  r: 4.2,
} as const;

export const MAX_CONCURRENT_MELEE_TOKENS = 3;

export interface EnemyArchetypeConfig {
  r: number;
  hp: number;
  speed: number;
  dmg: number;
  hex: number;
  accentHex: number;
  armor: boolean;
  ranged: boolean;
  boss: boolean;
  policy: 'chaser' | 'flanker' | 'juggernaut' | 'kiter' | 'charger';
}

export const ENEMY_ARCHETYPES: Record<EnemyType, EnemyArchetypeConfig> = {
  walker: {
    r: 0.56,
    hp: 68,
    speed: 3.6,
    dmg: 11,
    hex: 0x7c8778,
    accentHex: 0xff4555,
    armor: false,
    ranged: false,
    boss: false,
    policy: 'chaser',
  },
  runner: {
    r: 0.5,
    hp: 46,
    speed: 6.3,
    dmg: 9,
    hex: 0xb86a7c,
    accentHex: 0xf45b8a,
    armor: false,
    ranged: false,
    boss: false,
    policy: 'flanker',
  },
  armored: {
    r: 0.72,
    hp: 210,
    speed: 3.0,
    dmg: 18,
    hex: 0x455370,
    accentHex: 0x4ce0e8,
    armor: true,
    ranged: false,
    boss: false,
    policy: 'juggernaut',
  },
  spitter: {
    r: 0.56,
    hp: 62,
    speed: 3.8,
    dmg: 13,
    hex: 0x5c9658,
    accentHex: 0x7cff57,
    armor: false,
    ranged: true,
    boss: false,
    policy: 'kiter',
  },
  tank: {
    r: 1.25,
    hp: 980,
    speed: 3.6,
    dmg: 28,
    hex: 0x873645,
    accentHex: 0xff3b52,
    armor: true,
    ranged: false,
    boss: true,
    policy: 'charger',
  },
};

export function resolveCircleBox(ent: CircleEntity, b: ColliderBox): boolean {
  const cx = Math.max(b.x1, Math.min(ent.x, b.x2));
  const cz = Math.max(b.z1, Math.min(ent.z, b.z2));
  const dx = ent.x - cx;
  const dz = ent.z - cz;
  const dSq = dx * dx + dz * dz;

  if (dSq < ent.r * ent.r) {
    const d = Math.sqrt(dSq);
    if (d > 0.0001) {
      ent.x += (dx / d) * (ent.r - d);
      ent.z += (dz / d) * (ent.r - d);
    } else {
      const l = ent.x - b.x1;
      const r = b.x2 - ent.x;
      const t = ent.z - b.z1;
      const bt = b.z2 - ent.z;
      const m = Math.min(l, r, t, bt);
      if (m === l) ent.x = b.x1 - ent.r;
      else if (m === r) ent.x = b.x2 + ent.r;
      else if (m === t) ent.z = b.z1 - ent.r;
      else ent.z = b.z2 + ent.r;
    }
    return true;
  }
  return false;
}

export function segmentIntersectsBox(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  b: ColliderBox,
): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = x2 - x1;
  const dz = z2 - z1;
  const p = [-dx, dx, -dz, dz];
  const q = [x1 - b.x1, b.x2 - x1, z1 - b.z1, b.z2 - z1];

  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-8) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return t0 <= t1;
}

export function hasLineOfSight(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  colliders: readonly ColliderBox[],
): boolean {
  for (let i = 0; i < colliders.length; i++) {
    if (colliders[i].tall && segmentIntersectsBox(x1, z1, x2, z2, colliders[i])) {
      return false;
    }
  }
  return true;
}

export function isPointInsideTallWall(
  x: number,
  z: number,
  colliders: readonly ColliderBox[],
): boolean {
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.tall && x >= c.x1 && x <= c.x2 && z >= c.z1 && z <= c.z2) {
      return true;
    }
  }
  return false;
}

export function computeDamage(baseDamage: number, armored: boolean, armorPiercing: boolean): number {
  if (armored && !armorPiercing) {
    return Math.max(4, Math.round(baseDamage * 0.42));
  }
  return Math.max(1, Math.round(baseDamage));
}

export function computeGrenadeFalloffDamage(distance: number, entityRadius: number, blastRadius = 7.0): number {
  if (distance >= blastRadius + entityRadius) return 0;
  const norm = Math.max(0, Math.min(1, distance / (blastRadius + entityRadius + 1.5)));
  return Math.round(185 * (1 - norm * 0.48));
}

export function getWaveSpawns(phase: number): WaveSpawnSpec[] {
  if (phase === 1) {
    return [
      { type: 'walker', x: -0.5, z: 7.5, awake: false },
      { type: 'walker', x: 8.6, z: 6.2, awake: false },
      { type: 'runner', x: 11.2, z: 0.2, awake: false },
      { type: 'walker', x: 12.6, z: -5.2, awake: false },
      { type: 'walker', x: 9.6, z: -8.8, awake: false },
      { type: 'runner', x: 13.0, z: -12.5, awake: false },
      { type: 'spitter', x: 11.5, z: -14.8, awake: false },
      { type: 'walker', x: -10.2, z: -6.2, awake: false },
      { type: 'runner', x: 20.5, z: 7.8, awake: false },
    ];
  }
  if (phase === 2) {
    return [
      { type: 'armored', x: 11.4, z: -14.2, awake: true },
      { type: 'armored', x: -10.2, z: -12.8, awake: true },
      { type: 'spitter', x: 13.6, z: -16.2, awake: true },
      { type: 'spitter', x: 23.2, z: 2.5, awake: true },
      { type: 'runner', x: 10.0, z: -11.2, awake: true },
      { type: 'runner', x: -9.4, z: -10.4, awake: true },
      { type: 'runner', x: 22.4, z: 9.4, awake: true },
      { type: 'walker', x: 12.2, z: -18.2, awake: true },
      { type: 'walker', x: -11.4, z: -15.2, awake: true },
    ];
  }
  return [
    { type: 'tank', x: 11.4, z: -15.6, awake: true },
    { type: 'armored', x: 9.2, z: -13.0, awake: true },
    { type: 'runner', x: 13.8, z: -13.0, awake: true },
    { type: 'spitter', x: -10.2, z: -13.0, awake: true },
  ];
}

export function getPhaseObjective(phase: number, bossDefeated: boolean, generatorActive = false): string {
  if (bossDefeated) {
    return 'Танк уничтожен! Выведите отряд в зону эвакуации [F] на перекрёстке.';
  }
  if (phase === 1) {
    return generatorActive
      ? 'Питание B1 активно (+15% темп)! Зачистите перекрёсток от орды из галереи.'
      : 'Зачистите перекрёсток. Фланги открыты через магазин «マルフジ商店» и паркинг B1.';
  }
  if (phase === 2) {
    return generatorActive
      ? 'Прорыв бронированной орды — бейте Гранатой [3] и Рельсой [4], используйте проходы!'
      : 'Прорыв бронированной орды! Запустите генератор ⚡ B1 в паркинге для усиления отряда.';
  }
  return '⚠ ТАНК прорвался из тумана галереи! Избегайте ударов по земле и бейте бронебойным огнём.';
}

export function getZoneName(x: number, z: number): string {
  if (x >= -28 && x <= -13.5 && z >= -9.5 && z <= 2.0) return 'ИНТЕРЬЕР «マルフジ商店 / РЕКОРДС»';
  if (x >= -2.2 && x <= 5.8 && z >= -16.2 && z <= -10.8) return 'СЕРВИСНЫЙ ПРОХОД // ГАЛЕРЕЯ';
  if (z < -9.5 && x < 5.8) return 'ДВОР С САКУРОЙ // МЕДПУНКТ';
  if (x >= 5.8 && x <= 17.4 && z < 3.0) return 'ТОРГОВАЯ ГАЛЕРЕЯ «中央商店街»';
  if (x > 17.4) return 'ПАРКИНГ B1 «立体駐車場»';
  return 'ПЕРЕКРЁСТОК А-3 // «Café / 喫茶»';
}

export function canExtract(
  leaderX: number,
  leaderZ: number,
  bossDefeated: boolean,
  enemiesRemaining: number,
): boolean {
  if (!bossDefeated || enemiesRemaining > 0) return false;
  return Math.hypot(leaderX - EVAC_ZONE.x, leaderZ - EVAC_ZONE.z) <= EVAC_ZONE.r;
}

export function canClaimMeleeToken(activeAttackers: number): boolean {
  return activeAttackers < MAX_CONCURRENT_MELEE_TOKENS;
}

export function clampDelta(rawDt: number): number {
  return Math.max(0.001, Math.min(0.05, rawDt));
}

// =========================================================================
// SPRINT 1: ACTIVE RELOAD, EXPLOSIVE BARRELS & DIEGETIC WAYPOINT LOGIC
// =========================================================================

export const ACTIVE_RELOAD_SWEET_START = 0.44;
export const ACTIVE_RELOAD_SWEET_END = 0.64;
export const ACTIVE_RELOAD_OVERCHARGE_MULT = 1.35;
export const ACTIVE_RELOAD_OVERCHARGE_SEC = 4.5;
export const ACTIVE_RELOAD_JAM_PENALTY_SEC = 0.55;

export type ActiveReloadOutcome = 'perfect' | 'jam' | 'ignored';

export function evaluateActiveReload(
  progress: number,
  alreadyAttempted: boolean,
): ActiveReloadOutcome {
  if (alreadyAttempted || progress < 0.12 || progress >= 1.0) {
    return 'ignored';
  }
  if (progress >= ACTIVE_RELOAD_SWEET_START && progress <= ACTIVE_RELOAD_SWEET_END) {
    return 'perfect';
  }
  return 'jam';
}

export function computeBarrelExplosionDamage(
  distance: number,
  entityRadius: number,
  blastRadius = 7.5,
): number {
  if (distance >= blastRadius + entityRadius) return 0;
  const norm = Math.max(0, Math.min(1, distance / (blastRadius + entityRadius + 1.2)));
  return Math.round(220 * (1 - norm * 0.52));
}

export interface BarrelSpawnSpec {
  x: number;
  z: number;
}

export const BARREL_SPAWNS: readonly BarrelSpawnSpec[] = [
  { x: -1.8, z: 7.4 }, // Center crosswalk choke near Café & sedan
  { x: 9.2, z: 4.8 }, // Arcade mouth choke
  { x: 11.4, z: -5.2 }, // Deep inside Shopping Arcade
  { x: -10.1, z: -3.4 }, // Quarantine archway bottleneck
  { x: 19.8, z: 8.6 }, // Parking B1 entrance
];

export interface WaypointTarget {
  x: number;
  z: number;
  kind: 'evac' | 'boss' | 'threat';
}

export function computePriorityWaypoint(
  leaderX: number,
  leaderZ: number,
  bossPos: { x: number; z: number } | null,
  enemies: ReadonlyArray<{ x: number; z: number }>,
  evacReady: boolean,
): WaypointTarget | null {
  if (evacReady) {
    return { x: EVAC_ZONE.x, z: EVAC_ZONE.z, kind: 'evac' };
  }
  if (bossPos) {
    return { x: bossPos.x, z: bossPos.z, kind: 'boss' };
  }
  let best: { x: number; z: number } | null = null;
  let bestDistSq = Infinity;
  for (let i = 0; i < enemies.length; i++) {
    const dx = enemies[i].x - leaderX;
    const dz = enemies[i].z - leaderZ;
    const dSq = dx * dx + dz * dz;
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      best = enemies[i];
    }
  }
  return best ? { x: best.x, z: best.z, kind: 'threat' } : null;
}

// =========================================================================
// SPRINT 2: NEON BALLAST FLICKER & CITY POP POST-PROCESSING GRADING
// =========================================================================

export type NeonFlickerStyle = 'steady' | 'buzz' | 'pulse';

/**
 * Deterministic 1980s neon tube ballast modulation (subtle organic buzz & brief micro-dips,
 * never harsh strobing). Returns a multiplier clamped safely to [0.52, 1.18].
 */
export function computeNeonFlickerIntensity(
  timeSec: number,
  phase: number,
  style: NeonFlickerStyle,
): number {
  if (style === 'steady') {
    return 0.97 + Math.sin(timeSec * 2.4 + phase) * 0.04;
  }
  if (style === 'pulse') {
    return 0.94 + Math.sin(timeSec * 3.1 + phase) * 0.14;
  }
  // 'buzz': authentic aging fluorescent neon ballast with occasional crisp dip
  const cycle = (timeSec * 0.72 + phase) % 7.5;
  const hum = Math.sin(timeSec * 19.0 + phase * 3.7) * 0.03;
  let dip = 0;
  if (cycle > 6.45 && cycle < 6.58) dip = 0.34;
  else if (cycle > 6.66 && cycle < 6.76) dip = 0.24;
  else if (cycle > 3.1 && cycle < 3.16) dip = 0.16;
  return Math.max(0.52, Math.min(1.18, 1.0 + hum - dip));
}

export interface MoodPostProcessConfig {
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  shadowTint: readonly [number, number, number];
  highlightTint: readonly [number, number, number];
  vignetteDarkness: number;
  saturation: number;
  contrast: number;
}

export function getMoodPostProcessConfig(mood: 'night' | 'sunset' | 'mist'): MoodPostProcessConfig {
  if (mood === 'sunset') {
    return {
      bloomStrength: 0.24,
      bloomRadius: 0.34,
      bloomThreshold: 1.32,
      shadowTint: [0.92, 0.86, 1.08],
      highlightTint: [1.08, 0.94, 0.86],
      vignetteDarkness: 0.28,
      saturation: 1.14,
      contrast: 1.05,
    };
  }
  if (mood === 'mist') {
    return {
      bloomStrength: 0.24,
      bloomRadius: 0.38,
      bloomThreshold: 1.3,
      shadowTint: [0.84, 0.96, 1.08],
      highlightTint: [0.94, 1.02, 1.06],
      vignetteDarkness: 0.3,
      saturation: 1.08,
      contrast: 1.04,
    };
  }
  // 'night' — Crisp 1980s City Pop 70/20/10: luminous indigo shadows, selective neon-only HDR bloom
  return {
    bloomStrength: 0.23,
    bloomRadius: 0.32,
    bloomThreshold: 1.36,
    shadowTint: [0.88, 0.92, 1.12],
    highlightTint: [1.05, 0.97, 0.92],
    vignetteDarkness: 0.28,
    saturation: 1.14,
    contrast: 1.05,
  };
}

// =========================================================================
// SPRINT 3: A-3 EXPANDED MAP ZONES, PARKING B1 GENERATOR & MINIMAP PROJECTION
// =========================================================================

export const B1_GENERATOR = {
  x: 25.4,
  z: -1.5,
  r: 3.3,
  chargeTime: 1.8,
  fireRateBoost: 0.85,
  shockRadius: 11.5,
  shockDamage: 95,
} as const;

export const WORLD_MINIMAP_BOUNDS = {
  minX: -30.5,
  maxX: 31.5,
  minZ: -27.0,
  maxZ: 20.0,
} as const;

export interface GeneratorStepResult {
  progress: number;
  activatedNow: boolean;
}

export function updateGeneratorCharge(
  currentProgress: number,
  insideZone: boolean,
  dt: number,
  alreadyActive: boolean,
): GeneratorStepResult {
  if (alreadyActive) {
    return { progress: 1, activatedNow: false };
  }
  if (insideZone) {
    const next = Math.min(1, currentProgress + dt / B1_GENERATOR.chargeTime);
    return { progress: next, activatedNow: next >= 1 };
  }
  const decayed = Math.max(0, currentProgress - dt * 0.32);
  return { progress: decayed, activatedNow: false };
}

export function worldToMinimap(x: number, z: number): { u: number; v: number } {
  const { minX, maxX, minZ, maxZ } = WORLD_MINIMAP_BOUNDS;
  const u = Math.max(0, Math.min(1, (x - minX) / (maxX - minX)));
  const v = Math.max(0, Math.min(1, (z - minZ) / (maxZ - minZ)));
  return { u, v };
}

// =========================================================================
// SPRINT 4: SQUAD ORDERS, AMMO CRATES, ADAPTIVE MUSIC & SPATIAL PANNING
// =========================================================================

export const AMMO_CRATE_SPAWNS: ReadonlyArray<{ x: number; z: number; zoneLabel: string }> = [
  { x: 8.6, z: -12.6, zoneLabel: 'ГАЛЕРЕЯ / СЕРВИС' },
  { x: 19.4, z: 8.8, zoneLabel: 'ПАРКИНГ B1' },
];

export const AMMO_CRATE_COOLDOWN_SEC = 25;
export const AMMO_CRATE_PICKUP_RADIUS = 2.25;
export const MAX_FLARE_AMMO = 5;

export function cycleSquadStance(current: SquadStance): SquadStance {
  if (current === 'follow') return 'hold';
  if (current === 'hold') return 'focus';
  return 'follow';
}

export function getStanceMeta(stance: SquadStance): {
  label: string;
  hint: string;
  color: string;
  toast: string;
} {
  if (stance === 'hold') {
    return {
      label: 'ДЕРЖАТЬ',
      hint: 'Оборона точки',
      color: '#f5b971',
      toast: 'ПРИКАЗ ОТРЯДУ [Q]: ДЕРЖАТЬ ПОЗИЦИЮ (+ТОЧНОСТЬ)',
    };
  }
  if (stance === 'focus') {
    return {
      label: 'ФОКУС',
      hint: 'Огонь по цели',
      color: '#f45b8a',
      toast: 'ПРИКАЗ ОТРЯДУ [Q]: ФОКУС ОГНЯ ПО ПРИОРИТЕТНОЙ ЦЕЛИ (+15% ТЕМП)',
    };
  }
  return {
    label: 'СЛЕДОВАТЬ',
    hint: 'Строй за лидером',
    color: '#4ce0e8',
    toast: 'ПРИКАЗ ОТРЯДУ [Q]: СЛЕДОВАТЬ В СТРОЮ ЗА ЛИДЕРОМ',
  };
}

export interface TargetCandidate {
  id: number;
  x: number;
  z: number;
  boss: boolean;
  ranged: boolean;
  armor: boolean;
}

/**
 * Selects the best visible enemy target for an AI squadmate based on active tactical stance.
 * In 'focus' stance, prioritizes Boss/Spitter/Armored threats and enemies nearest the player's cursor aim point.
 */
export function selectPriorityTarget(
  unitX: number,
  unitZ: number,
  aimX: number,
  aimZ: number,
  stance: SquadStance,
  candidates: ReadonlyArray<TargetCandidate>,
): number | null {
  if (candidates.length === 0) return null;
  let bestId: number | null = null;
  let bestScore = -Infinity;

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const distUnit = Math.hypot(c.x - unitX, c.z - unitZ);
    if (stance === 'focus') {
      const distAim = Math.hypot(c.x - aimX, c.z - aimZ);
      const threatBonus = c.boss ? 65 : c.ranged ? 24 : c.armor ? 16 : 0;
      const score = threatBonus - distAim * 2.1 - distUnit * 0.35;
      if (score > bestScore) {
        bestScore = score;
        bestId = c.id;
      }
    } else {
      const score = -distUnit;
      if (score > bestScore) {
        bestScore = score;
        bestId = c.id;
      }
    }
  }
  return bestId;
}

/**
 * Projects a 3D world sound source onto the tactical camera's stereo right-axis [-0.88, +0.88].
 */
export function computeSpatialPan(
  sourceX: number,
  sourceZ: number,
  listenerX: number,
  listenerZ: number,
  camYaw: number,
  spreadMeters = 16,
): number {
  const dx = sourceX - listenerX;
  const dz = sourceZ - listenerZ;
  const rightProj = dx * Math.cos(camYaw) - dz * Math.sin(camYaw);
  return Math.max(-0.88, Math.min(0.88, rightProj / Math.max(1, spreadMeters)));
}

/**
 * Determines which adaptive City Pop music stem layer should be active.
 */
export function computeMusicIntensity(
  state: GamePhaseState,
  phase: number,
  livingEnemies: number,
  bossActive: boolean,
): MusicIntensity {
  if (state !== 'playing' || livingEnemies <= 0) {
    return 'ambient';
  }
  if (bossActive || phase >= 3) {
    return 'boss';
  }
  return 'combat';
}

/**
 * Computes tactical S / A / B / C mission rank for the post-run summary modal.
 */
export function computeRunGrade(
  victory: boolean,
  timeSeconds: number,
  survivorsAlive: number,
  generatorActivated: boolean,
): RunGrade {
  if (!victory) return 'C';
  let score = 0;
  if (survivorsAlive >= 4) score += 3;
  else if (survivorsAlive >= 3) score += 2;
  else if (survivorsAlive >= 2) score += 1;
  if (timeSeconds <= 135) score += 2;
  else if (timeSeconds <= 210) score += 1;
  if (generatorActivated) score += 1;

  if (score >= 5) return 'S';
  if (score >= 3) return 'A';
  if (score >= 1) return 'B';
  return 'C';
}

// =========================================================================
// OPTION 2 + 3: PRODUCTION 3D GLB ASSET PIPELINE & ENGINE BLUEPRINT EXPORT
// =========================================================================

export interface AssetSlotSpec {
  id: AssetSlotId;
  label: string;
  category: AssetSlotCategory;
  targetSize: number;
  axis: 'height' | 'length';
  defaultFacingOffsetY: number;
}

export const ASSET_SLOT_SPECS: readonly AssetSlotSpec[] = [
  { id: 'leader', label: 'Командир', category: 'hero', targetSize: 2.02, axis: 'height', defaultFacingOffsetY: 0 },
  { id: 'medic', label: 'Медик', category: 'hero', targetSize: 1.96, axis: 'height', defaultFacingOffsetY: 0 },
  { id: 'heavy', label: 'Тяжёлый', category: 'hero', targetSize: 2.18, axis: 'height', defaultFacingOffsetY: 0 },
  { id: 'sniper', label: 'Снайпер', category: 'hero', targetSize: 1.94, axis: 'height', defaultFacingOffsetY: 0 },
  { id: 'taxi', label: 'Такси 80-х', category: 'vehicle', targetSize: 4.82, axis: 'length', defaultFacingOffsetY: Math.PI / 2 },
  { id: 'sedan', label: 'Седан 80-х', category: 'vehicle', targetSize: 4.78, axis: 'length', defaultFacingOffsetY: Math.PI / 2 },
  { id: 'coupe', label: 'Спорт-купе', category: 'vehicle', targetSize: 4.74, axis: 'length', defaultFacingOffsetY: Math.PI / 2 },
  { id: 'van', label: 'Фургон 港運送', category: 'vehicle', targetSize: 4.96, axis: 'length', defaultFacingOffsetY: Math.PI / 2 },
  { id: 'walker', label: 'Заражённый', category: 'enemy', targetSize: 1.88, axis: 'height', defaultFacingOffsetY: 0 },
  { id: 'runner', label: 'Бегун', category: 'enemy', targetSize: 1.82, axis: 'height', defaultFacingOffsetY: 0 },
  { id: 'armored', label: 'Бронированный', category: 'enemy', targetSize: 2.18, axis: 'height', defaultFacingOffsetY: 0 },
  { id: 'spitter', label: 'Плеватель', category: 'enemy', targetSize: 1.9, axis: 'height', defaultFacingOffsetY: 0 },
  { id: 'tank', label: 'Босс «Танк»', category: 'enemy', targetSize: 3.35, axis: 'height', defaultFacingOffsetY: 0 },
];

export type AnimationIntent = 'idle' | 'move' | 'attack' | 'death';

export interface NormalizedModelTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
}

/**
 * Pure bounding-box normalization math: scales any imported GLB (whether authored in mm, cm, or meters)
 * to match exact tactical gameplay dimensions and seats its bottom-center pivot flush at Y = 0.
 */
export function computeNormalizedModelTransform(
  boxMin: readonly [number, number, number],
  boxMax: readonly [number, number, number],
  targetSize: number,
  axis: 'height' | 'length',
): NormalizedModelTransform {
  const sizeX = Math.max(0.0001, boxMax[0] - boxMin[0]);
  const sizeY = Math.max(0.0001, boxMax[1] - boxMin[1]);
  const sizeZ = Math.max(0.0001, boxMax[2] - boxMin[2]);
  const currentSpan = axis === 'height' ? sizeY : Math.max(sizeX, sizeZ);
  const rawScale = targetSize / currentSpan;
  const scale = Number.isFinite(rawScale) ? Math.max(0.0005, Math.min(200, rawScale)) : 1;

  const centerX = (boxMin[0] + boxMax[0]) * 0.5;
  const centerZ = (boxMin[2] + boxMax[2]) * 0.5;

  return {
    scale,
    offsetX: -centerX * scale || 0,
    offsetY: -boxMin[1] * scale || 0,
    offsetZ: -centerZ * scale || 0,
  };
}

const ANIMATION_INTENT_PATTERNS: Record<AnimationIntent, readonly RegExp[]> = {
  idle: [/idle/i, /stand/i, /breath/i, /aim/i, /ready/i, /wait/i],
  move: [/run/i, /sprint/i, /walk/i, /jog/i, /locomot/i, /move/i, /stride/i],
  attack: [/shoot/i, /fire/i, /attack/i, /slash/i, /punch/i, /slam/i, /swing/i, /hit/i, /bite/i],
  death: [/death/i, /die/i, /dying/i, /fall/i, /knock/i, /dead/i],
};

/**
 * Matches animation clip names exported by Mixamo, Blender, Meshy, or Tripo3D to gameplay animation intents.
 */
export function matchAnimationClipName(
  clipNames: readonly string[],
  intent: AnimationIntent,
): string | null {
  if (clipNames.length === 0) return null;
  const patterns = ANIMATION_INTENT_PATTERNS[intent];
  for (let p = 0; p < patterns.length; p++) {
    const found = clipNames.find((name) => patterns[p].test(name));
    if (found) return found;
  }
  if (intent === 'idle') {
    return clipNames[0];
  }
  return null;
}

export interface LevelBlueprintExport {
  schemaVersion: string;
  project: string;
  district: string;
  coordinateSystem: 'Y-up right-handed meters (glTF 2.0 / Blender / Godot 4)';
  bounds: typeof WORLD_MINIMAP_BOUNDS;
  zones: Array<{
    id: string;
    name: string;
    x1: number;
    z1: number;
    x2: number;
    z2: number;
  }>;
  landmarks: {
    evacZone: typeof EVAC_ZONE;
    b1Generator: typeof B1_GENERATOR;
    barrels: readonly BarrelSpawnSpec[];
    ammoCrates: typeof AMMO_CRATE_SPAWNS;
  };
  waves: {
    phase1: WaveSpawnSpec[];
    phase2: WaveSpawnSpec[];
    phase3: WaveSpawnSpec[];
  };
  colliders: ColliderBox[];
  assetSlots: readonly AssetSlotSpec[];
}

export function buildLevelBlueprintExport(colliders: readonly ColliderBox[]): LevelBlueprintExport {
  return {
    schemaVersion: '1.0.0',
    project: 'MINATO CITY — Перекрёсток А-3',
    district: 'A-3 Intersection / Record Shop / Sakura Courtyard / Shopping Arcade / Parking B1',
    coordinateSystem: 'Y-up right-handed meters (glTF 2.0 / Blender / Godot 4)',
    bounds: WORLD_MINIMAP_BOUNDS,
    zones: [
      { id: 'intersection', name: 'ПЕРЕКРЁСТОК А-3 // «Café / 喫茶»', x1: -28, z1: 2, x2: 17.4, z2: 19.5 },
      { id: 'record_shop', name: 'ИНТЕРЬЕР «マルフジ商店 / РЕКОРДС»', x1: -28, z1: -9.5, x2: -13.5, z2: 2.0 },
      { id: 'service_passage', name: 'СЕРВИСНЫЙ ПРОХОД // ГАЛЕРЕЯ', x1: -2.2, z1: -16.2, x2: 5.8, z2: -10.8 },
      { id: 'sakura_courtyard', name: 'ДВОР С САКУРОЙ // МЕДПУНКТ', x1: -28, z1: -26.5, x2: 5.8, z2: -9.5 },
      { id: 'shopping_arcade', name: 'ТОРГОВАЯ ГАЛЕРЕЯ «中央商店街»', x1: 5.8, z1: -26.5, x2: 17.4, z2: 3.0 },
      { id: 'parking_b1', name: 'ПАРКИНГ B1 «立体駐車場»', x1: 17.4, z1: -9.5, x2: 31.2, z2: 15.5 },
    ],
    landmarks: {
      evacZone: EVAC_ZONE,
      b1Generator: B1_GENERATOR,
      barrels: BARREL_SPAWNS,
      ammoCrates: AMMO_CRATE_SPAWNS,
    },
    waves: {
      phase1: getWaveSpawns(1),
      phase2: getWaveSpawns(2),
      phase3: getWaveSpawns(3),
    },
    colliders: colliders.filter((c) => c.x1 > -900),
    assetSlots: ASSET_SLOT_SPECS,
  };
}




