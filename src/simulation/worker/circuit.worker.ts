import { RigolDSPEngine } from '../../instruments/ds1000e/dsp';
import type { DS1000EState, ScopeFrameOutput } from '../../instruments/ds1000e/types';
import {
  DM3058_EMPTY_MEAS,
  extractRawValue,
  formatDM3058Reading,
} from '../../instruments/dm3058/state';
import type { DM3058Function, DM3058MeasurementPacket } from '../../instruments/dm3058/types';
import { CircuitMNASolver } from '../circuit/mnaSolver';
import { compileBenchNetlist, type CompileBenchParams } from '../circuit/netlistCompiler';
import type { CircuitComponent, CompiledNetlist } from '../circuit/types';

export interface WorkerRequest {
  type: 'sim_tick';
  bench: CompileBenchParams;
  scope: DS1000EState;
}

export interface WorkerResponse {
  type: 'sim_result';
  frame: ScopeFrameOutput;
  faults: import('../circuit/types').FaultEvent[];
  dmmReadout: string;
  dm3058Meas: DM3058MeasurementPacket;
  bbNodeVoltages: Record<string, number>;
  ledCurrents: Record<string, number>;
}

const solver = new CircuitMNASolver();
const auxSolver = new CircuitMNASolver();
const dsp = new RigolDSPEngine();
let lastNetKey = '';
let cachedNetlist: CompiledNetlist | null = null;
let cachedBbVoltages: Record<string, number> = {};
let sampleSeqCounter = 1;

const ROLL_BUF_LEN = 1800;
const rollCh1 = new Float32Array(ROLL_BUF_LEN);
const rollCh2 = new Float32Array(ROLL_BUF_LEN);
const rollExt = new Float32Array(ROLL_BUF_LEN);
let rollSeeded = false;

function detectActiveSourceFreqRange(
  bench: CompileBenchParams,
  netlist: CompiledNetlist,
  dmmActive: boolean
): { maxFreqHz: number; minFreqHz: number } {
  const ch1 = netlist.probeNodes.ch1;
  const ch2 = netlist.probeNodes.ch2;
  const anyMeasActive = ch1.connected || ch2.connected || dmmActive;
  const freqs: number[] = [];

  if (bench.scopePowered && (ch1.isProbeComp || ch2.isProbeComp)) {
    freqs.push(1000);
  }
  const gen1Wired = bench.cables.some(
    (c) => (c.endA === 'gen_out' || c.endB === 'gen_out') && c.endA && c.endB
  );
  if (
    anyMeasActive &&
    gen1Wired &&
    bench.signalGen.power &&
    bench.signalGen.outputEnabled &&
    bench.signalGen.vpp > 0
  ) {
    freqs.push(bench.signalGen.freqHz);
  }
  const gen2Wired = bench.cables.some(
    (c) => (c.endA === 'gen_ch2_out' || c.endB === 'gen_ch2_out') && c.endA && c.endB
  );
  if (
    anyMeasActive &&
    gen2Wired &&
    bench.signalGen.power &&
    bench.signalGen.ch2OutputEnabled &&
    (bench.signalGen.ch2Vpp ?? 4) > 0
  ) {
    freqs.push(bench.signalGen.ch2FreqHz ?? 1500);
  }
  if (bench.activeKit === 'osc_gen' && (bench.kitControls?.oscGenPower ?? true)) {
    const oscUsed = bench.cables.some(
      (c) => (c.endA === 'ko_osc_out' || c.endB === 'ko_osc_out') && c.endA && c.endB
    );
    if (oscUsed) {
      const fList = [500, 2000, 8000];
      freqs.push(fList[bench.kitControls?.oscGenFreqIdx ?? 1] ?? 2000);
    }
  }
  if (freqs.length === 0) return { maxFreqHz: 0, minFreqHz: 0 };
  return {
    maxFreqHz: Math.max(...freqs),
    minFreqHz: Math.min(...freqs),
  };
}

function buildMutedComponents(netlist: CompiledNetlist): CircuitComponent[] {
  return netlist.components
    .filter((c) => c.id !== 'dmm_load_v')
    .map((c) => {
      if (c.kind === 'vsource_dc') return { ...c, volts: 0 };
      if (c.kind === 'vsource_func') return { ...c, amplitudePeak: 0, dcOffset: 0 };
      return c;
    });
}

