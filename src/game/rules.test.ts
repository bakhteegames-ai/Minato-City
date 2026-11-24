import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVE_RELOAD_SWEET_END,
  ACTIVE_RELOAD_SWEET_START,
  AMMO_CRATE_SPAWNS,
  ASSET_SLOT_SPECS,
  B1_GENERATOR,
  BARREL_SPAWNS,
  buildLevelBlueprintExport,
  canClaimMeleeToken,
  canExtract,
  clampDelta,
  computeBarrelExplosionDamage,
  computeDamage,
  computeGrenadeFalloffDamage,
  computeMusicIntensity,
  computeNeonFlickerIntensity,
  computeNormalizedModelTransform,
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
  matchAnimationClipName,
  MAX_CONCURRENT_MELEE_TOKENS,
  resolveCircleBox,
  selectPriorityTarget,
  updateGeneratorCharge,
  worldToMinimap,
} from './rules';
import type { ColliderBox } from './types';

test('resolveCircleBox pushes penetrating circle out of AABB collider', () => {
  const box: ColliderBox = { x1: 0, z1: 0, x2: 4, z2: 4, tall: true };
  const ent = { x: -0.3, z: 2.0, r: 0.6 };
  const hit = resolveCircleBox(ent, box);
  assert.equal(hit, true);
  assert.ok(ent.x <= -0.59, `expected x <= -0.59, got ${ent.x}`);
  assert.equal(ent.z, 2.0);
});

test('hasLineOfSight respects tall walls and ignores low cover', () => {
  const colliders: ColliderBox[] = [
    { x1: -1, z1: -1, x2: 1, z2: 1, tall: false }, // low car
    { x1: 4, z1: -2, x2: 6, z2: 2, tall: true }, // building wall
  ];
  assert.equal(hasLineOfSight(-4, 0, 3, 0, colliders), true);
  assert.equal(hasLineOfSight(-4, 0, 8, 0, colliders), false);
  assert.equal(isPointInsideTallWall(5, 0, colliders), true);
  assert.equal(isPointInsideTallWall(0, 0, colliders), false);
});

test('computeDamage applies armor mitigation unless armorPiercing is true', () => {
  assert.equal(computeDamage(50, false, false), 50);
  assert.equal(computeDamage(50, true, false), 21);
  assert.equal(computeDamage(50, true, true), 50);
  assert.equal(computeDamage(4, true, false), 4);
});

test('computeGrenadeFalloffDamage scales smoothly by distance and hits zero outside blast', () => {
  const direct = computeGrenadeFalloffDamage(0, 0.6);
  const edge = computeGrenadeFalloffDamage(6.5, 0.6);
  const miss = computeGrenadeFalloffDamage(8.5, 0.6);
  assert.ok(direct > edge && edge > 0);
  assert.equal(miss, 0);
});

test('wave spawns escalate across all 3 phases and include distinct AI policies', () => {
  const p1 = getWaveSpawns(1);
  const p2 = getWaveSpawns(2);
  const p3 = getWaveSpawns(3);
  assert.ok(p1.length >= 8);
  assert.ok(p2.some((s) => s.type === 'armored'));
  assert.ok(p3.some((s) => s.type === 'tank'));
  const uniquePolicies = new Set(Object.values(ENEMY_ARCHETYPES).map((a) => a.policy));
  assert.ok(uniquePolicies.size >= 4);
});

test('extraction requires defeated boss, zero enemies, and presence inside EVAC_ZONE', () => {
  assert.equal(canExtract(EVAC_ZONE.x, EVAC_ZONE.z, false, 0), false);
  assert.equal(canExtract(EVAC_ZONE.x, EVAC_ZONE.z, true, 1), false);
  assert.equal(canExtract(EVAC_ZONE.x + 10, EVAC_ZONE.z, true, 0), false);
  assert.equal(canExtract(EVAC_ZONE.x, EVAC_ZONE.z, true, 0), true);
});

