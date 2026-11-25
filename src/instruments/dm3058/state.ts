import type {
  DM3058ButtonId,
  DM3058Function,
  DM3058HelpTopic,
  DM3058MeasurementPacket,
  DM3058SoftkeyItem,
  DM3058State,
} from './types';

export interface DM3058RangeSpec {
  label: string;
  fullScale: number;
  maxOverrange: number;
  unit: string;
  unitScale: number;
  decimals5: number;
  decimals4: number;
}

export const DM3058_RANGES: Record<DM3058Function, ReadonlyArray<DM3058RangeSpec>> = {
  DCV: [
    { label: '200mV', fullScale: 0.2, maxOverrange: 0.24, unit: 'mV', unitScale: 1e3, decimals5: 3, decimals4: 2 },
    { label: '2V', fullScale: 2, maxOverrange: 2.4, unit: 'V', unitScale: 1, decimals5: 5, decimals4: 4 },
    { label: '20V', fullScale: 20, maxOverrange: 24, unit: 'V', unitScale: 1, decimals5: 4, decimals4: 3 },
    { label: '200V', fullScale: 200, maxOverrange: 240, unit: 'V', unitScale: 1, decimals5: 3, decimals4: 2 },
    { label: '1000V', fullScale: 1000, maxOverrange: 1000, unit: 'V', unitScale: 1, decimals5: 2, decimals4: 1 },
  ],
  ACV: [
    { label: '200mV', fullScale: 0.2, maxOverrange: 0.24, unit: 'mV', unitScale: 1e3, decimals5: 3, decimals4: 2 },
    { label: '2V', fullScale: 2, maxOverrange: 2.4, unit: 'V', unitScale: 1, decimals5: 5, decimals4: 4 },
    { label: '20V', fullScale: 20, maxOverrange: 24, unit: 'V', unitScale: 1, decimals5: 4, decimals4: 3 },
    { label: '200V', fullScale: 200, maxOverrange: 240, unit: 'V', unitScale: 1, decimals5: 3, decimals4: 2 },
    { label: '750V', fullScale: 750, maxOverrange: 750, unit: 'V', unitScale: 1, decimals5: 2, decimals4: 1 },
  ],
  DCI: [
    { label: '200uA', fullScale: 200e-6, maxOverrange: 240e-6, unit: 'µA', unitScale: 1e6, decimals5: 3, decimals4: 2 },
    { label: '2mA', fullScale: 2e-3, maxOverrange: 2.4e-3, unit: 'mA', unitScale: 1e3, decimals5: 5, decimals4: 4 },
    { label: '20mA', fullScale: 20e-3, maxOverrange: 24e-3, unit: 'mA', unitScale: 1e3, decimals5: 4, decimals4: 3 },
    { label: '200mA', fullScale: 200e-3, maxOverrange: 240e-3, unit: 'mA', unitScale: 1e3, decimals5: 3, decimals4: 2 },
    { label: '2A', fullScale: 2, maxOverrange: 2.4, unit: 'A', unitScale: 1, decimals5: 5, decimals4: 4 },
    { label: '10A', fullScale: 10, maxOverrange: 10, unit: 'A', unitScale: 1, decimals5: 4, decimals4: 3 },
  ],
  ACI: [
    { label: '20mA', fullScale: 20e-3, maxOverrange: 24e-3, unit: 'mA', unitScale: 1e3, decimals5: 4, decimals4: 3 },
    { label: '200mA', fullScale: 200e-3, maxOverrange: 240e-3, unit: 'mA', unitScale: 1e3, decimals5: 3, decimals4: 2 },
    { label: '2A', fullScale: 2, maxOverrange: 2.4, unit: 'A', unitScale: 1, decimals5: 5, decimals4: 4 },
    { label: '10A', fullScale: 10, maxOverrange: 10, unit: 'A', unitScale: 1, decimals5: 4, decimals4: 3 },
  ],
  '2WR': [
    { label: '200Ω', fullScale: 200, maxOverrange: 240, unit: 'Ω', unitScale: 1, decimals5: 3, decimals4: 2 },
    { label: '2kΩ', fullScale: 2e3, maxOverrange: 2.4e3, unit: 'kΩ', unitScale: 1e-3, decimals5: 5, decimals4: 4 },
    { label: '20kΩ', fullScale: 20e3, maxOverrange: 24e3, unit: 'kΩ', unitScale: 1e-3, decimals5: 4, decimals4: 3 },
    { label: '200kΩ', fullScale: 200e3, maxOverrange: 240e3, unit: 'kΩ', unitScale: 1e-3, decimals5: 3, decimals4: 2 },
    { label: '2MΩ', fullScale: 2e6, maxOverrange: 2.4e6, unit: 'MΩ', unitScale: 1e-6, decimals5: 5, decimals4: 4 },
    { label: '10MΩ', fullScale: 10e6, maxOverrange: 12e6, unit: 'MΩ', unitScale: 1e-6, decimals5: 4, decimals4: 3 },
    { label: '100MΩ', fullScale: 100e6, maxOverrange: 100e6, unit: 'MΩ', unitScale: 1e-6, decimals5: 3, decimals4: 2 },
  ],
  '4WR': [
    { label: '200Ω', fullScale: 200, maxOverrange: 240, unit: 'Ω', unitScale: 1, decimals5: 3, decimals4: 2 },
    { label: '2kΩ', fullScale: 2e3, maxOverrange: 2.4e3, unit: 'kΩ', unitScale: 1e-3, decimals5: 5, decimals4: 4 },
    { label: '20kΩ', fullScale: 20e3, maxOverrange: 24e3, unit: 'kΩ', unitScale: 1e-3, decimals5: 4, decimals4: 3 },
    { label: '200kΩ', fullScale: 200e3, maxOverrange: 240e3, unit: 'kΩ', unitScale: 1e-3, decimals5: 3, decimals4: 2 },
    { label: '2MΩ', fullScale: 2e6, maxOverrange: 2.4e6, unit: 'MΩ', unitScale: 1e-6, decimals5: 5, decimals4: 4 },
    { label: '10MΩ', fullScale: 10e6, maxOverrange: 12e6, unit: 'MΩ', unitScale: 1e-6, decimals5: 4, decimals4: 3 },
    { label: '100MΩ', fullScale: 100e6, maxOverrange: 100e6, unit: 'MΩ', unitScale: 1e-6, decimals5: 3, decimals4: 2 },
  ],
  CAP: [
    { label: '2nF', fullScale: 2e-9, maxOverrange: 2.4e-9, unit: 'nF', unitScale: 1e9, decimals5: 4, decimals4: 3 },
    { label: '20nF', fullScale: 20e-9, maxOverrange: 24e-9, unit: 'nF', unitScale: 1e9, decimals5: 3, decimals4: 2 },
    { label: '200nF', fullScale: 200e-9, maxOverrange: 240e-9, unit: 'nF', unitScale: 1e9, decimals5: 2, decimals4: 1 },
    { label: '2uF', fullScale: 2e-6, maxOverrange: 2.4e-6, unit: 'µF', unitScale: 1e6, decimals5: 4, decimals4: 3 },
    { label: '20uF', fullScale: 20e-6, maxOverrange: 24e-6, unit: 'µF', unitScale: 1e6, decimals5: 3, decimals4: 2 },
    { label: '200uF', fullScale: 200e-6, maxOverrange: 240e-6, unit: 'µF', unitScale: 1e6, decimals5: 2, decimals4: 1 },
    { label: '10mF', fullScale: 10e-3, maxOverrange: 10e-3, unit: 'mF', unitScale: 1e3, decimals5: 3, decimals4: 2 },
  ],
  FREQ: [{ label: 'Auto', fullScale: 1e6, maxOverrange: 1.2e6, unit: 'Hz', unitScale: 1, decimals5: 4, decimals4: 3 }],
  PER: [{ label: 'Auto', fullScale: 1, maxOverrange: 10, unit: 'ms', unitScale: 1e3, decimals5: 4, decimals4: 3 }],
  CONT: [{ label: '2kΩ', fullScale: 2000, maxOverrange: 2000, unit: 'Ω', unitScale: 1, decimals5: 2, decimals4: 1 }],
  DIODE: [{ label: '2V', fullScale: 2.2, maxOverrange: 2.25, unit: 'V', unitScale: 1, decimals5: 4, decimals4: 4 }],
  SENSOR: [{ label: 'K-TC', fullScale: 1372, maxOverrange: 1372, unit: '°C', unitScale: 1, decimals5: 2, decimals4: 1 }],
};

