import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BB_D,
  BB_W,
  computePlacementPreview,
  defaultFloatOffsetForHole,
  eiaColorBands,
  getConnectedStripHoles,
  getOccupiedHoles,
  holeIdToElectricalNode,
  holeIdToLocalPos,
  movePartToAnchor,
  nearestHoleFromLocalXZ,
} from '../simulation/breadboard/breadboardModel';
import type { BreadboardPart, CableConnection, SocketId } from '../simulation/circuit/types';
import { hotRefs } from '../state/hotRefs';
import { useLabStore } from '../state/labStore';

const SCALE = 10000; // 1 mm = 10 SVG units
const BOARD_W = BB_W * SCALE; // 1650
const BOARD_D = BB_D * SCALE; // 550
const PAD_X = 110;
const PAD_Y = 125;
const STAGE_W = BOARD_W + PAD_X * 2; // 1870
const STAGE_H = BOARD_D + PAD_Y * 2; // 800

function localToSvg(lx: number, lz: number): [number, number] {
  return [PAD_X + (lx + BB_W / 2) * SCALE, PAD_Y + (lz + BB_D / 2) * SCALE];
}

function svgToLocal(sx: number, sy: number): [number, number] {
  return [(sx - PAD_X) / SCALE - BB_W / 2, (sy - PAD_Y) / SCALE - BB_D / 2];
}

function holeToSvg(holeId: string): [number, number] {
  const [lx, , lz] = holeIdToLocalPos(holeId);
  return localToSvg(lx, lz);
}

function shortInstrumentTag(sock: SocketId | null | undefined, cableLabel: string): string {
  if (!sock) return cableLabel;
  if (sock === 'rigol_ch1') return 'CH1';
  if (sock === 'rigol_ch2') return 'CH2';
  if (sock === 'rigol_ch1_gnd' || sock === 'rigol_ch2_gnd') return 'OSC GND';
  if (sock === 'rigol_comp_sig') return 'COMP';
  if (sock === 'gen_out') return 'GEN';
  if (sock === 'gen_gnd') return 'GND';
  if (sock === 'psu_ch1_pos') return 'PSU1+';
  if (sock === 'psu_ch1_neg') return 'PSU1-';
  if (sock === 'psu_ch2_pos') return 'PSU2+';
  if (sock === 'psu_ch2_neg') return 'PSU2-';
  if (sock === 'psu_gnd') return 'GND';
  if (sock === 'dmm_pos') return 'DMM+';
  if (sock === 'dmm_com') return 'COM';
  if (sock === 'dmm_i') return 'DMM I';
  return cableLabel.slice(0, 10);
}

interface ViewState {
  cx: number;
  cy: number;
  zoom: number;
}

const DEFAULT_VIEW: ViewState = { cx: STAGE_W / 2, cy: STAGE_H / 2, zoom: 1.04 };

const TOP_ROW_LABELS = ['e', 'd', 'c', 'b', 'a'] as const;
const BOT_ROW_LABELS = ['f', 'g', 'h', 'i', 'j'] as const;
const COL_NUMBERS = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60] as const;

