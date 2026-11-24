import { useState } from 'react';
import { getStanceMeta } from '../game/rules';
import type { HudSnapshot, SquadRole, ToastMessage } from '../game/types';
import { DistrictMinimap } from './DistrictMinimap';

interface GameHudProps {
  hud: HudSnapshot;
  toast: ToastMessage | null;
  onSelectUnit: (idx: number) => void;
  onTriggerSkill: (idx: number) => void;
  onTriggerReload: () => void;
  onCycleStance: () => void;
  onToggleSlowMo: () => void;
  onThrowFlare: () => void;
  onToggleInspect: () => void;
  onCycleMood: () => void;
  onToggleMusic: () => void;
  onToggleMute: () => void;
  onTogglePause: () => void;
  onInteract: () => void;
  onReviveHoldChange: (held: boolean) => void;
}

function RoleIcon({ role, color }: { role: SquadRole; color: string }) {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
      {role === 'leader' && (
        <path
          d="M12 3L14.8 8.6L21 9.5L16.5 13.8L17.6 20L12 17L6.4 20L7.5 13.8L3 9.5L9.2 8.6Z"
          fill={color}
          stroke="#0b0e1c"
          strokeWidth="1.6"
        />
      )}
      {role === 'medic' && (
        <path
          d="M9 4H15V9H20V15H15V20H9V15H4V9H9Z"
          fill={color}
          stroke="#0b0e1c"
          strokeWidth="1.6"
        />
      )}
      {role === 'heavy' && (
        <path
          d="M12 3L19 6.5V12.5C19 16.8 16 19.8 12 21C8 19.8 5 16.8 5 12.5V6.5Z"
          fill={color}
          stroke="#0b0e1c"
          strokeWidth="1.6"
        />
      )}
      {role === 'sniper' && (
        <g stroke={color} strokeWidth="2" fill="none">
          <circle cx="12" cy="12" r="6.5" />
          <line x1="12" y1="2" x2="12" y2="7" />
          <line x1="12" y1="17" x2="12" y2="22" />
          <line x1="2" y1="12" x2="7" y2="12" />
          <line x1="17" y1="12" x2="22" y2="12" />
        </g>
      )}
    </svg>
  );
}