export const DM3058_EMPTY_MEAS: DM3058MeasurementPacket = {
  connectedMain: false,
  connectedCurrent: false,
  connectedSense: false,
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
  sampleSeq: 0,
};

const STORAGE_KEY = 'el2101_dm3058_slots_v1';
const DBM_IMPEDANCES = [50, 75, 600, 1000];
const HELP_TOPICS: ReadonlyArray<DM3058HelpTopic> = ['Keys', 'Jacks', 'Math', '4WR', 'Dual'];

function defaultRangeIndexFor(func: DM3058Function): number {
  if (func === 'DCV' || func === 'ACV') return 2; // 20V
  if (func === 'DCI') return 3; // 200mA
  if (func === 'ACI') return 1; // 200mA
  if (func === '2WR' || func === '4WR') return 1; // 2k
  if (func === 'CAP') return 2; // 200nF
  return 0;
}

export function createInitialDM3058State(): DM3058State {
  return {
    power: true,
    func: 'DCV',
    dualEnabled: false,
    viceFunc: 'ACV',
    autoRange: true,
    rangeIndex: 2,
    speed: 'S',
    inputZ: '10M',
    runState: 'RUN',
    heldPrimary: null,
    heldSecondary: null,
    trigSource: 'AUTO',
    secondShift: false,
    menu: 'MAIN',
    menuHidden: false,
    mathMode: 'OFF',
    relRef: 0,
    dbmRefOhms: 50,
    dbRefVolts: 1.0,
    pfLow: -5.0,
    pfHigh: 5.0,
    beeper: true,
    contThresholdOhms: 50,
    contrast: 5,
    history: [],
    statMin: null,
    statMax: null,
    statSum: 0,
    statCount: 0,
    savedSlots: [],
    helpTopic: 'Keys',
    popupText: null,
    dirtySeq: 1,
  };
}

