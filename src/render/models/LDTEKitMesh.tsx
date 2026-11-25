import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type * as THREE from 'three';
import { Html, RoundedBox } from '@react-three/drei';
import { KIT_SOCKETS, KIT_TITLE_MAP } from '../../simulation/kits/kitDefinitions';
import type { KitId } from '../../simulation/circuit/types';
import { hotRefs } from '../../state/hotRefs';
import { useLabStore } from '../../state/labStore';
import { registerObjectSocket, socketRegistry } from '../cables/socketRegistry';
import { getKitFaceplateTexture } from '../textures/kitTextures';

const KIT_CHOICES: ReadonlyArray<{ id: KitId; sub: string }> = [
  { id: 'rl_rc', sub: 'Modul 4 — Transien RL & RC' },
  { id: 'multimeter', sub: 'Modul 1 — Multimeter & Divider' },
  { id: 'osc_gen', sub: 'Modul 2 — Osiloskop, Fasa & Lissajous' },
  { id: 'thevenin', sub: 'Modul 3 — Thevenin & Norton' },
  { id: 'none', sub: 'Lepas Kit dari Meja' },
];

// IEC 4-band resistor color codes for Kit #14 left R1..R5 (220k, 1.5k, 33k, 1.5M, 120Ω)
const KM_RES_BANDS: ReadonlyArray<[string, string, string, string]> = [
  ['#dc2626', '#dc2626', '#eab308', '#d4af37'], // R1 220kΩ: Red-Red-Yellow-Gold
  ['#78350f', '#16a34a', '#dc2626', '#d4af37'], // R2 1.5kΩ: Brown-Green-Red-Gold
  ['#f97316', '#f97316', '#f97316', '#d4af37'], // R3 33kΩ:  Orange-Orange-Orange-Gold
  ['#78350f', '#16a34a', '#16a34a', '#d4af37'], // R4 1.5MΩ: Brown-Green-Green-Gold
  ['#78350f', '#dc2626', '#78350f', '#d4af37'], // R5 120Ω:  Brown-Red-Brown-Gold
];

const KW = 0.248;
const KH = 0.166;
const KD = 0.088;

function KitBananaSocket({
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

  const x = (u - 0.5) * KW;
  const y = (0.5 - v) * KH;

  return (
    <group
      ref={ref}
      position={[x, y, KD / 2 + 0.003]}
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
        <cylinderGeometry args={[0.0046, 0.0046, 0.004, 14]} />
        <meshStandardMaterial color={color} roughness={0.38} metalness={color === '#cbd5e1' ? 0.8 : 0.1} />
      </mesh>
      <mesh position={[0, 0, 0.0022]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.0022, 0.0022, 0.0025, 12]} />
        <meshStandardMaterial color="#111827" roughness={0.6} />
      </mesh>
    </group>
  );
}

function KitKnob({
  label,
  u,
  v,
  angleRad,
  onTurn,
}: {
  label: string;
  u: number;
  v: number;
  angleRad: number;
  onTurn: (steps: number) => void;
}) {
  const draggingRef = useRef(false);
  const lastYRef = useRef(0);
  const accumRef = useRef(0);
  const setHoverLabel = useLabStore((s) => s.setHoverLabel);

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
      position={[(u - 0.5) * KW, (0.5 - v) * KH, KD / 2 + 0.007]}
      rotation={[0, 0, angleRad]}
      onPointerOver={(e) => {
        if (useLabStore.getState().grabbedEnd) return;
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
        if (useLabStore.getState().grabbedEnd) return;
        e.stopPropagation();
        draggingRef.current = true;
        accumRef.current = 0;
        lastYRef.current = e.clientY;
      }}
      onClick={(e) => {
        if (useLabStore.getState().grabbedEnd) return;
        e.stopPropagation();
      }}
      onWheel={(e) => {
        e.stopPropagation();
        onTurn(e.deltaY < 0 ? 1 : -1);
      }}
    >
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.0082, 0.009, 0.011, 16]} />
        <meshStandardMaterial color="#1f242b" roughness={0.42} />
      </mesh>
      <mesh position={[0, 0.005, 0.006]}>
        <boxGeometry args={[0.0016, 0.0045, 0.0015]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
    </group>
  );
}

