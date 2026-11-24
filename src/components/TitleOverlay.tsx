import type { LightingMood } from '../game/types';

interface TitleOverlayProps {
  mood: LightingMood;
  onStart: () => void;
  onCycleMood: () => void;
}

const MOOD_LABELS: Record<LightingMood, string> = {
  night: 'Ночь · Неон',
  sunset: 'Закат · City Pop',
  mist: 'Портовый туман',
};

export function TitleOverlay({ mood, onStart, onCycleMood }: TitleOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-6 sm:p-10"
      style={{
        background:
          'radial-gradient(circle at 72% 55%, rgba(9, 12, 24, 0.08) 0%, rgba(9, 12, 24, 0.62) 68%, rgba(8, 10, 20, 0.84) 100%)',
      }}
    >
      {/* Upper-left negative-space bespoke SVG title lockup & primary Start CTA */}
      <div className="pointer-events-auto max-w-md pt-2 sm:pt-6">
        <svg
          viewBox="0 0 420 144"
          className="w-full max-w-[390px] h-auto overflow-visible"
          role="img"
          aria-label="港都 MINATO CITY"
        >
          {/* Retro striped outrun sun crest matching Concept Art 1 */}
          <defs>
            <clipPath id="minato-sun-clip">
              <circle cx="52" cy="54" r="42" />
            </clipPath>
          </defs>
          <g clipPath="url(#minato-sun-clip)">
            <circle cx="52" cy="54" r="42" fill="#e84b72" />
            <rect x="8" y="10" width="88" height="26" fill="#f58b62" />
            <rect x="8" y="62" width="88" height="4" fill="#0d1122" />
            <rect x="8" y="71" width="88" height="5" fill="#0d1122" />
            <rect x="8" y="81" width="88" height="6" fill="#0d1122" />
            {/* Harbor crane & lighthouse silhouette inside sun */}
            <path
              d="M18 96 L18 70 L28 70 L28 96 M23 70 L45 55 L48 58 L27 72 M72 96 L75 62 L81 62 L84 96"
              fill="#111526"
            />
          </g>
          <circle cx="52" cy="54" r="42" fill="none" stroke="#111526" strokeWidth="3.5" />

          {/* Japanese Kanji Title */}
          <text
            x="108"
            y="64"
            fill="#f7f4eb"
            stroke="#0b0e1c"
            strokeWidth="7"
            paintOrder="stroke fill"
            fontFamily="'Noto Sans JP', sans-serif"
            fontWeight="900"
            fontSize="54"
            letterSpacing="4"
          >
            港都
          </text>
          {/* Latin Display Subtitle */}
          <text
            x="110"
            y="96"
            fill="#f5b971"
            stroke="#0b0e1c"
            strokeWidth="5"
            paintOrder="stroke fill"
            fontFamily="'Chakra Petch', sans-serif"
            fontWeight="700"
            fontSize="24"
            letterSpacing="6"
          >
            MINATO CITY
          </text>
          {/* Sector plate accent rule */}
          <rect x="110" y="108" width="248" height="3" fill="#4ce0e8" />
          <text
            x="110"
            y="128"
            fill="#cfd8f2"
            fontFamily="'Chakra Petch', sans-serif"
            fontWeight="600"
            fontSize="13"
            letterSpacing="2.4"
          >
            КВАРТАЛ А-3 · ПЕРЕКРЁСТОК
          </text>
        </svg>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-start="true"
            onClick={(e) => {
              e.currentTarget.blur();
              onStart();
            }}
            className="font-display cursor-pointer bg-[#e64572] hover:bg-[#f25782] active:translate-y-[1px] text-[#fff8fa] font-bold tracking-[0.14em] uppercase text-base px-8 py-3.5 border-2 border-[#121628] shadow-[4px_4px_0_#121628] transition-colors"
          >
            Войти на перекрёсток
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              onCycleMood();
            }}
            className="font-display cursor-pointer bg-[#141a30]/95 hover:bg-[#1d2645] text-[#4ce0e8] font-semibold tracking-[0.1em] uppercase text-xs px-4 py-3.5 border border-[#4ce0e8]/45 shadow-[3px_3px_0_#0b0e1c] transition-colors"
          >
            {MOOD_LABELS[mood]}
          </button>
        </div>
      </div>

      {/* Flat borderless control-hint line in bottom safe margin */}
      <div className="text-xs sm:text-[13px] tracking-wide text-[#cfd8f2]/85 hud-text-stroke">
        WASD Бег · Shift Перекат · ЛКМ Огонь · R Перезарядка · F Шашка · Tab Боец · 1–4 Навыки · V Осмотр · Esc Пауза
      </div>
    </div>
  );
}