export function extractRawValue(func: DM3058Function, meas: DM3058MeasurementPacket): number {
  switch (func) {
    case 'DCV':
      return meas.connectedMain ? meas.vdc : 0;
    case 'ACV':
      return meas.connectedMain ? meas.vacRms : 0;
    case 'DCI':
      return meas.connectedCurrent ? meas.idc : 0;
    case 'ACI':
      return meas.connectedCurrent ? meas.iacRms : 0;
    case '2WR':
      return meas.connectedMain ? meas.ohms2W : Infinity;
    case '4WR':
      return meas.connectedMain ? meas.ohms4W : Infinity;
    case 'CAP':
      return meas.connectedMain ? meas.farads : Number.NaN;
    case 'FREQ':
      return meas.connectedMain ? meas.freqHz : 0;
    case 'PER':
      return meas.connectedMain && meas.freqHz > 0.5 ? 1 / meas.freqHz : Infinity;
    case 'CONT':
      return meas.connectedMain ? meas.contOhms : Infinity;
    case 'DIODE':
      return meas.connectedMain ? meas.diodeVf : Infinity;
    case 'SENSOR':
      // Simulated Type-K thermocouple: ~41 µV/°C above 25°C ambient (or direct V * 20 when plugged)
      return meas.connectedMain ? Math.max(-200, Math.min(1372, 25.0 + meas.vdc * 20)) : 25.0;
  }
}

export function resolveAutoRangeIndex(func: DM3058Function, absVal: number): number {
  const ranges = DM3058_RANGES[func];
  if (!Number.isFinite(absVal)) return ranges.length - 1;
  for (let i = 0; i < ranges.length; i++) {
    if (absVal <= ranges[i].maxOverrange) return i;
  }
  return ranges.length - 1;
}

/**
 * Formats number in RIGOL DM3058 style: e.g. 3.997,47V (comma grouping after 3rd decimal)
 * or compact 05.0624V / 095.337mA when compactDual=true.
 */
