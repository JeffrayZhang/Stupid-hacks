/* ──────────────────────────────────────────────
   WebAR Prototype — app.js
   Marker mode  : A-Frame + AR.js (Hiro marker)
   Markerless   : Three.js + getUserMedia
   ────────────────────────────────────────────── */

// ── State ──
let currentShape = 'cube';
let currentColor = '#4FC3F7';
let markerlessActive = false;

// Three.js refs (markerless)
let scene, camera, renderer, groundPlane, raycaster, mouse, placedObjects = [];
let videoElement, videoStream;

// ── UI wiring ──
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-marker').addEventListener('click', startMarkerMode);
  document.getElementById('btn-markerless').addEventListener('click', startMarkerlessMode);

  // Object & color pickers (delegate)
  document.querySelectorAll('.obj-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.object-picker').querySelectorAll('.obj-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentShape = btn.dataset.shape;
      updateMarkerEntity();            // live-update the marker scene entity
    });
  });
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.color-picker').querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentColor = btn.dataset.color;
      updateMarkerEntity();
    });
  });
});

function backToLanding() {
  stopMarkerless();
  stopMarkerScene();
  document.getElementById('landing').classList.remove('hidden');
  document.getElementById('marker-mode').classList.add('hidden');
  document.getElementById('markerless-mode').classList.add('hidden');
}

/* ═══════════════════════════════════════════════
   MARKER MODE  (A-Frame + AR.js)
   ═══════════════════════════════════════════════ */

let aframeLoaded = false;
let markerScene = null;

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
  if (container.querySelector('a-scene')) return;       // already built

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

  // Wait for scene to initialise, then set object
  setTimeout(updateMarkerEntity, 500);
}

function updateMarkerEntity() {
  const el = document.getElementById('ar-object');
  if (!el) return;

  // Remove existing geometry children
  while (el.firstChild) el.removeChild(el.firstChild);

  const geomMap = {
    cube:     'primitive: box; width: 0.6; height: 0.6; depth: 0.6;',
    sphere:   'primitive: sphere; radius: 0.4;',
    cylinder: 'primitive: cylinder; radius: 0.3; height: 0.7;',
    torus:    'primitive: torus; radius: 0.35; radiusTubular: 0.08;',
    cone:     'primitive: cone; radiusBottom: 0.35; height: 0.7;',
  };

  el.setAttribute('geometry', geomMap[currentShape] || geomMap.cube);
  el.setAttribute('material', `color: ${currentColor}; metalness: 0.3; roughness: 0.5;`);
  el.setAttribute('position', '0 0.35 0');
  el.setAttribute('rotation', '0 0 0');

  // Add spin animation
  el.setAttribute('animation', 'property: rotation; to: 0 360 0; loop: true; dur: 6000; easing: linear;');
}

function stopMarkerScene() {
  const container = document.getElementById('marker-scene-container');
  const sc = container.querySelector('a-scene');
  if (sc) {
    // AR.js creates video elements; try to stop their streams
    document.querySelectorAll('video').forEach(v => {
      if (v.srcObject) { v.srcObject.getTracks().forEach(t => t.stop()); v.srcObject = null; }
    });
    sc.parentNode.removeChild(sc);
  }
}

/* ═══════════════════════════════════════════════
   MARKERLESS MODE  (Three.js + webcam + device orientation)
   Objects are placed in world-space and the camera
   rotates to match the physical device, so objects
   stay anchored in the real world as you move.
   ═══════════════════════════════════════════════ */

// Device-orientation / mouse-drag tracking state
let orientationAlpha = 0, orientationBeta = 0, orientationGamma = 0;
let hasDeviceOrientation = false;
let dragActive = false, dragStartX = 0, dragStartY = 0;
let cameraYaw = 0, cameraPitch = 0;        // mouse-drag angles (desktop fallback)
let dragStartYaw = 0, dragStartPitch = 0;
let orientationPermissionAsked = false;

function startMarkerlessMode() {
  document.getElementById('landing').classList.add('hidden');
  document.getElementById('markerless-mode').classList.remove('hidden');
  markerlessActive = true;
  initThreeScene();
  startWebcam();
  initOrientationTracking();
}

