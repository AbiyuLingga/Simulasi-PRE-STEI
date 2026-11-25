import {
  type BreadboardPresetId,
  type BreadboardViewMode,
  type PlacingPartSpec,
  useLabStore,
} from '../state/labStore';

interface RibbonItem {
  id: string;
  spec: PlacingPartSpec;
  title: string;
}

function ComponentThumbSvg({ id }: { id: string }) {
  switch (id) {
    case 'wire':
      return (
        <svg viewBox="0 0 40 28" className="h-7 w-9" aria-hidden="true">
          <path d="M5 24 L9 14 L31 14 L35 24" fill="none" stroke="#9ca3af" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M8 14 C12 4, 28 4, 32 14" fill="none" stroke="#3b82f6" strokeWidth="4.2" strokeLinecap="round" />
        </svg>
      );
    case 'wire_float':
      return (
        <svg viewBox="0 0 40 28" className="h-7 w-9" aria-hidden="true">
          <path d="M8 25 L8 18" stroke="#cbd5e1" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M8 19 C9 11, 20 12, 26 9" fill="none" stroke="#dc2626" strokeWidth="3.8" strokeLinecap="round" />
          <rect x="23" y="6" width="6" height="5" rx="1" transform="rotate(-22 26 8.5)" fill="#18181b" />
          <path d="M29 7.2 L35 4.8" stroke="#e2e8f0" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="34.5" cy="5" r="3.4" fill="none" stroke="#f59e0b" strokeWidth="1.2" strokeDasharray="2 1.5" />
        </svg>
      );
    case 'resistor':
      return (
        <svg viewBox="0 0 40 28" className="h-7 w-9" aria-hidden="true">
          <path d="M5 24 L8 13 L32 13 L35 24" fill="none" stroke="#cbd5e1" strokeWidth="2.2" strokeLinecap="round" />
          <rect x="9" y="8" width="22" height="10" rx="3" fill="#d8bd92" stroke="#92400e" strokeWidth="0.8" />
          <rect x="12" y="8" width="2.4" height="10" fill="#7c2d12" />
          <rect x="17" y="8" width="2.4" height="10" fill="#111827" />
          <rect x="22" y="8" width="2.4" height="10" fill="#dc2626" />
          <rect x="27" y="8" width="2" height="10" fill="#eab308" />
        </svg>
      );
    case 'cap_cer':
      return (
        <svg viewBox="0 0 40 28" className="h-7 w-9" aria-hidden="true">
          <path d="M13 17 L13 26 M27 17 L27 26" stroke="#cbd5e1" strokeWidth="2.2" strokeLinecap="round" />
          <ellipse cx="20" cy="11" rx="8.5" ry="7.5" fill="#ea580c" stroke="#9a3412" strokeWidth="0.8" />
          <text x="20" y="13.5" textAnchor="middle" fill="#fff" fontSize="6" fontWeight="700">104</text>
        </svg>
      );
    case 'cap_elco':
      return (
        <svg viewBox="0 0 40 28" className="h-7 w-9" aria-hidden="true">
          <path d="M15 20 L15 26 M25 20 L25 26" stroke="#cbd5e1" strokeWidth="2.2" strokeLinecap="round" />
          <rect x="12" y="4" width="16" height="16" rx="2.5" fill="#1e3a8a" />
          <rect x="23.5" y="4.5" width="3.5" height="15" fill="#e2e8f0" />
          <ellipse cx="20" cy="4.5" rx="8" ry="2.2" fill="#cbd5e1" />
        </svg>
      );
    case 'inductor':
      return (
        <svg viewBox="0 0 40 28" className="h-7 w-9" aria-hidden="true">
          <path d="M5 24 L8 13 L32 13 L35 24" fill="none" stroke="#cbd5e1" strokeWidth="2.2" strokeLinecap="round" />
          <rect x="9" y="8" width="22" height="10" rx="4" fill="#15803d" stroke="#14532d" strokeWidth="0.8" />
          <path d="M13 8 V18 M17 8 V18 M21 8 V18 M25 8 V18" stroke="#166534" strokeWidth="1.5" />
        </svg>
      );
    case 'diode':
      return (
        <svg viewBox="0 0 40 28" className="h-7 w-9" aria-hidden="true">
          <path d="M5 24 L8 13 L32 13 L35 24" fill="none" stroke="#cbd5e1" strokeWidth="2.2" strokeLinecap="round" />
          <rect x="10" y="9" width="20" height="8" rx="2" fill="#f97316" />
          <rect x="24" y="9" width="4" height="8" fill="#0f172a" />
        </svg>
      );
    case 'ic741':
      return (
        <svg viewBox="0 0 40 28" className="h-7 w-9" aria-hidden="true">
          {[10, 16, 22, 28].map((x) => (
            <g key={x}>
              <rect x={x - 1} y="3" width="2.2" height="5" fill="#cbd5e1" />
              <rect x={x - 1} y="20" width="2.2" height="5" fill="#cbd5e1" />
            </g>
          ))}
          <rect x="7" y="7" width="26" height="14" rx="1.5" fill="#1f242c" stroke="#475569" strokeWidth="0.8" />
          <circle cx="11" cy="14" r="1.6" fill="#94a3b8" />
        </svg>
      );
    case 'led':
      return (
        <svg viewBox="0 0 40 28" className="h-7 w-9" aria-hidden="true">
          <path d="M16 19 L16 26 M24 19 L24 26" stroke="#cbd5e1" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M13 18 V11 A7 7 0 0 1 27 11 V18 Z" fill="#ef4444" stroke="#fca5a5" strokeWidth="0.8" />
          <rect x="12" y="16.5" width="16" height="2.8" rx="1" fill="#dc2626" />
        </svg>
      );
    default:
      return null;
  }
}

