import {
  DM3058_RANGES,
  extractRawValue,
  formatDM3058Reading,
  getDM3058Softkeys,
  resolveAutoRangeIndex,
} from './state';
import type { DM3058HelpTopic, DM3058MeasurementPacket, DM3058State } from './types';

export const DM3058_LCD_W = 512;
export const DM3058_LCD_H = 128;

const HELP_COPY: Record<DM3058HelpTopic, [string, string]> = {
  Keys: ['2ND + Key: 4WR / PER / Dual', 'Up/Down: Range  |  Auto: AutoRange'],
  Jacks: ['Input HI+LO: V, R, C, F, Diode', 'Input I+LO: Current up to 10A RMS'],
  Math: ['REL: Δ ref  |  STAT: Min/Max/Avg', 'dBm (50/75/600Ω)  |  P/F Limit'],
  '4WR': ['4-Wire Kelvin eliminates lead Ω:', 'Wire HI/LO Force + Sense HI/LO'],
  Dual: ['Simultaneous primary+vice readout', 'Preset: V+I or AC+Hz, 2ND+Key'],
};

const SHORT_FUNC_NAME: Record<DM3058State['func'], string> = {
  DCV: 'DCV',
  ACV: 'ACV',
  DCI: 'DCI',
  ACI: 'ACI',
  '2WR': '2WR',
  '4WR': '4WR',
  CAP: 'CAP',
  FREQ: 'FREQ',
  PER: 'PER',
  CONT: 'CONT',
  DIODE: 'DIODE',
  SENSOR: 'SENS',
};

function drawDottedV(ctx: CanvasRenderingContext2D, x: number, y0: number, y1: number): void {
  for (let y = y0; y <= y1; y += 4) {
    ctx.fillRect(x, y, 2, 2);
  }
}

function drawDottedH(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number): void {
  for (let x = x0; x <= x1; x += 4) {
    ctx.fillRect(x, y, 2, 2);
  }
}

function drawActivitySpinner(ctx: CanvasRenderingContext2D, cx: number, cy: number, seq: number, paused: boolean): void {
  const activeStep = seq % 8;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(a) * 6.5;
    const py = cy + Math.sin(a) * 6.5;
    if (!paused && i === activeStep) {
      ctx.fillRect(px - 2, py - 2, 4, 4);
    } else if (!paused && (i === (activeStep + 7) % 8 || i === (activeStep + 6) % 8)) {
      ctx.fillRect(px - 1, py - 1, 2.5, 2.5);
    } else {
      ctx.fillRect(px - 0.8, py - 0.8, 1.6, 1.6);
    }
  }
}

export class DM3058LCDRenderer {
  public readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(canvas?: HTMLCanvasElement) {
    this.canvas = canvas ?? document.createElement('canvas');
    this.canvas.width = DM3058_LCD_W;
    this.canvas.height = DM3058_LCD_H;
    const c = this.canvas.getContext('2d');
    if (!c) throw new Error('2D context unavailable for DM3058 LCD');
    this.ctx = c;
  }