function initThreeScene() {
  const canvas = document.getElementById('markerless-canvas');
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);

  scene = new THREE.Scene();

  // Perspective camera — positioned at "eye height" looking forward
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 1.6, 0);    // ~eye height, standing at origin

  // Lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambient);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
  dirLight.position.set(3, 6, 4);
  dirLight.castShadow = true;
  scene.add(dirLight);
  const hemiLight = new THREE.HemisphereLight(0x8888ff, 0x443322, 0.4);
  scene.add(hemiLight);

  // Invisible ground plane for raycasting
  const planeGeo = new THREE.PlaneGeometry(200, 200);
  const planeMat = new THREE.MeshBasicMaterial({ visible: false });
  groundPlane = new THREE.Mesh(planeGeo, planeMat);
  groundPlane.rotation.x = -Math.PI / 2;
  groundPlane.position.y = 0;
  scene.add(groundPlane);

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  // Click / tap to place
  canvas.addEventListener('click', onCanvasClick);

  // Desktop fallback: mouse-drag to rotate camera
  canvas.addEventListener('mousedown', onDragStart);
  canvas.addEventListener('mousemove', onDragMove);
  canvas.addEventListener('mouseup', onDragEnd);
  canvas.addEventListener('mouseleave', onDragEnd);
  // Touch drag (on devices without gyroscope)
  canvas.addEventListener('touchstart', onTouchDragStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchDragMove, { passive: false });
  canvas.addEventListener('touchend', onDragEnd);

  window.addEventListener('resize', onResize);

  animateMarkerless();
}

/* ── Device Orientation (gyroscope) ── */

function initOrientationTracking() {
  // iOS 13+ requires explicit permission
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    // We'll request on first tap (browser requires user gesture)
    if (!orientationPermissionAsked) {
      orientationPermissionAsked = true;
      document.getElementById('markerless-canvas').addEventListener('click', requestOrientationPermission, { once: true });
    }
  } else {
    // Android / desktop — just listen
    window.addEventListener('deviceorientation', onDeviceOrientation);
  }
}

function requestOrientationPermission() {
  DeviceOrientationEvent.requestPermission()
    .then(state => {
      if (state === 'granted') {
        window.addEventListener('deviceorientation', onDeviceOrientation);
      }
    })
    .catch(console.warn);
}

function onDeviceOrientation(e) {
  if (e.alpha === null) return;       // no data
  hasDeviceOrientation = true;
  orientationAlpha = e.alpha;         // compass heading 0-360
  orientationBeta  = e.beta;          // front-back tilt -180..180
  orientationGamma = e.gamma;         // left-right tilt -90..90
}

/* ── Desktop mouse-drag fallback ── */

function onDragStart(e) {
  // Only start drag on right-click or when holding shift (left-click is for placing)
  // Actually: let's use right-mouse-button OR two-finger drag for camera
  if (e.button === 2 || e.shiftKey) {
    dragActive = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartYaw = cameraYaw;
    dragStartPitch = cameraPitch;
    e.preventDefault();
  }
}

function onDragMove(e) {
  if (!dragActive) return;
  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;
  cameraYaw   = dragStartYaw   - dx * 0.003;
  cameraPitch  = dragStartPitch - dy * 0.003;
  cameraPitch  = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, cameraPitch));
}

function onDragEnd() {
  dragActive = false;
}

function onTouchDragStart(e) {
  if (e.touches.length === 2) {       // two-finger for camera rotation
    dragActive = true;
    const mid = midpoint(e.touches);
    dragStartX = mid.x; dragStartY = mid.y;
    dragStartYaw = cameraYaw;
    dragStartPitch = cameraPitch;
    e.preventDefault();
  }
}
function onTouchDragMove(e) {
  if (!dragActive || e.touches.length < 2) return;
  const mid = midpoint(e.touches);
  const dx = mid.x - dragStartX;
  const dy = mid.y - dragStartY;
  cameraYaw   = dragStartYaw   - dx * 0.004;
  cameraPitch  = dragStartPitch - dy * 0.004;
  cameraPitch  = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, cameraPitch));
  e.preventDefault();
}
function midpoint(touches) {
  return { x: (touches[0].clientX + touches[1].clientX) / 2,
           y: (touches[0].clientY + touches[1].clientY) / 2 };
}

/* ── Webcam ── */

function startWebcam() {
  videoElement = document.getElementById('webcam-video');
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } })
    .then(stream => {
      videoStream = stream;
      videoElement.srcObject = stream;
      // Match camera FOV to approximate webcam FOV
      const settings = stream.getVideoTracks()[0].getSettings();
      if (settings && settings.width && settings.height) {
        camera.aspect = settings.width / settings.height;
        camera.updateProjectionMatrix();
      }
    })
    .catch(err => {
      console.warn('Camera access denied, trying any camera...', err);
      navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => { videoStream = stream; videoElement.srcObject = stream; })
        .catch(e => alert('Could not access camera: ' + e.message));
    });
}

/* ── Click-to-place ── */

function onCanvasClick(e) {
  if (!markerlessActive || dragActive) return;
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObject(groundPlane);
  if (hits.length > 0) {
    const pt = hits[0].point;
    placeObject(pt.x, pt.y, pt.z);
  }
}

