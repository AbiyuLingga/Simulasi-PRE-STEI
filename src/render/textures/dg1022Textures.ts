import * as THREE from 'three';
import type { SignalGenConfig, WaveformShape } from '../../simulation/circuit/types';

export type DG1022ParamTab = 'freq' | 'ampl' | 'offset' | 'duty' | 'load';
export type DG1012MenuMode = 'MAIN' | 'UTILITY' | 'COUNTER' | 'STORE' | 'HELP' | 'VIEW';

export interface DG1022UIState {
  activeChannel: 1 | 2;
  activeTab: DG1022ParamTab;
  menuMode: DG1012MenuMode;
  showPeriod: boolean;
  showHiLo: boolean;
  keypadBuf: string;
  stepMult: number;
  statusBanner: string;
  counterFreqHz: number;
}

const texCache = new Map<string, THREE.CanvasTexture>();

function makeTex(
  key: string,
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
): THREE.CanvasTexture {
  const cached = texCache.get(key);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  texCache.set(key, t);
  return t;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/**
 * 1:1 High-res Front Panel silkscreen texture matching Rigol DG1012 (15MHz 100MSa/s 2-Channel Function/Arbitrary Waveform Generator).
 */
export function getDG1022FrontPanelTexture(): THREE.CanvasTexture {
  return makeTex('dg1012_front_v1', 2048, 944, (ctx, W, H) => {
    // Pale cool-gray polycarbonate fascia on right
    ctx.fillStyle = '#e7edf4';
    ctx.fillRect(0, 0, W, H);

    // Molded warm off-white left bezel frame
    ctx.fillStyle = '#ecebe6';
    ctx.fillRect(0, 0, W * 0.592, H);

    // Subtle contoured molding lip around upper-left LCD/softkey sub-panel (matches DG1022 photo)
    roundRect(ctx, W * 0.014, H * 0.022, W * 0.568, H * 0.702, 26);
    ctx.fillStyle = '#f2f1ec';
    ctx.fill();
    ctx.strokeStyle = '#c5c7cc';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Vertical seam between left molded body and right cool blue-gray inset fascia
    ctx.strokeStyle = '#b4bbc4';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(W * 0.592, 0);
    ctx.lineTo(W * 0.592, H);
    ctx.stroke();

    // Right cool blue-gray inset fascia frame
    roundRect(ctx, W * 0.598, H * 0.036, W * 0.386, H * 0.928, 18);
    ctx.fillStyle = '#e4ebf3';
    ctx.fill();
    ctx.strokeStyle = '#b9c4d1';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Recessed LCD bezel shading border
    roundRect(ctx, W * 0.118, H * 0.184, W * 0.456, H * 0.344, 14);
    ctx.strokeStyle = '#babcc2';
    ctx.lineWidth = 5;
    ctx.stroke();

    // RIGOL Yellow-Gold Brand Badge (exact DG1022 top-left proportions)
    roundRect(ctx, W * 0.104, H * 0.068, W * 0.132, H * 0.088, 6);
    ctx.fillStyle = '#d7a82e';
    ctx.fill();
    ctx.fillStyle = '#0e1116';
    ctx.font = '900 62px "IBM Plex Sans", "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('RIGOL', W * 0.170, H * 0.116);

    // Model & Spec silkscreen header (exact Rigol DG1012 15MHz 100MSa/s 2-Channel specs!)
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#181c24';
    ctx.font = '800 42px "IBM Plex Sans", sans-serif';
    ctx.fillText('DG1012', W * 0.244, H * 0.106);

    ctx.fillStyle = '#252a34';
    ctx.font = '700 24px "IBM Plex Sans", sans-serif';
    ctx.fillText('Function/Arbitrary Waveform Generator', W * 0.244, H * 0.146);

    ctx.font = '700 24px "IBM Plex Sans", sans-serif';
    ctx.fillText('2 Channel', W * 0.402, H * 0.106);

    ctx.font = '700 23px "IBM Plex Sans", sans-serif';
    ctx.fillText('15MHz', W * 0.494, H * 0.106);
    ctx.fillText('100MSa/s', W * 0.494, H * 0.142);

    // USB trident icon next to left vertical USB slot
    const ux = W * 0.086;
    const uy = H * 0.365;
    ctx.strokeStyle = '#9aa1ab';
    ctx.fillStyle = '#9aa1ab';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ux, uy + 30);
    ctx.lineTo(ux, uy - 24);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ux, uy - 34);
    ctx.lineTo(ux - 7, uy - 20);
    ctx.lineTo(ux + 7, uy - 20);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ux, uy + 32, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(ux, uy + 14);
    ctx.lineTo(ux - 11, uy + 2);
    ctx.lineTo(ux - 11, uy - 10);
    ctx.moveTo(ux, uy + 4);
    ctx.lineTo(ux + 11, uy - 8);
    ctx.lineTo(ux + 11, uy - 16);
    ctx.stroke();

    // "Local" label above View key
    ctx.fillStyle = '#7e8692';
    ctx.font = '600 26px "IBM Plex Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Local', W * 0.064, H * 0.545);

    // Right fascia blue outline boxes matching DG1022 photo!
    ctx.strokeStyle = '#5d7ba3';
    ctx.lineWidth = 4;
    // Upper 2x3 Utility/Modulation box
    roundRect(ctx, W * 0.608, H * 0.072, W * 0.132, H * 0.378, 14);
    ctx.stroke();
    // Lower 3x4 Numeric Keypad box
    roundRect(ctx, W * 0.608, H * 0.500, W * 0.172, H * 0.436, 14);
    ctx.stroke();

    // Subtle circular recess around rotary encoder knob
    ctx.beginPath();
    ctx.arc(W * 0.858, H * 0.228, W * 0.068, 0, Math.PI * 2);
    ctx.fillStyle = '#d8e0ea';
    ctx.fill();
    ctx.strokeStyle = '#b4bfd0';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Curved black arrow wing pods below rotary encoder (< and >)
    ctx.fillStyle = '#252c36';
    roundRect(ctx, W * 0.752, H * 0.312, W * 0.060, H * 0.125, 16);
    ctx.fill();
    roundRect(ctx, W * 0.900, H * 0.312, W * 0.060, H * 0.125, 16);
    ctx.fill();
    ctx.fillStyle = '#e8eef5';
    ctx.font = '900 42px "IBM Plex Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('◀', W * 0.782, H * 0.376);
    ctx.fillText('▶', W * 0.930, H * 0.376);

    // BNC Port Labels ("CH2/Counter" & "CH1") + Ground arrow line matching photo
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#1e293b';
    ctx.font = '700 25px "IBM Plex Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CH2/Counter', W * 0.900, H * 0.480);
    ctx.fillText('CH1', W * 0.900, H * 0.708);

    // Iconic thin vertical down-arrow line to the right of CH1 & CH2 BNC ports (exact DG1022 photo!)
    ctx.strokeStyle = '#475569';
    ctx.fillStyle = '#475569';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(W * 0.962, H * 0.562);
    ctx.lineTo(W * 0.962, H * 0.655);
    ctx.moveTo(W * 0.962, H * 0.780);
    ctx.lineTo(W * 0.962, H * 0.892);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(W * 0.962, H * 0.905);
    ctx.lineTo(W * 0.955, H * 0.884);
    ctx.lineTo(W * 0.969, H * 0.884);
    ctx.closePath();
    ctx.fill();
  });
}

