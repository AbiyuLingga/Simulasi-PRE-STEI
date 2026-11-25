import { useEffect, useState } from 'react';
import { hotRefs } from '../state/hotRefs';
import type { ModuleTutorial } from '../tutorials/moduleTutorials';

const WORKSHEET_STORAGE_KEY = 'el2101_worksheets_v1';

interface SavedWorksheetData {
  rows: Array<Record<string, string>>;
  notes: string;
}

function loadWorksheetStore(): Record<string, SavedWorksheetData> {
  try {
    const raw = localStorage.getItem(WORKSHEET_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, SavedWorksheetData>) : {};
  } catch {
    return {};
  }
}

function saveWorksheetEntry(tutId: string, data: SavedWorksheetData): void {
  try {
    const all = loadWorksheetStore();
    all[tutId] = data;
    localStorage.setItem(WORKSHEET_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // ignore quota errors
  }
}

function readLiveInstrumentSummary(): string {
  const m = hotRefs.dm3058Meas;
  const f = hotRefs.scopeFrame;
  const parts: string[] = [];
  if (m.connectedMain) {
    parts.push(`DMM: ${m.vdc.toFixed(3)}V`);
    if (Number.isFinite(m.ohms2W) && m.ohms2W < 1e8) {
      parts.push(`Ω: ${(m.ohms2W / 1000).toFixed(3)}kΩ`);
    }
  } else if (m.connectedCurrent) {
    parts.push(`DMM I: ${(m.idc * 1000).toFixed(2)}mA`);
  }
  if (f) {
    const vpp = (arr: Float32Array) => {
      let mn = Infinity;
      let mx = -Infinity;
      for (let i = 0; i < arr.length; i++) {
        if (arr[i] < mn) mn = arr[i];
        if (arr[i] > mx) mx = arr[i];
      }
      return Number.isFinite(mn) ? mx - mn : 0;
    };
    const v1 = vpp(f.ch1Samples);
    const v2 = vpp(f.ch2Samples);
    if (v1 > 0.02) parts.push(`CH1: ${v1.toFixed(2)}Vpp`);
    if (v2 > 0.02) parts.push(`CH2: ${v2.toFixed(2)}Vpp`);
    if (f.measurements.values.Freq) {
      const fq = f.measurements.values.Freq;
      parts.push(`f: ${fq >= 1000 ? `${(fq / 1000).toFixed(2)}kHz` : `${Math.round(fq)}Hz`}`);
    }
  }
  return parts.length > 0 ? parts.join(' · ') : 'Hubungkan instrumen untuk bacaan live';
}

export function TutorialWorksheet({
  tutorial,
  onClose,
}: {
  tutorial: ModuleTutorial;
  onClose: () => void;
}) {
  const spec = tutorial.worksheet;
  const [rows, setRows] = useState<Array<Record<string, string>>>(() => {
    const saved = loadWorksheetStore()[tutorial.id];
    return saved?.rows?.length ? saved.rows : spec.defaultRows.map((r) => ({ ...r }));
  });
  const [notes, setNotes] = useState<string>(() => loadWorksheetStore()[tutorial.id]?.notes ?? '');
  const [liveSummary, setLiveSummary] = useState<string>(() => readLiveInstrumentSummary());
  const [copiedMsg, setCopiedMsg] = useState(false);

  // Sync state when switching between sub-experiments
  useEffect(() => {
    const saved = loadWorksheetStore()[tutorial.id];
    setRows(saved?.rows?.length ? saved.rows : spec.defaultRows.map((r) => ({ ...r })));
    setNotes(saved?.notes ?? '');
  }, [tutorial.id, spec.defaultRows]);

  useEffect(() => {
    saveWorksheetEntry(tutorial.id, { rows, notes });
  }, [tutorial.id, rows, notes]);

  useEffect(() => {
    const t = window.setInterval(() => setLiveSummary(readLiveInstrumentSummary()), 350);
    return () => clearInterval(t);
  }, []);

  const updateCell = (rowIdx: number, colKey: string, val: string) => {
    setRows((prev) => prev.map((r, idx) => (idx === rowIdx ? { ...r, [colKey]: val } : r)));
  };

  const addRow = () => {
    const empty: Record<string, string> = {};
    for (const c of spec.columns) empty[c.key] = '';
    setRows((prev) => [...prev, empty]);
  };

  const resetWorksheet = () => {
    setRows(spec.defaultRows.map((r) => ({ ...r })));
    setNotes('');
  };

  const exportCsv = () => {
    const header = spec.columns.map((c) => `"${c.label}"`).join(',');
    const body = rows
      .map((r) => spec.columns.map((c) => `"${(r[c.key] ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const csv = `${header}\n${body}\n\n"Catatan","${notes.replace(/"/g, '""')}"`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(csv).catch(() => {});
    }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `worksheet_${tutorial.moduleCode.toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setCopiedMsg(true);
    window.setTimeout(() => setCopiedMsg(false), 1800);
  };

  return (
    <section
      aria-label="Lembar Kerja Praktikum"
      className="pointer-events-auto fixed right-3 bottom-12 z-30 flex max-h-[62vh] w-[430px] max-w-[calc(100vw-24px)] flex-col rounded-md border border-[#3a4452] bg-[#14191f]/95 text-[#f8fafc] shadow-2xl backdrop-blur-sm sm:right-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-[#3a4452] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded bg-[#0284c7] px-1.5 py-0.5 font-mono-readout text-[10px] font-bold text-white">
            WORKSHEET {tutorial.moduleCode}
          </span>
          <span className="truncate text-xs font-bold">{tutorial.title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={exportCsv}
            className="rounded border border-[#3a4452] bg-[#1e252e] px-2 py-0.5 text-[10px] font-semibold text-[#38bdf8] hover:border-[#38bdf8]"
          >
            {copiedMsg ? 'Tersimpan!' : 'Unduh CSV'}
          </button>
          <button
            type="button"
            aria-label="Tutup lembar kerja"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded border border-[#3a4452] bg-[#1e252e] text-xs font-bold hover:border-[#ef4444]"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="space-y-2 overflow-y-auto p-3 text-xs">
        <p className="text-[11px] leading-snug text-[#cbd5e1]">{spec.objective}</p>

        {spec.formulaHint && (
          <div className="rounded border border-[#0284c7]/40 bg-[#0f2234] px-2 py-1 font-mono-readout text-[10px] font-semibold text-[#7dd3fc]">
            Rumus: {spec.formulaHint}
          </div>
        )}

        {/* Live Telemetry Bar for Easy Reading */}
        <div className="rounded border border-[#334155] bg-[#0f172a] px-2 py-1 font-mono-readout text-[10px] text-[#34d399]">
          Live: {liveSummary}
        </div>

        {/* Editable Practical Data Table */}
        <div className="overflow-x-auto rounded border border-[#3a4452]">
          <table className="w-full border-collapse text-left text-[11px]">
            <thead>
              <tr className="border-b border-[#3a4452] bg-[#1e252e] text-[#cbd5e1]">
                {spec.columns.map((col) => (
                  <th key={col.key} className="px-2 py-1.5 font-semibold whitespace-nowrap">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rIdx) => (
                <tr key={rIdx} className="border-b border-[#26303d] last:border-b-0">
                  {spec.columns.map((col) => (
                    <td key={col.key} className="p-1">
                      {col.readOnly && row[col.key] ? (
                        <span className="block px-1 font-mono-readout text-[11px] text-[#e2e8f0]">
                          {row[col.key]}
                        </span>
                      ) : (
                        <input
                          type="text"
                          aria-label={`${col.label} baris ${rIdx + 1}`}
                          value={row[col.key] ?? ''}
                          placeholder={col.placeholder ?? '...'}
                          onChange={(e) => updateCell(rIdx, col.key, e.target.value)}
                          className="w-full min-w-[54px] rounded border border-[#334155] bg-[#0f172a] px-1.5 py-1 font-mono-readout text-[11px] text-[#f8fafc] placeholder-[#475569] focus:border-[#38bdf8] focus:outline-none"
                        />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={addRow}
            className="rounded border border-[#3a4452] bg-[#1e252e] px-2 py-1 text-[10px] font-semibold text-[#f8fafc] hover:border-[#f59e0b]"
          >
            + Tambah Baris
          </button>
          <button
            type="button"
            onClick={resetWorksheet}
            className="rounded border border-[#3a4452] bg-[#1e252e] px-2 py-1 text-[10px] font-semibold text-[#94a3b8] hover:border-[#ef4444] hover:text-white"
          >
            Reset Tabel
          </button>
        </div>

        {/* Conclusion / Lab Notes */}
        <div>
          <label className="mb-1 block text-[10px] font-semibold text-[#94a3b8]">
            Kesimpulan / Catatan Praktikan
          </label>
          <textarea
            rows={2}
            value={notes}
            placeholder={spec.notesPlaceholder}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full resize-none rounded border border-[#334155] bg-[#0f172a] p-1.5 text-[11px] text-[#f8fafc] placeholder-[#475569] focus:border-[#38bdf8] focus:outline-none"
          />
        </div>
      </div>
    </section>
  );
}
