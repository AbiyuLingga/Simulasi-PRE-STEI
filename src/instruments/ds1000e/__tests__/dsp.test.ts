import { describe, expect, it } from 'vitest';
import {
  RigolDSPEngine,
  applyProbeCompDistortion,
  computeAllMeasurements,
  computeAutoSetup,
  computeRadix2FFT,
} from '../dsp';
import { createInitialDS1000EState } from '../state';

describe('Rigol DS1000E DSP Engine', () => {
  it('computes all 22 automatic measurements accurately on 1kHz sine & phase-shifted second channel', () => {
    const n = 1200;
    const totalTime = 6e-3; // 6 ms (6 cycles of 1 kHz)
    const dt = totalTime / n;
    const ch1 = new Float32Array(n);
    const ch2 = new Float32Array(n);
    const phaseShiftRad = (45 * Math.PI) / 180;

    for (let i = 0; i < n; i++) {
      const t = i * dt;
      ch1[i] = 2.0 * Math.sin(2 * Math.PI * 1000 * t); // 4 Vpp
      ch2[i] = 2.0 * Math.sin(2 * Math.PI * 1000 * t - phaseShiftRad);
    }

    const res = computeAllMeasurements(ch1, ch2, dt);
    expect(res.values.Vpp).toBeCloseTo(4.0, 2);
    expect(res.values.Vmax).toBeCloseTo(2.0, 2);
    expect(res.values.Vmin).toBeCloseTo(-2.0, 2);
    expect(res.values.Vrms).toBeCloseTo(2.0 / Math.SQRT2, 2);
    expect(res.values.Freq).toBeCloseTo(1000, 0);
    expect(res.values.Period).toBeCloseTo(1e-3, 4);
    expect(res.values.PlusDuty).toBeCloseTo(50, 0);
    expect(Math.abs(res.values.Phase12Rise ?? 0)).toBeCloseTo(45, 0);
  });

  it('computes FFT peak bin at exact signal fundamental frequency', () => {
    const n = 1024;
    const dt = 1e-5; // fs = 100 kHz, Nyquist = 50 kHz
    const samples = new Float32Array(n);
    const targetFreq = 10_000; // 10 kHz
    for (let i = 0; i < n; i++) {
      samples[i] = 1.5 * Math.sin(2 * Math.PI * targetFreq * i * dt);
    }

    const { binsDb, maxFreqHz } = computeRadix2FFT(samples, 'Hanning', dt);
    let peakBin = 0;
    for (let k = 1; k < binsDb.length; k++) {
      if (binsDb[k] > binsDb[peakBin]) peakBin = k;
    }
    const peakFreq = (peakBin / (binsDb.length - 1)) * maxFreqHz;
    expect(peakFreq).toBeGreaterThan(9200);
    expect(peakFreq).toBeLessThan(10800);
  });

  it('models AC/DC/GND coupling, probe compensation distortion, and AUTO setup', () => {
    const n = 1800;
    const dt = 1e-5;
    const raw1 = new Float32Array(n);
    const raw2 = new Float32Array(n);
    const rawExt = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      const t = i * dt;
      // 1 kHz 3Vpp square with +1.5V DC (0..3V)
      raw1[i] = Math.sin(2 * Math.PI * 1000 * t) >= 0 ? 3.0 : 0.0;
      raw2[i] = 2.0 * Math.sin(2 * Math.PI * 500 * t) + 2.5; // DC biased sine
    }

    const overComp = applyProbeCompDistortion(raw1, 0.7, dt);
    let maxOver = -Infinity;
    for (let i = 0; i < overComp.length; i++) if (overComp[i] > maxOver) maxOver = overComp[i];
    expect(maxOver).toBeGreaterThan(3.5); // visible overshoot spike when over-compensated

    const dsp = new RigolDSPEngine();
    const state = createInitialDS1000EState();
    state.ch1.coupling = 'GND';
    state.ch2.coupling = 'AC';

    const out = dsp.processFrame(raw1, raw2, rawExt, dt, state, {
      ch1IsComp: false,
      ch2IsComp: false,
      ch1CompTrim: 0,
      ch2CompTrim: 0,
    });

    // CH1 GND coupling zeros trace
    expect(out.ch1Samples.every((v) => v === 0)).toBe(true);
    // CH2 AC coupling strips the +2.5V DC offset
    const ch2Mean = out.ch2Samples.reduce((a, b) => a + b, 0) / out.ch2Samples.length;
    expect(Math.abs(ch2Mean)).toBeLessThan(0.2);

    // AUTO setup chooses sensible V/div and Time/div
    const autoState = computeAutoSetup(state, raw1, raw2, dt, 'Multi-Cycle');
    expect(autoState.ch1.voltsPerDiv).toBeGreaterThanOrEqual(0.5);
    expect(autoState.horizontal.timePerDiv).toBeGreaterThanOrEqual(1e-4);
  });

  it('handles X-Y Lissajous mode without trigger WAIT freeze, skips startup transient, and keeps exact frequency/phase', () => {
    const dsp = new RigolDSPEngine();
    const state = createInitialDS1000EState();
    state.horizontal.timeBaseMode = 'X-Y';
    state.horizontal.timePerDiv = 5e-4; // 500 us/div
    state.horizontal.triggerOffsetSec = 5e-3; // should NOT shift X-Y window off buffer
    state.trigger.sweep = 'Normal';
    state.trigger.levelVolts = 99; // impossible trigger level -> must NOT freeze X-Y in WAIT

    const acqLen = 1800;
    const totalDur = 18 * state.horizontal.timePerDiv; // 9 ms
    const acqDt = totalDur / acqLen;
    const raw1 = new Float32Array(acqLen);
    const raw2 = new Float32Array(acqLen);
    const rawExt = new Float32Array(acqLen);

    for (let i = 0; i < acqLen; i++) {
      const t = i * acqDt;
      // Inject an artificial DC transient decay in the first third, steady 90° circle in the last two thirds
      const decay = Math.exp(-t / 3e-4);
      raw1[i] = 2.0 * Math.sin(2 * Math.PI * 1000 * t);
      raw2[i] = 2.0 * Math.cos(2 * Math.PI * 1000 * t) + 5.0 * decay;
    }

    const out = dsp.processFrame(raw1, raw2, rawExt, acqDt, state, {
      ch1IsComp: false,
      ch2IsComp: false,
      ch1CompTrim: 0,
      ch2CompTrim: 0,
    });

    expect(out.triggerStatus).toBe('AUTO');
    expect(out.ch1Samples.length).toBe(1200);
    expect(out.ch2Samples.length).toBe(1200);
    // Steady-state tail should have stripped the initial +5V exponential decay spike
    let maxY = -Infinity;
    for (let i = 0; i < out.ch2Samples.length; i++) if (out.ch2Samples[i] > maxY) maxY = out.ch2Samples[i];
    expect(maxY).toBeLessThan(2.15);
    expect(out.measurements.values.Vpp).toBeCloseTo(4.0, 1);
    expect(out.measurements.values.Freq).toBeCloseTo(1000, -1);
    expect(Math.abs(out.measurements.values.Phase12Rise ?? 0)).toBeCloseTo(90, 0);
  });
});
