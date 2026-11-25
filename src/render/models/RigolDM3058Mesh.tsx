import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { RoundedBox } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { labAudio } from '../../audio/labAudio';
import { DM3058LCDRenderer } from '../../instruments/dm3058/lcdRenderer';
import { extractRawValue } from '../../instruments/dm3058/state';
import type { DM3058ButtonId } from '../../instruments/dm3058/types';
import { hotRefs } from '../../state/hotRefs';
import { useLabStore } from '../../state/labStore';
import { registerObjectSocket, socketRegistry } from '../cables/socketRegistry';
import {
  getDM3058FrontPanelTexture,
  getDM3058KeyTexture,
  getDM3058RearTexture,
  getDM3058SideTexture,
} from '../textures/dm3058Textures';
import { getChassisGrainRoughnessMap } from '../textures/proceduralTextures';

const W = 0.232;
const H = 0.107;
const D = 0.246;
const FRONT_Z = D / 2;

let dmFaceplateGeoCache: THREE.BufferGeometry | null = null;

/**
 * Single UV-mapped sculpted front bezel geometry with true 3D sloped hollow cutout
 * for the 256x64 dot-matrix LCD (zero z-fighting) + curved stepped divider to right fascia.
 */
function getDM3058FaceplateGeometry(): THREE.BufferGeometry {
  if (dmFaceplateGeoCache) return dmFaceplateGeoCache;

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
    uvs.push(
      u0, 1 - v0,
      u0, 1 - v1,
      u1, 1 - v1,
      u0, 1 - v0,
      u1, 1 - v1,
      u1, 1 - v0
    );
  };

  // Exact 4:1 LCD window (0.436*W x 0.2363*H) matching 256x64 pixels
  const us = [0.008, 0.112, 0.130, 0.566, 0.582, 0.594];
  const vs = [0.012, 0.205, 0.238, 0.4743, 0.515, 0.988];
  const zAt = (iu: number, iv: number) => ((iu === 2 || iu === 3) && (iv === 2 || iv === 3) ? 0.0002 : 0.0036);

  for (let iu = 0; iu < us.length - 1; iu++) {
    for (let iv = 0; iv < vs.length - 1; iv++) {
      if (iu === 2 && iv === 2) continue; // Hollow LCD opening!
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

  // Step drop into pale cool-gray right fascia
  pushQuad(0.594, 0.012, 0.0036, 0.598, 0.988, 0.0036, 0.0018, 0.0018);
  pushQuad(0.598, 0.012, 0.0018, 0.992, 0.988, 0.0018, 0.0018, 0.0018);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  dmFaceplateGeoCache = geo;
  return geo;
}

function uvToXY(u: number, v: number): [number, number] {
  return [(u - 0.5) * W, (0.5 - v) * H];
}

let mergedDM3058BumpersCache: { body: THREE.BufferGeometry; ribs: THREE.BufferGeometry; bail: THREE.BufferGeometry } | null = null;

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

function getMergedDM3058StaticParts() {
  if (mergedDM3058BumpersCache) return mergedDM3058BumpersCache;
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

  // Merge bail carry handle / tilt stand (5 meshes -> 1 draw call!)
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

  mergedDM3058BumpersCache = {
    body: mergeNonIndexed(bodyParts),
    ribs: mergeNonIndexed(ribParts),
    bail: mergeNonIndexed(bailParts),
  };
  return mergedDM3058BumpersCache;
}

interface DMKeyProps {
  id: DM3058ButtonId;
  hoverText: string;
  keyKind?: string;
  u: number;
  v: number;
  size: [number, number, number];
  baseZ?: number;
  color?: string;
  textColor?: string;
  emissive?: string;
  emissiveIntensity?: number;
  round?: boolean;
  onPress: (id: DM3058ButtonId) => void;
}

function DMKey({
  id,
  hoverText,
  keyKind,
  u,
  v,
  size,
  baseZ = 0.0046,
  color = '#d3d8df',
  textColor = '#0f172a',
  emissive = '#000000',
  emissiveIntensity = 0,
  round = false,
  onPress,
}: DMKeyProps) {
  const ref = useRef<THREE.Group>(null);
  const pressedRef = useRef(false);
  const setHoverLabel = useLabStore((s) => s.setHoverLabel);
  const [x, y] = uvToXY(u, v);

  const labelTex = useMemo(
    () => (keyKind ? getDM3058KeyTexture(keyKind, color, textColor, '#8e96a1') : null),
    [keyKind, color, textColor]
  );

  useFrame((_, dt) => {
    if (!ref.current) return;
    const tz = pressedRef.current ? baseZ - 0.0018 : baseZ;
    const diff = tz - ref.current.position.z;
    if (Math.abs(diff) < 1e-4) return;
    ref.current.position.z =
      Math.abs(diff) < 2e-4 ? tz : THREE.MathUtils.lerp(ref.current.position.z, tz, Math.min(1, dt * 28));
  });

  return (
    <group
      ref={ref}
      position={[x, y, baseZ]}
      name={`dm3058_key_${id}`}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHoverLabel(hoverText);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHoverLabel(null);
        pressedRef.current = false;
        document.body.style.cursor = 'auto';
      }}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        pressedRef.current = true;
      }}
      onPointerUp={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        pressedRef.current = false;
        onPress(id);
      }}
    >
      {round ? (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[size[0] * 0.5, size[0] * 0.5, size[2], 18]} />
          <meshStandardMaterial
            color={color}
            roughness={0.42}
            emissive={emissive}
            emissiveIntensity={emissiveIntensity}
          />
        </mesh>
      ) : (
        <RoundedBox args={size} radius={0.0013} smoothness={2}>
          <meshStandardMaterial
            color={color}
            roughness={0.42}
            emissive={emissive}
            emissiveIntensity={emissiveIntensity}
          />
        </RoundedBox>
      )}
      {labelTex && (
        <mesh position={[0, 0, size[2] * 0.52]}>
          <planeGeometry args={[round ? size[0] * 0.68 : size[0] * 0.88, round ? size[0] * 0.68 : size[1] * 0.84]} />
          <meshStandardMaterial
            map={labelTex}
            roughness={0.44}
            emissive={emissive}
            emissiveIntensity={emissiveIntensity * 0.45}
          />
        </mesh>
      )}
    </group>
  );
}