test('zone lookup, objective strings, melee token pool, and dt clamping behave deterministically', () => {
  assert.match(getZoneName(-18, -16), /САКУРОЙ/);
  assert.match(getZoneName(11, -4), /中央商店街/);
  assert.match(getZoneName(22, 4), /ПАРКИНГ/);
  assert.match(getPhaseObjective(3, true), /эвакуации/i);
  assert.equal(canClaimMeleeToken(MAX_CONCURRENT_MELEE_TOKENS - 1), true);
  assert.equal(canClaimMeleeToken(MAX_CONCURRENT_MELEE_TOKENS), false);
  assert.equal(clampDelta(0.25), 0.05);
  assert.equal(clampDelta(0.0), 0.001);
});

test('active reload evaluates sweet spot, jams outside window, and ignores repeat presses', () => {
  const mid = (ACTIVE_RELOAD_SWEET_START + ACTIVE_RELOAD_SWEET_END) / 2;
  assert.equal(evaluateActiveReload(0.05, false), 'ignored');
  assert.equal(evaluateActiveReload(mid, false), 'perfect');
  assert.equal(evaluateActiveReload(0.25, false), 'jam');
  assert.equal(evaluateActiveReload(0.82, false), 'jam');
  assert.equal(evaluateActiveReload(mid, true), 'ignored');
});

test('explosive barrels deal scaled AP blast damage and prioritize 3D waypoints properly', () => {
  assert.ok(BARREL_SPAWNS.length >= 4);
  const center = computeBarrelExplosionDamage(0.2, 0.6);
  const far = computeBarrelExplosionDamage(6.8, 0.6);
  const outside = computeBarrelExplosionDamage(9.2, 0.6);
  assert.ok(center > far && far > 0);
  assert.equal(outside, 0);

  const evacWp = computePriorityWaypoint(0, 0, { x: 10, z: 10 }, [{ x: 1, z: 1 }], true);
  assert.equal(evacWp?.kind, 'evac');

  const bossWp = computePriorityWaypoint(0, 0, { x: 10, z: 10 }, [{ x: 1, z: 1 }], false);
  assert.equal(bossWp?.kind, 'boss');

  const threatWp = computePriorityWaypoint(0, 0, null, [{ x: 8, z: 0 }, { x: 2, z: 1 }], false);
  assert.equal(threatWp?.kind, 'threat');
  assert.equal(threatWp?.x, 2);
});

test('neon flicker stays within safe non-strobing bounds and mood post-process configs differ cleanly', () => {
  for (let t = 0; t < 10; t += 0.13) {
    const buzz = computeNeonFlickerIntensity(t, 0.4, 'buzz');
    const steady = computeNeonFlickerIntensity(t, 1.2, 'steady');
    const pulse = computeNeonFlickerIntensity(t, 2.1, 'pulse');
    assert.ok(buzz >= 0.52 && buzz <= 1.18);
    assert.ok(steady >= 0.9 && steady <= 1.05);
    assert.ok(pulse >= 0.78 && pulse <= 1.12);
  }
  const night = getMoodPostProcessConfig('night');
  const day = getMoodPostProcessConfig('day');
  const sunset = getMoodPostProcessConfig('sunset');
  const mist = getMoodPostProcessConfig('mist');
  assert.equal(day.bloomStrength, 0);
  assert.ok(night.bloomThreshold >= 1.35 && night.bloomStrength >= 0.08 && night.bloomStrength <= 0.25);
  assert.ok(sunset.highlightTint[0] > mist.highlightTint[0]);
  assert.ok(mist.highlightTint[2] > sunset.highlightTint[2]);
});