const RIBBON_GROUPS: ReadonlyArray<{ title: string; items: RibbonItem[] }> = [
  {
    title: 'WIRE',
    items: [
      { id: 'wire', title: 'Jumper', spec: { kind: 'jumper', label: 'Jumper', value: 0, span: 6, color: '#2563eb' } },
      {
        id: 'wire_float',
        title: 'Jumper Bebas',
        spec: { kind: 'jumper', label: 'Jumper Bebas', value: 0, span: 0, color: '#dc2626', floating: true },
      },
    ],
  },
  {
    title: 'PASSIVE',
    items: [
      { id: 'resistor', title: 'R 1kΩ', spec: { kind: 'resistor', label: 'R 1kΩ', value: 1000, span: 6 } },
      { id: 'cap_cer', title: 'C 100nF', spec: { kind: 'capacitor', label: 'C 100nF', value: 100e-9, span: 6 } },
      { id: 'cap_elco', title: 'C 10µF', spec: { kind: 'capacitor', label: 'C 10µF', value: 10e-6, span: 4 } },
      { id: 'inductor', title: 'L 2.5mH', spec: { kind: 'inductor', label: 'L 2.5mH', value: 2.5e-3, span: 6 } },
    ],
  },
  {
    title: 'ACTIVE',
    items: [
      { id: 'diode', title: '1N4148', spec: { kind: 'diode', label: '1N4148', value: 0.7, span: 6 } },
      { id: 'ic741', title: 'LM741', spec: { kind: 'opamp741', label: 'LM741', value: 5000, span: 3 } },
    ],
  },
  {
    title: 'OUTPUT',
    items: [
      { id: 'led', title: 'LED', spec: { kind: 'led', label: 'LED Merah', value: 1.9, span: 4, color: '#ef4444' } },
    ],
  },
];

const QUICK_PRESETS: ReadonlyArray<{ id: BreadboardPresetId; label: string }> = [
  { id: 'starter', label: 'Starter' },
  { id: 'rc_lpf', label: 'RC' },
  { id: 'rlc_series', label: 'RLC' },
  { id: 'led_demo', label: 'LED' },
  { id: 'opamp_inv', label: '741' },
  { id: 'clear', label: 'Clear' },
];

