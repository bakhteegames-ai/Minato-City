import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import {
  ASSET_SLOT_SPECS,
  buildLevelBlueprintExport,
  computeNormalizedModelTransform,
  matchAnimationClipName,
  type AnimationIntent,
  type AssetSlotSpec,
} from './rules';
import type { AssetSlotId, AssetSlotStatus, ColliderBox } from './types';

export const OUTLINE_LAYER = 2;

/**
 * Tags solid 3D meshes onto OUTLINE_LAYER so the screen-space Depth+Normal Sobel pass
 * draws crisp graphic-novel ink lines along real architectural, vehicle, and character edges
 * while completely ignoring transparent decals, puddles, glow sprites, rain streaks, and lasers.
 */
export function enableOutlineLayer(root: THREE.Object3D, includeCutawayShells = false): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.userData.skipOutline) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const hasSolidMat = mats.some((m) => {
      if (!m) return false;
      if (m.blending === THREE.AdditiveBlending) return false;
      if (!m.transparent) return true;
      return includeCutawayShells && m.opacity >= 0.45 && m.depthWrite !== false;
    });
    if (hasSolidMat) {
      mesh.layers.enable(OUTLINE_LAYER);
    }
  });
}

export interface AnimatedGlbInstance {
  root: THREE.Group;
  mixer: THREE.AnimationMixer | null;
  actions: Partial<Record<AnimationIntent, THREE.AnimationAction>>;
  currentIntent: AnimationIntent | null;
  setIntent: (intent: AnimationIntent) => void;
  update: (dt: number) => void;
  dispose: () => void;
}

interface LoadedAssetEntry {
  slot: AssetSlotId;
  spec: AssetSlotSpec;
  sourceName: string;
  prototype: THREE.Object3D;
  clips: THREE.AnimationClip[];
  matchedClips: Partial<Record<AnimationIntent, string>>;
  transform: {
    scale: number;
    offsetX: number;
    offsetY: number;
    offsetZ: number;
    rotY: number;
  };
}

interface AssetManifestJson {
  slots?: Partial<Record<AssetSlotId, string | null>>;
}

const SPEC_BY_ID = new Map<AssetSlotId, AssetSlotSpec>(
  ASSET_SLOT_SPECS.map((spec) => [spec.id, spec]),
);

function calibrateImportedScene(
  root: THREE.Object3D,
  spec: AssetSlotSpec,
  clips: THREE.AnimationClip[],
  sourceName: string,
): LoadedAssetEntry {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) {
    box.min.set(-0.5, 0, -0.5);
    box.max.set(0.5, spec.targetSize, 0.5);
  }

  const size = new THREE.Vector3();
  box.getSize(size);
  // Vehicles in glTF are often authored facing +Z (length along Z), whereas MinatoEngine places cars along +X
  const rotY = spec.category === 'vehicle' && size.z > size.x * 1.15 ? spec.defaultFacingOffsetY : 0;

  const norm = computeNormalizedModelTransform(
    [box.min.x, box.min.y, box.min.z],
    [box.max.x, box.max.y, box.max.z],
    spec.targetSize,
    spec.axis,
  );

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (m && 'envMapIntensity' in m) {
        (m as THREE.MeshStandardMaterial).envMapIntensity = Math.min(
          1.15,
          (m as THREE.MeshStandardMaterial).envMapIntensity ?? 0.9,
        );
      }
    }
  });

  const clipNames = clips.map((c) => c.name || 'Clip');
  const matchedClips: Partial<Record<AnimationIntent, string>> = {};
  const intents: AnimationIntent[] = ['idle', 'move', 'attack', 'death'];
  for (const intent of intents) {
    const matched = matchAnimationClipName(clipNames, intent);
    if (matched) matchedClips[intent] = matched;
  }

  return {
    slot: spec.id,
    spec,
    sourceName,
    prototype: root,
    clips,
    matchedClips,
    transform: {
      scale: norm.scale,
      offsetX: norm.offsetX,
      offsetY: norm.offsetY,
      offsetZ: norm.offsetZ,
      rotY,
    },
  };
}

export class MinatoAssetPipeline {
  private loader = new GLTFLoader();
  private exporter = new GLTFExporter();
  private entries = new Map<AssetSlotId, LoadedAssetEntry>();

