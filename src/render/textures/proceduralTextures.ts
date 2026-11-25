import * as THREE from 'three';

const cache = new Map<string, THREE.CanvasTexture>();

function makeCachedTexture(
  key: string,
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  srgb = true
): THREE.CanvasTexture {
  const existing = cache.get(key);
  if (existing) return existing;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, w, h);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
}

export function getButtonLabelTexture(
  text: string,
  bgColor = '#d4dde6',
  textColor = '#0f172a',
  borderColor = '#94a3b8'
): THREE.CanvasTexture {
  const key = `btn_v2_${text}_${bgColor}_${textColor}_${borderColor}`;
  return makeCachedTexture(key, 256, 128, (ctx, w, h) => {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, w - 8, h - 8);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);

    ctx.fillStyle = textColor;
    const lines = text.split('\n');
    const fontSize = lines.length > 1 ? 30 : text.length > 6 ? 33 : text.length > 3 ? 40 : 48;
    ctx.font = `bold ${fontSize}px "IBM Plex Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (lines.length === 1) {
      ctx.fillText(lines[0], w / 2, h / 2 + 2);
    } else {
      ctx.fillText(lines[0], w / 2, h * 0.34);
      ctx.fillText(lines[1], w / 2, h * 0.68);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  });
}

export function getESDMatTexture(): THREE.CanvasTexture {
  return makeCachedTexture('esd_mat', 1024, 512, (ctx, w, h) => {
    ctx.fillStyle = '#1b4137';
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 6500; i++) {
      const x = (i * 73) % w;
      const y = (i * 197) % h;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.04)';
      ctx.fillRect(x, y, 2, 2);
    }

    ctx.strokeStyle = 'rgba(209, 250, 229, 0.13)';
    ctx.lineWidth = 1;
    const step = 32;
    for (let x = step; x < w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 12);
      ctx.lineTo(x, h - 12);
      ctx.stroke();
    }
    for (let y = step; y < h; y += step) {
      ctx.beginPath();
      ctx.moveTo(12, y);
      ctx.lineTo(w - 12, y);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(209, 250, 229, 0.28)';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, w - 20, h - 20);

    ctx.fillStyle = '#eab308';
    ctx.beginPath();
    ctx.arc(38, h - 34, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(236, 253, 245, 0.68)';
    ctx.font = 'bold 12px "IBM Plex Mono", monospace';
    ctx.fillText('ESD SAFE MAT  10^7 OHM/SQ', 56, h - 30);
  });
}

export function getBenchWoodTexture(): THREE.CanvasTexture {
  return makeCachedTexture('bench_wood', 1024, 512, (ctx, w, h) => {
    ctx.fillStyle = '#d4c3a3';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 3) {
      const shade = Math.sin(y * 0.09) * 8 + Math.cos(y * 0.023) * 6;
      ctx.fillStyle = `rgba(${140 + shade}, ${115 + shade}, ${85 + shade}, 0.14)`;
      ctx.fillRect(0, y, w, 2);
    }
  });
}

export function getChassisGrainRoughnessMap(): THREE.CanvasTexture {
  return makeCachedTexture(
    'chassis_rough',
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#8c8c8c';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 4000; i++) {
        const x = (i * 53) % w;
        const y = (i * 131) % h;
        const v = 120 + ((i * 29) % 45);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(x, y, 2, 2);
      }
    },
    false
  );
}

/**
 * Exact 1:1 Rigol DS1052E photographic front-panel silkscreen (2048x988).
 */
export function getRigolFrontPanelTexture(): THREE.CanvasTexture {
  return makeCachedTexture('rigol_front_v6', 2048, 988, (ctx, W, H) => {
    // Base light warm-gray molded casing across full sheet (prevents dark transparent edges)
    ctx.fillStyle = '#e5e3dc';
    ctx.fillRect(0, 0, W, H);

    // Subtle soft ambient gradient on sloped screen funnel walls (u: 0.066..0.538, v: 0.144..0.814)
    const funnelGrad = ctx.createLinearGradient(0, H * 0.144, 0, H * 0.814);
    funnelGrad.addColorStop(0, '#c8c5bd');
    funnelGrad.addColorStop(0.15, '#dddbd4');
    funnelGrad.addColorStop(0.85, '#eae8e1');
    funnelGrad.addColorStop(1, '#d2d0c8');
    ctx.fillStyle = funnelGrad;
    roundRect(ctx, W * 0.066, H * 0.144, W * 0.472, H * 0.670, 14);
    ctx.fill();

    // Inner dark LCD bezel ring perimeter (around the open hole u: 0.0995..0.5045, v: 0.180..0.780)
    ctx.fillStyle = '#22262b';
    roundRect(ctx, W * 0.095, H * 0.175, W * 0.414, H * 0.610, 6);
    ctx.fill();

    // Vertical parting seam accent
    ctx.fillStyle = '#bab8b0';
    ctx.fillRect(W * 0.606, 0, W * 0.004, H);

    // 2. Right Control Polycarbonate Membrane Fascia (u = 0.610..0.985)
    ctx.fillStyle = '#dfe3e8';
    roundRect(ctx, W * 0.612, H * 0.022, W * 0.368, H * 0.956, 22);
    ctx.fill();
    ctx.strokeStyle = '#c5cbd3';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 3. Top-Left Yellow RIGOL Badge + DS1052E Branding (above screen funnel)
    ctx.fillStyle = '#f2c511';
    roundRect(ctx, W * 0.070, H * 0.064, W * 0.106, H * 0.060, 8);
    ctx.fill();
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 36px "IBM Plex Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('RIGOL', W * 0.123, H * 0.107);
    ctx.textAlign = 'left';

    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 26px "IBM Plex Sans", sans-serif';
    ctx.fillText('DS1052E', W * 0.188, H * 0.093);
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 13px "IBM Plex Sans", sans-serif';
    ctx.fillText('DIGITAL OSCILLOSCOPE', W * 0.188, H * 0.118);

    ctx.fillStyle = '#334155';
    ctx.font = 'bold 14px "IBM Plex Sans", sans-serif';
    ctx.fillText('2 Channel', W * 0.460, H * 0.090);
    ctx.font = 'bold 15px "IBM Plex Sans", sans-serif';
    ctx.fillText('50MHz 1GSa/s', W * 0.460, H * 0.114);

    // Subtle emboss label above round MENU ON/OFF button
    ctx.fillStyle = '#a8a59e';
    ctx.font = 'bold 11px "IBM Plex Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MENU', W * 0.570, H * 0.156);
    ctx.fillText('ON/OFF', W * 0.570, H * 0.172);
    ctx.textAlign = 'left';

    // 4. Crisp gray horizontal lines linking screen rim to 5 softkeys (slots 0..4)
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 2;
    for (let s = 0; s < 5; s++) {
      const sy = H * (0.2723 + s * 0.1026);
      ctx.beginPath();
      ctx.moveTo(W * 0.526, sy);
      ctx.lineTo(W * 0.556, sy);
      ctx.stroke();
    }

    // 5. Multi-Function Knob Area (maroon curved arrow + push/print icon)
    ctx.strokeStyle = '#9b2c2c';
    ctx.fillStyle = '#9b2c2c';
    ctx.lineWidth = 3.2;
    const rx = W * 0.635;
    const ry = H * 0.125;
    ctx.beginPath();
    ctx.arc(rx, ry, 14, -Math.PI * 0.2, Math.PI * 1.35);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rx + 17, ry - 4);
    ctx.lineTo(rx + 9, ry - 11);
    ctx.lineTo(rx + 18, ry - 13);
    ctx.closePath();
    ctx.fill();

    // Small push/print icon next to Multi knob
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.strokeRect(W * 0.650, H * 0.168, 14, 9);
    ctx.beginPath();
    ctx.moveTo(W * 0.657, H * 0.152);
    ctx.lineTo(W * 0.657, H * 0.165);
    ctx.stroke();

    // 6. Signature Rigol Blue Section Boxes & Top Accent Strips
    drawRigolBlueBox(ctx, W * 0.672, H * 0.068, W * 0.156, H * 0.232, 'MENU');
    drawRigolBlueBox(ctx, W * 0.834, H * 0.068, W * 0.132, H * 0.232, 'RUN CONTROL');
    drawRigolBlueBox(ctx, W * 0.618, H * 0.316, W * 0.156, H * 0.422, 'VERTICAL');
    drawRigolBlueBox(ctx, W * 0.778, H * 0.316, W * 0.098, H * 0.422, 'HORIZONTAL');
    drawRigolBlueBox(ctx, W * 0.880, H * 0.316, W * 0.086, H * 0.422, 'TRIGGER');

    // VERTICAL dark trace bus linking CH1, CH2, MATH, REF to OFF & SCALE
    ctx.strokeStyle = '#4b5563';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(W * 0.672, H * 0.395);
    ctx.quadraticCurveTo(W * 0.686, H * 0.395, W * 0.686, H * 0.440);
    ctx.lineTo(W * 0.686, H * 0.600);
    ctx.quadraticCurveTo(W * 0.686, H * 0.644, W * 0.672, H * 0.644);
    ctx.moveTo(W * 0.672, H * 0.478);
    ctx.lineTo(W * 0.686, H * 0.478);
    ctx.moveTo(W * 0.672, H * 0.561);
    ctx.lineTo(W * 0.686, H * 0.561);
    ctx.moveTo(W * 0.686, H * 0.528);
    ctx.lineTo(W * 0.706, H * 0.528);
    ctx.stroke();

    ctx.fillStyle = '#334155';
    ctx.textAlign = 'center';

    // VERTICAL labels & thick pale-blue swooping V..mV arc
    ctx.font = 'bold 13px "IBM Plex Sans", sans-serif';
    ctx.fillText('POSITION', W * 0.728, H * 0.362);
    ctx.fillText('SCALE', W * 0.728, H * 0.578);
    drawPaleBlueSwoopArc(ctx, W * 0.728, H * 0.652, 54);
    ctx.fillStyle = '#334155';
    ctx.font = 'bold 12px "IBM Plex Sans", sans-serif';
    ctx.fillText('V', W * 0.694, H * 0.726);
    ctx.fillText('mV', W * 0.758, H * 0.726);
    ctx.font = '10px "IBM Plex Sans", sans-serif';
    ctx.fillText('Zero', W * 0.761, H * 0.460);
    ctx.fillText('Vernier', W * 0.760, H * 0.616);

    // HORIZONTAL labels & pale-blue S..nS arc
    ctx.font = 'bold 13px "IBM Plex Sans", sans-serif';
    ctx.fillText('POSITION', W * 0.824, H * 0.362);
    ctx.fillText('SCALE', W * 0.824, H * 0.578);
    drawPaleBlueSwoopArc(ctx, W * 0.824, H * 0.652, 54);
    ctx.fillStyle = '#334155';
    ctx.font = 'bold 12px "IBM Plex Sans", sans-serif';
    ctx.fillText('S', W * 0.798, H * 0.724);
    ctx.fillText('nS', W * 0.851, H * 0.724);
    ctx.font = '10px "IBM Plex Sans", sans-serif';
    ctx.fillText('Zero', W * 0.858, H * 0.460);
    ctx.fillText('Delayed', W * 0.857, H * 0.616);

    // TRIGGER labels
    ctx.font = 'bold 13px "IBM Plex Sans", sans-serif';
    ctx.fillText('LEVEL', W * 0.916, H * 0.362);
    ctx.font = '10px "IBM Plex Sans", sans-serif';
    ctx.fillText('Zero', W * 0.949, H * 0.460);
    ctx.fillText('Local', W * 0.950, H * 0.695);

    // 7. Bottom I/O Strip: Flanking Yellow/Cyan bars + X/Y + CAT II Warning + Comp Icons
    ctx.fillStyle = '#f2c511';
    ctx.fillRect(W * 0.625, H * 0.772, W * 0.020, 4);
    ctx.fillRect(W * 0.685, H * 0.772, W * 0.020, 4);
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 17px "IBM Plex Sans", sans-serif';
    ctx.fillText('CH 1', W * 0.665, H * 0.779);
    ctx.fillText('X', W * 0.620, H * 0.864);

    ctx.fillStyle = '#24b6e6';
    ctx.fillRect(W * 0.722, H * 0.772, W * 0.020, 4);
    ctx.fillRect(W * 0.782, H * 0.772, W * 0.020, 4);
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 17px "IBM Plex Sans", sans-serif';
    ctx.fillText('CH 2', W * 0.762, H * 0.779);
    ctx.fillText('Y', W * 0.717, H * 0.864);

    ctx.font = 'bold 16px "IBM Plex Sans", sans-serif';
    ctx.fillText('EXT TRIG', W * 0.860, H * 0.779);

    // Warning triangle + Input Rating between CH2 & EXT TRIG
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(W * 0.811, H * 0.814);
    ctx.lineTo(W * 0.821, H * 0.838);
    ctx.lineTo(W * 0.801, H * 0.838);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = '#334155';
    ctx.font = 'bold 12px "IBM Plex Sans", sans-serif';
    ctx.fillText('!', W * 0.811, H * 0.835);

    ctx.font = 'bold 10px "IBM Plex Sans", sans-serif';
    ctx.fillText('All Inputs', W * 0.811, H * 0.858);
    ctx.fillText('1MΩ//15pF', W * 0.811, H * 0.876);
    ctx.fillText('300V RMS', W * 0.811, H * 0.894);
    ctx.fillText('CAT II', W * 0.811, H * 0.912);

    // Probe Comp graphic icons right of vertical lug slot (square wave top + GND bottom)
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2.2;
    const sqx = W * 0.949;
    const sqy = H * 0.840;
    ctx.beginPath();
    ctx.moveTo(sqx - 10, sqy);
    ctx.lineTo(sqx - 10, sqy - 10);
    ctx.lineTo(sqx + 2, sqy - 10);
    ctx.lineTo(sqx + 2, sqy);
    ctx.lineTo(sqx + 12, sqy);
    ctx.stroke();

    const gx = W * 0.950;
    const gy = H * 0.885;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx, gy + 8);
    ctx.moveTo(gx - 9, gy + 8);
    ctx.lineTo(gx + 9, gy + 8);
    ctx.moveTo(gx - 6, gy + 13);
    ctx.lineTo(gx + 6, gy + 13);
    ctx.moveTo(gx - 2, gy + 18);
    ctx.lineTo(gx + 2, gy + 18);
    ctx.stroke();

    ctx.textAlign = 'left';
  });
}

function drawRigolBlueBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string
): void {
  ctx.strokeStyle = '#3c78be';
  ctx.lineWidth = 2.5;
  roundRect(ctx, x, y, w, h, 14);
  ctx.stroke();

  // Top blue accent stripe shoulders
  ctx.fillStyle = '#3c78be';
  const tw = ctx.measureText(title).width + 24;
  ctx.font = 'bold 14px "IBM Plex Sans", sans-serif';
  const measured = ctx.measureText(title).width + 18;
  const barGap = Math.max(tw * 0.5, measured);
  ctx.fillRect(x + 16, y - 4, Math.max(8, w / 2 - barGap / 2 - 18), 8);
  ctx.fillRect(x + w / 2 + barGap / 2 + 2, y - 4, Math.max(8, w / 2 - barGap / 2 - 18), 8);

  ctx.fillStyle = '#dfe3e8';
  ctx.fillRect(x + w / 2 - measured / 2, y - 9, measured, 18);
  ctx.fillStyle = '#255da3';
  ctx.textAlign = 'center';
  ctx.fillText(title, x + w / 2, y + 5);
  ctx.textAlign = 'left';
}

function drawPaleBlueSwoopArc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.save();
  ctx.strokeStyle = '#89b4e0';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 0.58, Math.PI * 0.92);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 0.08, Math.PI * 0.42);
  ctx.stroke();
  ctx.restore();
}

export function getRigolRearTexture(): THREE.CanvasTexture {
  return makeCachedTexture('rigol_rear_v2', 1024, 512, (ctx, W, H) => {
    ctx.fillStyle = '#d4d0c7';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#9ca3af';
    ctx.font = 'bold 88px "IBM Plex Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('RIGOL', W / 2, H * 0.36);
    ctx.fillStyle = '#334155';
    ctx.font = 'bold 16px "IBM Plex Mono", monospace';
    ctx.fillText('DS1052E  |  100-240VAC 45-440Hz 50VA MAX', W / 2, H * 0.50);
    ctx.font = '14px "IBM Plex Mono", monospace';
    ctx.fillText('PASS/FAIL OUT          RS232          USB DEVICE', W * 0.60, H * 0.64);
    ctx.textAlign = 'left';
  });
}

export function getSignalGenFaceplateTexture(): THREE.CanvasTexture {
  return makeCachedTexture('gen_face_v1', 1024, 460, (ctx, W, H) => {
    ctx.fillStyle = '#363d47';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 20px "IBM Plex Sans", sans-serif';
    ctx.fillText('FUNCTION GENERATOR  FG-2101', 26, 36);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 15px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('FREQ', W * 0.16, H * 0.87);
    ctx.fillText('AMPL', W * 0.36, H * 0.87);
    ctx.fillText('OFFSET', W * 0.55, H * 0.87);
    ctx.fillText('50Ω OUT', W * 0.77, H * 0.87);
    ctx.fillText('GND', W * 0.90, H * 0.87);
    ctx.textAlign = 'left';
  });
}

export function getPsuFaceplateTexture(): THREE.CanvasTexture {
  return makeCachedTexture('psu_face_v1', 1024, 576, (ctx, W, H) => {
    ctx.fillStyle = '#293038';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 22px "IBM Plex Sans", sans-serif';
    ctx.fillText('DUAL DC POWER SUPPLY', 28, 36);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 16px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CH1 V', W * 0.22, H * 0.69);
    ctx.fillText('CH2 V', W * 0.78, H * 0.69);
    ctx.fillStyle = '#f87171';
    ctx.fillText('+', W * 0.13, H * 0.94);
    ctx.fillText('+', W * 0.70, H * 0.94);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('-', W * 0.30, H * 0.94);
    ctx.fillText('-', W * 0.87, H * 0.94);
    ctx.fillStyle = '#4ade80';
    ctx.fillText('GND', W * 0.50, H * 0.94);
    ctx.textAlign = 'left';
  });
}

export function getBreadboardTopTexture(): THREE.CanvasTexture {
  return makeCachedTexture('bb_top_v1', 1024, 340, (ctx, W, H) => {
    ctx.fillStyle = '#f4f2ec';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#dc2626';
    ctx.fillRect(24, 14, W - 48, 4);
    ctx.fillStyle = '#2563eb';
    ctx.fillRect(24, 50, W - 48, 4);

    ctx.fillStyle = '#dc2626';
    ctx.fillRect(24, H - 54, W - 48, 4);
    ctx.fillStyle = '#2563eb';
    ctx.fillRect(24, H - 18, W - 48, 4);

    ctx.fillStyle = '#e2dfd7';
    ctx.fillRect(14, H / 2 - 11, W - 28, 22);

    ctx.fillStyle = '#475569';
    ctx.font = 'bold 12px "IBM Plex Mono", monospace';
    for (let c = 1; c <= 63; c += 5) {
      const x = 36 + ((c - 1) / 62) * (W - 72);
      ctx.fillText(String(c), x - 4, 72);
    }
  });
}

export function getLabWhiteboardTexture(): THREE.CanvasTexture {
  return makeCachedTexture('lab_whiteboard_v1', 1024, 512, (ctx, W, H) => {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#1e3a8a';
    ctx.font = 'bold 28px "IBM Plex Sans", sans-serif';
    ctx.fillText('LDTE STEI ITB  |  EL-2101 RANGKAIAN ELEKTRIK', 40, 56);

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(40, 74);
    ctx.lineTo(W - 40, 74);
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.font = '22px "IBM Plex Mono", monospace';
    ctx.fillText('Thevenin:  I = VT / (RT + RL)', 50, 140);
    ctx.fillText('RC Transient:  tau = R * C   |   fo = 1 / (2*pi*R*C)', 50, 195);
    ctx.fillText('RLC Resonansi:  fo = 1 / (2*pi*sqrt(L*C))', 50, 250);
    ctx.fillText('Rigol DS1052E:  1MOhm // 15pF  |  Probe Comp 3Vpp 1kHz', 50, 305);

    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= 200; i++) {
      const x = 680 + i * 1.4;
      const y = 390 - Math.sin((i / 200) * Math.PI * 4) * 55;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
