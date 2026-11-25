import type {
  ACSolution,
  CircuitComponent,
  CompiledNetlist,
  ComplexPhasor,
  DCSolution,
  FaultEvent,
  SignalGenModMode,
  TransientChunk,
  WaveformShape,
} from './types';

const GMIN = 1e-11;

export function evalFuncVoltage(
  waveform: WaveformShape,
  freqHz: number,
  amplitudePeak: number,
  dcOffset: number,
  dutyPct: number,
  t: number,
  phaseDeg = 0,
  inverted = false,
  modMode: SignalGenModMode = 'OFF',
  modFreqHz = 100,
  modDepthPct = 80
): number {
  if (amplitudePeak === 0) return dcOffset;
  const phaseOff = phaseDeg / 360;
  let instPhase = t * freqHz + phaseOff;
  let envScale = 1.0;

  if (modMode === 'AM') {
    const m = Math.min(1, Math.max(0, modDepthPct / 100));
    envScale = 1 - m * 0.5 * (1 - Math.sin(2 * Math.PI * modFreqHz * t));
  } else if (modMode === 'FM') {
    const devRatio = 0.28;
    instPhase = t * freqHz + phaseOff + (devRatio * freqHz / Math.max(1, modFreqHz * 2 * Math.PI)) * Math.sin(2 * Math.PI * modFreqHz * t);
  } else if (modMode === 'SWEEP') {
    // Periodic linear sweep from 0.5x to 2.0x center frequency
    const swPeriod = Math.max(1e-3, 1 / Math.max(1, modFreqHz * 0.5));
    const u = ((t % swPeriod) + swPeriod) % swPeriod / swPeriod;
    instPhase = freqHz * (0.5 * t + 0.75 * u * u * swPeriod) + phaseOff;
  } else if (modMode === 'BURST') {
    // 3-cycle N-cycle burst repeated every 6 cycles
    const cyc = ((t * freqHz) % 6 + 6) % 6;
    if (cyc >= 3) return dcOffset;
  }

  const phase = ((instPhase % 1) + 1) % 1;
  const duty = Math.min(0.98, Math.max(0.02, dutyPct / 100));
  let ac = 0;

  switch (waveform) {
    case 'sine':
      ac = amplitudePeak * Math.sin(2 * Math.PI * phase);
      break;
    case 'square':
      ac = phase < duty ? amplitudePeak : -amplitudePeak;
      break;
    case 'triangle': {
      // DG1012 Ramp with variable Symmetry (default 50% = symmetric triangle)
      const tri = phase < duty ? -1 + (2 * phase) / duty : 1 - (2 * (phase - duty)) / (1 - duty);
      ac = amplitudePeak * tri;
      break;
    }
    case 'noise': {
      // Deterministic broadband white noise (fast, reproducible across frames)
      const s = Math.sin(t * 98765.4321 + phaseOff * 19.7) * 43758.5453;
      const u = (s - Math.floor(s)) * 2 - 1;
      ac = amplitudePeak * u;
      break;
    }
    case 'arb': {
      // Built-in DG1012 Sinc/Cardiac-style arbitrary waveform
      const x = (phase - 0.5) * 6 * Math.PI;
      const sinc = Math.abs(x) < 1e-4 ? 1 : Math.sin(x) / x;
      ac = amplitudePeak * sinc;
      break;
    }
  }
  const signedAc = inverted ? -ac : ac;
  return dcOffset + signedAc * envScale;
}

function solveDenseReal(n: number, A: Float64Array, b: Float64Array, xOut: Float64Array): boolean {
  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let maxVal = Math.abs(A[col * n + col]);
    for (let row = col + 1; row < n; row++) {
      const val = Math.abs(A[row * n + col]);
      if (val > maxVal) {
        maxVal = val;
        pivotRow = row;
      }
    }
    if (maxVal < 1e-15) {
      return false;
    }
    if (pivotRow !== col) {
      const colOffset = col * n;
      const pivOffset = pivotRow * n;
      for (let k = col; k < n; k++) {
        const tmp = A[colOffset + k];
        A[colOffset + k] = A[pivOffset + k];
        A[pivOffset + k] = tmp;
      }
      const tmpB = b[col];
      b[col] = b[pivotRow];
      b[pivotRow] = tmpB;
    }

    const diag = A[col * n + col];
    const colOffset = col * n;
    for (let row = col + 1; row < n; row++) {
      const rowOffset = row * n;
      const factor = A[rowOffset + col] / diag;
      if (factor === 0) continue;
      A[rowOffset + col] = 0;
      for (let k = col + 1; k < n; k++) {
        A[rowOffset + k] -= factor * A[colOffset + k];
      }
      b[row] -= factor * b[col];
    }
  }

  for (let row = n - 1; row >= 0; row--) {
    let sum = b[row];
    const rowOffset = row * n;
    for (let k = row + 1; k < n; k++) {
      sum -= A[rowOffset + k] * xOut[k];
    }
    xOut[row] = sum / A[rowOffset + row];
  }
  return true;
}

function solveDenseComplex(
  n: number,
  Ar: Float64Array,
  Ai: Float64Array,
  br: Float64Array,
  bi: Float64Array,
  xr: Float64Array,
  xi: Float64Array
): boolean {
  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let maxMag = Ar[col * n + col] ** 2 + Ai[col * n + col] ** 2;
    for (let row = col + 1; row < n; row++) {
      const mag = Ar[row * n + col] ** 2 + Ai[row * n + col] ** 2;
      if (mag > maxMag) {
        maxMag = mag;
        pivotRow = row;
      }
    }
    if (maxMag < 1e-28) return false;

    if (pivotRow !== col) {
      const cOff = col * n;
      const pOff = pivotRow * n;
      for (let k = col; k < n; k++) {
        const tr = Ar[cOff + k];
        const ti = Ai[cOff + k];
        Ar[cOff + k] = Ar[pOff + k];
        Ai[cOff + k] = Ai[pOff + k];
        Ar[pOff + k] = tr;
        Ai[pOff + k] = ti;
      }
      const tbr = br[col];
      const tbi = bi[col];
      br[col] = br[pivotRow];
      bi[col] = bi[pivotRow];
      br[pivotRow] = tbr;
      bi[pivotRow] = tbi;
    }

    const dr = Ar[col * n + col];
    const di = Ai[col * n + col];
    const denom = dr * dr + di * di;
    const cOff = col * n;

    for (let row = col + 1; row < n; row++) {
      const rOff = row * n;
      const ar = Ar[rOff + col];
      const ai = Ai[rOff + col];
      if (ar === 0 && ai === 0) continue;
      const fr = (ar * dr + ai * di) / denom;
      const fi = (ai * dr - ar * di) / denom;
      Ar[rOff + col] = 0;
      Ai[rOff + col] = 0;
      for (let k = col + 1; k < n; k++) {
        const kr = Ar[cOff + k];
        const ki = Ai[cOff + k];
        Ar[rOff + k] -= fr * kr - fi * ki;
        Ai[rOff + k] -= fr * ki + fi * kr;
      }
      br[row] -= fr * br[col] - fi * bi[col];
      bi[row] -= fr * bi[col] + fi * br[col];
    }
  }

  for (let row = n - 1; row >= 0; row--) {
    let sr = br[row];
    let si = bi[row];
    const rOff = row * n;
    for (let k = row + 1; k < n; k++) {
      const kr = Ar[rOff + k];
      const ki = Ai[rOff + k];
      sr -= kr * xr[k] - ki * xi[k];
      si -= kr * xi[k] + ki * xr[k];
    }
    const dr = Ar[rOff + row];
    const di = Ai[rOff + row];
    const denom = dr * dr + di * di;
    xr[row] = (sr * dr + si * di) / denom;
    xi[row] = (si * dr - sr * di) / denom;
  }
  return true;
}