/**
 * Crisp cached texture for the 2x3 Utility & 3x4 Numeric Keypad cluster (drawn onto a single merged 3D keycap mesh!).
 */
export function getDG1022KeypadOverlayTexture(): THREE.CanvasTexture {
  return makeTex('dg1022_keypad_overlay_v1', 512, 512, (ctx, W, H) => {
    ctx.clearRect(0, 0, W, H);
    const drawCap = (x: number, y: number, w: number, h: number, label: string, sub?: string) => {
      roundRect(ctx, x, y, w, h, 8);
      ctx.fillStyle = '#f8fafc';
      ctx.fill();
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#1e293b';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (sub) {
        ctx.font = '700 18px "IBM Plex Sans", sans-serif';
        ctx.fillText(label, x + w / 2, y + h * 0.36);
        ctx.fillText(sub, x + w / 2, y + h * 0.68);
      } else {
        ctx.font = label.length <= 3 ? '800 28px "IBM Plex Sans", sans-serif' : '700 20px "IBM Plex Sans", sans-serif';
        ctx.fillText(label, x + w / 2, y + h * 0.52);
      }
    };

    // Upper half (y = 0..220): 2x3 Utility keys
    const utilLabels: ReadonlyArray<[string, string?]> = [
      ['Mod'], ['Store/', 'Recall'],
      ['Sweep'], ['Utility'],
      ['Burst'], ['Help'],
    ];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 2; c++) {
        const [l, s] = utilLabels[r * 2 + c];
        drawCap(16 + c * 180, 12 + r * 68, 152, 54, l, s);
      }
    }

    // Lower half (y = 240..500): 3x4 Numeric keypad
    const numKeys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '.', '+/-'];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 3; c++) {
        drawCap(16 + c * 162, 248 + r * 64, 144, 52, numKeys[r * 3 + c]);
      }
    }
  });
}

