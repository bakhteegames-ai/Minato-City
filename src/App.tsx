import { useEffect, useRef, useState } from 'react';
import { GameHud } from './components/GameHud';
import { StatusModal } from './components/StatusModal';
import { TitleOverlay } from './components/TitleOverlay';
import { MinatoEngine } from './game/MinatoEngine';
import type { HudSnapshot, ToastMessage } from './game/types';

const INITIAL_HUD: HudSnapshot = {
  state: 'title',
  phase: 1,
  totalPhases: 3,
  zoneName: 'ПЕРЕКРЁСТОК А-3 // «Café / 喫茶»',
  objective: 'Зачистите перекрёсток от заражённых, выходящих из галереи «中央商店街».',
  enemiesAlive: 0,
  kills: 0,
  flares: 3,
  barrelsRemaining: 5,
  stance: 'follow',
  musicIntensity: 'ambient',
  inspectMode: false,
  comicOutline: true,
  mood: 'night',
  muted: false,
  musicOn: true,
  rallyActive: false,
  evacActive: false,
  bossActive: false,
  bossHpPercent: 0,
  lowHpWarning: false,
  activeReload: {
    reloading: false,
    progress: 0,
    sweetStart: 0.44,
    sweetEnd: 0.64,
    jammed: false,
    overchargeLeft: 0,
    magAmmo: 28,
    magMax: 28,
  },
  generator: {
    active: false,
    charging: false,
    progress: 0,
    inRange: false,
  },
  minimap: {
    leaderU: 0.24,
    leaderV: 0.84,
    leaderYaw: 1.1,
    squad: [],
    enemies: [],
    pickups: [],
    holdPoint: null,
    generatorU: 0.9,
    generatorV: 0.54,
    generatorActive: false,
    evacU: 0.47,
    evacV: 0.86,
    evacActive: false,
  },
  units: [],
  assetSlots: [],
  summary: null,
};

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<MinatoEngine | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const engine = new MinatoEngine(container, {
      onHudUpdate: (snapshot) => {
        setHud(snapshot);
      },
      onToast: (nextToast) => {
        setToast(nextToast);
        if (toastTimerRef.current !== null) {
          window.clearTimeout(toastTimerRef.current);
        }
        toastTimerRef.current = window.setTimeout(() => {
          setToast(null);
        }, 2200);
      },
    });
    engineRef.current = engine;

    // Support ?autostart=1 (& optional ?zone=shop|courtyard|b1|arcade) for instant entry into gameplay
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      const rawZone = params.get('zone');
      const spawnZone =
        rawZone === 'shop' || rawZone === 'courtyard' || rawZone === 'b1' || rawZone === 'arcade'
          ? rawZone
          : undefined;
      engine.startGame(false, spawnZone);
    }

    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#0b0e1c]">
      {/* Isolated WebGL canvas mount — React HUD state updates never recreate this node */}
      <div
        ref={mountRef}
        className={`fixed inset-0 ${hud.state === 'playing' && !hud.inspectMode ? 'cursor-crosshair' : 'cursor-grab'}`}
      />

      {hud.state === 'title' && (
        <TitleOverlay
          mood={hud.mood}
          onStart={() => engineRef.current?.startGame()}
          onCycleMood={() => engineRef.current?.cycleMood()}
        />
      )}

      {hud.state === 'playing' && (
        <GameHud
          hud={hud}
          toast={toast}
          onSelectUnit={(idx) => engineRef.current?.selectUnit(idx)}
          onTriggerSkill={(idx) => engineRef.current?.triggerSkill(idx)}
          onTriggerReload={() => engineRef.current?.triggerReload()}
          onCycleStance={() => engineRef.current?.cycleStance()}
          onThrowFlare={() => engineRef.current?.throwFlare()}
          onToggleInspect={() => engineRef.current?.toggleInspectMode()}
          onCycleMood={() => engineRef.current?.cycleMood()}
          onToggleMusic={() => engineRef.current?.toggleMusic()}
          onToggleMute={() => engineRef.current?.toggleMute()}
          onTogglePause={() => engineRef.current?.togglePause()}
        />
      )}

      <StatusModal
        state={hud.state}
        summary={hud.summary}
        comicOutline={hud.comicOutline}
        assetSlots={hud.assetSlots}
        onResume={() => engineRef.current?.togglePause()}
        onRestart={() => engineRef.current?.startGame()}
        onReturnTitle={() => engineRef.current?.returnToTitle()}
        onToggleComicOutline={() => engineRef.current?.toggleComicOutline()}
        onUploadAssetGlb={(slot, file) => void engineRef.current?.uploadAssetGlb(slot, file)}
        onResetAssetSlot={(slot) => engineRef.current?.resetAssetSlot(slot)}
        onExportGreyboxGlb={() => void engineRef.current?.exportGreyboxGlb()}
        onExportBlueprintJson={() => engineRef.current?.exportLevelBlueprintJson()}
      />
    </main>
  );
}
