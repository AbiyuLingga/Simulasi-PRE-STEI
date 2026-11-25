import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import {
  BB_D,
  BB_H,
  BB_PITCH,
  BB_W,
  BB_WORLD_POS,
  computePlacementPreview,
  defaultFloatOffsetForHole,
  eiaColorBands,
  floatingJumperSocketId,
  floatingJumperTipLocalPos,
  floatingJumperTipNormal,
  floatingJumperTipWorldPos,
  getConnectedStripHoles,
  getOccupiedHoles,
  holeIdToElectricalNode,
  holeIdToLocalPos,
  holeIdToWorldPos,
  movePartToAnchor,
  nearestHoleFromLocalXZ,
} from '../../simulation/breadboard/breadboardModel';
import type { BreadboardPart } from '../../simulation/circuit/types';
import { hotRefs } from '../../state/hotRefs';
import { useLabStore } from '../../state/labStore';
import { socketRegistry } from '../cables/socketRegistry';

const NOOP_RAYCAST = () => {};
const BASE_MESH_RAYCAST = THREE.Mesh.prototype.raycast;

function applyRaycastToggle(root: THREE.Object3D | null, enabled: boolean): void {
  if (!root) return;
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.raycast = enabled ? BASE_MESH_RAYCAST : NOOP_RAYCAST;
    }
  });
}

function BreadboardTiePin({ holeId, label }: { holeId: string; label: string }) {
  const socketId = `bb_${holeId}`;

  // ponytail: register static breadboard strip/rail snap points once on mount (zero per-frame allocations)
  useEffect(() => {
    const wp = new THREE.Vector3(...holeIdToWorldPos(holeId)).add(new THREE.Vector3(0, 0.002, 0));
    socketRegistry.register(socketId, label, 'pin', wp, new THREE.Vector3(0, 1, 0));
    return () => socketRegistry.unregister(socketId);
  }, [socketId, holeId, label]);

  return null;
}

interface HighlightEntry {
  holeId: string;
  color: string;
  scale: number;
}

function HoleHighlightOverlay({ entries }: { entries: HighlightEntry[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.raycast = NOOP_RAYCAST;
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    const count = Math.min(64, entries.length);
    mesh.count = count;

    for (let i = 0; i < count; i++) {
      const e = entries[i];
      const [lx, , lz] = holeIdToLocalPos(e.holeId);
      dummy.position.set(lx, BB_H + 0.00055, lz);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.set(e.scale, e.scale, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      col.set(e.color);
      mesh.setColorAt(i, col);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [entries]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, 64]} frustumCulled={false}>
      <ringGeometry args={[0.00068, 0.00112, 16]} />
      <meshBasicMaterial transparent opacity={0.92} toneMapped={false} />
    </instancedMesh>
  );
}

function VoltageViewOverlay() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const startX = -((62 * BB_PITCH) / 2);

  useLayoutEffect(() => {
    if (meshRef.current) meshRef.current.raycast = NOOP_RAYCAST;
  }, []);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const voltages = hotRefs.bbNodeVoltages;
    const entries: Array<{ x: number; z: number; sx: number; sz: number; v: number }> = [];

    for (let col = 1; col <= 63; col++) {
      const vt = voltages[`N_BB_T_${col}`];
      if (vt !== undefined) {
        entries.push({ x: startX + (col - 1) * BB_PITCH, z: -0.0091, sx: 0.0014, sz: 0.0112, v: vt });
      }
      const vb = voltages[`N_BB_B_${col}`];
      if (vb !== undefined) {
        entries.push({ x: startX + (col - 1) * BB_PITCH, z: 0.0091, sx: 0.0014, sz: 0.0112, v: vb });
      }
    }
    const rails: Array<[string, number]> = [
      ['N_BB_RAIL_TP', -0.0235],
      ['N_BB_RAIL_TN', -0.0205],
      ['N_BB_RAIL_BP', 0.0205],
      ['N_BB_RAIL_BN', 0.0235],
    ];
    for (const [key, rz] of rails) {
      const vr = voltages[key];
      if (vr !== undefined) {
        entries.push({ x: 0, z: rz, sx: BB_W - 0.018, sz: 0.0012, v: vr });
      }
    }

    const dummy = new THREE.Object3D();
    const c = new THREE.Color();
    const count = Math.min(130, entries.length);
    mesh.count = count;
    for (let i = 0; i < count; i++) {
      const e = entries[i];
      dummy.position.set(e.x, BB_H + 0.00038, e.z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.set(e.sx, e.sz, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (e.v > 0.35) c.set('#ef4444');
      else if (e.v < -0.35) c.set('#3b82f6');
      else c.set('#22c55e');
      mesh.setColorAt(i, c);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, 130]} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial transparent opacity={0.42} toneMapped={false} />
    </instancedMesh>
  );
}