export function getDG1022WaveKeyTexture(
  label: string,
  glyph: 'sine' | 'square' | 'ramp' | 'pulse' | 'noise' | 'arb' | 'ch' | 'view' | 'output' | 'power',
  bg: string,
  fg = '#181e28'
): THREE.CanvasTexture {
  return makeTex(`dg_key_${label}_${glyph}_${bg}_${fg}`, 192, 144, (ctx, W, H) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(15, 23, 42, 0.22)';
    ctx.lineWidth = 4;
    ctx.strokeRect(3, 3, W - 6, H - 6);

    if (glyph === 'power') {
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(W / 2, H / 2 + 4, 34, -Math.PI * 0.25, Math.PI * 1.25);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(W / 2, H / 2 - 38);
      ctx.lineTo(W / 2, H / 2 - 4);
      ctx.stroke();
      return;
    }

    if (glyph === 'output') {
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = fg;
      ctx.font = '800 34px "IBM Plex Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Output', 0, 0);
      ctx.restore();
      return;
    }

    if (glyph === 'ch') {
      ctx.fillStyle = fg;
      ctx.font = '800 34px "IBM Plex Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('CH1', W / 2, H * 0.34);
      ctx.strokeStyle = fg;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(W * 0.22, H * 0.52);
      ctx.lineTo(W * 0.78, H * 0.52);
      ctx.stroke();
      ctx.fillText('CH2', W / 2, H * 0.72);
      return;
    }

    if (glyph === 'view') {
      ctx.fillStyle = fg;
      ctx.font = '700 38px "IBM Plex Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('View', W / 2, H * 0.52);
      return;
    }

    // Top waveform text label
    ctx.fillStyle = fg;
    ctx.font = '700 31px "IBM Plex Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, W / 2, H * 0.28);

    // Bottom crisp waveform glyph
    ctx.strokeStyle = fg;
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    const x0 = 36;
    const x1 = W - 36;
    const yMid = H * 0.68;
    const amp = 22;
    if (glyph === 'sine') {
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        const x = x0 + t * (x1 - x0);
        const y = yMid - Math.sin(t * Math.PI * 2) * amp;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    } else if (glyph === 'square') {
      ctx.moveTo(x0, yMid);
      ctx.lineTo(x0, yMid - amp);
      ctx.lineTo(W / 2, yMid - amp);
      ctx.lineTo(W / 2, yMid + amp);
      ctx.lineTo(x1, yMid + amp);
      ctx.lineTo(x1, yMid);
    } else if (glyph === 'ramp') {
      ctx.moveTo(x0, yMid + amp);
      ctx.lineTo(W / 2, yMid - amp);
      ctx.lineTo(x1, yMid + amp);
    } else if (glyph === 'pulse') {
      ctx.moveTo(x0, yMid + amp);
      ctx.lineTo(x0 + 26, yMid + amp);
      ctx.lineTo(x0 + 26, yMid - amp);
      ctx.lineTo(x0 + 62, yMid - amp);
      ctx.lineTo(x0 + 62, yMid + amp);
      ctx.lineTo(x1, yMid + amp);
    } else if (glyph === 'noise') {
      const pts = [0, -0.8, 0.7, -0.9, 0.4, -0.5, 0.95, -0.6, 0.2, -0.85, 0.65, 0];
      pts.forEach((p, idx) => {
        const x = x0 + (idx / (pts.length - 1)) * (x1 - x0);
        const y = yMid + p * amp;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
    } else {
      ctx.moveTo(x0, yMid + 12);
      ctx.lineTo(x0 + 22, yMid - 20);
      ctx.lineTo(x0 + 48, yMid + 4);
      ctx.lineTo(x0 + 78, yMid - 14);
      ctx.lineTo(x0 + 96, yMid + 18);
      ctx.lineTo(x1, yMid - 6);
    }
    ctx.stroke();
  });
}

