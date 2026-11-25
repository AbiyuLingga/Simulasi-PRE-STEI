import { TIME_PER_DIV_STEPS, VOLTS_PER_DIV_1X, takeSnapshot } from './state';
import type {
  ChannelConfig,
  DS1000EState,
  FFTWindow,
  MeasureParamKey,
  MeasurementResults,
  ScopeFrameOutput,
  TriggerStatus,
} from './types';

function applyFilter1PoleHP(samples: Float32Array, dt: number, cutoffHz: number): Float32Array {
  const out = new Float32Array(samples.length);
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const alpha = rc / (rc + dt);
  let y = 0;
  let prevX = samples[0] ?? 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    y = alpha * (y + x - prevX);
    out[i] = y;
    prevX = x;
  }
  return out;
}

function applyFilter1PoleLP(samples: Float32Array, dt: number, cutoffHz: number): Float32Array {
  const out = new Float32Array(samples.length);
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const alpha = dt / (rc + dt);
  let y = samples[0] ?? 0;
  for (let i = 0; i < samples.length; i++) {
    y = y + alpha * (samples[i] - y);
    out[i] = y;
  }
  return out;
}

export function applyProbeCompDistortion(
  samples: Float32Array,
  trim: number,
  dt: number
): Float32Array {
  if (Math.abs(trim) < 0.02 || samples.length < 4) return samples;
  const out = new Float32Array(samples.length);
  const tau = 4.5e-5; // ~45 us visible edge exponential on 1kHz square wave
  const decay = Math.exp(-dt / tau);
  let transient = 0;
  out[0] = samples[0];
  for (let i = 1; i < samples.length; i++) {
    const dv = samples[i] - samples[i - 1];
    if (Math.abs(dv) > 0.25) {
      transient += trim * 0.42 * dv;
    }
    transient *= decay;
    out[i] = samples[i] + transient;
  }
  return out;
}

export function processChannelSamples(
  raw: Float32Array,
  cfg: ChannelConfig,
  dt: number,
  isProbeComp: boolean,
  probeCompTrim: number,
  physProbeAtten = 1
): Float32Array {
  const n = raw.length;
  let sig: Float32Array = new Float32Array(n);

  if (cfg.coupling === 'GND') {
    return sig; // all zeros
  }

  // Scope software probe scaling (1X/5X/10X/...) multiplies the BNC-input voltage
  const gain = Math.max(0.1, cfg.probe || 1);
  for (let i = 0; i < n; i++) sig[i] = raw[i] * gain;

  if (isProbeComp && (physProbeAtten >= 10 || cfg.probe === 10)) {
    sig = applyProbeCompDistortion(sig, probeCompTrim, dt);
  }

  if (cfg.coupling === 'AC') {
    // Subtract steady-state mean (tail 2/3 avoids startup transient skew)
    const start = n >= 24 ? Math.floor(n / 3) : 0;
    let sum = 0;
    for (let i = start; i < n; i++) sum += sig[i];
    const mean = sum / Math.max(1, n - start);
    for (let i = 0; i < n; i++) sig[i] -= mean;
  }

  if (cfg.bwLimit) {
    // 20 MHz bandwidth limit
    const maxAllowedCutoff = Math.min(2e7, 0.42 / dt);
    if (2e7 < 0.45 / dt) {
      sig = applyFilter1PoleLP(sig, dt, maxAllowedCutoff);
    }
  }

  if (cfg.filter.enabled) {
    const { type, upperHz, lowerHz } = cfg.filter;
    if (type === 'LPF') sig = applyFilter1PoleLP(sig, dt, Math.max(10, upperHz));
    else if (type === 'HPF') sig = applyFilter1PoleHP(sig, dt, Math.max(10, lowerHz));
    else if (type === 'BPF') {
      sig = applyFilter1PoleHP(sig, dt, Math.max(10, lowerHz));
      sig = applyFilter1PoleLP(sig, dt, Math.max(lowerHz + 10, upperHz));
    } else if (type === 'BRF') {
      const lp = applyFilter1PoleLP(sig, dt, Math.max(10, lowerHz));
      const hp = applyFilter1PoleHP(sig, dt, Math.max(lowerHz + 10, upperHz));
      for (let i = 0; i < n; i++) sig[i] = lp[i] + hp[i];
    }
  }

  if (cfg.invert) {
    for (let i = 0; i < n; i++) sig[i] = -sig[i];
  }

  return sig;
}