function CurrentViewOverlay({ parts }: { parts: BreadboardPart[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    if (meshRef.current) meshRef.current.raycast = NOOP_RAYCAST;
  }, []);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = clock.elapsedTime;
    const voltages = hotRefs.bbNodeVoltages;
    const dummy = new THREE.Object3D();
    const col = new THREE.Color('#facc15');
    let idx = 0;

    for (const part of parts) {
      if (idx + 3 > 120) break;
      if (part.kind === 'jumper' && part.floating) continue;
      const va = voltages[holeIdToElectricalNode(part.holeA)] ?? 0;
      const vb = voltages[holeIdToElectricalNode(part.holeB)] ?? 0;
      let amps = 0;
      if (part.kind === 'led') {
        amps = hotRefs.ledCurrents[part.id] ?? 0;
      } else if (part.kind === 'resistor' && part.value > 0) {
        amps = (va - vb) / part.value;
      } else if (part.kind === 'jumper') {
        amps = (va - vb) / 0.02;
      } else {
        amps = va - vb !== 0 ? 0.002 * Math.sign(va - vb) : 0;
      }
      if (Math.abs(amps) < 1e-5) continue;

      const [ax, , az] = holeIdToLocalPos(part.holeA);
      const [bx, , bz] = holeIdToLocalPos(part.holeB);
      const dirSign = amps >= 0 ? 1 : -1;
      const speed = 0.6 + Math.min(2.5, Math.abs(amps) * 140);

      for (let d = 0; d < 3; d++) {
        let u = (t * speed * dirSign + d / 3) % 1;
        if (u < 0) u += 1;
        dummy.position.set(
          ax + (bx - ax) * u,
          BB_H + 0.0074,
          az + (bz - az) * u
        );
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        mesh.setMatrixAt(idx, dummy.matrix);
        mesh.setColorAt(idx, col);
        idx++;
      }
    }
    mesh.count = idx;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, 120]} frustumCulled={false}>
      <sphereGeometry args={[0.00095, 10, 10]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

function FloatingJumperWire3D({
  part,
  ghost = false,
  invalidGhost = false,
  selected = false,
  interactive = true,
}: {
  part: BreadboardPart;
  ghost?: boolean;
  invalidGhost?: boolean;
  selected?: boolean;
  interactive?: boolean;
}) {
  const setHoverLabel = useLabStore((s) => s.setHoverLabel);
  const selectPart = useLabStore((s) => s.selectBreadboardPart);
  const clickSocket = useLabStore((s) => s.clickSocket);
  const grabbedEnd = useLabStore((s) => s.grabbedEnd);
  const breadboardMode = useLabStore((s) => s.breadboardMode);

  const socketId = floatingJumperSocketId(part.id);
  const [ax, , az] = useMemo(() => holeIdToLocalPos(part.holeA), [part.holeA]);
  const [tipX, tipYAbs, tipZ] = useMemo(
    () => floatingJumperTipLocalPos(part),
    [part.holeA, part.floatOffset]
  );
  const tipY = tipYAbs - BB_H; // local Y relative to BB top surface

  const tipNormalVec = useMemo(() => {
    const [nx, ny, nz] = floatingJumperTipNormal(part);
    return new THREE.Vector3(nx, ny, nz).normalize();
  }, [part.holeA, part.floatOffset]);

  const tipQuat = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tipNormalVec),
    [tipNormalVec]
  );

  // Curved flexible PVC wire from breadboard holeA up into Dupont collar below the exposed metal pin
  const wireGeo = useMemo(() => {
    const collarBase = new THREE.Vector3(tipX, tipY, tipZ).addScaledVector(tipNormalVec, -0.0055);
    const pts = [
      new THREE.Vector3(ax, 0.0005, az),
      new THREE.Vector3(ax, 0.0068, az),
      new THREE.Vector3(ax + (collarBase.x - ax) * 0.55, collarBase.y * 0.65 + 0.003, az + (collarBase.z - az) * 0.55),
      collarBase,
    ];
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.35);
    return new THREE.TubeGeometry(curve, 22, 0.00072, 8, false);
  }, [ax, az, tipX, tipY, tipZ, tipNormalVec]);

  useEffect(() => () => wireGeo.dispose(), [wireGeo]);

  // Register exposed floating tip once per position change as a high-priority snap socket (zero per-frame work)
  useEffect(() => {
    if (ghost) return;
    const wp = new THREE.Vector3(...floatingJumperTipWorldPos(part));
    socketRegistry.register(socketId, `Jumper Bebas (${part.holeA})`, 'float_pin', wp, tipNormalVec);
    return () => {
      socketRegistry.unregister(socketId);
    };
  }, [ghost, socketId, part.holeA, part.floatOffset, tipNormalVec]);

  const collarPos = useMemo(
    () => new THREE.Vector3(tipX, tipY, tipZ).addScaledVector(tipNormalVec, -0.0035),
    [tipX, tipY, tipZ, tipNormalVec]
  );
  const pinPos = useMemo(
    () => new THREE.Vector3(tipX, tipY, tipZ).addScaledVector(tipNormalVec, 0.0012),
    [tipX, tipY, tipZ, tipNormalVec]
  );

  const wireColor = invalidGhost ? '#ef4444' : part.color ?? '#dc2626';
  const tipClickable = !ghost && (Boolean(grabbedEnd) || !breadboardMode || interactive);
  const [tipHovered, setTipHovered] = useState(false);

  const handleTipClick = (e: ThreeEvent<MouseEvent>) => {
    if (ghost || !tipClickable) return;
    e.stopPropagation();
    const st = useLabStore.getState();
    if (st.grabbedEnd) {
      clickSocket(socketId);
      return;
    }
    if (!st.breadboardMode) {
      // On bench view: clicking a floating jumper tip pulls a Banana-to-Buaya cable directly from it!
      clickSocket(socketId, part.color, 'banana_alligator');
      return;
    }
    selectPart(part.id);
  };

  const handleTipOver = (e: ThreeEvent<PointerEvent>) => {
    if (ghost || !tipClickable) return;
    e.stopPropagation();
    setTipHovered(true);
    const st = useLabStore.getState();
    if (st.grabbedEnd) {
      hotRefs.hoveredSocketId = socketId;
      setHoverLabel(`Jepit ke Jumper Bebas (${part.holeA})`);
      document.body.style.cursor = 'pointer';
    } else if (!st.breadboardMode) {
      setHoverLabel(`Tarik Banana-Buaya dari Jumper (${part.holeA})`);
      document.body.style.cursor = 'grab';
    } else {
      setHoverLabel(`Jumper Bebas (${part.holeA}) — klik untuk atur / Tarik Buaya`);
      document.body.style.cursor = 'pointer';
    }
  };

  const handleTipOut = () => {
    setTipHovered(false);
    if (hotRefs.hoveredSocketId === socketId) hotRefs.hoveredSocketId = null;
    setHoverLabel(null);
    document.body.style.cursor = 'auto';
  };

  return (
    <group position={[0, BB_H, 0]}>
      {/* Metal entry pin inside breadboard hole */}
      <mesh position={[ax, 0.0018, az]}>
        <cylinderGeometry args={[0.00035, 0.00035, 0.0038, 8]} />
        <meshStandardMaterial color="#d4dce5" metalness={0.88} roughness={0.22} transparent={ghost} opacity={ghost ? 0.6 : 1} />
      </mesh>

      {/* Curved insulated PVC jumper lead */}
      <mesh
        geometry={wireGeo}
        onPointerOver={handleTipOver}
        onPointerOut={handleTipOut}
        onPointerDown={(e) => {
          if (!ghost && tipClickable && e.button === 0) e.stopPropagation();
        }}
        onClick={handleTipClick}
      >
        <meshStandardMaterial
          color={wireColor}
          roughness={0.44}
          transparent={ghost}
          opacity={ghost ? 0.65 : 1}
          emissive={selected || tipHovered ? '#0284c7' : '#000000'}
          emissiveIntensity={selected || tipHovered ? 0.45 : 0}
        />
      </mesh>

      {/* Dark Dupont-style plastic collar housing at the floating end */}
      <mesh position={collarPos} quaternion={tipQuat}>
        <boxGeometry args={[0.0022, 0.0052, 0.0022]} />
        <meshStandardMaterial
          color={invalidGhost ? '#ef4444' : '#18181b'}
          roughness={0.48}
          transparent={ghost}
          opacity={ghost ? 0.65 : 1}
        />
      </mesh>

      {/* Exposed gleaming tin-plated header pin tip ready for alligator clip & scope probe */}
      <mesh position={pinPos} quaternion={tipQuat}>
        <cylinderGeometry args={[0.00046, 0.00046, 0.0064, 10]} />
        <meshStandardMaterial
          color="#e2e8f0"
          metalness={0.92}
          roughness={0.18}
          emissive={grabbedEnd ? '#f59e0b' : tipHovered || selected ? '#38bdf8' : '#000000'}
          emissiveIntensity={grabbedEnd || tipHovered ? 0.95 : selected ? 0.55 : 0}
          transparent={ghost}
          opacity={ghost ? 0.7 : 1}
        />
      </mesh>

      {/* Clear visual target halo when dragging a cable or hovering the floating jumper tip */}
      {!ghost && (Boolean(grabbedEnd) || tipHovered) && (
        <mesh position={[tipX, tipY, tipZ]} quaternion={tipQuat} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.0038, 0.0058, 18]} />
          <meshBasicMaterial
            color={grabbedEnd ? '#f59e0b' : '#38bdf8'}
            side={THREE.DoubleSide}
            transparent
            opacity={tipHovered ? 0.95 : 0.7}
            toneMapped={false}
          />
        </mesh>
      )}

      {/* Generous invisible hit sphere + stalk around the floating pin so bench clicks never bleed through to the breadboard */}
      {!ghost && tipClickable && (
        <group>
          <mesh
            position={[tipX, tipY, tipZ]}
            onPointerOver={handleTipOver}
            onPointerOut={handleTipOut}
            onPointerDown={(e) => {
              if (e.button === 0) e.stopPropagation();
            }}
            onClick={handleTipClick}
          >
            <sphereGeometry args={[0.0115, 12, 12]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
          <mesh
            position={[(ax + tipX) / 2, tipY * 0.55, (az + tipZ) / 2]}
            onPointerOver={handleTipOver}
            onPointerOut={handleTipOut}
            onPointerDown={(e) => {
              if (e.button === 0) e.stopPropagation();
            }}
            onClick={handleTipClick}
          >
            <cylinderGeometry args={[0.0055, 0.0055, Math.max(0.014, tipY), 8]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>
      )}
    </group>
  );
}

