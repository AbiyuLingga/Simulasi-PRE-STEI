import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { RoundedBox } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  LCD_H,
  LCD_W,
  RigolLCDRenderer,
  exportScopeCSV,
  exportScopePNG,
} from '../../instruments/ds1000e/lcdRenderer';
import { HELP_TEXT_MAP } from '../../instruments/ds1000e/state';
import { hotRefs } from '../../state/hotRefs';
import { scopeExportHooks, useLabStore } from '../../state/labStore';
import { registerObjectSocket, socketRegistry } from '../cables/socketRegistry';
import {
  getButtonLabelTexture,
  getChassisGrainRoughnessMap,
  getRigolFrontPanelTexture,
  getRigolRearTexture,
} from '../textures/proceduralTextures';

const W = 0.303;
const H = 0.146;
const D = 0.122;

type KnobId = 'VERT_POS' | 'VERT_SCALE' | 'HORIZ_POS' | 'HORIZ_SCALE' | 'TRIG_LEVEL' | 'MULTI';

const knobGeoCache = new Map<string, THREE.BufferGeometry>();
let faceplateGeoCache: THREE.BufferGeometry | null = null;

/**
 * Build single sculpted UV-mapped front faceplate with real 3D sloped screen funnel,
 * hollow LCD cutout (zero occlusion/z-fighting), vertical parting groove, and flat fascia.
 */
function getDS1052EFaceplateGeometry(): THREE.BufferGeometry {
  if (faceplateGeoCache) return faceplateGeoCache;

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

    // CCW winding looking from +Z: TL -> BL -> BR and TL -> BR -> TR
    positions.push(
      x0, yTop, z00,
      x0, yBot, z01,
      x1, yBot, z11,
      x0, yTop, z00,
      x1, yBot, z11,
      x1, yTop, z10
    );
    uvs.push(
      u0, 1 - v0,
      u0, 1 - v1,
      u1, 1 - v1,
      u0, 1 - v0,
      u1, 1 - v1,
      u1, 1 - v0
    );
  };

  // Left sculpted shell with sloped screen cavity
  const usLeft = [0.008, 0.066, 0.0995, 0.5045, 0.538, 0.606];
  const vs = [0.012, 0.144, 0.180, 0.780, 0.814, 0.988];
  const zLeftAt = (iu: number, iv: number) => {
    const innerU = iu === 2 || iu === 3;
    const innerV = iv === 2 || iv === 3;
    return innerU && innerV ? 0.0002 : 0.0038;
  };

  for (let iu = 0; iu < usLeft.length - 1; iu++) {
    for (let iv = 0; iv < vs.length - 1; iv++) {
      // Leave inner LCD window genuinely hollow!
      if (iu === 2 && iv === 2) continue;
      pushQuad(
        usLeft[iu],
        vs[iv],
        zLeftAt(iu, iv),
        usLeft[iu + 1],
        vs[iv + 1],
        zLeftAt(iu, iv + 1),
        zLeftAt(iu + 1, iv + 1),
        zLeftAt(iu + 1, iv)
      );
    }
  }

  // Vertical parting groove (0.606 -> 0.608 -> 0.610)
  pushQuad(0.606, 0.012, 0.0038, 0.608, 0.988, 0.0038, 0.0008, 0.0008);
  pushQuad(0.608, 0.012, 0.0008, 0.610, 0.988, 0.0008, 0.0020, 0.0020);

  // Right polycarbonate fascia deck
  pushQuad(0.610, 0.012, 0.0020, 0.992, 0.988, 0.0020, 0.0020, 0.0020);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  faceplateGeoCache = geo;
  return geo;
}

function getScallopedKnobGeometry(radius: number, depth: number, lobes: number): THREE.BufferGeometry {
  const key = `${radius.toFixed(4)}_${depth.toFixed(4)}_${lobes}`;
  const cached = knobGeoCache.get(key);
  if (cached) return cached;

  const geo = new THREE.CylinderGeometry(radius, radius * 1.07, depth, 48, 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vz = pos.getZ(i);
    const r = Math.hypot(vx, vz);
    if (r > radius * 0.45) {
      const theta = Math.atan2(vz, vx);
      const flute = 1 - 0.052 * Math.pow(0.5 + 0.5 * Math.cos(lobes * theta), 2);
      pos.setX(i, vx * flute);
      pos.setZ(i, vz * flute);
    }
  }
  geo.computeVertexNormals();
  knobGeoCache.set(key, geo);
  return geo;
}

interface PanelButtonProps {
  id: string;
  label: string;
  keyText?: string;
  keyTextColor?: string;
  collarColor?: string;
  pos: [number, number, number];
  size: [number, number, number];
  color?: string;
  emissive?: string;
  emissiveIntensity?: number;
  round?: boolean;
  onTrigger: () => void;
  onLongPress?: () => void;
}

