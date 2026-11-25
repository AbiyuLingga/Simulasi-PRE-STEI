import type { FaultEvent } from '../simulation/circuit/types';
import type { ScopeFrameOutput } from '../instruments/ds1000e/types';
import { DM3058_EMPTY_MEAS } from '../instruments/dm3058/state';
import type { DM3058MeasurementPacket } from '../instruments/dm3058/types';

export interface CameraPose {
  pos: [number, number, number];
  yaw: number;
  pitch: number;
}

export interface HotRuntimeRefs {
  scopeFrame: ScopeFrameOutput | null;
  scopeDirty: boolean;
  faults: FaultEvent[];
  dmmReadout: string;
  dm3058Meas: DM3058MeasurementPacket;
  dm3058History: number[];
  dm3058Stats: { min: number | null; max: number | null; sum: number; count: number };
  dm3058LastBeepMs: number;
  bbNodeVoltages: Record<string, number>;
  ledCurrents: Record<string, number>;
  handTargetWorld: [number, number, number];
  pointerSurfaceNormal: [number, number, number];
  hoveredSocketId: string | null;
  knobHovered: boolean;
  lastKnobReadout: string | null;
  lastKnobReadoutKind: 'trig_level' | 'vert_pos' | 'horiz_pos' | null;
  lastKnobReadoutUntil: number;
  liveCameraPose: CameraPose;
  savedBreadboardReturnPose: CameraPose | null;
  restoreCameraPose: CameraPose | null;
  fps: number;
  drawCalls: number;
  triangles: number;
}

export const hotRefs: HotRuntimeRefs = {
  scopeFrame: null,
  scopeDirty: false,
  faults: [],
  dmmReadout: '0.000,00V',
  dm3058Meas: { ...DM3058_EMPTY_MEAS },
  dm3058History: [],
  dm3058Stats: { min: null, max: null, sum: 0, count: 0 },
  dm3058LastBeepMs: 0,
  bbNodeVoltages: {},
  ledCurrents: {},
  handTargetWorld: [0.15, 0.788, 0.22],
  pointerSurfaceNormal: [0, 1, 0],
  hoveredSocketId: null,
  knobHovered: false,
  lastKnobReadout: null,
  lastKnobReadoutKind: null,
  lastKnobReadoutUntil: 0,
  liveCameraPose: { pos: [0.02, 1.32, 0.98], yaw: 0.0196, pitch: -0.4316 },
  savedBreadboardReturnPose: null,
  restoreCameraPose: null,
  fps: 60,
  drawCalls: 0,
  triangles: 0,
};
