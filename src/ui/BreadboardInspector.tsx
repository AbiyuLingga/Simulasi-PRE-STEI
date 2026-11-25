import { useEffect, useState } from 'react';
import { holeIdToElectricalNode } from '../simulation/breadboard/breadboardModel';
import { hotRefs } from '../state/hotRefs';
import { useLabStore } from '../state/labStore';

const RESISTOR_CHIPS = [100, 330, 1000, 4700, 10_000, 100_000] as const;
const CAP_CHIPS = [
  { label: '8.2nF', value: 8.2e-9 },
  { label: '100nF', value: 100e-9 },
  { label: '1µF', value: 1e-6 },
  { label: '10µF', value: 10e-6 },
  { label: '100µF', value: 100e-6 },
] as const;
const INDUCTOR_CHIPS = [
  { label: '1mH', value: 1e-3 },
  { label: '2.5mH', value: 2.5e-3 },
  { label: '10mH', value: 10e-3 },
] as const;
const LED_CHOICES = [
  { label: 'Merah', color: '#ef4444', vf: 1.9 },
  { label: 'Hijau', color: '#22c55e', vf: 2.1 },
  { label: 'Kuning', color: '#eab308', vf: 2.0 },
  { label: 'Biru', color: '#3b82f6', vf: 3.1 },
  { label: 'Putih', color: '#f8fafc', vf: 3.2 },
] as const;
const JUMPER_COLORS = ['#dc2626', '#18181b', '#2563eb', '#16a34a', '#eab308', '#f8fafc'] as const;

