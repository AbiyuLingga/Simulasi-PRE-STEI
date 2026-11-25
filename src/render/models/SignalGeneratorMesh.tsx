import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { RoundedBox } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { labAudio } from '../../audio/labAudio';
import { hotRefs } from '../../state/hotRefs';
import { useLabStore } from '../../state/labStore';
import { registerObjectSocket, socketRegistry } from '../cables/socketRegistry';
import {
  getDG1012SoftkeyLabels,
  getDG1022FrontPanelTexture,
  getDG1022KeypadOverlayTexture,
  getDG1022WaveKeyTexture,
  renderDG1022LCD,
  type DG1022ParamTab,
  type DG1022UIState,
} from '../textures/dg1022Textures';
import type { SignalGenModMode, WaveformShape } from '../../simulation/circuit/types';

// Exact Rigol DG1012 per-waveform maximum frequency specifications (from official DG1012 User's Guide)
function maxFreqForDG1012(w: WaveformShape, dutyPct: number): number {
  if (w === 'sine') return 15_000_000;
  if (w === 'square') return dutyPct !== 50 ? 2_000_000 : 4_000_000;
  if (w === 'triangle') return 150_000;
  if (w === 'noise') return 5_000_000;
  return 4_000_000;
}

const DG1012_STORE_KEY = 'el2101_dg1012_slots_v1';
import { getDM3058RearTexture, getDM3058SideTexture } from '../textures/dm3058Textures';
import { getChassisGrainRoughnessMap } from '../textures/proceduralTextures';

const W = 0.232;
const H = 0.107;
const D = 0.246;
const FRONT_Z = D / 2;

function uvToXY(u: number, v: number): [number, number] {
  return [(u - 0.5) * W, (0.5 - v) * H];
}

function mergeNonIndexed(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const norm = geos.map((raw) => {
    const g = raw.index ? raw.toNonIndexed() : raw.clone();
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (g.getAttribute('uv')) g.deleteAttribute('uv');
    raw.dispose();
    return g;
  });
  const merged = mergeGeometries(norm, false)!;
  for (const g of norm) g.dispose();
  merged.computeBoundingSphere();
  return merged;
}

let dgFaceplateGeoCache: THREE.BufferGeometry | null = null;

/**
 * Single sculpted UV-mapped front bezel with true 3D sloped hollow opening for the 256x64 dot-matrix LCD.
 */
function getDG1022FaceplateGeometry(): THREE.BufferGeometry {
  if (dgFaceplateGeoCache) return dgFaceplateGeoCache;
  const positions: number[] = [];
  const uvs: number[] = [];

  const pushQuad = (
    u0: number,
    v0: number,
    z00: number,
    u1: number,
    v1: number,
    z01: number,
    z11: number,
    z10: number
  ) => {
    const x0 = (u0 - 0.5) * W;
    const x1 = (u1 - 0.5) * W;
    const yTop = (0.5 - v0) * H;
    const yBot = (0.5 - v1) * H;
    positions.push(
      x0, yTop, z00,
      x0, yBot, z01,
      x1, yBot, z11,
      x0, yTop, z00,
      x1, yBot, z11,
      x1, yTop, z10
    );
    uvs.push(u0, 1 - v0, u0, 1 - v1, u1, 1 - v1, u0, 1 - v0, u1, 1 - v1, u1, 1 - v0);
  };

  // Hollow LCD cutout matching dg1022Textures border u=[0.130..0.562], v=[0.198..0.514]
  const us = [0.008, 0.118, 0.130, 0.562, 0.574, 0.592];
  const vs = [0.012, 0.184, 0.198, 0.514, 0.528, 0.988];
  const zAt = (iu: number, iv: number) => ((iu === 2 || iu === 3) && (iv === 2 || iv === 3) ? 0.0002 : 0.0036);

  for (let iu = 0; iu < us.length - 1; iu++) {
    for (let iv = 0; iv < vs.length - 1; iv++) {
      if (iu === 2 && iv === 2) continue;
      pushQuad(
        us[iu],
        vs[iv],
        zAt(iu, iv),
        us[iu + 1],
        vs[iv + 1],
        zAt(iu, iv + 1),
        zAt(iu + 1, iv + 1),
        zAt(iu + 1, iv)
      );
    }
  }

  // Slight step down into cool pale-blue right fascia
  pushQuad(0.592, 0.012, 0.0036, 0.596, 0.988, 0.0036, 0.0020, 0.0020);
  pushQuad(0.596, 0.012, 0.0020, 0.992, 0.988, 0.0020, 0.0020, 0.0020);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  dgFaceplateGeoCache = geo;
  return geo;
}

interface DG1022StaticPack {
  bumperBody: THREE.BufferGeometry;
  bumperRibs: THREE.BufferGeometry;
  bailStand: THREE.BufferGeometry;
  keypadCaps: THREE.BufferGeometry;
  bncWell: THREE.BufferGeometry;
  bncChrome: THREE.BufferGeometry;
  bncPtfe: THREE.BufferGeometry;
  bncPin: THREE.BufferGeometry;
  knobFluted: THREE.BufferGeometry;
}

let dgStaticCache: DG1022StaticPack | null = null;