export function findTriggerIndex(
  samples: Float32Array,
  state: DS1000EState,
  dt: number
): number | null {
  const n = samples.length;
  if (n < 16) return null;
  const level = state.trigger.levelVolts;
  const chCfg = state.trigger.source === 'CH2' ? state.ch2 : state.ch1;
  const hyst = Math.max(1e-4, state.trigger.sensitivityDiv * chCfg.voltsPerDiv * 0.25);

  const searchStart = Math.floor(n * 0.25);
  const searchEnd = Math.floor(n * 0.75);
  const holdoffSamples = Math.max(1, Math.round(state.trigger.holdoffSec / dt));
  let lastTrig = -holdoffSamples;

  if (state.trigger.mode === 'Edge' || state.trigger.mode === 'Alternate' || state.trigger.mode === 'Video') {
    const wantRise = state.trigger.slope === 'Rising' || state.trigger.slope === 'Alternating';
    const wantFall = state.trigger.slope === 'Falling' || state.trigger.slope === 'Alternating';
    let armedRise = false;
    let armedFall = false;

    for (let i = Math.max(1, searchStart - 60); i < searchEnd; i++) {
      const v0 = samples[i - 1];
      const v1 = samples[i];
      if (v0 < level - hyst) armedRise = true;
      if (v0 > level + hyst) armedFall = true;

      if (i >= searchStart && i - lastTrig >= holdoffSamples) {
        if (wantRise && armedRise && v0 <= level && v1 > level) {
          lastTrig = i;
          return i;
        }
        if (wantFall && armedFall && v0 >= level && v1 < level) {
          lastTrig = i;
          return i;
        }
      }
      if (v1 > level + hyst) armedRise = false;
      if (v1 < level - hyst) armedFall = false;
    }
  } else if (state.trigger.mode === 'Pulse') {
    // Detect positive pulse width matching condition
    let riseIdx = -1;
    for (let i = 1; i < searchEnd; i++) {
      if (samples[i - 1] <= level && samples[i] > level) riseIdx = i;
      else if (samples[i - 1] >= level && samples[i] < level && riseIdx >= 0) {
        const widthSec = (i - riseIdx) * dt;
        const target = state.trigger.pulseWidthSec;
        const match =
          (state.trigger.pulseCondition === '<' && widthSec < target) ||
          (state.trigger.pulseCondition === '>' && widthSec > target) ||
          (state.trigger.pulseCondition === '=' && Math.abs(widthSec - target) < target * 0.15);
        if (match && riseIdx >= searchStart) return riseIdx;
        riseIdx = -1;
      }
    }
  } else if (state.trigger.mode === 'Slope') {
    for (let i = Math.max(2, searchStart); i < searchEnd; i++) {
      if (samples[i - 1] <= level && samples[i] > level) return i;
    }
  }

  return null;
}

export function computeRadix2FFT(
  samples: Float32Array,
  windowType: FFTWindow,
  dt: number
): { binsDb: Float32Array; maxFreqHz: number } {
  const N = 512;
  const re = new Float64Array(N);
  const im = new Float64Array(N);

  const srcLen = samples.length;
  let mean = 0;
  for (let i = 0; i < N; i++) {
    const idx = Math.min(srcLen - 1, Math.floor((i / N) * srcLen));
    mean += samples[idx];
  }
  mean /= N;

  for (let i = 0; i < N; i++) {
    const idx = Math.min(srcLen - 1, Math.floor((i / N) * srcLen));
    const x = samples[idx] - mean;
    let w = 1;
    const p = (2 * Math.PI * i) / (N - 1);
    if (windowType === 'Hanning') w = 0.5 * (1 - Math.cos(p));
    else if (windowType === 'Hamming') w = 0.54 - 0.46 * Math.cos(p);
    else if (windowType === 'Blackman') w = 0.42 - 0.5 * Math.cos(p) + 0.08 * Math.cos(2 * p);
    re[i] = x * w;
  }

  // Bit reversal
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
    }
  }

  for (let len = 2; len <= N; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < N; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let j = 0; j < len / 2; j++) {
        const uRe = re[i + j];
        const uIm = im[i + j];
        const vRe = re[i + j + len / 2] * wRe - im[i + j + len / 2] * wIm;
        const vIm = re[i + j + len / 2] * wIm + im[i + j + len / 2] * wRe;
        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + len / 2] = uRe - vRe;
        im[i + j + len / 2] = uIm - vIm;
        const nextWRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nextWRe;
      }
    }
  }

  const bins = N / 2;
  const binsDb = new Float32Array(bins);
  for (let k = 0; k < bins; k++) {
    const mag = (2 * Math.hypot(re[k], im[k])) / N;
    binsDb[k] = 20 * Math.log10(Math.max(1e-6, mag / Math.SQRT2));
  }

  const effectiveDt = dt * (srcLen / N);
  const maxFreqHz = 0.5 / Math.max(1e-12, effectiveDt);
  return { binsDb, maxFreqHz };
}

