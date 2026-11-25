import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  measureMinCableClearance,
  resolveCableCollisions,
  type CableStrand,
  type ConnectorObstacle,
  type SplitterBody,
} from '../cableCollisionSolver';

describe('3D Cable-to-Cable & Splitter Collision Avoidance Solver', () => {
  it('separates crossing coaxial trunks, Y-splitters, and alligator branches near the breadboard with zero interpenetration', () => {
    // Reproduce exact user screenshot scenario:
    // Cable 0 (red Gen BNC-Alligator) + Cable 1 (yellow CH1 BNC-Alligator) + Cable 2 (cyan CH2 BNC-Alligator)
    // all converging onto adjacent breadboard floating jumpers with overlapping splitters and crossing trunks!
    const connectors: ConnectorObstacle[] = [
      {
        ownerCableId: 'gen',
        end: 'endB',
        p0: new THREE.Vector3(-0.025, 0.815, 0.180),
        p1: new THREE.Vector3(-0.025, 0.844, 0.180),
        radius: 0.0052,
      },
      {
        ownerCableId: 'gen',
        end: 'gndClip',
        p0: new THREE.Vector3(-0.018, 0.815, 0.172),
        p1: new THREE.Vector3(-0.018, 0.844, 0.172),
        radius: 0.0052,
      },
      {
        ownerCableId: 'ch1',
        end: 'endB',
        p0: new THREE.Vector3(-0.022, 0.815, 0.182),
        p1: new THREE.Vector3(-0.022, 0.844, 0.182),
        radius: 0.0052,
      },
      {
        ownerCableId: 'ch1',
        end: 'gndClip',
        p0: new THREE.Vector3(-0.016, 0.815, 0.174),
        p1: new THREE.Vector3(-0.016, 0.844, 0.174),
        radius: 0.0052,
      },
      {
        ownerCableId: 'ch2',
        end: 'endB',
        p0: new THREE.Vector3(0.005, 0.815, 0.180),
        p1: new THREE.Vector3(0.005, 0.844, 0.180),
        radius: 0.0052,
      },
      {
        ownerCableId: 'ch2',
        end: 'gndClip',
        p0: new THREE.Vector3(-0.012, 0.815, 0.172),
        p1: new THREE.Vector3(-0.012, 0.844, 0.172),
        radius: 0.0052,
      },
    ];

    // Intentionally place two Y-splitters at nearly the EXACT same overlapping coordinates (like before the fix!)
    const splitters: SplitterBody[] = [
      {
        cableId: 'gen',
        cableIdx: 0,
        pos: new THREE.Vector3(-0.020, 0.822, 0.120),
        axis: new THREE.Vector3(0.2, 0, -0.98).normalize(),
        radius: 0.0062,
        halfLen: 0.0085,
        anchorRef: new THREE.Vector3(-0.020, 0.822, 0.120),
      },
      {
        cableId: 'ch1',
        cableIdx: 1,
        pos: new THREE.Vector3(-0.019, 0.822, 0.121),
        axis: new THREE.Vector3(0.85, 0, -0.52).normalize(),
        radius: 0.0062,
        halfLen: 0.0085,
        anchorRef: new THREE.Vector3(-0.019, 0.822, 0.121),
      },
      {
        cableId: 'ch2',
        cableIdx: 2,
        pos: new THREE.Vector3(-0.005, 0.822, 0.122),
        axis: new THREE.Vector3(0.92, 0, -0.39).normalize(),
        radius: 0.0062,
        halfLen: 0.0085,
        anchorRef: new THREE.Vector3(-0.005, 0.822, 0.122),
      },
    ];

    const makeLine = (a: THREE.Vector3, b: THREE.Vector3, n: number) =>
      Array.from({ length: n }, (_, i) => a.clone().lerp(b, i / (n - 1)));

    const strands: CableStrand[] = [
      // Gen trunk (goes toward DG1012 at x=0.07, y=0.83, z=-0.08) — intentionally crosses CH1 trunk!
      {
        cableId: 'gen',
        cableIdx: 0,
        kind: 'trunk',
        radius: 0.0025,
        points: makeLine(new THREE.Vector3(0.07, 0.83, -0.08), splitters[0].pos, 14),
        pinnedEndSplitter: true,
        startConn: 'endA',
      },
      {
        cableId: 'gen',
        cableIdx: 0,
        kind: 'sig',
        radius: 0.0017,
        points: makeLine(splitters[0].pos, connectors[0].p1, 9),
        pinnedStartSplitter: true,
        endConn: 'endB',
      },
      {
        cableId: 'gen',
        cableIdx: 0,
        kind: 'gnd',
        radius: 0.0017,
        points: makeLine(splitters[0].pos, connectors[1].p1, 9),
        pinnedStartSplitter: true,
        endConn: 'gndClip',
      },
      // CH1 trunk (goes toward Rigol CH1 at x=0.35, y=0.84, z=0.05) — cuts RIGHT through gen splitter initially!
      {
        cableId: 'ch1',
        cableIdx: 1,
        kind: 'trunk',
        radius: 0.0025,
        points: makeLine(new THREE.Vector3(0.35, 0.84, 0.05), splitters[1].pos, 14),
        pinnedEndSplitter: true,
        startConn: 'endA',
      },
      {
        cableId: 'ch1',
        cableIdx: 1,
        kind: 'sig',
        radius: 0.0017,
        points: makeLine(splitters[1].pos, connectors[2].p1, 9),
        pinnedStartSplitter: true,
        endConn: 'endB',
      },
      {
        cableId: 'ch1',
        cableIdx: 1,
        kind: 'gnd',
        radius: 0.0017,
        points: makeLine(splitters[1].pos, connectors[3].p1, 9),
        pinnedStartSplitter: true,
        endConn: 'gndClip',
      },
      // CH2 trunk (goes toward Rigol CH2 at x=0.39, y=0.84, z=0.05)
      {
        cableId: 'ch2',
        cableIdx: 2,
        kind: 'trunk',
        radius: 0.0025,
        points: makeLine(new THREE.Vector3(0.39, 0.84, 0.05), splitters[2].pos, 14),
        pinnedEndSplitter: true,
        startConn: 'endA',
      },
      {
        cableId: 'ch2',
        cableIdx: 2,
        kind: 'sig',
        radius: 0.0017,
        points: makeLine(splitters[2].pos, connectors[4].p1, 9),
        pinnedStartSplitter: true,
        endConn: 'endB',
      },
      {
        cableId: 'ch2',
        cableIdx: 2,
        kind: 'gnd',
        radius: 0.0017,
        points: makeLine(splitters[2].pos, connectors[5].p1, 9),
        pinnedStartSplitter: true,
        endConn: 'gndClip',
      },
    ];

    // Before solving: splitters & strands heavily interpenetrate (< 0 clearance!)
    const before = measureMinCableClearance(strands, splitters, connectors);
    expect(before.minSplitterGap).toBeLessThan(0);
    expect(before.minStrandGap).toBeLessThan(0);

    resolveCableCollisions(strands, splitters, connectors);

    // After solving: ZERO interpenetration between splitters, strands, or strand-vs-splitter!
    const after = measureMinCableClearance(strands, splitters, connectors);
    expect(after.minSplitterGap).toBeGreaterThanOrEqual(0.001);
    expect(after.minStrandVsSplitterGap).toBeGreaterThanOrEqual(0.0005);
    expect(after.minStrandGap).toBeGreaterThanOrEqual(0.0005);

    // All points stay strictly above tabletop bench surface (y >= 0.7865)
    for (const s of strands) {
      for (const p of s.points) {
        expect(p.y).toBeGreaterThanOrEqual(0.786);
      }
    }
  });

  it('arches one crossing bench cable cleanly over another without sinking below the tabletop', () => {
    // Exact perpendicular X-crossing at the exact same Y height (0.790) on the bench
    const makeLine = (a: THREE.Vector3, b: THREE.Vector3, n: number) =>
      Array.from({ length: n }, (_, i) => a.clone().lerp(b, i / (n - 1)));

    const strands: CableStrand[] = [
      {
        cableId: 'a',
        cableIdx: 0,
        kind: 'trunk',
        radius: 0.0025,
        points: makeLine(new THREE.Vector3(-0.2, 0.790, 0.0), new THREE.Vector3(0.2, 0.790, 0.0), 14),
      },
      {
        cableId: 'b',
        cableIdx: 1,
        kind: 'trunk',
        radius: 0.0025,
        points: makeLine(new THREE.Vector3(0.0, 0.790, -0.2), new THREE.Vector3(0.0, 0.790, 0.2), 14),
      },
    ];

    resolveCableCollisions(strands, [], []);
    const after = measureMinCableClearance(strands, [], []);
    expect(after.minStrandGap).toBeGreaterThanOrEqual(0.001);

    // Higher-index cable 'b' should arch smoothly UP over cable 'a' at the crossing (midpoint)
    const midA = strands[0].points[7];
    const midB = strands[1].points[7];
    expect(midB.y).toBeGreaterThan(midA.y + 0.004);
    expect(midA.y).toBeGreaterThanOrEqual(0.788);
  });
});
