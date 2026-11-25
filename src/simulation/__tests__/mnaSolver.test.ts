import { describe, expect, it } from 'vitest';
import { computeAllMeasurements } from '../../instruments/ds1000e/dsp';
import { createInitialDS1000EState } from '../../instruments/ds1000e/state';
import { CircuitMNASolver } from '../circuit/mnaSolver';
import { compileBenchNetlist, type CompileBenchParams } from '../circuit/netlistCompiler';
import { runSimulationStep } from '../worker/circuit.worker';

describe('CircuitMNASolver & NetlistCompiler', () => {
  it('solves DC voltage divider accurately and detects PSU short circuit', () => {
    const solver = new CircuitMNASolver();
    solver.compile({
      groundNode: 'gnd',
      nodeNames: ['gnd', 'vin', 'vout'],
      components: [
        { id: 'vs', kind: 'vsource_dc', nodePos: 'vin', nodeNeg: 'gnd', volts: 12, currentLimitAmps: 1.5 },
        { id: 'r1', kind: 'resistor', nodeA: 'vin', nodeB: 'vout', ohms: 1000 },
        { id: 'r2', kind: 'resistor', nodeA: 'vout', nodeB: 'gnd', ohms: 2000 },
      ],
      probeNodes: {},
    });

    const dc = solver.solveDC();
    expect(dc.nodeVoltages.vin).toBeCloseTo(12, 4);
    expect(dc.nodeVoltages.vout).toBeCloseTo(8, 4);
    expect(dc.faults).toHaveLength(0);

    // Now short vin to gnd via 0.5 ohm
    solver.compile({
      groundNode: 'gnd',
      nodeNames: ['gnd', 'vin'],
      components: [
        { id: 'vs', kind: 'vsource_dc', nodePos: 'vin', nodeNeg: 'gnd', volts: 12, currentLimitAmps: 1.5 },
        { id: 'rshort', kind: 'resistor', nodeA: 'vin', nodeB: 'gnd', ohms: 0.5 },
      ],
      probeNodes: {},
    });
    const dcShort = solver.solveDC();
    expect(dcShort.faults.some((f) => f.code === 'short_circuit')).toBe(true);
  });

  it('solves AC phasor magnitude and phase shift for RC circuit at 300 Hz', () => {
    const R = 10_000;
    const C = 0.1e-6;
    const f = 300;
    const solver = new CircuitMNASolver();
    solver.compile({
      groundNode: 'gnd',
      nodeNames: ['gnd', 'vin', 'vc'],
      components: [
        {
          id: 'vg',
          kind: 'vsource_func',
          nodePos: 'vin',
          nodeNeg: 'gnd',
          waveform: 'sine',
          freqHz: f,
          amplitudePeak: 2 * Math.SQRT2,
          dcOffset: 0,
          dutyPct: 50,
        },
        { id: 'r', kind: 'resistor', nodeA: 'vin', nodeB: 'vc', ohms: R },
        { id: 'c', kind: 'capacitor', nodeA: 'vc', nodeB: 'gnd', farads: C },
      ],
      probeNodes: {},
    });

    const ac = solver.solveAC(f);
    const xc = 1 / (2 * Math.PI * f * C);
    const expectedRatio = xc / Math.hypot(R, xc);
    const expectedPhase = -Math.atan(R / xc);

    expect(ac.nodePhasors.vc.mag / ac.nodePhasors.vin.mag).toBeCloseTo(expectedRatio, 4);
    expect(ac.nodePhasors.vc.phaseRad).toBeCloseTo(expectedPhase, 4);
  });

  it('solves transient RC step response with Vc(tau) = 0.632 * Vs', () => {
    const R = 10_000;
    const C = 1e-6; // tau = 10 ms
    const tau = R * C;
    const solver = new CircuitMNASolver();
    solver.compile({
      groundNode: 'gnd',
      nodeNames: ['gnd', 'vin', 'vc'],
      components: [
        { id: 'vs', kind: 'vsource_dc', nodePos: 'vin', nodeNeg: 'gnd', volts: 5 },
        { id: 'r', kind: 'resistor', nodeA: 'vin', nodeB: 'vc', ohms: R },
        { id: 'c', kind: 'capacitor', nodeA: 'vc', nodeB: 'gnd', farads: C },
      ],
      probeNodes: {},
    });

    const dt = 5e-5; // 50 us
    const chunk = solver.stepTransient(tau, dt, ['vc']);
    const lastV = chunk.nodeVoltages.vc[chunk.sampleCount - 1];
    expect(lastV).toBeCloseTo(5 * (1 - Math.exp(-1)), 2);
  });

  it('compiles bench cables with Rigol 1M/10M probe loading & 50 ohm generator source', () => {
    const netlist = compileBenchNetlist({
      cables: [
        {
          id: 'p1',
          kind: 'probe_bnc_hook',
          color: '#eab308',
          label: 'CH1',
          endA: 'rigol_ch1',
          endB: 'gen_out',
          gndClip: 'gen_gnd',
          probeAtten: 1,
          probeCompTrim: 0,
        },
        {
          id: 'p2',
          kind: 'probe_bnc_hook',
          color: '#06b6d4',
          label: 'CH2',
          endA: 'rigol_ch2',
          endB: 'rigol_comp_sig',
          gndClip: 'rigol_comp_gnd',
          probeAtten: 10,
          probeCompTrim: -0.5,
        },
      ],
      signalGen: {
        power: true,
        outputEnabled: true,
        waveform: 'sine',
        freqHz: 1000,
        vpp: 4,
        dcOffset: 0,
        dutyPct: 50,
        attenuator20dB: false,
      },
      powerSupply: {
        power: true,
        outputEnabled: false,
        ch1Voltage: 5,
        ch1CurrentLimit: 1.5,
        ch2Voltage: 12,
        ch2CurrentLimit: 1.5,
        trackingDual12V: false,
      },
      scopePowered: true,
      ch1ProbeAtten: 1,
      ch2ProbeAtten: 10,
    });

    expect(netlist.probeNodes.ch1.connected).toBe(true);
    expect(netlist.probeNodes.ch2.isProbeComp).toBe(true);

    const solver = new CircuitMNASolver();
    solver.compile(netlist);
    const ac = solver.solveAC(1000);
    // Generator 2Vp loaded by 1M vs 50 ohm -> ~1.9999 Vp
    expect(ac.nodePhasors[netlist.probeNodes.ch1.signalNode].mag).toBeCloseTo(2.0, 3);
  });

  it('solves transient RL step response and preserves waveforms when inductors exist in netlist', () => {
    const R = 100;
    const L = 10e-3; // tau = L/R = 100 us
    const tau = L / R;
    const solver = new CircuitMNASolver();
    solver.compile({
      groundNode: 'gnd',
      nodeNames: ['gnd', 'vin', 'vr'],
      components: [
        { id: 'vs', kind: 'vsource_dc', nodePos: 'vin', nodeNeg: 'gnd', volts: 5 },
        { id: 'l1', kind: 'inductor', nodeA: 'vin', nodeB: 'vr', henrys: L },
        { id: 'r1', kind: 'resistor', nodeA: 'vr', nodeB: 'gnd', ohms: R },
      ],
      probeNodes: {},
    });

    const dt = 1e-6; // 1 us
    const chunk = solver.stepTransient(tau, dt, ['vr']);
    const lastVr = chunk.nodeVoltages.vr[chunk.sampleCount - 1];
    expect(lastVr).toBeCloseTo(5 * (1 - Math.exp(-1)), 2);
  });

  it('detects Signal Generator sine/square/triangle & Probe Comp on DS1052E even with RL/RC kit + breadboard inductors active', () => {
    const scope = createInitialDS1000EState();
    scope.ch2.probe = 10;
    const baseBench: CompileBenchParams = {
      cables: [
        {
          id: 'probe_ch1',
          kind: 'probe_bnc_hook',
          color: '#eab308',
          label: 'Probe CH1',
          endA: 'rigol_ch1',
          endB: 'gen_out',
          gndClip: 'gen_gnd',
          probeAtten: 1,
          probeCompTrim: 0,
        },
        {
          id: 'probe_ch2',
          kind: 'probe_bnc_hook',
          color: '#06b6d4',
          label: 'Probe CH2',
          endA: 'rigol_ch2',
          endB: 'rigol_comp_sig',
          gndClip: 'rigol_comp_gnd',
          probeAtten: 10,
          probeCompTrim: 0,
        },
      ],
      signalGen: {
        power: true,
        outputEnabled: true,
        waveform: 'sine',
        freqHz: 1000,
        vpp: 4.0,
        dcOffset: 0,
        dutyPct: 50,
        attenuator20dB: false,
      },
      powerSupply: {
        power: true,
        outputEnabled: true,
        ch1Voltage: 5.0,
        ch1CurrentLimit: 1.5,
        ch2Voltage: 12.0,
        ch2CurrentLimit: 1.5,
        trackingDual12V: false,
      },
      scopePowered: true,
      ch1ProbeAtten: 1,
      ch2ProbeAtten: 10,
      activeKit: 'rl_rc',
      breadboardParts: [
        { id: 'bb_r1', kind: 'resistor', label: '1kΩ', value: 1000, holeA: 't_10_c', holeB: 't_16_c' },
        { id: 'bb_c1', kind: 'capacitor', label: '100nF', value: 100e-9, holeA: 't_16_b', holeB: 'tn_14' },
        { id: 'bb_d1', kind: 'diode', label: '1N4148', value: 0.7, holeA: 'b_12_g', holeB: 'b_18_g' },
        { id: 'bb_r2', kind: 'resistor', label: '330Ω', value: 330, holeA: 't_28_c', holeB: 't_34_c' },
        { id: 'bb_led1', kind: 'led', label: 'LED Merah', value: 1.9, holeA: 't_34_b', holeB: 't_38_b', color: '#ef4444' },
        { id: 'bb_l1', kind: 'inductor', label: '2.5mH', value: 2.5e-3, holeA: 'b_46_h', holeB: 'b_52_h' },
      ],
    };

    const resSine = runSimulationStep(baseBench, scope);
    expect(resSine.frame.triggerStatus).toBe("T'D");
    expect(resSine.frame.measurements.values.Vpp).toBeGreaterThanOrEqual(3.7);
    expect(resSine.frame.measurements.values.Vpp).toBeLessThanOrEqual(4.2);
    expect(resSine.frame.measurements.values.Freq).toBeGreaterThanOrEqual(950);
    expect(resSine.frame.measurements.values.Freq).toBeLessThanOrEqual(1050);

    const ch2Meas = computeAllMeasurements(
      resSine.frame.ch2Samples,
      resSine.frame.ch1Samples,
      1 / resSine.frame.sampleRateHz
    );
    expect(ch2Meas.values.Vpp).toBeGreaterThanOrEqual(2.7);
    expect(ch2Meas.values.Vpp).toBeLessThanOrEqual(3.2);

    // Square wave at 2 kHz, 6 Vpp
    const resSquare = runSimulationStep(
      {
        ...baseBench,
        signalGen: { ...baseBench.signalGen, waveform: 'square', freqHz: 2000, vpp: 6.0 },
      },
      scope
    );
    expect(resSquare.frame.measurements.values.Vpp).toBeGreaterThanOrEqual(5.6);
    expect(resSquare.frame.measurements.values.Vpp).toBeLessThanOrEqual(6.3);
    expect(resSquare.frame.measurements.values.Freq).toBeGreaterThanOrEqual(1900);
    expect(resSquare.frame.measurements.values.Freq).toBeLessThanOrEqual(2100);

    // Triangle wave with -20dB attenuator (6 Vpp -> 0.6 Vpp)
    const resAtten = runSimulationStep(
      {
        ...baseBench,
        signalGen: { ...baseBench.signalGen, waveform: 'triangle', freqHz: 1500, vpp: 6.0, attenuator20dB: true },
      },
      scope
    );
    expect(resAtten.frame.measurements.values.Vpp).toBeGreaterThanOrEqual(0.54);
    expect(resAtten.frame.measurements.values.Vpp).toBeLessThanOrEqual(0.66);

    // Output OFF -> near 0 Vpp
    const resOff = runSimulationStep(
      {
        ...baseBench,
        signalGen: { ...baseBench.signalGen, outputEnabled: false },
      },
      scope
    );
    expect(resOff.frame.measurements.values.Vpp ?? 0).toBeLessThan(0.05);
  });

  it('never loses waveform at large time/div (10ms..50s) in Y-T, Roll, and X-Y modes', () => {
    const spanVpp = (arr: Float32Array) => {
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < arr.length; i++) {
        if (arr[i] < min) min = arr[i];
        if (arr[i] > max) max = arr[i];
      }
      return max - min;
    };

    const bench: CompileBenchParams = {
      cables: [
        {
          id: 'p1',
          kind: 'banana_4mm',
          color: '#eab308',
          label: 'CH1',
          endA: 'rigol_ch1',
          endB: 'gen_out',
        },
        {
          id: 'p2',
          kind: 'banana_4mm',
          color: '#06b6d4',
          label: 'CH2',
          endA: 'rigol_ch2',
          endB: 'rigol_comp_sig',
        },
      ],
      signalGen: {
        power: true,
        outputEnabled: true,
        waveform: 'sine',
        freqHz: 1000,
        vpp: 4.0,
        dcOffset: 0,
        dutyPct: 50,
        attenuator20dB: false,
      },
      powerSupply: {
        power: true,
        outputEnabled: true,
        ch1Voltage: 5.0,
        ch1CurrentLimit: 1.5,
        ch2Voltage: 12.0,
        ch2CurrentLimit: 1.5,
        trackingDual12V: false,
      },
      scopePowered: true,
      ch1ProbeAtten: 1,
      ch2ProbeAtten: 1,
      activeKit: 'rl_rc',
    };

    // Test every notorious slow time/div (especially 50ms, 100ms, 200ms, 1s, 50s where naive dt = k * T vanishes!)
    for (const tDiv of [0.01, 0.05, 0.1, 0.2, 0.5, 1, 5, 50]) {
      const ytScope = createInitialDS1000EState();
      ytScope.horizontal.timeBaseMode = 'Y-T';
      ytScope.horizontal.timePerDiv = tDiv;
      const ytRes = runSimulationStep(bench, ytScope);
      expect(spanVpp(ytRes.frame.ch1Samples)).toBeGreaterThanOrEqual(3.7);
      expect(spanVpp(ytRes.frame.ch2Samples)).toBeGreaterThanOrEqual(2.7);
      expect(ytRes.frame.measurements.values.Freq ?? 0).toBeCloseTo(1000, -2);

      const xyScope = createInitialDS1000EState();
      xyScope.horizontal.timeBaseMode = 'X-Y';
      xyScope.horizontal.timePerDiv = tDiv;
      const xyRes = runSimulationStep(bench, xyScope);
      expect(xyRes.frame.ch1Samples.length).toBe(1200);
      expect(spanVpp(xyRes.frame.ch1Samples)).toBeGreaterThanOrEqual(3.7);
      expect(spanVpp(xyRes.frame.ch2Samples)).toBeGreaterThanOrEqual(2.7);
    }

    // Pure DC PSU in slow Roll mode (1 s/div & 50 s/div) should immediately display ~5V (never blank 0V)
    const dcBench: CompileBenchParams = {
      ...bench,
      cables: [
        { id: 'dc1', kind: 'banana_4mm', color: '#dc2626', label: 'PSU+', endA: 'rigol_ch1', endB: 'psu_ch1_pos' },
        { id: 'dc2', kind: 'banana_4mm', color: '#18181b', label: 'PSU-', endA: 'gen_gnd', endB: 'psu_ch1_neg' },
      ],
      signalGen: { ...bench.signalGen, outputEnabled: false },
    };
    const rollScope = createInitialDS1000EState();
    rollScope.horizontal.timeBaseMode = 'Roll';
    rollScope.horizontal.timePerDiv = 5;
    const rollRes = runSimulationStep(dcBench, rollScope);
    expect(rollRes.frame.ch1Samples[0]).toBeCloseTo(5.0, 1);
    expect(rollRes.frame.ch1Samples[rollRes.frame.ch1Samples.length - 1]).toBeCloseTo(5.0, 1);
  });
});