function measureRmsAndFreq(
  trace: Float32Array | null,
  dt: number,
  skipFrac = 0
): { acRms: number; freqHz: number } {
  if (!trace || trace.length < 4 || dt <= 0) return { acRms: 0, freqHz: 0 };
  const start = Math.min(trace.length - 4, Math.max(0, Math.floor(trace.length * skipFrac)));
  const len = trace.length - start;
  let mean = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let i = start; i < trace.length; i++) {
    const v = trace[i];
    mean += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  mean /= len;

  const crossings: number[] = [];
  if (max - min > 0.01) {
    for (let i = start + 1; i < trace.length; i++) {
      const a = trace[i - 1] - mean;
      const b = trace[i] - mean;
      if (a < 0 && b >= 0) {
        const frac = -a / Math.max(1e-12, b - a);
        crossings.push(i - 1 + frac);
      }
    }
  }

  let freqHz = 0;
  let acRms = 0;
  if (crossings.length >= 2) {
    const cStart = crossings[0];
    const cEnd = crossings[crossings.length - 1];
    const spanSamples = cEnd - cStart;
    if (spanSamples > 0) {
      freqHz = (crossings.length - 1) / (spanSamples * dt);
      // Integrate over complete integer cycles with fractional endpoints for exact True-RMS
      const sampleAt = (pos: number) => {
        const i0 = Math.min(trace.length - 1, Math.max(0, Math.floor(pos)));
        const i1 = Math.min(trace.length - 1, i0 + 1);
        return trace[i0] + (trace[i1] - trace[i0]) * (pos - i0);
      };
      const firstInt = Math.ceil(cStart);
      const lastInt = Math.floor(cEnd);
      const integrate = (fn: (v: number) => number) => {
        let acc = 0;
        let pPrev = cStart;
        let vPrev = fn(sampleAt(cStart));
        for (let i = firstInt; i <= lastInt; i++) {
          const vCur = fn(trace[i]);
          acc += 0.5 * (vPrev + vCur) * (i - pPrev);
          pPrev = i;
          vPrev = vCur;
        }
        const vEnd = fn(sampleAt(cEnd));
        acc += 0.5 * (vPrev + vEnd) * (cEnd - pPrev);
        return acc / spanSamples;
      };
      const cycMean = integrate((v) => v);
      const cycVar = integrate((v) => {
        const d = v - cycMean;
        return d * d;
      });
      acRms = Math.sqrt(Math.max(0, cycVar));
      return { acRms, freqHz };
    }
  }

  let sq = 0;
  for (let i = start; i < trace.length; i++) {
    const dv = trace[i] - mean;
    sq += dv * dv;
  }
  acRms = Math.sqrt(sq / len);
  return { acRms, freqHz };
}

function measureCapacitanceAC(netlist: CompiledNetlist, posNode: string, comNode: string): number {
  const probeAt = (freqHz: number, rRef: number): number => {
    const comps = buildMutedComponents(netlist);
    comps.push({
      id: '__dmm_cap_src',
      kind: 'vsource_func',
      nodePos: 'N_DMM_CAP_DRV',
      nodeNeg: comNode,
      waveform: 'sine',
      freqHz,
      amplitudePeak: 1.0,
      dcOffset: 0,
      dutyPct: 50,
    });
    comps.push({
      id: '__dmm_cap_ref',
      kind: 'resistor',
      nodeA: 'N_DMM_CAP_DRV',
      nodeB: posNode,
      ohms: rRef,
    });
    auxSolver.compile({ ...netlist, nodeNames: [...netlist.nodeNames, 'N_DMM_CAP_DRV'], components: comps });
    const ac = auxSolver.solveAC(freqHz);
    const pPos = ac.nodePhasors[posNode];
    const pCom = ac.nodePhasors[comNode];
    if (!pPos || !pCom) return Number.NaN;
    const vr = pPos.re - pCom.re;
    const vi = pPos.im - pCom.im;
    const denom = vr * vr + vi * vi;
    if (denom < 1e-11) return Number.NaN;
    // Exact admittance Im(Y_dut) = -vi / (R_ref * (vr^2 + vi^2)) = omega * C
    const bImag = -vi / (rRef * denom);
    if (bImag <= 1e-10) return Number.NaN;
    return bImag / (2 * Math.PI * freqHz);
  };

  const c1k = probeAt(1000, 1000);
  if (!Number.isFinite(c1k)) return Number.NaN;
  const cVal = c1k > 5e-6 ? probeAt(60, 47) : c1k;
  if (!Number.isFinite(cVal) || cVal < 1e-11 || cVal > 0.05) return Number.NaN;
  return cVal;
}