const VIEW_MODES: ReadonlyArray<{ id: BreadboardViewMode; label: string }> = [
  { id: 'standard', label: 'Standard (N)' },
  { id: 'voltage', label: 'Voltage (V)' },
  { id: 'current', label: 'Current (I)' },
];

const RES_VARIANTS = [100, 330, 1000, 4700, 10_000, 100_000] as const;
const CAP_VARIANTS = [
  { label: '8.2nF', value: 8.2e-9 },
  { label: '100nF', value: 100e-9 },
  { label: '1µF', value: 1e-6 },
  { label: '10µF', value: 10e-6 },
  { label: '100µF', value: 100e-6 },
] as const;
const IND_VARIANTS = [
  { label: '1mH', value: 1e-3 },
  { label: '2.5mH', value: 2.5e-3 },
  { label: '10mH', value: 10e-3 },
] as const;
const LED_VARIANTS = [
  { label: 'Merah', color: '#ef4444', vf: 1.9 },
  { label: 'Hijau', color: '#22c55e', vf: 2.1 },
  { label: 'Kuning', color: '#eab308', vf: 2.0 },
  { label: 'Biru', color: '#3b82f6', vf: 3.1 },
  { label: 'Putih', color: '#f8fafc', vf: 3.2 },
] as const;
const WIRE_COLORS = ['#2563eb', '#dc2626', '#18181b', '#16a34a', '#eab308', '#f8fafc'] as const;

