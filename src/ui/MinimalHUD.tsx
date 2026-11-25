import { useEffect } from 'react';
import { hotRefs } from '../state/hotRefs';
import { useLabStore, type CameraTarget } from '../state/labStore';
import { BreadboardInspector } from './BreadboardInspector';
import { CrumbBreadboardUI } from './CrumbBreadboardUI';

const CAM_BUTTONS: ReadonlyArray<{ id: CameraTarget; label: string; keyHint: string }> = [
  { id: 'bench', label: 'Meja', keyHint: '1' },
  { id: 'rigol', label: 'Rigol', keyHint: '2' },
  { id: 'dmm', label: 'DMM', keyHint: '3' },
  { id: 'kit', label: 'Kit', keyHint: '4' },
  { id: 'bb', label: 'BB', keyHint: '5' },
  { id: 'gen', label: 'Gen', keyHint: '6' },
  { id: 'psu', label: 'PSU', keyHint: '7' },
  { id: 'pot', label: 'Pot', keyHint: '8' },
];

export function MinimalHUD() {
  const cameraTarget = useLabStore((s) => s.cameraTarget);
  const setCameraTarget = useLabStore((s) => s.setCameraTarget);
  const activeDrawer = useLabStore((s) => s.activeDrawer);
  const setActiveDrawer = useLabStore((s) => s.setActiveDrawer);
  const activeTutorialId = useLabStore((s) => s.activeTutorialId);
  const hoverLabel = useLabStore((s) => s.hoverLabel);
  const grabbedEnd = useLabStore((s) => s.grabbedEnd);
  const grabbedCable = useLabStore((s) =>
    s.grabbedEnd ? s.cables.find((c) => c.id === s.grabbedEnd?.cableId) ?? null : null
  );
  const breadboardMode = useLabStore((s) => s.breadboardMode);
  const placingPart = useLabStore((s) => s.placingPart);
  const reshapingPart = useLabStore((s) => s.reshapingPart);
  const activeFaults = useLabStore((s) => s.activeFaults);
  const clearFaults = useLabStore((s) => s.clearFaults);
  const updatePsu = useLabStore((s) => s.updatePowerSupply);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '1') setCameraTarget('bench');
      else if (e.key === '2') setCameraTarget('rigol');
      else if (e.key === '3') setCameraTarget('dmm');
      else if (e.key === '4') setCameraTarget('kit');
      else if (e.key === '5') setCameraTarget('bb');
      else if (e.key === '6') setCameraTarget('gen');
      else if (e.key === '7') setCameraTarget('psu');
      else if (e.key === '8') setCameraTarget('pot');
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        const st = useLabStore.getState();
        if (st.grabbedEnd) st.removeCable(st.grabbedEnd.cableId);
      } else if (e.key === 'Escape') {
        const st = useLabStore.getState();
        if (st.placingPart) st.stepBackPlacing();
        else if (st.reshapingPart) useLabStore.setState({ reshapingPart: null });
        else if (st.selectedBreadboardPartId) st.selectBreadboardPart(null);
        else if (st.kitSelected) st.selectKitBox(false);
        else if (activeDrawer) setActiveDrawer(null);
        else if (grabbedEnd) st.dropOrSnapCableEnd(null, [...hotRefs.handTargetWorld]);
        else if (st.breadboardMode) st.exitBreadboardMode();
        else if (cameraTarget !== 'bench') setCameraTarget('bench');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeDrawer, cameraTarget, grabbedEnd, setActiveDrawer, setCameraTarget]);

  const isAdaptiveScopeDrag =
    grabbedEnd?.end === 'endB' &&
    grabbedCable &&
    (grabbedCable.endA === 'rigol_ch1' ||
      grabbedCable.endA === 'rigol_ch2' ||
      grabbedCable.endA === 'rigol_ext' ||
      grabbedCable.endA === 'gen_out' ||
      grabbedCable.endA === 'gen_ch2_out') &&
    (grabbedCable.kind === 'banana_4mm' || grabbedCable.kind === 'bnc_banana' || grabbedCable.kind === 'bnc_alligator');

  const activePrompt = grabbedEnd
    ? grabbedEnd.end === 'gndClip'
      ? grabbedCable?.kind === 'bnc_banana'
        ? 'Ujung (-) GND Banana: klik soket minus/GND (atau klik meja / Esc untuk lepas)'
        : 'Jepit Buaya (-) GND: klik jumper/rel GND (atau klik meja / Esc untuk lepas)'
      : isAdaptiveScopeDrag
        ? 'Kabel BNC: klik BNC lain (BNC-BNC), Kit/PSU (2× Banana +/-), atau Jumper/BB (2× Buaya +/-)'
        : 'Klik soket/jumper untuk pasang (klik banana terpasang untuk tumpuk), meja untuk lepas, Del hapus'
    : reshapingPart
      ? `Klik lubang tujuan untuk ${reshapingPart.mode}`
      : placingPart
        ? placingPart.kind === 'jumper' && placingPart.floating
          ? 'Klik lubang breadboard untuk pasang Jumper Bebas (R=arah condong, siap jepit buaya)'
          : placingPart.anchorHoleA
            ? placingPart.kind === 'jumper'
              ? 'Klik lubang tujuan (F/klik ulang: Floating, Klik kanan/B: belok, Esc: mundur)'
              : `Drag atau klik lubang Pin B (${placingPart.label})`
            : `Klik/drag di breadboard (${placingPart.label}, R=putar)`
        : hoverLabel;

  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-3 sm:p-4">
      <CrumbBreadboardUI />

      {!breadboardMode ? (
        <div className="flex items-start justify-between gap-2">
          <nav
            aria-label="Kamera"
            className="pointer-events-auto inline-flex flex-wrap items-center gap-1 rounded-md border border-[#3a4452] bg-[#14191f] p-1 shadow-md"
          >
            {CAM_BUTTONS.map((btn) => {
              const active = cameraTarget === btn.id;
              return (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => setCameraTarget(btn.id)}
                  onMouseUp={(e) => e.currentTarget.blur()}
                  aria-pressed={active}
                  className={`min-h-[38px] min-w-[40px] rounded px-2.5 py-1.5 text-sm font-semibold transition-colors ${
                    active
                      ? 'bg-[#f59e0b] text-[#111827]'
                      : 'bg-transparent text-[#f8fafc] hover:bg-[#1e252e]'
                  }`}
                >
                  {btn.label}
                </button>
              );
            })}
          </nav>

          <div className="pointer-events-auto flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              aria-pressed={activeDrawer === 'tutorial' || activeTutorialId !== null}
              onClick={() => setActiveDrawer(activeDrawer === 'tutorial' ? null : 'tutorial')}
              onMouseUp={(e) => e.currentTarget.blur()}
              className={`flex min-h-[44px] items-center justify-center rounded-md border px-3 text-xs font-bold shadow-md transition-colors ${
                activeDrawer === 'tutorial' || activeTutorialId !== null
                  ? 'border-[#f59e0b] bg-[#f59e0b] text-[#111827]'
                  : 'border-[#3a4452] bg-[#14191f] text-[#f8fafc] hover:bg-[#1e252e]'
              }`}
            >
              Tutorial
            </button>
            <button
              type="button"
              aria-label="Menu Lab"
              aria-expanded={activeDrawer !== null}
              onClick={() => setActiveDrawer(activeDrawer ? null : 'kit')}
              onMouseUp={(e) => e.currentTarget.blur()}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-[#3a4452] bg-[#14191f] px-3 text-base font-bold text-[#f8fafc] shadow-md hover:bg-[#1e252e]"
            >
              {activeDrawer ? '✕' : '☰'}
            </button>
          </div>
        </div>
      ) : (
        <div />
      )}

      <div className="flex flex-col items-center gap-2">
        <BreadboardInspector />
        {activeFaults.length > 0 && (
          <div
            role="alert"
            className="pointer-events-auto flex items-center gap-3 rounded-md border border-[#ef4444] bg-[#b91c1c] px-3 py-1.5 text-sm font-semibold text-white shadow-md"
          >
            <span>{activeFaults[0].message}</span>
            <button
              type="button"
              onClick={() => {
                updatePsu({ outputEnabled: false });
                clearFaults();
              }}
              className="rounded bg-[#14191f] px-2.5 py-1 text-xs font-bold text-[#f8fafc] hover:bg-[#1e252e]"
            >
              Reset
            </button>
          </div>
        )}

        {activePrompt && (
          <div className="rounded-md border border-[#3a4452] bg-[#14191f] px-3 py-1 font-mono-readout text-xs font-semibold text-[#f8fafc] shadow-sm">
            {activePrompt}
          </div>
        )}
      </div>
    </div>
  );
}