function insertRigolDecimalComma(fixedStr: string, useComma: boolean): string {
  if (!useComma) return fixedStr;
  const dotIdx = fixedStr.indexOf('.');
  if (dotIdx < 0) return fixedStr;
  const intPart = fixedStr.slice(0, dotIdx);
  const fracPart = fixedStr.slice(dotIdx + 1);
  if (fracPart.length <= 3) return fixedStr;
  return `${intPart}.${fracPart.slice(0, 3)},${fracPart.slice(3)}`;
}

export interface FormattedDM3058Reading {
  text: string;
  unit: string;
  rangeLabel: string;
  overloaded: boolean;
}

export function formatDM3058Reading(
  func: DM3058Function,
  rawVal: number,
  rangeIdx: number,
  autoRange: boolean,
  speed: DM3058State['speed'],
  compactDual = false
): FormattedDM3058Reading {
  const ranges = DM3058_RANGES[func];
  const effectiveIdx = autoRange
    ? resolveAutoRangeIndex(func, Math.abs(rawVal))
    : Math.min(Math.max(0, rangeIdx), ranges.length - 1);
  const spec = ranges[effectiveIdx];

  if (func === 'CONT') {
    if (!Number.isFinite(rawVal) || rawVal > 2000) {
      return { text: 'OPEN', unit: 'Ω', rangeLabel: spec.label, overloaded: false };
    }
    return {
      text: `${rawVal.toFixed(1)}`,
      unit: 'Ω',
      rangeLabel: spec.label,
      overloaded: false,
    };
  }

  if (func === 'DIODE') {
    if (!Number.isFinite(rawVal) || rawVal > 2.25) {
      return { text: 'OPEN', unit: 'V', rangeLabel: spec.label, overloaded: false };
    }
    return {
      text: insertRigolDecimalComma(Math.max(0, rawVal).toFixed(4), !compactDual),
      unit: 'V',
      rangeLabel: spec.label,
      overloaded: false,
    };
  }

  if (func === 'CAP') {
    if (!Number.isFinite(rawVal) || rawVal <= 0) {
      return { text: compactDual ? '----nF' : 'OPEN', unit: spec.unit, rangeLabel: spec.label, overloaded: false };
    }
  }

  if (func === '2WR' || func === '4WR') {
    if (!Number.isFinite(rawVal) || rawVal > 1.05e8) {
      return { text: 'OPEN', unit: 'MΩ', rangeLabel: spec.label, overloaded: true };
    }
  }

  if (func === 'FREQ') {
    if (!Number.isFinite(rawVal) || rawVal <= 0.1) {
      return { text: '0.000,0Hz'.replace(',0Hz', ''), unit: 'Hz', rangeLabel: 'Auto', overloaded: false };
    }
    if (rawVal >= 1e6) return { text: `${(rawVal / 1e6).toFixed(compactDual ? 4 : 5)}`, unit: 'MHz', rangeLabel: 'Auto', overloaded: false };
    if (rawVal >= 1e3) return { text: `${(rawVal / 1e3).toFixed(compactDual ? 4 : 5)}`, unit: 'kHz', rangeLabel: 'Auto', overloaded: false };
    return { text: `${rawVal.toFixed(compactDual ? 3 : 4)}`, unit: 'Hz', rangeLabel: 'Auto', overloaded: false };
  }

  if (func === 'PER') {
    if (!Number.isFinite(rawVal) || rawVal > 5) {
      return { text: '0.0000', unit: 'ms', rangeLabel: 'Auto', overloaded: false };
    }
    if (rawVal < 1e-3) return { text: `${(rawVal * 1e6).toFixed(2)}`, unit: 'µs', rangeLabel: 'Auto', overloaded: false };
    if (rawVal < 1) return { text: `${(rawVal * 1e3).toFixed(4)}`, unit: 'ms', rangeLabel: 'Auto', overloaded: false };
    return { text: `${rawVal.toFixed(4)}`, unit: 's', rangeLabel: 'Auto', overloaded: false };
  }

  if (!Number.isFinite(rawVal) || Math.abs(rawVal) > spec.maxOverrange * 1.0001) {
    return { text: 'OVERLOAD', unit: spec.unit, rangeLabel: spec.label, overloaded: true };
  }

  const scaled = rawVal * spec.unitScale;
  const decimals = speed === 'S' ? spec.decimals5 : spec.decimals4;
  const absScaled = Math.abs(scaled);
  const sign = rawVal < -0.5e-7 ? '-' : '';
  const digitsStr = absScaled.toFixed(decimals);

  if (compactDual) {
    const intDigits = digitsStr.split('.')[0];
    const padInt = spec.fullScale * spec.unitScale >= 100 && intDigits.length < 3
      ? intDigits.padStart(3, '0')
      : spec.fullScale * spec.unitScale >= 10 && intDigits.length < 2
        ? intDigits.padStart(2, '0')
        : intDigits;
    const dot = digitsStr.indexOf('.');
    const finalNum = dot >= 0 ? `${padInt}${digitsStr.slice(dot)}` : padInt;
    return {
      text: `${sign}${finalNum}`,
      unit: spec.unit,
      rangeLabel: spec.label,
      overloaded: false,
    };
  }

  return {
    text: `${sign}${insertRigolDecimalComma(digitsStr, decimals >= 4)}`,
    unit: spec.unit,
    rangeLabel: spec.label,
    overloaded: false,
  };
}

