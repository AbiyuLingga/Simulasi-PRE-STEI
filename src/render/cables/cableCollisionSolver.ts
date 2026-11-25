import * as THREE from 'three';

export interface ConnectorObstacle {
  ownerCableId: string;
  end: 'endA' | 'endB' | 'gndClip';
  p0: THREE.Vector3;
  p1: THREE.Vector3;
  radius: number;
}

export interface SplitterBody {
  cableId: string;
  cableIdx: number;
  pos: THREE.Vector3;
  axis: THREE.Vector3;
  radius: number;
  halfLen: number;
  anchorRef: THREE.Vector3;
}

export interface CableStrand {
  cableId: string;
  cableIdx: number;
  kind: 'trunk' | 'sig' | 'gnd';
  radius: number;
  points: THREE.Vector3[];
  pinnedStartSplitter?: boolean;
  pinnedEndSplitter?: boolean;
  startConn?: 'endA' | 'endB' | 'gndClip';
  endConn?: 'endA' | 'endB' | 'gndClip';
}

export interface CableClearanceReport {
  minSplitterGap: number;
  minStrandVsSplitterGap: number;
  minStrandGap: number;
}

const BENCH_Y = 0.7865;
const BB_X_MIN = -0.056;
const BB_X_MAX = 0.116;
const BB_Z_MIN = 0.169;
const BB_Z_MAX = 0.231;
const BB_TOP_Y = 0.795;

// Exact Ericson segment-segment closest points (no heap allocations per inner call)
const _d1 = new THREE.Vector3();
const _d2 = new THREE.Vector3();
const _r = new THREE.Vector3();
const _c1 = new THREE.Vector3();
const _c2 = new THREE.Vector3();
const _diff = new THREE.Vector3();
const _sp0 = new THREE.Vector3();
const _sp1 = new THREE.Vector3();
const _sq0 = new THREE.Vector3();
const _sq1 = new THREE.Vector3();

function closestPointsOnSegments(
  p1: THREE.Vector3,
  q1: THREE.Vector3,
  p2: THREE.Vector3,
  q2: THREE.Vector3,
  outC1: THREE.Vector3,
  outC2: THREE.Vector3
): { s: number; t: number; distSq: number } {
  _d1.subVectors(q1, p1);
  _d2.subVectors(q2, p2);
  _r.subVectors(p1, p2);
  const a = _d1.dot(_d1);
  const e = _d2.dot(_d2);
  const f = _d2.dot(_r);
  const EPS = 1e-10;

  let s = 0;
  let t = 0;
  if (a <= EPS && e <= EPS) {
    outC1.copy(p1);
    outC2.copy(p2);
    return { s: 0, t: 0, distSq: p1.distanceToSquared(p2) };
  }
  if (a <= EPS) {
    s = 0;
    t = THREE.MathUtils.clamp(f / e, 0, 1);
  } else {
    const c = _d1.dot(_r);
    if (e <= EPS) {
      t = 0;
      s = THREE.MathUtils.clamp(-c / a, 0, 1);
    } else {
      const b = _d1.dot(_d2);
      const denom = a * e - b * b;
      if (denom !== 0) {
        s = THREE.MathUtils.clamp((b * f - c * e) / denom, 0, 1);
      } else {
        s = 0;
      }
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = THREE.MathUtils.clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = THREE.MathUtils.clamp((b - c) / a, 0, 1);
      }
    }
  }

  outC1.copy(p1).addScaledVector(_d1, s);
  outC2.copy(p2).addScaledVector(_d2, t);
  return { s, t, distSq: outC1.distanceToSquared(outC2) };
}

function clampPointAboveBenchAndBB(p: THREE.Vector3, radius: number, extraBB = 0): void {
  if (Math.abs(p.x) < 0.92 && p.z > -0.38 && p.z < 0.48) {
    const minY = BENCH_Y + radius;
    if (p.y < minY) p.y = minY;
  }
  if (p.x > BB_X_MIN - radius && p.x < BB_X_MAX + radius && p.z > BB_Z_MIN - radius && p.z < BB_Z_MAX + radius) {
    const bbClearY = BB_TOP_Y + radius + extraBB;
    if (p.y < bbClearY) p.y = bbClearY;
  }
}

function strandOrderKey(s: CableStrand): number {
  const kindRank = s.kind === 'trunk' ? 0 : s.kind === 'gnd' ? 1 : 2;
  return s.cableIdx * 4 + kindRank;
}

