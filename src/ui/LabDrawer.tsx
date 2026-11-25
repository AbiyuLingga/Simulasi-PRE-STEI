import { useEffect, useState } from 'react';
import { KIT_TITLE_MAP } from '../simulation/kits/kitDefinitions';
import type { KitId } from '../simulation/circuit/types';
import { MODULE_TUTORIALS } from '../tutorials/moduleTutorials';
import { hotRefs } from '../state/hotRefs';
import {
  useLabStore,
  type BreadboardPresetId,
  type DrawerTab,
  type GraphicsQuality,
  type PlacingPartSpec,
  type WiringPresetId,
} from '../state/labStore';

const TABS: ReadonlyArray<{ id: DrawerTab; label: string }> = [
  { id: 'kit', label: 'Kit' },
  { id: 'tutorial', label: 'Modul' },
  { id: 'bb', label: 'BB' },
  { id: 'cable', label: 'Kabel' },
  { id: 'gpu', label: 'GPU' },
];

const KIT_OPTIONS: ReadonlyArray<KitId> = ['rl_rc', 'multimeter', 'osc_gen', 'thevenin', 'none'];

const WIRING_PRESETS: ReadonlyArray<{ id: WiringPresetId; label: string }> = [
  { id: 'dual_trace', label: 'Dual Trace' },
  { id: 'probe_comp', label: 'Probe Comp' },
  { id: 'kit_rlrc_transient', label: 'Kit RL&RC' },
  { id: 'kit_osc_phase', label: 'Kit #5 Fasa' },
  { id: 'kit_multimeter_div', label: 'Kit #14 Div' },
  { id: 'kit_thevenin', label: 'Kit #22 Thev' },
  { id: 'bb_rc_test', label: 'BB RC' },
  { id: 'gen_ch1', label: 'Gen ke CH1' },
];

const BB_PALETTE: ReadonlyArray<PlacingPartSpec> = [
  { kind: 'resistor', label: 'R 330Ω', value: 330, span: 6 },
  { kind: 'resistor', label: 'R 1kΩ', value: 1000, span: 6 },
  { kind: 'resistor', label: 'R 10kΩ', value: 10000, span: 6 },
  { kind: 'capacitor', label: 'C 100nF', value: 100e-9, span: 6 },
  { kind: 'capacitor', label: 'C 10µF', value: 10e-6, span: 6 },
  { kind: 'inductor', label: 'L 2.5mH', value: 2.5e-3, span: 6 },
  { kind: 'led', label: 'LED Merah', value: 1.9, span: 4, color: '#ef4444' },
  { kind: 'diode', label: 'D 1N4148', value: 0.7, span: 6 },
  { kind: 'jumper', label: 'Jumper', value: 0, span: 6, color: '#2563eb' },
  { kind: 'jumper', label: 'Jumper Bebas', value: 0, span: 0, color: '#dc2626', floating: true },
  { kind: 'opamp741', label: 'IC LM741', value: 5000, span: 3 },
];

const BB_PRESETS: ReadonlyArray<{ id: BreadboardPresetId; label: string }> = [
  { id: 'starter', label: 'Starter' },
  { id: 'rc_lpf', label: 'RC LPF' },
  { id: 'rlc_series', label: 'RLC Seri' },
  { id: 'led_demo', label: 'LED+R' },
  { id: 'opamp_inv', label: '741 Inv' },
  { id: 'clear', label: 'Kosong' },
];

const JUMPER_SWATCHES = ['#2563eb', '#dc2626', '#18181b', '#16a34a', '#eab308', '#f8fafc'] as const;