export function getDM3058Softkeys(state: DM3058State): DM3058SoftkeyItem[] {
  switch (state.menu) {
    case 'MAIN':
      return [
        { label: 'Auto', active: state.autoRange },
        { label: 'Rng+' },
        { label: 'Rng-' },
        { label: 'History' },
        { label: state.mathMode === 'REL' ? 'REL' : 'Null', active: state.mathMode === 'REL' },
        { label: state.dualEnabled ? 'DualOff' : 'Hide', active: state.dualEnabled },
      ];
    case 'MEAS':
      return [
        { label: `Spd:${state.speed}`, active: true },
        { label: `Z:${state.inputZ}`, active: state.inputZ === '>10G' },
        { label: 'Dual', active: state.dualEnabled },
        { label: 'ContΩ' },
        { label: state.beeper ? 'Beep:ON' : 'Beep:OF', active: state.beeper },
        { label: 'Back' },
      ];
    case 'MATH':
      return [
        { label: 'REL', active: state.mathMode === 'REL' },
        { label: 'STAT', active: state.mathMode === 'STAT' },
        { label: 'dBm', active: state.mathMode === 'dBm' },
        { label: 'dB', active: state.mathMode === 'dB' },
        { label: 'P/F', active: state.mathMode === 'PF' },
        { label: 'Off', active: state.mathMode === 'OFF' },
      ];
    case 'TRIG':
      return [
        { label: 'Auto', active: state.trigSource === 'AUTO' },
        { label: 'Single', active: state.trigSource === 'SINGLE' },
        { label: 'Hold', active: state.runState === 'HOLD' },
        { label: 'ClrSt' },
        { label: '' },
        { label: 'Back' },
      ];
    case 'SAVE':
      return [
        { label: 'Save1' },
        { label: 'Save2' },
        { label: 'Save3' },
        { label: 'Load1' },
        { label: 'Load2' },
        { label: 'Back' },
      ];
    case 'UTILITY':
      return [
        { label: 'Info' },
        { label: state.beeper ? 'BeepON' : 'BeepOF', active: state.beeper },
        { label: 'Contr+' },
        { label: 'Contr-' },
        { label: 'Reset' },
        { label: 'Back' },
      ];
    case 'HISTORY':
      return [
        { label: 'Clear' },
        { label: 'Hold', active: state.runState === 'HOLD' },
        { label: 'STAT', active: state.mathMode === 'STAT' },
        { label: '' },
        { label: '' },
        { label: 'Back' },
      ];
    case 'PRESET':
      return [
        { label: 'DCV 5½' },
        { label: 'AC+Hz' },
        { label: 'V+I' },
        { label: '4W Ω' },
        { label: 'Diode' },
        { label: 'Back' },
      ];
    case 'HELP':
      return [
        { label: 'Keys', active: state.helpTopic === 'Keys' },
        { label: 'Jacks', active: state.helpTopic === 'Jacks' },
        { label: 'Math', active: state.helpTopic === 'Math' },
        { label: '4WR', active: state.helpTopic === '4WR' },
        { label: 'Dual', active: state.helpTopic === 'Dual' },
        { label: 'Back' },
      ];
  }
}

