import { buildAdultCivilianAsset } from './adultCivilian';
import { buildInfectedCivilianAsset } from './infectedCivilian';
import { buildModularBuildingAsset } from './modularBuilding';
import { buildRetroSedanAsset } from './retroSedan';
import { buildVendingMachineAsset } from './vendingMachine';
import { ASSET_CATALOG, type AssetId, type BuiltLabAsset } from './types';

export { ASSET_CATALOG } from './types';
export type { AssetId, AssetMeta, BuiltLabAsset, LabLightPreset, LabViewMode } from './types';

export function buildLabAssetById(id: AssetId): BuiltLabAsset {
  switch (id) {
    case 'sedan':
      return buildRetroSedanAsset();
    case 'building':
      return buildModularBuildingAsset();
    case 'vending':
      return buildVendingMachineAsset();
    case 'civilian':
      return buildAdultCivilianAsset();
    case 'infected':
      return buildInfectedCivilianAsset();
  }
}

export function buildAllLabAssets(): Record<AssetId, BuiltLabAsset> {
  return {
    sedan: buildRetroSedanAsset(),
    building: buildModularBuildingAsset(),
    vending: buildVendingMachineAsset(),
    civilian: buildAdultCivilianAsset(),
    infected: buildInfectedCivilianAsset(),
  };
}

export function getAssetOrder(): readonly AssetId[] {
  return ASSET_CATALOG.map((item) => item.id);
}
