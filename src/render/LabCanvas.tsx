import { useEffect, useMemo, useRef } from 'react';
import { Environment, Lightformer } from '@react-three/drei';
import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { workerBridge } from '../simulation/worker/workerBridge';
import { hotRefs } from '../state/hotRefs';
import { useLabStore } from '../state/labStore';
import { PostEffects } from './PostEffects';
import { CableSystem3D } from './cables/CableSystem3D';
import { socketRegistry } from './cables/socketRegistry';
import { CameraRig } from './camera/CameraRig';
import { BreadboardComponents3D } from './models/BreadboardComponents3D';
import { DecadeBoxMesh } from './models/DecadeBoxMesh';
import { DualPowerSupplyMesh } from './models/DualPowerSupplyMesh';
import { LDTEKitMesh } from './models/LDTEKitMesh';
import { RigolDM3058Mesh } from './models/RigolDM3058Mesh';
import { RigolDS1000EMesh } from './models/RigolDS1000EMesh';
import { SignalGeneratorMesh } from './models/SignalGeneratorMesh';
import { LabEnvironment } from './room/LabEnvironment';
import { TutorialHighlights3D } from './tutorial/TutorialHighlights3D';

const UP_AXIS = new THREE.Vector3(0, 1, 0);
const MAT_FALLBACK_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.788);

function isCableIgnored(obj: THREE.Object3D | null): boolean {
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    if (cur.name === 'cable_system' || cur.userData?.cableIgnore === true) return true;
    cur = cur.parent;
  }
  return false;
}

function PointerWorldTracker() {
  const { camera, pointer, scene } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const normalMat = useRef(new THREE.Matrix3());
  const tmpNormal = useRef(new THREE.Vector3());
  const tmpHit = useRef(new THREE.Vector3());
  const lastPtrRef = useRef<[number, number]>([NaN, NaN]);

  useFrame(() => {
    if (!useLabStore.getState().grabbedEnd) {
      lastPtrRef.current[0] = NaN;
      return;
    }
    if (Math.abs(pointer.x - lastPtrRef.current[0]) < 1e-4 && Math.abs(pointer.y - lastPtrRef.current[1]) < 1e-4) {
      return;
    }
    lastPtrRef.current[0] = pointer.x;
    lastPtrRef.current[1] = pointer.y;

    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    for (const hit of hits) {
      if (!hit.object.visible || isCableIgnored(hit.object)) continue;
      normalMat.current.getNormalMatrix(hit.object.matrixWorld);
      if (hit.face) {
        tmpNormal.current.copy(hit.face.normal).applyMatrix3(normalMat.current).normalize();
      } else {
        tmpNormal.current.copy(UP_AXIS);
      }
      if (tmpNormal.current.y < -0.5) tmpNormal.current.copy(UP_AXIS);

      tmpHit.current.copy(hit.point).addScaledVector(tmpNormal.current, 0.005);
      hotRefs.handTargetWorld[0] = THREE.MathUtils.clamp(tmpHit.current.x, -0.88, 0.88);
      hotRefs.handTargetWorld[1] = THREE.MathUtils.clamp(tmpHit.current.y, 0.785, 1.35);
      hotRefs.handTargetWorld[2] = THREE.MathUtils.clamp(tmpHit.current.z, -0.36, 0.46);
      hotRefs.pointerSurfaceNormal[0] = tmpNormal.current.x;
      hotRefs.pointerSurfaceNormal[1] = tmpNormal.current.y;
      hotRefs.pointerSurfaceNormal[2] = tmpNormal.current.z;
      return;
    }

    if (raycaster.ray.intersectPlane(MAT_FALLBACK_PLANE, tmpHit.current)) {
      hotRefs.handTargetWorld[0] = THREE.MathUtils.clamp(tmpHit.current.x, -0.86, 0.86);
      hotRefs.handTargetWorld[1] = 0.788;
      hotRefs.handTargetWorld[2] = THREE.MathUtils.clamp(tmpHit.current.z, -0.34, 0.44);
      hotRefs.pointerSurfaceNormal[0] = 0;
      hotRefs.pointerSurfaceNormal[1] = 1;
      hotRefs.pointerSurfaceNormal[2] = 0;
    }
  });

  return null;
}

