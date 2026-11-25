import {
  compileBreadboardParts,
  floatingJumperSocketId,
  holeIdToElectricalNode,
} from '../breadboard/breadboardModel';
import { compileActiveKit, computeDecadeBoxOhms } from '../kits/kitDefinitions';
import type {
  BreadboardPart,
  CableConnection,
  CircuitComponent,
  CompiledNetlist,
  DmmConfig,
  KitControlState,
  KitId,
  PowerSupplyConfig,
  SignalGenConfig,
  SocketId,
} from './types';

class UnionFind {
  private parent = new Map<string, string>();

  find(x: string): string {
    const existing = this.parent.get(x);
    if (existing === undefined) {
      this.parent.set(x, x);
      return x;
    }
    let curr = existing;
    while (true) {
      const next = this.parent.get(curr);
      if (!next || next === curr) break;
      const gp = this.parent.get(next);
      if (gp) this.parent.set(curr, gp);
      curr = next;
    }
    this.parent.set(x, curr);
    return curr;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) {
      if (rb === 'EARTH_GND') {
        this.parent.set(ra, rb);
      } else {
        this.parent.set(rb, ra);
      }
    }
  }
}

export interface CompileBenchParams {
  cables: CableConnection[];
  signalGen: SignalGenConfig;
  powerSupply: PowerSupplyConfig;
  scopePowered: boolean;
  ch1ProbeAtten: number;
  ch2ProbeAtten: number;
  activeKit?: KitId;
  kitControls?: KitControlState;
  breadboardParts?: BreadboardPart[];
  dmm?: DmmConfig;
  extraComponents?: CircuitComponent[];
}

const DEFAULT_KIT_CONTROLS: KitControlState = {
  oscAmpPower: true,
  oscAmpGain: 2.5,
  oscGenPower: true,
  oscGenFreqIdx: 1,
  oscPhasePotOhms: 3300,
  thevPotOhms: 2200,
  thevNortonPotOhms: 1000,
  decadeDials: [0, 0, 0, 1, 5, 0, 0, 0],
};

function resolveSocketKey(sock: string): string {
  if (sock.startsWith('bb_float_')) return sock;
  return sock.startsWith('bb_') ? holeIdToElectricalNode(sock) : sock;
}