function StaticBreadboardBase() {
  const holes = useMemo(() => {
    const out: Array<{ id: string; x: number; y: number }> = [];
    for (let col = 1; col <= 63; col++) {
      for (const r of TOP_ROW_LABELS) {
        const id = `t_${col}_${r}`;
        const [x, y] = holeToSvg(id);
        out.push({ id, x, y });
      }
      for (const r of BOT_ROW_LABELS) {
        const id = `b_${col}_${r}`;
        const [x, y] = holeToSvg(id);
        out.push({ id, x, y });
      }
    }
    for (const prefix of ['tp', 'tn', 'bp', 'bn'] as const) {
      for (let i = 0; i < 50; i++) {
        const id = `${prefix}_${i}`;
        const [x, y] = holeToSvg(id);
        out.push({ id, x, y });
      }
    }
    return out;
  }, []);

  const topPlusY = localToSvg(0, -0.0256)[1];
  const topMinusY = localToSvg(0, -0.0184)[1];
  const botPlusY = localToSvg(0, 0.0184)[1];
  const botMinusY = localToSvg(0, 0.0256)[1];
  const lineX1 = PAD_X + 78;
  const lineX2 = PAD_X + BOARD_W - 78;
  const midY = PAD_Y + BOARD_D / 2;

  return (
    <g pointerEvents="none">
      {/* Soft board elevation shadow */}
      <rect
        x={PAD_X + 6}
        y={PAD_Y + 10}
        width={BOARD_W}
        height={BOARD_D}
        rx={16}
        fill="rgba(0,0,0,0.42)"
      />
      {/* Main white ABS breadboard body */}
      <rect
        x={PAD_X}
        y={PAD_Y}
        width={BOARD_W}
        height={BOARD_D}
        rx={15}
        fill="#f4f1ea"
        stroke="#cbc4b6"
        strokeWidth={3}
      />
      {/* Inner subtle top bevel */}
      <rect
        x={PAD_X + 7}
        y={PAD_Y + 7}
        width={BOARD_W - 14}
        height={BOARD_D - 14}
        rx={11}
        fill="none"
        stroke="#ffffff"
        strokeOpacity={0.75}
        strokeWidth={2}
      />

      {/* Power rail divider grooves */}
      <line x1={PAD_X + 12} y1={PAD_Y + 102} x2={PAD_X + BOARD_W - 12} y2={PAD_Y + 102} stroke="#ddd7c9" strokeWidth={2} />
      <line x1={PAD_X + 12} y1={PAD_Y + BOARD_D - 102} x2={PAD_X + BOARD_W - 12} y2={PAD_Y + BOARD_D - 102} stroke="#ddd7c9" strokeWidth={2} />

      {/* Center DIP IC trench */}
      <rect
        x={PAD_X + 14}
        y={midY - 19}
        width={BOARD_W - 28}
        height={38}
        rx={5}
        fill="#e6e1d5"
        stroke="#d5cfc0"
        strokeWidth={1.5}
      />

      {/* Red (+) and Blue (-) power rail stripes & symbols */}
      <line x1={lineX1} y1={topPlusY} x2={lineX2} y2={topPlusY} stroke="#dc2626" strokeWidth={3.5} strokeLinecap="round" />
      <line x1={lineX1} y1={topMinusY} x2={lineX2} y2={topMinusY} stroke="#2563eb" strokeWidth={3.5} strokeLinecap="round" />
      <line x1={lineX1} y1={botPlusY} x2={lineX2} y2={botPlusY} stroke="#dc2626" strokeWidth={3.5} strokeLinecap="round" />
      <line x1={lineX1} y1={botMinusY} x2={lineX2} y2={botMinusY} stroke="#2563eb" strokeWidth={3.5} strokeLinecap="round" />

      {[PAD_X + 46, PAD_X + BOARD_W - 46].map((tx, idx) => (
        <g key={idx} fontFamily="IBM Plex Mono, monospace" fontWeight={800} fontSize={18} textAnchor="middle">
          <text x={tx} y={topPlusY + 9} fill="#dc2626">+</text>
          <text x={tx} y={topMinusY + 3} fill="#2563eb">−</text>
          <text x={tx} y={botPlusY + 11} fill="#dc2626">+</text>
          <text x={tx} y={botMinusY + 4} fill="#2563eb">−</text>
        </g>
      ))}

      {/* Row letters a-e / f-j on left and right edges */}
      {TOP_ROW_LABELS.map((r) => {
        const [, y] = holeToSvg(`t_1_${r}`);
        return (
          <g key={`row_${r}`} fontFamily="IBM Plex Mono, monospace" fontWeight={700} fontSize={14} fill="#64748b" textAnchor="middle">
            <text x={PAD_X + 34} y={y + 5}>{r}</text>
            <text x={PAD_X + BOARD_W - 34} y={y + 5}>{r}</text>
          </g>
        );
      })}
      {BOT_ROW_LABELS.map((r) => {
        const [, y] = holeToSvg(`b_1_${r}`);
        return (
          <g key={`row_${r}`} fontFamily="IBM Plex Mono, monospace" fontWeight={700} fontSize={14} fill="#64748b" textAnchor="middle">
            <text x={PAD_X + 34} y={y + 5}>{r}</text>
            <text x={PAD_X + BOARD_W - 34} y={y + 5}>{r}</text>
          </g>
        );
      })}

      {/* Column index numbers along top and bottom */}
      {COL_NUMBERS.map((col) => {
        const [x] = holeToSvg(`t_${col}_a`);
        return (
          <g key={`col_${col}`} fontFamily="IBM Plex Mono, monospace" fontWeight={700} fontSize={13} fill="#475569" textAnchor="middle">
            <text x={x} y={PAD_Y + 122}>{col}</text>
            <text x={x} y={PAD_Y + BOARD_D - 110}>{col}</text>
          </g>
        );
      })}

      {/* All 830 tie-point sockets */}
      {holes.map((h) => (
        <g key={h.id}>
          <rect x={h.x - 6.6} y={h.y - 6.6} width={13.2} height={13.2} rx={2.2} fill="#18181b" />
          <rect x={h.x - 3.2} y={h.y - 3.2} width={6.4} height={6.4} rx={1} fill="#334155" />
        </g>
      ))}
    </g>
  );
}

