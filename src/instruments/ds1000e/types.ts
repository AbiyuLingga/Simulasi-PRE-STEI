export type VerticalTarget = 'CH1' | 'CH2' | 'MATH' | 'REF';
export type CouplingMode = 'DC' | 'AC' | 'GND';
export type ProbeAtten = 1 | 5 | 10 | 50 | 100 | 500 | 1000;
export type FilterType = 'LPF' | 'HPF' | 'BPF' | 'BRF';
export type MathOp = 'A+B' | 'A-B' | 'A*B' | 'FFT';
export type FFTWindow = 'Rectangle' | 'Hanning' | 'Hamming' | 'Blackman';
export type TimeBaseMode = 'Y-T' | 'X-Y' | 'Roll';
export type TriggerMode = 'Edge' | 'Pulse' | 'Slope' | 'Video' | 'Alternate';
export type TriggerSource = 'CH1' | 'CH2' | 'EXT' | 'AC Line';
export type TriggerSlope = 'Rising' | 'Falling' | 'Alternating';
export type TriggerSweep = 'Auto' | 'Normal' | 'Single';
export type TriggerCoupling = 'DC' | 'AC' | 'HF Reject' | 'LF Reject';
export type TriggerStatus = 'RUN' | 'STOP' | "T'D" | 'WAIT' | 'AUTO';
export type AcquireMode = 'Normal' | 'Average' | 'Peak Detect';
export type GridMode = 'Full' | 'Cross' | 'None';
export type CursorMode = 'OFF' | 'Manual' | 'Track' | 'Auto';

export type MeasureParamKey =
  | 'Vmax'
  | 'Vmin'
  | 'Vpp'
  | 'Vtop'
  | 'Vbase'
  | 'Vamp'
  | 'Vavg'
  | 'Vrms'
  | 'Overshoot'
  | 'Preshoot'
  | 'Period'
  | 'Freq'
  | 'RiseTime'
  | 'FallTime'
  | 'PlusWidth'
  | 'MinusWidth'
  | 'PlusDuty'
  | 'MinusDuty'
  | 'Delay12Rise'
  | 'Delay12Fall'
  | 'Phase12Rise'
  | 'Phase12Fall';

export type MenuId =
  | 'CH1'
  | 'CH2'
  | 'CH_FILTER'
  | 'MATH'
  | 'REF'
  | 'HORIZ'
  | 'TRIG'
  | 'TRIG_SETUP'
  | 'MEASURE'
  | 'MEASURE_VOLT'
  | 'MEASURE_TIME'
  | 'ACQUIRE'
  | 'STORAGE'
  | 'STORAGE_INTERNAL'
  | 'CURSOR'
  | 'DISPLAY'
  | 'UTILITY'
  | 'UTILITY_PASSFAIL'
  | 'UTILITY_PREF'
  | 'AUTO';

export type MultiTarget =
  | 'none'
  | 'filter_upper'
  | 'filter_lower'
  | 'trig_sensitivity'
  | 'trig_holdoff'
  | 'trig_pulse_width'
  | 'acq_averages'
  | 'disp_grid_bright'
  | 'disp_intensity'
  | 'cursor_a'
  | 'cursor_b'
  | 'storage_slot'
  | 'pf_xmask'
  | 'pf_ymask';

export interface ChannelConfig {
  enabled: boolean;
  coupling: CouplingMode;
  bwLimit: boolean;
  probe: ProbeAtten;
  voltsPerDiv: number;
  coarseFine: 'Coarse' | 'Fine';
  offsetDiv: number; // divisions from center (-4..+4 typical, wider allowed)
  invert: boolean;
  filter: {
    enabled: boolean;
    type: FilterType;
    upperHz: number;
    lowerHz: number;
  };
}

export interface DS1000ESnapshot {
  ch1: ChannelConfig;
  ch2: ChannelConfig;
  horizontal: {
    timePerDiv: number;
    triggerOffsetSec: number;
    timeBaseMode: TimeBaseMode;
    delayedScan: boolean;
    delayedTimePerDiv: number;
    savedYtOffsets?: { ch1: number; ch2: number } | null;
  };
  trigger: {
    mode: TriggerMode;
    source: TriggerSource;
    slope: TriggerSlope;
    sweep: TriggerSweep;
    levelVolts: number;
    coupling: TriggerCoupling;
    sensitivityDiv: number;
    holdoffSec: number;
  };
}