interface CompiledIndexed {
  nodeCount: number;
  nodeIndex: Map<string, number>;
  nodeNames: string[];
  vsourceCount: number; // voltage sources + inductors + vcvs branches
  resistors: Array<{ a: number; b: number; g: number; ohms: number; maxWatts: number; id: string }>;
  capacitors: Array<{ a: number; b: number; c: number; vPrev: number; iPrev: number }>;
  inductors: Array<{ a: number; b: number; l: number; vPrev: number; iPrev: number; branchIdx: number }>;
  vsources: Array<{
    id: string;
    pos: number;
    neg: number;
    branchIdx: number;
    kind: 'dc' | 'func';
    volts: number;
    currentLimitAmps?: number;
    waveform?: WaveformShape;
    freqHz?: number;
    amplitudePeak?: number;
    dcOffset?: number;
    dutyPct?: number;
    phaseDeg?: number;
    inverted?: boolean;
    modMode?: SignalGenModMode;
    modFreqHz?: number;
    modDepthPct?: number;
  }>;
  vcvss: Array<{
    id: string;
    outPos: number;
    outNeg: number;
    ctrlPos: number;
    ctrlNeg: number;
    gain: number;
    vSat?: number;
    branchIdx: number;
  }>;
  diodes: Array<{
    id: string;
    a: number;
    b: number;
    vf: number;
    rOn: number;
    vz?: number;
    isLed?: boolean;
  }>;
  npns: Array<{
    id: string;
    c: number;
    b: number;
    e: number;
    beta: number;
    vbeOn: number;
    vceSat: number;
    rBe: number;
  }>;
}

type DiodeRegion = 'off' | 'fwd' | 'rev';
type NpnRegion = 'off' | 'active' | 'sat';

export class CircuitMNASolver {
  private netlist: CompiledNetlist | null = null;
  private idx: CompiledIndexed | null = null;
  private simTime = 0;
  private stepCount = 0;
  private diodeRegions: DiodeRegion[] = [];
  private npnRegions: NpnRegion[] = [];
  private lastDiodeCurrents: Record<string, number> = {};

  compile(netlist: CompiledNetlist): void {
    this.netlist = netlist;
    const nodeIndex = new Map<string, number>();
    nodeIndex.set(netlist.groundNode, -1);

    const nonGroundNames: string[] = [];
    const ensureNode = (name: string): number => {
      const existing = nodeIndex.get(name);
      if (existing !== undefined) return existing;
      const newIdx = nonGroundNames.length;
      nonGroundNames.push(name);
      nodeIndex.set(name, newIdx);
      return newIdx;
    };

    for (const n of netlist.nodeNames) {
      if (n !== netlist.groundNode) ensureNode(n);
    }

    const resistors: CompiledIndexed['resistors'] = [];
    const capacitors: CompiledIndexed['capacitors'] = [];
    const inductors: CompiledIndexed['inductors'] = [];
    const vsources: CompiledIndexed['vsources'] = [];
    const vcvss: CompiledIndexed['vcvss'] = [];
    const diodes: CompiledIndexed['diodes'] = [];
    const npns: CompiledIndexed['npns'] = [];

    let branchIdx = 0;
    for (const comp of netlist.components) {
      if (comp.kind === 'resistor') {
        const a = ensureNode(comp.nodeA);
        const b = ensureNode(comp.nodeB);
        const r = Math.max(1e-6, comp.ohms);
        resistors.push({ id: comp.id, a, b, g: 1 / r, ohms: r, maxWatts: comp.maxWatts ?? 0.25 });
      } else if (comp.kind === 'capacitor') {
        const a = ensureNode(comp.nodeA);
        const b = ensureNode(comp.nodeB);
        capacitors.push({ a, b, c: comp.farads, vPrev: 0, iPrev: 0 });
      } else if (comp.kind === 'inductor') {
        const a = ensureNode(comp.nodeA);
        const b = ensureNode(comp.nodeB);
        inductors.push({ a, b, l: comp.henrys, vPrev: 0, iPrev: 0, branchIdx: branchIdx++ });
      } else if (comp.kind === 'vsource_dc') {
        const pos = ensureNode(comp.nodePos);
        const neg = ensureNode(comp.nodeNeg);
        vsources.push({
          id: comp.id,
          pos,
          neg,
          branchIdx: branchIdx++,
          kind: 'dc',
          volts: comp.volts,
          currentLimitAmps: comp.currentLimitAmps,
        });
      } else if (comp.kind === 'vsource_func') {
        const pos = ensureNode(comp.nodePos);
        const neg = ensureNode(comp.nodeNeg);
        vsources.push({
          id: comp.id,
          pos,
          neg,
          branchIdx: branchIdx++,
          kind: 'func',
          volts: comp.dcOffset,
          waveform: comp.waveform,
          freqHz: comp.freqHz,
          amplitudePeak: comp.amplitudePeak,
          dcOffset: comp.dcOffset,
          dutyPct: comp.dutyPct,
          phaseDeg: comp.phaseDeg,
          inverted: comp.inverted,
          modMode: comp.modMode,
          modFreqHz: comp.modFreqHz,
          modDepthPct: comp.modDepthPct,
        });
      } else if (comp.kind === 'vcvs') {
        vcvss.push({
          id: comp.id,
          outPos: ensureNode(comp.nodeOutPos),
          outNeg: ensureNode(comp.nodeOutNeg),
          ctrlPos: ensureNode(comp.nodeCtrlPos),
          ctrlNeg: ensureNode(comp.nodeCtrlNeg),
          gain: comp.gain,
          vSat: comp.vSat,
          branchIdx: branchIdx++,
        });
      } else if (comp.kind === 'diode') {
        diodes.push({
          id: comp.id,
          a: ensureNode(comp.nodeAnode),
          b: ensureNode(comp.nodeCathode),
          vf: comp.vf ?? 0.7,
          rOn: Math.max(8, comp.rOn ?? 15),
          vz: comp.vz,
          isLed: comp.isLed,
        });
      } else if (comp.kind === 'npn') {
        npns.push({
          id: comp.id,
          c: ensureNode(comp.nodeC),
          b: ensureNode(comp.nodeB),
          e: ensureNode(comp.nodeE),
          beta: comp.beta ?? 80,
          vbeOn: comp.vbeOn ?? 0.7,
          vceSat: comp.vceSat ?? 0.2,
          rBe: Math.max(20, comp.rBe ?? 200),
        });
      }
    }

    this.idx = {
      nodeCount: nonGroundNames.length,
      nodeIndex,
      nodeNames: nonGroundNames,
      vsourceCount: branchIdx,
      resistors,
      capacitors,
      inductors,
      vsources,
      vcvss,
      diodes,
      npns,
    };
    this.simTime = 0;
    this.stepCount = 0;
    this.diodeRegions = diodes.map(() => 'off');
    this.npnRegions = npns.map(() => 'off');
    this.lastDiodeCurrents = {};
  }

