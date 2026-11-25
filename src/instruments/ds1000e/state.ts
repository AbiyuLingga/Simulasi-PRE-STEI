import type {
  AcquireMode,
  ChannelConfig,
  CouplingMode,
  CursorMode,
  DS1000ESnapshot,
  DS1000EState,
  FFTWindow,
  FilterType,
  GridMode,
  MathOp,
  MeasureParamKey,
  MenuId,
  MultiTarget,
  ProbeAtten,
  TimeBaseMode,
  TriggerCoupling,
  TriggerMode,
  TriggerSlope,
  TriggerSweep,
} from './types';

export const VOLTS_PER_DIV_1X: readonly number[] = [
  0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10,
];

export const TIME_PER_DIV_STEPS: readonly number[] = [
  2e-9, 5e-9, 1e-8, 2e-8, 5e-8, 1e-7, 2e-7, 5e-7, 1e-6, 2e-6, 5e-6, 1e-5, 2e-5, 5e-5, 1e-4, 2e-4,
  5e-4, 1e-3, 2e-3, 5e-3, 1e-2, 2e-2, 5e-2, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50,
];

export const PROBE_ATTEN_LIST: readonly ProbeAtten[] = [1, 5, 10, 50, 100, 500, 1000];

export const HELP_TEXT_MAP: Record<string, { title: string; body: string }> = {
  CH1: { title: 'CH1 Vertical', body: 'Toggle CH1 trace & vertical menu (Coupling, BW Limit, Probe, Filter).' },
  CH2: { title: 'CH2 Vertical', body: 'Toggle CH2 trace & vertical menu (Coupling, BW Limit, Probe, Filter).' },
  MATH: { title: 'MATH Menu', body: 'Waveform arithmetic (A+B, A-B, A*B) and FFT spectrum analyzer.' },
  REF: { title: 'REF Menu', body: 'Store or recall reference waveform for comparison.' },
  OFF: { title: 'Trace OFF', body: 'Turn off currently selected channel, Math, or Ref display.' },
  VERT_POS: { title: 'Vertical Position', body: 'Adjust vertical offset. Press knob to zero offset.' },
  VERT_SCALE: { title: 'Vertical Scale', body: 'Adjust Volts/div. Press knob to toggle Coarse / Fine.' },
  HORIZ_MENU: { title: 'Horizontal Menu', body: 'Select Y-T, X-Y Lissajous, Roll mode, or Delayed Scan.' },
  HORIZ_POS: { title: 'Horizontal Position', body: 'Shift trigger point horizontally. Press knob to center.' },
  HORIZ_SCALE: { title: 'Timebase Scale', body: 'Adjust Time/div (2ns to 50s). Press knob for Delayed Scan.' },
  TRIG_MENU: { title: 'Trigger Menu', body: 'Configure Edge, Pulse, Slope, Video, Alternate trigger & Sweep.' },
  TRIG_LEVEL: { title: 'Trigger Level', body: 'Set trigger voltage threshold. Press knob to set 0 V.' },
  '50%': { title: 'Trigger 50%', body: 'Set trigger threshold automatically to signal vertical midpoint.' },
  FORCE: { title: 'FORCE Trigger', body: 'Force immediate acquisition in Normal or Single sweep mode.' },
  AUTO: { title: 'AUTO Setup', body: 'Auto-adjust scale, timebase, and trigger for stable waveform.' },
  'RUN/STOP': { title: 'RUN / STOP', body: 'Start continuous sampling (Green) or freeze display (Red).' },
  MEASURE: { title: 'Measure Menu', body: 'Enable up to 3 automatic metrics or Display All 22 parameters.' },
  ACQUIRE: { title: 'Acquire Menu', body: 'Sampling mode (Normal, Average, Peak Detect), MemDepth, Sin(x)/x.' },
  STORAGE: { title: 'Storage Menu', body: 'Save/recall Setups, Bitmap screenshot, CSV trace, or Factory Reset.' },
  CURSOR: { title: 'Cursor Menu', body: 'Manual, Track, or Auto cursors for dV, dT, and 1/dT.' },
  DISPLAY: { title: 'Display Menu', body: 'Vectors/Dots, Infinite Persist, Grid style, Intensity, Brightness.' },
  UTILITY: { title: 'Utility Menu', body: 'Sound, 6-digit Freq Counter, Pass/Fail mask, Self-Cal, System Info.' },
  MULTI: { title: 'Multi-Function Knob', body: 'Adjust active parameter, cursor, or file slot. Press to confirm.' },
  PRINT: { title: 'Print / Capture', body: 'Save current oscilloscope LCD screen directly as PNG image.' },
  MENU_ONOFF: { title: 'Menu On/Off', body: 'Show or hide the right softkey menu sidebar.' },
};

