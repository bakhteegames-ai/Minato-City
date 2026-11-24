import { useRef, useState } from 'react';
import { Box, Download, FileJson, RotateCcw, Sparkles, Upload } from 'lucide-react';
import type {
  AssetSlotCategory,
  AssetSlotId,
  AssetSlotStatus,
  GamePhaseState,
  RunSummary,
} from '../game/types';

interface StatusModalProps {
  state: GamePhaseState;
  summary: RunSummary | null;
  comicOutline: boolean;
  assetSlots: AssetSlotStatus[];
  onResume: () => void;
  onRestart: () => void;
  onReturnTitle: () => void;
  onToggleComicOutline: () => void;
  onUploadAssetGlb: (slot: AssetSlotId, file: File) => void;
  onResetAssetSlot: (slot: AssetSlotId) => void;
  onExportGreyboxGlb: () => void;
  onExportBlueprintJson: () => void;
}

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export function StatusModal({
  state,
  summary,
  comicOutline,
  assetSlots,
  onResume,
  onRestart,
  onReturnTitle,
  onToggleComicOutline,
  onUploadAssetGlb,
  onResetAssetSlot,
  onExportGreyboxGlb,
  onExportBlueprintJson,
}: StatusModalProps) {
  const [pauseTab, setPauseTab] = useState<'pause' | 'studio'>('pause');
  const [slotCategory, setSlotCategory] = useState<AssetSlotCategory>('hero');
  const [pendingSlot, setPendingSlot] = useState<AssetSlotId | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (state !== 'paused' && state !== 'victory' && state !== 'defeat') {
    return null;
  }

  const isPaused = state === 'paused';
  const isVictory = state === 'victory';
  const showStudio = isPaused && pauseTab === 'studio';
  const loadedCount = assetSlots.filter((s) => s.loaded).length;
  const visibleSlots = assetSlots.filter((s) => s.category === slotCategory);

  const handlePickFile = (slot: AssetSlotId) => {
    setPendingSlot(slot);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#070a16]/80"
      role="dialog"
      aria-modal="true"
      aria-labelledby="status-modal-title"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
        className="hidden"
        onChange={(ev) => {
          const file = ev.target.files?.[0];
          if (file && pendingSlot) {
            onUploadAssetGlb(pendingSlot, file);
          }
          setPendingSlot(null);
        }}
      />

      <div
        className={`w-full ${
          showStudio ? 'max-w-xl' : 'max-w-md'
        } bg-[#11162b] border-2 border-[#f45b8a]/70 p-6 shadow-[8px_8px_0_#070a16] transition-all`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="font-display text-xs font-bold tracking-[0.2em] text-[#4ce0e8] uppercase">
            {isPaused
              ? '港都 MINATO CITY // ПАУЗА'
              : isVictory
                ? '港都 MINATO CITY // ЭВАКУАЦИЯ'
                : 'КВАРТАЛ А-3 // ПОРАЖЕНИЕ'}
          </div>

          {isPaused && (
            <div className="flex border border-[#32406d] bg-[#0b0e1c]">
              <button
                type="button"
                data-testid="tab-pause-main"
                onClick={() => setPauseTab('pause')}
                className={`font-display cursor-pointer px-2.5 py-1 text-[10px] font-bold tracking-[0.12em] uppercase transition-colors ${
                  pauseTab === 'pause'
                    ? 'bg-[#4ce0e8] text-[#0b0e1c]'
                    : 'text-[#9db0d9] hover:text-white'
                }`}
              >
                Пауза
              </button>
              <button
                type="button"
                data-testid="tab-asset-studio"
                onClick={() => setPauseTab('studio')}
                className={`font-display cursor-pointer px-2.5 py-1 text-[10px] font-bold tracking-[0.12em] uppercase transition-colors flex items-center gap-1.5 ${
                  pauseTab === 'studio'
                    ? 'bg-[#f45b8a] text-white'
                    : 'text-[#9db0d9] hover:text-white'
                }`}
              >
                <Box className="w-3 h-3" />
                3D Ассеты / Экспорт
              </button>
            </div>
          )}
        </div>

        <h2
          id="status-modal-title"
          className="mt-1.5 font-display text-2xl font-bold tracking-wide text-[#f7f4eb] uppercase"
        >
          {showStudio
            ? '3D-пайплайн (.GLB) и экспорт'
            : isPaused
              ? 'Операция приостановлена'
              : isVictory
                ? 'Перекрёсток зачищен!'
                : 'Отряд погиб'}
        </h2>

        {!isPaused && summary && (
          <div className="mt-5 space-y-2.5">
            <div className="grid grid-cols-4 gap-2">
              <div className="bg-[#0b0e1c] border border-[#f5b971]/60 p-2.5 text-center">
                <div className="font-display text-[9px] tracking-[0.14em] text-[#9db0d9] uppercase">
                  РАНГ
                </div>
                <div
                  className="mt-0.5 font-display text-2xl font-black leading-none"
                  style={{
                    color:
                      summary.grade === 'S'
                        ? '#4ce0e8'
                        : summary.grade === 'A'
                          ? '#f5b971'
                          : summary.grade === 'B'
                            ? '#f45b8a'
                            : '#9db0d9',
                  }}
                >
                  {summary.grade}
                </div>
              </div>
              <div className="bg-[#0b0e1c] border border-[#2c365c] p-2.5 text-center">
                <div className="font-display text-[9px] tracking-[0.14em] text-[#9db0d9] uppercase">
                  ВРЕМЯ
                </div>
                <div className="mt-1 font-display text-lg font-bold text-[#4ce0e8] tabular-nums">
                  {formatTime(summary.timeSeconds)}
                </div>
              </div>
              <div className="bg-[#0b0e1c] border border-[#2c365c] p-2.5 text-center">
                <div className="font-display text-[9px] tracking-[0.14em] text-[#9db0d9] uppercase">
                  УБИТО
                </div>
                <div className="mt-1 font-display text-lg font-bold text-[#f5b971] tabular-nums">
                  {summary.kills}
                </div>
              </div>
              <div className="bg-[#0b0e1c] border border-[#2c365c] p-2.5 text-center">
                <div className="font-display text-[9px] tracking-[0.14em] text-[#9db0d9] uppercase">
                  {isVictory ? 'В СТРОЮ' : 'ФАЗА'}
                </div>
                <div className="mt-1 font-display text-lg font-bold text-[#f45b8a] tabular-nums">
                  {isVictory ? `${summary.survivorsAlive}/4` : `${summary.phaseReached}/3`}
                </div>
              </div>
            </div>
            <div className="bg-[#0b0e1c] border border-[#2c365c] px-3 py-1.5 flex items-center justify-between font-display text-[10px] tracking-[0.12em] uppercase">
              <span className="text-[#9db0d9]">ГЕНЕРАТОР B1 «立体駐車場»</span>
              <span className={summary.generatorActivated ? 'text-[#4ce0e8] font-bold' : 'text-[#6e7ca4]'}>
                {summary.generatorActivated ? '⚡ АКТИВИРОВАН' : 'НЕ ЗАПУЩЕН'}
              </span>
            </div>
          </div>
        )}

        {isPaused && !showStudio && (
          <p className="mt-3 text-sm text-[#c2cee8] leading-relaxed">
            WASD — бег · Shift — перекат · ЛКМ — огонь · R — активная перезарядка · Q — приказ отряду (Следовать / Держать / Фокус) · Tab — смена бойца · 1–4 — навыки · F — шашка · V — осмотр 3D-сцены · T — освещение.
          </p>
        )}

        {showStudio && (
          <div className="mt-4 space-y-3.5">
            {/* Screen-Space Comic Outline Shader + Option 3 Engine Exporters */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                data-testid="btn-toggle-outline"
                onClick={onToggleComicOutline}
                className={`font-display cursor-pointer px-3 py-2.5 border text-left transition-colors ${
                  comicOutline
                    ? 'bg-[#172844] border-[#4ce0e8] text-[#4ce0e8]'
                    : 'bg-[#0b0e1c] border-[#2c365c] text-[#9db0d9]'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-bold tracking-[0.12em] uppercase">
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    Ink-шейдер
                  </span>
                  <span>{comicOutline ? 'ВКЛ' : 'ВЫКЛ'}</span>
                </div>
                <div className="mt-0.5 text-[10px] text-[#b4c4e4] font-sans">
                  Depth + Normal Sobel
                </div>
              </button>

              <button
                type="button"
                data-testid="btn-export-glb"
                onClick={onExportGreyboxGlb}
                className="font-display cursor-pointer px-3 py-2.5 bg-[#192342] hover:bg-[#23325c] border border-[#f5b971]/60 text-[#f5b971] text-left transition-colors"
              >
                <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.12em] uppercase">
                  <Download className="w-3.5 h-3.5" />
                  Сцена А-3 (.GLB)
                </div>
                <div className="mt-0.5 text-[10px] text-[#c2cee8] font-sans">
                  Blender / Godot / UE5
                </div>
              </button>

              <button
                type="button"
                data-testid="btn-export-blueprint"
                onClick={onExportBlueprintJson}
                className="font-display cursor-pointer px-3 py-2.5 bg-[#192342] hover:bg-[#23325c] border border-[#f45b8a]/60 text-[#f45b8a] text-left transition-colors"
              >
                <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.12em] uppercase">
                  <FileJson className="w-3.5 h-3.5" />
                  Схема (.JSON)
                </div>
                <div className="mt-0.5 text-[10px] text-[#c2cee8] font-sans">
                  Коллайдеры и волны
                </div>
              </button>
            </div>

            {/* Category selector for 13 GLB Hot-Swap Slots */}
            <div className="bg-[#0b0e1c] border border-[#2c365c] p-3">
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#222c4d]">
                <div className="flex gap-1.5">
                  {(
                    [
                      ['hero', 'Отряд (4)'],
                      ['vehicle', 'Машины (4)'],
                      ['enemy', 'Враги (5)'],
                    ] as const
                  ).map(([cat, title]) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSlotCategory(cat)}
                      className={`font-display cursor-pointer px-2.5 py-1 text-[10px] font-bold tracking-[0.1em] uppercase border transition-colors ${
                        slotCategory === cat
                          ? 'bg-[#22325e] border-[#4ce0e8] text-[#4ce0e8]'
                          : 'bg-[#11162b] border-[#2c365c] text-[#9db0d9] hover:text-white'
                      }`}
                    >
                      {title}
                    </button>
                  ))}
                </div>
                <span className="font-display text-[10px] tracking-[0.1em] text-[#9db0d9] uppercase tabular-nums">
                  GLB: {loadedCount}/{assetSlots.length}
                </span>
              </div>

              <div className="mt-2.5 space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {visibleSlots.map((slot) => (
                  <div
                    key={slot.id}
                    className="flex items-center justify-between gap-2 bg-[#11162b] border border-[#242f54] px-2.5 py-1.5"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-display text-xs font-bold text-[#f7f4eb] uppercase">
                          {slot.label}
                        </span>
                        <span
                          className={`font-display text-[9px] px-1.5 py-0.5 uppercase tracking-[0.08em] border ${
                            slot.loaded
                              ? 'border-[#4ce0e8]/70 text-[#4ce0e8] bg-[#4ce0e8]/10'
                              : 'border-[#3b4870] text-[#8fa2cc]'
                          }`}
                        >
                          {slot.loaded ? `GLB · ${slot.clipCount} аним.` : 'Грейбокс'}
                        </span>
                      </div>
                      {slot.sourceName && (
                        <div className="text-[10px] text-[#9db0d9] truncate">
                          {slot.sourceName}
                          {slot.matchedClips.length > 0 ? ` (${slot.matchedClips.join(', ')})` : ''}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handlePickFile(slot.id)}
                        className="font-display cursor-pointer px-2.5 py-1 bg-[#1b284d] hover:bg-[#27396b] border border-[#4ce0e8]/55 text-[#4ce0e8] text-[10px] font-bold tracking-[0.08em] uppercase flex items-center gap-1 transition-colors"
                      >
                        <Upload className="w-3 h-3" />
                        .GLB
                      </button>
                      {slot.loaded && (
                        <button
                          type="button"
                          onClick={() => onResetAssetSlot(slot.id)}
                          title="Вернуть процедурный грейбокс"
                          className="cursor-pointer p-1 bg-[#1b223d] hover:bg-[#2c365c] border border-[#f5b971]/45 text-[#f5b971] transition-colors"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <p className="mt-2.5 text-[11px] text-[#9db0d9] leading-snug">
                Поддерживаются модели .GLB из Blender, Mixamo, Meshy и Tripo: авто-масштаб (2 м / 4.8 м), привязка к земле и клипы Idle / Run / Attack / Death. Для автозагрузки сложите файлы в{' '}
                <span className="text-[#4ce0e8] font-mono">public/models/manifest.json</span>.
              </p>
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-col gap-2.5">
          {isPaused ? (
            <button
              type="button"
              onClick={onResume}
              className="font-display cursor-pointer w-full py-3 bg-[#4ce0e8] hover:bg-[#6aeaf0] text-[#0b0e1c] font-bold tracking-[0.14em] uppercase text-sm border-2 border-[#0b0e1c] transition-colors"
            >
              Продолжить бой
            </button>
          ) : (
            <button
              type="button"
              data-start="true"
              onClick={onRestart}
              className="font-display cursor-pointer w-full py-3 bg-[#e64572] hover:bg-[#f25782] text-white font-bold tracking-[0.14em] uppercase text-sm border-2 border-[#0b0e1c] transition-colors"
            >
              {isVictory ? 'Сыграть ещё раз' : 'Повторить штурм'}
            </button>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            {isPaused && (
              <button
                type="button"
                onClick={onRestart}
                className="font-display cursor-pointer py-2.5 bg-[#1a2240] hover:bg-[#243059] text-[#f5b971] font-bold tracking-[0.1em] uppercase text-xs border border-[#f5b971]/45 transition-colors"
              >
                Заново
              </button>
            )}
            <button
              type="button"
              onClick={onReturnTitle}
              className={`font-display cursor-pointer py-2.5 bg-[#1a2240] hover:bg-[#243059] text-[#cfd8f2] font-bold tracking-[0.1em] uppercase text-xs border border-[#3a4a78] transition-colors ${
                isPaused ? '' : 'col-span-2'
              }`}
            >
              На титульный экран
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
