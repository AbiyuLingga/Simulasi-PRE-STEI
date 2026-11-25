import { describe, expect, it } from 'vitest';
import { createInitialDS1000EState } from '../../ds1000e/state';
import { runSimulationStep } from '../../../simulation/worker/circuit.worker';
import {
  createInitialDM3058State,
  formatDM3058Reading,
  pressDM3058Button,
} from '../state';

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
  oscAmpGain: 2.5,
  oscGenPower: true,
  oscGenFreqIdx: 1 as const,
  oscPhasePotOhms: 3300,
  thevPotOhms: 2200,
  thevNortonPotOhms: 1000,
};

function makeDmmWorkerCfg(overrides: Partial<import('../../../simulation/circuit/types').DmmConfig> = {}) {
  return {
    power: true,
    func: 'DCV' as const,
    dualEnabled: false,
    viceFunc: 'ACV' as const,
    inputZ: '10M' as const,
    rangeIndex: 2,
    autoRange: true,
    ...overrides,
  };
}

describe('RIGOL DM3058 5½-Digit DMM', () => {
  it('formats 5½-digit readings with Rigol comma grouping and dual-display compact format', () => {
    const f1 = formatDM3058Reading('DCV', 1.99747, 1, true, 'S', false);
    expect(`${f1.text}${f1.unit}`).toBe('1.997,47V');

    const f2 = formatDM3058Reading('2WR', 1000, 1, true, 'S', false);
    expect(`${f2.text}${f2.unit}`).toBe('1.000,00kΩ');

    const fDual = formatDM3058Reading('DCV', 5.0624, 2, true, 'S', true);
    expect(`${fDual.text}${fDual.unit}`).toBe('05.0624V');

    const ovl = formatDM3058Reading('DCV', 1250, 4, false, 'S', false);
    expect(ovl.overloaded).toBe(true);
    expect(ovl.text).toBe('OVERLOAD');
  });

  it('handles physical front-panel buttons, 2ND shift, Dual mode, Math & Manual Ranging', () => {
    let st = createInitialDM3058State();
    expect(st.func).toBe('DCV');

    st = pressDM3058Button(st, 'SECOND');
    st = pressDM3058Button(st, 'OHM');
    expect(st.func).toBe('4WR');
    expect(st.secondShift).toBe(false);

    st = pressDM3058Button(st, 'DCV');
    st = pressDM3058Button(st, 'SECOND');
    st = pressDM3058Button(st, 'DCI');
    expect(st.dualEnabled).toBe(true);
    expect(st.viceFunc).toBe('DCI');

    st = pressDM3058Button(st, 'DOWN');
    expect(st.autoRange).toBe(false);
    st = pressDM3058Button(st, 'AUTO');
    expect(st.autoRange).toBe(true);

    st = pressDM3058Button(st, 'MATH');
    st = pressDM3058Button(st, 'SOFT_2'); // dBm
    expect(st.mathMode).toBe('dBm');
    st = pressDM3058Button(st, 'RIGHT');
    expect(st.dbmRefOhms).toBe(75);
  });

  it('measures DCV, DCI, 4-wire Kelvin Ω, Capacitance AC, and Diode Vf via MNA solver', () => {
    const scope = createInitialDS1000EState();

    // 1. DCI + DCV simultaneously on 6V PSU + 1kΩ breadboard load
    const dciRes = runSimulationStep(
      {
        activeKit: 'none',
        kitControls: BASE_KIT_CTL,
        breadboardParts: [{ id: 'r_load', kind: 'resistor', label: '1kΩ', value: 1000, holeA: 't_10_c', holeB: 't_16_c' }],
        cables: [
          { id: 'c1', kind: 'banana_4mm', color: '#dc2626', label: 'PSU->', endA: 'psu_ch1_pos', endB: 'dmm_i' },
          { id: 'c2', kind: 'banana_4mm', color: '#18181b', label: 'COM->', endA: 'dmm_com', endB: 'bb_t_10_a' },
          { id: 'c3', kind: 'banana_4mm', color: '#18181b', label: 'GND', endA: 'bb_t_16_a', endB: 'psu_ch1_neg' },
        ],
        signalGen: { ...BASE_GEN, outputEnabled: false },
        powerSupply: BASE_PSU,
        scopePowered: false,
        ch1ProbeAtten: 1,
        ch2ProbeAtten: 1,
        dmm: makeDmmWorkerCfg({ func: 'DCI', rangeIndex: 2 }),
      },
      scope
    );
    expect(dciRes.dm3058Meas.idc).toBeCloseTo(6 / 1001, 3);

    // 2. 4WR Kelvin resistance removes lead resistance error (1000Ω vs 1000.08Ω)
    const r4Res = runSimulationStep(
      {
        activeKit: 'none',
        kitControls: BASE_KIT_CTL,
        breadboardParts: [{ id: 'r_dut', kind: 'resistor', label: '1kΩ', value: 1000, holeA: 't_20_c', holeB: 't_26_c' }],
        cables: [
          { id: 'fh', kind: 'banana_4mm', color: '#dc2626', label: 'HI', endA: 'dmm_pos', endB: 'bb_t_20_a' },
          { id: 'fl', kind: 'banana_4mm', color: '#18181b', label: 'LO', endA: 'dmm_com', endB: 'bb_t_26_a' },
          { id: 'sh', kind: 'banana_4mm', color: '#ef4444', label: 'SH', endA: 'dmm_sense_hi', endB: 'bb_t_20_b' },
          { id: 'sl', kind: 'banana_4mm', color: '#334155', label: 'SL', endA: 'dmm_sense_lo', endB: 'bb_t_26_b' },
        ],
        signalGen: { ...BASE_GEN, outputEnabled: false },
        powerSupply: { ...BASE_PSU, outputEnabled: false },
        scopePowered: false,
        ch1ProbeAtten: 1,
        ch2ProbeAtten: 1,
        dmm: makeDmmWorkerCfg({ func: '4WR' }),
      },
      scope
    );
    expect(r4Res.dm3058Meas.ohms4W).toBeCloseTo(1000, 1);

    // 3. Capacitance AC admittance measurement on 100nF capacitor
    const capRes = runSimulationStep(
      {
        activeKit: 'none',
        kitControls: BASE_KIT_CTL,
        breadboardParts: [{ id: 'c_dut', kind: 'capacitor', label: '100nF', value: 100e-9, holeA: 't_30_c', holeB: 't_36_c' }],
        cables: [
          { id: 'cp', kind: 'banana_4mm', color: '#dc2626', label: 'HI', endA: 'dmm_pos', endB: 'bb_t_30_a' },
          { id: 'cn', kind: 'banana_4mm', color: '#18181b', label: 'LO', endA: 'dmm_com', endB: 'bb_t_36_a' },
        ],
        signalGen: { ...BASE_GEN, outputEnabled: false },
        powerSupply: { ...BASE_PSU, outputEnabled: false },
        scopePowered: false,
        ch1ProbeAtten: 1,
        ch2ProbeAtten: 1,
        dmm: makeDmmWorkerCfg({ func: 'CAP' }),
      },
      scope
    );
    expect(capRes.dm3058Meas.farads).toBeGreaterThan(95e-9);
    expect(capRes.dm3058Meas.farads).toBeLessThan(105e-9);

    // 4. Diode forward voltage test on 1N4148
    const dioRes = runSimulationStep(
      {
        activeKit: 'none',
        kitControls: BASE_KIT_CTL,
        breadboardParts: [{ id: 'd_dut', kind: 'diode', label: '1N4148', value: 0.7, holeA: 'b_10_g', holeB: 'b_16_g' }],
        cables: [
          { id: 'dp', kind: 'banana_4mm', color: '#dc2626', label: 'HI', endA: 'dmm_pos', endB: 'bb_b_10_h' },
          { id: 'dn', kind: 'banana_4mm', color: '#18181b', label: 'LO', endA: 'dmm_com', endB: 'bb_b_16_h' },
        ],
        signalGen: { ...BASE_GEN, outputEnabled: false },
        powerSupply: { ...BASE_PSU, outputEnabled: false },
        scopePowered: false,
        ch1ProbeAtten: 1,
        ch2ProbeAtten: 1,
        dmm: makeDmmWorkerCfg({ func: 'DIODE' }),
      },
      scope
    );
    expect(dioRes.dm3058Meas.diodeVf).toBeGreaterThan(0.68);
    expect(dioRes.dm3058Meas.diodeVf).toBeLessThan(0.76);
  });
});