  resetTransientState(): void {
    this.simTime = 0;
    this.stepCount = 0;
    this.diodeRegions = this.idx ? this.idx.diodes.map(() => 'off') : [];
    this.npnRegions = this.idx ? this.idx.npns.map(() => 'off') : [];
    if (!this.idx) return;
    for (const cap of this.idx.capacitors) {
      cap.vPrev = 0;
      cap.iPrev = 0;
    }
    for (const ind of this.idx.inductors) {
      ind.vPrev = 0;
      ind.iPrev = 0;
    }
  }

  getLastDiodeCurrents(): Record<string, number> {
    return { ...this.lastDiodeCurrents };
  }

  private getVal(x: Float64Array, nodeIdx: number): number {
    return nodeIdx < 0 ? 0 : x[nodeIdx];
  }

  private stampConductance(A: Float64Array, size: number, a: number, b: number, g: number): void {
    if (a >= 0) A[a * size + a] += g;
    if (b >= 0) A[b * size + b] += g;
    if (a >= 0 && b >= 0) {
      A[a * size + b] -= g;
      A[b * size + a] -= g;
    }
  }

  private stampCurrentSource(rhs: Float64Array, a: number, b: number, currentAtoB: number): void {
    if (a >= 0) rhs[a] -= currentAtoB;
    if (b >= 0) rhs[b] += currentAtoB;
  }

  private stampVcvsRow(
    A: Float64Array,
    rhs: Float64Array,
    size: number,
    nodeCount: number,
    v: CompiledIndexed['vcvss'][number],
    satVolts: number | null
  ): void {
    const k = nodeCount + v.branchIdx;
    if (v.outPos >= 0) {
      A[v.outPos * size + k] += 1;
      A[k * size + v.outPos] += 1;
    }
    if (v.outNeg >= 0) {
      A[v.outNeg * size + k] -= 1;
      A[k * size + v.outNeg] -= 1;
    }
    if (satVolts === null) {
      if (v.ctrlPos >= 0) A[k * size + v.ctrlPos] -= v.gain;
      if (v.ctrlNeg >= 0) A[k * size + v.ctrlNeg] += v.gain;
    } else {
      rhs[k] = satVolts;
    }
  }

  private stampDiodes(
    A: Float64Array,
    rhs: Float64Array,
    size: number,
    diodes: CompiledIndexed['diodes']
  ): void {
    for (let i = 0; i < diodes.length; i++) {
      const d = diodes[i];
      const reg = this.diodeRegions[i] ?? 'off';
      if (reg === 'fwd') {
        const g = 1 / d.rOn;
        this.stampConductance(A, size, d.a, d.b, g);
        this.stampCurrentSource(rhs, d.a, d.b, -g * d.vf);
      } else if (reg === 'rev' && d.vz !== undefined) {
        const g = 1 / d.rOn;
        this.stampConductance(A, size, d.a, d.b, g);
        this.stampCurrentSource(rhs, d.a, d.b, g * d.vz);
      } else {
        this.stampConductance(A, size, d.a, d.b, 1e-8);
      }
    }
  }

  private updateDiodeRegionsFromX(x: Float64Array, diodes: CompiledIndexed['diodes']): boolean {
    let changed = false;
    for (let i = 0; i < diodes.length; i++) {
      const d = diodes[i];
      const vD = this.getVal(x, d.a) - this.getVal(x, d.b);
      let next: DiodeRegion = 'off';
      if (vD > d.vf) next = 'fwd';
      else if (d.vz !== undefined && vD < -d.vz) next = 'rev';
      if (next !== this.diodeRegions[i]) {
        this.diodeRegions[i] = next;
        changed = true;
      }
    }
    return changed;
  }

  private recordDiodeCurrents(x: Float64Array, diodes: CompiledIndexed['diodes']): void {
    for (let i = 0; i < diodes.length; i++) {
      const d = diodes[i];
      const vD = this.getVal(x, d.a) - this.getVal(x, d.b);
      const reg = this.diodeRegions[i];
      let cur = vD * 1e-8;
      if (reg === 'fwd') cur = (vD - d.vf) / d.rOn;
      else if (reg === 'rev' && d.vz !== undefined) cur = (vD + d.vz) / d.rOn;
      this.lastDiodeCurrents[d.id] = cur;
    }
  }