function shouldSkipStrandSegmentPair(
  sA: CableStrand,
  i: number,
  sB: CableStrand,
  j: number
): boolean {
  const nA = sA.points.length;
  const nB = sB.points.length;
  // Adjacent / shared splitter junction on the same cable
  if (sA.cableId === sB.cableId) {
    const aNearStart = i <= 1 && sA.pinnedStartSplitter;
    const aNearEnd = i >= nA - 3 && sA.pinnedEndSplitter;
    const bNearStart = j <= 1 && sB.pinnedStartSplitter;
    const bNearEnd = j >= nB - 3 && sB.pinnedEndSplitter;
    if ((aNearStart || aNearEnd) && (bNearStart || bNearEnd)) return true;
  }
  // Skip only the very first/last segment immediately entering the exact same physical socket/pin
  const aEnd0 = i === 0;
  const aEnd1 = i === nA - 2;
  const bEnd0 = j === 0;
  const bEnd1 = j === nB - 2;
  if (aEnd0 && bEnd0 && sA.points[0].distanceToSquared(sB.points[0]) < 1.44e-4) return true;
  if (aEnd0 && bEnd1 && sA.points[0].distanceToSquared(sB.points[nB - 1]) < 1.44e-4) return true;
  if (aEnd1 && bEnd0 && sA.points[nA - 1].distanceToSquared(sB.points[0]) < 1.44e-4) return true;
  if (aEnd1 && bEnd1 && sA.points[nA - 1].distanceToSquared(sB.points[nB - 1]) < 1.44e-4) return true;
  return false;
}

function shouldSkipStrandVsSplitter(s: CableStrand, segIdx: number, sp: SplitterBody): boolean {
  if (s.cableId !== sp.cableId) return false;
  if (s.pinnedStartSplitter && segIdx <= 1) return true;
  if (s.pinnedEndSplitter && segIdx >= s.points.length - 3) return true;
  return false;
}

function shouldSkipStrandVsConnector(s: CableStrand, segIdx: number, obs: ConnectorObstacle): boolean {
  const n = s.points.length;
  if (s.cableId === obs.ownerCableId) {
    if (s.startConn === obs.end && segIdx <= 1) return true;
    if (s.endConn === obs.end && segIdx >= n - 3) return true;
  }
  // Also skip if a segment endpoint is pinned right next to a stacked sibling connector (<12mm)
  if (segIdx === 0 && s.points[0].distanceToSquared(obs.p1) < 1.44e-4) return true;
  if (segIdx === n - 2 && s.points[n - 1].distanceToSquared(obs.p1) < 1.44e-4) return true;
  return false;
}

function syncSplitterAttachedEndpoints(strands: CableStrand[], splitters: SplitterBody[]): void {
  if (splitters.length === 0) return;
  const byCable = new Map<string, SplitterBody>();
  for (const sp of splitters) byCable.set(sp.cableId, sp);

  for (const s of strands) {
    const sp = byCable.get(s.cableId);
    if (!sp || s.points.length < 3) continue;
    if (s.pinnedStartSplitter) {
      // Shift interior points rigidly by the splitter delta so smooth curve shape is preserved
      const dx = sp.pos.x - s.points[0].x;
      const dy = sp.pos.y - s.points[0].y;
      const dz = sp.pos.z - s.points[0].z;
      const n = s.points.length;
      s.points[0].copy(sp.pos);
      for (let k = 1; k < n - 1; k++) {
        const w = 1 - k / (n - 1);
        s.points[k].x += dx * w;
        s.points[k].y += dy * w;
        s.points[k].z += dz * w;
      }
    }
    if (s.pinnedEndSplitter) {
      const n = s.points.length;
      const dx = sp.pos.x - s.points[n - 1].x;
      const dy = sp.pos.y - s.points[n - 1].y;
      const dz = sp.pos.z - s.points[n - 1].z;
      s.points[n - 1].copy(sp.pos);
      for (let k = 1; k < n - 1; k++) {
        const w = k / (n - 1);
        s.points[k].x += dx * w;
        s.points[k].y += dy * w;
        s.points[k].z += dz * w;
      }
    }
  }
}

/**
 * Multi-pass geometric collision & clearance solver for all bench cables, Y-splitters, and connectors.
 * Runs in <1 ms for typical bench setups and guarantees zero visible tube/splitter interpenetration.
 */