export function LDTEKitMesh({ position = [-0.63, 0.78, 0.04] }: { position?: [number, number, number] }) {
  const activeKit = useLabStore((s) => s.activeKit);
  const kitSelected = useLabStore((s) => s.kitSelected);
  const kitPickerOpen = useLabStore((s) => s.kitPickerOpen);
  const selectKitBox = useLabStore((s) => s.selectKitBox);
  const setKitPickerOpen = useLabStore((s) => s.setKitPickerOpen);
  const setActiveKit = useLabStore((s) => s.setActiveKit);
  const kitControls = useLabStore((s) => s.kitControls);
  const updateKit = useLabStore((s) => s.updateKitControls);
  const setCameraTarget = useLabStore((s) => s.setCameraTarget);
  const setHoverLabel = useLabStore((s) => s.setHoverLabel);
  const breadboard2D = useLabStore((s) => s.breadboard2D);

  const faceTex = useMemo(
    () => (activeKit === 'none' ? null : getKitFaceplateTexture(activeKit)),
    [activeKit]
  );

  if (activeKit === 'none' || !faceTex) {
    return (
      <group
        position={[position[0], position[1] + 0.004, position[2]]}
        rotation={[0, 0.30, 0]}
        name="ldte_kit_slot_empty"
        onClick={(e) => {
          if (useLabStore.getState().grabbedEnd) return;
          e.stopPropagation();
          selectKitBox(!kitSelected);
          setKitPickerOpen(true);
        }}
      >
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[KW, KD + 0.04]} />
          <meshBasicMaterial color={kitSelected ? '#38bdf8' : '#64748b'} transparent opacity={kitSelected ? 0.3 : 0.16} />
        </mesh>
        {!breadboard2D && kitSelected && (
          <Html position={[0, 0.05, 0]} center zIndexRange={[25, 0]}>
            <div className="pointer-events-auto w-56 rounded-md border border-[#38bdf8] bg-[#0f172a]/95 p-2 text-xs text-[#f8fafc] shadow-2xl backdrop-blur-sm">
              <div className="mb-1.5 flex items-center justify-between font-bold text-[#38bdf8]">
                <span>Pilih Kit Praktikum</span>
                <button
                  type="button"
                  onClick={() => selectKitBox(false)}
                  className="rounded px-1 text-[#94a3b8] hover:text-white"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-1">
                {KIT_CHOICES.filter((k) => k.id !== 'none').map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => setActiveKit(k.id)}
                    className="w-full rounded border border-[#334155] bg-[#1e293b] px-2 py-1.5 text-left hover:border-[#38bdf8]"
                  >
                    <div className="font-semibold text-[#f8fafc]">{KIT_TITLE_MAP[k.id]}</div>
                    <div className="text-[10px] text-[#94a3b8]">{k.sub}</div>
                  </button>
                ))}
              </div>
            </div>
          </Html>
        )}
      </group>
    );
  }

  const sockets = KIT_SOCKETS[activeKit];

  return (
    <group
      position={[position[0], position[1] + KH * 0.48, position[2]]}
      rotation={[-0.24, 0.30, 0]}
      name="ldte_kit_root"
      onPointerOver={(e) => {
        if (useLabStore.getState().grabbedEnd) return;
        e.stopPropagation();
        setHoverLabel(`${KIT_TITLE_MAP[activeKit]} (Klik: Ganti Kit | Dobel klik: Fokus)`);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHoverLabel(null);
        document.body.style.cursor = 'auto';
      }}
      onClick={(e) => {
        if (e.delta > 6 || useLabStore.getState().grabbedEnd) return;
        e.stopPropagation();
        selectKitBox(!kitSelected);
      }}
      onDoubleClick={(e) => {
        if (useLabStore.getState().grabbedEnd) return;
        e.stopPropagation();
        selectKitBox(false);
        setCameraTarget('kit');
      }}
    >
      {/* Brushed Aluminum Grey Trainer Enclosure Box with Blue Selection Highlight */}
      <RoundedBox args={[KW, KH, KD]} radius={0.004} smoothness={3}>
        <meshStandardMaterial
          color={kitSelected ? '#3b82f6' : '#838992'}
          emissive={kitSelected ? '#2563eb' : '#000000'}
          emissiveIntensity={kitSelected ? 0.55 : 0}
          roughness={0.48}
          metalness={0.32}
        />
      </RoundedBox>

      {/* Crisp Glowing Blue Selection Outline Frame cleanly BEHIND faceplate (never washes out graphics!) */}
      {kitSelected && (
        <mesh position={[0, 0, KD / 2 - 0.001]}>
          <boxGeometry args={[KW + 0.010, KH + 0.010, 0.002]} />
          <meshBasicMaterial color="#38bdf8" />
        </mesh>
      )}

      {/* Floating "Ganti Kit" Button & Inline Kit Picker directly on the Kit box! */}
      {!breadboard2D && kitSelected && (
        <Html position={[0, kitPickerOpen ? KH * 0.04 : KH * 0.42, KD * 0.5 + 0.012]} center zIndexRange={[25, 0]}>
          <div
            className="pointer-events-auto flex flex-col items-center gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            {!kitPickerOpen ? (
              <button
                type="button"
                onClick={() => setKitPickerOpen(true)}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-md border border-[#7dd3fc] bg-[#0284c7] px-3 py-1.5 text-xs font-bold text-white shadow-lg transition hover:bg-[#0369a1]"
              >
                <span>Ganti Kit</span>
              </button>
            ) : (
              <div className="w-60 rounded-md border border-[#38bdf8] bg-[#0f172a]/95 p-2 text-xs text-[#f8fafc] shadow-2xl backdrop-blur-sm">
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-bold text-[#38bdf8]">Ganti Kit Praktikum</span>
                  <button
                    type="button"
                    aria-label="Tutup pemilih kit"
                    onClick={() => selectKitBox(false)}
                    className="rounded px-1 text-[#94a3b8] hover:text-white"
                  >
                    ✕
                  </button>
                </div>
                <p className="mb-1.5 text-[10px] text-[#fbbf24]">
                  Mengganti kit akan melepas semua kabel yang terpasang.
                </p>
                <div className="space-y-1">
                  {KIT_CHOICES.map((k) => {
                    const isCur = activeKit === k.id;
                    return (
                      <button
                        key={k.id}
                        type="button"
                        onClick={() => setActiveKit(k.id)}
                        className={`w-full rounded border px-2 py-1.5 text-left transition ${
                          isCur
                            ? 'border-[#38bdf8] bg-[#0284c7]/35 text-white'
                            : 'border-[#334155] bg-[#1e293b] text-[#f8fafc] hover:border-[#38bdf8]'
                        }`}
                      >
                        <div className="flex items-center justify-between font-semibold">
                          <span>{KIT_TITLE_MAP[k.id]}</span>
                          {isCur && <span className="text-[10px] text-[#7dd3fc]">Aktif</span>}
                        </div>
                        <div className="text-[10px] text-[#94a3b8]">{k.sub}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </Html>
      )}

      {/* Glossy Acrylic Front Silkscreen Plate */}
      <mesh position={[0, 0, KD / 2 + 0.0012]}>
        <planeGeometry args={[KW - 0.008, KH - 0.008]} />
        <meshPhysicalMaterial map={faceTex} roughness={0.22} clearcoat={0.65} clearcoatRoughness={0.18} />
      </mesh>

      {/* Sockets registered live to socketRegistry */}
      {sockets.map((s) => (
        <KitBananaSocket key={s.id} {...s} />
      ))}

      {/* Physical 3D Soldered Resistors with Authentic 4-Band Color Codes for Kit #14 Multimeter */}
      {activeKit === 'multimeter' && (
        <group position={[0, 0, KD / 2 + 0.0045]}>
          {[0.305, 0.432, 0.556, 0.680, 0.805].map((vr, idx) => {
            const bands = KM_RES_BANDS[idx];
            return (
              <group key={idx} position={[(0.271 - 0.5) * KW, (0.5 - vr) * KH, 0]}>
                <mesh rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[0.0023, 0.0023, 0.0115, 10]} />
                  <meshStandardMaterial color="#d8ba8c" roughness={0.42} />
                </mesh>
                {bands.map((bCol, bIdx) => (
                  <mesh key={bIdx} position={[-0.0038 + bIdx * 0.0024, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[0.00242, 0.00242, 0.0011, 10]} />
                    <meshStandardMaterial color={bCol} roughness={0.35} />
                  </mesh>
                ))}
                <mesh rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[0.00095, 0.00095, 0.038, 8]} />
                  <meshStandardMaterial color="#cbd5e1" metalness={0.8} roughness={0.28} />
                </mesh>
              </group>
            );
          })}
        </group>
      )}

      {/* Knobs, Switches & Pilot LEDs for Kit #5 Osiloskop & Generator Sinyal */}
      {activeKit === 'osc_gen' && (
        <>
          <KitKnob
            label={`Penguat Gain (${kitControls.oscAmpGain.toFixed(1)}x)`}
            u={0.335}
            v={0.320}
            angleRad={1.6 - (kitControls.oscAmpGain - 1) * 0.75}
            onTurn={(s) =>
              updateKit({ oscAmpGain: Math.min(5, Math.max(1, Number((kitControls.oscAmpGain + s * 0.25).toFixed(2)))) })
            }
          />
          <KitKnob
            label={`Osilator Freq (f${kitControls.oscGenFreqIdx + 1})`}
            u={0.335}
            v={0.655}
            angleRad={(1 - kitControls.oscGenFreqIdx) * 0.75}
            onTurn={(s) =>
              updateKit({ oscGenFreqIdx: Math.min(2, Math.max(0, kitControls.oscGenFreqIdx + (s > 0 ? 1 : -1))) as 0 | 1 | 2 })
            }
          />
          <KitKnob
            label={`Pot Penggeser Fasa (${(kitControls.oscPhasePotOhms / 1000).toFixed(1)}kΩ)`}
            u={0.268}
            v={0.895}
            angleRad={1.6 - (kitControls.oscPhasePotOhms / 10000) * 3.2}
            onTurn={(s) =>
              updateKit({ oscPhasePotOhms: Math.min(10000, Math.max(500, kitControls.oscPhasePotOhms + s * 400)) })
            }
          />
          {/* Toggle switches + LEDs */}
          <mesh
            position={[(0.195 - 0.5) * KW, (0.5 - 0.215) * KH, KD / 2 + 0.005]}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHoverLabel('Penguat Power Switch');
            }}
            onPointerOut={() => setHoverLabel(null)}
            onClick={(e) => {
              e.stopPropagation();
              updateKit({ oscAmpPower: !kitControls.oscAmpPower });
            }}
          >
            <cylinderGeometry args={[0.0032, 0.0032, 0.009, 10]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.8} roughness={0.25} />
          </mesh>
          <mesh position={[(0.238 - 0.5) * KW, (0.5 - 0.215) * KH, KD / 2 + 0.003]}>
            <sphereGeometry args={[0.0028, 12, 12]} />
            <meshStandardMaterial
              color={kitControls.oscAmpPower ? '#ef4444' : '#450a0a'}
              emissive={kitControls.oscAmpPower ? '#ef4444' : '#000000'}
              emissiveIntensity={kitControls.oscAmpPower ? 1.4 : 0}
            />
          </mesh>
        </>
      )}

      {/* Knobs for Kit #22 Thevenin & Norton */}
      {activeKit === 'thevenin' && (
        <>
          <KitKnob
            label={`POT C-D (${(kitControls.thevPotOhms / 1000).toFixed(1)}kΩ)`}
            u={0.358}
            v={0.220}
            angleRad={1.6 - (kitControls.thevPotOhms / 10000) * 3.2}
            onTurn={(s) =>
              updateKit({ thevPotOhms: Math.min(10000, Math.max(200, kitControls.thevPotOhms + s * 400)) })
            }
          />
          <KitKnob
            label={`POT 5K Norton (${(kitControls.thevNortonPotOhms / 1000).toFixed(1)}kΩ)`}
            u={0.375}
            v={0.625}
            angleRad={1.6 - (kitControls.thevNortonPotOhms / 5000) * 3.2}
            onTurn={(s) =>
              updateKit({ thevNortonPotOhms: Math.min(5000, Math.max(200, kitControls.thevNortonPotOhms + s * 250)) })
            }
          />
        </>
      )}
    </group>
  );
}
