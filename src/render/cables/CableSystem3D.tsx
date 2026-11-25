import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { hotRefs } from '../../state/hotRefs';
import { useLabStore } from '../../state/labStore';
import {
  floatingJumperSocketId,
  floatingJumperTipNormal,
  floatingJumperTipWorldPos,
  holeIdToWorldPos,
} from '../../simulation/breadboard/breadboardModel';
import type { CableConnection, SocketId } from '../../simulation/circuit/types';
import {
  resolveCableCollisions,
  type CableStrand,
  type ConnectorObstacle,
  type SplitterBody,
} from './cableCollisionSolver';
import {
  ALLIGATOR_WIRE_EXIT_Y,
  BANANA_STACK_STEP,
  BANANA_WIRE_EXIT_LOCAL,
  BANANA_WIRE_TAN_LOCAL,
  getConnectorGeometries,
} from './connectorGeometries';
import { socketRegistry } from './socketRegistry';

const UNPLUGGED_BASE = new THREE.Vector3(-0.52, 0.789, 0.16);
const UP_AXIS = new THREE.Vector3(0, 1, 0);
const DOWN_AXIS = new THREE.Vector3(0, -1, 0);
const FWD_Z = new THREE.Vector3(0, 0, 1);

const _xAxis = new THREE.Vector3();
const _yAxis = new THREE.Vector3();
const _zAxis = new THREE.Vector3();
const _rotMat = new THREE.Matrix4();
const _tmpQuat = new THREE.Quaternion();
const _tmpVec = new THREE.Vector3();

function isBncSocket(sock: SocketId | null | undefined): boolean {
  return (
    sock === 'rigol_ch1' ||
    sock === 'rigol_ch2' ||
    sock === 'rigol_ext' ||
    sock === 'gen_out' ||
    sock === 'gen_ch2_out'
  );
}

/**
 * Stackable 4mm Lab Banana Plug (Pomona / Hirschmann ribbed body + rear coaxial 4mm stacking jack + angled cable boot).
 */
function StackableBananaPlugMesh({ color }: { color: string }) {
  const geos = useMemo(() => getConnectorGeometries(), []);
  const tipCapColor = color.toLowerCase() === '#18181b' ? '#e11d48' : '#e2e8f0';
  return (
    <group>
      <mesh geometry={geos.bananaHousing} castShadow>
        <meshStandardMaterial color={color} roughness={0.42} metalness={0.05} />
      </mesh>
      <mesh geometry={geos.bananaMetal}>
        <meshStandardMaterial color="#dde4ed" roughness={0.2} metalness={0.9} />
      </mesh>
      <mesh geometry={geos.bananaDarkDetail}>
        <meshStandardMaterial color="#1f242d" roughness={0.62} metalness={0.12} />
      </mesh>
      <mesh geometry={geos.bananaTipCap}>
        <meshStandardMaterial color={tipCapColor} roughness={0.35} metalness={tipCapColor === '#e2e8f0' ? 0.85 : 0.08} />
      </mesh>
    </group>
  );
}

/**
 * Classic Glossy PVC-Sleeved Lab Alligator Clip with serrated chrome metal jaws.
 */
function AlligatorClipMesh({ color }: { color: string }) {
  const geos = useMemo(() => getConnectorGeometries(), []);
  return (
    <group>
      <mesh geometry={geos.alligatorJaws}>
        <meshStandardMaterial color="#dce4ee" roughness={0.2} metalness={0.9} />
      </mesh>
      <mesh geometry={geos.alligatorBoot} castShadow>
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.04} />
      </mesh>
    </group>
  );
}

/**
 * Authentic Chrome Bayonet BNC Plug with channel color ring and molded strain-relief boot.
 */
function BncPlugMesh({ color }: { color: string }) {
  const geos = useMemo(() => getConnectorGeometries(), []);
  return (
    <group>
      <mesh geometry={geos.bncMetal} castShadow>
        <meshStandardMaterial color="#d4dce5" roughness={0.24} metalness={0.88} />
      </mesh>
      <mesh geometry={geos.bncRing}>
        <meshStandardMaterial color={color} roughness={0.38} metalness={0.05} />
      </mesh>
      <mesh geometry={geos.bncBoot} castShadow>
        <meshStandardMaterial color="#1f242c" roughness={0.48} metalness={0.06} />
      </mesh>
    </group>
  );
}

interface ResolvedEnd {
  pos: THREE.Vector3;
  normal: THREE.Vector3;
  resting: boolean;
}

interface CableRenderHandles {
  trunkMesh: THREE.Mesh | null;
  sigBranchMesh: THREE.Mesh | null;
  gndWireMesh: THREE.Mesh | null;
  splitterMesh: THREE.Mesh | null;
  endAGroup: THREE.Group | null;
  endBGroup: THREE.Group | null;
  gndGroup: THREE.Group | null;
  lastTrunkHash: string;
  lastSigHash: string;
  lastGndHash: string;
}