export function computeAllMeasurements(
  primary: Float32Array,
  secondary: Float32Array,
  dt: number
): MeasurementResults {
  const n = primary.length;
  const emptyValues: Record<MeasureParamKey, number | null> = {
    Vmax: null,
    Vmin: null,
    Vpp: null,
    Vtop: null,
    Vbase: null,
    Vamp: null,
    Vavg: null,
    Vrms: null,
    Overshoot: null,
    Preshoot: null,
    Period: null,
    Freq: null,
    RiseTime: null,
    FallTime: null,
    PlusWidth: null,
    MinusWidth: null,
    PlusDuty: null,
    MinusDuty: null,
    Delay12Rise: null,
    Delay12Fall: null,
    Phase12Rise: null,
    Phase12Fall: null,
  };

  if (n < 8) return { values: emptyValues, counterHz: null };

  let vmin = Infinity;
  let vmax = -Infinity;
  let sum = 0;
  let sumSq = 0;

  for (let i = 0; i < n; i++) {
    const v = primary[i];
    if (v < vmin) vmin = v;
    if (v > vmax) vmax = v;
    sum += v;
    sumSq += v * v;
  }

  const vpp = vmax - vmin;
  const vavg = sum / n;
  const vrms = Math.sqrt(sumSq / n);

  // Histogram for Vtop & Vbase
  let vtop = vmax;
  let vbase = vmin;
  if (vpp > 1e-5) {
    const bins = 32;
    const hist = new Int32Array(bins);
    for (let i = 0; i < n; i++) {
      const b = Math.min(bins - 1, Math.max(0, Math.floor(((primary[i] - vmin) / vpp) * (bins - 1))));
      hist[b]++;
    }
    let lowMaxIdx = 0;
    let highMaxIdx = bins - 1;
    for (let b = 0; b < bins / 2; b++) {
      if (hist[b] > hist[lowMaxIdx]) lowMaxIdx = b;
    }
    for (let b = bins / 2; b < bins; b++) {
      if (hist[b] > hist[highMaxIdx]) highMaxIdx = b;
    }
    vbase = vmin + (lowMaxIdx / (bins - 1)) * vpp;
    vtop = vmin + (highMaxIdx / (bins - 1)) * vpp;
  }
  const vamp = Math.max(0, vtop - vbase);
  const overshoot = vamp > 1e-4 ? Math.max(0, ((vmax - vtop) / vamp) * 100) : 0;
  const preshoot = vamp > 1e-4 ? Math.max(0, ((vbase - vmin) / vamp) * 100) : 0;

  emptyValues.Vmax = vmax;
  emptyValues.Vmin = vmin;
  emptyValues.Vpp = vpp;
  emptyValues.Vtop = vtop;
  emptyValues.Vbase = vbase;
  emptyValues.Vamp = vamp;
  emptyValues.Vavg = vavg;
  emptyValues.Vrms = vrms;
  emptyValues.Overshoot = overshoot;
  emptyValues.Preshoot = preshoot;

  // Timing measurements via interpolated threshold crossings
  if (vpp < 1e-3) {
    return { values: emptyValues, counterHz: null };
  }

  const mid = vmin + vpp * 0.5;
  const useVppEdges = vamp < 0.25 * vpp;
  const low10 = useVppEdges ? vmin + vpp * 0.1 : vbase + vamp * 0.1;
  const high90 = useVppEdges ? vmin + vpp * 0.9 : vbase + vamp * 0.9;
  const riseCross: number[] = [];
  const fallCross: number[] = [];

  for (let i = 1; i < n; i++) {
    const v0 = primary[i - 1];
    const v1 = primary[i];
    if (v0 <= mid && v1 > mid) {
      const frac = (mid - v0) / Math.max(1e-12, v1 - v0);
      riseCross.push((i - 1 + frac) * dt);
    } else if (v0 >= mid && v1 < mid) {
      const frac = (v0 - mid) / Math.max(1e-12, v0 - v1);
      fallCross.push((i - 1 + frac) * dt);
    }
  }

  let period: number | null = null;
  let freq: number | null = null;
  const cycCross = riseCross.length >= 2 ? riseCross : fallCross.length >= 2 ? fallCross : null;
  if (cycCross) {
    const spanSec = cycCross[cycCross.length - 1] - cycCross[0];
    if (spanSec > 0) {
      period = spanSec / (cycCross.length - 1);
      freq = 1 / period;
      // Recompute Vavg & Vrms over complete integer cycles to prevent partial-cycle window bias
      const cStart = cycCross[0] / dt;
      const cEnd = cycCross[cycCross.length - 1] / dt;
      const spanSamples = cEnd - cStart;
      if (spanSamples >= 4) {
        const sampleAt = (pos: number) => {
          const i0 = Math.min(n - 1, Math.max(0, Math.floor(pos)));
          const i1 = Math.min(n - 1, i0 + 1);
          return primary[i0] + (primary[i1] - primary[i0]) * (pos - i0);
        };
        const firstInt = Math.ceil(cStart);
        const lastInt = Math.floor(cEnd);
        let accV = 0;
        let accV2 = 0;
        let pPrev = cStart;
        let vPrev = sampleAt(cStart);
        for (let i = firstInt; i <= lastInt; i++) {
          const vCur = primary[i];
          const w = i - pPrev;
          accV += 0.5 * (vPrev + vCur) * w;
          accV2 += 0.5 * (vPrev * vPrev + vCur * vCur) * w;
          pPrev = i;
          vPrev = vCur;
        }
        const vEnd = sampleAt(cEnd);
        const wEnd = cEnd - pPrev;
        accV += 0.5 * (vPrev + vEnd) * wEnd;
        accV2 += 0.5 * (vPrev * vPrev + vEnd * vEnd) * wEnd;
        emptyValues.Vavg = accV / spanSamples;
        emptyValues.Vrms = Math.sqrt(Math.max(0, accV2 / spanSamples));
      }
    }
  }

  emptyValues.Period = period;
  emptyValues.Freq = freq;

  // +Width, -Width, +Duty, -Duty
  if (riseCross.length >= 1 && fallCross.length >= 1 && period && period > 0) {
    const firstRise = riseCross[0];
    const nextFall = fallCross.find((t) => t > firstRise);
    if (nextFall !== undefined) {
      const pw = nextFall - firstRise;
      const mw = Math.max(0, period - pw);
      emptyValues.PlusWidth = pw;
      emptyValues.MinusWidth = mw;
      emptyValues.PlusDuty = (pw / period) * 100;
      emptyValues.MinusDuty = (mw / period) * 100;
    }
  }

  // Rise & Fall time (10% to 90%)
  if (vamp > 1e-4) {
    let t10 = -1;
    let t90 = -1;
    for (let i = 1; i < n; i++) {
      if (primary[i - 1] <= low10 && primary[i] > low10) {
        t10 = (i - 1 + (low10 - primary[i - 1]) / Math.max(1e-12, primary[i] - primary[i - 1])) * dt;
      } else if (t10 >= 0 && primary[i - 1] <= high90 && primary[i] > high90) {
        t90 = (i - 1 + (high90 - primary[i - 1]) / Math.max(1e-12, primary[i] - primary[i - 1])) * dt;
        emptyValues.RiseTime = Math.max(dt * 0.2, t90 - t10);
        break;
      }
    }
    let f90 = -1;
    let f10 = -1;
    for (let i = 1; i < n; i++) {
      if (primary[i - 1] >= high90 && primary[i] < high90) {
        f90 = (i - 1 + (primary[i - 1] - high90) / Math.max(1e-12, primary[i - 1] - primary[i])) * dt;
      } else if (f90 >= 0 && primary[i - 1] >= low10 && primary[i] < low10) {
        f10 = (i - 1 + (primary[i - 1] - low10) / Math.max(1e-12, primary[i - 1] - primary[i])) * dt;
        emptyValues.FallTime = Math.max(dt * 0.2, f10 - f90);
        break;
      }
    }
  }

  // Delay & Phase between CH1 and CH2
  if (secondary.length === n && riseCross.length >= 1 && period && period > 0) {
    let sMin = Infinity;
    let sMax = -Infinity;
    for (let i = 0; i < n; i++) {
      if (secondary[i] < sMin) sMin = secondary[i];
      if (secondary[i] > sMax) sMax = secondary[i];
    }
    if (sMax - sMin > 1e-3) {
      const sMid = (sMax + sMin) * 0.5;
      const sRise: number[] = [];
      const sFall: number[] = [];
      for (let i = 1; i < n; i++) {
        if (secondary[i - 1] <= sMid && secondary[i] > sMid) {
          sRise.push((i - 1 + (sMid - secondary[i - 1]) / Math.max(1e-12, secondary[i] - secondary[i - 1])) * dt);
        } else if (secondary[i - 1] >= sMid && secondary[i] < sMid) {
          sFall.push((i - 1 + (secondary[i - 1] - sMid) / Math.max(1e-12, secondary[i - 1] - secondary[i])) * dt);
        }
      }
      if (sRise.length > 0) {
        const d = ((((riseCross[0] - sRise[0]) % period) + 1.5 * period) % period) - 0.5 * period;
        emptyValues.Delay12Rise = d;
        emptyValues.Phase12Rise = (d / period) * 360;
      }
      if (fallCross.length > 0 && sFall.length > 0) {
        const d = ((((fallCross[0] - sFall[0]) % period) + 1.5 * period) % period) - 0.5 * period;
        emptyValues.Delay12Fall = d;
        emptyValues.Phase12Fall = (d / period) * 360;
      }
    }
  }

  return { values: emptyValues, counterHz: freq };
}

