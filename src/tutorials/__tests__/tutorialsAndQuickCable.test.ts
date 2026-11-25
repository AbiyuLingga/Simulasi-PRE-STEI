import { describe, expect, it } from 'vitest';
import { runSimulationStep } from '../../simulation/worker/circuit.worker';
import { useLabStore } from '../../state/labStore';
import {
  getTutorialById,
  getTutorialProgress,
  isWireStepSatisfied,
  MODULE_TUTORIALS,
  type WireTutorialStep,
} from '../moduleTutorials';

function signalVpp(samples: Float32Array): number {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < samples.length; i++) {
    if (samples[i] < min) min = samples[i];
    if (samples[i] > max) max = samples[i];
  }
  return max - min;
}

describe('Click-to-Pull Banana Cables & Guided Module Tutorials', () => {
  it('adapts oscilloscope BNC cables to destination (2x Banana for Kit/PSU/Gen, 2x Alligator for Jumper/BB) with + first then -', () => {
    const store = useLabStore.getState();
    store.stopTutorial();
    store.applyWiringPreset('clear');
    store.setActiveKit('rl_rc');
    expect(useLabStore.getState().cables).toHaveLength(0);

    // 1. Click CH1 on scope -> stays default single banana_4mm while dragging (no premature Y-split!)
    store.clickSocket('rigol_ch1');
    let st = useLabStore.getState();
    expect(st.cables).toHaveLength(1);
    expect(st.cables[0].kind).toBe('banana_4mm');
    expect(st.cables[0].endA).toBe('rigol_ch1');
    expect(st.cables[0].endB).toBeNull();
    expect(st.cables[0].gndClip).toBeUndefined();
    expect(st.cables[0].color).toBe('#eab308');
    expect(st.grabbedEnd).toEqual({ cableId: st.cables[0].id, end: 'endB' });

    // 1b. Attach to Signal Generator (gen_out) -> morphs cleanly to BNC-BNC (single coaxial, no Y-split!)
    store.clickSocket('gen_out');
    st = useLabStore.getState();
    expect(st.grabbedEnd).toBeNull();
    expect(st.cables[0].kind).toBe('bnc_bnc');
    expect(st.cables[0].endA).toBe('rigol_ch1');
    expect(st.cables[0].endB).toBe('gen_out');
    expect(st.cables[0].gndClip).toBeUndefined();

    // 2. Fresh click CH1 -> plug first end (+) into Kit RL/RC -> morphs to bnc_banana (2x banana +/-) and auto-grabs '-'!
    store.applyWiringPreset('clear');
    store.clickSocket('rigol_ch1');
    store.clickSocket('kr_r1_out');
    st = useLabStore.getState();
    expect(st.cables[0].kind).toBe('bnc_banana');
    expect(st.cables[0].endA).toBe('rigol_ch1');
    expect(st.cables[0].endB).toBe('kr_r1_out');
    expect(st.grabbedEnd).toEqual({ cableId: st.cables[0].id, end: 'gndClip' });

    // Plug second end (-) into Kit GND -> completes dual-banana cable and releases grab
    store.clickSocket('kr_gnd_l');
    st = useLabStore.getState();
    expect(st.grabbedEnd).toBeNull();
    expect(st.cables[0].gndClip).toBe('kr_gnd_l');

    // 3. Click CH2 -> plug into breadboard/floating jumper -> adapts to bnc_alligator (2x buaya +/-) with + first & - grabbed!
    store.applyBreadboardPreset('rc_lpf');
    store.commitFloatingJumper('t_12_a', 0);
    store.commitFloatingJumper('tn_12', 0);
    const floats = useLabStore.getState().breadboardParts.filter((p) => p.kind === 'jumper' && p.floating);
    const fSig = `bb_float_${floats[0].id}`;
    const fGnd = `bb_float_${floats[1].id}`;

    store.clickSocket('rigol_ch2');
    st = useLabStore.getState();
    expect(st.cables).toHaveLength(2);
    expect(st.cables[1].color).toBe('#06b6d4');
    // Plug '+' into floating jumper -> morphs to bnc_alligator and grabs '-' alligator!
    store.clickSocket(fSig);
    st = useLabStore.getState();
    expect(st.cables[1].kind).toBe('bnc_alligator');
    expect(st.cables[1].endB).toBe(fSig);
    expect(st.grabbedEnd).toEqual({ cableId: st.cables[1].id, end: 'gndClip' });
    // Plug '-' into GND floating jumper
    store.clickSocket(fGnd);
    st = useLabStore.getState();
    expect(st.grabbedEnd).toBeNull();
    expect(st.cables[1].gndClip).toBe(fGnd);

    // 4. Click CH1 -> plug into PSU (+) -> bnc_banana (2x banana +/-) and '-' plugs into PSU (-)
    store.applyWiringPreset('clear');
    store.clickSocket('rigol_ch1');
    store.clickSocket('psu_ch1_pos');
    st = useLabStore.getState();
    expect(st.cables[0].kind).toBe('bnc_banana');
    expect(st.cables[0].endB).toBe('psu_ch1_pos');
    expect(st.grabbedEnd).toEqual({ cableId: st.cables[0].id, end: 'gndClip' });
    store.clickSocket('psu_ch1_neg');
    st = useLabStore.getState();
    expect(st.grabbedEnd).toBeNull();
    expect(st.cables[0].gndClip).toBe('psu_ch1_neg');

    // Verify floating PSU CH1 (5.0V) reads accurately on Rigol CH1 via BNC-Banana (+/-)
    const simPsu = runSimulationStep(
      {
        cables: st.cables,
        signalGen: st.signalGen,
        powerSupply: { ...st.powerSupply, power: true, outputEnabled: true, ch1Voltage: 5.0 },
        scopePowered: true,
        ch1ProbeAtten: 1,
        ch2ProbeAtten: 1,
        activeKit: st.activeKit,
        kitControls: st.kitControls,
        breadboardParts: st.breadboardParts,
      },
      st.scope
    );
    expect(simPsu.frame.measurements.values.Vavg ?? 0).toBeCloseTo(5.0, 1);

    // 5. Signal Generator BNC (gen_out) ALSO morphs into Y-split when attached to Kit (2x Banana +/-) or Breadboard (2x Alligator +/-)!
    store.applyWiringPreset('clear');
    store.clickSocket('gen_out');
    expect(useLabStore.getState().cables[0].kind).toBe('banana_4mm'); // default single before attach
    store.clickSocket('kr_r1_out');
    st = useLabStore.getState();
    expect(st.cables[0].kind).toBe('bnc_banana');
    expect(st.cables[0].endA).toBe('gen_out');
    expect(st.cables[0].endB).toBe('kr_r1_out');
    expect(st.grabbedEnd).toEqual({ cableId: st.cables[0].id, end: 'gndClip' });
    store.clickSocket('kr_gnd_l');
    expect(useLabStore.getState().grabbedEnd).toBeNull();
    expect(useLabStore.getState().cables[0].gndClip).toBe('kr_gnd_l');

    // Signal Gen BNC -> Breadboard floating jumper -> morphs to bnc_alligator (2x Buaya +/-)
    store.clickSocket('gen_out');
    store.clickSocket(fSig);
    st = useLabStore.getState();
    expect(st.cables[1].kind).toBe('bnc_alligator');
    expect(st.cables[1].endA).toBe('gen_out');
    expect(st.cables[1].endB).toBe(fSig);
    expect(st.grabbedEnd).toEqual({ cableId: st.cables[1].id, end: 'gndClip' });
    store.clickSocket(fGnd);
    expect(useLabStore.getState().grabbedEnd).toBeNull();
    expect(useLabStore.getState().cables[1].gndClip).toBe(fGnd);

    // 6. Rigol CH1 VERT_POS clamps offsetDiv within [-3.8, +3.8] so [1>] arrow NEVER detaches from 0V trace, and Pos sign matches direction!
    store.pressScopeButton('CH1');
    store.pushScopeKnob('VERT_POS');
    expect(useLabStore.getState().scope.ch1.offsetDiv).toBe(0);
    store.turnScopeKnob('VERT_POS', 30); // way up -> clamped cleanly to +3.8 div
    expect(useLabStore.getState().scope.ch1.offsetDiv).toBe(3.8);
    store.turnScopeKnob('VERT_POS', -60); // way down -> clamped cleanly to -3.8 div
    expect(useLabStore.getState().scope.ch1.offsetDiv).toBe(-3.8);
    store.pushScopeKnob('VERT_POS');

    // 7. Re-clicking same scope socket cancels zero-length cable; black/red defaults still apply on non-scope sockets
    store.applyWiringPreset('clear');
    store.clickSocket('rigol_ch2');
    expect(useLabStore.getState().cables).toHaveLength(1);
    store.clickSocket('rigol_ch2');
    expect(useLabStore.getState().grabbedEnd).toBeNull();
    expect(useLabStore.getState().cables).toHaveLength(0);

    store.clickSocket('gen_gnd');
    expect(useLabStore.getState().cables[0].color).toBe('#18181b');
    store.dropOrSnapCableEnd('dmm_com');

    store.clickSocket('gen_out');
    expect(useLabStore.getState().cables[1].color).toBe('#dc2626');
    store.dropOrSnapCableEnd(null, [0, 0.788, 0.1]);
  });

  it('recognizes electrically equivalent kit GND buses and breadboard column strips', () => {
    const tut4 = getTutorialById('mod4a_rc_transient')!;
    const gndStep = tut4.steps.find((s) => s.id === 'm4a_gnd') as WireTutorialStep;
    expect(
      isWireStepSatisfied(
        gndStep,
        [{ id: 'c1', kind: 'banana_4mm', color: '#18181b', label: 'GND', endA: 'rigol_ch1_gnd', endB: 'kr_gnd_r' }],
        'rl_rc'
      )
    ).toBe(true);

    const tut5 = getTutorialById('mod5a_bb_build_lpf')!;
    const bbInStep = tut5.steps.find((s) => s.id === 'm5a_ch1') as WireTutorialStep;
    expect(
      isWireStepSatisfied(
        bbInStep,
        [{ id: 'c2', kind: 'bnc_alligator', color: '#eab308', label: 'CH1', endA: 'rigol_ch1', endB: 'bb_t_12_e' }],
        'rl_rc'
      )
    ).toBe(true);
  });

  it('auto-advances via clickSocket across wire steps, opens worksheet, and supports kit switching with full cable clear', () => {
    const store = useLabStore.getState();
    store.startTutorial('mod2a_cal_gen');
    let st = useLabStore.getState();
    expect(st.activeTutorialId).toBe('mod2a_cal_gen');
    expect(st.tutorialStepIndex).toBe(0);
    expect(st.worksheetOpen).toBe(true);
    expect(st.cables).toHaveLength(0);

    // Manually pull + plug step 1 (gen_out -> rigol_ch1 -> bnc_bnc)
    store.clickSocket('gen_out');
    store.clickSocket('rigol_ch1');
    st = useLabStore.getState();
    expect(st.tutorialStepIndex).toBe(1);
    expect(st.cables[0].kind).toBe('bnc_bnc');

    // Auto-wire step 2 (rigol_ch2 -> rigol_comp_sig + gndClip) -> advances to observe step (idx 2)
    store.autoWireCurrentTutorialStep();
    st = useLabStore.getState();
    expect(st.tutorialStepIndex).toBe(2);
    expect(st.cables).toHaveLength(2);
    expect(st.cables[1].kind).toBe('bnc_alligator');

    // Toggle worksheet open/close cleanly
    store.toggleWorksheet();
    expect(useLabStore.getState().worksheetOpen).toBe(false);
    store.toggleWorksheet();
    expect(useLabStore.getState().worksheetOpen).toBe(true);

    // Clicking Kit box highlights it blue, opening picker keeps selection, and switching Kit detaches ALL cables!
    store.selectKitBox(true);
    expect(useLabStore.getState().kitSelected).toBe(true);
    store.setKitPickerOpen(true);
    expect(useLabStore.getState().kitPickerOpen).toBe(true);

    // Re-selecting same kit keeps cables intact
    store.setActiveKit('rl_rc');
    expect(useLabStore.getState().cables).toHaveLength(2);
    expect(useLabStore.getState().kitSelected).toBe(false);
    expect(useLabStore.getState().kitPickerOpen).toBe(false);

    // Add a kit-wired cable (kr_c1_in -> kr_gnd_l), a Decade Box cable (dmm_pos -> kp_a), and a breadboard cable with kit GND clip!
    store.stopTutorial();
    store.clickSocket('kr_c1_in');
    store.clickSocket('kr_gnd_l');
    store.clickSocket('dmm_pos');
    store.clickSocket('kp_a');
    store.applyBreadboardPreset('rc_lpf');
    store.clickSocket('rigol_ch1');
    store.clickSocket('bb_t_12_a');
    store.clickSocket('kr_gnd_r');
    expect(useLabStore.getState().cables).toHaveLength(5);

    // Switching to another kit MUST ONLY detach cables connected to the old kit — keeping non-kit cables intact!
    store.setActiveKit('osc_gen');
    st = useLabStore.getState();
    expect(st.activeKit).toBe('osc_gen');
    // Only the kr_c1_in -> kr_gnd_l kit cable is removed; the 4 non-kit cables (gen->ch1, ch2->comp, dmm->decade, ch1->bb) stay!
    expect(st.cables).toHaveLength(4);
    expect(st.cables.some((c) => c.endA === 'kr_c1_in' || c.endB === 'kr_gnd_l')).toBe(false);
    expect(st.cables.some((c) => c.endA === 'gen_out' && c.endB === 'rigol_ch1')).toBe(true);
    expect(st.cables.some((c) => c.endA === 'dmm_pos' && c.endB === 'kp_a')).toBe(true);
    // And the breadboard cable that had its gndClip on kr_gnd_r keeps endA/endB intact while detaching only gndClip!
    const bbCable = st.cables.find((c) => c.endB === 'bb_t_12_a');
    expect(bbCable).toBeDefined();
    expect(bbCable?.gndClip).toBeNull();
    expect(st.grabbedEnd).toBeNull();
    expect(st.kitSelected).toBe(false);
    expect(st.kitPickerOpen).toBe(false);

    // Lissajous instrument preset activates X-Y mode + Manual Y (Voltage) cursor on CH2
    store.applyTutorialInstrumentPreset('scope_xy_lissajous');
    st = useLabStore.getState();
    expect(st.scope.horizontal.timeBaseMode).toBe('X-Y');
    expect(st.scope.cursor.mode).toBe('Manual');
    expect(st.scope.cursor.type).toBe('Y');
    expect(st.scope.ch1.offsetDiv).toBe(0);
    expect(st.scope.ch2.offsetDiv).toBe(0);
  });

  it.each(MODULE_TUTORIALS.map((t) => [t.id, t] as const))(
    'completes %s with clickSocket wiring, valid worksheet/guides, and yields expected physics measurements',
    (tutId, tut) => {
      // Every sub-experiment must ship with a full editable worksheet & step-by-step instrument guide
      expect(tut.worksheet.columns.length).toBeGreaterThanOrEqual(3);
      expect(tut.worksheet.defaultRows.length).toBeGreaterThanOrEqual(1);
      const obsStep = tut.steps.find((s) => s.kind === 'observe');
      expect(obsStep).toBeDefined();
      if (obsStep?.kind === 'observe') {
        expect(obsStep.controlsGuide.length).toBeGreaterThanOrEqual(2);
        expect(obsStep.whatToRead.length).toBeGreaterThan(8);
      }

      const store = useLabStore.getState();
      store.startTutorial(tutId);
      expect(useLabStore.getState().worksheetOpen).toBe(true);

      const wireSteps = tut.steps.filter((s): s is WireTutorialStep => s.kind === 'wire');
      for (const step of wireSteps) {
        store.clickSocket(step.fromSocket);
        store.clickSocket(step.toSocket);
      }

      const st = useLabStore.getState();
      const prog = getTutorialProgress(tut, st.cables, st.activeKit, st.breadboardParts);
      expect(prog.allWiresDone).toBe(true);
      expect(st.tutorialStepIndex).toBe(tut.steps.length - 1);

      const sim = runSimulationStep(
        {
          cables: st.cables,
          signalGen: st.signalGen,
          powerSupply: st.powerSupply,
          scopePowered: st.scope.power === 'ON',
          ch1ProbeAtten: st.scope.ch1.probe,
          ch2ProbeAtten: st.scope.ch2.probe,
          activeKit: st.activeKit,
          kitControls: st.kitControls,
          breadboardParts: st.breadboardParts,
          dmm: {
            power: st.dm3058.power,
            func: st.dm3058.func,
            dualEnabled: st.dm3058.dualEnabled,
            viceFunc: st.dm3058.viceFunc,
            inputZ: st.dm3058.inputZ,
            rangeIndex: st.dm3058.rangeIndex,
            autoRange: st.dm3058.autoRange,
          },
        },
        st.scope
      );

      if (tutId === 'mod1a_resistor_ohm') {
        expect(sim.dm3058Meas.ohms2W).toBeCloseTo(1500, -1);
      } else if (tutId === 'mod1b_divider_vdc') {
        expect(sim.dm3058Meas.vdc).toBeCloseTo(3.0, 2);
      } else if (tutId === 'mod1c_loading_effect') {
        expect(sim.dm3058Meas.vdc).toBeCloseTo(2.791, 2);
      } else if (tutId === 'mod1d_dci_ohm_law') {
        expect(Math.abs(sim.dm3058Meas.idc)).toBeCloseTo(0.004, 3);
      } else if (tutId === 'mod1e_acv_rms_waveforms') {
        expect(sim.dm3058Meas.vacRms).toBeCloseTo(1.414, 2);
        expect(sim.dm3058Meas.freqHz).toBeCloseTo(1000, -1);
      } else if (tutId === 'mod1f_kelvin_4wr') {
        expect(sim.dm3058Meas.ohms4W).toBeCloseTo(10.0, 2);
      } else if (tutId === 'mod2a_cal_gen') {
        expect(signalVpp(sim.frame.ch1Samples)).toBeGreaterThanOrEqual(3.7);
        expect(sim.frame.measurements.values.Freq ?? 0).toBeCloseTo(1000, -2);
        expect(signalVpp(sim.frame.ch2Samples)).toBeCloseTo(3.0, 1);
      } else if (tutId === 'mod2b_phase_yt' || tutId === 'mod2c_lissajous_xy') {
        expect(signalVpp(sim.frame.ch1Samples)).toBeGreaterThanOrEqual(3.5);
        expect(signalVpp(sim.frame.ch2Samples)).toBeCloseTo(1.72, 1);
      } else if (tutId === 'mod2d_lissajous_freq') {
        expect(signalVpp(sim.frame.ch1Samples)).toBeCloseTo(4.0, 1);
        expect(signalVpp(sim.frame.ch2Samples)).toBeCloseTo(4.0, 1);
      } else if (tutId === 'mod2e_kit5_amp_gain') {
        expect(signalVpp(sim.frame.ch1Samples)).toBeCloseTo(1.0, 1);
        expect(signalVpp(sim.frame.ch2Samples)).toBeCloseTo(2.5, 1);
      } else if (tutId === 'mod2f_ac_dc_coupling') {
        expect(signalVpp(sim.frame.ch1Samples)).toBeCloseTo(2.0, 1);
        expect(sim.frame.measurements.values.Vavg ?? 0).toBeCloseTo(2.5, 1);
      } else if (tutId === 'mod3a_thevenin_vth') {
        expect(sim.dm3058Meas.vdc).toBeCloseTo(6.803, 1);
      } else if (tutId === 'mod3b_thevenin_rth') {
        expect(Math.abs(sim.dm3058Meas.idc)).toBeCloseTo(0.00609, 3);
      } else if (tutId === 'mod3c_max_power') {
        expect(sim.dm3058Meas.vdc).toBeCloseTo(3.407, 1);
      } else if (tutId === 'mod3d_norton_source') {
        expect(Math.abs(sim.dm3058Meas.idc)).toBeGreaterThan(0.0018);
        expect(Math.abs(sim.dm3058Meas.idc)).toBeLessThan(0.0026);
      } else if (tutId === 'mod3e_reciprocity') {
        expect(Math.abs(sim.dm3058Meas.idc)).toBeCloseTo(0.00609, 3);
      } else if (tutId === 'mod3f_superposition') {
        expect(sim.dm3058Meas.vdc).toBeCloseTo(7.333, 2);
      } else if (tutId === 'mod3g_opamp_inv') {
        expect(signalVpp(sim.frame.ch1Samples)).toBeCloseTo(2.0, 1);
        expect(signalVpp(sim.frame.ch2Samples)).toBeCloseTo(4.4, 1);
        expect(Math.abs(sim.frame.measurements.values.Phase12Rise ?? 0)).toBeGreaterThan(170);
      } else if (tutId === 'mod3h_opamp_noninv') {
        expect(signalVpp(sim.frame.ch1Samples)).toBeCloseTo(2.0, 1);
        expect(signalVpp(sim.frame.ch2Samples)).toBeCloseTo(6.4, 1);
        expect(Math.abs(sim.frame.measurements.values.Phase12Rise ?? 99)).toBeLessThan(10);
      } else if (tutId === 'mod4a_rc_transient') {
        expect(signalVpp(sim.frame.ch1Samples)).toBeGreaterThanOrEqual(3.5);
        expect(signalVpp(sim.frame.ch2Samples)).toBeGreaterThanOrEqual(3.2);
      } else if (tutId === 'mod4b_rl_transient') {
        expect(signalVpp(sim.frame.ch1Samples)).toBeGreaterThanOrEqual(3.5);
        expect(signalVpp(sim.frame.ch2Samples)).toBeGreaterThanOrEqual(3.4);
      } else if (tutId === 'mod4c_rc_diff') {
        expect(signalVpp(sim.frame.ch1Samples)).toBeGreaterThanOrEqual(3.7);
        expect(signalVpp(sim.frame.ch2Samples)).toBeGreaterThanOrEqual(6.8);
      } else if (tutId === 'mod4d_rc_integ') {
        expect(signalVpp(sim.frame.ch1Samples)).toBeGreaterThanOrEqual(3.7);
        expect(signalVpp(sim.frame.ch2Samples)).toBeCloseTo(2.2, 0);
      } else if (tutId === 'mod4e_rlc_damping') {
        expect(signalVpp(sim.frame.ch1Samples)).toBeGreaterThanOrEqual(3.0);
        // Underdamped overshoot on 0..4V step with R_tot = 100Ω -> Vc peaks > 5.0V!
        expect(Math.max(...sim.frame.ch2Samples)).toBeGreaterThan(5.0);
      } else if (tutId === 'mod5a_bb_build_lpf') {
        expect(signalVpp(sim.frame.ch1Samples)).toBeGreaterThanOrEqual(3.5);
        expect(signalVpp(sim.frame.ch2Samples)).toBeCloseTo(2.85, 1);
      } else if (tutId === 'mod5b_bb_bode_fc') {
        expect(signalVpp(sim.frame.ch1Samples)).toBeGreaterThanOrEqual(3.5);
        expect(signalVpp(sim.frame.ch2Samples)).toBeCloseTo(2.78, 1);
      } else if (tutId === 'mod5c_hpf_bode') {
        expect(signalVpp(sim.frame.ch1Samples)).toBeGreaterThanOrEqual(3.7);
        expect(signalVpp(sim.frame.ch2Samples)).toBeCloseTo(2.82, 1);
      } else if (tutId === 'mod5d_res_seri') {
        expect(signalVpp(sim.frame.ch2Samples)).toBeCloseTo(0.485, 2);
      } else if (tutId === 'mod5e_res_paralel') {
        expect(signalVpp(sim.frame.ch2Samples)).toBeLessThan(0.01);
      } else if (tutId === 'mod5f_res_sp1') {
        expect(signalVpp(sim.frame.ch2Samples)).toBeCloseTo(0.485, 2);
      } else if (tutId === 'mod5g_res_sp2') {
        expect(signalVpp(sim.frame.ch2Samples)).toBeCloseTo(0.485, 2);
      } else if (tutId === 'mod5h_filter_notch') {
        expect(signalVpp(sim.frame.ch2Samples)).toBeLessThan(0.01);
      } else if (tutId === 'mod5i_filter_bandpass') {
        expect(signalVpp(sim.frame.ch2Samples)).toBeCloseTo(0.485, 2);
      } else {
        throw new Error(`Unhandled physics assertion for tutorial ${tutId}`);
      }
    }
  );
});
