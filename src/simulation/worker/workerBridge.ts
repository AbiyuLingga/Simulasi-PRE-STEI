import type { DS1000EState } from '../../instruments/ds1000e/types';
import { extractRawValue } from '../../instruments/dm3058/state';
import { hotRefs } from '../../state/hotRefs';
import type { CompileBenchParams } from '../circuit/netlistCompiler';
import type { WorkerRequest, WorkerResponse } from './circuit.worker';

class SimulationWorkerBridge {
  private worker: Worker | null = null;
  private busy = false;
  private onFaults?: (faults: WorkerResponse['faults']) => void;
  private onAutoTriggerStatus?: (status: WorkerResponse['frame']['triggerStatus']) => void;

  start(
    onFaults: (faults: WorkerResponse['faults']) => void,
    onAutoTriggerStatus?: (status: WorkerResponse['frame']['triggerStatus']) => void,
    getActiveFunc?: () => import('../../instruments/dm3058/types').DM3058Function
  ): void {
    this.onFaults = onFaults;
    this.onAutoTriggerStatus = onAutoTriggerStatus;
    if (this.worker || typeof Worker === 'undefined') return;

    this.worker = new Worker(new URL('./circuit.worker.ts', import.meta.url), {
      type: 'module',
    });

    this.worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      this.busy = false;
      if (ev.data.type === 'sim_result') {
        hotRefs.scopeFrame = ev.data.frame;
        hotRefs.scopeDirty = true;
        hotRefs.faults = ev.data.faults;
        hotRefs.dmmReadout = ev.data.dmmReadout;
        hotRefs.dm3058Meas = ev.data.dm3058Meas;
        hotRefs.bbNodeVoltages = ev.data.bbNodeVoltages;
        hotRefs.ledCurrents = ev.data.ledCurrents;

        if (getActiveFunc) {
          const val = extractRawValue(getActiveFunc(), ev.data.dm3058Meas);
          if (Number.isFinite(val)) {
            const hist = hotRefs.dm3058History;
            if (hist.length >= 24) hist.shift();
            hist.push(val);
            const st = hotRefs.dm3058Stats;
            st.min = st.min === null ? val : Math.min(st.min, val);
            st.max = st.max === null ? val : Math.max(st.max, val);
            st.sum += val;
            st.count += 1;
          }
        }

        this.onFaults?.(ev.data.faults);
        this.onAutoTriggerStatus?.(ev.data.frame.triggerStatus);
      }
    };

    this.worker.onerror = () => {
      this.busy = false;
    };
  }

  requestTick(bench: CompileBenchParams, scope: DS1000EState): void {
    if (!this.worker || this.busy) return;
    this.busy = true;
    const msg: WorkerRequest = { type: 'sim_tick', bench, scope };
    this.worker.postMessage(msg);
  }

  stop(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.busy = false;
    }
  }
}

export const workerBridge = new SimulationWorkerBridge();