function makeDefaultChannel(enabled: boolean, voltsPerDiv = 1): ChannelConfig {
  return {
    enabled,
    coupling: 'DC',
    bwLimit: false,
    probe: 1,
    voltsPerDiv,
    coarseFine: 'Coarse',
    offsetDiv: enabled ? 0 : -1.5,
    invert: false,
    filter: {
      enabled: false,
      type: 'LPF',
      upperHz: 20000,
      lowerHz: 100,
    },
  };
}

export function createFactoryDS1000EState(): DS1000EState {
  return {
    power: 'ON',
    runState: 'RUN',
    selectedVertical: 'CH1',
    ch1: { ...makeDefaultChannel(true, 1), offsetDiv: 1.5 },
    ch2: { ...makeDefaultChannel(true, 1), offsetDiv: -1.8 },
    math: {
      enabled: false,
      op: 'A+B',
      sourceA: 'CH1',
      sourceB: 'CH2',
      fftSource: 'CH1',
      fftWindow: 'Hanning',
      fftDisplay: 'Split',
      fftScale: 'dBVrms' as never,
      voltsPerDiv: 1,
      offsetDiv: 0,
    },
    ref: {
      enabled: false,
      source: 'CH1',
      location: 'Internal',
      voltsPerDiv: 1,
      offsetDiv: 0,
      storedSamples: null,
      storedTimePerDiv: 5e-4,
    },
    horizontal: {
      timePerDiv: 5e-4, // 500 us/div
      triggerOffsetSec: 0,
      timeBaseMode: 'Y-T',
      delayedScan: false,
      delayedTimePerDiv: 1e-4,
      savedYtOffsets: null,
    },
    trigger: {
      mode: 'Edge',
      source: 'CH1',
      slope: 'Rising',
      sweep: 'Auto',
      levelVolts: 0.0,
      coupling: 'DC',
      sensitivityDiv: 0.2,
      holdoffSec: 5e-7,
      pulseCondition: '<',
      pulseWidthSec: 1e-4,
      slopeCondition: '>',
      slopeTimeSec: 1e-4,
      videoPolarity: 'Positive',
      videoStandard: 'NTSC',
      status: "T'D",
      forceRequested: false,
    },
    acquire: {
      mode: 'Normal',
      averages: 16,
      memDepth: 'Normal',
      interpolation: 'Sin(x)/x',
    },
    display: {
      type: 'Vectors',
      persist: 'OFF',
      clearNonce: 0,
      grid: 'Full',
      gridBrightness: 55,
      intensity: 80,
      menuTimeout: 'Infinite',
    },
    measure: {
      source: 'CH1',
      activeSlots: ['Freq', 'Vpp'],
      displayAll: false,
      paramPageVolt: 0,
      paramPageTime: 0,
    },
    cursor: {
      mode: 'OFF',
      type: 'X',
      source: 'CH1',
      trackSourceA: 'CH1',
      trackSourceB: 'CH2',
      curA: 0.28,
      curB: 0.72,
      activeCursor: 'A',
    },
    storage: {
      type: 'Waveform',
      internalSlot: 0,
      csvDepth: 'Displayed',
      bitmapPara: false,
      savedSlots: [],
    },
    utility: {
      sound: true,
      counter: true,
      passFail: {
        enabled: false,
        running: false,
        source: 'CH1',
        xMaskDiv: 0.4,
        yMaskDiv: 0.4,
        maskCreated: false,
        passCount: 0,
        failCount: 0,
      },
      expandRef: 'Ground',
      showSystemInfo: false,
      selfCalActive: false,
    },
    menuOpen: true,
    activeMenu: 'CH1',
    menuPage: 0,
    filterChannel: 'CH1',
    activeMultiTarget: 'none',
    previousSnapshotForAutoUndo: null,
    transientPopup: null,
    lastInteractionTime: 0,
    dirtySeq: 1,
  };
}

// Fix math fftScale initial literal cleanly
export function createInitialDS1000EState(): DS1000EState {
  const s = createFactoryDS1000EState();
  s.math.fftScale = 'dB';
  return s;
}

function step125Index(arr: readonly number[], current: number, dir: 1 | -1): number {
  let bestIdx = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < arr.length; i++) {
    const d = Math.abs(Math.log(arr[i]) - Math.log(current));
    if (d < bestDiff) {
      bestDiff = d;
      bestIdx = i;
    }
  }
  const next = Math.min(arr.length - 1, Math.max(0, bestIdx + dir));
  return arr[next];
}