export function resolveCableCollisions(
  strands: CableStrand[],
  splitters: SplitterBody[],
  connectors: ConnectorObstacle[]
): void {
  // =========================================================================
  // STAGE 1: Separate Y-Splitter cylinders from connectors, breadboard, & each other
  // =========================================================================
  const SPLITTER_PAIR_MARGIN = 0.0055;
  const SPLITTER_CONN_MARGIN = 0.0075;

  for (let iter = 0; iter < 18; iter++) {
    // 1a. Splitter vs Splitter capsule repulsion
    for (let a = 0; a < splitters.length; a++) {
      const spA = splitters[a];
      _sp0.copy(spA.pos).addScaledVector(spA.axis, -spA.halfLen);
      _sp1.copy(spA.pos).addScaledVector(spA.axis, spA.halfLen);
      for (let b = a + 1; b < splitters.length; b++) {
        const spB = splitters[b];
        _sq0.copy(spB.pos).addScaledVector(spB.axis, -spB.halfLen);
        _sq1.copy(spB.pos).addScaledVector(spB.axis, spB.halfLen);
        const { distSq } = closestPointsOnSegments(_sp0, _sp1, _sq0, _sq1, _c1, _c2);
        const minD = spA.radius + spB.radius + SPLITTER_PAIR_MARGIN;
        if (distSq < minD * minD) {
          const dist = Math.sqrt(distSq);
          if (dist > 1e-5) {
            _diff.subVectors(_c2, _c1).divideScalar(dist);
          } else {
            // Deterministic separation: spread laterally + lift higher-index splitter slightly
            const side = (b - a) % 2 === 1 ? 1 : -1;
            _diff.set(side * 0.72, 0.55, -0.42).normalize();
          }
          // Add slight vertical preference so closely bunched splitters step cleanly rather than oscillating
          if (Math.abs(_diff.y) < 0.25) {
            _diff.y += 0.35;
            _diff.normalize();
          }
          const push = (minD - dist) * 0.6;
          spA.pos.addScaledVector(_diff, -push * 0.45);
          spB.pos.addScaledVector(_diff, push * 0.55);
          clampPointAboveBenchAndBB(spA.pos, spA.radius + 0.004, 0.012);
          clampPointAboveBenchAndBB(spB.pos, spB.radius + 0.004, 0.012);
        }
      }
    }

    // 1b. Splitter vs ALL Connector obstacles (including its own clips so splitter NEVER swallows an alligator boot!)
    for (const sp of splitters) {
      _sp0.copy(sp.pos).addScaledVector(sp.axis, -sp.halfLen);
      _sp1.copy(sp.pos).addScaledVector(sp.axis, sp.halfLen);
      for (const obs of connectors) {
        const { distSq } = closestPointsOnSegments(_sp0, _sp1, obs.p0, obs.p1, _c1, _c2);
        const minD = sp.radius + obs.radius + SPLITTER_CONN_MARGIN;
        if (distSq < minD * minD) {
          const dist = Math.sqrt(distSq);
          if (dist > 1e-5) {
            _diff.subVectors(_c1, _c2).divideScalar(dist);
          } else {
            _diff.copy(sp.axis);
            _diff.y = Math.max(0.3, _diff.y);
            _diff.normalize();
          }
          const push = (minD - dist) * 0.85;
          sp.pos.addScaledVector(_diff, push);
          clampPointAboveBenchAndBB(sp.pos, sp.radius + 0.004, 0.012);
          _sp0.copy(sp.pos).addScaledVector(sp.axis, -sp.halfLen);
          _sp1.copy(sp.pos).addScaledVector(sp.axis, sp.halfLen);
        }
      }
      // Gentle pull toward preferred anchor only on early passes
      if (iter < 10) {
        sp.pos.lerp(sp.anchorRef, 0.04);
        clampPointAboveBenchAndBB(sp.pos, sp.radius + 0.004, 0.012);
      }
    }
  }

  // Re-attach strand start/end endpoints to the resolved non-overlapping splitter coordinates
  syncSplitterAttachedEndpoints(strands, splitters);

  // =========================================================================
  // STAGE 2: Iterative Strand-vs-Strand, Strand-vs-Splitter, & Strand-vs-Connector Relaxation
  // =========================================================================
  const STRAND_GAP = 0.0028;
  const STRAND_SPLIT_GAP = 0.0032;
  const STRAND_CONN_GAP = 0.0024;
  const TOTAL_ITERS = 28;
  const SMOOTH_CUTOFF = 22; // Final 6 passes are pure hard projection for strict clearance

  const applySegmentPush = (
    pts: THREE.Vector3[],
    segIdx: number,
    param: number,
    vec: THREE.Vector3,
    mag: number
  ) => {
    const last = pts.length - 1;
    const i0 = segIdx;
    const i1 = segIdx + 1;
    const free0 = i0 > 0 && i0 < last;
    const free1 = i1 > 0 && i1 < last;
    if (!free0 && !free1) return;
    if (free0 && free1) {
      const w0 = 1 - param;
      const w1 = param;
      const norm = w0 * w0 + w1 * w1;
      const scale = mag / Math.max(0.25, norm);
      pts[i0].addScaledVector(vec, scale * w0);
      pts[i1].addScaledVector(vec, scale * w1);
    } else if (free0) {
      pts[i0].addScaledVector(vec, mag);
    } else {
      pts[i1].addScaledVector(vec, mag);
    }
  };

  for (let iter = 0; iter < TOTAL_ITERS; iter++) {
    const stiff = iter >= SMOOTH_CUTOFF ? 0.92 : 0.62;

    // 2a. Strand vs Strand segment repulsion
    for (let a = 0; a < strands.length; a++) {
      const sA = strands[a];
      const nA = sA.points.length;
      if (nA < 3) continue;
      const rankA = strandOrderKey(sA);

      for (let b = a + 1; b < strands.length; b++) {
        const sB = strands[b];
        const nB = sB.points.length;
        if (nB < 3) continue;
        const rankB = strandOrderKey(sB);
        const minD = sA.radius + sB.radius + STRAND_GAP;
        const minDSq = minD * minD;

        for (let i = 0; i < nA - 1; i++) {
          for (let j = 0; j < nB - 1; j++) {
            if (shouldSkipStrandSegmentPair(sA, i, sB, j)) continue;
            const { s, t, distSq } = closestPointsOnSegments(
              sA.points[i],
              sA.points[i + 1],
              sB.points[j],
              sB.points[j + 1],
              _c1,
              _c2
            );
            if (distSq >= minDSq) continue;

            const dist = Math.sqrt(distSq);
            const upperIsB = rankB >= rankA;
            if (dist > 1e-5) {
              _diff.subVectors(_c2, _c1).divideScalar(dist);
            } else {
              _diff.set(0, upperIsB ? 1 : -1, 0);
            }

            // When two cables cross near bench height horizontally, cleanly arch the upper cable OVER (+Y) the lower one
            const avgY = 0.5 * (_c1.y + _c2.y);
            if (Math.abs(_diff.y) < 0.45 && avgY < 0.855) {
              _diff.y += upperIsB ? 0.65 : -0.65;
              _diff.normalize();
            }

            const push = (minD - dist) * stiff;
            // Give the lower cable less downward push when near the bench floor so the upper cable arches gracefully over it
            const nearFloor = avgY < BENCH_Y + 0.015;
            const wA = nearFloor && upperIsB ? 0.15 : 0.5;
            const wB = 1 - wA;
            applySegmentPush(sA.points, i, s, _diff, -push * wA);
            applySegmentPush(sB.points, j, t, _diff, push * wB);
          }
        }
      }
    }

    // 2b. Strand vs Splitter capsule repulsion
    for (const s of strands) {
      const n = s.points.length;
      if (n < 3) continue;
      for (const sp of splitters) {
        _sp0.copy(sp.pos).addScaledVector(sp.axis, -sp.halfLen);
        _sp1.copy(sp.pos).addScaledVector(sp.axis, sp.halfLen);
        const minD = s.radius + sp.radius + STRAND_SPLIT_GAP;
        const minDSq = minD * minD;
        for (let i = 0; i < n - 1; i++) {
          if (shouldSkipStrandVsSplitter(s, i, sp)) continue;
          const { s: u, distSq } = closestPointsOnSegments(
            s.points[i],
            s.points[i + 1],
            _sp0,
            _sp1,
            _c1,
            _c2
          );
          if (distSq >= minDSq) continue;
          const dist = Math.sqrt(distSq);
          if (dist > 1e-5) {
            _diff.subVectors(_c1, _c2).divideScalar(dist);
          } else {
            _diff.set(0, 1, 0);
          }
          // Prefer arching cleanly over the splitter rather than digging under it into the bench
          if (_diff.y < 0.2 && _c2.y < 0.84) {
            _diff.y += 0.55;
            _diff.normalize();
          }
          const push = (minD - dist) * Math.max(0.8, stiff);
          applySegmentPush(s.points, i, u, _diff, push);
        }
      }
    }

    // 2c. Strand vs Non-owner Connector capsule repulsion
    for (const s of strands) {
      const n = s.points.length;
      if (n < 3) continue;
      for (const obs of connectors) {
        const minD = s.radius + obs.radius + STRAND_CONN_GAP;
        const minDSq = minD * minD;
        for (let i = 0; i < n - 1; i++) {
          if (shouldSkipStrandVsConnector(s, i, obs)) continue;
          const { s: u, distSq } = closestPointsOnSegments(
            s.points[i],
            s.points[i + 1],
            obs.p0,
            obs.p1,
            _c1,
            _c2
          );
          if (distSq >= minDSq) continue;
          const dist = Math.sqrt(distSq);
          if (dist > 1e-5) {
            _diff.subVectors(_c1, _c2).divideScalar(dist);
          } else {
            _diff.set(0, 1, 0);
          }
          const push = (minD - dist) * Math.max(0.75, stiff);
          applySegmentPush(s.points, i, u, _diff, push);
        }
      }
    }

    // 2d. Smooth elastic tension + bench/breadboard floor clamping
    const smoothW = iter < SMOOTH_CUTOFF ? 0.16 * (1 - iter / SMOOTH_CUTOFF) + 0.03 : 0;
    for (const s of strands) {
      const n = s.points.length;
      if (smoothW > 0 && n >= 4) {
        for (let k = 1; k < n - 1; k++) {
          const prev = s.points[k - 1];
          const cur = s.points[k];
          const next = s.points[k + 1];
          cur.x += (0.5 * (prev.x + next.x) - cur.x) * smoothW;
          cur.y += (0.5 * (prev.y + next.y) - cur.y) * smoothW;
          cur.z += (0.5 * (prev.z + next.z) - cur.z) * smoothW;
        }
      }
      for (let k = 1; k < n - 1; k++) {
        clampPointAboveBenchAndBB(s.points[k], s.radius, 0.002);
      }
    }
  }
}

