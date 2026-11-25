import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { labAudio } from '../../audio/labAudio';
import {
  computeDecadeBoxOhms,
  DECADE_BOX_SOCKETS,
  DECADE_DIAL_SPECS,
  formatOhmsCompact,
} from '../../simulation/kits/kitDefinitions';
import { hotRefs } from '../../state/hotRefs';
import { useLabStore } from '../../state/labStore';
import { registerObjectSocket, socketRegistry } from '../cables/socketRegistry';
import { getDecadeBoxFaceplateTexture } from '../textures/kitTextures';

const BW = 0.214;
const BH = 0.142;
const BD = 0.044;

function DecadeBananaSocket({
  id,
  label,
  u,
  v,
  color,
}: {
  id: string;
  label: string;
  u: number;
  v: number;
  color: string;
}) {
  const ref = useRef<THREE.Group>(null);
  const grabbedEnd = useLabStore((s) => s.grabbedEnd);
  const clickSocket = useLabStore((s) => s.clickSocket);
  const setHoverLabel = useLabStore((s) => s.setHoverLabel);

  useLayoutEffect(() => {
    registerObjectSocket(ref.current, id, label, 'banana', 'z', 0.008);
    return () => socketRegistry.unregister(id);
  }, [id, label]);

  const x = (u - 0.5) * BW;
  const y = (0.5 - v) * BH;

  return (
    <group
      ref={ref}
      position={[x, y, BD / 2 + 0.003]}
      onPointerOver={(e) => {
        e.stopPropagation();
        hotRefs.hoveredSocketId = id;
        setHoverLabel(grabbedEnd ? label : `${label} (Klik: kabel banana)`);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        if (hotRefs.hoveredSocketId === id) hotRefs.hoveredSocketId = null;
        setHoverLabel(null);
        document.body.style.cursor = 'auto';
      }}
      onClick={(e) => {
        e.stopPropagation();
        clickSocket(id);
      }}
    >
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.0044, 0.0044, 0.004, 14]} />
        <meshStandardMaterial color={color} roughness={0.38} metalness={0.12} />
      </mesh>
      <mesh position={[0, 0, 0.0022]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.0021, 0.0021, 0.0024, 12]} />
        <meshStandardMaterial color="#111827" roughness={0.6} />
      </mesh>
    </group>
  );
}

