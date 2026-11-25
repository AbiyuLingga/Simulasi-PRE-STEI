import type { CircuitComponent, KitControlState, KitId } from '../circuit/types';

export interface KitSocketSpec {
  id: string;
  label: string;
  u: number;
  v: number;
  color: string;
}

export const DECADE_DIAL_SPECS: ReadonlyArray<{
  label: string;
  mult: number;
  u: number;
  v: number;
}> = [
  { label: '×1MΩ', mult: 1_000_000, u: 0.175, v: 0.365 },
  { label: '×100kΩ', mult: 100_000, u: 0.392, v: 0.365 },
  { label: '×10kΩ', mult: 10_000, u: 0.608, v: 0.365 },
  { label: '×1kΩ', mult: 1_000, u: 0.825, v: 0.365 },
  { label: '×100Ω', mult: 100, u: 0.175, v: 0.675 },
  { label: '×10Ω', mult: 10, u: 0.392, v: 0.675 },
  { label: '×1Ω', mult: 1, u: 0.608, v: 0.675 },
  { label: '×0.1Ω', mult: 0.1, u: 0.825, v: 0.675 },
];

export const DEFAULT_DECADE_DIALS: readonly number[] = [0, 0, 0, 1, 5, 0, 0, 0]; // 1.500 kΩ

export function computeDecadeBoxOhms(dials?: readonly number[]): number {
  const arr = dials && dials.length >= 8 ? dials : DEFAULT_DECADE_DIALS;
  let total = 0;
  for (let i = 0; i < DECADE_DIAL_SPECS.length; i++) {
    const pos = Math.max(0, Math.min(10, Math.round(arr[i] ?? 0)));
    total += pos * DECADE_DIAL_SPECS[i].mult;
  }
  return Number(total.toFixed(2));
}

export function formatOhmsCompact(ohms: number): string {
  if (ohms >= 1_000_000) return `${(ohms / 1_000_000).toFixed(3)} MΩ`;
  if (ohms >= 1_000) return `${(ohms / 1_000).toFixed(3)} kΩ`;
  return `${ohms.toFixed(1)} Ω`;
}

export const DECADE_BOX_SOCKETS: readonly KitSocketSpec[] = [
  { id: 'kp_a', label: 'Dekade Terminal A (+)', u: 0.300, v: 0.885, color: '#dc2626' },
  { id: 'kp_b', label: 'Dekade Terminal B (-)', u: 0.500, v: 0.885, color: '#18181b' },
  { id: 'kp_gnd', label: 'Dekade Case GND (⏚)', u: 0.700, v: 0.885, color: '#16a34a' },
];

export const KIT_TITLE_MAP: Record<KitId, string> = {
  none: 'Off',
  multimeter: '#14 Multimeter',
  osc_gen: '#5 Osiloskop & Gen',
  thevenin: '#22 Thevenin & Norton',
  rl_rc: 'Rangkaian RL & RC',
};

