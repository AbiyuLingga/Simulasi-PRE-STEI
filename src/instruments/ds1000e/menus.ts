import {
  ACQUIRE_MODE_CYCLE,
  ALL_TIME_MEASURE_PAGES,
  ALL_VOLT_MEASURE_PAGES,
  COUPLING_CYCLE,
  CURSOR_MODE_CYCLE,
  FFT_WINDOW_CYCLE,
  FILTER_TYPE_CYCLE,
  GRID_CYCLE,
  MATH_OP_CYCLE,
  PROBE_ATTEN_LIST,
  TIMEBASE_CYCLE,
  TRIG_COUPLING_CYCLE,
  TRIG_MODE_CYCLE,
  TRIG_SLOPE_CYCLE,
  TRIG_SWEEP_CYCLE,
  formatFreqValue,
  formatTimeValue,
  nextInCycle,
  takeSnapshot,
} from './state';
import type { ChannelConfig, DS1000ESnapshot, DS1000EState, MeasureParamKey } from './types';

export interface SoftKeyItem {
  label: string;
  value?: string;
  style?: 'popup' | 'box' | 'multi' | 'action' | 'status';
  active?: boolean;
  isPageArrow?: 'up' | 'down';
  pageLabel?: string;
}

export interface SoftKeyMenuView {
  header: string;
  keys: [SoftKeyItem, SoftKeyItem, SoftKeyItem, SoftKeyItem, SoftKeyItem];
}

export interface MenuActionContext {
  exportBitmap: () => void;
  exportCSV: () => void;
  autoSetup: (mode: 'Multi-Cycle' | 'Single Cycle' | 'Rise Edge' | 'Fall Edge') => void;
  captureRef: () => void;
  saveInternalSlot: (slot: number) => void;
  loadInternalSlot: (slot: number) => void;
  resetFactory: () => DS1000EState;
}

function getActiveCh(s: DS1000EState, which: 'CH1' | 'CH2'): ChannelConfig {
  return which === 'CH1' ? s.ch1 : s.ch2;
}