function PanelButton({
  id,
  label,
  keyText,
  keyTextColor = '#1e293b',
  collarColor,
  pos,
  size,
  color = '#d4dde6',
  emissive = '#000000',
  emissiveIntensity = 0,
  round = false,
  onTrigger,
  onLongPress,
}: PanelButtonProps) {
  const groupRef = useRef<THREE.Group>(null);
  const pressedRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const longFiredRef = useRef(false);
  const setHoverLabel = useLabStore((s) => s.setHoverLabel);

  const labelTex = useMemo(
    () => (keyText ? getButtonLabelTexture(keyText, color, keyTextColor, '#a5b0bc') : null),
    [keyText, color, keyTextColor]
  );

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const targetZ = pressedRef.current ? pos[2] - 0.0022 : pos[2];
    const diff = targetZ - groupRef.current.position.z;
    if (Math.abs(diff) < 1e-4) return;
    groupRef.current.position.z =
      Math.abs(diff) < 2e-4 ? targetZ : THREE.MathUtils.lerp(groupRef.current.position.z, targetZ, Math.min(1, delta * 26));
  });

  const handleDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    pressedRef.current = true;
    longFiredRef.current = false;
    if (onLongPress) {
      timerRef.current = window.setTimeout(() => {
        longFiredRef.current = true;
        onLongPress();
      }, 900);
    }
  };

  const handleUp = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    pressedRef.current = false;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!longFiredRef.current) {
      onTrigger();
    }
  };

  return (
    <group name={`rigol_btn_wrap_${id}`}>
      {collarColor && (
        <RoundedBox
          args={[size[0] + 0.0044, size[1] + 0.0038, 0.0024]}
          radius={0.0014}
          smoothness={3}
          position={[pos[0], pos[1], pos[2] - size[2] * 0.35]}
        >
          <meshStandardMaterial color={collarColor} roughness={0.38} />
        </RoundedBox>
      )}

      <group
        ref={groupRef}
        position={pos}
        name={`rigol_btn_${id}`}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHoverLabel(label);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHoverLabel(null);
          pressedRef.current = false;
          if (timerRef.current !== null) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
          }
          document.body.style.cursor = 'auto';
        }}
        onPointerDown={handleDown}
        onPointerUp={handleUp}
      >
        {round ? (
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[size[0] * 0.5, size[0] * 0.5, size[2], 18]} />
            <meshStandardMaterial
              color={color}
              roughness={0.38}
              metalness={0.04}
              emissive={emissive}
              emissiveIntensity={emissiveIntensity}
            />
          </mesh>
        ) : (
          <RoundedBox args={size} radius={0.0016} smoothness={2}>
            <meshStandardMaterial
              color={color}
              roughness={0.40}
              metalness={0.03}
              emissive={emissive}
              emissiveIntensity={emissiveIntensity}
            />
          </RoundedBox>
        )}

        {labelTex && !round && (
          <mesh position={[0, 0, size[2] * 0.515]}>
            <planeGeometry args={[size[0] * 0.86, size[1] * 0.80]} />
            <meshStandardMaterial
              map={labelTex}
              roughness={0.42}
              emissive={emissive}
              emissiveIntensity={emissiveIntensity * 0.45}
            />
          </mesh>
        )}
      </group>
    </group>
  );
}

interface PanelKnobProps {
  knobId: KnobId;
  label: string;
  pos: [number, number, number];
  radius: number;
  depth?: number;
  lobes?: number;
  onTurn: (steps: number) => void;
  onPush: () => void;
}

