/* ──────────────────────────────────────────────
   WebAR Prototype — app.js
   Marker mode  : A-Frame + AR.js (Hiro marker)
   Markerless   : WebXR immersive-ar + hit-test
                  (real world surface detection)
   ────────────────────────────────────────────── */

// ── UI wiring ──
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-marker').addEventListener('click', startMarkerMode);
  document.getElementById('btn-markerless').addEventListener('click', startMarkerlessMode);
});

function backToLanding() {
  stopMarkerScene();
  stopWebXR();
  document.getElementById('landing').classList.remove('hidden');
  document.getElementById('marker-mode').classList.add('hidden');
  document.getElementById('markerless-mode').classList.add('hidden');
}

/* ═══════════════════════════════════════════════
   MARKER MODE  (A-Frame + AR.js)
   ═══════════════════════════════════════════════ */

let aframeLoaded = false;

function loadAFrame() {
  return new Promise((resolve) => {
    if (aframeLoaded) return resolve();
    const s1 = document.createElement('script');
    s1.src = 'https://aframe.io/releases/1.4.2/aframe.min.js';
    s1.onload = () => {
      const s2 = document.createElement('script');
      s2.src = 'https://raw.githack.com/AR-js-org/AR.js/master/aframe/build/aframe-ar.js';
      s2.onload = () => { aframeLoaded = true; resolve(); };
      document.head.appendChild(s2);
    };
    document.head.appendChild(s1);
  });
}

async function startMarkerMode() {
  document.getElementById('landing').classList.add('hidden');
  document.getElementById('marker-mode').classList.remove('hidden');
  await loadAFrame();
  buildMarkerScene();
}

function buildMarkerScene() {
  const container = document.getElementById('marker-scene-container');
  if (container.querySelector('a-scene')) return;

  container.innerHTML = `
    <a-scene
      embedded
      arjs="sourceType: webcam; debugUIEnabled: false; detectionMode: mono_and_matrix; matrixCodeType: 3x3;"
      vr-mode-ui="enabled: false"
      renderer="logarithmicDepthBuffer: true; antialias: true;"
      style="width:100%;height:100%;">
      <a-marker preset="hiro" id="ar-marker">
        <a-entity id="ar-object"></a-entity>
      </a-marker>
      <a-entity camera></a-entity>
    </a-scene>`;

  setTimeout(updateMarkerEntity, 500);
}

/* ── Build a 3D PR logo from Three.js primitives ──
   The git pull-request icon:
   - Left branch: two dots connected by a vertical line
   - Right branch: one dot at bottom, line going up, curving left with an arrow
   Returns a THREE.Group scaled to fit within `size` units. */

function buildPRLogoMesh(size, color) {
  const c = new THREE.Color(color || '#4FC3F7');
  const group = new THREE.Group();

  // Scale factor: icon logical coords go from 0..1, we scale to `size`
  const S = size || 0.12;

  const lineMat = new THREE.MeshStandardMaterial({ color: c, metalness: 0.3, roughness: 0.5 });
  const dotMat  = new THREE.MeshStandardMaterial({ color: c, metalness: 0.2, roughness: 0.4 });

  const lineR = 0.045; // line radius
  const dotR  = 0.12;  // dot radius

  // ── Left branch (main) ──
  // Top dot
  const topDot = new THREE.Mesh(new THREE.SphereGeometry(dotR, 24, 24), dotMat);
  topDot.position.set(-0.35, 0.55, 0);
  group.add(topDot);

  // Bottom dot
  const botDot = new THREE.Mesh(new THREE.SphereGeometry(dotR, 24, 24), dotMat);
  botDot.position.set(-0.35, -0.55, 0);
  group.add(botDot);

  // Vertical line connecting them
  const leftLine = new THREE.Mesh(
    new THREE.CylinderGeometry(lineR, lineR, 0.9, 16),
    lineMat
  );
  leftLine.position.set(-0.35, 0, 0);
  group.add(leftLine);

  // ── Right branch (PR branch) ──
  // Bottom dot
  const rightDot = new THREE.Mesh(new THREE.SphereGeometry(dotR, 24, 24), dotMat);
  rightDot.position.set(0.35, -0.55, 0);
  group.add(rightDot);

  // Vertical line going up on the right
  const rightLine = new THREE.Mesh(
    new THREE.CylinderGeometry(lineR, lineR, 0.55, 16),
    lineMat
  );
  rightLine.position.set(0.35, -0.2, 0);
  group.add(rightLine);

  // Diagonal line from right-top toward left-top (the PR merge arrow)
  const diagLen = 0.45;
  const diagLine = new THREE.Mesh(
    new THREE.CylinderGeometry(lineR, lineR, diagLen, 16),
    lineMat
  );
  diagLine.position.set(0.15, 0.22, 0);
  diagLine.rotation.z = Math.PI / 4; // 45 degree angle
  group.add(diagLine);

  // Arrow head (small cone)
  const arrowHead = new THREE.Mesh(
    new THREE.ConeGeometry(0.08, 0.16, 12),
    lineMat
  );
  arrowHead.position.set(-0.02, 0.39, 0);
  arrowHead.rotation.z = Math.PI / 4;
  group.add(arrowHead);

  // Scale the whole group
  group.scale.setScalar(S / 0.8); // normalize so the icon fits in `size`

  return group;
}