export function getSoftKeyMenuView(s: DS1000EState): SoftKeyMenuView {
  const blank: SoftKeyItem = { label: '' };

  switch (s.activeMenu) {
    case 'CH1':
    case 'CH2': {
      const ch = getActiveCh(s, s.activeMenu);
      if (s.menuPage === 0) {
        return {
          header: s.activeMenu,
          keys: [
            { label: 'Coupling', value: ch.coupling, style: 'popup' },
            { label: 'BW Limit', value: ch.bwLimit ? 'ON' : 'OFF', style: 'box', active: ch.bwLimit },
            { label: 'Probe', value: `${ch.probe}X`, style: 'popup' },
            { label: 'Digital Filter', style: 'action', active: ch.filter.enabled },
            { label: '', isPageArrow: 'down', pageLabel: '1/2' },
          ],
        };
      }
      return {
        header: s.activeMenu,
        keys: [
          { label: '', isPageArrow: 'up', pageLabel: '2/2' },
          { label: 'Volts/Div', value: ch.coarseFine, style: 'box' },
          { label: 'Invert', value: ch.invert ? 'ON' : 'OFF', style: 'box', active: ch.invert },
          blank,
          blank,
        ],
      };
    }

    case 'CH_FILTER': {
      const ch = getActiveCh(s, s.filterChannel);
      return {
        header: 'Filter',
        keys: [
          { label: 'Digital Filter', value: ch.filter.enabled ? 'ON' : 'OFF', style: 'box', active: ch.filter.enabled },
          { label: 'Filter Type', value: ch.filter.type, style: 'popup' },
          {
            label: 'Upper limit',
            value: formatFreqValue(ch.filter.upperHz),
            style: 'multi',
            active: s.activeMultiTarget === 'filter_upper',
          },
          {
            label: 'Lower limit',
            value: formatFreqValue(ch.filter.lowerHz),
            style: 'multi',
            active: s.activeMultiTarget === 'filter_lower',
          },
          { label: 'Back', style: 'action' },
        ],
      };
    }

    case 'MATH': {
      if (s.math.op === 'FFT') {
        return {
          header: 'FFT',
          keys: [
            { label: 'Operate', value: 'FFT', style: 'popup' },
            { label: 'Source', value: s.math.fftSource, style: 'box' },
            { label: 'Window', value: s.math.fftWindow, style: 'popup' },
            { label: 'Display', value: s.math.fftDisplay, style: 'box' },
            { label: 'Scale', value: s.math.fftScale === 'Vrms' ? 'VRMS' : 'dBVrms', style: 'box' },
          ],
        };
      }
      return {
        header: 'Math',
        keys: [
          { label: 'Operate', value: s.math.op, style: 'popup' },
          { label: 'Source A', value: s.math.sourceA, style: 'box' },
          { label: 'Source B', value: s.math.sourceB, style: 'box' },
          { label: 'Invert', value: 'OFF', style: 'box' },
          blank,
        ],
      };
    }

    case 'REF': {
      return {
        header: 'REF',
        keys: [
          { label: 'Source', value: s.ref.source, style: 'popup' },
          { label: 'Location', value: s.ref.location, style: 'popup' },
          { label: 'Save', style: 'action', active: s.ref.storedSamples !== null },
          { label: 'Display', value: s.ref.enabled ? 'ON' : 'OFF', style: 'box', active: s.ref.enabled },
          blank,
        ],
      };
    }

    case 'HORIZ': {
      const isXY = s.horizontal.timeBaseMode === 'X-Y';
      return {
        header: 'Time',
        keys: [
          isXY
            ? { label: 'Delayed', value: 'N/A', style: 'status' }
            : { label: 'Delayed', value: s.horizontal.delayedScan ? 'ON' : 'OFF', style: 'box', active: s.horizontal.delayedScan },
          blank,
          { label: 'Time Base', value: s.horizontal.timeBaseMode, style: 'popup' },
          { label: 'Sa Rate', value: '1.00GSa', style: 'status' },
          isXY
            ? { label: 'X-Y Center', value: 'Zero', style: 'box' }
            : { label: 'Trig-Offset', value: 'Reset', style: 'box' },
        ],
      };
    }

    case 'TRIG': {
      return {
        header: 'Trigger',
        keys: [
          { label: 'Mode', value: s.trigger.mode, style: 'popup' },
          { label: 'Source', value: s.trigger.source, style: 'popup' },
          {
            label: s.trigger.mode === 'Pulse' ? 'Polarity' : 'Slope',
            value: s.trigger.slope,
            style: 'popup',
          },
          { label: 'Sweep', value: s.trigger.sweep, style: 'popup' },
          { label: 'Set Up', style: 'action' },
        ],
      };
    }

    case 'TRIG_SETUP': {
      return {
        header: 'Trig Setup',
        keys: [
          { label: 'Coupling', value: s.trigger.coupling, style: 'popup' },
          {
            label: 'Sensitivity',
            value: `${s.trigger.sensitivityDiv.toFixed(1)}div`,
            style: 'multi',
            active: s.activeMultiTarget === 'trig_sensitivity',
          },
          {
            label: 'Holdoff',
            value: formatTimeValue(s.trigger.holdoffSec),
            style: 'multi',
            active: s.activeMultiTarget === 'trig_holdoff',
          },
          { label: 'Holdoff Reset', style: 'action' },
          { label: 'Back', style: 'action' },
        ],
      };
    }

    case 'MEASURE': {
      return {
        header: 'Measure',
        keys: [
          { label: 'Source', value: s.measure.source, style: 'box' },
          { label: 'Voltage', style: 'popup' },
          { label: 'Time', style: 'popup' },
          { label: 'Clear', style: 'box' },
          { label: 'Display All', value: s.measure.displayAll ? 'ON' : 'OFF', style: 'box', active: s.measure.displayAll },
        ],
      };
    }

    case 'MEASURE_VOLT': {
      const pageItems = ALL_VOLT_MEASURE_PAGES[s.measure.paramPageVolt] ?? ALL_VOLT_MEASURE_PAGES[0];
      const total = ALL_VOLT_MEASURE_PAGES.length;
      return {
        header: `Volt (${s.measure.paramPageVolt + 1}/${total})`,
        keys: [
          pageItems[0] ? { label: pageItems[0], style: 'box', active: s.measure.activeSlots.includes(pageItems[0]) } : blank,
          pageItems[1] ? { label: pageItems[1], style: 'box', active: s.measure.activeSlots.includes(pageItems[1]) } : blank,
          pageItems[2] ? { label: pageItems[2], style: 'box', active: s.measure.activeSlots.includes(pageItems[2]) } : blank,
          pageItems[3] ? { label: pageItems[3], style: 'box', active: s.measure.activeSlots.includes(pageItems[3]) } : blank,
          { label: '', isPageArrow: 'down', pageLabel: `${s.measure.paramPageVolt + 1}/${total}` },
        ],
      };
    }

    case 'MEASURE_TIME': {
      const pageItems = ALL_TIME_MEASURE_PAGES[s.measure.paramPageTime] ?? ALL_TIME_MEASURE_PAGES[0];
      const total = ALL_TIME_MEASURE_PAGES.length;
      return {
        header: `Time (${s.measure.paramPageTime + 1}/${total})`,
        keys: [
          pageItems[0] ? { label: pageItems[0], style: 'box', active: s.measure.activeSlots.includes(pageItems[0]) } : blank,
          pageItems[1] ? { label: pageItems[1], style: 'box', active: s.measure.activeSlots.includes(pageItems[1]) } : blank,
          pageItems[2] ? { label: pageItems[2], style: 'box', active: s.measure.activeSlots.includes(pageItems[2]) } : blank,
          pageItems[3] ? { label: pageItems[3], style: 'box', active: s.measure.activeSlots.includes(pageItems[3]) } : blank,
          { label: '', isPageArrow: 'down', pageLabel: `${s.measure.paramPageTime + 1}/${total}` },
        ],
      };
    }

    case 'ACQUIRE': {
      return {
        header: 'Acquire',
        keys: [
          { label: 'Acquisition', value: s.acquire.mode, style: 'popup' },
          { label: 'Averages', value: `${s.acquire.averages}`, style: 'multi', active: s.activeMultiTarget === 'acq_averages' },
          { label: 'MemDepth', value: s.acquire.memDepth, style: 'popup' },
          { label: 'Sin(x)/x', value: s.acquire.interpolation === 'Sin(x)/x' ? 'ON' : 'OFF', style: 'box' },
          blank,
        ],
      };
    }

    case 'DISPLAY': {
      if (s.menuPage === 0) {
        return {
          header: 'Display',
          keys: [
            { label: 'Type', value: s.display.type, style: 'box' },
            { label: 'Clear', style: 'box' },
            { label: 'Persist', value: s.display.persist, style: 'box', active: s.display.persist === 'Infinite' },
            {
              label: 'Intensity',
              value: `${s.display.intensity}%`,
              style: 'multi',
              active: s.activeMultiTarget === 'disp_intensity',
            },
            { label: '', isPageArrow: 'down', pageLabel: '1/2' },
          ],
        };
      }
      return {
        header: 'Display',
        keys: [
          { label: '', isPageArrow: 'up', pageLabel: '2/2' },
          { label: 'Grid', value: s.display.grid, style: 'popup' },
          {
            label: 'Brightness',
            value: `${s.display.gridBrightness}%`,
            style: 'multi',
            active: s.activeMultiTarget === 'disp_grid_bright',
          },
          { label: 'Menu Disp', value: s.display.menuTimeout, style: 'popup' },
          blank,
        ],
      };
    }

    case 'CURSOR': {
      if (s.cursor.mode === 'Track') {
        return {
          header: 'Cursor',
          keys: [
            { label: 'Mode', value: s.cursor.mode, style: 'popup' },
            { label: 'Cursor A', value: s.cursor.trackSourceA, style: 'box' },
            { label: 'Cursor B', value: s.cursor.trackSourceB, style: 'box' },
            { label: 'CurA', value: `${(s.cursor.curA * 100).toFixed(0)}%`, style: 'multi', active: s.activeMultiTarget === 'cursor_a' },
            { label: 'CurB', value: `${(s.cursor.curB * 100).toFixed(0)}%`, style: 'multi', active: s.activeMultiTarget === 'cursor_b' },
          ],
        };
      }
      return {
        header: 'Cursor',
        keys: [
          { label: 'Mode', value: s.cursor.mode, style: 'popup' },
          { label: 'Type', value: s.cursor.type, style: 'box' },
          { label: 'Source', value: s.cursor.source, style: 'box' },
          { label: 'CurA', value: `${(s.cursor.curA * 100).toFixed(0)}%`, style: 'multi', active: s.activeMultiTarget === 'cursor_a' },
          { label: 'CurB', value: `${(s.cursor.curB * 100).toFixed(0)}%`, style: 'multi', active: s.activeMultiTarget === 'cursor_b' },
        ],
      };
    }

    case 'STORAGE': {
      return {
        header: 'Storage',
        keys: [
          { label: 'Storage', value: s.storage.type, style: 'popup' },
          s.storage.type === 'Bitmap'
            ? { label: 'Para', value: s.storage.bitmapPara ? 'ON' : 'OFF', style: 'box' }
            : s.storage.type === 'CSV'
              ? { label: 'Data Depth', value: s.storage.csvDepth, style: 'box' }
              : s.storage.type === 'Factory'
                ? { label: 'Load Factory', style: 'action' }
                : {
                    label: 'Internal',
                    value: `Int_0${s.storage.internalSlot}`,
                    style: 'multi',
                    active: s.activeMultiTarget === 'storage_slot',
                  },
          s.storage.type === 'Bitmap' || s.storage.type === 'CSV'
            ? { label: 'External Save', style: 'action' }
            : s.storage.type === 'Factory'
              ? blank
              : { label: 'Save Slot', style: 'action' },
          s.storage.type === 'Waveform' || s.storage.type === 'Setups' ? { label: 'Load Slot', style: 'action' } : blank,
          blank,
        ],
      };
    }

    case 'UTILITY': {
      if (s.menuPage === 0) {
        return {
          header: 'Utility',
          keys: [
            { label: 'Sound', value: s.utility.sound ? 'ON' : 'OFF', style: 'box', active: s.utility.sound },
            { label: 'Counter', value: s.utility.counter ? 'ON' : 'OFF', style: 'box', active: s.utility.counter },
            { label: 'Pass/Fail', style: 'action', active: s.utility.passFail.enabled },
            { label: 'Preference', style: 'action' },
            { label: '', isPageArrow: 'down', pageLabel: '1/2' },
          ],
        };
      }
      return {
        header: 'Utility',
        keys: [
          { label: '', isPageArrow: 'up', pageLabel: '2/2' },
          { label: 'Self-Cal', style: 'action' },
          { label: 'System Info', style: 'action', active: s.utility.showSystemInfo },
          { label: 'Factory', style: 'action' },
          blank,
        ],
      };
    }

    case 'UTILITY_PASSFAIL': {
      return {
        header: 'Pass/Fail',
        keys: [
          { label: 'Enable Test', value: s.utility.passFail.enabled ? 'ON' : 'OFF', style: 'box', active: s.utility.passFail.enabled },
          { label: 'Operate', value: s.utility.passFail.running ? 'RUN' : 'STOP', style: 'box', active: s.utility.passFail.running },
          { label: 'Create Mask', style: 'action', active: s.utility.passFail.maskCreated },
          {
            label: 'X/Y Mask',
            value: `${s.utility.passFail.yMaskDiv.toFixed(1)}d`,
            style: 'multi',
            active: s.activeMultiTarget === 'pf_ymask',
          },
          { label: 'Back', style: 'action' },
        ],
      };
    }

    case 'UTILITY_PREF': {
      return {
        header: 'Preference',
        keys: [
          { label: 'Expand', value: s.utility.expandRef, style: 'box' },
          { label: 'Back', style: 'action' },
          blank,
          blank,
          blank,
        ],
      };
    }

    case 'AUTO': {
      return {
        header: 'AUTO',
        keys: [
          { label: 'Multi-Cycle', style: 'action' },
          { label: 'Single Cycle', style: 'action' },
          { label: 'Rise Edge', style: 'action' },
          { label: 'Fall Edge', style: 'action' },
          { label: 'Cancel (Undo)', style: 'action' },
        ],
      };
    }

    default:
      return {
        header: 'Menu',
        keys: [blank, blank, blank, blank, blank],
      };
  }
}