  private stampNpns(
    A: Float64Array,
    rhs: Float64Array,
    size: number,
    npns: CompiledIndexed['npns']
  ): void {
    for (let i = 0; i < npns.length; i++) {
      const q = npns[i];
      const reg = this.npnRegions[i] ?? 'off';
      if (reg === 'active') {
        const gBe = 1 / q.rBe;
        this.stampConductance(A, size, q.b, q.e, gBe);
        this.stampCurrentSource(rhs, q.b, q.e, -gBe * q.vbeOn);
        // Collector current I_C = beta * I_B = gm*(Vb - Ve) - gm*vbeOn from c -> e
        const gm = q.beta * gBe;
        if (q.c >= 0 && q.b >= 0) A[q.c * size + q.b] += gm;
        if (q.c >= 0 && q.e >= 0) A[q.c * size + q.e] -= gm;
        if (q.e >= 0 && q.b >= 0) A[q.e * size + q.b] -= gm;
        if (q.e >= 0 && q.e >= 0) A[q.e * size + q.e] += gm;
        this.stampCurrentSource(rhs, q.c, q.e, -gm * q.vbeOn);
        this.stampConductance(A, size, q.c, q.e, 1e-6); // 1MΩ Early output impedance
      } else if (reg === 'sat') {
        const gBe = 1 / q.rBe;
        this.stampConductance(A, size, q.b, q.e, gBe);
        this.stampCurrentSource(rhs, q.b, q.e, -gBe * q.vbeOn);
        const gSat = 1 / 15;
        this.stampConductance(A, size, q.c, q.e, gSat);
        this.stampCurrentSource(rhs, q.c, q.e, -gSat * q.vceSat);
      } else {
        this.stampConductance(A, size, q.b, q.e, 1e-8);
        this.stampConductance(A, size, q.c, q.e, 1e-8);
      }
    }
  }

  private updateNpnRegionsFromX(x: Float64Array, npns: CompiledIndexed['npns']): boolean {
    let changed = false;
    for (let i = 0; i < npns.length; i++) {
      const q = npns[i];
      const vB = this.getVal(x, q.b);
      const vE = this.getVal(x, q.e);
      const vC = this.getVal(x, q.c);
      const vBE = vB - vE;
      const vCE = vC - vE;
      const prev = this.npnRegions[i] ?? 'off';
      let next: NpnRegion = 'off';
      if (vBE > q.vbeOn) {
        if (prev === 'sat') {
          const iB = (vBE - q.vbeOn) / q.rBe;
          const iC = (vCE - q.vceSat) / 15;
          next = vCE > q.vceSat && iC > q.beta * iB ? 'active' : 'sat';
        } else {
          next = vCE <= q.vceSat ? 'sat' : 'active';
        }
      }
      if (next !== prev) {
        this.npnRegions[i] = next;
        changed = true;
      }
    }
    return changed;
  }

  private updateVcvsSatsFromX(
    x: Float64Array,
    vcvss: CompiledIndexed['vcvss'],
    vcvsSats: Array<number | null>
  ): boolean {
    let changed = false;
    for (let i = 0; i < vcvss.length; i++) {
      const v = vcvss[i];
      if (v.vSat === undefined) continue;
      const vDiff = this.getVal(x, v.ctrlPos) - this.getVal(x, v.ctrlNeg);
      if (vcvsSats[i] === null) {
        const vOut = this.getVal(x, v.outPos) - this.getVal(x, v.outNeg);
        if (Math.abs(vOut) > v.vSat) {
          vcvsSats[i] = Math.sign(vOut) * v.vSat;
          changed = true;
        }
      } else {
        const satSign = Math.sign(vcvsSats[i]!);
        if (vDiff * v.gain * satSign < v.vSat) {
          vcvsSats[i] = null;
          changed = true;
        }
      }
    }
    return changed;
  }

  private dcSourceMeanVolts(vs: CompiledIndexed['vsources'][number]): number {
    if (vs.kind === 'dc') return vs.volts;
    const base = vs.dcOffset ?? 0;
    if (vs.waveform === 'square') {
      const duty = Math.min(0.98, Math.max(0.02, (vs.dutyPct ?? 50) / 100));
      const amp = (vs.inverted ? -1 : 1) * (vs.amplitudePeak ?? 0);
      return base + amp * (2 * duty - 1);
    }
    return base;
  }

  private solveDCVector(): Float64Array | null {
    if (!this.idx || !this.netlist) return null;
    const { nodeCount, vsourceCount, resistors, vsources, inductors, vcvss, diodes, npns } = this.idx;
    const size = nodeCount + vsourceCount;
    if (size === 0) return new Float64Array(0);

    const A = new Float64Array(size * size);
    const b = new Float64Array(size);
    const x = new Float64Array(size);
    const vcvsSats: Array<number | null> = vcvss.map(() => null);

    const maxIters =
      diodes.length > 0 || npns.length > 0 || vcvss.some((v) => v.vSat !== undefined) ? 12 : 1;
    for (let iter = 0; iter < maxIters; iter++) {
      A.fill(0);
      b.fill(0);
      for (let i = 0; i < nodeCount; i++) A[i * size + i] += GMIN;
      for (const r of resistors) this.stampConductance(A, size, r.a, r.b, r.g);
      for (const ind of inductors) {
        const k = nodeCount + ind.branchIdx;
        if (ind.a >= 0) {
          A[ind.a * size + k] += 1;
          A[k * size + ind.a] += 1;
        }
        if (ind.b >= 0) {
          A[ind.b * size + k] -= 1;
          A[k * size + ind.b] -= 1;
        }
        A[k * size + k] -= 1e-9;
      }
      for (const vs of vsources) {
        const k = nodeCount + vs.branchIdx;
        if (vs.pos >= 0) {
          A[vs.pos * size + k] += 1;
          A[k * size + vs.pos] += 1;
        }
        if (vs.neg >= 0) {
          A[vs.neg * size + k] -= 1;
          A[k * size + vs.neg] -= 1;
        }
        b[k] = this.dcSourceMeanVolts(vs);
      }
      vcvss.forEach((v, i) => this.stampVcvsRow(A, b, size, nodeCount, v, vcvsSats[i]));
      if (diodes.length > 0) this.stampDiodes(A, b, size, diodes);
      if (npns.length > 0) this.stampNpns(A, b, size, npns);

      solveDenseReal(size, A, b, x);

      const dChanged = diodes.length > 0 ? this.updateDiodeRegionsFromX(x, diodes) : false;
      const qChanged = npns.length > 0 ? this.updateNpnRegionsFromX(x, npns) : false;
      const vChanged = this.updateVcvsSatsFromX(x, vcvss, vcvsSats);
      if (!dChanged && !qChanged && !vChanged) break;
    }

    if (diodes.length > 0) this.recordDiodeCurrents(x, diodes);
    return x;
  }