function updateMarkerEntity() {
  const el = document.getElementById('ar-object');
  if (!el) return;

  // Remove any previous Three.js object
  const oldObj = el.getObject3D('mesh');
  if (oldObj) {
    el.removeObject3D('mesh');
  }

  // Build the PR logo as a Three.js group and inject it into A-Frame
  const logo = buildPRLogoMesh(0.5, '#4FC3F7');
  el.setObject3D('mesh', logo);
  el.setAttribute('position', '0 0.35 0');
  el.setAttribute('animation', 'property: rotation; to: 0 360 0; loop: true; dur: 6000; easing: linear;');
}

function stopMarkerScene() {
  const container = document.getElementById('marker-scene-container');
  const sc = container && container.querySelector('a-scene');
  if (sc) {
    document.querySelectorAll('video').forEach(v => {
      if (v.srcObject) { v.srcObject.getTracks().forEach(t => t.stop()); v.srcObject = null; }
    });
    sc.parentNode.removeChild(sc);
  }
}

/* ═══════════════════════════════════════════════
   MARKERLESS MODE  — WebXR immersive-ar
   Uses real device camera + SLAM tracking.
   Objects are placed on real-world surfaces via
   WebXR hit-testing.
   ═══════════════════════════════════════════════ */

let xrSession = null;
let xrRefSpace = null;
let xrViewerSpace = null;
let xrHitTestSource = null;
let gl = null;
let xrScene, xrCamera, xrRenderer;
let xrReticle = null;              // targeting reticle on detected surface
let xrPlacedObjects = [];
let xrHitPose = null;              // latest hit-test pose (matrix)

async function startMarkerlessMode() {
  // Check WebXR support first
  if (!navigator.xr) {
    showARFallbackMessage('Your browser does not support WebXR. Use Chrome on Android for markerless AR.');
    return;
  }

  const supported = await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
  if (!supported) {
    showARFallbackMessage(
      'WebXR immersive-ar is not available on this device.<br>' +
      '<b>Markerless AR requires:</b> Chrome on Android (with ARCore), or a WebXR-capable headset.<br>' +
      'On this device, try <b>Marker Mode</b> instead — it works everywhere!'
    );
    return;
  }

  document.getElementById('landing').classList.add('hidden');
  document.getElementById('markerless-mode').classList.remove('hidden');

  initWebXRScene();
  await startXRSession();
}