function Part2DSvg({
  part,
  ghost = false,
  invalidGhost = false,
  selected = false,
  interactive = true,
  ledIntensity = 0,
  externalTags,
  onSelect,
  onStartReshape,
}: {
  part: BreadboardPart;
  ghost?: boolean;
  invalidGhost?: boolean;
  selected?: boolean;
  interactive?: boolean;
  ledIntensity?: number;
  externalTags?: Array<{ label: string; color: string }>;
  onSelect?: (id: string) => void;
  onStartReshape?: (id: string, mode: 'pinA' | 'pinB') => void;
}) {
  const [ax, ay] = holeToSvg(part.holeA);
  const [bx, by] = holeToSvg(part.holeB);
  const opacity = ghost ? 0.62 : 1;
  const strokeWarn = invalidGhost ? '#ef4444' : selected ? '#38bdf8' : undefined;
  const pointerProps =
    !ghost && interactive && onSelect
      ? {
          style: { cursor: 'pointer' as const },
          onPointerDown: (e: React.PointerEvent) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            onSelect(part.id);
          },
        }
      : { pointerEvents: 'none' as const };

  // 1. Floating Jumper (Jumper Bebas)
  if (part.kind === 'jumper' && part.floating) {
    const [lax, , laz] = holeIdToLocalPos(part.holeA);
    const [dx, dz] = part.floatOffset ?? defaultFloatOffsetForHole(part.holeA, 0);
    // Compact outward extension in 2D so Dupont collar + exposed silver pin + external tags stay cleanly inside viewport
    const [tx, ty] = localToSvg(lax + dx * 1.32, laz + dz * 1.32);
    const angle = (Math.atan2(ty - ay, tx - ax) * 180) / Math.PI;
    const wireCol = invalidGhost ? '#ef4444' : part.color ?? '#dc2626';
    const mx = (ax + tx) / 2 + (ty - ay) * 0.14;
    const my = (ay + ty) / 2 - (tx - ax) * 0.14;
    const tipEndX = tx + Math.cos((angle * Math.PI) / 180) * 18;
    const tipEndY = ty + Math.sin((angle * Math.PI) / 180) * 18;

    return (
      <g opacity={opacity} {...pointerProps}>
        {selected && !ghost && (
          <path
            d={`M ${ax} ${ay} Q ${mx} ${my} ${tx} ${ty}`}
            fill="none"
            stroke="#38bdf8"
            strokeWidth={14}
            strokeLinecap="round"
            opacity={0.45}
          />
        )}
        <circle cx={ax} cy={ay} r={5.5} fill="#cbd5e1" stroke="#0f172a" strokeWidth={1.6} />
        <path
          d={`M ${ax} ${ay} Q ${mx} ${my} ${tx} ${ty}`}
          fill="none"
          stroke={wireCol}
          strokeWidth={7.5}
          strokeLinecap="round"
        />
        {/* Dupont collar + exposed metal pin tip */}
        <g transform={`translate(${tx}, ${ty}) rotate(${angle})`}>
          <rect x={-10} y={-7.5} width={22} height={15} rx={3} fill="#18181b" stroke={strokeWarn ?? '#475569'} strokeWidth={1.8} />
          <line x1={12} y1={0} x2={30} y2={0} stroke="#e2e8f0" strokeWidth={5} strokeLinecap="round" />
          <circle cx={26} cy={0} r={10} fill="none" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 3" />
        </g>
        {/* External bench cable badges (e.g. GEN, CH1, CH2, GND) */}
        {externalTags && externalTags.length > 0 && (
          <g transform={`translate(${tipEndX}, ${tipEndY - 16})`} pointerEvents="none">
            {externalTags.map((tag, ti) => (
              <g key={`${tag.label}_${ti}`} transform={`translate(${ti * 56 - ((externalTags.length - 1) * 28)}, -12)`}>
                <rect
                  x={-26}
                  y={-11}
                  width={52}
                  height={20}
                  rx={5}
                  fill="#0f172a"
                  stroke={tag.color === '#18181b' ? '#94a3b8' : tag.color}
                  strokeWidth={2}
                />
                <text
                  x={0}
                  y={3}
                  textAnchor="middle"
                  fontFamily="IBM Plex Mono, monospace"
                  fontSize={10}
                  fontWeight={800}
                  fill="#f8fafc"
                >
                  {tag.label}
                </text>
              </g>
            ))}
          </g>
        )}
      </g>
    );
  }

  // 2. Normal Routed 2-Hole Jumper
  if (part.kind === 'jumper') {
    const pts: Array<[number, number]> = [[ax, ay]];
    if (part.waypoints && part.waypoints.length > 0) {
      for (const [wx, wz] of part.waypoints) {
        pts.push(localToSvg(wx, wz));
      }
    }
    pts.push([bx, by]);
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
    const wireCol = invalidGhost ? '#ef4444' : part.color ?? '#2563eb';
    return (
      <g opacity={opacity} {...pointerProps}>
        {selected && !ghost && (
          <path d={d} fill="none" stroke="#38bdf8" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" opacity={0.45} />
        )}
        <path d={d} fill="none" stroke="rgba(0,0,0,0.28)" strokeWidth={8.5} strokeLinecap="round" strokeLinejoin="round" transform="translate(0, 3)" />
        <path d={d} fill="none" stroke={wireCol} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={ax} cy={ay} r={5} fill="#e2e8f0" stroke="#0f172a" strokeWidth={1.6} />
        <circle cx={bx} cy={by} r={5} fill="#e2e8f0" stroke="#0f172a" strokeWidth={1.6} />
        {selected && !ghost && interactive && onStartReshape && (
          <>
            <circle
              cx={ax}
              cy={ay}
              r={9.5}
              fill="#38bdf8"
              stroke="#0f172a"
              strokeWidth={2}
              style={{ cursor: 'grab' }}
              onPointerDown={(e) => {
                e.stopPropagation();
                onStartReshape(part.id, 'pinA');
              }}
            />
            <circle
              cx={bx}
              cy={by}
              r={9.5}
              fill="#fb923c"
              stroke="#0f172a"
              strokeWidth={2}
              style={{ cursor: 'grab' }}
              onPointerDown={(e) => {
                e.stopPropagation();
                onStartReshape(part.id, 'pinB');
              }}
            />
          </>
        )}
      </g>
    );
  }

  // 3. DIP-8 Op-Amp LM741
  if (part.kind === 'opamp741') {
    const col = Math.min(60, Math.max(1, Number(part.holeA.split('_')[1]) || 30));
    const [p1x, topY] = holeToSvg(`t_${col}_e`);
    const [p4x, botY] = holeToSvg(`b_${col + 3}_f`);
    const icX = p1x - 10;
    const icY = (topY + botY) / 2 - 34;
    const icW = p4x - p1x + 20;
    const icH = 68;
    return (
      <g opacity={opacity} {...pointerProps}>
        {[0, 1, 2, 3].map((p) => {
          const [px, ty] = holeToSvg(`t_${col + p}_e`);
          const [, bty] = holeToSvg(`b_${col + p}_f`);
          return (
            <g key={p}>
              <rect x={px - 4} y={ty - 4} width={8} height={18} rx={1.5} fill="#cbd5e1" stroke="#475569" strokeWidth={1} />
              <rect x={px - 4} y={bty - 14} width={8} height={18} rx={1.5} fill="#cbd5e1" stroke="#475569" strokeWidth={1} />
            </g>
          );
        })}
        <rect
          x={icX}
          y={icY}
          width={icW}
          height={icH}
          rx={6}
          fill={invalidGhost ? '#991b1b' : '#18181b'}
          stroke={strokeWarn ?? '#475569'}
          strokeWidth={selected ? 3.5 : 2}
        />
        <path d={`M ${icX} ${icY + icH / 2 - 9} A 9 9 0 0 1 ${icX} ${icY + icH / 2 + 9}`} fill="#334155" />
        <circle cx={icX + 12} cy={icY + icH - 12} r={3.8} fill="#94a3b8" />
        <text
          x={icX + icW / 2}
          y={icY + icH / 2 + 5}
          textAnchor="middle"
          fontFamily="IBM Plex Mono, monospace"
          fontSize={14}
          fontWeight={700}
          fill="#e2e8f0"
        >
          LM741
        </text>
      </g>
    );
  }

  // 4. Two-terminal components (Resistor, Capacitor, Inductor, Diode, LED)
  const cx = (ax + bx) / 2;
  const cy = (ay + by) / 2;
  const span = Math.max(24, Math.hypot(bx - ax, by - ay));
  const angle = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
  const uprightText = angle > 90 || angle < -90 ? 180 : 0;
  const bands = part.kind === 'resistor' ? eiaColorBands(part.value) : null;

  return (
    <g opacity={opacity} {...pointerProps}>
      <g transform={`translate(${cx}, ${cy}) rotate(${angle})`}>
        {/* Metallic axial lead wire */}
        <line x1={-span / 2} y1={0} x2={span / 2} y2={0} stroke={invalidGhost ? '#ef4444' : '#94a3b8'} strokeWidth={5.2} strokeLinecap="round" />
        <line x1={-span / 2} y1={-0.8} x2={span / 2} y2={-0.8} stroke="#e2e8f0" strokeWidth={2} strokeLinecap="round" />
        <circle cx={-span / 2} cy={0} r={4.8} fill="#e2e8f0" stroke="#0f172a" strokeWidth={1.5} />
        <circle cx={span / 2} cy={0} r={4.8} fill="#e2e8f0" stroke="#0f172a" strokeWidth={1.5} />

        {part.kind === 'resistor' && bands && (
          <g>
            <rect
              x={-36}
              y={-14}
              width={72}
              height={28}
              rx={9}
              fill={invalidGhost ? '#ef4444' : '#dfc396'}
              stroke={strokeWarn ?? '#92400e'}
              strokeWidth={selected ? 3.5 : 2}
            />
            {bands.map((col, bi) => (
              <rect key={bi} x={-24 + bi * 14} y={-13.5} width={6.5} height={27} fill={invalidGhost ? '#b91c1c' : col} />
            ))}
            <text
              x={0}
              y={-19}
              transform={`rotate(${uprightText} 0 -19)`}
              textAnchor="middle"
              fontFamily="IBM Plex Mono, monospace"
              fontSize={12}
              fontWeight={800}
              fill="#0f172a"
              stroke="#f8fafc"
              strokeWidth={3}
              paintOrder="stroke"
            >
              {part.label}
            </text>
          </g>
        )}

        {part.kind === 'capacitor' &&
          (part.value >= 1e-6 ? (
            <g>
              <circle
                cx={0}
                cy={0}
                r={22}
                fill={invalidGhost ? '#ef4444' : '#1e3a8a'}
                stroke={strokeWarn ?? '#0f172a'}
                strokeWidth={selected ? 3.5 : 2.2}
              />
              <circle cx={0} cy={0} r={14} fill="#cbd5e1" />
              <path d="M -8 0 H 8 M 0 -8 V 8" stroke="#64748b" strokeWidth={2} />
              {/* Negative cathode stripe facing +X (holeB) */}
              <path d="M 14 -16 A 21 21 0 0 1 14 16 L 10 12 A 15 15 0 0 0 10 -12 Z" fill="#f8fafc" />
              <text
                x={0}
                y={-27}
                transform={`rotate(${uprightText} 0 -27)`}
                textAnchor="middle"
                fontFamily="IBM Plex Mono, monospace"
                fontSize={12}
                fontWeight={800}
                fill="#0f172a"
                stroke="#f8fafc"
                strokeWidth={3}
                paintOrder="stroke"
              >
                {part.label}
              </text>
            </g>
          ) : (
            <g>
              <rect
                x={-22}
                y={-13}
                width={44}
                height={26}
                rx={12}
                fill={invalidGhost ? '#ef4444' : '#ea580c'}
                stroke={strokeWarn ?? '#7c2d12'}
                strokeWidth={selected ? 3.5 : 2}
              />
              <text
                x={0}
                y={4}
                transform={`rotate(${uprightText} 0 0)`}
                textAnchor="middle"
                fontFamily="IBM Plex Mono, monospace"
                fontSize={11}
                fontWeight={800}
                fill="#ffffff"
              >
                {part.label}
              </text>
            </g>
          ))}

        {part.kind === 'inductor' && (
          <g>
            <rect
              x={-36}
              y={-15}
              width={72}
              height={30}
              rx={11}
              fill={invalidGhost ? '#ef4444' : '#15803d'}
              stroke={strokeWarn ?? '#14532d'}
              strokeWidth={selected ? 3.5 : 2}
            />
            {[-20, -7, 6, 19].map((rx) => (
              <line key={rx} x1={rx} y1={-14} x2={rx} y2={14} stroke="#166534" strokeWidth={3} />
            ))}
            <text
              x={0}
              y={-20}
              transform={`rotate(${uprightText} 0 -20)`}
              textAnchor="middle"
              fontFamily="IBM Plex Mono, monospace"
              fontSize={12}
              fontWeight={800}
              fill="#0f172a"
              stroke="#f8fafc"
              strokeWidth={3}
              paintOrder="stroke"
            >
              {part.label}
            </text>
          </g>
        )}

        {part.kind === 'diode' && (
          <g>
            <rect
              x={-28}
              y={-11}
              width={56}
              height={22}
              rx={6}
              fill={invalidGhost ? '#ef4444' : '#f97316'}
              stroke={strokeWarn ?? '#9a3412'}
              strokeWidth={selected ? 3.5 : 2}
            />
            <rect x={14} y={-10.5} width={9} height={21} fill="#0f172a" />
          </g>
        )}

        {part.kind === 'led' && (
          <g>
            {ledIntensity > 0.05 && (
              <circle
                cx={0}
                cy={0}
                r={26 + Math.min(18, ledIntensity * 8)}
                fill={part.color ?? '#ef4444'}
                opacity={Math.min(0.65, ledIntensity * 0.35)}
              />
            )}
            <circle
              cx={0}
              cy={0}
              r={19}
              fill={invalidGhost ? '#ef4444' : part.color ?? '#ef4444'}
              stroke={strokeWarn ?? '#0f172a'}
              strokeWidth={selected ? 3.5 : 2}
            />
            {/* Flat cathode bar on +X side */}
            <rect x={14} y={-12} width={5} height={24} rx={1} fill="#334155" />
            <circle cx={-5} cy={-5} r={5.5} fill="#ffffff" opacity={0.45} />
          </g>
        )}
      </g>

      {/* Draggable Pin A / Pin B handles when selected */}
      {selected && !ghost && interactive && onStartReshape && (
        <>
          <circle
            cx={ax}
            cy={ay}
            r={9.5}
            fill="#38bdf8"
            stroke="#0f172a"
            strokeWidth={2}
            style={{ cursor: 'grab' }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onStartReshape(part.id, 'pinA');
            }}
          />
          <circle
            cx={bx}
            cy={by}
            r={9.5}
            fill="#fb923c"
            stroke="#0f172a"
            strokeWidth={2}
            style={{ cursor: 'grab' }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onStartReshape(part.id, 'pinB');
            }}
          />
        </>
      )}
    </g>
  );
}