export function handleSoftKeyPress(
  state: DS1000EState,
  slotIdx: 0 | 1 | 2 | 3 | 4,
  ctx: MenuActionContext
): DS1000EState {
  if (state.power !== 'ON') return state;
  const next = structuredClone(state) as DS1000EState;
  next.transientPopup = null;
  next.utility.showSystemInfo = false;

  switch (next.activeMenu) {
    case 'CH1':
    case 'CH2': {
      const ch = next.activeMenu === 'CH1' ? next.ch1 : next.ch2;
      if (next.menuPage === 0) {
        if (slotIdx === 0) ch.coupling = nextInCycle(COUPLING_CYCLE, ch.coupling);
        else if (slotIdx === 1) ch.bwLimit = !ch.bwLimit;
        else if (slotIdx === 2) {
          const prev = ch.probe;
          ch.probe = nextInCycle(PROBE_ATTEN_LIST, ch.probe);
          ch.voltsPerDiv = (ch.voltsPerDiv / prev) * ch.probe;
        } else if (slotIdx === 3) {
          next.filterChannel = next.activeMenu;
          next.activeMenu = 'CH_FILTER';
          next.menuPage = 0;
        } else if (slotIdx === 4) {
          next.menuPage = 1;
        }
      } else {
        if (slotIdx === 0) next.menuPage = 0;
        else if (slotIdx === 1) ch.coarseFine = ch.coarseFine === 'Coarse' ? 'Fine' : 'Coarse';
        else if (slotIdx === 2) ch.invert = !ch.invert;
      }
      break;
    }

    case 'CH_FILTER': {
      const ch = next.filterChannel === 'CH1' ? next.ch1 : next.ch2;
      if (slotIdx === 0) ch.filter.enabled = !ch.filter.enabled;
      else if (slotIdx === 1) ch.filter.type = nextInCycle(FILTER_TYPE_CYCLE, ch.filter.type);
      else if (slotIdx === 2) next.activeMultiTarget = 'filter_upper';
      else if (slotIdx === 3) next.activeMultiTarget = 'filter_lower';
      else if (slotIdx === 4) next.activeMenu = next.filterChannel;
      break;
    }

    case 'MATH': {
      if (slotIdx === 0) next.math.op = nextInCycle(MATH_OP_CYCLE, next.math.op);
      else if (next.math.op === 'FFT') {
        if (slotIdx === 1) next.math.fftSource = next.math.fftSource === 'CH1' ? 'CH2' : 'CH1';
        else if (slotIdx === 2) next.math.fftWindow = nextInCycle(FFT_WINDOW_CYCLE, next.math.fftWindow);
        else if (slotIdx === 3) next.math.fftDisplay = next.math.fftDisplay === 'Split' ? 'Full' : 'Split';
        else if (slotIdx === 4) next.math.fftScale = next.math.fftScale === 'dB' ? 'Vrms' : 'dB';
      } else {
        if (slotIdx === 1) next.math.sourceA = next.math.sourceA === 'CH1' ? 'CH2' : 'CH1';
        else if (slotIdx === 2) next.math.sourceB = next.math.sourceB === 'CH1' ? 'CH2' : 'CH1';
      }
      break;
    }

    case 'REF': {
      if (slotIdx === 0) next.ref.source = nextInCycle(['CH1', 'CH2', 'MATH'] as const, next.ref.source);
      else if (slotIdx === 1) next.ref.location = next.ref.location === 'Internal' ? 'External' : 'Internal';
      else if (slotIdx === 2) ctx.captureRef();
      else if (slotIdx === 3) next.ref.enabled = !next.ref.enabled;
      break;
    }

    case 'HORIZ': {
      if (slotIdx === 0) {
        if (next.horizontal.timeBaseMode !== 'X-Y') {
          next.horizontal.delayedScan = !next.horizontal.delayedScan;
        }
      } else if (slotIdx === 2) {
        const prevMode = next.horizontal.timeBaseMode;
        const nextMode = nextInCycle(TIMEBASE_CYCLE, prevMode);
        next.horizontal.timeBaseMode = nextMode;
        next.display.clearNonce++;
        if (nextMode === 'X-Y' && prevMode !== 'X-Y') {
          next.horizontal.savedYtOffsets = {
            ch1: next.ch1.offsetDiv,
            ch2: next.ch2.offsetDiv,
          };
          next.ch1.enabled = true;
          next.ch2.enabled = true;
          next.ch1.offsetDiv = 0;
          next.ch2.offsetDiv = 0;
          next.horizontal.delayedScan = false;
          next.math.enabled = false;
        } else if (prevMode === 'X-Y' && nextMode !== 'X-Y') {
          if (next.horizontal.savedYtOffsets) {
            next.ch1.offsetDiv = next.horizontal.savedYtOffsets.ch1;
            next.ch2.offsetDiv = next.horizontal.savedYtOffsets.ch2;
            next.horizontal.savedYtOffsets = null;
          }
        }
      } else if (slotIdx === 4) {
        if (next.horizontal.timeBaseMode === 'X-Y') {
          next.ch1.offsetDiv = 0;
          next.ch2.offsetDiv = 0;
        } else {
          next.horizontal.triggerOffsetSec = 0;
        }
      }
      break;
    }

    case 'TRIG': {
      if (slotIdx === 0) next.trigger.mode = nextInCycle(TRIG_MODE_CYCLE, next.trigger.mode);
      else if (slotIdx === 1) next.trigger.source = nextInCycle(['CH1', 'CH2', 'EXT', 'AC Line'] as const, next.trigger.source);
      else if (slotIdx === 2) next.trigger.slope = nextInCycle(TRIG_SLOPE_CYCLE, next.trigger.slope);
      else if (slotIdx === 3) next.trigger.sweep = nextInCycle(TRIG_SWEEP_CYCLE, next.trigger.sweep);
      else if (slotIdx === 4) next.activeMenu = 'TRIG_SETUP';
      break;
    }

    case 'TRIG_SETUP': {
      if (slotIdx === 0) next.trigger.coupling = nextInCycle(TRIG_COUPLING_CYCLE, next.trigger.coupling);
      else if (slotIdx === 1) next.activeMultiTarget = 'trig_sensitivity';
      else if (slotIdx === 2) next.activeMultiTarget = 'trig_holdoff';
      else if (slotIdx === 3) next.trigger.holdoffSec = 5e-7;
      else if (slotIdx === 4) next.activeMenu = 'TRIG';
      break;
    }

    case 'MEASURE': {
      if (slotIdx === 0) next.measure.source = next.measure.source === 'CH1' ? 'CH2' : 'CH1';
      else if (slotIdx === 1) {
        next.activeMenu = 'MEASURE_VOLT';
        next.measure.paramPageVolt = 0;
      } else if (slotIdx === 2) {
        next.activeMenu = 'MEASURE_TIME';
        next.measure.paramPageTime = 0;
      } else if (slotIdx === 3) {
        next.measure.activeSlots = [];
        next.measure.displayAll = false;
      } else if (slotIdx === 4) {
        next.measure.displayAll = !next.measure.displayAll;
      }
      break;
    }

    case 'MEASURE_VOLT': {
      const pageItems = ALL_VOLT_MEASURE_PAGES[next.measure.paramPageVolt] ?? [];
      if (slotIdx === 4) {
        if (next.measure.paramPageVolt + 1 < ALL_VOLT_MEASURE_PAGES.length) {
          next.measure.paramPageVolt++;
        } else {
          next.activeMenu = 'MEASURE';
        }
      } else {
        const param = pageItems[slotIdx];
        if (param) toggleMeasureSlot(next, param);
      }
      break;
    }

    case 'MEASURE_TIME': {
      const pageItems = ALL_TIME_MEASURE_PAGES[next.measure.paramPageTime] ?? [];
      if (slotIdx === 4) {
        if (next.measure.paramPageTime + 1 < ALL_TIME_MEASURE_PAGES.length) {
          next.measure.paramPageTime++;
        } else {
          next.activeMenu = 'MEASURE';
        }
      } else {
        const param = pageItems[slotIdx];
        if (param) toggleMeasureSlot(next, param);
      }
      break;
    }

    case 'ACQUIRE': {
      if (slotIdx === 0) next.acquire.mode = nextInCycle(ACQUIRE_MODE_CYCLE, next.acquire.mode);
      else if (slotIdx === 1) next.activeMultiTarget = 'acq_averages';
      else if (slotIdx === 2) next.acquire.memDepth = next.acquire.memDepth === 'Normal' ? 'Long Mem' : 'Normal';
      else if (slotIdx === 3) next.acquire.interpolation = next.acquire.interpolation === 'Sin(x)/x' ? 'Linear' : 'Sin(x)/x';
      break;
    }

    case 'DISPLAY': {
      if (next.menuPage === 0) {
        if (slotIdx === 0) next.display.type = next.display.type === 'Vectors' ? 'Dots' : 'Vectors';
        else if (slotIdx === 1) next.display.clearNonce++;
        else if (slotIdx === 2) next.display.persist = next.display.persist === 'OFF' ? 'Infinite' : 'OFF';
        else if (slotIdx === 3) next.activeMultiTarget = 'disp_intensity';
        else if (slotIdx === 4) next.menuPage = 1;
      } else {
        if (slotIdx === 0) next.menuPage = 0;
        else if (slotIdx === 1) next.display.grid = nextInCycle(GRID_CYCLE, next.display.grid);
        else if (slotIdx === 2) next.activeMultiTarget = 'disp_grid_bright';
        else if (slotIdx === 3) {
          next.display.menuTimeout = nextInCycle(['Infinite', '2s', '5s', '10s', '20s'] as const, next.display.menuTimeout);
        }
      }
      break;
    }

    case 'CURSOR': {
      if (slotIdx === 0) {
        next.cursor.mode = nextInCycle(CURSOR_MODE_CYCLE, next.cursor.mode);
        if (next.cursor.mode === 'Manual') next.activeMultiTarget = 'cursor_a';
      } else if (next.cursor.mode === 'Track') {
        if (slotIdx === 1) next.cursor.trackSourceA = nextInCycle(['CH1', 'CH2', 'None'] as const, next.cursor.trackSourceA);
        else if (slotIdx === 2) next.cursor.trackSourceB = nextInCycle(['CH1', 'CH2', 'None'] as const, next.cursor.trackSourceB);
        else if (slotIdx === 3) {
          next.cursor.activeCursor = 'A';
          next.activeMultiTarget = 'cursor_a';
        } else if (slotIdx === 4) {
          next.cursor.activeCursor = 'B';
          next.activeMultiTarget = 'cursor_b';
        }
      } else {
        if (slotIdx === 1) next.cursor.type = next.cursor.type === 'X' ? 'Y' : 'X';
        else if (slotIdx === 2) next.cursor.source = nextInCycle(['CH1', 'CH2', 'MATH'] as const, next.cursor.source);
        else if (slotIdx === 3) {
          next.cursor.activeCursor = 'A';
          next.activeMultiTarget = 'cursor_a';
        } else if (slotIdx === 4) {
          next.cursor.activeCursor = 'B';
          next.activeMultiTarget = 'cursor_b';
        }
      }
      break;
    }

    case 'STORAGE': {
      if (slotIdx === 0) {
        next.storage.type = nextInCycle(['Waveform', 'Setups', 'Bitmap', 'CSV', 'Factory'] as const, next.storage.type);
      } else if (next.storage.type === 'Bitmap') {
        if (slotIdx === 1) next.storage.bitmapPara = !next.storage.bitmapPara;
        else if (slotIdx === 2) ctx.exportBitmap();
      } else if (next.storage.type === 'CSV') {
        if (slotIdx === 1) next.storage.csvDepth = next.storage.csvDepth === 'Displayed' ? 'Maximum' : 'Displayed';
        else if (slotIdx === 2) ctx.exportCSV();
      } else if (next.storage.type === 'Factory') {
        if (slotIdx === 1) return ctx.resetFactory();
      } else {
        if (slotIdx === 1) next.activeMultiTarget = 'storage_slot';
        else if (slotIdx === 2) ctx.saveInternalSlot(next.storage.internalSlot);
        else if (slotIdx === 3) ctx.loadInternalSlot(next.storage.internalSlot);
      }
      break;
    }

    case 'UTILITY': {
      if (next.menuPage === 0) {
        if (slotIdx === 0) next.utility.sound = !next.utility.sound;
        else if (slotIdx === 1) next.utility.counter = !next.utility.counter;
        else if (slotIdx === 2) next.activeMenu = 'UTILITY_PASSFAIL';
        else if (slotIdx === 3) next.activeMenu = 'UTILITY_PREF';
        else if (slotIdx === 4) next.menuPage = 1;
      } else {
        if (slotIdx === 0) next.menuPage = 0;
        else if (slotIdx === 1) {
          next.transientPopup = { title: 'Self-Calibration', body: 'ADC zero & gain calibration completed (OK).' };
        } else if (slotIdx === 2) {
          next.utility.showSystemInfo = true;
        } else if (slotIdx === 3) {
          return ctx.resetFactory();
        }
      }
      break;
    }

    case 'UTILITY_PASSFAIL': {
      if (slotIdx === 0) next.utility.passFail.enabled = !next.utility.passFail.enabled;
      else if (slotIdx === 1) next.utility.passFail.running = !next.utility.passFail.running;
      else if (slotIdx === 2) {
        next.utility.passFail.maskCreated = true;
        next.utility.passFail.passCount = 0;
        next.utility.passFail.failCount = 0;
      } else if (slotIdx === 3) {
        next.activeMultiTarget = 'pf_ymask';
      } else if (slotIdx === 4) {
        next.activeMenu = 'UTILITY';
      }
      break;
    }

    case 'UTILITY_PREF': {
      if (slotIdx === 0) next.utility.expandRef = next.utility.expandRef === 'Ground' ? 'Center' : 'Ground';
      else if (slotIdx === 1) next.activeMenu = 'UTILITY';
      break;
    }

    case 'AUTO': {
      if (slotIdx === 0) ctx.autoSetup('Multi-Cycle');
      else if (slotIdx === 1) ctx.autoSetup('Single Cycle');
      else if (slotIdx === 2) ctx.autoSetup('Rise Edge');
      else if (slotIdx === 3) ctx.autoSetup('Fall Edge');
      else if (slotIdx === 4 && next.previousSnapshotForAutoUndo) {
        const snap = next.previousSnapshotForAutoUndo;
        next.ch1 = snap.ch1;
        next.ch2 = snap.ch2;
        next.horizontal = snap.horizontal;
        next.trigger = { ...next.trigger, ...snap.trigger };
        next.previousSnapshotForAutoUndo = null;
      }
      break;
    }
  }

  next.dirtySeq++;
  return next;
}

function toggleMeasureSlot(s: DS1000EState, param: MeasureParamKey): void {
  const idx = s.measure.activeSlots.indexOf(param);
  if (idx >= 0) {
    s.measure.activeSlots.splice(idx, 1);
  } else {
    if (s.measure.activeSlots.length >= 3) {
      s.measure.activeSlots.shift();
    }
    s.measure.activeSlots.push(param);
  }
}

export function applyAutoSnapshot(s: DS1000EState): DS1000ESnapshot {
  return takeSnapshot(s);
}