function getMergedDG1022StaticParts(): DG1022StaticPack {
  if (dgStaticCache) return dgStaticCache;

  // 1) 8 Ribbed Medium-Gray Rubber Corner Bumpers (4 front + 4 rear -> 2 draw calls!)
  const bodyParts: THREE.BufferGeometry[] = [];
  const ribParts: THREE.BufferGeometry[] = [];
  for (const xSign of [-1, 1] as const) {
    for (const ySign of [-1, 1] as const) {
      for (const zSign of [-1, 1] as const) {
        const cx = xSign * (W / 2 - 0.006);
        const cy = ySign * (H / 2 - 0.006);
        const cz = zSign * (D / 2 - 0.008);

        const cap = new THREE.BoxGeometry(0.026, 0.024, 0.026);
        cap.translate(cx, cy, cz);
        bodyParts.push(cap);

        const wrap = new THREE.BoxGeometry(0.034, 0.010, 0.026);
        wrap.translate(cx - xSign * 0.010, cy + ySign * 0.007, cz);
        bodyParts.push(wrap);

        for (const ry of [-0.007, -0.002, 0.003, 0.008]) {
          const rib = new THREE.BoxGeometry(0.0022, 0.0028, 0.022);
          rib.translate(cx + xSign * 0.0138, cy + ry, cz);
          ribParts.push(rib);
        }
      }
    }
  }

  // 2) Pivoting Dark-Gray Bail Carry Handle / Tilt Stand (1 draw call!)
  const bailParts: THREE.BufferGeometry[] = [];
  const bailZ = D * 0.22;
  for (const side of [-1, 1] as const) {
    const hub = new THREE.CylinderGeometry(0.016, 0.017, 0.014, 18);
    hub.rotateZ(Math.PI / 2);
    hub.translate(side * (W / 2 + 0.008), -0.004, bailZ);
    bailParts.push(hub);

    const arm = new THREE.BoxGeometry(0.012, H * 0.72, 0.018);
    arm.rotateZ(side * 0.08);
    arm.rotateX(0.35);
    arm.translate(side * (W / 2 + 0.008), -0.004 - H * 0.42, bailZ + 0.014);
    bailParts.push(arm);
  }
  const bar = new THREE.BoxGeometry(W + 0.022, 0.011, 0.016);
  bar.translate(0, -0.004 - H * 0.72, bailZ + 0.025);
  bailParts.push(bar);

  // 3) Merged 3D sculpted keycaps for 2x3 Utility + 3x4 Numeric Keypad (18 raised keys -> 1 draw call!)
  const capParts: THREE.BufferGeometry[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 2; c++) {
      const [kx, ky] = uvToXY(0.642 + c * 0.062, 0.138 + r * 0.122);
      const b = new THREE.BoxGeometry(0.0114, 0.0088, 0.0038);
      b.translate(kx, ky, 0.0036);
      capParts.push(b);
    }
  }
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      const [kx, ky] = uvToXY(0.640 + c * 0.054, 0.562 + r * 0.104);
      const b = new THREE.BoxGeometry(0.0102, 0.0080, 0.0038);
      b.translate(kx, ky, 0.0036);
      capParts.push(b);
    }
  }

  // 4) Reusable Authentic Recessed Bayonet BNC Jack parts (exact DG1022 dual BNC look!)
  const wellParts: THREE.BufferGeometry[] = [];
  const outerRing = new THREE.CylinderGeometry(0.0112, 0.0116, 0.0018, 22);
  outerRing.rotateX(Math.PI / 2);
  outerRing.translate(0, 0, 0.0005);
  wellParts.push(outerRing);
  const innerWell = new THREE.CylinderGeometry(0.0092, 0.0092, 0.0014, 22);
  innerWell.rotateX(Math.PI / 2);
  innerWell.translate(0, 0, 0.0011);
  wellParts.push(innerWell);

  const chromeParts: THREE.BufferGeometry[] = [];
  const hexNut = new THREE.CylinderGeometry(0.0074, 0.0074, 0.0022, 6);
  hexNut.rotateX(Math.PI / 2);
  hexNut.translate(0, 0, 0.0024);
  chromeParts.push(hexNut);
  const barrel = new THREE.CylinderGeometry(0.0061, 0.0061, 0.0135, 20);
  barrel.rotateX(Math.PI / 2);
  barrel.translate(0, 0, 0.0082);
  chromeParts.push(barrel);
  const lugs = new THREE.CylinderGeometry(0.0010, 0.0010, 0.0144, 8);
  lugs.rotateZ(Math.PI / 2);
  lugs.translate(0, 0, 0.0112);
  chromeParts.push(lugs);

  const ptfe = new THREE.CylinderGeometry(0.0039, 0.0039, 0.002, 16);
  ptfe.rotateX(Math.PI / 2);
  ptfe.translate(0, 0, 0.0144);

  const pin = new THREE.CylinderGeometry(0.0011, 0.0011, 0.002, 10);
  pin.rotateX(Math.PI / 2);
  pin.translate(0, 0, 0.0148);

  // 5) Cream-white fluted rotary encoder knob (20 flutes matching DG1022 photo!)
  const knobShape = new THREE.Shape();
  const kR = 0.0155;
  const flutes = 20;
  const pts = flutes * 4;
  for (let i = 0; i <= pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    const r = kR * (1 - 0.045 * Math.pow(Math.sin(a * flutes * 0.5), 2));
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (i === 0) knobShape.moveTo(px, py);
    else knobShape.lineTo(px, py);
  }
  const knobGeo = new THREE.ExtrudeGeometry(knobShape, {
    depth: 0.014,
    bevelEnabled: true,
    bevelThickness: 0.0014,
    bevelSize: 0.001,
    bevelSegments: 2,
  });
  knobGeo.translate(0, 0, -0.007);
  knobGeo.computeVertexNormals();

  dgStaticCache = {
    bumperBody: mergeNonIndexed(bodyParts),
    bumperRibs: mergeNonIndexed(ribParts),
    bailStand: mergeNonIndexed(bailParts),
    keypadCaps: mergeNonIndexed(capParts),
    bncWell: mergeNonIndexed(wellParts),
    bncChrome: mergeNonIndexed(chromeParts),
    bncPtfe: ptfe,
    bncPin: pin,
    knobFluted: knobGeo,
  };
  return dgStaticCache;
}

function DG1022RotaryKnob({
  pos,
  geo,
  onTurn,
  onPush,
}: {
  pos: [number, number, number];
  geo: THREE.BufferGeometry;
  onTurn: (steps: number) => void;
  onPush: () => void;
}) {
  const ref = useRef<THREE.Group>(null);
  const angleRef = useRef(0);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const lastYRef = useRef(0);
  const accumRef = useRef(0);
  const setHoverLabel = useLabStore((s) => s.setHoverLabel);

  const onTurnRef = useRef(onTurn);
  const onPushRef = useRef(onPush);
  onTurnRef.current = onTurn;
  onPushRef.current = onPush;

  useFrame((_, dt) => {
    if (!ref.current) return;
    const diff = angleRef.current - ref.current.rotation.z;
    if (Math.abs(diff) < 1e-4) return;
    ref.current.rotation.z =
      Math.abs(diff) < 2e-4
        ? angleRef.current
        : THREE.MathUtils.lerp(ref.current.rotation.z, angleRef.current, Math.min(1, dt * 22));
  });

  useEffect(() => {
    const move = (ev: PointerEvent) => {
      if (!draggingRef.current) return;
      const dy = lastYRef.current - ev.clientY;
      lastYRef.current = ev.clientY;
      accumRef.current += dy;
      if (Math.abs(accumRef.current) > 8) {
        movedRef.current = true;
        const s = Math.trunc(accumRef.current / 8);
        accumRef.current -= s * 8;
        angleRef.current -= s * 0.28;
        onTurnRef.current(s);
      }
    };
    const up = () => {
      if (draggingRef.current && !movedRef.current) {
        onPushRef.current();
      }
      draggingRef.current = false;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      hotRefs.knobHovered = false;
    };
  }, []);

  return (
    <group
      ref={ref}
      position={pos}
      name="dg1022_rotary_knob"
      onPointerOver={(e) => {
        if (useLabStore.getState().grabbedEnd) return;
        e.stopPropagation();
        hotRefs.knobHovered = true;
        setHoverLabel('DG1012 Rotary Encoder (Scroll/Drag ubah nilai, Klik konfirmasi)');
        document.body.style.cursor = 'ns-resize';
      }}
      onPointerOut={() => {
        hotRefs.knobHovered = false;
        setHoverLabel(null);
        document.body.style.cursor = 'auto';
      }}
      onPointerDown={(e) => {
        if (useLabStore.getState().grabbedEnd) return;
        e.stopPropagation();
        draggingRef.current = true;
        movedRef.current = false;
        accumRef.current = 0;
        lastYRef.current = e.clientY;
      }}
      onWheel={(e) => {
        e.stopPropagation();
        const step = e.deltaY < 0 ? 1 : -1;
        angleRef.current -= step * 0.28;
        onTurn(step);
      }}
    >
      <mesh geometry={geo}>
        <meshStandardMaterial color="#ebeae4" roughness={0.40} metalness={0.04} />
      </mesh>
      <mesh position={[0, 0, 0.0085]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.0112, 0.0118, 0.0014, 24]} />
        <meshStandardMaterial color="#f5f5f1" roughness={0.34} />
      </mesh>
    </group>
  );
}

