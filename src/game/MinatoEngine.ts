import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  MinatoAssetPipeline,
  OUTLINE_LAYER,
  type AnimatedGlbInstance,
} from './assetPipeline';
import { MinatoAudioEngine, type SoundEffectKind } from './audioEngine';
import {
  buildAmmoCrate,
  buildEnemyModel,
  buildExplosiveBarrel,
  buildFocusTargetRing,
  buildHoldBeacon,
  buildSurvivorModel,
  buildWaypointChevron,
  createSharedModelAssets,
  type AmmoCrateVisual,
  type BarrelVisual,
  type EnemyVisual,
  type HoldBeaconVisual,
  type SharedModelAssets,
  type SurvivorVisual,
  type WaypointChevronVisual,
} from './models';
import {
  ACTIVE_RELOAD_JAM_PENALTY_SEC,
  ACTIVE_RELOAD_OVERCHARGE_MULT,
  ACTIVE_RELOAD_OVERCHARGE_SEC,
  ACTIVE_RELOAD_SWEET_END,
  ACTIVE_RELOAD_SWEET_START,
  AMMO_CRATE_COOLDOWN_SEC,
  AMMO_CRATE_PICKUP_RADIUS,
  AMMO_CRATE_SPAWNS,
  B1_GENERATOR,
  BARREL_SPAWNS,
  canClaimMeleeToken,
  canExtract,
  clampDelta,
  computeBarrelExplosionDamage,
  computeDamage,
  computeGrenadeFalloffDamage,
  computeMusicIntensity,
  computeNeonFlickerIntensity,
  computePriorityWaypoint,
  computeRunGrade,
  computeSpatialPan,
  cycleSquadStance,
  ENEMY_ARCHETYPES,
  evaluateActiveReload,
  EVAC_ZONE,
  getMoodPostProcessConfig,
  getPhaseObjective,
  getStanceMeta,
  getWaveSpawns,
  getZoneName,
  hasLineOfSight,
  isPointInsideTallWall,
  MAX_FLARE_AMMO,
  resolveCircleBox,
  selectPriorityTarget,
  updateGeneratorCharge,
  worldToMinimap,
  type TargetCandidate,
} from './rules';
import { createMinatoTextureBank, type MinatoTextureBank } from './textures';
import type {
  AssetSlotId,
  EnemyType,
  GamePhaseState,
  HudSnapshot,
  LightingMood,
  MusicIntensity,
  RunSummary,
  SquadRole,
  SquadStance,
  ToastMessage,
} from './types';
import { buildMinatoWorld, type MinatoWorldRefs } from './worldBuilder';

interface SquadMember {
  id: number;
  name: string;
  role: SquadRole;
  color: string;
  hex: number;
  jacket: number;
  x: number;
  z: number;
  r: number;
  hp: number;
  maxHp: number;
  ghostHp: number;
  speed: number;
  yaw: number;
  fireRate: number;
  fireCd: number;
  magAmmo: number;
  magMax: number;
  reloadTime: number;
  reloadElapsed: number;
  reloading: boolean;
  reloadAttempted: boolean;
  reloadJammed: boolean;
  overchargeTimer: number;
  dmg: number;
  range: number;
  spread: number;
  skillName: string;
  skillHint: string;
  skillCd: number;
  skillMaxCd: number;
  down: boolean;
  rollTimer: number;
  rollCd: number;
  rollVx: number;
  rollVz: number;
  flashT: number;
  stridePhase: number;
  recoil: number;
  offset: { x: number; z: number };
  vis: SurvivorVisual;
  glbInstance: AnimatedGlbInstance | null;
}

interface EnemyEntity {
  type: EnemyType;
  policy: 'chaser' | 'flanker' | 'juggernaut' | 'kiter' | 'charger';
  x: number;
  z: number;
  r: number;
  hp: number;
  maxHp: number;
  speed: number;
  dmg: number;
  armor: boolean;
  ranged: boolean;
  boss: boolean;
  yaw: number;
  awake: boolean;
  atkCd: number;
  specialCd: number;
  windupTimer: number;
  windupMax: number;
  windupTargetX: number;
  windupTargetZ: number;
  steerDir: number;
  steerTimer: number;
  flankPhase: number;
  hitFlash: number;
  stridePhase: number;
  dying: boolean;
  koTimer: number;
  koVx: number;
  koVz: number;
  vis: EnemyVisual;
  glbInstance: AnimatedGlbInstance | null;
}

interface Projectile {
  kind: 'bullet' | 'acid' | 'grenade';
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  sx: number;
  sz: number;
  tx: number;
  tz: number;
  t: number;
  dur: number;
  dmg: number;
  life: number;
  pierce: boolean;
  mesh: THREE.Mesh;
}

interface RingBeamFx {
  kind: 'ring' | 'beam';
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  maxScale: number;
  life: number;
  maxLife: number;
}

interface FlareItem {
  x: number;
  z: number;
  life: number;
  lure: boolean;
  mesh: THREE.Mesh;
  halo: THREE.Sprite;
  refl: THREE.Mesh;
}

interface MedBeaconItem {
  x: number;
  z: number;
  r: number;
  life: number;
  tick: number;
  mesh: THREE.Group;
}

interface AcidPoolItem {
  x: number;
  z: number;
  r: number;
  life: number;
  mesh: THREE.Mesh;
}

interface PickupItem {
  x: number;
  z: number;
  kind: 'medkit' | 'supply' | 'vinyl';
  label: string;
  taken: boolean;
  mesh: THREE.Mesh;
}

interface ExplosiveBarrel {
  x: number;
  z: number;
  r: number;
  hp: number;
  maxHp: number;
  exploded: boolean;
  fuseTimer: number;
  hitFlash: number;
  colliderIdx: number;
  vis: BarrelVisual;
}

interface AmmoCrateEntity {
  x: number;
  z: number;
  cooldown: number;
  zoneLabel: string;
  vis: AmmoCrateVisual;
}

interface DamagePopupSlot {
  active: boolean;
  sprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  x: number;
  y: number;
  z: number;
  vy: number;
  life: number;
  maxLife: number;
  baseScale: number;
}

interface CombatDecalSlot {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
}

interface ParticleSlot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  scale: number;
}

interface SteamPuffSlot {
  sprite: THREE.Sprite;
  ventIdx: number;
  age: number;
  maxAge: number;
  driftX: number;
  driftZ: number;
  riseSpeed: number;
  baseScale: number;
}

const PARTICLE_POOL_SIZE = 220;
const DAMAGE_POPUP_POOL_SIZE = 20;
const DECAL_POOL_SIZE = 32;
const STEAM_POOL_SIZE = 28;
const RAIN_COUNT = 640;

/**
 * Custom 1980s City Pop 70/20/10 Split-Tone Color Grade, Vignette & Screen-Space Depth+Normal
 * Sobel Comic Ink-Line ShaderPass (crisp graphic-novel edges on architecture, cars & characters).
 */
const CityPopGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    tNormal: { value: null },
    tDepth: { value: null },
    uTexelSize: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
    uOutlineEnabled: { value: 1.0 },
    uOutlineStrength: { value: 0.56 },
    uCameraNear: { value: 0.4 },
    uCameraFar: { value: 240.0 },
    uShadowTint: { value: new THREE.Vector3(0.88, 0.92, 1.12) },
    uHighlightTint: { value: new THREE.Vector3(1.05, 0.97, 0.92) },
    uVignetteDarkness: { value: 0.28 },
    uSaturation: { value: 1.14 },
    uContrast: { value: 1.05 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tNormal;
    uniform sampler2D tDepth;
    uniform vec2 uTexelSize;
    uniform float uOutlineEnabled;
    uniform float uOutlineStrength;
    uniform float uCameraNear;
    uniform float uCameraFar;
    uniform vec3 uShadowTint;
    uniform vec3 uHighlightTint;
    uniform float uVignetteDarkness;
    uniform float uSaturation;
    uniform float uContrast;
    varying vec2 vUv;

    float linearizeDepth(float depthSample) {
      float z = depthSample * 2.0 - 1.0;
      return (2.0 * uCameraNear * uCameraFar) / max(0.0001, uCameraFar + uCameraNear - z * (uCameraFar - uCameraNear));
    }

    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 col = tex.rgb;

      // Crisp multiplicative City Pop 70/20/10 split-tone (preserves deep rich blacks — zero milky lift!)
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float shadowMask = pow(1.0 - clamp(luma, 0.0, 1.0), 1.8);
      float highMask = smoothstep(0.42, 1.0, luma);
      col *= mix(vec3(1.0), uShadowTint, shadowMask * 0.55);
      col *= mix(vec3(1.0), uHighlightTint, highMask * 0.6);

      // Rich graphic-novel saturation & contrast sculpt
      float newLuma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(newLuma), col, uSaturation);
      col = (col - 0.5) * uContrast + 0.5;

      // Screen-Space Depth + Normal Sobel Comic Ink Outlines (1px architectural, vehicle & character creases)
      if (uOutlineEnabled > 0.5) {
        vec2 dx = vec2(uTexelSize.x, 0.0);
        vec2 dy = vec2(0.0, uTexelSize.y);

        vec4 nC = texture2D(tNormal, vUv);
        vec4 nL = texture2D(tNormal, vUv - dx);
        vec4 nR = texture2D(tNormal, vUv + dx);
        vec4 nU = texture2D(tNormal, vUv + dy);
        vec4 nD = texture2D(tNormal, vUv - dy);

        float hasSolid = max(nC.a, max(max(nL.a, nR.a), max(nU.a, nD.a)));
        if (hasSolid > 0.1) {
          float dC = linearizeDepth(texture2D(tDepth, vUv).r);
          float dL = linearizeDepth(texture2D(tDepth, vUv - dx).r);
          float dR = linearizeDepth(texture2D(tDepth, vUv + dx).r);
          float dU = linearizeDepth(texture2D(tDepth, vUv + dy).r);
          float dD = linearizeDepth(texture2D(tDepth, vUv - dy).r);

          float normalDelta = length(nL.rgb - nR.rgb) + length(nU.rgb - nD.rgb);
          float alphaEdge = abs(nL.a - nR.a) + abs(nU.a - nD.a);
          float depthDelta = max(max(abs(dC - dL), abs(dC - dR)), max(abs(dC - dU), abs(dC - dD)));
          float relDepth = depthDelta / max(dC, 1.0);

          float edgeNormal = smoothstep(0.42, 0.92, normalDelta);
          float edgeDepth = smoothstep(0.045, 0.12, relDepth);
          float edgeSil = smoothstep(0.35, 0.85, alphaEdge);
          float minDist = min(dC, min(min(dL, dR), min(dU, dD)));
          float distFade = smoothstep(62.0, 24.0, minDist);

          float ink = clamp(max(max(edgeNormal * 0.72, edgeDepth), edgeSil * 0.9), 0.0, 1.0) * distFade;
          vec3 inkColor = vec3(0.045, 0.055, 0.125);
          col = mix(col, inkColor, ink * uOutlineStrength);
        }
      }

      // Soft cinematic lens vignette keeping center crisp and HUD corners readable
      vec2 centered = (vUv - 0.5) * vec2(1.16, 1.0);
      float vig = smoothstep(0.42, 1.02, length(centered));
      col *= 1.0 - vig * uVignetteDarkness;

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), tex.a);
    }
  `,
};

// Pre-allocated scratch math helpers (zero per-frame GC!)
const _mat4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();

/**
 * Custom nocturnal 1980s City Pop IBL studio for PMREM reflections:
 * Deep midnight indigo enclosure with subtle warm amber, rose-magenta, and harbor-cyan neon strips
 * so glossy car roofs, glass windshields, chrome trim, and wet puddles reflect moody City Pop colors
 * instead of a blinding white daylight softbox.
 */
function buildNocturnalCityPopEnvironment(): THREE.Scene {
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x28345e);

  const shellGeo = new THREE.BoxGeometry(24, 14, 24);
  const shellMat = new THREE.MeshBasicMaterial({ color: 0x3a4878, side: THREE.BackSide });
  envScene.add(new THREE.Mesh(shellGeo, shellMat));

  // Luminous moonlight indigo zenith sky (even soft fill, zero harsh white softbox panels!)
  const zenith = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 18),
    new THREE.MeshBasicMaterial({ color: 0x6c88cc, side: THREE.DoubleSide }),
  );
  zenith.position.set(0, 6.8, 0);
  zenith.rotation.x = Math.PI / 2;
  envScene.add(zenith);

  // Warm plum-indigo street bounce floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshBasicMaterial({ color: 0x2c2242, side: THREE.DoubleSide }),
  );
  floor.position.set(0, -6.8, 0);
  floor.rotation.x = -Math.PI / 2;
  envScene.add(floor);

  // Rich City Pop neon accent strips on perimeter walls for authentic colored reflections
  const strips: Array<[number, number, number, number, number, number, number]> = [
    [-11.4, 2.4, -2, 0.3, 3.2, 12.0, 0xe86490], // West magenta billboard bounce
    [0, 2.2, -11.4, 14.0, 3.0, 0.3, 0xf0a054], // North warm storefront amber bounce
    [11.4, 2.6, 0, 0.3, 3.0, 12.0, 0x48c6d8], // East harbor cyan arcade bounce
    [0, 1.8, 11.4, 12.0, 2.6, 0.3, 0x4a5f9e], // South luminous indigo rim
  ];
  for (const [x, y, z, w, h, d, hex] of strips) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: hex }));
    m.position.set(x, y, z);
    envScene.add(m);
  }
  return envScene;
}

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

export interface MinatoEngineCallbacks {
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onToast: (toast: ToastMessage) => void;
}

export class MinatoEngine {
  private container: HTMLDivElement;
  private callbacks: MinatoEngineCallbacks;
  private isSoftwareGl: boolean;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private gradePass: ShaderPass | null = null;
  private outputPass: OutputPass | null = null;
  private normalDepthTarget: THREE.WebGLRenderTarget | null = null;
  private normalOverrideMat = new THREE.MeshNormalMaterial();
  private savedClearColor = new THREE.Color();
  private comicOutline = true;
  private textures: MinatoTextureBank;
  private assets: SharedModelAssets;
  private assetPipeline = new MinatoAssetPipeline();
  private world: MinatoWorldRefs;
  private audio: MinatoAudioEngine;

  // Dynamic lights
  private flashLight: THREE.PointLight;
  private flareLight: THREE.PointLight;
  private medLight: THREE.PointLight;

  // Weather & pooled FX
  private rainGeo: THREE.BufferGeometry;
  private rainVel: Float32Array;
  private petals: Array<{ mesh: THREE.Mesh; vx: number; vy: number; vz: number }> = [];
  private steamPuffs: SteamPuffSlot[] = [];
  private particleMesh: THREE.InstancedMesh;
  private particles: ParticleSlot[] = [];
  private particleCursor = 0;

  // Markers & shared dynamic geometries
  private evacRing: THREE.Mesh;
  private aimReticle: THREE.Mesh;
  private waypointChevron: WaypointChevronVisual;
  private holdBeacon: HoldBeaconVisual;
  private focusTargetRing: THREE.Mesh;
  private bulletGeo: THREE.BoxGeometry;
  private acidGeo: THREE.SphereGeometry;
  private grenadeGeo: THREE.SphereGeometry;
  private decalGeo: THREE.CircleGeometry;

  // Pooled combat readouts & ground decals
  private damagePopups: DamagePopupSlot[] = [];
  private damagePopupCursor = 0;
  private combatDecals: CombatDecalSlot[] = [];
  private combatDecalCursor = 0;

  // State machine & simulation
  private state: GamePhaseState = 'title';
  private mood: LightingMood = 'night';
  private inspectMode = false;
  private phase = 1;
  private activeIdx = 0;
  private timeElapsed = 0;
  private kills = 0;
  private flareAmmo = 3;
  private bossDefeated = false;
  private b1GeneratorActive = false;
  private b1GeneratorProgress = 0;
  private b1GeneratorInRange = false;
  private stance: SquadStance = 'follow';
  private holdAnchor: { x: number; z: number } | null = null;
  private musicIntensity: MusicIntensity = 'ambient';
  private rallyBuffTimer = 0;
  private trauma = 0;
  private hitstopTimer = 0;
  private defeatBeatTimer = 0;
  private summary: RunSummary | null = null;
  private toastCounter = 0;

  // Entities
  private squad: SquadMember[] = [];
  private leaderTrail: Array<{ x: number; z: number }> = [];
  private enemies: EnemyEntity[] = [];
  private barrels: ExplosiveBarrel[] = [];
  private ammoCrates: AmmoCrateEntity[] = [];
  private projectiles: Projectile[] = [];
  private fxList: RingBeamFx[] = [];
  private flares: FlareItem[] = [];
  private medBeacons: MedBeaconItem[] = [];
  private acidPools: AcidPoolItem[] = [];
  private pickups: PickupItem[] = [];

  // Camera rig
  private camYaw = -0.16;
  private camPitch = 0.6;
  private camDist = 23.5;
  private camTarget = new THREE.Vector3(-1.5, 2.0, 3.2);
  private camPos = new THREE.Vector3(-5.5, 14.5, 25.0);
  private titleTourAngle = 0;

  // Unified input hub
  private keysHeld = new Set<string>();
  private rollBufferTimer = 0;
  private mouseNDC = new THREE.Vector2(0, 0);
  private aimPoint = new THREE.Vector3(-4, 1.15, 8);
  private mouseDown = false;
  private dragOrbit = false;
  private prevDragX = 0;
  private prevDragY = 0;
  private raycaster = new THREE.Raycaster();
  private aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.15);

  // Lifecycle & throttling
  private disposed = false;
  private frameId = 0;
  private lastTime = performance.now();
  private hudPushAccum = 0;
  private resizeObserver: ResizeObserver;

  constructor(container: HTMLDivElement, callbacks: MinatoEngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareGl();
    this.audio = new MinatoAudioEngine();

    // Renderer configured per Three.js studio PBR & software-WebGL standards
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = Math.max(1, container.clientWidth || window.innerWidth);
    const height = Math.max(1, container.clientHeight || window.innerHeight);
    this.renderer.setSize(width, height);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.dataset.testid = 'minato-canvas';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.4, 240);

    // Custom Nocturnal City Pop PMREM Environment (luminous indigo + neon bounce, zero white softbox washout!)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = buildNocturnalCityPopEnvironment();
    this.scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    this.scene.environmentIntensity = 0.85;
    pmrem.dispose();

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createMinatoTextureBank(maxAniso);
    this.assets = createSharedModelAssets(this.textures);
    this.world = buildMinatoWorld(this.scene, this.textures, this.assets, this.isSoftwareGl);

    // Dynamic lights
    this.flashLight = new THREE.PointLight(0xffd285, 0, 16);
    this.flareLight = new THREE.PointLight(0xff3b52, 0, 22);
    this.medLight = new THREE.PointLight(0x6ee782, 0, 16);
    this.scene.add(this.flashLight, this.flareLight, this.medLight);

    // Rain system
    const rainPos = new Float32Array(RAIN_COUNT * 6);
    this.rainVel = new Float32Array(RAIN_COUNT);
    for (let i = 0; i < RAIN_COUNT; i++) {
      const rx = (Math.random() - 0.5) * 62;
      const ry = Math.random() * 24;
      const rz = (Math.random() - 0.5) * 62;
      rainPos[i * 6] = rx;
      rainPos[i * 6 + 1] = ry;
      rainPos[i * 6 + 2] = rz;
      rainPos[i * 6 + 3] = rx - 0.22;
      rainPos[i * 6 + 4] = ry - 1.35;
      rainPos[i * 6 + 5] = rz + 0.12;
      this.rainVel[i] = 24 + Math.random() * 10;
    }
    this.rainGeo = new THREE.BufferGeometry();
    this.rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    this.scene.add(
      new THREE.LineSegments(
        this.rainGeo,
        new THREE.LineBasicMaterial({ color: 0xa4c6ff, transparent: true, opacity: 0.22 }),
      ),
    );

    // Drifting Sakura Petals near courtyard
    const pGeo = new THREE.PlaneGeometry(0.18, 0.11);
    const pMat = new THREE.MeshBasicMaterial({
      color: 0xffb3d9,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    for (let i = 0; i < 24; i++) {
      const pm = new THREE.Mesh(pGeo, pMat);
      pm.position.set(-18 + Math.random() * 7, 1 + Math.random() * 5, -23 + Math.random() * 6);
      this.scene.add(pm);
      this.petals.push({
        mesh: pm,
        vx: 0.65 + Math.random() * 0.6,
        vy: -0.55 - Math.random() * 0.4,
        vz: 0.35 + Math.random() * 0.5,
      });
    }

    // Zero-GC Pooled InstancedMesh Particle Ring Buffer
    const sparkGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.particleMesh = new THREE.InstancedMesh(sparkGeo, sparkMat, PARTICLE_POOL_SIZE);
    this.particleMesh.frustumCulled = false;
    _scale.set(0, 0, 0);
    _mat4.compose(_pos.set(0, -100, 0), _quat, _scale);
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: -100,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        scale: 1,
      });
      this.particleMesh.setMatrixAt(i, _mat4);
      this.particleMesh.setColorAt(i, _color.setHex(0xffffff));
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.particleMesh);

    // Markers & reusable projectile geometries
    this.evacRing = new THREE.Mesh(
      new THREE.RingGeometry(EVAC_ZONE.r - 0.32, EVAC_ZONE.r, 36),
      new THREE.MeshBasicMaterial({
        color: 0x4ce0e8,
        transparent: true,
        opacity: 0.88,
        side: THREE.DoubleSide,
      }),
    );
    this.evacRing.rotation.x = -Math.PI / 2;
    this.evacRing.position.set(EVAC_ZONE.x, 0.06, EVAC_ZONE.z);
    this.evacRing.visible = false;
    this.scene.add(this.evacRing);

    this.aimReticle = new THREE.Mesh(
      new THREE.RingGeometry(0.36, 0.48, 20),
      new THREE.MeshBasicMaterial({
        color: 0x4ce0e8,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
      }),
    );
    this.aimReticle.rotation.x = -Math.PI / 2;
    this.aimReticle.position.y = 0.06;
    this.aimReticle.visible = false;
    this.scene.add(this.aimReticle);

    this.bulletGeo = new THREE.BoxGeometry(0.1, 0.1, 0.85);
    this.acidGeo = new THREE.SphereGeometry(0.24, 8, 8);
    this.grenadeGeo = new THREE.SphereGeometry(0.22, 10, 8);
    this.decalGeo = new THREE.CircleGeometry(1.0, 16);
    this.decalGeo.rotateX(-Math.PI / 2);

    // 3D Diegetic Ground Waypoint Chevron & Tactical Stance Markers
    this.waypointChevron = buildWaypointChevron();
    this.waypointChevron.group.visible = false;
    this.scene.add(this.waypointChevron.group);

    this.holdBeacon = buildHoldBeacon();
    this.scene.add(this.holdBeacon.group);

    this.focusTargetRing = buildFocusTargetRing();
    this.scene.add(this.focusTargetRing);

    // Zero-GC Floating 3D Combat Damage Number Sprite Pool
    for (let i = 0; i < DAMAGE_POPUP_POOL_SIZE; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 72;
      const ctx = canvas.getContext('2d')!;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        depthTest: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      sprite.renderOrder = 20;
      this.scene.add(sprite);
      this.damagePopups.push({
        active: false,
        sprite,
        canvas,
        ctx,
        tex,
        x: 0,
        y: -100,
        z: 0,
        vy: 0,
        life: 0,
        maxLife: 0.7,
        baseScale: 1.5,
      });
    }

    // Ring-Buffered Persistent Asphalt Combat Decals (scorch craters & splatter marks)
    for (let i = 0; i < DECAL_POOL_SIZE; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: this.textures.glowHalo,
        color: 0x101118,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      const mesh = new THREE.Mesh(this.decalGeo, mat);
      mesh.visible = false;
      mesh.position.y = 0.032;
      this.scene.add(mesh);
      this.combatDecals.push({ mesh, mat });
    }

    // Zero-GC Pooled Volumetric Rising Steam Plumes over street manholes
    const ventCount = Math.max(1, this.world.steamVents.length);
    for (let i = 0; i < STEAM_POOL_SIZE; i++) {
      const ventIdx = i % ventCount;
      const vent = this.world.steamVents[ventIdx];
      const spMat = new THREE.SpriteMaterial({
        map: this.textures.steamPuff,
        color: vent ? vent.tint : 0xd2e4ff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(spMat);
      this.scene.add(sprite);
      const maxAge = 2.6 + (i % 5) * 0.42;
      this.steamPuffs.push({
        sprite,
        ventIdx,
        age: (i / STEAM_POOL_SIZE) * maxAge,
        maxAge,
        driftX: 0.28 + ((i * 17) % 10) * 0.04,
        driftZ: -0.18 + ((i * 29) % 10) * 0.04,
        riseSpeed: 1.05 + ((i * 13) % 7) * 0.12,
        baseScale: 1.35 + (i % 4) * 0.22,
      });
    }

    // Three.js Post-Processing Pipeline: RenderPass -> UnrealBloomPass -> OutputPass -> CityPopGradePass
    this.setupPostProcessing(width, height);
    this.applyPostProcessMood(this.mood);

    // Stage initial world entities for atmospheric title preview
    this.setupRunEntities();
    this.state = 'title';
    this.syncBodyState();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // Bind listeners
    this.bindEvents();
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);

    // Optional manifest auto-loading from /public/models/manifest.json (zero 404s when slots are null)
    void this.assetPipeline.loadManifest('/models/manifest.json', (slot) => {
      if (this.disposed) return;
      this.applyAssetSlotToScene(slot);
      this.emitHud();
    });

    this.emitHud();
    this.updateAmbientVisuals(0.016, 0);
    this.updateTitleTour(0);
    this.renderFrame();
    this.lastTime = performance.now();
    this.scheduleNextFrame();
  }

  private setupPostProcessing(width: number, height: number): void {
    try {
      const rt = new THREE.WebGLRenderTarget(width, height, {
        type: THREE.HalfFloatType,
      });
      const composer = new EffectComposer(this.renderer, rt);
      const renderPass = new RenderPass(this.scene, this.camera);
      composer.addPass(renderPass);

      const bloomScale = this.isSoftwareGl ? 0.5 : 1.0;
      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(Math.max(64, Math.floor(width * bloomScale)), Math.max(64, Math.floor(height * bloomScale))),
        0.32,
        0.42,
        1.12,
      );
      composer.addPass(bloomPass);

      const outputPass = new OutputPass();
      composer.addPass(outputPass);

      // Dedicated Depth+Normal RenderTarget for crisp Screen-Space Comic Ink Outlines
      const ndScale = this.isSoftwareGl ? 0.75 : 1.0;
      const ndW = Math.max(64, Math.floor(width * ndScale));
      const ndH = Math.max(64, Math.floor(height * ndScale));
      const depthTexture = new THREE.DepthTexture(ndW, ndH);
      depthTexture.type = THREE.UnsignedIntType;
      depthTexture.format = THREE.DepthFormat;
      const normalDepthTarget = new THREE.WebGLRenderTarget(ndW, ndH, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthBuffer: true,
        depthTexture,
      });

      const gradePass = new ShaderPass(CityPopGradeShader);
      gradePass.uniforms.tNormal.value = normalDepthTarget.texture;
      gradePass.uniforms.tDepth.value = depthTexture;
      gradePass.uniforms.uTexelSize.value.set(1 / ndW, 1 / ndH);
      gradePass.uniforms.uOutlineEnabled.value = this.comicOutline ? 1.0 : 0.0;
      gradePass.uniforms.uCameraNear.value = this.camera.near;
      gradePass.uniforms.uCameraFar.value = this.camera.far;
      composer.addPass(gradePass);

      composer.setSize(width, height);
      this.composer = composer;
      this.bloomPass = bloomPass;
      this.outputPass = outputPass;
      this.gradePass = gradePass;
      this.normalDepthTarget = normalDepthTarget;
    } catch {
      this.composer = null;
      this.bloomPass = null;
      this.outputPass = null;
      this.gradePass = null;
      this.normalDepthTarget = null;
    }
  }

  private applyPostProcessMood(mood: LightingMood): void {
    const cfg = getMoodPostProcessConfig(mood);
    this.renderer.toneMappingExposure = mood === 'sunset' ? 1.08 : mood === 'mist' ? 1.04 : 1.04;
    this.scene.environmentIntensity = mood === 'sunset' ? 0.95 : mood === 'mist' ? 0.85 : 0.85;
    if (this.bloomPass) {
      this.bloomPass.strength = cfg.bloomStrength;
      this.bloomPass.radius = cfg.bloomRadius;
      this.bloomPass.threshold = cfg.bloomThreshold;
    }
    if (this.gradePass) {
      this.gradePass.uniforms.uShadowTint.value.set(cfg.shadowTint[0], cfg.shadowTint[1], cfg.shadowTint[2]);
      this.gradePass.uniforms.uHighlightTint.value.set(
        cfg.highlightTint[0],
        cfg.highlightTint[1],
        cfg.highlightTint[2],
      );
      this.gradePass.uniforms.uVignetteDarkness.value = cfg.vignetteDarkness;
      this.gradePass.uniforms.uSaturation.value = cfg.saturation;
      this.gradePass.uniforms.uContrast.value = cfg.contrast;
    }
  }

  private renderNormalDepthPrepass(): void {
    if (!this.comicOutline || !this.normalDepthTarget || !this.gradePass) return;

    const prevTarget = this.renderer.getRenderTarget();
    const prevOverride = this.scene.overrideMaterial;
    const prevBg = this.scene.background;
    const prevFog = this.scene.fog;
    const prevMask = this.camera.layers.mask;
    const prevClearAlpha = this.renderer.getClearAlpha();
    this.renderer.getClearColor(this.savedClearColor);

    this.scene.overrideMaterial = this.normalOverrideMat;
    this.scene.background = null;
    this.scene.fog = null;
    this.camera.layers.set(OUTLINE_LAYER);

    this.renderer.setRenderTarget(this.normalDepthTarget);
    this.renderer.setClearColor(0x8080ff, 0);
    this.renderer.clear(true, true, false);
    this.renderer.render(this.scene, this.camera);

    this.camera.layers.mask = prevMask;
    this.scene.overrideMaterial = prevOverride;
    this.scene.background = prevBg;
    this.scene.fog = prevFog;
    this.renderer.setClearColor(this.savedClearColor, prevClearAlpha);
    this.renderer.setRenderTarget(prevTarget);
  }

  private renderFrame(): void {
    if (this.composer) {
      try {
        this.renderNormalDepthPrepass();
        this.composer.render();
        return;
      } catch {
        this.composer = null;
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  // =========================================================================
  // PUBLIC CONTROLS (CALLED BY REACT GAME SHELL)
  // =========================================================================

  public startGame(
    fromUserGesture = true,
    spawnZone?: 'shop' | 'courtyard' | 'b1' | 'arcade',
  ): void {
    if (fromUserGesture) {
      this.audio.unlock();
    }
    this.clearInputs();
    this.inspectMode = false;
    this.setupRunEntities(spawnZone);
    this.state = 'playing';
    this.audio.setPaused(false);
    this.musicIntensity = 'combat';
    this.audio.setMusicIntensity('combat');
    if (spawnZone === 'shop') {
      this.camYaw = -0.12;
      this.camPitch = 0.78;
      this.camDist = 17.5;
    } else if (spawnZone === 'courtyard') {
      this.camYaw = -0.22;
      this.camPitch = 0.64;
      this.camDist = 20.5;
    } else if (spawnZone === 'b1') {
      this.camYaw = -0.34;
      this.camPitch = 0.64;
      this.camDist = 19.5;
    } else if (spawnZone === 'arcade') {
      this.camYaw = -0.18;
      this.camPitch = 0.66;
      this.camDist = 19.5;
    } else {
      this.camYaw = -0.18;
      this.camPitch = 0.62;
      this.camDist = 23.5;
    }

    const leader = this.getActiveUnit();
    if (leader) {
      this.aimPoint.set(leader.x + 2.5, 1.15, leader.z - 2.0);
      this.camTarget.set(leader.x, 1.5, leader.z);
      const horiz = Math.cos(this.camPitch) * this.camDist;
      const vert = Math.sin(this.camPitch) * this.camDist;
      this.camPos.set(
        this.camTarget.x + Math.sin(this.camYaw) * horiz,
        this.camTarget.y + vert,
        this.camTarget.z + Math.cos(this.camYaw) * horiz,
      );
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.camTarget.x, this.camTarget.y + 0.6, this.camTarget.z);

      for (const occ of this.world.occludables) {
        const zones = occ.extraZones ? [occ.zone, ...occ.extraZones] : [occ.zone];
        const inside = zones.some(
          (z) => leader.x >= z.x1 && leader.x <= z.x2 && leader.z >= z.z1 && leader.z <= z.z2,
        );
        const fadedOp = occ.minOpacity ?? 0.22;
        const targetOp = inside ? fadedOp : 1.0;
        for (const mat of occ.materials) {
          mat.opacity = targetOp;
        }
        if (occ.objects) {
          const show = targetOp > 0.06;
          for (const obj of occ.objects) {
            obj.visible = show;
          }
        }
      }
    }

    this.aimReticle.visible = true;
    this.syncBodyState();
    this.emitHud();
    this.pushToast('ФАЗА 1: ЗАЧИСТИТЕ ПЕРЕКРЁСТОК А-3', '#4ce0e8');
  }

  public cycleStance(): void {
    this.audio.unlock();
    if (this.state !== 'playing') return;
    this.stance = cycleSquadStance(this.stance);
    const meta = getStanceMeta(this.stance);
    const leader = this.getActiveUnit();

    if (this.stance === 'hold' && leader) {
      this.holdAnchor = { x: leader.x, z: leader.z };
      this.holdBeacon.group.position.set(leader.x, 0, leader.z);
      this.holdBeacon.group.visible = true;
      this.spawnBurst(leader.x, 0.5, leader.z, 0xf5b971, 10, 4.4, 0.36);
    } else {
      this.holdAnchor = null;
      this.holdBeacon.group.visible = false;
    }

    if (this.stance !== 'focus') {
      this.focusTargetRing.visible = false;
    }

    this.audio.play('stanceOrder');
    this.pushToast(meta.toast, meta.color);
    this.emitHud();
  }

  public togglePause(): void {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.clearInputs();
      this.audio.setPaused(true);
      this.syncBodyState();
      this.emitHud();
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.clearInputs();
      this.audio.setPaused(false);
      this.syncBodyState();
      this.emitHud();
    }
  }

  public returnToTitle(): void {
    this.clearInputs();
    this.inspectMode = false;
    this.setupRunEntities();
    this.state = 'title';
    this.aimReticle.visible = false;
    this.audio.setPaused(false);
    this.syncBodyState();
    this.emitHud();
  }

  public toggleInspectMode(): void {
    if (this.state !== 'playing') return;
    this.inspectMode = !this.inspectMode;
    this.mouseDown = false;
    this.dragOrbit = false;
    this.aimReticle.visible = !this.inspectMode;
    this.pushToast(
      this.inspectMode
        ? 'СВОБОДНЫЙ ОСМОТР 3D-СЦЕНЫ (ЛКМ + МЫШЬ / WASD)'
        : 'ВОЗВРАТ К ТАКТИЧЕСКОЙ КАМЕРЕ',
      '#4ce0e8',
    );
    this.emitHud();
  }

  public cycleMood(): void {
    const order: LightingMood[] = ['night', 'sunset', 'mist'];
    const next = order[(order.indexOf(this.mood) + 1) % order.length];
    this.mood = next;
    this.world.applyMood(next);
    this.applyPostProcessMood(next);
    const label =
      next === 'night'
        ? 'АТМОСФЕРА: НОЧНОЙ НЕОН'
        : next === 'sunset'
          ? 'АТМОСФЕРА: CITY POP ЗАКАТ'
          : 'АТМОСФЕРА: ПОРТОВЫЙ ТУМАН';
    this.pushToast(label, next === 'sunset' ? '#f5b971' : '#4ce0e8');
    this.emitHud();
  }

  public toggleMute(): void {
    this.audio.unlock();
    const muted = this.audio.toggleMute();
    this.pushToast(muted ? 'ЗВУК ОТКЛЮЧЁН' : 'ЗВУК ВКЛЮЧЁН', '#f5b971');
    this.emitHud();
  }

  public toggleMusic(): void {
    this.audio.unlock();
    const on = this.audio.toggleMusic();
    this.pushToast(on ? 'CITY POP СИНТЕЗ: ВКЛ' : 'CITY POP СИНТЕЗ: ВЫКЛ', '#f45b8a');
    this.emitHud();
  }

  public toggleComicOutline(): void {
    this.comicOutline = !this.comicOutline;
    if (this.gradePass) {
      this.gradePass.uniforms.uOutlineEnabled.value = this.comicOutline ? 1.0 : 0.0;
    }
    this.pushToast(
      this.comicOutline ? 'ЭКРАННЫЙ INK-КОНТУР (DEPTH+NORMAL): ВКЛ' : 'ЭКРАННЫЙ INK-КОНТУР: ВЫКЛ',
      '#4ce0e8',
    );
    this.emitHud();
    this.renderFrame();
  }

  public async uploadAssetGlb(slot: AssetSlotId, file: File): Promise<void> {
    try {
      const status = await this.assetPipeline.loadSlotFromFile(slot, file);
      this.applyAssetSlotToScene(slot);
      this.pushToast(
        `3D GLB ЗАГРУЖЕН: ${status.label.toUpperCase()} (${status.clipCount} аним.)`,
        '#4ce0e8',
      );
      this.emitHud();
      this.renderFrame();
    } catch {
      this.pushToast(`ОШИБКА ЗАГРУЗКИ .GLB ДЛЯ СЛОТА ${slot.toUpperCase()}`, '#ff5a72');
    }
  }

  public resetAssetSlot(slot: AssetSlotId): void {
    this.assetPipeline.clearSlot(slot);
    this.applyAssetSlotToScene(slot);
    this.pushToast(`СЛОТ ${slot.toUpperCase()} ВОЗВРАЩЁН К ГРЕЙБОКСУ`, '#f5b971');
    this.emitHud();
    this.renderFrame();
  }

  public async exportGreyboxGlb(): Promise<void> {
    try {
      const { bytes, meshCount } = await this.assetPipeline.exportGreyboxSceneToGlb(
        this.scene,
        'minato-a3-greybox.glb',
      );
      const kb = Math.max(1, Math.round(bytes / 1024));
      this.pushToast(`ЭКСПОРТ .GLB ГОТОВ (${meshCount} мешей · ${kb} КБ)`, '#4ce0e8');
    } catch {
      this.pushToast('НЕ УДАЛОСЬ ЭКСПОРТИРОВАТЬ СЦЕНУ В .GLB', '#ff5a72');
    }
  }

  public exportLevelBlueprintJson(): void {
    try {
      const bytes = this.assetPipeline.exportLevelBlueprint(
        this.world.colliders,
        'minato-a3-blueprint.json',
      );
      const kb = Math.max(1, Math.round(bytes / 1024));
      this.pushToast(`СХЕМА УРОВНЯ А-3 (.JSON · ${kb} КБ) СКАЧАНА`, '#f5b971');
    } catch {
      this.pushToast('ОШИБКА ЭКСПОРТА СХЕМЫ УРОВНЯ (.JSON)', '#ff5a72');
    }
  }

  private mountSlotGlb(
    slot: AssetSlotId,
    proxyGroup: THREE.Group,
    customSlotMount: THREE.Group,
    prevInstance: AnimatedGlbInstance | null,
  ): AnimatedGlbInstance | null {
    if (prevInstance) {
      prevInstance.dispose();
    }
    while (customSlotMount.children.length > 0) {
      customSlotMount.remove(customSlotMount.children[0]);
    }
    const inst = this.assetPipeline.instantiateSlot(slot);
    if (inst) {
      customSlotMount.add(inst.root);
      proxyGroup.visible = false;
      return inst;
    }
    proxyGroup.visible = true;
    return null;
  }

  private applyAssetSlotToScene(slot: AssetSlotId): void {
    for (const u of this.squad) {
      if (u.role === slot) {
        u.glbInstance = this.mountSlotGlb(slot, u.vis.proxyGroup, u.vis.customSlotMount, u.glbInstance);
      }
    }
    for (const e of this.enemies) {
      if (e.type === slot) {
        e.glbInstance = this.mountSlotGlb(slot, e.vis.proxyGroup, e.vis.customSlotMount, e.glbInstance);
      }
    }
    for (const v of this.world.vehicles) {
      if (v.kind === slot) {
        v.glbInstance = this.mountSlotGlb(slot, v.proxyGroup, v.customSlotMount, v.glbInstance);
      }
    }
  }

  public selectUnit(idx: number): void {
    this.audio.unlock();
    if (this.state !== 'playing') return;
    const u = this.squad[idx];
    if (u && !u.down) {
      this.activeIdx = idx;
      this.audio.play('switchUnit');
      this.pushToast(`АКТИВНЫЙ БОЕЦ: ${u.name}`, u.color);
      this.emitHud();
    }
  }

  public triggerSkill(idx: number): void {
    this.audio.unlock();
    if (this.state !== 'playing' || this.inspectMode) return;
    const u = this.squad[idx];
    if (!u || u.down || u.skillCd > 0) return;

    if (idx === 0) {
      u.skillCd = u.skillMaxCd;
      this.rallyBuffTimer = 5.5;
      this.audio.play('rally');
      this.spawnBurst(u.x, 1.2, u.z, 0xf5b971, 16, 6.5, 0.5);
      this.pushToast('КОМАНДИР: ПРИКАЗ «ШКВАЛ ОГНЯ»!', '#f5b971');
    } else if (idx === 1) {
      u.skillCd = u.skillMaxCd;
      this.audio.play('medBeacon');
      const grp = new THREE.Group();
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.52, 0.38, 12),
        new THREE.MeshStandardMaterial({
          color: 0x6ee782,
          emissive: 0x6ee782,
          emissiveIntensity: 0.9,
          roughness: 0.3,
        }),
      );
      base.position.y = 0.2;
      grp.add(base);
      const aura = new THREE.Mesh(
        new THREE.RingGeometry(4.3, 4.6, 32),
        new THREE.MeshBasicMaterial({
          color: 0x6ee782,
          transparent: true,
          opacity: 0.62,
          side: THREE.DoubleSide,
        }),
      );
      aura.rotation.x = -Math.PI / 2;
      aura.position.y = 0.08;
      grp.add(aura);
      grp.position.set(u.x, 0, u.z);
      this.scene.add(grp);
      this.medBeacons.push({ x: u.x, z: u.z, r: 4.8, life: 6.5, tick: 0, mesh: grp });
      this.squad.forEach((m) => {
        if (m.down) {
          m.down = false;
          m.hp = Math.round(m.maxHp * 0.62);
          m.ghostHp = m.hp;
          this.pushToast(`${m.name} ПОДНЯТ В СТРОЙ!`, '#6ee782');
        }
      });
      this.pushToast('МЕДИК: МЕД-МАЯК АКТИВИРОВАН', '#6ee782');
    } else if (idx === 2) {
      u.skillCd = u.skillMaxCd;
      this.audio.play('grenadeThrow');
      const dx = this.aimPoint.x - u.x;
      const dz = this.aimPoint.z - u.z;
      const dist = Math.hypot(dx, dz) || 1;
      const dc = Math.min(dist, 22);
      const tx = u.x + (dx / dist) * dc;
      const tz = u.z + (dz / dist) * dc;
      const mesh = new THREE.Mesh(
        this.grenadeGeo,
        new THREE.MeshBasicMaterial({ color: 0xff8c42 }),
      );
      mesh.position.set(u.x, 1.3, u.z);
      this.scene.add(mesh);
      this.projectiles.push({
        kind: 'grenade',
        x: u.x,
        y: 1.3,
        z: u.z,
        vx: 0,
        vz: 0,
        sx: u.x,
        sz: u.z,
        tx,
        tz,
        t: 0,
        dur: 0.48,
        dmg: 0,
        life: 1,
        pierce: true,
        mesh,
      });
      this.pushToast('ТЯЖЁЛЫЙ: ОСКОЛОЧНАЯ ГРАНАТА!', '#f28c52');
    } else if (idx === 3) {
      u.skillCd = u.skillMaxCd;
      const ang = Math.atan2(this.aimPoint.x - u.x, this.aimPoint.z - u.z);
      u.yaw = ang;
      const maxLen = 40;
      let ex = u.x + Math.sin(ang) * maxLen;
      let ez = u.z + Math.cos(ang) * maxLen;
      for (let step = 1; step <= 64; step++) {
        const px = u.x + Math.sin(ang) * ((maxLen * step) / 64);
        const pz = u.z + Math.cos(ang) * ((maxLen * step) / 64);
        if (isPointInsideTallWall(px, pz, this.world.colliders)) {
          ex = px;
          ez = pz;
          break;
        }
      }
      const bx = ex - u.x;
      const bz = ez - u.z;
      const lenSq = bx * bx + bz * bz || 1;
      let hitCount = 0;
      this.enemies.forEach((e) => {
        if (e.dying || e.hp <= 0) return;
        const t = Math.max(0, Math.min(1, ((e.x - u.x) * bx + (e.z - u.z) * bz) / lenSq));
        if (Math.hypot(e.x - (u.x + t * bx), e.z - (u.z + t * bz)) <= e.r + 0.95) {
          this.damageEnemy(e, 210, true, Math.sin(ang), Math.cos(ang), true);
          hitCount++;
        }
      });
      this.barrels.forEach((br) => {
        if (br.exploded) return;
        const t = Math.max(0, Math.min(1, ((br.x - u.x) * bx + (br.z - u.z) * bz) / lenSq));
        if (Math.hypot(br.x - (u.x + t * bx), br.z - (u.z + t * bz)) <= br.r + 0.95) {
          this.damageBarrel(br, 100);
        }
      });
      const beamMat = new THREE.MeshBasicMaterial({ color: 0x4ce0e8, transparent: true, opacity: 1 });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, Math.hypot(bx, bz), 8), beamMat);
      beam.position.set((u.x + ex) / 2, 1.18, (u.z + ez) / 2);
      beam.rotation.z = Math.PI / 2;
      beam.rotation.y = Math.atan2(-bz, bx);
      this.scene.add(beam);
      this.fxList.push({ kind: 'beam', mesh: beam, mat: beamMat, maxScale: 1, life: 0.36, maxLife: 0.36 });
      this.audio.play('railgun');
      this.addTrauma(0.55);
      if (hitCount > 0) this.hitstopTimer = Math.max(this.hitstopTimer, 0.045);
      this.pushToast('СНАЙПЕР: ПРОБИВНОЙ РЕЛЬСОВЫЙ ЛУЧ!', '#4ce0e8');
    }

    this.emitHud();
  }

  public triggerReload(): void {
    this.audio.unlock();
    if (this.state !== 'playing' || this.inspectMode) return;
    const u = this.getActiveUnit();
    if (!u || u.down) return;

    if (u.reloading) {
      const progress = Math.min(1, u.reloadElapsed / u.reloadTime);
      const outcome = evaluateActiveReload(progress, u.reloadAttempted);
      if (outcome === 'perfect') {
        u.reloadAttempted = true;
        u.reloading = false;
        u.reloadJammed = false;
        u.reloadElapsed = 0;
        u.magAmmo = u.magMax;
        u.overchargeTimer = ACTIVE_RELOAD_OVERCHARGE_SEC;
        this.audio.play('reloadPerfect');
        this.spawnBurst(u.x, 1.35, u.z, 0x4ce0e8, 10, 5.2, 0.34);
        this.spawnDamagePopup(u.x, 2.25, u.z, 'ИДЕАЛЬНО +35%', '#f5b971', 1.75);
        this.pushToast('ИДЕАЛЬНАЯ ПЕРЕЗАРЯДКА: УРОН +35%!', '#f5b971');
        this.emitHud();
      } else if (outcome === 'jam') {
        u.reloadAttempted = true;
        u.reloadJammed = true;
        u.reloadElapsed = Math.max(0, u.reloadElapsed - ACTIVE_RELOAD_JAM_PENALTY_SEC);
        this.audio.play('reloadJam');
        this.spawnDamagePopup(u.x, 2.15, u.z, 'ЗАКЛИНИЛО', '#ff5a72', 1.5);
        this.emitHud();
      }
      return;
    }

    if (u.magAmmo < u.magMax) {
      this.startUnitReload(u, true);
      this.emitHud();
    }
  }

  private startUnitReload(u: SquadMember, isLeader: boolean): void {
    if (u.reloading) return;
    u.reloading = true;
    u.reloadElapsed = 0;
    u.reloadAttempted = false;
    u.reloadJammed = false;
    if (isLeader) {
      this.audio.play('reloadStart');
    }
  }

  public throwFlare(): void {
    this.audio.unlock();
    if (this.state !== 'playing' || this.inspectMode || this.flareAmmo <= 0) return;
    const leader = this.getActiveUnit();
    if (!leader) return;
    this.flareAmmo--;
    const dx = this.aimPoint.x - leader.x;
    const dz = this.aimPoint.z - leader.z;
    const d = Math.hypot(dx, dz) || 1;
    const td = Math.min(d, 16);
    let fx = leader.x + (dx / d) * td;
    let fz = leader.z + (dz / d) * td;
    if (isPointInsideTallWall(fx, fz, this.world.colliders)) {
      fx = leader.x + (dx / d) * 3;
      fz = leader.z + (dz / d) * 3;
    }
    this.spawnFlare(fx, fz, 11.0, true);
    this.audio.play('flare');
    this.pushToast('ШАШКА: ПРИМАНКА + ПОДСВЕТКА', '#ff6b7a');
    this.emitHud();
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);
    this.resizeObserver.disconnect();
    this.unbindEvents();
    this.clearDynamicEntities();
    this.rainGeo.dispose();
    this.bulletGeo.dispose();
    this.acidGeo.dispose();
    this.grenadeGeo.dispose();
    this.decalGeo.dispose();
    this.damagePopups.forEach((p) => {
      p.tex.dispose();
      p.sprite.material.dispose();
    });
    this.combatDecals.forEach((d) => d.mat.dispose());
    this.steamPuffs.forEach((s) => s.sprite.material.dispose());
    this.particleMesh.geometry.dispose();
    (this.particleMesh.material as THREE.Material).dispose();
    this.bloomPass?.dispose();
    this.outputPass?.dispose();
    this.gradePass?.dispose();
    this.normalDepthTarget?.depthTexture?.dispose();
    this.normalDepthTarget?.dispose();
    this.normalOverrideMat.dispose();
    this.composer?.dispose();
    this.world.vehicles.forEach((v) => v.glbInstance?.dispose());
    this.textures.dispose();
    this.assets.dispose();
    this.audio.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }

  // =========================================================================
  // RUN SETUP & ENTITY LIFECYCLE
  // =========================================================================

  private clearDynamicEntities(): void {
    this.squad.forEach((u) => {
      u.glbInstance?.dispose();
      this.scene.remove(u.vis.group);
    });
    this.enemies.forEach((e) => {
      e.glbInstance?.dispose();
      this.scene.remove(e.vis.group);
    });
    this.barrels.forEach((b) => this.scene.remove(b.vis.group));
    this.ammoCrates.forEach((c) => this.scene.remove(c.vis.group));
    // Remove barrel colliders appended at end of world.colliders
    if (this.barrels.length > 0) {
      const minIdx = Math.min(...this.barrels.map((b) => b.colliderIdx));
      if (minIdx >= 0 && minIdx <= this.world.colliders.length) {
        this.world.colliders.length = minIdx;
      }
    }
    this.projectiles.forEach((b) => this.scene.remove(b.mesh));
    this.fxList.forEach((f) => this.scene.remove(f.mesh));
    this.flares.forEach((f) => {
      this.scene.remove(f.mesh);
      this.scene.remove(f.halo);
      this.scene.remove(f.refl);
    });
    this.medBeacons.forEach((m) => this.scene.remove(m.mesh));
    this.acidPools.forEach((a) => this.scene.remove(a.mesh));
    this.pickups.forEach((p) => this.scene.remove(p.mesh));

    this.damagePopups.forEach((p) => {
      p.active = false;
      p.sprite.visible = false;
    });
    this.combatDecals.forEach((d) => {
      d.mesh.visible = false;
    });

    this.squad = [];
    this.enemies = [];
    this.barrels = [];
    this.ammoCrates = [];
    this.projectiles = [];
    this.fxList = [];
    this.flares = [];
    this.medBeacons = [];
    this.acidPools = [];
    this.pickups = [];
  }

  private setupRunEntities(spawnZone?: 'shop' | 'courtyard' | 'b1' | 'arcade'): void {
    this.clearDynamicEntities();
    this.phase = 1;
    this.activeIdx = 0;
    this.timeElapsed = 0;
    this.kills = 0;
    this.flareAmmo = 3;
    this.bossDefeated = false;
    this.b1GeneratorActive = false;
    this.b1GeneratorProgress = 0;
    this.b1GeneratorInRange = false;
    this.stance = 'follow';
    this.holdAnchor = null;
    this.holdBeacon.group.visible = false;
    this.focusTargetRing.visible = false;
    this.musicIntensity = 'ambient';
    this.audio.setMusicIntensity('ambient');
    this.rallyBuffTimer = 0;
    this.trauma = 0;
    this.hitstopTimer = 0;
    this.defeatBeatTimer = 0;
    this.summary = null;
    this.evacRing.visible = false;

    // Reset B1 Emergency Generator visuals to offline amber standby
    const gen = this.world.b1Generator;
    gen.beaconMat.color.setHex(0xf5b971);
    gen.beaconMat.emissive.setHex(0xf5b971);
    gen.beaconMat.emissiveIntensity = 1.85;
    gen.beaconHalo.material.color.setHex(0xf5b971);
    gen.captureRingMat.color.setHex(0xf5b971);
    gen.captureRingMat.opacity = 0.72;
    gen.progressArc.visible = false;
    gen.progressArc.scale.setScalar(0.01);
    this.world.parkCyanLight.intensity = 2.4;

    const sx =
      spawnZone === 'shop'
        ? -20.2
        : spawnZone === 'courtyard'
          ? -12.6
          : spawnZone === 'b1'
            ? 22.6
            : spawnZone === 'arcade'
              ? 8.8
              : -15.5;
    const sz =
      spawnZone === 'shop'
        ? -3.4
        : spawnZone === 'courtyard'
          ? -16.8
          : spawnZone === 'b1'
            ? -1.2
            : spawnZone === 'arcade'
              ? -10.8
              : 12.6;
    const spreadScale =
      spawnZone === 'shop' || spawnZone === 'b1'
        ? 0.55
        : spawnZone === 'courtyard' || spawnZone === 'arcade'
          ? 0.65
          : 1.0;
    const defs: Array<{
      id: number;
      name: string;
      role: SquadRole;
      color: string;
      hex: number;
      jacket: number;
      dx: number;
      dz: number;
      r: number;
      hp: number;
      speed: number;
      fireRate: number;
      magMax: number;
      reloadTime: number;
      dmg: number;
      range: number;
      spread: number;
      skillName: string;
      skillHint: string;
      skillMaxCd: number;
      offset: { x: number; z: number };
    }> = [
      {
        id: 0,
        name: 'КОМАНДИР',
        role: 'leader',
        color: '#f5b971',
        hex: 0xf5b971,
        jacket: 0x4b5c82,
        dx: 0,
        dz: 0,
        r: 0.58,
        hp: 145,
        speed: 8.8,
        fireRate: 0.16,
        magMax: 28,
        reloadTime: 1.45,
        dmg: 22,
        range: 28,
        spread: 0.04,
        skillName: 'Шквал огня',
        skillHint: 'Темп +38% отряду',
        skillMaxCd: 11,
        offset: { x: 0, z: 0 },
      },
      {
        id: 1,
        name: 'МЕДИК',
        role: 'medic',
        color: '#6ee782',
        hex: 0x6ee782,
        jacket: 0xd9ceb8,
        dx: -1.9,
        dz: 1.4,
        r: 0.56,
        hp: 125,
        speed: 9.0,
        fireRate: 0.2,
        magMax: 32,
        reloadTime: 1.35,
        dmg: 16,
        range: 26,
        spread: 0.07,
        skillName: 'Мед-маяк',
        skillHint: 'Лечение + подъём',
        skillMaxCd: 13,
        offset: { x: -2.0, z: 1.5 },
      },
      {
        id: 2,
        name: 'ТЯЖЁЛЫЙ',
        role: 'heavy',
        color: '#f28c52',
        hex: 0xf28c52,
        jacket: 0x633a35,
        dx: 1.9,
        dz: 1.2,
        r: 0.68,
        hp: 195,
        speed: 8.4,
        fireRate: 0.115,
        magMax: 60,
        reloadTime: 2.05,
        dmg: 16,
        range: 24,
        spread: 0.11,
        skillName: 'Граната',
        skillHint: 'Взрыв по площади',
        skillMaxCd: 8,
        offset: { x: 2.0, z: 1.3 },
      },
      {
        id: 3,
        name: 'СНАЙПЕР',
        role: 'sniper',
        color: '#4ce0e8',
        hex: 0x4ce0e8,
        jacket: 0x3b3356,
        dx: -1.6,
        dz: -1.7,
        r: 0.56,
        hp: 115,
        speed: 9.0,
        fireRate: 0.56,
        magMax: 6,
        reloadTime: 1.75,
        dmg: 60,
        range: 36,
        spread: 0.008,
        skillName: 'Рельса',
        skillHint: 'Бронебойный луч',
        skillMaxCd: 7,
        offset: { x: -1.8, z: -1.7 },
      },
    ];

    this.squad = defs.map((d) => {
      const vis = buildSurvivorModel(d.role, d.hex, d.jacket, this.assets, this.textures);
      const px = sx + d.dx * spreadScale;
      const pz = sz + d.dz * spreadScale;
      vis.group.position.set(px, 0, pz);
      this.scene.add(vis.group);
      const glbInstance = this.mountSlotGlb(d.role, vis.proxyGroup, vis.customSlotMount, null);
      return {
        id: d.id,
        name: d.name,
        role: d.role,
        color: d.color,
        hex: d.hex,
        jacket: d.jacket,
        x: px,
        z: pz,
        r: d.r,
        hp: d.hp,
        maxHp: d.hp,
        ghostHp: d.hp,
        speed: d.speed,
        yaw: 1.1,
        fireRate: d.fireRate,
        fireCd: 0,
        magAmmo: d.magMax,
        magMax: d.magMax,
        reloadTime: d.reloadTime,
        reloadElapsed: 0,
        reloading: false,
        reloadAttempted: false,
        reloadJammed: false,
        overchargeTimer: 0,
        dmg: d.dmg,
        range: d.range,
        spread: d.spread,
        skillName: d.skillName,
        skillHint: d.skillHint,
        skillCd: 0,
        skillMaxCd: d.skillMaxCd,
        down: false,
        rollTimer: 0,
        rollCd: 0,
        rollVx: 0,
        rollVz: 0,
        flashT: 0,
        stridePhase: 0,
        recoil: 0,
        offset: d.offset,
        vis,
        glbInstance,
      };
    });

    this.leaderTrail = [{ x: sx, z: sz }];

    // Spawn 5 interactive explosive fuel barrels in tactical choke points
    this.barrels = BARREL_SPAWNS.map((sp) => {
      const vis = buildExplosiveBarrel(this.assets, this.textures);
      vis.group.position.set(sp.x, 0, sp.z);
      this.scene.add(vis.group);
      const r = 0.56;
      const colliderIdx = this.world.colliders.length;
      this.world.colliders.push({
        x1: sp.x - r,
        z1: sp.z - r,
        x2: sp.x + r,
        z2: sp.z + r,
        tall: false,
      });
      return {
        x: sp.x,
        z: sp.z,
        r,
        hp: 45,
        maxHp: 45,
        exploded: false,
        fuseTimer: -1,
        hitFlash: 0,
        colliderIdx,
        vis,
      };
    });

    // Interactive 3D Tactical Ammo Supply Crates (rechargeable every 25s)
    this.ammoCrates = AMMO_CRATE_SPAWNS.map((sp) => {
      const vis = buildAmmoCrate(this.assets, this.textures);
      vis.group.position.set(sp.x, 0.18, sp.z);
      this.scene.add(vis.group);
      return {
        x: sp.x,
        z: sp.z,
        cooldown: 0,
        zoneLabel: sp.zoneLabel,
        vis,
      };
    });

    // Foreground burning crimson road flare (matching concept art!)
    this.spawnFlare(13.8, 14.2, 65, false);

    // Supplies in Walkable Record Shop Interior, Sakura Courtyard & Parking B1
    this.spawnPickup(-21.2, -4.4, 'vinyl', 'ВИНИЛ-ТАЙНИК: ПЕРЕГРУЗКА + ПАТРОНЫ + ШАШКА');
    this.spawnPickup(-24.2, -19.2, 'medkit', 'МЕДПУНКТ: +100% HP ОТРЯДУ');
    this.spawnPickup(23.5, 6.2, 'supply', 'ПАРКИНГ B1: +2 ШАШКИ И АПТЕЧКА');

    this.spawnWave(1);
  }

  private spawnPickup(x: number, z: number, kind: 'medkit' | 'supply' | 'vinyl', label: string): void {
    const col = kind === 'medkit' ? 0x6ee782 : kind === 'vinyl' ? 0xf45b8a : 0xf5b971;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.92, 0.72, 0.92),
      new THREE.MeshStandardMaterial({
        color: col,
        emissive: col,
        emissiveIntensity: 0.72,
        roughness: 0.3,
      }),
    );
    mesh.position.set(x, 0.6, z);
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.pickups.push({ x, z, kind, label, taken: false, mesh });
  }

  private spawnFlare(x: number, z: number, life: number, lure: boolean): void {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.42, 8),
      new THREE.MeshBasicMaterial({ color: 0xff5a72 }),
    );
    mesh.position.set(x, 0.1, z);
    mesh.rotation.z = Math.PI / 2;
    this.scene.add(mesh);

    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.textures.glowHalo,
        color: 0xff3b52,
        transparent: true,
        opacity: 0.88,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    halo.position.set(x, 0.45, z);
    halo.scale.set(4.2, 4.2, 1);
    this.scene.add(halo);

    const refl = new THREE.Mesh(
      new THREE.PlaneGeometry(5.6, 5.6),
      new THREE.MeshBasicMaterial({
        map: this.textures.glowHalo,
        color: 0xff3b52,
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    refl.rotation.x = -Math.PI / 2;
    refl.position.set(x, 0.028, z);
    this.scene.add(refl);

    this.flares.push({ x, z, life, lure, mesh, halo, refl });
  }

  private spawnWave(p: number): void {
    this.phase = p;
    const specs = getWaveSpawns(p);
    for (const sp of specs) {
      const cfg = ENEMY_ARCHETYPES[sp.type];
      const vis = buildEnemyModel(
        sp.type,
        cfg.hex,
        cfg.accentHex,
        cfg.armor,
        cfg.ranged,
        cfg.boss,
        this.assets,
        this.textures,
      );
      vis.group.position.set(sp.x, 0, sp.z);
      this.scene.add(vis.group);
      const glbInstance = this.mountSlotGlb(sp.type, vis.proxyGroup, vis.customSlotMount, null);
      this.enemies.push({
        type: sp.type,
        policy: cfg.policy,
        x: sp.x,
        z: sp.z,
        r: cfg.r,
        hp: cfg.hp,
        maxHp: cfg.hp,
        speed: cfg.speed,
        dmg: cfg.dmg,
        armor: cfg.armor,
        ranged: cfg.ranged,
        boss: cfg.boss,
        yaw: 0,
        awake: sp.awake,
        atkCd: 0,
        specialCd: cfg.boss ? 2.4 : 1.8,
        windupTimer: 0,
        windupMax: cfg.boss ? 0.65 : 0.55,
        windupTargetX: sp.x,
        windupTargetZ: sp.z,
        steerDir: Math.random() < 0.5 ? 1 : -1,
        steerTimer: 0,
        flankPhase: Math.random() * Math.PI * 2,
        hitFlash: 0,
        stridePhase: 0,
        dying: false,
        koTimer: 0,
        koVx: 0,
        koVz: 0,
        vis,
        glbInstance,
      });
    }

    if (p === 2) {
      this.pushToast('ФАЗА 2: БРОНИРОВАННЫЙ ПРОРЫВ ИЗ ГАЛЕРЕИ И АРКИ!', '#f5b971');
    } else if (p === 3) {
      this.audio.play('tankRoar');
      this.addTrauma(0.65);
      this.pushToast('⚠ ТАНК ПРОРЫВАЕТСЯ ИЗ ГАЛЕРЕИ «中央商店街»!', '#ff3b52');
    }
    this.emitHud();
  }

  // =========================================================================
  // COMBAT HELPERS & ZERO-GC PARTICLES
  // =========================================================================

  private spawnBurst(
    x: number,
    y: number,
    z: number,
    colHex: number,
    count: number,
    speed: number,
    life: number,
  ): void {
    _color.setHex(colHex);
    for (let i = 0; i < count; i++) {
      const idx = this.particleCursor;
      this.particleCursor = (this.particleCursor + 1) % PARTICLE_POOL_SIZE;
      const p = this.particles[idx];
      const ang = Math.random() * Math.PI * 2;
      const sp = speed * (0.3 + Math.random() * 0.9);
      p.active = true;
      p.x = x;
      p.y = y;
      p.z = z;
      p.vx = Math.cos(ang) * sp;
      p.vy = 2.2 + Math.random() * 4.2;
      p.vz = Math.sin(ang) * sp;
      p.life = life * (0.6 + Math.random() * 0.5);
      p.maxLife = p.life;
      p.scale = 0.7 + Math.random() * 0.65;
      this.particleMesh.setColorAt(idx, _color);
    }
    if (this.particleMesh.instanceColor) {
      this.particleMesh.instanceColor.needsUpdate = true;
    }
  }

  private playSpatial(kind: SoundEffectKind, x: number, z: number, gainScale = 1): void {
    const pan = computeSpatialPan(x, z, this.camTarget.x, this.camTarget.z, this.camYaw);
    this.audio.play(kind, { pan, gainScale });
  }

  private addTrauma(amount: number): void {
    this.trauma = Math.min(1.0, this.trauma + amount);
  }

  private spawnDamagePopup(
    x: number,
    y: number,
    z: number,
    text: string,
    colorHex: string,
    scale = 1.45,
  ): void {
    const slot = this.damagePopups[this.damagePopupCursor];
    this.damagePopupCursor = (this.damagePopupCursor + 1) % DAMAGE_POPUP_POOL_SIZE;
    const { ctx, canvas } = slot;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const fontSize = text.length > 13 ? 21 : text.length > 7 ? 24 : 30;
    const maxW = canvas.width - 18;
    ctx.font = `900 ${fontSize}px "Chakra Petch", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#090b16';
    ctx.strokeText(text, canvas.width / 2, canvas.height / 2, maxW);
    ctx.fillStyle = colorHex;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2, maxW);
    slot.tex.needsUpdate = true;

    slot.active = true;
    slot.x = x + (Math.random() - 0.5) * 0.45;
    slot.y = y;
    slot.z = z + (Math.random() - 0.5) * 0.45;
    slot.vy = 2.35;
    slot.maxLife = text.length > 7 ? 0.95 : 0.72;
    slot.life = slot.maxLife;
    slot.baseScale = scale;
    slot.sprite.position.set(slot.x, slot.y, slot.z);
    slot.sprite.scale.set(scale * 3.1, scale * 0.88, 1);
    slot.sprite.material.opacity = 1;
    slot.sprite.visible = true;
  }

  private spawnCombatDecal(x: number, z: number, radius: number, colorHex: number, opacity: number): void {
    const slot = this.combatDecals[this.combatDecalCursor];
    this.combatDecalCursor = (this.combatDecalCursor + 1) % DECAL_POOL_SIZE;
    slot.mat.color.setHex(colorHex);
    slot.mat.opacity = opacity;
    slot.mesh.position.set(x, 0.032 + this.combatDecalCursor * 0.0002, z);
    slot.mesh.scale.set(radius, 1, radius);
    slot.mesh.visible = true;
  }

  private damageBarrel(b: ExplosiveBarrel, dmg: number): void {
    if (b.exploded) return;
    b.hp -= dmg;
    b.hitFlash = 0.09;
    this.audio.play('barrelHit');
    this.spawnBurst(b.x, 0.85, b.z, 0xffd066, 5, 6.2, 0.24);
    if (b.hp <= 0) {
      this.detonateBarrel(b);
    }
  }

  private detonateBarrel(b: ExplosiveBarrel): void {
    if (b.exploded) return;
    b.exploded = true;
    b.fuseTimer = -1;
    b.vis.intactGroup.visible = false;
    b.vis.charredGroup.visible = true;

    // Neutralize barrel collider so units can traverse the cleared blast crater
    const col = this.world.colliders[b.colliderIdx];
    if (col) {
      col.x1 = -999;
      col.x2 = -999;
      col.z1 = -999;
      col.z2 = -999;
    }

    this.audio.play('explosion');
    this.addTrauma(0.92);
    this.hitstopTimer = Math.max(this.hitstopTimer, 0.06);
    this.flashLight.color.setHex(0xff7733);
    this.flashLight.position.set(b.x, 2.4, b.z);
    this.flashLight.intensity = 12;

    this.spawnCombatDecal(b.x, b.z, 3.6, 0x0c0b12, 0.78);
    this.spawnBurst(b.x, 0.9, b.z, 0xffaa44, 28, 14.5, 0.62);
    this.spawnBurst(b.x, 0.9, b.z, 0xff3b52, 18, 10.5, 0.48);

    const rMat = new THREE.MeshBasicMaterial({
      color: 0xff7b42,
      transparent: true,
      opacity: 0.94,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 1.15, 28), rMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(b.x, 0.13, b.z);
    this.scene.add(ring);
    this.fxList.push({ kind: 'ring', mesh: ring, mat: rMat, maxScale: 7.5, life: 0.36, maxLife: 0.36 });

    let hits = 0;
    this.enemies.forEach((e) => {
      if (e.dying || e.hp <= 0) return;
      const dx = e.x - b.x;
      const dz = e.z - b.z;
      const d = Math.hypot(dx, dz) || 0.01;
      const dmg = computeBarrelExplosionDamage(d, e.r);
      if (dmg > 0) {
        hits++;
        this.damageEnemy(e, dmg, true, dx / d, dz / d, true);
      }
    });

    // Chain-detonate nearby explosive barrels with a punchy 180ms stagger!
    this.barrels.forEach((other) => {
      if (other !== b && !other.exploded && other.fuseTimer < 0) {
        if (Math.hypot(other.x - b.x, other.z - b.z) <= 8.4) {
          other.fuseTimer = 0.18;
        }
      }
    });

    this.pushToast(
      hits > 0 ? `ДЕТОНАЦИЯ БОЧКИ: ПОРАЖЕНО ${hits}!` : 'ДЕТОНАЦИЯ ТОПЛИВНОЙ БОЧКИ!',
      '#ff8c42',
    );
    this.emitHud();
  }

  private damageEnemy(
    e: EnemyEntity,
    baseDmg: number,
    armorPiercing: boolean,
    dirX = 0,
    dirZ = 0,
    isCrit = false,
  ): void {
    if (e.dying) return;
    const dmg = computeDamage(baseDmg, e.armor, armorPiercing);
    e.hp -= dmg;
    e.awake = true;
    e.hitFlash = 0.08;

    const ricochet = e.armor && !armorPiercing;
    this.audio.play(ricochet ? 'ricochet' : 'fleshHit');
    this.spawnBurst(
      e.x,
      1.1,
      e.z,
      ricochet ? 0x4ce0e8 : e.ranged ? 0x7cff57 : 0xd62436,
      ricochet ? 5 : 4,
      5.5,
      0.28,
    );
    this.spawnDamagePopup(
      e.x,
      e.boss ? 3.5 : 2.05,
      e.z,
      ricochet ? `${dmg}` : isCrit ? `${dmg}!` : `${dmg}`,
      ricochet ? '#4ce0e8' : isCrit ? '#f5b971' : '#f8fafc',
      isCrit ? 1.65 : ricochet ? 1.18 : 1.32,
    );

    if (e.hp <= 0) {
      e.hp = 0;
      e.dying = true;
      e.koTimer = 0.36;
      e.koVx = dirX * (e.boss ? 2.5 : 5.5);
      e.koVz = dirZ * (e.boss ? 2.5 : 5.5);
      e.vis.telegraphRing.visible = false;
      e.vis.hpBg.visible = false;
      e.vis.hpBar.visible = false;
      this.kills++;
      this.spawnCombatDecal(
        e.x,
        e.z,
        e.boss ? 2.8 : 1.25,
        e.ranged ? 0x265e20 : 0x4a0b15,
        0.58,
      );
      this.spawnBurst(
        e.x,
        1.0,
        e.z,
        e.ranged ? 0x7cff57 : 0xd92638,
        e.boss ? 28 : 10,
        8.5,
        0.52,
      );

      if (e.boss) {
        this.bossDefeated = true;
        this.hitstopTimer = Math.max(this.hitstopTimer, 0.075);
        this.addTrauma(0.9);
        this.audio.play('explosion');
        this.evacRing.visible = true;
        this.pushToast('ТАНК ПОВЕРЖЕН! К ЗОНЕ ЭВАКУАЦИИ [F]!', '#4ce0e8');
      }
      this.emitHud();
    }
  }

  private explodeGrenade(x: number, z: number): void {
    this.audio.play('explosion');
    this.addTrauma(0.82);
    this.hitstopTimer = Math.max(this.hitstopTimer, 0.055);
    this.flashLight.color.setHex(0xff8c42);
    this.flashLight.position.set(x, 2.2, z);
    this.flashLight.intensity = 10;
    this.spawnCombatDecal(x, z, 3.1, 0x0e0d15, 0.72);
    this.spawnBurst(x, 0.8, z, 0xffa652, 22, 13, 0.55);
    this.spawnBurst(x, 0.8, z, 0xff3b52, 14, 9, 0.45);

    const rMat = new THREE.MeshBasicMaterial({
      color: 0xf5b971,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 1.0, 28), rMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.12, z);
    this.scene.add(ring);
    this.fxList.push({ kind: 'ring', mesh: ring, mat: rMat, maxScale: 7.0, life: 0.34, maxLife: 0.34 });

    this.enemies.forEach((e) => {
      if (e.dying || e.hp <= 0) return;
      const dx = e.x - x;
      const dz = e.z - z;
      const d = Math.hypot(dx, dz) || 0.01;
      const dmg = computeGrenadeFalloffDamage(d, e.r);
      if (dmg > 0) {
        this.damageEnemy(e, dmg, true, dx / d, dz / d, true);
      }
    });

    this.barrels.forEach((br) => {
      if (!br.exploded && Math.hypot(br.x - x, br.z - z) <= 7.6) {
        br.fuseTimer = 0.12;
      }
    });
  }

  private performRoll(): void {
    if (this.state !== 'playing' || this.inspectMode) return;
    const u = this.getActiveUnit();
    if (!u || u.rollCd > 0 || u.rollTimer > 0) return;
    let ix = 0;
    let iz = 0;
    if (this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp')) iz -= 1;
    if (this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown')) iz += 1;
    if (this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft')) ix -= 1;
    if (this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight')) ix += 1;

    let wx: number;
    let wz: number;
    if (ix !== 0 || iz !== 0) {
      const len = Math.hypot(ix, iz);
      const nx = ix / len;
      const nz = iz / len;
      const c = Math.cos(this.camYaw);
      const s = Math.sin(this.camYaw);
      wx = nx * c + nz * s;
      wz = -nx * s + nz * c;
    } else {
      wx = Math.sin(u.yaw);
      wz = Math.cos(u.yaw);
    }

    u.rollVx = wx * 19.5;
    u.rollVz = wz * 19.5;
    u.rollTimer = 0.27;
    u.rollCd = 1.25;
    this.rollBufferTimer = 0;
    this.audio.play('roll');
    this.spawnBurst(u.x, 0.35, u.z, 0x4ce0e8, 6, 4.2, 0.24);
  }

  private getActiveUnit(): SquadMember | null {
    const u = this.squad[this.activeIdx];
    if (u && !u.down) return u;
    const alive = this.squad.find((m) => !m.down);
    if (alive) {
      this.activeIdx = alive.id;
      return alive;
    }
    return null;
  }

  private castLaserLength(u: SquadMember, maxDist: number): number {
    const sin = Math.sin(u.yaw);
    const cos = Math.cos(u.yaw);
    const ox = u.x + cos * u.vis.gunOffX + sin * u.vis.gunOffZ;
    const oz = u.z - sin * u.vis.gunOffX + cos * u.vis.gunOffZ;
    let best = maxDist;
    for (let step = 1; step <= 24; step++) {
      const d = (maxDist * step) / 24;
      if (isPointInsideTallWall(ox + sin * d, oz + cos * d, this.world.colliders)) {
        best = d;
        break;
      }
    }
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.dying || e.hp <= 0) continue;
      const vx = e.x - ox;
      const vz = e.z - oz;
      const proj = vx * sin + vz * cos;
      if (proj > 0 && proj < best) {
        const perp = Math.abs(vx * cos - vz * sin);
        if (perp <= e.r + 0.16) best = proj;
      }
    }
    return best;
  }

  // =========================================================================
  // MAIN SIMULATION & RENDERING LOOP (SOFTWARE-WEBGL PACED)
  // =========================================================================

  private scheduleNextFrame(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(() => this.tick());
    } else {
      this.frameId = requestAnimationFrame(() => this.tick());
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const st = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (st === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 6);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 6);
    } else {
      this.frameId = window.setTimeout(cb, 80);
    }
  }

  private tick(): void {
    if (this.disposed) return;
    const now = performance.now();
    const realDt = clampDelta((now - this.lastTime) / 1000);
    this.lastTime = now;

    this.updateAmbientVisuals(realDt, now * 0.001);

    if (this.state === 'title') {
      this.updateTitleTour(realDt);
    } else if (this.state === 'playing') {
      if (this.hitstopTimer > 0) {
        this.hitstopTimer = Math.max(0, this.hitstopTimer - realDt);
        this.trauma = Math.max(0, this.trauma - realDt * 2.1);
        this.updateCamera(realDt, this.getActiveUnit());
      } else {
        this.updateGameplay(realDt, now * 0.001);
      }
    } else if (this.state === 'defeat' || this.state === 'victory') {
      this.updateParticles(realDt);
      this.updateCamera(realDt, null);
    }

    this.renderFrame();
    this.scheduleNextFrame();
  }

  private updateAmbientVisuals(dt: number, tSec: number): void {
    // Flashing van lightbar, red floodlight pulse, rotating coastal lighthouse beam
    this.world.sirenSprites.forEach((s, i) => {
      const alt = Math.sin(tSec * 11 + i) > 0;
      s.red.material.opacity = alt ? 0.95 : 0.12;
      s.blue.material.opacity = alt ? 0.12 : 0.95;
    });
    this.world.floodHalo.material.opacity = 0.64 + Math.sin(tSec * 3.4) * 0.24;
    this.world.lighthouseBeam.rotation.y = tSec * 0.65;

    // Parking B1 Emergency Generator flywheel & beacon animation
    const gen = this.world.b1Generator;
    const spinSpeed = this.b1GeneratorActive ? 9.5 : this.b1GeneratorInRange ? 4.8 : 0.75;
    gen.rotor.rotation.x += dt * spinSpeed;
    const genPulse = this.b1GeneratorActive
      ? 0.85 + Math.sin(tSec * 6.5) * 0.12
      : 0.55 + Math.sin(tSec * 4.2) * 0.25;
    gen.beaconHalo.material.opacity = genPulse;
    if (!this.b1GeneratorActive) {
      gen.captureRingMat.opacity = 0.48 + Math.sin(tSec * 4.2) * 0.24;
    }

    // 1980s Neon Signage Ballast Hum & Micro-Flicker
    for (let i = 0; i < this.world.neonFlickers.length; i++) {
      const nf = this.world.neonFlickers[i];
      const mult = computeNeonFlickerIntensity(tSec, nf.phase, nf.style);
      nf.mat.emissiveIntensity = nf.baseEmissive * mult;
      if (nf.halo) {
        nf.halo.material.opacity = nf.baseHaloOpacity * mult;
      }
    }

    // Rising Volumetric Street-Vent Steam Plumes (zero-GC pool!)
    if (this.world.steamVents.length > 0) {
      for (let i = 0; i < this.steamPuffs.length; i++) {
        const sp = this.steamPuffs[i];
        sp.age += dt;
        if (sp.age >= sp.maxAge) {
          sp.age -= sp.maxAge;
        }
        const p = sp.age / sp.maxAge;
        const vent = this.world.steamVents[sp.ventIdx];
        const sway = Math.sin(tSec * 1.4 + i * 1.1) * 0.22 * p;
        sp.sprite.position.set(
          vent.x + sp.driftX * sp.age + sway,
          0.32 + sp.riseSpeed * sp.age,
          vent.z + sp.driftZ * sp.age,
        );
        const sc = sp.baseScale * (0.65 + p * 1.85);
        sp.sprite.scale.set(sc, sc * 0.92, 1);
        sp.sprite.material.opacity = Math.sin(p * Math.PI) * 0.32;
      }
    }

    // Rain streaks
    const rp = this.rainGeo.attributes.position.array as Float32Array;
    for (let i = 0; i < RAIN_COUNT; i++) {
      const v = this.rainVel[i] * dt;
      rp[i * 6 + 1] -= v;
      rp[i * 6 + 4] -= v;
      rp[i * 6] -= v * 0.14;
      rp[i * 6 + 3] -= v * 0.14;
      if (rp[i * 6 + 1] < 0) {
        const rx = this.camTarget.x + (Math.random() - 0.5) * 56;
        const rz = this.camTarget.z + (Math.random() - 0.5) * 56;
        const ry = 17 + Math.random() * 9;
        rp[i * 6] = rx;
        rp[i * 6 + 1] = ry;
        rp[i * 6 + 2] = rz;
        rp[i * 6 + 3] = rx - 0.22;
        rp[i * 6 + 4] = ry - 1.35;
        rp[i * 6 + 5] = rz + 0.12;
      }
    }
    this.rainGeo.attributes.position.needsUpdate = true;

    // Drifting Sakura petals
    for (const p of this.petals) {
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += dt * 2.2;
      p.mesh.rotation.y += dt * 1.6;
      if (p.mesh.position.y < 0.1) {
        p.mesh.position.set(-18 + Math.random() * 6, 4.8 + Math.random() * 2, -22 + Math.random() * 5);
      }
    }

    if (this.flashLight.intensity > 0) {
      this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 32);
    }

    // Flicker foreground road flares even on Title Screen!
    if (this.flares.length > 0) {
      const last = this.flares[this.flares.length - 1];
      this.flareLight.position.set(last.x, 1.2, last.z);
      this.flareLight.intensity = 3.4 + Math.sin(tSec * 27) * 0.5 + Math.random() * 0.6;
      if (Math.random() < 0.25) {
        this.spawnBurst(last.x, 0.35, last.z, 0xff5a72, 1, 1.8, 0.42);
      }
    } else {
      this.flareLight.intensity = 0;
    }

    this.updateParticles(dt);
  }

  private updateTitleTour(dt: number): void {
    // Wide cinematic dolly showcasing the full concept-art vista:
    // City Pop billboard + マルフジ商店 (west), grounded archway, Café + water tower, arcade + skyline moon
    this.titleTourAngle += dt * 0.13;
    const yaw = -0.2 + Math.sin(this.titleTourAngle) * 0.14;
    const pitch = 0.25 + Math.sin(this.titleTourAngle * 0.7) * 0.03;
    const dist = 33.0;
    const targetX = -4.6 + Math.cos(this.titleTourAngle * 0.6) * 1.3;
    const targetY = 4.6;
    const targetZ = 0.4;

    const horiz = Math.cos(pitch) * dist;
    const vert = Math.sin(pitch) * dist;
    this.camera.position.set(
      targetX + Math.sin(yaw) * horiz,
      targetY + vert,
      targetZ + Math.cos(yaw) * horiz,
    );
    this.camera.lookAt(targetX, targetY, targetZ);
  }

  private updateGameplay(dt: number, tSec: number): void {
    if (this.keysHeld.has('KeyQ')) this.camYaw += 1.45 * dt;
    if (this.keysHeld.has('KeyE')) this.camYaw -= 1.45 * dt;

    // Free Camera Inspect Mode [V]
    if (this.inspectMode) {
      let ix = 0;
      let iz = 0;
      if (this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp')) iz -= 1;
      if (this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown')) iz += 1;
      if (this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft')) ix -= 1;
      if (this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight')) ix += 1;
      if (ix !== 0 || iz !== 0) {
        const c = Math.cos(this.camYaw);
        const s = Math.sin(this.camYaw);
        this.camTarget.x += (ix * c + iz * s) * 15 * dt;
        this.camTarget.z += (-ix * s + iz * c) * 15 * dt;
      }
      this.updateCamera(dt, null);
      return;
    }

    // Handle defeat final dramatic beat
    if (this.defeatBeatTimer > 0) {
      this.defeatBeatTimer -= dt;
      this.updateCamera(dt, null);
      if (this.defeatBeatTimer <= 0) {
        this.finishRun(false);
      }
      return;
    }

    this.timeElapsed += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.9);
    if (this.rallyBuffTimer > 0) this.rallyBuffTimer = Math.max(0, this.rallyBuffTimer - dt);
    if (this.rollBufferTimer > 0) {
      this.rollBufferTimer = Math.max(0, this.rollBufferTimer - dt);
      const active = this.getActiveUnit();
      if (active && active.rollCd <= 0 && active.rollTimer <= 0) {
        this.performRoll();
      }
    }

    const leader = this.getActiveUnit();
    if (!leader) {
      this.defeatBeatTimer = 0.55;
      this.addTrauma(0.6);
      return;
    }

    // Screen-to-world aim projection
    this.raycaster.setFromCamera(this.mouseNDC, this.camera);
    this.raycaster.ray.intersectPlane(this.aimPlane, this.aimPoint);
    this.aimReticle.position.set(this.aimPoint.x, 0.06, this.aimPoint.z);

    // Leader movement or dodge roll
    if (leader.rollTimer > 0) {
      leader.rollTimer = Math.max(0, leader.rollTimer - dt);
      leader.x += leader.rollVx * dt;
      leader.z += leader.rollVz * dt;
    } else {
      let ix = 0;
      let iz = 0;
      if (this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp')) iz -= 1;
      if (this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown')) iz += 1;
      if (this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft')) ix -= 1;
      if (this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight')) ix += 1;
      if (ix !== 0 || iz !== 0) {
        const len = Math.hypot(ix, iz);
        const nx = ix / len;
        const nz = iz / len;
        const c = Math.cos(this.camYaw);
        const s = Math.sin(this.camYaw);
        const boost = this.rallyBuffTimer > 0 ? 1.24 : 1.0;
        leader.x += (nx * c + nz * s) * leader.speed * boost * dt;
        leader.z += (-nx * s + nz * c) * leader.speed * boost * dt;
      }
    }

    const lastB = this.leaderTrail[this.leaderTrail.length - 1];
    if (!lastB || Math.hypot(leader.x - lastB.x, leader.z - lastB.z) > 1.4) {
      this.leaderTrail.push({ x: leader.x, z: leader.z });
      if (this.leaderTrail.length > 35) this.leaderTrail.shift();
    }

    // Update Squad
    for (let idx = 0; idx < this.squad.length; idx++) {
      const u = this.squad[idx];
      const isActive = idx === this.activeIdx;
      if (u.skillCd > 0) u.skillCd = Math.max(0, u.skillCd - dt);
      if (u.fireCd > 0) u.fireCd = Math.max(0, u.fireCd - dt);
      if (u.rollCd > 0) u.rollCd = Math.max(0, u.rollCd - dt);
      if (u.recoil > 0) u.recoil = Math.max(0, u.recoil - dt * 5.5);
      if (u.overchargeTimer > 0) u.overchargeTimer = Math.max(0, u.overchargeTimer - dt);

      // Active Reload progression
      if (u.reloading && !u.down) {
        u.reloadElapsed += dt;
        if (u.reloadElapsed >= u.reloadTime) {
          u.reloading = false;
          u.reloadJammed = false;
          u.reloadAttempted = false;
          u.reloadElapsed = 0;
          u.magAmmo = u.magMax;
          if (isActive) {
            this.audio.play('switchUnit');
            this.emitHud();
          }
        }
      }

      // Trailing damage ghost HP smooth drain
      if (u.ghostHp > u.hp) {
        u.ghostHp = Math.max(u.hp, u.ghostHp - dt * 42);
      } else {
        u.ghostHp = u.hp;
      }

      if (u.flashT > 0) {
        u.flashT = Math.max(0, u.flashT - dt);
        u.vis.muzzleFlash.material.opacity = u.flashT / 0.06;
      }

      (u.vis.ring.material as THREE.MeshBasicMaterial).opacity = isActive ? 0.92 : 0.24;
      u.vis.ring.scale.setScalar(isActive ? 1.15 : 0.9);
      u.vis.laser.visible = !u.down;
      u.vis.laserDot.visible = !u.down;

      if (u.down) {
        u.vis.bodyPivot.rotation.x = Math.PI / 2;
        u.vis.group.position.set(u.x, 0.24, u.z);
        continue;
      }

      const px = u.x;
      const pz = u.z;
      if (!isActive) {
        const anchorX = this.stance === 'hold' && this.holdAnchor ? this.holdAnchor.x : leader.x;
        const anchorZ = this.stance === 'hold' && this.holdAnchor ? this.holdAnchor.z : leader.z;
        const sx = anchorX + u.offset.x;
        const sz = anchorZ + u.offset.z;
        let gx = sx;
        let gz = sz;
        if (this.stance !== 'hold' && !hasLineOfSight(u.x, u.z, sx, sz, this.world.colliders)) {
          for (let b = this.leaderTrail.length - 1; b >= 0; b--) {
            if (hasLineOfSight(u.x, u.z, this.leaderTrail[b].x, this.leaderTrail[b].z, this.world.colliders)) {
              gx = this.leaderTrail[b].x;
              gz = this.leaderTrail[b].z;
              break;
            }
          }
        }
        const dx = gx - u.x;
        const dz = gz - u.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.72) {
          const spd = Math.min(d * 5.2, u.speed * (d > 6.5 ? 1.3 : 1.0) * (this.rallyBuffTimer > 0 ? 1.2 : 1.0));
          u.x += (dx / d) * spd * dt;
          u.z += (dz / d) * spd * dt;
        }
      }

      // Soft squadmate separation
      for (const o of this.squad) {
        if (o === u || o.down) continue;
        const dx = u.x - o.x;
        const dz = u.z - o.z;
        const d = Math.hypot(dx, dz);
        const minD = u.r + o.r + 0.35;
        if (d > 0.01 && d < minD) {
          const push = (minD - d) * 0.45;
          u.x += (dx / d) * push;
          u.z += (dz / d) * push;
        }
      }

      for (let pass = 0; pass < 2; pass++) {
        for (let c = 0; c < this.world.colliders.length; c++) {
          resolveCircleBox(u, this.world.colliders[c]);
        }
      }

      // Acid pool hazard check
      if (u.rollTimer <= 0) {
        for (let a = 0; a < this.acidPools.length; a++) {
          const pool = this.acidPools[a];
          if (Math.hypot(u.x - pool.x, u.z - pool.z) < pool.r) {
            u.hp -= 16 * dt;
            if (u.hp <= 0) {
              u.hp = 0;
              u.down = true;
              this.audio.play('playerHurt');
              this.pushToast(`${u.name} РАНЕН! НУЖЕН МЕД-МАЯК [2]`, '#ff3b52');
            }
          }
        }
      }

      // Aiming & Stance-Aware AI target acquisition
      let aiTarget: EnemyEntity | null = null;
      if (isActive) {
        u.yaw = Math.atan2(this.aimPoint.x - u.x, this.aimPoint.z - u.z);
      } else {
        const visibleCandidates: TargetCandidate[] = [];
        for (let i = 0; i < this.enemies.length; i++) {
          const e = this.enemies[i];
          if (e.dying || e.hp <= 0) continue;
          const d = Math.hypot(e.x - u.x, e.z - u.z);
          if (d < u.range && hasLineOfSight(u.x, u.z, e.x, e.z, this.world.colliders)) {
            visibleCandidates.push({
              id: i,
              x: e.x,
              z: e.z,
              boss: e.boss,
              ranged: e.ranged,
              armor: e.armor,
            });
          }
        }
        const pickedIdx = selectPriorityTarget(
          u.x,
          u.z,
          this.aimPoint.x,
          this.aimPoint.z,
          this.stance,
          visibleCandidates,
        );
        aiTarget = pickedIdx !== null ? this.enemies[pickedIdx] : null;
        u.yaw = aiTarget
          ? Math.atan2(aiTarget.x - u.x, aiTarget.z - u.z)
          : Math.atan2(this.aimPoint.x - u.x, this.aimPoint.z - u.z);
      }

      // Clipped 3D laser sight
      const lLen = this.castLaserLength(u, isActive ? 22 : 14);
      const lPos = u.vis.laser.geometry.attributes.position.array as Float32Array;
      lPos[5] = u.vis.gunOffZ + lLen;
      u.vis.laser.geometry.attributes.position.needsUpdate = true;
      u.vis.laserDot.position.set(u.vis.gunOffX, 1.16, u.vis.gunOffZ + lLen);

      // Firing (with Magazine, Auto-Reload, Overcharge, Stance Bonuses & Spatial Panning!)
      const wantsFire = (isActive && this.mouseDown && u.rollTimer <= 0) || (!isActive && aiTarget !== null);
      if (wantsFire && !u.reloading && u.fireCd <= 0) {
        if (u.magAmmo <= 0) {
          this.startUnitReload(u, isActive);
        } else {
          u.magAmmo--;
          const genMult = this.b1GeneratorActive ? B1_GENERATOR.fireRateBoost : 1.0;
          const focusMult = !isActive && this.stance === 'focus' ? 0.85 : 1.0;
          u.fireCd = u.fireRate * (this.rallyBuffTimer > 0 ? 0.62 : 1.0) * genMult * focusMult;
          u.flashT = 0.06;
          u.recoil = 0.14;
          const isOvercharged = u.overchargeTimer > 0;
          const shotDmg = isOvercharged ? Math.round(u.dmg * ACTIVE_RELOAD_OVERCHARGE_MULT) : u.dmg;
          const spreadMult = !isActive && this.stance === 'hold' ? 0.72 : 1.0;
          const ang = u.yaw + (Math.random() - 0.5) * u.spread * spreadMult;
          const spd = u.role === 'sniper' ? 54 : 42;
          const bx = u.x + Math.sin(ang) * 1.15;
          const bz = u.z + Math.cos(ang) * 1.15;
          const bMesh = new THREE.Mesh(
            this.bulletGeo,
            new THREE.MeshBasicMaterial({ color: isOvercharged ? 0xffe478 : u.hex }),
          );
          bMesh.position.set(bx, 1.16, bz);
          bMesh.rotation.y = ang;
          this.scene.add(bMesh);
          this.projectiles.push({
            kind: 'bullet',
            x: bx,
            y: 1.16,
            z: bz,
            vx: Math.sin(ang) * spd,
            vz: Math.cos(ang) * spd,
            sx: bx,
            sz: bz,
            tx: bx,
            tz: bz,
            t: 0,
            dur: 1,
            dmg: shotDmg,
            life: u.range / spd,
            pierce: u.role === 'sniper' || isOvercharged,
            mesh: bMesh,
          });
          // Eject brass shell casing spark to right of weapon breech
          this.spawnBurst(
            u.x + Math.cos(ang) * 0.45,
            1.22,
            u.z - Math.sin(ang) * 0.45,
            0xeab52d,
            1,
            2.8,
            0.22,
          );
          this.flashLight.color.setHex(isOvercharged ? 0xffe478 : u.hex);
          this.flashLight.position.set(bx, 1.4, bz);
          this.flashLight.intensity = 3.2;
          this.playSpatial(
            u.role === 'sniper'
              ? 'sniper'
              : u.role === 'heavy'
                ? 'heavy'
                : u.role === 'medic'
                  ? 'smg'
                  : 'rifle',
            u.x,
            u.z,
            isActive ? 1.0 : 0.72,
          );
          if (u.magAmmo === 0) {
            this.startUnitReload(u, isActive);
          }
          // Alert nearby enemies on gunfire
          for (const e of this.enemies) {
            if (!e.awake && Math.hypot(e.x - u.x, e.z - u.z) < 22) e.awake = true;
          }
        }
      }

      // Gait-synced animation & roll squash-stretch
      const moved = Math.hypot(u.x - px, u.z - pz);
      u.vis.group.position.set(u.x, u.rollTimer > 0 ? 0.42 : 0, u.z);
      u.vis.group.rotation.y = u.yaw;
      if (u.rollTimer > 0) {
        u.vis.bodyPivot.rotation.x = (1 - u.rollTimer / 0.27) * Math.PI * 2;
        u.vis.bodyPivot.scale.set(1.12, 0.86, 1.12);
      } else {
        u.vis.bodyPivot.rotation.x = -u.recoil;
        u.vis.bodyPivot.scale.set(1, 1, 1);
      }

      if (moved > 0.004 && u.rollTimer <= 0) {
        u.stridePhase += moved * 3.8;
        const sw = Math.sin(u.stridePhase) * 0.56;
        u.vis.legL.rotation.x = sw;
        u.vis.legR.rotation.x = -sw;
      } else {
        u.vis.legL.rotation.x *= 0.8;
        u.vis.legR.rotation.x *= 0.8;
      }

      if (u.glbInstance) {
        u.glbInstance.setIntent(u.flashT > 0 ? 'attack' : moved > 0.008 ? 'move' : 'idle');
        u.glbInstance.update(dt);
      }
    }

    // Pickups
    for (const pk of this.pickups) {
      if (pk.taken) continue;
      pk.mesh.rotation.y += dt * 1.8;
      pk.mesh.position.y = 0.6 + Math.sin(tSec * 3.2) * 0.14;
      if (Math.hypot(leader.x - pk.x, leader.z - pk.z) < 2.3) {
        pk.taken = true;
        this.scene.remove(pk.mesh);
        this.audio.play('pickup');
        this.pushToast(pk.label, pk.kind === 'vinyl' ? '#f45b8a' : '#6ee782');
        if (pk.kind === 'medkit') {
          this.squad.forEach((m) => {
            m.down = false;
            m.hp = m.maxHp;
            m.ghostHp = m.maxHp;
          });
        } else if (pk.kind === 'vinyl') {
          this.flareAmmo += 1;
          this.spawnBurst(pk.x, 1.0, pk.z, 0xf45b8a, 14, 6.8, 0.45);
          this.squad.forEach((m) => {
            if (!m.down) {
              m.magAmmo = m.magMax;
              m.reloading = false;
              m.overchargeTimer = Math.max(m.overchargeTimer, 8.0);
            }
          });
        } else {
          this.flareAmmo += 2;
          this.squad.forEach((m) => {
            if (!m.down) m.hp = Math.min(m.maxHp, m.hp + 55);
          });
        }
        this.emitHud();
      }
    }

    // Interactive Rechargeable Ammo Supply Crates
    for (const crate of this.ammoCrates) {
      if (crate.cooldown > 0) {
        crate.cooldown = Math.max(0, crate.cooldown - dt);
        crate.vis.beacon.visible = false;
        crate.vis.stripMat.emissiveIntensity = 0.15;
        crate.vis.ringMat.opacity = 0.14;
      } else {
        crate.vis.beacon.visible = true;
        crate.vis.beacon.rotation.y += dt * 2.4;
        crate.vis.beacon.position.y = 1.46 + Math.sin(tSec * 3.4) * 0.12;
        crate.vis.stripMat.emissiveIntensity = 1.35 + Math.sin(tSec * 4.5) * 0.25;
        crate.vis.ringMat.opacity = 0.55 + Math.sin(tSec * 4.0) * 0.15;
        if (Math.hypot(leader.x - crate.x, leader.z - crate.z) <= AMMO_CRATE_PICKUP_RADIUS) {
          crate.cooldown = AMMO_CRATE_COOLDOWN_SEC;
          this.flareAmmo = Math.min(MAX_FLARE_AMMO, this.flareAmmo + 1);
          this.squad.forEach((m) => {
            m.magAmmo = m.magMax;
            m.reloading = false;
            m.reloadJammed = false;
            m.reloadElapsed = 0;
            m.skillCd = Math.max(0, m.skillCd - m.skillMaxCd * 0.25);
          });
          this.playSpatial('ammoCrate', crate.x, crate.z, 1.0);
          this.spawnBurst(crate.x, 1.1, crate.z, 0x4ce0e8, 14, 5.2, 0.45);
          this.spawnDamagePopup(crate.x, 2.2, crate.z, '+ПАТРОНЫ +1 ШАШКА', '#4ce0e8', 1.65);
          this.pushToast(`ЯЩИК БОЕПРИПАСОВ (${crate.zoneLabel}): МАГАЗИНЫ +1 ШАШКА`, '#4ce0e8');
          this.emitHud();
        }
      }
    }

    // Animate Hold Beacon & Focus Fire Target Ring
    if (this.holdBeacon.group.visible) {
      this.holdBeacon.core.rotation.y += dt * 2.2;
      this.holdBeacon.core.position.y = 1.05 + Math.sin(tSec * 3.8) * 0.12;
      this.holdBeacon.ringMat.opacity = 0.55 + Math.sin(tSec * 4.2) * 0.18;
    }
    if (this.stance === 'focus' && !this.inspectMode) {
      const focusCands: TargetCandidate[] = [];
      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i];
        if (!e.dying && e.hp > 0) {
          focusCands.push({ id: i, x: e.x, z: e.z, boss: e.boss, ranged: e.ranged, armor: e.armor });
        }
      }
      const fIdx = selectPriorityTarget(
        leader.x,
        leader.z,
        this.aimPoint.x,
        this.aimPoint.z,
        'focus',
        focusCands,
      );
      if (fIdx !== null) {
        const fe = this.enemies[fIdx];
        this.focusTargetRing.visible = true;
        this.focusTargetRing.position.set(fe.x, 0.08, fe.z);
        const s = (fe.boss ? 1.7 : 1.0) * (1 + Math.sin(tSec * 8) * 0.08);
        this.focusTargetRing.scale.set(s, s, 1);
      } else {
        this.focusTargetRing.visible = false;
      }
    } else {
      this.focusTargetRing.visible = false;
    }

    // Parking B1 Interactive Emergency Power Generator
    const distGen = Math.hypot(leader.x - B1_GENERATOR.x, leader.z - B1_GENERATOR.z);
    this.b1GeneratorInRange = distGen <= B1_GENERATOR.r;
    const genStep = updateGeneratorCharge(
      this.b1GeneratorProgress,
      this.b1GeneratorInRange,
      dt,
      this.b1GeneratorActive,
    );
    this.b1GeneratorProgress = genStep.progress;
    const genVis = this.world.b1Generator;
    if (!this.b1GeneratorActive) {
      genVis.progressArc.visible = this.b1GeneratorProgress > 0.02;
      genVis.progressArc.scale.setScalar(Math.max(0.05, this.b1GeneratorProgress));
    }
    if (genStep.activatedNow) {
      this.activateB1Generator();
    }

    // Med Beacons
    if (this.medBeacons.length > 0) {
      this.medLight.position.set(this.medBeacons[0].x, 1.5, this.medBeacons[0].z);
      this.medLight.intensity = 2.6 + Math.sin(tSec * 8) * 0.6;
    } else {
      this.medLight.intensity = 0;
    }
    for (let i = this.medBeacons.length - 1; i >= 0; i--) {
      const mb = this.medBeacons[i];
      mb.life -= dt;
      mb.tick += dt;
      mb.mesh.rotation.y += dt * 1.5;
      if (mb.tick >= 0.5) {
        mb.tick = 0;
        this.squad.forEach((m) => {
          if (Math.hypot(m.x - mb.x, m.z - mb.z) <= mb.r) {
            if (m.down) {
              m.down = false;
              m.hp = Math.round(m.maxHp * 0.55);
            } else {
              m.hp = Math.min(m.maxHp, m.hp + 14);
            }
          }
        });
      }
      if (mb.life <= 0) {
        this.scene.remove(mb.mesh);
        this.medBeacons.splice(i, 1);
      }
    }

    // Flares lifetime
    for (let i = this.flares.length - 1; i >= 0; i--) {
      const f = this.flares[i];
      f.life -= dt;
      f.halo.scale.setScalar(3.8 + Math.random() * 0.8);
      if (f.life <= 0) {
        this.scene.remove(f.mesh);
        this.scene.remove(f.halo);
        this.scene.remove(f.refl);
        this.flares.splice(i, 1);
      }
    }

    // Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const b = this.projectiles[i];
      if (b.kind === 'grenade') {
        b.t += dt;
        const p = Math.min(1, b.t / b.dur);
        b.x = b.sx + (b.tx - b.sx) * p;
        b.z = b.sz + (b.tz - b.sz) * p;
        b.y = 1.3 * (1 - p) + 4.8 * 4 * p * (1 - p) + 0.25;
        b.mesh.position.set(b.x, b.y, b.z);
        if (p >= 1 || isPointInsideTallWall(b.x, b.z, this.world.colliders)) {
          this.explodeGrenade(b.x, b.z);
          this.scene.remove(b.mesh);
          this.projectiles.splice(i, 1);
        }
        continue;
      }

      b.x += b.vx * dt;
      b.z += b.vz * dt;
      b.life -= dt;
      b.mesh.position.set(b.x, b.kind === 'acid' ? 0.92 : 1.16, b.z);

      if (b.kind === 'acid') {
        if (b.life <= 0 || isPointInsideTallWall(b.x, b.z, this.world.colliders)) {
          const pm = new THREE.Mesh(
            new THREE.CircleGeometry(1.9, 18),
            new THREE.MeshBasicMaterial({ color: 0x6ee750, transparent: true, opacity: 0.48 }),
          );
          pm.rotation.x = -Math.PI / 2;
          pm.position.set(b.x, 0.055, b.z);
          this.scene.add(pm);
          this.acidPools.push({ x: b.x, z: b.z, r: 1.9, life: 5.2, mesh: pm });
          this.scene.remove(b.mesh);
          this.projectiles.splice(i, 1);
          continue;
        }
        for (const u of this.squad) {
          if (!u.down && u.rollTimer <= 0 && Math.hypot(u.x - b.x, u.z - b.z) < u.r + 0.42) {
            u.hp = Math.max(0, u.hp - 14);
            this.audio.play('playerHurt');
            if (u.hp <= 0) {
              u.down = true;
              this.pushToast(`${u.name} РАНЕН!`, '#ff3b52');
            }
            this.scene.remove(b.mesh);
            this.projectiles.splice(i, 1);
            break;
          }
        }
        continue;
      }

      if (b.life <= 0 || isPointInsideTallWall(b.x, b.z, this.world.colliders)) {
        this.spawnBurst(b.x, 1.15, b.z, 0xf5b971, 2, 4, 0.16);
        this.scene.remove(b.mesh);
        this.projectiles.splice(i, 1);
        continue;
      }

      let hitAnything = false;
      for (let j = 0; j < this.enemies.length; j++) {
        const e = this.enemies[j];
        if (e.dying || e.hp <= 0) continue;
        if (Math.hypot(e.x - b.x, e.z - b.z) <= e.r + 0.36) {
          const vlen = Math.hypot(b.vx, b.vz) || 1;
          this.damageEnemy(e, b.dmg, b.pierce, b.vx / vlen, b.vz / vlen, b.pierce && b.dmg >= 26);
          this.scene.remove(b.mesh);
          this.projectiles.splice(i, 1);
          hitAnything = true;
          break;
        }
      }
      if (hitAnything) continue;

      for (let k = 0; k < this.barrels.length; k++) {
        const br = this.barrels[k];
        if (br.exploded) continue;
        if (Math.hypot(br.x - b.x, br.z - b.z) <= br.r + 0.35) {
          this.damageBarrel(br, b.dmg);
          this.scene.remove(b.mesh);
          this.projectiles.splice(i, 1);
          break;
        }
      }
    }

    for (let i = this.acidPools.length - 1; i >= 0; i--) {
      this.acidPools[i].life -= dt;
      (this.acidPools[i].mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(
        0.48,
        this.acidPools[i].life * 0.4,
      );
      if (this.acidPools[i].life <= 0) {
        this.scene.remove(this.acidPools[i].mesh);
        this.acidPools.splice(i, 1);
      }
    }

    // Update Enemies (Distinct AI Policies + Visible Telegraphs + Attack Token Pool + KO Topple!)
    let activeMeleeAttackers = 0;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];

      // KO topple / knockback transition before cleanup
      if (e.dying) {
        e.koTimer -= dt;
        e.x += e.koVx * dt;
        e.z += e.koVz * dt;
        e.koVx *= 0.88;
        e.koVz *= 0.88;
        const p = 1 - Math.max(0, e.koTimer / 0.36);
        e.vis.group.position.set(e.x, 0.12 * (1 - p), e.z);
        e.vis.group.rotation.x = -p * (Math.PI / 2);
        e.vis.group.scale.setScalar(Math.max(0.05, 1 - p * 0.45));
        if (e.glbInstance) {
          e.glbInstance.setIntent('death');
          e.glbInstance.update(dt);
        }
        if (e.koTimer <= 0) {
          e.glbInstance?.dispose();
          this.scene.remove(e.vis.group);
          this.enemies.splice(i, 1);
        }
        continue;
      }

      if (e.hitFlash > 0) {
        e.hitFlash = Math.max(0, e.hitFlash - dt);
        e.vis.bodyMat.emissive.setHex(e.hitFlash > 0 ? 0xffffff : 0x000000);
        e.vis.bodyMat.emissiveIntensity = e.hitFlash > 0 ? 0.72 : 0;
      }
      if (e.atkCd > 0) e.atkCd = Math.max(0, e.atkCd - dt);
      if (e.specialCd > 0) e.specialCd = Math.max(0, e.specialCd - dt);
      if (e.steerTimer > 0) e.steerTimer = Math.max(0, e.steerTimer - dt);

      let target: SquadMember | null = null;
      let minD = Infinity;
      for (const u of this.squad) {
        if (u.down) continue;
        const d = Math.hypot(u.x - e.x, u.z - e.z);
        if (d < minD) {
          minD = d;
          target = u;
        }
      }
      if (!target) continue;

      if (!e.awake && ((minD < 24 && hasLineOfSight(e.x, e.z, target.x, target.z, this.world.colliders)) || minD < 12)) {
        e.awake = true;
      }

      let gx = target.x;
      let gz = target.z;
      let lured = false;
      for (const fl of this.flares) {
        if (fl.lure && Math.hypot(fl.x - e.x, fl.z - e.z) < 20) {
          e.awake = true;
          lured = true;
          gx = fl.x;
          gz = fl.z;
          break;
        }
      }

      if (e.awake) {
        const dx = gx - e.x;
        const dz = gz - e.z;
        const dist = Math.hypot(dx, dz) || 1;
        e.yaw = Math.atan2(dx, dz);

        // Active windup telegraph resolution (Spitter Acid Charge & Tank Ground Slam!)
        if (e.windupTimer > 0) {
          e.windupTimer -= dt;
          const progress = 1 - Math.max(0, e.windupTimer / e.windupMax);
          e.vis.telegraphRing.visible = true;
          e.vis.telegraphRing.scale.setScalar(0.45 + progress * 0.75);
          // Raise arms during windup
          e.vis.armL.rotation.x = -0.9 * progress;
          e.vis.armR.rotation.x = -1.2 * progress;

          if (e.windupTimer <= 0) {
            e.vis.telegraphRing.visible = false;
            e.vis.armL.rotation.x = 0;
            e.vis.armR.rotation.x = 0;
            if (e.policy === 'kiter') {
              const sdx = e.windupTargetX - e.x;
              const sdz = e.windupTargetZ - e.z;
              const sDist = Math.hypot(sdx, sdz) || 1;
              const spd = 15.5;
              const am = new THREE.Mesh(this.acidGeo, new THREE.MeshBasicMaterial({ color: 0x7cff57 }));
              am.position.set(e.x, 1.0, e.z);
              this.scene.add(am);
              this.projectiles.push({
                kind: 'acid',
                x: e.x,
                y: 1.0,
                z: e.z,
                vx: (sdx / sDist) * spd,
                vz: (sdz / sDist) * spd,
                sx: e.x,
                sz: e.z,
                tx: e.windupTargetX,
                tz: e.windupTargetZ,
                t: 0,
                dur: 1,
                dmg: 14,
                life: sDist / spd,
                pierce: false,
                mesh: am,
              });
            } else if (e.policy === 'charger') {
              // Tank Heavy Ground Slam shockwave!
              this.audio.play('tankSlam');
              this.addTrauma(0.75);
              this.hitstopTimer = Math.max(this.hitstopTimer, 0.045);
              this.spawnBurst(e.x, 0.5, e.z, 0xff3b52, 18, 10, 0.45);
              const slamMat = new THREE.MeshBasicMaterial({
                color: 0xff3b52,
                transparent: true,
                opacity: 0.9,
                side: THREE.DoubleSide,
              });
              const slamRing = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.1, 24), slamMat);
              slamRing.rotation.x = -Math.PI / 2;
              slamRing.position.set(e.x, 0.12, e.z);
              this.scene.add(slamRing);
              this.fxList.push({
                kind: 'ring',
                mesh: slamRing,
                mat: slamMat,
                maxScale: 4.8,
                life: 0.3,
                maxLife: 0.3,
              });
              for (const u of this.squad) {
                if (u.down || u.rollTimer > 0) continue;
                const dSlam = Math.hypot(u.x - e.x, u.z - e.z);
                if (dSlam < 4.5 + u.r) {
                  u.hp = Math.max(0, u.hp - e.dmg);
                  this.audio.play('playerHurt');
                  if (u.hp <= 0) {
                    u.down = true;
                    this.pushToast(`${u.name} РАНЕН УДАРОМ ТАНКА!`, '#ff3b52');
                  }
                }
              }
            }
          }
        } else {
          // Policy-specific movement & attack initiation
          const px = e.x;
          const pz = e.z;
          let moveVx = dx / dist;
          let moveVz = dz / dist;
          let shouldMove = dist > e.r + (lured ? 1.4 : target.r + 0.25);

          if (e.policy === 'kiter' && !lured) {
            // Spitter kites: backs away if too close (< 6.5m), fires telegraphed acid in sweet spot (7..16m)
            if (dist < 6.5) {
              moveVx = -dx / dist;
              moveVz = -dz / dist;
              shouldMove = true;
            } else if (dist < 16.5 && hasLineOfSight(e.x, e.z, target.x, target.z, this.world.colliders)) {
              shouldMove = false;
              if (e.specialCd <= 0) {
                e.specialCd = 3.4;
                e.windupTimer = e.windupMax;
                e.windupTargetX = target.x;
                e.windupTargetZ = target.z;
                this.audio.play('spitterCharge');
              }
            }
          } else if (e.policy === 'flanker' && !lured && dist > 3.5) {
            // Runner zig-zag flanks perpendicularly while sprinting!
            e.flankPhase += dt * 4.2;
            const side = Math.sin(e.flankPhase) * 0.62;
            const sx = -moveVz * side;
            const sz = moveVx * side;
            moveVx += sx;
            moveVz += sz;
            const ml = Math.hypot(moveVx, moveVz) || 1;
            moveVx /= ml;
            moveVz /= ml;
          } else if (e.policy === 'charger' && !lured && dist < 4.2 && e.specialCd <= 0) {
            // Tank begins telegraphed ground slam!
            shouldMove = false;
            e.specialCd = 3.2;
            e.windupTimer = e.windupMax;
            this.audio.play('tankRoar');
          }

          if (shouldMove) {
            if (e.steerTimer > 0) {
              const sx = -moveVz * e.steerDir;
              const sz = moveVx * e.steerDir;
              moveVx = moveVx * 0.35 + sx * 0.85;
              moveVz = moveVz * 0.35 + sz * 0.85;
            }
            e.x += moveVx * e.speed * dt;
            e.z += moveVz * e.speed * dt;
            let blocked = false;
            for (let pass = 0; pass < 2; pass++) {
              for (let c = 0; c < this.world.colliders.length; c++) {
                if (resolveCircleBox(e, this.world.colliders[c])) blocked = true;
              }
            }
            if (blocked && Math.hypot(e.x - px, e.z - pz) < e.speed * dt * 0.35) {
              e.steerTimer = 0.55;
            }
          }

          // Enemy-to-enemy separation
          for (let j = i - 1; j >= 0; j--) {
            const o = this.enemies[j];
            if (o.dying) continue;
            const sdx = e.x - o.x;
            const sdz = e.z - o.z;
            const sd = Math.hypot(sdx, sdz);
            const minS = e.r + o.r;
            if (sd > 0.01 && sd < minS) {
              const push = (minS - sd) * 0.4;
              e.x += (sdx / sd) * push;
              e.z += (sdz / sd) * push;
              o.x -= (sdx / sd) * push;
              o.z -= (sdz / sd) * push;
            }
          }

          // Standard melee strike gated by attack token pool!
          if (!lured && minD <= e.r + target.r + 0.55 && e.atkCd <= 0 && target.rollTimer <= 0) {
            if (e.boss || canClaimMeleeToken(activeMeleeAttackers)) {
              activeMeleeAttackers++;
              e.atkCd = e.boss ? 1.15 : 0.9;
              target.hp -= e.dmg;
              this.audio.play('playerHurt');
              this.addTrauma(e.boss ? 0.52 : 0.24);
              this.spawnBurst(target.x, 1.0, target.z, 0xff3b52, 6, 5, 0.25);
              if (target.hp <= 0) {
                target.hp = 0;
                target.down = true;
                this.pushToast(`${target.name} РАНЕН! НУЖЕН МЕД-МАЯК [2]`, '#ff3b52');
              }
            }
          }

          const moved = Math.hypot(e.x - px, e.z - pz);
          if (moved > 0.004) {
            e.stridePhase += moved * (e.type === 'runner' ? 4.2 : 3.2);
            const sw = Math.sin(e.stridePhase) * 0.54;
            e.vis.legL.rotation.x = sw;
            e.vis.legR.rotation.x = -sw;
          }
        }
      }

      if (e.glbInstance) {
        e.glbInstance.setIntent(e.windupTimer > 0 || e.atkCd > 0.65 ? 'attack' : e.awake ? 'move' : 'idle');
        e.glbInstance.update(dt);
      }

      e.vis.group.position.set(e.x, 0, e.z);
      e.vis.group.rotation.y = e.yaw;
      if (!e.boss && e.hp < e.maxHp) {
        e.vis.hpBg.visible = true;
        e.vis.hpBar.visible = true;
        e.vis.hpBg.lookAt(this.camera.position);
        e.vis.hpBar.lookAt(this.camera.position);
        e.vis.hpBar.scale.x = Math.max(0.01, e.hp / e.maxHp);
      }
    }

    // Ring & Beam FX
    for (let i = this.fxList.length - 1; i >= 0; i--) {
      const f = this.fxList[i];
      f.life -= dt;
      const a = Math.max(0, f.life / f.maxLife);
      if (f.kind === 'ring') {
        const sc = 1 + (1 - a) * f.maxScale;
        f.mesh.scale.set(sc, sc, 1);
        f.mat.opacity = a;
      } else {
        f.mat.opacity = a;
        f.mesh.scale.set(a, 1, a);
      }
      if (f.life <= 0) {
        this.scene.remove(f.mesh);
        this.fxList.splice(i, 1);
      }
    }

    // Explosive Barrel fuse timers & hit flashes
    for (let i = 0; i < this.barrels.length; i++) {
      const br = this.barrels[i];
      if (br.exploded) continue;
      if (br.hitFlash > 0) {
        br.hitFlash = Math.max(0, br.hitFlash - dt);
        br.vis.bodyMat.emissive.setHex(br.hitFlash > 0 ? 0xffbb55 : 0x3a070d);
        br.vis.bodyMat.emissiveIntensity = br.hitFlash > 0 ? 1.15 : 0.35;
      }
      if (br.fuseTimer >= 0) {
        br.fuseTimer -= dt;
        if (br.fuseTimer <= 0) {
          this.detonateBarrel(br);
        }
      }
    }

    // Update Floating 3D Damage Popups
    for (let i = 0; i < DAMAGE_POPUP_POOL_SIZE; i++) {
      const p = this.damagePopups[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        p.sprite.visible = false;
        continue;
      }
      p.y += p.vy * dt;
      p.vy *= 0.92;
      const alpha = Math.min(1, (p.life / p.maxLife) * 1.4);
      p.sprite.position.set(p.x, p.y, p.z);
      p.sprite.material.opacity = alpha;
    }

    // Phase progression
    const livingEnemiesList = this.enemies.filter((e) => !e.dying);
    const livingEnemies = livingEnemiesList.length;
    if (livingEnemies === 0 && this.enemies.length === 0) {
      if (this.phase === 1) this.spawnWave(2);
      else if (this.phase === 2) this.spawnWave(3);
    }

    // Diegetic 3D Ground Waypoint Chevron & Adaptive 3-Stem Music Intensity Sync
    const boss = livingEnemiesList.find((e) => e.boss) ?? null;
    const evacReady = this.bossDefeated && livingEnemies === 0;
    const nextMusicIntensity = computeMusicIntensity(
      this.state,
      this.phase,
      livingEnemies,
      Boolean(boss),
    );
    if (nextMusicIntensity !== this.musicIntensity) {
      this.musicIntensity = nextMusicIntensity;
      this.audio.setMusicIntensity(nextMusicIntensity);
    }
    const wp = computePriorityWaypoint(
      leader.x,
      leader.z,
      boss ? { x: boss.x, z: boss.z } : null,
      livingEnemiesList,
      evacReady,
    );
    if (wp && !this.inspectMode) {
      const wdx = wp.x - leader.x;
      const wdz = wp.z - leader.z;
      const wDist = Math.hypot(wdx, wdz);
      this.waypointChevron.group.visible = wDist > 2.2;
      this.waypointChevron.group.position.set(leader.x, 0, leader.z);
      this.waypointChevron.group.rotation.y = Math.atan2(wdx, wdz);
      this.waypointChevron.mat.color.setHex(
        wp.kind === 'evac' ? 0x4ce0e8 : wp.kind === 'boss' ? 0xff3b52 : 0xf5b971,
      );
      this.waypointChevron.mat.opacity = 0.72 + Math.sin(tSec * 6.0) * 0.2;
    } else {
      this.waypointChevron.group.visible = false;
    }

    // Dynamic Overhead Occlusion Cutaway (cleanly hides roofs & 2nd-floor decks blocking Record Shop, Courtyard, Service Passage & Parking B1)
    for (let i = 0; i < this.world.occludables.length; i++) {
      const occ = this.world.occludables[i];
      const zones = occ.extraZones ? [occ.zone, ...occ.extraZones] : [occ.zone];
      const inside = zones.some(
        (z) => leader.x >= z.x1 && leader.x <= z.x2 && leader.z >= z.z1 && leader.z <= z.z2,
      );
      const fadedOp = occ.minOpacity ?? 0.22;
      const targetOp = inside && !this.inspectMode ? fadedOp : 1.0;
      let sampleOp = targetOp;
      for (const mat of occ.materials) {
        mat.opacity += (targetOp - mat.opacity) * Math.min(1, dt * 12);
        sampleOp = mat.opacity;
      }
      if (occ.objects) {
        const show = sampleOp > 0.06;
        for (const obj of occ.objects) {
          obj.visible = show;
        }
      }
    }

    // Extraction check
    if (evacReady) {
      this.evacRing.scale.setScalar(0.96 + Math.sin(tSec * 5) * 0.06);
      if (canExtract(leader.x, leader.z, this.bossDefeated, livingEnemies)) {
        this.finishRun(true);
        return;
      }
    }

    this.updateCamera(dt, leader);

    // Throttled HUD updates (faster while active reload or generator charge bar moves!)
    const hudInterval =
      leader.reloading || (this.b1GeneratorInRange && !this.b1GeneratorActive) ? 0.04 : 0.1;
    this.hudPushAccum += dt;
    if (this.hudPushAccum >= hudInterval) {
      this.hudPushAccum = 0;
      this.emitHud();
    }
  }

  private activateB1Generator(): void {
    this.b1GeneratorActive = true;
    this.b1GeneratorProgress = 1;
    const genVis = this.world.b1Generator;
    genVis.beaconMat.color.setHex(0x4ce0e8);
    genVis.beaconMat.emissive.setHex(0x4ce0e8);
    genVis.beaconMat.emissiveIntensity = 2.2;
    genVis.beaconHalo.material.color.setHex(0x4ce0e8);
    genVis.captureRingMat.color.setHex(0x4ce0e8);
    genVis.captureRingMat.opacity = 0.85;
    genVis.progressArc.visible = true;
    genVis.progressArc.scale.setScalar(1.0);
    this.world.parkCyanLight.intensity = 5.2;

    this.audio.play('generatorOnline');
    this.addTrauma(0.55);
    this.flashLight.color.setHex(0x4ce0e8);
    this.flashLight.position.set(B1_GENERATOR.x, 2.8, B1_GENERATOR.z);
    this.flashLight.intensity = 10;
    this.spawnBurst(B1_GENERATOR.x, 1.4, B1_GENERATOR.z, 0x4ce0e8, 26, 11, 0.55);

    const empMat = new THREE.MeshBasicMaterial({
      color: 0x4ce0e8,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
    });
    const empRing = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.25, 32), empMat);
    empRing.rotation.x = -Math.PI / 2;
    empRing.position.set(B1_GENERATOR.x, 0.24, B1_GENERATOR.z);
    this.scene.add(empRing);
    this.fxList.push({
      kind: 'ring',
      mesh: empRing,
      mat: empMat,
      maxScale: B1_GENERATOR.shockRadius,
      life: 0.42,
      maxLife: 0.42,
    });

    // EMP Arc-Surge damages nearby infected around Parking B1
    this.enemies.forEach((e) => {
      if (e.dying || e.hp <= 0) return;
      const dx = e.x - B1_GENERATOR.x;
      const dz = e.z - B1_GENERATOR.z;
      const d = Math.hypot(dx, dz) || 0.01;
      if (d <= B1_GENERATOR.shockRadius) {
        this.damageEnemy(e, B1_GENERATOR.shockDamage, true, dx / d, dz / d, true);
      }
    });

    // Squad power surge: +35 HP, instant magazine refill, +2 flares, permanent +15% fire rate!
    this.flareAmmo += 2;
    this.squad.forEach((m) => {
      if (!m.down) {
        m.hp = Math.min(m.maxHp, m.hp + 35);
        m.magAmmo = m.magMax;
        m.reloading = false;
      }
    });

    this.pushToast('⚡ ГЕНЕРАТОР B1 АКТИВЕН: +15% ТЕМП ОГНЯ, +2 ШАШКИ И ЭМИ-РАЗРЯД!', '#4ce0e8');
    this.emitHud();
  }

  private updateParticles(dt: number): void {
    let dirty = false;
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      dirty = true;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        _scale.set(0, 0, 0);
        _mat4.compose(_pos.set(0, -100, 0), _quat, _scale);
        this.particleMesh.setMatrixAt(i, _mat4);
        continue;
      }
      p.vy -= 14 * dt;
      p.x += p.vx * dt;
      p.y = Math.max(0.06, p.y + p.vy * dt);
      p.z += p.vz * dt;
      const a = Math.max(0.05, p.life / p.maxLife) * p.scale;
      _pos.set(p.x, p.y, p.z);
      _scale.set(a, a, a);
      _mat4.compose(_pos, _quat, _scale);
      this.particleMesh.setMatrixAt(i, _mat4);
    }
    if (dirty) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
    }
  }

  private updateCamera(dt: number, leader: SquadMember | null): void {
    const dampT = 1 - Math.exp(-6.8 * dt);
    const dampP = 1 - Math.exp(-8.5 * dt);

    if (!this.inspectMode) {
      let tx = -2.0;
      let tz = 4.5;
      if (leader) {
        tx = leader.x + Math.max(-4.5, Math.min(4.5, (this.aimPoint.x - leader.x) * 0.28));
        tz = leader.z + Math.max(-4.5, Math.min(4.5, (this.aimPoint.z - leader.z) * 0.28));
      }
      this.camTarget.x += (tx - this.camTarget.x) * dampT;
      this.camTarget.z += (tz - this.camTarget.z) * dampT;
      this.camTarget.y += (1.5 - this.camTarget.y) * dampT;
    }

    const horiz = Math.cos(this.camPitch) * this.camDist;
    const vert = Math.sin(this.camPitch) * this.camDist;
    const dx = this.camTarget.x + Math.sin(this.camYaw) * horiz;
    const dy = this.camTarget.y + vert;
    const dz = this.camTarget.z + Math.cos(this.camYaw) * horiz;

    this.camPos.x += (dx - this.camPos.x) * dampP;
    this.camPos.y += (dy - this.camPos.y) * dampP;
    this.camPos.z += (dz - this.camPos.z) * dampP;

    const shake = this.trauma * this.trauma * 0.85;
    const sx = shake > 0.001 ? (Math.random() - 0.5) * shake : 0;
    const sy = shake > 0.001 ? (Math.random() - 0.5) * shake : 0;
    const sz = shake > 0.001 ? (Math.random() - 0.5) * shake : 0;

    this.camera.position.set(this.camPos.x + sx, this.camPos.y + sy, this.camPos.z + sz);
    this.camera.lookAt(this.camTarget.x, this.camTarget.y + 0.6, this.camTarget.z);
  }

  private finishRun(victory: boolean): void {
    this.state = victory ? 'victory' : 'defeat';
    this.clearInputs();
    this.aimReticle.visible = false;
    this.musicIntensity = 'ambient';
    this.audio.setMusicIntensity('ambient');
    const boss = this.enemies.find((e) => e.boss && !e.dying);
    const timeSeconds = Math.round(this.timeElapsed);
    const survivorsAlive = this.squad.filter((u) => !u.down).length;
    this.summary = {
      victory,
      timeSeconds,
      kills: this.kills,
      phaseReached: this.phase,
      survivorsAlive,
      bossHpPercent: boss ? Math.round((boss.hp / boss.maxHp) * 100) : 0,
      generatorActivated: this.b1GeneratorActive,
      grade: computeRunGrade(victory, timeSeconds, survivorsAlive, this.b1GeneratorActive),
    };
    this.audio.play(victory ? 'victory' : 'defeat');
    this.syncBodyState();
    this.emitHud();
  }

  // =========================================================================
  // HUD SNAPSHOTS & EVENTS
  // =========================================================================

  private syncBodyState(): void {
    const bodyState =
      this.state === 'victory' || this.state === 'defeat' ? 'gameover' : this.state;
    document.body.dataset.state = bodyState;
  }

  private pushToast(text: string, accent = '#4ce0e8'): void {
    this.toastCounter++;
    this.callbacks.onToast({ id: this.toastCounter, text, accent });
  }

  private emitHud(): void {
    const leader = this.getActiveUnit();
    const boss = this.enemies.find((e) => e.boss && !e.dying);
    const livingEnemiesList = this.enemies.filter((e) => !e.dying);
    const livingEnemies = livingEnemiesList.length;
    const barrelsRemaining = this.barrels.filter((b) => !b.exploded).length;
    const lowHpWarning = leader !== null && leader.hp / leader.maxHp <= 0.3;

    const leaderUv = leader ? worldToMinimap(leader.x, leader.z) : { u: 0.24, v: 0.84 };
    const genUv = worldToMinimap(B1_GENERATOR.x, B1_GENERATOR.z);
    const evacUv = worldToMinimap(EVAC_ZONE.x, EVAC_ZONE.z);
    const holdUv = this.holdAnchor ? worldToMinimap(this.holdAnchor.x, this.holdAnchor.z) : null;

    this.callbacks.onHudUpdate({
      state: this.state,
      phase: this.phase,
      totalPhases: 3,
      zoneName: leader ? getZoneName(leader.x, leader.z) : 'ПЕРЕКРЁСТОК А-3 // «Café / 喫茶»',
      objective: getPhaseObjective(this.phase, this.bossDefeated, this.b1GeneratorActive),
      enemiesAlive: livingEnemies,
      kills: this.kills,
      flares: this.flareAmmo,
      barrelsRemaining,
      stance: this.stance,
      musicIntensity: this.musicIntensity,
      inspectMode: this.inspectMode,
      comicOutline: this.comicOutline,
      mood: this.mood,
      muted: this.audio.isMuted(),
      musicOn: this.audio.isMusicEnabled(),
      rallyActive: this.rallyBuffTimer > 0,
      evacActive: this.bossDefeated && livingEnemies === 0,
      bossActive: Boolean(boss),
      bossHpPercent: boss ? Math.max(0, Math.round((boss.hp / boss.maxHp) * 100)) : 0,
      lowHpWarning,
      activeReload: leader
        ? {
            reloading: leader.reloading,
            progress: leader.reloading ? Math.min(1, leader.reloadElapsed / leader.reloadTime) : 0,
            sweetStart: ACTIVE_RELOAD_SWEET_START,
            sweetEnd: ACTIVE_RELOAD_SWEET_END,
            jammed: leader.reloadJammed,
            overchargeLeft: leader.overchargeTimer,
            magAmmo: leader.magAmmo,
            magMax: leader.magMax,
          }
        : {
            reloading: false,
            progress: 0,
            sweetStart: ACTIVE_RELOAD_SWEET_START,
            sweetEnd: ACTIVE_RELOAD_SWEET_END,
            jammed: false,
            overchargeLeft: 0,
            magAmmo: 0,
            magMax: 0,
          },
      generator: {
        active: this.b1GeneratorActive,
        charging: !this.b1GeneratorActive && this.b1GeneratorInRange,
        progress: this.b1GeneratorProgress,
        inRange: this.b1GeneratorInRange,
      },
      minimap: {
        leaderU: leaderUv.u,
        leaderV: leaderUv.v,
        leaderYaw: leader ? leader.yaw : 0,
        squad: this.squad
          .filter((u) => !u.down)
          .map((u, idx) => {
            const uv = worldToMinimap(u.x, u.z);
            return { u: uv.u, v: uv.v, color: u.color, active: idx === this.activeIdx };
          }),
        enemies: livingEnemiesList.map((e) => {
          const uv = worldToMinimap(e.x, e.z);
          return { u: uv.u, v: uv.v, color: e.boss ? '#ff2945' : '#ff5a72', boss: e.boss };
        }),
        pickups: [
          ...this.pickups
            .filter((p) => !p.taken)
            .map((p) => {
              const uv = worldToMinimap(p.x, p.z);
              return { u: uv.u, v: uv.v, kind: p.kind };
            }),
          ...this.ammoCrates
            .filter((c) => c.cooldown <= 0)
            .map((c) => {
              const uv = worldToMinimap(c.x, c.z);
              return { u: uv.u, v: uv.v, kind: 'ammo' as const };
            }),
        ],
        holdPoint: holdUv,
        generatorU: genUv.u,
        generatorV: genUv.v,
        generatorActive: this.b1GeneratorActive,
        evacU: evacUv.u,
        evacV: evacUv.v,
        evacActive: this.bossDefeated && livingEnemies === 0,
      },
      units: this.squad.map((u, idx) => ({
        id: u.id,
        name: u.name,
        role: u.role,
        color: u.color,
        hp: Math.round(u.hp),
        maxHp: u.maxHp,
        ghostHp: Math.round(u.ghostHp),
        magAmmo: u.magAmmo,
        magMax: u.magMax,
        reloading: u.reloading,
        overcharged: u.overchargeTimer > 0,
        skillName: u.skillName,
        skillHint: u.skillHint,
        skillCd: u.skillCd,
        skillMaxCd: u.skillMaxCd,
        down: u.down,
        active: idx === this.activeIdx,
      })),
      assetSlots: this.assetPipeline.getSnapshot(),
      summary: this.summary,
    });
  }

  private clearInputs(): void {
    this.keysHeld.clear();
    this.mouseDown = false;
    this.dragOrbit = false;
  }

  private handleResize(): void {
    if (this.disposed) return;
    const w = Math.max(1, this.container.clientWidth || window.innerWidth);
    const h = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setSize(w, h);
    }
    if (this.bloomPass) {
      const scale = this.isSoftwareGl ? 0.5 : 1.0;
      this.bloomPass.resolution.set(Math.max(64, Math.floor(w * scale)), Math.max(64, Math.floor(h * scale)));
    }
    if (this.normalDepthTarget && this.gradePass) {
      const ndScale = this.isSoftwareGl ? 0.75 : 1.0;
      const ndW = Math.max(64, Math.floor(w * ndScale));
      const ndH = Math.max(64, Math.floor(h * ndScale));
      this.normalDepthTarget.setSize(ndW, ndH);
      this.gradePass.uniforms.uTexelSize.value.set(1 / ndW, 1 / ndH);
    }
    this.renderFrame();
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const firstPress = !this.keysHeld.has(e.code);
    this.keysHeld.add(e.code);

    if (this.state === 'title') {
      if (firstPress && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        this.startGame();
      }
      return;
    }

    if (firstPress && (e.code === 'Escape' || e.code === 'KeyP')) {
      if (this.state === 'playing' || this.state === 'paused') {
        e.preventDefault();
        this.togglePause();
        return;
      }
    }

    if (this.state !== 'playing') return;

    if (firstPress) {
      if (e.code === 'KeyV') this.toggleInspectMode();
      else if (e.code === 'KeyT') this.cycleMood();
      else if (e.code === 'KeyM') this.toggleMute();
      else if (e.code === 'Digit1') this.triggerSkill(0);
      else if (e.code === 'Digit2') this.triggerSkill(1);
      else if (e.code === 'Digit3') this.triggerSkill(2);
      else if (e.code === 'Digit4') this.triggerSkill(3);
      else if (e.code === 'KeyR') this.triggerReload();
      else if (e.code === 'KeyQ') this.cycleStance();
      else if (e.code === 'KeyF') this.throwFlare();
      else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'Space') {
        if (!this.inspectMode) {
          e.preventDefault();
          this.rollBufferTimer = 0.14;
          this.performRoll();
        }
      } else if (e.code === 'Tab') {
        e.preventDefault();
        for (let st = 1; st <= 4; st++) {
          const next = (this.activeIdx + st) % 4;
          if (this.squad[next] && !this.squad[next].down) {
            this.selectUnit(next);
            break;
          }
        }
      }
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keysHeld.delete(e.code);
  };

  private onMouseMove = (e: MouseEvent): void => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.mouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouseNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    if (this.inspectMode && this.dragOrbit) {
      this.camYaw -= (e.clientX - this.prevDragX) * 0.006;
      this.camPitch = Math.max(0.14, Math.min(1.22, this.camPitch + (e.clientY - this.prevDragY) * 0.005));
      this.prevDragX = e.clientX;
      this.prevDragY = e.clientY;
    }
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0 || this.state !== 'playing') return;
    this.audio.unlock();
    if (this.inspectMode) {
      this.dragOrbit = true;
      this.prevDragX = e.clientX;
      this.prevDragY = e.clientY;
    } else {
      this.mouseDown = true;
    }
  };

  private onMouseUp = (): void => {
    this.mouseDown = false;
    this.dragOrbit = false;
  };

  private onWheel = (e: WheelEvent): void => {
    if (this.state !== 'playing') return;
    this.camDist = Math.max(11, Math.min(36, this.camDist + e.deltaY * 0.014));
  };

  private onBlur = (): void => {
    this.clearInputs();
  };

  private onVisibilityChange = (): void => {
    if (document.hidden) this.clearInputs();
  };

  private bindEvents(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.renderer.domElement.addEventListener('mousemove', this.onMouseMove);
    this.renderer.domElement.addEventListener('mousedown', this.onMouseDown);
    this.renderer.domElement.addEventListener('wheel', this.onWheel, { passive: true });
  }

  private unbindEvents(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.renderer.domElement.removeEventListener('mousemove', this.onMouseMove);
    this.renderer.domElement.removeEventListener('mousedown', this.onMouseDown);
    this.renderer.domElement.removeEventListener('wheel', this.onWheel);
  }
}
