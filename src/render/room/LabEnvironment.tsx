import { useEffect, useMemo, useRef } from 'react';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import {
  BB_D,
  BB_H,
  BB_PITCH,
  BB_W,
  BB_WORLD_POS,
} from '../../simulation/breadboard/breadboardModel';
import { useLabStore } from '../../state/labStore';
import {
  getBenchWoodTexture,
  getBreadboardTopTexture,
  getESDMatTexture,
  getLabWhiteboardTexture,
} from '../textures/proceduralTextures';

function InstancedBreadboard830() {
  const holesRef = useRef<THREE.InstancedMesh>(null);
  const topTex = useMemo(() => getBreadboardTopTexture(), []);
  const enterBreadboardMode = useLabStore((s) => s.enterBreadboardMode);
  const breadboardMode = useLabStore((s) => s.breadboardMode);
  const setHoverLabel = useLabStore((s) => s.setHoverLabel);

  const holeCount = 830;

  useEffect(() => {
    const mesh = holesRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    let idx = 0;

    const pushHole = (x: number, z: number) => {
      if (idx >= holeCount) return;
      dummy.position.set(x, BB_H / 2 + 0.0002, z);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx++, dummy.matrix);
    };

    const startX = -((62 * BB_PITCH) / 2);
    for (let col = 0; col < 63; col++) {
      const x = startX + col * BB_PITCH;
      for (let r = 0; r < 5; r++) {
        pushHole(x, -0.0042 - r * BB_PITCH);
        pushHole(x, 0.0042 + r * BB_PITCH);
      }
    }

    const railZs = [-0.0235, -0.0205, 0.0205, 0.0235];
    for (const rz of railZs) {
      let cIdx = 0;
      for (let blk = 0; blk < 10; blk++) {
        for (let k = 0; k < 5; k++) {
          const x = -0.072 + cIdx * BB_PITCH + blk * 0.0022;
          pushHole(x, rz);
          cIdx++;
        }
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  return (
    <group
      position={[BB_WORLD_POS[0], BB_WORLD_POS[1] + BB_H / 2, BB_WORLD_POS[2]]}
      name="breadboard_830"
      onPointerOver={(e) => {
        if (breadboardMode || useLabStore.getState().grabbedEnd) return;
        e.stopPropagation();
        setHoverLabel('Breadboard 830 (Klik untuk buka Mode 2D)');
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        if (!breadboardMode) {
          setHoverLabel(null);
          document.body.style.cursor = 'auto';
        }
      }}
      onClick={(e) => {
        if (e.delta > 6) return;
        const st = useLabStore.getState();
        if (st.grabbedEnd || st.placingPart || st.reshapingPart || st.breadboardMode) return;
        e.stopPropagation();
        enterBreadboardMode();
      }}
      onDoubleClick={(e) => {
        const st = useLabStore.getState();
        if (st.grabbedEnd || st.placingPart || st.reshapingPart) return;
        e.stopPropagation();
        enterBreadboardMode();
      }}
    >
      <RoundedBox args={[BB_W, BB_H, BB_D]} radius={0.0018} smoothness={3} castShadow receiveShadow>
        <meshStandardMaterial color="#f2efe8" roughness={0.55} />
      </RoundedBox>
      <mesh position={[0, BB_H / 2 + 0.0001, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[BB_W - 0.003, BB_D - 0.003]} />
        <meshStandardMaterial map={topTex} roughness={0.62} />
      </mesh>
      <instancedMesh ref={holesRef} args={[undefined, undefined, holeCount]}>
        <boxGeometry args={[0.0012, 0.0006, 0.0012]} />
        <meshStandardMaterial color="#18181b" roughness={0.9} />
      </instancedMesh>
    </group>
  );
}

let cachedContactShadowTex: THREE.CanvasTexture | null = null;

function getBakedContactShadowTexture(): THREE.CanvasTexture {
  if (cachedContactShadowTex) return cachedContactShadowTex;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  // Soft layered rounded-rect ambient occlusion shadow (sticks to desk, zero dynamic shadow-map cost!)
  const layers = [
    { inset: 8, radius: 22, alpha: 0.14 },
    { inset: 15, radius: 18, alpha: 0.22 },
    { inset: 22, radius: 14, alpha: 0.30 },
    { inset: 28, radius: 10, alpha: 0.34 },
  ];
  ctx.filter = 'blur(7px)';
  for (const l of layers) {
    const x = l.inset;
    const y = l.inset;
    const w = size - l.inset * 2;
    const h = size - l.inset * 2;
    ctx.fillStyle = `rgba(12, 16, 24, ${l.alpha})`;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, l.radius);
    ctx.fill();
  }
  ctx.filter = 'none';

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  cachedContactShadowTex = tex;
  return tex;
}

const STATIC_BENCH_SHADOWS: ReadonlyArray<{
  id: string;
  pos: [number, number, number];
  size: [number, number];
  rotY?: number;
  opacity: number;
}> = [
  // Baked static contact shadows directly beneath stationary instruments & breadboard
  { id: 'kit', pos: [-0.635, 0.7808, 0.046], size: [0.32, 0.165], opacity: 0.44 },
  { id: 'rigol', pos: [-0.262, 0.7824, -0.155], size: [0.39, 0.205], opacity: 0.48 },
  { id: 'gen', pos: [0.072, 0.7824, -0.205], size: [0.295, 0.275], opacity: 0.46 },
  { id: 'psu', pos: [0.354, 0.7824, -0.174], size: [0.305, 0.285], opacity: 0.46 },
  { id: 'dmm', pos: [0.642, 0.7808, 0.024], size: [0.305, 0.315], rotY: -0.40, opacity: 0.44 },
  { id: 'bb', pos: [BB_WORLD_POS[0] + 0.002, 0.7824, BB_WORLD_POS[2] + 0.003], size: [0.195, 0.084], opacity: 0.40 },
  { id: 'pot', pos: [0.312, 0.7824, 0.236], size: [0.245, 0.165], rotY: -0.14, opacity: 0.44 },
  { id: 'strip', pos: [-0.718, 0.7808, -0.256], size: [0.275, 0.095], rotY: 0.28, opacity: 0.36 },
];

function StaticBenchShadows() {
  const shadows = useLabStore((s) => s.graphics.shadows);
  const shadowTex = useMemo(() => getBakedContactShadowTexture(), []);
  if (!shadows) return null;

  return (
    <group name="static_contact_shadows" userData={{ cableIgnore: true }}>
      {STATIC_BENCH_SHADOWS.map((sh) => (
        <mesh
          key={sh.id}
          position={sh.pos}
          rotation={[-Math.PI / 2, 0, sh.rotY ?? 0]}
          raycast={() => null}
        >
          <planeGeometry args={sh.size} />
          <meshBasicMaterial
            map={shadowTex}
            transparent
            opacity={sh.opacity}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

export function LabEnvironment() {
  const esdTex = useMemo(() => getESDMatTexture(), []);
  const woodTex = useMemo(() => getBenchWoodTexture(), []);
  const boardTex = useMemo(() => getLabWhiteboardTexture(), []);

  return (
    <group name="lab_environment">
      {/* Lab Floor */}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[8, 8]} />
        <meshStandardMaterial color="#cfd5dc" roughness={0.82} />
      </mesh>

      {/* Rear & Side Lab Walls */}
      <mesh position={[0, 1.8, -0.95]}>
        <planeGeometry args={[8, 3.6]} />
        <meshStandardMaterial color="#e5e7eb" roughness={0.88} />
      </mesh>
      <mesh position={[-2.4, 1.8, 1]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[6, 3.6]} />
        <meshStandardMaterial color="#dfe3ea" roughness={0.88} />
      </mesh>
      <mesh position={[2.4, 1.8, 1]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[6, 3.6]} />
        <meshStandardMaterial color="#dfe3ea" roughness={0.88} />
      </mesh>

      {/* Grounded LDTE Whiteboard high on rear wall */}
      <group position={[0, 1.44, -0.935]}>
        <mesh>
          <boxGeometry args={[1.18, 0.56, 0.018]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.4} metalness={0.45} />
        </mesh>
        <mesh position={[0, 0, 0.01]}>
          <planeGeometry args={[1.14, 0.52]} />
          <meshStandardMaterial map={boardTex} roughness={0.35} />
        </mesh>
      </group>

      {/* Lab Bench Electrical Raceway Trunking + Outlets */}
      <mesh position={[0, 0.96, -0.92]}>
        <boxGeometry args={[2.2, 0.075, 0.04]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.45} metalness={0.3} />
      </mesh>
      {[-0.55, 0, 0.55].map((ox) => (
        <mesh key={ox} position={[ox, 0.96, -0.898]}>
          <boxGeometry args={[0.06, 0.042, 0.008]} />
          <meshStandardMaterial color="#334155" roughness={0.5} />
        </mesh>
      ))}

      {/* Main Lab Workbench Tabletop (1.82m x 0.86m, top at y = 0.78m) */}
      <mesh position={[0, 0.76, 0.05]}>
        <boxGeometry args={[1.82, 0.04, 0.86]} />
        <meshStandardMaterial map={woodTex} roughness={0.62} />
      </mesh>

      {/* Steel Table Legs */}
      {[
        [-0.82, 0.37, -0.32],
        [0.82, 0.37, -0.32],
        [-0.82, 0.37, 0.42],
        [0.82, 0.37, 0.42],
      ].map((p, idx) => (
        <mesh key={idx} position={p as [number, number, number]}>
          <boxGeometry args={[0.045, 0.74, 0.045]} />
          <meshStandardMaterial color="#374151" roughness={0.45} metalness={0.65} />
        </mesh>
      ))}

      {/* Green ESD Anti-Static Mat */}
      <mesh position={[0.02, 0.7815, 0.14]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.96, 0.48]} />
        <meshStandardMaterial map={esdTex} roughness={0.78} metalness={0.02} />
      </mesh>

      {/* Baked Static Contact Shadows (zero dynamic shadow-map GPU overhead) */}
      <StaticBenchShadows />

      {/* Bench AC Power Strip cleanly tucked at rear-left */}
      <group position={[-0.72, 0.798, -0.26]} rotation={[0, 0.28, 0]}>
        <RoundedBox args={[0.22, 0.034, 0.055]} radius={0.004} smoothness={3}>
          <meshStandardMaterial color="#334155" roughness={0.5} />
        </RoundedBox>
        <mesh position={[-0.08, 0.018, 0]}>
          <boxGeometry args={[0.02, 0.008, 0.014]} />
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={1.2} />
        </mesh>
      </group>

      {/* Real Instanced 830-Hole Breadboard */}
      <InstancedBreadboard830 />
    </group>
  );
}