function RoutedJumperWire3D({
  ax,
  az,
  bx,
  bz,
  waypoints,
  color,
  ghost,
  invalidGhost,
}: {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  waypoints?: [number, number][];
  color: string;
  ghost?: boolean;
  invalidGhost?: boolean;
}) {
  const geo = useMemo(() => {
    const dx = bx - ax;
    const dz = bz - az;
    const directSpan = Math.hypot(dx, dz);
    const pts: THREE.Vector3[] = [
      new THREE.Vector3(ax, 0.0002, az),
      new THREE.Vector3(ax, 0.0052, az),
    ];
    if (waypoints && waypoints.length > 0) {
      for (const [wx, wz] of waypoints) {
        pts.push(new THREE.Vector3(wx, 0.0068, wz));
      }
    } else {
      const midY = 0.0072 + Math.min(0.011, directSpan * 0.24);
      pts.push(new THREE.Vector3((ax + bx) / 2, midY, (az + bz) / 2));
    }
    pts.push(new THREE.Vector3(bx, 0.0052, bz));
    pts.push(new THREE.Vector3(bx, 0.0002, bz));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.25);
    return new THREE.TubeGeometry(curve, Math.max(18, pts.length * 8), 0.00068, 8, false);
  }, [ax, az, bx, bz, waypoints]);

  useEffect(() => () => geo.dispose(), [geo]);

  return (
    <group>
      <mesh geometry={geo}>
        <meshStandardMaterial
          color={invalidGhost ? '#ef4444' : color}
          roughness={0.45}
          transparent={Boolean(ghost)}
          opacity={ghost ? 0.65 : 1}
        />
      </mesh>
      {/* Bare metal pin tips at hole entry */}
      <mesh position={[ax, 0.0018, az]}>
        <cylinderGeometry args={[0.00034, 0.00034, 0.0038, 8]} />
        <meshStandardMaterial color="#d4dce5" metalness={0.85} roughness={0.25} />
      </mesh>
      <mesh position={[bx, 0.0018, bz]}>
        <cylinderGeometry args={[0.00034, 0.00034, 0.0038, 8]} />
        <meshStandardMaterial color="#d4dce5" metalness={0.85} roughness={0.25} />
      </mesh>
    </group>
  );
}

