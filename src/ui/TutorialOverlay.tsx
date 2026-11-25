import { useEffect, useState } from 'react';
import { hotRefs } from '../state/hotRefs';
import { useLabStore } from '../state/labStore';
import {
  getTutorialById,
  getTutorialProgress,
  type ObserveTutorialStep,
} from '../tutorials/moduleTutorials';
import { TutorialWorksheet } from './TutorialWorksheet';

interface LiveEval {
  readingText: string;
  verified: boolean;
}

function evaluateObserveStep(step: ObserveTutorialStep): LiveEval {
  const tol = step.tolerance ?? 0.35;
  const st = useLabStore.getState();

  if (step.metricKind === 'dmm_vdc') {
    const meas = hotRefs.dm3058Meas;
    if (!meas.connectedMain) {
      return { readingText: 'DM3058 belum terhubung ke node uji', verified: false };
    }
    const val = Math.abs(meas.vdc);
    const verified = step.expectedValue !== undefined && Math.abs(val - step.expectedValue) <= tol;
    return { readingText: `${meas.vdc.toFixed(3)} V DC`, verified };
  }

  if (step.metricKind === 'dmm_vac') {
    const meas = hotRefs.dm3058Meas;
    if (!meas.connectedMain) {
      return { readingText: 'DM3058 belum terhubung ke sumber AC', verified: false };
    }
    const verified = step.expectedValue !== undefined && Math.abs(meas.vacRms - step.expectedValue) <= tol;
    const fStr = meas.freqHz > 0 ? ` · ${meas.freqHz >= 1000 ? `${(meas.freqHz / 1000).toFixed(2)} kHz` : `${meas.freqHz.toFixed(1)} Hz`}` : '';
    return { readingText: `${meas.vacRms.toFixed(3)} Vrms${fStr}`, verified };
  }

  if (step.metricKind === 'dmm_ohms') {
    const meas = hotRefs.dm3058Meas;
    if (!meas.connectedMain || !Number.isFinite(meas.ohms2W)) {
      return { readingText: 'Hubungkan DM3058 ke kaki resistor (PSU mati)', verified: false };
    }
    const verified = step.expectedValue !== undefined && Math.abs(meas.ohms2W - step.expectedValue) <= tol;
    const text = meas.ohms2W >= 1000 ? `${(meas.ohms2W / 1000).toFixed(3)} kΩ` : `${meas.ohms2W.toFixed(2)} Ω`;
    return { readingText: text, verified };
  }

  if (step.metricKind === 'dmm_ohms4w') {
    const meas = hotRefs.dm3058Meas;
    if (!meas.connectedMain || !Number.isFinite(meas.ohms4W)) {
      return { readingText: 'Hubungkan Force HI/LO & Sense HI/LO DM3058', verified: false };
    }
    const verified = step.expectedValue !== undefined && Math.abs(meas.ohms4W - step.expectedValue) <= tol;
    const text = meas.ohms4W >= 1000 ? `${(meas.ohms4W / 1000).toFixed(3)} kΩ` : `${meas.ohms4W.toFixed(3)} Ω`;
    return { readingText: `${text} (4W${meas.connectedSense ? ' OK' : ' 2-Wire'})`, verified };
  }

  if (step.metricKind === 'dmm_idc') {
    const meas = hotRefs.dm3058Meas;
    if (!meas.connectedCurrent) {
      return { readingText: 'Hubungkan port I & COM DM3058 (mode = I)', verified: false };
    }
    const val = Math.abs(meas.idc);
    const verified = step.expectedValue !== undefined && Math.abs(val - step.expectedValue) <= tol;
    return { readingText: `${(meas.idc * 1000).toFixed(2)} mA DC`, verified };
  }

  const frame = hotRefs.scopeFrame;
  if (!frame) {
    return { readingText: 'Menunggu akuisisi DS1052E...', verified: false };
  }

  const stats = (arr: Float32Array) => {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] < min) min = arr[i];
      if (arr[i] > max) max = arr[i];
    }
    return { min, max, vpp: max - min };
  };

  const s1 = stats(frame.ch1Samples);
  const s2 = stats(frame.ch2Samples);

  if (step.metricKind === 'scope_ch1_ch2') {
    const freq = frame.measurements.values.Freq;
    const verified =
      step.expectedValue !== undefined &&
      Math.abs(s1.vpp - step.expectedValue) <= tol &&
      Math.abs(s2.vpp - 3.0) <= 0.4;
    return {
      readingText: `CH1 ${s1.vpp.toFixed(2)}Vpp (${freq ? `${Math.round(freq)}Hz` : '--'}) | CH2 ${s2.vpp.toFixed(2)}Vpp`,
      verified,
    };
  }

  if (step.metricKind === 'scope_ch1_vpp') {
    const vavg = frame.measurements.values.Vavg ?? 0;
    const verified = step.expectedValue !== undefined && Math.abs(s1.vpp - step.expectedValue) <= tol;
    return {
      readingText: `CH1 ${s1.vpp.toFixed(2)}Vpp · Vavg ${vavg >= 0 ? '+' : ''}${vavg.toFixed(2)}V (${st.scope.ch1.coupling})`,
      verified,
    };
  }

  if (step.metricKind === 'scope_ch2_vpp') {
    const verified =
      s1.vpp > 0.35 && step.expectedValue !== undefined && Math.abs(s2.vpp - step.expectedValue) <= tol;
    return {
      readingText: `CH1 ${s1.vpp.toFixed(2)}Vpp | CH2 ${s2.vpp.toFixed(3)}Vpp`,
      verified,
    };
  }

  if (step.metricKind === 'scope_xy') {
    const isXY = st.scope.horizontal.timeBaseMode === 'X-Y';
    const verified =
      isXY && s1.vpp > 0.45 && step.expectedValue !== undefined && Math.abs(s2.vpp - step.expectedValue) <= tol;
    return {
      readingText: `${isXY ? 'Mode X-Y AKTIF' : 'Belum Mode X-Y'} · X:${s1.vpp.toFixed(2)}Vpp Y:${s2.vpp.toFixed(2)}Vpp`,
      verified,
    };
  }

  if (step.metricKind === 'scope_phase') {
    const verified =
      s1.vpp > 2.5 &&
      step.expectedValue !== undefined &&
      Math.abs(s2.vpp - step.expectedValue) <= tol;
    return {
      readingText: `CH1 ${s1.vpp.toFixed(2)}Vpp | CH2 ${s2.vpp.toFixed(2)}Vpp`,
      verified,
    };
  }

  const verified =
    s1.vpp > 2.2 &&
    step.expectedValue !== undefined &&
    Math.abs(s2.vpp - step.expectedValue) <= tol;
  return {
    readingText: `CH1 ${s1.vpp.toFixed(2)}Vpp | CH2 ${s2.vpp.toFixed(2)}Vpp`,
    verified,
  };
}

