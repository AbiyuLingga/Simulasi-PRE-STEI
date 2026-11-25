import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { RoundedBox } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { hotRefs } from '../../state/hotRefs';
import { useLabStore } from '../../state/labStore';
import { registerObjectSocket, socketRegistry } from '../cables/socketRegistry';
import {
  getButtonLabelTexture,
  getChassisGrainRoughnessMap,
  getPsuFaceplateTexture,
} from '../textures/proceduralTextures';

const W = 0.24;
const H = 0.135;
const D = 0.22;

function PSUKnob({
  label,
  pos,
  onTurn,
}: {
  label: string;
  pos: [number, number, number];
  onTurn: (steps: number) => void;
}) {
  const ref = useRef<THREE.Group>(null);
  const angleRef = useRef(0);
  const draggingRef = useRef(false);
  const lastYRef = useRef(0);
  const accumRef = useRef(0);
  const setHoverLabel = useLabStore((s) => s.setHoverLabel);

  useFrame((_, dt) => {
    if (!ref.current) return;
    const diff = angleRef.current - ref.current.rotation.z;
    if (Math.abs(diff) < 1e-4) return;
    ref.current.rotation.z =
      Math.abs(diff) < 2e-4 ? angleRef.current : THREE.MathUtils.lerp(ref.current.rotation.z, angleRef.current, Math.min(1, dt * 20));
  });

  const onTurnRef = useRef(onTurn);
  onTurnRef.current = onTurn;

  useEffect(() => {
    const move = (ev: PointerEvent) => {
      if (!draggingRef.current) return;
      const dy = lastYRef.current - ev.clientY;
      lastYRef.current = ev.clientY;
      accumRef.current += dy;
      if (Math.abs(accumRef.current) > 8) {
        const s = Math.trunc(accumRef.current / 8);
        accumRef.current -= s * 8;
        angleRef.current -= s * 0.25;
        onTurnRef.current(s);
      }
    };
    const up = () => {
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
      onPointerOver={(e) => {
        e.stopPropagation();
        hotRefs.knobHovered = true;
        setHoverLabel(label);
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
        accumRef.current = 0;
        lastYRef.current = e.clientY;
      }}
      onWheel={(e) => {
        e.stopPropagation();
        const s = e.deltaY < 0 ? 1 : -1;
        angleRef.current -= s * 0.25;
        onTurn(s);
      }}
    >
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.013, 0.0138, 0.014, 16]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.38} metalness={0.22} />
      </mesh>
      <mesh position={[0, 0.007, 0.0075]}>
        <boxGeometry args={[0.002, 0.0055, 0.002]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
    </group>
  );
}

function BananaJack({
  socketId,
  label,
  pos,
  color,
}: {
  socketId: string;
  label: string;
  pos: [number, number, number];
  color: string;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const grabbedEnd = useLabStore((s) => s.grabbedEnd);
  const clickSocket = useLabStore((s) => s.clickSocket);
  const setHoverLabel = useLabStore((s) => s.setHoverLabel);

  useLayoutEffect(() => {
    registerObjectSocket(ref.current, socketId, label, 'banana', 'y', 0.006);
    return () => socketRegistry.unregister(socketId);
  }, [socketId, label]);

  return (
    <mesh
      ref={ref}
      position={pos}
      rotation={[Math.PI / 2, 0, 0]}
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
      <cylinderGeometry args={[0.006, 0.006, 0.011, 16]} />
      <meshStandardMaterial color={color} roughness={0.35} />
    </mesh>
  );
}

export function DualPowerSupplyMesh({
  position = [0.35, 0.78, -0.18],
}: {
  position?: [number, number, number];
}) {
  const psu = useLabStore((s) => s.powerSupply);
  const updatePsu = useLabStore((s) => s.updatePowerSupply);
  const setCameraTarget = useLabStore((s) => s.setCameraTarget);
  const setHoverLabel = useLabStore((s) => s.setHoverLabel);

  const roughTex = useMemo(() => getChassisGrainRoughnessMap(), []);
  const faceTex = useMemo(() => getPsuFaceplateTexture(), []);
  const texPreset12 = useMemo(() => getButtonLabelTexture('±12V', '#cbd5e1', '#0f172a'), []);
  const texOutput = useMemo(() => getButtonLabelTexture('OUTPUT', '#22c55e', '#091119'), []);

  const [{ canvas, ctx, tex }] = useState(() => {
    const c = document.createElement('canvas');
    c.width = 384;
    c.height = 112;
    const context = c.getContext('2d')!;
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    return { canvas: c, ctx: context, tex: texture };
  });

  const psuKey = `${psu.power}-${psu.outputEnabled}-${psu.ch1Voltage}-${psu.ch2Voltage}-${psu.trackingDual12V}`;

  useEffect(() => () => tex.dispose(), [tex]);

  useEffect(() => {
    ctx.fillStyle = '#090d14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (psu.power) {
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 34px "IBM Plex Mono", monospace';
      ctx.fillText(`${psu.ch1Voltage.toFixed(1)}V`, 16, 48);
      ctx.fillText(`${psu.ch2Voltage.toFixed(1)}V`, 212, 48);

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 18px "IBM Plex Mono", monospace';
      ctx.fillText(`LIM ${psu.ch1CurrentLimit.toFixed(1)}A`, 16, 92);
      ctx.fillText(`LIM ${psu.ch2CurrentLimit.toFixed(1)}A`, 212, 92);

      ctx.fillStyle = psu.outputEnabled ? '#22c55e' : '#64748b';
      ctx.font = 'bold 15px "IBM Plex Sans", sans-serif';
      ctx.fillText(psu.outputEnabled ? 'OUT' : 'STBY', 152, 92);
    }
    tex.needsUpdate = true;
  }, [psuKey, canvas, ctx, tex, psu]);

  return (
    <group
      position={[position[0], position[1] + H * 0.5, position[2]]}
      rotation={[0, -0.14, 0]}
      name="power_supply_root"
      onDoubleClick={(e) => {
        e.stopPropagation();
        setCameraTarget('psu');
      }}
    >
      <RoundedBox args={[W, H, D]} radius={0.005} smoothness={4} castShadow receiveShadow>
        <meshStandardMaterial color="#dad7ce" roughness={0.55} roughnessMap={roughTex} metalness={0.06} />
      </RoundedBox>
      <mesh position={[0, 0, D / 2 + 0.001]}>
        <planeGeometry args={[W - 0.012, H - 0.012]} />
        <meshStandardMaterial map={faceTex} roughness={0.48} />
      </mesh>

      {/* Dual LED Segment Readout */}
      <mesh position={[0, 0.029, D / 2 + 0.002]}>
        <planeGeometry args={[0.19, 0.042]} />
        <meshStandardMaterial
          map={tex}
          emissiveMap={tex}
          emissive={psu.power ? '#ffffff' : '#000000'}
          emissiveIntensity={psu.power ? 0.92 : 0}
          roughness={0.2}
        />
      </mesh>

      {/* CH1 & CH2 Voltage Knobs */}
      <PSUKnob
        label="PSU CH1 VOLTS"
        pos={[-0.065, -0.006, D / 2 + 0.007]}
        onTurn={(s) =>
          updatePsu({
            trackingDual12V: false,
            ch1Voltage: Math.min(30, Math.max(0, Number((psu.ch1Voltage + s * 0.5).toFixed(1)))),
          })
        }
      />
      <PSUKnob
        label="PSU CH2 VOLTS"
        pos={[0.065, -0.006, D / 2 + 0.007]}
        onTurn={(s) =>
          updatePsu({
            trackingDual12V: false,
            ch2Voltage: Math.min(30, Math.max(0, Number((psu.ch2Voltage + s * 0.5).toFixed(1)))),
          })
        }
      />

      {/* ±12V Quick Preset & OUTPUT Toggle */}
      <group
        position={[0, 0.002, D / 2 + 0.004]}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHoverLabel('PSU ±12V Preset');
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHoverLabel(null);
          document.body.style.cursor = 'auto';
        }}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          updatePsu({ trackingDual12V: !psu.trackingDual12V });
        }}
      >
        <mesh>
          <boxGeometry args={[0.032, 0.013, 0.005]} />
          <meshStandardMaterial color={psu.trackingDual12V ? '#f59e0b' : '#94a3b8'} />
        </mesh>
        <mesh position={[0, 0, 0.0027]}>
          <planeGeometry args={[0.031, 0.012]} />
          <meshStandardMaterial map={texPreset12} />
        </mesh>
      </group>

      <group
        position={[0, -0.022, D / 2 + 0.004]}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHoverLabel('PSU OUTPUT');
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHoverLabel(null);
          document.body.style.cursor = 'auto';
        }}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          updatePsu({ outputEnabled: !psu.outputEnabled });
        }}
      >
        <mesh>
          <boxGeometry args={[0.038, 0.014, 0.005]} />
          <meshStandardMaterial
            color={psu.outputEnabled ? '#22c55e' : '#64748b'}
            emissive={psu.outputEnabled ? '#22c55e' : '#000000'}
            emissiveIntensity={psu.outputEnabled ? 0.95 : 0}
          />
        </mesh>
        <mesh position={[0, 0, 0.0027]}>
          <planeGeometry args={[0.037, 0.013]} />
          <meshStandardMaterial map={texOutput} />
        </mesh>
      </group>

      {/* 4mm Banana Output Terminals */}
      <BananaJack socketId="psu_ch1_pos" label="PSU CH1 +" pos={[-0.088, -0.044, D / 2 + 0.006]} color="#dc2626" />
      <BananaJack socketId="psu_ch1_neg" label="PSU CH1 -" pos={[-0.048, -0.044, D / 2 + 0.006]} color="#18181b" />
      <BananaJack socketId="psu_gnd" label="PSU EARTH GND" pos={[0, -0.044, D / 2 + 0.006]} color="#16a34a" />
      <BananaJack socketId="psu_ch2_pos" label="PSU CH2 +" pos={[0.048, -0.044, D / 2 + 0.006]} color="#dc2626" />
      <BananaJack socketId="psu_ch2_neg" label="PSU CH2 -" pos={[0.088, -0.044, D / 2 + 0.006]} color="#18181b" />
    </group>
  );
}
