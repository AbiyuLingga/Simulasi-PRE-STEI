import { beforeEach, describe, expect, it } from 'vitest';
import {
  computePlacementPreview,
  floatingJumperSocketId,
  getConnectedStripHoles,
  getOccupiedHoles,
  getPartPins,
  holeIdToLocalPos,
  movePartToAnchor,
  nearestHoleFromLocalXZ,
  rotatePart90,
} from '../breadboard/breadboardModel';
import { runSimulationStep } from '../worker/circuit.worker';
import { hotRefs } from '../../state/hotRefs';
import { useLabStore } from '../../state/labStore';
import { getTutorialById, isWireStepSatisfied, type WireTutorialStep } from '../../tutorials/moduleTutorials';

describe('CRUMB-Style Breadboard Engine & Store', () => {
  beforeEach(() => {
    useLabStore.getState().applyBreadboardPreset('starter');
  });

  it('returns exact 5-hole terminal strips and 50-hole power rails', () => {
    expect(getConnectedStripHoles('t_14_c').sort()).toEqual(['t_14_a', 't_14_b', 't_14_c', 't_14_d', 't_14_e']);
    expect(getConnectedStripHoles('b_22_h')).toEqual(['b_22_f', 'b_22_g', 'b_22_h', 'b_22_i', 'b_22_j']);
    const topPos = getConnectedStripHoles('tp_12');
    expect(topPos).toHaveLength(50);
    expect(topPos[0]).toBe('tp_0');
    expect(topPos[49]).toBe('tp_49');
  });

  it('round-trips nearestHoleFromLocalXZ across all power rail blocks without drift', () => {
    for (const h of ['tp_0', 'tp_14', 'tp_28', 'tp_49', 'bn_7', 'bp_33', 't_1_a', 't_32_e', 'b_63_j']) {
      const [lx, , lz] = holeIdToLocalPos(h);
      expect(nearestHoleFromLocalXZ(lx, lz)).toBe(h);
    }
  });

  it('supports 0/90/180/270 ghost rotation, trench crossing stretch, same-strip warning, and collision blocking', () => {
    const occupied = getOccupiedHoles([
      { id: 'r1', kind: 'resistor', label: '1kΩ', value: 1000, holeA: 't_10_c', holeB: 't_16_c' },
      { id: 'ic1', kind: 'opamp741', label: 'LM741', value: 5000, holeA: 't_40_e', holeB: 'b_43_f' },
    ]);

    // 90 deg rotation points vertically (+Z) toward bottom side across trench
    const rot90 = computePlacementPreview('resistor', 't_20_b', 6, 90, occupied);
    expect(rot90.holeA).toBe('t_20_b');
    expect(rot90.holeB.startsWith('b_20_')).toBe(true);
    expect(rot90.valid).toBe(true);
    expect(rot90.sameStripWarning).toBe(false);

    // Pin-to-pin stretching onto same column triggers short warning
    const shortPreview = computePlacementPreview('resistor', 't_25_a', 6, 0, occupied, 't_25_e', 't_25_a');
    expect(shortPreview.sameStripWarning).toBe(true);

    // Occupied hole blocks 2-pin placement and overlapping DIP-8 placement
    const blocked = computePlacementPreview('resistor', 't_10_c', 4, 0, occupied);
    expect(blocked.valid).toBe(false);

    const icBlocked = computePlacementPreview('opamp741', 't_39_e', 3, 0, occupied);
    expect(icBlocked.valid).toBe(false);
  });

  it('rotates and moves existing parts without pin collision', () => {
    const part = { id: 'p_rot', kind: 'resistor' as const, label: '1kΩ', value: 1000, holeA: 't_20_c', holeB: 't_24_c' };
    const rot = rotatePart90(part, new Set());
    expect(rot).not.toBeNull();
    expect(rot!.holeA).not.toBe(rot!.holeB);

    const moved = movePartToAnchor(part, 'b_30_h', new Set());
    expect(moved.valid).toBe(true);
    expect(moved.holeA).toBe('b_30_h');
    expect(moved.holeB).toBe('b_34_h');
  });

  it('runs complete CRUMB placement, step-back Escape, selection, editing & pin reshaping workflow in store', () => {
    const store = useLabStore.getState();

    // 1. Place multi-bend jumper with right-click waypoints and Esc step-back
    store.startPlacingPart({ kind: 'jumper', label: 'Jumper', value: 0, span: 6, color: '#16a34a' });
    store.anchorPlacingHoleA('t_5_a');
    store.addPlacingWaypoint(-0.04, -0.01);
    store.addPlacingWaypoint(-0.02, -0.01);
    expect(useLabStore.getState().placingPart?.waypoints).toHaveLength(2);

    store.stepBackPlacing(); // pops last waypoint
    expect(useLabStore.getState().placingPart?.waypoints).toHaveLength(1);
    store.commitPlacedPart('t_5_a', 'b_5_j', useLabStore.getState().placingPart?.waypoints);

    const placed = useLabStore.getState().breadboardParts.find((p) => p.holeA === 't_5_a');
    expect(placed).toBeDefined();
    expect(placed!.holeB).toBe('b_5_j');
    expect(placed!.waypoints).toHaveLength(1);

    // 2. Exit placement via Esc
    store.stepBackPlacing();
    expect(useLabStore.getState().placingPart).toBeNull();

    // 3. Select part, edit value, flip polarity, and reshape Pin B
    store.selectBreadboardPart(placed!.id);
    store.flipBreadboardPart(placed!.id);
    const flipped = useLabStore.getState().breadboardParts.find((p) => p.id === placed!.id)!;
    expect(flipped.holeA).toBe('b_5_j');
    expect(flipped.holeB).toBe('t_5_a');

    store.startReshapingPart('bb_r1', 'pinB');
    store.commitReshapePart('t_17_c');
    const reshaped = useLabStore.getState().breadboardParts.find((p) => p.id === 'bb_r1')!;
    expect(reshaped.holeB).toBe('t_17_c');

    store.updateBreadboardPart('bb_r1', { value: 4700 });
    expect(useLabStore.getState().breadboardParts.find((p) => p.id === 'bb_r1')?.label).toBe('4.7kΩ');

    // 4. Undo / Redo + CRUMB View Mode & Breadboard Workspace Entry/Exit
    store.undoBreadboard();
    expect(useLabStore.getState().breadboardParts.find((p) => p.id === 'bb_r1')?.label).toBe('1kΩ');
    store.redoBreadboard();
    expect(useLabStore.getState().breadboardParts.find((p) => p.id === 'bb_r1')?.label).toBe('4.7kΩ');

    store.enterBreadboardMode();
    expect(useLabStore.getState().breadboardMode).toBe(true);
    expect(useLabStore.getState().breadboard2D).toBe(true);
    expect(useLabStore.getState().cameraTarget).toBe('bb');

    // Toggle seamlessly between 2D editor and 3D breadboard view
    store.setBreadboard2D(false);
    expect(useLabStore.getState().breadboardMode).toBe(true);
    expect(useLabStore.getState().breadboard2D).toBe(false);
    store.setBreadboard2D(true);
    expect(useLabStore.getState().breadboard2D).toBe(true);

    store.setBreadboardViewMode('voltage');
    expect(useLabStore.getState().breadboardViewMode).toBe('voltage');
    store.setBreadboardViewMode('current');
    expect(useLabStore.getState().breadboardViewMode).toBe('current');
    store.toggleBreadboardShowPins();
    expect(useLabStore.getState().breadboardShowPins).toBe(false);

    store.startPlacingPart({ kind: 'resistor', label: 'R 1kΩ', value: 1000, span: 6 });
    store.setPlacingVariant({ value: 330 });
    expect(useLabStore.getState().placingPart?.label).toBe('330Ω');

    store.exitBreadboardMode();
    expect(useLabStore.getState().breadboardMode).toBe(false);
    expect(useLabStore.getState().breadboard2D).toBe(false);
    expect(useLabStore.getState().cameraTarget).toBe('bench');
  });

  it('supports floating jumpers, banana-to-alligator cables, scope probe clamping, and MNA simulation', () => {
    const store = useLabStore.getState();
    store.applyBreadboardPreset('rc_lpf');
    store.applyWiringPreset('clear');
    store.updateSignalGen({ power: true, outputEnabled: true, waveform: 'sine', freqHz: 1500, vpp: 4.0, dcOffset: 0 });

    // 1. Place floating jumpers on input (t_12_a), output (t_18_a), and ground rail (tn_11)
    store.startPlacingPart({ kind: 'jumper', label: 'Jumper Bebas', value: 0, span: 0, color: '#dc2626', floating: true });
    store.commitFloatingJumper('t_12_a', 0);
    store.setPlacingVariant({ color: '#06b6d4', label: 'Jumper Bebas' });
    store.commitFloatingJumper('t_18_a', 90);
    store.setPlacingVariant({ color: '#18181b', label: 'Jumper Bebas' });
    store.commitFloatingJumper('tn_11', 0);

    const parts = useLabStore.getState().breadboardParts;
    const jIn = parts.find((p) => p.holeA === 't_12_a' && p.floating)!;
    const jOut = parts.find((p) => p.holeA === 't_18_a' && p.floating)!;
    const jGnd = parts.find((p) => p.holeA === 'tn_11' && p.floating)!;
    expect(jIn).toBeDefined();
    expect(jOut).toBeDefined();
    expect(jGnd).toBeDefined();

    // Floating jumper occupies ONLY holeA
    expect(getPartPins(jIn)).toEqual(['t_12_a']);

    // Rotating floating jumper rotates its lean offset 90 degrees without colliding
    const origOff = [...jIn.floatOffset!];
    store.rotateBreadboardPart(jIn.id);
    const rotatedJIn = useLabStore.getState().breadboardParts.find((p) => p.id === jIn.id)!;
    expect(rotatedJIn.floatOffset).toEqual([-origOff[1], origOff[0]]);

    // 2. Click floating jumper socket -> spawns banana_alligator with alligator endB clamped & banana endA in hand
    const sockIn = floatingJumperSocketId(jIn.id);
    const sockOut = floatingJumperSocketId(jOut.id);
    const sockGnd = floatingJumperSocketId(jGnd.id);

    store.clickSocket(sockIn);
    let st = useLabStore.getState();
    expect(st.cables).toHaveLength(1);
    expect(st.cables[0].kind).toBe('banana_alligator');
    expect(st.cables[0].endB).toBe(sockIn);
    expect(st.cables[0].endA).toBeNull();
    expect(st.grabbedEnd).toEqual({ cableId: st.cables[0].id, end: 'endA' });

    // Plug into Signal Generator BNC OUT -> upgrades to BNC-Buaya (+/-) and auto-grabs '-' alligator clip!
    store.clickSocket('gen_out');
    expect(useLabStore.getState().cables[0].kind).toBe('bnc_alligator');
    expect(useLabStore.getState().cables[0].endA).toBe('gen_out');
    expect(useLabStore.getState().grabbedEnd).toEqual({ cableId: useLabStore.getState().cables[0].id, end: 'gndClip' });

    // Clamp '-' alligator clip onto GND floating jumper
    store.clickSocket(sockGnd);
    expect(useLabStore.getState().grabbedEnd).toBeNull();
    expect(useLabStore.getState().cables[0].gndClip).toBe(sockGnd);

    // Also verify Banana-to-Alligator stays banana_alligator when connecting floating jumper to a banana jack (psu_gnd)
    store.clickSocket(sockGnd);
    store.clickSocket('psu_gnd');
    expect(useLabStore.getState().grabbedEnd).toBeNull();
    expect(useLabStore.getState().cables[1].kind).toBe('banana_alligator');

    store.spawnCable('probe_bnc_hook');
    const p1Id = useLabStore.getState().cables[useLabStore.getState().cables.length - 1].id;
    store.grabCableEnd(p1Id, 'endA');
    store.dropOrSnapCableEnd('rigol_ch1');
    store.grabCableEnd(p1Id, 'endB');
    store.dropOrSnapCableEnd(sockIn);
    store.grabCableEnd(p1Id, 'gndClip');
    store.dropOrSnapCableEnd(sockGnd);

    store.spawnCable('probe_bnc_hook');
    const p2Id = useLabStore.getState().cables[useLabStore.getState().cables.length - 1].id;
    store.grabCableEnd(p2Id, 'endA');
    store.dropOrSnapCableEnd('rigol_ch2');
    store.grabCableEnd(p2Id, 'endB');
    store.dropOrSnapCableEnd(sockOut);
    store.grabCableEnd(p2Id, 'gndClip');
    store.dropOrSnapCableEnd(sockGnd);

    // 3. Tutorial Modul 5A recognizes banana_alligator clipped to floating jumper on column 12!
    const tut5 = getTutorialById('mod5a_bb_build_lpf')!;
    const m5GenStep = tut5.steps.find((s) => s.id === 'm5a_gen_in') as WireTutorialStep;
    st = useLabStore.getState();
    expect(isWireStepSatisfied(m5GenStep, st.cables, st.activeKit, st.breadboardParts)).toBe(true);

    // 4. Simulate full MNA circuit through floating jumpers + banana-alligator + scope probes
    const sim = runSimulationStep(
      {
        cables: st.cables,
        signalGen: st.signalGen,
        powerSupply: st.powerSupply,
        scopePowered: true,
        ch1ProbeAtten: 1,
        ch2ProbeAtten: 1,
        activeKit: st.activeKit,
        kitControls: st.kitControls,
        breadboardParts: st.breadboardParts,
      },
      st.scope
    );
    const vpp = (arr: Float32Array) => Math.max(...arr) - Math.min(...arr);
    expect(vpp(sim.frame.ch1Samples)).toBeGreaterThanOrEqual(3.7);
    // 1kOhm + 100nF LPF at 1500Hz -> |H| = 1 / sqrt(1 + (2*pi*1500*1e-4)^2) ≈ 0.728 -> ~2.9Vpp
    expect(vpp(sim.frame.ch2Samples)).toBeGreaterThan(2.4);
    expect(vpp(sim.frame.ch2Samples)).toBeLessThan(3.3);

    // 5. Spawning banana_alligator alternates colors cleanly
    store.spawnCable('banana_alligator');
    const spawnedAllig = useLabStore.getState().cables[useLabStore.getState().cables.length - 1];
    expect(spawnedAllig.kind).toBe('banana_alligator');
    expect(spawnedAllig.label).toBe('Banana-Buaya');

    // 6. Deleting floating jumper cleanly detaches cables clamped to it
    store.removeBreadboardPart(jOut.id);
    const p2After = useLabStore.getState().cables.find((c) => c.id === p2Id)!;
    expect(p2After.endB).toBeNull();
    expect(p2After.freePosB).toBeDefined();
  });

  it('supports BNC-to-Alligator (bnc_alligator) from breadboard to oscilloscope and preserves camera pose across 2D mode', () => {
    const store = useLabStore.getState();

    // 1. Entering & exiting 2D breadboard preserves exact last 3D camera pose instead of resetting to origin
    hotRefs.liveCameraPose = { pos: [0.34, 1.04, 0.52], yaw: -0.32, pitch: -0.24 };
    const seqBefore = useLabStore.getState().cameraPresetSeq;
    store.enterBreadboardMode();
    expect(useLabStore.getState().breadboard2D).toBe(true);
    expect(useLabStore.getState().cameraPresetSeq).toBe(seqBefore); // 3D camera did NOT jump to preset
    expect(hotRefs.savedBreadboardReturnPose?.pos).toEqual([0.34, 1.04, 0.52]);

    store.exitBreadboardMode();
    expect(useLabStore.getState().breadboardMode).toBe(false);
    expect(useLabStore.getState().cameraPresetSeq).toBe(seqBefore); // Did NOT snap to bench origin
    expect(hotRefs.restoreCameraPose?.pos).toEqual([0.34, 1.04, 0.52]);
    expect(hotRefs.restoreCameraPose?.yaw).toBeCloseTo(-0.32, 5);

    // 2. Spawn BNC-Buaya directly + pull BNC-Buaya from a floating jumper
    store.applyWiringPreset('clear');
    store.spawnCable('bnc_alligator');
    const spawned = useLabStore.getState().cables[0];
    expect(spawned.kind).toBe('bnc_alligator');
    expect(spawned.label).toBe('BNC-Buaya');
    expect(spawned.gndClip).toBeNull();
    expect(spawned.freePosGnd).toBeDefined();

    // 3. BB RC preset wires Rigol CH1/CH2 via BNC-Buaya + Signal Gen via Banana-Buaya onto floating jumpers
    store.applyWiringPreset('bb_rc_test');
    const st = useLabStore.getState();
    const bncAlligs = st.cables.filter((c) => c.kind === 'bnc_alligator');
    expect(bncAlligs).toHaveLength(2);

    const sim = runSimulationStep(
      {
        cables: st.cables,
        signalGen: st.signalGen,
        powerSupply: st.powerSupply,
        scopePowered: true,
        ch1ProbeAtten: 1,
        ch2ProbeAtten: 1,
        activeKit: st.activeKit,
        kitControls: st.kitControls,
        breadboardParts: st.breadboardParts,
      },
      st.scope
    );
    const vpp = (arr: Float32Array) => Math.max(...arr) - Math.min(...arr);
    expect(vpp(sim.frame.ch1Samples)).toBeGreaterThanOrEqual(3.7);
    expect(vpp(sim.frame.ch2Samples)).toBeGreaterThan(2.4);
    expect(vpp(sim.frame.ch2Samples)).toBeLessThan(3.3);

    // 4. pullBncAlligatorFromFloatingJumper clamps alligator endB to floating jumper & grabs BNC endA
    const jOut = st.breadboardParts.find((p) => p.id === 'bb_rc_jout')!;
    store.pullBncAlligatorFromFloatingJumper(jOut.id);
    const afterPull = useLabStore.getState();
    const pulled = afterPull.cables.find((c) => c.id === afterPull.grabbedEnd?.cableId)!;
    expect(pulled.kind).toBe('bnc_alligator');
    expect(pulled.endB).toBe(floatingJumperSocketId(jOut.id));
    expect(afterPull.grabbedEnd?.end).toBe('endA');
  });
});
