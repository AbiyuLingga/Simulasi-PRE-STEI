import { create } from 'zustand';
import { labAudio } from '../audio/labAudio';
import {
  createInitialDM3058State,
  pressDM3058Button as reduceDM3058Button,
} from '../instruments/dm3058/state';
import type { DM3058ButtonId, DM3058State } from '../instruments/dm3058/types';
import { computeAutoSetup } from '../instruments/ds1000e/dsp';
import { handleSoftKeyPress, type MenuActionContext } from '../instruments/ds1000e/menus';
import {
  HELP_TEXT_MAP,
  adjustMultiTarget,
  createInitialDS1000EState,
  formatTimeValue,
  openMenu,
  stepTimePerDiv,
  stepVoltsPerDiv,
} from '../instruments/ds1000e/state';
import type { DS1000EState, MenuId, VerticalTarget } from '../instruments/ds1000e/types';
import {
  computePlacementPreview,
  defaultFloatOffsetForHole,
  floatingJumperSocketId,
  floatingJumperTipWorldPos,
  formatPartLabel,
  getOccupiedHoles,
  holeIdToWorldPos,
  movePartToAnchor,
  rotateFloatOffset90,
  rotatePart90,
} from '../simulation/breadboard/breadboardModel';
import type {
  BreadboardComponentKind,
  BreadboardPart,
  CableConnection,
  CableKind,
  FaultEvent,
  KitControlState,
  KitId,
  PowerSupplyConfig,
  SignalGenConfig,
  SocketId,
} from '../simulation/circuit/types';
import { socketRegistry } from '../render/cables/socketRegistry';
import { KIT_SOCKETS } from '../simulation/kits/kitDefinitions';
import {
  getTutorialById,
  getTutorialProgress,
  inferBananaCableColor,
  type TutorialId,
  type TutorialInstrumentPreset,
} from '../tutorials/moduleTutorials';
import { hotRefs } from './hotRefs';

export type CameraTarget = 'bench' | 'rigol' | 'dmm' | 'kit' | 'bb' | 'gen' | 'psu' | 'pot';
export type DrawerTab = 'kit' | 'tutorial' | 'bb' | 'cable' | 'gpu';
export type GraphicsQuality = 'high' | 'medium' | 'low';
export type BreadboardViewMode = 'standard' | 'voltage' | 'current';

export interface PlacingPartSpec {
  kind: BreadboardComponentKind;
  label: string;
  value: number;
  span: number;
  color?: string;
  rotationDeg?: 0 | 90 | 180 | 270;
  anchorHoleA?: string | null;
  waypoints?: [number, number][];
  floating?: boolean;
}

export type WiringPresetId =
  | 'dual_trace'
  | 'probe_comp'
  | 'kit_rlrc_transient'
  | 'kit_osc_phase'
  | 'kit_multimeter_div'
  | 'kit_thevenin'
  | 'bb_rc_test'
  | 'gen_ch1'
  | 'psu_ch1'
  | 'clear';

export type BreadboardPresetId =
  | 'starter'
  | 'rc_lpf'
  | 'rlc_series'
  | 'led_demo'
  | 'opamp_inv'
  | 'opamp_noninv'
  | 'superposition'
  | 'rlc_damping'
  | 'res_seri'
  | 'res_paralel'
  | 'res_sp1'
  | 'res_sp2'
  | 'filter_notch'
  | 'filter_bandpass'
  | 'clear';

export interface GPUInfoState {
  renderer: string;
  vendor: string;
  isSoftwareFallback: boolean;
  drawCalls: number;
  triangles: number;
}

export interface LabStoreState {
  cameraTarget: CameraTarget;
  prevCameraTarget: CameraTarget;
  cameraPresetSeq: number;
  activeDrawer: DrawerTab | null;
  hoverLabel: string | null;
  grabbedEnd: { cableId: string; end: 'endA' | 'endB' | 'gndClip' } | null;

  cables: CableConnection[];
  signalGen: SignalGenConfig;
  powerSupply: PowerSupplyConfig;
  scope: DS1000EState;
  activeFaults: FaultEvent[];

  activeKit: KitId;
  kitSelected: boolean;
  kitPickerOpen: boolean;
  kitControls: KitControlState;
  dm3058: DM3058State;
  breadboardParts: BreadboardPart[];
  placingPart: PlacingPartSpec | null;
  selectedBreadboardPartId: string | null;
  reshapingPart: { partId: string; mode: 'pinA' | 'pinB' | 'move' } | null;
  breadboardMode: boolean;
  breadboard2D: boolean;
  breadboard2DFitSeq: number;
  breadboardViewMode: BreadboardViewMode;
  breadboardShowPins: boolean;
  breadboardUndoStack: BreadboardPart[][];
  breadboardRedoStack: BreadboardPart[][];
  activeTutorialId: TutorialId | null;
  tutorialStepIndex: number;
  tutorialCollapsed: boolean;
  worksheetOpen: boolean;

  graphics: {
    quality: GraphicsQuality;
    bloom: boolean;
    shadows: boolean;
    soundEnabled: boolean;
  };
  gpuInfo: GPUInfoState;

  // Actions
  setCameraTarget: (t: CameraTarget) => void;
  setActiveDrawer: (d: DrawerTab | null) => void;
  setHoverLabel: (label: string | null) => void;
  setGPUInfo: (info: GPUInfoState) => void;
  setGraphics: (patch: Partial<LabStoreState['graphics']>) => void;
  setFaults: (faults: FaultEvent[]) => void;
  clearFaults: () => void;

  // Cable & placement interactions
  clickSocket: (socketId: SocketId, preferredColor?: string, preferredKind?: CableKind) => void;
  grabCableEnd: (cableId: string, end: 'endA' | 'endB' | 'gndClip') => void;
  dropOrSnapCableEnd: (targetSocket: SocketId | null, worldPos?: [number, number, number]) => void;
  spawnCable: (kind: CableKind) => void;

  // Guided module tutorials
  startTutorial: (id: TutorialId) => void;
  stopTutorial: () => void;
  setTutorialStep: (idx: number) => void;
  toggleTutorialCollapsed: () => void;
  toggleWorksheet: () => void;
  autoWireCurrentTutorialStep: () => void;
  applyTutorialInstrumentPreset: (preset: TutorialInstrumentPreset) => void;
  removeCable: (cableId: string) => void;
  setCableProbeAtten: (cableId: string, atten: 1 | 10) => void;
  setCableProbeCompTrim: (cableId: string, trim: number) => void;
  applyWiringPreset: (presetId: WiringPresetId) => void;

  // Kits, DM3058 & Breadboard actions
  setActiveKit: (kitId: KitId) => void;
  selectKitBox: (selected: boolean) => void;
  setKitPickerOpen: (open: boolean) => void;
  updateKitControls: (patch: Partial<KitControlState>) => void;
  pressDM3058Button: (btn: DM3058ButtonId) => void;
  enterBreadboardMode: (use2D?: boolean) => void;
  exitBreadboardMode: () => void;
  setBreadboard2D: (v: boolean) => void;
  resetBreadboard2DView: () => void;
  setBreadboardViewMode: (mode: BreadboardViewMode) => void;
  toggleBreadboardShowPins: () => void;
  setPlacingVariant: (patch: Partial<Pick<PlacingPartSpec, 'value' | 'label' | 'color'>>) => void;
  undoBreadboard: () => void;
  redoBreadboard: () => void;
  startPlacingPart: (spec: PlacingPartSpec | null) => void;
  cyclePlacingSpan: () => void;
  rotatePlacingPart: () => void;
  setPlacingColor: (color: string) => void;
  anchorPlacingHoleA: (holeId: string) => void;
  addPlacingWaypoint: (lx: number, lz: number) => void;
  stepBackPlacing: () => void;
  togglePlacingFloating: () => void;
  commitFloatingJumper: (holeA: string, rotationDeg?: 0 | 90 | 180 | 270) => void;
  toggleJumperFloating: (partId: string) => void;
  pullAlligatorFromFloatingJumper: (partId: string) => void;
  pullBncAlligatorFromFloatingJumper: (partId: string) => void;
  commitPlacedPart: (holeA: string, holeB: string, waypoints?: [number, number][]) => void;
  placePartAtHole: (holeA: string) => void;
  selectBreadboardPart: (id: string | null) => void;
  startReshapingPart: (partId: string, mode: 'pinA' | 'pinB' | 'move') => void;
  commitReshapePart: (targetHole: string) => void;
  updateBreadboardPart: (id: string, patch: Partial<Pick<BreadboardPart, 'value' | 'color' | 'label'>>) => void;
  flipBreadboardPart: (id: string) => void;
  rotateBreadboardPart: (id: string) => void;
  removeBreadboardPart: (id: string) => void;
  toggleBreadboardVoltageView: () => void;
  applyBreadboardPreset: (presetId: BreadboardPresetId) => void;

  // Simple instrument controls
  updateSignalGen: (patch: Partial<SignalGenConfig>) => void;
  updatePowerSupply: (patch: Partial<PowerSupplyConfig>) => void;

  // Rigol DS1000E physical panel controls
  pressScopeButton: (btn: string) => void;
  longPressScopeHelp: (btn: string) => void;
  pressScopeSoftKey: (slotIdx: 0 | 1 | 2 | 3 | 4) => void;
  turnScopeKnob: (knob: 'VERT_POS' | 'VERT_SCALE' | 'HORIZ_POS' | 'HORIZ_SCALE' | 'TRIG_LEVEL' | 'MULTI', steps: number) => void;
  pushScopeKnob: (knob: 'VERT_POS' | 'VERT_SCALE' | 'HORIZ_POS' | 'HORIZ_SCALE' | 'TRIG_LEVEL' | 'MULTI') => void;
  syncScopeTriggerStatus: (status: DS1000EState['trigger']['status']) => void;
}

const STORAGE_SLOTS_KEY = 'el2101_ds1000e_slots_v1';

function readSavedSlots(): Record<number, Partial<DS1000EState>> {
  try {
    const raw = localStorage.getItem(STORAGE_SLOTS_KEY);
    return raw ? (JSON.parse(raw) as Record<number, Partial<DS1000EState>>) : {};
  } catch {
    return {};
  }
}

function writeSavedSlots(slots: Record<number, Partial<DS1000EState>>): void {
  try {
    localStorage.setItem(STORAGE_SLOTS_KEY, JSON.stringify(slots));
  } catch {
    // ignore
  }
}

function makeStarterBreadboardParts(): BreadboardPart[] {
  return [
    { id: 'bb_r1', kind: 'resistor', label: '1kΩ', value: 1000, holeA: 't_10_c', holeB: 't_16_c' },
    { id: 'bb_c1', kind: 'capacitor', label: '100nF', value: 100e-9, holeA: 't_16_b', holeB: 'tn_14' },
    { id: 'bb_d1', kind: 'diode', label: '1N4148', value: 0.7, holeA: 'b_12_g', holeB: 'b_18_g' },
    { id: 'bb_r2', kind: 'resistor', label: '330Ω', value: 330, holeA: 't_28_c', holeB: 't_34_c' },
    { id: 'bb_led1', kind: 'led', label: 'LED Merah', value: 1.9, holeA: 't_34_b', holeB: 't_38_b', color: '#ef4444' },
    { id: 'bb_l1', kind: 'inductor', label: '2.5mH', value: 2.5e-3, holeA: 'b_46_h', holeB: 'b_52_h' },
  ];
}

