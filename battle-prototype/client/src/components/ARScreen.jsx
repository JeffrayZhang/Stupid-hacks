import { useRef, useState, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import useAR from '../hooks/useAR';

/**
 * ARScreen — AR discovery screen for finding PR-mons on real-world surfaces.
 *
 * Uses WebXR immersive-ar with hit-test to detect surfaces, then auto-places
 * PR-mon creatures as the user looks around. Tapping a creature selects it.
 */

// ── Minimum distance between placed PR-mons (meters) ──
const MIN_SPACING = 0.35;
// ── How often to attempt auto-placement (ms) ──
const PLACE_INTERVAL = 2000;

export default function ARScreen({ prmons = [], onSelectPrmon, onBack }) {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const { isSupported, isActive, startSession, endSession, sceneRef, hitPoseRef } = useAR();

  const [placedCount, setPlacedCount] = useState(0);
  const [error, setError] = useState(null);

  // Track which prmons have been placed (by id) and their 3D groups
  const placedMapRef = useRef(new Map()); // id → { group, prmon }
  const placedGroupsRef = useRef([]);     // all THREE.Group objects for raycasting
  const nextPlaceIdx = useRef(0);         // index into prmons for next placement
  const lastPlaceTime = useRef(0);

  // ── Build a 3D group for a PR-mon ──
  const buildPrmonGroup = useCallback((prmon) => {
    const group = new THREE.Group();
    group.userData.prmonId = prmon.id;
    group.userData.spawnTime = performance.now();

    // Main shape — colored by type
    const color = new THREE.Color(prmon.type?.color || '#4FC3F7');
    const size = 0.07; // ~7cm real-world scale

    const geo = new THREE.BoxGeometry(size * 1.4, size * 1.4, size * 1.4);
    const mat = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.35,
      roughness: 0.45,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = size * 0.7;
    group.add(mesh);

    // Try loading avatar texture on front face
    if (prmon.authorAvatar) {
      const loader = new THREE.TextureLoader();
      loader.load(
        prmon.authorAvatar,
        (texture) => {
          // Create a small plane with the avatar on the front face
          const avatarGeo = new THREE.PlaneGeometry(size * 1.0, size * 1.0);
          const avatarMat = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
          });
          const avatarMesh = new THREE.Mesh(avatarGeo, avatarMat);
          avatarMesh.position.set(0, size * 0.7, size * 0.71);
          group.add(avatarMesh);
        },
        undefined,
        () => {} // silently ignore load errors
      );
    }

    // Text label sprite floating above
    const label = makeTextSprite(prmon.name, {
      fontSize: 48,
      color: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.6)',
      padding: 8,
    });
    label.position.set(0, size * 2.0, 0);
    label.scale.set(0.12, 0.04, 1);
    group.add(label);

    // Type badge sprite
    const badge = makeTextSprite(prmon.type?.badge || '⚡', {
      fontSize: 40,
      color: '#ffffff',
      backgroundColor: prmon.type?.color || '#666',
      padding: 6,
    });
    badge.position.set(0, size * 2.6, 0);
    badge.scale.set(0.06, 0.03, 1);
    group.add(badge);

    // Start scaled down for pop-in animation
    group.scale.set(0, 0, 0);

    return group;
  }, []);

  // ── Auto-place PR-mons at hit-test positions ──
  const onFrame = useCallback((time) => {
    const scene = sceneRef.current;
    if (!scene) return;

    const now = performance.now();

    // Auto-placement: space out over time
    if (
      hitPoseRef.current &&
      nextPlaceIdx.current < prmons.length &&
      now - lastPlaceTime.current > PLACE_INTERVAL
    ) {
      const pos = hitPoseRef.current.transform.position;
      const candidatePos = new THREE.Vector3(pos.x, pos.y, pos.z);

      // Check spacing against already-placed creatures
      let tooClose = false;
      for (const { group } of placedMapRef.current.values()) {
        if (group.position.distanceTo(candidatePos) < MIN_SPACING) {
          tooClose = true;
          break;
        }
      }

      if (!tooClose) {
        const prmon = prmons[nextPlaceIdx.current];
        if (!placedMapRef.current.has(prmon.id)) {
          const group = buildPrmonGroup(prmon);
          group.position.copy(candidatePos);

          scene.add(group);
          placedMapRef.current.set(prmon.id, { group, prmon });
          placedGroupsRef.current.push(group);
          nextPlaceIdx.current++;
          lastPlaceTime.current = now;
          setPlacedCount(placedMapRef.current.size);
        }
      }
    }

    // Animate all placed creatures: bob + rotate + spawn pop-in
    for (const { group } of placedMapRef.current.values()) {
      const age = now - group.userData.spawnTime;

      // Pop-in animation (300ms)
      if (age < 300) {
        const t = age / 300;
        const s = 1 - Math.pow(1 - t, 3);
        group.scale.setScalar(s);
      } else {
        group.scale.setScalar(1);
      }

      // Gentle rotation
      group.rotation.y += 0.005;

      // Gentle bob
      const bob = Math.sin(now * 0.002 + group.userData.spawnTime) * 0.008;
      if (group.userData.baseY === undefined) {
        group.userData.baseY = group.position.y;
      }
      group.position.y = group.userData.baseY + bob;
    }
  }, [prmons, sceneRef, hitPoseRef, buildPrmonGroup]);

  // ── Handle tap → raycast to find tapped PR-mon ──
  const onSelect = useCallback((hitPose, event) => {
    if (!sceneRef.current || !onSelectPrmon) return;

    const groups = placedGroupsRef.current;
    if (groups.length === 0) return;

    // Get the XR input source for raycasting
    const inputSource = event?.inputSource;
    const frame = event?.frame;
    const session = event?.target;

    // Strategy: if we have a hit-test pose, find the nearest creature to that point
    // This works for screen-tap (which triggers both hit-test and select)
    if (hitPose) {
      const tapPos = new THREE.Vector3(
        hitPose.transform.position.x,
        hitPose.transform.position.y,
        hitPose.transform.position.z
      );

      let nearest = null;
      let nearestDist = Infinity;

      for (const { group, prmon } of placedMapRef.current.values()) {
        const dist = group.position.distanceTo(tapPos);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = prmon;
        }
      }

      // Select if tap was close enough to a creature (within 30cm)
      if (nearest && nearestDist < 0.3) {
        onSelectPrmon(nearest);
      }
    }
  }, [sceneRef, onSelectPrmon]);

  // ── Start AR session on mount ──
  useEffect(() => {
    if (isSupported === false || isSupported === null) return;

    let cancelled = false;

    const init = async () => {
      try {
        await startSession(canvasRef.current, {
          overlayEl: overlayRef.current,
          onFrame,
          onSelect,
        });
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    };

    init();

    return () => {
      cancelled = true;
      // Cleanup placed objects
      placedMapRef.current.clear();
      placedGroupsRef.current = [];
      nextPlaceIdx.current = 0;
      lastPlaceTime.current = 0;
      setPlacedCount(0);
    };
  }, [isSupported, startSession, onFrame, onSelect]);

  // ── Fallback: WebXR not supported ──
  if (isSupported === false) {
    return (
      <div style={styles.fallback}>
        <div style={{ fontSize: '3rem', marginBottom: 16 }}>📱</div>
        <p style={{ maxWidth: 480, lineHeight: 1.7 }}>
          Your browser does not support WebXR immersive-ar.<br />
          <strong>Markerless AR requires:</strong> Chrome on Android (with ARCore),
          or a WebXR-capable headset.
        </p>
        <button style={styles.backBtn} onClick={onBack}>
          ← Back
        </button>
      </div>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <div style={styles.fallback}>
        <div style={{ fontSize: '3rem', marginBottom: 16 }}>⚠️</div>
        <p>Failed to start AR session: {error}</p>
        <button style={styles.backBtn} onClick={onBack}>
          ← Back
        </button>
      </div>
    );
  }

  // ── Loading ──
  if (isSupported === null) {
    return (
      <div style={styles.fallback}>
        <p>Checking AR support…</p>
      </div>
    );
  }

  return (
    <div ref={overlayRef} style={styles.container}>
      {/* WebXR renders to this canvas */}
      <canvas ref={canvasRef} style={styles.canvas} />

      {/* DOM Overlay — visible on top of AR camera feed */}
      <div style={styles.overlay}>
        {/* Back button */}
        <button style={styles.overlayBack} onClick={() => { endSession(); onBack?.(); }}>
          ← Back
        </button>

        {/* Status text */}
        <div style={styles.statusBar}>
          {placedCount === 0
            ? 'Scanning for PR-mons…'
            : `Found ${placedCount} PR-mon${placedCount > 1 ? 's' : ''}!`}
        </div>

        {/* Radar pulse animation */}
        <div style={styles.radarContainer}>
          <div style={styles.radarDot} />
          <div style={styles.radarPulse} />
        </div>
      </div>

      {/* Inline CSS for the pulse animation */}
      <style>{pulseKeyframes}</style>
    </div>
  );
}

