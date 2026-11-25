import * as THREE from 'three';
import type { SocketId } from '../../simulation/circuit/types';

export interface SocketTransform {
  id: SocketId;
  label: string;
  kind: 'bnc' | 'banana' | 'lug' | 'pin' | 'float_pin';
  position: THREE.Vector3;
  normal: THREE.Vector3;
}

class SocketRegistry {
  private sockets = new Map<SocketId, SocketTransform>();

  register(id: SocketId, label: string, kind: SocketTransform['kind'], worldPos: THREE.Vector3, worldNormal: THREE.Vector3): void {
    this.sockets.set(id, {
      id,
      label,
      kind,
      position: worldPos.clone(),
      normal: worldNormal.clone().normalize(),
    });
  }

  unregister(id: SocketId): void {
    this.sockets.delete(id);
  }

  get(id: SocketId): SocketTransform | undefined {
    return this.sockets.get(id);
  }

  all(): SocketTransform[] {
    return Array.from(this.sockets.values());
  }

  findNearest(worldPoint: THREE.Vector3, maxRadiusMeters = 0.055): SocketTransform | null {
    let best: SocketTransform | null = null;
    let bestScore = maxRadiusMeters;
    for (const s of this.sockets.values()) {
      const d = s.position.distanceTo(worldPoint);
      if (d >= maxRadiusMeters) continue;
      // ponytail: prioritize raised floating jumper tips over flat breadboard surface snap points
      const score = s.kind === 'float_pin' ? Math.max(0, d - 0.014) : d;
      if (score < bestScore) {
        bestScore = score;
        best = s;
      }
    }
    return best;
  }
}

export const socketRegistry = new SocketRegistry();

const _tmpPos = new THREE.Vector3();
const _tmpQuat = new THREE.Quaternion();
const _tmpNormal = new THREE.Vector3();

/**
 * Register a static 3D instrument socket once from its world transform (zero per-frame allocations).
 */
export function registerObjectSocket(
  obj: THREE.Object3D | null,
  id: SocketId,
  label: string,
  kind: SocketTransform['kind'],
  localForward: 'y' | 'z' = 'z',
  tipOffset = 0
): void {
  if (!obj) return;
  let root: THREE.Object3D = obj;
  while (root.parent) root = root.parent;
  root.updateMatrixWorld(true);
  obj.getWorldPosition(_tmpPos);
  obj.getWorldQuaternion(_tmpQuat);
  if (localForward === 'y') _tmpNormal.set(0, 1, 0);
  else _tmpNormal.set(0, 0, 1);
  _tmpNormal.applyQuaternion(_tmpQuat).normalize();
  if (tipOffset !== 0) _tmpPos.addScaledVector(_tmpNormal, tipOffset);
  socketRegistry.register(id, label, kind, _tmpPos, _tmpNormal);
}
