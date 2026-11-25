import { hotRefs } from '../../state/hotRefs';
import {
  formatFreqValue,
  formatTimeValue,
  formatVoltsDiv,
} from './state';
import { getSoftKeyMenuView, type SoftKeyItem } from './menus';
import type { CouplingMode, DS1000EState, MeasureParamKey, ScopeFrameOutput } from './types';

// Exact 2x integer scale of native Rigol DS1000E 320x234 TFT LCD
export const LCD_W = 640;
export const LCD_H = 468;

const TOP_BAR_H = 30;
const BOT_BAR_H = 34;
const SIDE_MENU_W = 122;
const PLOT_X = 24;
const PLOT_Y = TOP_BAR_H + 2;
const PLOT_W = LCD_W - PLOT_X - SIDE_MENU_W - 6; // 488 -> 12 clean divs
const PLOT_H = LCD_H - PLOT_Y - BOT_BAR_H - 4; // 402 -> 8 clean divs

const CH1_COLOR = '#f6e820';
const CH2_COLOR = '#22d6d8';
const MATH_COLOR = '#f032b8';
const REF_COLOR = '#f1f5f9';
const TRIG_ORANGE = '#f59e0b';
const RIGOL_TEAL_CHROME = '#0f564c';

function formatMetricVal(key: MeasureParamKey, val: number | null): string {
  if (val === null || !Number.isFinite(val)) return '*****';
  if (key === 'Freq') return formatFreqValue(val);
  if (
    key === 'Period' ||
    key === 'RiseTime' ||
    key === 'FallTime' ||
    key === 'PlusWidth' ||
    key === 'MinusWidth' ||
    key === 'Delay12Rise' ||
    key === 'Delay12Fall'
  ) {
    return formatTimeValue(val);
  }
  if (key === 'PlusDuty' || key === 'MinusDuty' || key === 'Overshoot' || key === 'Preshoot') {
    return `${val.toFixed(1)}%`;
  }
  if (key === 'Phase12Rise' || key === 'Phase12Fall') {
    return `${val.toFixed(1)}deg`;
  }
  if (Math.abs(val) < 1) return `${(val * 1000).toFixed(1)}mV`;
  return `${val.toFixed(2)}V`;
}

function formatTrigVolts(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs === 0) return '0.00V';
  if (abs < 1) return `${sign}${(abs * 1000).toFixed(1)}mV`;
  return `${sign}${abs.toFixed(2)}V`;
}

function formatSampleRate(hz: number): string {
  if (!Number.isFinite(hz) || hz <= 0) return '1.00GSa';
  if (hz >= 1e9) return `${(hz / 1e9).toFixed(2)}GSa`;
  if (hz >= 1e6) return `${(hz / 1e6).toFixed(hz >= 1e8 ? 0 : 1)}MSa`;
  if (hz >= 1e3) return `${(hz / 1e3).toFixed(1)}kSa`;
  return `${hz.toFixed(1)}Sa`;
}

/** Draw authentic vector coupling icon (zero missing-font glyphs). */
function drawCouplingSymbol(
  ctx: CanvasRenderingContext2D,
  mode: CouplingMode,
  x: number,
  y: number,
  color: string
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.6;
  if (mode === 'DC') {
    ctx.beginPath();
    ctx.moveTo(x, y - 3);
    ctx.lineTo(x + 11, y - 3);
    ctx.stroke();
    ctx.fillRect(x, y + 1, 2.6, 1.8);
    ctx.fillRect(x + 4.2, y + 1, 2.6, 1.8);
    ctx.fillRect(x + 8.4, y + 1, 2.6, 1.8);
  } else if (mode === 'AC') {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 3, y - 6, x + 5.5, y);
    ctx.quadraticCurveTo(x + 8, y + 6, x + 11, y);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(x + 5.5, y - 5);
    ctx.lineTo(x + 5.5, y);
    ctx.moveTo(x + 0.5, y);
    ctx.lineTo(x + 10.5, y);
    ctx.moveTo(x + 2.5, y + 3);
    ctx.lineTo(x + 8.5, y + 3);
    ctx.moveTo(x + 4.5, y + 6);
    ctx.lineTo(x + 6.5, y + 6);
    ctx.stroke();
  }
  ctx.restore();
}

function drawRotaryKnobIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(cx, cy, 5.5, -Math.PI * 0.85, Math.PI * 0.55);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + 6.5, cy - 2);
  ctx.lineTo(cx + 2.5, cy - 4.5);
  ctx.lineTo(cx + 3.5, cy + 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export interface XYViewportRect {
  x: number;
  y: number;
  w: number;
  h: number;
  div: number;
  cx: number;
  cy: number;
}

/** Exact 8x8 square X-Y graticule viewport centered inside the oscilloscope plot area. */
export function computeXYViewport(
  px: number,
  py: number,
  pw: number,
  ph: number,
  hasMeasureBar: boolean
): XYViewportRect {
  const bottomReserve = hasMeasureBar ? 24 : 0;
  const availH = Math.max(64, ph - bottomReserve - 16);
  const availW = Math.max(64, pw - 36);
  const size = Math.max(64, Math.floor(Math.min(availW, availH) / 8) * 8);
  const x = Math.round(px + (pw - size) / 2);
  const y = Math.round(py + (availH - size) / 2 + 4);
  return { x, y, w: size, h: size, div: size / 8, cx: x + size / 2, cy: y + size / 2 };
}

export class RigolLCDRenderer {
  private persistCanvas: HTMLCanvasElement | null = null;
  private lastClearNonce = -1;

  private ensurePersistCanvas(width: number, height: number): CanvasRenderingContext2D | null {
    if (typeof document === 'undefined') return null;
    if (!this.persistCanvas) {
      this.persistCanvas = document.createElement('canvas');
      this.persistCanvas.width = width;
      this.persistCanvas.height = height;
    } else if (this.persistCanvas.width !== width || this.persistCanvas.height !== height) {
      this.persistCanvas.width = width;
      this.persistCanvas.height = height;
    }
    return this.persistCanvas.getContext('2d');
  }

  render(ctx: CanvasRenderingContext2D, state: DS1000EState, frame: ScopeFrameOutput | null): void {
    if (state.power === 'OFF') {
      ctx.fillStyle = '#07090b';
      ctx.fillRect(0, 0, LCD_W, LCD_H);
      return;
    }

    if (state.power === 'BOOTING') {
      ctx.fillStyle = '#05121d';
      ctx.fillRect(0, 0, LCD_W, LCD_H);
      ctx.fillStyle = '#24dcff';
      ctx.font = 'bold 42px "IBM Plex Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('RIGOL', LCD_W / 2, LCD_H / 2 - 14);
      ctx.fillStyle = '#cbd5e1';
      ctx.font = 'bold 16px "IBM Plex Mono", monospace';
      ctx.fillText('DS1052E  50MHz  1GSa/s', LCD_W / 2, LCD_H / 2 + 24);
      ctx.textAlign = 'left';
      return;
    }

    // Authentic sea-teal inner structural chrome around plot & left margin
    ctx.fillStyle = RIGOL_TEAL_CHROME;
    ctx.fillRect(0, 0, LCD_W, LCD_H);

    // Pure black plot interior
    const activePlotW = state.menuOpen ? PLOT_W : LCD_W - PLOT_X - 8;
    const isXY = state.horizontal.timeBaseMode === 'X-Y';
    const hasMeasureBar = state.measure.activeSlots.length > 0 && frame !== null;
    const xyRect = isXY ? computeXYViewport(PLOT_X, PLOT_Y, activePlotW, PLOT_H, hasMeasureBar) : null;

    ctx.fillStyle = '#000000';
    ctx.fillRect(PLOT_X, PLOT_Y, activePlotW, PLOT_H);

    this.drawTopBar(ctx, state, frame);
    this.drawGraticule(ctx, state, PLOT_X, PLOT_Y, activePlotW, PLOT_H, xyRect);

    const pCtx = this.ensurePersistCanvas(activePlotW, PLOT_H);
    if (pCtx && (state.display.persist === 'OFF' || state.display.clearNonce !== this.lastClearNonce)) {
      pCtx.clearRect(0, 0, activePlotW, PLOT_H);
      this.lastClearNonce = state.display.clearNonce;
    }

    if (frame) {
      if (isXY && xyRect) {
        this.drawXYTrace(ctx, state, frame, xyRect, PLOT_X, PLOT_Y);
      } else {
        if (state.ref.enabled && state.ref.storedSamples) {
          this.drawYTTube(
            ctx,
            state.ref.storedSamples,
            state.ref.voltsPerDiv,
            state.ref.offsetDiv,
            REF_COLOR,
            state,
            PLOT_X,
            PLOT_Y,
            activePlotW,
            PLOT_H
          );
        }
        if (state.ch2.enabled) {
          this.drawYTTube(
            ctx,
            frame.ch2Samples,
            state.ch2.voltsPerDiv,
            state.ch2.offsetDiv,
            CH2_COLOR,
            state,
            PLOT_X,
            PLOT_Y,
            activePlotW,
            PLOT_H
          );
        }
        if (state.ch1.enabled) {
          this.drawYTTube(
            ctx,
            frame.ch1Samples,
            state.ch1.voltsPerDiv,
            state.ch1.offsetDiv,
            CH1_COLOR,
            state,
            PLOT_X,
            PLOT_Y,
            activePlotW,
            PLOT_H
          );
        }
        if (state.math.enabled && state.math.op !== 'FFT' && state.horizontal.timeBaseMode !== 'X-Y') {
          this.drawYTTube(
            ctx,
            frame.mathSamples,
            state.math.voltsPerDiv,
            state.math.offsetDiv,
            MATH_COLOR,
            state,
            PLOT_X,
            PLOT_Y,
            activePlotW,
            PLOT_H
          );
        }
        if (state.math.enabled && state.math.op === 'FFT' && frame.fftBinsDb) {
          this.drawFFT(ctx, frame.fftBinsDb, frame.fftMaxFreqHz, state, PLOT_X, PLOT_Y, activePlotW, PLOT_H);
        }
      }
    }

    this.drawMarkers(ctx, state, PLOT_X, PLOT_Y, activePlotW, PLOT_H, xyRect);

    if (state.cursor.mode !== 'OFF') {
      this.drawCursors(ctx, state, frame, PLOT_X, PLOT_Y, activePlotW, PLOT_H, xyRect);
    }

    if (state.measure.displayAll && frame) {
      this.drawDisplayAllOverlay(ctx, state, frame, PLOT_X, PLOT_Y, activePlotW);
    }

    if (state.utility.counter && frame?.measurements.counterHz) {
      const cw = 112;
      const ch = 22;
      const cx = PLOT_X + activePlotW - cw - 8;
      const cy = PLOT_Y + 6;
      ctx.fillStyle = 'rgba(0, 12, 16, 0.88)';
      ctx.fillRect(cx, cy, cw, ch);
      ctx.strokeStyle = '#1f7a85';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx + 0.5, cy + 0.5, cw - 1, ch - 1);
      ctx.fillStyle = '#38f8a4';
      ctx.font = 'bold 12px "IBM Plex Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(formatFreqValue(frame.measurements.counterHz), cx + cw - 6, cy + 15);
      ctx.textAlign = 'left';
    }

    this.drawPlotOverlays(ctx, state, frame, PLOT_X, PLOT_Y, activePlotW, PLOT_H);

    if (state.utility.passFail.enabled) {
      ctx.fillStyle = 'rgba(10, 18, 28, 0.86)';
      ctx.fillRect(PLOT_X + 8, PLOT_Y + 8, 174, 52);
      ctx.strokeStyle = '#38bdf8';
      ctx.strokeRect(PLOT_X + 8, PLOT_Y + 8, 174, 52);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '12px "IBM Plex Mono", monospace';
      ctx.fillText(`Pass: ${state.utility.passFail.passCount}`, PLOT_X + 16, PLOT_Y + 26);
      ctx.fillText(`Fail: ${state.utility.passFail.failCount}`, PLOT_X + 16, PLOT_Y + 46);
    }

    this.drawBottomBar(ctx, state);

    if (state.menuOpen) {
      this.drawSoftKeySidebar(ctx, state, frame);
    }

    if (state.utility.showSystemInfo) {
      this.drawModalBox(
        ctx,
        'System Info',
        ['Model: RIGOL DS1052E', 'BW: 50 MHz  |  2 Ch + EXT', 'Software: 00.04.02.SP1', 'Sample: 1 GSa/s Max']
      );
    } else if (state.transientPopup) {
      this.drawModalBox(ctx, state.transientPopup.title, [state.transientPopup.body]);
    }
  }

  private drawTopBar(ctx: CanvasRenderingContext2D, state: DS1000EState, frame: ScopeFrameOutput | null): void {
    const barW = state.menuOpen ? LCD_W - SIDE_MENU_W - 2 : LCD_W;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, barW, TOP_BAR_H);

    // RIGOL top-left logo in teal cyan directly on black
    ctx.fillStyle = '#20c4ba';
    ctx.font = 'bold 17px "IBM Plex Sans", sans-serif';
    ctx.fillText('RIGOL', 8, 21);

    // Running status directly on black
    const isXY = state.horizontal.timeBaseMode === 'X-Y';
    const status =
      state.runState === 'STOP' ? 'STOP' : isXY ? 'RUN' : frame?.triggerStatus ?? state.trigger.status;
    ctx.fillStyle = status === 'STOP' ? '#ef4444' : status === 'WAIT' ? '#eab308' : '#34d058';
    ctx.font = 'bold 15px "IBM Plex Mono", monospace';
    ctx.fillText(status, 80, 20);

    if (isXY) {
      ctx.fillStyle = '#0f3940';
      ctx.fillRect(148, 5, 196, 19);
      ctx.strokeStyle = '#256e75';
      ctx.lineWidth = 1;
      ctx.strokeRect(148.5, 5.5, 195, 18);
      ctx.fillStyle = CH1_COLOR;
      ctx.font = 'bold 12px "IBM Plex Mono", monospace';
      ctx.fillText('X-Y  X:CH1', 158, 19);
      ctx.fillStyle = CH2_COLOR;
      ctx.fillText('Y:CH2', 274, 19);

      ctx.fillStyle = '#cbd5e1';
      ctx.font = 'bold 12px "IBM Plex Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(state.display.type === 'Dots' ? 'DOTS' : 'VECT', barW - 10, 19);
      ctx.textAlign = 'left';
      return;
    }

    // Live Memory Window Bracket [ ~~~ ]
    const mx = 148;
    const my = 5;
    const mw = state.menuOpen ? 184 : 260;
    const mh = 19;
    const midY = my + mh / 2;

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(mx + 6, my);
    ctx.lineTo(mx, my);
    ctx.lineTo(mx, my + mh);
    ctx.lineTo(mx + 6, my + mh);
    ctx.moveTo(mx + mw - 6, my);
    ctx.lineTo(mx + mw, my);
    ctx.lineTo(mx + mw, my + mh);
    ctx.lineTo(mx + mw - 6, my + mh);
    ctx.stroke();

    const samples = state.ch1.enabled ? frame?.ch1Samples : frame?.ch2Samples;
    const activeCh = state.ch1.enabled ? state.ch1 : state.ch2;
    const winW = 48;
    const trigShiftPx = Math.max(-mw * 0.25, Math.min(mw * 0.25, (-state.horizontal.triggerOffsetSec / Math.max(1e-9, state.horizontal.timePerDiv)) * 4));
    const winX = mx + mw / 2 - winW / 2 + trigShiftPx;

    if (samples && samples.length > 4) {
      const drawMiniSpan = (x0: number, x1: number, strokeCol: string) => {
        ctx.strokeStyle = strokeCol;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        const steps = Math.max(8, Math.round(x1 - x0));
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const x = x0 + t * (x1 - x0);
          const u = ((x - mx) / mw) * (samples.length - 1);
          const v = samples[Math.min(samples.length - 1, Math.max(0, Math.round(u)))];
          const py = midY - Math.max(-7, Math.min(7, (v / Math.max(1e-4, activeCh.voltsPerDiv)) * 2.2));
          if (i === 0) ctx.moveTo(x, py);
          else ctx.lineTo(x, py);
        }
        ctx.stroke();
      };
      drawMiniSpan(mx + 3, winX, '#64748b');
      drawMiniSpan(winX, winX + winW, CH1_COLOR);
      drawMiniSpan(winX + winW, mx + mw - 3, '#64748b');
    } else {
      ctx.strokeStyle = '#64748b';
      ctx.beginPath();
      ctx.moveTo(mx + 3, midY);
      ctx.lineTo(mx + mw - 3, midY);
      ctx.stroke();
    }

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(winX) + 0.5, my + 2.5, winW, mh - 5);

    const ptrX = Math.round(mx + mw / 2 + trigShiftPx);
    ctx.fillStyle = TRIG_ORANGE;
    ctx.fillRect(ptrX - 3, 2, 6, 3);
    ctx.fillRect(ptrX - 1, 5, 2, 3);

    // Right trigger slope icon + channel digit square + live trigger voltage readout (matches uploaded photo!)
    const tx = barW - 118;
    const trigColor =
      state.trigger.source === 'CH1'
        ? CH1_COLOR
        : state.trigger.source === 'CH2'
          ? CH2_COLOR
          : '#cbd5e1';

    ctx.strokeStyle = trigColor;
    ctx.fillStyle = trigColor;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    if (state.trigger.slope === 'Falling') {
      ctx.moveTo(tx, 9);
      ctx.lineTo(tx + 7, 9);
      ctx.lineTo(tx + 12, 21);
      ctx.lineTo(tx + 18, 21);
    } else {
      ctx.moveTo(tx, 21);
      ctx.lineTo(tx + 7, 21);
      ctx.lineTo(tx + 12, 9);
      ctx.lineTo(tx + 18, 9);
    }
    ctx.stroke();

    ctx.beginPath();
    if (state.trigger.slope === 'Falling') {
      ctx.moveTo(tx + 10.5, 17);
      ctx.lineTo(tx + 7, 13);
      ctx.lineTo(tx + 13.5, 13);
    } else {
      ctx.moveTo(tx + 10.5, 12);
      ctx.lineTo(tx + 7, 17);
      ctx.lineTo(tx + 13.5, 17);
    }
    ctx.closePath();
    ctx.fill();

    const chLabel =
      state.trigger.source === 'CH1'
        ? '1'
        : state.trigger.source === 'CH2'
          ? '2'
          : state.trigger.source === 'EXT'
            ? 'E'
            : 'L';
    ctx.fillStyle = trigColor;
    ctx.fillRect(tx + 23, 6, 17, 18);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 13px "IBM Plex Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(chLabel, tx + 31.5, 19);
    ctx.textAlign = 'left';

    ctx.fillStyle = trigColor;
    ctx.font = 'bold 13px "IBM Plex Mono", monospace';
    ctx.fillText(formatTrigVolts(state.trigger.levelVolts), tx + 46, 20);
  }

  private drawGraticule(
    ctx: CanvasRenderingContext2D,
    state: DS1000EState,
    x: number,
    y: number,
    w: number,
    h: number,
    xyRect: XYViewportRect | null
  ): void {
    ctx.strokeStyle = '#606d7a';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    if (xyRect) {
      // Authentic 8x8 square X-Y Lissajous graticule centered in plot
      ctx.strokeStyle = '#475569';
      ctx.strokeRect(xyRect.x + 0.5, xyRect.y + 0.5, xyRect.w - 1, xyRect.h - 1);

      if (state.display.grid !== 'None') {
        const alpha = Math.max(0.24, state.display.gridBrightness / 100);
        ctx.fillStyle = `rgba(182, 196, 210, ${alpha.toFixed(2)})`;

        if (state.display.grid === 'Full') {
          for (let col = 1; col < 8; col++) {
            const gx = Math.round(xyRect.x + col * xyRect.div);
            for (let py = xyRect.y + 3; py < xyRect.y + xyRect.h - 2; py += 5) {
              ctx.fillRect(gx, py, 1, 1);
            }
          }
          for (let row = 1; row < 8; row++) {
            const gy = Math.round(xyRect.y + row * xyRect.div);
            for (let px = xyRect.x + 3; px < xyRect.x + xyRect.w - 2; px += 5) {
              ctx.fillRect(px, gy, 1, 1);
            }
          }
        }

        // Center X & Y axes + 5-subdivision ticks per division
        ctx.strokeStyle = `rgba(196, 210, 224, ${Math.min(1, alpha + 0.28).toFixed(2)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(xyRect.x + 1, Math.round(xyRect.cy) + 0.5);
        ctx.lineTo(xyRect.x + xyRect.w - 1, Math.round(xyRect.cy) + 0.5);
        ctx.moveTo(Math.round(xyRect.cx) + 0.5, xyRect.y + 1);
        ctx.lineTo(Math.round(xyRect.cx) + 0.5, xyRect.y + xyRect.h - 1);
        for (let i = 1; i < 40; i++) {
          const tx = Math.round(xyRect.x + (i * xyRect.w) / 40) + 0.5;
          ctx.moveTo(tx, xyRect.cy - 3);
          ctx.lineTo(tx, xyRect.cy + 3);
          const ty = Math.round(xyRect.y + (i * xyRect.h) / 40) + 0.5;
          ctx.moveTo(xyRect.cx - 3, ty);
          ctx.lineTo(xyRect.cx + 3, ty);
        }
        ctx.stroke();
      }

      // Subtle axis identifiers inside the square X-Y graticule
      ctx.font = 'bold 10px "IBM Plex Mono", monospace';
      ctx.fillStyle = CH2_COLOR;
      ctx.fillText('Y:CH2', xyRect.x + 5, xyRect.y + 12);
      ctx.fillStyle = CH1_COLOR;
      ctx.textAlign = 'right';
      ctx.fillText('X:CH1', xyRect.x + xyRect.w - 5, xyRect.y + xyRect.h - 5);
      ctx.textAlign = 'left';
      return;
    }

    if (state.display.grid === 'None') return;
    const alpha = Math.max(0.24, state.display.gridBrightness / 100);
    ctx.fillStyle = `rgba(182, 196, 210, ${alpha.toFixed(2)})`;

    const midX = x + w / 2;
    const midY = y + h / 2;

    if (state.display.grid === 'Full') {
      for (let col = 1; col < 12; col++) {
        const gx = Math.round(x + (col * w) / 12);
        for (let py = y + 4; py < y + h - 2; py += 5) {
          ctx.fillRect(gx, py, 1, 1);
        }
      }
      for (let row = 1; row < 8; row++) {
        const gy = Math.round(y + (row * h) / 8);
        for (let px = x + 4; px < x + w - 2; px += 5) {
          ctx.fillRect(px, gy, 1, 1);
        }
      }
    }

    ctx.strokeStyle = `rgba(196, 210, 224, ${Math.min(1, alpha + 0.25).toFixed(2)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 60; i++) {
      const tx = Math.round(x + (i * w) / 60) + 0.5;
      ctx.moveTo(tx, midY - 3);
      ctx.lineTo(tx, midY + 3);
    }
    for (let i = 1; i < 40; i++) {
      const ty = Math.round(y + (i * h) / 40) + 0.5;
      ctx.moveTo(midX - 3, ty);
      ctx.lineTo(midX + 3, ty);
    }
    ctx.stroke();
  }

  private drawYTTube(
    ctx: CanvasRenderingContext2D,
    samples: Float32Array,
    voltsPerDiv: number,
    offsetDiv: number,
    color: string,
    state: DS1000EState,
    px: number,
    py: number,
    pw: number,
    ph: number
  ): void {
    const n = samples.length;
    if (n < 2) return;
    const divH = ph / 8;
    // Pixel-exact match with drawPentagonFlag's rounded ground marker gy so [1>]/[2>] and 0V trace align cleanly
    const zeroY = Math.round(py + ph / 2 - offsetDiv * divH);

    const plotCurve = (targetCtx: CanvasRenderingContext2D, xOff: number, yOff: number) => {
      targetCtx.strokeStyle = color;
      targetCtx.fillStyle = color;
      targetCtx.lineWidth = 2;
      targetCtx.globalAlpha = Math.max(0.45, state.display.intensity / 100);

      if (state.display.type === 'Dots') {
        for (let i = 0; i < n; i += 2) {
          const sx = xOff + (i / (n - 1)) * pw;
          const sy = yOff + (zeroY - py) - (samples[i] / voltsPerDiv) * divH;
          if (sy >= yOff && sy <= yOff + ph) {
            targetCtx.fillRect(sx - 1, sy - 1, 2.2, 2.2);
          }
        }
      } else {
        targetCtx.beginPath();
        for (let i = 0; i < n; i++) {
          const sx = xOff + (i / (n - 1)) * pw;
          const sy = Math.max(yOff + 1, Math.min(yOff + ph - 1, yOff + (zeroY - py) - (samples[i] / voltsPerDiv) * divH));
          if (i === 0) targetCtx.moveTo(sx, sy);
          else targetCtx.lineTo(sx, sy);
        }
        targetCtx.stroke();
      }
      targetCtx.globalAlpha = 1;
    };

    if (state.display.persist === 'Infinite' && this.persistCanvas) {
      const pCtx = this.persistCanvas.getContext('2d');
      if (pCtx) {
        plotCurve(pCtx, 0, 0);
        ctx.drawImage(this.persistCanvas, px, py);
      }
    }
    plotCurve(ctx, px, py);
  }

  private drawXYTrace(
    ctx: CanvasRenderingContext2D,
    state: DS1000EState,
    frame: ScopeFrameOutput,
    xy: XYViewportRect,
    plotX: number,
    plotY: number
  ): void {
    if (!state.ch1.enabled && !state.ch2.enabled) return;
    const n = Math.min(frame.ch1Samples.length, frame.ch2Samples.length);
    if (n < 2) return;

    const vDivX = Math.max(1e-6, state.ch1.voltsPerDiv);
    const vDivY = Math.max(1e-6, state.ch2.voltsPerDiv);
    const intensity = Math.max(0.42, state.display.intensity / 100);

    const plotXYOnCtx = (targetCtx: CanvasRenderingContext2D, originX: number, originY: number) => {
      const rx = xy.x - originX;
      const ry = xy.y - originY;
      const rcx = xy.cx - originX;
      const rcy = xy.cy - originY;

      targetCtx.save();
      targetCtx.beginPath();
      targetCtx.rect(rx + 1, ry + 1, xy.w - 2, xy.h - 2);
      targetCtx.clip();

      if (state.display.type === 'Dots') {
        targetCtx.fillStyle = CH1_COLOR;
        targetCtx.globalAlpha = intensity;
        for (let i = 0; i < n; i++) {
          const xV = state.ch1.enabled ? frame.ch1Samples[i] : 0;
          const yV = state.ch2.enabled ? frame.ch2Samples[i] : 0;
          const sx = rcx + (xV / vDivX + state.ch1.offsetDiv) * xy.div;
          const sy = rcy - (yV / vDivY + state.ch2.offsetDiv) * xy.div;
          targetCtx.fillRect(sx - 1.1, sy - 1.1, 2.2, 2.2);
        }
      } else {
        targetCtx.beginPath();
        for (let i = 0; i < n; i++) {
          const xV = state.ch1.enabled ? frame.ch1Samples[i] : 0;
          const yV = state.ch2.enabled ? frame.ch2Samples[i] : 0;
          const sx = rcx + (xV / vDivX + state.ch1.offsetDiv) * xy.div;
          const sy = rcy - (yV / vDivY + state.ch2.offsetDiv) * xy.div;
          if (i === 0) targetCtx.moveTo(sx, sy);
          else targetCtx.lineTo(sx, sy);
        }
        // Subtle phosphor glow pass + crisp trace core
        targetCtx.strokeStyle = CH1_COLOR;
        targetCtx.lineJoin = 'round';
        targetCtx.lineCap = 'round';
        targetCtx.globalAlpha = intensity * 0.24;
        targetCtx.lineWidth = 4.2;
        targetCtx.stroke();

        targetCtx.globalAlpha = intensity;
        targetCtx.lineWidth = 1.9;
        targetCtx.stroke();
      }

      targetCtx.restore();
    };

    if (state.display.persist === 'Infinite' && this.persistCanvas) {
      const pCtx = this.persistCanvas.getContext('2d');
      if (pCtx) {
        plotXYOnCtx(pCtx, plotX, plotY);
        ctx.drawImage(this.persistCanvas, plotX, plotY);
      }
    }
    plotXYOnCtx(ctx, 0, 0);
  }

  private drawFFT(
    ctx: CanvasRenderingContext2D,
    binsDb: Float32Array,
    maxFreqHz: number,
    state: DS1000EState,
    px: number,
    py: number,
    pw: number,
    ph: number
  ): void {
    const topY = state.math.fftDisplay === 'Full' ? py : py + ph / 2;
    const fftH = state.math.fftDisplay === 'Full' ? ph : ph / 2;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
    ctx.fillRect(px + 1, topY, pw - 2, fftH - 1);

    ctx.strokeStyle = MATH_COLOR;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let k = 0; k < binsDb.length; k++) {
      const sx = px + (k / (binsDb.length - 1)) * pw;
      const normDb = Math.min(1, Math.max(0, (binsDb[k] + 80) / 100));
      const sy = topY + fftH - 4 - normDb * (fftH - 12);
      if (k === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();

    ctx.fillStyle = MATH_COLOR;
    ctx.font = '11px "IBM Plex Mono", monospace';
    ctx.fillText(`FFT ${state.math.fftSource} (${state.math.fftWindow}) 0..${formatFreqValue(maxFreqHz)}`, px + 8, topY + 14);
  }

  private drawMarkers(
    ctx: CanvasRenderingContext2D,
    state: DS1000EState,
    px: number,
    py: number,
    pw: number,
    ph: number,
    xyRect: XYViewportRect | null
  ): void {
    if (xyRect) {
      const originX = Math.round(
        Math.max(xyRect.x + 6, Math.min(xyRect.x + xyRect.w - 6, xyRect.cx + state.ch1.offsetDiv * xyRect.div))
      );
      const originY = Math.round(
        Math.max(xyRect.y + 6, Math.min(xyRect.y + xyRect.h - 6, xyRect.cy - state.ch2.offsetDiv * xyRect.div))
      );

      // Yellow '1' CH1(X) zero marker at bottom of X-Y square grid
      if (state.ch1.enabled) {
        const my = xyRect.y + xyRect.h;
        ctx.fillStyle = CH1_COLOR;
        ctx.beginPath();
        ctx.moveTo(originX, my - 1);
        ctx.lineTo(originX - 6, my + 7);
        ctx.lineTo(originX + 6, my + 7);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#091119';
        ctx.font = 'bold 9px "IBM Plex Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('1', originX, my + 7);
        ctx.textAlign = 'left';
      }

      // Cyan '2' CH2(Y) zero marker at left of X-Y square grid
      if (state.ch2.enabled) {
        const mx = xyRect.x;
        ctx.fillStyle = CH2_COLOR;
        ctx.beginPath();
        ctx.moveTo(mx - 1, originY);
        ctx.lineTo(mx - 8, originY - 6);
        ctx.lineTo(mx - 16, originY - 6);
        ctx.lineTo(mx - 16, originY + 6);
        ctx.lineTo(mx - 8, originY + 6);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#091119';
        ctx.font = 'bold 10px "IBM Plex Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('2', mx - 11, originY + 3.5);
        ctx.textAlign = 'left';
      }

      // Subtle dashed (0V, 0V) origin crosshair while turning position knobs
      const now = typeof performance !== 'undefined' ? performance.now() : 0;
      if (hotRefs.lastKnobReadoutKind === 'vert_pos' && now < hotRefs.lastKnobReadoutUntil) {
        ctx.save();
        ctx.strokeStyle = 'rgba(246, 232, 32, 0.45)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(originX + 0.5, xyRect.y + 2);
        ctx.lineTo(originX + 0.5, xyRect.y + xyRect.h - 2);
        ctx.moveTo(xyRect.x + 2, originY + 0.5);
        ctx.lineTo(xyRect.x + xyRect.w - 2, originY + 0.5);
        ctx.stroke();
        ctx.restore();
      }
      return;
    }

    const divH = ph / 8;

    const drawPentagonFlag = (label: string, offsetDiv: number, color: string) => {
      const gy = Math.round(Math.max(py + 9, Math.min(py + ph - 9, py + ph / 2 - offsetDiv * divH)));
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(4, gy - 7);
      ctx.lineTo(px - 8, gy - 7);
      ctx.lineTo(px - 2, gy);
      ctx.lineTo(px - 8, gy + 7);
      ctx.lineTo(4, gy + 7);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#091119';
      ctx.font = 'bold 11px "IBM Plex Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, 12, gy + 4);
      ctx.textAlign = 'left';
    };

    if (state.ref.enabled) drawPentagonFlag('R', state.ref.offsetDiv, REF_COLOR);
    if (state.ch2.enabled) drawPentagonFlag('2', state.ch2.offsetDiv, CH2_COLOR);
    if (state.math.enabled && state.math.op !== 'FFT') drawPentagonFlag('M', state.math.offsetDiv, MATH_COLOR);
    if (state.ch1.enabled) drawPentagonFlag('1', state.ch1.offsetDiv, CH1_COLOR);

    const trigOffsetDiv = -state.horizontal.triggerOffsetSec / state.horizontal.timePerDiv;
    const tx = Math.round(Math.max(px + 9, Math.min(px + pw - 9, px + pw / 2 + trigOffsetDiv * (pw / 12))));
    ctx.fillStyle = TRIG_ORANGE;
    ctx.beginPath();
    ctx.moveTo(tx - 6, py + 2);
    ctx.lineTo(tx + 6, py + 2);
    ctx.lineTo(tx + 6, py + 13);
    ctx.lineTo(tx, py + 18);
    ctx.lineTo(tx - 6, py + 13);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#091119';
    ctx.font = 'bold 10px "IBM Plex Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('T', tx, py + 12);
    ctx.textAlign = 'left';

    const trigCh = state.trigger.source === 'CH2' ? state.ch2 : state.ch1;
    const levelY = Math.round(
      Math.max(
        py + 7,
        Math.min(py + ph - 7, py + ph / 2 - (trigCh.offsetDiv + state.trigger.levelVolts / trigCh.voltsPerDiv) * divH)
      )
    );
    ctx.fillStyle = TRIG_ORANGE;
    ctx.beginPath();
    ctx.moveTo(px + pw - 2, levelY);
    ctx.lineTo(px + pw + 7, levelY - 5);
    ctx.lineTo(px + pw + 7, levelY + 5);
    ctx.closePath();
    ctx.fill();

    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    if (hotRefs.lastKnobReadoutKind === 'trig_level' && now < hotRefs.lastKnobReadoutUntil) {
      ctx.save();
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.72)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(px + 2, levelY + 0.5);
      ctx.lineTo(px + pw - 2, levelY + 0.5);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawPlotOverlays(
    ctx: CanvasRenderingContext2D,
    state: DS1000EState,
    frame: ScopeFrameOutput | null,
    px: number,
    py: number,
    pw: number,
    ph: number
  ): void {
    const hasMeasureBar = state.measure.activeSlots.length > 0 && frame !== null;
    const measureBarH = hasMeasureBar ? 22 : 0;
    let stackY = py + ph - measureBarH - 6;

    if (state.math.enabled && state.math.op !== 'FFT' && state.horizontal.timeBaseMode !== 'X-Y') {
      const boxY = stackY - 20;
      ctx.fillStyle = 'rgba(8, 22, 28, 0.9)';
      ctx.fillRect(px + 6, boxY, 134, 18);
      ctx.strokeStyle = '#38767d';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 6.5, boxY + 0.5, 133, 17);

      ctx.fillStyle = MATH_COLOR;
      ctx.fillRect(px + 8, boxY + 2, 34, 14);
      ctx.fillStyle = '#091119';
      ctx.font = 'bold 11px "IBM Plex Sans", sans-serif';
      ctx.fillText('Math', px + 11, boxY + 13);

      ctx.fillStyle = '#f8a5e0';
      ctx.font = '11px "IBM Plex Mono", monospace';
      ctx.fillText(`scale:${formatVoltsDiv(state.math.voltsPerDiv)}`, px + 46, boxY + 13);
      stackY = boxY - 4;
    }

    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    if (hotRefs.lastKnobReadout && now < hotRefs.lastKnobReadoutUntil) {
      const boxY = stackY - 22;
      ctx.fillStyle = '#0b383d';
      ctx.fillRect(px + 6, boxY, 168, 20);
      ctx.strokeStyle = '#38767d';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 6.5, boxY + 0.5, 167, 19);
      ctx.fillStyle = TRIG_ORANGE;
      ctx.font = 'bold 12px "IBM Plex Mono", monospace';
      ctx.fillText(hotRefs.lastKnobReadout, px + 14, boxY + 14);
    }

    if (hasMeasureBar && frame) {
      const my = py + ph - measureBarH;
      ctx.fillStyle = 'rgba(5, 14, 18, 0.92)';
      ctx.fillRect(px + 1, my, pw - 2, measureBarH - 1);
      ctx.strokeStyle = '#256e75';
      ctx.beginPath();
      ctx.moveTo(px + 1, my + 0.5);
      ctx.lineTo(px + pw - 1, my + 0.5);
      ctx.stroke();

      const slotW = Math.floor((pw - 12) / 3);
      ctx.font = 'bold 11px "IBM Plex Mono", monospace';
      state.measure.activeSlots.slice(0, 3).forEach((slot, idx) => {
        const sx = px + 6 + idx * slotW;
        ctx.fillStyle = state.measure.source === 'CH2' ? CH2_COLOR : CH1_COLOR;
        const shortName = slot.length > 6 ? slot.slice(0, 6) : slot;
        ctx.fillText(`${shortName}:${formatMetricVal(slot, frame.measurements.values[slot])}`, sx, my + 15);
      });
    }
  }

  private drawCursors(
    ctx: CanvasRenderingContext2D,
    state: DS1000EState,
    frame: ScopeFrameOutput | null,
    px: number,
    py: number,
    pw: number,
    ph: number,
    xyRect: XYViewportRect | null
  ): void {
    const { curA, curB, type, mode } = state.cursor;
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.4;

    let readA = '';
    let readB = '';
    let readDelta = '';
    let readInv = '';

    if (xyRect) {
      const vDivX = Math.max(1e-6, state.ch1.voltsPerDiv);
      const vDivY = Math.max(1e-6, state.ch2.voltsPerDiv);

      if (mode === 'Track' && frame && frame.ch1Samples.length > 1) {
        const len = Math.min(frame.ch1Samples.length, frame.ch2Samples.length);
        const iA = Math.min(len - 1, Math.max(0, Math.floor(curA * (len - 1))));
        const iB = Math.min(len - 1, Math.max(0, Math.floor(curB * (len - 1))));
        const vxA = state.ch1.enabled ? frame.ch1Samples[iA] : 0;
        const vyA = state.ch2.enabled ? frame.ch2Samples[iA] : 0;
        const vxB = state.ch1.enabled ? frame.ch1Samples[iB] : 0;
        const vyB = state.ch2.enabled ? frame.ch2Samples[iB] : 0;

        const drawTrackCross = (vx: number, vy: number, color: string) => {
          const sx = Math.max(xyRect.x + 2, Math.min(xyRect.x + xyRect.w - 2, xyRect.cx + (vx / vDivX + state.ch1.offsetDiv) * xyRect.div));
          const sy = Math.max(xyRect.y + 2, Math.min(xyRect.y + xyRect.h - 2, xyRect.cy - (vy / vDivY + state.ch2.offsetDiv) * xyRect.div));
          ctx.strokeStyle = color;
          ctx.beginPath();
          ctx.moveTo(sx, xyRect.y);
          ctx.lineTo(sx, xyRect.y + xyRect.h);
          ctx.moveTo(xyRect.x, sy);
          ctx.lineTo(xyRect.x + xyRect.w, sy);
          ctx.stroke();
        };

        drawTrackCross(vxA, vyA, '#fb923c');
        drawTrackCross(vxB, vyB, '#38bdf8');

        readA = `A:${vxA.toFixed(2)}V,${vyA.toFixed(2)}V`;
        readB = `B:${vxB.toFixed(2)}V,${vyB.toFixed(2)}V`;
        readDelta = `dX:${Math.abs(vxB - vxA).toFixed(3)}V`;
        readInv = `dY:${Math.abs(vyB - vyA).toFixed(3)}V`;
      } else if (type === 'X') {
        const ax = xyRect.x + curA * xyRect.w;
        const bx = xyRect.x + curB * xyRect.w;
        ctx.strokeStyle = '#fb923c';
        ctx.beginPath();
        ctx.moveTo(ax, xyRect.y);
        ctx.lineTo(ax, xyRect.y + xyRect.h);
        ctx.stroke();
        ctx.strokeStyle = '#38bdf8';
        ctx.beginPath();
        ctx.moveTo(bx, xyRect.y);
        ctx.lineTo(bx, xyRect.y + xyRect.h);
        ctx.stroke();

        const xA = ((curA - 0.5) * 8 - state.ch1.offsetDiv) * vDivX;
        const xB = ((curB - 0.5) * 8 - state.ch1.offsetDiv) * vDivX;
        readA = `X_A:${xA.toFixed(3)}V`;
        readB = `X_B:${xB.toFixed(3)}V`;
        readDelta = `dX:${Math.abs(xB - xA).toFixed(3)}V`;
        readInv = 'Axis:CH1(X)';
      } else {
        const ay = xyRect.y + curA * xyRect.h;
        const by = xyRect.y + curB * xyRect.h;
        ctx.strokeStyle = '#fb923c';
        ctx.beginPath();
        ctx.moveTo(xyRect.x, ay);
        ctx.lineTo(xyRect.x + xyRect.w, ay);
        ctx.stroke();
        ctx.strokeStyle = '#38bdf8';
        ctx.beginPath();
        ctx.moveTo(xyRect.x, by);
        ctx.lineTo(xyRect.x + xyRect.w, by);
        ctx.stroke();

        const yA = ((0.5 - curA) * 8 - state.ch2.offsetDiv) * vDivY;
        const yB = ((0.5 - curB) * 8 - state.ch2.offsetDiv) * vDivY;
        readA = `Y_A:${yA.toFixed(3)}V`;
        readB = `Y_B:${yB.toFixed(3)}V`;
        readDelta = `dY:${Math.abs(yB - yA).toFixed(3)}V`;
        readInv = 'Axis:CH2(Y)';
      }

      ctx.restore();
      ctx.fillStyle = 'rgba(6, 16, 22, 0.9)';
      ctx.fillRect(px + pw - 190, py + 32, 182, 74);
      ctx.strokeStyle = '#256e75';
      ctx.strokeRect(px + pw - 190, py + 32, 182, 74);
      ctx.fillStyle = '#f8fafc';
      ctx.font = '11px "IBM Plex Mono", monospace';
      ctx.fillText(readA, px + pw - 182, py + 48);
      ctx.fillText(readB, px + pw - 182, py + 65);
      ctx.fillText(readDelta, px + pw - 182, py + 82);
      if (readInv) ctx.fillText(readInv, px + pw - 182, py + 98);
      return;
    }

    const srcCh = state.cursor.source === 'CH2' ? state.ch2 : state.ch1;
    const totalSec = 12 * state.horizontal.timePerDiv;
    const fullVolts = 8 * srcCh.voltsPerDiv;

    if (mode === 'Track' && frame) {
      const ax = px + curA * pw;
      const bx = px + curB * pw;
      const arrA = state.cursor.trackSourceA === 'CH2' ? frame.ch2Samples : frame.ch1Samples;
      const arrB = state.cursor.trackSourceB === 'CH2' ? frame.ch2Samples : frame.ch1Samples;
      const vA = arrA[Math.min(arrA.length - 1, Math.floor(curA * (arrA.length - 1)))] ?? 0;
      const vB = arrB[Math.min(arrB.length - 1, Math.floor(curB * (arrB.length - 1)))] ?? 0;
      const tA = (curA - 0.5) * totalSec;
      const tB = (curB - 0.5) * totalSec;

      ctx.strokeStyle = '#fb923c';
      ctx.beginPath();
      ctx.moveTo(ax, py);
      ctx.lineTo(ax, py + ph);
      ctx.stroke();

      ctx.strokeStyle = '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(bx, py);
      ctx.lineTo(bx, py + ph);
      ctx.stroke();

      readA = `A:${formatTimeValue(tA)} ${vA.toFixed(2)}V`;
      readB = `B:${formatTimeValue(tB)} ${vB.toFixed(2)}V`;
      readDelta = `dX:${formatTimeValue(tB - tA)}`;
      readInv = `dY:${(vB - vA).toFixed(2)}V`;
    } else if (type === 'X') {
      const ax = px + curA * pw;
      const bx = px + curB * pw;
      ctx.strokeStyle = '#fb923c';
      ctx.beginPath();
      ctx.moveTo(ax, py);
      ctx.lineTo(ax, py + ph);
      ctx.stroke();
      ctx.strokeStyle = '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(bx, py);
      ctx.lineTo(bx, py + ph);
      ctx.stroke();

      const tA = (curA - 0.5) * totalSec;
      const tB = (curB - 0.5) * totalSec;
      const dt = Math.abs(tB - tA);
      readA = `CurA:${formatTimeValue(tA)}`;
      readB = `CurB:${formatTimeValue(tB)}`;
      readDelta = `dX:${formatTimeValue(dt)}`;
      readInv = dt > 1e-12 ? `1/dX:${formatFreqValue(1 / dt)}` : '1/dX:****';
    } else {
      const ay = py + curA * ph;
      const by = py + curB * ph;
      ctx.strokeStyle = '#fb923c';
      ctx.beginPath();
      ctx.moveTo(px, ay);
      ctx.lineTo(px + pw, ay);
      ctx.stroke();
      ctx.strokeStyle = '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(px, by);
      ctx.lineTo(px + pw, by);
      ctx.stroke();

      const vA = (0.5 - curA) * fullVolts - srcCh.offsetDiv * srcCh.voltsPerDiv;
      const vB = (0.5 - curB) * fullVolts - srcCh.offsetDiv * srcCh.voltsPerDiv;
      readA = `CurA:${vA.toFixed(3)}V`;
      readB = `CurB:${vB.toFixed(3)}V`;
      readDelta = `dY:${Math.abs(vA - vB).toFixed(3)}V`;
    }
    ctx.restore();

    ctx.fillStyle = 'rgba(6, 16, 22, 0.9)';
    ctx.fillRect(px + pw - 190, py + 32, 182, 74);
    ctx.strokeStyle = '#256e75';
    ctx.strokeRect(px + pw - 190, py + 32, 182, 74);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '11px "IBM Plex Mono", monospace';
    ctx.fillText(readA, px + pw - 182, py + 48);
    ctx.fillText(readB, px + pw - 182, py + 65);
    ctx.fillText(readDelta, px + pw - 182, py + 82);
    if (readInv) ctx.fillText(readInv, px + pw - 182, py + 98);
  }

  private drawDisplayAllOverlay(
    ctx: CanvasRenderingContext2D,
    state: DS1000EState,
    frame: ScopeFrameOutput,
    px: number,
    py: number,
    pw: number
  ): void {
    const keys: MeasureParamKey[] = [
      'Vpp', 'Vmax', 'Vmin', 'Vamp', 'Vtop', 'Vbase', 'Vavg', 'Vrms',
      'Freq', 'Period', 'RiseTime', 'FallTime', 'PlusWidth', 'MinusWidth',
      'PlusDuty', 'MinusDuty', 'Overshoot', 'Preshoot',
    ];
    ctx.fillStyle = 'rgba(7, 15, 22, 0.9)';
    ctx.fillRect(px + 8, py + 8, pw - 16, 176);
    ctx.strokeStyle = '#256e75';
    ctx.strokeRect(px + 8, py + 8, pw - 16, 176);

    ctx.fillStyle = state.measure.source === 'CH2' ? CH2_COLOR : CH1_COLOR;
    ctx.font = 'bold 12px "IBM Plex Mono", monospace';
    ctx.fillText(`ALL MEASURE (${state.measure.source})`, px + 18, py + 26);

    ctx.font = '11px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#f8fafc';
    keys.forEach((k, idx) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      const x = px + 18 + col * ((pw - 32) / 3);
      const y = py + 46 + row * 22;
      ctx.fillText(`${k.slice(0, 7)}:${formatMetricVal(k, frame.measurements.values[k])}`, x, y);
    });
  }

  private drawBottomBar(ctx: CanvasRenderingContext2D, state: DS1000EState): void {
    const y = LCD_H - BOT_BAR_H;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, y, LCD_W, BOT_BAR_H);

    ctx.strokeStyle = '#1f7a85';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(LCD_W, y + 0.5);
    ctx.stroke();

    const drawChStatus = (
      x: number,
      label: string,
      color: string,
      enabled: boolean,
      selected: boolean,
      coupling: CouplingMode,
      voltsPerDiv: number,
      bwLimit: boolean
    ) => {
      const by = y + 7;
      const bh = 20;
      const fore = enabled ? color : '#52606d';

      if (selected && enabled) {
        // EXACT DS1052E photograph match: solid colored CH1/CH2+coupling block with BLACK text
        ctx.fillStyle = color;
        ctx.fillRect(x, by, 44, bh);
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 13px "IBM Plex Mono", monospace';
        ctx.fillText(label, x + 3, by + 15);
        drawCouplingSymbol(ctx, coupling, x + 29, by + 10, '#000000');
      } else {
        ctx.fillStyle = fore;
        ctx.font = 'bold 13px "IBM Plex Mono", monospace';
        ctx.fillText(label, x + 2, by + 15);
        drawCouplingSymbol(ctx, coupling, x + 28, by + 10, fore);
      }

      ctx.fillStyle = fore;
      ctx.font = 'bold 13px "IBM Plex Mono", monospace';
      ctx.fillText(formatVoltsDiv(voltsPerDiv), x + 49, by + 15);

      if (bwLimit && enabled) {
        ctx.fillStyle = color;
        ctx.fillRect(x + 106, by + 2, 13, 15);
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 11px "IBM Plex Mono", monospace';
        ctx.fillText('B', x + 109, by + 13);
      }
    };

    drawChStatus(
      14,
      'CH1',
      CH1_COLOR,
      state.ch1.enabled,
      state.selectedVertical === 'CH1',
      state.ch1.coupling,
      state.ch1.voltsPerDiv,
      state.ch1.bwLimit
    );

    drawChStatus(
      146,
      'CH2',
      CH2_COLOR,
      state.ch2.enabled,
      state.selectedVertical === 'CH2',
      state.ch2.coupling,
      state.ch2.voltsPerDiv,
      state.ch2.bwLimit
    );

    // Timebase white readout
    const isXY = state.horizontal.timeBaseMode === 'X-Y';
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 13px "IBM Plex Mono", monospace';
    ctx.fillText(
      isXY ? 'Mode X-Y' : `Time ${formatTimeValue(state.horizontal.timePerDiv)}`,
      284,
      y + 22
    );

    const ox = 416;
    const oy = y + 8;
    if (isXY) {
      ctx.fillStyle = '#1f7a85';
      ctx.fillRect(ox, oy, 30, 18);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('X-Y', ox + 15, oy + 13);
      ctx.textAlign = 'left';

      ctx.fillStyle = CH1_COLOR;
      ctx.font = 'bold 12px "IBM Plex Mono", monospace';
      ctx.fillText('1:X', ox + 36, y + 22);
      ctx.fillStyle = CH2_COLOR;
      ctx.fillText('2:Y', ox + 66, y + 22);
    } else {
      // Solid orange T-> badge + trigger offset directly beside it (matches photo)
      ctx.fillStyle = TRIG_ORANGE;
      ctx.fillRect(ox, oy, 24, 18);
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 11px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('T->', ox + 12, oy + 13);
      ctx.textAlign = 'left';

      ctx.fillStyle = TRIG_ORANGE;
      ctx.font = 'bold 13px "IBM Plex Mono", monospace';
      ctx.fillText(formatTimeValue(state.horizontal.triggerOffsetSec), ox + 28, y + 22);
    }
  }

  private drawSoftKeySidebar(
    ctx: CanvasRenderingContext2D,
    state: DS1000EState,
    frame: ScopeFrameOutput | null
  ): void {
    const view = getSoftKeyMenuView(state);
    const sx = LCD_W - SIDE_MENU_W;
    const w = SIDE_MENU_W - 2;
    const headerH = 28;
    const topY = 2;
    const botY = LCD_H - BOT_BAR_H - 2;
    const slotH = (botY - (topY + headerH + 2)) / 5;

    const hGrad = ctx.createLinearGradient(0, topY, 0, topY + headerH);
    hGrad.addColorStop(0, '#2a70d2');
    hGrad.addColorStop(1, '#124694');
    ctx.fillStyle = hGrad;
    ctx.fillRect(sx, topY, w, headerH);

    ctx.strokeStyle = '#6ba3f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx + 0.5, topY + headerH - 0.5);
    ctx.lineTo(sx + 0.5, topY + 0.5);
    ctx.lineTo(sx + w - 0.5, topY + 0.5);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px "IBM Plex Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(view.header, sx + w / 2, topY + 19);

    view.keys.forEach((rawItem, idx) => {
      const item: SoftKeyItem =
        rawItem.label === 'Sa Rate'
          ? { ...rawItem, value: formatSampleRate(frame?.sampleRateHz ?? 1e9) }
          : rawItem;

      const by = Math.round(topY + headerH + 2 + idx * slotH);
      const bh = Math.round(slotH - 2);

      const cellGrad = ctx.createLinearGradient(0, by, 0, by + bh);
      cellGrad.addColorStop(0, '#5a949a');
      cellGrad.addColorStop(1, '#32656b');
      ctx.fillStyle = cellGrad;
      ctx.fillRect(sx, by, w, bh);

      ctx.strokeStyle = '#7bb4ba';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx + 1, by + bh - 1);
      ctx.lineTo(sx + 1, by + 1);
      ctx.lineTo(sx + w - 1, by + 1);
      ctx.stroke();

      ctx.strokeStyle = '#113034';
      ctx.strokeRect(sx + 0.5, by + 0.5, w - 1, bh - 1);

      if (item.isPageArrow) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 13px "IBM Plex Mono", monospace';
        ctx.fillText(item.pageLabel ?? '', sx + w / 2, by + bh * 0.34);

        const cx = sx + w / 2;
        const cy = by + bh * 0.67;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        if (item.isPageArrow === 'down') {
          ctx.moveTo(cx - 10, cy - 11);
          ctx.lineTo(cx + 10, cy - 11);
          ctx.lineTo(cx + 10, cy - 1);
          ctx.lineTo(cx + 22, cy - 1);
          ctx.lineTo(cx, cy + 13);
          ctx.lineTo(cx - 22, cy - 1);
          ctx.lineTo(cx - 10, cy - 1);
        } else {
          ctx.moveTo(cx, cy - 13);
          ctx.lineTo(cx + 22, cy + 1);
          ctx.lineTo(cx + 10, cy + 1);
          ctx.lineTo(cx + 10, cy + 11);
          ctx.lineTo(cx - 10, cy + 11);
          ctx.lineTo(cx - 10, cy + 1);
          ctx.lineTo(cx - 22, cy + 1);
        }
        ctx.closePath();
        ctx.fill();
        return;
      }

      if (!item.label) return;

      const style = item.style ?? (item.value ? 'box' : 'action');

      if (style === 'popup') {
        if (item.value) {
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 13px "IBM Plex Sans", sans-serif';
          ctx.fillText(item.label, sx + w / 2, by + bh * 0.33);

          const vx = sx + 6;
          const vy = by + bh * 0.48;
          const vw = w - 12;
          const vh = bh * 0.42;
          ctx.fillStyle = '#0c3b41';
          ctx.fillRect(vx, vy, vw, vh);
          ctx.strokeStyle = '#1b5a62';
          ctx.strokeRect(vx + 0.5, vy + 0.5, vw - 1, vh - 1);

          ctx.fillStyle = '#cdeff2';
          ctx.beginPath();
          ctx.moveTo(vx + 4, vy + vh / 2);
          ctx.lineTo(vx + 10, vy + vh / 2 - 4);
          ctx.lineTo(vx + 10, vy + vh / 2 + 4);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = '#d4f3f6';
          ctx.font = 'bold 13px "IBM Plex Mono", monospace';
          ctx.fillText(item.value, sx + w / 2 + 3, vy + vh * 0.68);
        } else {
          const vy = by + 8;
          const vh = bh - 16;
          ctx.fillStyle = '#0c3b41';
          ctx.fillRect(sx + 6, vy, w - 12, vh);
          ctx.strokeStyle = '#1b5a62';
          ctx.strokeRect(sx + 6.5, vy + 0.5, w - 13, vh - 1);

          ctx.fillStyle = '#cdeff2';
          ctx.beginPath();
          ctx.moveTo(sx + 10, vy + vh / 2);
          ctx.lineTo(sx + 16, vy + vh / 2 - 4);
          ctx.lineTo(sx + 16, vy + vh / 2 + 4);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = '#e0f7fa';
          ctx.font = 'bold 13px "IBM Plex Sans", sans-serif';
          ctx.fillText(item.label, sx + w / 2 + 4, vy + vh * 0.59);
        }
      } else if (style === 'box' || style === 'multi') {
        if (item.value) {
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 13px "IBM Plex Sans", sans-serif';
          ctx.fillText(item.label, sx + w / 2, by + bh * 0.30);

          if (style === 'multi') {
            drawRotaryKnobIcon(ctx, sx + w / 2, by + bh * 0.46, item.active ? '#fde047' : '#ffffff');
          }

          const vx = sx + 8;
          const vy = by + bh * (style === 'multi' ? 0.57 : 0.48);
          const vw = w - 16;
          const vh = bh * (style === 'multi' ? 0.35 : 0.42);
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(vx, vy, vw, vh);
          ctx.strokeStyle = item.active ? TRIG_ORANGE : '#0c3b41';
          ctx.lineWidth = item.active ? 2 : 1;
          ctx.strokeRect(vx + 0.5, vy + 0.5, vw - 1, vh - 1);

          ctx.fillStyle = '#0f4c54';
          ctx.font = 'bold 12px "IBM Plex Mono", monospace';
          ctx.fillText(item.value, sx + w / 2, vy + vh * 0.69);
        } else {
          const vx = sx + 8;
          const vy = by + bh * 0.25;
          const vw = w - 16;
          const vh = bh * 0.5;
          ctx.fillStyle = item.active ? '#fde68a' : '#f8fafc';
          ctx.fillRect(vx, vy, vw, vh);
          ctx.strokeStyle = '#0c3b41';
          ctx.strokeRect(vx + 0.5, vy + 0.5, vw - 1, vh - 1);
          ctx.fillStyle = '#0f4c54';
          ctx.font = 'bold 13px "IBM Plex Sans", sans-serif';
          ctx.fillText(item.label, sx + w / 2, vy + vh * 0.62);
        }
      } else if (style === 'status') {
        ctx.fillStyle = '#e2e8f0';
        ctx.font = 'bold 13px "IBM Plex Sans", sans-serif';
        ctx.fillText(item.label, sx + w / 2, by + bh * 0.33);

        const vx = sx + 8;
        const vy = by + bh * 0.48;
        const vw = w - 16;
        const vh = bh * 0.40;
        ctx.fillStyle = '#47767c';
        ctx.fillRect(vx, vy, vw, vh);
        ctx.strokeStyle = '#244e54';
        ctx.strokeRect(vx + 0.5, vy + 0.5, vw - 1, vh - 1);
        ctx.fillStyle = '#cbd5e1';
        ctx.font = 'bold 12px "IBM Plex Mono", monospace';
        ctx.fillText(item.value ?? '', sx + w / 2, vy + vh * 0.68);
      } else {
        ctx.fillStyle = item.active ? '#fde047' : '#ffffff';
        ctx.font = 'bold 13px "IBM Plex Sans", sans-serif';
        ctx.fillText(item.label, sx + w / 2, by + bh * 0.58);
      }
    });

    ctx.textAlign = 'left';
  }

  private drawModalBox(ctx: CanvasRenderingContext2D, title: string, lines: string[]): void {
    const bw = 380;
    const bh = 46 + lines.length * 24;
    const bx = (PLOT_W - bw) / 2 + PLOT_X;
    const by = (LCD_H - bh) / 2;

    ctx.fillStyle = 'rgba(6, 20, 26, 0.94)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);

    ctx.fillStyle = '#1b60c2';
    ctx.fillRect(bx, by, bw, 28);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px "IBM Plex Sans", sans-serif';
    ctx.fillText(title, bx + 12, by + 19);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '13px "IBM Plex Mono", monospace';
    lines.forEach((line, idx) => {
      ctx.fillText(line, bx + 12, by + 50 + idx * 24);
    });
  }
}

export function exportScopePNG(canvas: HTMLCanvasElement): void {
  const link = document.createElement('a');
  link.download = `rigol-ds1052e-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

export function exportScopeCSV(frame: ScopeFrameOutput, state: DS1000EState): void {
  const dt = (12 * state.horizontal.timePerDiv) / frame.ch1Samples.length;
  const rows = ['index,time_s,ch1_V,ch2_V'];
  for (let i = 0; i < frame.ch1Samples.length; i++) {
    rows.push(`${i},${(i * dt).toExponential(5)},${frame.ch1Samples[i].toFixed(5)},${frame.ch2Samples[i].toFixed(5)}`);
  }
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `rigol-ds1052e-${Date.now()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
