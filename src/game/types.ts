export type GamePhaseState = 'title' | 'playing' | 'paused' | 'victory' | 'defeat';

export type LightingMood = 'night' | 'sunset' | 'mist';

export type SquadRole = 'leader' | 'medic' | 'heavy' | 'sniper';

export type SquadStance = 'follow' | 'hold' | 'focus';

export type MusicIntensity = 'ambient' | 'combat' | 'boss';

export type RunGrade = 'S' | 'A' | 'B' | 'C';

export type EnemyType = 'walker' | 'runner' | 'armored' | 'spitter' | 'tank';

export interface ColliderBox {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  tall: boolean;
}

export interface CircleEntity {
  x: number;
  z: number;
  r: number;
}

export interface UnitHudState {
  id: number;
  name: string;
  role: SquadRole;
  color: string;
  hp: number;
  maxHp: number;
  ghostHp: number;
  magAmmo: number;
  magMax: number;
  reloading: boolean;
  overcharged: boolean;
  skillName: string;
  skillHint: string;
  skillCd: number;
  skillMaxCd: number;
  down: boolean;
  active: boolean;
}

export interface ActiveReloadHudState {
  reloading: boolean;
  progress: number;
  sweetStart: number;
  sweetEnd: number;
  jammed: boolean;
  overchargeLeft: number;
  magAmmo: number;
  magMax: number;
}

export interface RunSummary {
  victory: boolean;
  timeSeconds: number;
  kills: number;
  phaseReached: number;
  survivorsAlive: number;
  bossHpPercent: number;
  generatorActivated: boolean;
  grade: RunGrade;
}

export interface GeneratorHudState {
  active: boolean;
  charging: boolean;
  progress: number;
  inRange: boolean;
}

export interface MinimapDot {
  u: number;
  v: number;
  color: string;
  boss?: boolean;
  active?: boolean;
}

export interface MinimapSnapshot {
  leaderU: number;
  leaderV: number;
  leaderYaw: number;
  squad: MinimapDot[];
  enemies: MinimapDot[];
  pickups: Array<{ u: number; v: number; kind: 'medkit' | 'supply' | 'vinyl' | 'ammo' }>;
  holdPoint: { u: number; v: number } | null;
  generatorU: number;
  generatorV: number;
  generatorActive: boolean;
  evacU: number;
  evacV: number;
  evacActive: boolean;
}

export type VehicleKind = 'taxi' | 'sedan' | 'coupe' | 'van';

export type AssetSlotId = SquadRole | EnemyType | VehicleKind;

export type AssetSlotCategory = 'hero' | 'enemy' | 'vehicle';

export interface AssetSlotStatus {
  id: AssetSlotId;
  label: string;
  category: AssetSlotCategory;
  loaded: boolean;
  sourceName: string | null;
  clipCount: number;
  matchedClips: string[];
}

export interface HudSnapshot {
  state: GamePhaseState;
  phase: number;
  totalPhases: number;
  zoneName: string;
  objective: string;
  enemiesAlive: number;
  kills: number;
  flares: number;
  barrelsRemaining: number;
  stance: SquadStance;
  musicIntensity: MusicIntensity;
  inspectMode: boolean;
  comicOutline: boolean;
  mood: LightingMood;
  muted: boolean;
  musicOn: boolean;
  rallyActive: boolean;
  evacActive: boolean;
  bossActive: boolean;
  bossHpPercent: number;
  lowHpWarning: boolean;
  activeReload: ActiveReloadHudState;
  generator: GeneratorHudState;
  minimap: MinimapSnapshot;
  units: UnitHudState[];
  assetSlots: AssetSlotStatus[];
  summary: RunSummary | null;
}

export interface ToastMessage {
  id: number;
  text: string;
  accent: string;
}

export interface WaveSpawnSpec {
  type: EnemyType;
  x: number;
  z: number;
  awake: boolean;
}
