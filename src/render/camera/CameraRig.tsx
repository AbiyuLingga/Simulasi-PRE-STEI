import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { hotRefs } from '../../state/hotRefs';
import { useLabStore, type CameraTarget } from '../../state/labStore';

const CAMERA_PRESETS: Record<CameraTarget, { pos: [number, number, number]; target: [number, number, number] }> = {
  bench: { pos: [0.02, 1.32, 0.98], target: [0.00, 0.85, -0.04] },
  rigol: { pos: [-0.244, 0.892, 0.195], target: [-0.26, 0.862, -0.11] },
  dmm: { pos: [0.479, 0.887, 0.400], target: [0.592, 0.845, 0.133] },
  kit: { pos: [-0.49, 0.94, 0.34], target: [-0.63, 0.86, 0.04] },
  bb: { pos: [0.03, 0.955, 0.345], target: [0.03, 0.794, 0.192] },
  gen: { pos: [0.058, 0.875, 0.155], target: [0.07, 0.844, -0.09] },
  psu: { pos: [0.30, 0.87, 0.20], target: [0.35, 0.85, -0.07] },
  pot: { pos: [0.282, 1.035, 0.365], target: [0.31, 0.808, 0.235] },
};

const MOVE_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyQ',
  'KeyE',
  'KeyC',
  'Space',
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

function lookToYawPitch(pos: [number, number, number], target: [number, number, number]): { yaw: number; pitch: number } {
  const dir = new THREE.Vector3(target[0] - pos[0], target[1] - pos[1], target[2] - pos[2]).normalize();
  return {
    pitch: Math.asin(THREE.MathUtils.clamp(dir.y, -0.98, 0.98)),
    yaw: Math.atan2(-dir.x, -dir.z),
  };
}