function resolveEndPoint(
  cableId: string,
  end: 'endA' | 'endB' | 'gndClip',
  socketId: SocketId | null | undefined,
  freePos: [number, number, number] | undefined,
  grabbedEnd: { cableId: string; end: 'endA' | 'endB' | 'gndClip' } | null,
  fallbackOffsetIdx: number
): ResolvedEnd {
  if (grabbedEnd && grabbedEnd.cableId === cableId && grabbedEnd.end === end) {
    const handPos = new THREE.Vector3(...hotRefs.handTargetWorld);
    const snap = socketRegistry.findNearest(handPos, 0.052);
    if (snap) {
      return { pos: snap.position.clone(), normal: snap.normal.clone(), resting: false };
    }
    const surfN = new THREE.Vector3(...hotRefs.pointerSurfaceNormal).normalize();
    return { pos: handPos, normal: surfN, resting: true };
  }

  if (socketId) {
    const sock = socketRegistry.get(socketId);
    if (sock) {
      return { pos: sock.position.clone(), normal: sock.normal.clone(), resting: false };
    }
    if (socketId.startsWith('bb_float_')) {
      const part = useLabStore
        .getState()
        .breadboardParts.find((p) => p.kind === 'jumper' && p.floating && floatingJumperSocketId(p.id) === socketId);
      if (part) {
        return {
          pos: new THREE.Vector3(...floatingJumperTipWorldPos(part)),
          normal: new THREE.Vector3(...floatingJumperTipNormal(part)),
          resting: false,
        };
      }
    }
    if (socketId.startsWith('bb_')) {
      return {
        pos: new THREE.Vector3(...holeIdToWorldPos(socketId)).add(new THREE.Vector3(0, 0.004, 0)),
        normal: UP_AXIS.clone(),
        resting: false,
      };
    }
  }

  if (freePos) {
    return {
      pos: new THREE.Vector3(freePos[0], freePos[1], freePos[2]),
      normal: UP_AXIS.clone(),
      resting: true,
    };
  }

  const slotOff = (fallbackOffsetIdx % 6) * 0.042;
  const sideOff = end === 'endA' ? -0.06 : end === 'gndClip' ? 0.02 : 0.06;
  return {
    pos: new THREE.Vector3(UNPLUGGED_BASE.x + sideOff, UNPLUGGED_BASE.y, UNPLUGGED_BASE.z + slotOff),
    normal: UP_AXIS.clone(),
    resting: true,
  };
}

function orientConnector(
  mesh: THREE.Object3D,
  pos: THREE.Vector3,
  dir: THREE.Vector3,
  lieOnSide = false
): THREE.Quaternion {
  mesh.position.copy(pos);
  _yAxis.copy(dir).normalize();
  if (lieOnSide) {
    _xAxis.copy(UP_AXIS);
    if (Math.abs(_yAxis.dot(_xAxis)) > 0.92) _xAxis.set(1, 0, 0);
    _zAxis.crossVectors(_xAxis, _yAxis).normalize();
    _xAxis.crossVectors(_yAxis, _zAxis).normalize();
  } else {
    const refZ = Math.abs(_yAxis.dot(DOWN_AXIS)) > 0.92 ? FWD_Z : DOWN_AXIS;
    _xAxis.crossVectors(_yAxis, refZ).normalize();
    _zAxis.crossVectors(_xAxis, _yAxis).normalize();
  }
  _rotMat.makeBasis(_xAxis, _yAxis, _zAxis);
  mesh.quaternion.setFromRotationMatrix(_rotMat);
  return mesh.quaternion;
}

function clampBenchY(pt: THREE.Vector3): number {
  if (Math.abs(pt.x) < 0.92 && pt.z > -0.38 && pt.z < 0.48) {
    return Math.max(0.788, pt.y);
  }
  return pt.y;
}

/**
 * Fans multiple alligator clips gripping the same floating jumper pin radially & angularly
 * so their 8.6mm PVC boots stay clearly separated without interpenetrating.
 */
function applyFloatPinFan(end: ResolvedEnd, stackIdx: number): void {
  if (stackIdx <= 0) return;
  const sign = stackIdx % 2 === 1 ? 1 : -1;
  const tier = Math.ceil(stackIdx / 2);
  const fanAngle = sign * (0.62 + (tier - 1) * 0.28);
  const rotAxis = stackIdx % 3 === 0 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
  end.normal.applyAxisAngle(rotAxis, fanAngle).normalize();
  end.pos.addScaledVector(end.normal, 0.0042 * tier);
  end.pos.y += 0.0025 * tier;
}

function computeBananaWireAnchor(
  plugPos: THREE.Vector3,
  plugQuat: THREE.Quaternion
): { exitPos: THREE.Vector3; exitTan: THREE.Vector3 } {
  const exitPos = BANANA_WIRE_EXIT_LOCAL.clone().applyQuaternion(plugQuat).add(plugPos);
  const exitTan = BANANA_WIRE_TAN_LOCAL.clone().applyQuaternion(plugQuat).normalize();
  return { exitPos, exitTan };
}

function hashPoints(pts: THREE.Vector3[]): string {
  let out = '';
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    out += `${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}|`;
  }
  return out;
}