function DG1022BncOutputJack({
  socketId,
  gndAliasId,
  label,
  u,
  v,
  staticPack,
}: {
  socketId: string;
  gndAliasId?: string;
  label: string;
  u: number;
  v: number;
  staticPack: DG1022StaticPack;
}) {
  const ref = useRef<THREE.Group>(null);
  const gndShieldRef = useRef<THREE.Object3D>(null);
  const grabbedEnd = useLabStore((s) => s.grabbedEnd);
  const clickSocket = useLabStore((s) => s.clickSocket);
  const setHoverLabel = useLabStore((s) => s.setHoverLabel);
  const [x, y] = uvToXY(u, v);

  useLayoutEffect(() => {
    registerObjectSocket(ref.current, socketId, label, 'bnc', 'z', 0.0155);
    if (gndAliasId && gndShieldRef.current) {
      // Register BNC outer ground shield cleanly for tutorial/legacy gen_gnd compatibility without fake banana jack!
      registerObjectSocket(gndShieldRef.current, gndAliasId, 'DG1022 CH1 BNC GND Shield', 'bnc', 'z', 0.008);
    }
    return () => {
      socketRegistry.unregister(socketId);
      if (gndAliasId) socketRegistry.unregister(gndAliasId);
    };
  }, [socketId, gndAliasId, label]);

  return (
    <group
      ref={ref}
      position={[x, y, 0.0022]}
      name={`dg1022_bnc_${socketId}`}
      onPointerOver={(e) => {
        e.stopPropagation();
        hotRefs.hoveredSocketId = socketId;
        setHoverLabel(grabbedEnd ? label : `${label} BNC (Klik: kabel adaptif)`);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        if (hotRefs.hoveredSocketId === socketId) hotRefs.hoveredSocketId = null;
        setHoverLabel(null);
        document.body.style.cursor = 'auto';
      }}
      onClick={(e) => {
        e.stopPropagation();
        clickSocket(socketId);
      }}
    >
      <mesh geometry={staticPack.bncWell}>
        <meshStandardMaterial color="#b4bac2" roughness={0.48} metalness={0.22} />
      </mesh>
      <mesh geometry={staticPack.bncChrome}>
        <meshStandardMaterial color="#d4dce6" roughness={0.22} metalness={0.90} />
      </mesh>
      <mesh geometry={staticPack.bncPtfe}>
        <meshStandardMaterial color="#f8fafc" roughness={0.38} />
      </mesh>
      <mesh geometry={staticPack.bncPin}>
        <meshStandardMaterial color="#eab308" roughness={0.2} metalness={0.92} />
      </mesh>
      {gndAliasId && <object3D ref={gndShieldRef} position={[0.011, -0.006, 0.002]} />}
    </group>
  );
}

function DG1022Key({
  pos,
  size,
  color,
  tex,
  emissive = '#000000',
  emissiveIntensity = 0,
  round = false,
  hover,
  onClick,
}: {
  pos: [number, number, number];
  size: [number, number, number];
  color: string;
  tex?: THREE.CanvasTexture;
  emissive?: string;
  emissiveIntensity?: number;
  round?: boolean;
  hover: string;
  onClick: () => void;
}) {
  const setHoverLabel = useLabStore((s) => s.setHoverLabel);
  return (
    <group
      position={pos}
      onPointerOver={(e) => {
        if (useLabStore.getState().grabbedEnd) return;
        e.stopPropagation();
        setHoverLabel(hover);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHoverLabel(null);
        document.body.style.cursor = 'auto';
      }}
      onClick={(e) => {
        if (useLabStore.getState().grabbedEnd) return;
        e.stopPropagation();
        labAudio.playButtonClick();
        onClick();
      }}
    >
      {round ? (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[size[0] * 0.5, size[0] * 0.5, size[2], 18]} />
          <meshStandardMaterial
            color={color}
            roughness={0.40}
            emissive={emissive}
            emissiveIntensity={emissiveIntensity}
          />
        </mesh>
      ) : (
        <RoundedBox args={size} radius={0.0014} smoothness={2}>
          <meshStandardMaterial
            color={color}
            roughness={0.40}
            emissive={emissive}
            emissiveIntensity={emissiveIntensity}
          />
        </RoundedBox>
      )}
      {tex && (
        <mesh position={[0, 0, size[2] * 0.52]}>
          <planeGeometry args={[round ? size[0] * 0.68 : size[0] * 0.90, round ? size[0] * 0.68 : size[1] * 0.88]} />
          <meshStandardMaterial
            map={tex}
            roughness={0.42}
            emissive={emissive}
            emissiveIntensity={emissiveIntensity * 0.45}
          />
        </mesh>
      )}
    </group>
  );
}