test('Sprint 3 expanded A-3 zones, B1 generator activation, and minimap projection behave deterministically', () => {
  assert.match(getZoneName(-20.5, -3.5), /マルフジ商店/);
  assert.match(getZoneName(1.5, -13.5), /СЕРВИСНЫЙ ПРОХОД/);
  assert.match(getZoneName(-18, -18), /САКУРОЙ/);
  assert.match(getZoneName(25.4, -1.5), /ПАРКИНГ B1/);

  // Generator charges inside zone, decays outside, activates once at 1.0
  let p = 0;
  const s1 = updateGeneratorCharge(p, true, B1_GENERATOR.chargeTime * 0.5, false);
  assert.ok(s1.progress > 0.45 && s1.progress < 0.55 && !s1.activatedNow);
  const sDecay = updateGeneratorCharge(s1.progress, false, 0.5, false);
  assert.ok(sDecay.progress < s1.progress && !sDecay.activatedNow);
  const sFull = updateGeneratorCharge(0.85, true, B1_GENERATOR.chargeTime * 0.4, false);
  assert.equal(sFull.progress, 1);
  assert.equal(sFull.activatedNow, true);
  const sAfter = updateGeneratorCharge(1, true, 0.5, true);
  assert.equal(sAfter.progress, 1);
  assert.equal(sAfter.activatedNow, false);

  // Minimap maps playable world cleanly into [0, 1] x [0, 1]
  const genUv = worldToMinimap(B1_GENERATOR.x, B1_GENERATOR.z);
  const shopUv = worldToMinimap(-20.5, -3.5);
  assert.ok(genUv.u > 0.8 && genUv.u <= 1 && genUv.v > 0.3 && genUv.v < 0.7);
  assert.ok(shopUv.u > 0.05 && shopUv.u < 0.3 && shopUv.v > 0.3 && shopUv.v < 0.7);
  const clamped = worldToMinimap(-999, 999);
  assert.equal(clamped.u, 0);
  assert.equal(clamped.v, 1);
});

test('Sprint 4 squad stances, focus target selection, spatial pan, adaptive music & run grading behave deterministically', () => {
  // Stance cycling & labels
  assert.equal(cycleSquadStance('follow'), 'hold');
  assert.equal(cycleSquadStance('hold'), 'focus');
  assert.equal(cycleSquadStance('focus'), 'follow');
  assert.match(getStanceMeta('hold').label, /ДЕРЖАТЬ/);
  assert.match(getStanceMeta('focus').label, /ФОКУС/);

  // Focus stance prioritizes Boss/Spitter near cursor over closer walker
  const candidates = [
    { id: 1, x: 2, z: 0, boss: false, ranged: false, armor: false },
    { id: 2, x: 9, z: 0, boss: false, ranged: true, armor: false },
    { id: 3, x: 14, z: 0, boss: true, ranged: false, armor: true },
  ];
  assert.equal(selectPriorityTarget(0, 0, 10, 0, 'follow', candidates), 1);
  assert.equal(selectPriorityTarget(0, 0, 13, 0, 'focus', candidates), 3);
  assert.equal(selectPriorityTarget(0, 0, 9, 0, 'focus', candidates.slice(0, 2)), 2);

  // Spatial stereo pan projects onto camera right axis cleanly
  assert.ok(computeSpatialPan(12, 0, 0, 0, 0) > 0.5);
  assert.ok(computeSpatialPan(-12, 0, 0, 0, 0) < -0.5);
  assert.equal(computeSpatialPan(0, 10, 0, 0, 0), 0);
  assert.equal(computeSpatialPan(999, 0, 0, 0, 0), 0.88);

  // Adaptive 3-stem music intensity
  assert.equal(computeMusicIntensity('title', 1, 9, false), 'ambient');
  assert.equal(computeMusicIntensity('playing', 1, 0, false), 'ambient');
  assert.equal(computeMusicIntensity('playing', 1, 5, false), 'combat');
  assert.equal(computeMusicIntensity('playing', 3, 4, true), 'boss');

  // Ammo crates & run grading
  assert.ok(AMMO_CRATE_SPAWNS.length >= 2);
  assert.equal(computeRunGrade(true, 110, 4, true), 'S');
  assert.equal(computeRunGrade(true, 180, 3, true), 'A');
  assert.equal(computeRunGrade(true, 260, 2, false), 'B');
  assert.equal(computeRunGrade(false, 90, 0, false), 'C');
});