export function Breadboard2DEditor() {
  const breadboardMode = useLabStore((s) => s.breadboardMode);
  const breadboard2D = useLabStore((s) => s.breadboard2D);
  const fitSeq = useLabStore((s) => s.breadboard2DFitSeq);
  const parts = useLabStore((s) => s.breadboardParts);
  const cables = useLabStore((s) => s.cables);
  const placingPart = useLabStore((s) => s.placingPart);
  const selectedPartId = useLabStore((s) => s.selectedBreadboardPartId);
  const reshapingPart = useLabStore((s) => s.reshapingPart);
  const breadboardViewMode = useLabStore((s) => s.breadboardViewMode);
  const breadboardShowPins = useLabStore((s) => s.breadboardShowPins);

  const selectPart = useLabStore((s) => s.selectBreadboardPart);
  const startReshaping = useLabStore((s) => s.startReshapingPart);
  const anchorPlacingHoleA = useLabStore((s) => s.anchorPlacingHoleA);
  const addPlacingWaypoint = useLabStore((s) => s.addPlacingWaypoint);
  const commitPlacedPart = useLabStore((s) => s.commitPlacedPart);
  const commitFloatingJumper = useLabStore((s) => s.commitFloatingJumper);
  const placePartAtHole = useLabStore((s) => s.placePartAtHole);
  const commitReshapePart = useLabStore((s) => s.commitReshapePart);
  const setHoverLabel = useLabStore((s) => s.setHoverLabel);

  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<ViewState>(DEFAULT_VIEW);
  const [hoverHole, setHoverHole] = useState<string | null>(null);
  const [hoverLocalXZ, setHoverLocalXZ] = useState<[number, number] | null>(null);
  const [liveTick, setLiveTick] = useState(0);

  const panDragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    startCx: number;
    startCy: number;
    btn: number;
    moved: boolean;
  }>({ active: false, startX: 0, startY: 0, startCx: 0, startCy: 0, btn: 0, moved: false });

  const downMetaRef = useRef<{ x: number; y: number; hole: string | null }>({ x: 0, y: 0, hole: null });

  const visible = breadboardMode && breadboard2D;

  // Reset view whenever user enters 2D mode or clicks Fit button
  useEffect(() => {
    if (visible) setView(DEFAULT_VIEW);
  }, [visible, fitSeq]);

  // Lightweight live voltage / LED / current animation refresh while in 2D mode
  useEffect(() => {
    if (!visible) return;
    const interval = window.setInterval(() => {
      setLiveTick((t) => (t + 1) % 10000);
    }, breadboardViewMode === 'current' ? 50 : 180);
    return () => clearInterval(interval);
  }, [visible, breadboardViewMode]);

  // Handle 'B' bend waypoint & gentle WASD/Arrow 2D panning
  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      const st = useLabStore.getState();
      if ((e.key === 'b' || e.key === 'B') && st.placingPart?.kind === 'jumper' && st.placingPart.anchorHoleA && hoverLocalXZ) {
        e.preventDefault();
        addPlacingWaypoint(hoverLocalXZ[0], hoverLocalXZ[1]);
        return;
      }
      const step = 45 / view.zoom;
      if (e.code === 'KeyW' || e.code === 'ArrowUp') {
        setView((v) => ({ ...v, cy: Math.max(80, v.cy - step) }));
      } else if (e.code === 'KeyS' || e.code === 'ArrowDown') {
        setView((v) => ({ ...v, cy: Math.min(STAGE_H - 80, v.cy + step) }));
      } else if (e.code === 'KeyA' || e.code === 'ArrowLeft') {
        setView((v) => ({ ...v, cx: Math.max(100, v.cx - step) }));
      } else if (e.code === 'KeyD' || e.code === 'ArrowRight') {
        setView((v) => ({ ...v, cx: Math.min(STAGE_W - 100, v.cx + step) }));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible, addPlacingWaypoint, hoverLocalXZ, view.zoom]);

  // Convert screen client coordinates into exact SVG stage coordinates via native CTM
  const clientToStage = useCallback((clientX: number, clientY: number): [number, number] | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const local = pt.matrixTransform(ctm.inverse());
    return [local.x, local.y];
  }, []);

  const occupied = useMemo(
    () => getOccupiedHoles(parts, reshapingPart?.partId),
    [parts, reshapingPart?.partId]
  );

  // Map external bench cable connections (Oscilloscope probes, Banana-Buaya, etc.) onto breadboard tags
  const { floatTagsByPartId, directHoleTags } = useMemo(() => {
    const floatMap = new Map<string, Array<{ label: string; color: string }>>();
    const holeMap = new Map<string, Array<{ label: string; color: string }>>();

    const pushTag = (sock: SocketId | null | undefined, other: SocketId | null | undefined, cable: CableConnection, fallback: string) => {
      if (!sock) return;
      const tag = { label: shortInstrumentTag(other, fallback), color: cable.color };
      if (sock.startsWith('bb_float_')) {
        const partId = sock.slice('bb_float_'.length);
        const list = floatMap.get(partId) ?? [];
        list.push(tag);
        floatMap.set(partId, list);
      } else if (sock.startsWith('bb_')) {
        const hid = sock.slice(3);
        const list = holeMap.get(hid) ?? [];
        list.push(tag);
        holeMap.set(hid, list);
      }
    };

    for (const c of cables) {
      pushTag(c.endA, c.endB, c, c.label);
      pushTag(c.endB, c.endA, c, c.label);
      if (c.gndClip) {
        pushTag(c.gndClip, 'gen_gnd', { ...c, color: '#18181b' }, 'GND');
      }
    }
    return { floatTagsByPartId: floatMap, directHoleTags: holeMap };
  }, [cables]);

  const ghostModel = useMemo(() => {
    if (!hoverHole) return null;
    if (placingPart) {
      const isFloatingGhost =
        placingPart.kind === 'jumper' &&
        (Boolean(placingPart.floating) ||
          (Boolean(placingPart.anchorHoleA) && hoverHole === placingPart.anchorHoleA));
      const preview = computePlacementPreview(
        placingPart.kind,
        hoverHole,
        placingPart.span,
        placingPart.rotationDeg ?? 0,
        occupied,
        isFloatingGhost ? null : placingPart.anchorHoleA,
        hoverHole,
        isFloatingGhost
      );
      const ghostPart: BreadboardPart = {
        id: '__ghost_2d',
        kind: placingPart.kind,
        label: isFloatingGhost ? 'Jumper Bebas' : placingPart.label,
        value: placingPart.value,
        holeA: preview.holeA,
        holeB: preview.holeB,
        color: placingPart.color,
        waypoints: isFloatingGhost ? undefined : placingPart.waypoints,
        floating: isFloatingGhost || undefined,
        floatOffset: isFloatingGhost
          ? defaultFloatOffsetForHole(preview.holeA, placingPart.rotationDeg ?? 0)
          : undefined,
      };
      return { part: ghostPart, preview };
    }
    if (reshapingPart) {
      const src = parts.find((p) => p.id === reshapingPart.partId);
      if (!src) return null;
      let holeA = src.holeA;
      let holeB = src.holeB;
      let valid = true;
      let floating = src.floating;
      let floatOffset = src.floatOffset;
      if (reshapingPart.mode === 'move') {
        const moved = movePartToAnchor(src, hoverHole, occupied);
        holeA = moved.holeA;
        holeB = moved.holeB;
        valid = moved.valid;
        if (src.kind === 'jumper' && src.floating) floatOffset = defaultFloatOffsetForHole(hoverHole, 0);
      } else if (reshapingPart.mode === 'pinA') {
        holeA = hoverHole;
        if (src.kind === 'jumper' && src.floating) {
          holeB = hoverHole;
          valid = !occupied.has(holeA);
          floatOffset = defaultFloatOffsetForHole(hoverHole, 0);
        } else {
          valid = holeA !== holeB && !occupied.has(holeA);
        }
      } else {
        holeB = hoverHole;
        valid = holeA !== holeB && !occupied.has(holeB);
        floating = false;
        floatOffset = undefined;
      }
      return {
        part: { ...src, id: '__ghost_reshape_2d', holeA, holeB, floating, floatOffset, waypoints: undefined },
        preview: { holeA, holeB, pins: floating ? [holeA] : [holeA, holeB], valid, sameStripWarning: false },
      };
    }
    return null;
  }, [hoverHole, occupied, parts, placingPart, reshapingPart]);

  const stripHighlightHoles = useMemo(() => {
    if (!hoverHole) return [];
    return getConnectedStripHoles(hoverHole);
  }, [hoverHole]);

  if (!visible) return null;

  const vbW = STAGE_W / view.zoom;
  const vbH = STAGE_H / view.zoom;
  const viewBox = `${view.cx - vbW / 2} ${view.cy - vbH / 2} ${vbW} ${vbH}`;

  const updateHoleFromClient = (clientX: number, clientY: number): { hole: string | null; lx: number; lz: number } => {
    const pt = clientToStage(clientX, clientY);
    if (!pt) return { hole: null, lx: 0, lz: 0 };
    const [sx, sy] = pt;
    const [lx, lz] = svgToLocal(sx, sy);
    const inBoard = Math.abs(lx) <= BB_W / 2 + 0.004 && Math.abs(lz) <= BB_D / 2 + 0.004;
    if (!inBoard) {
      setHoverHole(null);
      setHoverLocalXZ(null);
      setHoverLabel(null);
      return { hole: null, lx, lz };
    }
    const h = nearestHoleFromLocalXZ(lx, lz);
    setHoverHole(h);
    setHoverLocalXZ([lx, lz]);
    if (reshapingPart) {
      setHoverLabel(`Pindah ${reshapingPart.mode} -> ${h}`);
    } else if (placingPart) {
      if (placingPart.kind === 'jumper' && placingPart.floating) {
        setHoverLabel(`Pasang Jumper Bebas di ${h} (R: arah condong)`);
      } else if (placingPart.anchorHoleA) {
        setHoverLabel(
          placingPart.kind === 'jumper'
            ? h === placingPart.anchorHoleA
              ? `Klik lagi / tekan F: Jadikan Jumper Bebas (${h})`
              : `Jumper ${placingPart.anchorHoleA} -> ${h} (F: Floating, Klik kanan/B: belok)`
            : `${placingPart.label}: ${placingPart.anchorHoleA} -> ${h}`
        );
      } else {
        setHoverLabel(`Pasang ${placingPart.label} di ${h} (R: putar)`);
      }
    } else {
      const vNode = hotRefs.bbNodeVoltages[holeIdToElectricalNode(h)];
      setHoverLabel(vNode !== undefined ? `BB ${h} (${vNode.toFixed(2)}V)` : `BB ${h}`);
    }
    return { hole: h, lx, lz };
  };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const pt = clientToStage(e.clientX, e.clientY);
    const factor = e.deltaY < 0 ? 1.14 : 1 / 1.14;
    setView((prev) => {
      const nextZoom = Math.min(4.2, Math.max(0.75, prev.zoom * factor));
      if (!pt) return { ...prev, zoom: nextZoom };
      const ratio = prev.zoom / nextZoom;
      return {
        zoom: nextZoom,
        cx: pt[0] + (prev.cx - pt[0]) * ratio,
        cy: pt[1] + (prev.cy - pt[1]) * ratio,
      };
    });
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      panDragRef.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        startCx: view.cx,
        startCy: view.cy,
        btn: e.button,
        moved: false,
      };
      return;
    }
    if (e.button !== 0) return;

    const { hole } = updateHoleFromClient(e.clientX, e.clientY);
    downMetaRef.current = { x: e.clientX, y: e.clientY, hole };

    if (!hole) {
      if (!placingPart && !reshapingPart) selectPart(null);
      return;
    }
    if (reshapingPart) {
      commitReshapePart(hole);
      return;
    }
    if (placingPart) {
      if (placingPart.kind === 'jumper' && placingPart.floating) {
        commitFloatingJumper(hole, placingPart.rotationDeg);
      } else if (placingPart.kind === 'opamp741') {
        placePartAtHole(hole);
      } else if (!placingPart.anchorHoleA) {
        anchorPlacingHoleA(hole);
      } else if (hole === placingPart.anchorHoleA && placingPart.kind === 'jumper') {
        commitFloatingJumper(placingPart.anchorHoleA, placingPart.rotationDeg);
      } else if (hole !== placingPart.anchorHoleA) {
        commitPlacedPart(placingPart.anchorHoleA, hole, placingPart.waypoints);
      }
      return;
    }
    selectPart(null);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (panDragRef.current.active) {
      const dxPx = e.clientX - panDragRef.current.startX;
      const dyPx = e.clientY - panDragRef.current.startY;
      if (Math.hypot(dxPx, dyPx) > 4) panDragRef.current.moved = true;
      const rect = svgRef.current?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) {
        const unitsPerPx = Math.max(vbW / rect.width, vbH / rect.height);
        setView((prev) => ({
          ...prev,
          cx: Math.min(STAGE_W - 60, Math.max(60, panDragRef.current.startCx - dxPx * unitsPerPx)),
          cy: Math.min(STAGE_H - 60, Math.max(60, panDragRef.current.startCy - dyPx * unitsPerPx)),
        }));
      }
      return;
    }
    updateHoleFromClient(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (panDragRef.current.active) {
      const wasQuickRightClick = panDragRef.current.btn === 2 && !panDragRef.current.moved;
      panDragRef.current.active = false;
      if (wasQuickRightClick && placingPart?.kind === 'jumper' && placingPart.anchorHoleA) {
        const pt = clientToStage(e.clientX, e.clientY);
        if (pt) {
          const [lx, lz] = svgToLocal(pt[0], pt[1]);
          addPlacingWaypoint(lx, lz);
        }
      }
      return;
    }
    if (e.button === 0 && placingPart && placingPart.kind !== 'opamp741' && !placingPart.floating && placingPart.anchorHoleA) {
      const dist = Math.hypot(e.clientX - downMetaRef.current.x, e.clientY - downMetaRef.current.y);
      const { hole } = updateHoleFromClient(e.clientX, e.clientY);
      if (hole && hole !== placingPart.anchorHoleA && downMetaRef.current.hole === placingPart.anchorHoleA && dist > 10) {
        commitPlacedPart(placingPart.anchorHoleA, hole, placingPart.waypoints);
      }
    }
  };

  const partInteractive = !placingPart && !reshapingPart;
  const voltages = hotRefs.bbNodeVoltages;
  const animPhase = (liveTick * 0.06) % 1;

  return (
    <div
      role="region"
      aria-label="Mode Breadboard 2D"
      className="fixed inset-0 z-10 flex flex-col bg-[#122622] pt-[104px] pb-[52px] select-none"
      style={{
        backgroundImage:
          'linear-gradient(to right, rgba(167,243,208,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(167,243,208,0.06) 1px, transparent 1px)',
        backgroundSize: '36px 36px',
      }}
    >
      <svg
        ref={svgRef}
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => {
          panDragRef.current.active = false;
          setHoverHole(null);
          setHoverLabel(null);
        }}
        onContextMenu={(e) => e.preventDefault()}
        className="h-full w-full touch-none"
        style={{ cursor: placingPart || reshapingPart ? 'crosshair' : 'default' }}
      >
        <StaticBreadboardBase />

        {/* Live Voltage Strip Overlay (Voltage View) */}
        {breadboardViewMode === 'voltage' && (
          <g pointerEvents="none" opacity={0.42}>
            {Array.from({ length: 63 }, (_, i) => i + 1).map((col) => {
              const vt = voltages[`N_BB_T_${col}`];
              const vb = voltages[`N_BB_B_${col}`];
              const [tx, tyA] = holeToSvg(`t_${col}_a`);
              const [, tyE] = holeToSvg(`t_${col}_e`);
              const [, byF] = holeToSvg(`b_${col}_f`);
              const [, byJ] = holeToSvg(`b_${col}_j`);
              const vColor = (v: number) => (v > 0.35 ? '#ef4444' : v < -0.35 ? '#3b82f6' : '#22c55e');
              return (
                <g key={col}>
                  {vt !== undefined && (
                    <rect x={tx - 9} y={tyA - 9} width={18} height={tyE - tyA + 18} rx={4} fill={vColor(vt)} />
                  )}
                  {vb !== undefined && (
                    <rect x={tx - 9} y={byF - 9} width={18} height={byJ - byF + 18} rx={4} fill={vColor(vb)} />
                  )}
                </g>
              );
            })}
            {(
              [
                ['N_BB_RAIL_TP', 'tp_0', 'tp_49'],
                ['N_BB_RAIL_TN', 'tn_0', 'tn_49'],
                ['N_BB_RAIL_BP', 'bp_0', 'bp_49'],
                ['N_BB_RAIL_BN', 'bn_0', 'bn_49'],
              ] as const
            ).map(([key, first, last]) => {
              const vr = voltages[key];
              if (vr === undefined) return null;
              const [x1, y] = holeToSvg(first);
              const [x2] = holeToSvg(last);
              const fill = vr > 0.35 ? '#ef4444' : vr < -0.35 ? '#3b82f6' : '#22c55e';
              return <rect key={key} x={x1 - 9} y={y - 8} width={x2 - x1 + 18} height={16} rx={4} fill={fill} />;
            })}
          </g>
        )}

        {/* Occupied Pin Rings (Show Pins) */}
        {breadboardShowPins && (
          <g pointerEvents="none">
            {parts.map((p) => {
              const [ax, ay] = holeToSvg(p.holeA);
              const [bx, by] = holeToSvg(p.holeB);
              return (
                <g key={`pin_${p.id}`}>
                  <circle cx={ax} cy={ay} r={9.5} fill="none" stroke="#38bdf8" strokeWidth={2.2} />
                  {!(p.kind === 'jumper' && p.floating) && (
                    <circle cx={bx} cy={by} r={9.5} fill="none" stroke="#fb923c" strokeWidth={2.2} />
                  )}
                </g>
              );
            })}
          </g>
        )}

        {/* Connected Strip / Rail Highlight under cursor */}
        {stripHighlightHoles.length > 0 && (
          <g pointerEvents="none">
            {stripHighlightHoles.map((sh) => {
              const [hx, hy] = holeToSvg(sh);
              const isHover = sh === hoverHole;
              const isOcc = occupied.has(sh);
              return (
                <circle
                  key={sh}
                  cx={hx}
                  cy={hy}
                  r={isHover ? 11.5 : 8.5}
                  fill={isHover ? 'rgba(34,197,94,0.28)' : 'none'}
                  stroke={isOcc ? '#f59e0b' : '#22c55e'}
                  strokeWidth={isHover ? 3 : 2}
                />
              );
            })}
          </g>
        )}

        {/* Target Ghost Pin Rings */}
        {ghostModel && (
          <g pointerEvents="none">
            {ghostModel.preview.pins.map((pin) => {
              const [px, py] = holeToSvg(pin);
              const blocked = occupied.has(pin) || !ghostModel.preview.valid;
              return (
                <circle
                  key={`gpin_${pin}`}
                  cx={px}
                  cy={py}
                  r={12}
                  fill={blocked ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)'}
                  stroke={blocked ? '#ef4444' : '#f59e0b'}
                  strokeWidth={3}
                />
              );
            })}
          </g>
        )}

        {/* Direct hole external cable markers */}
        {Array.from(directHoleTags.entries()).map(([hid, tags]) => {
          const [hx, hy] = holeToSvg(hid);
          return (
            <g key={`dtag_${hid}`} pointerEvents="none">
              <circle cx={hx} cy={hy} r={9} fill={tags[0].color} stroke="#f8fafc" strokeWidth={2} />
              <rect x={hx - 24} y={hy - 30} width={48} height={18} rx={4} fill="#0f172a" stroke="#f59e0b" strokeWidth={1.6} />
              <text x={hx} y={hy - 17} textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize={10} fontWeight={800} fill="#f8fafc">
                {tags[0].label}
              </text>
            </g>
          );
        })}

        {/* Placed 2D Breadboard Components */}
        {parts.map((part) => (
          <Part2DSvg
            key={part.id}
            part={part}
            selected={part.id === selectedPartId}
            interactive={partInteractive}
            ledIntensity={part.kind === 'led' ? Math.max(0, (hotRefs.ledCurrents[part.id] ?? 0) * 165) : 0}
            externalTags={floatTagsByPartId.get(part.id)}
            onSelect={selectPart}
            onStartReshape={startReshaping}
          />
        ))}

        {/* Live Current Flow Dots (Current View) */}
        {breadboardViewMode === 'current' && (
          <g pointerEvents="none">
            {parts.map((part) => {
              if (part.kind === 'jumper' && part.floating) return null;
              const va = voltages[holeIdToElectricalNode(part.holeA)] ?? 0;
              const vb = voltages[holeIdToElectricalNode(part.holeB)] ?? 0;
              let amps = 0;
              if (part.kind === 'led') amps = hotRefs.ledCurrents[part.id] ?? 0;
              else if (part.kind === 'resistor' && part.value > 0) amps = (va - vb) / part.value;
              else if (part.kind === 'jumper') amps = (va - vb) / 0.02;
              else amps = va !== vb ? 0.002 * Math.sign(va - vb) : 0;
              if (Math.abs(amps) < 1e-5) return null;
              const [ax, ay] = holeToSvg(part.holeA);
              const [bx, by] = holeToSvg(part.holeB);
              const dir = amps >= 0 ? 1 : -1;
              return [0, 1, 2].map((d) => {
                let u = (animPhase * dir + d / 3) % 1;
                if (u < 0) u += 1;
                return (
                  <circle
                    key={`cur_${part.id}_${d}`}
                    cx={ax + (bx - ax) * u}
                    cy={ay + (by - ay) * u}
                    r={5.2}
                    fill="#facc15"
                    stroke="#713f12"
                    strokeWidth={1.4}
                  />
                );
              });
            })}
          </g>
        )}

        {/* Real-time 2D Ghost Preview while placing or reshaping */}
        {ghostModel && (
          <Part2DSvg
            part={ghostModel.part}
            ghost
            invalidGhost={!ghostModel.preview.valid}
            interactive={false}
          />
        )}
      </svg>

      {/* Bottom-Right Compact 2D Zoom & Pan Controls */}
      <div className="pointer-events-auto fixed right-3 bottom-12 z-20 flex items-center gap-1 rounded-md border border-[#303642] bg-[#14171d]/92 px-2 py-1 text-xs text-[#f1f5f9] shadow-lg backdrop-blur-sm">
        <button
          type="button"
          aria-label="Perkecil 2D"
          onClick={() => setView((v) => ({ ...v, zoom: Math.max(0.75, v.zoom / 1.2) }))}
          className="rounded px-1.5 py-0.5 font-bold hover:bg-[#252a34]"
        >
          −
        </button>
        <span className="min-w-[44px] text-center font-mono-readout text-[11px] font-semibold">
          {Math.round(view.zoom * 100)}%
        </span>
        <button
          type="button"
          aria-label="Perbesar 2D"
          onClick={() => setView((v) => ({ ...v, zoom: Math.min(4.2, v.zoom * 1.2) }))}
          className="rounded px-1.5 py-0.5 font-bold hover:bg-[#252a34]"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => setView(DEFAULT_VIEW)}
          className="ml-1 rounded border border-[#323846] bg-[#1e232d] px-1.5 py-0.5 text-[11px] font-semibold hover:border-[#f59e0b]"
        >
          Fit
        </button>
      </div>
    </div>
  );
}