  solveDC(): DCSolution {
    if (!this.idx || !this.netlist) {
      return { nodeVoltages: {}, sourceCurrents: {}, faults: [] };
    }
    const { nodeCount, vsourceCount, resistors, vsources, nodeNames } = this.idx;
    if (nodeCount + vsourceCount === 0) {
      return { nodeVoltages: { [this.netlist.groundNode]: 0 }, sourceCurrents: {}, faults: [] };
    }
    const x = this.solveDCVector()!;

    const nodeVoltages: Record<string, number> = { [this.netlist.groundNode]: 0 };
    for (let i = 0; i < nodeCount; i++) {
      nodeVoltages[nodeNames[i]] = x[i];
    }

    const sourceCurrents: Record<string, number> = {};
    const faults: FaultEvent[] = [];

    for (const vs of vsources) {
      const iBranch = -x[nodeCount + vs.branchIdx];
      sourceCurrents[vs.id] = iBranch;
      if (vs.currentLimitAmps !== undefined && Math.abs(iBranch) > vs.currentLimitAmps * 1.05) {
        faults.push({
          code: 'short_circuit',
          sourceId: vs.id,
          message: `Short circuit (${Math.abs(iBranch).toFixed(2)} A)`,
          magnitude: Math.abs(iBranch),
        });
      }
    }

    for (const r of resistors) {
      const va = this.getVal(x, r.a);
      const vb = this.getVal(x, r.b);
      const watts = ((va - vb) * (va - vb)) / r.ohms;
      if (watts > r.maxWatts && r.ohms < 1e5) {
        faults.push({
          code: 'overpower',
          sourceId: r.id,
          message: `Overpower (${watts.toFixed(2)} W)`,
          magnitude: watts,
        });
      }
    }

    return { nodeVoltages, sourceCurrents, faults };
  }

  private solveACVectors(
    freqHz: number,
    onlyFreqHz?: number
  ): { xr: Float64Array; xi: Float64Array } | null {
    if (!this.idx || !this.netlist) return null;
    const { nodeCount, vsourceCount, resistors, capacitors, inductors, vsources, vcvss, diodes, npns } = this.idx;
    const size = nodeCount + vsourceCount;
    if (size === 0) return { xr: new Float64Array(0), xi: new Float64Array(0) };

    const omega = 2 * Math.PI * freqHz;
    const Ar = new Float64Array(size * size);
    const Ai = new Float64Array(size * size);
    const br = new Float64Array(size);
    const bi = new Float64Array(size);
    const xr = new Float64Array(size);
    const xi = new Float64Array(size);

    for (let i = 0; i < nodeCount; i++) {
      Ar[i * size + i] += GMIN;
    }

    for (const r of resistors) {
      this.stampConductance(Ar, size, r.a, r.b, r.g);
    }

    for (const d of diodes) {
      this.stampConductance(Ar, size, d.a, d.b, 1e-8);
    }

    for (const q of npns) {
      this.stampConductance(Ar, size, q.b, q.e, 1e-8);
      this.stampConductance(Ar, size, q.c, q.e, 1e-8);
    }

    for (const cap of capacitors) {
      const bImag = omega * cap.c;
      if (cap.a >= 0) Ai[cap.a * size + cap.a] += bImag;
      if (cap.b >= 0) Ai[cap.b * size + cap.b] += bImag;
      if (cap.a >= 0 && cap.b >= 0) {
        Ai[cap.a * size + cap.b] -= bImag;
        Ai[cap.b * size + cap.a] -= bImag;
      }
    }

    for (const ind of inductors) {
      const k = nodeCount + ind.branchIdx;
      if (ind.a >= 0) {
        Ar[ind.a * size + k] += 1;
        Ar[k * size + ind.a] += 1;
      }
      if (ind.b >= 0) {
        Ar[ind.b * size + k] -= 1;
        Ar[k * size + ind.b] -= 1;
      }
      // Inductor V = j*w*L * I => V_a - V_b - j*w*L*I_k = 0
      Ai[k * size + k] -= omega * ind.l;
    }

    for (const vs of vsources) {
      const k = nodeCount + vs.branchIdx;
      if (vs.pos >= 0) {
        Ar[vs.pos * size + k] += 1;
        Ar[k * size + vs.pos] += 1;
      }
      if (vs.neg >= 0) {
        Ar[vs.neg * size + k] -= 1;
        Ar[k * size + vs.neg] -= 1;
      }
      const freqMatch =
        onlyFreqHz === undefined ||
        Math.abs((vs.freqHz ?? 0) - onlyFreqHz) <= Math.max(1e-3, onlyFreqHz * 1e-4);
      if (vs.kind === 'func' && freqMatch) {
        const amp = (vs.inverted ? -1 : 1) * (vs.amplitudePeak ?? 0);
        const phiRad = ((vs.phaseDeg ?? 0) * Math.PI) / 180;
        br[k] = amp * Math.cos(phiRad);
        bi[k] = amp * Math.sin(phiRad);
      }
    }

    for (const v of vcvss) {
      const k = nodeCount + v.branchIdx;
      if (v.outPos >= 0) {
        Ar[v.outPos * size + k] += 1;
        Ar[k * size + v.outPos] += 1;
      }
      if (v.outNeg >= 0) {
        Ar[v.outNeg * size + k] -= 1;
        Ar[k * size + v.outNeg] -= 1;
      }
      if (v.ctrlPos >= 0) Ar[k * size + v.ctrlPos] -= v.gain;
      if (v.ctrlNeg >= 0) Ar[k * size + v.ctrlNeg] += v.gain;
    }

    solveDenseComplex(size, Ar, Ai, br, bi, xr, xi);
    return { xr, xi };
  }

  solveAC(freqHz: number, onlyFreqHz?: number): ACSolution {
    if (!this.idx || !this.netlist) {
      return { freqHz, nodePhasors: {} };
    }
    const { nodeCount, nodeNames } = this.idx;
    const nodePhasors: Record<string, ComplexPhasor> = {
      [this.netlist.groundNode]: { re: 0, im: 0, mag: 0, phaseRad: 0 },
    };
    const res = this.solveACVectors(freqHz, onlyFreqHz);
    if (!res) return { freqHz, nodePhasors };

    for (let i = 0; i < nodeCount; i++) {
      const re = res.xr[i];
      const im = res.xi[i];
      nodePhasors[nodeNames[i]] = {
        re,
        im,
        mag: Math.hypot(re, im),
        phaseRad: Math.atan2(im, re),
      };
    }

    return { freqHz, nodePhasors };
  }

  initDCState(): void {
    this.resetTransientState();
    if (!this.idx) return;
    const xDc = this.solveDCVector();
    if (!xDc || xDc.length === 0) return;
    const { nodeCount, capacitors, inductors } = this.idx;
    for (const cap of capacitors) {
      cap.vPrev = this.getVal(xDc, cap.a) - this.getVal(xDc, cap.b);
      cap.iPrev = 0;
    }
    for (const ind of inductors) {
      ind.vPrev = 0;
      ind.iPrev = xDc[nodeCount + ind.branchIdx] ?? 0;
    }
    this.simTime = 0;
    this.stepCount = 1;
  }

