import { describe, expect, it } from 'vitest';
import { computeXYViewport } from '../lcdRenderer';
import { getSoftKeyMenuView, handleSoftKeyPress, type MenuActionContext } from '../menus';
import { createInitialDS1000EState, openMenu, stepTimePerDiv, stepVoltsPerDiv } from '../state';

describe('Rigol DS1000E State & Softkey Menus', () => {
  const noopCtx: MenuActionContext = {
    exportBitmap: () => {},
    exportCSV: () => {},
    autoSetup: () => {},
    captureRef: () => {},
    saveInternalSlot: () => {},
    loadInternalSlot: () => {},
    resetFactory: () => createInitialDS1000EState(),
  };

  it('cycles CH1 Coupling, BW Limit, Probe attenuation (scaling V/div), and Page 1/2 -> 2/2', () => {
    let s = createInitialDS1000EState();
    expect(getSoftKeyMenuView(s).header).toBe('CH1');
    expect(s.ch1.coupling).toBe('DC');

    // F1: Coupling DC -> AC -> GND
    s = handleSoftKeyPress(s, 0, noopCtx);
    expect(s.ch1.coupling).toBe('AC');
    s = handleSoftKeyPress(s, 0, noopCtx);
    expect(s.ch1.coupling).toBe('GND');

    // F2: BW Limit toggle
    s = handleSoftKeyPress(s, 1, noopCtx);
    expect(s.ch1.bwLimit).toBe(true);

    // F3: Probe 1X -> 5X scales voltsPerDiv proportionally
    const vBefore = s.ch1.voltsPerDiv;
    s = handleSoftKeyPress(s, 2, noopCtx);
    expect(s.ch1.probe).toBe(5);
    expect(s.ch1.voltsPerDiv).toBeCloseTo(vBefore * 5, 4);

    // F5: Page 1/2 -> Page 2/2 -> Invert toggle
    s = handleSoftKeyPress(s, 4, noopCtx);
    expect(s.menuPage).toBe(1);
    expect(getSoftKeyMenuView(s).keys[2].label).toBe('Invert');
    s = handleSoftKeyPress(s, 2, noopCtx);
    expect(s.ch1.invert).toBe(true);
  });

  it('follows exact 1-2-5 Coarse sequence for Volts/Div and Time/Div', () => {
    const s = createInitialDS1000EState();
    s.ch1.voltsPerDiv = 1;
    // Clockwise (+1) zooms in (smaller V/div): 1 -> 0.5 -> 0.2 -> 0.1
    expect(stepVoltsPerDiv(s.ch1, 1)).toBe(0.5);
    // CCW (-1) zooms out (larger V/div): 1 -> 2 -> 5
    expect(stepVoltsPerDiv(s.ch1, -1)).toBe(2);

    // Time/div: 500 us -> CW (+1) -> 200 us; CCW (-1) -> 1 ms
    expect(stepTimePerDiv(5e-4, 1)).toBe(2e-4);
    expect(stepTimePerDiv(5e-4, -1)).toBe(1e-3);
  });

  it('centers & restores Y-T offsets when entering/leaving X-Y mode, guards Delayed Scan, and computes 1:1 square X-Y viewport', () => {
    let s = createInitialDS1000EState();
    s.ch1.offsetDiv = 1.5;
    s.ch2.offsetDiv = -1.8;
    s.ch2.enabled = false;
    s.math.enabled = true;
    s.horizontal.delayedScan = true;
    s = openMenu(s, 'HORIZ', 0);

    // Slot 2: Time Base Y-T -> X-Y
    s = handleSoftKeyPress(s, 2, noopCtx);
    expect(s.horizontal.timeBaseMode).toBe('X-Y');
    expect(s.ch1.enabled).toBe(true);
    expect(s.ch2.enabled).toBe(true);
    expect(s.ch1.offsetDiv).toBe(0);
    expect(s.ch2.offsetDiv).toBe(0);
    expect(s.math.enabled).toBe(false);
    expect(s.horizontal.delayedScan).toBe(false);
    expect(s.horizontal.savedYtOffsets).toEqual({ ch1: 1.5, ch2: -1.8 });

    // Slot 0 (Delayed) is locked N/A in X-Y mode
    expect(getSoftKeyMenuView(s).keys[0].value).toBe('N/A');
    s = handleSoftKeyPress(s, 0, noopCtx);
    expect(s.horizontal.delayedScan).toBe(false);

    // Slot 4 (X-Y Center) zeros offsets
    s.ch1.offsetDiv = 1.2;
    s.ch2.offsetDiv = -0.8;
    s = handleSoftKeyPress(s, 4, noopCtx);
    expect(s.ch1.offsetDiv).toBe(0);
    expect(s.ch2.offsetDiv).toBe(0);

    // Leaving X-Y (X-Y -> Roll) restores saved Y-T offsets
    s = handleSoftKeyPress(s, 2, noopCtx);
    expect(s.horizontal.timeBaseMode).toBe('Roll');
    expect(s.ch1.offsetDiv).toBe(1.5);
    expect(s.ch2.offsetDiv).toBe(-1.8);
    expect(s.horizontal.savedYtOffsets).toBeNull();

    // Square X-Y viewport has exact 1:1 aspect ratio with menu open OR closed
    const xyMenuOpen = computeXYViewport(24, 32, 488, 402, true);
    const xyMenuClosed = computeXYViewport(24, 32, 608, 402, true);
    expect(xyMenuOpen.w).toBe(xyMenuOpen.h);
    expect(xyMenuClosed.w).toBe(xyMenuClosed.h);
    expect(xyMenuOpen.w % 8).toBe(0);
    expect(xyMenuClosed.w % 8).toBe(0);
  });
});
