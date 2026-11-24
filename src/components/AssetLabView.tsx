import { useEffect, useRef, useState } from 'react';
import {
  ASSET_CATALOG,
  type LabLightPreset,
  type LabViewMode,
} from '../lab/assets/index';
import { AssetLabEngine, type AssetLabSnapshot } from '../lab/AssetLabEngine';

interface AssetLabViewProps {
  initialMode?: LabViewMode;
  onExitToGame: () => void;
}

const LIGHT_OPTIONS: readonly { id: LabLightPreset; label: string }[] = [
  { id: 'studio', label: 'Студия' },
  { id: 'tf2', label: 'TF2 Тепло/Холод' },
  { id: 'minato', label: 'Ночь Минато' },
];

export function AssetLabView({ initialMode = 'sedan', onExitToGame }: AssetLabViewProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<AssetLabEngine | null>(null);
  const statusTimerRef = useRef<number | null>(null);

  const [snapshot, setSnapshot] = useState<AssetLabSnapshot | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const engine = new AssetLabEngine(
      container,
      {
        onSnapshot: (snap) => setSnapshot(snap),
        onStatus: (msg) => {
          setStatusMsg(msg);
          if (statusTimerRef.current !== null) {
            window.clearTimeout(statusTimerRef.current);
          }
          statusTimerRef.current = window.setTimeout(() => setStatusMsg(null), 3200);
        },
      },
      initialMode,
    );
    engineRef.current = engine;

    return () => {
      if (statusTimerRef.current !== null) {
        window.clearTimeout(statusTimerRef.current);
      }
      engine.dispose();
      engineRef.current = null;
    };
  }, [initialMode]);

  const handleExport = async () => {
    if (!engineRef.current || exporting) return;
    setExporting(true);
    try {
      await engineRef.current.exportCurrentGlb();
    } catch {
      setStatusMsg('Ошибка экспорта GLB');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#232730] text-[#e8ecf4] select-none">
      {/* Full-bleed unobstructed 3D Studio Viewport */}
      <div ref={mountRef} className="fixed inset-0 cursor-grab active:cursor-grabbing" />

      {/* Top-Left Minimal Look-Dev Header & Live Topology Readout */}
      <header className="fixed top-4 left-4 right-4 z-10 pointer-events-none flex items-start justify-between gap-4">
        <div className="pointer-events-auto bg-[#14171f]/82 backdrop-blur-sm border border-white/12 px-4 py-3 max-w-xl">
          <div className="flex items-center gap-3">
            <span className="font-display text-[11px] font-bold tracking-[0.2em] uppercase text-[#e6b35a]">
              ASSET LAB · 3D LOOK-DEV
            </span>
            <span className="text-white/25">|</span>
            <span className="text-[11px] tracking-wider text-[#9ba5b8] uppercase">
              {snapshot?.category ?? 'Загрузка...'}
            </span>
          </div>
          <h1 className="font-display text-lg sm:text-xl font-bold tracking-wide text-[#f4f6fa] mt-0.5 leading-snug">
            {snapshot?.title ?? 'Инициализация сцены...'}
          </h1>

          {snapshot && (
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs font-mono text-[#c5cedf] tabular-nums">
              <span>
                Треугольники:{' '}
                <strong className="text-[#f4f6fa]" data-testid="lab-triangles">
                  {snapshot.stats.triangles.toLocaleString('ru-RU')}
                </strong>
              </span>
              <span>
                Вершины:{' '}
                <strong className="text-[#f4f6fa]">
                  {snapshot.stats.vertices.toLocaleString('ru-RU')}
                </strong>
              </span>
              <span>
                Меши: <strong className="text-[#f4f6fa]">{snapshot.stats.meshes}</strong>
              </span>
              <span>
                Габариты:{' '}
                <strong className="text-[#e6b35a]">
                  {snapshot.stats.width}×{snapshot.stats.height}×{snapshot.stats.depth} м
                </strong>
              </span>
            </div>
          )}
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          {statusMsg && (
            <div className="bg-[#14171f]/90 border border-[#62e6f5]/40 text-[#c9f4fa] text-xs px-3 py-2 font-mono">
              {statusMsg}
            </div>
          )}
          <button
            type="button"
            onClick={onExitToGame}
            className="font-display cursor-pointer bg-[#14171f]/88 hover:bg-[#232938] text-[#e8ecf4] border border-white/18 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition-colors"
          >
            ← В игру
          </button>
        </div>
      </header>

      {/* Bottom Collapsible Workbench Dock — Zero Center Viewport Occlusion */}
      <footer className="fixed bottom-4 left-4 right-4 z-10 pointer-events-none flex flex-col items-center gap-2">
        {dockCollapsed ? (
          <button
            type="button"
            onClick={() => setDockCollapsed(false)}
            className="pointer-events-auto font-display cursor-pointer bg-[#14171f]/88 hover:bg-[#1e2330] border border-white/15 px-4 py-2 text-xs uppercase tracking-[0.14em] text-[#d6deec]"
          >
            Показать панель Asset Lab
          </button>
        ) : (
          <div className="pointer-events-auto w-full max-w-[1220px] bg-[#14171f]/86 backdrop-blur-sm border border-white/14 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
            {/* Asset Switcher (5 Benchmark Objects + All-5 Scale Lineup) */}
            <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Эталонные объекты">
              {ASSET_CATALOG.map((item) => {
                const active = snapshot?.mode === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-asset-tab={item.id}
                    onClick={() => engineRef.current?.selectMode(item.id)}
                    className={`font-display cursor-pointer px-2.5 py-1.5 text-xs font-semibold tracking-wider uppercase border transition-colors ${
                      active
                        ? 'bg-[#e6b35a] text-[#12151c] border-[#e6b35a]'
                        : 'bg-[#1c212c] text-[#ced6e6] border-white/10 hover:border-white/30 hover:text-white'
                    }`}
                  >
                    {item.shortLabel}
                  </button>
                );
              })}
              <button
                type="button"
                data-asset-tab="all"
                onClick={() => engineRef.current?.selectMode('all')}
                className={`font-display cursor-pointer px-2.5 py-1.5 text-xs font-semibold tracking-wider uppercase border transition-colors ${
                  snapshot?.mode === 'all'
                    ? 'bg-[#62e6f5] text-[#0e131b] border-[#62e6f5]'
                    : 'bg-[#1c212c] text-[#9adfe8] border-[#62e6f5]/25 hover:border-[#62e6f5]/60'
                }`}
              >
                Все 5 (1:1)
              </button>
            </div>

            {/* Lighting, Inspection Modes & GLB Export */}
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="flex items-center border border-white/12 bg-[#1a1e28]">
                {LIGHT_OPTIONS.map((opt) => {
                  const active = snapshot?.lightPreset === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      data-light={opt.id}
                      onClick={() => engineRef.current?.setLightPreset(opt.id)}
                      className={`cursor-pointer px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                        active
                          ? 'bg-[#364156] text-white'
                          : 'text-[#9aa5b8] hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                data-toggle-wireframe="true"
                onClick={() => engineRef.current?.setWireframe(!(snapshot?.wireframe ?? false))}
                className={`cursor-pointer px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider border transition-colors ${
                  snapshot?.wireframe
                    ? 'bg-[#62e6f5]/20 text-[#8ff2fc] border-[#62e6f5]'
                    : 'bg-[#1c212c] text-[#c3ccdc] border-white/12 hover:border-white/30'
                }`}
              >
                Сетка
              </button>

              <button
                type="button"
                data-toggle-ink="true"
                onClick={() => engineRef.current?.setCreaseInk(!(snapshot?.creaseInk ?? true))}
                className={`cursor-pointer px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider border transition-colors ${
                  snapshot?.creaseInk
                    ? 'bg-[#e6b35a]/18 text-[#f2cb82] border-[#e6b35a]/70'
                    : 'bg-[#1c212c] text-[#c3ccdc] border-white/12 hover:border-white/30'
                }`}
              >
                Контур
              </button>

              <button
                type="button"
                onClick={() => engineRef.current?.resetCamera()}
                className="cursor-pointer px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider border border-white/12 bg-[#1c212c] text-[#c3ccdc] hover:border-white/30 hover:text-white transition-colors"
              >
                Сброс
              </button>

              <button
                type="button"
                data-export-glb="true"
                disabled={exporting}
                onClick={() => void handleExport()}
                className="font-display cursor-pointer px-3 py-1.5 text-xs font-bold uppercase tracking-wider bg-[#c8513c] hover:bg-[#dc5e47] disabled:opacity-60 text-white border border-[#f29584]/40 transition-colors"
              >
                {exporting ? 'Экспорт...' : 'Экспорт .GLB'}
              </button>

              <button
                type="button"
                onClick={() => setDockCollapsed(true)}
                title="Скрыть панель"
                className="cursor-pointer px-2 py-1.5 text-[11px] text-[#95a0b3] hover:text-white border border-white/10 bg-[#1a1e28]"
              >
                Скрыть
              </button>
            </div>
          </div>
        )}
      </footer>
    </div>
  );
}