function SimulationDriverAndGPUProbe() {
  const { gl } = useThree();
  const setGPUInfo = useLabStore((s) => s.setGPUInfo);
  const setFaults = useLabStore((s) => s.setFaults);
  const syncTrig = useLabStore((s) => s.syncScopeTriggerStatus);

  const lastFpsMsRef = useRef(0);
  const fpsSmoothRef = useRef(60);

  useEffect(() => {
    // Accumulate full frame stats cleanly (works for both 1-pass direct render & optional Bloom EffectComposer)
    gl.info.autoReset = false;

    workerBridge.start(
      (faults) => setFaults(faults),
      (status) => syncTrig(status),
      () => useLabStore.getState().dm3058.func
    );

    const ctx = gl.getContext();
    const dbg = ctx.getExtension('WEBGL_debug_renderer_info');
    const renderer = dbg ? String(ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(ctx.getParameter(ctx.RENDERER));
    const vendor = dbg ? String(ctx.getParameter(dbg.UNMASKED_VENDOR_WEBGL)) : String(ctx.getParameter(ctx.VENDOR));
    const isSoftwareFallback = /swiftshader|llvmpipe|software|angle.*basic/i.test(renderer);

    setGPUInfo({
      renderer,
      vendor,
      isSoftwareFallback,
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
    });

    const dispatchSim = () => {
      const st = useLabStore.getState();
      workerBridge.requestTick(
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
    };

    // Run immediately on startup and whenever any electrical/instrument state changes (zero idle polling waste!)
    let dirtySim = true;
    let lastSimMs = 0;
    const unsub = useLabStore.subscribe((st, prev) => {
      if (
        st.cables !== prev.cables ||
        st.signalGen !== prev.signalGen ||
        st.powerSupply !== prev.powerSupply ||
        st.scope !== prev.scope ||
        st.activeKit !== prev.activeKit ||
        st.kitControls !== prev.kitControls ||
        st.breadboardParts !== prev.breadboardParts ||
        st.dm3058 !== prev.dm3058
      ) {
        dirtySim = true;
        dispatchSim();
        lastSimMs = performance.now();
      }
    });

    dispatchSim();
    lastSimMs = performance.now();

    // Lightweight periodic tick ONLY when Roll mode needs continuous scrolling or dirty state was dropped while worker was busy
    const timer = window.setInterval(() => {
      const st = useLabStore.getState();
      const now = performance.now();
      const isRoll =
        st.scope.power === 'ON' &&
        st.scope.runState === 'RUN' &&
        (st.scope.horizontal.timeBaseMode === 'Roll' ||
          (st.scope.horizontal.timeBaseMode === 'Y-T' && st.scope.horizontal.timePerDiv >= 0.2));
      const needsPeriodicDmm = st.dm3058.power && !st.breadboard2D && now - lastSimMs >= 260;

      if (dirtySim || isRoll || st.scope.trigger.forceRequested || needsPeriodicDmm) {
        dirtySim = false;
        dispatchSim();
        lastSimMs = now;
      }
    }, 45);

    return () => {
      unsub();
      clearInterval(timer);
      workerBridge.stop();
      gl.info.autoReset = true;
    };
  }, [gl, setFaults, setGPUInfo, syncTrig]);

  useFrame(() => {
    const now = performance.now();
    if (lastFpsMsRef.current > 0) {
      const dtMs = now - lastFpsMsRef.current;
      if (dtMs > 1 && dtMs < 250) {
        fpsSmoothRef.current = fpsSmoothRef.current * 0.88 + (1000 / dtMs) * 0.12;
        hotRefs.fps = Math.round(fpsSmoothRef.current);
      }
    }
    lastFpsMsRef.current = now;
    if (gl.info.render.calls > 0) {
      hotRefs.drawCalls = gl.info.render.calls;
      hotRefs.triangles = gl.info.render.triangles;
      gl.info.reset();
    }
  });

  return null;
}

export function LabCanvas() {
  const quality = useLabStore((s) => s.graphics.quality);
  const breadboard2D = useLabStore((s) => s.breadboard2D);

  // Crisp HiDPI DPR capped smartly (1.5x preserves razor-sharp LCD/silkscreens while saving ~44% fragment shading on 2x displays)
  const dpr: [number, number] =
    quality === 'high' ? [1, 1.5] : quality === 'medium' ? [1, 1.25] : [0.85, 1];

  const handleSceneFreeDrop = (e: ThreeEvent<MouseEvent>) => {
    if (e.button !== 0 || e.delta > 6) return;
    const st = useLabStore.getState();
    if (!st.grabbedEnd) return;
    e.stopPropagation();

    const snapId =
      hotRefs.hoveredSocketId ??
      socketRegistry.findNearest(new THREE.Vector3(...hotRefs.handTargetWorld), 0.052)?.id ??
      null;
    if (snapId) {
      st.clickSocket(snapId);
      return;
    }

    const normal = new THREE.Vector3(0, 1, 0);
    if (e.face) {
      const nMat = new THREE.Matrix3().getNormalMatrix(e.object.matrixWorld);
      normal.copy(e.face.normal).applyMatrix3(nMat).normalize();
      if (normal.y < -0.5) normal.set(0, 1, 0);
    }
    const dropPt = e.point.clone().addScaledVector(normal, 0.005);
    st.dropOrSnapCableEnd(null, [
      THREE.MathUtils.clamp(dropPt.x, -0.88, 0.88),
      THREE.MathUtils.clamp(dropPt.y, 0.785, 1.35),
      THREE.MathUtils.clamp(dropPt.z, -0.36, 0.46),
    ]);
  };

  return (
    <Canvas
      frameloop={breadboard2D ? 'demand' : 'always'}
      shadows={false}
      dpr={dpr}
      camera={{ position: [0.04, 1.28, 0.82], fov: 44, near: 0.012, far: 25 }}
      gl={{
        powerPreference: 'high-performance',
        antialias: quality !== 'low',
        stencil: false,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.04,
      }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerMissed={(e) => {
        if (e.button !== 0) return;
        const st = useLabStore.getState();
        if (st.grabbedEnd) {
          const snapId =
            hotRefs.hoveredSocketId ??
            socketRegistry.findNearest(new THREE.Vector3(...hotRefs.handTargetWorld), 0.052)?.id ??
            null;
          if (snapId) {
            st.clickSocket(snapId);
          } else {
            st.dropOrSnapCableEnd(null, [...hotRefs.handTargetWorld]);
          }
        } else if (st.kitSelected) {
          st.selectKitBox(false);
        }
      }}
    >
      <color attach="background" args={['#dfe3ea']} />
      <fog attach="fog" args={['#dfe3ea', 4.5, 12]} />

      <hemisphereLight args={['#f8fafc', '#94a3b8', 0.62]} />
      <directionalLight
        position={[0.45, 2.2, 0.95]}
        intensity={1.55}
        color="#fffaf0"
      />
      <pointLight position={[-0.6, 1.4, 0.5]} intensity={0.45} color="#dbeafe" />

      <Environment resolution={64}>
        <Lightformer form="rect" intensity={2.2} position={[0, 3, 0]} scale={[3, 1.2, 1]} rotation={[Math.PI / 2, 0, 0]} color="#ffffff" />
        <Lightformer form="rect" intensity={1.1} position={[2, 1.5, 2]} scale={[2, 1, 1]} rotation={[0, -Math.PI / 3, 0]} color="#fef3c7" />
        <Lightformer form="rect" intensity={0.8} position={[-2, 1.5, 1.5]} scale={[2, 1, 1]} rotation={[0, Math.PI / 3, 0]} color="#e0f2fe" />
      </Environment>

      <group onClick={handleSceneFreeDrop}>
        <LabEnvironment />
        <LDTEKitMesh position={[-0.63, 0.78, 0.04]} />
        <BreadboardComponents3D />
        <DecadeBoxMesh position={[0.31, 0.782, 0.235]} />
        <RigolDS1000EMesh position={[-0.26, 0.78, -0.16]} />
        <SignalGeneratorMesh position={[0.07, 0.78, -0.21]} />
        <DualPowerSupplyMesh position={[0.35, 0.78, -0.18]} />
        <RigolDM3058Mesh position={[0.64, 0.78, 0.02]} rotation={[0, -0.40, 0]} />
      </group>
      <CableSystem3D />
      <TutorialHighlights3D />
      <PointerWorldTracker />
      <CameraRig />
      <SimulationDriverAndGPUProbe />
      <PostEffects />
    </Canvas>
  );
}
