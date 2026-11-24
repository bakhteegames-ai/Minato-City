import { useState } from 'react';
import type { MinimapSnapshot } from '../game/types';

interface DistrictMinimapProps {
  minimap: MinimapSnapshot;
}

const W = 186;
const H = 132;

function px(u: number): number {
  return 6 + u * (W - 12);
}

function py(v: number): number {
  return 6 + v * (H - 12);
}

/**
 * Compact A-3 District Tactical Schematic Radar (styled after Concept Art Sheet 1 "СХЕМА КВАРТАЛА").
 * Shows walkable Record Shop interior, Sakura Courtyard + Service Passage, Arcade, Parking B1 Generator,
 * live squad dots, enemy contacts, supplies, and extraction zone.
 */
export function DistrictMinimap({ minimap }: DistrictMinimapProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="pointer-events-auto flex flex-col items-end">
      <button
        type="button"
        tabIndex={-1}
        aria-label={collapsed ? 'Показать схему квартала А-3' : 'Скрыть схему квартала А-3'}
        onClick={(e) => {
          e.currentTarget.blur();
          setCollapsed((v) => !v);
        }}
        className="mb-1 px-2 py-0.5 bg-[#0d1122]/90 border border-[#3a4a78] font-display text-[9px] font-bold tracking-[0.14em] uppercase text-[#9db0d9] hover:text-[#4ce0e8] cursor-pointer"
      >
        {collapsed ? '▼ СХЕМА А-3' : '▲ СХЕМА А-3'}
      </button>

      {!collapsed && (
        <div
          data-testid="district-minimap"
          className="bg-[#0b0f20]/92 border border-[#3a4a78] p-1.5 shadow-[3px_3px_0_rgba(7,9,18,0.88)]"
        >
          <svg
            viewBox={`0 0 ${W} ${H}`}
            width={W}
            height={H}
            className="block"
            role="img"
            aria-label="Тактическая схема квартала А-3"
          >
            {/* Base dark asphalt grid */}
            <rect x="0" y="0" width={W} height={H} fill="#0e1326" />
            <g stroke="#1c2544" strokeWidth="0.6">
              <line x1="0" y1="44" x2={W} y2="44" />
              <line x1="0" y1="88" x2={W} y2="88" />
              <line x1="62" y1="0" x2="62" y2={H} />
              <line x1="124" y1="0" x2="124" y2={H} />
            </g>

            {/* Zone 1: Sakura Courtyard (NW) */}
            <rect x="8" y="8" width="76" height="44" fill="#1b1a34" stroke="#f45b8a" strokeOpacity="0.45" strokeWidth="1" />
            <text x="12" y="18" fill="#ffb3d9" fontSize="6.5" fontWeight="700" fontFamily="Chakra Petch, sans-serif">
              ДВОР / МЕД
            </text>

            {/* Zone 2: Walkable Record Shop Interior «マルフジ商店» (W) */}
            <rect x="12" y="53" width="38" height="31" fill="#2c1d2c" stroke="#f5b971" strokeWidth="1.2" />
            {/* Front & back walkable doorway gaps */}
            <line x1="25" y1="53" x2="36" y2="53" stroke="#4ce0e8" strokeWidth="2.2" />
            <line x1="25" y1="84" x2="36" y2="84" stroke="#4ce0e8" strokeWidth="2.2" />
            <text x="15" y="71" fill="#f5b971" fontSize="6" fontWeight="700" fontFamily="Chakra Petch, sans-serif">
              МАГАЗИН
            </text>

            {/* Corner Café solid block (Center-W) */}
            <rect x="64" y="53" width="35" height="31" fill="#181f38" stroke="#3c4c7a" strokeWidth="1" />
            <text x="72" y="71" fill="#7d8fb8" fontSize="6" fontWeight="700" fontFamily="Chakra Petch, sans-serif">
              CAFÉ
            </text>

            {/* Service Passage (Connects Courtyard -> Arcade) */}
            <rect x="82" y="34" width="22" height="14" fill="#162a3d" stroke="#4ce0e8" strokeDasharray="2 2" strokeWidth="0.9" />

            {/* Zone 3: Shopping Arcade (NE-Center) */}
            <rect x="104" y="8" width="33" height="76" fill="#15213d" stroke="#4ce0e8" strokeOpacity="0.5" strokeWidth="1" />
            <text x="108" y="20" fill="#4ce0e8" fontSize="6" fontWeight="700" fontFamily="Chakra Petch, sans-serif">
              ГАЛЕРЕЯ
            </text>

            {/* Zone 4: Parking B1 (East) */}
            <rect x="142" y="54" width="36" height="48" fill="#172438" stroke="#4ce0e8" strokeOpacity="0.65" strokeWidth="1.1" />
            <text x="146" y="64" fill="#72f4fc" fontSize="6.5" fontWeight="700" fontFamily="Chakra Petch, sans-serif">
              B1
            </text>

            {/* Dashed Cyan Flank Arrows (Record Shop -> Courtyard -> Service Passage -> Arcade) */}
            <polyline
              points="31,94 31,42 93,42 116,42"
              fill="none"
              stroke="#4ce0e8"
              strokeWidth="1"
              strokeDasharray="3 2"
              strokeOpacity="0.65"
            />

            {/* Main Intersection Street Label */}
            <text x="58" y="122" fill="#899bc4" fontSize="6" fontWeight="700" fontFamily="Chakra Petch, sans-serif">
              ПЕРЕКРЁСТОК А-3
            </text>

            {/* Evac Zone Ring */}
            {minimap.evacActive && (
              <g>
                <circle
                  cx={px(minimap.evacU)}
                  cy={py(minimap.evacV)}
                  r="8"
                  fill="#4ce0e8"
                  fillOpacity="0.22"
                  stroke="#4ce0e8"
                  strokeWidth="1.4"
                />
                <text
                  x={px(minimap.evacU)}
                  y={py(minimap.evacV) + 2.5}
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="7"
                  fontWeight="900"
                  fontFamily="Chakra Petch, sans-serif"
                >
                  F
                </text>
              </g>
            )}

            {/* Parking B1 Generator Marker */}
            <g transform={`translate(${px(minimap.generatorU)}, ${py(minimap.generatorV)})`}>
              <rect
                x="-5"
                y="-5"
                width="10"
                height="10"
                fill={minimap.generatorActive ? '#10343c' : '#32220d'}
                stroke={minimap.generatorActive ? '#4ce0e8' : '#f5b971'}
                strokeWidth="1.2"
              />
              <text
                x="0"
                y="2.6"
                textAnchor="middle"
                fill={minimap.generatorActive ? '#4ce0e8' : '#f5b971'}
                fontSize="7"
                fontWeight="900"
                fontFamily="Chakra Petch, sans-serif"
              >
                G
              </text>
            </g>

            {/* Sakura Courtyard Med-Data Terminal Marker (Stage 2) */}
            <g transform={`translate(${px(minimap.terminalU)}, ${py(minimap.terminalV)})`}>
              <rect
                x="-5"
                y="-5"
                width="10"
                height="10"
                fill={
                  minimap.terminalSecured
                    ? '#10343c'
                    : minimap.terminalUnlocked
                      ? '#102e1f'
                      : '#171c2b'
                }
                stroke={
                  minimap.terminalSecured
                    ? '#4ce0e8'
                    : minimap.terminalUnlocked
                      ? '#6ee782'
                      : '#647294'
                }
                strokeWidth="1.2"
              />
              <text
                x="0"
                y="2.6"
                textAnchor="middle"
                fill={
                  minimap.terminalSecured
                    ? '#4ce0e8'
                    : minimap.terminalUnlocked
                      ? '#6ee782'
                      : '#8190b5'
                }
                fontSize="6.8"
                fontWeight="900"
                fontFamily="Chakra Petch, sans-serif"
              >
                M
              </text>
            </g>

            {/* Elevated South Tactical Overlook Deck (+1.5m High Ground) */}
            <rect x="65" y="106" width="38" height="10" fill="#232c48" stroke="#f5b971" strokeOpacity="0.65" strokeWidth="0.9" />
            <text x="68" y="113" fill="#f5b971" fontSize="5.2" fontWeight="700" fontFamily="Chakra Petch, sans-serif">
              ЭСТАКАДА +1.5м
            </text>

            {/* Interactive Security Shutters (Рольставни — [E]) */}
            {minimap.shutters.map((sh) => {
              const cx = px(sh.u);
              const cy = py(sh.v);
              const col =
                sh.status === 'sealed' ? '#f5b971' : sh.status === 'cooldown' ? '#ff5a72' : '#4ce0e8';
              return (
                <g key={sh.id} transform={`translate(${cx}, ${cy})`}>
                  <rect
                    x={sh.id === 'arcade' ? -7 : -2.2}
                    y={sh.id === 'arcade' ? -2.2 : -6}
                    width={sh.id === 'arcade' ? 14 : 4.4}
                    height={sh.id === 'arcade' ? 4.4 : 12}
                    fill={sh.status === 'sealed' ? col : '#0b0f20'}
                    stroke={col}
                    strokeWidth="1.2"
                  />
                </g>
              );
            })}

            {/* Tactical Hold Position Beacon */}
            {minimap.holdPoint && (
              <g transform={`translate(${px(minimap.holdPoint.u)}, ${py(minimap.holdPoint.v)})`}>
                <circle r="6" fill="#f5b971" fillOpacity="0.2" stroke="#f5b971" strokeWidth="1.2" strokeDasharray="2 1.5" />
                <circle r="1.8" fill="#f5b971" />
              </g>
            )}

            {/* Collectible Pickups & Ammo Crates */}
            {minimap.pickups.map((pk, idx) => (
              <rect
                key={`pk-${idx}`}
                x={px(pk.u) - 2.3}
                y={py(pk.v) - 2.3}
                width="4.6"
                height="4.6"
                transform={`rotate(45 ${px(pk.u)} ${py(pk.v)})`}
                fill={
                  pk.kind === 'medkit'
                    ? '#6ee782'
                    : pk.kind === 'vinyl'
                      ? '#f45b8a'
                      : pk.kind === 'ammo'
                        ? '#4ce0e8'
                        : '#f5b971'
                }
                stroke="#090b16"
                strokeWidth="0.7"
              />
            ))}

            {/* Enemies */}
            {minimap.enemies.map((en, idx) => (
              <circle
                key={`en-${idx}`}
                cx={px(en.u)}
                cy={py(en.v)}
                r={en.boss ? 4.2 : 2.1}
                fill={en.boss ? '#ff2945' : '#ff5a72'}
                stroke="#090b16"
                strokeWidth="0.7"
              />
            ))}

            {/* Squadmates & Active Leader */}
            {minimap.squad.map((sq, idx) => (
              <circle
                key={`sq-${idx}`}
                cx={px(sq.u)}
                cy={py(sq.v)}
                r={sq.active ? 3.4 : 2.2}
                fill={sq.color}
                stroke={sq.active ? '#ffffff' : '#090b16'}
                strokeWidth={sq.active ? 1.1 : 0.7}
              />
            ))}
          </svg>

          {/* Compact legend */}
          <div className="mt-1 flex items-center justify-between text-[8px] font-display tracking-wider text-[#9db0d9] uppercase">
            <span className={minimap.generatorActive ? 'text-[#4ce0e8] font-bold' : 'text-[#f5b971]'}>
              B1: {minimap.generatorActive ? 'АКТИВЕН' : 'ОФФЛАЙН'}
            </span>
            <span>◆ ЛУТ · ● ВРАГИ</span>
          </div>
        </div>
      )}
    </div>
  );
}