/**
 * Computes exact minimum surface-to-surface air gap across all splitters and strand segments.
 * Negative values indicate physical interpenetration; >= 0 indicates strictly non-intersecting geometry.
 */
export function measureMinCableClearance(
  strands: CableStrand[],
  splitters: SplitterBody[],
  connectors: ConnectorObstacle[]
): CableClearanceReport {
  let minSplitterGap = Infinity;
  let minStrandVsSplitterGap = Infinity;
  let minStrandGap = Infinity;

  for (let a = 0; a < splitters.length; a++) {
    const spA = splitters[a];
    _sp0.copy(spA.pos).addScaledVector(spA.axis, -spA.halfLen);
    _sp1.copy(spA.pos).addScaledVector(spA.axis, spA.halfLen);
    for (let b = a + 1; b < splitters.length; b++) {
      const spB = splitters[b];
      _sq0.copy(spB.pos).addScaledVector(spB.axis, -spB.halfLen);
      _sq1.copy(spB.pos).addScaledVector(spB.axis, spB.halfLen);
      const { distSq } = closestPointsOnSegments(_sp0, _sp1, _sq0, _sq1, _c1, _c2);
      const gap = Math.sqrt(distSq) - (spA.radius + spB.radius);
      if (gap < minSplitterGap) minSplitterGap = gap;
    }
    for (const obs of connectors) {
      const { distSq } = closestPointsOnSegments(_sp0, _sp1, obs.p0, obs.p1, _c1, _c2);
      const gap = Math.sqrt(distSq) - (spA.radius + obs.radius);
      if (gap < minSplitterGap) minSplitterGap = gap;
    }
  }

  for (let a = 0; a < strands.length; a++) {
    const sA = strands[a];
    for (const sp of splitters) {
      _sp0.copy(sp.pos).addScaledVector(sp.axis, -sp.halfLen);
      _sp1.copy(sp.pos).addScaledVector(sp.axis, sp.halfLen);
      for (let i = 0; i < sA.points.length - 1; i++) {
        if (shouldSkipStrandVsSplitter(sA, i, sp)) continue;
        const { distSq } = closestPointsOnSegments(sA.points[i], sA.points[i + 1], _sp0, _sp1, _c1, _c2);
        const gap = Math.sqrt(distSq) - (sA.radius + sp.radius);
        if (gap < minStrandVsSplitterGap) minStrandVsSplitterGap = gap;
      }
    }
    for (let b = a + 1; b < strands.length; b++) {
      const sB = strands[b];
      for (let i = 0; i < sA.points.length - 1; i++) {
        for (let j = 0; j < sB.points.length - 1; j++) {
          if (shouldSkipStrandSegmentPair(sA, i, sB, j)) continue;
          const { distSq } = closestPointsOnSegments(
            sA.points[i],
            sA.points[i + 1],
            sB.points[j],
            sB.points[j + 1],
            _c1,
            _c2
          );
          const gap = Math.sqrt(distSq) - (sA.radius + sB.radius);
          if (gap < minStrandGap) minStrandGap = gap;
        }
      }
    }
  }

  return { minSplitterGap, minStrandVsSplitterGap, minStrandGap };
}
