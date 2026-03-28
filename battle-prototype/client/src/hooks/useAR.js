import { useRef, useState, useEffect, useCallback } from 'react';
import * as THREE from 'three';

/**
 * useAR — React hook that manages a WebXR immersive-ar session lifecycle.
 *
 * Ported from ar-prototype/app.js (markerless WebXR mode).
 * Provides surface detection via hit-test and exposes the Three.js scene
 * so the consuming component can add/remove objects.
 */
export default function useAR() {
  const [isSupported, setIsSupported] = useState(null); // null = checking
  const [isActive, setIsActive] = useState(false);

  // Three.js core objects
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const reticleRef = useRef(null);

  // WebXR state
  const sessionRef = useRef(null);
  const refSpaceRef = useRef(null);
  const hitTestSourceRef = useRef(null);
  const hitPoseRef = useRef(null); // current hit-test pose (or null)
  const cameraPoseRef = useRef({ x: 0, y: 0, z: 0, heading: 0 }); // viewer position + heading

  // Callbacks the consumer can hook into
  const onFrameRef = useRef(null);   // called every XR frame with (time, frame)
  const onSelectRef = useRef(null);  // called on XR 'select' event with (hitPose, event)

  // ── Check WebXR support on mount ──
  useEffect(() => {
    (async () => {
      if (!navigator.xr) {
        setIsSupported(false);
        return;
      }
      try {
        const ok = await navigator.xr.isSessionSupported('immersive-ar');
        setIsSupported(ok);
      } catch {
        setIsSupported(false);
      }
    })();
  }, []);

  // ── Init Three.js scene (called from startSession) ──
  const initScene = useCallback((canvas) => {
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0); // transparent for camera passthrough
    renderer.xr.enabled = true;
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera();
    cameraRef.current = camera;

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
    dirLight.position.set(2, 5, 3);
    scene.add(dirLight);
    scene.add(new THREE.HemisphereLight(0x8888ff, 0x443322, 0.4));

    // Reticle — ring on detected surface
    const reticleGeo = new THREE.RingGeometry(0.08, 0.11, 32).rotateX(-Math.PI / 2);
    const reticleMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const reticle = new THREE.Mesh(reticleGeo, reticleMat);
    reticle.visible = false;
    reticle.matrixAutoUpdate = false;
    scene.add(reticle);
    reticleRef.current = reticle;
  }, []);

  // ── XR render loop ──
  const onXRFrame = useCallback((time, frame) => {
    if (!sessionRef.current || !frame) return;

    const refSpace = refSpaceRef.current;
    if (!refSpace) return;

    // Extract viewer (camera) pose for minimap / UI consumers
    const viewerPose = frame.getViewerPose(refSpace);
    if (viewerPose) {
      const vt = viewerPose.transform;
      const pos = vt.position;
      const q = vt.orientation;
      // Heading = rotation around Y axis extracted from quaternion
      // atan2(2*(qw*qy + qx*qz), 1 - 2*(qy*qy + qz*qz)) but for camera
      // forward direction. We use the forward vector (-Z in camera space).
      const fw_x = 2 * (q.x * q.z + q.w * q.y);
      const fw_z = 1 - 2 * (q.x * q.x + q.y * q.y);
      const heading = Math.atan2(fw_x, fw_z);
      cameraPoseRef.current = { x: pos.x, y: pos.y, z: pos.z, heading };
    }

    // Hit-test: find where center-screen ray hits a real surface
    if (hitTestSourceRef.current) {
      const hitResults = frame.getHitTestResults(hitTestSourceRef.current);
      if (hitResults.length > 0) {
        const hit = hitResults[0];
        const pose = hit.getPose(refSpace);
        hitPoseRef.current = pose;
        if (reticleRef.current) {
          reticleRef.current.visible = true;
          reticleRef.current.matrix.fromArray(pose.transform.matrix);
        }
      } else {
        hitPoseRef.current = null;
        if (reticleRef.current) reticleRef.current.visible = false;
      }
    }

    // Let consumer hook into frame
    if (onFrameRef.current) onFrameRef.current(time, frame);

    // Render
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
  }, []);

  // ── Handle select (tap) ──
  const handleSelect = useCallback((event) => {
    if (onSelectRef.current) {
      onSelectRef.current(hitPoseRef.current, event);
    }
  }, []);

  // ── Start XR session ──
  const startSession = useCallback(async (canvasEl, { overlayEl, onFrame, onSelect } = {}) => {
    if (!canvasEl) throw new Error('Canvas element required');

    // Store callbacks
    onFrameRef.current = onFrame || null;
    onSelectRef.current = onSelect || null;

    initScene(canvasEl);

    const gl = rendererRef.current.getContext();

    try {
      const sessionInit = {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay', 'light-estimation'],
      };
      if (overlayEl) {
        sessionInit.domOverlay = { root: overlayEl };
      }

      const session = await navigator.xr.requestSession('immersive-ar', sessionInit);
      sessionRef.current = session;

      session.addEventListener('end', () => {
        sessionRef.current = null;
        hitTestSourceRef.current = null;
        hitPoseRef.current = null;
        setIsActive(false);
      });

      // WebGL layer
      await gl.makeXRCompatible();
      const glLayer = new XRWebGLLayer(session, gl, { alpha: true });
      session.updateRenderState({ baseLayer: glLayer });

      // Reference spaces
      rendererRef.current.xr.setReferenceSpaceType('local');
      rendererRef.current.xr.setSession(session);

      let refSpace;
      try {
        refSpace = await session.requestReferenceSpace('local-floor');
      } catch {
        refSpace = await session.requestReferenceSpace('local');
      }
      refSpaceRef.current = refSpace;

      const viewerSpace = await session.requestReferenceSpace('viewer');
      hitTestSourceRef.current = await session.requestHitTestSource({ space: viewerSpace });

      // Select handler
      session.addEventListener('select', handleSelect);

      // Render loop
      rendererRef.current.setAnimationLoop(onXRFrame);

      setIsActive(true);
    } catch (err) {
      console.error('WebXR session failed:', err);
      throw err;
    }
  }, [initScene, onXRFrame, handleSelect]);

  // ── End session ──
  const endSession = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.end().catch(() => {});
    }
    sessionRef.current = null;
    hitTestSourceRef.current = null;
    hitPoseRef.current = null;

    if (rendererRef.current) {
      rendererRef.current.setAnimationLoop(null);
      rendererRef.current.dispose();
      rendererRef.current = null;
    }

    sceneRef.current = null;
    cameraRef.current = null;
    reticleRef.current = null;
    refSpaceRef.current = null;

    setIsActive(false);
  }, []);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => endSession();
  }, [endSession]);

  return {
    isSupported,
    isActive,
    startSession,
    endSession,
    sceneRef,
    hitPoseRef,
    cameraPoseRef,
  };
}
