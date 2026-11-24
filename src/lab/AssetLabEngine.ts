import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import {
  ASSET_CATALOG,
  buildAllLabAssets,
  getAssetOrder,
  type AssetId,
  type BuiltLabAsset,
  type LabLightPreset,
  type LabViewMode,
} from './assets/index';
import { computeAssetStats, type ComputedAssetStats } from './meshKernel';

export interface AssetLabSnapshot {
  mode: LabViewMode;
  lightPreset: LabLightPreset;
  wireframe: boolean;
  creaseInk: boolean;
  title: string;
  category: string;
  exportFileName: string;
  stats: ComputedAssetStats;
  allStats: Record<AssetId, ComputedAssetStats>;
}

export interface AssetLabCallbacks {
  onSnapshot: (snap: AssetLabSnapshot) => void;
  onStatus?: (message: string) => void;
}

declare global {
  interface Window {
    __assetLab?: {
      select: (mode: LabViewMode) => void;
      setLight: (preset: LabLightPreset) => void;
      setWireframe: (enabled: boolean) => void;
      setCreaseInk: (enabled: boolean) => void;
      setOrbitAngles: (azimuthDeg: number, elevationDeg: number, distScale?: number) => void;
      resetCamera: () => void;
      getSnapshot: () => AssetLabSnapshot;
      exportCurrentGlb: () => Promise<{ fileName: string; bytes: number }>;
    };
  }
}

interface LineupPlacement {
  id: AssetId;
  x: number;
  z: number;
  rotY: number;
}

// 1:1 real-world scale comparison lineup: Building rear-left, Sedan center-right, Vending & 2 Characters in foreground
const LINEUP_LAYOUT: readonly LineupPlacement[] = [
  { id: 'building', x: -4.2, z: -2.4, rotY: 0.14 },
  { id: 'vending', x: 0.45, z: -0.35, rotY: 0.08 },
  { id: 'civilian', x: 1.95, z: 0.55, rotY: -0.14 },
  { id: 'infected', x: 3.10, z: 0.50, rotY: -0.28 },
  { id: 'sedan', x: 5.55, z: -0.45, rotY: -0.42 },
];

export class AssetLabEngine {
  private container: HTMLElement;
  private callbacks: AssetLabCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private pmremGenerator: THREE.PMREMGenerator;
  private envRenderTarget: THREE.WebGLRenderTarget;

  private keyLight: THREE.DirectionalLight;
  private fillLight: THREE.DirectionalLight;
  private rimLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private floorMesh: THREE.Mesh;
  private gridHelper: THREE.GridHelper;

  private assets: Record<AssetId, BuiltLabAsset>;
  private activeGroup: THREE.Group;
  private wireOverlayMat: THREE.MeshBasicMaterial;

  private mode: LabViewMode = 'sedan';
  private lightPreset: LabLightPreset = 'studio';
  private wireframe = false;
  private creaseInk = true;
  private currentFocusTarget = new THREE.Vector3(0, 0.8, 0);
  private currentFocusDistance = 5.4;

  private isSoftwareGl = false;
  private renderScheduled = false;
  private rafId: number | null = null;
  private disposed = false;

  private resizeObserver: ResizeObserver;
  private onContextLostBound: (e: Event) => void;
  private onContextRestoredBound: () => void;

  constructor(container: HTMLElement, callbacks: AssetLabCallbacks, initialMode: LabViewMode = 'sedan') {
    this.container = container;
    this.callbacks = callbacks;
    this.mode = initialMode;

    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 240);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    // Detect software WebGL (SwiftShader / llvmpipe) to ensure smooth non-stalling frames
    const gl = this.renderer.getContext();
    const dbgInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererStr = dbgInfo ? String(gl.getParameter(dbgInfo.UNMASKED_RENDERER_WEBGL)) : '';
    this.isSoftwareGl = /swiftshader|llvmpipe|software/i.test(rendererStr);
    if (this.isSoftwareGl) {
      this.renderer.setPixelRatio(1);
    }