function shortestAngleDiff(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function CameraRig() {
  const cameraPresetSeq = useLabStore((s) => s.cameraPresetSeq);
  const { camera, gl } = useThree();

  const initialAngles = lookToYawPitch(CAMERA_PRESETS.bench.pos, CAMERA_PRESETS.bench.target);
  const posRef = useRef(new THREE.Vector3(...CAMERA_PRESETS.bench.pos));
  const velRef = useRef(new THREE.Vector3());
  const yawRef = useRef(initialAngles.yaw);
  const pitchRef = useRef(initialAngles.pitch);
  const dollyImpulseRef = useRef(0);

  const goalPosRef = useRef(new THREE.Vector3(...CAMERA_PRESETS.bench.pos));
  const goalYawRef = useRef(initialAngles.yaw);
  const goalPitchRef = useRef(initialAngles.pitch);
  const transitioningRef = useRef(false);
  const mountedRef = useRef(false);

  const keysRef = useRef(new Set<string>());
  const doubleTapSprintRef = useRef(false);
  const lastWTapMsRef = useRef(0);
  const dragRef = useRef<{ mode: 'none' | 'look' | 'pan'; lastX: number; lastY: number }>({
    mode: 'none',
    lastX: 0,
    lastY: 0,
  });
  const tmpDesired = useRef(new THREE.Vector3());
  const tmpDir = useRef(new THREE.Vector3());
  const tmpRight = useRef(new THREE.Vector3());
  const tmpUp = useRef(new THREE.Vector3());

  useEffect(() => {
    const target = useLabStore.getState().cameraTarget;
    const preset = CAMERA_PRESETS[target];
    const angles = lookToYawPitch(preset.pos, preset.target);
    goalPosRef.current.set(...preset.pos);
    goalYawRef.current = angles.yaw;
    goalPitchRef.current = angles.pitch;
    hotRefs.restoreCameraPose = null;

    if (!mountedRef.current) {
      mountedRef.current = true;
      posRef.current.copy(goalPosRef.current);
      yawRef.current = angles.yaw;
      pitchRef.current = angles.pitch;
      camera.position.copy(posRef.current);
      camera.rotation.order = 'YXZ';
      camera.rotation.set(pitchRef.current, yawRef.current, 0, 'YXZ');
      hotRefs.liveCameraPose = {
        pos: [posRef.current.x, posRef.current.y, posRef.current.z],
        yaw: yawRef.current,
        pitch: pitchRef.current,
      };
    } else {
      transitioningRef.current = true;
    }
  }, [camera, cameraPresetSeq]);

  useEffect(() => {
    const isTypingTarget = (t: EventTarget | null) =>
      t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      if (useLabStore.getState().breadboard2D) return;
      if (MOVE_KEYS.has(e.code)) {
        // Prevent browser shortcuts (Ctrl+S save, Ctrl+A select-all, Ctrl+D bookmark, Space scroll) while sprinting Minecraft-style
        if (e.code === 'Space' || (e.ctrlKey && (e.code === 'KeyA' || e.code === 'KeyS' || e.code === 'KeyD'))) {
          e.preventDefault();
        }
        if (e.code === 'KeyW' && !e.repeat) {
          const now = performance.now();
          if (now - lastWTapMsRef.current < 280) {
            doubleTapSprintRef.current = true;
          }
          lastWTapMsRef.current = now;
        }
        keysRef.current.add(e.code);
        if (e.code !== 'ControlLeft' && e.code !== 'ControlRight') {
          transitioningRef.current = false;
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code);
      if (e.code === 'KeyW') {
        doubleTapSprintRef.current = false;
      }
    };

    const onBlur = () => {
      keysRef.current.clear();
      doubleTapSprintRef.current = false;
      dragRef.current.mode = 'none';
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  useEffect(() => {
    const dom = gl.domElement;

    const onPointerDown = (e: PointerEvent) => {
      if (useLabStore.getState().breadboard2D) return;
      if (e.button === 2) {
        dragRef.current = { mode: 'look', lastX: e.clientX, lastY: e.clientY };
        transitioningRef.current = false;
      } else if (e.button === 1) {
        e.preventDefault();
        dragRef.current = { mode: 'pan', lastX: e.clientX, lastY: e.clientY };
        transitioningRef.current = false;
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (dragRef.current.mode === 'none') return;
      const dx = e.clientX - dragRef.current.lastX;
      const dy = e.clientY - dragRef.current.lastY;
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;

      const isBB = useLabStore.getState().breadboardMode;
      const hFactor = THREE.MathUtils.clamp((posRef.current.y - 0.78) / 0.45, 0.28, 1.0);

      if (dragRef.current.mode === 'look') {
        const yawSens = isBB ? 0.0017 : 0.0024;
        const pitchSens = isBB ? 0.0015 : 0.0022;
        yawRef.current -= dx * yawSens;
        pitchRef.current = THREE.MathUtils.clamp(pitchRef.current - dy * pitchSens, -1.38, 1.22);
      } else {
        // Middle-drag precision screen-space pan (especially handy for fine breadboard layout)
        const panScale = isBB ? 0.00038 : 0.00095 * hFactor;
        camera.getWorldDirection(tmpDir.current);
        tmpRight.current.crossVectors(tmpDir.current, camera.up).normalize();
        tmpUp.current.crossVectors(tmpRight.current, tmpDir.current).normalize();
        posRef.current.addScaledVector(tmpRight.current, -dx * panScale);
        posRef.current.addScaledVector(tmpUp.current, dy * panScale);
      }
    };

    const onPointerUp = () => {
      dragRef.current.mode = 'none';
    };

    const onWheel = (e: WheelEvent) => {
      if (hotRefs.knobHovered || useLabStore.getState().breadboard2D) return;
      e.preventDefault();
      transitioningRef.current = false;
      dollyImpulseRef.current += -Math.sign(e.deltaY) * Math.min(1.0, Math.abs(e.deltaY) * 0.0065);
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('contextmenu', onContextMenu);
    return () => {
      dom.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      dom.removeEventListener('wheel', onWheel);
      dom.removeEventListener('contextmenu', onContextMenu);
    };
  }, [camera, gl]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const keys = keysRef.current;

    // Restore exact pre-breadboard camera pose when exiting breadboard mode (never reset to bench origin)
    if (hotRefs.restoreCameraPose) {
      const rp = hotRefs.restoreCameraPose;
      hotRefs.restoreCameraPose = null;
      goalPosRef.current.set(rp.pos[0], rp.pos[1], rp.pos[2]);
      goalYawRef.current = rp.yaw;
      goalPitchRef.current = rp.pitch;
      velRef.current.set(0, 0, 0);
      dollyImpulseRef.current = 0;
      const dist = posRef.current.distanceTo(goalPosRef.current);
      const yawDiff = Math.abs(shortestAngleDiff(yawRef.current, goalYawRef.current));
      const pitchDiff = Math.abs(pitchRef.current - goalPitchRef.current);
      transitioningRef.current = dist > 0.002 || yawDiff > 0.002 || pitchDiff > 0.002;
    }

    if (transitioningRef.current) {
      // ponytail: use unclamped frame delta up to 0.25s so camera presets finish in ~0.4s even under low-FPS software WebGL
      const transDt = Math.min(delta, 0.25);
      const damp = 1 - Math.exp(-12 * transDt);
      posRef.current.lerp(goalPosRef.current, damp);
      yawRef.current += shortestAngleDiff(yawRef.current, goalYawRef.current) * damp;
      pitchRef.current = THREE.MathUtils.lerp(pitchRef.current, goalPitchRef.current, damp);

      if (
        posRef.current.distanceTo(goalPosRef.current) < 0.0015 &&
        Math.abs(shortestAngleDiff(yawRef.current, goalYawRef.current)) < 0.002 &&
        Math.abs(pitchRef.current - goalPitchRef.current) < 0.002
      ) {
        posRef.current.copy(goalPosRef.current);
        yawRef.current = goalYawRef.current;
        pitchRef.current = goalPitchRef.current;
        transitioningRef.current = false;
      }
    } else if (!useLabStore.getState().breadboard2D) {
      const isBB = useLabStore.getState().breadboardMode;
      // Minecraft Creative fly controls: WASD walk/fly, Space up, Shift down, Ctrl (or double-tap W) sprint!
      const sprinting = keys.has('ControlLeft') || keys.has('ControlRight') || doubleTapSprintRef.current;
      const rotSpeed = isBB ? 0.55 : 0.9;
      if (keys.has('ArrowLeft')) yawRef.current += rotSpeed * dt;
      if (keys.has('ArrowRight')) yawRef.current -= rotSpeed * dt;
      if (keys.has('ArrowUp')) pitchRef.current = THREE.MathUtils.clamp(pitchRef.current + rotSpeed * dt, -1.38, 1.22);
      if (keys.has('ArrowDown')) pitchRef.current = THREE.MathUtils.clamp(pitchRef.current - rotSpeed * dt, -1.38, 1.22);

      const sinY = Math.sin(yawRef.current);
      const cosY = Math.cos(yawRef.current);
      let fwd = 0;
      let strafe = 0;
      let vert = 0;

      if (keys.has('KeyW')) fwd += 1;
      if (keys.has('KeyS')) fwd -= 1;
      if (keys.has('KeyD')) strafe += 1;
      if (keys.has('KeyA')) strafe -= 1;
      if (keys.has('Space') || keys.has('KeyE')) vert += 1;
      if (keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('KeyQ') || keys.has('KeyC')) vert -= 1;

      const baseMove = isBB ? 0.16 : 0.30;
      const baseVert = isBB ? 0.14 : 0.24;
      const sprintMult = sprinting ? 3.0 : 1.0;

      tmpDesired.current.set(-sinY * fwd + cosY * strafe, 0, -cosY * fwd - sinY * strafe);
      if (tmpDesired.current.lengthSq() > 0.001) {
        tmpDesired.current.normalize();
      }
      tmpDesired.current.multiplyScalar(baseMove * sprintMult);
      tmpDesired.current.y = vert * baseVert * sprintMult;

      const accelDamp = 1 - Math.exp(-18 * dt);
      velRef.current.lerp(tmpDesired.current, accelDamp);

      if (Math.abs(dollyImpulseRef.current) > 0.001) {
        camera.getWorldDirection(tmpDir.current);
        const dollyScale = (isBB ? 0.18 : 0.34) * (sprinting ? 1.8 : 1.0);
        posRef.current.addScaledVector(tmpDir.current, dollyImpulseRef.current * dollyScale * dt);
        dollyImpulseRef.current *= Math.exp(-14 * dt);
      } else {
        dollyImpulseRef.current = 0;
      }

      posRef.current.addScaledVector(velRef.current, dt);

      posRef.current.x = THREE.MathUtils.clamp(posRef.current.x, -1.85, 1.85);
      posRef.current.z = THREE.MathUtils.clamp(posRef.current.z, -0.78, 1.85);
      posRef.current.y = THREE.MathUtils.clamp(posRef.current.y, 0.48, 2.05);

      if (Math.abs(posRef.current.x) < 0.94 && posRef.current.z > -0.41 && posRef.current.z < 0.51) {
        posRef.current.y = Math.max(0.812, posRef.current.y);
      }
    }

    camera.position.copy(posRef.current);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(pitchRef.current, yawRef.current, 0, 'YXZ');

    // Keep live camera pose synced so entering/exiting 2D breadboard returns to exact spot
    hotRefs.liveCameraPose.pos[0] = posRef.current.x;
    hotRefs.liveCameraPose.pos[1] = posRef.current.y;
    hotRefs.liveCameraPose.pos[2] = posRef.current.z;
    hotRefs.liveCameraPose.yaw = yawRef.current;
    hotRefs.liveCameraPose.pitch = pitchRef.current;
  });

  return null;
}