function PanelKnob({ knobId, label, pos, radius, depth = 0.014, lobes = 6, onTurn, onPush }: PanelKnobProps) {
  const groupRef = useRef<THREE.Group>(null);
  const angleRef = useRef(0);
  const pushZRef = useRef(0);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const accumYRef = useRef(0);
  const lastYRef = useRef(0);
  const setHoverLabel = useLabStore((s) => s.setHoverLabel);

  const knobGeo = useMemo(() => getScallopedKnobGeometry(radius, depth, lobes), [radius, depth, lobes]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const rotDiff = angleRef.current - groupRef.current.rotation.z;
    const targetZ = pos[2] + pushZRef.current;
    const zDiff = targetZ - groupRef.current.position.z;
    if (Math.abs(rotDiff) < 1e-4 && Math.abs(zDiff) < 1e-4 && Math.abs(pushZRef.current) < 1e-4) return;
    groupRef.current.rotation.z =
      Math.abs(rotDiff) < 2e-4 ? angleRef.current : THREE.MathUtils.lerp(groupRef.current.rotation.z, angleRef.current, Math.min(1, delta * 22));
    groupRef.current.position.z =
      Math.abs(zDiff) < 2e-4 ? targetZ : THREE.MathUtils.lerp(groupRef.current.position.z, targetZ, Math.min(1, delta * 24));
    if (pushZRef.current < -1e-4) pushZRef.current = THREE.MathUtils.lerp(pushZRef.current, 0, Math.min(1, delta * 14));
    else pushZRef.current = 0;
  });

  const onTurnRef = useRef(onTurn);
  const onPushRef = useRef(onPush);
  onTurnRef.current = onTurn;
  onPushRef.current = onPush;

  useEffect(() => {
    const onWinMove = (ev: PointerEvent) => {
      if (!draggingRef.current) return;
      const dy = lastYRef.current - ev.clientY;
      lastYRef.current = ev.clientY;
      accumYRef.current += dy;
      if (Math.abs(accumYRef.current) > 8) {
        movedRef.current = true;
        const steps = Math.trunc(accumYRef.current / 8);
        accumYRef.current -= steps * 8;
        angleRef.current -= steps * 0.28;
        onTurnRef.current(steps);
      }
    };
    const onWinUp = () => {
      if (draggingRef.current && !movedRef.current) {
        pushZRef.current = -0.003;
        onPushRef.current();
      }
      draggingRef.current = false;
    };
    window.addEventListener('pointermove', onWinMove);
    window.addEventListener('pointerup', onWinUp);
    return () => {
      window.removeEventListener('pointermove', onWinMove);
      window.removeEventListener('pointerup', onWinUp);
      hotRefs.knobHovered = false;
    };
  }, []);

  return (
    <group
      ref={groupRef}
      position={pos}
      name={`rigol_knob_${knobId}`}
      onPointerOver={(e) => {
        e.stopPropagation();
        hotRefs.knobHovered = true;
        setHoverLabel(`${label} (Scroll/Drag)`);
        document.body.style.cursor = 'ns-resize';
      }}
      onPointerOut={() => {
        hotRefs.knobHovered = false;
        setHoverLabel(null);
        document.body.style.cursor = 'auto';
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        draggingRef.current = true;
        movedRef.current = false;
        accumYRef.current = 0;
        lastYRef.current = e.clientY;
      }}
      onWheel={(e) => {
        e.stopPropagation();
        const step = e.deltaY < 0 ? 1 : -1;
        angleRef.current -= step * 0.28;
        onTurn(step);
      }}
    >
      {/* Cream-white rubber fluted body matching DS1052E encoders */}
      <mesh geometry={knobGeo} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <meshStandardMaterial color="#e6e4de" roughness={0.44} metalness={0.04} />
      </mesh>
      {/* Subtle cream recessed seam ring */}
      <mesh position={[0, 0, depth * 0.502]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[radius * 0.72, radius * 0.72, 0.0014, 28]} />
        <meshStandardMaterial color="#cfcdc5" roughness={0.42} metalness={0.06} />
      </mesh>
      {/* Smooth cream top dome cap */}
      <mesh position={[0, 0, depth * 0.512]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[radius * 0.64, radius * 0.68, 0.0018, 28]} />
        <meshStandardMaterial color="#eeece6" roughness={0.34} metalness={0.04} />
      </mesh>
    </group>
  );
}

function BncJackMesh({
  socketId,
  label,
  pos,
  ringColor,
}: {
  socketId: string;
  label: string;
  pos: [number, number, number];
  ringColor: string;
}) {
  const ref = useRef<THREE.Group>(null);
  const grabbedEnd = useLabStore((s) => s.grabbedEnd);
  const clickSocket = useLabStore((s) => s.clickSocket);
  const setHoverLabel = useLabStore((s) => s.setHoverLabel);

  useLayoutEffect(() => {
    registerObjectSocket(ref.current, socketId, label, 'bnc', 'z', 0.017);
    return () => socketRegistry.unregister(socketId);
  }, [socketId, label]);

  return (
    <group
      ref={ref}
      position={pos}
      onPointerOver={(e) => {
        e.stopPropagation();
        hotRefs.hoveredSocketId = socketId;
        setHoverLabel(grabbedEnd ? label : `${label} (Klik: kabel BNC adaptif +/-)`);
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
      {/* Molded Circular Recessed BNC Well Surround (1:1 DS1052E look) */}
      <mesh position={[0, 0, 0.0005]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.0112, 0.0118, 0.0018, 24]} />
        <meshStandardMaterial color="#c4c7ce" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.0011]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.0094, 0.0094, 0.0014, 24]} />
        <meshStandardMaterial color="#838992" roughness={0.58} />
      </mesh>
      {/* Color Coding Ring + Hex Nut */}
      <mesh position={[0, 0, 0.0018]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.0080, 0.0080, 0.0018, 18]} />
        <meshStandardMaterial color={ringColor} roughness={0.45} />
      </mesh>
      <mesh position={[0, 0, 0.0028]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.0074, 0.0074, 0.0022, 6]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.28} metalness={0.84} />
      </mesh>
      {/* Chrome Bayonet Barrel */}
      <mesh position={[0, 0, 0.0088]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.0062, 0.0062, 0.014, 20]} />
        <meshStandardMaterial color="#d4dce5" roughness={0.24} metalness={0.88} />
      </mesh>
      <mesh position={[0, 0, 0.012]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.001, 0.001, 0.0146, 8]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.22} metalness={0.9} />
      </mesh>
      {/* PTFE Insulator & Gold Pin */}
      <mesh position={[0, 0, 0.0154]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.0040, 0.0040, 0.002, 16]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0, 0.0158]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.0011, 0.0011, 0.002, 10]} />
        <meshStandardMaterial color="#eab308" roughness={0.2} metalness={0.9} />
      </mesh>
    </group>
  );
}