test('Option 2+3 GLB normalization, animation clip matching, and engine level blueprint export work deterministically', () => {
  // Centimeter-authored character (180cm tall, floating at y=20..200) normalizes to 2.0m flush on Y=0
  const heroNorm = computeNormalizedModelTransform([-40, 20, -30], [40, 200, 30], 2.0, 'height');
  assert.ok(Math.abs(heroNorm.scale - 2.0 / 180) < 1e-6);
  assert.ok(Math.abs(heroNorm.offsetY + 20 * heroNorm.scale) < 1e-6);
  assert.equal(heroNorm.offsetX, 0);
  assert.equal(heroNorm.offsetZ, 0);

  // Vehicle authored along Z-axis (2.4m long, offset X=+1) scales cleanly to 4.8m length & centers X/Z
  const carNorm = computeNormalizedModelTransform([0, -0.5, -1.2], [2.0, 1.0, 1.2], 4.8, 'length');
  assert.ok(Math.abs(carNorm.scale - 2.0) < 1e-6);
  assert.ok(Math.abs(carNorm.offsetX + 2.0) < 1e-6);
  assert.ok(Math.abs(carNorm.offsetY - 1.0) < 1e-6);

  // Mixamo/Blender/Tripo animation clip matching
  const mixamoClips = ['mixamo.com|Rifle_Idle', 'mixamo.com|Run_Forward', 'Fire_Rifle', 'Death_Backward'];
  assert.equal(matchAnimationClipName(mixamoClips, 'idle'), 'mixamo.com|Rifle_Idle');
  assert.equal(matchAnimationClipName(mixamoClips, 'move'), 'mixamo.com|Run_Forward');
  assert.equal(matchAnimationClipName(mixamoClips, 'attack'), 'Fire_Rifle');
  assert.equal(matchAnimationClipName(mixamoClips, 'death'), 'Death_Backward');
  assert.equal(matchAnimationClipName(['CustomRigClip'], 'idle'), 'CustomRigClip');
  assert.equal(matchAnimationClipName([], 'move'), null);

  // Level blueprint export includes all 13 asset slots, 6 named zones, waves, and valid colliders
  assert.equal(ASSET_SLOT_SPECS.length, 13);
  const bp = buildLevelBlueprintExport([
    { x1: -10, z1: -5, x2: 10, z2: 5, tall: true },
    { x1: -999, z1: -999, x2: -999, z2: -999, tall: false },
  ]);
  assert.equal(bp.zones.length, 6);
  assert.equal(bp.colliders.length, 1);
  assert.equal(bp.assetSlots.length, 13);
  assert.ok(bp.waves.phase3.some((w) => w.type === 'tank'));
});

import {
  B1_PIT,
  computeDirectionalArmorDamage,
  computeWeaponSpread,
  consumeReserveForReload,
  DOWNED_BLEEDOUT_SEC,
  getTerrainHeightAt,
  OVERLOOK_DECK,
  REVIVE_DURATION_SEC,
  SHUTTER_COOLDOWN_SEC,
  SHUTTER_DURATION_SEC,
  SHUTTER_MAX_HP,
  SHUTTER_SPECS,
  updateDownedUnit,
  updateShutterState,
} from './rules';

test('multi-level terrain elevation returns Overlook high ground, B1 sunken pit, ramps, and street baseline', () => {
  assert.equal(getTerrainHeightAt(0, 10), 0);
  assert.equal(getTerrainHeightAt(0, 17.5), OVERLOOK_DECK.height);
  const midWestRamp = getTerrainHeightAt((OVERLOOK_DECK.westRampX1 + OVERLOOK_DECK.deckX1) * 0.5, 17.5);
  assert.ok(midWestRamp > 0.6 && midWestRamp < 0.9, `unexpected west ramp height ${midWestRamp}`);
  assert.equal(getTerrainHeightAt(25.4, -1.5), B1_PIT.depth);
  const midB1Ramp = getTerrainHeightAt((B1_PIT.rampX1 + B1_PIT.rampX2) * 0.5, 2.0);
  assert.ok(midB1Ramp < -0.5 && midB1Ramp > -0.75, `unexpected B1 ramp height ${midB1Ramp}`);
  assert.ok(getTerrainHeightAt(-5, 2.6) > 0.1);
});

