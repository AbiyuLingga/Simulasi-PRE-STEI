import type { BreadboardComponentKind, BreadboardPart, CircuitComponent } from '../circuit/types';

export const BB_WORLD_POS: readonly [number, number, number] = [0.03, 0.782, 0.20];
export const BB_W = 0.165;
export const BB_H = 0.009;
export const BB_D = 0.055;
export const BB_PITCH = 0.00245;
export const FLOATING_JUMPER_HEIGHT = 0.024;

export function floatingJumperSocketId(partId: string): string {
  return `bb_float_${partId}`;
}

export function defaultFloatOffsetForHole(
  holeId: string,
  rotationDeg: 0 | 90 | 180 | 270 = 0
): [number, number] {
  const [, , az] = holeIdToLocalPos(holeId);
  let dx = 0;
  let dz = az <= 0 ? -0.0085 : 0.0085;
  const turns = ((rotationDeg / 90) % 4 + 4) % 4;
  for (let i = 0; i < turns; i++) {
    const nx = -dz;
    const nz = dx;
    dx = nx;
    dz = nz;
  }
  return [dx, dz];
}

export function rotateFloatOffset90(offset: [number, number]): [number, number] {
  return [-offset[1], offset[0]];
}

export function floatingJumperTipLocalPos(
  part: Pick<BreadboardPart, 'holeA' | 'floatOffset'>
): [number, number, number] {
  const [ax, , az] = holeIdToLocalPos(part.holeA);
  const [dx, dz] = part.floatOffset ?? defaultFloatOffsetForHole(part.holeA, 0);
  return [ax + dx, BB_H + FLOATING_JUMPER_HEIGHT, az + dz];
}

export function floatingJumperTipWorldPos(
  part: Pick<BreadboardPart, 'holeA' | 'floatOffset'>
): [number, number, number] {
  const [lx, ly, lz] = floatingJumperTipLocalPos(part);
  return [BB_WORLD_POS[0] + lx, BB_WORLD_POS[1] + ly, BB_WORLD_POS[2] + lz];
}