function PartMesh3D({
  part,
  ghost = false,
  invalidGhost = false,
  selected = false,
  interactive = true,
}: {
  part: BreadboardPart;
  ghost?: boolean;
  invalidGhost?: boolean;
  selected?: boolean;
  interactive?: boolean;
}) {
  const rootRef = useRef<THREE.Group>(null);
  const animYRef = useRef<THREE.Group>(null);
  const setHoverLabel = useLabStore((s) => s.setHoverLabel);
  const selectPart = useLabStore((s) => s.selectBreadboardPart);
  const startReshaping = useLabStore((s) => s.startReshapingPart);
  const ledMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const dropAnimRef = useRef(ghost ? 0 : 0.0045);

  const [ax, , az] = useMemo(() => holeIdToLocalPos(part.holeA), [part.holeA]);
  const [bx, , bz] = useMemo(() => holeIdToLocalPos(part.holeB), [part.holeB]);

  const cx = (ax + bx) / 2;
  const cz = (az + bz) / 2;
  const dx = bx - ax;
  const dz = bz - az;
  const span = Math.max(0.0024, Math.hypot(dx, dz));
  const yaw = Math.atan2(-dz, dx);

  useLayoutEffect(() => {
    applyRaycastToggle(rootRef.current, !ghost && interactive);
  }, [ghost, interactive, part.kind, selected]);

  useFrame((_, dt) => {
    if (ghost) return;
    if (animYRef.current && dropAnimRef.current > 0.0001) {
      dropAnimRef.current = dropAnimRef.current < 0.0002 ? 0 : THREE.MathUtils.lerp(dropAnimRef.current, 0, Math.min(1, dt * 22));
      animYRef.current.position.y = dropAnimRef.current;
    }
    if (part.kind === 'led' && ledMatRef.current) {
      const nextInt = Math.min(2.6, Math.max(0, hotRefs.ledCurrents[part.id] ?? 0) * 165);
      if (Math.abs(ledMatRef.current.emissiveIntensity - nextInt) > 0.01) {
        ledMatRef.current.emissiveIntensity = nextInt;
      }
    }
  });

  const bands = useMemo(() => (part.kind === 'resistor' ? eiaColorBands(part.value) : null), [part.kind, part.value]);

  const onSelectClick = (e: ThreeEvent<MouseEvent>) => {
    if (ghost || !interactive) return;
    e.stopPropagation();
    const st = useLabStore.getState();
    if (!st.breadboardMode) st.enterBreadboardMode();
    selectPart(part.id);
  };

  const opacity = ghost ? 0.62 : 1;
  const transparent = ghost;
  const tintOverride = invalidGhost ? '#ef4444' : undefined;
  const selEmissive = selected ? '#0284c7' : '#000000';
  const selEmissiveInt = selected ? 0.35 : 0;

  if (part.kind === 'jumper' && part.floating) {
    return (
      <FloatingJumperWire3D
        part={part}
        ghost={ghost}
        invalidGhost={invalidGhost}
        selected={selected}
        interactive={interactive}
      />
    );
  }

  if (part.kind === 'jumper' || (ghost && part.waypoints && part.waypoints.length > 0)) {
    return (
      <group
        ref={rootRef}
        position={[0, BB_H, 0]}
        onPointerOver={(e) => {
          if (ghost || !interactive) return;
          e.stopPropagation();
          setHoverLabel(`${part.label} (${part.holeA}..${part.holeB})`);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          if (ghost) return;
          setHoverLabel(null);
          document.body.style.cursor = 'auto';
        }}
        onClick={onSelectClick}
      >
        <group ref={animYRef}>
          <RoutedJumperWire3D
            ax={ax}
            az={az}
            bx={bx}
            bz={bz}
            waypoints={part.waypoints}
            color={part.color ?? '#2563eb'}
            ghost={ghost}
            invalidGhost={invalidGhost}
          />
        </group>

        {selected && !ghost && interactive && (
          <>
            <mesh
              position={[ax, 0.0072, az]}
              onClick={(e) => {
                e.stopPropagation();
                startReshaping(part.id, 'pinA');
              }}
            >
              <sphereGeometry args={[0.00145, 12, 12]} />
              <meshBasicMaterial color="#38bdf8" toneMapped={false} />
            </mesh>
            <mesh
              position={[bx, 0.0072, bz]}
              onClick={(e) => {
                e.stopPropagation();
                startReshaping(part.id, 'pinB');
              }}
            >
              <sphereGeometry args={[0.00145, 12, 12]} />
              <meshBasicMaterial color="#fb923c" toneMapped={false} />
            </mesh>
          </>
        )}
      </group>
    );
  }

  if (part.kind === 'opamp741') {
    const col = Math.min(60, Math.max(1, Number(part.holeA.split('_')[1]) || 30));
    const [p1x] = holeIdToLocalPos(`t_${col}_e`);
    const [p4x] = holeIdToLocalPos(`t_${col + 3}_e`);
    const icX = (p1x + p4x) / 2;
    return (
      <group
        ref={rootRef}
        position={[icX, BB_H + 0.0025, 0]}
        onPointerOver={(e) => {
          if (ghost || !interactive) return;
          e.stopPropagation();
          setHoverLabel(`${part.label} (${part.holeA}..${part.holeB})`);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          if (ghost) return;
          setHoverLabel(null);
          document.body.style.cursor = 'auto';
        }}
        onClick={onSelectClick}
      >
        <group ref={animYRef}>
          <mesh castShadow={!ghost}>
            <boxGeometry args={[0.0095, 0.0032, 0.0068]} />
            <meshStandardMaterial
              color={tintOverride ?? '#18181b'}
              roughness={0.55}
              transparent={transparent}
              opacity={opacity}
              emissive={selEmissive}
              emissiveIntensity={selEmissiveInt}
            />
          </mesh>
          <mesh position={[-0.0036, 0.0017, 0.0022]}>
            <cylinderGeometry args={[0.0006, 0.0006, 0.0004, 10]} />
            <meshStandardMaterial color="#cbd5e1" transparent={transparent} opacity={opacity} />
          </mesh>
          {[0, 1, 2, 3].map((p) => (
            <group key={p} position={[-0.0036 + p * 0.00245, -0.0014, 0]}>
              <mesh position={[0, 0, -0.0042]}>
                <boxGeometry args={[0.0007, 0.0028, 0.0005]} />
                <meshStandardMaterial color="#cbd5e1" metalness={0.85} roughness={0.25} transparent={transparent} opacity={opacity} />
              </mesh>
              <mesh position={[0, 0, 0.0042]}>
                <boxGeometry args={[0.0007, 0.0028, 0.0005]} />
                <meshStandardMaterial color="#cbd5e1" metalness={0.85} roughness={0.25} transparent={transparent} opacity={opacity} />
              </mesh>
            </group>
          ))}
        </group>
      </group>
    );
  }

  return (
    <group
      ref={rootRef}
      position={[cx, BB_H, cz]}
      rotation={[0, yaw, 0]}
      onPointerOver={(e) => {
        if (ghost || !interactive) return;
        e.stopPropagation();
        setHoverLabel(`${part.label} (${part.holeA}..${part.holeB})`);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        if (ghost) return;
        setHoverLabel(null);
        document.body.style.cursor = 'auto';
      }}
      onClick={onSelectClick}
    >
      <group ref={animYRef}>
        {/* Vertical plunged legs + 90 deg shoulders + horizontal span lead */}
        <mesh position={[-span / 2, 0.0025, 0]}>
          <cylinderGeometry args={[0.00035, 0.00035, 0.0052, 8]} />
          <meshStandardMaterial color={tintOverride ?? '#d4dce5'} metalness={0.85} roughness={0.25} transparent={transparent} opacity={opacity} />
        </mesh>
        <mesh position={[span / 2, 0.0025, 0]}>
          <cylinderGeometry args={[0.00035, 0.00035, 0.0052, 8]} />
          <meshStandardMaterial color={tintOverride ?? '#d4dce5'} metalness={0.85} roughness={0.25} transparent={transparent} opacity={opacity} />
        </mesh>
        <mesh position={[0, 0.005, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.00035, 0.00035, span, 8]} />
          <meshStandardMaterial color={tintOverride ?? '#d4dce5'} metalness={0.85} roughness={0.25} transparent={transparent} opacity={opacity} />
        </mesh>

        {part.kind === 'resistor' && bands && (
          <group position={[0, 0.005, 0]}>
            <mesh rotation={[0, 0, Math.PI / 2]} castShadow={!ghost}>
              <cylinderGeometry args={[0.0017, 0.0017, 0.0072, 12]} />
              <meshStandardMaterial
                color={tintOverride ?? '#d8bd92'}
                roughness={0.45}
                transparent={transparent}
                opacity={opacity}
                emissive={selEmissive}
                emissiveIntensity={selEmissiveInt}
              />
            </mesh>
            {bands.map((col, bi) => (
              <mesh key={bi} position={[-0.0022 + bi * 0.0014, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.00176, 0.00176, 0.0006, 12]} />
                <meshStandardMaterial color={tintOverride ?? col} roughness={0.38} transparent={transparent} opacity={opacity} />
              </mesh>
            ))}
          </group>
        )}

        {part.kind === 'capacitor' && (
          part.value >= 1e-6 ? (
            <group position={[0, 0.0068, 0]}>
              <mesh castShadow={!ghost}>
                <cylinderGeometry args={[0.0026, 0.0026, 0.0082, 14]} />
                <meshStandardMaterial
                  color={tintOverride ?? '#1e3a8a'}
                  roughness={0.38}
                  transparent={transparent}
                  opacity={opacity}
                  emissive={selEmissive}
                  emissiveIntensity={selEmissiveInt}
                />
              </mesh>
              {/* Silver top pressure vent */}
              <mesh position={[0, 0.0042, 0]}>
                <cylinderGeometry args={[0.0024, 0.0024, 0.0004, 14]} />
                <meshStandardMaterial color="#cbd5e1" metalness={0.85} roughness={0.2} transparent={transparent} opacity={opacity} />
              </mesh>
              {/* White negative polarity stripe facing cathode (holeB / +X) */}
              <mesh position={[0.00235, 0, 0]}>
                <boxGeometry args={[0.0006, 0.0078, 0.0011]} />
                <meshStandardMaterial color="#f8fafc" roughness={0.4} transparent={transparent} opacity={opacity} />
              </mesh>
            </group>
          ) : (
            <mesh position={[0, 0.0055, 0]} castShadow={!ghost}>
              <cylinderGeometry args={[0.0024, 0.0024, 0.0018, 12]} />
              <meshStandardMaterial
                color={tintOverride ?? '#ea580c'}
                roughness={0.4}
                transparent={transparent}
                opacity={opacity}
                emissive={selEmissive}
                emissiveIntensity={selEmissiveInt}
              />
            </mesh>
          )
        )}

        {part.kind === 'inductor' && (
          <mesh position={[0, 0.0054, 0]} rotation={[0, 0, Math.PI / 2]} castShadow={!ghost}>
            <cylinderGeometry args={[0.0022, 0.0022, 0.0085, 14]} />
            <meshStandardMaterial
              color={tintOverride ?? '#15803d'}
              roughness={0.48}
              transparent={transparent}
              opacity={opacity}
              emissive={selEmissive}
              emissiveIntensity={selEmissiveInt}
            />
          </mesh>
        )}

        {part.kind === 'diode' && (
          <group position={[0, 0.005, 0]}>
            <mesh rotation={[0, 0, Math.PI / 2]} castShadow={!ghost}>
              <cylinderGeometry args={[0.0014, 0.0014, 0.006, 10]} />
              <meshStandardMaterial
                color={tintOverride ?? '#f97316'}
                roughness={0.32}
                transparent={transparent}
                opacity={opacity}
                emissive={selEmissive}
                emissiveIntensity={selEmissiveInt}
              />
            </mesh>
            <mesh position={[0.0018, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.00145, 0.00145, 0.001, 10]} />
              <meshStandardMaterial color="#0f172a" transparent={transparent} opacity={opacity} />
            </mesh>
          </group>
        )}

        {part.kind === 'led' && (
          <group position={[0, 0.0055, 0]}>
            <mesh position={[0, 0.002, 0]} castShadow={!ghost}>
              <cylinderGeometry args={[0.0023, 0.0023, 0.004, 14]} />
              <meshStandardMaterial
                ref={ledMatRef}
                color={tintOverride ?? (part.color ?? '#ef4444')}
                emissive={tintOverride ?? (part.color ?? '#ef4444')}
                emissiveIntensity={ghost ? 0.15 : 0.05}
                roughness={0.25}
                transparent={transparent}
                opacity={opacity}
              />
            </mesh>
            <mesh position={[0, 0.004, 0]}>
              <sphereGeometry args={[0.0023, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial
                color={tintOverride ?? (part.color ?? '#ef4444')}
                emissive={tintOverride ?? (part.color ?? '#ef4444')}
                emissiveIntensity={0.25}
                roughness={0.25}
                transparent={transparent}
                opacity={opacity}
              />
            </mesh>
            {/* Flat cathode side rim toward +X (holeB) */}
            <mesh position={[0.0020, 0.0005, 0]}>
              <boxGeometry args={[0.0008, 0.0012, 0.0038]} />
              <meshStandardMaterial color={tintOverride ?? '#475569'} roughness={0.4} transparent={transparent} opacity={opacity} />
            </mesh>
          </group>
        )}
      </group>

      {selected && !ghost && interactive && (
        <>
          <mesh
            position={[-span / 2, 0.0068, 0]}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHoverLabel(`Geser Pin A (${part.holeA})`);
              document.body.style.cursor = 'grab';
            }}
            onClick={(e) => {
              e.stopPropagation();
              startReshaping(part.id, 'pinA');
            }}
          >
            <sphereGeometry args={[0.00145, 12, 12]} />
            <meshBasicMaterial color="#38bdf8" toneMapped={false} />
          </mesh>
          <mesh
            position={[span / 2, 0.0068, 0]}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHoverLabel(`Geser Pin B (${part.holeB})`);
              document.body.style.cursor = 'grab';
            }}
            onClick={(e) => {
              e.stopPropagation();
              startReshaping(part.id, 'pinB');
            }}
          >
            <sphereGeometry args={[0.00145, 12, 12]} />
            <meshBasicMaterial color="#fb923c" toneMapped={false} />
          </mesh>
        </>
      )}
    </group>
  );
}

