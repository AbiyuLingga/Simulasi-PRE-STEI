import * as THREE from 'three';
import type { KitId } from '../../simulation/circuit/types';
import { DECADE_DIAL_SPECS } from '../../simulation/kits/kitDefinitions';

const kitTexCache = new Map<string, THREE.CanvasTexture>();

function makeKitCanvas(
  key: string,
  draw: (ctx: CanvasRenderingContext2D, W: number, H: number) => void
): THREE.CanvasTexture {
  const existing = kitTexCache.get(key);
  if (existing) return existing;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 680;
  const ctx = c.getContext('2d')!;
  draw(ctx, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  kitTexCache.set(key, tex);
  return tex;
}

function drawBadgeNumber(ctx: CanvasRenderingContext2D, W: number, numStr: string): void {
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(W * 0.84, 24, W * 0.11, 56);
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = 2;
  ctx.strokeRect(W * 0.84, 24, W * 0.11, 56);
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 38px "IBM Plex Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(numStr, W * 0.895, 65);
  ctx.textAlign = 'left';
}

function drawResistorSymbol(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, label?: string): void {
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 4;
  ctx.strokeRect(x - w / 2, y - h / 2, w, h);
  if (label) {
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 17px "IBM Plex Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y + 6);
    ctx.textAlign = 'left';
  }
}

function drawCapSymbol(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  vertical = false,
  label?: string,
  labelSide: 'left' | 'right' = 'left'
): void {
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  if (!vertical) {
    ctx.moveTo(x - 6, y - 16);
    ctx.lineTo(x - 6, y + 16);
    ctx.moveTo(x + 6, y - 16);
    ctx.lineTo(x + 6, y + 16);
  } else {
    ctx.moveTo(x - 16, y - 6);
    ctx.lineTo(x + 16, y - 6);
    ctx.moveTo(x - 16, y + 6);
    ctx.lineTo(x + 16, y + 6);
  }
  ctx.stroke();
  if (label) {
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 16px "IBM Plex Sans", sans-serif';
    ctx.textAlign = 'center';
    const labelX = vertical ? (labelSide === 'right' ? x + 38 : x - 36) : x;
    ctx.fillText(label, labelX, vertical ? y + 6 : y + 34);
    ctx.textAlign = 'left';
  }
}

export function getDecadeBoxFaceplateTexture(): THREE.CanvasTexture {
  return makeKitCanvas('kit_decade_pot_v1', (ctx, W, H) => {
    // Matte-black anodized aluminum / bakelite lab Decade Resistance Box faceplate
    ctx.fillStyle = '#14181f';
    ctx.fillRect(0, 0, W, H);

    // Subtle brushed border frame
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 4;
    ctx.strokeRect(18, 18, W - 36, H - 36);

    // Header silkscreen
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 15px "IBM Plex Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('LAB.DASAR - ITB', 42, 50);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 25px "IBM Plex Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('RESISTOR DEKADE 8-SKALA', W * 0.44, 52);

    // Recessed digital total window frame (top-right; dynamic texture renders live total inside!)
    ctx.fillStyle = '#090d14';
    ctx.fillRect(W * 0.675, 24, W * 0.285, 52);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(W * 0.675, 24, W * 0.285, 52);

    // 8 Calibrated Rotary Potentiometer Scale Rings (0..10 each; summed in series!)
    DECADE_DIAL_SPECS.forEach((dial, idx) => {
      const cx = W * dial.u;
      const cy = H * dial.v;
      const rInner = 39;
      const rTick = 49;
      const rNum = 63;

      ctx.beginPath();
      ctx.arc(cx, cy, rInner + 2, 0, Math.PI * 2);
      ctx.fillStyle = '#1e242e';
      ctx.fill();
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2;
      ctx.stroke();

      for (let step = 0; step <= 10; step++) {
        const deg = -140 + step * 28;
        const rad = ((deg - 90) * Math.PI) / 180;
        const x0 = cx + Math.cos(rad) * rInner;
        const y0 = cy + Math.sin(rad) * rInner;
        const x1 = cx + Math.cos(rad) * (step % 5 === 0 ? rTick + 4 : rTick);
        const y1 = cy + Math.sin(rad) * (step % 5 === 0 ? rTick + 4 : rTick);

        ctx.strokeStyle = step === 0 ? '#38bdf8' : step === 10 ? '#f59e0b' : '#cbd5e1';
        ctx.lineWidth = step % 5 === 0 ? 3 : 2;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();

        const nx = cx + Math.cos(rad) * rNum;
        const ny = cy + Math.sin(rad) * rNum;
        ctx.fillStyle = step === 0 ? '#7dd3fc' : step === 10 ? '#fbbf24' : '#f1f5f9';
        ctx.font = 'bold 14px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(step), nx, ny);
      }

      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(cx - 46, cy + 68, 92, 24);
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cx - 46, cy + 68, 92, 24);
      ctx.fillStyle = idx < 4 ? '#fbbf24' : '#7dd3fc';
      ctx.font = 'bold 16px "IBM Plex Mono", monospace';
      ctx.fillText(dial.label, cx, cy + 86);
    });

    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(W * 0.08, H * 0.822);
    ctx.lineTo(W * 0.92, H * 0.822);
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 17px "IBM Plex Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('A (+)', W * 0.300, H * 0.852);
    ctx.fillText('B (−)', W * 0.500, H * 0.852);
    ctx.fillText('⏚ GND', W * 0.700, H * 0.852);

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(W * 0.328, H * 0.885);
    ctx.lineTo(W * 0.372, H * 0.885);
    ctx.moveTo(W * 0.428, H * 0.885);
    ctx.lineTo(W * 0.472, H * 0.885);
    ctx.stroke();
    ctx.strokeRect(W * 0.372, H * 0.873, W * 0.056, 16);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 13px "IBM Plex Mono", monospace';
    ctx.fillText('R_TOTAL = Σ (Skala 1..8) · Max 0.5W/Dekade', W * 0.500, H * 0.955);
    ctx.textAlign = 'left';
  });
}