export function CrumbBreadboardUI() {
  const breadboardMode = useLabStore((s) => s.breadboardMode);
  const breadboard2D = useLabStore((s) => s.breadboard2D);
  const breadboardViewMode = useLabStore((s) => s.breadboardViewMode);
  const breadboardShowPins = useLabStore((s) => s.breadboardShowPins);
  const placingPart = useLabStore((s) => s.placingPart);
  const undoLen = useLabStore((s) => s.breadboardUndoStack.length);
  const redoLen = useLabStore((s) => s.breadboardRedoStack.length);
  const activeDrawer = useLabStore((s) => s.activeDrawer);

  const exitBreadboardMode = useLabStore((s) => s.exitBreadboardMode);
  const setBreadboard2D = useLabStore((s) => s.setBreadboard2D);
  const resetBreadboard2DView = useLabStore((s) => s.resetBreadboard2DView);
  const undoBreadboard = useLabStore((s) => s.undoBreadboard);
  const redoBreadboard = useLabStore((s) => s.redoBreadboard);
  const startPlacingPart = useLabStore((s) => s.startPlacingPart);
  const setPlacingVariant = useLabStore((s) => s.setPlacingVariant);
  const togglePlacingFloating = useLabStore((s) => s.togglePlacingFloating);
  const commitFloatingJumper = useLabStore((s) => s.commitFloatingJumper);
  const setBreadboardViewMode = useLabStore((s) => s.setBreadboardViewMode);
  const toggleBreadboardShowPins = useLabStore((s) => s.toggleBreadboardShowPins);
  const applyBreadboardPreset = useLabStore((s) => s.applyBreadboardPreset);
  const setActiveDrawer = useLabStore((s) => s.setActiveDrawer);

  if (!breadboardMode) return null;

  return (
    <>
      {/* CRUMB Top Workspace Ribbon */}
      <header
        aria-label="CRUMB Breadboard Workspace"
        className="pointer-events-auto fixed inset-x-0 top-0 z-20 flex flex-col border-b border-[#303642] bg-[#161920]/95 text-[#f1f5f9] shadow-lg backdrop-blur-sm"
      >
        {/* Slim Dark Window Header Bar */}
        <div className="flex h-8 items-center justify-between border-b border-[#272c36] bg-[#101217] px-2.5 text-xs">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={exitBreadboardMode}
              className="rounded border border-[#2f3542] bg-[#1b2029] px-2 py-0.5 text-[11px] font-semibold text-[#f1f5f9] hover:border-[#f59e0b]"
            >
              ← Kembali
            </button>
            <button
              type="button"
              aria-label="Zoom Fit Breadboard"
              onClick={() => (breadboard2D ? resetBreadboard2DView() : setBreadboard2D(false))}
              className="rounded px-1.5 py-0.5 text-xs text-[#cbd5e1] hover:bg-[#1f2530] hover:text-white"
            >
              🔍
            </button>
            <div
              role="group"
              aria-label="Tampilan 2D atau 3D"
              className="ml-1 inline-flex overflow-hidden rounded border border-[#2f3542] bg-[#161a22]"
            >
              <button
                type="button"
                aria-pressed={breadboard2D}
                onClick={() => setBreadboard2D(true)}
                className={`px-2 py-0.5 text-[11px] font-bold transition-colors ${
                  breadboard2D ? 'bg-[#f59e0b] text-[#111827]' : 'text-[#cbd5e1] hover:text-white'
                }`}
              >
                2D
              </button>
              <button
                type="button"
                aria-pressed={!breadboard2D}
                onClick={() => setBreadboard2D(false)}
                className={`px-2 py-0.5 text-[11px] font-bold transition-colors ${
                  !breadboard2D ? 'bg-[#f59e0b] text-[#111827]' : 'text-[#cbd5e1] hover:text-white'
                }`}
              >
                3D
              </button>
            </div>
            <button
              type="button"
              aria-label="Undo"
              disabled={undoLen === 0}
              onClick={undoBreadboard}
              className="rounded px-1.5 py-0.5 text-sm text-[#cbd5e1] hover:bg-[#1f2530] hover:text-white disabled:opacity-35"
            >
              ↶
            </button>
            <button
              type="button"
              aria-label="Redo"
              disabled={redoLen === 0}
              onClick={redoBreadboard}
              className="rounded px-1.5 py-0.5 text-sm text-[#cbd5e1] hover:bg-[#1f2530] hover:text-white disabled:opacity-35"
            >
              ↷
            </button>
          </div>

          <span className="hidden text-xs font-semibold tracking-wide text-[#e2e8f0] sm:inline">
            Breadboard 830 {breadboard2D ? '(2D Editor)' : '(3D View)'}
          </span>

          <button
            type="button"
            aria-label="Panel Pengaturan"
            onClick={() => setActiveDrawer(activeDrawer ? null : 'bb')}
            className="rounded px-2 py-0.5 text-sm font-bold text-[#e2e8f0] hover:bg-[#1f2530]"
          >
            {activeDrawer ? '✕' : '☰'}
          </button>
        </div>

        {/* Categorized Component Icon Bar */}
        <div className="flex items-stretch overflow-x-auto px-2 py-1">
          {RIBBON_GROUPS.map((grp) => (
            <div
              key={grp.title}
              className="flex flex-col justify-between border-r border-[#2e3440] px-2 last:border-r-0"
            >
              <div className="flex items-center gap-1">
                {grp.items.map((item) => {
                  const active =
                    placingPart?.kind === item.spec.kind &&
                    (item.spec.kind !== 'jumper' || Boolean(placingPart.floating) === Boolean(item.spec.floating)) &&
                    (item.id !== 'cap_cer' || placingPart.value < 1e-6) &&
                    (item.id !== 'cap_elco' || placingPart.value >= 1e-6);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      title={item.title}
                      aria-label={item.title}
                      aria-pressed={active}
                      onClick={() => startPlacingPart(active ? null : item.spec)}
                      className={`flex flex-col items-center rounded px-1.5 py-1 transition-colors ${
                        active
                          ? 'bg-[#2563eb] text-white ring-1 ring-[#60a5fa]'
                          : 'text-[#e2e8f0] hover:bg-[#252a34]'
                      }`}
                    >
                      <ComponentThumbSvg id={item.id} />
                      <span className="mt-0.5 text-[10px] font-medium leading-none">{item.title}</span>
                    </button>
                  );
                })}
              </div>
              <span className="mt-1 text-center text-[9px] font-bold tracking-wider text-[#9ca3af]">
                {grp.title}
              </span>
            </div>
          ))}

          {/* Preset Circuit Layouts */}
          <div className="flex flex-col justify-between px-2">
            <div className="grid grid-cols-3 gap-1">
              {QUICK_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyBreadboardPreset(p.id)}
                  className="rounded border border-[#323846] bg-[#222731] px-2 py-0.5 text-[10px] font-semibold text-[#e2e8f0] hover:border-[#f59e0b]"
                >
                  {p.label}
                </button>
              ))}
            </div>
            <span className="mt-1 text-center text-[9px] font-bold tracking-wider text-[#9ca3af]">
              PRESET
            </span>
          </div>
        </div>

        {/* Inline Variant Picker when a component tool is active */}
        {placingPart && placingPart.kind !== 'opamp741' && placingPart.kind !== 'diode' && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-[#272c36] bg-[#11141a] px-3 py-1 text-xs">
            <span className="font-semibold text-[#f59e0b]">{placingPart.label}:</span>
            {placingPart.kind === 'resistor' &&
              RES_VARIANTS.map((ohms) => (
                <button
                  key={ohms}
                  type="button"
                  onClick={() => setPlacingVariant({ value: ohms })}
                  className={`rounded border px-1.5 py-0.5 font-mono-readout text-[11px] font-semibold ${
                    placingPart.value === ohms
                      ? 'border-[#f59e0b] bg-[#f59e0b] text-[#111827]'
                      : 'border-[#323846] bg-[#1e232d] text-[#f1f5f9] hover:border-[#f59e0b]'
                  }`}
                >
                  {ohms >= 1000 ? `${ohms / 1000}k` : `${ohms}Ω`}
                </button>
              ))}
            {placingPart.kind === 'capacitor' &&
              CAP_VARIANTS.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => setPlacingVariant({ value: c.value })}
                  className={`rounded border px-1.5 py-0.5 font-mono-readout text-[11px] font-semibold ${
                    Math.abs(placingPart.value - c.value) < c.value * 0.05
                      ? 'border-[#f59e0b] bg-[#f59e0b] text-[#111827]'
                      : 'border-[#323846] bg-[#1e232d] text-[#f1f5f9] hover:border-[#f59e0b]'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            {placingPart.kind === 'inductor' &&
              IND_VARIANTS.map((l) => (
                <button
                  key={l.label}
                  type="button"
                  onClick={() => setPlacingVariant({ value: l.value })}
                  className={`rounded border px-1.5 py-0.5 font-mono-readout text-[11px] font-semibold ${
                    Math.abs(placingPart.value - l.value) < l.value * 0.05
                      ? 'border-[#f59e0b] bg-[#f59e0b] text-[#111827]'
                      : 'border-[#323846] bg-[#1e232d] text-[#f1f5f9] hover:border-[#f59e0b]'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            {placingPart.kind === 'led' &&
              LED_VARIANTS.map((led) => (
                <button
                  key={led.label}
                  type="button"
                  onClick={() => setPlacingVariant({ color: led.color, value: led.vf })}
                  className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold ${
                    placingPart.color === led.color
                      ? 'border-[#f59e0b] bg-[#f59e0b] text-[#111827]'
                      : 'border-[#323846] bg-[#1e232d] text-[#f1f5f9] hover:border-[#f59e0b]'
                  }`}
                >
                  {led.label}
                </button>
              ))}
            {placingPart.kind === 'jumper' && (
              <>
                {WIRE_COLORS.map((col) => (
                  <button
                    key={col}
                    type="button"
                    aria-label={`Kabel ${col}`}
                    onClick={() =>
                      setPlacingVariant({
                        color: col,
                        label: placingPart.floating ? 'Jumper Bebas' : 'Jumper',
                      })
                    }
                    style={{ backgroundColor: col }}
                    className={`h-4 w-4 rounded-full border-2 ${
                      placingPart.color === col ? 'border-[#f59e0b] scale-110' : 'border-[#475569]'
                    }`}
                  />
                ))}
                <button
                  type="button"
                  onClick={togglePlacingFloating}
                  className={`ml-2 rounded border px-2 py-0.5 text-[11px] font-semibold ${
                    placingPart.floating
                      ? 'border-[#f59e0b] bg-[#f59e0b] text-[#111827]'
                      : 'border-[#323846] bg-[#1e232d] text-[#f1f5f9] hover:border-[#f59e0b]'
                  }`}
                >
                  {placingPart.floating ? 'Ujung Bebas: ON (Siap Jepit Buaya)' : 'Ujung Bebas: OFF'}
                </button>
                {!placingPart.floating && placingPart.anchorHoleA && (
                  <button
                    type="button"
                    onClick={() => commitFloatingJumper(placingPart.anchorHoleA!, placingPart.rotationDeg)}
                    className="rounded border border-[#f59e0b] bg-[#292014] px-2 py-0.5 text-[11px] font-semibold text-[#fbbf24] hover:bg-[#f59e0b] hover:text-[#111827]"
                  >
                    Jadikan Floating di {placingPart.anchorHoleA} (F)
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </header>

      {/* Right-Side CRUMB Gizmo + View-Mode Checkboxes */}
      <div className="pointer-events-auto fixed right-3 top-[108px] z-20 flex flex-col items-end gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Pengaturan GPU"
            onClick={() => setActiveDrawer(activeDrawer === 'gpu' ? null : 'gpu')}
            className="flex h-8 w-8 items-center justify-center rounded border border-[#303642] bg-[#161920]/90 text-sm text-[#e2e8f0] hover:border-[#f59e0b]"
          >
            ⚙
          </button>
          <button
            type="button"
            aria-label="Kembali ke Meja"
            onClick={exitBreadboardMode}
            className="flex h-8 w-8 items-center justify-center rounded border border-[#303642] bg-[#161920]/90 text-sm text-[#e2e8f0] hover:border-[#f59e0b]"
          >
            🏠
          </button>
        </div>

        {/* 3D Axis Orientation Gizmo (only shown in 3D view) */}
        {!breadboard2D && (
          <svg viewBox="0 0 48 48" className="h-11 w-11 opacity-90" aria-hidden="true">
            <line x1="24" y1="26" x2="24" y2="7" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="24" y1="26" x2="41" y2="33" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="24" y1="26" x2="8" y2="35" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="24" cy="26" r="2.2" fill="#e2e8f0" />
          </svg>
        )}

        {/* Checkboxes matching CRUMB Steam HUD */}
        <div
          role="group"
          aria-label="Mode Tampilan Breadboard"
          className="space-y-1.5 rounded-md border border-[#303642] bg-[#14171d]/90 px-2.5 py-2 text-xs shadow-lg backdrop-blur-sm"
        >
          {VIEW_MODES.map((m) => {
            const checked = breadboardViewMode === m.id;
            return (
              <label key={m.id} className="flex cursor-pointer items-center justify-end gap-2 select-none">
                <span className="font-medium text-[#f1f5f9]">{m.label}</span>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  aria-label={m.label}
                  onClick={() => setBreadboardViewMode(m.id)}
                  className={`flex h-4 w-4 items-center justify-center rounded border text-[11px] font-bold transition-colors ${
                    checked
                      ? 'border-[#3b82f6] bg-[#2563eb] text-white'
                      : 'border-[#475569] bg-[#1e232d] text-transparent'
                  }`}
                >
                  ✓
                </button>
              </label>
            );
          })}
          <label className="flex cursor-pointer items-center justify-end gap-2 select-none border-t border-[#272c36] pt-1.5">
            <span className="font-medium text-[#f1f5f9]">Show Pins (P)</span>
            <button
              type="button"
              role="checkbox"
              aria-checked={breadboardShowPins}
              aria-label="Show Pins (P)"
              onClick={toggleBreadboardShowPins}
              className={`flex h-4 w-4 items-center justify-center rounded border text-[11px] font-bold transition-colors ${
                breadboardShowPins
                  ? 'border-[#3b82f6] bg-[#2563eb] text-white'
                  : 'border-[#475569] bg-[#1e232d] text-transparent'
              }`}
            >
              ✓
            </button>
          </label>
        </div>
      </div>
    </>
  );
}
