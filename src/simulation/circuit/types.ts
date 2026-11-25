import type { DM3058Function, DM3058InputZ } from '../../instruments/dm3058/types';

export type SocketId =
  | 'rigol_ch1'
  | 'rigol_ch1_gnd'
  | 'rigol_ch2'
  | 'rigol_ch2_gnd'
  | 'rigol_ext'
  | 'rigol_comp_sig'
  | 'rigol_comp_gnd'
  | 'gen_out'
  | 'gen_ch2_out'
  | 'gen_gnd'
  | 'psu_ch1_pos'
  | 'psu_ch1_neg'
  | 'psu_ch2_pos'
  | 'psu_ch2_neg'
  | 'psu_gnd'
  | 'dmm_pos'
  | 'dmm_com'
  | 'dmm_i'
  | 'dmm_sense_hi'
  | 'dmm_sense_lo'
  | string;

export type WaveformShape = 'sine' | 'square' | 'triangle' | 'noise' | 'arb';
export type SignalGenModMode = 'OFF' | 'AM' | 'FM' | 'SWEEP' | 'BURST';
export type SignalGenLoadMode = 'HighZ' | '50ohm';

export interface SignalGenConfig {
  power: boolean;
  outputEnabled: boolean;
  waveform: WaveformShape;
  freqHz: number;
  vpp: number;
  dcOffset: number;
  dutyPct: number;
  attenuator20dB: boolean;
  // Rigol DG1012 manual-accurate extended channel & modulation controls
  phaseDeg?: number;
  loadMode?: SignalGenLoadMode;
  inverted?: boolean;
  modMode?: SignalGenModMode;
  modFreqHz?: number;
  modDepthPct?: number;
  // Independent Channel 2 (BNC CH2/Counter output)
  ch2OutputEnabled?: boolean;
  ch2Waveform?: WaveformShape;
  ch2FreqHz?: number;
  ch2Vpp?: number;
  ch2DcOffset?: number;
  ch2DutyPct?: number;
  ch2PhaseDeg?: number;
  ch2LoadMode?: SignalGenLoadMode;
  ch2Inverted?: boolean;
}

export interface PowerSupplyConfig {
  power: boolean;
  outputEnabled: boolean;
  ch1Voltage: number;
  ch1CurrentLimit: number;
  ch2Voltage: number;
  ch2CurrentLimit: number;
  trackingDual12V: boolean;
}

export type KitId = 'none' | 'multimeter' | 'osc_gen' | 'thevenin' | 'rl_rc';

export interface KitControlState {
  oscAmpPower: boolean;
  oscAmpGain: number;
  oscGenPower: boolean;
  oscGenFreqIdx: 0 | 1 | 2;
  oscPhasePotOhms: number;
  thevPotOhms: number;
  thevNortonPotOhms: number;
  /** 8-dial Decade Resistance Box positions (0..10 each): [x1M, x100k, x10k, x1k, x100, x10, x1, x0.1]. */
  decadeDials?: number[];
}

export interface DmmConfig {
  power: boolean;
  func: DM3058Function;
  dualEnabled: boolean;
  viceFunc: DM3058Function;
  inputZ: DM3058InputZ;
  rangeIndex: number;
  autoRange: boolean;
}

export type BreadboardComponentKind =
  | 'resistor'
  | 'capacitor'
  | 'inductor'
  | 'diode'
  | 'led'
  | 'jumper'
  | 'opamp741';

export interface BreadboardPart {
  id: string;
  kind: BreadboardComponentKind;
  label: string;
  value: number;
  holeA: string;
  holeB: string;
  color?: string;
  waypoints?: [number, number][];
  /** For jumper wires: end B floats upward as an exposed pin ready for alligator clips & scope probes. */
  floating?: boolean;
  /** Local XZ offset [dx, dz] in meters for a floating jumper's exposed tip relative to holeA. */
  floatOffset?: [number, number];
}

export type CableKind =
  | 'probe_bnc_hook'
  | 'bnc_bnc'
  | 'banana_4mm'
  | 'banana_alligator'
  | 'bnc_alligator'
  | 'bnc_banana';