function ShroudedSafetyJack({
  socketId,
  label,
  u,
  v,
  color,
}: {
  socketId: string;
  label: string;
  u: number;
  v: number;
  color: string;
}) {
  const ref = useRef<THREE.Group>(null);
  const grabbedEnd = useLabStore((s) => s.grabbedEnd);
  const hoveredSocket = useLabStore((s) => s.hoverLabel === label || s.hoverLabel === `${label} (Klik: kabel banana)`);
  const clickSocket = useLabStore((s) => s.clickSocket);
  const setHoverLabel = useLabStore((s) => s.setHoverLabel);
  const [x, y] = uvToXY(u, v);

  useLayoutEffect(() => {
    registerObjectSocket(ref.current, socketId, label, 'banana', 'z', 0.009);
    return () => socketRegistry.unregister(socketId);
  }, [socketId, label]);

  return (
    <group
      ref={ref}
      position={[x, y, 0.0036]}
      name={`dm3058_jack_${socketId}`}
      onPointerOver={(e) => {
        e.stopPropagation();
        hotRefs.hoveredSocketId = socketId;
        setHoverLabel(grabbedEnd ? label : `${label} (Klik: kabel banana)`);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        if (hotRefs.hoveredSocketId === socketId) hotRefs.hoveredSocketId = null;
        setHoverLabel(null);
        document.body.style.cursor = 'auto';
      }}
      onClick={(e) => {
        e.stopPropagation();
        clickSocket(socketId, color);
      }}
    >
      {/* Colored insulated outer safety collar */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.0068, 0.0074, 0.0068, 18]} />
        <meshStandardMaterial
          color={color}
          roughness={0.36}
          emissive={hoveredSocket || grabbedEnd ? color : '#000000'}
          emissiveIntensity={hoveredSocket ? 0.35 : grabbedEnd ? 0.14 : 0}
        />
      </mesh>
      {/* Deep dark shroud cavity */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.001]}>
        <cylinderGeometry args={[0.0046, 0.0046, 0.0062, 18]} />
        <meshStandardMaterial color="#0b0d11" roughness={0.85} />
      </mesh>
      {/* Inner nickel-plated 4mm banana contact sleeve */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.0016]}>
        <cylinderGeometry args={[0.0022, 0.0022, 0.0064, 16]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.88} roughness={0.22} />
      </mesh>
    </group>
  );
}