export function BreadboardInspector() {
  const selectedId = useLabStore((s) => s.selectedBreadboardPartId);
  const parts = useLabStore((s) => s.breadboardParts);
  const reshapingPart = useLabStore((s) => s.reshapingPart);
  const selectPart = useLabStore((s) => s.selectBreadboardPart);
  const startReshape = useLabStore((s) => s.startReshapingPart);
  const updatePart = useLabStore((s) => s.updateBreadboardPart);
  const flipPart = useLabStore((s) => s.flipBreadboardPart);
  const rotatePart = useLabStore((s) => s.rotateBreadboardPart);
  const toggleJumperFloating = useLabStore((s) => s.toggleJumperFloating);
  const pullAlligator = useLabStore((s) => s.pullAlligatorFromFloatingJumper);
  const pullBncAlligator = useLabStore((s) => s.pullBncAlligatorFromFloatingJumper);
  const removePart = useLabStore((s) => s.removeBreadboardPart);

  const part = parts.find((p) => p.id === selectedId);
  const [customOhms, setCustomOhms] = useState('');
  const [liveDeltaV, setLiveDeltaV] = useState(0);
  const [liveCurrentMa, setLiveCurrentMa] = useState<number | null>(null);

  useEffect(() => {
    if (!part) return;
    setCustomOhms(String(part.value));
    const read = () => {
      const va = hotRefs.bbNodeVoltages[holeIdToElectricalNode(part.holeA)] ?? 0;
      if (part.kind === 'jumper' && part.floating) {
        setLiveDeltaV(va);
        setLiveCurrentMa(null);
        return;
      }
      const vb = hotRefs.bbNodeVoltages[holeIdToElectricalNode(part.holeB)] ?? 0;
      const dv = va - vb;
      setLiveDeltaV(dv);
      if (part.kind === 'led') {
        setLiveCurrentMa((hotRefs.ledCurrents[part.id] ?? 0) * 1000);
      } else if (part.kind === 'resistor' && part.value > 0) {
        setLiveCurrentMa((dv / part.value) * 1000);
      } else {
        setLiveCurrentMa(null);
      }
    };
    read();
    const timer = window.setInterval(read, 180);
    return () => clearInterval(timer);
  }, [part]);

  if (!part) return null;

  const isFloatingJumper = part.kind === 'jumper' && Boolean(part.floating);

  return (
    <div
      role="region"
      aria-label="Inspektor Komponen Breadboard"
      className="pointer-events-auto mx-auto flex max-w-[96vw] flex-wrap items-center gap-2 rounded-md border border-[#3a4452] bg-[#14191f] px-3 py-2 text-xs text-[#f8fafc] shadow-xl"
    >
      <div className="flex items-center gap-2 border-r border-[#3a4452] pr-2.5">
        <span className="font-bold text-[#f59e0b]">{part.label}</span>
        <span className="font-mono-readout text-[11px] text-[#cbd5e1]">
          {isFloatingJumper ? `${part.holeA} → Floating (Jepit)` : `${part.holeA} → ${part.holeB}`}
        </span>
        <span className="rounded bg-[#1e252e] px-1.5 py-0.5 font-mono-readout text-[11px] text-[#f8fafc]">
          {liveDeltaV.toFixed(2)}V{liveCurrentMa !== null ? ` · ${liveCurrentMa.toFixed(1)}mA` : ''}
        </span>
      </div>

      {part.kind === 'resistor' && (
        <div className="flex flex-wrap items-center gap-1">
          {RESISTOR_CHIPS.map((ohms) => (
            <button
              key={ohms}
              type="button"
              onClick={() => updatePart(part.id, { value: ohms })}
              className={`rounded border px-1.5 py-0.5 font-mono-readout text-[11px] font-semibold ${
                part.value === ohms
                  ? 'border-[#f59e0b] bg-[#f59e0b] text-[#111827]'
                  : 'border-[#3a4452] bg-[#1e252e] text-[#f8fafc] hover:border-[#f59e0b]'
              }`}
            >
              {ohms >= 1000 ? `${ohms / 1000}k` : `${ohms}Ω`}
            </button>
          ))}
          <form
            className="inline-flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              const parsed = Number(customOhms);
              if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 1e8) {
                updatePart(part.id, { value: parsed });
              }
            }}
          >
            <input
              type="number"
              min={1}
              max={100000000}
              step="any"
              aria-label="Nilai Ohm"
              value={customOhms}
              onChange={(e) => setCustomOhms(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              className="w-16 rounded border border-[#3a4452] bg-[#0f1318] px-1.5 py-0.5 font-mono-readout text-[11px] text-[#f8fafc]"
            />
            <button
              type="submit"
              className="rounded border border-[#3a4452] bg-[#1e252e] px-1.5 py-0.5 text-[11px] font-semibold hover:border-[#f59e0b]"
            >
              Set
            </button>
          </form>
        </div>
      )}

      {part.kind === 'capacitor' && (
        <div className="flex items-center gap-1">
          {CAP_CHIPS.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => updatePart(part.id, { value: c.value })}
              className={`rounded border px-1.5 py-0.5 font-mono-readout text-[11px] font-semibold ${
                Math.abs(part.value - c.value) < c.value * 0.05
                  ? 'border-[#f59e0b] bg-[#f59e0b] text-[#111827]'
                  : 'border-[#3a4452] bg-[#1e252e] text-[#f8fafc] hover:border-[#f59e0b]'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {part.kind === 'inductor' && (
        <div className="flex items-center gap-1">
          {INDUCTOR_CHIPS.map((l) => (
            <button
              key={l.label}
              type="button"
              onClick={() => updatePart(part.id, { value: l.value })}
              className={`rounded border px-1.5 py-0.5 font-mono-readout text-[11px] font-semibold ${
                Math.abs(part.value - l.value) < l.value * 0.05
                  ? 'border-[#f59e0b] bg-[#f59e0b] text-[#111827]'
                  : 'border-[#3a4452] bg-[#1e252e] text-[#f8fafc] hover:border-[#f59e0b]'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}

      {part.kind === 'led' && (
        <div className="flex items-center gap-1">
          {LED_CHOICES.map((led) => (
            <button
              key={led.label}
              type="button"
              onClick={() => updatePart(part.id, { color: led.color, value: led.vf })}
              className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold ${
                part.color === led.color
                  ? 'border-[#f59e0b] bg-[#f59e0b] text-[#111827]'
                  : 'border-[#3a4452] bg-[#1e252e] text-[#f8fafc] hover:border-[#f59e0b]'
              }`}
            >
              {led.label}
            </button>
          ))}
        </div>
      )}

      {part.kind === 'jumper' && (
        <div className="flex items-center gap-1.5">
          {JUMPER_COLORS.map((col) => (
            <button
              key={col}
              type="button"
              aria-label={`Warna kabel ${col}`}
              onClick={() =>
                updatePart(part.id, { color: col, label: isFloatingJumper ? 'Jumper Bebas' : 'Jumper' })
              }
              style={{ backgroundColor: col }}
              className={`h-5 w-5 rounded-full border-2 ${
                part.color === col ? 'border-[#f59e0b] scale-110' : 'border-[#475569]'
              }`}
            />
          ))}
          <button
            type="button"
            onClick={() => toggleJumperFloating(part.id)}
            className={`ml-1 rounded border px-2 py-1 text-[11px] font-semibold ${
              isFloatingJumper
                ? 'border-[#f59e0b] bg-[#f59e0b] text-[#111827]'
                : 'border-[#3a4452] bg-[#1e252e] text-[#f8fafc] hover:border-[#f59e0b]'
            }`}
          >
            {isFloatingJumper ? 'Hubungkan Pin B' : 'Floating'}
          </button>
          {isFloatingJumper && (
            <>
              <button
                type="button"
                onClick={() => pullBncAlligator(part.id)}
                className="rounded border border-[#eab308] bg-[#422006] px-2 py-1 text-[11px] font-bold text-[#fef08a] hover:bg-[#eab308] hover:text-[#111827]"
              >
                Tarik BNC-Buaya
              </button>
              <button
                type="button"
                onClick={() => pullAlligator(part.id)}
                className="rounded border border-[#22c55e] bg-[#14532d] px-2 py-1 text-[11px] font-bold text-[#dcfce7] hover:bg-[#16a34a] hover:text-white"
              >
                Tarik Banana-Buaya
              </button>
            </>
          )}
        </div>
      )}

      <div className="flex items-center gap-1 border-l border-[#3a4452] pl-2">
        {part.kind !== 'opamp741' && (
          <>
            {!isFloatingJumper && (
              <>
                <button
                  type="button"
                  onClick={() => startReshape(part.id, 'pinA')}
                  className={`rounded border px-2 py-1 text-[11px] font-semibold ${
                    reshapingPart?.partId === part.id && reshapingPart.mode === 'pinA'
                      ? 'border-[#38bdf8] bg-[#38bdf8] text-[#0f172a]'
                      : 'border-[#3a4452] bg-[#1e252e] text-[#f8fafc] hover:border-[#38bdf8]'
                  }`}
                >
                  Pin A
                </button>
                <button
                  type="button"
                  onClick={() => startReshape(part.id, 'pinB')}
                  className={`rounded border px-2 py-1 text-[11px] font-semibold ${
                    reshapingPart?.partId === part.id && reshapingPart.mode === 'pinB'
                      ? 'border-[#fb923c] bg-[#fb923c] text-[#0f172a]'
                      : 'border-[#3a4452] bg-[#1e252e] text-[#f8fafc] hover:border-[#fb923c]'
                  }`}
                >
                  Pin B
                </button>
                <button
                  type="button"
                  onClick={() => flipPart(part.id)}
                  className="rounded border border-[#3a4452] bg-[#1e252e] px-2 py-1 text-[11px] font-semibold hover:border-[#f59e0b]"
                >
                  Balik
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => rotatePart(part.id)}
              className="rounded border border-[#3a4452] bg-[#1e252e] px-2 py-1 text-[11px] font-semibold hover:border-[#f59e0b]"
            >
              Putar
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => startReshape(part.id, 'move')}
          className={`rounded border px-2 py-1 text-[11px] font-semibold ${
            reshapingPart?.partId === part.id && reshapingPart.mode === 'move'
              ? 'border-[#f59e0b] bg-[#f59e0b] text-[#111827]'
              : 'border-[#3a4452] bg-[#1e252e] text-[#f8fafc] hover:border-[#f59e0b]'
          }`}
        >
          Pindah
        </button>
        <button
          type="button"
          onClick={() => removePart(part.id)}
          className="rounded bg-[#b91c1c] px-2 py-1 text-[11px] font-bold text-white hover:bg-[#dc2626]"
        >
          Hapus
        </button>
        <button
          type="button"
          aria-label="Tutup inspektor"
          onClick={() => selectPart(null)}
          className="rounded border border-[#3a4452] bg-[#1e252e] px-2 py-1 text-[11px] font-bold hover:border-[#cbd5e1]"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
