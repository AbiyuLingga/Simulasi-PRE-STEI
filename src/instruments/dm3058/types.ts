export type DM3058Function =
  | 'DCV'
  | 'ACV'
  | 'DCI'
  | 'ACI'
  | '2WR'
  | '4WR'
  | 'CAP'
  | 'FREQ'
  | 'PER'
  | 'CONT'
  | 'DIODE'
  | 'SENSOR';

export type DM3058Speed = 'S' | 'M' | 'F';
export type DM3058InputZ = '10M' | '>10G';
export type DM3058MathMode = 'OFF' | 'REL' | 'STAT' | 'dBm' | 'dB' | 'PF';
export type DM3058Menu =
  | 'MAIN'
  | 'MEAS'
  | 'MATH'
  | 'TRIG'
  | 'SAVE'
  | 'UTILITY'
  | 'HISTORY'
  | 'PRESET'
  | 'HELP';

export type DM3058HelpTopic = 'Keys' | 'Jacks' | 'Math' | '4WR' | 'Dual';

export type DM3058ButtonId =
  | 'POWER'
  | 'DCV'
  | 'ACV'
  | 'DCI'
  | 'ACI'
  | 'OHM'
  | 'CONT'
  | 'FREQ'
  | 'CAP'
  | 'DIODE'
  | 'SENSOR'
  | 'PRESET'
  | 'SECOND'
  | 'RUN_HOLD'
  | 'SINGLE'
  | 'UP'
  | 'DOWN'
  | 'LEFT'
  | 'RIGHT'
  | 'AUTO'
  | 'MEAS'
  | 'MATH'
  | 'TRIG'
  | 'HELP'
  | 'SAVE'
  | 'UTILITY'
  | 'SOFT_0'
  | 'SOFT_1'
  | 'SOFT_2'
  | 'SOFT_3'
  | 'SOFT_4'
  | 'SOFT_5';

export interface DM3058State {
  power: boolean;
  func: DM3058Function;
  dualEnabled: boolean;
  viceFunc: DM3058Function;
  autoRange: boolean;
  rangeIndex: number;
  speed: DM3058Speed;
  inputZ: DM3058InputZ;
  runState: 'RUN' | 'HOLD';
  heldPrimary: number | null;
  heldSecondary: number | null;
  trigSource: 'AUTO' | 'SINGLE' | 'EXT';
  secondShift: boolean;
  menu: DM3058Menu;
  menuHidden: boolean;
  mathMode: DM3058MathMode;
  relRef: number;
  dbmRefOhms: number;
  dbRefVolts: number;
  pfLow: number;
  pfHigh: number;
  beeper: boolean;
  contThresholdOhms: number;
  contrast: number;
  history: number[];
  statMin: number | null;
  statMax: number | null;
  statSum: number;
  statCount: number;
  savedSlots: number[];
  helpTopic: DM3058HelpTopic;
  popupText: string | null;
  dirtySeq: number;
}

export interface DM3058MeasurementPacket {
  connectedMain: boolean;
  connectedCurrent: boolean;
  connectedSense: boolean;
  vdc: number;
  vacRms: number;
  idc: number;
  iacRms: number;
  ohms2W: number;
  ohms4W: number;
  farads: number;
  freqHz: number;
  diodeVf: number;
  contOhms: number;
  sampleSeq: number;
}

export interface DM3058SoftkeyItem {
  label: string;
  active?: boolean;
}