function resamplePolyline(controlPts: THREE.Vector3[], count: number): THREE.Vector3[] {
  const curve = new THREE.CatmullRomCurve3(controlPts);
  return curve.getPoints(Math.max(2, count - 1));
}

function SingleCable3D({
  cable,
  registerHandles,
  unregisterHandles,
}: {
  cable: CableConnection;
  registerHandles: (id: string, handles: CableRenderHandles) => void;
  unregisterHandles: (id: string) => void;
}) {
  const grabCableEnd = useLabStore((s) => s.grabCableEnd);
  const setHoverLabel = useLabStore((s) => s.setHoverLabel);

  const handlesRef = useRef<CableRenderHandles>({
    trunkMesh: null,
    sigBranchMesh: null,
    gndWireMesh: null,
    splitterMesh: null,
    endAGroup: null,
    endBGroup: null,
    gndGroup: null,
    lastTrunkHash: '',
    lastSigHash: '',
    lastGndHash: '',
  });

  useEffect(() => {
    const h = handlesRef.current;
    registerHandles(cable.id, h);
    return () => {
      unregisterHandles(cable.id);
      h.trunkMesh?.geometry.dispose();
      h.sigBranchMesh?.geometry.dispose();
      h.gndWireMesh?.geometry.dispose();
    };
  }, [cable.id, registerHandles, unregisterHandles]);

  const isBananaEndA =
    (cable.kind === 'banana_4mm' && !isBncSocket(cable.endA)) || cable.kind === 'banana_alligator';
  const isDualSplit = cable.kind === 'bnc_alligator' || cable.kind === 'bnc_banana';
  const hasGndLead = cable.kind === 'probe_bnc_hook' || isDualSplit;
  const isBananaEndB = cable.kind === 'banana_4mm' || cable.kind === 'bnc_banana';
  const isAlligatorEndB = cable.kind === 'banana_alligator' || cable.kind === 'bnc_alligator';
  const isBananaGnd = cable.kind === 'bnc_banana';

  const handleEndClick = (end: 'endA' | 'endB' | 'gndClip') => {
    const st = useLabStore.getState();
    const g = st.grabbedEnd;
    if (g) {
      const isSelfGrabbed = g.cableId === cable.id && g.end === end;
      if (!isSelfGrabbed) {
        const pluggedSocket = end === 'endA' ? cable.endA : end === 'endB' ? cable.endB : cable.gndClip;
        if (pluggedSocket) {
          st.clickSocket(pluggedSocket);
          return;
        }
      }
      const handPos = new THREE.Vector3(...hotRefs.handTargetWorld);
      const snap = socketRegistry.findNearest(handPos, 0.052);
      const targetId = hotRefs.hoveredSocketId ?? snap?.id ?? null;
      if (targetId) {
        st.clickSocket(targetId);
      } else {
        st.dropOrSnapCableEnd(null, [...hotRefs.handTargetWorld]);
      }
    } else {
      grabCableEnd(cable.id, end);
    }
  };

  return (
    <group>
      {/* Main Cable Trunk */}
      <mesh
        ref={(el) => {
          handlesRef.current.trunkMesh = el;
        }}
        castShadow
      >
        <meshStandardMaterial
          color={isBananaEndA ? cable.color : cable.kind === 'bnc_bnc' ? '#1f2937' : '#23272f'}
          roughness={0.5}
        />
      </mesh>

      {/* Y-Splitter + Colored '+' Branch for BOTH BNC-Banana and BNC-Alligator */}
      {isDualSplit && (
        <>
          <mesh
            ref={(el) => {
              handlesRef.current.sigBranchMesh = el;
            }}
            castShadow
          >
            <meshStandardMaterial color={cable.color} roughness={0.46} />
          </mesh>
          <mesh
            ref={(el) => {
              handlesRef.current.splitterMesh = el;
            }}
            castShadow
          >
            <cylinderGeometry args={[0.0042, 0.0052, 0.015, 12]} />
            <meshStandardMaterial color="#18181b" roughness={0.52} />
          </mesh>
        </>
      )}

      {/* Black '-' / GND Wire Branch */}
      {hasGndLead && (
        <mesh
          ref={(el) => {
            handlesRef.current.gndWireMesh = el;
          }}
          castShadow
        >
          <meshStandardMaterial color="#18181b" roughness={0.56} />
        </mesh>
      )}

      {/* Connector End A: Stackable 4mm Banana Plug or Bayonet BNC Plug */}
      <group
        ref={(el) => {
          handlesRef.current.endAGroup = el;
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHoverLabel(`${cable.label} (${isBananaEndA ? 'Banana 4mm Tumpuk' : 'BNC'})`);
          document.body.style.cursor = 'grab';
        }}
        onPointerOut={() => {
          setHoverLabel(null);
          document.body.style.cursor = 'auto';
        }}
        onPointerDown={(e) => {
          if (e.button === 0) e.stopPropagation();
        }}
        onClick={(e) => {
          e.stopPropagation();
          handleEndClick('endA');
        }}
      >
        {isBananaEndA ? <StackableBananaPlugMesh color={cable.color} /> : <BncPlugMesh color={cable.color} />}
      </group>

      {/* Connector End B (+ Signal Lead) */}
      <group
        ref={(el) => {
          handlesRef.current.endBGroup = el;
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHoverLabel(
            cable.kind === 'bnc_banana'
              ? `${cable.label} (+) Banana 4mm`
              : cable.kind === 'bnc_alligator'
                ? `${cable.label} (+) Jepit Buaya`
                : cable.kind === 'banana_alligator'
                  ? `${cable.label} (Jepit Buaya)`
                  : cable.kind === 'banana_4mm'
                    ? `${cable.label} (Banana 4mm Tumpuk)`
                    : `${cable.label} Tip`
          );
          document.body.style.cursor = 'grab';
        }}
        onPointerOut={() => {
          setHoverLabel(null);
          document.body.style.cursor = 'auto';
        }}
        onPointerDown={(e) => {
          if (e.button === 0) e.stopPropagation();
        }}
        onClick={(e) => {
          e.stopPropagation();
          handleEndClick('endB');
        }}
      >
        {cable.kind === 'probe_bnc_hook' ? (
          <>
            <mesh position={[0, 0.0025, 0]} castShadow>
              <cylinderGeometry args={[0.0011, 0.0018, 0.006, 10]} />
              <meshStandardMaterial color="#e2e8f0" roughness={0.25} metalness={0.88} />
            </mesh>
            <mesh position={[0, 0.019, 0]} castShadow>
              <cylinderGeometry args={[0.0052, 0.0038, 0.028, 14]} />
              <meshStandardMaterial color="#272b33" roughness={0.46} metalness={0.08} />
            </mesh>
            <mesh position={[0, 0.031, 0]}>
              <cylinderGeometry args={[0.0055, 0.0055, 0.004, 14]} />
              <meshStandardMaterial color={cable.color} roughness={0.35} />
            </mesh>
            <mesh position={[0, 0.018, 0.0046]}>
              <boxGeometry args={[0.0028, 0.0085, 0.0018]} />
              <meshStandardMaterial color="#94a3b8" roughness={0.45} />
            </mesh>
          </>
        ) : isAlligatorEndB ? (
          <AlligatorClipMesh color={cable.color} />
        ) : isBananaEndB ? (
          <StackableBananaPlugMesh color={cable.color} />
        ) : (
          <BncPlugMesh color={cable.color} />
        )}
      </group>

      {/* Negative (-) / Ground Lead */}
      {hasGndLead && (
        <group
          ref={(el) => {
            handlesRef.current.gndGroup = el;
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHoverLabel(isBananaGnd ? `${cable.label} (-) GND Banana 4mm` : `${cable.label} (-) GND Jepit Buaya`);
            document.body.style.cursor = 'grab';
          }}
          onPointerOut={() => {
            setHoverLabel(null);
            document.body.style.cursor = 'auto';
          }}
          onPointerDown={(e) => {
            if (e.button === 0) e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            handleEndClick('gndClip');
          }}
        >
          {isBananaGnd ? <StackableBananaPlugMesh color="#18181b" /> : <AlligatorClipMesh color="#18181b" />}
        </group>
      )}
    </group>
  );
}