export function SignalGeneratorMesh({ position = [0.07, 0.78, -0.21] }: { position?: [number, number, number] }) {
  const gen = useLabStore((s) => s.signalGen);
  const updateGen = useLabStore((s) => s.updateSignalGen);
  const setCameraTarget = useLabStore((s) => s.setCameraTarget);
  const setHoverLabel = useLabStore((s) => s.setHoverLabel);

  const [ui, setUi] = useState<DG1022UIState>({
    activeChannel: 1,
    activeTab: 'freq',
    menuMode: 'MAIN',
    showPeriod: false,
    showHiLo: false,
    keypadBuf: '',
    stepMult: 1,
    statusBanner: '',
    counterFreqHz: 0,
  });

  const bannerTimerRef = useRef<number | null>(null);
  const flashBanner = (msg: string) => {
    if (bannerTimerRef.current) window.clearTimeout(bannerTimerRef.current);
    setUi((prev) => ({ ...prev, statusBanner: msg }));
    bannerTimerRef.current = window.setTimeout(() => {
      setUi((prev) => ({ ...prev, statusBanner: '' }));
    }, 1800);
  };

  useEffect(() => () => {
    if (bannerTimerRef.current) window.clearTimeout(bannerTimerRef.current);
  }, []);

  // Poll live hardware Counter frequency while Counter view is active
  useEffect(() => {
    if (ui.menuMode !== 'COUNTER') return;
    const poll = () => {
      const freq = hotRefs.scopeFrame?.measurements.values.Freq ?? (gen.outputEnabled ? gen.freqHz : 0);
      setUi((prev) => (Math.abs(prev.counterFreqHz - freq) > 0.05 ? { ...prev, counterFreqHz: freq } : prev));
    };
    poll();
    const t = window.setInterval(poll, 300);
    return () => clearInterval(t);
  }, [ui.menuMode, gen.freqHz, gen.outputEnabled]);

  const faceplateGeo = useMemo(() => getDG1022FaceplateGeometry(), []);
  const staticPack = useMemo(() => getMergedDG1022StaticParts(), []);
  const frontTex = useMemo(() => getDG1022FrontPanelTexture(), []);
  const keypadTex = useMemo(() => getDG1022KeypadOverlayTexture(), []);
  const sideTex = useMemo(() => getDM3058SideTexture(), []);
  const rearTex = useMemo(() => getDM3058RearTexture(), []);
  const grainRough = useMemo(() => getChassisGrainRoughnessMap(), []);

  const [{ lcdCanvas, lcdCtx, lcdTex }] = useState(() => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    return { lcdCanvas: c, lcdCtx: ctx, lcdTex: t };
  });

  useEffect(() => () => lcdTex.dispose(), [lcdTex]);

  const lcdKey = `${gen.power}_${gen.outputEnabled}_${gen.waveform}_${gen.freqHz}_${gen.vpp}_${gen.dcOffset}_${gen.dutyPct}_${gen.attenuator20dB}_${gen.phaseDeg}_${gen.loadMode}_${gen.inverted}_${gen.modMode}_${gen.ch2OutputEnabled}_${gen.ch2Waveform}_${gen.ch2FreqHz}_${gen.ch2Vpp}_${gen.ch2DcOffset}_${gen.ch2DutyPct}_${gen.ch2PhaseDeg}_${gen.ch2LoadMode}_${gen.ch2Inverted}_${ui.activeChannel}_${ui.activeTab}_${ui.menuMode}_${ui.showPeriod}_${ui.showHiLo}_${ui.keypadBuf}_${ui.statusBanner}_${ui.counterFreqHz.toFixed(1)}`;
  useEffect(() => {
    renderDG1022LCD(lcdCtx, gen, ui);
    lcdTex.needsUpdate = true;
  }, [lcdKey, lcdCanvas, lcdCtx, lcdTex, gen, ui]);

  const isCh1 = ui.activeChannel === 1;
  const activeWave: WaveformShape = isCh1 ? gen.waveform : (gen.ch2Waveform ?? 'triangle');
  const activeFreq = isCh1 ? gen.freqHz : (gen.ch2FreqHz ?? 1500);
  const activeVpp = isCh1 ? gen.vpp : (gen.ch2Vpp ?? 4.0);
  const activeOffset = isCh1 ? gen.dcOffset : (gen.ch2DcOffset ?? 0);
  const activeDuty = isCh1 ? gen.dutyPct : (gen.ch2DutyPct ?? 50);
  const activePhase = isCh1 ? (gen.phaseDeg ?? 0) : (gen.ch2PhaseDeg ?? 0);
  const activeLoad = (isCh1 ? gen.loadMode : gen.ch2LoadMode) ?? 'HighZ';
  const activeMaxVpp = activeLoad === '50ohm' ? 10 : 20;

  const patchActiveChannel = (patch: {
    waveform?: WaveformShape;
    freqHz?: number;
    vpp?: number;
    dcOffset?: number;
    dutyPct?: number;
    phaseDeg?: number;
    loadMode?: 'HighZ' | '50ohm';
    inverted?: boolean;
  }) => {
    if (ui.activeChannel === 1) {
      updateGen(patch);
    } else {
      updateGen({
        ...(patch.waveform !== undefined ? { ch2Waveform: patch.waveform } : {}),
        ...(patch.freqHz !== undefined ? { ch2FreqHz: patch.freqHz } : {}),
        ...(patch.vpp !== undefined ? { ch2Vpp: patch.vpp } : {}),
        ...(patch.dcOffset !== undefined ? { ch2DcOffset: patch.dcOffset } : {}),
        ...(patch.dutyPct !== undefined ? { ch2DutyPct: patch.dutyPct } : {}),
        ...(patch.phaseDeg !== undefined ? { ch2PhaseDeg: patch.phaseDeg } : {}),
        ...(patch.loadMode !== undefined ? { ch2LoadMode: patch.loadMode } : {}),
        ...(patch.inverted !== undefined ? { ch2Inverted: patch.inverted } : {}),
      });
    }
  };

  const commitKeypadWithUnit = (unitSlotIdx: number) => {
    const raw = ui.keypadBuf;
    setUi((prev) => ({ ...prev, keypadBuf: '' }));
    if (unitSlotIdx === 4 || !raw) return; // Esc / Cancel
    const val = Number.parseFloat(raw);
    if (!Number.isFinite(val)) return;
    const maxF = maxFreqForDG1012(activeWave, activeDuty);

    if (ui.activeTab === 'freq') {
      if (ui.showPeriod) {
        const mults = [1, 1e-3, 1e-6, 1e-9];
        const sec = Math.max(1 / maxF, Math.abs(val) * (mults[unitSlotIdx] ?? 1e-3));
        patchActiveChannel({ freqHz: Math.min(maxF, Math.max(1e-3, Number((1 / sec).toPrecision(5)))) });
      } else {
        const mults = [1e6, 1e3, 1, 1e-3];
        const hz = Math.abs(val) * (mults[unitSlotIdx] ?? 1e3);
        patchActiveChannel({ freqHz: Math.min(maxF, Math.max(1e-3, hz)) });
      }
    } else if (ui.activeTab === 'ampl') {
      const mults = [1, 1e-3, 2 * Math.SQRT2, 2 * Math.SQRT2 * 1e-3]; // Vpp, mVpp, Vrms, mVrms
      const vpp = Math.abs(val) * (mults[unitSlotIdx] ?? 1);
      if (ui.showHiLo) {
        const lo = activeOffset - activeVpp / 2;
        const hi = Math.min(activeMaxVpp / 2, Math.max(lo + 0.01, val * (unitSlotIdx === 1 ? 1e-3 : 1)));
        patchActiveChannel({ vpp: Number((hi - lo).toFixed(3)), dcOffset: Number(((hi + lo) / 2).toFixed(3)) });
      } else {
        patchActiveChannel({ vpp: Math.min(activeMaxVpp, Math.max(0.004, Number(vpp.toFixed(4)))) });
      }
    } else if (ui.activeTab === 'offset') {
      if (unitSlotIdx === 2) {
        patchActiveChannel({ dcOffset: 0 });
      } else if (unitSlotIdx === 3) {
        patchActiveChannel({ inverted: !(isCh1 ? gen.inverted : gen.ch2Inverted) });
      } else {
        const vdc = val * (unitSlotIdx === 1 ? 1e-3 : 1);
        patchActiveChannel({ dcOffset: Math.min(10, Math.max(-10, Number(vdc.toFixed(4)))) });
      }
    } else if (ui.activeTab === 'duty') {
      if (activeWave === 'square' || activeWave === 'triangle') {
        const pct = unitSlotIdx === 1 ? 50 : val;
        patchActiveChannel({ dutyPct: Math.min(90, Math.max(10, Number(pct.toFixed(1)))) });
      } else {
        const deg = unitSlotIdx === 2 ? 0 : unitSlotIdx === 3 ? 90 : val;
        patchActiveChannel({ phaseDeg: ((deg + 180) % 360 + 360) % 360 - 180 });
      }
    }
  };

  const handleRotaryTurn = (steps: number) => {
    if (!gen.power || steps === 0) return;
    labAudio.playKnobDetent();
    const maxF = maxFreqForDG1012(activeWave, activeDuty);
    if (ui.activeTab === 'freq') {
      const ratio = ui.stepMult >= 10 ? 1.5 : ui.stepMult <= 0.1 ? 1.02 : 1.12;
      const factor = steps > 0 ? Math.pow(ratio, steps) : Math.pow(1 / ratio, -steps);
      patchActiveChannel({ freqHz: Math.min(maxF, Math.max(1, Number((activeFreq * factor).toPrecision(4)))) });
    } else if (ui.activeTab === 'ampl') {
      const stepV = ui.stepMult <= 0.1 ? 0.05 : ui.stepMult >= 10 ? 1.0 : 0.25;
      patchActiveChannel({
        vpp: Math.min(activeMaxVpp, Math.max(0.05, Number((activeVpp + steps * stepV).toFixed(2)))),
      });
    } else if (ui.activeTab === 'offset') {
      const stepV = ui.stepMult <= 0.1 ? 0.05 : 0.25;
      patchActiveChannel({
        dcOffset: Math.min(10, Math.max(-10, Number((activeOffset + steps * stepV).toFixed(2)))),
      });
    } else if (ui.activeTab === 'duty') {
      if (activeWave === 'square' || activeWave === 'triangle') {
        patchActiveChannel({ dutyPct: Math.min(90, Math.max(10, Math.round(activeDuty + steps * 2))) });
      } else {
        const nextDeg = activePhase + steps * (ui.stepMult >= 10 ? 15 : 5);
        patchActiveChannel({ phaseDeg: Math.max(-180, Math.min(180, Math.round(nextDeg))) });
      }
    }
  };

  const handleSoftkeyPress = (slotIdx: number) => {
    if (!gen.power) return;
    if (ui.keypadBuf.length > 0) {
      commitKeypadWithUnit(slotIdx);
      return;
    }
    if (ui.menuMode === 'UTILITY') {
      if (slotIdx === 0) {
        const nextLoad = activeLoad === '50ohm' ? 'HighZ' : '50ohm';
        patchActiveChannel({ loadMode: nextLoad });
        flashBanner(`CH${ui.activeChannel} Load: ${nextLoad}`);
      } else if (slotIdx === 1) {
        const nextInv = !(isCh1 ? gen.inverted : gen.ch2Inverted);
        patchActiveChannel({ inverted: nextInv });
        flashBanner(`Polarity: ${nextInv ? 'Inverted' : 'Normal'}`);
      } else if (slotIdx === 2) {
        updateGen({
          ch2Waveform: gen.waveform,
          ch2FreqHz: gen.freqHz,
          ch2Vpp: gen.vpp,
          ch2DcOffset: gen.dcOffset,
          ch2DutyPct: gen.dutyPct,
          ch2PhaseDeg: gen.phaseDeg ?? 0,
          ch2LoadMode: gen.loadMode ?? 'HighZ',
        });
        flashBanner('Copied CH1 → CH2');
      } else if (slotIdx === 3) {
        setUi((prev) => ({ ...prev, menuMode: 'COUNTER' }));
      } else {
        setUi((prev) => ({ ...prev, menuMode: 'MAIN' }));
      }
      return;
    }
    if (ui.menuMode === 'STORE') {
      try {
        const raw = localStorage.getItem(DG1012_STORE_KEY);
        const all = raw ? (JSON.parse(raw) as Record<string, Partial<typeof gen>>) : {};
        if (slotIdx === 0 || slotIdx === 2) {
          const slot = slotIdx === 0 ? '1' : '2';
          all[slot] = { ...gen };
          localStorage.setItem(DG1012_STORE_KEY, JSON.stringify(all));
          flashBanner(`Saved Slot ${slot}`);
        } else if (slotIdx === 1 || slotIdx === 3) {
          const slot = slotIdx === 1 ? '1' : '2';
          if (all[slot]) {
            updateGen(all[slot]);
            flashBanner(`Recalled Slot ${slot}`);
          } else {
            flashBanner(`Slot ${slot} Empty`);
          }
        }
      } catch {
        // ignore storage errors
      }
      if (slotIdx >= 4) setUi((prev) => ({ ...prev, menuMode: 'MAIN' }));
      return;
    }
    if (ui.menuMode === 'COUNTER' || ui.menuMode === 'HELP') {
      if (slotIdx >= 4) setUi((prev) => ({ ...prev, menuMode: 'MAIN' }));
      return;
    }

    // MAIN menu softkeys matching exact Rigol DG1012 User's Guide
    const tabOrder: DG1022ParamTab[] = ['freq', 'ampl', 'offset', 'duty', 'load'];
    const targetTab = tabOrder[Math.min(4, slotIdx)];
    if (slotIdx === 0) {
      setUi((prev) => ({
        ...prev,
        menuMode: 'MAIN',
        activeTab: 'freq',
        showPeriod: prev.activeTab === 'freq' ? !prev.showPeriod : prev.showPeriod,
      }));
    } else if (slotIdx === 1 || slotIdx === 2) {
      setUi((prev) => ({
        ...prev,
        menuMode: 'MAIN',
        activeTab: targetTab,
        showHiLo: prev.activeTab === targetTab ? !prev.showHiLo : prev.showHiLo,
      }));
    } else if (slotIdx === 3) {
      setUi((prev) => ({ ...prev, menuMode: 'MAIN', activeTab: 'duty' }));
    } else if (slotIdx === 4) {
      // AligPha: synchronize CH1 & CH2 phase to 0.0°
      updateGen({ phaseDeg: 0, ch2PhaseDeg: 0 });
      flashBanner('AligPha: 0.0° Sync');
    } else {
      setUi((prev) => ({ ...prev, menuMode: 'MAIN' }));
    }
  };

  const handleKeypadClick = (e: ThreeEvent<MouseEvent>) => {
    if (useLabStore.getState().grabbedEnd) return;
    e.stopPropagation();
    if (!e.uv || !gen.power) return;
    labAudio.playButtonClick();
    const u = e.uv.x;
    const v = 1 - e.uv.y; // 0 = top, 1 = bottom
    if (v < 0.45) {
      // Upper 2x3 Utility / Modulation keys (Mod | Store/Recall / Sweep | Utility / Burst | Help)
      const row = Math.min(2, Math.floor((v / 0.45) * 3));
      const col = u < 0.5 ? 0 : 1;
      if (row === 0 && col === 0) {
        // Mod: cycle OFF -> AM -> FM -> OFF
        const nextMod: SignalGenModMode =
          gen.modMode === 'AM' ? 'FM' : gen.modMode === 'FM' ? 'OFF' : 'AM';
        updateGen({ modMode: nextMod });
        flashBanner(`Modulation: ${nextMod}`);
      } else if (row === 0 && col === 1) {
        setUi((prev) => ({ ...prev, menuMode: prev.menuMode === 'STORE' ? 'MAIN' : 'STORE', keypadBuf: '' }));
      } else if (row === 1 && col === 0) {
        const nextMod: SignalGenModMode = gen.modMode === 'SWEEP' ? 'OFF' : 'SWEEP';
        updateGen({ modMode: nextMod });
        flashBanner(`Sweep: ${nextMod === 'SWEEP' ? 'ON' : 'OFF'}`);
      } else if (row === 1 && col === 1) {
        setUi((prev) => ({ ...prev, menuMode: prev.menuMode === 'UTILITY' ? 'MAIN' : 'UTILITY', keypadBuf: '' }));
      } else if (row === 2 && col === 0) {
        const nextMod: SignalGenModMode = gen.modMode === 'BURST' ? 'OFF' : 'BURST';
        updateGen({ modMode: nextMod });
        flashBanner(`Burst: ${nextMod === 'BURST' ? '3-Cyc ON' : 'OFF'}`);
      } else if (row === 2 && col === 1) {
        setUi((prev) => ({ ...prev, menuMode: prev.menuMode === 'HELP' ? 'MAIN' : 'HELP', keypadBuf: '' }));
      }
      return;
    }
    // Lower 3x4 numeric keypad
    const numKeys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '.', '+/-'];
    const row = Math.min(3, Math.max(0, Math.floor(((v - 0.48) / 0.52) * 4)));
    const col = Math.min(2, Math.max(0, Math.floor(u * 3)));
    const key = numKeys[row * 3 + col];
    if (!key) return;
    setUi((prev) => {
      if (key === '+/-') {
        const nextBuf = prev.keypadBuf.startsWith('-') ? prev.keypadBuf.slice(1) : `-${prev.keypadBuf}`;
        return { ...prev, menuMode: 'MAIN', keypadBuf: nextBuf };
      }
      if (key === '.' && prev.keypadBuf.includes('.')) return prev;
      if (prev.keypadBuf.length >= 7) return prev;
      return { ...prev, menuMode: 'MAIN', keypadBuf: prev.keypadBuf + key };
    });
  };

  // LCD center matching hollow bezel window u=[0.130..0.562], v=[0.198..0.514]
  const lcdX = ((0.130 + 0.562) / 2 - 0.5) * W;
  const lcdY = (0.5 - (0.198 + 0.514) / 2) * H;
  const lcdW = (0.562 - 0.130) * W + 0.0024;
  const lcdH = (0.514 - 0.198) * H + 0.0014;

  const [usbX, usbY] = uvToXY(0.058, 0.365);
  const [knobX, knobY] = uvToXY(0.858, 0.228);

  const softkeyUs = [0.168, 0.239, 0.310, 0.381, 0.452, 0.523] as const;
  const softkeyLabels = getDG1012SoftkeyLabels(gen, ui);

  const isSine = gen.power && activeWave === 'sine';
  const isSquare = gen.power && activeWave === 'square' && activeDuty === 50;
  const isRamp = gen.power && activeWave === 'triangle';
  const isPulse = gen.power && activeWave === 'square' && activeDuty !== 50;
  const isNoise = gen.power && activeWave === 'noise';
  const isArb = gen.power && activeWave === 'arb';

  return (
    <group
      position={[position[0], position[1] + H * 0.5 + 0.011, position[2]]}
      rotation={[0, -0.05, 0]}
      name="signal_generator_root"
      onDoubleClick={(e) => {
        if (useLabStore.getState().grabbedEnd) return;
        e.stopPropagation();
        setCameraTarget('gen');
      }}
    >
      {/* Authentic Rigol DG1022 upward stand tilt matching photo & sibling DM3058 */}
      <group rotation={[-0.12, 0, 0]}>
        {/* Main Light-Gray Molded 2U Chassis Enclosure */}
        <RoundedBox args={[W - 0.004, H - 0.004, D - 0.006]} radius={0.004} smoothness={3}>
          <meshStandardMaterial color="#e2e4e8" roughness={0.54} roughnessMap={grainRough} />
        </RoundedBox>

        {/* Side Cooling Louvers & Rear Plate */}
        <mesh position={[-(W / 2 - 0.0015), 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[D - 0.032, H - 0.014]} />
          <meshStandardMaterial map={sideTex} roughness={0.62} />
        </mesh>
        <mesh position={[W / 2 - 0.0015, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[D - 0.032, H - 0.014]} />
          <meshStandardMaterial map={sideTex} roughness={0.62} />
        </mesh>
        <mesh position={[0, 0, -D / 2 - 0.0005]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[W - 0.012, H - 0.012]} />
          <meshStandardMaterial map={rearTex} roughness={0.58} />
        </mesh>

        {/* Merged 8 Ribbed Rubber Corner Bumpers + Pivoting Bail Tilt Stand (3 draw calls total!) */}
        <mesh geometry={staticPack.bumperBody}>
          <meshStandardMaterial color="#878b91" roughness={0.76} />
        </mesh>
        <mesh geometry={staticPack.bumperRibs}>
          <meshStandardMaterial color="#767a80" roughness={0.80} />
        </mesh>
        <mesh geometry={staticPack.bailStand}>
          <meshStandardMaterial color="#585c62" roughness={0.58} />
        </mesh>

        {/* Front Faceplate Assembly */}
        <group position={[0, 0, FRONT_Z]}>
          {/* Single sculpted UV-mapped bezel mesh with hollow 3D LCD opening */}
          <mesh geometry={faceplateGeo}>
            <meshStandardMaterial map={frontTex} roughness={0.48} roughnessMap={grainRough} />
          </mesh>

          {/* Live 256x64 Cool-Blue Dot-Matrix LCD cleanly recessed behind sloped cavity */}
          <mesh position={[lcdX, lcdY, -0.0016]}>
            <planeGeometry args={[lcdW, lcdH]} />
            <meshStandardMaterial
              map={lcdTex}
              emissiveMap={gen.power ? lcdTex : undefined}
              emissive={gen.power ? '#cdeeff' : '#000000'}
              emissiveIntensity={gen.power ? 0.56 : 0}
              roughness={0.22}
              metalness={0.04}
            />
          </mesh>

          {/* Recessed Front USB Host Port (left of LCD matching DG1022 photo) */}
          <group position={[usbX, usbY, 0.0036]}>
            <mesh>
              <boxGeometry args={[0.009, 0.019, 0.0014]} />
              <meshStandardMaterial color="#272c34" roughness={0.62} />
            </mesh>
            <mesh position={[0.0015, 0, 0.0008]}>
              <boxGeometry args={[0.0024, 0.013, 0.0012]} />
              <meshStandardMaterial color="#cbd5e1" roughness={0.3} metalness={0.8} />
            </mesh>
          </group>

          {/* Merged 3D Utility (2x3) + Numeric Keypad (3x4) keycaps + Interactive UV overlay */}
          <mesh geometry={staticPack.keypadCaps}>
            <meshStandardMaterial color="#f1f5f9" roughness={0.42} />
          </mesh>
          <mesh
            position={[uvToXY(0.694, 0.510)[0], uvToXY(0.694, 0.510)[1], 0.0056]}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHoverLabel('DG1022 Keypad & Utility (Klik angka lalu klik Rotary/Softkey)');
              document.body.style.cursor = 'pointer';
            }}
            onPointerOut={() => {
              setHoverLabel(null);
              document.body.style.cursor = 'auto';
            }}
            onClick={handleKeypadClick}
          >
            <planeGeometry args={[0.042, 0.091]} />
            <meshStandardMaterial map={keypadTex} transparent roughness={0.44} />
          </mesh>

          {/* View Button (left side below USB: toggles full-parameter View & closes menus) */}
          <DG1022Key
            pos={[uvToXY(0.064, 0.625)[0], uvToXY(0.064, 0.625)[1], 0.0044]}
            size={[0.011, 0.0076, 0.0034]}
            color="#e7eaef"
            tex={getDG1022WaveKeyTexture('View', 'view', '#eef1f5')}
            hover="View (Tampilkan semua parameter CH / kembali)"
            onClick={() =>
              setUi((prev) => ({
                ...prev,
                keypadBuf: '',
                menuMode: prev.menuMode === 'VIEW' ? 'MAIN' : 'VIEW',
              }))
            }
          />

          {/* 6 Slate-Blue Softkeys directly under the LCD (context-sensitive per DG1012 manual!) */}
          {softkeyUs.map((su, i) => {
            const tabOrder: DG1022ParamTab[] = ['freq', 'ampl', 'offset', 'duty', 'load'];
            const lbl = i < 5 ? softkeyLabels[i] : 'Done / Kembali';
            const isSelected = ui.menuMode === 'MAIN' && ui.keypadBuf.length === 0 && i < 5 && ui.activeTab === tabOrder[i];
            return (
              <DG1022Key
                key={i}
                pos={[uvToXY(su, 0.625)[0], uvToXY(su, 0.625)[1], 0.0046]}
                size={[0.0128, 0.0066, 0.0038]}
                color={isSelected ? '#5b82a8' : '#7599be'}
                hover={`DG1012 Softkey ${i + 1}: ${lbl}`}
                onClick={() => handleSoftkeyPress(i)}
              />
            );
          })}

          {/* Bottom-Left Round Illuminated Power Button */}
          <DG1022Key
            pos={[uvToXY(0.064, 0.838)[0], uvToXY(0.064, 0.838)[1], 0.0046]}
            size={[0.0124, 0.0124, 0.0042]}
            color={gen.power ? '#f3ea8e' : '#c8cdd4'}
            tex={getDG1022WaveKeyTexture('PWR', 'power', gen.power ? '#f3ea8e' : '#c8cdd4')}
            emissive={gen.power ? '#e8df6b' : '#000000'}
            emissiveIntensity={gen.power ? 0.55 : 0}
            round
            hover={`DG1012 Power (${gen.power ? 'ON' : 'OFF'})`}
            onClick={() => updateGen({ power: !gen.power })}
          />

          {/* 7 Bottom Waveform & CH1/CH2 Keys (exact DG1012 row — controls active CH1 or CH2!) */}
          <DG1022Key
            pos={[uvToXY(0.165, 0.838)[0], uvToXY(0.165, 0.838)[1], 0.0046]}
            size={[0.0128, 0.0112, 0.0040]}
            color={isSine ? '#f7ea94' : '#e8ecf1'}
            tex={getDG1022WaveKeyTexture('Sine', 'sine', isSine ? '#f7ea94' : '#eef1f5')}
            emissive={isSine ? '#f4df56' : '#000000'}
            emissiveIntensity={isSine ? 0.45 : 0}
            hover={`CH${ui.activeChannel} Waveform: Sine (1µHz – 15MHz)`}
            onClick={() => {
              patchActiveChannel({ waveform: 'sine', dutyPct: 50 });
              setUi((prev) => ({ ...prev, menuMode: 'MAIN', keypadBuf: '' }));
            }}
          />
          <DG1022Key
            pos={[uvToXY(0.232, 0.838)[0], uvToXY(0.232, 0.838)[1], 0.0046]}
            size={[0.0128, 0.0112, 0.0040]}
            color={isSquare ? '#f7ea94' : '#e8ecf1'}
            tex={getDG1022WaveKeyTexture('Square', 'square', isSquare ? '#f7ea94' : '#eef1f5')}
            emissive={isSquare ? '#f4df56' : '#000000'}
            emissiveIntensity={isSquare ? 0.45 : 0}
            hover={`CH${ui.activeChannel} Waveform: Square (1µHz – 4MHz)`}
            onClick={() => {
              patchActiveChannel({ waveform: 'square', dutyPct: 50, freqHz: Math.min(activeFreq, 4_000_000) });
              setUi((prev) => ({ ...prev, menuMode: 'MAIN', keypadBuf: '' }));
            }}
          />
          <DG1022Key
            pos={[uvToXY(0.299, 0.838)[0], uvToXY(0.299, 0.838)[1], 0.0046]}
            size={[0.0128, 0.0112, 0.0040]}
            color={isRamp ? '#f7ea94' : '#e8ecf1'}
            tex={getDG1022WaveKeyTexture('Ramp', 'ramp', isRamp ? '#f7ea94' : '#eef1f5')}
            emissive={isRamp ? '#f4df56' : '#000000'}
            emissiveIntensity={isRamp ? 0.45 : 0}
            hover={`CH${ui.activeChannel} Waveform: Ramp / Triangle (1µHz – 150kHz)`}
            onClick={() => {
              patchActiveChannel({ waveform: 'triangle', freqHz: Math.min(activeFreq, 150_000) });
              setUi((prev) => ({ ...prev, menuMode: 'MAIN', keypadBuf: '' }));
            }}
          />
          <DG1022Key
            pos={[uvToXY(0.366, 0.838)[0], uvToXY(0.366, 0.838)[1], 0.0046]}
            size={[0.0128, 0.0112, 0.0040]}
            color={isPulse ? '#f7ea94' : '#e8ecf1'}
            tex={getDG1022WaveKeyTexture('Pulse', 'pulse', isPulse ? '#f7ea94' : '#eef1f5')}
            emissive={isPulse ? '#f4df56' : '#000000'}
            emissiveIntensity={isPulse ? 0.45 : 0}
            hover={`CH${ui.activeChannel} Waveform: Pulse (20% Duty, max 2MHz)`}
            onClick={() => {
              patchActiveChannel({ waveform: 'square', dutyPct: 20, freqHz: Math.min(activeFreq, 2_000_000) });
              setUi((prev) => ({ ...prev, menuMode: 'MAIN', keypadBuf: '' }));
            }}
          />
          <DG1022Key
            pos={[uvToXY(0.433, 0.838)[0], uvToXY(0.433, 0.838)[1], 0.0046]}
            size={[0.0128, 0.0112, 0.0040]}
            color={isNoise ? '#f7ea94' : '#e8ecf1'}
            tex={getDG1022WaveKeyTexture('Noise', 'noise', isNoise ? '#f7ea94' : '#eef1f5')}
            emissive={isNoise ? '#f4df56' : '#000000'}
            emissiveIntensity={isNoise ? 0.45 : 0}
            hover={`CH${ui.activeChannel} Waveform: White Noise (5MHz BW)`}
            onClick={() => {
              patchActiveChannel({ waveform: 'noise' });
              setUi((prev) => ({ ...prev, menuMode: 'MAIN', keypadBuf: '' }));
            }}
          />
          <DG1022Key
            pos={[uvToXY(0.500, 0.838)[0], uvToXY(0.500, 0.838)[1], 0.0046]}
            size={[0.0128, 0.0112, 0.0040]}
            color={isArb ? '#f7ea94' : '#e8ecf1'}
            tex={getDG1022WaveKeyTexture('Arb', 'arb', isArb ? '#f7ea94' : '#eef1f5')}
            emissive={isArb ? '#f4df56' : '#000000'}
            emissiveIntensity={isArb ? 0.45 : 0}
            hover={`CH${ui.activeChannel} Waveform: Arb (Sinc Built-in)`}
            onClick={() => {
              patchActiveChannel({ waveform: 'arb', freqHz: Math.min(activeFreq, 4_000_000) });
              setUi((prev) => ({ ...prev, menuMode: 'MAIN', keypadBuf: '' }));
            }}
          />
          <DG1022Key
            pos={[uvToXY(0.564, 0.838)[0], uvToXY(0.564, 0.838)[1], 0.0046]}
            size={[0.0118, 0.0112, 0.0040]}
            color="#dfe6f0"
            tex={getDG1022WaveKeyTexture('CH1/CH2', 'ch', '#e6ecf4')}
            hover="Switch Active Channel CH1 / CH2"
            onClick={() =>
              setUi((prev) => ({ ...prev, activeChannel: prev.activeChannel === 1 ? 2 : 1, keypadBuf: '' }))
            }
          />

          {/* Big Cream-White Fluted Rotary Encoder Knob */}
          <DG1022RotaryKnob
            pos={[knobX, knobY, 0.0095]}
            geo={staticPack.knobFluted}
            onTurn={handleRotaryTurn}
            onPush={() => {
              labAudio.playButtonClick();
              if (ui.keypadBuf) commitKeypadWithUnit(ui.activeTab === 'freq' ? 1 : 0);
            }}
          />

          {/* Left (<) and Right (>) Step-Multiplier Click Zones flanking rotary knob */}
          <mesh
            position={[uvToXY(0.782, 0.376)[0], uvToXY(0.782, 0.376)[1], 0.0035]}
            onPointerOver={(e) => {
              if (useLabStore.getState().grabbedEnd) return;
              e.stopPropagation();
              setHoverLabel('Step Lebih Kasar (◀)');
              document.body.style.cursor = 'pointer';
            }}
            onPointerOut={() => {
              setHoverLabel(null);
              document.body.style.cursor = 'auto';
            }}
            onClick={(e) => {
              if (useLabStore.getState().grabbedEnd) return;
              e.stopPropagation();
              labAudio.playButtonClick();
              setUi((prev) => ({ ...prev, stepMult: Math.min(10, prev.stepMult * 10) }));
            }}
          >
            <planeGeometry args={[0.014, 0.014]} />
            <meshBasicMaterial transparent opacity={0} />
          </mesh>
          <mesh
            position={[uvToXY(0.930, 0.376)[0], uvToXY(0.930, 0.376)[1], 0.0035]}
            onPointerOver={(e) => {
              if (useLabStore.getState().grabbedEnd) return;
              e.stopPropagation();
              setHoverLabel('Step Lebih Halus (▶)');
              document.body.style.cursor = 'pointer';
            }}
            onPointerOut={() => {
              setHoverLabel(null);
              document.body.style.cursor = 'auto';
            }}
            onClick={(e) => {
              if (useLabStore.getState().grabbedEnd) return;
              e.stopPropagation();
              labAudio.playButtonClick();
              setUi((prev) => ({ ...prev, stepMult: Math.max(0.1, prev.stepMult / 10) }));
            }}
          >
            <planeGeometry args={[0.014, 0.014]} />
            <meshBasicMaterial transparent opacity={0} />
          </mesh>

          {/* Dual Vertical Illuminated Amber-Orange Output Buttons (CH2 top, CH1 bottom — wired live to MNA!) */}
          <DG1022Key
            pos={[uvToXY(0.810, 0.585)[0], uvToXY(0.810, 0.585)[1], 0.0046]}
            size={[0.0092, 0.0195, 0.0042]}
            color={gen.power && gen.ch2OutputEnabled ? '#f59e0b' : '#f3c669'}
            tex={getDG1022WaveKeyTexture(
              'OUT2',
              'output',
              gen.power && gen.ch2OutputEnabled ? '#f59e0b' : '#f5d488',
              '#1e293b'
            )}
            emissive={gen.power && gen.ch2OutputEnabled ? '#f59e0b' : '#d97706'}
            emissiveIntensity={gen.power && gen.ch2OutputEnabled ? 0.78 : 0.14}
            hover={`DG1012 CH2 Output (${gen.ch2OutputEnabled ? 'ON' : 'OFF'})`}
            onClick={() => updateGen({ ch2OutputEnabled: !gen.ch2OutputEnabled })}
          />
          <DG1022Key
            pos={[uvToXY(0.810, 0.812)[0], uvToXY(0.810, 0.812)[1], 0.0046]}
            size={[0.0092, 0.0195, 0.0042]}
            color={gen.power && gen.outputEnabled ? '#f59e0b' : '#f3c669'}
            tex={getDG1022WaveKeyTexture(
              'OUT1',
              'output',
              gen.power && gen.outputEnabled ? '#f59e0b' : '#f5d488',
              '#1e293b'
            )}
            emissive={gen.power && gen.outputEnabled ? '#f59e0b' : '#d97706'}
            emissiveIntensity={gen.power && gen.outputEnabled ? 0.82 : 0.14}
            hover={`DG1012 CH1 Output (${gen.outputEnabled ? 'ON' : 'OFF'})`}
            onClick={() => updateGen({ outputEnabled: !gen.outputEnabled })}
          />

          {/* Dual Authentic Recessed Bayonet BNC Output Ports (Top: CH2/Counter, Bottom: CH1 = gen_out) */}
          <DG1022BncOutputJack
            socketId="gen_ch2_out"
            label="DG1012 CH2/Counter"
            u={0.900}
            v={0.585}
            staticPack={staticPack}
          />
          <DG1022BncOutputJack
            socketId="gen_out"
            gndAliasId="gen_gnd"
            label="DG1012 CH1 OUT"
            u={0.900}
            v={0.812}
            staticPack={staticPack}
          />
        </group>
      </group>
    </group>
  );
}