export function GameHud({
  hud,
  toast,
  onSelectUnit,
  onTriggerSkill,
  onTriggerReload,
  onCycleStance,
  onToggleSlowMo,
  onThrowFlare,
  onToggleInspect,
  onCycleMood,
  onToggleMusic,
  onToggleMute,
  onTogglePause,
  onInteract,
  onReviveHoldChange,
}: GameHudProps) {
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const ar = hud.activeReload;
  const stanceMeta = getStanceMeta(hud.stance);
  const focusPct =
    hud.tactical.maxFocus > 0
      ? Math.max(0, Math.min(100, (hud.tactical.focus / hud.tactical.maxFocus) * 100))
      : 0;

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-3 sm:p-4">
      {/* Subtle low-HP peripheral crimson vignette */}
      {hud.lowHpWarning && !hud.inspectMode && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            boxShadow: 'inset 0 0 90px rgba(235, 45, 75, 0.45)',
          }}
        />
      )}

      {/* Subtle cool tactical rim when 0.22x Slow-Mo Command Mode is active */}
      {hud.tactical.slowMoActive && !hud.inspectMode && (
        <div
          className="fixed inset-0 pointer-events-none border-2 border-[#4ce0e8]/45"
          style={{
            boxShadow: 'inset 0 0 64px rgba(76, 224, 232, 0.22)',
          }}
        />
      )}

      {/* TOP BAR: Compact perimeter corners, center kept clear */}
      <div className="flex items-start justify-between gap-3">
        {/* Top-left: Zone, 3-Stage Operation Strip & Objective Plaque */}
        <div className="bg-[#0d1122]/92 border border-[#2c365c] px-3.5 py-2.5 max-w-[400px] shadow-[3px_3px_0_rgba(7,9,18,0.85)]">
          <div className="font-display text-xs font-bold tracking-[0.11em] text-[#4ce0e8] uppercase">
            {hud.zoneName.replace(/\s*\/\/\s*/g, ' · ')}
          </div>
          <div className="mt-1 flex items-center gap-2 font-display text-[9px] font-bold tracking-[0.13em] uppercase">
            <span className={hud.generator.active ? 'text-[#4ce0e8]' : 'text-[#f5b971]'}>
              {hud.generator.active ? '01 B1 ГОТОВО' : '01 ГЕНЕРАТОР B1'}
            </span>
            <span className="text-[#4a577d]">·</span>
            <span
              className={
                hud.courtyardTerminal.secured
                  ? 'text-[#4ce0e8]'
                  : hud.courtyardTerminal.unlocked
                    ? 'text-[#6ee782]'
                    : 'text-[#606d91]'
              }
            >
              {hud.courtyardTerminal.secured ? '02 ДВОР ГОТОВО' : '02 ДАННЫЕ M'}
            </span>
            <span className="text-[#4a577d]">·</span>
            <span className={hud.evacHold.active ? 'text-[#4ce0e8]' : hud.phase >= 3 ? 'text-[#ff5a72]' : 'text-[#606d91]'}>
              03 ТАНК / ЭВАК
            </span>
          </div>
          <p className="mt-1 text-xs leading-snug text-[#f4d8a2]">{hud.objective}</p>
        </div>

        {/* Top-right: Phase/Enemies Counter + Utility Buttons + Compact A-3 Schematic Radar */}
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-start gap-2">
            <div className="bg-[#0d1122]/90 border border-[#3a4a78] px-3 py-1.5 text-right shadow-[3px_3px_0_rgba(7,9,18,0.85)]">
              <div className="font-display text-[10px] font-bold tracking-[0.14em] text-[#4ce0e8] uppercase">
                ФАЗА {hud.phase} / {hud.totalPhases}
              </div>
              <div className="font-display text-lg font-bold leading-tight text-[#fff] tabular-nums">
                {hud.evacActive ? 'К ЗОНЕ [F]' : `${hud.enemiesAlive}`}
                {!hud.evacActive && (
                  <span className="ml-1 text-[10px] font-semibold tracking-wider text-[#9db0d9]">
                    ВРАГОВ
                  </span>
                )}
              </div>
            </div>

            <div className="pointer-events-auto flex items-center gap-1.5">
              <button
                type="button"
                tabIndex={-1}
                aria-label={hud.inspectMode ? 'Вернуться в бой' : 'Свободный осмотр камеры'}
                title="Осмотр камеры [V]"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onToggleInspect();
                }}
                className={`w-9 h-9 flex items-center justify-center border cursor-pointer transition-colors ${
                  hud.inspectMode
                    ? 'bg-[#4ce0e8] text-[#0b0e1c] border-[#4ce0e8]'
                    : 'bg-[#0d1122]/92 text-[#4ce0e8] border-[#3a4a78] hover:border-[#4ce0e8]'
                }`}
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>

              <button
                type="button"
                tabIndex={-1}
                aria-label="Сменить освещение сцены"
                title="Освещение: Ночь / День / Закат / Туман [T]"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onCycleMood();
                }}
                className="w-9 h-9 flex items-center justify-center bg-[#0d1122]/92 text-[#f5b971] border border-[#3a4a78] hover:border-[#f5b971] cursor-pointer transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                </svg>
              </button>

              <button
                type="button"
                tabIndex={-1}
                aria-label={hud.musicOn ? 'Выключить фоновый синт' : 'Включить фоновый синт'}
                title="Фоновый City Pop синт"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onToggleMusic();
                }}
                className={`w-9 h-9 flex items-center justify-center border cursor-pointer transition-colors ${
                  hud.musicOn
                    ? 'bg-[#0d1122]/92 text-[#f45b8a] border-[#f45b8a]/60 hover:border-[#f45b8a]'
                    : 'bg-[#0d1122]/92 text-[#6b789c] border-[#3a4a78] hover:border-[#9db0d9]'
                }`}
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
              </button>

              <button
                type="button"
                tabIndex={-1}
                aria-label={hud.muted ? 'Включить звук' : 'Выключить звук'}
                title="Звук [M]"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onToggleMute();
                }}
                className={`w-9 h-9 flex items-center justify-center border cursor-pointer transition-colors ${
                  hud.muted
                    ? 'bg-[#2a1522] text-[#ff5a72] border-[#ff5a72]/70'
                    : 'bg-[#0d1122]/92 text-[#dce6ff] border-[#3a4a78] hover:border-[#dce6ff]'
                }`}
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 5L6 9H2v6h4l5 4V5Z" />
                  {hud.muted ? (
                    <path d="M22 9l-6 6M16 9l6 6" />
                  ) : (
                    <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9.5 9.5 0 0 1 0 14" />
                  )}
                </svg>
              </button>

              <button
                type="button"
                tabIndex={-1}
                aria-label="Пауза"
                title="Пауза [Esc / P]"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onTogglePause();
                }}
                className="w-9 h-9 flex items-center justify-center bg-[#0d1122]/92 text-[#dce6ff] border border-[#3a4a78] hover:border-[#4ce0e8] cursor-pointer transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              </button>
            </div>
          </div>

          {!hud.inspectMode && <DistrictMinimap minimap={hud.minimap} />}
        </div>
      </div>

      {/* CENTER-TOP: Boss Health Bar (only when Tank Boss is active) */}
      {hud.bossActive && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 w-[min(420px,46vw)] bg-[#110c1a]/95 border border-[#ff3b52] px-3.5 py-2 shadow-[0_0_24px_rgba(255,59,82,0.35)]">
          <div className="flex items-center justify-between font-display text-xs font-bold tracking-[0.1em] text-[#ff6b7a] mb-1">
            <span>ТАНК — МИНИ-БОСС</span>
            <span className="tabular-nums">{hud.bossHpPercent}%</span>
          </div>
          <div className="h-2.5 bg-[#291320] overflow-hidden">
            <div
              className="h-full bg-[#ff3b52] transition-[width] duration-100"
              style={{ width: `${hud.bossHpPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* TACTICAL TOAST */}
      {toast && (
        <div
          key={toast.id}
          className="fixed top-20 left-1/2 -translate-x-1/2 bg-[#0d1122]/95 px-4 py-1.5 border font-display text-xs font-bold tracking-[0.1em] text-white uppercase shadow-[3px_3px_0_rgba(7,9,18,0.9)]"
          style={{ borderColor: toast.accent }}
        >
          {toast.text}
        </div>
      )}

      {/* BOTTOM UNIFIED COLLAPSIBLE TACTICAL DOCK */}
      <div className="flex flex-col items-center">
        {/* Contextual Active Reload Timing Bar / Overcharge Readout */}
        {ar.reloading && !hud.inspectMode && (
          <button
            type="button"
            tabIndex={-1}
            data-active-reload="true"
            onClick={(e) => {
              e.currentTarget.blur();
              onTriggerReload();
            }}
            className="pointer-events-auto mb-2 w-[260px] bg-[#0d1122]/95 border border-[#4ce0e8]/80 px-3 py-1.5 shadow-[3px_3px_0_rgba(7,9,18,0.9)] cursor-pointer"
          >
            <div className="flex items-center justify-between font-display text-[10px] font-bold tracking-[0.12em] uppercase mb-1">
              <span className={ar.jammed ? 'text-[#ff5a72]' : 'text-[#4ce0e8]'}>
                {ar.jammed ? 'ЗАКЛИНИЛО' : 'ПЕРЕЗАРЯДКА — НАЖМИ [R]'}
              </span>
              <span className="text-[#f5b971]">+35%</span>
            </div>
            <div className="relative h-2.5 bg-[#1b2238] border border-[#2f3b64]">
              {/* Sweet-spot highlight band */}
              <div
                className="absolute inset-y-0 bg-[#4ce0e8]/55 border-x border-[#4ce0e8]"
                style={{
                  left: `${ar.sweetStart * 100}%`,
                  width: `${(ar.sweetEnd - ar.sweetStart) * 100}%`,
                }}
              />
              {/* Moving active-reload cursor */}
              <div
                className={`absolute top-[-2px] bottom-[-2px] w-1.5 -translate-x-1/2 ${
                  ar.jammed ? 'bg-[#ff5a72]' : 'bg-[#fff8e7]'
                }`}
                style={{ left: `${Math.min(100, ar.progress * 100)}%` }}
              />
            </div>
          </button>
        )}

        {/* Contextual B1 Emergency Generator Charge Progress Bar */}
        {!hud.generator.active && (hud.generator.inRange || hud.generator.progress > 0.02) && !hud.inspectMode && (
          <div className="mb-2 w-[270px] bg-[#0d1122]/95 border border-[#f5b971] px-3 py-1.5 shadow-[3px_3px_0_rgba(7,9,18,0.9)]">
            <div className="flex items-center justify-between font-display text-[10px] font-bold tracking-[0.12em] uppercase mb-1">
              <span className="text-[#f5b971]">ЗАПУСК ГЕНЕРАТОРА B1</span>
              <span className="text-[#4ce0e8] tabular-nums">{Math.round(hud.generator.progress * 100)}%</span>
            </div>
            <div className="h-2 bg-[#1b2238] border border-[#2f3b64] overflow-hidden">
              <div
                className="h-full bg-[#4ce0e8] transition-[width] duration-75"
                style={{ width: `${Math.min(100, hud.generator.progress * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Contextual Stage 2 Courtyard Med-Data Terminal Capture Bar */}
        {!hud.courtyardTerminal.secured &&
          (hud.courtyardTerminal.inRange || hud.courtyardTerminal.progress > 0.02) &&
          !hud.inspectMode && (
            <div className="mb-2 w-[280px] bg-[#0d1122]/95 border border-[#6ee782] px-3 py-1.5 shadow-[3px_3px_0_rgba(7,9,18,0.9)]">
              <div className="flex items-center justify-between font-display text-[10px] font-bold tracking-[0.12em] uppercase mb-1">
                <span className="text-[#6ee782]">
                  {hud.courtyardTerminal.unlocked ? 'СБОР МЕД-ДАННЫХ (M)' : 'НЕТ ПИТАНИЯ — НУЖЕН B1'}
                </span>
                <span className="text-[#4ce0e8] tabular-nums">
                  {Math.round(hud.courtyardTerminal.progress * 100)}%
                </span>
              </div>
              <div className="h-2 bg-[#1b2238] border border-[#2f3b64] overflow-hidden">
                <div
                  className="h-full bg-[#6ee782] transition-[width] duration-75"
                  style={{ width: `${Math.min(100, hud.courtyardTerminal.progress * 100)}%` }}
                />
              </div>
            </div>
          )}

        {/* Contextual Stage 3 Evacuation 7s Hold Bar */}
        {hud.evacHold.active && !hud.inspectMode && (
          <div className="mb-2 w-[290px] bg-[#0d1122]/95 border border-[#4ce0e8] px-3 py-1.5 shadow-[3px_3px_0_rgba(7,9,18,0.9)]">
            <div className="flex items-center justify-between font-display text-[10px] font-bold tracking-[0.12em] uppercase mb-1">
              <span className="text-[#4ce0e8]">
                {hud.evacHold.holding ? 'УДЕРЖАНИЕ ЭВАКУАЦИИ' : 'ВОЙДИТЕ В ЗОНУ ЭВАКУАЦИИ [F]'}
              </span>
              <span className="text-white tabular-nums">{hud.evacHold.remainingSec.toFixed(1)}С</span>
            </div>
            <div className="h-2 bg-[#1b2238] border border-[#2f3b64] overflow-hidden">
              <div
                className="h-full bg-[#4ce0e8] transition-[width] duration-75"
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(0, ((hud.evacHold.totalSec - hud.evacHold.remainingSec) / hud.evacHold.totalSec) * 100),
                  )}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Contextual [E] World Interact Prompt (Security Shutters & Downed Ally Revive) */}
        {hud.interactPrompt && !hud.inspectMode && (
          <button
            type="button"
            tabIndex={-1}
            data-interact-prompt="true"
            onClick={(e) => {
              e.currentTarget.blur();
              onInteract();
            }}
            onPointerDown={() => {
              if (hud.interactPrompt?.kind === 'revive') onReviveHoldChange(true);
            }}
            onPointerUp={() => onReviveHoldChange(false)}
            onPointerLeave={() => onReviveHoldChange(false)}
            className="pointer-events-auto mb-2 min-w-[260px] max-w-[340px] bg-[#0d1122]/95 border px-3 py-1.5 shadow-[3px_3px_0_rgba(7,9,18,0.92)] cursor-pointer text-left"
            style={{ borderColor: hud.interactPrompt.accent }}
          >
            <div className="flex items-center justify-between gap-2 font-display text-[11px] font-bold tracking-[0.1em] uppercase">
              <span className="text-white">{hud.interactPrompt.label}</span>
              <span
                className="px-1.5 py-0.5 text-[10px] text-[#090b16] font-extrabold shrink-0"
                style={{ backgroundColor: hud.interactPrompt.accent }}
              >
                [{hud.interactPrompt.key}]
              </span>
            </div>
            {hud.interactPrompt.sublabel && (
              <div className="mt-0.5 text-[10px] text-[#b9c8e8] tracking-wide">
                {hud.interactPrompt.sublabel}
              </div>
            )}
            {typeof hud.interactPrompt.progress === 'number' && hud.interactPrompt.progress > 0 && (
              <div className="mt-1 h-1.5 bg-[#1b2238] border border-[#2f3b64] overflow-hidden">
                <div
                  className="h-full transition-[width] duration-75"
                  style={{
                    width: `${Math.min(100, Math.round(hud.interactPrompt.progress * 100))}%`,
                    backgroundColor: hud.interactPrompt.accent,
                  }}
                />
              </div>
            )}
          </button>
        )}

        {!ar.reloading && ar.overchargeLeft > 0 && !hud.inspectMode && (
          <div className="mb-1.5 bg-[#1c1509]/95 border border-[#f5b971] px-3 py-0.5 font-display text-[10px] font-bold tracking-[0.14em] uppercase text-[#f5b971] tabular-nums shadow-[2px_2px_0_rgba(7,9,18,0.85)]">
            ПЕРЕГРУЗКА ОРУЖИЯ +35% · {ar.overchargeLeft.toFixed(1)}С
          </div>
        )}

        {/* Active Tactical Positioning & Slow-Mo Command Readout */}
        {!hud.inspectMode && (hud.tactical.inLowCover || hud.tactical.onHighGround || hud.tactical.slowMoActive) && (
          <div
            data-testid="tactical-status-strip"
            className="mb-1.5 flex items-center gap-2 font-display text-[10px] font-bold tracking-[0.13em] uppercase"
          >
            {hud.tactical.slowMoActive && (
              <span className="bg-[#0b1f2a]/95 border border-[#4ce0e8] px-2.5 py-0.5 text-[#4ce0e8]">
                ТАКТИКА 0.22× · [ПРОБЕЛ]
              </span>
            )}
            {hud.tactical.onHighGround && (
              <span className="bg-[#21180b]/95 border border-[#f5b971] px-2.5 py-0.5 text-[#f5b971]">
                ВЫСОТА +20% УРОН
              </span>
            )}
            {hud.tactical.inLowCover && (
              <span className="bg-[#0e1f1c]/95 border border-[#6ee782] px-2.5 py-0.5 text-[#6ee782]">
                УКРЫТИЕ −40% ОГОНЬ
              </span>
            )}
          </div>
        )}

        <button
          type="button"
          tabIndex={-1}
          aria-label={dockCollapsed ? 'Показать панель отряда' : 'Скрыть панель отряда'}
          onClick={(e) => {
            e.currentTarget.blur();
            setDockCollapsed((prev) => !prev);
          }}
          className="pointer-events-auto mb-1 px-3 py-0.5 bg-[#0d1122]/90 border border-[#3a4a78] text-[10px] font-display font-bold tracking-[0.14em] uppercase text-[#9db0d9] hover:text-[#4ce0e8] cursor-pointer"
        >
          {dockCollapsed ? '▲ Отряд' : '▼ Скрыть'}
        </button>

        {!dockCollapsed && (
          <div className="pointer-events-auto w-full max-w-[1160px] flex flex-wrap lg:flex-nowrap items-stretch justify-center gap-2">
            {/* 4 Squad Cards */}
            {hud.units.map((u, idx) => {
              const hpPct = Math.max(0, Math.min(100, (u.hp / u.maxHp) * 100));
              const ghostPct = Math.max(hpPct, Math.min(100, (u.ghostHp / u.maxHp) * 100));
              const cdPct = u.skillMaxCd > 0 ? Math.min(100, (u.skillCd / u.skillMaxCd) * 100) : 0;
              const hpColor = hpPct > 50 ? '#4ade80' : hpPct > 25 ? '#f5b971' : '#ff3b52';

              return (
                <div
                  key={u.id}
                  className={`relative flex-1 min-w-[140px] max-w-[174px] bg-[#0d1122]/92 border px-2.5 py-2 transition-colors ${
                    u.down
                      ? 'border-[#ff3b52]/80 opacity-60'
                      : u.active
                        ? 'border-[#4ce0e8] bg-[#141d38]/95 shadow-[0_0_14px_rgba(76,224,232,0.28)]'
                        : 'border-[#2f3b64]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.currentTarget.blur();
                        onSelectUnit(idx);
                      }}
                      className="flex items-center gap-1.5 text-left cursor-pointer"
                      aria-label={`Выбрать бойца ${u.name}`}
                    >
                      <RoleIcon role={u.role} color={u.color} />
                      <span className="font-display text-[11px] font-bold tracking-wider" style={{ color: u.color }}>
                        {u.name}
                      </span>
                    </button>

                    <button
                      type="button"
                      tabIndex={-1}
                      disabled={u.down || u.skillCd > 0}
                      onClick={(e) => {
                        e.currentTarget.blur();
                        onTriggerSkill(idx);
                      }}
                      aria-label={`Навык ${u.skillName} клавиша ${idx + 1}`}
                      className="font-display text-[10px] font-bold px-1.5 py-0.5 bg-[#1f2947] border border-[#4ce0e8]/55 text-[#4ce0e8] disabled:opacity-45 cursor-pointer"
                    >
                      [{idx + 1}]
                    </button>
                  </div>

                  {/* Continuous HP bar with trailing damage ghost bar */}
                  <div className="relative h-1.5 bg-[#1b2238] overflow-hidden mb-1.5">
                    <div
                      className="absolute inset-y-0 left-0 bg-[#f45b8a]/70"
                      style={{ width: `${ghostPct}%` }}
                    />
                    <div
                      className="absolute inset-y-0 left-0"
                      style={{ width: `${hpPct}%`, backgroundColor: hpColor }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] leading-none mb-1">
                    <span className="text-[#c5d1ec] truncate pr-1">{u.skillName}</span>
                    <span
                      className="font-display font-bold tabular-nums shrink-0"
                      style={{ color: u.down ? '#ff3b52' : u.skillCd > 0 ? '#f45b8a' : '#4ce0e8' }}
                    >
                      {u.down ? 'РАНЕН' : u.skillCd > 0 ? `${u.skillCd.toFixed(1)}с` : 'ГОТОВ'}
                    </span>
                  </div>

                  {/* Magazine + Reserve Ammo or Downed Bleedout Bar */}
                  {u.down ? (
                    <div className="mt-0.5">
                      <div className="flex items-center justify-between text-[9px] leading-none font-display tracking-wider mb-1">
                        <span className="text-[#ff5a72] font-bold">
                          {u.bleedoutTimer > 0 ? 'ИСТЕКАЕТ · [E] ПОДНЯТЬ' : 'ПОТЕРЯН В БОЮ'}
                        </span>
                        <span className="font-bold tabular-nums text-[#ffd2d9]">
                          {u.bleedoutTimer > 0 ? `${Math.ceil(u.bleedoutTimer)}с` : '0с'}
                        </span>
                      </div>
                      <div className="h-1 bg-[#2b1019] overflow-hidden">
                        <div
                          className="h-full bg-[#ff3b52]"
                          style={{
                            width: `${u.bleedoutMax > 0 ? Math.max(0, Math.min(100, (u.bleedoutTimer / u.bleedoutMax) * 100)) : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-[9px] leading-none font-display tracking-wider">
                      <span className={u.overcharged ? 'text-[#f5b971] font-bold truncate pr-1' : 'text-[#8ea0c7] truncate pr-1'}>
                        {u.reloading ? 'ПЕРЕЗАРЯДКА' : u.overcharged ? 'УСИЛЕН +35%' : u.weaponRoleLabel}
                      </span>
                      <span
                        className="font-bold tabular-nums shrink-0"
                        style={{
                          color: u.reloading
                            ? '#4ce0e8'
                            : u.magAmmo <= Math.ceil(u.magMax * 0.25)
                              ? '#ff5a72'
                              : u.overcharged
                                ? '#f5b971'
                                : '#e2ebff',
                        }}
                      >
                        {u.magAmmo}/{u.reserveAmmo}
                      </span>
                    </div>
                  )}

                  {/* Skill cooldown progress line */}
                  <div
                    className="absolute bottom-0 left-0 h-[2px] bg-[#f45b8a]"
                    style={{ width: `${u.down ? 100 : cdPct}%` }}
                  />
                </div>
              );
            })}

            {/* Tactical Utility Readout: Slow-Mo Focus [Пробел] + Squad Stance [Q] + Kills + Flare [F] */}
            <div className="bg-[#0d1122]/92 border border-[#f5b971]/45 px-2.5 py-2 flex items-center gap-2">
              <button
                type="button"
                tabIndex={-1}
                data-testid="tactical-slowmo-btn"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onToggleSlowMo();
                }}
                aria-label="Тактическое замедление времени"
                title="Тактический фокус 0.22× [Пробел]"
                className={`flex flex-col items-stretch px-2.5 py-1 border cursor-pointer min-w-[92px] transition-colors ${
                  hud.tactical.slowMoActive
                    ? 'bg-[#10303d] border-[#4ce0e8]'
                    : 'bg-[#141c34] border-[#3a4a78] hover:border-[#4ce0e8]'
                }`}
              >
                <div className="flex items-center justify-between gap-1 font-display text-[9px] font-bold tracking-wider uppercase">
                  <span className={hud.tactical.slowMoActive ? 'text-[#4ce0e8]' : 'text-[#9db0d9]'}>
                    ТАКТИКА
                  </span>
                  <span className="text-[#dce6ff] tabular-nums">{hud.tactical.focus.toFixed(1)}с</span>
                </div>
                <div className="mt-1 h-1.5 bg-[#0c1120] overflow-hidden">
                  <div
                    className="h-full transition-[width] duration-75"
                    style={{
                      width: `${focusPct}%`,
                      backgroundColor: hud.tactical.slowMoActive ? '#4ce0e8' : '#7aa2d8',
                    }}
                  />
                </div>
                <span className="mt-0.5 text-[8px] font-display tracking-wider text-[#8fa4cc] text-left uppercase">
                  [ПРОБЕЛ]
                </span>
              </button>

              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onCycleStance();
                }}
                aria-label={`Сменить приказ отряду: ${stanceMeta.label}`}
                title="Приказ отряду [Q]: Следовать / Держать / Фокус"
                className="flex flex-col items-start px-2.5 py-1 bg-[#141c34] border hover:brightness-110 cursor-pointer min-w-[88px]"
                style={{ borderColor: stanceMeta.color }}
              >
                <span className="font-display text-[9px] font-bold tracking-wider text-[#9db0d9] uppercase">
                  ПРИКАЗ [Q]
                </span>
                <span
                  className="font-display text-[11px] font-bold tracking-wider uppercase leading-tight"
                  style={{ color: stanceMeta.color }}
                >
                  {stanceMeta.label}
                </span>
              </button>

              <div>
                <div className="font-display text-[9px] font-bold tracking-[0.14em] text-[#9db0d9] uppercase">
                  УБИТО
                </div>
                <div className="font-display text-lg font-bold leading-none text-[#f5b971] tabular-nums">
                  {hud.kills}
                </div>
              </div>

              <button
                type="button"
                tabIndex={-1}
                disabled={hud.flares <= 0}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onThrowFlare();
                }}
                aria-label="Бросить сигнальную шашку"
                className="flex flex-col items-center px-2.5 py-1 bg-[#241320] border border-[#ff5a72]/60 hover:border-[#ff5a72] disabled:opacity-40 cursor-pointer"
              >
                <span className="font-display text-[9px] font-bold tracking-wider text-[#ff758a]">
                  ШАШКА [F]
                </span>
                <span className="font-display text-sm font-bold text-white tabular-nums">
                  {hud.flares}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
