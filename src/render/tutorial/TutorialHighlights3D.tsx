import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { holeIdToWorldPos } from '../../simulation/breadboard/breadboardModel';
import { useLabStore } from '../../state/labStore';
import {
  getTutorialById,
  getTutorialProgress,
  resolveCanonicalSocketNode,
} from '../../tutorials/moduleTutorials';
import { socketRegistry } from '../cables/socketRegistry';

const NOOP_RAYCAST = () => {};
const UP = new THREE.Vector3(0, 1, 0);
const BEAD_COUNT = 14;

function resolveSocketPose(socketId: string): { pos: THREE.Vector3; normal: THREE.Vector3 } | null {
  const s = socketRegistry.get(socketId);
  if (s) {
    return { pos: s.position.clone(), normal: s.normal.clone().normalize() };
  }
  if (socketId.startsWith('bb_')) {
    return {
      pos: new THREE.Vector3(...holeIdToWorldPos(socketId)).add(new THREE.Vector3(0, 0.004, 0)),
      normal: UP.clone(),
    };
  }
  return null;
}

function SocketBeacon({
  ringGroupRef,
  outerMatRef,
  innerMatRef,
  coneRef,
  coneMatRef,
  color,
}: {
  ringGroupRef: React.MutableRefObject<THREE.Group | null>;
  outerMatRef: React.MutableRefObject<THREE.MeshBasicMaterial | null>;
  innerMatRef: React.MutableRefObject<THREE.MeshBasicMaterial | null>;
  coneRef: React.MutableRefObject<THREE.Mesh | null>;
  coneMatRef: React.MutableRefObject<THREE.MeshBasicMaterial | null>;
  color: string;
}) {
  return (
    <group ref={ringGroupRef} visible={false} userData={{ cableIgnore: true }}>
      <mesh
        onUpdate={(m) => {
          m.raycast = NOOP_RAYCAST;
        }}
      >
        <ringGeometry args={[0.0115, 0.0165, 28]} />
        <meshBasicMaterial ref={outerMatRef} color={color} transparent opacity={0.9} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh
        position={[0, 0, 0.001]}
        onUpdate={(m) => {
          m.raycast = NOOP_RAYCAST;
        }}
      >
        <ringGeometry args={[0.0068, 0.0096, 24]} />
        <meshBasicMaterial ref={innerMatRef} color={color} transparent opacity={0.95} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh
        ref={coneRef}
        position={[0, 0, 0.028]}
        rotation={[-Math.PI / 2, 0, 0]}
        onUpdate={(m) => {
          m.raycast = NOOP_RAYCAST;
        }}
      >
        <coneGeometry args={[0.0052, 0.013, 12]} />
        <meshBasicMaterial ref={coneMatRef} color={color} transparent opacity={0.95} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function TutorialHighlights3D() {
  const activeTutorialId = useLabStore((s) => s.activeTutorialId);
  const tutorialStepIndex = useLabStore((s) => s.tutorialStepIndex);

  const fromGroupRef = useRef<THREE.Group | null>(null);
  const fromOuterMatRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const fromInnerMatRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const fromConeRef = useRef<THREE.Mesh | null>(null);
  const fromConeMatRef = useRef<THREE.MeshBasicMaterial | null>(null);

  const toGroupRef = useRef<THREE.Group | null>(null);
  const toOuterMatRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const toInnerMatRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const toConeRef = useRef<THREE.Mesh | null>(null);
  const toConeMatRef = useRef<THREE.MeshBasicMaterial | null>(null);

  const arcInstRef = useRef<THREE.InstancedMesh | null>(null);

  const amberColor = useMemo(() => new THREE.Color('#f59e0b'), []);
  const emeraldColor = useMemo(() => new THREE.Color('#10b981'), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const lookTarget = useMemo(() => new THREE.Vector3(), []);
  const p0 = useMemo(() => new THREE.Vector3(), []);
  const p1 = useMemo(() => new THREE.Vector3(), []);
  const p2 = useMemo(() => new THREE.Vector3(), []);
  const pt = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }) => {
    const tut = getTutorialById(activeTutorialId);
    const step = tut?.steps[tutorialStepIndex];

    const hideAll = () => {
      if (fromGroupRef.current) fromGroupRef.current.visible = false;
      if (toGroupRef.current) toGroupRef.current.visible = false;
      if (arcInstRef.current) arcInstRef.current.visible = false;
    };

    if (!tut || !step || step.kind !== 'wire') {
      hideAll();
      return;
    }

    const st = useLabStore.getState();
    const progress = getTutorialProgress(tut, st.cables, st.activeKit, st.breadboardParts);
    if (progress.completedStepIds.has(step.id)) {
      hideAll();
      return;
    }

    const fromPose = resolveSocketPose(step.fromSocket);
    const toPose = resolveSocketPose(step.toSocket);
    if (!fromPose || !toPose) {
      hideAll();
      return;
    }

    const t = clock.getElapsedTime();
    const grabbedCable = st.grabbedEnd ? st.cables.find((c) => c.id === st.grabbedEnd?.cableId) : null;
    const grabbedOrigin =
      st.grabbedEnd?.end === 'endB'
        ? grabbedCable?.endA
        : st.grabbedEnd?.end === 'endA'
          ? grabbedCable?.endB
          : null;
    const holdingFromOrigin =
      Boolean(grabbedOrigin) &&
      resolveCanonicalSocketNode(grabbedOrigin!, st.activeKit, st.breadboardParts) ===
        resolveCanonicalSocketNode(step.fromSocket, st.activeKit, st.breadboardParts);

    if (fromGroupRef.current) {
      fromGroupRef.current.visible = true;
      fromGroupRef.current.position.copy(fromPose.pos).addScaledVector(fromPose.normal, 0.004);
      lookTarget.copy(fromGroupRef.current.position).add(fromPose.normal);
      fromGroupRef.current.lookAt(lookTarget);

      const pulse = holdingFromOrigin ? 1.0 : 1 + 0.16 * Math.sin(t * 5.2);
      fromGroupRef.current.scale.setScalar(pulse);
      const col = holdingFromOrigin ? emeraldColor : amberColor;
      fromOuterMatRef.current?.color.copy(col);
      fromInnerMatRef.current?.color.copy(col);
      fromConeMatRef.current?.color.copy(col);
      if (fromConeRef.current) {
        fromConeRef.current.position.z = 0.025 + 0.005 * Math.sin(t * 6.0);
      }
    }

    if (toGroupRef.current) {
      toGroupRef.current.visible = true;
      toGroupRef.current.position.copy(toPose.pos).addScaledVector(toPose.normal, 0.004);
      lookTarget.copy(toGroupRef.current.position).add(toPose.normal);
      toGroupRef.current.lookAt(lookTarget);

      const boost = st.grabbedEnd ? 1.18 + 0.2 * Math.sin(t * 6.8) : 1 + 0.12 * Math.sin(t * 4.5 + 1.2);
      toGroupRef.current.scale.setScalar(boost);
      if (toConeRef.current) {
        toConeRef.current.position.z = 0.026 + 0.006 * Math.sin(t * 6.0 + 1.5);
      }
    }

    if (arcInstRef.current) {
      arcInstRef.current.visible = true;
      p0.copy(fromPose.pos).addScaledVector(fromPose.normal, 0.012);
      p2.copy(toPose.pos).addScaledVector(toPose.normal, 0.012);
      const dist = p0.distanceTo(p2);
      p1.copy(p0).lerp(p2, 0.5);
      p1.y = Math.max(p0.y, p2.y) + 0.075 + dist * 0.18;
      p1.z += 0.04;

      for (let i = 0; i < BEAD_COUNT; i++) {
        const u = (i / BEAD_COUNT + t * 0.42) % 1;
        const omt = 1 - u;
        pt.set(
          omt * omt * p0.x + 2 * omt * u * p1.x + u * u * p2.x,
          omt * omt * p0.y + 2 * omt * u * p1.y + u * u * p2.y,
          omt * omt * p0.z + 2 * omt * u * p1.z + u * u * p2.z
        );
        const s = 0.45 + 0.75 * Math.sin(Math.PI * u);
        dummy.position.copy(pt);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        arcInstRef.current.setMatrixAt(i, dummy.matrix);
      }
      arcInstRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group name="tutorial_highlights_3d" userData={{ cableIgnore: true }}>
      <SocketBeacon
        ringGroupRef={fromGroupRef}
        outerMatRef={fromOuterMatRef}
        innerMatRef={fromInnerMatRef}
        coneRef={fromConeRef}
        coneMatRef={fromConeMatRef}
        color="#f59e0b"
      />
      <SocketBeacon
        ringGroupRef={toGroupRef}
        outerMatRef={toOuterMatRef}
        innerMatRef={toInnerMatRef}
        coneRef={toConeRef}
        coneMatRef={toConeMatRef}
        color="#10b981"
      />
      <instancedMesh
        ref={arcInstRef}
        args={[undefined, undefined, BEAD_COUNT]}
        visible={false}
        userData={{ cableIgnore: true }}
        onUpdate={(m) => {
          m.raycast = NOOP_RAYCAST;
        }}
      >
        <sphereGeometry args={[0.0034, 10, 10]} />
        <meshBasicMaterial color="#fbbf24" transparent opacity={0.9} depthWrite={false} />
      </instancedMesh>
    </group>
  );
}
