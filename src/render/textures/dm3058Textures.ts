import * as THREE from 'three';

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

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function getDM3058FrontPanelTexture(): THREE.CanvasTexture {
  return makeTex('dm3058_front_v2', 2048, 944, (ctx, W, H) => {
    // Base pale cool-gray polycarbonate fascia on right
    ctx.fillStyle = '#e7eaee';
    ctx.fillRect(0, 0, W, H);

    // Molded light warm-gray left enclosure region + curved contour lip matching dm3058_front.png
    ctx.fillStyle = '#e0ddd4';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(W * 0.600, 0);
    ctx.bezierCurveTo(W * 0.592, H * 0.25, W * 0.588, H * 0.55, W * 0.584, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();

    // Subtle contoured shadow line between left molded shell & right fascia
    ctx.strokeStyle = '#b4b8bf';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(W * 0.600, 0);
    ctx.bezierCurveTo(W * 0.592, H * 0.25, W * 0.588, H * 0.55, W * 0.584, H);
    ctx.stroke();

    // Inner LCD sculpted frame shading
    roundRect(ctx, W * 0.112, H * 0.198, W * 0.472, H * 0.324, 14);
    ctx.strokeStyle = '#bab7ae';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = '#11161f';
    ctx.fillRect(W * 0.128, H * 0.234, W * 0.440, H * 0.244);

    // Subtle embossed USB trident icon beside vertical USB Host slot (u ~ 0.088, v ~ 0.355)
    ctx.save();
    ctx.strokeStyle = '#9b9a94';
    ctx.fillStyle = '#9b9a94';
    ctx.lineWidth = 2.6;
    const ux = W * 0.089;
    const uy = H * 0.355;
    ctx.beginPath();
    ctx.moveTo(ux, uy + 24);
    ctx.lineTo(ux, uy - 24);
    ctx.moveTo(ux, uy + 10);
    ctx.lineTo(ux - 11, uy - 1);
    ctx.lineTo(ux - 11, uy - 11);
    ctx.moveTo(ux, uy + 2);
    ctx.lineTo(ux + 11, uy - 9);
    ctx.lineTo(ux + 11, uy - 15);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ux, uy + 26, 4.2, 0, Math.PI * 2);
    ctx.arc(ux - 11, uy - 13, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(ux + 8, uy - 19, 6, 6);
    ctx.restore();

    // Top-left RIGOL yellow pill badge & instrument model title
    roundRect(ctx, W * 0.114, H * 0.056, W * 0.124, H * 0.072, 9);
    ctx.fillStyle = '#e5c52b';
    ctx.fill();
    ctx.fillStyle = '#111827';
    ctx.font = '900 48px "IBM Plex Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('RIGOL', W * 0.176, H * 0.094);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold 21px "IBM Plex Sans", sans-serif';
    ctx.fillText('DM3058', W * 0.248, H * 0.074);
    ctx.font = 'bold 20px "IBM Plex Sans", sans-serif';
    ctx.fillText('DIGITAL MULTIMETER', W * 0.248, H * 0.112);

    ctx.font = 'italic 900 32px "IBM Plex Serif", serif';
    ctx.fillText('LXI', W * 0.458, H * 0.104);
    ctx.font = '600 24px "IBM Plex Sans", sans-serif';
    ctx.fillText('5½ Digits', W * 0.500, H * 0.104);

    // Embossed separator ticks between LCD bottom & 6 softkeys
    ctx.strokeStyle = '#c4c1b7';
    ctx.lineWidth = 3;
    for (let i = 1; i < 6; i++) {
      const sx = W * (0.130 + (i * 0.436) / 6);
      ctx.beginPath();
      ctx.moveTo(sx, H * 0.518);
      ctx.lineTo(sx, H * 0.625);
      ctx.stroke();
    }

    // Medium cool-gray 2x5 keypad frame bezel + dark navy col-6 bezel
    roundRect(ctx, W * 0.128, H * 0.642, W * 0.362, H * 0.275, 16);
    ctx.fillStyle = '#8b939d';
    ctx.fill();
    roundRect(ctx, W * 0.494, H * 0.642, W * 0.072, H * 0.275, 16);
    ctx.fillStyle = '#32486c';
    ctx.fill();

    // Right fascia: Local label + Amber collars around Run/Hold & Single
    ctx.fillStyle = '#334155';
    ctx.font = 'bold 18px "IBM Plex Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Local', W * 0.722, H * 0.155);

    for (const bx of [0.642, 0.722]) {
      roundRect(ctx, W * (bx - 0.036), H * 0.194, W * 0.072, H * 0.102, 22);
      ctx.fillStyle = '#ea9d1a';
      ctx.fill();
    }

    // D-pad backing circle + Range+ / Range-
    ctx.fillStyle = '#c7cdd6';
    ctx.beginPath();
    ctx.arc(W * 0.682, H * 0.495, W * 0.058, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 18px "IBM Plex Sans", sans-serif';
    ctx.fillText('Range+', W * 0.682, H * 0.365);
    ctx.fillText('Range-', W * 0.682, H * 0.628);

    // 2x3 Steel-blue collars for Meas / Math / Trig / Help / Save / Utility
    for (const cx of [0.625, 0.682, 0.739]) {
      for (const cy of [0.715, 0.840]) {
        roundRect(ctx, W * (cx - 0.0265), H * (cy - 0.048), W * 0.053, H * 0.096, 14);
        ctx.fillStyle = '#6f8eb3';
        ctx.fill();
      }
    }

    // Far-right 5 Safety Input Terminals silkscreen
    ctx.fillStyle = '#111827';
    ctx.textAlign = 'center';
    ctx.font = 'bold 19px "IBM Plex Sans", sans-serif';
    ctx.fillText('Sense', W * 0.816, H * 0.145);
    ctx.font = 'bold 17px "IBM Plex Mono", monospace';
    ctx.fillText('Ω 4W', W * 0.816, H * 0.180);

    ctx.font = 'bold 19px "IBM Plex Sans", sans-serif';
    ctx.fillText('Input', W * 0.896, H * 0.165);
    ctx.font = 'bold 15px "IBM Plex Mono", monospace';
    ctx.fillText('V Ω •))) +|', W * 0.896, H * 0.198);

    // Terminal polarity labels + ratings
    ctx.font = 'bold 19px "IBM Plex Sans", sans-serif';
    ctx.fillText('HI', W * 0.774, H * 0.305);
    ctx.fillText('LO', W * 0.774, H * 0.505);
    ctx.fillText('HI', W * 0.955, H * 0.305);
    ctx.fillText('LO', W * 0.955, H * 0.505);
    ctx.fillText('I', W * 0.955, H * 0.695);

    // Lightning warning bolt beside Input HI
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(W * 0.952, H * 0.215);
    ctx.lineTo(W * 0.944, H * 0.242);
    ctx.lineTo(W * 0.954, H * 0.242);
    ctx.lineTo(W * 0.946, H * 0.268);
    ctx.stroke();

    // 200V Max & 1000V Max badges between upper & lower jacks
    ctx.font = 'bold 14px "IBM Plex Sans", sans-serif';
    ctx.fillText('200V', W * 0.863, H * 0.398);
    ctx.fillText('Max', W * 0.863, H * 0.424);
    ctx.fillText('1000V', W * 0.956, H * 0.398);
    ctx.fillText('Max', W * 0.956, H * 0.424);

    // 500Vpk Max + earth ground under Sense LO
    ctx.fillText('500Vpk', W * 0.863, H * 0.592);
    ctx.fillText('Max', W * 0.863, H * 0.618);
    ctx.beginPath();
    ctx.moveTo(W * 0.863, H * 0.628);
    ctx.lineTo(W * 0.863, H * 0.642);
    ctx.moveTo(W * 0.854, H * 0.642);
    ctx.lineTo(W * 0.872, H * 0.642);
    ctx.moveTo(W * 0.857, H * 0.650);
    ctx.lineTo(W * 0.869, H * 0.650);
    ctx.moveTo(W * 0.860, H * 0.658);
    ctx.lineTo(W * 0.866, H * 0.658);
    ctx.stroke();

    // 10A RMS label between Input LO & Input I
    ctx.fillText('10A', W * 0.956, H * 0.595);
    ctx.fillText('RMS', W * 0.956, H * 0.620);

    // Bottom Fuse & CAT rating block
    ctx.font = 'bold 14px "IBM Plex Sans", sans-serif';
    ctx.fillText('Fused on', W * 0.892, H * 0.778);
    ctx.fillText('Rear Panel', W * 0.892, H * 0.802);

    // Warning triangle + CAT ratings
    ctx.beginPath();
    ctx.moveTo(W * 0.796, H * 0.835);
    ctx.lineTo(W * 0.783, H * 0.873);
    ctx.lineTo(W * 0.809, H * 0.873);
    ctx.closePath();
    ctx.stroke();
    ctx.font = 'bold 16px "IBM Plex Sans", sans-serif';
    ctx.fillText('!', W * 0.796, H * 0.859);

    ctx.textAlign = 'left';
    ctx.font = 'bold 14px "IBM Plex Sans", sans-serif';
    ctx.fillText('CAT I (1000V)', W * 0.818, H * 0.844);
    ctx.fillText('CAT II (600V)', W * 0.818, H * 0.872);
  });
}

export function getDM3058KeyTexture(
  keyKind: string,
  bgColor = '#d2d7de',
  textColor = '#0f172a',
  borderColor = '#9aa3af'
): THREE.CanvasTexture {
  return makeTex(`dm3058_key_v1_${keyKind}_${bgColor}_${textColor}`, 192, 112, (ctx, W, H) => {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, W - 8, H - 8);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, W - 3, H - 3);

    ctx.fillStyle = textColor;
    ctx.strokeStyle = textColor;
    ctx.lineWidth = 4;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const drawDCBars = (x: number, y: number) => {
      ctx.beginPath();
      ctx.moveTo(x - 16, y - 5);
      ctx.lineTo(x + 16, y - 5);
      for (const dx of [-16, -4, 8]) {
        ctx.moveTo(x + dx, y + 6);
        ctx.lineTo(x + dx + 8, y + 6);
      }
      ctx.stroke();
    };

    const drawSineWave = (x: number, y: number) => {
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) {
        const px = x - 16 + (i / 24) * 32;
        const py = y - Math.sin((i / 24) * Math.PI * 2) * 8;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    };

    switch (keyKind) {
      case 'DCV':
        drawDCBars(W * 0.36, H * 0.50);
        ctx.font = 'bold 42px "IBM Plex Sans", sans-serif';
        ctx.fillText('V', W * 0.68, H * 0.52);
        break;
      case 'ACV':
        drawSineWave(W * 0.36, H * 0.50);
        ctx.font = 'bold 42px "IBM Plex Sans", sans-serif';
        ctx.fillText('V', W * 0.68, H * 0.52);
        break;
      case 'DCI':
        drawDCBars(W * 0.38, H * 0.50);
        ctx.font = 'bold 42px "IBM Plex Sans", sans-serif';
        ctx.fillText('I', W * 0.66, H * 0.52);
        break;
      case 'ACI':
        drawSineWave(W * 0.38, H * 0.50);
        ctx.font = 'bold 42px "IBM Plex Sans", sans-serif';
        ctx.fillText('I', W * 0.66, H * 0.52);
        break;
      case 'OHM':
        ctx.font = 'bold 48px "IBM Plex Sans", sans-serif';
        ctx.fillText('Ω', W * 0.5, H * 0.52);
        break;
      case 'CAP':
        ctx.beginPath();
        ctx.moveTo(W * 0.24, H * 0.5);
        ctx.lineTo(W * 0.44, H * 0.5);
        ctx.moveTo(W * 0.44, H * 0.28);
        ctx.lineTo(W * 0.44, H * 0.72);
        ctx.moveTo(W * 0.56, H * 0.28);
        ctx.lineTo(W * 0.56, H * 0.72);
        ctx.moveTo(W * 0.56, H * 0.5);
        ctx.lineTo(W * 0.76, H * 0.5);
        ctx.stroke();
        break;
      case 'CONT':
        ctx.beginPath();
        ctx.arc(W * 0.33, H * 0.5, 5, 0, Math.PI * 2);
        ctx.fill();
        for (const r of [14, 24, 34]) {
          ctx.beginPath();
          ctx.arc(W * 0.33, H * 0.5, r, -0.58, 0.58);
          ctx.stroke();
        }
        break;
      case 'DIODE':
        ctx.beginPath();
        ctx.moveTo(W * 0.22, H * 0.5);
        ctx.lineTo(W * 0.40, H * 0.5);
        ctx.moveTo(W * 0.58, H * 0.5);
        ctx.lineTo(W * 0.78, H * 0.5);
        ctx.moveTo(W * 0.58, H * 0.28);
        ctx.lineTo(W * 0.58, H * 0.72);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(W * 0.40, H * 0.28);
        ctx.lineTo(W * 0.40, H * 0.72);
        ctx.lineTo(W * 0.58, H * 0.50);
        ctx.closePath();
        ctx.fill();
        break;
      case 'SECOND':
        ctx.font = 'bold 28px "IBM Plex Mono", monospace';
        ctx.fillText('2ND', W * 0.5, H * 0.33);
        ctx.beginPath();
        ctx.moveTo(W * 0.20, H * 0.52);
        ctx.lineTo(W * 0.80, H * 0.52);
        ctx.moveTo(W * 0.42, H * 0.70);
        ctx.lineTo(W * 0.68, H * 0.70);
        ctx.moveTo(W * 0.58, H * 0.70);
        ctx.lineTo(W * 0.58, H * 0.82);
        ctx.moveTo(W * 0.66, H * 0.70);
        ctx.lineTo(W * 0.66, H * 0.80);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(W * 0.35, H * 0.70, 9, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'RUN_HOLD':
        ctx.font = 'bold 26px "IBM Plex Sans", sans-serif';
        ctx.fillText('Run', W * 0.5, H * 0.32);
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(W * 0.16, H * 0.51);
        ctx.lineTo(W * 0.84, H * 0.51);
        ctx.stroke();
        ctx.fillStyle = textColor;
        ctx.fillText('Hold', W * 0.5, H * 0.71);
        break;
      case 'POWER':
        ctx.strokeStyle = textColor;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(W * 0.5, H * 0.52, 24, -Math.PI * 0.25, Math.PI * 1.25);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(W * 0.5, H * 0.20);
        ctx.lineTo(W * 0.5, H * 0.52);
        ctx.stroke();
        break;
      default: {
        const display =
          keyKind === 'FREQ'
            ? 'Freq'
            : keyKind === 'SENSOR'
              ? 'Sensor'
              : keyKind === 'PRESET'
                ? 'Preset'
                : keyKind === 'SINGLE'
                  ? 'Single'
                  : keyKind === 'AUTO'
                    ? 'Auto'
                    : keyKind.charAt(0) + keyKind.slice(1).toLowerCase();
        ctx.font = `bold ${display.length > 5 ? 30 : 34}px "IBM Plex Sans", sans-serif`;
        ctx.fillText(display, W * 0.5, H * 0.52);
      }
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  });
}

export function getDM3058SideTexture(): THREE.CanvasTexture {
  return makeTex('dm3058_side_v1', 512, 256, (ctx, W, H) => {
    ctx.fillStyle = '#dde1e6';
    ctx.fillRect(0, 0, W, H);
    // Horizontal molding seams
    ctx.strokeStyle = '#c4c9d0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 14);
    ctx.lineTo(W, 14);
    ctx.moveTo(0, H - 14);
    ctx.lineTo(W, H - 14);
    ctx.stroke();

    // 4x10 Perforated ventilation louver grid matching dm3058_oblique.jpg
    ctx.fillStyle = '#535a65';
    for (let col = 0; col < 10; col++) {
      for (let row = 0; row < 4; row++) {
        ctx.fillRect(150 + col * 19, 82 + row * 22, 12, 13);
      }
    }
  });
}

export function getDM3058RearTexture(): THREE.CanvasTexture {
  return makeTex('dm3058_rear_v1', 1024, 480, (ctx, W, H) => {
    ctx.fillStyle = '#cfd4dc';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 4;
    ctx.strokeRect(18, 18, W - 36, H - 36);

    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 26px "IBM Plex Sans", sans-serif';
    ctx.fillText('RIGOL DM3058   LXI   5½ Digits', 48, 66);

    // AC Inlet & 10A 250V Fuse holder
    ctx.fillStyle = '#18181b';
    ctx.fillRect(720, 260, 180, 130);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(755, 315, 22, 34);
    ctx.fillRect(800, 290, 22, 34);
    ctx.fillRect(845, 315, 22, 34);
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 16px "IBM Plex Mono", monospace';
    ctx.fillText('100-240V ~ 50/60Hz', 715, 245);

    // Rear LXI / USB / RS232 / Ext Trig labels
    for (const [label, x, w] of [
      ['LAN (LXI)', 80, 140],
      ['GPIB IEEE-488', 260, 190],
      ['RS-232', 490, 140],
    ] as const) {
      ctx.fillStyle = '#334155';
      ctx.fillRect(x, 150, w, 90);
      ctx.fillStyle = '#0f172a';
      ctx.fillText(label, x, 135);
    }
    ctx.fillStyle = '#18181b';
    ctx.beginPath();
    ctx.arc(880, 160, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText('10A 250V FUSE', 820, 120);
  });
}
