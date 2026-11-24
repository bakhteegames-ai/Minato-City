import type * as THREE from 'three';
import type { ComputedAssetStats } from '../meshKernel';

export type AssetId = 'sedan' | 'building' | 'vending' | 'civilian' | 'infected';

export type LabViewMode = AssetId | 'all';

export type LabLightPreset = 'studio' | 'tf2' | 'minato';

export interface AssetMeta {
  id: AssetId;
  shortLabel: string;
  title: string;
  category: string;
  exportFileName: string;
  /** Preferred camera framing offset direction (normalized or relative to radius). */
  cameraDir: readonly [number, number, number];
  /** Slight Y focus offset factor relative to height (0.5 = exact vertical center). */
  focusHeightRatio: number;
}

export interface BuiltLabAsset {
  meta: AssetMeta;
  root: THREE.Group;
  stats: ComputedAssetStats;
}

export const ASSET_CATALOG: readonly AssetMeta[] = [
  {
    id: 'sedan',
    shortLabel: '1. Седан',
    title: 'Угловатый ретрофутуристический седан',
    category: 'Транспорт · Hard-Surface',
    exportFileName: 'minato-lab-retro-sedan.glb',
    cameraDir: [0.82, 0.34, 0.92],
    focusHeightRatio: 0.44,
  },
  {
    id: 'building',
    shortLabel: '2. Здание',
    title: 'Модульное трёхэтажное городское здание',
    category: 'Архитектура · Модульный блок',
    exportFileName: 'minato-lab-modular-building.glb',
    cameraDir: [0.76, 0.28, 0.96],
    focusHeightRatio: 0.48,
  },
  {
    id: 'vending',
    shortLabel: '3. Автомат',
    title: 'Уличный торговый автомат',
    category: 'Проп · Уличный объект',
    exportFileName: 'minato-lab-vending-machine.glb',
    cameraDir: [0.58, 0.24, 1.0],
    focusHeightRatio: 0.5,
  },
  {
    id: 'civilian',
    shortLabel: '4. Персонаж',
    title: 'Взрослый персонаж в повседневной одежде',
    category: 'Персонаж · Взрослые пропорции',
    exportFileName: 'minato-lab-adult-civilian.glb',
    cameraDir: [0.46, 0.16, 1.0],
    focusHeightRatio: 0.52,
  },
  {
    id: 'infected',
    shortLabel: '5. Заражённый',
    title: 'Заражённый гражданский',
    category: 'Персонаж · Асимметричный силуэт',
    exportFileName: 'minato-lab-infected-civilian.glb',
    cameraDir: [0.52, 0.18, 1.0],
    focusHeightRatio: 0.5,
  },
] as const;