export class RigolDSPEngine {
  private avgCount = 0;
  private avgCh1 = new Float32Array(0);
  private avgCh2 = new Float32Array(0);
  private lastCh1 = new Float32Array(600);
  private lastCh2 = new Float32Array(600);
  private lastMath = new Float32Array(600);
  private lastStatus: TriggerStatus = "T'D";

  processFrame(
    rawAcqCh1: Float32Array,
    rawAcqCh2: Float32Array,
    rawAcqExt: Float32Array,
    acqDt: number,
    state: DS1000EState,
    meta: {
      ch1IsComp: boolean;
      ch2IsComp: boolean;
      ch1CompTrim: number;
      ch2CompTrim: number;
      ch1PhysProbe?: number;
      ch2PhysProbe?: number;
      envelopeBurst?: boolean;
    }
  ): ScopeFrameOutput {
    const isXY = state.horizontal.timeBaseMode === 'X-Y';
    const isRoll =
      state.horizontal.timeBaseMode === 'Roll' ||
      (state.horizontal.timeBaseMode === 'Y-T' && state.horizontal.timePerDiv >= 0.2);
    const isEnvelope = Boolean(meta.envelopeBurst && !isXY);
    const outSamples = isXY ? 1200 : 600;
    const totalWindowSec = 12 * state.horizontal.timePerDiv;
    let displayDt = totalWindowSec / outSamples;

    const proc1 = processChannelSamples(
      rawAcqCh1,
      state.ch1,
      acqDt,
      meta.ch1IsComp,
      meta.ch1CompTrim,
      meta.ch1PhysProbe ?? 1
    );
    const proc2 = processChannelSamples(
      rawAcqCh2,
      state.ch2,
      acqDt,
      meta.ch2IsComp,
      meta.ch2CompTrim,
      meta.ch2PhysProbe ?? 1
    );

    const trigArr =
      state.trigger.source === 'CH2'
        ? proc2
        : state.trigger.source === 'EXT'
          ? rawAcqExt
          : proc1;

    const trigIdx =
      isXY || isRoll || isEnvelope
        ? Math.floor(proc1.length * 0.5)
        : findTriggerIndex(trigArr, state, acqDt);

    const triggered = isXY || isEnvelope || trigIdx !== null || state.trigger.forceRequested;

    // Handle Normal/Single waiting when frozen or untriggered
    if (state.runState === 'STOP') {
      const stopDt = totalWindowSec / Math.max(1, this.lastCh1.length);
      const m = computeAllMeasurements(
        state.measure.source === 'CH2' ? this.lastCh2 : this.lastCh1,
        state.measure.source === 'CH2' ? this.lastCh1 : this.lastCh2,
        stopDt
      );
      return {
        ch1Samples: this.lastCh1,
        ch2Samples: this.lastCh2,
        mathSamples: this.lastMath,
        fftBinsDb: null,
        fftMaxFreqHz: 0,
        triggerStatus: 'STOP',
        triggerSampleIndex: Math.floor(this.lastCh1.length / 2),
        sampleRateHz: 1 / stopDt,
        measurements: m,
        ch1MidpointVolts: 0,
        ch2MidpointVolts: 0,
        passFailFailed: false,
      };
    }

    if (!isXY && (state.trigger.sweep === 'Normal' || state.trigger.sweep === 'Single') && !triggered) {
      const m = computeAllMeasurements(
        state.measure.source === 'CH2' ? this.lastCh2 : this.lastCh1,
        state.measure.source === 'CH2' ? this.lastCh1 : this.lastCh2,
        displayDt
      );
      return {
        ch1Samples: this.lastCh1,
        ch2Samples: this.lastCh2,
        mathSamples: this.lastMath,
        fftBinsDb: null,
        fftMaxFreqHz: 0,
        triggerStatus: 'WAIT',
        triggerSampleIndex: Math.floor(outSamples / 2),
        sampleRateHz: 1 / displayDt,
        measurements: m,
        ch1MidpointVolts: 0,
        ch2MidpointVolts: 0,
        passFailFailed: false,
      };
    }

    // Slice output samples: steady-state tail for X-Y, peak-detect envelope for compressed slow Y-T, or trigger-centered window
    const ch1Out = new Float32Array(outSamples);
    const ch2Out = new Float32Array(outSamples);
    let measSrc1: Float32Array = ch1Out;
    let measSrc2: Float32Array = ch2Out;
    let measDt = displayDt;

    if (isXY) {
      const startIdx = Math.floor(proc1.length / 3);
      const endIdx = Math.max(startIdx + 1, proc1.length - 1);
      const spanIdx = endIdx - startIdx;
      displayDt = (spanIdx * acqDt) / Math.max(1, outSamples - 1);
      measDt = displayDt;
      for (let i = 0; i < outSamples; i++) {
        const srcFloat = startIdx + (i / (outSamples - 1)) * spanIdx;
        const idx0 = Math.min(proc1.length - 1, Math.max(0, Math.floor(srcFloat)));
        const idx1 = Math.min(proc1.length - 1, idx0 + 1);
        const frac = Math.max(0, Math.min(1, srcFloat - idx0));
        ch1Out[i] = proc1[idx0] + (proc1[idx1] - proc1[idx0]) * frac;
        ch2Out[i] = proc2[idx0] + (proc2[idx1] - proc2[idx0]) * frac;
      }
    } else if (isEnvelope) {
      const startIdx = Math.floor(proc1.length / 3);
      const settled1 = proc1.subarray(startIdx);
      const settled2 = proc2.subarray(startIdx);
      measSrc1 = settled1;
      measSrc2 = settled2;
      measDt = acqDt;

      const fillEnvelope = (settled: Float32Array, target: Float32Array) => {
        let vMin = Infinity;
        let vMax = -Infinity;
        for (let i = 0; i < settled.length; i++) {
          const v = settled[i];
          if (v < vMin) vMin = v;
          if (v > vMax) vMax = v;
        }
        if (!Number.isFinite(vMin)) {
          target.fill(0);
          return;
        }
        if (state.display.type === 'Dots') {
          const len = Math.max(1, settled.length);
          for (let i = 0; i < outSamples; i++) {
            target[i] = settled[(i * 19) % len];
          }
        } else {
          for (let i = 0; i < outSamples; i++) {
            target[i] = i % 2 === 0 ? vMin : vMax;
          }
        }
      };

      fillEnvelope(settled1, ch1Out);
      fillEnvelope(settled2, ch2Out);
    } else if (isRoll) {
      // Map valid roll history cleanly across full screen width (newest at right edge, never out-of-bounds)
      const lastIdx = Math.max(1, proc1.length - 1);
      for (let i = 0; i < outSamples; i++) {
        const srcFloat = (i / (outSamples - 1)) * lastIdx;
        const idx0 = Math.min(lastIdx, Math.max(0, Math.floor(srcFloat)));
        const idx1 = Math.min(lastIdx, idx0 + 1);
        const frac = Math.max(0, Math.min(1, srcFloat - idx0));
        ch1Out[i] = proc1[idx0] + (proc1[idx1] - proc1[idx0]) * frac;
        ch2Out[i] = proc2[idx0] + (proc2[idx1] - proc2[idx0]) * frac;
      }
      measDt = (lastIdx * acqDt) / Math.max(1, outSamples - 1);
    } else {
      const anchorIdx = trigIdx ?? Math.floor(proc1.length * 0.5);
      const offsetSamplesInAcq = state.horizontal.triggerOffsetSec / acqDt;
      const startAcq = anchorIdx - (outSamples * 0.5) * (displayDt / acqDt) - offsetSamplesInAcq;

      for (let i = 0; i < outSamples; i++) {
        const srcFloat = startAcq + i * (displayDt / acqDt);
        const idx0 = Math.min(proc1.length - 1, Math.max(0, Math.floor(srcFloat)));
        const idx1 = Math.min(proc1.length - 1, idx0 + 1);
        const frac = Math.max(0, Math.min(1, srcFloat - idx0));
        ch1Out[i] = proc1[idx0] + (proc1[idx1] - proc1[idx0]) * frac;
        ch2Out[i] = proc2[idx0] + (proc2[idx1] - proc2[idx0]) * frac;
      }
    }

    // Average acquisition mode
    if (state.acquire.mode === 'Average') {
      if (this.avgCh1.length !== outSamples) {
        this.avgCh1 = new Float32Array(ch1Out);
        this.avgCh2 = new Float32Array(ch2Out);
        this.avgCount = 1;
      } else {
        this.avgCount = Math.min(state.acquire.averages, this.avgCount + 1);
        const w = 1 / this.avgCount;
        for (let i = 0; i < outSamples; i++) {
          this.avgCh1[i] = this.avgCh1[i] * (1 - w) + ch1Out[i] * w;
          this.avgCh2[i] = this.avgCh2[i] * (1 - w) + ch2Out[i] * w;
        }
        ch1Out.set(this.avgCh1);
        ch2Out.set(this.avgCh2);
      }
    } else {
      this.avgCount = 0;
    }

    // Math channel
    const mathOut = new Float32Array(outSamples);
    let fftBinsDb: Float32Array | null = null;
    let fftMaxFreqHz = 0;
    if (state.math.enabled) {
      if (state.math.op === 'FFT') {
        const fftSrc = state.math.fftSource === 'CH2' ? measSrc2 : measSrc1;
        const fftRes = computeRadix2FFT(fftSrc, state.math.fftWindow, measDt);
        fftBinsDb = fftRes.binsDb;
        fftMaxFreqHz = fftRes.maxFreqHz;
      } else if (isEnvelope) {
        const aArr = state.math.sourceA === 'CH1' ? measSrc1 : measSrc2;
        const bArr = state.math.sourceB === 'CH1' ? measSrc1 : measSrc2;
        let mMin = Infinity;
        let mMax = -Infinity;
        for (let i = 0; i < aArr.length; i++) {
          const mv =
            state.math.op === 'A+B'
              ? aArr[i] + bArr[i]
              : state.math.op === 'A-B'
                ? aArr[i] - bArr[i]
                : aArr[i] * bArr[i];
          if (mv < mMin) mMin = mv;
          if (mv > mMax) mMax = mv;
        }
        if (Number.isFinite(mMin)) {
          for (let i = 0; i < outSamples; i++) {
            mathOut[i] = i % 2 === 0 ? mMin : mMax;
          }
        }
      } else {
        const aArr = state.math.sourceA === 'CH1' ? ch1Out : ch2Out;
        const bArr = state.math.sourceB === 'CH1' ? ch1Out : ch2Out;
        for (let i = 0; i < outSamples; i++) {
          if (state.math.op === 'A+B') mathOut[i] = aArr[i] + bArr[i];
          else if (state.math.op === 'A-B') mathOut[i] = aArr[i] - bArr[i];
          else mathOut[i] = aArr[i] * bArr[i];
        }
      }
    }

    this.lastCh1 = ch1Out;
    this.lastCh2 = ch2Out;
    this.lastMath = mathOut;
    this.lastStatus = isXY
      ? 'AUTO'
      : isEnvelope
        ? "T'D"
        : state.trigger.sweep === 'Single'
          ? 'STOP'
          : trigIdx !== null
            ? "T'D"
            : 'AUTO';

    const primaryMeas = state.measure.source === 'CH2' ? measSrc2 : measSrc1;
    const secondaryMeas = state.measure.source === 'CH2' ? measSrc1 : measSrc2;
    const measurements = computeAllMeasurements(primaryMeas, secondaryMeas, measDt);

    const ch1Meas = computeAllMeasurements(measSrc1, measSrc2, measDt);
    const ch2Meas = computeAllMeasurements(measSrc2, measSrc1, measDt);
    const ch1Mid =
      ((ch1Meas.values.Vmax ?? 0) + (ch1Meas.values.Vmin ?? 0)) * 0.5;
    const ch2Mid =
      ((ch2Meas.values.Vmax ?? 0) + (ch2Meas.values.Vmin ?? 0)) * 0.5;

    // Pass/Fail check (against simple envelope around reference or 0 if mask active)
    let passFailFailed = false;
    if (state.utility.passFail.enabled && state.utility.passFail.running && state.utility.passFail.maskCreated) {
      const pfSrc = state.utility.passFail.source === 'CH2' ? ch2Out : ch1Out;
      const limitV = (state.utility.passFail.source === 'CH2' ? state.ch2.voltsPerDiv : state.ch1.voltsPerDiv) * 4;
      for (let i = 0; i < pfSrc.length; i++) {
        if (Math.abs(pfSrc[i]) > limitV) {
          passFailFailed = true;
          break;
        }
      }
    }

    return {
      ch1Samples: ch1Out,
      ch2Samples: ch2Out,
      mathSamples: mathOut,
      fftBinsDb,
      fftMaxFreqHz,
      triggerStatus: this.lastStatus,
      triggerSampleIndex: Math.floor(outSamples / 2),
      sampleRateHz: 1 / measDt,
      measurements,
      ch1MidpointVolts: ch1Mid,
      ch2MidpointVolts: ch2Mid,
      passFailFailed,
    };
  }
}

