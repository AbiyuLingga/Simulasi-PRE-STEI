import { describe, expect, it } from 'vitest';
import { runSimulationStep } from '../../simulation/worker/circuit.worker';
import { computeDecadeBoxOhms } from '../../simulation/kits/kitDefinitions';
import { useLabStore } from '../labStore';

function vpp(arr: Float32Array): number {
  let mn = Infinity;
  let mx = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] < mn) mn = arr[i];
    if (arr[i] > mx) mx = arr[i];
  }
  return mx - mn;
}

describe('Free Cable Placement, Lift Cutoff, DG1012 Dual-Ch, & Decade Resistance Box', () => {
  it('immediately detaches & cuts scope signal to 0V when lifting a cable, and moves cleanly to another pin', () => {
    const store = useLabStore.getState();
    store.applyWiringPreset('dual_trace');

    // While connected (rigol_ch1 <-> gen_out), oscilloscope detects full ~4Vpp sine wave
    let st = useLabStore.getState();
    const simConnected = runSimulationStep(
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
    expect(vpp(simConnected.frame.ch1Samples)).toBeGreaterThanOrEqual(3.7);

    // Lifting/grabbing probe_ch1 endB IMMEDIATELY detaches endB = null -> scope drops to flat 0V!
    store.grabCableEnd('probe_ch1', 'endB');
    st = useLabStore.getState();
    expect(st.grabbedEnd).toEqual({ cableId: 'probe_ch1', end: 'endB' });
    expect(st.cables.find((c) => c.id === 'probe_ch1')?.endB).toBeNull();

    const simLifted = runSimulationStep(
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
    expect(vpp(simLifted.frame.ch1Samples)).toBeLessThan(0.05);

    // Drop on bench keeps freePosB; re-grab and move onto another BNC pin (gen_ch2_out) works cleanly!
    store.dropOrSnapCableEnd(null, [0.12, 0.788, 0.25]);
    let probe = useLabStore.getState().cables.find((c) => c.id === 'probe_ch1');
    expect(useLabStore.getState().grabbedEnd).toBeNull();
    expect(probe?.endB).toBeNull();
    expect(probe?.freePosB).toEqual([0.12, 0.788, 0.25]);

    // Move cable to DG1012 CH2 output and enable CH2 -> oscilloscope reads live CH2 Ramp wave!
    store.grabCableEnd('probe_ch1', 'endB');
    store.clickSocket('gen_ch2_out');
    store.updateSignalGen({ ch2OutputEnabled: true, ch2Waveform: 'triangle', ch2Vpp: 3.0, ch2FreqHz: 1500 });
    st = useLabStore.getState();
    probe = st.cables.find((c) => c.id === 'probe_ch1');
    expect(probe?.endB).toBe('gen_ch2_out');
    expect(probe?.freePosB).toBeUndefined();

    const simCh2 = runSimulationStep(
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
    expect(vpp(simCh2.frame.ch1Samples)).toBeCloseTo(3.0, 1);
  });

  it('sums all 8 rotary decade scales on the standalone Decade Potentiometer Box simultaneously alongside any LDTE Kit', () => {
    const store = useLabStore.getState();
    // Keep Kit #22 Thevenin mounted on the bench — standalone Decade Box works simultaneously without replacing the Kit!
    store.setActiveKit('thevenin');
    // Dial: 0x1M + 0x100k + 1x10k + 2x1k + 3x100 + 4x10 + 5x1 + 6x0.1 = 12345.6 Ω!
    const dials = [0, 0, 1, 2, 3, 4, 5, 6];
    expect(computeDecadeBoxOhms(dials)).toBeCloseTo(12345.6, 1);

    store.updateKitControls({ decadeDials: dials });
    store.clickSocket('dmm_pos');
    store.clickSocket('kp_a');
    store.clickSocket('dmm_com');
    store.clickSocket('kp_b');

    const st = useLabStore.getState();
    expect(st.activeKit).toBe('thevenin');
    const sim = runSimulationStep(
      {
        cables: st.cables,
        signalGen: st.signalGen,
        powerSupply: st.powerSupply,
        scopePowered: false,
        ch1ProbeAtten: 1,
        ch2ProbeAtten: 1,
        activeKit: st.activeKit,
        kitControls: st.kitControls,
        breadboardParts: [],
        dmm: {
          power: true,
          func: '2WR',
          dualEnabled: false,
          viceFunc: 'DCV',
          inputZ: '10M',
          rangeIndex: 0,
          autoRange: true,
        },
      },
      st.scope
    );
    expect(sim.dm3058Meas.ohms2W).toBeCloseTo(12345.6, 0);
  });

  it('increments cameraPresetSeq even when re-selecting the active camera target', () => {
    const store = useLabStore.getState();
    store.setCameraTarget('rigol');
    const seq1 = useLabStore.getState().cameraPresetSeq;

    store.setCameraTarget('rigol');
    const seq2 = useLabStore.getState().cameraPresetSeq;
    expect(useLabStore.getState().cameraTarget).toBe('rigol');
    expect(seq2).toBe(seq1 + 1);
  });
});