let rigolLouverGeoCache: THREE.BufferGeometry | null = null;
function getRigolLouverGeo(): THREE.BufferGeometry {
  if (rigolLouverGeoCache) return rigolLouverGeoCache;
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    for (const zOff of [-0.025, -0.015, -0.005, 0.005, 0.015, 0.025]) {
      const b = new THREE.BoxGeometry(0.001, 0.068, 0.004);
      b.translate(side * (W / 2 + 0.0005), 0.005, zOff);
      const nonIdx = b.toNonIndexed();
      if (nonIdx.getAttribute('uv')) nonIdx.deleteAttribute('uv');
      b.dispose();
      parts.push(nonIdx);
    }
  }
  rigolLouverGeoCache = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  rigolLouverGeoCache.computeBoundingSphere();
  return rigolLouverGeoCache;
}

export function RigolDS1000EMesh({
  position = [-0.26, 0.78, -0.16],
}: {
  position?: [number, number, number];
}) {
  const scope = useLabStore((s) => s.scope);
  const pressBtn = useLabStore((s) => s.pressScopeButton);
  const longPressHelp = useLabStore((s) => s.longPressScopeHelp);
  const pressSoft = useLabStore((s) => s.pressScopeSoftKey);
  const turnKnob = useLabStore((s) => s.turnScopeKnob);
  const pushKnob = useLabStore((s) => s.pushScopeKnob);
  const setCameraTarget = useLabStore((s) => s.setCameraTarget);
  const setHoverLabel = useLabStore((s) => s.setHoverLabel);

  const compSigRef = useRef<THREE.Mesh>(null);
  const compGndRef = useRef<THREE.Mesh>(null);
  const lastRenderedSeqRef = useRef(-1);

  const faceplateGeo = useMemo(() => getDS1052EFaceplateGeometry(), []);
  const frontTex = useMemo(() => getRigolFrontPanelTexture(), []);
  const rearTex = useMemo(() => getRigolRearTexture(), []);
  const roughTex = useMemo(() => getChassisGrainRoughnessMap(), []);

  const [{ lcdCanvas, lcdCtx, lcdTexture, lcdRenderer }] = useState(() => {
    const c = document.createElement('canvas');
    c.width = LCD_W;
    c.height = LCD_H;
    const ctx = c.getContext('2d')!;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 4;
    return {
      lcdCanvas: c,
      lcdCtx: ctx,
      lcdTexture: tex,
      lcdRenderer: new RigolLCDRenderer(),
    };
  });

  const lastKnobNoticeRef = useRef<string | null>(null);

  useEffect(() => {
    scopeExportHooks.exportBitmap = () => exportScopePNG(lcdCanvas);
    scopeExportHooks.exportCSV = () => {
      if (hotRefs.scopeFrame) exportScopeCSV(hotRefs.scopeFrame, useLabStore.getState().scope);
    };
    return () => {
      lcdTexture.dispose();
    };
  }, [lcdCanvas, lcdTexture]);

  useLayoutEffect(() => {
    registerObjectSocket(compSigRef.current, 'rigol_comp_sig', 'PROBE COMP 1kHz 3Vpp', 'lug', 'z', 0);
    registerObjectSocket(compGndRef.current, 'rigol_comp_gnd', 'PROBE COMP GND', 'lug', 'z', 0);
    return () => {
      socketRegistry.unregister('rigol_comp_sig');
      socketRegistry.unregister('rigol_comp_gnd');
    };
  }, []);

  useFrame(() => {
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    const curNotice = hotRefs.lastKnobReadout && now < hotRefs.lastKnobReadoutUntil ? hotRefs.lastKnobReadout : null;
    const noticeChanged = curNotice !== lastKnobNoticeRef.current;
    if (hotRefs.scopeDirty || lastRenderedSeqRef.current !== scope.dirtySeq || noticeChanged) {
      lcdRenderer.render(lcdCtx, scope, hotRefs.scopeFrame);
      lcdTexture.needsUpdate = true;
      hotRefs.scopeDirty = false;
      lastRenderedSeqRef.current = scope.dirtySeq;
      lastKnobNoticeRef.current = curNotice;
    }
  });

  // Left shell vs Right fascia Z plane helper
  const fp = (u: number, v: number, z?: number): [number, number, number] => {
    const defaultZ = u < 0.606 ? D / 2 + 0.0046 : D / 2 + 0.0028;
    return [(u - 0.5) * W, (0.5 - v) * H, z ?? defaultZ];
  };

  const helpFor = (k: string) => () => {
    if (HELP_TEXT_MAP[k]) longPressHelp(k);
  };

  const runLedColor =
    scope.power !== 'ON' ? '#cbd5e1' : scope.runState === 'RUN' ? '#daf77c' : '#f87171';

  return (
    <group
      position={[position[0], position[1] + H * 0.5 + 0.006, position[2]]}
      rotation={[-0.12, 0.08, 0]}
      name="rigol_ds1000e_root"
      onDoubleClick={(e) => {
        if (useLabStore.getState().grabbedEnd) return;
        e.stopPropagation();
        setCameraTarget('rigol');
      }}
    >
      {/* Main Molded Warm-Gray Enclosure */}
      <RoundedBox args={[W, H, D]} radius={0.010} smoothness={5} castShadow receiveShadow>
        <meshStandardMaterial
          color="#e5e3dc"
          roughness={0.46}
          roughnessMap={roughTex}
          metalness={0.03}
        />
      </RoundedBox>

      {/* Merged Side Cooling Louver Slots (12 meshes -> 1 draw call!) */}
      <mesh geometry={getRigolLouverGeo()}>
        <meshStandardMaterial color="#585e68" roughness={0.75} />
      </mesh>

      {/* Low-profile Molded Top Carrying Handle */}
      <group position={[0, H / 2 + 0.003, -0.018]}>
        <RoundedBox args={[0.148, 0.005, 0.016]} radius={0.0015} smoothness={2} castShadow>
          <meshStandardMaterial color="#d2cfc7" roughness={0.48} metalness={0.08} />
        </RoundedBox>
      </group>

      {/* Authentic Molded Front Plastic Feet + Dark Thin Rubber Pads */}
      {[-W * 0.38, W * 0.38].map((fx, i) => (
        <group key={i} position={[fx, -H / 2 - 0.004, D * 0.30]}>
          <RoundedBox args={[0.028, 0.010, 0.022]} radius={0.002} smoothness={2} castShadow>
            <meshStandardMaterial color="#d9d7cf" roughness={0.5} />
          </RoundedBox>
          <mesh position={[0, -0.005, 0]}>
            <boxGeometry args={[0.024, 0.0018, 0.018]} />
            <meshStandardMaterial color="#272b30" roughness={0.85} />
          </mesh>
        </group>
      ))}

      {/* Flush Top-Left Power Switch (subtly sculpted like photo) */}
      <PanelButton
        id="POWER"
        label="POWER"
        pos={[-W * 0.37, H / 2 + 0.0015, D * 0.36]}
        size={[0.016, 0.0035, 0.011]}
        color={scope.power === 'OFF' ? '#bdbab2' : '#d8d6ce'}
        onTrigger={() => pressBtn('POWER')}
      />

      {/* Sculpted UV-Mapped Front Faceplate with Sloped Screen Cavity & Parting Seam */}
      <mesh geometry={faceplateGeo} position={[0, 0, D / 2 + 0.0005]} receiveShadow>
        <meshStandardMaterial map={frontTex} roughness={0.46} metalness={0.03} />
      </mesh>

      {/* Recessed 5.6" TFT LCD Display seated inside sloped cavity */}
      <mesh position={fp(0.302, 0.480, D / 2 + 0.0012)}>
        <planeGeometry args={[W * 0.405, H * 0.600]} />
        <meshStandardMaterial
          map={lcdTexture}
          emissiveMap={lcdTexture}
          emissive={scope.power === 'OFF' ? '#000000' : '#ffffff'}
          emissiveIntensity={scope.power === 'OFF' ? 0 : 1.02}
          roughness={0.18}
          metalness={0.04}
        />
      </mesh>

      {/* Bottom-Left Molded USB Host Port Assembly */}
      <group position={fp(0.228, 0.892, D / 2 + 0.0044)}>
        <RoundedBox args={[0.022, 0.013, 0.002]} radius={0.002} smoothness={2}>
          <meshStandardMaterial color="#dedcd4" roughness={0.48} />
        </RoundedBox>
        <mesh position={[0, 0, 0.0011]}>
          <boxGeometry args={[0.0165, 0.0075, 0.001]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.28} metalness={0.82} />
        </mesh>
        <mesh position={[0, 0, 0.0016]}>
          <boxGeometry args={[0.0135, 0.0052, 0.0008]} />
          <meshStandardMaterial color="#0f172a" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.0006, 0.0019]}>
          <boxGeometry args={[0.011, 0.0014, 0.0008]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.45} />
        </mesh>
      </group>

      {/* Bottom-Center Blank Covered LA Bay (signature DS1052E front molding) */}
      <group position={fp(0.455, 0.870, D / 2 + 0.0038)}>
        <RoundedBox args={[0.068, 0.014, 0.0016]} radius={0.003} smoothness={2}>
          <meshStandardMaterial color="#d2d0c8" roughness={0.5} />
        </RoundedBox>
      </group>

      {/* Rear Panel + 3D Ports */}
      <mesh position={[0, 0, -D / 2 - 0.0007]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[W - 0.004, H - 0.004]} />
        <meshStandardMaterial map={rearTex} roughness={0.6} />
      </mesh>
      <mesh position={[-0.06, -0.032, -D / 2 - 0.005]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.0055, 0.0055, 0.012, 16]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.28} metalness={0.85} />
      </mesh>
      <mesh position={[0.01, -0.032, -D / 2 - 0.004]}>
        <boxGeometry args={[0.024, 0.012, 0.006]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.35} metalness={0.7} />
      </mesh>
      <mesh position={[0.068, -0.032, -D / 2 - 0.003]}>
        <boxGeometry args={[0.012, 0.011, 0.005]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.3} metalness={0.8} />
      </mesh>
      <mesh position={[0.112, -0.036, -D / 2 - 0.003]}>
        <boxGeometry args={[0.028, 0.020, 0.006]} />
        <meshStandardMaterial color="#18181b" roughness={0.6} />
      </mesh>

      {/* Round White MENU ON/OFF Button */}
      <PanelButton
        id="MENU_ONOFF"
        label="MENU ON/OFF"
        collarColor="#8f959e"
        pos={fp(0.570, 0.202, D / 2 + 0.0054)}
        size={[0.0096, 0.0096, 0.0036]}
        color="#f3f2ee"
        round
        onTrigger={() => pressBtn('MENU_ONOFF')}
        onLongPress={helpFor('MENU_ONOFF')}
      />

      {/* 5 Sky-Blue Silicone Pill Softkeys Aligned 1:1 with On-Screen Menu Slots */}
      {[0, 1, 2, 3, 4].map((slot) => (
        <PanelButton
          key={slot}
          id={`F${slot + 1}`}
          label={`Softkey ${slot + 1}`}
          pos={fp(0.570, 0.2723 + slot * 0.1026, D / 2 + 0.0054)}
          size={[0.0138, 0.0082, 0.0038]}
          color="#5c92cb"
          onTrigger={() => pressSoft(slot as 0 | 1 | 2 | 3 | 4)}
        />
      ))}

      {/* Multi-Function Cream Knob + Discrete Print Hitbox */}
      <PanelKnob
        knobId="MULTI"
        label="Multi-Function"
        pos={fp(0.642, 0.242, D / 2 + 0.006)}
        radius={0.0085}
        depth={0.010}
        lobes={4}
        onTurn={(steps) => turnKnob('MULTI', steps)}
        onPush={() => pushKnob('MULTI')}
      />
      <PanelButton
        id="PRINT"
        label="Print PNG"
        pos={fp(0.654, 0.172, D / 2 + 0.0024)}
        size={[0.008, 0.006, 0.0012]}
        color="#dfe3e8"
        onTrigger={() => pressBtn('PRINT')}
        onLongPress={helpFor('PRINT')}
      />

      {/* MENU 2x3 Pill Keys */}
      <PanelButton id="MEASURE" label="Measure" keyText="Measure" pos={fp(0.701, 0.162)} size={[0.0138, 0.0086, 0.0034]} color="#cbd5e1" onTrigger={() => pressBtn('MEASURE')} onLongPress={helpFor('MEASURE')} />
      <PanelButton id="ACQUIRE" label="Acquire" keyText="Acquire" pos={fp(0.751, 0.162)} size={[0.0138, 0.0086, 0.0034]} color="#cbd5e1" onTrigger={() => pressBtn('ACQUIRE')} onLongPress={helpFor('ACQUIRE')} />
      <PanelButton id="STORAGE" label="Storage" keyText="Storage" pos={fp(0.801, 0.162)} size={[0.0138, 0.0086, 0.0034]} color="#cbd5e1" onTrigger={() => pressBtn('STORAGE')} onLongPress={helpFor('STORAGE')} />
      <PanelButton id="CURSOR" label="Cursor" keyText="Cursor" pos={fp(0.701, 0.258)} size={[0.0138, 0.0086, 0.0034]} color="#cbd5e1" onTrigger={() => pressBtn('CURSOR')} onLongPress={helpFor('CURSOR')} />
      <PanelButton id="DISPLAY" label="Display" keyText="Display" pos={fp(0.751, 0.258)} size={[0.0138, 0.0086, 0.0034]} color="#cbd5e1" onTrigger={() => pressBtn('DISPLAY')} onLongPress={helpFor('DISPLAY')} />
      <PanelButton id="UTILITY" label="Utility" keyText="Utility" pos={fp(0.801, 0.258)} size={[0.0138, 0.0086, 0.0034]} color="#cbd5e1" onTrigger={() => pressBtn('UTILITY')} onLongPress={helpFor('UTILITY')} />

      {/* RUN CONTROL: AUTO & RUN/STOP */}
      <PanelButton id="AUTO" label="AUTO" keyText="AUTO" pos={fp(0.867, 0.210)} size={[0.0155, 0.0108, 0.0036]} color="#c6d4e3" onTrigger={() => pressBtn('AUTO')} onLongPress={helpFor('AUTO')} />
      <PanelButton
        id="RUN/STOP"
        label="RUN/STOP"
        keyText="RUN/STOP"
        keyTextColor="#1e293b"
        pos={fp(0.932, 0.210)}
        size={[0.0165, 0.0108, 0.0036]}
        color={runLedColor}
        emissive={scope.power === 'ON' ? runLedColor : '#000000'}
        emissiveIntensity={scope.power === 'ON' ? 0.85 : 0}
        onTrigger={() => pressBtn('RUN/STOP')}
        onLongPress={helpFor('RUN/STOP')}
      />

      {/* VERTICAL Section (Authentic Colored Collars + Crisp White Inner Pills) */}
      <PanelButton
        id="CH1"
        label="CH1"
        keyText="CH1"
        collarColor="#f2c511"
        pos={fp(0.646, 0.395)}
        size={[0.0145, 0.0092, 0.0036]}
        color={scope.ch1.enabled ? '#fef9c3' : '#f1f5f9'}
        emissive={scope.power === 'ON' && scope.ch1.enabled ? '#f2c511' : '#000000'}
        emissiveIntensity={scope.ch1.enabled ? 0.38 : 0}
        onTrigger={() => pressBtn('CH1')}
        onLongPress={helpFor('CH1')}
      />
      <PanelButton
        id="CH2"
        label="CH2"
        keyText="CH2"
        collarColor="#24b6e6"
        pos={fp(0.646, 0.478)}
        size={[0.0145, 0.0092, 0.0036]}
        color={scope.ch2.enabled ? '#e0f2fe' : '#f1f5f9'}
        emissive={scope.power === 'ON' && scope.ch2.enabled ? '#24b6e6' : '#000000'}
        emissiveIntensity={scope.ch2.enabled ? 0.38 : 0}
        onTrigger={() => pressBtn('CH2')}
        onLongPress={helpFor('CH2')}
      />
      <PanelButton
        id="MATH"
        label="MATH"
        keyText="MATH"
        collarColor="#594fa6"
        pos={fp(0.646, 0.561)}
        size={[0.0145, 0.0092, 0.0036]}
        color={scope.math.enabled ? '#ede9fe' : '#e2e8f0'}
        emissive={scope.power === 'ON' && scope.math.enabled ? '#7c3aed' : '#000000'}
        emissiveIntensity={scope.math.enabled ? 0.42 : 0}
        onTrigger={() => pressBtn('MATH')}
        onLongPress={helpFor('MATH')}
      />
      <PanelButton
        id="REF"
        label="REF"
        keyText="REF"
        pos={fp(0.646, 0.644)}
        size={[0.0155, 0.010, 0.0036]}
        color={scope.ref.enabled ? '#f8fafc' : '#ced7e2'}
        onTrigger={() => pressBtn('REF')}
        onLongPress={helpFor('REF')}
      />

      <PanelKnob
        knobId="VERT_POS"
        label="Vertical Position"
        pos={fp(0.728, 0.435, D / 2 + 0.0075)}
        radius={0.0084}
        depth={0.012}
        lobes={4}
        onTurn={(steps) => turnKnob('VERT_POS', steps)}
        onPush={() => pushKnob('VERT_POS')}
      />
      <PanelButton
        id="OFF"
        label="Channel OFF"
        keyText="OFF"
        pos={fp(0.728, 0.528)}
        size={[0.0132, 0.0078, 0.0034]}
        color="#e9ebef"
        onTrigger={() => pressBtn('OFF')}
        onLongPress={helpFor('OFF')}
      />
      <PanelKnob
        knobId="VERT_SCALE"
        label="Volts/Div"
        pos={fp(0.728, 0.652, D / 2 + 0.0085)}
        radius={0.0114}
        depth={0.014}
        lobes={6}
        onTurn={(steps) => turnKnob('VERT_SCALE', steps)}
        onPush={() => pushKnob('VERT_SCALE')}
      />

      {/* HORIZONTAL Section */}
      <PanelKnob
        knobId="HORIZ_POS"
        label="Horizontal Position"
        pos={fp(0.824, 0.435, D / 2 + 0.0075)}
        radius={0.0084}
        depth={0.012}
        lobes={4}
        onTurn={(steps) => turnKnob('HORIZ_POS', steps)}
        onPush={() => pushKnob('HORIZ_POS')}
      />
      <PanelButton
        id="HORIZ_MENU"
        label="Horiz Menu"
        keyText="MENU"
        pos={fp(0.824, 0.528)}
        size={[0.0145, 0.0084, 0.0034]}
        color="#e9ebef"
        onTrigger={() => pressBtn('HORIZ_MENU')}
        onLongPress={helpFor('HORIZ_MENU')}
      />
      <PanelKnob
        knobId="HORIZ_SCALE"
        label="Time/Div"
        pos={fp(0.824, 0.652, D / 2 + 0.0085)}
        radius={0.0114}
        depth={0.014}
        lobes={6}
        onTurn={(steps) => turnKnob('HORIZ_SCALE', steps)}
        onPush={() => pushKnob('HORIZ_SCALE')}
      />

      {/* TRIGGER Section */}
      <PanelKnob
        knobId="TRIG_LEVEL"
        label="Trigger Level"
        pos={fp(0.916, 0.435, D / 2 + 0.0075)}
        radius={0.0084}
        depth={0.012}
        lobes={4}
        onTurn={(steps) => turnKnob('TRIG_LEVEL', steps)}
        onPush={() => pushKnob('TRIG_LEVEL')}
      />
      <PanelButton
        id="TRIG_MENU"
        label="Trigger Menu"
        keyText="MENU"
        pos={fp(0.916, 0.528)}
        size={[0.0145, 0.0084, 0.0034]}
        color="#e9ebef"
        onTrigger={() => pressBtn('TRIG_MENU')}
        onLongPress={helpFor('TRIG_MENU')}
      />
      <PanelButton
        id="50%"
        label="Trigger 50%"
        keyText="50%"
        pos={fp(0.916, 0.612)}
        size={[0.0145, 0.0084, 0.0034]}
        color="#e9ebef"
        onTrigger={() => pressBtn('50%')}
        onLongPress={helpFor('50%')}
      />
      <PanelButton
        id="FORCE"
        label="FORCE Trigger"
        keyText="FORCE"
        pos={fp(0.916, 0.692)}
        size={[0.0145, 0.0084, 0.0034]}
        color="#e9ebef"
        onTrigger={() => pressBtn('FORCE')}
        onLongPress={helpFor('FORCE')}
      />

      {/* Recessed BNC Input Wells */}
      <BncJackMesh socketId="rigol_ch1" label="CH1 Input BNC" pos={fp(0.665, 0.858, D / 2 + 0.0024)} ringColor="#f2c511" />
      <BncJackMesh socketId="rigol_ch2" label="CH2 Input BNC" pos={fp(0.762, 0.858, D / 2 + 0.0024)} ringColor="#24b6e6" />
      <BncJackMesh socketId="rigol_ext" label="EXT TRIG BNC" pos={fp(0.860, 0.858, D / 2 + 0.0024)} ringColor="#64748b" />

      {/* Vertical Probe Compensation Recessed Cavity & Dual Metal Hook Lugs */}
      <mesh position={fp(0.924, 0.860, D / 2 + 0.0026)}>
        <boxGeometry args={[0.0085, 0.022, 0.0012]} />
        <meshStandardMaterial color="#373c44" roughness={0.6} />
      </mesh>
      <mesh
        ref={compSigRef}
        position={fp(0.924, 0.838, D / 2 + 0.0050)}
        onPointerOver={(e) => {
          e.stopPropagation();
          hotRefs.hoveredSocketId = 'rigol_comp_sig';
          const g = useLabStore.getState().grabbedEnd;
          setHoverLabel(g ? 'PROBE COMP 3Vpp 1kHz' : 'PROBE COMP 3Vpp 1kHz (Klik: kabel banana)');
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          if (hotRefs.hoveredSocketId === 'rigol_comp_sig') hotRefs.hoveredSocketId = null;
          setHoverLabel(null);
          document.body.style.cursor = 'auto';
        }}
        onClick={(e) => {
          e.stopPropagation();
          useLabStore.getState().clickSocket('rigol_comp_sig');
        }}
      >
        <boxGeometry args={[0.0052, 0.002, 0.0075]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.22} metalness={0.9} />
      </mesh>
      <mesh
        ref={compGndRef}
        position={fp(0.924, 0.886, D / 2 + 0.0050)}
        onPointerOver={(e) => {
          e.stopPropagation();
          hotRefs.hoveredSocketId = 'rigol_comp_gnd';
          const g = useLabStore.getState().grabbedEnd;
          setHoverLabel(g ? 'PROBE COMP GND' : 'PROBE COMP GND (Klik: kabel banana)');
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          if (hotRefs.hoveredSocketId === 'rigol_comp_gnd') hotRefs.hoveredSocketId = null;
          setHoverLabel(null);
          document.body.style.cursor = 'auto';
        }}
        onClick={(e) => {
          e.stopPropagation();
          useLabStore.getState().clickSocket('rigol_comp_gnd');
        }}
      >
        <boxGeometry args={[0.0052, 0.002, 0.0075]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.28} metalness={0.86} />
      </mesh>
    </group>
  );
}