export const KIT_SOCKETS: Record<Exclude<KitId, 'none'>, KitSocketSpec[]> = {
  multimeter: [
    // Left R1..R5 isolated resistors (matching Photo 14)
    { id: 'km_r1_l', label: 'KM R1 (220k) L', u: 0.190, v: 0.305, color: '#cbd5e1' },
    { id: 'km_r1_r', label: 'KM R1 (220k) R', u: 0.352, v: 0.305, color: '#cbd5e1' },
    { id: 'km_r2_l', label: 'KM R2 (1.5k) L', u: 0.190, v: 0.432, color: '#cbd5e1' },
    { id: 'km_r2_r', label: 'KM R2 (1.5k) R', u: 0.352, v: 0.432, color: '#cbd5e1' },
    { id: 'km_r3_l', label: 'KM R3 (33k) L', u: 0.190, v: 0.556, color: '#cbd5e1' },
    { id: 'km_r3_r', label: 'KM R3 (33k) R', u: 0.352, v: 0.556, color: '#cbd5e1' },
    { id: 'km_r4_l', label: 'KM R4 (1.5M) L', u: 0.190, v: 0.680, color: '#cbd5e1' },
    { id: 'km_r4_r', label: 'KM R4 (1.5M) R', u: 0.352, v: 0.680, color: '#cbd5e1' },
    { id: 'km_r5_l', label: 'KM R5 (120Ω) L', u: 0.190, v: 0.805, color: '#cbd5e1' },
    { id: 'km_r5_r', label: 'KM R5 (120Ω) R', u: 0.352, v: 0.805, color: '#cbd5e1' },
    // Center V shunt bridge
    { id: 'km_v_l', label: 'KM V Bridge L', u: 0.440, v: 0.405, color: '#cbd5e1' },
    { id: 'km_v_r', label: 'KM V Bridge R', u: 0.498, v: 0.405, color: '#cbd5e1' },
    // Right R1 / R2 selectable divider network
    { id: 'km_r1_120', label: 'KM Div R1 120Ω', u: 0.545, v: 0.312, color: '#cbd5e1' },
    { id: 'km_r1_1k5', label: 'KM Div R1 1.5kΩ', u: 0.545, v: 0.370, color: '#cbd5e1' },
    { id: 'km_r1_1m5', label: 'KM Div R1 1.5MΩ', u: 0.545, v: 0.428, color: '#cbd5e1' },
    { id: 'km_div_mid', label: 'KM Div Mid Node', u: 0.678, v: 0.370, color: '#cbd5e1' },
    { id: 'km_div_out', label: 'KM Div Out', u: 0.848, v: 0.370, color: '#cbd5e1' },
    { id: 'km_r2_120', label: 'KM Div R2 120Ω', u: 0.720, v: 0.655, color: '#cbd5e1' },
    { id: 'km_r2_1k5', label: 'KM Div R2 1.5kΩ', u: 0.762, v: 0.655, color: '#cbd5e1' },
    { id: 'km_r2_1m5', label: 'KM Div R2 1.5MΩ', u: 0.804, v: 0.655, color: '#cbd5e1' },
    // Bottom jumper buses
    { id: 'km_bus1_l', label: 'KM Bus1 L', u: 0.440, v: 0.750, color: '#cbd5e1' },
    { id: 'km_bus1_r', label: 'KM Bus1 R', u: 0.592, v: 0.750, color: '#cbd5e1' },
    { id: 'km_bus2_l', label: 'KM Bus2 L', u: 0.655, v: 0.750, color: '#cbd5e1' },
    { id: 'km_bus2_m', label: 'KM Bus2 M', u: 0.756, v: 0.750, color: '#cbd5e1' },
    { id: 'km_bus2_r', label: 'KM Bus2 R', u: 0.855, v: 0.750, color: '#cbd5e1' },
  ],
  osc_gen: [
    // PENGUAT
    { id: 'ko_amp_in', label: 'Kit #5 Amp IN', u: 0.215, v: 0.258, color: '#dc2626' },
    { id: 'ko_amp_in_gnd', label: 'Kit #5 Amp IN GND', u: 0.215, v: 0.365, color: '#18181b' },
    { id: 'ko_amp_out', label: 'Kit #5 Amp OUT', u: 0.455, v: 0.258, color: '#dc2626' },
    { id: 'ko_amp_out_gnd', label: 'Kit #5 Amp OUT GND', u: 0.455, v: 0.365, color: '#18181b' },
    // OSILATOR
    { id: 'ko_osc_out', label: 'Kit #5 Osc OUT', u: 0.455, v: 0.562, color: '#eab308' },
    { id: 'ko_osc_gnd', label: 'Kit #5 Osc GND', u: 0.455, v: 0.675, color: '#18181b' },
    // Bottom Phase Shifter (10k pot + 100nF)
    { id: 'ko_ph_l', label: 'Kit #5 Phase IN', u: 0.200, v: 0.875, color: '#16a34a' },
    { id: 'ko_ph_c', label: 'Kit #5 Phase MID', u: 0.335, v: 0.875, color: '#16a34a' },
    { id: 'ko_ph_r', label: 'Kit #5 Phase OUT', u: 0.460, v: 0.875, color: '#16a34a' },
    // Right Block 1 (10k / 1k divider)
    { id: 'ko_b1_in', label: 'Kit #5 Net1 IN', u: 0.578, v: 0.190, color: '#dc2626' },
    { id: 'ko_b1_g1', label: 'Kit #5 Net1 GND1', u: 0.578, v: 0.265, color: '#18181b' },
    { id: 'ko_b1_out', label: 'Kit #5 Net1 OUT', u: 0.848, v: 0.190, color: '#eab308' },
    { id: 'ko_b1_g2', label: 'Kit #5 Net1 GND2', u: 0.848, v: 0.265, color: '#18181b' },
    // Right Block 2 (1uF / 10uF capacitive divider)
    { id: 'ko_b2_in', label: 'Kit #5 Net2 IN', u: 0.578, v: 0.355, color: '#dc2626' },
    { id: 'ko_b2_g1', label: 'Kit #5 Net2 GND1', u: 0.578, v: 0.432, color: '#18181b' },
    { id: 'ko_b2_out', label: 'Kit #5 Net2 OUT', u: 0.848, v: 0.355, color: '#eab308' },
    { id: 'ko_b2_g2', label: 'Kit #5 Net2 GND2', u: 0.848, v: 0.432, color: '#18181b' },
    // Right Block 3 (compensated probe divider 10k//1nF + 1k//10uF)
    { id: 'ko_b3_in', label: 'Kit #5 Net3 IN', u: 0.578, v: 0.525, color: '#dc2626' },
    { id: 'ko_b3_g1', label: 'Kit #5 Net3 GND1', u: 0.578, v: 0.602, color: '#18181b' },
    { id: 'ko_b3_out', label: 'Kit #5 Net3 OUT', u: 0.848, v: 0.525, color: '#eab308' },
    { id: 'ko_b3_g2', label: 'Kit #5 Net3 GND2', u: 0.848, v: 0.602, color: '#18181b' },
    // Right Block 4 (diode clamp/detector)
    { id: 'ko_b4_in', label: 'Kit #5 Net4 IN', u: 0.578, v: 0.722, color: '#dc2626' },
    { id: 'ko_b4_g1', label: 'Kit #5 Net4 GND1', u: 0.578, v: 0.818, color: '#18181b' },
    { id: 'ko_b4_out', label: 'Kit #5 Net4 OUT', u: 0.848, v: 0.722, color: '#eab308' },
    { id: 'ko_b4_g2', label: 'Kit #5 Net4 GND2', u: 0.848, v: 0.818, color: '#18181b' },
  ],
  thevenin: [
    // 18V Fixed Supply
    { id: 'kt_18_p', label: 'Kit #22 18V + (A)', u: 0.232, v: 0.205, color: '#dc2626' },
    { id: 'kt_18_n', label: 'Kit #22 18V - (B)', u: 0.232, v: 0.285, color: '#18181b' },
    // POT C-D
    { id: 'kt_pot_c', label: 'Kit #22 POT (C)', u: 0.468, v: 0.205, color: '#dc2626' },
    { id: 'kt_pot_d', label: 'Kit #22 POT (D)', u: 0.468, v: 0.285, color: '#18181b' },
    // Transistor / Zener Stage
    { id: 'kt_e', label: 'Kit #22 E (Collector)', u: 0.468, v: 0.362, color: '#dc2626' },
    { id: 'kt_e_l', label: 'Kit #22 E Left', u: 0.232, v: 0.362, color: '#dc2626' },
    { id: 'kt_z_g', label: 'Kit #22 Zener Node', u: 0.232, v: 0.605, color: '#16a34a' },
    { id: 'kt_b_g', label: 'Kit #22 Base Node', u: 0.325, v: 0.478, color: '#16a34a' },
    { id: 'kt_f', label: 'Kit #22 F', u: 0.468, v: 0.440, color: '#eab308' },
    { id: 'kt_c_y', label: 'Kit #22 Emitter Y', u: 0.468, v: 0.542, color: '#eab308' },
    { id: 'kt_5k_y', label: 'Kit #22 5k Tap', u: 0.468, v: 0.675, color: '#eab308' },
    { id: 'kt_gnd_l', label: 'Kit #22 GND L', u: 0.232, v: 0.805, color: '#18181b' },
    { id: 'kt_gnd_m', label: 'Kit #22 GND M', u: 0.325, v: 0.805, color: '#18181b' },
    { id: 'kt_gnd_r', label: 'Kit #22 GND R', u: 0.468, v: 0.805, color: '#18181b' },
    // Rangkaian N (A-B input, C-D output)
    { id: 'kt_n_b', label: 'Kit #22 Rangkaian N (B)', u: 0.680, v: 0.258, color: '#18181b' },
    { id: 'kt_n_a', label: 'Kit #22 Rangkaian N (A)', u: 0.770, v: 0.258, color: '#eab308' },
    { id: 'kt_n_d', label: 'Kit #22 Rangkaian N (D)', u: 0.680, v: 0.472, color: '#18181b' },
    { id: 'kt_n_c', label: 'Kit #22 Rangkaian N (C)', u: 0.770, v: 0.472, color: '#eab308' },
    // Bottom 2k / 2k / 3.3k Load Bank
    { id: 'kt_load_com', label: 'Kit #22 Load Common', u: 0.728, v: 0.578, color: '#dc2626' },
    { id: 'kt_l0', label: 'Kit #22 Load Return', u: 0.635, v: 0.822, color: '#18181b' },
    { id: 'kt_l1', label: 'Kit #22 Load R1 (2k)', u: 0.700, v: 0.822, color: '#18181b' },
    { id: 'kt_l2', label: 'Kit #22 Load R2 (2k)', u: 0.762, v: 0.822, color: '#18181b' },
    { id: 'kt_l3', label: 'Kit #22 Load R3 (3k3)', u: 0.824, v: 0.822, color: '#18181b' },
  ],
  rl_rc: [
    // Left Reactive Inputs -> Yellow Joined OUT Node
    { id: 'kr_c1_in', label: 'RL/RC 100nF IN', u: 0.205, v: 0.340, color: '#dc2626' },
    { id: 'kr_c1_y', label: 'RL/RC 100nF -> OUT', u: 0.362, v: 0.340, color: '#eab308' },
    { id: 'kr_c2_in', label: 'RL/RC 8.2nF IN', u: 0.205, v: 0.460, color: '#dc2626' },
    { id: 'kr_c2_y', label: 'RL/RC 8.2nF -> OUT', u: 0.362, v: 0.460, color: '#eab308' },
    { id: 'kr_l1_in', label: 'RL/RC 2.5mH IN', u: 0.205, v: 0.580, color: '#dc2626' },
    { id: 'kr_l1_y', label: 'RL/RC 2.5mH -> OUT', u: 0.362, v: 0.580, color: '#eab308' },
    { id: 'kr_out', label: 'RL/RC OUT Node', u: 0.498, v: 0.460, color: '#eab308' },
    // Right Resistive Branches
    { id: 'kr_r1_y', label: 'RL/RC 1kΩ <- OUT', u: 0.634, v: 0.340, color: '#eab308' },
    { id: 'kr_r1_out', label: 'RL/RC 1kΩ Port', u: 0.790, v: 0.340, color: '#dc2626' },
    { id: 'kr_r2_y', label: 'RL/RC 10kΩ <- OUT', u: 0.634, v: 0.460, color: '#eab308' },
    { id: 'kr_r2_out', label: 'RL/RC 10kΩ Port', u: 0.790, v: 0.460, color: '#dc2626' },
    { id: 'kr_r3_y', label: 'RL/RC 100kΩ <- OUT', u: 0.634, v: 0.580, color: '#eab308' },
    { id: 'kr_r3_out', label: 'RL/RC 100kΩ Port', u: 0.790, v: 0.580, color: '#dc2626' },
    // Bottom Shared GND Bus
    { id: 'kr_gnd_l', label: 'RL/RC GND Left', u: 0.145, v: 0.795, color: '#18181b' },
    { id: 'kr_gnd_c', label: 'RL/RC GND Center', u: 0.498, v: 0.795, color: '#18181b' },
    { id: 'kr_gnd_r', label: 'RL/RC GND Right', u: 0.852, v: 0.795, color: '#18181b' },
  ],
};

