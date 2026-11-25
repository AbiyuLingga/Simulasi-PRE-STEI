import { describe, expect, it } from 'vitest';
import { holeIdToElectricalNode } from '../breadboard/breadboardModel';
import { CircuitMNASolver } from '../circuit/mnaSolver';
import { compileBenchNetlist } from '../circuit/netlistCompiler';

const BASE_GEN = {
  power: true,
  outputEnabled: true,
  waveform: 'sine' as const,
  freqHz: 1000,
  vpp: 4.0,
  dcOffset: 0,
  dutyPct: 50,
  attenuator20dB: false,
};

const BASE_PSU = {
  power: true,
  outputEnabled: true,
  ch1Voltage: 6.0,
  ch1CurrentLimit: 1.5,
  ch2Voltage: 12.0,
  ch2CurrentLimit: 1.5,
  trackingDual12V: false,
};

const BASE_KIT_CTL = {
  oscAmpPower: true,
  oscAmpGain: 3.0,
  oscGenPower: true,
  oscGenFreqIdx: 1 as const,
  oscPhasePotOhms: 3300,
  thevPotOhms: 2200,
  thevNortonPotOhms: 1000,
};

describe('LDTE Kits & Breadboard MNA Physics', () => {
  it('computes exact RC low-pass AC transfer ratio on Kit 4 (Rangkaian RL & RC)', () => {
    const netlist = compileBenchNetlist({
      activeKit: 'rl_rc',
      kitControls: BASE_KIT_CTL,
      cables: [
        { id: 'c_in', kind: 'banana_4mm', color: '#dc2626', label: 'In', endA: 'gen_out', endB: 'kr_r1_out' },
        { id: 'c_g', kind: 'banana_4mm', color: '#18181b', label: 'GND', endA: 'gen_gnd', endB: 'kr_gnd_l' },
        { id: 'c_cap', kind: 'banana_4mm', color: '#18181b', label: 'Cap', endA: 'kr_c1_in', endB: 'kr_gnd_c' },
        { id: 'p1', kind: 'probe_bnc_hook', color: '#eab308', label: 'CH1', endA: 'rigol_ch1', endB: 'kr_out', gndClip: 'kr_gnd_r' },
      ],
      signalGen: BASE_GEN,
      powerSupply: { ...BASE_PSU, outputEnabled: false },
      scopePowered: true,
      ch1ProbeAtten: 1,
      ch2ProbeAtten: 1,
    });

    const solver = new CircuitMNASolver();
    solver.compile(netlist);
    const ac = solver.solveAC(1000);
    // Gen has 50 ohm out + Kit R1 1k = 1050 ohm total with 100nF
    const R = 1050;
    const C = 100e-9;
    const expected = 1 / Math.hypot(1, 2 * Math.PI * 1000 * R * C);
    const ratio = ac.nodePhasors[netlist.probeNodes.ch1.signalNode].mag / 2.0;
    expect(ratio).toBeCloseTo(expected, 2);
  });

  it('solves Kit #14 Multimeter 1.5k + 1.5k voltage divider to 3.0V under 6V PSU', () => {
    const netlist = compileBenchNetlist({
      activeKit: 'multimeter',
      kitControls: BASE_KIT_CTL,
      cables: [
        { id: 'v_p', kind: 'banana_4mm', color: '#dc2626', label: '+6V', endA: 'psu_ch1_pos', endB: 'km_r1_1k5' },
        { id: 'v_n', kind: 'banana_4mm', color: '#18181b', label: '0V', endA: 'psu_ch1_neg', endB: 'km_r2_1k5' },
        { id: 'd_p', kind: 'banana_4mm', color: '#ef4444', label: 'DMM+', endA: 'dmm_pos', endB: 'km_div_mid' },
        { id: 'd_n', kind: 'banana_4mm', color: '#18181b', label: 'DMM-', endA: 'dmm_com', endB: 'km_r2_1k5' },
      ],
      signalGen: { ...BASE_GEN, outputEnabled: false },
      powerSupply: BASE_PSU,
      dmm: {
        power: true,
        func: 'DCV',
        dualEnabled: false,
        viceFunc: 'ACV',
        inputZ: '10M',
        rangeIndex: 2,
        autoRange: true,
      },
      scopePowered: false,
      ch1ProbeAtten: 1,
      ch2ProbeAtten: 1,
    });

    const solver = new CircuitMNASolver();
    solver.compile(netlist);
    const dc = solver.solveDC();
    const vMid = (dc.nodeVoltages[netlist.dmmNodes!.posNode] ?? 0) - (dc.nodeVoltages[netlist.dmmNodes!.comNode] ?? 0);
    expect(vMid).toBeCloseTo(3.0, 2);
  });

  it('amplifies input on Kit #5 Penguat (gain = 3x)', () => {
    const netlist = compileBenchNetlist({
      activeKit: 'osc_gen',
      kitControls: { ...BASE_KIT_CTL, oscAmpPower: true, oscAmpGain: 3.0 },
      cables: [
        { id: 'in', kind: 'banana_4mm', color: '#dc2626', label: 'In', endA: 'gen_out', endB: 'ko_amp_in' },
        { id: 'ig', kind: 'banana_4mm', color: '#18181b', label: 'G', endA: 'gen_gnd', endB: 'ko_amp_in_gnd' },
        { id: 'p2', kind: 'probe_bnc_hook', color: '#06b6d4', label: 'CH2', endA: 'rigol_ch2', endB: 'ko_amp_out', gndClip: 'ko_amp_out_gnd' },
      ],
      signalGen: { ...BASE_GEN, vpp: 2.0 }, // 1.0 Vp in -> ~3.0 Vp out
      powerSupply: { ...BASE_PSU, outputEnabled: false },
      scopePowered: true,
      ch1ProbeAtten: 1,
      ch2ProbeAtten: 1,
    });

    const solver = new CircuitMNASolver();
    solver.compile(netlist);
    const ac = solver.solveAC(1000);
    expect(ac.nodePhasors[netlist.probeNodes.ch2.signalNode].mag).toBeCloseTo(3.0, 1);
  });

  it('shares Breadboard tie-points across rows a-e and drives LED forward current', () => {
    expect(holeIdToElectricalNode('t_15_a')).toBe(holeIdToElectricalNode('t_15_e'));
    expect(holeIdToElectricalNode('t_15_a')).not.toBe(holeIdToElectricalNode('b_15_f'));

    const netlist = compileBenchNetlist({
      activeKit: 'none',
      kitControls: BASE_KIT_CTL,
      breadboardParts: [
        { id: 'r_led', kind: 'resistor', label: '330', value: 330, holeA: 't_10_c', holeB: 't_16_c' },
        { id: 'led_test', kind: 'led', label: 'LED', value: 1.9, holeA: 't_16_a', holeB: 'tn_14', color: '#ef4444' },
      ],
      cables: [
        { id: 'vp', kind: 'banana_4mm', color: '#dc2626', label: '+', endA: 'psu_ch1_pos', endB: 'bb_t_10_a' },
        { id: 'vn', kind: 'banana_4mm', color: '#18181b', label: '-', endA: 'psu_ch1_neg', endB: 'bb_tn_10' },
      ],
      signalGen: { ...BASE_GEN, outputEnabled: false },
      powerSupply: { ...BASE_PSU, ch1Voltage: 5.0 },
      scopePowered: false,
      ch1ProbeAtten: 1,
      ch2ProbeAtten: 1,
    });

    const solver = new CircuitMNASolver();
    solver.compile(netlist);
    solver.solveDC();
    const currents = solver.getLastDiodeCurrents();
    // (5V - 1.9V) / (330 + 18) ~ 8.9 mA
    expect(currents.led_test).toBeGreaterThan(0.007);
    expect(currents.led_test).toBeLessThan(0.011);
  });
});