  /**
   * Checks whether all active functional sources are pure unmodulated sinusoids and no diode, NPN, or
   * op-amp conducts/clips. If strictly linear, initializes exact periodic steady-state at t=0 so
   * high-Q RLC resonance and X-Y Lissajous circuits have zero startup transient at any Time/Div.
   */
  initSineSteadyState(): boolean {
    if (!this.idx) return false;
    const { nodeCount, capacitors, inductors, vsources, vcvss, diodes, npns } = this.idx;

    const activeFreqs: number[] = [];
    for (const vs of vsources) {
      if (vs.kind !== 'func' || !vs.amplitudePeak) continue;
      if (vs.waveform !== 'sine' || (vs.modMode && vs.modMode !== 'OFF')) return false;
      const f = vs.freqHz ?? 0;
      if (f > 0 && !activeFreqs.some((ef) => Math.abs(ef - f) <= Math.max(1e-3, f * 1e-4))) {
        activeFreqs.push(f);
      }
    }
    if (activeFreqs.length === 0) {
      this.initDCState();
      return true;
    }

    this.resetTransientState();
    const xDc = this.solveDCVector();
    if (!xDc) return false;

    const vcvsPeakAccum = vcvss.map((v) =>
      Math.abs(this.getVal(xDc, v.outPos) - this.getVal(xDc, v.outNeg))
    );
    const diodeDc = diodes.map((d) => this.getVal(xDc, d.a) - this.getVal(xDc, d.b));
    const diodeAcPeak = diodes.map(() => 0);
    const npnVbeDc = npns.map((q) => this.getVal(xDc, q.b) - this.getVal(xDc, q.e));
    const npnVbeAcPeak = npns.map(() => 0);

    for (const cap of capacitors) {
      cap.vPrev = this.getVal(xDc, cap.a) - this.getVal(xDc, cap.b);
      cap.iPrev = 0;
    }
    for (const ind of inductors) {
      ind.vPrev = 0;
      ind.iPrev = xDc[nodeCount + ind.branchIdx] ?? 0;
    }

    for (const f of activeFreqs) {
      const omega = 2 * Math.PI * f;
      const ac = this.solveACVectors(f, f);
      if (!ac) continue;
      const { xr, xi } = ac;

      for (let i = 0; i < vcvss.length; i++) {
        const v = vcvss[i];
        const vr = this.getVal(xr, v.outPos) - this.getVal(xr, v.outNeg);
        const vi = this.getVal(xi, v.outPos) - this.getVal(xi, v.outNeg);
        vcvsPeakAccum[i] += Math.hypot(vr, vi);
      }
      for (let i = 0; i < diodes.length; i++) {
        const d = diodes[i];
        const vr = this.getVal(xr, d.a) - this.getVal(xr, d.b);
        const vi = this.getVal(xi, d.a) - this.getVal(xi, d.b);
        diodeAcPeak[i] += Math.hypot(vr, vi);
      }
      for (let i = 0; i < npns.length; i++) {
        const q = npns[i];
        const vr = this.getVal(xr, q.b) - this.getVal(xr, q.e);
        const vi = this.getVal(xi, q.b) - this.getVal(xi, q.e);
        npnVbeAcPeak[i] += Math.hypot(vr, vi);
      }

      // Time-domain convention: v(t) = Im(V_phasor * e^{j*w*t})
      for (const cap of capacitors) {
        const vr = this.getVal(xr, cap.a) - this.getVal(xr, cap.b);
        const vi = this.getVal(xi, cap.a) - this.getVal(xi, cap.b);
        cap.vPrev += vi;
        cap.iPrev += omega * cap.c * vr;
      }
      for (const ind of inductors) {
        const vi = this.getVal(xi, ind.a) - this.getVal(xi, ind.b);
        const iIm = xi[nodeCount + ind.branchIdx] ?? 0;
        ind.vPrev += vi;
        ind.iPrev += iIm;
      }
    }

    for (let i = 0; i < diodes.length; i++) {
      const d = diodes[i];
      if (diodeDc[i] + diodeAcPeak[i] >= d.vf * 0.85) {
        this.resetTransientState();
        return false;
      }
      if (d.vz !== undefined && diodeDc[i] - diodeAcPeak[i] <= -d.vz * 0.85) {
        this.resetTransientState();
        return false;
      }
    }
    for (let i = 0; i < npns.length; i++) {
      if (npnVbeDc[i] + npnVbeAcPeak[i] >= npns[i].vbeOn * 0.85) {
        this.resetTransientState();
        return false;
      }
    }
    for (let i = 0; i < vcvss.length; i++) {
      const sat = vcvss[i].vSat;
      if (sat !== undefined && vcvsPeakAccum[i] > sat * 0.98) {
        this.resetTransientState();
        return false;
      }
    }

    this.simTime = 0;
    this.stepCount = 1;
    return true;
  }