export function floatingJumperTipNormal(
  part: Pick<BreadboardPart, 'holeA' | 'floatOffset'>
): [number, number, number] {
  const [dx, dz] = part.floatOffset ?? defaultFloatOffsetForHole(part.holeA, 0);
  const nx = dx * 28;
  const ny = 1;
  const nz = dz * 28;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

const TOP_ROWS = ['e', 'd', 'c', 'b', 'a'] as const;
const BOT_ROWS = ['f', 'g', 'h', 'i', 'j'] as const;

const RAIL_POS_MAP: Record<string, number> = {
  tp: -0.0235,
  tn: -0.0205,
  bp: 0.0205,
  bn: 0.0235,
};

function railHoleX(idx: number): number {
  const clamped = Math.min(49, Math.max(0, idx));
  const blk = Math.floor(clamped / 5);
  return -0.072 + clamped * BB_PITCH + blk * 0.0022;
}

export function holeIdToElectricalNode(holeId: string): string {
  if (holeId.startsWith('bb_')) holeId = holeId.slice(3);
  if (holeId.startsWith('t_')) {
    const col = Number(holeId.split('_')[1]);
    return `N_BB_T_${Math.min(63, Math.max(1, col || 1))}`;
  }
  if (holeId.startsWith('b_')) {
    const col = Number(holeId.split('_')[1]);
    return `N_BB_B_${Math.min(63, Math.max(1, col || 1))}`;
  }
  if (holeId.startsWith('tp_')) return 'N_BB_RAIL_TP';
  if (holeId.startsWith('tn_')) return 'N_BB_RAIL_TN';
  if (holeId.startsWith('bp_')) return 'N_BB_RAIL_BP';
  if (holeId.startsWith('bn_')) return 'N_BB_RAIL_BN';
  return `N_${holeId}`;
}

export function getConnectedStripHoles(holeId: string): string[] {
  const h = holeId.startsWith('bb_') ? holeId.slice(3) : holeId;
  if (h.startsWith('t_')) {
    const col = Math.min(63, Math.max(1, Number(h.split('_')[1]) || 1));
    return TOP_ROWS.map((r) => `t_${col}_${r}`);
  }
  if (h.startsWith('b_')) {
    const col = Math.min(63, Math.max(1, Number(h.split('_')[1]) || 1));
    return BOT_ROWS.map((r) => `b_${col}_${r}`);
  }
  const prefix = h.split('_')[0];
  if (prefix === 'tp' || prefix === 'tn' || prefix === 'bp' || prefix === 'bn') {
    return Array.from({ length: 50 }, (_, idx) => `${prefix}_${idx}`);
  }
  return [h];
}

export function holeIdToLocalPos(holeId: string): [number, number, number] {
  if (holeId.startsWith('bb_')) holeId = holeId.slice(3);
  const startX = -((62 * BB_PITCH) / 2);
  const y = BB_H;

  if (holeId.startsWith('t_')) {
    const [, cStr, row = 'c'] = holeId.split('_');
    const col = Math.min(63, Math.max(1, Number(cStr) || 1));
    const rIdx = Math.max(0, TOP_ROWS.indexOf(row as (typeof TOP_ROWS)[number]));
    return [startX + (col - 1) * BB_PITCH, y, -0.0042 - rIdx * BB_PITCH];
  }
  if (holeId.startsWith('b_')) {
    const [, cStr, row = 'h'] = holeId.split('_');
    const col = Math.min(63, Math.max(1, Number(cStr) || 1));
    const rIdx = Math.max(0, BOT_ROWS.indexOf(row as (typeof BOT_ROWS)[number]));
    return [startX + (col - 1) * BB_PITCH, y, 0.0042 + rIdx * BB_PITCH];
  }

  const [prefix, idxStr] = holeId.split('_');
  const rz = RAIL_POS_MAP[prefix] ?? -0.0235;
  const idx = Math.min(49, Math.max(0, Number(idxStr) || 0));
  return [railHoleX(idx), y, rz];
}

export function holeIdToWorldPos(holeId: string): [number, number, number] {
  const [lx, ly, lz] = holeIdToLocalPos(holeId);
  return [BB_WORLD_POS[0] + lx, BB_WORLD_POS[1] + ly, BB_WORLD_POS[2] + lz];
}

export function nearestHoleFromLocalXZ(x: number, z: number): string {
  const startX = -((62 * BB_PITCH) / 2);
  if (z < -0.0175 || z > 0.0175) {
    const prefix = z < -0.0175 ? (z < -0.022 ? 'tp' : 'tn') : z > 0.022 ? 'bn' : 'bp';
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < 50; i++) {
      const d = Math.abs(railHoleX(i) - x);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return `${prefix}_${bestIdx}`;
  }
  const col = Math.min(63, Math.max(1, Math.round((x - startX) / BB_PITCH) + 1));
  if (z <= 0) {
    const rIdx = Math.min(4, Math.max(0, Math.round((-0.0042 - z) / BB_PITCH)));
    return `t_${col}_${TOP_ROWS[rIdx]}`;
  }
  const rIdx = Math.min(4, Math.max(0, Math.round((z - 0.0042) / BB_PITCH)));
  return `b_${col}_${BOT_ROWS[rIdx]}`;
}

export function shiftHoleColumn(holeId: string, deltaCols: number): string {
  if (holeId.startsWith('t_') || holeId.startsWith('b_')) {
    const [half, cStr, row] = holeId.split('_');
    const col = Math.min(63, Math.max(1, (Number(cStr) || 1) + deltaCols));
    return `${half}_${col}_${row}`;
  }
  const [prefix, idxStr] = holeId.split('_');
  const idx = Math.min(49, Math.max(0, (Number(idxStr) || 0) + deltaCols));
  return `${prefix}_${idx}`;
}

export function getPartPins(part: Pick<BreadboardPart, 'kind' | 'holeA' | 'holeB' | 'floating'>): string[] {
  if (part.kind === 'opamp741') {
    const col = Math.min(60, Math.max(1, Number(part.holeA.split('_')[1]) || 30));
    const pins: string[] = [];
    for (let i = 0; i < 4; i++) {
      pins.push(`t_${col + i}_e`, `b_${col + i}_f`);
    }
    return pins;
  }
  if (part.kind === 'jumper' && part.floating) {
    return [part.holeA];
  }
  return [part.holeA, part.holeB];
}

export function getOccupiedHoles(parts: BreadboardPart[], excludeId?: string): Set<string> {
  const occupied = new Set<string>();
  for (const p of parts) {
    if (excludeId && p.id === excludeId) continue;
    for (const pin of getPartPins(p)) {
      occupied.add(pin);
    }
  }
  return occupied;
}

export interface PlacementPreview {
  holeA: string;
  holeB: string;
  pins: string[];
  valid: boolean;
  sameStripWarning: boolean;
}

export function computePlacementPreview(
  kind: BreadboardComponentKind,
  anchorHole: string,
  span: number,
  rotationDeg: 0 | 90 | 180 | 270,
  occupied: Set<string>,
  pinnedHoleA?: string | null,
  hoverHole?: string | null,
  floating?: boolean
): PlacementPreview {
  if (kind === 'jumper' && floating) {
    const holeA = hoverHole ?? anchorHole;
    return {
      holeA,
      holeB: holeA,
      pins: [holeA],
      valid: !occupied.has(holeA),
      sameStripWarning: false,
    };
  }

  if (kind === 'opamp741') {
    const srcHole = hoverHole ?? anchorHole;
    const [ax] = holeIdToLocalPos(srcHole);
    const startX = -((62 * BB_PITCH) / 2);
    const rawCol = Math.round((ax - startX) / BB_PITCH) + 1;
    const col = Math.min(60, Math.max(1, rawCol));
    const holeA = `t_${col}_e`;
    const holeB = `b_${col + 3}_f`;
    const pins = getPartPins({ kind: 'opamp741', holeA, holeB });
    return {
      holeA,
      holeB,
      pins,
      valid: pins.every((p) => !occupied.has(p)),
      sameStripWarning: false,
    };
  }

  let holeA = pinnedHoleA ?? anchorHole;
  let holeB = hoverHole ?? anchorHole;

  if (!pinnedHoleA) {
    const [ax, , az] = holeIdToLocalPos(holeA);
    const rad = (rotationDeg * Math.PI) / 180;
    const dist = Math.max(2, span) * BB_PITCH;
    const bx = ax + Math.cos(rad) * dist;
    const bz = az + Math.sin(rad) * dist;
    holeB = nearestHoleFromLocalXZ(bx, bz);
    if (holeB === holeA) {
      holeB = shiftHoleColumn(holeA, ax > 0 ? -Math.max(2, span) : Math.max(2, span));
    }
  }

  const valid = holeA !== holeB && !occupied.has(holeA) && !occupied.has(holeB);
  const sameStripWarning = holeIdToElectricalNode(holeA) === holeIdToElectricalNode(holeB);
  return {
    holeA,
    holeB,
    pins: [holeA, holeB],
    valid,
    sameStripWarning,
  };
}

export function rotatePart90(
  part: BreadboardPart,
  occupied: Set<string>
): { holeA: string; holeB: string } | null {
  if (part.kind === 'opamp741') return null;
  const [ax, , az] = holeIdToLocalPos(part.holeA);
  const [bx, , bz] = holeIdToLocalPos(part.holeB);
  const mx = (ax + bx) / 2;
  const mz = (az + bz) / 2;
  const dx = ax - mx;
  const dz = az - mz;
  // 90 deg rotation in XZ plane around midpoint
  const nax = mx - dz;
  const naz = mz + dx;
  const nbx = mx + dz;
  const nbz = mz - dx;
  const holeA = nearestHoleFromLocalXZ(nax, naz);
  const holeB = nearestHoleFromLocalXZ(nbx, nbz);
  if (holeA === holeB || occupied.has(holeA) || occupied.has(holeB)) return null;
  if (holeA === part.holeA && holeB === part.holeB) return null;
  return { holeA, holeB };
}

export function movePartToAnchor(
  part: BreadboardPart,
  targetHole: string,
  occupied: Set<string>
): { holeA: string; holeB: string; valid: boolean } {
  if (part.kind === 'jumper' && part.floating) {
    return { holeA: targetHole, holeB: targetHole, valid: !occupied.has(targetHole) };
  }
  if (part.kind === 'opamp741') {
    const res = computePlacementPreview('opamp741', targetHole, 3, 0, occupied, null, targetHole);
    return { holeA: res.holeA, holeB: res.holeB, valid: res.valid };
  }
  const [ox, , oz] = holeIdToLocalPos(part.holeA);
  const [ox2, , oz2] = holeIdToLocalPos(part.holeB);
  const [nx, , nz] = holeIdToLocalPos(targetHole);
  const holeB = nearestHoleFromLocalXZ(nx + (ox2 - ox), nz + (oz2 - oz));
  const valid = targetHole !== holeB && !occupied.has(targetHole) && !occupied.has(holeB);
  return { holeA: targetHole, holeB, valid };
}

const LED_NAME_BY_COLOR: Record<string, string> = {
  '#ef4444': 'LED Merah',
  '#22c55e': 'LED Hijau',
  '#eab308': 'LED Kuning',
  '#3b82f6': 'LED Biru',
  '#f8fafc': 'LED Putih',
};

export function formatPartLabel(kind: BreadboardComponentKind, value: number, color?: string): string {
  switch (kind) {
    case 'resistor':
      if (value >= 1e6) return `${Number((value / 1e6).toFixed(2))}MΩ`;
      if (value >= 1e3) return `${Number((value / 1e3).toFixed(2))}kΩ`;
      return `${Number(value.toFixed(1))}Ω`;
    case 'capacitor':
      if (value >= 1e-6) return `${Number((value * 1e6).toFixed(2))}µF`;
      if (value >= 1e-9) return `${Number((value * 1e9).toFixed(2))}nF`;
      return `${Number((value * 1e12).toFixed(0))}pF`;
    case 'inductor':
      if (value >= 1e-3) return `${Number((value * 1e3).toFixed(2))}mH`;
      return `${Number((value * 1e6).toFixed(1))}µH`;
    case 'diode':
      return '1N4148';
    case 'led':
      return (color && LED_NAME_BY_COLOR[color.toLowerCase()]) || 'LED';
    case 'jumper':
      return 'Jumper';
    case 'opamp741':
      return 'LM741';
  }
}

const EIA_DIGIT_COLORS = [
  '#111827', // 0 Black
  '#7c2d12', // 1 Brown
  '#dc2626', // 2 Red
  '#ea580c', // 3 Orange
  '#eab308', // 4 Yellow
  '#16a34a', // 5 Green
  '#2563eb', // 6 Blue
  '#7e22ce', // 7 Violet
  '#64748b', // 8 Grey
  '#f8fafc', // 9 White
];

export function eiaColorBands(ohms: number): [string, string, string, string] {
  if (!Number.isFinite(ohms) || ohms < 1) {
    return [EIA_DIGIT_COLORS[1], EIA_DIGIT_COLORS[0], '#d97706', '#eab308'];
  }
  const exp = Math.floor(Math.log10(ohms)) - 1;
  const mant = Math.round(ohms / Math.pow(10, exp));
  const d1 = Math.min(9, Math.max(1, Math.floor(mant / 10)));
  const d2 = Math.min(9, Math.max(0, mant % 10));
  const multColor = exp < 0 ? '#eab308' : EIA_DIGIT_COLORS[Math.min(9, Math.max(0, exp))];
  return [EIA_DIGIT_COLORS[d1], EIA_DIGIT_COLORS[d2], multColor, '#ca8a04'];
}

export function compileBreadboardParts(
  parts: BreadboardPart[],
  nodeResolver: (socketOrHole: string) => string
): CircuitComponent[] {
  const out: CircuitComponent[] = [];
  for (const part of parts) {
    const nA = nodeResolver(`bb_${part.holeA}`);
    const nB = nodeResolver(`bb_${part.holeB}`);

    if (part.kind === 'resistor') {
      out.push({ id: part.id, kind: 'resistor', nodeA: nA, nodeB: nB, ohms: part.value, maxWatts: 0.5 });
    } else if (part.kind === 'capacitor') {
      out.push({ id: part.id, kind: 'capacitor', nodeA: nA, nodeB: nB, farads: part.value });
    } else if (part.kind === 'inductor') {
      out.push({ id: part.id, kind: 'inductor', nodeA: nA, nodeB: nB, henrys: part.value });
    } else if (part.kind === 'jumper') {
      if (part.floating) continue; // Floating jumper tip is unioned ideally to holeA in netlistCompiler
      out.push({ id: part.id, kind: 'resistor', nodeA: nA, nodeB: nB, ohms: 0.02, maxWatts: 5 });
    } else if (part.kind === 'diode') {
      out.push({ id: part.id, kind: 'diode', nodeAnode: nA, nodeCathode: nB, vf: 0.7, rOn: 14 });
    } else if (part.kind === 'led') {
      out.push({ id: part.id, kind: 'diode', nodeAnode: nA, nodeCathode: nB, vf: part.value || 1.9, rOn: 18, isLed: true });
    } else if (part.kind === 'opamp741') {
      const partsA = part.holeA.split('_');
      const col = Math.min(60, Math.max(1, Number(partsA[1]) || 30));
      const invNode = nodeResolver(`bb_b_${col + 1}_f`);
      const nonInvNode = nodeResolver(`bb_b_${col + 2}_f`);
      const outNode = nodeResolver(`bb_t_${col + 2}_e`);
      const gndRef = nodeResolver('EARTH_GND');
      const intOut = `${part.id}_int_out`;

      out.push({
        id: `${part.id}_rin`,
        kind: 'resistor',
        nodeA: nonInvNode,
        nodeB: invNode,
        ohms: 2e6,
        maxWatts: 1,
      });
      out.push({
        id: `${part.id}_core`,
        kind: 'vcvs',
        nodeOutPos: intOut,
        nodeOutNeg: gndRef,
        nodeCtrlPos: nonInvNode,
        nodeCtrlNeg: invNode,
        gain: 5000,
        vSat: 11.5,
      });
      out.push({
        id: `${part.id}_rout`,
        kind: 'resistor',
        nodeA: intOut,
        nodeB: outNode,
        ohms: 75,
        maxWatts: 2,
      });
    }
  }
  return out;
}