function formatRigolFreq(hz: number): string {
  if (hz >= 1e6) {
    const mhz = hz / 1e6;
    return `${mhz.toFixed(4)}MHz`;
  }
  if (hz >= 1000) {
    const khz = hz / 1000;
    const whole = Math.floor(khz);
    const frac = Math.round((khz - whole) * 100000)
      .toString()
      .padStart(5, '0');
    return `${whole}.${frac.slice(0, 3)},${frac.slice(3)}kHz`;
  }
  const whole = Math.floor(hz);
  const frac = Math.round((hz - whole) * 100)
    .toString()
    .padStart(2, '0');
  return `${whole}.${frac}Hz`;
}

function formatRigolPeriod(hz: number): string {
  const sec = 1 / Math.max(1e-6, hz);
  if (sec >= 1) return `${sec.toFixed(4)} s`;
  if (sec >= 1e-3) return `${(sec * 1e3).toFixed(3)} ms`;
  if (sec >= 1e-6) return `${(sec * 1e6).toFixed(2)} us`;
  return `${(sec * 1e9).toFixed(1)} ns`;
}

function waveShortName(w: WaveformShape, dutyPct: number): string {
  if (w === 'sine') return 'Sine';
  if (w === 'square') return dutyPct !== 50 ? 'Pulse' : 'Square';
  if (w === 'triangle') return 'Ramp';
  if (w === 'noise') return 'Noise';
  return 'Arb';
}

export function getDG1012SoftkeyLabels(gen: SignalGenConfig, ui: DG1022UIState): readonly string[] {
  if (ui.keypadBuf.length > 0) {
    if (ui.activeTab === 'freq') {
      return ui.showPeriod ? ['s', 'ms', 'us', 'ns', 'Esc'] : ['MHz', 'kHz', 'Hz', 'mHz', 'Esc'];
    }
    if (ui.activeTab === 'ampl') return ['Vpp', 'mVpp', 'Vrms', 'mVrms', 'Esc'];
    if (ui.activeTab === 'offset') return ['V', 'mV', '0V', 'Inv', 'Esc'];
    return ['Apply', '50%', '0deg', '90deg', 'Esc'];
  }
  if (ui.menuMode === 'UTILITY') {
    const load = (ui.activeChannel === 1 ? gen.loadMode : gen.ch2LoadMode) ?? 'HighZ';
    const inv = (ui.activeChannel === 1 ? gen.inverted : gen.ch2Inverted) ?? false;
    return [load === '50ohm' ? '50Ω' : 'HighZ', inv ? 'Inv' : 'Norm', 'CH1→2', 'Countr', 'Done'];
  }
  if (ui.menuMode === 'STORE') {
    return ['Save1', 'Load1', 'Save2', 'Load2', 'Done'];
  }
  if (ui.menuMode === 'COUNTER') {
    return ['Gate', 'DC/AC', 'HFRej', 'Reset', 'Done'];
  }
  if (ui.menuMode === 'HELP') {
    return ['Wave', 'Load', 'Dual', 'Mod', 'Done'];
  }
  const activeWave = ui.activeChannel === 1 ? gen.waveform : (gen.ch2Waveform ?? 'triangle');
  const activeDuty = ui.activeChannel === 1 ? gen.dutyPct : (gen.ch2DutyPct ?? 50);
  const fourth =
    activeWave === 'square'
      ? activeDuty !== 50
        ? 'Duty'
        : 'Duty'
      : activeWave === 'triangle'
        ? 'Symm'
        : 'Phase';
  return [
    ui.showPeriod ? 'Period' : 'Freq',
    ui.showHiLo ? 'HiLvl' : 'Ampl',
    ui.showHiLo ? 'LoLvl' : 'Offset',
    fourth,
    'AligPha',
  ];
}