export function computeAutoSetup(
  state: DS1000EState,
  ch1Samples: Float32Array,
  ch2Samples: Float32Array,
  dt: number,
  mode: 'Multi-Cycle' | 'Single Cycle' | 'Rise Edge' | 'Fall Edge' = 'Multi-Cycle',
  knownFreqHz?: number | null
): DS1000EState {
  const next = structuredClone(state) as DS1000EState;
  next.previousSnapshotForAutoUndo = takeSnapshot(state);
  next.horizontal.timeBaseMode = 'Y-T';
  next.horizontal.triggerOffsetSec = 0;
  next.horizontal.savedYtOffsets = null;

  const m1 = computeAllMeasurements(ch1Samples, ch2Samples, dt);
  const m2 = computeAllMeasurements(ch2Samples, ch1Samples, dt);
  const ch1Active = (m1.values.Vpp ?? 0) > 0.02 || Math.abs(m1.values.Vavg ?? 0) > 0.05;
  const ch2Active = (m2.values.Vpp ?? 0) > 0.02 || Math.abs(m2.values.Vavg ?? 0) > 0.05;

  const fitVoltsDiv = (vpp: number, vavg: number, probe: number): { vDiv: number; offsetDiv: number } => {
    const span = Math.max(vpp, Math.abs(vavg) * 1.15, 0.01);
    const targetVDiv = span / 3.2;
    let chosen = VOLTS_PER_DIV_1X[VOLTS_PER_DIV_1X.length - 1] * probe;
    for (const step of VOLTS_PER_DIV_1X) {
      if (step * probe >= targetVDiv) {
        chosen = step * probe;
        break;
      }
    }
    const rawOff = Math.abs(vavg) > chosen * 1.5 ? -Math.round((vavg / chosen) * 2) / 2 : 0;
    const offsetDiv = Math.max(-3.5, Math.min(3.5, rawOff));
    return { vDiv: chosen, offsetDiv };
  };

  if (ch1Active) {
    next.ch1.enabled = true;
    const fit = fitVoltsDiv(m1.values.Vpp ?? 1, m1.values.Vavg ?? 0, next.ch1.probe);
    next.ch1.voltsPerDiv = fit.vDiv;
    next.ch1.offsetDiv = ch2Active ? 1.5 : fit.offsetDiv;
  }
  if (ch2Active) {
    next.ch2.enabled = true;
    const fit = fitVoltsDiv(m2.values.Vpp ?? 1, m2.values.Vavg ?? 0, next.ch2.probe);
    next.ch2.voltsPerDiv = fit.vDiv;
    next.ch2.offsetDiv = ch1Active ? -1.8 : fit.offsetDiv;
  }

  const trigFreq =
    knownFreqHz && Number.isFinite(knownFreqHz) && knownFreqHz > 0
      ? knownFreqHz
      : ch1Active && m1.values.Freq
        ? m1.values.Freq
        : m2.values.Freq;
  if (trigFreq && trigFreq > 0) {
    const period = 1 / trigFreq;
    let targetCycles = 3.5;
    if (mode === 'Single Cycle') targetCycles = 1.2;
    else if (mode === 'Rise Edge' || mode === 'Fall Edge') targetCycles = 0.12;
    const targetTimeDiv = (period * targetCycles) / 12;
    let chosenT = TIME_PER_DIV_STEPS[TIME_PER_DIV_STEPS.length - 1];
    for (const t of TIME_PER_DIV_STEPS) {
      if (t >= targetTimeDiv) {
        chosenT = t;
        break;
      }
    }
    next.horizontal.timePerDiv = chosenT;
    next.horizontal.timeBaseMode = 'Y-T';
    next.horizontal.triggerOffsetSec = 0;
    next.horizontal.savedYtOffsets = null;
  }

  next.trigger.source = ch1Active ? 'CH1' : ch2Active ? 'CH2' : next.trigger.source;
  next.trigger.mode = 'Edge';
  next.trigger.sweep = 'Auto';
  next.trigger.slope = mode === 'Fall Edge' ? 'Falling' : 'Rising';
  const refMeas = next.trigger.source === 'CH2' ? m2 : m1;
  next.trigger.levelVolts = ((refMeas.values.Vmax ?? 0) + (refMeas.values.Vmin ?? 0)) * 0.5;
  next.runState = 'RUN';
  next.dirtySeq++;
  return next;
}