  render(
    state: DM3058State,
    meas: DM3058MeasurementPacket,
    history: readonly number[],
    stats: { min: number | null; max: number | null; sum: number; count: number }
  ): void {
    const ctx = this.ctx;
    const W = DM3058_LCD_W;
    const H = DM3058_LCD_H;

    if (!state.power) {
      const offGrad = ctx.createLinearGradient(0, 0, 0, H);
      offGrad.addColorStop(0, '#36444e');
      offGrad.addColorStop(1, '#2d3942');
      ctx.fillStyle = offGrad;
      ctx.fillRect(0, 0, W, H);
      return;
    }

    // Backlight gradient matching real Rigol DM3058 pale cyan-white LCD
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    const tint = Math.max(0.88, Math.min(1, 1.04 - state.contrast * 0.015));
    const r0 = Math.round(233 * tint);
    const g0 = Math.round(245 * tint);
    const b0 = Math.round(252 * tint);
    bg.addColorStop(0, `rgb(${r0},${g0},${b0})`);
    bg.addColorStop(1, `rgb(${r0 - 12},${g0 - 8},${b0 - 4})`);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const ink = '#09111d';
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;

    const rawPrimary =
      state.runState === 'HOLD' && state.heldPrimary !== null
        ? state.heldPrimary
        : extractRawValue(state.func, meas);
    const effectiveRaw = state.mathMode === 'REL' ? rawPrimary - state.relRef : rawPrimary;
    const rangeIdx = state.autoRange
      ? resolveAutoRangeIndex(state.func, Math.abs(effectiveRaw))
      : Math.min(state.rangeIndex, DM3058_RANGES[state.func].length - 1);
    const rangeSpec = DM3058_RANGES[state.func][rangeIdx];
    const fmt = formatDM3058Reading(
      state.func,
      effectiveRaw,
      rangeIdx,
      state.autoRange,
      state.speed,
      state.dualEnabled
    );

    // 1. Top Status Bar (y = 0..26)
    ctx.font = 'bold 17px "IBM Plex Mono", monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText(SHORT_FUNC_NAME[state.func], 10, 14);

    drawDottedV(ctx, 88, 2, 24);
    ctx.textAlign = 'center';
    ctx.fillText(state.autoRange ? 'Auto' : `M ${rangeSpec.label}`, 144, 14);

    drawDottedV(ctx, 200, 2, 24);
    const digitsLabel = state.speed === 'S' ? '5½' : state.speed === 'M' ? '4½M' : '4½F';
    ctx.fillText(digitsLabel, 244, 14);
    drawDottedV(ctx, 286, 2, 24);

    // Badges
    ctx.font = 'bold 13px "IBM Plex Mono", monospace';
    const badges: string[] = [];
    if (state.secondShift) badges.push('2ND');
    if (state.runState === 'HOLD') badges.push(state.trigSource === 'SINGLE' ? 'SNGL' : 'HOLD');
    if (state.mathMode !== 'OFF') badges.push(state.mathMode);
    if (state.inputZ === '>10G' && (state.func === 'DCV' || state.func === 'ACV')) badges.push('HiZ');
    ctx.textAlign = 'left';
    if (badges.length > 0) {
      ctx.fillText(badges.join(' '), 294, 14);
    }

    ctx.textAlign = 'right';
    ctx.font = 'bold 16px "IBM Plex Mono", monospace';
    ctx.fillText(state.dualEnabled ? 'Lcl' : 'Local', W - 8, 14);
    ctx.textAlign = 'left';

    drawDottedH(ctx, 0, W, 26);

    // 2. Activity Ring Indicator
    drawActivitySpinner(ctx, 18, 42, meas.sampleSeq, state.runState === 'HOLD');

    const bodyBottom = state.menuHidden ? H - 6 : 99;

    // 3. Main Content / Popup / Dual / Single Display
    if (state.popupText) {
      ctx.fillStyle = ink;
      ctx.font = 'bold 18px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(state.popupText, W / 2, (28 + bodyBottom) / 2);
      ctx.textAlign = 'left';
    } else if (state.menu === 'HELP') {
      const [line1, line2] = HELP_COPY[state.helpTopic];
      ctx.font = 'bold 14px "IBM Plex Mono", monospace';
      ctx.fillText(`HELP [${state.helpTopic}]`, 36, 42);
      ctx.font = '14px "IBM Plex Mono", monospace';
      ctx.fillText(line1, 36, 64);
      ctx.fillText(line2, 36, 84);
    } else if (state.dualEnabled) {
      // Exact RIGOL DM3058 Dual Display layout matching dm3058_front.png
      const rawVice =
        state.runState === 'HOLD' && state.heldSecondary !== null
          ? state.heldSecondary
          : extractRawValue(state.viceFunc, meas);
      const fmtVice = formatDM3058Reading(
        state.viceFunc,
        rawVice,
        0,
        true,
        state.speed,
        true
      );

      ctx.font = 'bold 34px "IBM Plex Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${fmt.text}${fmt.unit}`, 270, 68);

      drawDottedV(ctx, 278, 28, bodyBottom - 2);

      ctx.font = 'bold 28px "IBM Plex Mono", monospace';
      ctx.fillText(`${fmtVice.text}${fmtVice.unit}`, W - 8, 52);

      drawDottedH(ctx, 284, W - 4, 72);
      ctx.font = 'bold 16px "IBM Plex Mono", monospace';
      ctx.fillText(SHORT_FUNC_NAME[state.viceFunc], W - 10, 86);
      ctx.textAlign = 'left';
    } else if (state.menu === 'HISTORY' && history.length >= 2) {
      // Left reading + right sparkline chart
      ctx.font = 'bold 31px "IBM Plex Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${fmt.text}${fmt.unit}`, 32, 66);

      const gx = 324;
      const gy = 33;
      const gw = 178;
      const gh = 58;
      ctx.strokeRect(gx, gy, gw, gh);
      let hMin = Infinity;
      let hMax = -Infinity;
      for (const v of history) {
        if (!Number.isFinite(v)) continue;
        if (v < hMin) hMin = v;
        if (v > hMax) hMax = v;
      }
      const span = Math.max(1e-6, hMax - hMin);
      ctx.beginPath();
      history.forEach((v, idx) => {
        const px = gx + 4 + (idx / Math.max(1, history.length - 1)) * (gw - 8);
        const py = gy + gh - 6 - ((v - hMin) / span) * (gh - 12);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.lineWidth = 1;
    } else {
      // Standard Large 5½ Digit Single Display (matching dm3058_oblique.jpg)
      const hasRightMath = state.mathMode !== 'OFF' && state.mathMode !== 'REL';
      ctx.font = hasRightMath ? 'bold 35px "IBM Plex Mono", monospace' : 'bold 42px "IBM Plex Mono", monospace';
      ctx.textAlign = hasRightMath ? 'left' : 'center';
      const displayStr = `${fmt.text}${fmt.unit}`;
      ctx.fillText(displayStr, hasRightMath ? 34 : W * 0.51, 66);
      ctx.textAlign = 'left';

      if (state.mathMode === 'REL') {
        ctx.font = 'bold 12px "IBM Plex Mono", monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`REF:${state.relRef.toFixed(4)}`, W - 10, 89);
        ctx.textAlign = 'left';
      } else if (state.mathMode === 'STAT') {
        const minV = stats.min ?? rawPrimary;
        const maxV = stats.max ?? rawPrimary;
        const avgV = stats.count > 0 ? stats.sum / stats.count : rawPrimary;
        ctx.font = 'bold 12px "IBM Plex Mono", monospace';
        ctx.fillText(`MN:${minV.toFixed(3)}`, 340, 44);
        ctx.fillText(`MX:${maxV.toFixed(3)}`, 340, 62);
        ctx.fillText(`AV:${avgV.toFixed(3)} (${stats.count})`, 340, 80);
      } else if (state.mathMode === 'dBm') {
        const vAbs = Math.max(1e-6, Math.abs(rawPrimary));
        const dbm = 10 * Math.log10(((vAbs * vAbs) / state.dbmRefOhms) / 1e-3);
        ctx.font = 'bold 16px "IBM Plex Mono", monospace';
        ctx.fillText(`${dbm.toFixed(2)} dBm`, 346, 56);
        ctx.font = '12px "IBM Plex Mono", monospace';
        ctx.fillText(`Ref: ${state.dbmRefOhms}Ω`, 346, 78);
      } else if (state.mathMode === 'dB') {
        const ratio = Math.max(1e-6, Math.abs(rawPrimary) / Math.max(1e-6, state.dbRefVolts));
        const db = 20 * Math.log10(ratio);
        ctx.font = 'bold 16px "IBM Plex Mono", monospace';
        ctx.fillText(`${db.toFixed(2)} dB`, 348, 56);
        ctx.font = '12px "IBM Plex Mono", monospace';
        ctx.fillText(`Ref: ${state.dbRefVolts.toFixed(2)}V`, 348, 78);
      } else if (state.mathMode === 'PF') {
        const pass = Number.isFinite(rawPrimary) && rawPrimary >= state.pfLow && rawPrimary <= state.pfHigh;
        ctx.font = 'bold 18px "IBM Plex Mono", monospace';
        ctx.fillText(pass ? 'PASS' : rawPrimary > state.pfHigh ? 'HI FAIL' : 'LO FAIL', 352, 56);
        ctx.font = '12px "IBM Plex Mono", monospace';
        ctx.fillText(`[${state.pfLow}..${state.pfHigh}]`, 352, 78);
      }
    }

    // 4. Bottom 6 Softkey Menu Tabs (y = 100..127)
    if (!state.menuHidden) {
      const keys = getDM3058Softkeys(state);
      const tabW = W / 6;
      ctx.fillStyle = ink;
      ctx.fillRect(0, 100, W, 1.5);
      ctx.font = 'bold 14px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (let i = 0; i < 6; i++) {
        const item = keys[i];
        const x0 = i * tabW;
        if (i > 0) {
          ctx.fillStyle = ink;
          ctx.fillRect(x0, 101, 1.5, 27);
        }
        if (item.label) {
          if (item.active) {
            ctx.fillStyle = ink;
            ctx.fillRect(x0 + 2, 102, tabW - 4, 24);
            ctx.fillStyle = `rgb(${r0},${g0},${b0})`;
          } else {
            ctx.fillStyle = ink;
          }
          ctx.fillText(item.label, x0 + tabW / 2, 114, tabW - 6);
        }
      }
      ctx.textAlign = 'left';
    }
  }
}