/**
 * Authentic 512x128 (2x of 256x64) Rigol DG1012 cool-blue dot-matrix LCD renderer matching manual & photo 1:1!
 */
export function renderDG1022LCD(
  ctx: CanvasRenderingContext2D,
  gen: SignalGenConfig,
  ui: DG1022UIState
): void {
  const W = 512;
  const H = 128;

  if (!gen.power) {
    ctx.fillStyle = '#0e171f';
    ctx.fillRect(0, 0, W, H);
    return;
  }

  const INK = '#0a1929';
  const BG = '#d7eef9';
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  const ch1Wave = waveShortName(gen.waveform, gen.dutyPct);
  const ch2WaveRaw: WaveformShape = gen.ch2Waveform ?? 'triangle';
  const ch2Duty = gen.ch2DutyPct ?? 50;
  const ch2Wave = waveShortName(ch2WaveRaw, ch2Duty);
  const activeWaveTitle = ui.activeChannel === 1 ? ch1Wave : ch2Wave;
  const activeLoad = (ui.activeChannel === 1 ? gen.loadMode : gen.ch2LoadMode) ?? 'HighZ';
  const activeInv = (ui.activeChannel === 1 ? gen.inverted : gen.ch2Inverted) ?? false;
  const modTag = gen.modMode && gen.modMode !== 'OFF' ? gen.modMode : '';

  // Top status bar divider
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 25);
  ctx.lineTo(W, 25);
  ctx.stroke();

  // Top-left active waveform / mode title
  ctx.fillStyle = INK;
  ctx.font = '800 18px "IBM Plex Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const headerLeft =
    ui.menuMode === 'UTILITY'
      ? 'Utility · OutputSet'
      : ui.menuMode === 'COUNTER'
        ? 'Counter (200MHz)'
        : ui.menuMode === 'STORE'
          ? 'Store / Recall'
          : ui.menuMode === 'HELP'
            ? 'DG1012 Help'
            : ui.statusBanner || activeWaveTitle;
  ctx.fillText(headerLeft, 10, 13);

  // Mod / Invert badges & Load impedance badge (exact DG1012 top bar!)
  const flags: string[] = [];
  if (modTag) flags.push(modTag);
  if (activeInv) flags.push('INV');
  if (gen.attenuator20dB) flags.push('-20dB');
  flags.push(activeLoad === '50ohm' ? '50Ω' : 'High Z');
  ctx.font = '700 15px "IBM Plex Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText(flags.join(' '), 418, 13);

  // CH1 / CH2 indicator pills
  ctx.fillStyle = ui.activeChannel === 1 ? INK : '#8db4c9';
  ctx.fillRect(424, 2, 41, 20);
  ctx.fillStyle = ui.activeChannel === 1 ? BG : INK;
  ctx.font = '800 14px "IBM Plex Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('CH1', 444, 13);

  ctx.fillStyle = ui.activeChannel === 2 ? INK : '#8db4c9';
  ctx.fillRect(468, 2, 41, 20);
  ctx.fillStyle = ui.activeChannel === 2 ? BG : INK;
  ctx.fillText('CH2', 488, 13);

  // Middle body area (y = 26..97)
  if (ui.menuMode === 'HELP') {
    ctx.fillStyle = INK;
    ctx.textAlign = 'left';
    ctx.font = '700 14px "IBM Plex Mono", monospace';
    ctx.fillText('DG1012 15MHz 100MSa/s Dual-Ch DDS', 12, 42);
    ctx.font = '600 13px "IBM Plex Sans", sans-serif';
    ctx.fillText('• Ketik keypad -> pilih satuan (kHz/Hz/Vpp) di tombol biru', 12, 62);
    ctx.fillText('• Utility: ubah HighZ/50Ω, Polaritas, Copy CH1→2, Counter', 12, 80);
  } else if (ui.menuMode === 'COUNTER') {
    ctx.fillStyle = INK;
    ctx.fillRect(8, 29, 496, 66);
    ctx.fillStyle = BG;
    ctx.textAlign = 'left';
    ctx.font = '700 15px "IBM Plex Mono", monospace';
    ctx.fillText('CH2/COUNTER INPUT   GATE: 1.0s', 18, 44);
    ctx.font = '800 30px "IBM Plex Mono", monospace';
    ctx.textAlign = 'right';
    const cStr = ui.counterFreqHz > 0.1 ? formatRigolFreq(ui.counterFreqHz) : '---.-- Hz';
    ctx.fillText(cStr, 492, 76);
  } else if (ui.menuMode === 'VIEW') {
    const is1 = ui.activeChannel === 1;
    const f = is1 ? gen.freqHz : (gen.ch2FreqHz ?? 1500);
    const v = is1 ? gen.vpp : (gen.ch2Vpp ?? 4.0);
    const off = is1 ? gen.dcOffset : (gen.ch2DcOffset ?? 0);
    const ph = is1 ? (gen.phaseDeg ?? 0) : (gen.ch2PhaseDeg ?? 0);
    const dty = is1 ? gen.dutyPct : ch2Duty;
    ctx.fillStyle = INK;
    ctx.textAlign = 'left';
    ctx.font = '700 15px "IBM Plex Mono", monospace';
    ctx.fillText(`CH${ui.activeChannel} ${activeWaveTitle.toUpperCase()}  ${(is1 ? gen.outputEnabled : gen.ch2OutputEnabled) ? 'OUT:ON' : 'OUT:OFF'}`, 14, 42);
    ctx.fillText(`Freq: ${formatRigolFreq(f)}   Per: ${formatRigolPeriod(f)}`, 14, 62);
    ctx.fillText(`Ampl: ${v.toFixed(3)}Vpp  Offs: ${off >= 0 ? '+' : ''}${off.toFixed(2)}V  Phs:${ph.toFixed(0)}° Dty:${dty.toFixed(0)}%`, 14, 82);
  } else {
    // Authentic Dual-Channel DG1012 Main Layout (Waveform icon left | CH1 center | CH2 right)
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(86, 25);
    ctx.lineTo(86, 98);
    ctx.stroke();

    const drawWave = ui.activeChannel === 1 ? gen.waveform : ch2WaveRaw;
    const drawDuty = ui.activeChannel === 1 ? gen.dutyPct : ch2Duty;
    ctx.beginPath();
    if (drawWave === 'sine') {
      for (let i = 0; i <= 32; i++) {
        const t = i / 32;
        const x = 10 + t * 68;
        const y = 58 - Math.sin(t * Math.PI * 2) * 22;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    } else if (drawWave === 'square') {
      const hiW = Math.max(10, Math.min(58, (drawDuty / 100) * 68));
      ctx.moveTo(10, 78);
      ctx.lineTo(10, 36);
      ctx.lineTo(10 + hiW, 36);
      ctx.lineTo(10 + hiW, 78);
      ctx.lineTo(78, 78);
    } else if (drawWave === 'triangle') {
      const peakX = 10 + Math.max(8, Math.min(60, (drawDuty / 100) * 68));
      ctx.moveTo(10, 78);
      ctx.lineTo(peakX, 36);
      ctx.lineTo(78, 78);
    } else if (drawWave === 'noise') {
      const pts = [0, -0.9, 0.7, -0.5, 0.9, -0.8, 0.4, -0.6, 0.85, -0.4, 0.2];
      pts.forEach((p, idx) => {
        const x = 10 + (idx / (pts.length - 1)) * 68;
        const y = 58 + p * 21;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
    } else {
      for (let i = 0; i <= 32; i++) {
        const t = i / 32;
        const xx = (t - 0.5) * 6 * Math.PI;
        const val = Math.abs(xx) < 1e-3 ? 1 : Math.sin(xx) / xx;
        const x = 10 + t * 68;
        const y = 66 - val * 28;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    ctx.fillStyle = INK;
    ctx.font = '700 12px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(ui.showPeriod ? '◄ T ►' : '◄1/f►', 44, 88);

    const formatChannelReadout = (ch: 1 | 2): string => {
      const isActive = ui.activeChannel === ch;
      if (isActive && ui.keypadBuf.length > 0) return `${ui.keypadBuf}_`;
      const f = ch === 1 ? gen.freqHz : (gen.ch2FreqHz ?? 1500);
      const rawVpp = ch === 1 ? gen.vpp : (gen.ch2Vpp ?? 4.0);
      const vpp = ch === 1 && gen.attenuator20dB ? rawVpp * 0.1 : rawVpp;
      const off = ch === 1 ? gen.dcOffset : (gen.ch2DcOffset ?? 0);
      const dty = ch === 1 ? gen.dutyPct : ch2Duty;
      const phs = ch === 1 ? (gen.phaseDeg ?? 0) : (gen.ch2PhaseDeg ?? 0);
      const wv = ch === 1 ? gen.waveform : ch2WaveRaw;
      if (!isActive || ui.activeTab === 'freq') {
        return ui.showPeriod && isActive ? formatRigolPeriod(f) : formatRigolFreq(f);
      }
      if (ui.activeTab === 'ampl') {
        if (ui.showHiLo) return `Hi ${(off + vpp / 2).toFixed(2)}V`;
        return `${vpp.toFixed(3)} Vpp`;
      }
      if (ui.activeTab === 'offset') {
        if (ui.showHiLo) return `Lo ${(off - vpp / 2).toFixed(2)}V`;
        return `${off >= 0 ? '+' : ''}${off.toFixed(3)} Vdc`;
      }
      if (ui.activeTab === 'duty') {
        if (wv === 'square' || wv === 'triangle') return `${dty.toFixed(1)} %`;
        return `${phs.toFixed(1)} deg`;
      }
      return `${phs.toFixed(1)} deg`;
    };

    // CH1 Column (x = 88..302)
    const ch1Sel = ui.activeChannel === 1;
    ctx.fillStyle = ch1Sel ? INK : BG;
    ctx.fillRect(88, 27, 214, 70);
    ctx.fillStyle = ch1Sel ? BG : INK;
    ctx.font = '700 15px "IBM Plex Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`CH1 ${ch1Wave.toUpperCase()}`, 94, 38);
    ctx.textAlign = 'right';
    ctx.fillText(gen.outputEnabled ? 'ON' : 'OFF', 296, 38);
    ctx.font = '800 27px "IBM Plex Mono", monospace';
    ctx.fillText(formatChannelReadout(1), 297, 74);

    // CH2 Column (x = 304..510)
    const ch2Sel = ui.activeChannel === 2;
    ctx.fillStyle = ch2Sel ? INK : BG;
    ctx.fillRect(304, 27, 206, 70);
    ctx.fillStyle = ch2Sel ? BG : INK;
    ctx.font = '700 15px "IBM Plex Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`CH2 ${ch2Wave.toUpperCase()}`, 310, 38);
    ctx.textAlign = 'right';
    ctx.fillText(gen.ch2OutputEnabled ? 'ON' : 'OFF', 504, 38);
    ctx.font = '800 25px "IBM Plex Mono", monospace';
    ctx.fillText(formatChannelReadout(2), 505, 74);
  }

  // Bottom 5 Softkey Menu Tabs
  const tabLabels = getDG1012SoftkeyLabels(gen, ui);
  const tabOrder: DG1022ParamTab[] = ['freq', 'ampl', 'offset', 'duty', 'load'];

  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 98);
  ctx.lineTo(W, 98);
  ctx.stroke();

  const tabW = 98;
  tabLabels.forEach((label, idx) => {
    const tx = 8 + idx * (tabW + 2);
    const active = ui.menuMode === 'MAIN' && ui.keypadBuf.length === 0 && ui.activeTab === tabOrder[idx];
    roundRect(ctx, tx, 100, tabW, 26, 6);
    if (active) {
      ctx.fillStyle = INK;
      ctx.fill();
    } else {
      ctx.fillStyle = BG;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    ctx.fillStyle = active ? BG : INK;
    ctx.font = '800 16px "IBM Plex Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, tx + tabW / 2, 114);
  });
}