  /**
   * Computes exact phasor True-RMS AC voltage/current and dominant frequency for linear sinusoidal
   * circuits (eliminating Nyquist aliasing on high-frequency RLC resonance and slow-frequency 50Hz).
   */
  solveLinearACSummary(
    posNode: string,
    comNode: string,
    currNode: string,
    shuntOhms: number
  ): { linear: boolean; vacRms: number; iacRms: number; freqHz: number } {
    if (!this.idx) return { linear: false, vacRms: 0, iacRms: 0, freqHz: 0 };
    const { nodeIndex, vsources, vcvss, diodes, npns } = this.idx;

    const activeFreqs: number[] = [];
    for (const vs of vsources) {
      if (vs.kind !== 'func' || !vs.amplitudePeak) continue;
      if (vs.waveform !== 'sine' || (vs.modMode && vs.modMode !== 'OFF')) {
        return { linear: false, vacRms: 0, iacRms: 0, freqHz: 0 };
      }
      const f = vs.freqHz ?? 0;
      if (f > 0 && !activeFreqs.some((ef) => Math.abs(ef - f) <= Math.max(1e-3, f * 1e-4))) {
        activeFreqs.push(f);
      }
    }
    if (activeFreqs.length === 0) {
      return { linear: true, vacRms: 0, iacRms: 0, freqHz: 0 };
    }

    const xDc = this.solveDCVector();
    if (!xDc) return { linear: false, vacRms: 0, iacRms: 0, freqHz: 0 };

    const vcvsPeak = vcvss.map((v) => Math.abs(this.getVal(xDc, v.outPos) - this.getVal(xDc, v.outNeg)));
    const diodeDc = diodes.map((d) => this.getVal(xDc, d.a) - this.getVal(xDc, d.b));
    const diodeAc = diodes.map(() => 0);
    const npnDc = npns.map((q) => this.getVal(xDc, q.b) - this.getVal(xDc, q.e));
    const npnAc = npns.map(() => 0);

    const pIdx = nodeIndex.get(posNode) ?? -1;
    const cIdx = nodeIndex.get(comNode) ?? -1;
    const iIdx = nodeIndex.get(currNode) ?? -1;
    let vacRmsSq = 0;
    let iacRmsSq = 0;
    let maxVMag = 0;
    let dominantFreqHz = 0;

    for (const f of activeFreqs) {
      const ac = this.solveACVectors(f, f);
      if (!ac) continue;
      const { xr, xi } = ac;

      for (let i = 0; i < vcvss.length; i++) {
        const v = vcvss[i];
        vcvsPeak[i] += Math.hypot(
          this.getVal(xr, v.outPos) - this.getVal(xr, v.outNeg),
          this.getVal(xi, v.outPos) - this.getVal(xi, v.outNeg)
        );
      }
      for (let i = 0; i < diodes.length; i++) {
        const d = diodes[i];
        diodeAc[i] += Math.hypot(
          this.getVal(xr, d.a) - this.getVal(xr, d.b),
          this.getVal(xi, d.a) - this.getVal(xi, d.b)
        );
      }
      for (let i = 0; i < npns.length; i++) {
        const q = npns[i];
        npnAc[i] += Math.hypot(
          this.getVal(xr, q.b) - this.getVal(xr, q.e),
          this.getVal(xi, q.b) - this.getVal(xi, q.e)
        );
      }

      const vMag = Math.hypot(
        this.getVal(xr, pIdx) - this.getVal(xr, cIdx),
        this.getVal(xi, pIdx) - this.getVal(xi, cIdx)
      );
      vacRmsSq += 0.5 * vMag * vMag;
      if (vMag > maxVMag) {
        maxVMag = vMag;
        dominantFreqHz = f;
      }

      const iMag =
        Math.hypot(
          this.getVal(xr, iIdx) - this.getVal(xr, cIdx),
          this.getVal(xi, iIdx) - this.getVal(xi, cIdx)
        ) / Math.max(1e-3, shuntOhms);
      iacRmsSq += 0.5 * iMag * iMag;
    }

    for (let i = 0; i < diodes.length; i++) {
      const d = diodes[i];
      if (diodeDc[i] + diodeAc[i] >= d.vf * 0.85) return { linear: false, vacRms: 0, iacRms: 0, freqHz: 0 };
      if (d.vz !== undefined && diodeDc[i] - diodeAc[i] <= -d.vz * 0.85) {
        return { linear: false, vacRms: 0, iacRms: 0, freqHz: 0 };
      }
    }
    for (let i = 0; i < npns.length; i++) {
      if (npnDc[i] + npnAc[i] >= npns[i].vbeOn * 0.85) return { linear: false, vacRms: 0, iacRms: 0, freqHz: 0 };
    }
    for (let i = 0; i < vcvss.length; i++) {
      const sat = vcvss[i].vSat;
      if (sat !== undefined && vcvsPeak[i] > sat * 0.98) return { linear: false, vacRms: 0, iacRms: 0, freqHz: 0 };
    }

    return {
      linear: true,
      vacRms: Math.sqrt(vacRmsSq),
      iacRms: Math.sqrt(iacRmsSq),
      freqHz: maxVMag > 5e-4 ? dominantFreqHz : 0,
    };
  }