function buildBreadboardPresetParts(presetId: BreadboardPresetId): BreadboardPart[] {
  if (presetId === 'starter') return makeStarterBreadboardParts();
  if (presetId === 'rc_lpf') {
    return [
      { id: 'bb_rc_r1', kind: 'resistor', label: '1kΩ', value: 1000, holeA: 't_12_c', holeB: 't_18_c' },
      { id: 'bb_rc_c1', kind: 'capacitor', label: '100nF', value: 100e-9, holeA: 't_18_b', holeB: 'tn_15' },
    ];
  }
  if (presetId === 'rlc_series') {
    return [
      { id: 'bb_rlc_r', kind: 'resistor', label: '100Ω', value: 100, holeA: 't_10_c', holeB: 't_16_c' },
      { id: 'bb_rlc_l', kind: 'inductor', label: '2.5mH', value: 2.5e-3, holeA: 't_16_b', holeB: 't_22_b' },
      { id: 'bb_rlc_c', kind: 'capacitor', label: '100nF', value: 100e-9, holeA: 't_22_c', holeB: 'tn_19' },
    ];
  }
  if (presetId === 'led_demo') {
    return [
      { id: 'bb_led_r', kind: 'resistor', label: '330Ω', value: 330, holeA: 't_24_c', holeB: 't_30_c' },
      { id: 'bb_led_d', kind: 'led', label: 'LED Merah', value: 1.9, holeA: 't_30_b', holeB: 'tn_28', color: '#ef4444' },
    ];
  }
  if (presetId === 'opamp_inv') {
    return [
      { id: 'bb_ic_741', kind: 'opamp741', label: 'LM741', value: 5000, holeA: 't_28_e', holeB: 'b_31_f' },
      { id: 'bb_inv_rin', kind: 'resistor', label: '10kΩ', value: 10_000, holeA: 'b_23_g', holeB: 'b_29_g' },
      { id: 'bb_inv_rf', kind: 'resistor', label: '22kΩ', value: 22_000, holeA: 'b_29_h', holeB: 't_30_b' },
      { id: 'bb_inv_gnd', kind: 'jumper', label: 'Jumper', value: 0, holeA: 'b_30_j', holeB: 'tn_26', color: '#18181b' },
    ];
  }
  if (presetId === 'opamp_noninv') {
    return [
      { id: 'bb_ic_741', kind: 'opamp741', label: 'LM741', value: 5000, holeA: 't_28_e', holeB: 'b_31_f' },
      { id: 'bb_oni_rg', kind: 'resistor', label: '10kΩ', value: 10_000, holeA: 'b_29_g', holeB: 'tn_26' },
      { id: 'bb_oni_rf', kind: 'resistor', label: '22kΩ', value: 22_000, holeA: 'b_29_h', holeB: 't_30_b' },
    ];
  }
  if (presetId === 'superposition') {
    return [
      { id: 'bb_sup_r1', kind: 'resistor', label: '1kΩ', value: 1_000, holeA: 't_10_c', holeB: 't_18_c' },
      { id: 'bb_sup_r2', kind: 'resistor', label: '2.2kΩ', value: 2_200, holeA: 't_18_b', holeB: 'tn_18' },
      { id: 'bb_sup_r3', kind: 'resistor', label: '1kΩ', value: 1_000, holeA: 't_18_d', holeB: 't_26_d' },
    ];
  }
  if (presetId === 'rlc_damping') {
    return [
      { id: 'bb_dmp_l', kind: 'inductor', label: '2.5mH', value: 2.5e-3, holeA: 't_16_c', holeB: 't_22_c' },
      { id: 'bb_dmp_c', kind: 'capacitor', label: '100nF', value: 100e-9, holeA: 't_22_b', holeB: 'tn_19' },
    ];
  }
  if (presetId === 'res_seri') {
    return [
      { id: 'bb_rs_l', kind: 'inductor', label: '2.5mH', value: 2.5e-3, holeA: 't_10_c', holeB: 't_16_c' },
      { id: 'bb_rs_c', kind: 'capacitor', label: '470pF', value: 470e-12, holeA: 't_16_b', holeB: 't_22_b' },
      { id: 'bb_rs_r', kind: 'resistor', label: '47Ω', value: 47, holeA: 't_22_c', holeB: 'tn_22' },
    ];
  }
  if (presetId === 'res_paralel') {
    return [
      { id: 'bb_rp_l', kind: 'inductor', label: '2.5mH', value: 2.5e-3, holeA: 't_10_c', holeB: 't_22_c' },
      { id: 'bb_rp_c', kind: 'capacitor', label: '470pF', value: 470e-12, holeA: 't_10_b', holeB: 't_22_b' },
      { id: 'bb_rp_r', kind: 'resistor', label: '47Ω', value: 47, holeA: 't_22_d', holeB: 'tn_22' },
    ];
  }
  if (presetId === 'res_sp1') {
    return [
      { id: 'bb_sp1_l1', kind: 'inductor', label: '2.5mH', value: 2.5e-3, holeA: 't_10_c', holeB: 't_22_c' },
      { id: 'bb_sp1_l2', kind: 'inductor', label: '2.5mH', value: 2.5e-3, holeA: 't_10_b', holeB: 't_16_b' },
      { id: 'bb_sp1_c1', kind: 'capacitor', label: '470pF', value: 470e-12, holeA: 't_16_d', holeB: 't_22_d' },
      { id: 'bb_sp1_r', kind: 'resistor', label: '47Ω', value: 47, holeA: 't_22_e', holeB: 'tn_22' },
    ];
  }
  if (presetId === 'res_sp2') {
    return [
      { id: 'bb_sp2_c1', kind: 'capacitor', label: '470pF', value: 470e-12, holeA: 't_10_c', holeB: 't_16_c' },
      { id: 'bb_sp2_c2', kind: 'capacitor', label: '470pF', value: 470e-12, holeA: 't_16_b', holeB: 't_22_b' },
      { id: 'bb_sp2_l1', kind: 'inductor', label: '2.5mH', value: 2.5e-3, holeA: 't_16_d', holeB: 't_22_d' },
      { id: 'bb_sp2_r', kind: 'resistor', label: '47Ω', value: 47, holeA: 't_22_e', holeB: 'tn_22' },
    ];
  }
  if (presetId === 'filter_notch') {
    return [
      { id: 'bb_nf_c', kind: 'capacitor', label: '47nF', value: 47e-9, holeA: 't_10_c', holeB: 't_22_c' },
      { id: 'bb_nf_l', kind: 'inductor', label: '2.5mH', value: 2.5e-3, holeA: 't_10_b', holeB: 't_22_b' },
      { id: 'bb_nf_r', kind: 'resistor', label: '47Ω', value: 47, holeA: 't_22_d', holeB: 'tn_22' },
    ];
  }
  if (presetId === 'filter_bandpass') {
    return [
      { id: 'bb_bp_c', kind: 'capacitor', label: '47nF', value: 47e-9, holeA: 't_10_c', holeB: 't_16_c' },
      { id: 'bb_bp_l', kind: 'inductor', label: '2.5mH', value: 2.5e-3, holeA: 't_16_b', holeB: 't_22_b' },
      { id: 'bb_bp_r', kind: 'resistor', label: '47Ω', value: 47, holeA: 't_22_c', holeB: 'tn_22' },
    ];
  }
  return [];
}

function makeDefaultSignalGen(): SignalGenConfig {
  return {
    power: true,
    outputEnabled: true,
    waveform: 'sine',
    freqHz: 1000,
    vpp: 4.0,
    dcOffset: 0,
    dutyPct: 50,
    attenuator20dB: false,
    phaseDeg: 0,
    loadMode: 'HighZ',
    inverted: false,
    modMode: 'OFF',
    modFreqHz: 100,
    modDepthPct: 80,
    ch2OutputEnabled: false,
    ch2Waveform: 'triangle',
    ch2FreqHz: 1500,
    ch2Vpp: 4.0,
    ch2DcOffset: 0,
    ch2DutyPct: 50,
    ch2PhaseDeg: 0,
    ch2LoadMode: 'HighZ',
    ch2Inverted: false,
  };
}

function makeDefaultKitControls(): KitControlState {
  return {
    oscAmpPower: true,
    oscAmpGain: 2.5,
    oscGenPower: true,
    oscGenFreqIdx: 1,
    oscPhasePotOhms: 3300,
    thevPotOhms: 2200,
    thevNortonPotOhms: 1000,
    decadeDials: [0, 0, 0, 1, 5, 0, 0, 0],
  };
}

function defaultDualTraceCables(): CableConnection[] {
  return [
    {
      id: 'probe_ch1',
      kind: 'bnc_bnc',
      color: '#eab308',
      label: 'BNC-BNC CH1',
      endA: 'rigol_ch1',
      endB: 'gen_out',
    },
    {
      id: 'probe_ch2',
      kind: 'probe_bnc_hook',
      color: '#06b6d4',
      label: 'Probe CH2',
      endA: 'rigol_ch2',
      endB: 'rigol_comp_sig',
      gndClip: 'rigol_comp_gnd',
      probeAtten: 1,
      probeCompTrim: 0,
    },
  ];
}

function isBncPort(s: SocketId | null | undefined): boolean {
  return (
    s === 'rigol_ch1' ||
    s === 'rigol_ch2' ||
    s === 'rigol_ext' ||
    s === 'gen_out' ||
    s === 'gen_ch2_out'
  );
}

function isClipTargetSocket(s: SocketId | null | undefined): boolean {
  if (!s) return false;
  return s.startsWith('bb_') || s === 'rigol_comp_sig' || s === 'rigol_comp_gnd';
}

function bncPortTag(bncSock: SocketId): string {
  if (bncSock === 'rigol_ch1') return 'CH1';
  if (bncSock === 'rigol_ch2') return 'CH2';
  if (bncSock === 'rigol_ext') return 'EXT';
  if (bncSock === 'gen_out') return 'GEN1';
  if (bncSock === 'gen_ch2_out') return 'GEN2';
  return 'BNC';
}

function computeNearbyGndRestPos(targetSocket: SocketId, breadboardParts: BreadboardPart[]): [number, number, number] {
  const sock = socketRegistry.get(targetSocket);
  if (sock) {
    return [
      Math.max(-0.85, Math.min(0.85, sock.position.x + 0.038)),
      0.789,
      Math.max(-0.32, Math.min(0.44, sock.position.z + 0.068)),
    ];
  }
  if (targetSocket.startsWith('bb_float_')) {
    const part = breadboardParts.find(
      (p) => p.kind === 'jumper' && p.floating && floatingJumperSocketId(p.id) === targetSocket
    );
    if (part) {
      const tip = floatingJumperTipWorldPos(part);
      return [Math.min(0.85, tip[0] + 0.036), 0.789, Math.min(0.44, tip[2] + 0.045)];
    }
  }
  if (targetSocket.startsWith('bb_')) {
    const p = holeIdToWorldPos(targetSocket);
    return [Math.min(0.85, p[0] + 0.036), 0.789, Math.min(0.44, p[2] + 0.045)];
  }
  return [0.04, 0.789, 0.22];
}

function shouldAutoGrabGndAfterSignalSnap(state: LabStoreState): boolean {
  // In free lab mode, immediately hand the '-' GND lead to the user right after '+' snaps!
  // In guided tutorials, leave '-' neatly beside the target so step-by-step clicks never get hijacked.
  return state.activeTutorialId === null;
}

const ALL_KIT_SOCKET_IDS = new Set<string>(
  Object.values(KIT_SOCKETS)
    .flat()
    .map((s) => s.id)
);

function isKitSocket(sock: SocketId | null | undefined): boolean {
  return Boolean(sock && ALL_KIT_SOCKET_IDS.has(sock));
}

function detachKitCables(
  cables: CableConnection[],
  grabbedEnd: LabStoreState['grabbedEnd']
): { cables: CableConnection[]; grabbedEnd: LabStoreState['grabbedEnd'] } {
  const removedIds = new Set<string>();
  const nextCables: CableConnection[] = [];
  for (const c of cables) {
    if (isKitSocket(c.endA) || isKitSocket(c.endB)) {
      removedIds.add(c.id);
      continue;
    }
    if (isKitSocket(c.gndClip)) {
      nextCables.push({
        ...c,
        gndClip: null,
        freePosGnd: [0.02, 0.788, 0.27],
      });
      continue;
    }
    nextCables.push(c);
  }

  let nextGrabbed = grabbedEnd;
  if (grabbedEnd) {
    if (removedIds.has(grabbedEnd.cableId)) {
      nextGrabbed = null;
    } else if (grabbedEnd.end === 'gndClip') {
      const orig = cables.find((c) => c.id === grabbedEnd.cableId);
      if (orig && isKitSocket(orig.gndClip)) nextGrabbed = null;
    }
  }
  return { cables: nextCables, grabbedEnd: nextGrabbed };
}

function detachStaleFloatSockets(cables: CableConnection[], parts: BreadboardPart[]): CableConnection[] {
  const validFloats = new Set(
    parts.filter((p) => p.kind === 'jumper' && p.floating).map((p) => floatingJumperSocketId(p.id))
  );
  const isStale = (s: SocketId | null | undefined) => Boolean(s && s.startsWith('bb_float_') && !validFloats.has(s));
  return cables.map((c) => {
    if (!isStale(c.endA) && !isStale(c.endB) && !isStale(c.gndClip)) return c;
    return {
      ...c,
      endA: isStale(c.endA) ? null : c.endA,
      endB: isStale(c.endB) ? null : c.endB,
      gndClip: isStale(c.gndClip) ? null : c.gndClip,
      freePosA: isStale(c.endA) ? [-0.05, 0.788, 0.25] : c.freePosA,
      freePosB: isStale(c.endB) ? [0.05, 0.788, 0.25] : c.freePosB,
      freePosGnd: isStale(c.gndClip) ? [0.02, 0.788, 0.27] : c.freePosGnd,
    };
  });
}

export const scopeExportHooks: {
  exportBitmap: () => void;
  exportCSV: () => void;
} = {
  exportBitmap: () => {},
  exportCSV: () => {},
};

function getMenuCtx(
  get: () => LabStoreState,
  set: (fn: (s: LabStoreState) => Partial<LabStoreState>) => void
): MenuActionContext {
  return {
    exportBitmap: () => scopeExportHooks.exportBitmap(),
    exportCSV: () => scopeExportHooks.exportCSV(),
    autoSetup: (mode) => {
      const s = get().scope;
      const frame = hotRefs.scopeFrame;
      const dt = (12 * s.horizontal.timePerDiv) / 600;
      const updated = computeAutoSetup(
        s,
        frame?.ch1Samples ?? new Float32Array(600),
        frame?.ch2Samples ?? new Float32Array(600),
        dt,
        mode,
        frame?.measurements.values.Freq
      );
      set(() => ({ scope: updated }));
    },
    captureRef: () => {
      const s = get().scope;
      const frame = hotRefs.scopeFrame;
      if (!frame) return;
      const src = s.ref.source === 'CH2' ? frame.ch2Samples : s.ref.source === 'MATH' ? frame.mathSamples : frame.ch1Samples;
      set((prev) => ({
        scope: {
          ...prev.scope,
          ref: {
            ...prev.scope.ref,
            storedSamples: new Float32Array(src),
            storedTimePerDiv: prev.scope.horizontal.timePerDiv,
            voltsPerDiv: s.ref.source === 'CH2' ? prev.scope.ch2.voltsPerDiv : prev.scope.ch1.voltsPerDiv,
            enabled: true,
          },
          dirtySeq: prev.scope.dirtySeq + 1,
        },
      }));
    },
    saveInternalSlot: (slot) => {
      const s = get().scope;
      const all = readSavedSlots();
      all[slot] = {
        ch1: s.ch1,
        ch2: s.ch2,
        horizontal: s.horizontal,
        trigger: s.trigger,
        acquire: s.acquire,
      };
      writeSavedSlots(all);
      set((prev) => ({
        scope: {
          ...prev.scope,
          storage: {
            ...prev.scope.storage,
            savedSlots: Array.from(new Set([...prev.scope.storage.savedSlots, slot])),
          },
          transientPopup: { title: 'Storage', body: `Saved to Int_0${slot}` },
          dirtySeq: prev.scope.dirtySeq + 1,
        },
      }));
    },
    loadInternalSlot: (slot) => {
      const all = readSavedSlots();
      const loaded = all[slot];
      if (!loaded) {
        set((prev) => ({
          scope: {
            ...prev.scope,
            transientPopup: { title: 'Storage', body: `Int_0${slot} is empty` },
            dirtySeq: prev.scope.dirtySeq + 1,
          },
        }));
        return;
      }
      set((prev) => ({
        scope: {
          ...prev.scope,
          ...loaded,
          transientPopup: { title: 'Storage', body: `Loaded Int_0${slot}` },
          dirtySeq: prev.scope.dirtySeq + 1,
        },
      }));
    },
    resetFactory: () => {
      const f = createInitialDS1000EState();
      f.transientPopup = { title: 'Factory', body: 'Factory defaults recalled' };
      return f;
    },
  };
}