function placeObject(x, y, z) {
  let geo;
  switch (currentShape) {
    case 'sphere':   geo = new THREE.SphereGeometry(0.25, 32, 32); break;
    case 'cylinder': geo = new THREE.CylinderGeometry(0.2, 0.2, 0.5, 32); break;
    case 'torus':    geo = new THREE.TorusGeometry(0.25, 0.07, 16, 48); break;
    case 'cone':     geo = new THREE.ConeGeometry(0.25, 0.5, 32); break;
    default:         geo = new THREE.BoxGeometry(0.4, 0.4, 0.4); break;
  }

  const mat = new THREE.MeshStandardMaterial({ color: currentColor, metalness: 0.35, roughness: 0.45 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;

  // Offset y so objects sit on the ground
  const bbox = new THREE.Box3().setFromObject(mesh);
  const halfH = (bbox.max.y - bbox.min.y) / 2;
  mesh.position.set(x, y + halfH, z);

  // Entrance animation data
  mesh.userData.spawnTime = performance.now();
  mesh.userData.baseY = mesh.position.y;
  mesh.scale.set(0, 0, 0);

  scene.add(mesh);
  placedObjects.push(mesh);
}

/* ── Camera orientation update (called each frame) ── */

function updateCameraOrientation() {
  if (hasDeviceOrientation) {
    // Convert device orientation (degrees) → camera quaternion
    // Device orientation: alpha=compass, beta=front/back tilt, gamma=left/right tilt
    const alpha = THREE.MathUtils.degToRad(orientationAlpha);  // Z-axis (compass)
    const beta  = THREE.MathUtils.degToRad(orientationBeta);   // X-axis (tilt forward)
    const gamma = THREE.MathUtils.degToRad(orientationGamma);  // Y-axis (tilt side)

    // Build rotation from device orientation using ZXY Euler order
    // This is the standard mapping for device orientation → 3D camera
    const euler = new THREE.Euler();
    const q = new THREE.Quaternion();
    const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -PI/2 around X (screen → world)

    euler.set(beta, alpha, -gamma, 'YXZ');
    q.setFromEuler(euler);
    q.multiply(q1);                    // adjust for screen orientation

    // Account for screen orientation (portrait vs landscape)
    const screenOrientation = window.orientation || 0;
    const qScreen = new THREE.Quaternion();
    qScreen.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -THREE.MathUtils.degToRad(screenOrientation));
    q.multiply(qScreen);

    camera.quaternion.copy(q);
  } else {
    // Desktop fallback: apply yaw/pitch from mouse drag
    // Default view: slightly pitched down to see the ground plane
    const euler = new THREE.Euler(cameraPitch - 0.4, cameraYaw, 0, 'YXZ');
    camera.quaternion.setFromEuler(euler);
  }
}

/* ── Animation loop ── */

function animateMarkerless() {
  if (!markerlessActive) return;
  requestAnimationFrame(animateMarkerless);

  // Update camera to match device/mouse orientation
  updateCameraOrientation();

  const now = performance.now();
  placedObjects.forEach(obj => {
    // Pop-in animation (300ms)
    const age = now - obj.userData.spawnTime;
    if (age < 300) {
      const t = age / 300;
      const ease = 1 - Math.pow(1 - t, 3);   // ease-out cubic
      obj.scale.setScalar(ease);
    } else {
      obj.scale.setScalar(1);
    }
    // Gentle hover
    obj.position.y = obj.userData.baseY + Math.sin(now * 0.002 + obj.id) * 0.03;
    // Slow spin
    obj.rotation.y += 0.005;
  });

  renderer.render(scene, camera);
}

function onResize() {
  if (!renderer) return;
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

function clearObjects() {
  placedObjects.forEach(obj => scene.remove(obj));
  placedObjects = [];
}

function stopMarkerless() {
  markerlessActive = false;
  if (videoStream) { videoStream.getTracks().forEach(t => t.stop()); videoStream = null; }
  if (renderer) { renderer.dispose(); renderer = null; }
  window.removeEventListener('deviceorientation', onDeviceOrientation);
  hasDeviceOrientation = false;
  cameraYaw = 0; cameraPitch = 0;
  placedObjects = [];
  scene = null;
}

/* ═══════════════════════════════════════════════
   Keyboard shortcut — Escape → back to landing
   ═══════════════════════════════════════════════ */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') backToLanding();
});

// Prevent context menu on the canvas so right-drag works for camera rotation
document.addEventListener('contextmenu', e => {
  if (e.target && e.target.id === 'markerless-canvas') e.preventDefault();
});