export function compileActiveKit(
  kitId: KitId,
  controls: KitControlState,
  union: (a: string, b: string) => void,
  node: (sock: string) => string
): CircuitComponent[] {
  if (kitId === 'none') return [];
  const out: CircuitComponent[] = [];

  if (kitId === 'multimeter') {
    union('km_div_mid', 'km_div_out');
    union('km_v_l', 'km_v_r');
    union('km_bus1_l', 'km_bus1_r');
    union('km_bus2_l', 'km_bus2_m');
    union('km_bus2_m', 'km_bus2_r');

    out.push(
      { id: 'km_r1', kind: 'resistor', nodeA: node('km_r1_l'), nodeB: node('km_r1_r'), ohms: 220_000, maxWatts: 0.5 },
      { id: 'km_r2', kind: 'resistor', nodeA: node('km_r2_l'), nodeB: node('km_r2_r'), ohms: 1_500, maxWatts: 0.5 },
      { id: 'km_r3', kind: 'resistor', nodeA: node('km_r3_l'), nodeB: node('km_r3_r'), ohms: 33_000, maxWatts: 0.5 },
      { id: 'km_r4', kind: 'resistor', nodeA: node('km_r4_l'), nodeB: node('km_r4_r'), ohms: 1_500_000, maxWatts: 0.5 },
      { id: 'km_r5', kind: 'resistor', nodeA: node('km_r5_l'), nodeB: node('km_r5_r'), ohms: 120, maxWatts: 0.5 },
      { id: 'km_d1a', kind: 'resistor', nodeA: node('km_r1_120'), nodeB: node('km_div_mid'), ohms: 120, maxWatts: 0.5 },
      { id: 'km_d1b', kind: 'resistor', nodeA: node('km_r1_1k5'), nodeB: node('km_div_mid'), ohms: 1_500, maxWatts: 0.5 },
      { id: 'km_d1c', kind: 'resistor', nodeA: node('km_r1_1m5'), nodeB: node('km_div_mid'), ohms: 1_500_000, maxWatts: 0.5 },
      { id: 'km_d2a', kind: 'resistor', nodeA: node('km_div_mid'), nodeB: node('km_r2_120'), ohms: 120, maxWatts: 0.5 },
      { id: 'km_d2b', kind: 'resistor', nodeA: node('km_div_mid'), nodeB: node('km_r2_1k5'), ohms: 1_500, maxWatts: 0.5 },
      { id: 'km_d2c', kind: 'resistor', nodeA: node('km_div_mid'), nodeB: node('km_r2_1m5'), ohms: 1_500_000, maxWatts: 0.5 }
    );
    return out;
  }

  if (kitId === 'osc_gen') {
    union('ko_amp_in_gnd', 'ko_amp_out_gnd');
    union('ko_amp_in_gnd', 'ko_osc_gnd');
    union('ko_b1_g1', 'ko_b1_g2');
    union('ko_b2_g1', 'ko_b2_g2');
    union('ko_b3_g1', 'ko_b3_g2');
    union('ko_b4_g1', 'ko_b4_g2');
    union('ko_b1_g1', 'ko_amp_in_gnd');
    union('ko_b2_g1', 'ko_amp_in_gnd');
    union('ko_b3_g1', 'ko_amp_in_gnd');
    union('ko_b4_g1', 'ko_amp_in_gnd');

    if (controls.oscAmpPower) {
      out.push(
        { id: 'ko_amp_rin', kind: 'resistor', nodeA: node('ko_amp_in'), nodeB: node('ko_amp_in_gnd'), ohms: 100_000, maxWatts: 1 },
        {
          id: 'ko_amp_vcvs',
          kind: 'vcvs',
          nodeOutPos: 'N_KO_AMP_INT',
          nodeOutNeg: node('ko_amp_out_gnd'),
          nodeCtrlPos: node('ko_amp_in'),
          nodeCtrlNeg: node('ko_amp_in_gnd'),
          gain: controls.oscAmpGain,
          vSat: 12,
        },
        { id: 'ko_amp_rout', kind: 'resistor', nodeA: 'N_KO_AMP_INT', nodeB: node('ko_amp_out'), ohms: 100, maxWatts: 2 }
      );
    }

    if (controls.oscGenPower) {
      const freqs = [500, 2000, 8000];
      out.push(
        {
          id: 'ko_osc_src',
          kind: 'vsource_func',
          nodePos: 'N_KO_OSC_INT',
          nodeNeg: node('ko_osc_gnd'),
          waveform: 'sine',
          freqHz: freqs[controls.oscGenFreqIdx] ?? 2000,
          amplitudePeak: 2.0,
          dcOffset: 0,
          dutyPct: 50,
        },
        { id: 'ko_osc_rout', kind: 'resistor', nodeA: 'N_KO_OSC_INT', nodeB: node('ko_osc_out'), ohms: 100, maxWatts: 2 }
      );
    }

    // Bottom RC Phase Shifter
    out.push(
      { id: 'ko_ph_pot', kind: 'resistor', nodeA: node('ko_ph_l'), nodeB: node('ko_ph_c'), ohms: controls.oscPhasePotOhms, maxWatts: 1 },
      { id: 'ko_ph_cap', kind: 'capacitor', nodeA: node('ko_ph_c'), nodeB: node('ko_ph_r'), farads: 100e-9 }
    );

    // Block 1: 10k series, 1k shunt
    out.push(
      { id: 'ko_b1_rs', kind: 'resistor', nodeA: node('ko_b1_in'), nodeB: node('ko_b1_out'), ohms: 10_000, maxWatts: 0.5 },
      { id: 'ko_b1_rp', kind: 'resistor', nodeA: node('ko_b1_out'), nodeB: node('ko_b1_g1'), ohms: 1_000, maxWatts: 0.5 }
    );

    // Block 2: 1uF series, 10uF shunt
    out.push(
      { id: 'ko_b2_cs', kind: 'capacitor', nodeA: node('ko_b2_in'), nodeB: node('ko_b2_out'), farads: 1e-6 },
      { id: 'ko_b2_cp', kind: 'capacitor', nodeA: node('ko_b2_out'), nodeB: node('ko_b2_g1'), farads: 10e-6 }
    );

    // Block 3: (10k // 1nF) series, (1k // 10uF) shunt
    out.push(
      { id: 'ko_b3_rs', kind: 'resistor', nodeA: node('ko_b3_in'), nodeB: node('ko_b3_out'), ohms: 10_000, maxWatts: 0.5 },
      { id: 'ko_b3_cs', kind: 'capacitor', nodeA: node('ko_b3_in'), nodeB: node('ko_b3_out'), farads: 1e-9 },
      { id: 'ko_b3_rp', kind: 'resistor', nodeA: node('ko_b3_out'), nodeB: node('ko_b3_g1'), ohms: 1_000, maxWatts: 0.5 },
      { id: 'ko_b3_cp', kind: 'capacitor', nodeA: node('ko_b3_out'), nodeB: node('ko_b3_g1'), farads: 10e-6 }
    );

    // Block 4: 10uF -> Diode -> (1k // 2.2uF)
    out.push(
      { id: 'ko_b4_cs', kind: 'capacitor', nodeA: node('ko_b4_in'), nodeB: 'N_KO_B4_MID', farads: 10e-6 },
      { id: 'ko_b4_d', kind: 'diode', nodeAnode: 'N_KO_B4_MID', nodeCathode: node('ko_b4_out'), vf: 0.7, rOn: 15 },
      { id: 'ko_b4_rp', kind: 'resistor', nodeA: node('ko_b4_out'), nodeB: node('ko_b4_g1'), ohms: 1_000, maxWatts: 0.5 },
      { id: 'ko_b4_cp', kind: 'capacitor', nodeA: node('ko_b4_out'), nodeB: node('ko_b4_g1'), farads: 2.2e-6 }
    );
    return out;
  }

  if (kitId === 'thevenin') {
    union('kt_e_l', 'kt_e');
    union('kt_gnd_l', 'kt_gnd_m');
    union('kt_gnd_m', 'kt_gnd_r');
    union('kt_load_com', 'kt_l0');

    out.push(
      // 18V Fixed Supply (isolated from kit GND until wired externally)
      { id: 'kt_18v_src', kind: 'vsource_dc', nodePos: 'N_KT_18_INT', nodeNeg: node('kt_18_n'), volts: 18, currentLimitAmps: 1.5 },
      { id: 'kt_18v_r', kind: 'resistor', nodeA: 'N_KT_18_INT', nodeB: node('kt_18_p'), ohms: 0.1, maxWatts: 10 },
      // Variable POT across C-D
      { id: 'kt_pot', kind: 'resistor', nodeA: node('kt_pot_c'), nodeB: node('kt_pot_d'), ohms: controls.thevPotOhms, maxWatts: 1 },
      // Bottom-left 2N1613 NPN + 6.2V Zener constant-current Norton stage
      { id: 'kt_r10k', kind: 'resistor', nodeA: node('kt_e'), nodeB: node('kt_z_g'), ohms: 10_000, maxWatts: 0.5 },
      { id: 'kt_r2k7', kind: 'resistor', nodeA: node('kt_z_g'), nodeB: node('kt_gnd_m'), ohms: 2_700, maxWatts: 0.5 },
      { id: 'kt_dz', kind: 'diode', nodeAnode: node('kt_gnd_m'), nodeCathode: node('kt_z_g'), vf: 0.7, rOn: 12, vz: 6.2 },
      { id: 'kt_rb', kind: 'resistor', nodeA: node('kt_z_g'), nodeB: node('kt_b_g'), ohms: 220, maxWatts: 0.5 },
      { id: 'kt_q1', kind: 'npn', nodeC: node('kt_f'), nodeB: node('kt_b_g'), nodeE: node('kt_c_y'), beta: 80, vbeOn: 0.7, vceSat: 0.2, rBe: 200 },
      { id: 'kt_r390', kind: 'resistor', nodeA: node('kt_c_y'), nodeB: node('kt_5k_y'), ohms: 390, maxWatts: 0.5 },
      { id: 'kt_r5k', kind: 'resistor', nodeA: node('kt_5k_y'), nodeB: node('kt_gnd_r'), ohms: controls.thevNortonPotOhms, maxWatts: 0.5 },
      // Rangkaian N passive resistive bridge (A-B to C-D)
      { id: 'kt_na_c', kind: 'resistor', nodeA: node('kt_n_a'), nodeB: node('kt_n_c'), ohms: 1_500, maxWatts: 0.5 },
      { id: 'kt_na_b', kind: 'resistor', nodeA: node('kt_n_a'), nodeB: node('kt_n_b'), ohms: 10_000, maxWatts: 0.5 },
      { id: 'kt_nb_d', kind: 'resistor', nodeA: node('kt_n_b'), nodeB: node('kt_n_d'), ohms: 1_000, maxWatts: 0.5 },
      { id: 'kt_na_d', kind: 'resistor', nodeA: node('kt_n_a'), nodeB: node('kt_n_d'), ohms: 3_300, maxWatts: 0.5 },
      { id: 'kt_nc_d', kind: 'resistor', nodeA: node('kt_n_c'), nodeB: node('kt_n_d'), ohms: 2_200, maxWatts: 0.5 },
      // Bottom Load Bank: 2k, 2k, 3.3k
      { id: 'kt_ld1', kind: 'resistor', nodeA: node('kt_load_com'), nodeB: node('kt_l1'), ohms: 2_000, maxWatts: 0.5 },
      { id: 'kt_ld2', kind: 'resistor', nodeA: node('kt_load_com'), nodeB: node('kt_l2'), ohms: 2_000, maxWatts: 0.5 },
      { id: 'kt_ld3', kind: 'resistor', nodeA: node('kt_load_com'), nodeB: node('kt_l3'), ohms: 3_300, maxWatts: 0.5 }
    );
    return out;
  }

  if (kitId === 'rl_rc') {
    union('kr_c1_y', 'kr_out');
    union('kr_c2_y', 'kr_out');
    union('kr_l1_y', 'kr_out');
    union('kr_r1_y', 'kr_out');
    union('kr_r2_y', 'kr_out');
    union('kr_r3_y', 'kr_out');
    union('kr_gnd_l', 'kr_gnd_c');
    union('kr_gnd_c', 'kr_gnd_r');

    out.push(
      { id: 'kr_c1', kind: 'capacitor', nodeA: node('kr_c1_in'), nodeB: node('kr_out'), farads: 100e-9 },
      { id: 'kr_c2', kind: 'capacitor', nodeA: node('kr_c2_in'), nodeB: node('kr_out'), farads: 8.2e-9 },
      { id: 'kr_l1', kind: 'inductor', nodeA: node('kr_l1_in'), nodeB: node('kr_out'), henrys: 2.5e-3 },
      { id: 'kr_r1', kind: 'resistor', nodeA: node('kr_out'), nodeB: node('kr_r1_out'), ohms: 1_000, maxWatts: 1 },
      { id: 'kr_r2', kind: 'resistor', nodeA: node('kr_out'), nodeB: node('kr_r2_out'), ohms: 10_000, maxWatts: 1 },
      { id: 'kr_r3', kind: 'resistor', nodeA: node('kr_out'), nodeB: node('kr_r3_out'), ohms: 100_000, maxWatts: 1 }
    );
    return out;
  }

  return out;
}