function readSlots(): Record<number, Partial<DM3058State>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<number, Partial<DM3058State>>) : {};
  } catch {
    return {};
  }
}

function writeSlots(slots: Record<number, Partial<DM3058State>>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slots));
  } catch {
    // ignore storage quota errors
  }
}

export function pressDM3058Button(
  prev: DM3058State,
  btn: DM3058ButtonId,
  liveMeas: DM3058MeasurementPacket = DM3058_EMPTY_MEAS
): DM3058State {
  if (btn === 'POWER') {
    return { ...prev, power: !prev.power, secondShift: false, popupText: null, dirtySeq: prev.dirtySeq + 1 };
  }
  if (!prev.power) return prev;

  const next: DM3058State = { ...prev, popupText: null, dirtySeq: prev.dirtySeq + 1 };

  const selectPrimaryFunc = (f: DM3058Function) => {
    if (next.secondShift) {
      if (f === '2WR') next.func = '4WR';
      else if (f === 'FREQ') next.func = 'PER';
      else {
        next.dualEnabled = true;
        next.viceFunc = f;
        next.secondShift = false;
        next.menu = 'MAIN';
        next.menuHidden = false;
        return;
      }
      next.secondShift = false;
      next.rangeIndex = defaultRangeIndexFor(next.func);
      next.menu = 'MAIN';
      next.menuHidden = false;
      return;
    }
    next.func = f;
    next.rangeIndex = defaultRangeIndexFor(f);
    next.runState = 'RUN';
    next.heldPrimary = null;
    next.heldSecondary = null;
    next.statMin = null;
    next.statMax = null;
    next.statSum = 0;
    next.statCount = 0;
    next.menu = 'MAIN';
    next.menuHidden = false;
  };

  switch (btn) {
    case 'DCV':
      selectPrimaryFunc('DCV');
      return next;
    case 'ACV':
      selectPrimaryFunc('ACV');
      return next;
    case 'DCI':
      selectPrimaryFunc('DCI');
      return next;
    case 'ACI':
      selectPrimaryFunc('ACI');
      return next;
    case 'OHM':
      selectPrimaryFunc('2WR');
      return next;
    case 'CONT':
      selectPrimaryFunc('CONT');
      return next;
    case 'FREQ':
      selectPrimaryFunc('FREQ');
      return next;
    case 'CAP':
      selectPrimaryFunc('CAP');
      return next;
    case 'DIODE':
      selectPrimaryFunc('DIODE');
      return next;
    case 'SENSOR':
      selectPrimaryFunc('SENSOR');
      return next;
    case 'SECOND':
      next.secondShift = !next.secondShift;
      return next;
    case 'PRESET':
      next.secondShift = false;
      next.menuHidden = false;
      next.menu = next.menu === 'PRESET' ? 'MAIN' : 'PRESET';
      return next;
    case 'RUN_HOLD':
      if (next.runState === 'RUN') {
        next.runState = 'HOLD';
        next.heldPrimary = extractRawValue(next.func, liveMeas);
        next.heldSecondary = next.dualEnabled ? extractRawValue(next.viceFunc, liveMeas) : null;
      } else {
        next.runState = 'RUN';
        next.trigSource = 'AUTO';
        next.heldPrimary = null;
        next.heldSecondary = null;
      }
      return next;
    case 'SINGLE':
      if (next.secondShift) {
        next.secondShift = false;
        next.popupText = 'Local Control Active';
        return next;
      }
      next.trigSource = 'SINGLE';
      next.runState = 'HOLD';
      next.heldPrimary = extractRawValue(next.func, liveMeas);
      next.heldSecondary = next.dualEnabled ? extractRawValue(next.viceFunc, liveMeas) : null;
      return next;
    case 'UP': {
      const len = DM3058_RANGES[next.func].length;
      next.autoRange = false;
      next.rangeIndex = Math.min(len - 1, next.rangeIndex + 1);
      return next;
    }
    case 'DOWN':
      next.autoRange = false;
      next.rangeIndex = Math.max(0, next.rangeIndex - 1);
      return next;
    case 'AUTO':
      next.autoRange = true;
      next.menu = 'MAIN';
      next.menuHidden = false;
      return next;
    case 'LEFT':
    case 'RIGHT': {
      const dir = btn === 'RIGHT' ? 1 : -1;
      if (next.menu === 'HELP') {
        const idx = HELP_TOPICS.indexOf(next.helpTopic);
        next.helpTopic = HELP_TOPICS[(idx + dir + HELP_TOPICS.length) % HELP_TOPICS.length];
      } else if (next.mathMode === 'dBm') {
        const idx = DBM_IMPEDANCES.indexOf(next.dbmRefOhms);
        const cur = idx < 0 ? 0 : idx;
        next.dbmRefOhms = DBM_IMPEDANCES[(cur + dir + DBM_IMPEDANCES.length) % DBM_IMPEDANCES.length];
      } else {
        const speeds: ReadonlyArray<DM3058State['speed']> = ['S', 'M', 'F'];
        const idx = speeds.indexOf(next.speed);
        next.speed = speeds[(idx + dir + speeds.length) % speeds.length];
      }
      return next;
    }
    case 'MEAS':
      next.menuHidden = false;
      next.menu = next.menu === 'MEAS' ? 'MAIN' : 'MEAS';
      return next;
    case 'MATH':
      next.menuHidden = false;
      next.menu = next.menu === 'MATH' ? 'MAIN' : 'MATH';
      return next;
    case 'TRIG':
      next.menuHidden = false;
      next.menu = next.menu === 'TRIG' ? 'MAIN' : 'TRIG';
      return next;
    case 'HELP':
      next.menuHidden = false;
      next.menu = next.menu === 'HELP' ? 'MAIN' : 'HELP';
      return next;
    case 'SAVE':
      next.menuHidden = false;
      next.menu = next.menu === 'SAVE' ? 'MAIN' : 'SAVE';
      return next;
    case 'UTILITY':
      next.menuHidden = false;
      next.menu = next.menu === 'UTILITY' ? 'MAIN' : 'UTILITY';
      return next;
    case 'SOFT_0':
    case 'SOFT_1':
    case 'SOFT_2':
    case 'SOFT_3':
    case 'SOFT_4':
    case 'SOFT_5': {
      const slot = Number(btn.slice(5));
      if (next.menuHidden) {
        next.menuHidden = false;
        return next;
      }
      switch (next.menu) {
        case 'MAIN':
          if (slot === 0) next.autoRange = true;
          else if (slot === 1) {
            next.autoRange = false;
            next.rangeIndex = Math.min(DM3058_RANGES[next.func].length - 1, next.rangeIndex + 1);
          } else if (slot === 2) {
            next.autoRange = false;
            next.rangeIndex = Math.max(0, next.rangeIndex - 1);
          } else if (slot === 3) {
            next.menu = 'HISTORY';
          } else if (slot === 4) {
            if (next.mathMode === 'REL') next.mathMode = 'OFF';
            else {
              next.mathMode = 'REL';
              next.relRef = extractRawValue(next.func, liveMeas);
            }
          } else if (slot === 5) {
            if (next.dualEnabled) next.dualEnabled = false;
            else next.menuHidden = true;
          }
          return next;
        case 'MEAS':
          if (slot === 0) {
            next.speed = next.speed === 'S' ? 'M' : next.speed === 'M' ? 'F' : 'S';
          } else if (slot === 1) {
            next.inputZ = next.inputZ === '10M' ? '>10G' : '10M';
          } else if (slot === 2) {
            next.dualEnabled = !next.dualEnabled;
            if (next.dualEnabled && next.viceFunc === next.func) {
              next.viceFunc = next.func === 'DCV' ? 'DCI' : 'FREQ';
            }
          } else if (slot === 3) {
            next.contThresholdOhms = next.contThresholdOhms === 50 ? 10 : next.contThresholdOhms === 10 ? 100 : 50;
            next.popupText = `Cont < ${next.contThresholdOhms} Ω`;
          } else if (slot === 4) {
            next.beeper = !next.beeper;
          } else {
            next.menu = 'MAIN';
          }
          return next;
        case 'MATH':
          if (slot === 0) {
            next.mathMode = 'REL';
            next.relRef = extractRawValue(next.func, liveMeas);
          } else if (slot === 1) {
            next.mathMode = 'STAT';
          } else if (slot === 2) {
            next.mathMode = 'dBm';
          } else if (slot === 3) {
            next.mathMode = 'dB';
            next.dbRefVolts = Math.max(1e-3, Math.abs(extractRawValue(next.func, liveMeas)) || 1.0);
          } else if (slot === 4) {
            next.mathMode = 'PF';
          } else {
            next.mathMode = 'OFF';
            next.menu = 'MAIN';
          }
          return next;
        case 'TRIG':
          if (slot === 0) {
            next.trigSource = 'AUTO';
            next.runState = 'RUN';
          } else if (slot === 1) {
            next.trigSource = 'SINGLE';
            next.runState = 'HOLD';
            next.heldPrimary = extractRawValue(next.func, liveMeas);
          } else if (slot === 2) {
            next.runState = next.runState === 'RUN' ? 'HOLD' : 'RUN';
          } else if (slot === 3) {
            next.statMin = null;
            next.statMax = null;
            next.statSum = 0;
            next.statCount = 0;
            next.history = [];
          } else if (slot === 5) {
            next.menu = 'MAIN';
          }
          return next;
        case 'SAVE': {
          if (slot <= 2) {
            const slotNum = slot + 1;
            const slots = readSlots();
            slots[slotNum] = {
              func: next.func,
              dualEnabled: next.dualEnabled,
              viceFunc: next.viceFunc,
              autoRange: next.autoRange,
              rangeIndex: next.rangeIndex,
              speed: next.speed,
              mathMode: next.mathMode,
            };
            writeSlots(slots);
            next.savedSlots = Array.from(new Set([...next.savedSlots, slotNum]));
            next.popupText = `Saved Preset #${slotNum}`;
          } else if (slot === 3 || slot === 4) {
            const slotNum = slot - 2;
            const loaded = readSlots()[slotNum];
            if (loaded) {
              Object.assign(next, loaded);
              next.popupText = `Loaded Preset #${slotNum}`;
            } else {
              next.popupText = `Slot #${slotNum} Empty`;
            }
          } else {
            next.menu = 'MAIN';
          }
          return next;
        }
        case 'UTILITY':
          if (slot === 0) next.popupText = 'RIGOL DM3058 FW:01.01 LXI 5½';
          else if (slot === 1) next.beeper = !next.beeper;
          else if (slot === 2) next.contrast = Math.min(9, next.contrast + 1);
          else if (slot === 3) next.contrast = Math.max(1, next.contrast - 1);
          else if (slot === 4) return createInitialDM3058State();
          else next.menu = 'MAIN';
          return next;
        case 'HISTORY':
          if (slot === 0) next.history = [];
          else if (slot === 1) next.runState = next.runState === 'RUN' ? 'HOLD' : 'RUN';
          else if (slot === 2) next.mathMode = next.mathMode === 'STAT' ? 'OFF' : 'STAT';
          else if (slot === 5) next.menu = 'MAIN';
          return next;
        case 'PRESET':
          if (slot === 0) {
            next.func = 'DCV';
            next.dualEnabled = false;
            next.speed = 'S';
            next.autoRange = true;
          } else if (slot === 1) {
            next.func = 'ACV';
            next.dualEnabled = true;
            next.viceFunc = 'FREQ';
            next.autoRange = true;
          } else if (slot === 2) {
            next.func = 'DCV';
            next.dualEnabled = true;
            next.viceFunc = 'DCI';
            next.autoRange = true;
          } else if (slot === 3) {
            next.func = '4WR';
            next.dualEnabled = false;
            next.autoRange = true;
          } else if (slot === 4) {
            next.func = 'DIODE';
            next.dualEnabled = false;
          }
          next.menu = 'MAIN';
          return next;
        case 'HELP':
          if (slot < 5) next.helpTopic = HELP_TOPICS[slot];
          else next.menu = 'MAIN';
          return next;
      }
    }
  }
}