function showARFallbackMessage(html) {
  document.getElementById('landing').classList.add('hidden');
  document.getElementById('markerless-mode').classList.remove('hidden');

  const canvas = document.getElementById('markerless-canvas');
  canvas.style.display = 'none';
  const video = document.getElementById('webcam-video');
  if (video) video.style.display = 'none';

  let msg = document.getElementById('ar-fallback-msg');
  if (!msg) {
    msg = document.createElement('div');
    msg.id = 'ar-fallback-msg';
    msg.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 10;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
      color: #eee; text-align: center; padding: 32px; font-size: 1.1rem; line-height: 1.7;
    `;
    document.getElementById('markerless-mode').appendChild(msg);
  }
  msg.innerHTML = `
    <div style="font-size: 3rem; margin-bottom: 16px;">📱</div>
    <div style="max-width: 480px;">${html}</div>
    <button onclick="backToLanding()" style="
      margin-top: 24px; padding: 12px 28px; border-radius: 12px;
      background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.2);
      color: #fff; font-size: 1rem; cursor: pointer;
    ">← Back to menu</button>
  `;
}

function initWebXRScene() {
  const canvas = document.getElementById('markerless-canvas');

  xrRenderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  xrRenderer.setPixelRatio(window.devicePixelRatio);
  xrRenderer.setSize(window.innerWidth, window.innerHeight);
  xrRenderer.setClearColor(0x000000, 0);   // fully transparent so camera passthrough shows
  xrRenderer.xr.enabled = true;

  gl = xrRenderer.getContext();

  xrScene = new THREE.Scene();

  xrCamera = new THREE.PerspectiveCamera();  // Three.js XR manages this internally

  // Lighting
  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  xrScene.add(ambient);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
  dirLight.position.set(2, 5, 3);
  xrScene.add(dirLight);
  const hemiLight = new THREE.HemisphereLight(0x8888ff, 0x443322, 0.4);
  xrScene.add(hemiLight);

  // Reticle — shows where object will be placed (ring on detected surface)
  const reticleGeo = new THREE.RingGeometry(0.08, 0.11, 32).rotateX(-Math.PI / 2);
  const reticleMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  xrReticle = new THREE.Mesh(reticleGeo, reticleMat);
  xrReticle.visible = false;
  xrReticle.matrixAutoUpdate = false;
  xrScene.add(xrReticle);
}

async function startXRSession() {
  try {
    xrSession = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay', 'light-estimation'],
      domOverlay: { root: document.getElementById('markerless-mode') }
    });

    xrSession.addEventListener('end', onXRSessionEnd);

    // Set up WebGL layer — must request alpha: true for camera passthrough
    await gl.makeXRCompatible();
    const glLayer = new XRWebGLLayer(xrSession, gl, { alpha: true });
    xrSession.updateRenderState({ baseLayer: glLayer });

    // Tell Three.js about the session
    xrRenderer.xr.setReferenceSpaceType('local');
    xrRenderer.xr.setSession(xrSession);

    // Reference spaces — try local-floor first, fall back to local
    try {
      xrRefSpace = await xrSession.requestReferenceSpace('local-floor');
    } catch (_) {
      console.warn('local-floor not supported, falling back to local');
      xrRefSpace = await xrSession.requestReferenceSpace('local');
    }
    xrViewerSpace = await xrSession.requestReferenceSpace('viewer');

    // Hit-test source (ray from center of screen into the world)
    xrHitTestSource = await xrSession.requestHitTestSource({ space: xrViewerSpace });

    // Tap to place
    xrSession.addEventListener('select', onXRSelect);

    // Start render loop
    xrRenderer.setAnimationLoop((time, frame) => onXRFrame(time, frame));

    // Update info
    document.getElementById('markerless-info').innerHTML =
      'Point at a surface — a white ring shows where objects will land. <b>Tap to place!</b>';
  } catch (err) {
    console.error('WebXR session failed:', err);
    showARFallbackMessage('Failed to start AR session: ' + err.message);
  }
}

function onXRFrame(time, frame) {
  if (!xrSession || !frame) return;

  const pose = frame.getViewerPose(xrRefSpace);
  if (!pose) return;

  // Hit-test: find where the center-screen ray hits a real-world surface
  if (xrHitTestSource) {
    const hitResults = frame.getHitTestResults(xrHitTestSource);
    if (hitResults.length > 0) {
      const hit = hitResults[0];
      xrHitPose = hit.getPose(xrRefSpace);
      xrReticle.visible = true;
      xrReticle.matrix.fromArray(xrHitPose.transform.matrix);
    } else {
      xrReticle.visible = false;
      xrHitPose = null;
    }
  }

  // Animate placed objects
  const now = performance.now();
  xrPlacedObjects.forEach(obj => {
    const age = now - obj.userData.spawnTime;
    if (age < 300) {
      const t = age / 300;
      obj.scale.setScalar(1 - Math.pow(1 - t, 3));
    } else {
      obj.scale.setScalar(1);
    }
    obj.rotation.y += 0.005;
  });

  // Render — Three.js WebXR handles camera projection automatically
  xrRenderer.render(xrScene, xrCamera);
}

function onXRSelect() {
  // Place object at the current hit-test location
  if (!xrHitPose) return;

  const pos = xrHitPose.transform.position;
  placeWebXRObject(pos.x, pos.y, pos.z);
}

function placeWebXRObject(x, y, z) {
  const logo = buildPRLogoMesh(0.08, '#4FC3F7');

  // Position on the real surface — offset up slightly
  const bbox = new THREE.Box3().setFromObject(logo);
  const halfH = (bbox.max.y - bbox.min.y) / 2;
  logo.position.set(x, y + halfH, z);

  logo.userData.spawnTime = performance.now();
  logo.scale.set(0, 0, 0);

  xrScene.add(logo);
  xrPlacedObjects.push(logo);
}

function onXRSessionEnd() {
  xrSession = null;
  xrHitTestSource = null;
  xrHitPose = null;
  xrPlacedObjects = [];
  if (xrRenderer) xrRenderer.setAnimationLoop(null);
}

function clearObjects() {
  xrPlacedObjects.forEach(obj => xrScene && xrScene.remove(obj));
  xrPlacedObjects = [];
}

function stopWebXR() {
  if (xrSession) {
    xrSession.end().catch(() => {});
  }
  onXRSessionEnd();
  if (xrRenderer) { xrRenderer.dispose(); xrRenderer = null; }
  xrScene = null;

  // Clean up fallback message if present
  const msg = document.getElementById('ar-fallback-msg');
  if (msg) msg.remove();
  const canvas = document.getElementById('markerless-canvas');
  if (canvas) canvas.style.display = '';
  const video = document.getElementById('webcam-video');
  if (video) video.style.display = '';
}

/* ═══════════════════════════════════════════════
   Keyboard shortcut — Escape → back to landing
   ═══════════════════════════════════════════════ */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') backToLanding();
});