    container.innerHTML = '';
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x232730);
    this.scene.fog = new THREE.FogExp2(0x232730, 0.011);

    // Calibrated neutral studio IBL reflections
    this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.envRenderTarget = this.pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRenderTarget.texture;
    this.scene.environmentIntensity = 0.55;

    this.camera = new THREE.PerspectiveCamera(38, width / height, 0.08, 180);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.492;
    this.controls.minDistance = 0.7;
    this.controls.maxDistance = 42;
    this.controls.addEventListener('change', () => this.requestRender());

    // 3-point look-dev lighting rig + hemisphere fill
    this.hemiLight = new THREE.HemisphereLight(0xeef2f7, 0x3b3f48, 0.78);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(0xfff9f0, 2.15);
    this.keyLight.position.set(9, 14, 10);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(this.isSoftwareGl ? 1024 : 2048, this.isSoftwareGl ? 1024 : 2048);
    this.keyLight.shadow.camera.near = 0.5;
    this.keyLight.shadow.camera.far = 48;
    const d = 14;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.bias = -0.0004;
    this.keyLight.shadow.normalBias = 0.03;
    this.scene.add(this.keyLight);

    this.fillLight = new THREE.DirectionalLight(0xd4e2f4, 0.72);
    this.fillLight.position.set(-10, 7, 5);
    this.scene.add(this.fillLight);

    this.rimLight = new THREE.DirectionalLight(0xf2f7ff, 0.95);
    this.rimLight.position.set(-5, 9, -11);
    this.scene.add(this.rimLight);

    // Neutral architectural studio floor + 1m reference scale grid
    const floorGeo = new THREE.CircleGeometry(36, 64);
    floorGeo.rotateX(-Math.PI * 0.5);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x2b303a,
      roughness: 0.92,
      metalness: 0.04,
    });
    this.floorMesh = new THREE.Mesh(floorGeo, floorMat);
    this.floorMesh.receiveShadow = true;
    this.floorMesh.position.y = -0.002;
    this.scene.add(this.floorMesh);

    this.gridHelper = new THREE.GridHelper(32, 32, 0x515b6d, 0x353c48);
    this.gridHelper.position.y = 0.001;
    (this.gridHelper.material as THREE.Material).transparent = true;
    (this.gridHelper.material as THREE.Material).opacity = 0.52;
    this.scene.add(this.gridHelper);

    // Wireframe overlay material (renders crisp triangle mesh edges directly atop shaded surfaces)
    this.wireOverlayMat = new THREE.MeshBasicMaterial({
      color: 0x62e6f5,
      wireframe: true,
      transparent: true,
      opacity: 0.52,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    // Build all 5 benchmark assets once and attach wireframe overlays
    this.assets = buildAllLabAssets();
    for (const id of getAssetOrder()) {
      this.attachWireframeOverlays(this.assets[id].root);
    }

    this.activeGroup = new THREE.Group();
    this.activeGroup.name = 'LabActiveStage';
    this.scene.add(this.activeGroup);

    this.applyLightPreset(this.lightPreset);
    this.selectMode(this.mode);

    // Resize & WebGL context recovery
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    this.onContextLostBound = (e: Event) => {
      e.preventDefault();
    };
    this.onContextRestoredBound = () => {
      this.requestRender();
    };
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLostBound);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestoredBound);

    // Expose deterministic browser testing hook
    window.__assetLab = {
      select: (m) => this.selectMode(m),
      setLight: (p) => this.setLightPreset(p),
      setWireframe: (on) => this.setWireframe(on),
      setCreaseInk: (on) => this.setCreaseInk(on),
      setOrbitAngles: (az, el, distScale) => this.setOrbitAngles(az, el, distScale),
      resetCamera: () => this.resetCamera(),
      getSnapshot: () => this.buildSnapshot(),
      exportCurrentGlb: () => this.exportCurrentGlb(),
    };
  }

  private attachWireframeOverlays(root: THREE.Object3D): void {
    const meshes: THREE.Mesh[] = [];
    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh && !obj.userData.isWireOverlay) {
        meshes.push(obj);
      }
    });
    for (const m of meshes) {
      const wire = new THREE.Mesh(m.geometry, this.wireOverlayMat);
      wire.name = `${m.name}_wire`;
      wire.userData.isWireOverlay = true;
      wire.visible = this.wireframe;
      wire.castShadow = false;
      wire.receiveShadow = false;
      wire.raycast = () => {};
      m.add(wire);
    }
  }

  private syncOverlayVisibility(): void {
    for (const id of getAssetOrder()) {
      this.assets[id].root.traverse((obj) => {
        if (obj.userData.isWireOverlay) {
          obj.visible = this.wireframe;
        } else if (obj.userData.isCreaseInk) {
          obj.visible = this.creaseInk;
        }
      });
    }
  }

  public selectMode(mode: LabViewMode): void {
    this.mode = mode;
    this.activeGroup.clear();

    if (mode === 'all') {
      for (const item of LINEUP_LAYOUT) {
        const asset = this.assets[item.id];
        asset.root.position.set(item.x, 0, item.z);
        asset.root.rotation.set(0, item.rotY, 0);
        this.activeGroup.add(asset.root);
      }
    } else {
      const asset = this.assets[mode];
      asset.root.position.set(0, 0, 0);
      asset.root.rotation.set(0, 0, 0);
      this.activeGroup.add(asset.root);
    }

    this.syncOverlayVisibility();
    this.frameActiveStage();
    this.emitSnapshot();
    this.requestRender();
  }

  private frameActiveStage(): void {
    this.activeGroup.updateMatrixWorld(true);
    const box = new THREE.Box3();
    const tmp = new THREE.Box3();
    this.activeGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh && !obj.userData.isWireOverlay) {
        obj.geometry.computeBoundingBox();
        if (obj.geometry.boundingBox) {
          tmp.copy(obj.geometry.boundingBox).applyMatrix4(obj.matrixWorld);
          box.union(tmp);
        }
      }
    });

    const center = new THREE.Vector3(0, 1, 0);
    const size = new THREE.Vector3(2, 2, 2);
    if (!box.isEmpty()) {
      box.getCenter(center);
      box.getSize(size);
    }

    let dir = new THREE.Vector3(0.68, 0.28, 0.96).normalize();
    let focusY = center.y;
    let margin = 1.48;

    if (this.mode === 'all') {
      dir.set(0.18, 0.26, 1.0).normalize();
      focusY = size.y * 0.36;
      center.x = 0.65;
      margin = 1.24;
    } else {
      const meta = ASSET_CATALOG.find((m) => m.id === this.mode)!;
      dir = new THREE.Vector3(...meta.cameraDir).normalize();
      focusY = size.y * meta.focusHeightRatio;
    }

    const fovRad = THREE.MathUtils.degToRad(this.camera.fov);
    const aspect = Math.max(0.5, this.camera.aspect);
    const radiusH = size.y * 0.52;
    const radiusW = Math.max(size.x, size.z) * 0.54;
    const distH = radiusH / Math.tan(fovRad * 0.5);
    const distW = radiusW / (Math.tan(fovRad * 0.5) * aspect);
    const dist = Math.max(distH, distW, 1.5) * margin;

    this.currentFocusTarget.set(center.x, focusY, center.z);
    this.currentFocusDistance = dist;

    this.controls.target.copy(this.currentFocusTarget);
    this.camera.position.copy(this.currentFocusTarget).addScaledVector(dir, dist);
    this.camera.lookAt(this.currentFocusTarget);
    this.controls.update();
  }

  public resetCamera(): void {
    this.frameActiveStage();
    this.requestRender();
  }

  public setOrbitAngles(azimuthDeg: number, elevationDeg: number, distScale = 1): void {
    const az = THREE.MathUtils.degToRad(azimuthDeg);
    const el = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(elevationDeg, 4, 80));
    const r = this.currentFocusDistance * distScale;
    const horiz = Math.cos(el) * r;
    const x = this.currentFocusTarget.x + Math.sin(az) * horiz;
    const y = this.currentFocusTarget.y + Math.sin(el) * r;
    const z = this.currentFocusTarget.z + Math.cos(az) * horiz;
    this.camera.position.set(x, y, z);
    this.controls.target.copy(this.currentFocusTarget);
    this.controls.update();
    this.requestRender();
  }

  public setLightPreset(preset: LabLightPreset): void {
    this.lightPreset = preset;
    this.applyLightPreset(preset);
    this.emitSnapshot();
    this.requestRender();
  }

  private applyLightPreset(preset: LabLightPreset): void {
    const floorMat = this.floorMesh.material as THREE.MeshStandardMaterial;

    if (preset === 'studio') {
      // Neutral 18-22% look-dev studio: honest material & bevel evaluation
      this.scene.background = new THREE.Color(0x252932);
      (this.scene.fog as THREE.FogExp2).color.setHex(0x252932);
      floorMat.color.setHex(0x2e333e);
      this.scene.environmentIntensity = 0.56;
      this.renderer.toneMappingExposure = 1.04;

      this.hemiLight.color.setHex(0xf0f4fa);
      this.hemiLight.groundColor.setHex(0x3f434c);
      this.hemiLight.intensity = 0.82;

      this.keyLight.color.setHex(0xfffaf2);
      this.keyLight.intensity = 2.15;
      this.keyLight.position.set(9, 14, 10);

      this.fillLight.color.setHex(0xd4e2f5);
      this.fillLight.intensity = 0.72;
      this.fillLight.position.set(-10, 7, 5);

      this.rimLight.color.setHex(0xf2f7ff);
      this.rimLight.intensity = 0.95;
      this.rimLight.position.set(-5, 9, -11);
    } else if (preset === 'tf2') {
      // Classic Team Fortress 2 warm key / cool steel shadow / crisp warm-white rim
      this.scene.background = new THREE.Color(0x262a34);
      (this.scene.fog as THREE.FogExp2).color.setHex(0x262a34);
      floorMat.color.setHex(0x34363d);
      this.scene.environmentIntensity = 0.45;
      this.renderer.toneMappingExposure = 1.06;

      this.hemiLight.color.setHex(0x9ab4d6);
      this.hemiLight.groundColor.setHex(0x4a3d35);
      this.hemiLight.intensity = 0.72;

      this.keyLight.color.setHex(0xffd39c);
      this.keyLight.intensity = 2.55;
      this.keyLight.position.set(11, 11, 8);

      this.fillLight.color.setHex(0x6d93c4);
      this.fillLight.intensity = 0.92;
      this.fillLight.position.set(-10, 6, 4);

      this.rimLight.color.setHex(0xfff1d6);
      this.rimLight.intensity = 1.35;
      this.rimLight.position.set(-6, 10, -10);
    } else {
      // Minato City night lighting test (deep indigo ambient + warm storefront key + cyan rim)
      this.scene.background = new THREE.Color(0x111524);
      (this.scene.fog as THREE.FogExp2).color.setHex(0x111524);
      floorMat.color.setHex(0x171c2b);
      this.scene.environmentIntensity = 0.34;
      this.renderer.toneMappingExposure = 1.12;

      this.hemiLight.color.setHex(0x4a639c);
      this.hemiLight.groundColor.setHex(0x181726);
      this.hemiLight.intensity = 0.78;

      this.keyLight.color.setHex(0xffc27d);
      this.keyLight.intensity = 2.05;
      this.keyLight.position.set(8, 12, 9);

      this.fillLight.color.setHex(0x4e79c7);
      this.fillLight.intensity = 0.85;
      this.fillLight.position.set(-9, 6, 6);

      this.rimLight.color.setHex(0x52e0ec);
      this.rimLight.intensity = 1.55;
      this.rimLight.position.set(-6, 8, -11);
    }
  }

  public setWireframe(enabled: boolean): void {
    this.wireframe = enabled;
    this.syncOverlayVisibility();
    this.emitSnapshot();
    this.requestRender();
  }

  public setCreaseInk(enabled: boolean): void {
    this.creaseInk = enabled;
    this.syncOverlayVisibility();
    this.emitSnapshot();
    this.requestRender();
  }

  /**
   * Exports the active benchmark asset (or full 5-object lineup) to binary .GLB,
   * stripping helper wireframe/crease-ink overlays so exported geometry is production-clean.
   */
  public async exportCurrentGlb(): Promise<{ fileName: string; bytes: number }> {
    const snap = this.buildSnapshot();
    const exportRoot = new THREE.Group();
    exportRoot.name = this.mode === 'all' ? 'Minato_AssetLab_Lineup' : this.assets[this.mode].root.name;

    // Clone only clean renderable meshes (strip wireframe overlays & ink LineSegments)
    const addCleanClone = (src: THREE.Object3D, parent: THREE.Object3D) => {
      src.updateMatrixWorld(true);
      const clone = src.clone(true);
      const toRemove: THREE.Object3D[] = [];
      clone.traverse((obj) => {
        if (obj.userData.isWireOverlay || obj.userData.isCreaseInk) {
          toRemove.push(obj);
        }
      });
      for (const rem of toRemove) {
        rem.parent?.remove(rem);
      }
      parent.add(clone);
    };

    if (this.mode === 'all') {
      for (const item of LINEUP_LAYOUT) {
        addCleanClone(this.assets[item.id].root, exportRoot);
      }
    } else {
      addCleanClone(this.assets[this.mode].root, exportRoot);
    }

    const exporter = new GLTFExporter();
    const binary = await new Promise<ArrayBuffer>((resolve, reject) => {
      exporter.parse(
        exportRoot,
        (res) => {
          if (res instanceof ArrayBuffer) {
            resolve(res);
          } else {
            reject(new Error('Expected binary GLB output'));
          }
        },
        (err) => reject(err),
        { binary: true },
      );
    });

    const blob = new Blob([binary], { type: 'model/gltf-binary' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = snap.exportFileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);

    const kb = Math.round(binary.byteLength / 1024);
    this.callbacks.onStatus?.(`Экспортирован ${snap.exportFileName} (${kb} КБ)`);
    return { fileName: snap.exportFileName, bytes: binary.byteLength };
  }

  private buildSnapshot(): AssetLabSnapshot {
    const allStats = {} as Record<AssetId, ComputedAssetStats>;
    for (const id of getAssetOrder()) {
      allStats[id] = this.assets[id].stats;
    }

    if (this.mode === 'all') {
      return {
        mode: 'all',
        lightPreset: this.lightPreset,
        wireframe: this.wireframe,
        creaseInk: this.creaseInk,
        title: 'Сравнение масштаба — все 5 эталонов (1:1)',
        category: 'Комплексная проверка пропорций и читаемости',
        exportFileName: 'minato-lab-all-5-lineup.glb',
        stats: computeAssetStats(this.activeGroup),
        allStats,
      };
    }

    const active = this.assets[this.mode];
    return {
      mode: this.mode,
      lightPreset: this.lightPreset,
      wireframe: this.wireframe,
      creaseInk: this.creaseInk,
      title: active.meta.title,
      category: active.meta.category,
      exportFileName: active.meta.exportFileName,
      stats: active.stats,
      allStats,
    };
  }

  private emitSnapshot(): void {
    this.callbacks.onSnapshot(this.buildSnapshot());
  }

  private handleResize(): void {
    if (this.disposed) return;
    const w = Math.max(this.container.clientWidth, 320);
    const h = Math.max(this.container.clientHeight, 240);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.requestRender();
  }

  public requestRender(): void {
    if (this.disposed || this.renderScheduled) return;
    this.renderScheduled = true;
    const schedule = () => {
      if (this.disposed) return;
      this.renderScheduled = false;
      this.renderer.render(this.scene, this.camera);
    };
    if (this.isSoftwareGl) {
      this.rafId = window.requestAnimationFrame(() => {
        this.rafId = null;
        schedule();
      });
    } else {
      this.rafId = window.requestAnimationFrame(() => {
        this.rafId = null;
        schedule();
      });
    }
  }

  public dispose(): void {
    this.disposed = true;
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLostBound);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestoredBound);

    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
        obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m && m !== this.wireOverlayMat) {
            m.dispose();
          }
        }
      }
    });
    this.wireOverlayMat.dispose();
    this.envRenderTarget.dispose();
    this.pmremGenerator.dispose();
    this.renderer.dispose();
    delete window.__assetLab;
  }
}