function measureDiodeForward(netlist: CompiledNetlist, posNode: string, comNode: string): number {
  const comps = buildMutedComponents(netlist);
  comps.push({
    id: '__dmm_dio_src',
    kind: 'vsource_dc',
    nodePos: 'N_DMM_DIO_DRV',
    nodeNeg: comNode,
    volts: 2.5,
  });
  comps.push({
    id: '__dmm_dio_r',
    kind: 'resistor',
    nodeA: 'N_DMM_DIO_DRV',
    nodeB: posNode,
    ohms: 1500,
  });
  auxSolver.compile({ ...netlist, nodeNames: [...netlist.nodeNames, 'N_DMM_DIO_DRV'], components: comps });
  const dc = auxSolver.solveDC();
  const vDut = (dc.nodeVoltages[posNode] ?? 0) - (dc.nodeVoltages[comNode] ?? 0);
  if (vDut > 2.25) return Infinity;
  return Math.max(0, vDut);
}

function computeDM3058Measurement(
  bench: CompileBenchParams,
  netlist: CompiledNetlist,
  dmmDiffTrace: Float32Array | null,
  dmmCurrTrace: Float32Array | null,
  traceDt: number,
  dmmSkipFrac: number,
  linearAc: { linear: boolean; vacRms: number; iacRms: number; freqHz: number } | null
): DM3058MeasurementPacket {
  const dmm = bench.dmm;
  const info = netlist.dmmNodes;
  if (!dmm || !dmm.power || !info) {
    return { ...DM3058_EMPTY_MEAS, sampleSeq: sampleSeqCounter++ };
  }

  const needs = (fn: DM3058Function) => dmm.func === fn || (dmm.dualEnabled && dmm.viceFunc === fn);
  const packet: DM3058MeasurementPacket = {
    connectedMain: info.connectedMain,
    connectedCurrent: info.connectedCurrent,
    connectedSense: info.connectedSense,
    vdc: 0,
    vacRms: 0,
    idc: 0,
    iacRms: 0,
    ohms2W: Infinity,
    ohms4W: Infinity,
    farads: Number.NaN,
    freqHz: 0,
    diodeVf: Infinity,
    contOhms: Infinity,
    sampleSeq: sampleSeqCounter++,
  };

  if (info.connectedMain || info.connectedCurrent) {
    const dc = solver.solveDC();
    if (info.connectedMain) {
      packet.vdc = (dc.nodeVoltages[info.posNode] ?? 0) - (dc.nodeVoltages[info.comNode] ?? 0);
    }
    if (info.connectedCurrent) {
      const vShunt = (dc.nodeVoltages[info.currNode] ?? 0) - (dc.nodeVoltages[info.comNode] ?? 0);
      packet.idc = vShunt / Math.max(1e-3, info.shuntOhms);
    }
  }

  if (info.connectedMain && (needs('ACV') || needs('FREQ') || needs('PER'))) {
    if (linearAc?.linear) {
      packet.vacRms = linearAc.vacRms;
      packet.freqHz = linearAc.freqHz;
    } else {
      const { acRms, freqHz } = measureRmsAndFreq(dmmDiffTrace, traceDt, dmmSkipFrac);
      packet.vacRms = acRms;
      packet.freqHz = freqHz;
    }
  }

  if (info.connectedCurrent && needs('ACI')) {
    if (linearAc?.linear) {
      packet.iacRms = linearAc.iacRms;
    } else {
      const { acRms } = measureRmsAndFreq(dmmCurrTrace, traceDt, dmmSkipFrac);
      packet.iacRms = acRms / Math.max(1e-3, info.shuntOhms);
    }
  }

  if (info.connectedMain && (needs('2WR') || needs('CONT') || (needs('4WR') && !info.connectedSense))) {
    const passive = buildMutedComponents(netlist);
    passive.push({
      id: '__dmm_ohm_src',
      kind: 'vsource_dc',
      nodePos: info.posNode,
      nodeNeg: info.comNode,
      volts: 1.0,
    });
    auxSolver.compile({ ...netlist, components: passive });
    const dc = auxSolver.solveDC();
    const iTest = Math.abs(dc.sourceCurrents.__dmm_ohm_src ?? 0);
    if (iTest >= 5e-9) {
      const rExact = 1.0 / iTest;
      packet.ohms2W = rExact + 0.08;
      packet.contOhms = rExact + 0.08;
      if (!info.connectedSense) packet.ohms4W = rExact;
    }
  }

  if (info.connectedMain && info.connectedSense && needs('4WR')) {
    const passive = buildMutedComponents(netlist);
    passive.push({
      id: '__dmm_4w_src',
      kind: 'vsource_dc',
      nodePos: info.posNode,
      nodeNeg: info.comNode,
      volts: 1.0,
    });
    auxSolver.compile({ ...netlist, components: passive });
    const dc = auxSolver.solveDC();
    const iForce = Math.abs(dc.sourceCurrents.__dmm_4w_src ?? 0);
    const vSense = Math.abs((dc.nodeVoltages[info.senseHiNode] ?? 0) - (dc.nodeVoltages[info.senseLoNode] ?? 0));
    if (iForce >= 5e-9) {
      packet.ohms4W = vSense / iForce;
    }
  }

  if (info.connectedMain && needs('DIODE')) {
    packet.diodeVf = measureDiodeForward(netlist, info.posNode, info.comNode);
  }

  if (info.connectedMain && needs('CAP')) {
    packet.farads = measureCapacitanceAC(netlist, info.posNode, info.comNode);
  }

  return packet;
}