export interface DS1000EState {
  power: 'OFF' | 'BOOTING' | 'ON';
  runState: 'RUN' | 'STOP';
  selectedVertical: VerticalTarget;
  ch1: ChannelConfig;
  ch2: ChannelConfig;
  math: {
    enabled: boolean;
    op: MathOp;
    sourceA: 'CH1' | 'CH2';
    sourceB: 'CH1' | 'CH2';
    fftSource: 'CH1' | 'CH2';
    fftWindow: FFTWindow;
    fftDisplay: 'Split' | 'Full';
    fftScale: 'Vrms' | 'dB';
    voltsPerDiv: number;
    offsetDiv: number;
  };
  ref: {
    enabled: boolean;
    source: 'CH1' | 'CH2' | 'MATH';
    location: 'Internal' | 'External';
    voltsPerDiv: number;
    offsetDiv: number;
    storedSamples: Float32Array | null;
    storedTimePerDiv: number;
  };
  horizontal: {
    timePerDiv: number;
    triggerOffsetSec: number;
    timeBaseMode: TimeBaseMode;
    delayedScan: boolean;
    delayedTimePerDiv: number;
    savedYtOffsets?: { ch1: number; ch2: number } | null;
  };
  trigger: {
    mode: TriggerMode;
    source: TriggerSource;
    slope: TriggerSlope;
    sweep: TriggerSweep;
    levelVolts: number;
    coupling: TriggerCoupling;
    sensitivityDiv: number;
    holdoffSec: number;
    pulseCondition: '<' | '>' | '=';
    pulseWidthSec: number;
    slopeCondition: '<' | '>' | '=';
    slopeTimeSec: number;
    videoPolarity: 'Positive' | 'Negative';
    videoStandard: 'NTSC' | 'PAL/SECAM';
    status: TriggerStatus;
    forceRequested: boolean;
  };
  acquire: {
    mode: AcquireMode;
    averages: number;
    memDepth: 'Normal' | 'Long Mem';
    interpolation: 'Sin(x)/x' | 'Linear';
  };
  display: {
    type: 'Vectors' | 'Dots';
    persist: 'OFF' | 'Infinite';
    clearNonce: number;
    grid: GridMode;
    gridBrightness: number; // 0..100
    intensity: number; // 0..100
    menuTimeout: 'Infinite' | '2s' | '5s' | '10s' | '20s';
  };
  measure: {
    source: 'CH1' | 'CH2';
    activeSlots: MeasureParamKey[]; // up to 3 shown at bottom
    displayAll: boolean;
    paramPageVolt: number; // 0..2
    paramPageTime: number; // 0..3
  };
  cursor: {
    mode: CursorMode;
    type: 'X' | 'Y';
    source: 'CH1' | 'CH2' | 'MATH';
    trackSourceA: 'CH1' | 'CH2' | 'None';
    trackSourceB: 'CH1' | 'CH2' | 'None';
    curA: number; // normalized 0..1 across plot
    curB: number; // normalized 0..1 across plot
    activeCursor: 'A' | 'B';
  };
  storage: {
    type: 'Waveform' | 'Setups' | 'Bitmap' | 'CSV' | 'Factory';
    internalSlot: number; // 0..9
    csvDepth: 'Displayed' | 'Maximum';
    bitmapPara: boolean;
    savedSlots: number[]; // indices 0..9 that have saved data
  };
  utility: {
    sound: boolean;
    counter: boolean;
    passFail: {
      enabled: boolean;
      running: boolean;
      source: 'CH1' | 'CH2';
      xMaskDiv: number;
      yMaskDiv: number;
      maskCreated: boolean;
      passCount: number;
      failCount: number;
    };
    expandRef: 'Ground' | 'Center';
    showSystemInfo: boolean;
    selfCalActive: boolean;
  };
  menuOpen: boolean;
  activeMenu: MenuId;
  menuPage: number;
  filterChannel: 'CH1' | 'CH2';
  activeMultiTarget: MultiTarget;
  previousSnapshotForAutoUndo: DS1000ESnapshot | null;
  transientPopup: { title: string; body: string } | null;
  lastInteractionTime: number;
  dirtySeq: number;
}

export interface MeasurementResults {
  values: Record<MeasureParamKey, number | null>;
  counterHz: number | null;
}

export interface ScopeFrameOutput {
  ch1Samples: Float32Array;
  ch2Samples: Float32Array;
  mathSamples: Float32Array;
  fftBinsDb: Float32Array | null;
  fftMaxFreqHz: number;
  triggerStatus: TriggerStatus;
  triggerSampleIndex: number;
  sampleRateHz: number;
  measurements: MeasurementResults;
  ch1MidpointVolts: number;
  ch2MidpointVolts: number;
  passFailFailed: boolean;
}