  stepTransient(durationSec: number, dtSec: number, probeNodes: string[]): TransientChunk {
    const sampleCount = Math.max(1, Math.round(durationSec / dtSec));
    const nodeVoltages: Record<string, Float32Array> = {};
    for (const p of probeNodes) {
      nodeVoltages[p] = new Float32Array(sampleCount);
    }

    if (!this.idx || !this.netlist) {
      return { dt: dtSec, startTime: this.simTime, sampleCount, nodeVoltages, faults: [] };
    }

    const startTime = this.simTime;
    const { nodeCount, vsourceCount, resistors, capacitors, inductors, vsources, vcvss, diodes, npns, nodeIndex } =
      this.idx;
    const size = nodeCount + vsourceCount;
    if (size === 0) {
      this.simTime += sampleCount * dtSec;
      return { dt: dtSec, startTime, sampleCount, nodeVoltages, faults: [] };
    }

    const baseA = new Float64Array(size * size);
    const rhs = new Float64Array(size);
    const x = new Float64Array(size);
    const xPeak = new Float64Array(size);
    const workA = new Float64Array(size * size);
    const probeIndices = probeNodes.map((n) => nodeIndex.get(n) ?? -1);
    const faults: FaultEvent[] = [];
    let shortDetected = false;

    const hasNonlinear = diodes.length > 0 || npns.length > 0 || vcvss.some((v) => v.vSat !== undefined);
    const hasReactive = capacitors.length > 0 || inductors.length > 0;
    let stampedBE: boolean | null = null;
    let stampedDt = -1;

    const ensureLinearBase = (useBE: boolean, stepDt: number) => {
      if (stampedBE === useBE && stampedDt === stepDt) return;
      stampedBE = useBE;
      stampedDt = stepDt;
      baseA.fill(0);
      for (let i = 0; i < nodeCount; i++) {
        baseA[i * size + i] += GMIN;
      }
      for (const r of resistors) {
        this.stampConductance(baseA, size, r.a, r.b, r.g);
      }
      for (const cap of capacitors) {
        const gEq = useBE ? cap.c / stepDt : (2 * cap.c) / stepDt;
        this.stampConductance(baseA, size, cap.a, cap.b, gEq);
      }
      for (const ind of inductors) {
        const gEq = useBE ? stepDt / ind.l : stepDt / (2 * ind.l);
        this.stampConductance(baseA, size, ind.a, ind.b, gEq);
        // ponytail: keep compile()-allocated inductor branch row non-singular for Norton companion solve
        const k = nodeCount + ind.branchIdx;
        baseA[k * size + k] = 1;
      }
      for (const vs of vsources) {
        const k = nodeCount + vs.branchIdx;
        if (vs.pos >= 0) {
          baseA[vs.pos * size + k] += 1;
          baseA[k * size + vs.pos] += 1;
        }
        if (vs.neg >= 0) {
          baseA[vs.neg * size + k] -= 1;
          baseA[k * size + vs.neg] -= 1;
        }
      }
      if (!hasNonlinear) {
        for (const v of vcvss) {
          this.stampVcvsRow(baseA, rhs, size, nodeCount, v, null);
        }
      }
    };

    const evalSourcesAt = (tEval: number, outVolts: Float64Array) => {
      for (let i = 0; i < vsources.length; i++) {
        const vs = vsources[i];
        if (vs.kind === 'dc') {
          outVolts[i] = vs.volts;
        } else {
          outVolts[i] = evalFuncVoltage(
            vs.waveform ?? 'sine',
            vs.freqHz ?? 1000,
            vs.amplitudePeak ?? 1,
            vs.dcOffset ?? 0,
            vs.dutyPct ?? 50,
            tEval,
            vs.phaseDeg ?? 0,
            vs.inverted ?? false,
            vs.modMode ?? 'OFF',
            vs.modFreqHz ?? 100,
            vs.modDepthPct ?? 80
          );
        }
      }
    };

    const solveOneSubStep = (stepDt: number, useBE: boolean, srcVolts: Float64Array) => {
      ensureLinearBase(useBE, stepDt);
      const vcvsSats: Array<number | null> = vcvss.map(() => null);
      const maxNonlinearIters = hasNonlinear ? 10 : 1;

      for (let iter = 0; iter < maxNonlinearIters; iter++) {
        workA.set(baseA);
        rhs.fill(0);

        for (const cap of capacitors) {
          const gEq = useBE ? cap.c / stepDt : (2 * cap.c) / stepDt;
          const iHist = useBE ? gEq * cap.vPrev : gEq * cap.vPrev + cap.iPrev;
          this.stampCurrentSource(rhs, cap.b, cap.a, iHist);
        }

        for (const ind of inductors) {
          const gEq = useBE ? stepDt / ind.l : stepDt / (2 * ind.l);
          const iHist = useBE ? ind.iPrev : ind.iPrev + gEq * ind.vPrev;
          this.stampCurrentSource(rhs, ind.a, ind.b, iHist);
        }

        for (let i = 0; i < vsources.length; i++) {
          rhs[nodeCount + vsources[i].branchIdx] = srcVolts[i];
        }

        if (hasNonlinear) {
          vcvss.forEach((v, idxV) => this.stampVcvsRow(workA, rhs, size, nodeCount, v, vcvsSats[idxV]));
          if (diodes.length > 0) this.stampDiodes(workA, rhs, size, diodes);
          if (npns.length > 0) this.stampNpns(workA, rhs, size, npns);
        }

        solveDenseReal(size, workA, rhs, x);

        if (!hasNonlinear) break;
        const dChanged = diodes.length > 0 ? this.updateDiodeRegionsFromX(x, diodes) : false;
        const qChanged = npns.length > 0 ? this.updateNpnRegionsFromX(x, npns) : false;
        const vChanged = this.updateVcvsSatsFromX(x, vcvss, vcvsSats);
        if (!dChanged && !qChanged && !vChanged) break;
      }

      for (const cap of capacitors) {
        const gEq = useBE ? cap.c / stepDt : (2 * cap.c) / stepDt;
        const vNow = this.getVal(x, cap.a) - this.getVal(x, cap.b);
        const iHist = useBE ? gEq * cap.vPrev : gEq * cap.vPrev + cap.iPrev;
        cap.iPrev = gEq * vNow - iHist;
        cap.vPrev = vNow;
      }

      for (const ind of inductors) {
        const gEq = useBE ? stepDt / ind.l : stepDt / (2 * ind.l);
        const vNow = this.getVal(x, ind.a) - this.getVal(x, ind.b);
        const iHist = useBE ? ind.iPrev : ind.iPrev + gEq * ind.vPrev;
        ind.iPrev = gEq * vNow + iHist;
        ind.vPrev = vNow;
      }
    };

    const prevSrcVolts = new Float64Array(vsources.length);
    const curSrcVolts = new Float64Array(vsources.length);
    evalSourcesAt(this.simTime, prevSrcVolts);
    let beRemaining = 0;

    for (let s = 0; s < sampleCount; s++) {
      this.simTime += dtSec;
      evalSourcesAt(this.simTime, curSrcVolts);

      // Detect discontinuous waveform steps (square/pulse/burst edges) to suppress trapezoidal ringing via BE damping
      let sharpEdge = false;
      if (hasReactive && this.stepCount > 0) {
        for (let i = 0; i < vsources.length; i++) {
          const vs = vsources[i];
          if (vs.kind !== 'func') continue;
          const jump = Math.abs(curSrcVolts[i] - prevSrcVolts[i]);
          if (jump > Math.max(0.05, 0.25 * Math.abs(vs.amplitudePeak ?? 1))) {
            sharpEdge = true;
            break;
          }
        }
      }
      if (sharpEdge) beRemaining = 2;

      const useBE = this.stepCount === 0 || beRemaining > 0;
      this.stepCount++;

      let capturedPeak = false;
      if (sharpEdge && dtSec > 4e-6) {
        // Micro-step right after a sharp edge on coarse timebases captures narrow differentiator spikes accurately
        const dtEdge = Math.min(dtSec * 0.02, 2e-6);
        solveOneSubStep(dtEdge, true, curSrcVolts);
        xPeak.set(x);
        solveOneSubStep(dtSec - dtEdge, true, curSrcVolts);
        capturedPeak = true;
      } else {
        solveOneSubStep(dtSec, useBE, curSrcVolts);
      }

      if (beRemaining > 0) beRemaining--;
      prevSrcVolts.set(curSrcVolts);

      if (!shortDetected) {
        for (const vs of vsources) {
          const iBranch = Math.abs(x[nodeCount + vs.branchIdx]);
          if (vs.currentLimitAmps !== undefined && iBranch > vs.currentLimitAmps * 1.05) {
            shortDetected = true;
            faults.push({
              code: 'short_circuit',
              sourceId: vs.id,
              message: `Short circuit (${iBranch.toFixed(2)} A)`,
              magnitude: iBranch,
            });
          }
        }
      }

      for (let pIdx = 0; pIdx < probeNodes.length; pIdx++) {
        const nIdx = probeIndices[pIdx];
        if (nIdx < 0) {
          nodeVoltages[probeNodes[pIdx]][s] = 0;
        } else if (capturedPeak && Math.abs(xPeak[nIdx] - x[nIdx]) > 0.25) {
          nodeVoltages[probeNodes[pIdx]][s] = xPeak[nIdx];
        } else {
          nodeVoltages[probeNodes[pIdx]][s] = x[nIdx];
        }
      }
    }

    if (diodes.length > 0) this.recordDiodeCurrents(x, diodes);
    return { dt: dtSec, startTime, sampleCount, nodeVoltages, faults };
  }
}

export function componentListSummary(components: CircuitComponent[]): number {
  return components.length;
}
