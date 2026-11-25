import { describe, expect, it } from 'vitest';
import { computeAllMeasurements, computeAutoSetup } from '../../instruments/ds1000e/dsp';
import { createInitialDS1000EState } from '../../instruments/ds1000e/state';
import { CircuitMNASolver } from '../circuit/mnaSolver';
import { type CompileBenchParams } from '../circuit/netlistCompiler';
import { runSimulationStep } from '../worker/circuit.worker';

const BASE_PSU = {
  power: true,
  outputEnabled: false,
  ch1Voltage: 6,
  ch1CurrentLimit: 1.5,
  ch2Voltage: 12,
  ch2CurrentLimit: 1.5,
  trackingDual12V: false,
};

const BASE_GEN = {
  power: true,
  outputEnabled: true,
  waveform: 'sine' as const,
  freqHz: 1000,
  vpp: 4.0,
  dcOffset: 0,
  dutyPct: 50,
  attenuator20dB: false,
  loadMode: 'HighZ' as const,
};

const vpp = (a: Float32Array) => Math.max(...a) - Math.min(...a);

describe('EL2101 Physics Accuracy & Regression Guard', () => {
  it('reaches exact steady-state amplitude & DMM ACV/Freq on high-Q Series RLC resonance (146.83 kHz, Q=23.8) at any Time/Div', () => {
    const rlcBench: CompileBenchParams = {
      activeKit: 'none',
      breadboardParts: [
        { id: 'l1', kind: 'inductor', label: '2.5mH', value: 2.5e-3, holeA: 't_10_c', holeB: 't_16_c' },
        { id: 'c1', kind: 'capacitor', label: '470pF', value: 470e-12, holeA: 't_16_b', holeB: 't_22_b' },
        { id: 'rload', kind: 'resistor', label: '47', value: 47, holeA: 't_22_c', holeB: 'tn_22' },
      ],
      cables: [
        { id: 'g', kind: 'bnc_alligator', color: '#dc2626', label: 'Gen', endA: 'gen_out', endB: 'bb_t_10_a', gndClip: 'bb_tn_10' },
        { id: 'p1', kind: 'bnc_alligator', color: '#eab308', label: 'CH1', endA: 'rigol_ch1', endB: 'bb_t_10_e', gndClip: 'bb_tn_10' },
        { id: 'p2', kind: 'bnc_alligator', color: '#06b6d4', label: 'CH2', endA: 'rigol_ch2', endB: 'bb_t_22_e', gndClip: 'bb_tn_22' },
        { id: 'd1', kind: 'banana_alligator', color: '#dc2626', label: 'D+', endA: 'dmm_pos', endB: 'bb_t_22_a' },
        { id: 'd2', kind: 'banana_alligator', color: '#18181b', label: 'D-', endA: 'dmm_com', endB: 'bb_tn_22' },
      ],
      signalGen: { ...BASE_GEN, freqHz: 146825, vpp: 1.0 },
      powerSupply: BASE_PSU,
      scopePowered: true,
      ch1ProbeAtten: 1,
      ch2ProbeAtten: 1,
      dmm: { power: true, func: 'ACV', dualEnabled: true, viceFunc: 'FREQ', inputZ: '10M', rangeIndex: 1, autoRange: true },
    };

    // Exact Vo at f0 = 146.825 kHz: 1.0 Vpp * 47 / (50 + 47) = 0.4845 Vpp, Vrms = 0.1713 V
    for (const tpd of [2e-6, 5e-6, 50e-6]) {
      const sc = createInitialDS1000EState();
      sc.horizontal.timePerDiv = tpd;
      const r = runSimulationStep(rlcBench, sc);
      expect(vpp(r.frame.ch2Samples)).toBeCloseTo(0.4845, 2);
      expect(r.dm3058Meas.vacRms).toBeCloseTo(0.1713, 2);
      expect(r.dm3058Meas.freqHz).toBeCloseTo(146825, -2);
    }
  });

  it('produces exact zero notch on Parallel LC Resonance (146.83 kHz) on both Scope and DMM', () => {
    const parBench: CompileBenchParams = {
      activeKit: 'none',
      breadboardParts: [
        { id: 'l1', kind: 'inductor', label: '2.5mH', value: 2.5e-3, holeA: 't_10_c', holeB: 't_22_c' },
        { id: 'c1', kind: 'capacitor', label: '470pF', value: 470e-12, holeA: 't_10_b', holeB: 't_22_b' },
        { id: 'rload', kind: 'resistor', label: '47', value: 47, holeA: 't_22_d', holeB: 'tn_22' },
      ],
      cables: [
        { id: 'g', kind: 'bnc_alligator', color: '#dc2626', label: 'Gen', endA: 'gen_out', endB: 'bb_t_10_a', gndClip: 'bb_tn_10' },
        { id: 'p2', kind: 'bnc_alligator', color: '#06b6d4', label: 'CH2', endA: 'rigol_ch2', endB: 'bb_t_22_e', gndClip: 'bb_tn_22' },
        { id: 'd1', kind: 'banana_alligator', color: '#dc2626', label: 'D+', endA: 'dmm_pos', endB: 'bb_t_22_a' },
        { id: 'd2', kind: 'banana_alligator', color: '#18181b', label: 'D-', endA: 'dmm_com', endB: 'bb_tn_22' },
      ],
      signalGen: { ...BASE_GEN, freqHz: 146825, vpp: 1.0 },
      powerSupply: BASE_PSU,
      scopePowered: true,
      ch1ProbeAtten: 1,
      ch2ProbeAtten: 1,
      dmm: { power: true, func: 'ACV', dualEnabled: false, viceFunc: 'FREQ', inputZ: '10M', rangeIndex: 1, autoRange: true },
    };

    const sc = createInitialDS1000EState();
    sc.horizontal.timePerDiv = 2e-6;
    const r = runSimulationStep(parBench, sc);
    expect(vpp(r.frame.ch2Samples)).toBeLessThan(0.01);
    expect(r.dm3058Meas.vacRms).toBeLessThan(0.005);
  });

  it('suppresses trapezoidal ringing on RL square-wave transient (1kΩ + 2.5mH, 20kHz 0..4V)', () => {
    const rlBench: CompileBenchParams = {
      activeKit: 'rl_rc',
      cables: [
        { id: 'g', kind: 'bnc_banana', color: '#dc2626', label: 'Gen', endA: 'gen_out', endB: 'kr_r1_out', gndClip: 'kr_gnd_c' },
        { id: 'l', kind: 'banana_4mm', color: '#18181b', label: 'L', endA: 'kr_l1_in', endB: 'kr_gnd_l' },
        { id: 'p1', kind: 'bnc_banana', color: '#eab308', label: 'CH1', endA: 'rigol_ch1', endB: 'kr_r1_out', gndClip: 'kr_gnd_r' },
        { id: 'p2', kind: 'bnc_banana', color: '#06b6d4', label: 'CH2', endA: 'rigol_ch2', endB: 'kr_out', gndClip: 'kr_gnd_r' },
      ],
      signalGen: { ...BASE_GEN, waveform: 'square', freqHz: 20000, vpp: 4.0, dcOffset: 2.0 },
      powerSupply: BASE_PSU,
      scopePowered: true,
      ch1ProbeAtten: 1,
      ch2ProbeAtten: 1,
    };

    const sc = createInitialDS1000EState();
    sc.horizontal.timePerDiv = 5e-6;
    sc.trigger.levelVolts = 2.0;
    const r = runSimulationStep(rlBench, sc);
    const ch2 = r.frame.ch2Samples;
    const maxV = Math.max(...ch2);
    const minV = Math.min(...ch2);
    // Theoretical peak V_L(0+) = 4.0 * 1000 / 1050 = 3.81V (never > 4.0V!)
    expect(maxV).toBeGreaterThan(3.4);
    expect(maxV).toBeLessThan(3.95);
    expect(minV).toBeLessThan(-3.4);
    expect(minV).toBeGreaterThan(-3.95);

    let ringingFlips = 0;
    for (let i = 2; i < ch2.length; i++) {
      const d1 = ch2[i - 1] - ch2[i - 2];
      const d2 = ch2[i] - ch2[i - 1];
      // Count consecutive alternating derivative flips > 0.08V (excluding the 2-3 true square-wave edges)
      if (Math.abs(d1) > 0.08 && Math.abs(d2) > 0.08 && d1 * d2 < 0) ringingFlips++;
    }
    expect(ringingFlips).toBeLessThanOrEqual(4);
  });

  it('captures full ±3.8V differentiator spikes on 10kΩ + 8.2nF at 50Hz square wave (5ms/div)', () => {
    const diffBench: CompileBenchParams = {
      activeKit: 'rl_rc',
      cables: [
        { id: 'g', kind: 'bnc_banana', color: '#dc2626', label: 'Gen', endA: 'gen_out', endB: 'kr_c2_in', gndClip: 'kr_gnd_c' },
        { id: 'r', kind: 'banana_4mm', color: '#18181b', label: 'R', endA: 'kr_r2_out', endB: 'kr_gnd_r' },
        { id: 'p1', kind: 'bnc_banana', color: '#eab308', label: 'CH1', endA: 'rigol_ch1', endB: 'kr_c2_in', gndClip: 'kr_gnd_l' },
        { id: 'p2', kind: 'bnc_banana', color: '#06b6d4', label: 'CH2', endA: 'rigol_ch2', endB: 'kr_out', gndClip: 'kr_gnd_l' },
      ],
      signalGen: { ...BASE_GEN, waveform: 'square', freqHz: 50, vpp: 4.0, dcOffset: 0 },
      powerSupply: BASE_PSU,
      scopePowered: true,
      ch1ProbeAtten: 1,
      ch2ProbeAtten: 1,
    };

    const sc = createInitialDS1000EState();
    sc.horizontal.timePerDiv = 5e-3;
    const r = runSimulationStep(diffBench, sc);
    expect(Math.max(...r.frame.ch2Samples)).toBeGreaterThan(3.4);
    expect(Math.min(...r.frame.ch2Samples)).toBeLessThan(-3.4);
  });

  it('always produces a closed steady-state X-Y Lissajous ellipse even at fast Time/Div (50us/div @ 1kHz)', () => {
    const xyBench: CompileBenchParams = {
      activeKit: 'rl_rc',
      cables: [
        { id: 'g', kind: 'bnc_banana', color: '#dc2626', label: 'Gen', endA: 'gen_out', endB: 'kr_r2_out', gndClip: 'kr_gnd_c' },
        { id: 'c', kind: 'banana_4mm', color: '#18181b', label: 'C', endA: 'kr_c2_in', endB: 'kr_gnd_l' },
        { id: 'p1', kind: 'bnc_banana', color: '#eab308', label: 'CH1', endA: 'rigol_ch1', endB: 'kr_r2_out', gndClip: 'kr_gnd_r' },
        { id: 'p2', kind: 'bnc_banana', color: '#06b6d4', label: 'CH2', endA: 'rigol_ch2', endB: 'kr_out', gndClip: 'kr_gnd_r' },
      ],
      signalGen: { ...BASE_GEN, freqHz: 1000, vpp: 4.0 },
      powerSupply: BASE_PSU,
      scopePowered: true,
      ch1ProbeAtten: 1,
      ch2ProbeAtten: 1,
    };

    const sc = createInitialDS1000EState();
    sc.horizontal.timeBaseMode = 'X-Y';
    sc.horizontal.timePerDiv = 50e-6;
    const r = runSimulationStep(xyBench, sc);
    expect(r.frame.measurements.values.Freq ?? 0).toBeCloseTo(1000, -1);
    expect(Math.abs(r.frame.measurements.values.Phase12Rise ?? 0)).toBeCloseTo(27.3, 0);
    expect(vpp(r.frame.ch1Samples)).toBeCloseTo(3.98, 1);
    expect(vpp(r.frame.ch2Samples)).toBeCloseTo(3.54, 1);
  });

  it('computes accurate integer-cycle Vrms/Vavg on scope and accurate 50Hz DMM ACV+Freq', () => {
    const bench: CompileBenchParams = {
      activeKit: 'rl_rc',
      cables: [
        { id: 'g', kind: 'bnc_banana', color: '#dc2626', label: 'Gen', endA: 'gen_out', endB: 'kr_r2_out', gndClip: 'kr_gnd_c' },
        { id: 'c', kind: 'banana_4mm', color: '#18181b', label: 'C', endA: 'kr_c2_in', endB: 'kr_gnd_l' },
        { id: 'p1', kind: 'bnc_banana', color: '#eab308', label: 'CH1', endA: 'rigol_ch1', endB: 'kr_r2_out', gndClip: 'kr_gnd_r' },
        { id: 'd1', kind: 'banana_4mm', color: '#dc2626', label: 'D+', endA: 'dmm_pos', endB: 'kr_out' },
        { id: 'd2', kind: 'banana_4mm', color: '#18181b', label: 'D-', endA: 'dmm_com', endB: 'kr_gnd_l' },
      ],
      signalGen: { ...BASE_GEN, freqHz: 1000, vpp: 4.0 },
      powerSupply: BASE_PSU,
      scopePowered: true,
      ch1ProbeAtten: 1,
      ch2ProbeAtten: 1,
      dmm: { power: true, func: 'ACV', dualEnabled: true, viceFunc: 'FREQ', inputZ: '10M', rangeIndex: 1, autoRange: true },
    };

    // 200us/div = 2.4ms (non-integer 2.4 cycles of 1kHz!) -> Vrms must still be exact ~1.407V
    const sc200 = createInitialDS1000EState();
    sc200.horizontal.timePerDiv = 200e-6;
    const r200 = runSimulationStep(bench, sc200);
    expect(Math.abs(r200.frame.measurements.values.Vavg ?? 99)).toBeLessThan(0.01);
    expect(r200.frame.measurements.values.Vrms ?? 0).toBeCloseTo(1.408, 2);

    // 50Hz sine on DMM while scope is fast (500us/div) -> exact |H(50Hz)| on 10kΩ + 8.2nF (with 50Ω gen & 10MΩ DMM) = 1.4123 Vrms & 50.0 Hz
    const sc50 = createInitialDS1000EState();
    sc50.horizontal.timePerDiv = 500e-6;
    const r50 = runSimulationStep({ ...bench, signalGen: { ...BASE_GEN, freqHz: 50, vpp: 4.0 } }, sc50);
    expect(r50.dm3058Meas.vacRms).toBeCloseTo(1.412, 2);
    expect(r50.dm3058Meas.freqHz).toBeCloseTo(50.0, 0);
  });

  it('drives Kit #22 2N1613 NPN Norton constant-current source (kt_f) & kt_l0 tap accurately', () => {
    // Wire 18V to kt_e / kt_gnd_l, measure collector current from kt_e through ammeter into kt_f
    const nortonShort: CompileBenchParams = {
      activeKit: 'thevenin',
      cables: [
        { id: 'c1', kind: 'banana_4mm', color: '#dc2626', label: '18+', endA: 'kt_18_p', endB: 'kt_e' },
        { id: 'c2', kind: 'banana_4mm', color: '#18181b', label: '18-', endA: 'kt_18_n', endB: 'kt_gnd_l' },
        { id: 'c3', kind: 'banana_4mm', color: '#f59e0b', label: 'I+', endA: 'kt_e', endB: 'dmm_i' },
        { id: 'c4', kind: 'banana_4mm', color: '#18181b', label: 'COM', endA: 'dmm_com', endB: 'kt_f' },
      ],
      signalGen: { ...BASE_GEN, outputEnabled: false },
      powerSupply: BASE_PSU,
      scopePowered: false,
      ch1ProbeAtten: 1,
      ch2ProbeAtten: 1,
      dmm: { power: true, func: 'DCI', dualEnabled: false, viceFunc: 'DCV', inputZ: '10M', rangeIndex: 2, autoRange: true },
    };
    const rShort = runSimulationStep(nortonShort, createInitialDS1000EState());
    // With 10k/2.7k divider on 18V (Vb ~ 3.8V, Ve ~ 3.1V) and Re = 390 + 1000 = 1390 ohm -> Ic ~ 2.2 mA
    expect(rShort.dm3058Meas.idc).toBeGreaterThan(0.0018);
    expect(rShort.dm3058Meas.idc).toBeLessThan(0.0026);

    // Adding a 2kΩ load resistor in series with collector (via kt_load_com -> kt_l1) keeps collector current nearly constant!
    const nortonLoaded: CompileBenchParams = {
      ...nortonShort,
      cables: [
        { id: 'c1', kind: 'banana_4mm', color: '#dc2626', label: '18+', endA: 'kt_18_p', endB: 'kt_e' },
        { id: 'c2', kind: 'banana_4mm', color: '#18181b', label: '18-', endA: 'kt_18_n', endB: 'kt_gnd_l' },
        { id: 'c3', kind: 'banana_4mm', color: '#dc2626', label: 'E->L0', endA: 'kt_e', endB: 'kt_l0' },
        { id: 'c4', kind: 'banana_4mm', color: '#f59e0b', label: 'L1->I', endA: 'kt_l1', endB: 'dmm_i' },
        { id: 'c5', kind: 'banana_4mm', color: '#18181b', label: 'COM->F', endA: 'dmm_com', endB: 'kt_f' },
      ],
    };
    const rLoad = runSimulationStep(nortonLoaded, createInitialDS1000EState());
    expect(rLoad.dm3058Meas.idc).toBeCloseTo(rShort.dm3058Meas.idc, 3);
  });

  it('honors phaseDeg & inverted in solveAC, physical vs menu probe scaling, and AUTO recovery from Envelope/X-Y', () => {
    // 1. solveAC honors phaseDeg = 90 and inverted = true
    const solver = new CircuitMNASolver();
    solver.compile({
      groundNode: 'gnd',
      nodeNames: ['gnd', 'n1', 'n2'],
      components: [
        { id: 'v1', kind: 'vsource_func', nodePos: 'n1', nodeNeg: 'gnd', waveform: 'sine', freqHz: 1000, amplitudePeak: 2, dcOffset: 0, dutyPct: 50, phaseDeg: 90, inverted: false },
        { id: 'v2', kind: 'vsource_func', nodePos: 'n2', nodeNeg: 'gnd', waveform: 'sine', freqHz: 1000, amplitudePeak: 2, dcOffset: 0, dutyPct: 50, phaseDeg: 0, inverted: true },
      ],
      probeNodes: {},
    });
    const ac = solver.solveAC(1000);
    expect((ac.nodePhasors.n1.phaseRad * 180) / Math.PI).toBeCloseTo(90, 1);
    expect(Math.abs((ac.nodePhasors.n2.phaseRad * 180) / Math.PI)).toBeCloseTo(180, 1);

    // 2. Physical 1X cable with scope Probe = 5X displays 5x voltage (matching real Rigol DS1052E); 10X physical + 1X menu displays 0.1x
    const bench1X: CompileBenchParams = {
      activeKit: 'none',
      cables: [{ id: 'c', kind: 'bnc_bnc', color: '#eab308', label: 'BNC', endA: 'rigol_ch1', endB: 'gen_out' }],
      signalGen: { ...BASE_GEN, freqHz: 1000, vpp: 4.0 },
      powerSupply: BASE_PSU,
      scopePowered: true,
      ch1ProbeAtten: 1,
      ch2ProbeAtten: 1,
    };
    const sc5x = createInitialDS1000EState();
    sc5x.ch1.probe = 5;
    sc5x.ch1.voltsPerDiv = 5;
    const r5x = runSimulationStep(bench1X, sc5x);
    expect(vpp(r5x.frame.ch1Samples)).toBeCloseTo(20.0, 0);

    const bench10X: CompileBenchParams = {
      ...bench1X,
      cables: [{ id: 'p', kind: 'probe_bnc_hook', color: '#eab308', label: 'P10X', endA: 'rigol_ch1', endB: 'gen_out', gndClip: 'gen_gnd', probeAtten: 10, probeCompTrim: 0 }],
    };
    const sc1x = createInitialDS1000EState();
    const r10xOn1x = runSimulationStep(bench10X, sc1x);
    expect(vpp(r10xOn1x.frame.ch1Samples)).toBeCloseTo(0.4, 1);

    // 3. computeAutoSetup recovers true 1kHz timebase from slow 100ms/div Envelope burst & X-Y mode
    const scSlow = createInitialDS1000EState();
    scSlow.horizontal.timePerDiv = 0.1; // 100ms/div -> envelope burst!
    const rSlow = runSimulationStep(bench1X, scSlow);
    const auto = computeAutoSetup(scSlow, rSlow.frame.ch1Samples, rSlow.frame.ch2Samples, (12 * scSlow.horizontal.timePerDiv) / 600, 'Multi-Cycle', rSlow.frame.measurements.values.Freq);
    expect(auto.horizontal.timeBaseMode).toBe('Y-T');
    expect(auto.horizontal.timePerDiv).toBeLessThanOrEqual(5e-4);
    expect(auto.horizontal.timePerDiv).toBeGreaterThanOrEqual(1e-4);

    // 4. Phase12Rise wraps cleanly even when crossing indices differ by > 1 period
    const n = 600;
    const dt = 1e-5;
    const a = new Float32Array(n);
    const b = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i * dt;
      a[i] = 2 * Math.sin(2 * Math.PI * 1000 * t);
      b[i] = 2 * Math.sin(2 * Math.PI * 1000 * t - Math.PI / 6); // -30 deg
    }
    const m = computeAllMeasurements(a, b, dt);
    expect(Math.abs(m.values.Phase12Rise ?? 0)).toBeCloseTo(30, 0);
  });
});