export function TutorialOverlay() {
  const activeTutorialId = useLabStore((s) => s.activeTutorialId);
  const tutorialStepIndex = useLabStore((s) => s.tutorialStepIndex);
  const tutorialCollapsed = useLabStore((s) => s.tutorialCollapsed);
  const worksheetOpen = useLabStore((s) => s.worksheetOpen);
  const breadboardMode = useLabStore((s) => s.breadboardMode);
  const cables = useLabStore((s) => s.cables);
  const activeKit = useLabStore((s) => s.activeKit);
  const breadboardParts = useLabStore((s) => s.breadboardParts);
  const grabbedEnd = useLabStore((s) => s.grabbedEnd);
  const setTutorialStep = useLabStore((s) => s.setTutorialStep);
  const toggleTutorialCollapsed = useLabStore((s) => s.toggleTutorialCollapsed);
  const toggleWorksheet = useLabStore((s) => s.toggleWorksheet);
  const stopTutorial = useLabStore((s) => s.stopTutorial);
  const autoWireCurrentTutorialStep = useLabStore((s) => s.autoWireCurrentTutorialStep);
  const applyTutorialInstrumentPreset = useLabStore((s) => s.applyTutorialInstrumentPreset);
  const setCameraTarget = useLabStore((s) => s.setCameraTarget);

  const [liveEval, setLiveEval] = useState<LiveEval>({ readingText: '--', verified: false });

  const tutorial = getTutorialById(activeTutorialId);
  const step = tutorial?.steps[tutorialStepIndex];

  useEffect(() => {
    if (!tutorial || !step || step.kind !== 'observe') return;
    setLiveEval(evaluateObserveStep(step));
    const timer = window.setInterval(() => {
      setLiveEval(evaluateObserveStep(step));
    }, 250);
    return () => clearInterval(timer);
  }, [tutorial, step]);

  if (!tutorial || !step) return null;

  const progress = getTutorialProgress(tutorial, cables, activeKit, breadboardParts);
  const isWireDone = step.kind === 'wire' && progress.completedStepIds.has(step.id);

  return (
    <>
      <section
        aria-label="Panduan Percobaan Modul"
        className={`pointer-events-auto fixed left-3 z-30 flex max-h-[78vh] w-[308px] max-w-[calc(100vw-24px)] flex-col rounded-md border border-[#3a4452] bg-[#14191f]/95 text-[#f8fafc] shadow-xl backdrop-blur-sm sm:left-4 ${
          breadboardMode ? 'top-[146px]' : 'top-16'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-[#3a4452] px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="rounded bg-[#f59e0b] px-1.5 py-0.5 font-mono-readout text-[11px] font-bold text-[#111827]">
              {tutorial.moduleCode}
            </span>
            <span className="truncate text-xs font-bold">{tutorial.title}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={toggleWorksheet}
              className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${
                worksheetOpen
                  ? 'border-[#38bdf8] bg-[#0284c7] text-white'
                  : 'border-[#3a4452] bg-[#1e252e] text-[#7dd3fc] hover:border-[#38bdf8]'
              }`}
            >
              Tabel
            </button>
            <span className="mx-0.5 font-mono-readout text-[10px] text-[#cbd5e1]">
              {tutorialStepIndex + 1}/{tutorial.steps.length}
            </span>
            <button
              type="button"
              aria-label={tutorialCollapsed ? 'Buka detail panduan' : 'Tutup detail panduan'}
              onClick={toggleTutorialCollapsed}
              className="flex h-6 w-6 items-center justify-center rounded border border-[#3a4452] bg-[#1e252e] text-xs font-bold hover:border-[#f59e0b]"
            >
              {tutorialCollapsed ? '+' : '-'}
            </button>
            <button
              type="button"
              aria-label="Tutup tutorial"
              onClick={stopTutorial}
              className="flex h-6 w-6 items-center justify-center rounded border border-[#3a4452] bg-[#1e252e] text-xs font-bold hover:border-[#ef4444]"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Clickable Segmented Progress Bar */}
        <div className="grid gap-1 px-3 pt-2" style={{ gridTemplateColumns: `repeat(${tutorial.steps.length}, minmax(0, 1fr))` }}>
          {tutorial.steps.map((sItem, idx) => {
            const done =
              sItem.kind === 'wire'
                ? progress.completedStepIds.has(sItem.id)
                : progress.allWiresDone && idx === tutorialStepIndex && liveEval.verified;
            const active = idx === tutorialStepIndex;
            return (
              <button
                key={sItem.id}
                type="button"
                aria-label={`Langkah ${idx + 1}: ${sItem.title}`}
                onClick={() => setTutorialStep(idx)}
                className={`h-1.5 rounded-sm transition-colors ${
                  done
                    ? 'bg-[#10b981]'
                    : active
                      ? 'bg-[#f59e0b]'
                      : 'bg-[#2a3340] hover:bg-[#475569]'
                }`}
              />
            );
          })}
        </div>

        {!tutorialCollapsed && (
          <div className="space-y-2.5 overflow-y-auto p-3">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-xs font-bold text-[#f8fafc]">{step.title}</h2>
              {isWireDone && (
                <span className="shrink-0 rounded bg-[#10b981] px-1.5 py-0.5 text-[10px] font-bold text-[#052e16]">
                  TERPASANG
                </span>
              )}
            </div>

            <p className="text-[11px] leading-relaxed text-[#cbd5e1]">{step.instruction}</p>

            {step.kind === 'wire' ? (
              <div className="space-y-1.5 rounded border border-[#3a4452] bg-[#1e252e] p-2">
                <div className="flex items-center justify-between gap-1.5 text-[11px]">
                  <span className="truncate rounded border border-[#f59e0b]/60 bg-[#14191f] px-1.5 py-0.5 font-mono-readout font-semibold text-[#fbbf24]">
                    {step.fromLabel}
                  </span>
                  <span className="shrink-0 font-bold text-[#94a3b8]">→</span>
                  <span className="truncate rounded border border-[#10b981]/60 bg-[#14191f] px-1.5 py-0.5 font-mono-readout font-semibold text-[#34d399]">
                    {step.toLabel}
                  </span>
                </div>
                {step.gndLabel && (
                  <div className="flex items-center justify-between text-[10px] text-[#94a3b8]">
                    <span>Cabang hitam (-) GND:</span>
                    <span className="font-mono-readout font-semibold text-[#e2e8f0]">{step.gndLabel}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-[10px] text-[#94a3b8]">
                  <span>
                    {grabbedEnd
                      ? 'Kabel siap: klik soket tujuan hijau'
                      : 'Klik soket kuning untuk tarik kabel adaptif'}
                  </span>
                  <span
                    aria-hidden="true"
                    className="inline-block h-2.5 w-2.5 rounded-full border border-white/40"
                    style={{ backgroundColor: step.cableColor }}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Step-by-Step Instrument / Oscilloscope Operation Guide */}
                {step.controlsGuide.length > 0 && (
                  <div className="space-y-1 rounded border border-[#334155] bg-[#0f172a] p-2">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-[#38bdf8]">
                      Cara Mengatur Instrumen
                    </div>
                    <ul className="space-y-1 text-[11px] leading-snug text-[#cbd5e1]">
                      {step.controlsGuide.map((line, i) => (
                        <li key={i} className="flex gap-1.5">
                          <span className="shrink-0 text-[#f59e0b]">•</span>
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* What to Read Callout */}
                <div className="rounded border border-[#f59e0b]/40 bg-[#1e252e] p-2 text-[11px]">
                  <div className="text-[10px] font-bold uppercase text-[#fbbf24]">Yang Dicari &amp; Dicatat</div>
                  <p className="mt-0.5 leading-snug text-[#e2e8f0]">{step.whatToRead}</p>
                </div>

                {/* Live Telemetry Verification */}
                <div className="space-y-1 rounded border border-[#3a4452] bg-[#1e252e] p-2 font-mono-readout text-[11px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[#94a3b8]">Terukur:</span>
                    <span className="text-right font-bold text-[#f8fafc]">{liveEval.readingText}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[#94a3b8]">Target:</span>
                    <span className="text-right text-[#cbd5e1]">{step.expectedLabel}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    {step.instrumentPreset ? (
                      <button
                        type="button"
                        onClick={() => applyTutorialInstrumentPreset(step.instrumentPreset!)}
                        className="rounded border border-[#38bdf8]/60 bg-[#0c2740] px-2 py-0.5 text-[10px] font-sans font-bold text-[#7dd3fc] hover:bg-[#0284c7] hover:text-white"
                      >
                        {step.instrumentPresetLabel ?? 'Atur Cepat'}
                      </button>
                    ) : (
                      <span />
                    )}
                    {liveEval.verified && (
                      <span className="rounded bg-[#10b981] px-2 py-0.5 font-sans text-[10px] font-bold text-[#052e16]">
                        SESUAI
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Footer Navigation */}
            <div className="flex items-center justify-between gap-1.5 pt-0.5">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={tutorialStepIndex === 0}
                  onClick={() => setTutorialStep(tutorialStepIndex - 1)}
                  className="min-h-[30px] rounded border border-[#3a4452] bg-[#1e252e] px-2 text-xs font-bold text-[#f8fafc] disabled:opacity-40 hover:border-[#f59e0b]"
                >
                  &lt;
                </button>
                <button
                  type="button"
                  disabled={tutorialStepIndex >= tutorial.steps.length - 1}
                  onClick={() => setTutorialStep(tutorialStepIndex + 1)}
                  className="min-h-[30px] rounded border border-[#3a4452] bg-[#1e252e] px-2 text-xs font-bold text-[#f8fafc] disabled:opacity-40 hover:border-[#f59e0b]"
                >
                  &gt;
                </button>
                <button
                  type="button"
                  onClick={() => setCameraTarget(step.cameraHint)}
                  className="min-h-[30px] rounded border border-[#3a4452] bg-[#1e252e] px-2.5 text-xs font-semibold text-[#f8fafc] hover:border-[#f59e0b]"
                >
                  Fokus
                </button>
              </div>

              {step.kind === 'wire' ? (
                <button
                  type="button"
                  onClick={autoWireCurrentTutorialStep}
                  className="min-h-[30px] rounded bg-[#f59e0b] px-2.5 text-xs font-bold text-[#111827] hover:bg-[#fbbf24]"
                >
                  {isWireDone ? 'Lanjut' : 'Pasang'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopTutorial}
                  className="min-h-[30px] rounded bg-[#10b981] px-2.5 text-xs font-bold text-[#052e16] hover:bg-[#34d399]"
                >
                  Selesai
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Interactive Practical Worksheet Table Panel */}
      {worksheetOpen && <TutorialWorksheet tutorial={tutorial} onClose={toggleWorksheet} />}
    </>
  );
}