export function LabDrawer() {
  const activeDrawer = useLabStore((s) => s.activeDrawer);
  const setActiveDrawer = useLabStore((s) => s.setActiveDrawer);
  const activeKit = useLabStore((s) => s.activeKit);
  const setActiveKit = useLabStore((s) => s.setActiveKit);
  const breadboardParts = useLabStore((s) => s.breadboardParts);
  const selectedPartId = useLabStore((s) => s.selectedBreadboardPartId);
  const breadboardMode = useLabStore((s) => s.breadboardMode);
  const breadboardViewMode = useLabStore((s) => s.breadboardViewMode);
  const breadboardVoltageView = breadboardViewMode === 'voltage';
  const placingPart = useLabStore((s) => s.placingPart);
  const startPlacingPart = useLabStore((s) => s.startPlacingPart);
  const setPlacingColor = useLabStore((s) => s.setPlacingColor);
  const selectBreadboardPart = useLabStore((s) => s.selectBreadboardPart);
  const toggleBreadboardVoltageView = useLabStore((s) => s.toggleBreadboardVoltageView);
  const removeBreadboardPart = useLabStore((s) => s.removeBreadboardPart);
  const applyBreadboardPreset = useLabStore((s) => s.applyBreadboardPreset);
  const cables = useLabStore((s) => s.cables);
  const applyPreset = useLabStore((s) => s.applyWiringPreset);
  const spawnCable = useLabStore((s) => s.spawnCable);
  const removeCable = useLabStore((s) => s.removeCable);
  const setProbeAtten = useLabStore((s) => s.setCableProbeAtten);
  const setProbeTrim = useLabStore((s) => s.setCableProbeCompTrim);
  const graphics = useLabStore((s) => s.graphics);
  const setGraphics = useLabStore((s) => s.setGraphics);
  const gpuInfo = useLabStore((s) => s.gpuInfo);
  const activeTutorialId = useLabStore((s) => s.activeTutorialId);
  const startTutorial = useLabStore((s) => s.startTutorial);
  const stopTutorial = useLabStore((s) => s.stopTutorial);

  const [perfStats, setPerfStats] = useState({ fps: 60, drawCalls: 0, triangles: 0 });
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const first = MODULE_TUTORIALS[0]?.moduleGroup;
    return first ? { [first]: true } : {};
  });

  useEffect(() => {
    if (!activeTutorialId) return;
    const active = MODULE_TUTORIALS.find((t) => t.id === activeTutorialId);
    if (active) {
      setExpandedGroups((prev) => (prev[active.moduleGroup] ? prev : { ...prev, [active.moduleGroup]: true }));
    }
  }, [activeTutorialId]);

  useEffect(() => {
    if (activeDrawer !== 'gpu') return;
    const sync = () =>
      setPerfStats({ fps: hotRefs.fps, drawCalls: hotRefs.drawCalls, triangles: hotRefs.triangles });
    sync();
    const t = window.setInterval(sync, 400);
    return () => clearInterval(t);
  }, [activeDrawer]);

  if (!activeDrawer) return null;

  const probes = cables.filter((c) => c.kind === 'probe_bnc_hook');

  return (
    <aside
      aria-label="Pengaturan Lab"
      className={`fixed right-3 z-30 w-72 max-w-[calc(100vw-24px)] rounded-md border border-[#3a4452] bg-[#14191f] text-[#f8fafc] shadow-xl sm:right-4 ${
        breadboardMode ? 'top-[146px]' : 'top-16'
      }`}
    >
      <div role="tablist" className="grid grid-cols-5 border-b border-[#3a4452]">
        {TABS.map((t) => {
          const active = activeDrawer === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveDrawer(t.id)}
              className={`min-h-[42px] text-xs font-semibold transition-colors ${
                active
                  ? 'bg-[#f59e0b] text-[#111827]'
                  : 'bg-[#14191f] text-[#cbd5e1] hover:bg-[#1e252e]'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="max-h-[70vh] space-y-3 overflow-y-auto p-3 text-sm">
        {activeDrawer === 'kit' && (
          <div className="space-y-3">
            {/* Active LDTE ITB Kit selector */}
            <div className="space-y-1.5">
              {KIT_OPTIONS.map((kid) => (
                <button
                  key={kid}
                  type="button"
                  onClick={() => setActiveKit(kid)}
                  aria-pressed={activeKit === kid}
                  className={`flex min-h-[36px] w-full items-center justify-between rounded border px-2.5 text-xs font-semibold ${
                    activeKit === kid
                      ? 'border-[#f59e0b] bg-[#f59e0b] text-[#111827]'
                      : 'border-[#3a4452] bg-[#1e252e] text-[#f8fafc] hover:border-[#f59e0b]'
                  }`}
                >
                  <span>{KIT_TITLE_MAP[kid]}</span>
                </button>
              ))}
            </div>

            {/* Compact Wiring Presets */}
            <div className="grid grid-cols-2 gap-1.5 border-t border-[#3a4452] pt-2.5">
              {WIRING_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id)}
                  className="min-h-[36px] rounded border border-[#3a4452] bg-[#1e252e] px-2 py-1 text-left text-xs font-semibold hover:border-[#f59e0b]"
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => applyPreset('clear')}
                className="col-span-2 min-h-[36px] rounded border border-[#3a4452] bg-[#1e252e] px-2.5 py-1 text-center text-xs font-semibold text-[#cbd5e1] hover:border-[#ef4444]"
              >
                Lepas Semua Kabel
              </button>
            </div>

            {probes.length > 0 && (
              <div className="space-y-2 border-t border-[#3a4452] pt-2.5">
                {probes.map((p) => (
                  <div key={p.id} className="space-y-1.5 rounded border border-[#3a4452] bg-[#1e252e] p-2">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span>{p.label}</span>
                      <div className="inline-flex gap-1">
                        {([1, 10] as const).map((att) => (
                          <button
                            key={att}
                            type="button"
                            onClick={() => setProbeAtten(p.id, att)}
                            className={`rounded px-2 py-0.5 font-mono-readout text-xs font-bold ${
                              (p.probeAtten ?? 1) === att
                                ? 'bg-[#f59e0b] text-[#111827]'
                                : 'bg-[#14191f] text-[#cbd5e1]'
                            }`}
                          >
                            {att}X
                          </button>
                        ))}
                      </div>
                    </div>
                    {(p.probeAtten ?? 1) === 10 && (
                      <label className="flex items-center justify-between gap-2 text-xs text-[#cbd5e1]">
                        <span>Trim</span>
                        <input
                          type="range"
                          min={-1}
                          max={1}
                          step={0.05}
                          value={p.probeCompTrim ?? 0}
                          onChange={(e) => setProbeTrim(p.id, Number(e.target.value))}
                          className="w-32 accent-[#f59e0b]"
                        />
                      </label>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeDrawer === 'tutorial' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] leading-snug text-[#cbd5e1]">
                {MODULE_TUTORIALS.length} sub-percobaan EL-2101 (Modul 1–5) lengkap dengan wiring &amp; tabel BCL.
              </p>
            </div>
            {Array.from(new Set(MODULE_TUTORIALS.map((t) => t.moduleGroup))).map((group) => {
              const items = MODULE_TUTORIALS.filter((t) => t.moduleGroup === group);
              const isOpen = Boolean(expandedGroups[group]);
              const hasActive = items.some((t) => t.id === activeTutorialId);
              return (
                <div key={group} className="rounded border border-[#2b3441] bg-[#181f28]">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setExpandedGroups((prev) => ({ ...prev, [group]: !prev[group] }))}
                    className={`flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left text-[11px] font-bold transition-colors ${
                      hasActive ? 'text-[#fbbf24]' : 'text-[#e2e8f0] hover:text-[#f59e0b]'
                    }`}
                  >
                    <span className="truncate">{group}</span>
                    <span className="flex shrink-0 items-center gap-1.5 font-mono-readout text-[10px] text-[#94a3b8]">
                      <span className="rounded bg-[#253040] px-1.5 py-0.5 text-[#cbd5e1]">{items.length}</span>
                      <span>{isOpen ? '▾' : '▸'}</span>
                    </span>
                  </button>
                  {isOpen && (
                    <div className="space-y-1.5 border-t border-[#2b3441] p-1.5">
                      {items.map((tut) => {
                        const isRunning = activeTutorialId === tut.id;
                        return (
                          <div
                            key={tut.id}
                            className={`space-y-1 rounded border p-2 ${
                              isRunning ? 'border-[#f59e0b] bg-[#1a2230]' : 'border-[#3a4452] bg-[#1e252e]'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="rounded bg-[#f59e0b] px-1.5 py-0.5 font-mono-readout text-[10px] font-bold text-[#111827]">
                                    {tut.moduleCode}
                                  </span>
                                  <span className="truncate text-xs font-bold text-[#f8fafc]">{tut.title}</span>
                                </div>
                                <div className="mt-0.5 truncate text-[10px] text-[#94a3b8]">{tut.subtitle}</div>
                              </div>
                              <button
                                type="button"
                                onClick={() => (isRunning ? stopTutorial() : startTutorial(tut.id))}
                                className={`shrink-0 rounded px-2.5 py-1 text-[11px] font-bold ${
                                  isRunning
                                    ? 'bg-[#10b981] text-[#052e16]'
                                    : 'bg-[#f59e0b] text-[#111827] hover:bg-[#fbbf24]'
                                }`}
                              >
                                {isRunning ? 'Aktif' : 'Mulai'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeDrawer === 'bb' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-1.5">
              {BB_PALETTE.map((item) => {
                const selected = placingPart?.label === item.label;
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => startPlacingPart(selected ? null : item)}
                    className={`min-h-[36px] rounded border px-2 py-1 text-left text-xs font-semibold ${
                      selected
                        ? 'border-[#f59e0b] bg-[#f59e0b] text-[#111827]'
                        : 'border-[#3a4452] bg-[#1e252e] text-[#f8fafc] hover:border-[#f59e0b]'
                    }`}
                  >
                    + {item.label}
                  </button>
                );
              })}
            </div>

            {placingPart?.kind === 'jumper' && (
              <div className="flex items-center justify-between rounded border border-[#3a4452] bg-[#1e252e] px-2.5 py-1.5">
                <span className="text-xs font-semibold text-[#cbd5e1]">Warna Kabel</span>
                <div className="flex items-center gap-1.5">
                  {JUMPER_SWATCHES.map((col) => (
                    <button
                      key={col}
                      type="button"
                      aria-label={`Pilih warna jumper ${col}`}
                      onClick={() => setPlacingColor(col)}
                      style={{ backgroundColor: col }}
                      className={`h-4 w-4 rounded-full border-2 ${
                        placingPart.color === col ? 'border-[#f59e0b] scale-110' : 'border-[#475569]'
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}

            <button
              type="button"
              aria-pressed={breadboardVoltageView}
              onClick={toggleBreadboardVoltageView}
              className={`min-h-[36px] w-full rounded border px-2.5 py-1 text-xs font-semibold ${
                breadboardVoltageView
                  ? 'border-[#f59e0b] bg-[#f59e0b] text-[#111827]'
                  : 'border-[#3a4452] bg-[#1e252e] text-[#f8fafc] hover:border-[#f59e0b]'
              }`}
            >
              Voltage View {breadboardVoltageView ? 'ON' : 'OFF'}
            </button>

            <div className="grid grid-cols-3 gap-1 border-t border-[#3a4452] pt-2.5">
              {BB_PRESETS.map((bp) => (
                <button
                  key={bp.id}
                  type="button"
                  onClick={() => applyBreadboardPreset(bp.id)}
                  className="min-h-[34px] rounded border border-[#3a4452] bg-[#1e252e] px-1.5 py-1 text-[11px] font-semibold hover:border-[#f59e0b]"
                >
                  {bp.label}
                </button>
              ))}
            </div>

            {breadboardParts.length > 0 && (
              <ul className="space-y-1 border-t border-[#3a4452] pt-2.5">
                {breadboardParts.map((part) => (
                  <li
                    key={part.id}
                    className={`flex items-center justify-between rounded border px-2 py-1 text-xs ${
                      part.id === selectedPartId
                        ? 'border-[#38bdf8] bg-[#1a2636]'
                        : 'border-[#3a4452] bg-[#1e252e]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => selectBreadboardPart(part.id)}
                      className="truncate text-left font-mono-readout hover:text-[#f59e0b]"
                    >
                      {part.label} ({part.floating ? `${part.holeA}..Floating` : `${part.holeA}..${part.holeB}`})
                    </button>
                    <button
                      type="button"
                      onClick={() => removeBreadboardPart(part.id)}
                      className="ml-2 rounded bg-[#b91c1c] px-2 py-0.5 text-[11px] font-bold text-white"
                    >
                      Hapus
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {activeDrawer === 'cable' && (
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => spawnCable('probe_bnc_hook')}
                className="min-h-[38px] rounded border border-[#3a4452] bg-[#1e252e] px-2 py-1 text-xs font-semibold hover:border-[#f59e0b]"
              >
                + Probe
              </button>
              <button
                type="button"
                onClick={() => spawnCable('bnc_bnc')}
                className="min-h-[38px] rounded border border-[#3a4452] bg-[#1e252e] px-2 py-1 text-xs font-semibold hover:border-[#f59e0b]"
              >
                + BNC
              </button>
              <button
                type="button"
                onClick={() => spawnCable('banana_4mm')}
                className="min-h-[38px] rounded border border-[#3a4452] bg-[#1e252e] px-2 py-1 text-xs font-semibold hover:border-[#f59e0b]"
              >
                + Banana
              </button>
              <button
                type="button"
                onClick={() => spawnCable('banana_alligator')}
                className="min-h-[38px] rounded border border-[#3a4452] bg-[#1e252e] px-2 py-1 text-xs font-semibold hover:border-[#f59e0b]"
              >
                + Banana-Buaya
              </button>
              <button
                type="button"
                onClick={() => spawnCable('bnc_banana')}
                className="min-h-[38px] rounded border border-[#3a4452] bg-[#1e252e] px-2 py-1 text-xs font-semibold hover:border-[#f59e0b]"
              >
                + BNC-Banana (+/-)
              </button>
              <button
                type="button"
                onClick={() => spawnCable('bnc_alligator')}
                className="min-h-[38px] rounded border border-[#3a4452] bg-[#1e252e] px-2 py-1 text-xs font-semibold hover:border-[#f59e0b]"
              >
                + BNC-Buaya (+/-)
              </button>
            </div>

            {cables.length === 0 ? (
              <div className="rounded border border-[#3a4452] bg-[#1e252e] p-2.5 text-center text-xs text-[#cbd5e1]">
                Belum ada kabel
              </div>
            ) : (
              <ul className="space-y-1.5">
                {cables.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between rounded border border-[#3a4452] bg-[#1e252e] px-2.5 py-1.5 text-xs"
                  >
                    <span className="truncate font-mono-readout">
                      {c.label} ({c.endA ?? '-'} : {c.endB ?? '-'})
                    </span>
                    <button
                      type="button"
                      onClick={() => removeCable(c.id)}
                      className="ml-2 rounded bg-[#b91c1c] px-2 py-1 text-[11px] font-bold text-white"
                    >
                      Hapus
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {activeDrawer === 'gpu' && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-1.5">
              {(['high', 'medium', 'low'] as GraphicsQuality[]).map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setGraphics({ quality: q })}
                  className={`min-h-[38px] rounded px-2 py-1 text-xs font-bold uppercase ${
                    graphics.quality === q
                      ? 'bg-[#f59e0b] text-[#111827]'
                      : 'border border-[#3a4452] bg-[#1e252e] text-[#f8fafc]'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>

            <div className="space-y-1.5 text-xs">
              <label className="flex min-h-[34px] items-center justify-between rounded border border-[#3a4452] bg-[#1e252e] px-2.5">
                <span>Bloom</span>
                <input
                  type="checkbox"
                  checked={graphics.bloom}
                  onChange={(e) => setGraphics({ bloom: e.target.checked })}
                  className="h-4 w-4 accent-[#f59e0b]"
                />
              </label>
              <label className="flex min-h-[34px] items-center justify-between rounded border border-[#3a4452] bg-[#1e252e] px-2.5">
                <span>Shadows</span>
                <input
                  type="checkbox"
                  checked={graphics.shadows}
                  onChange={(e) => setGraphics({ shadows: e.target.checked })}
                  className="h-4 w-4 accent-[#f59e0b]"
                />
              </label>
              <label className="flex min-h-[34px] items-center justify-between rounded border border-[#3a4452] bg-[#1e252e] px-2.5">
                <span>Audio</span>
                <input
                  type="checkbox"
                  checked={graphics.soundEnabled}
                  onChange={(e) => setGraphics({ soundEnabled: e.target.checked })}
                  className="h-4 w-4 accent-[#f59e0b]"
                />
              </label>
            </div>

            <div className="space-y-1 rounded border border-[#3a4452] bg-[#1e252e] p-2 font-mono-readout text-[11px] text-[#cbd5e1]">
              <div className="flex justify-between">
                <span>FPS</span>
                <span className="font-bold text-[#f8fafc]">{perfStats.fps}</span>
              </div>
              <div className="flex justify-between">
                <span>Draw Calls</span>
                <span className="font-bold text-[#f8fafc]">{perfStats.drawCalls}</span>
              </div>
              <div className="flex justify-between">
                <span>Triangles</span>
                <span className="font-bold text-[#f8fafc]">{perfStats.triangles.toLocaleString()}</span>
              </div>
              <div className="truncate pt-1 text-[#f8fafc]" title={gpuInfo.renderer}>
                {gpuInfo.renderer}
              </div>
              {gpuInfo.isSoftwareFallback && (
                <div className="rounded bg-[#b91c1c] px-1.5 py-0.5 text-[10px] font-bold text-white">
                  Software WebGL aktif
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