export function getKitFaceplateTexture(kitId: Exclude<KitId, 'none'>): THREE.CanvasTexture {
  if (kitId === 'multimeter') {
    return makeKitCanvas('kit_multimeter_v2', (ctx, W, H) => {
      ctx.fillStyle = '#dba507';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 16px "IBM Plex Sans", sans-serif';
      ctx.fillText('LAB.DASAR - ITB', 56, 56);
      drawBadgeNumber(ctx, W, '14');
      ctx.font = 'bold 30px "IBM Plex Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('MULTIMETER', W * 0.5, 92);

      // Left column: R1..R5 isolated resistors (exact EL2101 Modul 1 & 2 values!)
      const leftResistors: ReadonlyArray<{ lbl: string; val: string; v: number }> = [
        { lbl: 'R1', val: '220kΩ', v: 0.305 },
        { lbl: 'R2', val: '1.5kΩ', v: 0.432 },
        { lbl: 'R3', val: '33kΩ', v: 0.556 },
        { lbl: 'R4', val: '1.5MΩ', v: 0.680 },
        { lbl: 'R5', val: '120Ω', v: 0.805 },
      ];
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 4;
      leftResistors.forEach((item) => {
        const y = H * item.v;
        // Full horizontal wire lead connecting left socket (0.190) -> resistor -> right socket (0.352)
        ctx.beginPath();
        ctx.moveTo(W * 0.190, y);
        ctx.lineTo(W * 0.352, y);
        ctx.stroke();

        // Clean background cutout & resistor symbol box
        ctx.fillStyle = '#dba507';
        ctx.fillRect(W * 0.234, y - 14, W * 0.074, 28);
        ctx.strokeRect(W * 0.236, y - 13, W * 0.070, 26);

        // Name & exact value printed crisply above resistor
        ctx.fillStyle = '#111827';
        ctx.font = 'bold 17px "IBM Plex Sans", sans-serif';
        ctx.fillText(`${item.lbl} · ${item.val}`, W * 0.271, y - 20);
      });

      // Center V Shunt / Jumper Bridge (clearly wired between km_v_l=0.440 and km_v_r=0.498)
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(W * 0.440, H * 0.405);
      ctx.lineTo(W * 0.498, H * 0.405);
      ctx.stroke();
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 16px "IBM Plex Sans", sans-serif';
      ctx.fillText('JUMPER V', W * 0.469, H * 0.365);

      // Right Selectable Voltage Divider R1 (120Ω / 1.5kΩ / 1.5MΩ) & R2 (120Ω / 1.5kΩ / 1.5MΩ)
      ctx.font = 'bold 20px "IBM Plex Sans", sans-serif';
      ctx.fillText('R1 (SERI)', W * 0.608, H * 0.242);

      const r1Bank: ReadonlyArray<{ vr: number; val: string }> = [
        { vr: 0.312, val: '120Ω' },
        { vr: 0.370, val: '1.5kΩ' },
        { vr: 0.428, val: '1.5MΩ' },
      ];
      // Connect ALL 3 R1 sockets -> boxes -> vertical collector bus (u=0.654) -> km_div_mid (0.678) -> km_div_out (0.848)
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 4;
      ctx.beginPath();
      r1Bank.forEach(({ vr }) => {
        ctx.moveTo(W * 0.545, H * vr);
        ctx.lineTo(W * 0.654, H * vr);
      });
      // Vertical collector bus joining all 3 R1 right leads to km_div_mid
      ctx.moveTo(W * 0.654, H * 0.312);
      ctx.lineTo(W * 0.654, H * 0.428);
      // Main horizontal MID -> OUT bus
      ctx.moveTo(W * 0.654, H * 0.370);
      ctx.lineTo(W * 0.848, H * 0.370);
      // T-junction down to R2 top horizontal collector bus (v=0.478)
      ctx.moveTo(W * 0.762, H * 0.370);
      ctx.lineTo(W * 0.762, H * 0.478);
      // R2 top horizontal collector bus spanning u=0.720..0.804
      ctx.moveTo(W * 0.720, H * 0.478);
      ctx.lineTo(W * 0.804, H * 0.478);
      // 3 full vertical R2 branches from top collector bus straight through resistor boxes to bottom sockets (v=0.655)!
      [0.720, 0.762, 0.804].forEach((ur) => {
        ctx.moveTo(W * ur, H * 0.478);
        ctx.lineTo(W * ur, H * 0.655);
      });
      ctx.stroke();

      // Solid junction dots at T-connections for clean schematic readability
      ctx.fillStyle = '#111827';
      [
        [0.654, 0.370],
        [0.762, 0.370],
        [0.762, 0.478],
      ].forEach(([ju, jv]) => {
        ctx.beginPath();
        ctx.arc(W * ju, H * jv, 5.5, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw R1 resistor symbols & crisp values inside boxes
      r1Bank.forEach(({ vr, val }) => {
        ctx.fillStyle = '#dba507';
        ctx.fillRect(W * 0.576, H * vr - 12, W * 0.066, 24);
        drawResistorSymbol(ctx, W * 0.609, H * vr, W * 0.064, 22);
        ctx.fillStyle = '#111827';
        ctx.font = 'bold 14px "IBM Plex Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(val, W * 0.609, H * vr + 5);
      });

      // Node labels on MID & OUT
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 15px "IBM Plex Sans", sans-serif';
      ctx.fillText('MID', W * 0.678, H * 0.334);
      ctx.fillText('Vout', W * 0.848, H * 0.334);

      // Draw R2 vertical resistor symbols & crisp values right next to/below each branch
      ctx.font = 'bold 20px "IBM Plex Sans", sans-serif';
      ctx.fillText('R2', W * 0.664, H * 0.562);
      const r2Bank: ReadonlyArray<{ ur: number; val: string }> = [
        { ur: 0.720, val: '120Ω' },
        { ur: 0.762, val: '1.5k' },
        { ur: 0.804, val: '1.5M' },
      ];
      r2Bank.forEach(({ ur, val }) => {
        ctx.fillStyle = '#dba507';
        ctx.fillRect(W * ur - 12, H * 0.502, 24, H * 0.112);
        drawResistorSymbol(ctx, W * ur, H * 0.558, 24, H * 0.108);
        ctx.fillStyle = '#111827';
        ctx.font = 'bold 12px "IBM Plex Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(val, W * ur, H * 0.715);
      });

      // Bottom jumper bus lines + labels (positioned cleanly below sockets)
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(W * 0.440, H * 0.750);
      ctx.lineTo(W * 0.592, H * 0.750);
      ctx.moveTo(W * 0.655, H * 0.750);
      ctx.lineTo(W * 0.855, H * 0.750);
      ctx.stroke();
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 15px "IBM Plex Sans", sans-serif';
      ctx.fillText('BUS A (JUMPER)', W * 0.516, H * 0.822);
      ctx.fillText('BUS B (JUMPER)', W * 0.755, H * 0.822);

      ctx.font = '13px "IBM Plex Mono", monospace';
      ctx.fillText('SPY 022-7535557', W * 0.82, H * 0.94);
      ctx.textAlign = 'left';
    });
  }

  if (kitId === 'osc_gen') {
    return makeKitCanvas('kit_osc_gen_v1', (ctx, W, H) => {
      ctx.fillStyle = '#dba507';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 16px "IBM Plex Sans", sans-serif';
      ctx.fillText('LAB.DASAR - ITB', 56, 56);
      drawBadgeNumber(ctx, W, '5');
      ctx.font = 'bold 28px "IBM Plex Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('OSILOSKOP DAN GENERATOR SINYAL', W * 0.5, 92);

      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 4;

      // Left PENGUAT block
      ctx.strokeRect(W * 0.270, H * 0.215, W * 0.130, H * 0.200);
      ctx.font = 'bold 18px "IBM Plex Sans", sans-serif';
      ctx.fillText('PENGUAT', W * 0.335, H * 0.252);
      ctx.font = 'bold 14px "IBM Plex Sans", sans-serif';
      ctx.fillText('MIN', W * 0.292, H * 0.395);
      ctx.fillText('MAK', W * 0.378, H * 0.395);
      ctx.fillText('IN', W * 0.215, H * 0.320);
      ctx.fillText('OUT', W * 0.455, H * 0.320);
      ctx.fillText('GND', W * 0.245, H * 0.435);
      ctx.fillText('GND', W * 0.425, H * 0.435);
      ctx.fillText('ON', W * 0.165, H * 0.195);
      ctx.fillText('OFF', W * 0.165, H * 0.255);

      ctx.beginPath();
      ctx.moveTo(W * 0.215, H * 0.258);
      ctx.lineTo(W * 0.270, H * 0.258);
      ctx.moveTo(W * 0.400, H * 0.258);
      ctx.lineTo(W * 0.455, H * 0.258);
      ctx.moveTo(W * 0.215, H * 0.365);
      ctx.lineTo(W * 0.270, H * 0.365);
      ctx.moveTo(W * 0.400, H * 0.365);
      ctx.lineTo(W * 0.455, H * 0.365);
      ctx.stroke();

      // Middle OSILATOR block
      ctx.strokeRect(W * 0.270, H * 0.525, W * 0.130, H * 0.190);
      ctx.font = 'bold 18px "IBM Plex Sans", sans-serif';
      ctx.fillText('OSILATOR', W * 0.335, H * 0.560);
      ctx.font = 'bold 14px "IBM Plex Sans", sans-serif';
      ctx.fillText('f1   f2   f3', W * 0.335, H * 0.605);
      ctx.fillText('OUT', W * 0.455, H * 0.625);
      ctx.fillText('GND', W * 0.430, H * 0.742);
      ctx.fillText('ON', W * 0.305, H * 0.475);
      ctx.fillText('OFF', W * 0.305, H * 0.515);
      ctx.beginPath();
      ctx.moveTo(W * 0.400, H * 0.562);
      ctx.lineTo(W * 0.455, H * 0.562);
      ctx.moveTo(W * 0.400, H * 0.675);
      ctx.lineTo(W * 0.455, H * 0.675);
      ctx.stroke();

      // Bottom-left 10k pot + cap schematic
      ctx.beginPath();
      ctx.moveTo(W * 0.200, H * 0.875);
      ctx.lineTo(W * 0.200, H * 0.825);
      ctx.lineTo(W * 0.390, H * 0.825);
      ctx.moveTo(W * 0.404, H * 0.825);
      ctx.lineTo(W * 0.460, H * 0.825);
      ctx.lineTo(W * 0.460, H * 0.875);
      ctx.moveTo(W * 0.335, H * 0.825);
      ctx.lineTo(W * 0.335, H * 0.875);
      ctx.stroke();
      drawResistorSymbol(ctx, W * 0.268, H * 0.825, 58, 22);
      ctx.font = 'bold 16px "IBM Plex Sans", sans-serif';
      ctx.fillText('10K', W * 0.268, H * 0.862);
      drawCapSymbol(ctx, W * 0.397, H * 0.825, false, '100nF');

      // Right 4 test network blocks
      // 1: 10K / 1K
      ctx.beginPath();
      ctx.moveTo(W * 0.578, H * 0.190);
      ctx.lineTo(W * 0.848, H * 0.190);
      ctx.moveTo(W * 0.578, H * 0.265);
      ctx.lineTo(W * 0.848, H * 0.265);
      ctx.moveTo(W * 0.775, H * 0.190);
      ctx.lineTo(W * 0.775, H * 0.265);
      ctx.stroke();
      ctx.fillStyle = '#dba507';
      ctx.fillRect(W * 0.640, H * 0.174, 58, 30);
      drawResistorSymbol(ctx, W * 0.669, H * 0.190, 56, 22, '10K');
      ctx.fillStyle = '#dba507';
      ctx.fillRect(W * 0.761, H * 0.205, 28, 42);
      drawResistorSymbol(ctx, W * 0.775, H * 0.227, 26, 40, '1K');

      // 2: 1uF / 10uF
      ctx.beginPath();
      ctx.moveTo(W * 0.578, H * 0.355);
      ctx.lineTo(W * 0.664, H * 0.355);
      ctx.moveTo(W * 0.678, H * 0.355);
      ctx.lineTo(W * 0.848, H * 0.355);
      ctx.moveTo(W * 0.578, H * 0.432);
      ctx.lineTo(W * 0.848, H * 0.432);
      ctx.moveTo(W * 0.775, H * 0.355);
      ctx.lineTo(W * 0.775, H * 0.388);
      ctx.moveTo(W * 0.775, H * 0.402);
      ctx.lineTo(W * 0.775, H * 0.432);
      ctx.stroke();
      drawCapSymbol(ctx, W * 0.671, H * 0.355, false, '1µF');
      drawCapSymbol(ctx, W * 0.775, H * 0.395, true, '10µF');

      // 3: 10K//1nF + 1K//10uF
      ctx.beginPath();
      ctx.moveTo(W * 0.578, H * 0.525);
      ctx.lineTo(W * 0.848, H * 0.525);
      ctx.moveTo(W * 0.578, H * 0.602);
      ctx.lineTo(W * 0.848, H * 0.602);
      ctx.moveTo(W * 0.735, H * 0.525);
      ctx.lineTo(W * 0.735, H * 0.602);
      ctx.moveTo(W * 0.795, H * 0.525);
      ctx.lineTo(W * 0.795, H * 0.556);
      ctx.moveTo(W * 0.795, H * 0.570);
      ctx.lineTo(W * 0.795, H * 0.602);
      ctx.stroke();
      ctx.fillStyle = '#dba507';
      ctx.fillRect(W * 0.640, H * 0.510, 58, 28);
      drawResistorSymbol(ctx, W * 0.669, H * 0.525, 56, 22, '10K');
      ctx.fillStyle = '#dba507';
      ctx.fillRect(W * 0.722, H * 0.542, 26, 40);
      drawResistorSymbol(ctx, W * 0.735, H * 0.562, 24, 38, '1K');
      drawCapSymbol(ctx, W * 0.795, H * 0.563, true, '10µF', 'right');

      // 4: 10uF + D + 1K//2.2uF
      ctx.beginPath();
      ctx.moveTo(W * 0.578, H * 0.722);
      ctx.lineTo(W * 0.635, H * 0.722);
      ctx.moveTo(W * 0.648, H * 0.722);
      ctx.lineTo(W * 0.848, H * 0.722);
      ctx.moveTo(W * 0.578, H * 0.818);
      ctx.lineTo(W * 0.848, H * 0.818);
      ctx.moveTo(W * 0.735, H * 0.722);
      ctx.lineTo(W * 0.735, H * 0.818);
      ctx.moveTo(W * 0.795, H * 0.722);
      ctx.lineTo(W * 0.795, H * 0.762);
      ctx.moveTo(W * 0.795, H * 0.776);
      ctx.lineTo(W * 0.795, H * 0.818);
      ctx.stroke();
      drawCapSymbol(ctx, W * 0.642, H * 0.722, false, '10µF');
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.moveTo(W * 0.678, H * 0.706);
      ctx.lineTo(W * 0.678, H * 0.738);
      ctx.lineTo(W * 0.702, H * 0.722);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(W * 0.702, H * 0.706, 4, 32);
      ctx.font = 'bold 16px "IBM Plex Sans", sans-serif';
      ctx.fillText('D', W * 0.688, H * 0.762);
      ctx.fillStyle = '#dba507';
      ctx.fillRect(W * 0.722, H * 0.746, 26, 42);
      drawResistorSymbol(ctx, W * 0.735, H * 0.767, 24, 40, '1K');
      drawCapSymbol(ctx, W * 0.795, H * 0.769, true, '2.2µF', 'right');
      ctx.textAlign = 'left';
    });
  }

  if (kitId === 'thevenin') {
    return makeKitCanvas('kit_thevenin_v1', (ctx, W, H) => {
      ctx.fillStyle = '#d98200';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 16px "IBM Plex Sans", sans-serif';
      ctx.fillText('LAB.DASAR ITB', 56, 56);
      drawBadgeNumber(ctx, W, '22');
      ctx.font = 'bold 28px "IBM Plex Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('THEOREMA THEVENIN & NORTON', W * 0.54, 92);

      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 4;

      // 18V & POT box (wired clearly to terminals A-B and C-D)
      ctx.beginPath();
      ctx.moveTo(W * 0.232, H * 0.205);
      ctx.lineTo(W * 0.232, H * 0.228);
      ctx.moveTo(W * 0.232, H * 0.264);
      ctx.lineTo(W * 0.232, H * 0.285);
      ctx.moveTo(W * 0.408, H * 0.205);
      ctx.lineTo(W * 0.468, H * 0.205);
      ctx.moveTo(W * 0.408, H * 0.285);
      ctx.lineTo(W * 0.468, H * 0.285);
      ctx.stroke();
      ctx.font = 'bold 16px "IBM Plex Sans", sans-serif';
      ctx.fillText('18 V', W * 0.232, H * 0.252);
      ctx.fillText('A (+)', W * 0.270, H * 0.205);
      ctx.fillText('B (-)', W * 0.270, H * 0.285);
      ctx.strokeRect(W * 0.308, H * 0.168, W * 0.100, H * 0.135);
      ctx.fillText('POT 10K', W * 0.358, H * 0.288);
      ctx.fillText('C', W * 0.500, H * 0.205);
      ctx.fillText('D', W * 0.500, H * 0.285);

      // Bottom-left transistor / Zener schematic
      ctx.beginPath();
      ctx.moveTo(W * 0.232, H * 0.362);
      ctx.lineTo(W * 0.468, H * 0.362);
      ctx.moveTo(W * 0.232, H * 0.362);
      ctx.lineTo(W * 0.232, H * 0.805);
      ctx.moveTo(W * 0.232, H * 0.605);
      ctx.lineTo(W * 0.325, H * 0.605);
      ctx.lineTo(W * 0.325, H * 0.805);
      ctx.moveTo(W * 0.232, H * 0.805);
      ctx.lineTo(W * 0.468, H * 0.805);
      ctx.moveTo(W * 0.325, H * 0.478);
      ctx.lineTo(W * 0.382, H * 0.478);
      ctx.moveTo(W * 0.422, H * 0.440);
      ctx.lineTo(W * 0.468, H * 0.440);
      ctx.moveTo(W * 0.422, H * 0.542);
      ctx.lineTo(W * 0.422, H * 0.805);
      ctx.stroke();

      ctx.fillStyle = '#d98200';
      ctx.fillRect(W * 0.218, H * 0.430, 28, 60);
      drawResistorSymbol(ctx, W * 0.232, H * 0.460, 26, 56);
      ctx.fillStyle = '#111827';
      ctx.fillText('10K', W * 0.268, H * 0.465);

      ctx.fillStyle = '#d98200';
      ctx.fillRect(W * 0.218, H * 0.665, 28, 60);
      drawResistorSymbol(ctx, W * 0.232, H * 0.695, 26, 56);
      ctx.fillStyle = '#111827';
      ctx.fillText('2K7', W * 0.268, H * 0.700);
      ctx.fillText('6,2V', W * 0.358, H * 0.720);
      ctx.fillText('2N1613', W * 0.375, H * 0.425);
      ctx.fillText('GND', W * 0.358, H * 0.865);

      // Rangkaian N Black-Box
      ctx.strokeRect(W * 0.652, H * 0.285, W * 0.146, H * 0.155);
      ctx.font = 'bold 20px "IBM Plex Sans", sans-serif';
      ctx.fillText('Rangkaian', W * 0.725, H * 0.355);
      ctx.fillText('N', W * 0.725, H * 0.388);
      ctx.font = 'bold 16px "IBM Plex Sans", sans-serif';
      ctx.fillText('B', W * 0.655, H * 0.260);
      ctx.fillText('A', W * 0.798, H * 0.260);
      ctx.fillText('D', W * 0.655, H * 0.478);
      ctx.fillText('C', W * 0.798, H * 0.478);

      // Bottom 2k / 2k / 3k3 Load resistors
      ctx.beginPath();
      ctx.moveTo(W * 0.635, H * 0.640);
      ctx.lineTo(W * 0.824, H * 0.640);
      ctx.moveTo(W * 0.728, H * 0.578);
      ctx.lineTo(W * 0.728, H * 0.640);
      [0.635, 0.700, 0.762, 0.824].forEach((u) => {
        ctx.moveTo(W * u, H * 0.640);
        ctx.lineTo(W * u, H * 0.822);
      });
      ctx.stroke();

      [
        { u: 0.700, lbl: '2K' },
        { u: 0.762, lbl: '2K' },
        { u: 0.824, lbl: '3K3' },
      ].forEach((item) => {
        ctx.fillStyle = '#d98200';
        ctx.fillRect(W * item.u - 13, H * 0.680, 26, 62);
        drawResistorSymbol(ctx, W * item.u, H * 0.711, 24, 58);
        ctx.fillStyle = '#111827';
        ctx.font = 'bold 15px "IBM Plex Sans", sans-serif';
        ctx.fillText(item.lbl, W * item.u - 26, H * 0.718);
      });
      ctx.textAlign = 'left';
    });
  }

  // Kit 4: RANGKAIAN RL & RC
  return makeKitCanvas('kit_rl_rc_v1', (ctx, W, H) => {
    ctx.fillStyle = '#deb12c';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold 30px "IBM Plex Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('RANGKAIAN RL & RC', W * 0.5, 96);

    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 4;

    // Left vertical bus (u = 0.362) + Right vertical bus (u = 0.634) + Center bridge through OUT (0.498)
    ctx.beginPath();
    ctx.moveTo(W * 0.362, H * 0.340);
    ctx.lineTo(W * 0.362, H * 0.580);
    ctx.moveTo(W * 0.634, H * 0.340);
    ctx.lineTo(W * 0.634, H * 0.580);
    ctx.moveTo(W * 0.362, H * 0.460);
    ctx.lineTo(W * 0.634, H * 0.460);

    // 3 Left horizontal branches
    ctx.moveTo(W * 0.205, H * 0.340);
    ctx.lineTo(W * 0.278, H * 0.340);
    ctx.moveTo(W * 0.292, H * 0.340);
    ctx.lineTo(W * 0.362, H * 0.340);

    ctx.moveTo(W * 0.205, H * 0.460);
    ctx.lineTo(W * 0.278, H * 0.460);
    ctx.moveTo(W * 0.292, H * 0.460);
    ctx.lineTo(W * 0.362, H * 0.460);

    ctx.moveTo(W * 0.205, H * 0.580);
    ctx.lineTo(W * 0.362, H * 0.580);

    // 3 Right horizontal branches
    [0.340, 0.460, 0.580].forEach((vr) => {
      ctx.moveTo(W * 0.634, H * vr);
      ctx.lineTo(W * 0.790, H * vr);
    });

    // Bottom GND bar
    ctx.moveTo(W * 0.145, H * 0.795);
    ctx.lineTo(W * 0.852, H * 0.795);
    ctx.stroke();

    // Left Component Symbols
    drawCapSymbol(ctx, W * 0.285, H * 0.340, false);
    ctx.font = 'bold 20px "IBM Plex Sans", sans-serif';
    ctx.fillText('100nF', W * 0.285, H * 0.300);

    drawCapSymbol(ctx, W * 0.285, H * 0.460, false);
    ctx.fillText('8n2F', W * 0.285, H * 0.420);

    // Inductor coils 2,5mH
    ctx.fillStyle = '#deb12c';
    ctx.fillRect(W * 0.256, H * 0.562, 58, 30);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 3.8;
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const lx = W * 0.266 + k * 18;
      ctx.arc(lx, H * 0.580, 9, Math.PI, 0, false);
    }
    ctx.stroke();
    ctx.fillStyle = '#1f2937';
    ctx.fillText('2,5mH', W * 0.285, H * 0.540);

    // Center OUT text
    ctx.fillText('OUT', W * 0.498, H * 0.415);

    // Right Resistor boxes
    [
      { vr: 0.340, lbl: '1KΩ' },
      { vr: 0.460, lbl: '10KΩ' },
      { vr: 0.580, lbl: '100KΩ' },
    ].forEach((r) => {
      ctx.fillStyle = '#deb12c';
      ctx.fillRect(W * 0.678, H * r.vr - 16, 68, 32);
      drawResistorSymbol(ctx, W * 0.712, H * r.vr, 66, 28);
      ctx.fillStyle = '#1f2937';
      ctx.font = 'bold 20px "IBM Plex Sans", sans-serif';
      ctx.fillText(r.lbl, W * 0.712, H * r.vr - 24);
    });

    // GND label & website footer
    ctx.font = 'bold 20px "IBM Plex Sans", sans-serif';
    ctx.fillText('GND', W * 0.498, H * 0.875);
    ctx.font = 'bold 18px "IBM Plex Sans", sans-serif';
    ctx.fillText('http://labdasar.ee.itb.ac.id', W * 0.710, H * 0.925);
    ctx.textAlign = 'left';
  });
}