export function takeSnapshot(s: DS1000EState): DS1000ESnapshot {
  return {
    ch1: { ...s.ch1, filter: { ...s.ch1.filter } },
    ch2: { ...s.ch2, filter: { ...s.ch2.filter } },
    horizontal: { ...s.horizontal },
    trigger: { ...s.trigger },
  };
}

export function nextInCycle<T>(list: readonly T[], current: T): T {
  const idx = list.indexOf(current);
  return list[(idx + 1) % list.length];
}

export function stepVoltsPerDiv(ch: ChannelConfig, deltaSteps: number): number {
  const dir: 1 | -1 = deltaSteps > 0 ? -1 : 1; // clockwise (+1) zooms in (smaller V/div), CCW (-1) zooms out (larger V/div) on Rigol!
  if (ch.coarseFine === 'Coarse') {
    const base1X = ch.voltsPerDiv / ch.probe;
    const stepped = step125Index(VOLTS_PER_DIV_1X, base1X, dir);
    return stepped * ch.probe;
  }
  const factor = deltaSteps > 0 ? 0.95 : 1.052;
  return Math.min(10 * ch.probe, Math.max(0.002 * ch.probe, Number((ch.voltsPerDiv * factor).toPrecision(3))));
}

export function stepTimePerDiv(current: number, deltaSteps: number): number {
  // Clockwise (+1) moves toward nS (smaller time/div), CCW (-1) toward S (larger time/div) - matches Figure 1-19 "S <- -> nS"
  const dir: 1 | -1 = deltaSteps > 0 ? -1 : 1;
  return step125Index(TIME_PER_DIV_STEPS, current, dir);
}

export function adjustMultiTarget(state: DS1000EState, delta: number): DS1000EState {
  const next = structuredClone(state) as DS1000EState;
  const target: MultiTarget = next.activeMultiTarget;
  const step = delta > 0 ? 1 : -1;

  switch (target) {
    case 'cursor_a':
      next.cursor.curA = Math.min(0.98, Math.max(0.02, next.cursor.curA + step * 0.015));
      break;
    case 'cursor_b':
      next.cursor.curB = Math.min(0.98, Math.max(0.02, next.cursor.curB + step * 0.015));
      break;
    case 'acq_averages': {
      const vals = [2, 4, 8, 16, 32, 64, 128, 256];
      const idx = Math.max(0, vals.indexOf(next.acquire.averages));
      next.acquire.averages = vals[Math.min(vals.length - 1, Math.max(0, idx + step))];
      break;
    }
    case 'disp_grid_bright':
      next.display.gridBrightness = Math.min(100, Math.max(0, next.display.gridBrightness + step * 5));
      break;
    case 'disp_intensity':
      next.display.intensity = Math.min(100, Math.max(20, next.display.intensity + step * 5));
      break;
    case 'trig_sensitivity':
      next.trigger.sensitivityDiv = Math.min(1.0, Math.max(0.1, Number((next.trigger.sensitivityDiv + step * 0.1).toFixed(1))));
      break;
    case 'trig_holdoff':
      next.trigger.holdoffSec = Math.min(1.5, Math.max(5e-7, next.trigger.holdoffSec * (step > 0 ? 1.5 : 0.67)));
      break;
    case 'trig_pulse_width':
      next.trigger.pulseWidthSec = Math.min(10, Math.max(2e-8, next.trigger.pulseWidthSec * (step > 0 ? 1.25 : 0.8)));
      break;
    case 'filter_upper': {
      const ch = next.filterChannel === 'CH1' ? next.ch1 : next.ch2;
      ch.filter.upperHz = Math.min(2e7, Math.max(50, Math.round(ch.filter.upperHz * (step > 0 ? 1.25 : 0.8))));
      break;
    }
    case 'filter_lower': {
      const ch = next.filterChannel === 'CH1' ? next.ch1 : next.ch2;
      ch.filter.lowerHz = Math.min(2e7, Math.max(10, Math.round(ch.filter.lowerHz * (step > 0 ? 1.25 : 0.8))));
      break;
    }
    case 'storage_slot':
      next.storage.internalSlot = (next.storage.internalSlot + step + 10) % 10;
      break;
    case 'pf_xmask':
      next.utility.passFail.xMaskDiv = Math.min(4.0, Math.max(0.04, Number((next.utility.passFail.xMaskDiv + step * 0.08).toFixed(2))));
      break;
    case 'pf_ymask':
      next.utility.passFail.yMaskDiv = Math.min(4.0, Math.max(0.04, Number((next.utility.passFail.yMaskDiv + step * 0.08).toFixed(2))));
      break;
    default:
      // Default convenience: if cursors enabled, move active cursor
      if (next.cursor.mode !== 'OFF') {
        if (next.cursor.activeCursor === 'A') {
          next.cursor.curA = Math.min(0.98, Math.max(0.02, next.cursor.curA + step * 0.015));
        } else {
          next.cursor.curB = Math.min(0.98, Math.max(0.02, next.cursor.curB + step * 0.015));
        }
      }
      break;
  }
  next.dirtySeq++;
  return next;
}