export function CableSystem3D() {
  const cables = useLabStore((s) => s.cables);
  const grabbedEnd = useLabStore((s) => s.grabbedEnd);
  const breadboardParts = useLabStore((s) => s.breadboardParts);
  const activeKit = useLabStore((s) => s.activeKit);

  const snapRingRef = useMemo(() => ({ current: null as THREE.Mesh | null }), []);
  const placeRingRef = useMemo(() => ({ current: null as THREE.Mesh | null }), []);
  const handlesMapRef = useRef(new Map<string, CableRenderHandles>());
  const settledRef = useRef(false);

  const registerHandles = useMemo(
    () => (id: string, h: CableRenderHandles) => {
      handlesMapRef.current.set(id, h);
      settledRef.current = false;
    },
    []
  );
  const unregisterHandles = useMemo(
    () => (id: string) => {
      handlesMapRef.current.delete(id);
      settledRef.current = false;
    },
    []
  );

  useEffect(() => {
    settledRef.current = false;
  }, [cables, grabbedEnd, breadboardParts, activeKit]);

  const socketStackCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of cables) {
      if (c.endA && !(grabbedEnd?.cableId === c.id && grabbedEnd.end === 'endA')) {
        counts.set(c.endA, (counts.get(c.endA) ?? 0) + 1);
      }
      if (c.endB && !(grabbedEnd?.cableId === c.id && grabbedEnd.end === 'endB')) {
        counts.set(c.endB, (counts.get(c.endB) ?? 0) + 1);
      }
      if (c.gndClip && !(grabbedEnd?.cableId === c.id && grabbedEnd.end === 'gndClip')) {
        counts.set(c.gndClip, (counts.get(c.gndClip) ?? 0) + 1);
      }
    }
    return counts;
  }, [cables, grabbedEnd]);

  useFrame(() => {
    // 1. Update snap / placement highlight ring while dragging
    if (snapRingRef.current && placeRingRef.current) {
      if (!grabbedEnd) {
        snapRingRef.current.visible = false;
        placeRingRef.current.visible = false;
        hotRefs.hoveredSocketId = null;
      } else {
        const handPos = _tmpVec.set(
          hotRefs.handTargetWorld[0],
          hotRefs.handTargetWorld[1],
          hotRefs.handTargetWorld[2]
        );
        const snap = socketRegistry.findNearest(handPos, 0.052);
        if (snap) {
          const existing = socketStackCounts.get(snap.id) ?? 0;
          const stackShift = snap.kind === 'banana' ? existing * BANANA_STACK_STEP : 0;
          snapRingRef.current.visible = true;
          snapRingRef.current.position.copy(snap.position).addScaledVector(snap.normal, stackShift + 0.004);
          snapRingRef.current.lookAt(snapRingRef.current.position.clone().add(snap.normal));
          placeRingRef.current.visible = false;
          hotRefs.hoveredSocketId = snap.id;
        } else {
          snapRingRef.current.visible = false;
          hotRefs.hoveredSocketId = null;
          const norm = _yAxis
            .set(hotRefs.pointerSurfaceNormal[0], hotRefs.pointerSurfaceNormal[1], hotRefs.pointerSurfaceNormal[2])
            .normalize();
          placeRingRef.current.visible = true;
          placeRingRef.current.position.copy(handPos).addScaledVector(norm, 0.003);
          placeRingRef.current.lookAt(handPos.clone().add(norm));
        }
      }
    }

    // 2. Skip geometry recompute once all cables are settled and nothing is dragged
    if (!grabbedEnd && settledRef.current) return;

    const runningCounts = new Map<string, number>();
    const connectors: ConnectorObstacle[] = [];
    const splitters: SplitterBody[] = [];
    const strands: CableStrand[] = [];
    let allSocketsReady = true;

    for (let idx = 0; idx < cables.length; idx++) {
      const cable = cables[idx];
      const h = handlesMapRef.current.get(cable.id);
      if (!h) {
        allSocketsReady = false;
        continue;
      }

      const stackIdxA = cable.endA ? (runningCounts.get(cable.endA) ?? 0) : 0;
      if (cable.endA) runningCounts.set(cable.endA, stackIdxA + 1);
      const stackIdxB = cable.endB ? (runningCounts.get(cable.endB) ?? 0) : 0;
      if (cable.endB) runningCounts.set(cable.endB, stackIdxB + 1);
      const stackIdxGnd = cable.gndClip ? (runningCounts.get(cable.gndClip) ?? 0) : 0;
      if (cable.gndClip) runningCounts.set(cable.gndClip, stackIdxGnd + 1);

      const isBananaEndA =
        (cable.kind === 'banana_4mm' && !isBncSocket(cable.endA)) || cable.kind === 'banana_alligator';
      const isDualSplit = cable.kind === 'bnc_alligator' || cable.kind === 'bnc_banana';
      const hasGndLead = cable.kind === 'probe_bnc_hook' || isDualSplit;
      const isBananaEndB = cable.kind === 'banana_4mm' || cable.kind === 'bnc_banana';
      const isAlligatorEndB = cable.kind === 'banana_alligator' || cable.kind === 'bnc_alligator';
      const isBananaGnd = cable.kind === 'bnc_banana';
      const isBananaWire = cable.kind === 'banana_4mm' || cable.kind === 'banana_alligator';

      const a = resolveEndPoint(cable.id, 'endA', cable.endA, cable.freePosA, grabbedEnd, idx);
      const b = resolveEndPoint(cable.id, 'endB', cable.endB, cable.freePosB, grabbedEnd, idx);

      const effectiveStackA =
        grabbedEnd?.cableId === cable.id && grabbedEnd.end === 'endA' && hotRefs.hoveredSocketId
          ? (socketStackCounts.get(hotRefs.hoveredSocketId) ?? 0)
          : stackIdxA;
      const effectiveStackB =
        grabbedEnd?.cableId === cable.id && grabbedEnd.end === 'endB' && hotRefs.hoveredSocketId
          ? (socketStackCounts.get(hotRefs.hoveredSocketId) ?? 0)
          : stackIdxB;

      if (!a.resting && effectiveStackA > 0) {
        const sockIdA = cable.endA ?? hotRefs.hoveredSocketId;
        if (sockIdA?.startsWith('bb_float_')) applyFloatPinFan(a, effectiveStackA);
        else a.pos.addScaledVector(a.normal, effectiveStackA * (isBananaEndA ? BANANA_STACK_STEP : 0.011));
      }
      if (!b.resting && effectiveStackB > 0) {
        const sockIdB = cable.endB ?? hotRefs.hoveredSocketId;
        if (sockIdB?.startsWith('bb_float_')) applyFloatPinFan(b, effectiveStackB);
        else b.pos.addScaledVector(b.normal, effectiveStackB * (isBananaEndB ? BANANA_STACK_STEP : 0.011));
      }

      const flatATan = new THREE.Vector3(a.pos.x - b.pos.x, 0, a.pos.z - b.pos.z);
      if (flatATan.lengthSq() < 1e-6) flatATan.set(0, 0, 1);
      else flatATan.normalize();
      const dirA = a.resting ? flatATan : a.normal;

      const flatBTan = flatATan.clone().negate();
      const dirB = b.resting ? flatBTan : b.normal;

      const renderPosA = a.resting ? a.pos.clone().add(new THREE.Vector3(0, 0.0055, 0)) : a.pos;
      const quatA = h.endAGroup
        ? orientConnector(h.endAGroup, renderPosA, dirA, a.resting && isBananaEndA).clone()
        : _tmpQuat.identity().clone();

      const renderPosB = b.resting ? b.pos.clone().add(new THREE.Vector3(0, 0.0055, 0)) : b.pos;
      const quatB = h.endBGroup
        ? orientConnector(h.endBGroup, renderPosB, dirB, b.resting && isBananaEndB).clone()
        : _tmpQuat.identity().clone();

      // Record rigid connector obstacles so other cables & splitters never clip into boots/plugs
      connectors.push({
        ownerCableId: cable.id,
        end: 'endA',
        p0: renderPosA.clone().addScaledVector(dirA, 0.003),
        p1: renderPosA.clone().addScaledVector(dirA, isBananaEndA ? 0.028 : 0.032),
        radius: isBananaEndA ? 0.0056 : 0.0074,
      });
      connectors.push({
        ownerCableId: cable.id,
        end: 'endB',
        p0: renderPosB.clone().addScaledVector(dirB, 0.003),
        p1: renderPosB.clone().addScaledVector(dirB, isAlligatorEndB ? ALLIGATOR_WIRE_EXIT_Y : 0.030),
        radius: isAlligatorEndB || isBananaEndB ? 0.0054 : 0.0074,
      });

      let splitterBody: SplitterBody | null = null;

      if (hasGndLead) {
        const g = resolveEndPoint(cable.id, 'gndClip', cable.gndClip, cable.freePosGnd, grabbedEnd, idx);
        const effectiveStackG =
          grabbedEnd?.cableId === cable.id && grabbedEnd.end === 'gndClip' && hotRefs.hoveredSocketId
            ? (socketStackCounts.get(hotRefs.hoveredSocketId) ?? 0)
            : stackIdxGnd;

        if (!g.resting && effectiveStackG > 0) {
          const sockIdG = cable.gndClip ?? hotRefs.hoveredSocketId;
          if (sockIdG?.startsWith('bb_float_')) applyFloatPinFan(g, effectiveStackG);
          else g.pos.addScaledVector(g.normal, effectiveStackG * (isBananaGnd ? BANANA_STACK_STEP : 0.01));
        }

        const flatGTan = new THREE.Vector3(g.pos.x - b.pos.x, 0, g.pos.z - b.pos.z);
        if (flatGTan.lengthSq() < 1e-6) flatGTan.set(1, 0, 0);
        else flatGTan.normalize();
        const dirG = g.resting ? flatGTan : g.normal;

        const renderPosG = g.resting ? g.pos.clone().add(new THREE.Vector3(0, 0.0055, 0)) : g.pos;
        const quatG = h.gndGroup
          ? orientConnector(h.gndGroup, renderPosG, dirG, g.resting && isBananaGnd).clone()
          : _tmpQuat.identity().clone();

        connectors.push({
          ownerCableId: cable.id,
          end: 'gndClip',
          p0: renderPosG.clone().addScaledVector(dirG, 0.003),
          p1: renderPosG.clone().addScaledVector(dirG, isBananaGnd ? 0.028 : ALLIGATOR_WIRE_EXIT_Y),
          radius: 0.0054,
        });

        if (isDualSplit) {
          const bAnchor = isBananaEndB
            ? computeBananaWireAnchor(renderPosB, quatB)
            : {
                exitPos: renderPosB.clone().addScaledVector(dirB, ALLIGATOR_WIRE_EXIT_Y),
                exitTan: dirB.clone(),
              };
          const gAnchor = isBananaGnd
            ? computeBananaWireAnchor(renderPosG, quatG)
            : {
                exitPos: renderPosG.clone().addScaledVector(dirG, ALLIGATOR_WIRE_EXIT_Y),
                exitTan: dirG.clone(),
              };

          const pairMid = bAnchor.exitPos.clone().lerp(gAnchor.exitPos, 0.5);
          const towardA = a.pos.clone().sub(pairMid);
          towardA.y = 0;
          if (towardA.lengthSq() < 1e-6) towardA.set(0, 0, -1);
          else towardA.normalize();

          // Stage Y-splitter cleanly behind the target clips with generous lateral/vertical stagger before collision pass
          const sideVec = new THREE.Vector3(-towardA.z, 0, towardA.x);
          const splitDist = (cable.kind === 'bnc_banana' ? 0.080 : 0.074) + (idx % 3) * 0.014;
          const lateralOff = ((idx % 3) - 1) * 0.016;
          const spPos = pairMid
            .clone()
            .addScaledVector(towardA, splitDist)
            .addScaledVector(sideVec, lateralOff);
          const laneElevation = (idx % 4) * 0.011;
          spPos.y = clampBenchY(
            new THREE.Vector3(spPos.x, Math.max(Math.min(pairMid.y, 0.855) - 0.004, 0.812 + laneElevation), spPos.z)
          );

          splitterBody = {
            cableId: cable.id,
            cableIdx: idx,
            pos: spPos,
            axis: towardA.clone(),
            radius: 0.0062,
            halfLen: 0.0085,
            anchorRef: spPos.clone(),
          };
          splitters.push(splitterBody);

          const bOut = bAnchor.exitPos.clone().addScaledVector(bAnchor.exitTan, 0.018);
          bOut.y = clampBenchY(bOut);
          const sMid = spPos.clone().lerp(bOut, 0.52);
          sMid.y = clampBenchY(new THREE.Vector3(sMid.x, Math.max(spPos.y, bOut.y) + 0.010, sMid.z));
          strands.push({
            cableId: cable.id,
            cableIdx: idx,
            kind: 'sig',
            radius: 0.0017,
            points: resamplePolyline([spPos.clone(), sMid, bOut, bAnchor.exitPos.clone()], 9),
            pinnedStartSplitter: true,
            endConn: 'endB',
          });

          const gOut = gAnchor.exitPos.clone().addScaledVector(gAnchor.exitTan, 0.018);
          gOut.y = clampBenchY(gOut);
          const gMid = spPos.clone().lerp(gOut, 0.52);
          gMid.y = clampBenchY(new THREE.Vector3(gMid.x, Math.max(0.794, Math.min(spPos.y, gOut.y) - 0.003), gMid.z));
          strands.push({
            cableId: cable.id,
            cableIdx: idx,
            kind: 'gnd',
            radius: 0.0017,
            points: resamplePolyline([spPos.clone(), gMid, gOut, gAnchor.exitPos.clone()], 9),
            pinnedStartSplitter: true,
            endConn: 'gndClip',
          });
        } else {
          // Oscilloscope RP2200 probe ground alligator lead
          const gndAnchor = renderPosB.clone().addScaledVector(dirB, 0.022);
          const gTail = renderPosG.clone().addScaledVector(dirG, ALLIGATOR_WIRE_EXIT_Y);
          const g1 = gndAnchor.clone().lerp(gTail, 0.5);
          g1.y = clampBenchY(new THREE.Vector3(g1.x, Math.min(gndAnchor.y, gTail.y) - 0.012, g1.z + 0.018));
          g1.z += 0.014;
          strands.push({
            cableId: cable.id,
            cableIdx: idx,
            kind: 'gnd',
            radius: 0.0014,
            points: resamplePolyline([gndAnchor, g1, gTail], 9),
            startConn: 'endB',
            endConn: 'gndClip',
          });
        }
      }

      // Main cable trunk polyline
      const anchorA = isBananaEndA
        ? computeBananaWireAnchor(renderPosA, quatA)
        : {
            exitPos: renderPosA.clone().addScaledVector(dirA, a.resting ? 0.026 : 0.03),
            exitTan: dirA.clone(),
          };
      const anchorB = splitterBody
        ? { exitPos: splitterBody.pos.clone(), exitTan: anchorA.exitPos.clone().sub(splitterBody.pos).normalize() }
        : isBananaEndB
          ? computeBananaWireAnchor(renderPosB, quatB)
          : isAlligatorEndB
            ? { exitPos: renderPosB.clone().addScaledVector(dirB, ALLIGATOR_WIRE_EXIT_Y), exitTan: dirB.clone() }
            : { exitPos: renderPosB.clone().addScaledVector(dirB, 0.032), exitTan: dirB.clone() };

      const p0 = anchorA.exitPos.clone();
      const p4 = anchorB.exitPos.clone();
      const spanDist = p0.distanceTo(p4);
      const isShortLocal = !a.resting && !b.resting && spanDist < 0.19;
      const touchesBB = Boolean(cable.endA?.startsWith('bb_') || cable.endB?.startsWith('bb_'));

      const laneIdx = idx % 6;
      const laneY = 0.790 + (idx % 5) * 0.0075;
      const leadOut = isShortLocal ? 0.020 : 0.032;

      const p1 = p0.clone().addScaledVector(anchorA.exitTan, a.resting ? 0.022 : leadOut);
      p1.y = clampBenchY(p1);
      const p3 = splitterBody
        ? splitterBody.pos.clone().lerp(p1, 0.24)
        : p4.clone().addScaledVector(anchorB.exitTan, b.resting ? 0.022 : leadOut);
      p3.y = clampBenchY(p3);

      let curvePts: THREE.Vector3[];
      if (isShortLocal) {
        const mid = p1.clone().lerp(p3, 0.5);
        mid.y = clampBenchY(new THREE.Vector3(mid.x, Math.min(p1.y, p3.y) - 0.015, mid.z));
        mid.z += 0.016 + (idx % 3) * 0.010;
        curvePts = [p0, p1, mid, p3, p4];
      } else if (!touchesBB && !a.resting && !b.resting) {
        const corridorZ = -0.022 + laneIdx * 0.024;
        const c1 = new THREE.Vector3(
          THREE.MathUtils.lerp(p1.x, p3.x, 0.28),
          laneY,
          Math.min(0.118, Math.max(corridorZ, Math.min(p1.z, p3.z) + 0.035))
        );
        const c2 = new THREE.Vector3(
          THREE.MathUtils.lerp(p1.x, p3.x, 0.72),
          laneY,
          Math.min(0.118, Math.max(corridorZ, Math.min(p1.z, p3.z) + 0.035))
        );
        curvePts = [p0, p1, c1, c2, p3, p4];
      } else {
        const mid = p1.clone().lerp(p3, 0.5);
        mid.y = touchesBB
          ? Math.max(0.826 + (idx % 4) * 0.012, Math.min(p1.y, p3.y) - 0.008)
          : clampBenchY(new THREE.Vector3(mid.x, laneY, mid.z));
        if (!a.resting || !b.resting) {
          mid.z = Math.min(0.155, Math.max(mid.z, -0.01) + 0.020 + (idx % 4) * 0.014);
        }
        curvePts = [p0, p1, mid, p3, p4];
      }

      strands.push({
        cableId: cable.id,
        cableIdx: idx,
        kind: 'trunk',
        radius: isBananaWire ? 0.0021 : 0.0025,
        points: resamplePolyline(curvePts, 14),
        pinnedEndSplitter: Boolean(splitterBody),
        startConn: 'endA',
        endConn: splitterBody ? undefined : 'endB',
      });

      const aReady = !cable.endA || Boolean(socketRegistry.get(cable.endA)) || cable.endA.startsWith('bb_');
      const bReady = !cable.endB || Boolean(socketRegistry.get(cable.endB)) || cable.endB.startsWith('bb_');
      const gReady = !cable.gndClip || Boolean(socketRegistry.get(cable.gndClip)) || cable.gndClip.startsWith('bb_');
      if (!aReady || !bReady || !gReady) allSocketsReady = false;
    }

    // 3. Global 3D collision & clearance pass across EVERY cable, branch, splitter, and connector!
    if (strands.length > 0) {
      resolveCableCollisions(strands, splitters, connectors);
    }

    // 4. Apply solved splitter transforms and rebuild only changed TubeGeometries
    for (const sp of splitters) {
      const h = handlesMapRef.current.get(sp.cableId);
      if (h?.splitterMesh) {
        orientConnector(h.splitterMesh, sp.pos, sp.axis);
      }
    }

    for (const s of strands) {
      const h = handlesMapRef.current.get(s.cableId);
      if (!h) continue;
      const hash = hashPoints(s.points);
      if (s.kind === 'trunk' && h.trunkMesh) {
        if (hash !== h.lastTrunkHash) {
          h.lastTrunkHash = hash;
          const curve = new THREE.CatmullRomCurve3(s.points);
          const geo = new THREE.TubeGeometry(curve, 36, s.radius, 8, false);
          h.trunkMesh.geometry.dispose();
          h.trunkMesh.geometry = geo;
        }
      } else if (s.kind === 'sig' && h.sigBranchMesh) {
        if (hash !== h.lastSigHash) {
          h.lastSigHash = hash;
          const curve = new THREE.CatmullRomCurve3(s.points);
          const geo = new THREE.TubeGeometry(curve, 20, s.radius, 6, false);
          h.sigBranchMesh.geometry.dispose();
          h.sigBranchMesh.geometry = geo;
        }
      } else if (s.kind === 'gnd' && h.gndWireMesh) {
        if (hash !== h.lastGndHash) {
          h.lastGndHash = hash;
          const curve = new THREE.CatmullRomCurve3(s.points);
          const geo = new THREE.TubeGeometry(curve, 20, s.radius, 6, false);
          h.gndWireMesh.geometry.dispose();
          h.gndWireMesh.geometry = geo;
        }
      }
    }

    if (!grabbedEnd && allSocketsReady) {
      settledRef.current = true;
    }
  });

  return (
    <group name="cable_system" userData={{ cableIgnore: true }}>
      {cables.map((cable) => (
        <SingleCable3D
          key={cable.id}
          cable={cable}
          registerHandles={registerHandles}
          unregisterHandles={unregisterHandles}
        />
      ))}

      {/* Magnetic Socket / Stacking-Hole Snap Highlight Ring */}
      <mesh
        ref={(el) => {
          snapRingRef.current = el;
        }}
        raycast={() => null}
        visible={false}
      >
        <ringGeometry args={[0.009, 0.014, 24]} />
        <meshBasicMaterial color="#f59e0b" side={THREE.DoubleSide} />
      </mesh>

      {/* Free-Placement Surface Target Ring */}
      <mesh
        ref={(el) => {
          placeRingRef.current = el;
        }}
        raycast={() => null}
        visible={false}
      >
        <ringGeometry args={[0.007, 0.011, 24]} />
        <meshBasicMaterial color="#22c55e" transparent opacity={0.85} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