export function runSimulationStep(bench: CompileBenchParams, scope: DS1000EState): WorkerResponse {
  const netKey = JSON.stringify({
    cables: bench.cables.map((c) => [c.id, c.endA, c.endB, c.gndClip, c.probeAtten]),
    gen: bench.signalGen,
    psu: bench.powerSupply,
    pwr: bench.scopePowered,
    p1: bench.ch1ProbeAtten,
    p2: bench.ch2ProbeAtten,
    kit: bench.activeKit,
    kitCtl: bench.kitControls,
    bb: bench.breadboardParts,
    dmm: bench.dmm,
    extra: bench.extraComponents,
  });

  let netlist = cachedNetlist;
  let netChanged = false;
  if (netKey !== lastNetKey || !netlist) {
    netlist = compileBenchNetlist(bench);
    solver.compile(netlist);
    lastNetKey = netKey;
    cachedNetlist = netlist;
    rollSeeded = false;
    netChanged = true;
  }

  const ch1Meta = netlist.probeNodes.ch1;
  const ch2Meta = netlist.probeNodes.ch2;
  const extMeta = netlist.probeNodes.ext;
  const ch1Atten = Math.max(1, ch1Meta.probeAtten || 1);
  const ch2Atten = Math.max(1, ch2Meta.probeAtten || 1);
  const dmmNodes = netlist.dmmNodes;
  const probeList = [ch1Meta.signalNode, ch2Meta.signalNode, extMeta.signalNode];
  if (dmmNodes && (dmmNodes.connectedMain || dmmNodes.connectedCurrent)) {
    probeList.push(dmmNodes.posNode, dmmNodes.comNode, dmmNodes.currNode);
  }

  const isXY = scope.horizontal.timeBaseMode === 'X-Y';
  const isRoll =
    scope.horizontal.timeBaseMode === 'Roll' ||
    (scope.horizontal.timeBaseMode === 'Y-T' && scope.horizontal.timePerDiv >= 0.2);

  const dmmActive = Boolean(bench.dmm?.power && dmmNodes && (dmmNodes.connectedMain || dmmNodes.connectedCurrent));
  const { maxFreqHz, minFreqHz } = detectActiveSourceFreqRange(bench, netlist, dmmActive);
  const displayWindowSec = 12 * scope.horizontal.timePerDiv;
  const requestedDivs = isXY ? 18 : 36;
  // Prime sample count in Y-T prevents exact integer-multiple stroboscopic cancellation
  const acqLen = isXY ? 1800 : 1801;
  const requestedDt = (requestedDivs * scope.horizontal.timePerDiv) / acqLen;

  // High-resolution steady-state burst prevents Nyquist aliasing / open X-Y curves at extreme time/div
  const xyTargetCycles = maxFreqHz > minFreqHz * 1.01 ? 4 : 2;
  const xyNeedsBurst =
    isXY &&
    minFreqHz > 0 &&
    (requestedDt > 1 / (maxFreqHz * 24) || displayWindowSec < xyTargetCycles / minFreqHz);
  const ytNeedsEnvelopeBurst =
    !isXY &&
    maxFreqHz > 0 &&
    ((isRoll && displayWindowSec * maxFreqHz >= 18) ||
      (!isRoll && requestedDt > 1 / (maxFreqHz * 10) && displayWindowSec * minFreqHz >= 18));

  let acqDt = requestedDt;
  let raw1 = new Float32Array(acqLen);
  let raw2 = new Float32Array(acqLen);
  let rawExt = new Float32Array(acqLen);
  let dmmDiffTrace: Float32Array | null = null;
  let dmmCurrTrace: Float32Array | null = null;
  let dmmTraceDt = acqDt;
  let dmmSkipFrac = 0;
  let linearAc: { linear: boolean; vacRms: number; iacRms: number; freqHz: number } | null = null;
  let faults: import('../circuit/types').FaultEvent[] = [];

  if (scope.power === 'ON' || dmmActive) {
    if (xyNeedsBurst || ytNeedsEnvelopeBurst) {
      const preSettled = solver.initSineSteadyState();
      if (!preSettled) solver.resetTransientState();

      let burstLen = 1800;
      let burstDt = 1 / (maxFreqHz * 48);
      if (xyNeedsBurst) {
        // Ensure final 2/3 of X-Y trace always spans >= xyTargetCycles closed cycles at >= 32 pts/high-freq cycle
        const desiredDur = (xyTargetCycles * 1.65) / minFreqHz;
        burstLen = maxFreqHz > minFreqHz * 1.01 ? 2400 : 1800;
        const maxSafeDur = burstLen / (maxFreqHz * 32);
        const burstDur = Math.min(desiredDur, Math.max(maxSafeDur, 2.5 / maxFreqHz));
        burstDt = burstDur / burstLen;
      }
      const burstDur = burstDt * burstLen;
      acqDt = burstDt;
      const chunk = solver.stepTransient(burstDur, burstDt, probeList);
      faults = chunk.faults;

      raw1 = new Float32Array(burstLen);
      raw2 = new Float32Array(burstLen);
      rawExt = new Float32Array(burstLen);
      const s1 = chunk.nodeVoltages[ch1Meta.signalNode];
      const s2 = chunk.nodeVoltages[ch2Meta.signalNode];
      const se = chunk.nodeVoltages[extMeta.signalNode];
      for (let i = 0; i < burstLen; i++) {
        raw1[i] = ch1Meta.connected ? s1[i] / ch1Atten : 0;
        raw2[i] = ch2Meta.connected ? s2[i] / ch2Atten : 0;
        rawExt[i] = extMeta.connected ? se[i] : 0;
      }
      if (dmmActive && dmmNodes) {
        const dp = chunk.nodeVoltages[dmmNodes.posNode];
        const dc = chunk.nodeVoltages[dmmNodes.comNode];
        const di = chunk.nodeVoltages[dmmNodes.currNode];
        dmmDiffTrace = new Float32Array(burstLen);
        dmmCurrTrace = new Float32Array(burstLen);
        for (let i = 0; i < burstLen; i++) {
          dmmDiffTrace[i] = dp[i] - dc[i];
          dmmCurrTrace[i] = di[i] - dc[i];
        }
        dmmTraceDt = burstDt;
        dmmSkipFrac = preSettled ? 0 : 0.25;
      }
    } else if (isRoll) {
      const stepDur = 1 / 30;
      const subSteps = 30;
      const subDt = stepDur / subSteps;
      const chunk = solver.stepTransient(stepDur, subDt, probeList);
      faults = chunk.faults;

      const s1 = chunk.nodeVoltages[ch1Meta.signalNode];
      const s2 = chunk.nodeVoltages[ch2Meta.signalNode];
      const se = chunk.nodeVoltages[extMeta.signalNode];

      if (!rollSeeded) {
        rollCh1.fill(ch1Meta.connected ? s1[0] / ch1Atten : 0);
        rollCh2.fill(ch2Meta.connected ? s2[0] / ch2Atten : 0);
        rollExt.fill(extMeta.connected ? se[0] : 0);
        rollSeeded = true;
      }

      rollCh1.copyWithin(0, subSteps);
      rollCh2.copyWithin(0, subSteps);
      rollExt.copyWithin(0, subSteps);
      const start = ROLL_BUF_LEN - subSteps;
      for (let i = 0; i < subSteps; i++) {
        rollCh1[start + i] = ch1Meta.connected ? s1[i] / ch1Atten : 0;
        rollCh2[start + i] = ch2Meta.connected ? s2[i] / ch2Atten : 0;
        rollExt[start + i] = extMeta.connected ? se[i] : 0;
      }
      raw1 = rollCh1;
      raw2 = rollCh2;
      rawExt = rollExt;
      acqDt = subDt;
      if (dmmActive && dmmNodes) {
        const dp = chunk.nodeVoltages[dmmNodes.posNode];
        const dc = chunk.nodeVoltages[dmmNodes.comNode];
        const di = chunk.nodeVoltages[dmmNodes.currNode];
        dmmDiffTrace = new Float32Array(subSteps);
        dmmCurrTrace = new Float32Array(subSteps);
        for (let i = 0; i < subSteps; i++) {
          dmmDiffTrace[i] = dp[i] - dc[i];
          dmmCurrTrace[i] = di[i] - dc[i];
        }
        dmmTraceDt = subDt;
      }
    } else {
      const preSettled = solver.initSineSteadyState();
      if (!preSettled) solver.resetTransientState();
      const totalDur = requestedDivs * scope.horizontal.timePerDiv;
      acqDt = totalDur / acqLen;
      const chunk = solver.stepTransient(totalDur, acqDt, probeList);
      faults = chunk.faults;

      const s1 = chunk.nodeVoltages[ch1Meta.signalNode];
      const s2 = chunk.nodeVoltages[ch2Meta.signalNode];
      const se = chunk.nodeVoltages[extMeta.signalNode];
      for (let i = 0; i < acqLen; i++) {
        raw1[i] = ch1Meta.connected ? s1[i] / ch1Atten : 0;
        raw2[i] = ch2Meta.connected ? s2[i] / ch2Atten : 0;
        rawExt[i] = extMeta.connected ? se[i] : 0;
      }
      if (dmmActive && dmmNodes) {
        const dp = chunk.nodeVoltages[dmmNodes.posNode];
        const dc = chunk.nodeVoltages[dmmNodes.comNode];
        const di = chunk.nodeVoltages[dmmNodes.currNode];
        dmmDiffTrace = new Float32Array(acqLen);
        dmmCurrTrace = new Float32Array(acqLen);
        for (let i = 0; i < acqLen; i++) {
          dmmDiffTrace[i] = dp[i] - dc[i];
          dmmCurrTrace[i] = di[i] - dc[i];
        }
        dmmTraceDt = acqDt;
        dmmSkipFrac = preSettled ? 0 : 0.25;
      }
    }

    // Dedicated alias-free DMM ACV/ACI/FREQ/PER engine: exact phasor for linear sines, adaptive window for non-sine/nonlinear
    if (dmmActive && dmmNodes && bench.dmm) {
      const f = bench.dmm.func;
      const vf = bench.dmm.dualEnabled ? bench.dmm.viceFunc : null;
      const wantsAc =
        f === 'ACV' ||
        f === 'ACI' ||
        f === 'FREQ' ||
        f === 'PER' ||
        vf === 'ACV' ||
        vf === 'ACI' ||
        vf === 'FREQ' ||
        vf === 'PER';
      if (wantsAc) {
        linearAc = solver.solveLinearACSummary(
          dmmNodes.posNode,
          dmmNodes.comNode,
          dmmNodes.currNode,
          dmmNodes.shuntOhms
        );
        if (!linearAc.linear) {
          const effMinF = Math.max(10, minFreqHz || 50);
          const effMaxF = Math.max(effMinF, maxFreqHz || 1000);
          const winDur = Math.min(0.15, Math.max(5 / effMinF, 0.004));
          const dmmLen = Math.min(2400, Math.max(800, Math.ceil(winDur * effMaxF * 48)));
          const winDt = winDur / dmmLen;
          auxSolver.compile(netlist);
          const acChunk = auxSolver.stepTransient(winDur, winDt, [
            dmmNodes.posNode,
            dmmNodes.comNode,
            dmmNodes.currNode,
          ]);
          const dp = acChunk.nodeVoltages[dmmNodes.posNode];
          const dc = acChunk.nodeVoltages[dmmNodes.comNode];
          const di = acChunk.nodeVoltages[dmmNodes.currNode];
          dmmDiffTrace = new Float32Array(dmmLen);
          dmmCurrTrace = new Float32Array(dmmLen);
          for (let i = 0; i < dmmLen; i++) {
            dmmDiffTrace[i] = dp[i] - dc[i];
            dmmCurrTrace[i] = di[i] - dc[i];
          }
          dmmTraceDt = winDt;
          dmmSkipFrac = 0.25;
        }
      }
    }
  }

  const ledCurrents = solver.getLastDiodeCurrents();
  const dm3058Meas = computeDM3058Measurement(
    bench,
    netlist,
    dmmDiffTrace,
    dmmCurrTrace,
    dmmTraceDt,
    dmmSkipFrac,
    linearAc
  );

  if (netChanged) {
    const nextBbV: Record<string, number> = {};
    if (netlist.bbNodeMap && Object.keys(netlist.bbNodeMap).length > 0) {
      const dcAll = solver.solveDC();
      for (const [bbStrip, mnaNode] of Object.entries(netlist.bbNodeMap)) {
        nextBbV[bbStrip] = mnaNode === netlist.groundNode ? 0 : (dcAll.nodeVoltages[mnaNode] ?? 0);
      }
    }
    cachedBbVoltages = nextBbV;
  }
  const bbNodeVoltages = cachedBbVoltages;

  const rawDmm = bench.dmm ? extractRawValue(bench.dmm.func, dm3058Meas) : 0;
  const fmtDmm = bench.dmm
    ? formatDM3058Reading(bench.dmm.func, rawDmm, bench.dmm.rangeIndex, bench.dmm.autoRange, 'S', false)
    : null;
  const dmmReadout = bench.dmm?.power && fmtDmm ? `${fmtDmm.text} ${fmtDmm.unit}` : 'OFF';

  const frame = dsp.processFrame(raw1, raw2, rawExt, acqDt, scope, {
    ch1IsComp: Boolean(ch1Meta.isProbeComp),
    ch2IsComp: Boolean(ch2Meta.isProbeComp),
    ch1CompTrim: ch1Meta.probeCompTrim,
    ch2CompTrim: ch2Meta.probeCompTrim,
    ch1PhysProbe: ch1Atten,
    ch2PhysProbe: ch2Atten,
    envelopeBurst: ytNeedsEnvelopeBurst,
  });

  return { type: 'sim_result', frame, faults, dmmReadout, dm3058Meas, bbNodeVoltages, ledCurrents };
}

interface WorkerPostContext {
  postMessage: (msg: unknown, transfer?: Transferable[]) => void;
  addEventListener: (type: 'message', listener: (ev: MessageEvent<WorkerRequest>) => void) => void;
}
if (typeof self !== 'undefined' && typeof (self as unknown as Partial<WorkerPostContext>).postMessage === 'function') {
  const ctx = self as unknown as WorkerPostContext;
  ctx.addEventListener('message', (ev: MessageEvent<WorkerRequest>) => {
    if (ev.data.type === 'sim_tick') {
      const res = runSimulationStep(ev.data.bench, ev.data.scope);
      const transfers: ArrayBuffer[] = [
        res.frame.ch1Samples.buffer as ArrayBuffer,
        res.frame.ch2Samples.buffer as ArrayBuffer,
        res.frame.mathSamples.buffer as ArrayBuffer,
      ];
      if (res.frame.fftBinsDb) transfers.push(res.frame.fftBinsDb.buffer as ArrayBuffer);
      ctx.postMessage(res, transfers);
    }
  });
}