export function BreadboardComponents3D() {
  const parts = useLabStore((s) => s.breadboardParts);
  const placingPart = useLabStore((s) => s.placingPart);
  const selectedPartId = useLabStore((s) => s.selectedBreadboardPartId);
  const reshapingPart = useLabStore((s) => s.reshapingPart);
  const breadboardMode = useLabStore((s) => s.breadboardMode);
  const breadboardViewMode = useLabStore((s) => s.breadboardViewMode);
  const breadboardShowPins = useLabStore((s) => s.breadboardShowPins);
  const grabbedEnd = useLabStore((s) => s.grabbedEnd);

  const enterBreadboardMode = useLabStore((s) => s.enterBreadboardMode);
  const setBreadboardViewMode = useLabStore((s) => s.setBreadboardViewMode);
  const toggleBreadboardShowPins = useLabStore((s) => s.toggleBreadboardShowPins);
  const undoBreadboard = useLabStore((s) => s.undoBreadboard);
  const redoBreadboard = useLabStore((s) => s.redoBreadboard);
  const rotatePlacingPart = useLabStore((s) => s.rotatePlacingPart);
  const rotateBreadboardPart = useLabStore((s) => s.rotateBreadboardPart);
  const flipBreadboardPart = useLabStore((s) => s.flipBreadboardPart);
  const removeBreadboardPart = useLabStore((s) => s.removeBreadboardPart);
  const anchorPlacingHoleA = useLabStore((s) => s.anchorPlacingHoleA);
  const addPlacingWaypoint = useLabStore((s) => s.addPlacingWaypoint);
  const commitPlacedPart = useLabStore((s) => s.commitPlacedPart);
  const commitFloatingJumper = useLabStore((s) => s.commitFloatingJumper);
  const commitReshapePart = useLabStore((s) => s.commitReshapePart);
  const clickSocket = useLabStore((s) => s.clickSocket);
  const setHoverLabel = useLabStore((s) => s.setHoverLabel);

  const [hoverHole, setHoverHole] = useState<string | null>(null);
  const [hoverLocalXZ, setHoverLocalXZ] = useState<[number, number] | null>(null);
  const downMetaRef = useRef<{ x: number; y: number; btn: number; hole: string | null }>({
    x: 0,
    y: 0,
    btn: 0,
    hole: null,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      const st = useLabStore.getState();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && st.breadboardMode) {
        e.preventDefault();
        if (e.shiftKey) redoBreadboard();
        else undoBreadboard();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && st.breadboardMode) {
        e.preventDefault();
        redoBreadboard();
        return;
      }
      if (st.breadboardMode) {
        if (e.key === 'n' || e.key === 'N') setBreadboardViewMode('standard');
        else if (e.key === 'v' || e.key === 'V') setBreadboardViewMode('voltage');
        else if (e.key === 'i' || e.key === 'I') setBreadboardViewMode('current');
        else if (e.key === 'p' || e.key === 'P') toggleBreadboardShowPins();
      }
      if (e.key === 'r' || e.key === 'R') {
        if (st.placingPart) rotatePlacingPart();
        else if (st.selectedBreadboardPartId) rotateBreadboardPart(st.selectedBreadboardPartId);
      } else if (e.key === 'f' || e.key === 'F') {
        if (st.placingPart?.kind === 'jumper' && st.placingPart.anchorHoleA) {
          commitFloatingJumper(st.placingPart.anchorHoleA, st.placingPart.rotationDeg);
        } else if (st.selectedBreadboardPartId) {
          flipBreadboardPart(st.selectedBreadboardPartId);
        }
      } else if (e.key === 'b' || e.key === 'B') {
        if (!st.breadboard2D && st.placingPart?.kind === 'jumper' && st.placingPart.anchorHoleA && hoverLocalXZ) {
          addPlacingWaypoint(hoverLocalXZ[0], hoverLocalXZ[1]);
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (st.selectedBreadboardPartId) removeBreadboardPart(st.selectedBreadboardPartId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    addPlacingWaypoint,
    commitFloatingJumper,
    flipBreadboardPart,
    hoverLocalXZ,
    redoBreadboard,
    removeBreadboardPart,
    rotateBreadboardPart,
    rotatePlacingPart,
    setBreadboardViewMode,
    toggleBreadboardShowPins,
    undoBreadboard,
  ]);

  // Keep gold tie-pins on active columns + rails for easy probe clamping
  const activeTiePins = useMemo(() => {
    const map = new Map<string, string>();
    map.set('tp_10', 'BB +Top Rail');
    map.set('tn_10', 'BB -Top Rail A');
    map.set('tn_18', 'BB -Top Rail B');
    map.set('tn_28', 'BB -Top Rail C');
    for (const p of parts) {
      for (const h of [p.holeA, p.holeB]) {
        if (h.startsWith('t_')) {
          const col = Number(h.split('_')[1]);
          map.set(`t_${col}_a`, `BB Top Col ${col} (${p.label})`);
        } else if (h.startsWith('b_')) {
          const col = Number(h.split('_')[1]);
          map.set(`b_${col}_j`, `BB Bot Col ${col} (${p.label})`);
        }
      }
    }
    return Array.from(map.entries()).map(([holeId, label]) => ({ holeId, label }));
  }, [parts]);

  const pinOccupiedMarkers = useMemo<HighlightEntry[]>(() => {
    if (!breadboardShowPins) return [];
    const out: HighlightEntry[] = [];
    for (const p of parts) {
      out.push({ holeId: p.holeA, color: '#38bdf8', scale: 0.95 });
      if (!(p.kind === 'jumper' && p.floating)) {
        out.push({ holeId: p.holeB, color: '#fb923c', scale: 0.95 });
      }
    }
    return out;
  }, [breadboardShowPins, parts]);

  const occupied = useMemo(
    () => getOccupiedHoles(parts, reshapingPart?.partId),
    [parts, reshapingPart?.partId]
  );

  // Compute CRUMB Ghost Preview (either placing new component OR reshaping existing part)
  const ghostModel = useMemo(() => {
    if (!hoverHole) return null;
    if (placingPart) {
      const isFloatingGhost =
        placingPart.kind === 'jumper' &&
        (Boolean(placingPart.floating) ||
          (Boolean(placingPart.anchorHoleA) && hoverHole === placingPart.anchorHoleA));
      const preview = computePlacementPreview(
        placingPart.kind,
        hoverHole,
        placingPart.span,
        placingPart.rotationDeg ?? 0,
        occupied,
        isFloatingGhost ? null : placingPart.anchorHoleA,
        hoverHole,
        isFloatingGhost
      );
      const ghostPart: BreadboardPart = {
        id: '__ghost',
        kind: placingPart.kind,
        label: isFloatingGhost ? 'Jumper Bebas' : placingPart.label,
        value: placingPart.value,
        holeA: preview.holeA,
        holeB: preview.holeB,
        color: placingPart.color,
        waypoints: isFloatingGhost ? undefined : placingPart.waypoints,
        floating: isFloatingGhost || undefined,
        floatOffset: isFloatingGhost
          ? defaultFloatOffsetForHole(preview.holeA, placingPart.rotationDeg ?? 0)
          : undefined,
      };
      return { part: ghostPart, preview };
    }
    if (reshapingPart) {
      const src = parts.find((p) => p.id === reshapingPart.partId);
      if (!src) return null;
      let holeA = src.holeA;
      let holeB = src.holeB;
      let valid = true;
      let floating = src.floating;
      let floatOffset = src.floatOffset;
      if (reshapingPart.mode === 'move') {
        const moved = movePartToAnchor(src, hoverHole, occupied);
        holeA = moved.holeA;
        holeB = moved.holeB;
        valid = moved.valid;
        if (src.kind === 'jumper' && src.floating) {
          floatOffset = defaultFloatOffsetForHole(hoverHole, 0);
        }
      } else if (reshapingPart.mode === 'pinA') {
        holeA = hoverHole;
        if (src.kind === 'jumper' && src.floating) {
          holeB = hoverHole;
          valid = !occupied.has(holeA);
          floatOffset = defaultFloatOffsetForHole(hoverHole, 0);
        } else {
          valid = holeA !== holeB && !occupied.has(holeA);
        }
      } else {
        holeB = hoverHole;
        valid = holeA !== holeB && !occupied.has(holeB);
        floating = false;
        floatOffset = undefined;
      }
      return {
        part: { ...src, id: '__ghost_reshape', holeA, holeB, floating, floatOffset, waypoints: undefined },
        preview: {
          holeA,
          holeB,
          pins: floating ? [holeA] : [holeA, holeB],
          valid,
          sameStripWarning: false,
        },
      };
    }
    return null;
  }, [hoverHole, occupied, parts, placingPart, reshapingPart]);

  // Build Instanced Highlight rings (connected emerald strip + target pin amber/red + cable cyan)
  const highlightEntries = useMemo<HighlightEntry[]>(() => {
    const out: HighlightEntry[] = [];
    const seen = new Map<string, HighlightEntry>();

    if (hoverHole) {
      const strip = getConnectedStripHoles(hoverHole);
      for (const sh of strip) {
        seen.set(sh, {
          holeId: sh,
          color: occupied.has(sh) ? '#f59e0b' : '#22c55e',
          scale: sh === hoverHole ? 1.15 : 0.85,
        });
      }
    }
    if (ghostModel) {
      for (const pin of ghostModel.preview.pins) {
        const blocked = occupied.has(pin) || !ghostModel.preview.valid;
        seen.set(pin, {
          holeId: pin,
          color: blocked ? '#ef4444' : '#f59e0b',
          scale: 1.25,
        });
      }
    }
    if (hoverHole && grabbedEnd) {
      seen.set(hoverHole, { holeId: hoverHole, color: '#38bdf8', scale: 1.3 });
    }
    for (const m of pinOccupiedMarkers) {
      if (!seen.has(m.holeId)) seen.set(m.holeId, m);
    }
    seen.forEach((v) => out.push(v));
    return out;
  }, [ghostModel, grabbedEnd, hoverHole, occupied, pinOccupiedMarkers]);

  const partInteractive = !placingPart && !reshapingPart && !grabbedEnd;

  const updatePointerHole = (e: ThreeEvent<PointerEvent>) => {
    const lx = e.point.x - BB_WORLD_POS[0];
    const lz = e.point.z - BB_WORLD_POS[2];
    const h = nearestHoleFromLocalXZ(lx, lz);
    setHoverHole(h);
    setHoverLocalXZ([lx, lz]);
    if (grabbedEnd) {
      // Prioritize snapping onto a nearby raised floating jumper tip instead of the raw breadboard hole beneath
      const nearFloat = socketRegistry.findNearest(e.point, 0.036);
      if (nearFloat && nearFloat.kind === 'float_pin') {
        hotRefs.hoveredSocketId = nearFloat.id;
        setHoverLabel(`Jepit ke ${nearFloat.label}`);
        return { h, lx, lz, floatSnapId: nearFloat.id };
      }
      hotRefs.hoveredSocketId = `bb_${h}`;
      setHoverLabel(`Pasang kabel ke BB ${h}`);
      return { h, lx, lz, floatSnapId: null as string | null };
    } else if (reshapingPart) {
      setHoverLabel(`Pindah ${reshapingPart.mode} -> ${h}`);
    } else if (placingPart) {
      if (placingPart.kind === 'jumper' && placingPart.floating) {
        setHoverLabel(`Pasang Jumper Bebas di ${h} (R: arah condong)`);
      } else if (placingPart.anchorHoleA) {
        setHoverLabel(
          placingPart.kind === 'jumper'
            ? h === placingPart.anchorHoleA
              ? `Klik lagi / tekan F: Jadikan Jumper Bebas (${h})`
              : `Jumper ${placingPart.anchorHoleA} -> ${h} (F: Floating, Klik kanan/B: belok)`
            : `${placingPart.label}: ${placingPart.anchorHoleA} -> ${h}`
        );
      } else {
        setHoverLabel(`Pasang ${placingPart.label} di ${h} (R: putar)`);
      }
    } else {
      setHoverLabel(`Breadboard 830 (${h} — Klik untuk buka Mode 2D)`);
    }
    return { h, lx, lz, floatSnapId: null as string | null };
  };

  return (
    <group position={BB_WORLD_POS} name="breadboard_components_root">
      {parts.map((part) => (
        <PartMesh3D
          key={part.id}
          part={part}
          selected={part.id === selectedPartId}
          interactive={partInteractive}
        />
      ))}

      {/* Silent socketRegistry registration for active breadboard columns & rails (no protruding sticks) */}
      {activeTiePins.map((pin) => (
        <BreadboardTiePin key={pin.holeId} holeId={pin.holeId} label={pin.label} />
      ))}

      {/* Optional CRUMB Live Voltage & Current Overlays */}
      {breadboardViewMode === 'voltage' && <VoltageViewOverlay />}
      {breadboardViewMode === 'current' && <CurrentViewOverlay parts={parts} />}

      {/* Live Hole & Strip Connectivity Highlight Overlay */}
      {highlightEntries.length > 0 && <HoleHighlightOverlay entries={highlightEntries} />}

      {/* Real-time 3D Ghost Preview while placing or reshaping */}
      {ghostModel && (
        <PartMesh3D
          part={ghostModel.part}
          ghost
          invalidGhost={!ghostModel.preview.valid}
          interactive={false}
        />
      )}

      {/* Invisible High-Precision Breadboard Hole Picking Surface */}
      <mesh
        position={[0, BB_H + 0.0007, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerMove={(e) => {
          if (placingPart || reshapingPart || grabbedEnd) e.stopPropagation();
          updatePointerHole(e);
        }}
        onPointerOut={() => {
          setHoverHole(null);
          setHoverLocalXZ(null);
          if (hotRefs.hoveredSocketId?.startsWith('bb_')) hotRefs.hoveredSocketId = null;
          setHoverLabel(null);
        }}
        onPointerDown={(e) => {
          const { h, floatSnapId } = updatePointerHole(e);
          downMetaRef.current = { x: e.clientX, y: e.clientY, btn: e.button, hole: h };

          if (e.button !== 0) return;
          if (grabbedEnd) {
            e.stopPropagation();
            clickSocket(floatSnapId ?? `bb_${h}`);
            return;
          }
          if (!breadboardMode) {
            // Defer entering 2D mode to onClick so floating jumpers & cable clips sitting above the board cleanly intercept first
            return;
          }
          if (reshapingPart) {
            e.stopPropagation();
            commitReshapePart(h);
            return;
          }
          if (placingPart) {
            e.stopPropagation();
            if (placingPart.kind === 'jumper' && placingPart.floating) {
              commitFloatingJumper(h, placingPart.rotationDeg);
            } else if (placingPart.kind === 'opamp741') {
              useLabStore.getState().placePartAtHole(h);
            } else if (!placingPart.anchorHoleA) {
              anchorPlacingHoleA(h);
            } else if (h === placingPart.anchorHoleA && placingPart.kind === 'jumper') {
              commitFloatingJumper(placingPart.anchorHoleA, placingPart.rotationDeg);
            } else if (h !== placingPart.anchorHoleA) {
              commitPlacedPart(placingPart.anchorHoleA, h, placingPart.waypoints);
            }
          }
        }}
        onClick={(e) => {
          if (e.button !== 0 || e.delta > 6) return;
          const st = useLabStore.getState();
          if (!st.breadboardMode && !st.grabbedEnd && !st.placingPart && !st.reshapingPart) {
            e.stopPropagation();
            enterBreadboardMode();
          }
        }}
        onPointerUp={(e) => {
          const d = downMetaRef.current;
          const dist = Math.hypot(e.clientX - d.x, e.clientY - d.y);
          const lx = e.point.x - BB_WORLD_POS[0];
          const lz = e.point.z - BB_WORLD_POS[2];
          const h = nearestHoleFromLocalXZ(lx, lz);

          if (e.button === 2 && dist < 5 && placingPart?.kind === 'jumper' && placingPart.anchorHoleA) {
            e.stopPropagation();
            addPlacingWaypoint(lx, lz);
            return;
          }
          if (
            e.button === 0 &&
            placingPart &&
            placingPart.kind !== 'opamp741' &&
            placingPart.anchorHoleA &&
            h !== placingPart.anchorHoleA &&
            d.hole === placingPart.anchorHoleA &&
            dist > 8
          ) {
            // Support single press-and-drag CRUMB pin-to-pin placement!
            e.stopPropagation();
            commitPlacedPart(placingPart.anchorHoleA, h, placingPart.waypoints);
          }
        }}
      >
        <planeGeometry args={[BB_W, BB_D]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}