  /**
   * Loads optional /models/manifest.json on boot. Null entries are cleanly skipped (zero 404 errors).
   */
  public async loadManifest(
    manifestUrl = '/models/manifest.json',
    onSlotLoaded?: (slot: AssetSlotId) => void,
  ): Promise<number> {
    try {
      const res = await fetch(manifestUrl, { cache: 'no-store' });
      if (!res.ok) return 0;
      const data = (await res.json()) as AssetManifestJson;
      if (!data.slots) return 0;

      let loadedCount = 0;
      const tasks = Object.entries(data.slots).map(async ([rawSlot, path]) => {
        if (!path || typeof path !== 'string') return;
        const slot = rawSlot as AssetSlotId;
        if (!SPEC_BY_ID.has(slot)) return;
        try {
          await this.loadSlotFromUrl(slot, path);
          loadedCount++;
          onSlotLoaded?.(slot);
        } catch {
          // Graceful fallback to greybox proxy if a user-configured path is missing
        }
      });
      await Promise.all(tasks);
      return loadedCount;
    } catch {
      return 0;
    }
  }

  public async loadSlotFromUrl(slot: AssetSlotId, url: string): Promise<AssetSlotStatus> {
    const spec = SPEC_BY_ID.get(slot);
    if (!spec) throw new Error(`Unknown asset slot: ${slot}`);

    const gltf = await new Promise<GLTF>((resolve, reject) => {
      this.loader.load(url, resolve, undefined, reject);
    });
    const sourceName = url.split('/').pop() || url;
    const entry = calibrateImportedScene(gltf.scene, spec, gltf.animations ?? [], sourceName);
    this.entries.set(slot, entry);
    return this.getSlotStatus(slot);
  }

  public async loadSlotFromFile(slot: AssetSlotId, file: File): Promise<AssetSlotStatus> {
    const spec = SPEC_BY_ID.get(slot);
    if (!spec) throw new Error(`Unknown asset slot: ${slot}`);

    const buffer = await file.arrayBuffer();
    const gltf = await new Promise<GLTF>((resolve, reject) => {
      this.loader.parse(buffer, '', resolve, reject);
    });
    const entry = calibrateImportedScene(gltf.scene, spec, gltf.animations ?? [], file.name);
    this.entries.set(slot, entry);
    return this.getSlotStatus(slot);
  }

  public clearSlot(slot: AssetSlotId): void {
    this.entries.delete(slot);
  }

  public hasSlot(slot: AssetSlotId): boolean {
    return this.entries.has(slot);
  }

  public instantiateSlot(slot: AssetSlotId): AnimatedGlbInstance | null {
    const entry = this.entries.get(slot);
    if (!entry) return null;

    const wrapper = new THREE.Group();
    wrapper.name = `CustomGLB_${slot}`;

    const pivot = new THREE.Group();
    pivot.rotation.y = entry.transform.rotY;
    wrapper.add(pivot);

    const clone = SkeletonUtils.clone(entry.prototype);
    clone.scale.setScalar(entry.transform.scale);
    clone.position.set(entry.transform.offsetX, entry.transform.offsetY, entry.transform.offsetZ);
    pivot.add(clone);

    enableOutlineLayer(wrapper, false);

    let mixer: THREE.AnimationMixer | null = null;
    const actions: Partial<Record<AnimationIntent, THREE.AnimationAction>> = {};
    let currentIntent: AnimationIntent | null = null;

    if (entry.clips.length > 0) {
      mixer = new THREE.AnimationMixer(clone);
      const intents: AnimationIntent[] = ['idle', 'move', 'attack', 'death'];
      for (const intent of intents) {
        const clipName = entry.matchedClips[intent];
        if (!clipName) continue;
        const clip = entry.clips.find((c) => (c.name || 'Clip') === clipName);
        if (!clip) continue;
        const action = mixer.clipAction(clip);
        if (intent === 'death') {
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
        }
        actions[intent] = action;
      }
    }

    const setIntent = (nextIntent: AnimationIntent) => {
      if (!mixer) return;
      const targetAction = actions[nextIntent] ?? actions.idle;
      if (!targetAction || currentIntent === nextIntent) return;
      const prevAction = currentIntent ? actions[currentIntent] : undefined;
      if (prevAction && prevAction !== targetAction) {
        prevAction.fadeOut(0.14);
      }
      targetAction.reset().fadeIn(0.14).play();
      currentIntent = nextIntent;
    };

    if (actions.idle) {
      setIntent('idle');
    }

    return {
      root: wrapper,
      mixer,
      actions,
      currentIntent,
      setIntent,
      update: (dt: number) => {
        if (mixer) mixer.update(dt);
      },
      dispose: () => {
        if (mixer) {
          mixer.stopAllAction();
          mixer.uncacheRoot(clone);
        }
      },
    };
  }