// ── Helper: create a text sprite ──
function makeTextSprite(text, { fontSize = 32, color = '#fff', backgroundColor = 'rgba(0,0,0,0.5)', padding = 4 } = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  ctx.font = `bold ${fontSize}px sans-serif`;
  const metrics = ctx.measureText(text);
  const w = metrics.width + padding * 2;
  const h = fontSize * 1.4 + padding * 2;

  canvas.width = Math.ceil(w);
  canvas.height = Math.ceil(h);

  // Background
  ctx.fillStyle = backgroundColor;
  const r = 6;
  ctx.beginPath();
  ctx.roundRect(0, 0, canvas.width, canvas.height, r);
  ctx.fill();

  // Text
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;

  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
  return new THREE.Sprite(mat);
}

// ── Pulse keyframes CSS ──
const pulseKeyframes = `
@keyframes ar-radar-pulse {
  0% {
    transform: scale(1);
    opacity: 0.7;
  }
  100% {
    transform: scale(3);
    opacity: 0;
  }
}
`;

// ── Styles ──
const styles = {
  container: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    background: '#000',
  },
  canvas: {
    width: '100%',
    height: '100%',
    display: 'block',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
    zIndex: 10,
  },
  overlayBack: {
    position: 'absolute',
    top: 16,
    left: 16,
    pointerEvents: 'auto',
    padding: '10px 20px',
    borderRadius: 12,
    background: 'rgba(0,0,0,0.5)',
    border: '1px solid rgba(255,255,255,0.2)',
    color: '#fff',
    fontSize: '0.95rem',
    cursor: 'pointer',
    backdropFilter: 'blur(8px)',
  },
  statusBar: {
    position: 'absolute',
    bottom: 32,
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '10px 24px',
    borderRadius: 20,
    background: 'rgba(0,0,0,0.55)',
    color: '#fff',
    fontSize: '1rem',
    fontWeight: 600,
    backdropFilter: 'blur(8px)',
    whiteSpace: 'nowrap',
  },
  radarContainer: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 24,
    height: 24,
  },
  radarDot: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 8,
    height: 8,
    marginTop: -4,
    marginLeft: -4,
    borderRadius: '50%',
    background: '#4FC3F7',
  },
  radarPulse: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 12,
    height: 12,
    marginTop: -6,
    marginLeft: -6,
    borderRadius: '50%',
    border: '2px solid #4FC3F7',
    animation: 'ar-radar-pulse 1.5s ease-out infinite',
  },
  fallback: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)',
    color: '#eee',
    textAlign: 'center',
    padding: 32,
    fontSize: '1.1rem',
    lineHeight: 1.7,
    zIndex: 100,
  },
  backBtn: {
    marginTop: 24,
    padding: '12px 28px',
    borderRadius: 12,
    background: 'rgba(255,255,255,0.12)',
    border: '1px solid rgba(255,255,255,0.2)',
    color: '#fff',
    fontSize: '1rem',
    cursor: 'pointer',
  },
};