export interface CableConnection {
  id: string;
  kind: CableKind;
  color: string;
  label: string;
  endA: SocketId | null;
  endB: SocketId | null;
  /** Optional ground alligator clip (used on oscilloscope probes). */
  gndClip?: SocketId | null;
  /** Saved world-space resting coordinates when unplugged and dropped anywhere on the bench. */
  freePosA?: [number, number, number];
  freePosB?: [number, number, number];
  freePosGnd?: [number, number, number];
  /** Probe-only settings */
  probeAtten?: 1 | 10;
  probeCompTrim?: number; // -1 (under) .. 0 (flat) .. +1 (over)
}

export type CircuitComponent =
  | {
      id: string;
      kind: 'resistor';
      nodeA: string;
      nodeB: string;
      ohms: number;
      maxWatts?: number;
    }
  | {
      id: string;
      kind: 'capacitor';
      nodeA: string;
      nodeB: string;
      farads: number;
    }
  | {
      id: string;
      kind: 'inductor';
      nodeA: string;
      nodeB: string;
      henrys: number;
    }
  | {
      id: string;
      kind: 'vsource_dc';
      nodePos: string;
      nodeNeg: string;
      volts: number;
      currentLimitAmps?: number;
    }
  | {
      id: string;
      kind: 'vsource_func';
      nodePos: string;
      nodeNeg: string;
      waveform: WaveformShape;
      freqHz: number;
      amplitudePeak: number; // Vp = Vpp / 2
      dcOffset: number;
      dutyPct: number;
      phaseDeg?: number;
      inverted?: boolean;
      modMode?: SignalGenModMode;
      modFreqHz?: number;
      modDepthPct?: number;
    }
  | {
      id: string;
      kind: 'vcvs';
      nodeOutPos: string;
      nodeOutNeg: string;
      nodeCtrlPos: string;
      nodeCtrlNeg: string;
      gain: number;
      vSat?: number;
    }
  | {
      id: string;
      kind: 'diode';
      nodeAnode: string;
      nodeCathode: string;
      vf?: number;
      rOn?: number;
      vz?: number;
      isLed?: boolean;
    }
  | {
      id: string;
      kind: 'npn';
      nodeC: string;
      nodeB: string;
      nodeE: string;
      beta?: number;
      vbeOn?: number;
      vceSat?: number;
      rBe?: number;
    };

export interface CompiledNetlist {
  groundNode: string;
  nodeNames: string[];
  components: CircuitComponent[];
  /** Maps logical measurement channel -> circuit node name + reference node name */
  probeNodes: Record<
    string,
    {
      signalNode: string;
      refNode: string;
      connected: boolean;
      isProbeComp?: boolean;
      probeAtten: number;
      probeCompTrim: number;
    }
  >;
  dmmNodes?: {
    posNode: string;
    comNode: string;
    currNode: string;
    senseHiNode: string;
    senseLoNode: string;
    shuntOhms: number;
    connectedMain: boolean;
    connectedCurrent: boolean;
    connectedSense: boolean;
    connected: boolean;
  };
  /** Maps canonical breadboard strip/rail IDs (e.g. N_BB_T_12, N_BB_RAIL_TN) -> unified MNA node name */
  bbNodeMap?: Record<string, string>;
}

export interface FaultEvent {
  code: 'short_circuit' | 'overcurrent' | 'overpower';
  sourceId: string;
  message: string;
  magnitude: number;
}

export interface DCSolution {
  nodeVoltages: Record<string, number>;
  sourceCurrents: Record<string, number>;
  faults: FaultEvent[];
}

export interface ComplexPhasor {
  re: number;
  im: number;
  mag: number;
  phaseRad: number;
}

export interface ACSolution {
  freqHz: number;
  nodePhasors: Record<string, ComplexPhasor>;
}

export interface TransientChunk {
  dt: number;
  startTime: number;
  sampleCount: number;
  nodeVoltages: Record<string, Float32Array>;
  faults: FaultEvent[];
}