  public getSlotStatus(slot: AssetSlotId): AssetSlotStatus {
    const spec = SPEC_BY_ID.get(slot)!;
    const entry = this.entries.get(slot);
    if (!entry) {
      return {
        id: spec.id,
        label: spec.label,
        category: spec.category,
        loaded: false,
        sourceName: null,
        clipCount: 0,
        matchedClips: [],
      };
    }
    return {
      id: spec.id,
      label: spec.label,
      category: spec.category,
      loaded: true,
      sourceName: entry.sourceName,
      clipCount: entry.clips.length,
      matchedClips: Object.keys(entry.matchedClips),
    };
  }

  public getSnapshot(): AssetSlotStatus[] {
    return ASSET_SLOT_SPECS.map((spec) => this.getSlotStatus(spec.id));
  }

  /**
   * Option 3: Exports the playable A-3 district architecture, streets, interiors & vehicles
   * as a clean binary .GLB file ready to open in Blender, Godot 4, Unity, or Unreal Engine 5.
   */
  public async exportGreyboxSceneToGlb(
    scene: THREE.Scene,
    filename = 'minato-a3-greybox.glb',
  ): Promise<{ bytes: number; meshCount: number }> {
    const exportRoot = new THREE.Group();
    exportRoot.name = 'MinatoCity_A3_Greybox';

    scene.updateMatrixWorld(true);
    let meshCount = 0;

    scene.traverse((obj) => {
      if (obj.userData.excludeFromExport) return;
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      if ((mesh as unknown as THREE.InstancedMesh).isInstancedMesh) return;

      // Skip additive glow cones, puddles, selection rings, and invisible runtime FX
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const isFxOnly = mats.every((m) => !m || m.blending === THREE.AdditiveBlending);
      if (isFxOnly) return;

      const worldPos = new THREE.Vector3();
      const worldQuat = new THREE.Quaternion();
      const worldScale = new THREE.Vector3();
      mesh.matrixWorld.decompose(worldPos, worldQuat, worldScale);

      // Ignore hidden pool items parked underground
      if (worldPos.y < -10 || worldScale.lengthSq() < 0.0001) return;

      const cloneMesh = new THREE.Mesh(mesh.geometry, mesh.material);
      cloneMesh.name = mesh.name || `Mesh_${meshCount}`;
      cloneMesh.position.copy(worldPos);
      cloneMesh.quaternion.copy(worldQuat);
      cloneMesh.scale.copy(worldScale);
      exportRoot.add(cloneMesh);
      meshCount++;
    });

    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      this.exporter.parse(
        exportRoot,
        (result) => {
          if (result instanceof ArrayBuffer) {
            resolve(result);
          } else {
            const encoded = new TextEncoder().encode(JSON.stringify(result));
            resolve(encoded.buffer);
          }
        },
        (err) => reject(err),
        { binary: true, onlyVisible: false },
      );
    });

    triggerBrowserDownload(new Blob([buffer], { type: 'model/gltf-binary' }), filename);
    return { bytes: buffer.byteLength, meshCount };
  }

  /**
   * Option 3: Exports structured JSON level blueprint (colliders, zones, spawns, waves, asset manifest)
   * for importing directly into Godot 4, Unity, or Unreal Engine 5 alongside the .GLB greybox.
   */
  public exportLevelBlueprint(
    colliders: readonly ColliderBox[],
    filename = 'minato-a3-blueprint.json',
  ): number {
    const blueprint = buildLevelBlueprintExport(colliders);
    const json = JSON.stringify(blueprint, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    triggerBrowserDownload(blob, filename);
    return blob.size;
  }
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