function DecadeDialKnob({
  label,
  value,
  totalLabel,
  u,
  v,
  onStep,
}: {
  label: string;
  value: number;
  totalLabel: string;
  u: number;
  v: number;
  onStep: (delta: number) => void;
}) {
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const lastYRef = useRef(0);
  const accumRef = useRef(0);
  const setHoverLabel = useLabStore((s) => s.setHoverLabel);
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;

  useEffect(() => {
    const move = (ev: PointerEvent) => {
      if (!draggingRef.current) return;
      const dy = lastYRef.current - ev.clientY;
      lastYRef.current = ev.clientY;
      accumRef.current += dy;
      if (Math.abs(accumRef.current) > 10) {
        movedRef.current = true;
        const s = Math.trunc(accumRef.current / 10);
        accumRef.current -= s * 10;
        onStepRef.current(s);
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

  const angleRad = ((140 - value * 28) * Math.PI) / 180;

  return (
    <group
      position={[(u - 0.5) * BW, (0.5 - v) * BH, BD / 2 + 0.0040]}
      rotation={[0, 0, angleRad]}
      onPointerOver={(e) => {
        if (useLabStore.getState().grabbedEnd) return;
        e.stopPropagation();
        hotRefs.knobHovered = true;
        setHoverLabel(`Dekade ${label} = ${value} · Total R = ${totalLabel} (Klik/Scroll/Drag)`);
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
      onClick={(e) => {
        if (useLabStore.getState().grabbedEnd) return;
        e.stopPropagation();
        if (!movedRef.current) {
          onStep(e.shiftKey ? -1 : 1);
        }
      }}
      onContextMenu={(e) => {
        if (useLabStore.getState().grabbedEnd) return;
        e.stopPropagation();
        e.nativeEvent.preventDefault();
        onStep(-1);
      }}
      onWheel={(e) => {
        e.stopPropagation();
        onStep(e.deltaY < 0 ? 1 : -1);
      }}
    >
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.0074, 0.0085, 0.0056, 18]} />
        <meshStandardMaterial color="#181c22" roughness={0.44} metalness={0.14} />
      </mesh>
      <mesh position={[0, 0, 0.0030]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.0040, 0.0044, 0.0010, 16]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.28} metalness={0.78} />
      </mesh>
      <mesh position={[0, 0.0056, 0.0033]}>
        <boxGeometry args={[0.0018, 0.0074, 0.0015]} />
        <meshStandardMaterial
          color={value > 0 ? '#f59e0b' : '#f8fafc'}
          emissive={value > 0 ? '#d97706' : '#000000'}
          emissiveIntensity={value > 0 ? 0.45 : 0}
        />
      </mesh>
    </group>
  );
}

function DecadeTotalReadoutPlate({ totalOhms }: { totalOhms: number }) {
  const [{ ctx, tex }] = useState(() => {
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 64;
    const context = c.getContext('2d')!;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return { ctx: context, tex: t };
  });

  useEffect(() => () => tex.dispose(), [tex]);

  useEffect(() => {
    ctx.fillStyle = '#07131e';
    ctx.fillRect(0, 0, 320, 64);
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 14px "IBM Plex Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('TOTAL R', 12, 22);
    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 30px "IBM Plex Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(formatOhmsCompact(totalOhms), 308, 48);
    tex.needsUpdate = true;
  }, [ctx, tex, totalOhms]);

  return (
    <mesh position={[(0.8175 - 0.5) * (BW - 0.006), (0.5 - 0.0735) * (BH - 0.006), BD / 2 + 0.0018]}>
      <planeGeometry args={[(BW - 0.006) * 0.278, (BH - 0.006) * 0.071]} />
      <meshStandardMaterial
        map={tex}
        emissiveMap={tex}
        emissive="#10b981"
        emissiveIntensity={0.45}
        roughness={0.25}
      />
    </mesh>
  );
}

/**
 * Standalone Matte-Black 8-Dial Decade Resistance Box (Kotak Potensiometer 8-Skala).
 * Always available on the lab bench simultaneously with any LDTE Kit!
 */
export function DecadeBoxMesh({ position = [0.31, 0.782, 0.235] }: { position?: [number, number, number] }) {
  const rawDials = useLabStore((s) => s.kitControls.decadeDials);
  const updateKit = useLabStore((s) => s.updateKitControls);
  const setCameraTarget = useLabStore((s) => s.setCameraTarget);
  const setHoverLabel = useLabStore((s) => s.setHoverLabel);

  const faceTex = useMemo(() => getDecadeBoxFaceplateTexture(), []);
  const dials: number[] = rawDials && rawDials.length >= 8 ? rawDials : [0, 0, 0, 1, 5, 0, 0, 0];
  const totalOhms = computeDecadeBoxOhms(dials);
  const totalLabel = formatOhmsCompact(totalOhms);

  return (
    <group
      position={[position[0], position[1], position[2]]}
      rotation={[0, -0.14, 0]}
      name="decade_box_root"
    >
      {/* Ergonomic low-sloped desktop console tilt (~24° toward user so all 8 dials read clearly without blocking rear gear!) */}
      <group
        position={[0, 0.036, 0]}
        rotation={[-1.14, 0, 0]}
        onPointerOver={(e) => {
          if (useLabStore.getState().grabbedEnd) return;
          e.stopPropagation();
          setHoverLabel(`Potensiometer 8-Dekade · Total R = ${totalLabel} (Dobel klik: Fokus)`);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHoverLabel(null);
          document.body.style.cursor = 'auto';
        }}
        onDoubleClick={(e) => {
          if (useLabStore.getState().grabbedEnd) return;
          e.stopPropagation();
          setCameraTarget('pot');
        }}
      >
        {/* Matte-Black Bakelite / Powder-Coated Lab Enclosure */}
        <RoundedBox args={[BW, BH, BD]} radius={0.004} smoothness={3}>
          <meshStandardMaterial color="#1a1f27" roughness={0.56} metalness={0.22} />
        </RoundedBox>

        {/* Crisp Front Scale Silkscreen Faceplate */}
        <mesh position={[0, 0, BD / 2 + 0.0010]}>
          <planeGeometry args={[BW - 0.006, BH - 0.006]} />
          <meshStandardMaterial map={faceTex} roughness={0.36} metalness={0.08} />
        </mesh>

        {/* Live Total Resistance Readout Plate */}
        <DecadeTotalReadoutPlate totalOhms={totalOhms} />

        {/* 8 Interactive Rotary Scale Dials (summed in series between A and B) */}
        {DECADE_DIAL_SPECS.map((spec, idx) => (
          <DecadeDialKnob
            key={spec.label}
            label={spec.label}
            value={dials[idx] ?? 0}
            totalLabel={totalLabel}
            u={spec.u}
            v={spec.v}
            onStep={(delta) => {
              labAudio.playKnobDetent();
              const next = [...dials];
              const cur = next[idx] ?? 0;
              let val = cur + delta;
              if (val > 10) val = 0;
              if (val < 0) val = 10;
              next[idx] = val;
              updateKit({ decadeDials: next });
            }}
          />
        ))}

        {/* Bottom 4mm Banana Terminals: A (+), B (-), Case GND */}
        {DECADE_BOX_SOCKETS.map((s) => (
          <DecadeBananaSocket key={s.id} {...s} />
        ))}
      </group>

      {/* Low rubber desk base wedge underneath so box sits cleanly grounded on ESD mat */}
      <mesh position={[0, 0.006, -0.005]}>
        <boxGeometry args={[BW - 0.012, 0.012, BH * 0.72]} />
        <meshStandardMaterial color="#11151b" roughness={0.78} />
      </mesh>
    </group>
  );
}