export function compileBenchNetlist(params: CompileBenchParams): CompiledNetlist {
  const uf = new UnionFind();
  uf.find('EARTH_GND');

  uf.union('EARTH_GND', 'rigol_ch1_gnd');
  uf.union('EARTH_GND', 'rigol_ch2_gnd');
  uf.union('EARTH_GND', 'rigol_comp_gnd');
  uf.union('EARTH_GND', 'gen_gnd');
  uf.union('EARTH_GND', 'psu_gnd');

  // Electrically bond every floating breadboard jumper's exposed tip to its plugged strip/rail node
  for (const part of params.breadboardParts ?? []) {
    if (part.kind === 'jumper' && part.floating) {
      uf.union(floatingJumperSocketId(part.id), holeIdToElectricalNode(part.holeA));
    }
  }

  const connectedSockets = new Set<SocketId>();

  for (const cable of params.cables) {
    if (cable.endA && cable.endB) {
      uf.union(resolveSocketKey(cable.endA), resolveSocketKey(cable.endB));
      connectedSockets.add(cable.endA);
      connectedSockets.add(cable.endB);

      if (cable.kind === 'bnc_bnc') {
        const isGen = (s: SocketId) => s === 'gen_out' || s === 'gen_ch2_out';
        if (cable.endA === 'rigol_ch1' || cable.endB === 'rigol_ch1') {
          if (isGen(cable.endA) || isGen(cable.endB)) {
            uf.union('rigol_ch1_gnd', 'gen_gnd');
          }
        }
        if (cable.endA === 'rigol_ch2' || cable.endB === 'rigol_ch2') {
          if (isGen(cable.endA) || isGen(cable.endB)) {
            uf.union('rigol_ch2_gnd', 'gen_gnd');
          }
        }
      }
    }

    if (
      (cable.kind === 'probe_bnc_hook' || cable.kind === 'bnc_alligator' || cable.kind === 'bnc_banana') &&
      cable.gndClip
    ) {
      if (cable.endA === 'rigol_ch1' || cable.endB === 'rigol_ch1') {
        uf.union('rigol_ch1_gnd', resolveSocketKey(cable.gndClip));
      } else if (cable.endA === 'rigol_ch2' || cable.endB === 'rigol_ch2') {
        uf.union('rigol_ch2_gnd', resolveSocketKey(cable.gndClip));
      } else if (cable.endA === 'rigol_ext' || cable.endB === 'rigol_ext') {
        uf.union('EARTH_GND', resolveSocketKey(cable.gndClip));
      } else if (
        cable.endA === 'gen_out' ||
        cable.endB === 'gen_out' ||
        cable.endA === 'gen_ch2_out' ||
        cable.endB === 'gen_ch2_out'
      ) {
        uf.union('gen_gnd', resolveSocketKey(cable.gndClip));
      }
    }
  }

  const unionFn = (a: string, b: string) => uf.union(resolveSocketKey(a), resolveSocketKey(b));
  const node = (sock: string) => `N_${uf.find(resolveSocketKey(sock))}`;
  const gnd = node('EARTH_GND');

  const components: CircuitComponent[] = [];

  // Active LDTE Kit internal wiring & components (union runs BEFORE resolving nodes!)
  const kitComponents = compileActiveKit(
    params.activeKit ?? 'none',
    params.kitControls ?? DEFAULT_KIT_CONTROLS,
    unionFn,
    node
  );
  components.push(...kitComponents);

  // Standalone 8-Dial Decade Resistance Box (ALWAYS present on the bench alongside any Kit!)
  const decadeOhms = computeDecadeBoxOhms((params.kitControls ?? DEFAULT_KIT_CONTROLS).decadeDials);
  components.push({
    id: 'kp_r_decade',
    kind: 'resistor',
    nodeA: node('kp_a'),
    nodeB: node('kp_b'),
    ohms: Math.max(0.05, decadeOhms),
    maxWatts: 5,
  });

  const ch1ProbesComp = uf.find('rigol_ch1') === uf.find('rigol_comp_sig');
  const ch2ProbesComp = uf.find('rigol_ch2') === uf.find('rigol_comp_sig');

  // Rigol Probe Comp source (3 Vpp 1 kHz) — only stamped when connected so unused square wave never pollutes linear AC/steady-state
  if (params.scopePowered && connectedSockets.has('rigol_comp_sig')) {
    components.push({
      id: 'rigol_probe_comp_src',
      kind: 'vsource_func',
      nodePos: 'N_COMP_INT',
      nodeNeg: node('rigol_comp_gnd'),
      waveform: 'square',
      freqHz: 1000,
      amplitudePeak: 1.5,
      dcOffset: 1.5,
      dutyPct: 50,
    });
    components.push({
      id: 'rigol_probe_comp_r',
      kind: 'resistor',
      nodeA: 'N_COMP_INT',
      nodeB: node('rigol_comp_sig'),
      ohms: 1000,
      maxWatts: 1,
    });
  }

  const findProbeMeta = (target: 'rigol_ch1' | 'rigol_ch2') => {
    const cable = params.cables.find((c) => (c.endA === target || c.endB === target) && c.endA && c.endB);
    return {
      connected: Boolean(cable),
      probeAtten: cable?.probeAtten ?? 1,
      probeCompTrim: cable?.probeCompTrim ?? 0,
    };
  };

  const ch1Meta = findProbeMeta('rigol_ch1');
  const ch2Meta = findProbeMeta('rigol_ch2');

  // Rigol CH1 / CH2 1MΩ//15pF (1X) or 10MΩ//12pF (10X physical probe) input loads
  const addScopeLoad = (ch: 'ch1' | 'ch2', physAtten: number) => {
    const sig = node(ch === 'ch1' ? 'rigol_ch1' : 'rigol_ch2');
    const ref = node(ch === 'ch1' ? 'rigol_ch1_gnd' : 'rigol_ch2_gnd');
    if (sig === ref) return;
    const rIn = physAtten >= 10 ? 1e7 : 1e6;
    const cIn = physAtten >= 10 ? 12e-12 : 15e-12;
    components.push({ id: `rigol_${ch}_rin`, kind: 'resistor', nodeA: sig, nodeB: ref, ohms: rIn, maxWatts: 100 });
    components.push({ id: `rigol_${ch}_cin`, kind: 'capacitor', nodeA: sig, nodeB: ref, farads: cIn });
  };
  addScopeLoad('ch1', ch1Meta.connected ? ch1Meta.probeAtten : params.ch1ProbeAtten);
  addScopeLoad('ch2', ch2Meta.connected ? ch2Meta.probeAtten : params.ch2ProbeAtten);

  // Rigol DG1012 Dual-Channel 50Ω Function/Arbitrary Waveform Generator (CH1 + CH2)
  if (params.signalGen.power && params.signalGen.outputEnabled && connectedSockets.has('gen_out')) {
    // In 50Ω load mode, DG1012 assumes a 50Ω termination divider so open-circuit EMF = 2 × Vpp
    const loadMult = params.signalGen.loadMode === '50ohm' ? 2.0 : 1.0;
    const scale = (params.signalGen.attenuator20dB ? 0.1 : 1.0) * loadMult;
    components.push({
      id: 'gen_vsrc',
      kind: 'vsource_func',
      nodePos: 'N_GEN_INT',
      nodeNeg: node('gen_gnd'),
      waveform: params.signalGen.waveform,
      freqHz: params.signalGen.freqHz,
      amplitudePeak: params.signalGen.vpp * 0.5 * scale,
      dcOffset: params.signalGen.dcOffset * scale,
      dutyPct: params.signalGen.dutyPct,
      phaseDeg: params.signalGen.phaseDeg ?? 0,
      inverted: params.signalGen.inverted ?? false,
      modMode: params.signalGen.modMode ?? 'OFF',
      modFreqHz: params.signalGen.modFreqHz ?? 100,
      modDepthPct: params.signalGen.modDepthPct ?? 80,
    });
    components.push({ id: 'gen_r50', kind: 'resistor', nodeA: 'N_GEN_INT', nodeB: node('gen_out'), ohms: 50, maxWatts: 5 });
  } else if (connectedSockets.has('gen_out')) {
    // Real DG1012 opens its mechanical output relay when Output is OFF (High-Z leakage, never shorts external circuits!)
    components.push({ id: 'gen_off_leak', kind: 'resistor', nodeA: node('gen_out'), nodeB: node('gen_gnd'), ohms: 1e7, maxWatts: 5 });
  }

  // Independent DG1012 Channel 2 Output (CH2/Counter BNC)
  if (params.signalGen.power && params.signalGen.ch2OutputEnabled && connectedSockets.has('gen_ch2_out')) {
    const ch2LoadMult = params.signalGen.ch2LoadMode === '50ohm' ? 2.0 : 1.0;
    components.push({
      id: 'gen_ch2_vsrc',
      kind: 'vsource_func',
      nodePos: 'N_GEN2_INT',
      nodeNeg: node('gen_gnd'),
      waveform: params.signalGen.ch2Waveform ?? 'triangle',
      freqHz: params.signalGen.ch2FreqHz ?? 1500,
      amplitudePeak: (params.signalGen.ch2Vpp ?? 4.0) * 0.5 * ch2LoadMult,
      dcOffset: (params.signalGen.ch2DcOffset ?? 0) * ch2LoadMult,
      dutyPct: params.signalGen.ch2DutyPct ?? 50,
      phaseDeg: params.signalGen.ch2PhaseDeg ?? 0,
      inverted: params.signalGen.ch2Inverted ?? false,
    });
    components.push({ id: 'gen_ch2_r50', kind: 'resistor', nodeA: 'N_GEN2_INT', nodeB: node('gen_ch2_out'), ohms: 50, maxWatts: 5 });
  } else if (connectedSockets.has('gen_ch2_out')) {
    components.push({ id: 'gen_ch2_off_leak', kind: 'resistor', nodeA: node('gen_ch2_out'), nodeB: node('gen_gnd'), ohms: 1e7, maxWatts: 5 });
  }

  // Dual DC Power Supply
  if (params.powerSupply.power && params.powerSupply.outputEnabled) {
    components.push({
      id: 'psu_ch1_src',
      kind: 'vsource_dc',
      nodePos: 'N_PSU1_INT',
      nodeNeg: node('psu_ch1_neg'),
      volts: params.powerSupply.ch1Voltage,
      currentLimitAmps: params.powerSupply.ch1CurrentLimit,
    });
    components.push({ id: 'psu_ch1_rint', kind: 'resistor', nodeA: 'N_PSU1_INT', nodeB: node('psu_ch1_pos'), ohms: 0.05, maxWatts: 50 });

    components.push({
      id: 'psu_ch2_src',
      kind: 'vsource_dc',
      nodePos: 'N_PSU2_INT',
      nodeNeg: node('psu_ch2_neg'),
      volts: params.powerSupply.ch2Voltage,
      currentLimitAmps: params.powerSupply.ch2CurrentLimit,
    });
    components.push({ id: 'psu_ch2_rint', kind: 'resistor', nodeA: 'N_PSU2_INT', nodeB: node('psu_ch2_pos'), ohms: 0.05, maxWatts: 50 });
  }

  // Breadboard placed components
  if (params.breadboardParts && params.breadboardParts.length > 0) {
    components.push(...compileBreadboardParts(params.breadboardParts, node));
  }

  // DMM Input Impedance & Current Shunt Loads (Rigol DM3058)
  const dmmPos = node('dmm_pos');
  const dmmCom = node('dmm_com');
  const dmmCurr = node('dmm_i');
  const dmmSenseHi = node('dmm_sense_hi');
  const dmmSenseLo = node('dmm_sense_lo');
  const dmmConnectedMain = connectedSockets.has('dmm_pos') && connectedSockets.has('dmm_com') && dmmPos !== dmmCom;
  const dmmConnectedCurr = connectedSockets.has('dmm_i') && connectedSockets.has('dmm_com') && dmmCurr !== dmmCom;
  const dmmConnectedSense =
    connectedSockets.has('dmm_sense_hi') && connectedSockets.has('dmm_sense_lo') && dmmSenseHi !== dmmSenseLo;

  const dmmFunc = params.dmm?.func ?? 'DCV';
  const shuntOhms =
    (dmmFunc === 'DCI' && (params.dmm?.rangeIndex ?? 3) >= 4) ||
    (dmmFunc === 'ACI' && (params.dmm?.rangeIndex ?? 1) >= 2)
      ? 0.1
      : 1.0;

  if (params.dmm?.power) {
    const isPassiveMain =
      dmmFunc === '2WR' || dmmFunc === '4WR' || dmmFunc === 'CONT' || dmmFunc === 'DIODE' || dmmFunc === 'CAP';
    if (dmmConnectedMain && !isPassiveMain) {
      const rIn =
        params.dmm.inputZ === '>10G' && (params.dmm.autoRange || params.dmm.rangeIndex <= 1) ? 1e10 : 1e7;
      components.push({
        id: 'dmm_load_v',
        kind: 'resistor',
        nodeA: dmmPos,
        nodeB: dmmCom,
        ohms: rIn,
        maxWatts: 25,
      });
    }
    if (dmmConnectedCurr) {
      components.push({
        id: 'dmm_load_i_shunt',
        kind: 'resistor',
        nodeA: dmmCurr,
        nodeB: dmmCom,
        ohms: shuntOhms,
        maxWatts: 15,
      });
    }
  }

  if (params.extraComponents) {
    components.push(...params.extraComponents);
  }

  const nodeNamesSet = new Set<string>([gnd]);
  for (const c of components) {
    if ('nodeA' in c) {
      nodeNamesSet.add(c.nodeA);
      nodeNamesSet.add(c.nodeB);
    } else if ('nodePos' in c) {
      nodeNamesSet.add(c.nodePos);
      nodeNamesSet.add(c.nodeNeg);
    } else if ('nodeOutPos' in c) {
      nodeNamesSet.add(c.nodeOutPos);
      nodeNamesSet.add(c.nodeOutNeg);
      nodeNamesSet.add(c.nodeCtrlPos);
      nodeNamesSet.add(c.nodeCtrlNeg);
    } else if ('nodeAnode' in c) {
      nodeNamesSet.add(c.nodeAnode);
      nodeNamesSet.add(c.nodeCathode);
    } else if ('nodeC' in c) {
      nodeNamesSet.add(c.nodeC);
      nodeNamesSet.add(c.nodeB);
      nodeNamesSet.add(c.nodeE);
    }
  }
  nodeNamesSet.add(node('rigol_ch1'));
  nodeNamesSet.add(node('rigol_ch2'));
  nodeNamesSet.add(node('rigol_ext'));
  nodeNamesSet.add(dmmPos);
  nodeNamesSet.add(dmmCom);
  nodeNamesSet.add(dmmCurr);
  nodeNamesSet.add(dmmSenseHi);
  nodeNamesSet.add(dmmSenseLo);

  const bbNodeMap: Record<string, string> = {};
  if (params.breadboardParts && params.breadboardParts.length > 0) {
    for (const part of params.breadboardParts) {
      for (const h of [part.holeA, part.holeB]) {
        const key = holeIdToElectricalNode(h);
        bbNodeMap[key] = node(`bb_${h}`);
      }
    }
  }
  for (const cable of params.cables) {
    for (const sock of [cable.endA, cable.endB, cable.gndClip]) {
      if (sock && sock.startsWith('bb_') && !sock.startsWith('bb_float_')) {
        const key = holeIdToElectricalNode(sock);
        bbNodeMap[key] = node(sock);
      }
    }
  }

  return {
    groundNode: gnd,
    nodeNames: Array.from(nodeNamesSet),
    components,
    bbNodeMap,
    probeNodes: {
      ch1: {
        signalNode: node('rigol_ch1'),
        refNode: node('rigol_ch1_gnd'),
        connected: ch1Meta.connected,
        isProbeComp: ch1ProbesComp,
        probeAtten: ch1Meta.probeAtten,
        probeCompTrim: ch1Meta.probeCompTrim,
      },
      ch2: {
        signalNode: node('rigol_ch2'),
        refNode: node('rigol_ch2_gnd'),
        connected: ch2Meta.connected,
        isProbeComp: ch2ProbesComp,
        probeAtten: ch2Meta.probeAtten,
        probeCompTrim: ch2Meta.probeCompTrim,
      },
      ext: {
        signalNode: node('rigol_ext'),
        refNode: gnd,
        connected: connectedSockets.has('rigol_ext'),
        probeAtten: 1,
        probeCompTrim: 0,
      },
    },
    dmmNodes: {
      posNode: dmmPos,
      comNode: dmmCom,
      currNode: dmmCurr,
      senseHiNode: dmmSenseHi,
      senseLoNode: dmmSenseLo,
      shuntOhms,
      connectedMain: dmmConnectedMain,
      connectedCurrent: dmmConnectedCurr,
      connectedSense: dmmConnectedSense,
      connected: dmmConnectedMain,
    },
  };
}