test('security shutter state machine seals on [E], breaches on damage, and resets after cooldown', () => {
  assert.equal(SHUTTER_SPECS.length, 2);
  let state = { status: 'open' as const, timer: 0, hp: SHUTTER_MAX_HP, maxHp: SHUTTER_MAX_HP };
  const sealed = updateShutterState(state, 0.016, true, 0);
  assert.equal(sealed.justSealed, true);
  assert.equal(sealed.state.status, 'sealed');
  assert.equal(sealed.state.timer, SHUTTER_DURATION_SEC);

  const damaged = updateShutterState(sealed.state, 1.0, false, 60);
  assert.equal(damaged.state.status, 'sealed');
  assert.equal(damaged.state.hp, SHUTTER_MAX_HP - 60);

  const breached = updateShutterState(damaged.state, 0.2, false, 150);
  assert.equal(breached.justBreached, true);
  assert.equal(breached.state.status, 'cooldown');
  assert.equal(breached.state.timer, SHUTTER_COOLDOWN_SEC);

  const ready = updateShutterState(breached.state, SHUTTER_COOLDOWN_SEC + 0.5, false, 0);
  assert.equal(ready.justReady, true);
  assert.equal(ready.state.status, 'open');
  assert.equal(ready.state.hp, SHUTTER_MAX_HP);
});

test('directional flank armor rewards rear/flank shots and mitigates frontal hits', () => {
  // Enemy faces +Z (yaw = 0). Shot coming from +Z heading -Z hits their front chest -> deflect
  const front = computeDirectionalArmorDamage(50, true, false, 0, -1, 0);
  assert.equal(front.hitKind, 'armor_deflect');
  assert.equal(front.damage, 19);

  // Shot coming from -Z heading +Z hits their back -> flank crit!
  const back = computeDirectionalArmorDamage(50, true, false, 0, 1, 0);
  assert.equal(back.hitKind, 'flank_crit');
  assert.equal(back.damage, 65);

  // Armor-piercing ignores frontal armor
  const ap = computeDirectionalArmorDamage(50, true, true, 0, -1, 0);
  assert.equal(ap.hitKind, 'ap_pierce');
  assert.equal(ap.damage, 50);
});

test('weapon spread tightens when stationary, reserve ammo decrements on reload, and downed ally revives or bleeds out', () => {
  const still = computeWeaponSpread(0.06, false, false);
  const cover = computeWeaponSpread(0.06, false, true);
  const moving = computeWeaponSpread(0.06, true, false);
  assert.ok(cover < still && still < moving);

  const fullReload = consumeReserveForReload(8, 28, 100);
  assert.deepEqual(fullReload, { newMag: 28, newReserve: 80, loaded: 20 });
  const partialReload = consumeReserveForReload(4, 28, 10);
  assert.deepEqual(partialReload, { newMag: 14, newReserve: 0, loaded: 10 });

  // Revive pauses bleedout and finishes at REVIVE_DURATION_SEC
  const halfRevive = updateDownedUnit(DOWNED_BLEEDOUT_SEC, 0, true, true, 1.0, REVIVE_DURATION_SEC * 0.5);
  assert.equal(halfRevive.bleedoutTimer, DOWNED_BLEEDOUT_SEC);
  assert.ok(halfRevive.reviveProgress >= 0.49 && !halfRevive.revivedNow);

  const doneRevive = updateDownedUnit(DOWNED_BLEEDOUT_SEC, halfRevive.reviveProgress, true, true, 1.5, REVIVE_DURATION_SEC * 0.5);
  assert.equal(doneRevive.revivedNow, true);

  // Unattended bleedout reaches 0 and triggers bledOutNow
  const bled = updateDownedUnit(1.0, 0.2, false, false, 1.0, 1.5);
  assert.equal(bled.bledOutNow, true);
  assert.equal(bled.bleedoutTimer, 0);
});

import {
  computeTacticalCombatModifiers,
  COURTYARD_TERMINAL,
  EVAC_HOLD_SEC,
  isUnitInLowCover,
  TACTICAL_FOCUS_MAX,
  TACTICAL_SLOWMO_SCALE,
  updateCourtyardTerminal,
  updateEvacHoldCountdown,
  updateTacticalFocus,
} from './rules';