export function openMenu(state: DS1000EState, menu: MenuId, page = 0): DS1000EState {
  const next = { ...state, menuOpen: true, activeMenu: menu, menuPage: page, dirtySeq: state.dirtySeq + 1 };
  return next;
}

export function formatVoltsDiv(v: number): string {
  if (v >= 1) return `${v >= 10 ? v.toFixed(0) : v.toFixed(2).replace(/0$/, '')}V`;
  return `${(v * 1000).toFixed(v * 1000 < 10 ? 1 : 0)}mV`;
}

export function formatTimeValue(sec: number): string {
  const abs = Math.abs(sec);
  const sign = sec < 0 ? '-' : '';
  if (abs === 0) return '0.00s';
  if (abs >= 1) return `${sign}${abs.toFixed(abs >= 10 ? 1 : 2)}s`;
  if (abs >= 1e-3) return `${sign}${(abs * 1e3).toFixed(abs * 1e3 >= 100 ? 0 : abs * 1e3 >= 10 ? 1 : 2)}ms`;
  if (abs >= 1e-6) return `${sign}${(abs * 1e6).toFixed(abs * 1e6 >= 100 ? 0 : abs * 1e6 >= 10 ? 1 : 2)}us`;
  return `${sign}${(abs * 1e9).toFixed(abs * 1e9 >= 100 ? 0 : 1)}ns`;
}

export function formatFreqValue(hz: number): string {
  if (!Number.isFinite(hz) || hz <= 0) return '****';
  if (hz >= 1e6) return `${(hz / 1e6).toFixed(3)}MHz`;
  if (hz >= 1e3) return `${(hz / 1e3).toFixed(2)}kHz`;
  return `${hz.toFixed(1)}Hz`;
}

export const ALL_VOLT_MEASURE_PAGES: readonly (readonly MeasureParamKey[])[] = [
  ['Vmax', 'Vmin', 'Vpp', 'Vtop'],
  ['Vbase', 'Vamp', 'Vavg', 'Vrms'],
  ['Overshoot', 'Preshoot'],
];

export const ALL_TIME_MEASURE_PAGES: readonly (readonly MeasureParamKey[])[] = [
  ['Period', 'Freq', 'RiseTime', 'FallTime'],
  ['PlusWidth', 'MinusWidth', 'PlusDuty', 'MinusDuty'],
  ['Delay12Rise', 'Delay12Fall', 'Phase12Rise', 'Phase12Fall'],
];

export const COUPLING_CYCLE: readonly CouplingMode[] = ['DC', 'AC', 'GND'];
export const FILTER_TYPE_CYCLE: readonly FilterType[] = ['LPF', 'HPF', 'BPF', 'BRF'];
export const MATH_OP_CYCLE: readonly MathOp[] = ['A+B', 'A-B', 'A*B', 'FFT'];
export const FFT_WINDOW_CYCLE: readonly FFTWindow[] = ['Rectangle', 'Hanning', 'Hamming', 'Blackman'];
export const TIMEBASE_CYCLE: readonly TimeBaseMode[] = ['Y-T', 'X-Y', 'Roll'];
export const TRIG_MODE_CYCLE: readonly TriggerMode[] = ['Edge', 'Pulse', 'Slope', 'Video', 'Alternate'];
export const TRIG_SLOPE_CYCLE: readonly TriggerSlope[] = ['Rising', 'Falling', 'Alternating'];
export const TRIG_SWEEP_CYCLE: readonly TriggerSweep[] = ['Auto', 'Normal', 'Single'];
export const TRIG_COUPLING_CYCLE: readonly TriggerCoupling[] = ['DC', 'AC', 'HF Reject', 'LF Reject'];
export const ACQUIRE_MODE_CYCLE: readonly AcquireMode[] = ['Normal', 'Average', 'Peak Detect'];
export const GRID_CYCLE: readonly GridMode[] = ['Full', 'Cross', 'None'];
export const CURSOR_MODE_CYCLE: readonly CursorMode[] = ['OFF', 'Manual', 'Track', 'Auto'];