export const useLabStore = create<LabStoreState>((set, get) => ({
  cameraTarget: 'bench',
  prevCameraTarget: 'bench',
  cameraPresetSeq: 0,
  activeDrawer: null,
  hoverLabel: null,
  grabbedEnd: null,

  cables: defaultDualTraceCables(),
  signalGen: {
    power: true,
    outputEnabled: true,
    waveform: 'sine',
    freqHz: 1000,
    vpp: 4.0,
    dcOffset: 0,
    dutyPct: 50,
    attenuator20dB: false,
    phaseDeg: 0,
    loadMode: 'HighZ',
    inverted: false,
    modMode: 'OFF',
    modFreqHz: 100,
    modDepthPct: 80,
    ch2OutputEnabled: false,
    ch2Waveform: 'triangle',
    ch2FreqHz: 1500,
    ch2Vpp: 4.0,
    ch2DcOffset: 0,
    ch2DutyPct: 50,
    ch2PhaseDeg: 0,
    ch2LoadMode: 'HighZ',
    ch2Inverted: false,
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
  scope: createInitialDS1000EState(),
  activeFaults: [],

  activeKit: 'rl_rc',
  kitSelected: false,
  kitPickerOpen: false,
  kitControls: {
    oscAmpPower: true,
    oscAmpGain: 2.5,
    oscGenPower: true,
    oscGenFreqIdx: 1,
    oscPhasePotOhms: 3300,
    thevPotOhms: 2200,
    thevNortonPotOhms: 1000,
    decadeDials: [0, 0, 0, 1, 5, 0, 0, 0],
  },
  dm3058: createInitialDM3058State(),
  breadboardParts: makeStarterBreadboardParts(),
  placingPart: null,
  selectedBreadboardPartId: null,
  reshapingPart: null,
  breadboardMode: false,
  breadboard2D: false,
  breadboard2DFitSeq: 0,
  breadboardViewMode: 'standard',
  breadboardShowPins: true,
  breadboardUndoStack: [],
  breadboardRedoStack: [],
  activeTutorialId: null,
  tutorialStepIndex: 0,
  tutorialCollapsed: false,
  worksheetOpen: false,

  graphics: {
    quality: 'high',
    bloom: false,
    shadows: true,
    soundEnabled: true,
  },
  gpuInfo: {
    renderer: 'Detecting GPU...',
    vendor: '',
    isSoftwareFallback: false,
    drawCalls: 0,
    triangles: 0,
  },

  setCameraTarget: (cameraTarget) =>
    set((s) => {
      if (cameraTarget === 'bb') {
        if (!s.breadboardMode) {
          hotRefs.savedBreadboardReturnPose = {
            pos: [...hotRefs.liveCameraPose.pos],
            yaw: hotRefs.liveCameraPose.yaw,
            pitch: hotRefs.liveCameraPose.pitch,
          };
        }
        return {
          prevCameraTarget: s.breadboardMode ? s.prevCameraTarget : s.cameraTarget,
          cameraTarget: 'bb',
          breadboardMode: true,
          breadboard2D: true,
          breadboard2DFitSeq: s.breadboard2DFitSeq + 1,
          activeDrawer: null,
        };
      }
      hotRefs.savedBreadboardReturnPose = null;
      hotRefs.restoreCameraPose = null;
      return {
        cameraTarget,
        prevCameraTarget: cameraTarget,
        cameraPresetSeq: s.cameraPresetSeq + 1,
        breadboardMode: false,
        breadboard2D: false,
        activeDrawer: s.activeDrawer,
        placingPart: null,
        reshapingPart: null,
        selectedBreadboardPartId: null,
      };
    }),
  setActiveDrawer: (activeDrawer) => set({ activeDrawer }),
  setHoverLabel: (hoverLabel) => set({ hoverLabel }),
  setGPUInfo: (gpuInfo) => set({ gpuInfo }),
  setGraphics: (patch) =>
    set((s) => {
      if (patch.soundEnabled !== undefined) labAudio.enabled = patch.soundEnabled;
      return { graphics: { ...s.graphics, ...patch } };
    }),
  setFaults: (faults) => {
    const prev = get().activeFaults;
    if (faults.length > 0 && prev.length === 0) labAudio.playFaultBuzz();
    if (faults.length !== prev.length || faults[0]?.message !== prev[0]?.message) {
      set({ activeFaults: faults });
    }
  },
  clearFaults: () => set({ activeFaults: [] }),

  clickSocket: (socketId, preferredColor, preferredKind) => {
    const st = get();
    if (st.grabbedEnd) {
      const g = st.grabbedEnd;
      const grabbedCable = st.cables.find((c) => c.id === g.cableId);
      const otherEndSocket =
        g.end === 'endB' ? grabbedCable?.endA : g.end === 'endA' ? grabbedCable?.endB : null;
      if (otherEndSocket && otherEndSocket === socketId) {
        labAudio.playButtonClick();
        set((s) => ({
          cables: s.cables.filter((c) => c.id !== g.cableId),
          grabbedEnd: null,
        }));
        return;
      }
      // If user is holding a Y-cable's '-' GND lead and clicks another BNC port (Scope CH1/CH2/EXT or Gen OUT),
      // neatly drop the GND lead on the bench and immediately start pulling from the new BNC port.
      if (g.end === 'gndClip' && isBncPort(socketId)) {
        const dropPos = grabbedCable?.freePosGnd ?? computeNearbyGndRestPos(grabbedCable?.endB ?? socketId, st.breadboardParts);
        st.dropOrSnapCableEnd(null, dropPos);
      } else {
        st.dropOrSnapCableEnd(socketId);
        return;
      }
    }

    const curSt = get();
    const sock = socketRegistry.get(socketId);
    const matchedFloatPart = socketId.startsWith('bb_float_')
      ? curSt.breadboardParts.find(
          (p) => p.kind === 'jumper' && p.floating && floatingJumperSocketId(p.id) === socketId
        )
      : undefined;
    const startPos: [number, number, number] = sock
      ? [sock.position.x, sock.position.y, sock.position.z]
      : matchedFloatPart
        ? floatingJumperTipWorldPos(matchedFloatPart)
        : socketId.startsWith('bb_')
          ? holeIdToWorldPos(socketId)
          : [...hotRefs.handTargetWorld];
    hotRefs.handTargetWorld[0] = startPos[0];
    hotRefs.handTargetWorld[1] = startPos[1];
    hotRefs.handTargetWorld[2] = startPos[2];

    let color = preferredColor ?? matchedFloatPart?.color ?? inferBananaCableColor(socketId);
    const tut = getTutorialById(curSt.activeTutorialId);
    if (tut) {
      const curStep = tut.steps[curSt.tutorialStepIndex];
      const matchStep =
        curStep?.kind === 'wire' && (curStep.fromSocket === socketId || curStep.toSocket === socketId)
          ? curStep
          : tut.steps.find(
              (step) => step.kind === 'wire' && (step.fromSocket === socketId || step.toSocket === socketId)
            );
      if (matchStep && matchStep.kind === 'wire') {
        color = matchStep.cableColor;
      }
    }

    const isFloatOrigin = Boolean(matchedFloatPart || socketId.startsWith('bb_float_'));
    const isBncOrigin = isBncPort(socketId);
    // Default while dragging stays a single banana cable (no premature Y-split since BNC <-> BNC can occur).
    // Once attached to a destination, dropOrSnapCableEnd morphs it to BNC-BNC, BNC-Banana (+/-), or BNC-Alligator (+/-).
    const kind: CableKind =
      preferredKind ?? (isFloatOrigin ? 'banana_alligator' : 'banana_4mm');
    const idPrefix =
      kind === 'bnc_banana'
        ? 'bncb'
        : kind === 'bnc_alligator'
          ? 'bnca'
          : kind === 'banana_alligator'
            ? 'ba'
            : 'ban';
    const id = `${idPrefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
    labAudio.playPlugSnap();

    if ((kind === 'banana_alligator' || kind === 'bnc_alligator') && isFloatOrigin) {
      // Clamp alligator endB onto the floating jumper tip; hold banana/BNC endA in hand!
      set((s) => ({
        placingPart: null,
        selectedBreadboardPartId: null,
        reshapingPart: null,
        grabbedEnd: { cableId: id, end: 'endA' },
        cables: [
          ...s.cables,
          {
            id,
            kind,
            color,
            label: kind === 'bnc_alligator' ? 'BNC-Buaya' : 'Banana-Buaya',
            endA: null,
            endB: socketId,
            gndClip: kind === 'bnc_alligator' ? null : undefined,
            freePosA: startPos,
            freePosGnd:
              kind === 'bnc_alligator'
                ? [startPos[0] + 0.032, 0.788, Math.min(0.42, startPos[2] + 0.035)]
                : undefined,
          },
        ],
      }));
      return;
    }

    const hasDualGnd = kind === 'bnc_alligator' || kind === 'bnc_banana';
    const chanTag = isBncOrigin ? ` ${bncPortTag(socketId)}` : '';
    set((s) => ({
      placingPart: null,
      selectedBreadboardPartId: null,
      reshapingPart: null,
      grabbedEnd: { cableId: id, end: 'endB' },
      cables: [
        ...s.cables,
        {
          id,
          kind,
          color,
          label:
            kind === 'bnc_banana'
              ? `BNC-Banana${chanTag}`
              : kind === 'bnc_alligator'
                ? `BNC-Buaya${chanTag}`
                : kind === 'banana_alligator'
                  ? 'Banana-Buaya'
                  : 'Banana 4mm',
          endA: socketId,
          endB: null,
          gndClip: hasDualGnd ? null : undefined,
          freePosB: startPos,
          freePosGnd: hasDualGnd
            ? [startPos[0] + 0.032, 0.788, Math.min(0.42, startPos[2] + 0.065)]
            : undefined,
        },
      ],
    }));
  },

  grabCableEnd: (cableId, end) => {
    labAudio.playButtonClick();
    const st = get();
    const cable = st.cables.find((c) => c.id === cableId);
    const oldSocket =
      end === 'endA' ? cable?.endA : end === 'endB' ? cable?.endB : cable?.gndClip;
    // Compute initial lifted world position and immediately detach the electrical socket
    // so lifting a cable cuts oscilloscope/DMM detection to 0V right away AND never snaps back to the old pin!
    let liftPos: [number, number, number] = [...hotRefs.handTargetWorld];
    if (oldSocket) {
      const sock = socketRegistry.get(oldSocket);
      if (sock) {
        liftPos = [
          sock.position.x + sock.normal.x * 0.025,
          sock.position.y + sock.normal.y * 0.025,
          sock.position.z + sock.normal.z * 0.025,
        ];
      } else if (oldSocket.startsWith('bb_float_')) {
        const part = st.breadboardParts.find(
          (p) => p.kind === 'jumper' && p.floating && floatingJumperSocketId(p.id) === oldSocket
        );
        if (part) {
          const tip = floatingJumperTipWorldPos(part);
          liftPos = [tip[0], tip[1] + 0.02, tip[2]];
        }
      } else if (oldSocket.startsWith('bb_')) {
        const p = holeIdToWorldPos(oldSocket);
        liftPos = [p[0], p[1] + 0.02, p[2]];
      }
      hotRefs.handTargetWorld[0] = liftPos[0];
      hotRefs.handTargetWorld[1] = liftPos[1];
      hotRefs.handTargetWorld[2] = liftPos[2];
    }

    set((s) => ({
      grabbedEnd: { cableId, end },
      placingPart: null,
      selectedBreadboardPartId: null,
      reshapingPart: null,
      cables: oldSocket
        ? s.cables.map((c) => {
            if (c.id !== cableId) return c;
            if (end === 'endA') return { ...c, endA: null, freePosA: liftPos };
            if (end === 'endB') return { ...c, endB: null, freePosB: liftPos };
            return { ...c, gndClip: null, freePosGnd: liftPos };
          })
        : s.cables,
    }));
  },

  dropOrSnapCableEnd: (targetSocket, worldPos) => {
    const prevState = get();
    const g = prevState.grabbedEnd;
    if (!g) return;
    if (targetSocket) labAudio.playPlugSnap();
    else labAudio.playButtonClick();
    const restPos: [number, number, number] = worldPos ? [...worldPos] : [...hotRefs.handTargetWorld];
    let autoGrabGndInfo: { cableId: string; startPos: [number, number, number] } | null = null;

    const nextCables = prevState.cables.map((c) => {
      if (c.id !== g.cableId) return c;
      if (g.end === 'gndClip') {
        return { ...c, gndClip: targetSocket, freePosGnd: targetSocket ? undefined : restPos };
      }

      if (g.end === 'endA') {
        if (targetSocket && c.kind === 'banana_alligator' && isBncPort(targetSocket) && c.endB) {
          // Floating jumper -> Scope/Gen BNC: upgrade automatically to BNC-Buaya (+/-)
          const gndPos = computeNearbyGndRestPos(c.endB, prevState.breadboardParts);
          autoGrabGndInfo = { cableId: c.id, startPos: gndPos };
          return {
            ...c,
            kind: 'bnc_alligator' as CableKind,
            label: `BNC-Buaya ${bncPortTag(targetSocket)}`,
            color: inferBananaCableColor(targetSocket),
            endA: targetSocket,
            gndClip: null,
            freePosA: undefined,
            freePosGnd: gndPos,
          };
        }
        return { ...c, endA: targetSocket, freePosA: targetSocket ? undefined : restPos };
      }

      // g.end === 'endB'
      if (!targetSocket) {
        return { ...c, endB: null, freePosB: restPos };
      }

      // 1) Adaptive BNC cable pulled from Rigol CH1/CH2/EXT or Signal Gen OUT -> morphs ONLY upon attaching to destination!
      if (
        isBncPort(c.endA) &&
        (c.kind === 'banana_4mm' || c.kind === 'bnc_banana' || c.kind === 'bnc_alligator')
      ) {
        const chanTag = bncPortTag(c.endA!);
        if (isBncPort(targetSocket)) {
          return {
            ...c,
            kind: 'bnc_bnc' as CableKind,
            label: 'BNC-BNC',
            endB: targetSocket,
            gndClip: undefined,
            freePosB: undefined,
            freePosGnd: undefined,
          };
        }
        const useAlligator = isClipTargetSocket(targetSocket);
        const nextKind: CableKind = useAlligator ? 'bnc_alligator' : 'bnc_banana';
        const gndPos = computeNearbyGndRestPos(targetSocket, prevState.breadboardParts);
        if (!c.gndClip) {
          autoGrabGndInfo = { cableId: c.id, startPos: gndPos };
        }
        return {
          ...c,
          kind: nextKind,
          label: `${useAlligator ? 'BNC-Buaya' : 'BNC-Banana'} ${chanTag}`,
          endB: targetSocket,
          gndClip: c.gndClip ?? null,
          freePosB: undefined,
          freePosGnd: c.gndClip ? undefined : gndPos,
        };
      }

      // 2) Cable started from Kit/PSU/DMM/BB and plugged into Rigol/Gen BNC -> flip & morph to BNC-Banana (+/-) or BNC-Buaya (+/-)!
      if (c.kind === 'banana_4mm' && c.endA && isBncPort(targetSocket)) {
        if (isBncPort(c.endA)) {
          return {
            ...c,
            kind: 'bnc_bnc' as CableKind,
            label: 'BNC-BNC',
            color: inferBananaCableColor(targetSocket),
            endA: targetSocket,
            endB: c.endA,
            gndClip: undefined,
            freePosA: undefined,
            freePosB: undefined,
            freePosGnd: undefined,
          };
        }
        const useAlligator = isClipTargetSocket(c.endA);
        const nextKind: CableKind = useAlligator ? 'bnc_alligator' : 'bnc_banana';
        const gndPos = computeNearbyGndRestPos(c.endA, prevState.breadboardParts);
        autoGrabGndInfo = { cableId: c.id, startPos: gndPos };
        return {
          ...c,
          kind: nextKind,
          label: `${useAlligator ? 'BNC-Buaya' : 'BNC-Banana'} ${bncPortTag(targetSocket)}`,
          color: inferBananaCableColor(targetSocket),
          endA: targetSocket,
          endB: c.endA,
          gndClip: null,
          freePosA: undefined,
          freePosB: undefined,
          freePosGnd: gndPos,
        };
      }

      // 3) Banana cable from Kit/PSU/Gen/DMM dropped onto a floating jumper -> upgrade cleanly to Banana-Buaya!
      if (c.kind === 'banana_4mm' && c.endA && targetSocket.startsWith('bb_float_')) {
        return {
          ...c,
          kind: 'banana_alligator' as CableKind,
          label: 'Banana-Buaya',
          endB: targetSocket,
          freePosB: undefined,
        };
      }

      return { ...c, endB: targetSocket, freePosB: undefined };
    });

    let nextStepIdx = prevState.tutorialStepIndex;
    const tut = getTutorialById(prevState.activeTutorialId);
    if (tut && targetSocket) {
      const before = getTutorialProgress(tut, prevState.cables, prevState.activeKit, prevState.breadboardParts);
      const after = getTutorialProgress(tut, nextCables, prevState.activeKit, prevState.breadboardParts);
      const curStep = tut.steps[prevState.tutorialStepIndex];
      if (
        curStep?.kind === 'wire' &&
        !before.completedStepIds.has(curStep.id) &&
        after.completedStepIds.has(curStep.id)
      ) {
        nextStepIdx = after.firstIncompleteIdx;
        labAudio.playScopeBeep();
      }
    }

    let nextGrabbedEnd: LabStoreState['grabbedEnd'] = null;
    const gndAuto = autoGrabGndInfo as { cableId: string; startPos: [number, number, number] } | null;
    if (gndAuto && shouldAutoGrabGndAfterSignalSnap(prevState)) {
      nextGrabbedEnd = { cableId: gndAuto.cableId, end: 'gndClip' };
      hotRefs.handTargetWorld[0] = gndAuto.startPos[0];
      hotRefs.handTargetWorld[1] = gndAuto.startPos[1];
      hotRefs.handTargetWorld[2] = gndAuto.startPos[2];
    }

    set({
      grabbedEnd: nextGrabbedEnd,
      cables: nextCables,
      tutorialStepIndex: nextStepIdx,
    });
  },

  startTutorial: (id) => {
    const tut = getTutorialById(id);
    if (!tut) return;
    labAudio.playPlugSnap();
    set((s) => {
      const nextScope = structuredClone(s.scope) as DS1000EState;
      nextScope.power = 'ON';
      nextScope.runState = 'RUN';
      nextScope.ch1.coupling = 'DC';
      nextScope.ch2.coupling = 'DC';
      nextScope.ch1.probe = 1;
      nextScope.ch2.probe = 1;
      nextScope.ch1.invert = false;
      nextScope.ch2.invert = false;
      nextScope.ch1.bwLimit = false;
      nextScope.ch2.bwLimit = false;
      nextScope.ch1.filter.enabled = false;
      nextScope.ch2.filter.enabled = false;
      nextScope.math.enabled = false;
      nextScope.cursor.mode = 'OFF';
      nextScope.horizontal.triggerOffsetSec = 0;
      nextScope.horizontal.savedYtOffsets = null;
      const sp = tut.setup.scopePatch;
      if (sp) {
        if (sp.timeBaseMode !== undefined) nextScope.horizontal.timeBaseMode = sp.timeBaseMode;
        if (sp.timePerDiv !== undefined) nextScope.horizontal.timePerDiv = sp.timePerDiv;
        if (sp.ch1Enabled !== undefined) nextScope.ch1.enabled = sp.ch1Enabled;
        if (sp.ch1VDiv !== undefined) nextScope.ch1.voltsPerDiv = sp.ch1VDiv;
        if (sp.ch1Offset !== undefined) nextScope.ch1.offsetDiv = sp.ch1Offset;
        if (sp.ch2Enabled !== undefined) nextScope.ch2.enabled = sp.ch2Enabled;
        if (sp.ch2VDiv !== undefined) nextScope.ch2.voltsPerDiv = sp.ch2VDiv;
        if (sp.ch2Offset !== undefined) nextScope.ch2.offsetDiv = sp.ch2Offset;
        if (sp.trigSource !== undefined) nextScope.trigger.source = sp.trigSource;
        if (sp.trigLevel !== undefined) nextScope.trigger.levelVolts = sp.trigLevel;
      }
      nextScope.dirtySeq += 1;

      let nextParts = tut.setup.breadboardPreset
        ? buildBreadboardPresetParts(tut.setup.breadboardPreset)
        : s.breadboardParts;
      if (tut.setup.addRcFloatJumpers) {
        nextParts = [
          ...nextParts,
          {
            id: 'bb_rc_jin',
            kind: 'jumper',
            label: 'Jumper Bebas',
            value: 0,
            holeA: 't_12_a',
            holeB: 't_12_a',
            color: '#dc2626',
            floating: true,
            floatOffset: [-0.015, -0.014],
          },
          {
            id: 'bb_rc_jout',
            kind: 'jumper',
            label: 'Jumper Bebas',
            value: 0,
            holeA: 't_18_a',
            holeB: 't_18_a',
            color: '#06b6d4',
            floating: true,
            floatOffset: [0.014, -0.014],
          },
          {
            id: 'bb_rc_jgnd',
            kind: 'jumper',
            label: 'Jumper Bebas',
            value: 0,
            holeA: 'tn_15',
            holeB: 'tn_15',
            color: '#18181b',
            floating: true,
            floatOffset: [-0.008, -0.020],
          },
        ];
      }

      if (tut.setup.floatJumpers && tut.setup.floatJumpers.length > 0) {
        nextParts = [
          ...nextParts,
          ...tut.setup.floatJumpers.map((fj) => ({
            id: fj.id,
            kind: 'jumper' as const,
            label: 'Jumper Bebas',
            value: 0,
            holeA: fj.holeA,
            holeB: fj.holeA,
            color: fj.color,
            floating: true,
            floatOffset: fj.floatOffset,
          })),
        ];
      }

      const nextKitControls: KitControlState = {
        ...makeDefaultKitControls(),
        ...(tut.setup.kitControls ?? {}),
      };
      const nextSignalGen: SignalGenConfig = tut.setup.signalGen
        ? { ...makeDefaultSignalGen(), ...tut.setup.signalGen }
        : makeDefaultSignalGen();
      const nextDm3058 = tut.setup.dm3058Func
        ? {
            ...s.dm3058,
            power: true,
            func: tut.setup.dm3058Func,
            dualEnabled: Boolean(tut.setup.dm3058DualFunc),
            viceFunc: tut.setup.dm3058DualFunc ?? s.dm3058.viceFunc,
            inputZ: tut.setup.dm3058InputZ ?? '10M',
            autoRange: true,
            runState: 'RUN' as const,
            menu: 'MAIN' as const,
            dirtySeq: s.dm3058.dirtySeq + 1,
          }
        : s.dm3058;

      return {
        activeTutorialId: id,
        tutorialStepIndex: 0,
        tutorialCollapsed: false,
        worksheetOpen: true,
        activeDrawer: null,
        kitSelected: false,
        kitPickerOpen: false,
        breadboardMode: false,
        breadboard2D: false,
        cameraTarget: 'bench',
        cameraPresetSeq: s.cameraPresetSeq + 1,
        activeKit: tut.kitId,
        kitControls: nextKitControls,
        cables: [],
        grabbedEnd: null,
        placingPart: null,
        selectedBreadboardPartId: null,
        reshapingPart: null,
        signalGen: nextSignalGen,
        powerSupply: tut.setup.powerSupply ? { ...s.powerSupply, ...tut.setup.powerSupply } : s.powerSupply,
        dm3058: nextDm3058,
        breadboardParts: nextParts,
        scope: nextScope,
      };
    });
  },

  stopTutorial: () => {
    labAudio.playButtonClick();
    set({ activeTutorialId: null, tutorialStepIndex: 0, tutorialCollapsed: false, worksheetOpen: false });
  },

  setTutorialStep: (idx) => {
    const tut = getTutorialById(get().activeTutorialId);
    if (!tut) return;
    labAudio.playButtonClick();
    set({
      tutorialStepIndex: Math.min(tut.steps.length - 1, Math.max(0, idx)),
    });
  },

  toggleTutorialCollapsed: () => {
    set((s) => ({ tutorialCollapsed: !s.tutorialCollapsed }));
  },

  toggleWorksheet: () => {
    labAudio.playButtonClick();
    set((s) => ({ worksheetOpen: !s.worksheetOpen }));
  },

  autoWireCurrentTutorialStep: () => {
    const st = get();
    const tut = getTutorialById(st.activeTutorialId);
    if (!tut) return;
    const step = tut.steps[st.tutorialStepIndex];
    if (!step || step.kind !== 'wire') return;
    const before = getTutorialProgress(tut, st.cables, st.activeKit, st.breadboardParts);
    if (before.completedStepIds.has(step.id)) {
      set({ tutorialStepIndex: before.firstIncompleteIdx });
      return;
    }

    labAudio.playPlugSnap();
    const kind: CableKind = step.wireKind ?? 'banana_4mm';
    const hasGnd = kind === 'bnc_banana' || kind === 'bnc_alligator' || kind === 'probe_bnc_hook';
    // Prefer matching floating jumper tip on breadboard if one exists for the target column
    let resolvedTo = step.toSocket;
    let resolvedGnd = step.gndSocket;
    if (kind === 'bnc_alligator' || kind === 'banana_alligator') {
      const floatMatch = st.breadboardParts.find(
        (p) => p.kind === 'jumper' && p.floating && `bb_${p.holeA}` === step.toSocket
      );
      if (floatMatch) resolvedTo = floatingJumperSocketId(floatMatch.id);
      if (step.gndSocket) {
        const gndFloat = st.breadboardParts.find(
          (p) => p.kind === 'jumper' && p.floating && `bb_${p.holeA}` === step.gndSocket
        );
        if (gndFloat) resolvedGnd = floatingJumperSocketId(gndFloat.id);
      }
    }

    const newCable: CableConnection = {
      id: `tut_${step.id}_${Date.now().toString(36)}`,
      kind,
      color: step.cableColor,
      label:
        kind === 'bnc_bnc'
          ? 'BNC-BNC'
          : kind === 'bnc_banana'
            ? `BNC-Banana ${step.fromLabel.slice(0, 6)}`
            : kind === 'bnc_alligator'
              ? `BNC-Buaya ${step.fromLabel.slice(0, 6)}`
              : kind === 'banana_alligator'
                ? 'Banana-Buaya'
                : `Banana ${step.fromLabel}`,
      endA: step.fromSocket,
      endB: resolvedTo,
      gndClip: hasGnd ? (resolvedGnd ?? null) : undefined,
    };
    const nextCables = [...st.cables, newCable];
    const after = getTutorialProgress(tut, nextCables, st.activeKit, st.breadboardParts);
    set({
      cables: nextCables,
      grabbedEnd: null,
      tutorialStepIndex: after.firstIncompleteIdx,
    });
  },

  applyTutorialInstrumentPreset: (preset) => {
    labAudio.playScopeBeep();
    set((s) => {
      if (preset === 'dmm_ohm' || preset === 'dmm_dcv' || preset === 'dmm_dci' || preset === 'dmm_4wr') {
        const fn =
          preset === 'dmm_ohm' ? '2WR' : preset === 'dmm_4wr' ? '4WR' : preset === 'dmm_dci' ? 'DCI' : 'DCV';
        return {
          dm3058: {
            ...s.dm3058,
            power: true,
            func: fn,
            autoRange: true,
            runState: 'RUN',
            dirtySeq: s.dm3058.dirtySeq + 1,
          },
        };
      }
      if (preset === 'dmm_dcv_10g') {
        return {
          dm3058: {
            ...s.dm3058,
            power: true,
            func: 'DCV',
            inputZ: s.dm3058.inputZ === '>10G' ? '10M' : '>10G',
            autoRange: true,
            runState: 'RUN',
            dirtySeq: s.dm3058.dirtySeq + 1,
          },
        };
      }
      if (preset === 'dmm_acv_freq') {
        return {
          dm3058: {
            ...s.dm3058,
            power: true,
            func: 'ACV',
            dualEnabled: true,
            viceFunc: 'FREQ',
            autoRange: true,
            runState: 'RUN',
            dirtySeq: s.dm3058.dirtySeq + 1,
          },
        };
      }
      if (preset === 'decade_rth_1120') {
        return { kitControls: { ...s.kitControls, decadeDials: [0, 0, 0, 1, 1, 2, 0, 0] } };
      }
      if (preset === 'decade_rlc_crit') {
        return { kitControls: { ...s.kitControls, decadeDials: [0, 0, 0, 0, 2, 6, 6, 0] } };
      }
      if (preset === 'gen_fc_1590hz') {
        return {
          signalGen: { ...s.signalGen, power: true, outputEnabled: true, waveform: 'sine', freqHz: 1590, vpp: 4.0 },
        };
      }
      if (preset === 'gen_hpf_fc_1940hz') {
        return {
          signalGen: { ...s.signalGen, power: true, outputEnabled: true, waveform: 'sine', freqHz: 1941, vpp: 4.0 },
        };
      }
      const nextScope = structuredClone(s.scope) as DS1000EState;
      nextScope.power = 'ON';
      nextScope.runState = 'RUN';
      if (preset === 'gen_res_146k') {
        nextScope.horizontal.timeBaseMode = 'Y-T';
        nextScope.horizontal.timePerDiv = 2e-6;
        nextScope.dirtySeq += 1;
        hotRefs.scopeDirty = true;
        return {
          signalGen: { ...s.signalGen, power: true, outputEnabled: true, waveform: 'sine', freqHz: 146825, vpp: 1.0 },
          scope: nextScope,
        };
      }
      if (preset === 'gen_res_104k') {
        nextScope.horizontal.timeBaseMode = 'Y-T';
        nextScope.horizontal.timePerDiv = 5e-6;
        nextScope.dirtySeq += 1;
        hotRefs.scopeDirty = true;
        return {
          signalGen: { ...s.signalGen, power: true, outputEnabled: true, waveform: 'sine', freqHz: 103821, vpp: 1.0 },
          scope: nextScope,
        };
      }
      if (preset === 'gen_notch_50hz') {
        nextScope.horizontal.timeBaseMode = 'Y-T';
        nextScope.horizontal.timePerDiv = 5e-3;
        nextScope.dirtySeq += 1;
        hotRefs.scopeDirty = true;
        return {
          signalGen: { ...s.signalGen, power: true, outputEnabled: true, waveform: 'sine', freqHz: 50, vpp: 1.0 },
          scope: nextScope,
        };
      }
      if (preset === 'gen_bp_14k7') {
        nextScope.horizontal.timeBaseMode = 'Y-T';
        nextScope.horizontal.timePerDiv = 20e-6;
        nextScope.dirtySeq += 1;
        hotRefs.scopeDirty = true;
        return {
          signalGen: { ...s.signalGen, power: true, outputEnabled: true, waveform: 'sine', freqHz: 14683, vpp: 1.0 },
          scope: nextScope,
        };
      }
      if (preset === 'scope_xy_lissajous') {
        nextScope.horizontal.timeBaseMode = 'X-Y';
        nextScope.ch1.enabled = true;
        nextScope.ch2.enabled = true;
        nextScope.ch1.voltsPerDiv = 1.0;
        nextScope.ch2.voltsPerDiv = 0.5;
        nextScope.ch1.offsetDiv = 0;
        nextScope.ch2.offsetDiv = 0;
        nextScope.cursor.mode = 'Manual';
        nextScope.cursor.type = 'Y';
        nextScope.cursor.source = 'CH2';
        nextScope.activeMenu = 'CURSOR';
        nextScope.menuOpen = true;
      } else if (preset === 'scope_xy_freq') {
        nextScope.horizontal.timeBaseMode = 'X-Y';
        nextScope.ch1.enabled = true;
        nextScope.ch2.enabled = true;
        nextScope.ch1.voltsPerDiv = 1.0;
        nextScope.ch2.voltsPerDiv = 1.0;
        nextScope.ch1.offsetDiv = 0;
        nextScope.ch2.offsetDiv = 0;
      } else if (preset === 'scope_ch1_ac_coupling') {
        const nextCoup = nextScope.ch1.coupling === 'AC' ? 'DC' : 'AC';
        nextScope.ch1.coupling = nextCoup;
        nextScope.ch1.voltsPerDiv = nextCoup === 'AC' ? 0.5 : 2.0;
        nextScope.trigger.levelVolts = nextCoup === 'AC' ? 0 : 2.5;
        nextScope.activeMenu = 'CH1';
        nextScope.menuOpen = true;
      } else if (preset === 'scope_diff_50hz') {
        nextScope.horizontal.timeBaseMode = 'Y-T';
        nextScope.horizontal.timePerDiv = 5e-3;
        nextScope.ch1.voltsPerDiv = 2.0;
        nextScope.ch2.voltsPerDiv = 2.0;
        nextScope.measure.activeSlots = ['Freq', 'Vpp'];
      } else if (preset === 'scope_phase_cursor') {
        nextScope.horizontal.timeBaseMode = 'Y-T';
        nextScope.horizontal.timePerDiv = 200e-6;
        nextScope.cursor.mode = 'Manual';
        nextScope.cursor.type = 'X';
        nextScope.activeMenu = 'CURSOR';
        nextScope.menuOpen = true;
      } else if (preset === 'scope_measure_vpp_freq') {
        nextScope.horizontal.timeBaseMode = 'Y-T';
        nextScope.measure.activeSlots = ['Freq', 'Vpp'];
        nextScope.activeMenu = 'MEASURE';
        nextScope.menuOpen = true;
      } else if (preset === 'scope_rc_cursor') {
        nextScope.horizontal.timeBaseMode = 'Y-T';
        nextScope.horizontal.timePerDiv = 100e-6;
        nextScope.trigger.levelVolts = 2.0;
        nextScope.cursor.mode = 'Manual';
        nextScope.cursor.type = 'X';
        nextScope.activeMenu = 'CURSOR';
        nextScope.menuOpen = true;
      } else if (preset === 'scope_rl_zoom') {
        nextScope.horizontal.timeBaseMode = 'Y-T';
        nextScope.horizontal.timePerDiv = 5e-6;
        nextScope.trigger.levelVolts = 2.0;
        nextScope.cursor.mode = 'Manual';
        nextScope.cursor.type = 'X';
        nextScope.activeMenu = 'CURSOR';
        nextScope.menuOpen = true;
      }
      nextScope.dirtySeq += 1;
      hotRefs.scopeDirty = true;
      return { scope: nextScope };
    });
  },

  spawnCable: (kind) => {
    labAudio.playButtonClick();
    const id = `${kind}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 4)}`;
    const alligatorColors = ['#dc2626', '#18181b', '#eab308', '#2563eb'] as const;
    const bncDualColors = ['#eab308', '#06b6d4', '#dc2626'] as const;
    set((s) => {
      const idx = s.cables.length;
      const alligatorCount = s.cables.filter((c) => c.kind === 'banana_alligator').length;
      const bncDualCount = s.cables.filter((c) => c.kind === 'bnc_alligator' || c.kind === 'bnc_banana').length;
      const hasGndClip = kind === 'probe_bnc_hook' || kind === 'bnc_alligator' || kind === 'bnc_banana';
      const color =
        kind === 'probe_bnc_hook'
          ? '#eab308'
          : kind === 'bnc_bnc'
            ? '#334155'
            : kind === 'bnc_alligator' || kind === 'bnc_banana'
              ? bncDualColors[bncDualCount % bncDualColors.length]
              : kind === 'banana_alligator'
                ? alligatorColors[alligatorCount % alligatorColors.length]
                : '#dc2626';
      const label =
        kind === 'probe_bnc_hook'
          ? 'Probe 1X/10X'
          : kind === 'bnc_bnc'
            ? 'BNC-BNC'
            : kind === 'bnc_alligator'
              ? 'BNC-Buaya'
              : kind === 'bnc_banana'
                ? 'BNC-Banana'
                : kind === 'banana_alligator'
                  ? 'Banana-Buaya'
                  : 'Banana 4mm';
      const col = idx % 4;
      const row = Math.floor(idx / 4) % 3;
      const baseX = -0.28 + col * 0.16;
      const baseZ = 0.04 + row * 0.11;
      return {
        cables: [
          ...s.cables,
          {
            id,
            kind,
            color,
            label,
            endA: null,
            endB: null,
            gndClip: hasGndClip ? null : undefined,
            freePosA: [baseX - 0.055, 0.788, baseZ],
            freePosB: [baseX + 0.055, 0.788, baseZ + 0.03],
            freePosGnd: hasGndClip ? [baseX + 0.02, 0.788, baseZ + 0.075] : undefined,
            probeAtten: kind === 'probe_bnc_hook' ? 1 : undefined,
            probeCompTrim: kind === 'probe_bnc_hook' ? 0 : undefined,
          },
        ],
      };
    });
  },

  removeCable: (cableId) =>
    set((s) => ({
      cables: s.cables.filter((c) => c.id !== cableId),
      grabbedEnd: s.grabbedEnd?.cableId === cableId ? null : s.grabbedEnd,
    })),

  setCableProbeAtten: (cableId, atten) =>
    set((s) => ({
      cables: s.cables.map((c) => (c.id === cableId ? { ...c, probeAtten: atten } : c)),
    })),

  setCableProbeCompTrim: (cableId, trim) =>
    set((s) => ({
      cables: s.cables.map((c) => (c.id === cableId ? { ...c, probeCompTrim: trim } : c)),
    })),

  setActiveKit: (kitId) => {
    labAudio.playButtonClick();
    set((s) => {
      if (s.activeKit === kitId) {
        return {
          activeKit: kitId,
          kitSelected: false,
          kitPickerOpen: false,
        };
      }
      // Only detach cables actually connected to the replaced LDTE Kit (preserve Gen/Scope/Breadboard/Decade cables!)
      const detached = detachKitCables(s.cables, s.grabbedEnd);
      return {
        activeKit: kitId,
        kitSelected: false,
        kitPickerOpen: false,
        cables: detached.cables,
        grabbedEnd: detached.grabbedEnd,
      };
    });
  },

  selectKitBox: (selected) => {
    labAudio.playButtonClick();
    set((s) => ({
      kitSelected: selected,
      kitPickerOpen: selected ? s.kitPickerOpen : false,
    }));
  },

  setKitPickerOpen: (open) => {
    labAudio.playButtonClick();
    set({ kitPickerOpen: open, kitSelected: open ? true : get().kitSelected });
  },

  updateKitControls: (patch) => {
    labAudio.playButtonClick();
    set((s) => ({ kitControls: { ...s.kitControls, ...patch } }));
  },

  pressDM3058Button: (btn) => {
    labAudio.playButtonClick();
    set((s) => {
      const next = reduceDM3058Button(s.dm3058, btn, hotRefs.dm3058Meas);
      if (next.func !== s.dm3058.func || (next.history.length === 0 && btn === 'SOFT_0' && s.dm3058.menu === 'HISTORY')) {
        hotRefs.dm3058History = [];
        hotRefs.dm3058Stats = { min: null, max: null, sum: 0, count: 0 };
      }
      return { dm3058: next };
    });
  },

  enterBreadboardMode: (use2D = true) => {
    labAudio.playButtonClick();
    set((s) => {
      if (!s.breadboardMode) {
        hotRefs.savedBreadboardReturnPose = {
          pos: [...hotRefs.liveCameraPose.pos],
          yaw: hotRefs.liveCameraPose.yaw,
          pitch: hotRefs.liveCameraPose.pitch,
        };
      }
      return {
        breadboardMode: true,
        breadboard2D: use2D,
        breadboard2DFitSeq: s.breadboard2DFitSeq + 1,
        prevCameraTarget: s.breadboardMode ? s.prevCameraTarget : s.cameraTarget,
        cameraTarget: 'bb',
        // Only move the 3D camera when explicitly opening 3D breadboard view; keep exact 3D pose for 2D!
        cameraPresetSeq: use2D ? s.cameraPresetSeq : s.cameraPresetSeq + 1,
        activeDrawer: null,
      };
    });
  },

  exitBreadboardMode: () => {
    labAudio.playButtonClick();
    set((s) => {
      if (hotRefs.savedBreadboardReturnPose) {
        hotRefs.restoreCameraPose = {
          pos: [...hotRefs.savedBreadboardReturnPose.pos],
          yaw: hotRefs.savedBreadboardReturnPose.yaw,
          pitch: hotRefs.savedBreadboardReturnPose.pitch,
        };
        hotRefs.savedBreadboardReturnPose = null;
      }
      return {
        breadboardMode: false,
        breadboard2D: false,
        cameraTarget: s.prevCameraTarget,
        placingPart: null,
        reshapingPart: null,
        selectedBreadboardPartId: null,
        activeDrawer: null,
      };
    });
  },

  setBreadboard2D: (v) => {
    labAudio.playButtonClick();
    set((s) => ({
      breadboard2D: v,
      breadboard2DFitSeq: v ? s.breadboard2DFitSeq + 1 : s.breadboard2DFitSeq,
      cameraTarget: 'bb',
      cameraPresetSeq: !v ? s.cameraPresetSeq + 1 : s.cameraPresetSeq,
    }));
  },

  resetBreadboard2DView: () => {
    labAudio.playButtonClick();
    set((s) => ({ breadboard2DFitSeq: s.breadboard2DFitSeq + 1 }));
  },

  setBreadboardViewMode: (mode) => {
    labAudio.playButtonClick();
    set({ breadboardViewMode: mode });
  },

  toggleBreadboardShowPins: () => {
    labAudio.playButtonClick();
    set((s) => ({ breadboardShowPins: !s.breadboardShowPins }));
  },

  setPlacingVariant: (patch) => {
    labAudio.playButtonClick();
    set((s) => {
      if (!s.placingPart) return {};
      const value = patch.value ?? s.placingPart.value;
      const color = patch.color ?? s.placingPart.color;
      const label = patch.label ?? formatPartLabel(s.placingPart.kind, value, color);
      return { placingPart: { ...s.placingPart, value, color, label } };
    });
  },

  undoBreadboard: () => {
    set((s) => {
      if (s.breadboardUndoStack.length === 0) return {};
      labAudio.playButtonClick();
      const prev = s.breadboardUndoStack[s.breadboardUndoStack.length - 1];
      return {
        breadboardParts: prev,
        cables: detachStaleFloatSockets(s.cables, prev),
        breadboardUndoStack: s.breadboardUndoStack.slice(0, -1),
        breadboardRedoStack: [...s.breadboardRedoStack.slice(-29), structuredClone(s.breadboardParts)],
        selectedBreadboardPartId: null,
        reshapingPart: null,
      };
    });
  },

  redoBreadboard: () => {
    set((s) => {
      if (s.breadboardRedoStack.length === 0) return {};
      labAudio.playButtonClick();
      const next = s.breadboardRedoStack[s.breadboardRedoStack.length - 1];
      return {
        breadboardParts: next,
        cables: detachStaleFloatSockets(s.cables, next),
        breadboardRedoStack: s.breadboardRedoStack.slice(0, -1),
        breadboardUndoStack: [...s.breadboardUndoStack.slice(-29), structuredClone(s.breadboardParts)],
        selectedBreadboardPartId: null,
        reshapingPart: null,
      };
    });
  },

  startPlacingPart: (spec) => {
    labAudio.playButtonClick();
    set({
      placingPart: spec ? { ...spec, rotationDeg: spec.rotationDeg ?? 0, anchorHoleA: null, waypoints: [] } : null,
      grabbedEnd: null,
      selectedBreadboardPartId: null,
      reshapingPart: null,
    });
  },

  cyclePlacingSpan: () =>
    set((s) => {
      if (!s.placingPart) return {};
      const nextSpan = s.placingPart.span === 4 ? 6 : s.placingPart.span === 6 ? 10 : 4;
      return { placingPart: { ...s.placingPart, span: nextSpan } };
    }),

  rotatePlacingPart: () => {
    labAudio.playKnobDetent();
    set((s) => {
      if (!s.placingPart) return {};
      const cur = s.placingPart.rotationDeg ?? 0;
      const next = (((cur + 90) % 360) as 0 | 90 | 180 | 270);
      return { placingPart: { ...s.placingPart, rotationDeg: next } };
    });
  },

  setPlacingColor: (color) => {
    labAudio.playButtonClick();
    set((s) => {
      if (!s.placingPart) return {};
      return {
        placingPart: {
          ...s.placingPart,
          color,
          label: formatPartLabel(s.placingPart.kind, s.placingPart.value, color),
        },
      };
    });
  },

  anchorPlacingHoleA: (holeId) => {
    labAudio.playButtonClick();
    set((s) => {
      if (!s.placingPart) return {};
      return { placingPart: { ...s.placingPart, anchorHoleA: holeId, waypoints: [] } };
    });
  },

  addPlacingWaypoint: (lx, lz) => {
    labAudio.playKnobDetent();
    set((s) => {
      if (!s.placingPart || !s.placingPart.anchorHoleA) return {};
      const prev = s.placingPart.waypoints ?? [];
      return { placingPart: { ...s.placingPart, waypoints: [...prev, [lx, lz]] } };
    });
  },

  stepBackPlacing: () => {
    labAudio.playButtonClick();
    set((s) => {
      const p = s.placingPart;
      if (!p) return {};
      if (p.waypoints && p.waypoints.length > 0) {
        return { placingPart: { ...p, waypoints: p.waypoints.slice(0, -1) } };
      }
      if (p.anchorHoleA) {
        return { placingPart: { ...p, anchorHoleA: null, waypoints: [] } };
      }
      return { placingPart: null };
    });
  },

  togglePlacingFloating: () => {
    labAudio.playButtonClick();
    set((s) => {
      if (!s.placingPart || s.placingPart.kind !== 'jumper') return {};
      const nextFloat = !s.placingPart.floating;
      return {
        placingPart: {
          ...s.placingPart,
          floating: nextFloat,
          label: nextFloat ? 'Jumper Bebas' : 'Jumper',
          anchorHoleA: null,
          waypoints: [],
        },
      };
    });
  },

  commitFloatingJumper: (holeA, rotationDeg) => {
    const st = get();
    const spec = st.placingPart;
    const occupied = getOccupiedHoles(st.breadboardParts);
    if (occupied.has(holeA)) return;

    labAudio.playPlugSnap();
    const id = `bb_floatj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
    const color = spec?.color ?? '#dc2626';
    const newPart: BreadboardPart = {
      id,
      kind: 'jumper',
      label: 'Jumper Bebas',
      value: 0,
      holeA,
      holeB: holeA,
      color,
      floating: true,
      floatOffset: defaultFloatOffsetForHole(holeA, rotationDeg ?? spec?.rotationDeg ?? 0),
    };
    set((s) => ({
      breadboardUndoStack: [...s.breadboardUndoStack.slice(-29), structuredClone(s.breadboardParts)],
      breadboardRedoStack: [],
      breadboardParts: [...s.breadboardParts, newPart],
      placingPart: s.placingPart ? { ...s.placingPart, anchorHoleA: null, waypoints: [] } : null,
    }));
  },

  toggleJumperFloating: (partId) => {
    const st = get();
    const part = st.breadboardParts.find((p) => p.id === partId);
    if (!part || part.kind !== 'jumper') return;
    if (part.floating) {
      // Turn floating jumper back into a 2-hole jumper by choosing Pin B on the board
      st.startReshapingPart(partId, 'pinB');
      return;
    }
    labAudio.playPlugSnap();
    set((s) => ({
      breadboardUndoStack: [...s.breadboardUndoStack.slice(-29), structuredClone(s.breadboardParts)],
      breadboardRedoStack: [],
      reshapingPart: null,
      breadboardParts: s.breadboardParts.map((p) =>
        p.id === partId
          ? {
              ...p,
              label: 'Jumper Bebas',
              holeB: p.holeA,
              floating: true,
              floatOffset: defaultFloatOffsetForHole(p.holeA, 0),
              waypoints: undefined,
            }
          : p
      ),
    }));
  },

  pullAlligatorFromFloatingJumper: (partId) => {
    const st = get();
    const part = st.breadboardParts.find((p) => p.id === partId && p.kind === 'jumper' && p.floating);
    if (!part) return;
    const sockId = floatingJumperSocketId(part.id);
    if (hotRefs.savedBreadboardReturnPose) {
      hotRefs.restoreCameraPose = {
        pos: [...hotRefs.savedBreadboardReturnPose.pos],
        yaw: hotRefs.savedBreadboardReturnPose.yaw,
        pitch: hotRefs.savedBreadboardReturnPose.pitch,
      };
      hotRefs.savedBreadboardReturnPose = null;
    }
    set((s) => ({
      breadboardMode: false,
      breadboard2D: false,
      cameraTarget: s.prevCameraTarget,
      activeDrawer: null,
      selectedBreadboardPartId: null,
      placingPart: null,
      reshapingPart: null,
    }));
    get().clickSocket(sockId, part.color, 'banana_alligator');
  },

  pullBncAlligatorFromFloatingJumper: (partId) => {
    const st = get();
    const part = st.breadboardParts.find((p) => p.id === partId && p.kind === 'jumper' && p.floating);
    if (!part) return;
    const sockId = floatingJumperSocketId(part.id);
    if (hotRefs.savedBreadboardReturnPose) {
      hotRefs.restoreCameraPose = {
        pos: [...hotRefs.savedBreadboardReturnPose.pos],
        yaw: hotRefs.savedBreadboardReturnPose.yaw,
        pitch: hotRefs.savedBreadboardReturnPose.pitch,
      };
      hotRefs.savedBreadboardReturnPose = null;
    }
    set((s) => ({
      breadboardMode: false,
      breadboard2D: false,
      cameraTarget: s.prevCameraTarget,
      activeDrawer: null,
      selectedBreadboardPartId: null,
      placingPart: null,
      reshapingPart: null,
    }));
    get().clickSocket(sockId, part.color === '#18181b' ? '#eab308' : part.color, 'bnc_alligator');
  },

  commitPlacedPart: (holeA, holeB, waypoints) => {
    const st = get();
    const spec = st.placingPart;
    if (!spec) return;
    if (spec.kind !== 'opamp741' && holeA === holeB) return;

    const occupied = getOccupiedHoles(st.breadboardParts);
    if (spec.kind === 'opamp741') {
      const col = Math.min(60, Math.max(1, Number(holeA.split('_')[1]) || 30));
      const preview = computePlacementPreview('opamp741', `t_${col}_e`, 3, 0, occupied);
      if (!preview.valid) return;
      holeA = preview.holeA;
      holeB = preview.holeB;
    } else if (occupied.has(holeA) || occupied.has(holeB)) {
      return;
    }

    labAudio.playPlugSnap();
    const id = `bb_${spec.kind}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
    const newPart: BreadboardPart = {
      id,
      kind: spec.kind,
      label: spec.label,
      value: spec.value,
      holeA,
      holeB,
      color: spec.color,
      waypoints: waypoints && waypoints.length > 0 ? [...waypoints] : undefined,
    };
    set((s) => ({
      breadboardUndoStack: [...s.breadboardUndoStack.slice(-29), structuredClone(s.breadboardParts)],
      breadboardRedoStack: [],
      breadboardParts: [...s.breadboardParts, newPart],
      placingPart: s.placingPart ? { ...s.placingPart, anchorHoleA: null, waypoints: [] } : null,
    }));
  },

  placePartAtHole: (holeA) => {
    const st = get();
    const spec = st.placingPart;
    if (!spec) return;
    const occupied = getOccupiedHoles(st.breadboardParts);
    const preview = computePlacementPreview(
      spec.kind,
      holeA,
      spec.span,
      spec.rotationDeg ?? 0,
      occupied,
      spec.anchorHoleA,
      holeA
    );
    if (!preview.valid) return;
    st.commitPlacedPart(preview.holeA, preview.holeB, spec.waypoints);
  },

  selectBreadboardPart: (id) => {
    if (id) labAudio.playButtonClick();
    set({ selectedBreadboardPartId: id, placingPart: null, reshapingPart: null });
  },

  startReshapingPart: (partId, mode) => {
    labAudio.playButtonClick();
    set({ reshapingPart: { partId, mode }, selectedBreadboardPartId: partId, placingPart: null, grabbedEnd: null });
  },

  commitReshapePart: (targetHole) => {
    const st = get();
    const r = st.reshapingPart;
    if (!r) return;
    const part = st.breadboardParts.find((p) => p.id === r.partId);
    if (!part) {
      set({ reshapingPart: null });
      return;
    }
    const occupied = getOccupiedHoles(st.breadboardParts, part.id);
    let holeA = part.holeA;
    let holeB = part.holeB;
    let nextFloating = part.floating;
    let nextFloatOffset = part.floatOffset;
    let nextLabel = part.label;

    if (r.mode === 'move') {
      const moved = movePartToAnchor(part, targetHole, occupied);
      if (!moved.valid) return;
      holeA = moved.holeA;
      holeB = moved.holeB;
      if (part.kind === 'jumper' && part.floating) {
        nextFloatOffset = defaultFloatOffsetForHole(targetHole, 0);
      }
    } else if (r.mode === 'pinA') {
      if ((!part.floating && targetHole === part.holeB) || occupied.has(targetHole)) return;
      holeA = targetHole;
      if (part.kind === 'jumper' && part.floating) {
        holeB = targetHole;
        nextFloatOffset = defaultFloatOffsetForHole(targetHole, 0);
      }
    } else {
      if (targetHole === part.holeA || occupied.has(targetHole)) return;
      holeB = targetHole;
      if (part.kind === 'jumper' && part.floating) {
        nextFloating = false;
        nextFloatOffset = undefined;
        nextLabel = 'Jumper';
      }
    }
    labAudio.playPlugSnap();
    set((s) => {
      const nextParts = s.breadboardParts.map((p) =>
        p.id === r.partId
          ? {
              ...p,
              holeA,
              holeB,
              floating: nextFloating,
              floatOffset: nextFloatOffset,
              label: nextLabel,
              waypoints: undefined,
            }
          : p
      );
      return {
        breadboardUndoStack: [...s.breadboardUndoStack.slice(-29), structuredClone(s.breadboardParts)],
        breadboardRedoStack: [],
        reshapingPart: null,
        breadboardParts: nextParts,
        cables: detachStaleFloatSockets(s.cables, nextParts),
      };
    });
  },

  updateBreadboardPart: (id, patch) => {
    labAudio.playButtonClick();
    set((s) => ({
      breadboardUndoStack: [...s.breadboardUndoStack.slice(-29), structuredClone(s.breadboardParts)],
      breadboardRedoStack: [],
      breadboardParts: s.breadboardParts.map((p) => {
        if (p.id !== id) return p;
        const value = patch.value ?? p.value;
        const color = patch.color ?? p.color;
        const label = patch.label ?? formatPartLabel(p.kind, value, color);
        return { ...p, value, color, label };
      }),
    }));
  },

  flipBreadboardPart: (id) => {
    labAudio.playKnobDetent();
    set((s) => ({
      breadboardUndoStack: [...s.breadboardUndoStack.slice(-29), structuredClone(s.breadboardParts)],
      breadboardRedoStack: [],
      breadboardParts: s.breadboardParts.map((p) => {
        if (p.id !== id || p.kind === 'opamp741') return p;
        if (p.kind === 'jumper' && p.floating) {
          const cur = p.floatOffset ?? defaultFloatOffsetForHole(p.holeA, 0);
          return { ...p, floatOffset: [-cur[0], -cur[1]] as [number, number] };
        }
        return {
          ...p,
          holeA: p.holeB,
          holeB: p.holeA,
          waypoints: p.waypoints ? [...p.waypoints].reverse() : undefined,
        };
      }),
    }));
  },

  rotateBreadboardPart: (id) => {
    const st = get();
    const part = st.breadboardParts.find((p) => p.id === id);
    if (!part) return;
    if (part.kind === 'jumper' && part.floating) {
      labAudio.playKnobDetent();
      const cur = part.floatOffset ?? defaultFloatOffsetForHole(part.holeA, 0);
      const nextOff = rotateFloatOffset90(cur);
      set((s) => ({
        breadboardUndoStack: [...s.breadboardUndoStack.slice(-29), structuredClone(s.breadboardParts)],
        breadboardRedoStack: [],
        breadboardParts: s.breadboardParts.map((p) => (p.id === id ? { ...p, floatOffset: nextOff } : p)),
      }));
      return;
    }
    const occupied = getOccupiedHoles(st.breadboardParts, part.id);
    const rotated = rotatePart90(part, occupied);
    if (!rotated) return;
    labAudio.playKnobDetent();
    set((s) => ({
      breadboardUndoStack: [...s.breadboardUndoStack.slice(-29), structuredClone(s.breadboardParts)],
      breadboardRedoStack: [],
      breadboardParts: s.breadboardParts.map((p) =>
        p.id === id ? { ...p, holeA: rotated.holeA, holeB: rotated.holeB, waypoints: undefined } : p
      ),
    }));
  },

  removeBreadboardPart: (id) => {
    labAudio.playButtonClick();
    set((s) => {
      const nextParts = s.breadboardParts.filter((p) => p.id !== id);
      return {
        breadboardUndoStack: [...s.breadboardUndoStack.slice(-29), structuredClone(s.breadboardParts)],
        breadboardRedoStack: [],
        breadboardParts: nextParts,
        cables: detachStaleFloatSockets(s.cables, nextParts),
        selectedBreadboardPartId: s.selectedBreadboardPartId === id ? null : s.selectedBreadboardPartId,
        reshapingPart: s.reshapingPart?.partId === id ? null : s.reshapingPart,
      };
    });
  },

  toggleBreadboardVoltageView: () => {
    labAudio.playButtonClick();
    set((s) => ({
      breadboardViewMode: s.breadboardViewMode === 'voltage' ? 'standard' : 'voltage',
    }));
  },

  applyBreadboardPreset: (presetId) => {
    labAudio.playPlugSnap();
    const curParts = get().breadboardParts;
    const nextParts = buildBreadboardPresetParts(presetId);
    set((s) => ({
      breadboardParts: nextParts,
      cables: detachStaleFloatSockets(s.cables, nextParts),
      breadboardUndoStack: [...s.breadboardUndoStack.slice(-29), structuredClone(curParts)],
      breadboardRedoStack: [],
      placingPart: null,
      selectedBreadboardPartId: null,
      reshapingPart: null,
    }));
  },

  applyWiringPreset: (presetId) => {
    labAudio.playPlugSnap();
    if (presetId === 'dual_trace') {
      set({ cables: defaultDualTraceCables(), grabbedEnd: null });
    } else if (presetId === 'probe_comp') {
      set({
        cables: [
          {
            id: 'probe_ch1',
            kind: 'probe_bnc_hook',
            color: '#eab308',
            label: 'Probe CH1',
            endA: 'rigol_ch1',
            endB: 'rigol_comp_sig',
            gndClip: 'rigol_comp_gnd',
            probeAtten: 10,
            probeCompTrim: -0.65,
          },
        ],
        grabbedEnd: null,
      });
    } else if (presetId === 'kit_rlrc_transient') {
      set((s) => ({
        activeKit: 'rl_rc',
        signalGen: { ...s.signalGen, power: true, outputEnabled: true, waveform: 'square', freqHz: 1000, vpp: 4, dcOffset: 2 },
        cables: [
          { id: 'kr_vin', kind: 'banana_4mm', color: '#dc2626', label: 'Gen -> 1k', endA: 'gen_out', endB: 'kr_r1_out' },
          { id: 'kr_g1', kind: 'banana_4mm', color: '#18181b', label: 'Gen GND', endA: 'gen_gnd', endB: 'kr_gnd_c' },
          { id: 'kr_cg', kind: 'banana_4mm', color: '#18181b', label: '100nF -> GND', endA: 'kr_c1_in', endB: 'kr_gnd_l' },
          {
            id: 'probe_ch1',
            kind: 'probe_bnc_hook',
            color: '#eab308',
            label: 'Probe CH1',
            endA: 'rigol_ch1',
            endB: 'kr_r1_out',
            gndClip: 'kr_gnd_r',
            probeAtten: 1,
            probeCompTrim: 0,
          },
          {
            id: 'probe_ch2',
            kind: 'probe_bnc_hook',
            color: '#06b6d4',
            label: 'Probe CH2',
            endA: 'rigol_ch2',
            endB: 'kr_out',
            gndClip: 'kr_gnd_r',
            probeAtten: 1,
            probeCompTrim: 0,
          },
        ],
        grabbedEnd: null,
      }));
    } else if (presetId === 'kit_osc_phase') {
      set((s) => ({
        activeKit: 'osc_gen',
        signalGen: { ...s.signalGen, power: true, outputEnabled: true, waveform: 'sine', freqHz: 1000, vpp: 4, dcOffset: 0 },
        cables: [
          { id: 'ko_in', kind: 'banana_4mm', color: '#dc2626', label: 'Gen -> Phase IN', endA: 'gen_out', endB: 'ko_ph_l' },
          { id: 'ko_gn', kind: 'banana_4mm', color: '#18181b', label: 'Phase -> GND', endA: 'ko_ph_r', endB: 'gen_gnd' },
          {
            id: 'probe_ch1',
            kind: 'probe_bnc_hook',
            color: '#eab308',
            label: 'Probe CH1',
            endA: 'rigol_ch1',
            endB: 'ko_ph_l',
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
            endB: 'ko_ph_c',
            gndClip: 'gen_gnd',
            probeAtten: 1,
            probeCompTrim: 0,
          },
        ],
        grabbedEnd: null,
      }));
    } else if (presetId === 'kit_multimeter_div') {
      set((s) => ({
        activeKit: 'multimeter',
        powerSupply: { ...s.powerSupply, power: true, outputEnabled: true, ch1Voltage: 6.0, trackingDual12V: false },
        dm3058: {
          ...s.dm3058,
          power: true,
          func: 'DCV',
          dualEnabled: false,
          autoRange: true,
          runState: 'RUN',
          menu: 'MAIN',
          dirtySeq: s.dm3058.dirtySeq + 1,
        },
        cables: [
          { id: 'km_vp', kind: 'banana_4mm', color: '#dc2626', label: 'PSU +6V', endA: 'psu_ch1_pos', endB: 'km_r1_1k5' },
          { id: 'km_vn', kind: 'banana_4mm', color: '#18181b', label: 'PSU -', endA: 'psu_ch1_neg', endB: 'km_r2_1k5' },
          { id: 'km_dp', kind: 'banana_4mm', color: '#ef4444', label: 'DMM V+', endA: 'dmm_pos', endB: 'km_div_mid' },
          { id: 'km_dn', kind: 'banana_4mm', color: '#18181b', label: 'DMM COM', endA: 'dmm_com', endB: 'km_r2_1k5' },
          {
            id: 'probe_ch1',
            kind: 'probe_bnc_hook',
            color: '#eab308',
            label: 'Probe CH1',
            endA: 'rigol_ch1',
            endB: 'km_div_mid',
            gndClip: 'psu_ch1_neg',
            probeAtten: 1,
            probeCompTrim: 0,
          },
        ],
        grabbedEnd: null,
      }));
    } else if (presetId === 'kit_thevenin') {
      set((s) => ({
        activeKit: 'thevenin',
        dm3058: {
          ...s.dm3058,
          power: true,
          func: 'DCV',
          dualEnabled: false,
          autoRange: true,
          runState: 'RUN',
          menu: 'MAIN',
          dirtySeq: s.dm3058.dirtySeq + 1,
        },
        cables: [
          { id: 'kt_vp', kind: 'banana_4mm', color: '#dc2626', label: '18V -> A', endA: 'kt_18_p', endB: 'kt_n_a' },
          { id: 'kt_vn', kind: 'banana_4mm', color: '#18181b', label: '0V -> B', endA: 'kt_18_n', endB: 'kt_n_b' },
          { id: 'kt_dp', kind: 'banana_4mm', color: '#ef4444', label: 'DMM C', endA: 'dmm_pos', endB: 'kt_n_c' },
          { id: 'kt_dn', kind: 'banana_4mm', color: '#18181b', label: 'DMM D', endA: 'dmm_com', endB: 'kt_n_d' },
        ],
        grabbedEnd: null,
      }));
    } else if (presetId === 'bb_rc_test') {
      set((s) => ({
        signalGen: { ...s.signalGen, power: true, outputEnabled: true, waveform: 'sine', freqHz: 1500, vpp: 4, dcOffset: 0 },
        breadboardParts: [
          { id: 'bb_rc_r1', kind: 'resistor', label: '1kΩ', value: 1000, holeA: 't_12_c', holeB: 't_18_c' },
          { id: 'bb_rc_c1', kind: 'capacitor', label: '100nF', value: 100e-9, holeA: 't_18_b', holeB: 'tn_15' },
          {
            id: 'bb_rc_jin',
            kind: 'jumper',
            label: 'Jumper Bebas',
            value: 0,
            holeA: 't_12_a',
            holeB: 't_12_a',
            color: '#dc2626',
            floating: true,
            floatOffset: [-0.008, -0.006],
          },
          {
            id: 'bb_rc_jout',
            kind: 'jumper',
            label: 'Jumper Bebas',
            value: 0,
            holeA: 't_18_a',
            holeB: 't_18_a',
            color: '#06b6d4',
            floating: true,
            floatOffset: [0.008, -0.006],
          },
          {
            id: 'bb_rc_jgnd',
            kind: 'jumper',
            label: 'Jumper Bebas',
            value: 0,
            holeA: 'tn_11',
            holeB: 'tn_11',
            color: '#18181b',
            floating: true,
            floatOffset: [-0.004, -0.009],
          },
        ],
        cables: [
          {
            id: 'bb_gin',
            kind: 'banana_alligator',
            color: '#dc2626',
            label: 'Banana-Buaya In',
            endA: 'gen_out',
            endB: 'bb_float_bb_rc_jin',
          },
          {
            id: 'bb_ggnd',
            kind: 'banana_alligator',
            color: '#18181b',
            label: 'Banana-Buaya GND',
            endA: 'gen_gnd',
            endB: 'bb_float_bb_rc_jgnd',
          },
          {
            id: 'bnc_allig_ch1',
            kind: 'bnc_alligator',
            color: '#eab308',
            label: 'BNC-Buaya CH1',
            endA: 'rigol_ch1',
            endB: 'bb_float_bb_rc_jin',
            gndClip: 'bb_float_bb_rc_jgnd',
          },
          {
            id: 'bnc_allig_ch2',
            kind: 'bnc_alligator',
            color: '#06b6d4',
            label: 'BNC-Buaya CH2',
            endA: 'rigol_ch2',
            endB: 'bb_float_bb_rc_jout',
            gndClip: 'bb_float_bb_rc_jgnd',
          },
        ],
        grabbedEnd: null,
      }));
    } else if (presetId === 'gen_ch1') {
      set({
        cables: [
          { id: 'bnc_gen_ch1', kind: 'bnc_bnc', color: '#334155', label: 'BNC-BNC', endA: 'rigol_ch1', endB: 'gen_out' },
        ],
        grabbedEnd: null,
      });
    } else if (presetId === 'psu_ch1') {
      set({
        cables: [
          {
            id: 'probe_psu',
            kind: 'probe_bnc_hook',
            color: '#eab308',
            label: 'Probe CH1',
            endA: 'rigol_ch1',
            endB: 'psu_ch1_pos',
            gndClip: 'psu_ch1_neg',
            probeAtten: 1,
            probeCompTrim: 0,
          },
        ],
        grabbedEnd: null,
      });
    } else {
      set({ cables: [], grabbedEnd: null });
    }
  },

  updateSignalGen: (patch) => {
    labAudio.playButtonClick();
    set((s) => ({ signalGen: { ...s.signalGen, ...patch } }));
  },

  updatePowerSupply: (patch) => {
    labAudio.playButtonClick();
    set((s) => {
      const next = { ...s.powerSupply, ...patch };
      if (next.trackingDual12V) {
        next.ch1Voltage = 12;
        next.ch2Voltage = 12;
      }
      return { powerSupply: next };
    });
  },

  pressScopeButton: (btn) => {
    const s = get().scope;
    if (btn === 'POWER') {
      labAudio.playButtonClick();
      if (s.power === 'OFF') {
        set((prev) => ({ scope: { ...prev.scope, power: 'BOOTING', dirtySeq: prev.scope.dirtySeq + 1 } }));
        setTimeout(() => {
          set((prev) =>
            prev.scope.power === 'BOOTING'
              ? { scope: { ...prev.scope, power: 'ON', dirtySeq: prev.scope.dirtySeq + 1 } }
              : {}
          );
          if (get().scope.utility.sound) labAudio.playScopeBeep();
        }, 700);
      } else {
        set((prev) => ({ scope: { ...prev.scope, power: 'OFF', dirtySeq: prev.scope.dirtySeq + 1 } }));
      }
      return;
    }

    if (s.power !== 'ON') return;
    labAudio.playButtonClick();
    if (s.utility.sound) labAudio.playScopeBeep();

    const next = structuredClone(s) as DS1000EState;
    next.transientPopup = null;
    next.utility.showSystemInfo = false;

    const toggleVerticalChannel = (target: VerticalTarget, menu: MenuId) => {
      if (target === 'CH1') {
        if (!next.ch1.enabled) {
          next.ch1.enabled = true;
          next.selectedVertical = 'CH1';
          next.menuOpen = true;
          next.activeMenu = menu;
          next.menuPage = 0;
        } else if (next.activeMenu !== menu || !next.menuOpen || next.selectedVertical !== 'CH1') {
          next.selectedVertical = 'CH1';
          next.menuOpen = true;
          next.activeMenu = menu;
          next.menuPage = 0;
        } else {
          next.ch1.enabled = false;
          next.menuOpen = false;
        }
      } else if (target === 'CH2') {
        if (!next.ch2.enabled) {
          next.ch2.enabled = true;
          next.selectedVertical = 'CH2';
          next.menuOpen = true;
          next.activeMenu = menu;
          next.menuPage = 0;
        } else if (next.activeMenu !== menu || !next.menuOpen || next.selectedVertical !== 'CH2') {
          next.selectedVertical = 'CH2';
          next.menuOpen = true;
          next.activeMenu = menu;
          next.menuPage = 0;
        } else {
          next.ch2.enabled = false;
          next.menuOpen = false;
        }
      } else if (target === 'MATH') {
        next.math.enabled = next.activeMenu === 'MATH' && next.menuOpen ? !next.math.enabled : true;
        next.selectedVertical = 'MATH';
        next.menuOpen = next.math.enabled;
        next.activeMenu = 'MATH';
        next.menuPage = 0;
      } else if (target === 'REF') {
        next.selectedVertical = 'REF';
        next.menuOpen = true;
        next.activeMenu = 'REF';
        next.menuPage = 0;
      }
    };

    switch (btn) {
      case 'CH1':
        toggleVerticalChannel('CH1', 'CH1');
        break;
      case 'CH2':
        toggleVerticalChannel('CH2', 'CH2');
        break;
      case 'MATH':
        if (next.horizontal.timeBaseMode === 'X-Y') {
          next.transientPopup = {
            title: 'X-Y Mode',
            body: 'Math / FFT tidak tersedia saat Time Base = X-Y. Kembalikan ke Y-T melalui HORIZ MENU.',
          };
        } else {
          toggleVerticalChannel('MATH', 'MATH');
        }
        break;
      case 'REF':
        toggleVerticalChannel('REF', 'REF');
        break;
      case 'OFF':
        if (next.selectedVertical === 'CH1') next.ch1.enabled = false;
        else if (next.selectedVertical === 'CH2') next.ch2.enabled = false;
        else if (next.selectedVertical === 'MATH') next.math.enabled = false;
        else if (next.selectedVertical === 'REF') next.ref.enabled = false;
        break;
      case 'HORIZ_MENU':
        Object.assign(next, openMenu(next, 'HORIZ', 0));
        break;
      case 'TRIG_MENU':
        Object.assign(next, openMenu(next, 'TRIG', 0));
        break;
      case 'MEASURE':
        Object.assign(next, openMenu(next, 'MEASURE', 0));
        break;
      case 'ACQUIRE':
        Object.assign(next, openMenu(next, 'ACQUIRE', 0));
        break;
      case 'STORAGE':
        Object.assign(next, openMenu(next, 'STORAGE', 0));
        break;
      case 'CURSOR':
        Object.assign(next, openMenu(next, 'CURSOR', 0));
        break;
      case 'DISPLAY':
        Object.assign(next, openMenu(next, 'DISPLAY', 0));
        break;
      case 'UTILITY':
        Object.assign(next, openMenu(next, 'UTILITY', 0));
        break;
      case 'MENU_ONOFF':
        next.menuOpen = !next.menuOpen;
        break;
      case 'RUN/STOP':
        next.runState = next.runState === 'RUN' ? 'STOP' : 'RUN';
        next.trigger.status = next.runState === 'STOP' ? 'STOP' : "T'D";
        break;
      case '50%': {
        const frame = hotRefs.scopeFrame;
        if (frame) {
          next.trigger.levelVolts =
            next.trigger.source === 'CH2' ? frame.ch2MidpointVolts : frame.ch1MidpointVolts;
        }
        break;
      }
      case 'FORCE':
        next.trigger.forceRequested = true;
        if (next.runState === 'STOP') next.runState = 'RUN';
        break;
      case 'AUTO': {
        const frame = hotRefs.scopeFrame;
        const dt = (12 * next.horizontal.timePerDiv) / 600;
        const autoDone = computeAutoSetup(
          next,
          frame?.ch1Samples ?? new Float32Array(600),
          frame?.ch2Samples ?? new Float32Array(600),
          dt,
          'Multi-Cycle',
          frame?.measurements.values.Freq
        );
        Object.assign(next, openMenu(autoDone, 'AUTO', 0));
        break;
      }
      case 'PRINT':
        scopeExportHooks.exportBitmap();
        break;
    }

    next.dirtySeq++;
    set({ scope: next });
  },

  longPressScopeHelp: (btn) => {
    const s = get().scope;
    if (s.power !== 'ON') return;
    const entry = HELP_TEXT_MAP[btn];
    if (!entry) return;
    labAudio.playScopeBeep();
    set((prev) => ({
      scope: {
        ...prev.scope,
        transientPopup: entry,
        dirtySeq: prev.scope.dirtySeq + 1,
      },
    }));
  },

  pressScopeSoftKey: (slotIdx) => {
    const s = get().scope;
    if (s.power !== 'ON') return;
    labAudio.playButtonClick();
    if (!s.menuOpen) {
      set((prev) => ({ scope: { ...prev.scope, menuOpen: true, dirtySeq: prev.scope.dirtySeq + 1 } }));
      return;
    }
    const updated = handleSoftKeyPress(s, slotIdx, getMenuCtx(get, set));
    set({ scope: updated });
  },

  turnScopeKnob: (knob, steps) => {
    const s = get().scope;
    if (s.power !== 'ON' || steps === 0) return;
    labAudio.playKnobDetent();
    const next = structuredClone(s) as DS1000EState;

    const isXY = next.horizontal.timeBaseMode === 'X-Y';

    if (knob === 'VERT_POS') {
      const clampOffsetDiv = (v: number) => Math.max(-3.8, Math.min(3.8, Number(v.toFixed(3))));
      const deltaDiv = steps * 0.2;
      if (next.selectedVertical === 'CH1') next.ch1.offsetDiv = clampOffsetDiv(next.ch1.offsetDiv + deltaDiv);
      else if (next.selectedVertical === 'CH2') next.ch2.offsetDiv = clampOffsetDiv(next.ch2.offsetDiv + deltaDiv);
      else if (next.selectedVertical === 'MATH') next.math.offsetDiv = clampOffsetDiv(next.math.offsetDiv + deltaDiv);
      else next.ref.offsetDiv = clampOffsetDiv(next.ref.offsetDiv + deltaDiv);

      const ch = next.selectedVertical === 'CH2' ? next.ch2 : next.ch1;
      const offVolts = ch.offsetDiv * ch.voltsPerDiv;
      const sign = offVolts >= 0 ? '+' : '';
      const axisTag = isXY
        ? next.selectedVertical === 'CH2'
          ? 'CH2(Y)'
          : 'CH1(X)'
        : next.selectedVertical;
      hotRefs.lastKnobReadout = `${axisTag} Pos = ${sign}${offVolts.toFixed(2)}V`;
      hotRefs.lastKnobReadoutKind = 'vert_pos';
      hotRefs.lastKnobReadoutUntil = performance.now() + 1500;
      hotRefs.scopeDirty = true;
    } else if (knob === 'VERT_SCALE') {
      if (next.selectedVertical === 'CH1') next.ch1.voltsPerDiv = stepVoltsPerDiv(next.ch1, steps);
      else if (next.selectedVertical === 'CH2') next.ch2.voltsPerDiv = stepVoltsPerDiv(next.ch2, steps);
      else if (next.selectedVertical === 'MATH') {
        next.math.voltsPerDiv = Math.max(0.01, next.math.voltsPerDiv * (steps > 0 ? 0.5 : 2));
      } else {
        next.ref.voltsPerDiv = Math.max(0.01, next.ref.voltsPerDiv * (steps > 0 ? 0.5 : 2));
      }
    } else if (knob === 'HORIZ_POS') {
      if (isXY) {
        next.ch1.offsetDiv += steps * 0.2;
        const offVolts = next.ch1.offsetDiv * next.ch1.voltsPerDiv;
        const sign = offVolts >= 0 ? '+' : '';
        hotRefs.lastKnobReadout = `CH1(X) Pos = ${sign}${offVolts.toFixed(2)}V`;
        hotRefs.lastKnobReadoutKind = 'vert_pos';
        hotRefs.lastKnobReadoutUntil = performance.now() + 1500;
      } else {
        next.horizontal.triggerOffsetSec += steps * next.horizontal.timePerDiv * 0.2;
        hotRefs.lastKnobReadout = `T->${formatTimeValue(next.horizontal.triggerOffsetSec)}`;
        hotRefs.lastKnobReadoutKind = 'horiz_pos';
        hotRefs.lastKnobReadoutUntil = performance.now() + 1500;
      }
      hotRefs.scopeDirty = true;
    } else if (knob === 'HORIZ_SCALE') {
      next.horizontal.timePerDiv = stepTimePerDiv(next.horizontal.timePerDiv, steps);
      if (isXY) {
        hotRefs.lastKnobReadout = `X-Y Span = ${formatTimeValue(12 * next.horizontal.timePerDiv)}`;
        hotRefs.lastKnobReadoutKind = 'horiz_pos';
        hotRefs.lastKnobReadoutUntil = performance.now() + 1400;
        hotRefs.scopeDirty = true;
      }
    } else if (knob === 'TRIG_LEVEL') {
      if (!isXY) {
        const ch = next.trigger.source === 'CH2' ? next.ch2 : next.ch1;
        next.trigger.levelVolts += steps * ch.voltsPerDiv * 0.15;
        hotRefs.lastKnobReadout = `Trig Lvl = ${next.trigger.levelVolts.toFixed(2)}V`;
        hotRefs.lastKnobReadoutKind = 'trig_level';
        hotRefs.lastKnobReadoutUntil = performance.now() + 1800;
        hotRefs.scopeDirty = true;
      }
    } else if (knob === 'MULTI') {
      const updated = adjustMultiTarget(next, steps);
      set({ scope: updated });
      return;
    }

    next.dirtySeq++;
    set({ scope: next });
  },

  pushScopeKnob: (knob) => {
    const s = get().scope;
    if (s.power !== 'ON') return;
    labAudio.playButtonClick();
    const next = structuredClone(s) as DS1000EState;

    if (knob === 'VERT_POS') {
      if (next.selectedVertical === 'CH1') next.ch1.offsetDiv = 0;
      else if (next.selectedVertical === 'CH2') next.ch2.offsetDiv = 0;
      else if (next.selectedVertical === 'MATH') next.math.offsetDiv = 0;
      else next.ref.offsetDiv = 0;
    } else if (knob === 'VERT_SCALE') {
      if (next.selectedVertical === 'CH1') {
        next.ch1.coarseFine = next.ch1.coarseFine === 'Coarse' ? 'Fine' : 'Coarse';
      } else if (next.selectedVertical === 'CH2') {
        next.ch2.coarseFine = next.ch2.coarseFine === 'Coarse' ? 'Fine' : 'Coarse';
      }
    } else if (knob === 'HORIZ_POS') {
      if (next.horizontal.timeBaseMode === 'X-Y') next.ch1.offsetDiv = 0;
      else next.horizontal.triggerOffsetSec = 0;
    } else if (knob === 'HORIZ_SCALE') {
      if (next.horizontal.timeBaseMode !== 'X-Y') {
        next.horizontal.delayedScan = !next.horizontal.delayedScan;
      }
    } else if (knob === 'TRIG_LEVEL') {
      next.trigger.levelVolts = 0;
    } else if (knob === 'MULTI') {
      if (next.transientPopup) next.transientPopup = null;
      else if (next.utility.showSystemInfo) next.utility.showSystemInfo = false;
      else if (next.activeMenu === 'CURSOR' && next.cursor.mode !== 'OFF') {
        const toB = next.activeMultiTarget !== 'cursor_b';
        next.cursor.activeCursor = toB ? 'B' : 'A';
        next.activeMultiTarget = toB ? 'cursor_b' : 'cursor_a';
      }
    }

    next.dirtySeq++;
    set({ scope: next });
  },

  syncScopeTriggerStatus: (status) => {
    const s = get().scope;
    if (s.trigger.status !== status || s.trigger.forceRequested) {
      set((prev) => ({
        scope: {
          ...prev.scope,
          trigger: { ...prev.scope.trigger, status, forceRequested: false },
          runState: status === 'STOP' ? 'STOP' : prev.scope.runState,
        },
      }));
    }
  },
}));