test('tactical slow-mo focus dilates simulation time, drains cleanly, and regenerates when inactive', () => {
  const activeStep = updateTacticalFocus(TACTICAL_FOCUS_MAX, true, 1.0);
  assert.equal(activeStep.slowMoActive, true);
  assert.equal(activeStep.timeScale, TACTICAL_SLOWMO_SCALE);
  assert.equal(activeStep.focus, TACTICAL_FOCUS_MAX - 1.0);

  const depleted = updateTacticalFocus(0.2, true, 0.5);
  assert.equal(depleted.slowMoActive, false);
  assert.equal(depleted.timeScale, 1.0);
  assert.equal(depleted.focus, 0);

  const regen = updateTacticalFocus(1.0, false, 1.0);
  assert.equal(regen.slowMoActive, false);
  assert.ok(regen.focus > 1.4 && regen.focus <= TACTICAL_FOCUS_MAX);
});

test('low cover and elevated Overlook high ground apply real combat bonuses', () => {
  const boxes: ColliderBox[] = [
    { x1: -2, z1: -2, x2: 2, z2: 2, tall: false },
    { x1: 10, z1: 10, x2: 14, z2: 14, tall: true },
  ];
  assert.equal(isUnitInLowCover(2.8, 0, boxes), true);
  assert.equal(isUnitInLowCover(14.5, 12, boxes), false); // tall wall is not low cover
  assert.equal(isUnitInLowCover(6.0, 0, boxes), false);

  const openStreet = computeTacticalCombatModifiers(0, false);
  assert.equal(openStreet.damageMult, 1.0);
  assert.equal(openStreet.rangedDamageTakenMult, 1.0);
  assert.equal(openStreet.inLowCover, false);
  assert.equal(openStreet.onHighGround, false);

  const lowCoverMods = computeTacticalCombatModifiers(0, true);
  assert.equal(lowCoverMods.rangedDamageTakenMult, 0.6);
  assert.ok(lowCoverMods.spreadMult < 0.8);

  const highGroundCover = computeTacticalCombatModifiers(OVERLOOK_DECK.height, true);
  assert.equal(highGroundCover.onHighGround, true);
  assert.equal(highGroundCover.damageMult, 1.2);
  assert.ok(highGroundCover.spreadMult < lowCoverMods.spreadMult);
});

test('Stage 2 Courtyard Med-Data Terminal and Stage 3 Evac Hold countdown progress deterministically', () => {
  // Locked terminal ignores presence until B1 power is restored
  const locked = updateCourtyardTerminal(0, true, 1.0, false, false);
  assert.equal(locked.progress, 0);
  assert.equal(locked.securedNow, false);

  // Unlocked terminal captures inside zone and secures at 1.0
  const half = updateCourtyardTerminal(0, true, COURTYARD_TERMINAL.captureTime * 0.5, true, false);
  assert.ok(half.progress >= 0.49 && !half.securedNow);
  const done = updateCourtyardTerminal(half.progress, true, COURTYARD_TERMINAL.captureTime * 0.6, true, false);
  assert.equal(done.progress, 1);
  assert.equal(done.securedNow, true);

  // Evac hold counts down from EVAC_HOLD_SEC and recovers slightly if player steps out
  const h1 = updateEvacHoldCountdown(EVAC_HOLD_SEC, true, 3.0, true);
  assert.equal(h1.remainingSec, EVAC_HOLD_SEC - 3.0);
  assert.equal(h1.extractedNow, false);
  const out = updateEvacHoldCountdown(h1.remainingSec, false, 1.0, true);
  assert.ok(out.remainingSec > h1.remainingSec);
  const extracted = updateEvacHoldCountdown(0.5, true, 0.8, true);
  assert.equal(extracted.extractedNow, true);
  assert.equal(extracted.remainingSec, 0);

  // Priority waypoint points to objective when active and no boss/evac overrides
  const objWp = computePriorityWaypoint(0, 0, null, [{ x: 2, z: 2 }], false, { x: COURTYARD_TERMINAL.x, z: COURTYARD_TERMINAL.z });
  assert.equal(objWp?.kind, 'objective');
  assert.equal(objWp?.x, COURTYARD_TERMINAL.x);
});