export function RigolDM3058Mesh({
  position = [0.64, 0.78, 0.02],
  rotation = [0, -0.40, 0],
}: {
  position?: [number, number, number];
  rotation?: [number, number, number];
}) {
  const dm = useLabStore((s) => s.dm3058);
  const pressBtn = useLabStore((s) => s.pressDM3058Button);
  const setCameraTarget = useLabStore((s) => s.setCameraTarget);

  const faceplateGeo = useMemo(() => getDM3058FaceplateGeometry(), []);
  const staticParts = useMemo(() => getMergedDM3058StaticParts(), []);
  const frontTex = useMemo(() => getDM3058FrontPanelTexture(), []);
  const sideTex = useMemo(() => getDM3058SideTexture(), []);
  const rearTex = useMemo(() => getDM3058RearTexture(), []);
  const grainRough = useMemo(() => getChassisGrainRoughnessMap(), []);

  const [{ renderer: lcdRenderer, tex: lcdTex }] = useState(() => {
    const r = new DM3058LCDRenderer();
    const t = new THREE.CanvasTexture(r.canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    return { renderer: r, tex: t };
  });

  const lastDrawMs = useRef(0);
  const lastDrawKey = useRef('');

  useEffect(() => () => lcdTex.dispose(), [lcdTex]);

  useEffect(() => {
    lastDrawKey.current = '';
  }, [dm]);

  useFrame(({ clock }) => {
    const nowMs = clock.elapsedTime * 1000;
    if (nowMs - lastDrawMs.current < 48) return;
    lastDrawMs.current = nowMs;

    const m = hotRefs.dm3058Meas;
    const key = `${dm.dirtySeq}_${m.sampleSeq}`;
    if (key !== lastDrawKey.current) {
      lastDrawKey.current = key;
      lcdRenderer.render(dm, m, hotRefs.dm3058History, hotRefs.dm3058Stats);
      texNeedsUpload(lcdTex);
    }

    // Real audible continuity buzzer when func === 'CONT' and continuity < threshold
    if (dm.power && dm.func === 'CONT' && dm.beeper && m.connectedMain) {
      const ohms = extractRawValue('CONT', m);
      if (Number.isFinite(ohms) && ohms <= dm.contThresholdOhms && nowMs - hotRefs.dm3058LastBeepMs > 280) {
        hotRefs.dm3058LastBeepMs = nowMs;
        labAudio.playContinuityBeep();
      }
    }
  });

  // 4:1 LCD center matching sculpted hollow window u=[0.130..0.566], v=[0.238..0.4743]
  const lcdX = ((0.130 + 0.566) / 2 - 0.5) * W;
  const lcdY = (0.5 - (0.238 + 0.4743) / 2) * H;
  const lcdW = (0.566 - 0.130) * W + 0.0024;
  const lcdH = (0.4743 - 0.238) * H + 0.0014;

  const [usbX, usbY] = uvToXY(0.056, 0.355);
  const [dpadX, dpadY] = uvToXY(0.682, 0.495);

  const measActive = (fn: string, altFn?: string) =>
    dm.power && (dm.func === fn || (altFn !== undefined && dm.func === altFn));

  const softkeyCols = [0.1663, 0.2390, 0.3117, 0.3843, 0.4570, 0.5297] as const;
  const keypadCols = [0.165, 0.237, 0.309, 0.381, 0.453, 0.530] as const;

  return (
    <group
      position={[position[0], position[1] + H * 0.5 + 0.011, position[2]]}
      rotation={rotation}
      name="rigol_dm3058_root"
      onDoubleClick={(e) => {
        if (useLabStore.getState().grabbedEnd) return;
        e.stopPropagation();
        setCameraTarget('dmm');
      }}
    >
      {/* Slight upward instrument stand tilt matching tilted bail on bench */}
      <group rotation={[-0.12, 0, 0]}>
        {/* Main Light-Gray Molded Chassis Enclosure */}
        <RoundedBox args={[W - 0.004, H - 0.004, D - 0.006]} radius={0.004} smoothness={3} castShadow receiveShadow>
          <meshStandardMaterial color="#dfe2e7" roughness={0.56} roughnessMap={grainRough} />
        </RoundedBox>

        {/* Left & Right Perforated Cooling Louver Side Panels */}
        <mesh position={[-(W / 2 - 0.0015), 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[D - 0.032, H - 0.014]} />
          <meshStandardMaterial map={sideTex} roughness={0.62} />
        </mesh>
        <mesh position={[W / 2 - 0.0015, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[D - 0.032, H - 0.014]} />
          <meshStandardMaterial map={sideTex} roughness={0.62} />
        </mesh>

        {/* Rear Interface & Fuse Plate */}
        <mesh position={[0, 0, -D / 2 - 0.0005]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[W - 0.012, H - 0.012]} />
          <meshStandardMaterial map={rearTex} roughness={0.58} />
        </mesh>

        {/* Merged 8 Ribbed Rubber Corner Bumpers + Pivoting Bail Stand (53 meshes -> 3 draw calls!) */}
        <mesh geometry={staticParts.body}>
          <meshStandardMaterial color="#878b91" roughness={0.76} />
        </mesh>
        <mesh geometry={staticParts.ribs}>
          <meshStandardMaterial color="#767a80" roughness={0.8} />
        </mesh>
        <mesh geometry={staticParts.bail}>
          <meshStandardMaterial color="#585c62" roughness={0.58} />
        </mesh>

        {/* Front Faceplate Assembly */}
        <group position={[0, 0, FRONT_Z]}>
          {/* Single sculpted UV-mapped bezel mesh with hollow 3D LCD opening */}
          <mesh geometry={faceplateGeo} receiveShadow>
            <meshStandardMaterial map={frontTex} roughness={0.50} roughnessMap={grainRough} />
          </mesh>

          {/* Live 256x64 Dot-Matrix Monochrome LCD cleanly recessed behind sloped funnel */}
          <mesh position={[lcdX, lcdY, -0.0016]}>
            <planeGeometry args={[lcdW, lcdH]} />
            <meshStandardMaterial
              map={lcdTex}
              emissiveMap={dm.power ? lcdTex : undefined}
              emissive={dm.power ? '#cdeeff' : '#000000'}
              emissiveIntensity={dm.power ? 0.56 : 0}
              roughness={0.22}
            />
          </mesh>

          {/* USB Host Front Receptacle */}
          <group position={[usbX, usbY, 0.0038]}>
            <mesh>
              <boxGeometry args={[0.0088, 0.0175, 0.0022]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.78} roughness={0.28} />
            </mesh>
            <mesh position={[0, 0, 0.0008]}>
              <boxGeometry args={[0.0058, 0.014, 0.0014]} />
              <meshStandardMaterial color="#0f172a" roughness={0.9} />
            </mesh>
            <mesh position={[-0.0012, 0, 0.0013]}>
              <boxGeometry args={[0.0018, 0.011, 0.001]} />
              <meshStandardMaterial color="#f8fafc" roughness={0.4} />
            </mesh>
          </group>

          {/* Power Soft Switch (Left-bottom, illuminated soft lime when ON) */}
          <DMKey
            id="POWER"
            hoverText="Power DM3058"
            keyKind="POWER"
            u={0.078}
            v={0.785}
            size={[0.0115, 0.0115, 0.0046]}
            round
            color={dm.power ? '#e3ed8a' : '#cfd5de'}
            emissive={dm.power ? '#d9eb5b' : '#000000'}
            emissiveIntensity={dm.power ? 0.34 : 0}
            onPress={pressBtn}
          />

          {/* 6 Softkeys Directly Below LCD */}
          {softkeyCols.map((su, idx) => (
            <DMKey
              key={idx}
              id={`SOFT_${idx}` as DM3058ButtonId}
              hoverText={`Softkey F${idx + 1}`}
              u={su}
              v={0.576}
              size={[0.0118, 0.0058, 0.0048]}
              color="#7190b0"
              onPress={pressBtn}
            />
          ))}

          {/* Bottom 2x6 Measurement + Preset Keypad */}
          <DMKey
            id="DCV"
            hoverText="DC Voltage (DCV)"
            keyKind="DCV"
            u={keypadCols[0]}
            v={0.715}
            size={[0.0132, 0.0086, 0.0046]}
            color={measActive('DCV') ? '#e8f0a4' : '#d2d7df'}
            emissive={measActive('DCV') ? '#dbe96e' : '#000000'}
            emissiveIntensity={measActive('DCV') ? 0.25 : 0}
            onPress={pressBtn}
          />
          <DMKey
            id="DCI"
            hoverText="DC Current (DCI)"
            keyKind="DCI"
            u={keypadCols[1]}
            v={0.715}
            size={[0.0132, 0.0086, 0.0046]}
            color={measActive('DCI') ? '#e8f0a4' : '#d2d7df'}
            emissive={measActive('DCI') ? '#dbe96e' : '#000000'}
            emissiveIntensity={measActive('DCI') ? 0.25 : 0}
            onPress={pressBtn}
          />
          <DMKey
            id="OHM"
            hoverText="Resistance 2W / 2ND: 4W"
            keyKind="OHM"
            u={keypadCols[2]}
            v={0.715}
            size={[0.0132, 0.0086, 0.0046]}
            color={measActive('2WR', '4WR') ? '#e8f0a4' : '#d2d7df'}
            emissive={measActive('2WR', '4WR') ? '#dbe96e' : '#000000'}
            emissiveIntensity={measActive('2WR', '4WR') ? 0.25 : 0}
            onPress={pressBtn}
          />
          <DMKey
            id="CONT"
            hoverText="Continuity Test"
            keyKind="CONT"
            u={keypadCols[3]}
            v={0.715}
            size={[0.0132, 0.0086, 0.0046]}
            color={measActive('CONT') ? '#e8f0a4' : '#d2d7df'}
            emissive={measActive('CONT') ? '#dbe96e' : '#000000'}
            emissiveIntensity={measActive('CONT') ? 0.25 : 0}
            onPress={pressBtn}
          />
          <DMKey
            id="FREQ"
            hoverText="Frequency / 2ND: Period"
            keyKind="FREQ"
            u={keypadCols[4]}
            v={0.715}
            size={[0.0132, 0.0086, 0.0046]}
            color={measActive('FREQ', 'PER') ? '#e8f0a4' : '#d2d7df'}
            emissive={measActive('FREQ', 'PER') ? '#dbe96e' : '#000000'}
            emissiveIntensity={measActive('FREQ', 'PER') ? 0.25 : 0}
            onPress={pressBtn}
          />
          <DMKey
            id="PRESET"
            hoverText="Preset Menu"
            keyKind="PRESET"
            u={keypadCols[5]}
            v={0.715}
            size={[0.0124, 0.0086, 0.0046]}
            color={dm.menu === 'PRESET' ? '#e8f0a4' : '#d2d7df'}
            onPress={pressBtn}
          />

          <DMKey
            id="ACV"
            hoverText="AC Voltage (ACV True-RMS)"
            keyKind="ACV"
            u={keypadCols[0]}
            v={0.842}
            size={[0.0132, 0.0086, 0.0046]}
            color={measActive('ACV') ? '#e8f0a4' : '#d2d7df'}
            emissive={measActive('ACV') ? '#dbe96e' : '#000000'}
            emissiveIntensity={measActive('ACV') ? 0.25 : 0}
            onPress={pressBtn}
          />
          <DMKey
            id="ACI"
            hoverText="AC Current (ACI True-RMS)"
            keyKind="ACI"
            u={keypadCols[1]}
            v={0.842}
            size={[0.0132, 0.0086, 0.0046]}
            color={measActive('ACI') ? '#e8f0a4' : '#d2d7df'}
            emissive={measActive('ACI') ? '#dbe96e' : '#000000'}
            emissiveIntensity={measActive('ACI') ? 0.25 : 0}
            onPress={pressBtn}
          />
          <DMKey
            id="CAP"
            hoverText="Capacitance"
            keyKind="CAP"
            u={keypadCols[2]}
            v={0.842}
            size={[0.0132, 0.0086, 0.0046]}
            color={measActive('CAP') ? '#e8f0a4' : '#d2d7df'}
            emissive={measActive('CAP') ? '#dbe96e' : '#000000'}
            emissiveIntensity={measActive('CAP') ? 0.25 : 0}
            onPress={pressBtn}
          />
          <DMKey
            id="DIODE"
            hoverText="Diode Test"
            keyKind="DIODE"
            u={keypadCols[3]}
            v={0.842}
            size={[0.0132, 0.0086, 0.0046]}
            color={measActive('DIODE') ? '#e8f0a4' : '#d2d7df'}
            emissive={measActive('DIODE') ? '#dbe96e' : '#000000'}
            emissiveIntensity={measActive('DIODE') ? 0.25 : 0}
            onPress={pressBtn}
          />
          <DMKey
            id="SENSOR"
            hoverText="Sensor (TC)"
            keyKind="SENSOR"
            u={keypadCols[4]}
            v={0.842}
            size={[0.0132, 0.0086, 0.0046]}
            color={measActive('SENSOR') ? '#e8f0a4' : '#d2d7df'}
            emissive={measActive('SENSOR') ? '#dbe96e' : '#000000'}
            emissiveIntensity={measActive('SENSOR') ? 0.25 : 0}
            onPress={pressBtn}
          />
          <DMKey
            id="SECOND"
            hoverText="2ND Secondary Function Shift"
            keyKind="SECOND"
            u={keypadCols[5]}
            v={0.842}
            size={[0.0124, 0.0086, 0.0046]}
            color={dm.secondShift ? '#fde68a' : '#d2d7df'}
            emissive={dm.secondShift ? '#f59e0b' : '#000000'}
            emissiveIntensity={dm.secondShift ? 0.35 : 0}
            onPress={pressBtn}
          />

          {/* Right Fascia: Run/Hold & Single Amber Trigger Buttons */}
          <DMKey
            id="RUN_HOLD"
            hoverText="Run / Hold"
            keyKind="RUN_HOLD"
            u={0.642}
            v={0.245}
            baseZ={0.0030}
            size={[0.0145, 0.0088, 0.0044]}
            color={dm.power ? (dm.runState === 'HOLD' ? '#fde68a' : '#e8f0a4') : '#d2d7df'}
            emissive={dm.power ? (dm.runState === 'HOLD' ? '#f59e0b' : '#dce96e') : '#000000'}
            emissiveIntensity={dm.power ? 0.24 : 0}
            onPress={pressBtn}
          />
          <DMKey
            id="SINGLE"
            hoverText="Single / Local"
            keyKind="SINGLE"
            u={0.722}
            v={0.245}
            baseZ={0.0030}
            size={[0.0145, 0.0088, 0.0044]}
            color={dm.trigSource === 'SINGLE' ? '#fde68a' : '#d2d7df'}
            onPress={pressBtn}
          />

          {/* Circular 5-Way D-Pad (Up / Down / Left / Right / Center Auto) */}
          <group position={[dpadX, dpadY, 0.0020]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.0132, 0.0138, 0.0022, 28]} />
              <meshStandardMaterial color="#b4bcc6" roughness={0.55} />
            </mesh>
          </group>
          <DMKey id="UP" hoverText="Range+" u={0.682} v={0.432} baseZ={0.0035} size={[0.0072, 0.0052, 0.0038]} onPress={pressBtn} />
          <DMKey id="DOWN" hoverText="Range-" u={0.682} v={0.558} baseZ={0.0035} size={[0.0072, 0.0052, 0.0038]} onPress={pressBtn} />
          <DMKey id="LEFT" hoverText="Kiri / Speed" u={0.644} v={0.495} baseZ={0.0035} size={[0.0054, 0.0072, 0.0038]} onPress={pressBtn} />
          <DMKey id="RIGHT" hoverText="Kanan / Speed" u={0.720} v={0.495} baseZ={0.0035} size={[0.0054, 0.0072, 0.0038]} onPress={pressBtn} />
          <DMKey
            id="AUTO"
            hoverText="Auto Range"
            keyKind="AUTO"
            u={0.682}
            v={0.495}
            baseZ={0.0038}
            size={[0.0092, 0.0092, 0.0040]}
            round
            color={dm.autoRange ? '#dce5ef' : '#cbd3dc'}
            onPress={pressBtn}
          />

          {/* 2x3 System Assistant Function Keys */}
          <DMKey id="MEAS" hoverText="Meas Setup" keyKind="Meas" u={0.625} v={0.715} baseZ={0.0030} size={[0.0106, 0.0080, 0.0042]} color={dm.menu === 'MEAS' ? '#dce7f5' : '#d2d7df'} onPress={pressBtn} />
          <DMKey id="MATH" hoverText="Math Functions" keyKind="Math" u={0.682} v={0.715} baseZ={0.0030} size={[0.0106, 0.0080, 0.0042]} color={dm.menu === 'MATH' || dm.mathMode !== 'OFF' ? '#dce7f5' : '#d2d7df'} onPress={pressBtn} />
          <DMKey id="TRIG" hoverText="Trigger Setup" keyKind="Trig" u={0.739} v={0.715} baseZ={0.0030} size={[0.0106, 0.0080, 0.0042]} color={dm.menu === 'TRIG' ? '#dce7f5' : '#d2d7df'} onPress={pressBtn} />
          <DMKey id="HELP" hoverText="Built-in Help" keyKind="Help" u={0.625} v={0.840} baseZ={0.0030} size={[0.0106, 0.0080, 0.0042]} color={dm.menu === 'HELP' ? '#dce7f5' : '#d2d7df'} onPress={pressBtn} />
          <DMKey id="SAVE" hoverText="Save / Recall" keyKind="Save" u={0.682} v={0.840} baseZ={0.0030} size={[0.0106, 0.0080, 0.0042]} color={dm.menu === 'SAVE' ? '#dce7f5' : '#d2d7df'} onPress={pressBtn} />
          <DMKey id="UTILITY" hoverText="Utility / System" keyKind="Utility" u={0.739} v={0.840} baseZ={0.0030} size={[0.0106, 0.0080, 0.0042]} color={dm.menu === 'UTILITY' ? '#dce7f5' : '#d2d7df'} onPress={pressBtn} />

          {/* 5 Deep-Recessed Shrouded Safety 4mm Banana Input Terminals */}
          <ShroudedSafetyJack socketId="dmm_sense_hi" label="DM3058 Sense HI (4W)" u={0.816} v={0.305} color="#c62828" />
          <ShroudedSafetyJack socketId="dmm_sense_lo" label="DM3058 Sense LO (4W)" u={0.816} v={0.505} color="#18181b" />
          <ShroudedSafetyJack socketId="dmm_pos" label="DM3058 Input HI (V/Ω/C/F)" u={0.910} v={0.305} color="#c62828" />
          <ShroudedSafetyJack socketId="dmm_com" label="DM3058 Input LO (COM)" u={0.910} v={0.505} color="#18181b" />
          <ShroudedSafetyJack socketId="dmm_i" label="DM3058 Input I (10A RMS)" u={0.910} v={0.695} color="#c62828" />
        </group>
      </group>
    </group>
  );
}

function texNeedsUpload(t: THREE.CanvasTexture): void {
  t.needsUpdate = true;
}
