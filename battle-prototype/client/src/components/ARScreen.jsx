import { useRef, useState, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import useAR from '../hooks/useAR';

/**
 * ARScreen — AR discovery screen for finding PR-mons on real-world surfaces.
 *
 * Uses WebXR immersive-ar with hit-test to detect surfaces, then auto-places
 * PR-mon creatures (as 3D PR logo icons) as the user looks around.
 * Tapping a creature selects it for battle.
 */

const MIN_SPACING = 0.4;
const PLACE_INTERVAL = 2500;

// ── Build a 3D PR logo from Three.js primitives ──
// Ported from Arya's ar-prototype/app.js buildPRLogoMesh
function buildPRLogoMesh(size, color) {
  const c = new THREE.Color(color || '#4FC3F7');
  const group = new THREE.Group();

  const S = size || 0.12;
  const lineMat = new THREE.MeshStandardMaterial({ color: c, metalness: 0.3, roughness: 0.5 });
  const dotMat = new THREE.MeshStandardMaterial({ color: c, metalness: 0.2, roughness: 0.4 });

  const lineR = 0.045;
  const dotR = 0.12;

  // Left branch (main)
  const topDot = new THREE.Mesh(new THREE.SphereGeometry(dotR, 24, 24), dotMat);
  topDot.position.set(-0.35, 0.55, 0);
  group.add(topDot);

  const botDot = new THREE.Mesh(new THREE.SphereGeometry(dotR, 24, 24), dotMat);
  botDot.position.set(-0.35, -0.55, 0);
  group.add(botDot);

  const leftLine = new THREE.Mesh(new THREE.CylinderGeometry(lineR, lineR, 0.9, 16), lineMat);
  leftLine.position.set(-0.35, 0, 0);
  group.add(leftLine);

  // Right branch (PR branch)
  const rightDot = new THREE.Mesh(new THREE.SphereGeometry(dotR, 24, 24), dotMat);
  rightDot.position.set(0.35, -0.55, 0);
  group.add(rightDot);

  const rightLine = new THREE.Mesh(new THREE.CylinderGeometry(lineR, lineR, 0.55, 16), lineMat);
  rightLine.position.set(0.35, -0.2, 0);
  group.add(rightLine);

  // Diagonal merge arrow
  const diagLen = 0.45;
  const diagLine = new THREE.Mesh(new THREE.CylinderGeometry(lineR, lineR, diagLen, 16), lineMat);
  diagLine.position.set(0.15, 0.22, 0);
  diagLine.rotation.z = Math.PI / 4;
  group.add(diagLine);

  // Arrow head
  const arrowHead = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.16, 12), lineMat);
  arrowHead.position.set(-0.02, 0.39, 0);
  arrowHead.rotation.z = Math.PI / 4;
  group.add(arrowHead);

  group.scale.setScalar(S / 0.8);
  return group;
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

  ctx.fillStyle = backgroundColor;
  const r = 6;
  ctx.beginPath();
  ctx.roundRect(0, 0, canvas.width, canvas.height, r);
  ctx.fill();

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

export default function ARScreen({ prmons = [], onSelectPrmon, onBack }) {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const { isSupported, isActive, startSession, endSession, sceneRef, hitPoseRef } = useAR();

  const [placedCount, setPlacedCount] = useState(0);
  const [error, setError] = useState(null);

  const placedMapRef = useRef(new Map()); // id → { group, prmon }
  const placedGroupsRef = useRef([]);
  const nextPlaceIdx = useRef(0);
  const lastPlaceTime = useRef(0);

  // ── Build a 3D group for a PR-mon using the PR logo ──
  const buildPrmonGroup = useCallback((prmon) => {
    const group = new THREE.Group();
    group.userData.prmonId = prmon.id;
    group.userData.spawnTime = performance.now();

    // PR logo mesh tinted by type color
    const typeColor = prmon.type?.color || '#4FC3F7';
    const logo = buildPRLogoMesh(0.08, typeColor);
    logo.position.y = 0.06;
    group.add(logo);

    // Name label floating above
    const label = makeTextSprite(`${prmon.name} Lv.${prmon.level}`, {
      fontSize: 40,
      color: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.65)',
      padding: 8,
    });
    label.position.set(0, 0.18, 0);
    label.scale.set(0.15, 0.04, 1);
    group.add(label);

    // Type badge
    const badge = makeTextSprite(`${prmon.type?.badge || '⚡'} ${prmon.type?.name || ''}`, {
      fontSize: 36,
      color: '#ffffff',
      backgroundColor: typeColor,
      padding: 6,
    });
    badge.position.set(0, 0.23, 0);
    badge.scale.set(0.08, 0.025, 1);
    group.add(badge);

    // PR title
    const title = makeTextSprite(`#${prmon.prNumber} ${prmon.prTitle}`.slice(0, 40), {
      fontSize: 28,
      color: '#ccc',
      backgroundColor: 'rgba(0,0,0,0.5)',
      padding: 6,
    });
    title.position.set(0, 0.13, 0);
    title.scale.set(0.18, 0.025, 1);
    group.add(title);

    group.scale.set(0, 0, 0);
    return group;
  }, []);

  // ── Auto-place PR-mons at hit-test positions ──
  const onFrame = useCallback((time) => {
    const scene = sceneRef.current;
    if (!scene) return;

    const now = performance.now();

    if (
      hitPoseRef.current &&
      nextPlaceIdx.current < prmons.length &&
      now - lastPlaceTime.current > PLACE_INTERVAL
    ) {
      const pos = hitPoseRef.current.transform.position;
      const candidatePos = new THREE.Vector3(pos.x, pos.y, pos.z);

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
          const grp = buildPrmonGroup(prmon);
          grp.position.copy(candidatePos);

          scene.add(grp);
          placedMapRef.current.set(prmon.id, { group: grp, prmon });
          placedGroupsRef.current.push(grp);
          nextPlaceIdx.current++;
          lastPlaceTime.current = now;
          setPlacedCount(placedMapRef.current.size);
        }
      }
    }

    // Animate: bob + rotate + pop-in
    for (const { group } of placedMapRef.current.values()) {
      const age = now - group.userData.spawnTime;

      if (age < 300) {
        const t = age / 300;
        const s = 1 - Math.pow(1 - t, 3);
        group.scale.setScalar(s);
      } else {
        group.scale.setScalar(1);
      }

      group.rotation.y += 0.005;

      const bob = Math.sin(now * 0.002 + group.userData.spawnTime) * 0.008;
      if (group.userData.baseY === undefined) {
        group.userData.baseY = group.position.y;
      }
      group.position.y = group.userData.baseY + bob;
    }
  }, [prmons, sceneRef, hitPoseRef, buildPrmonGroup]);

  // ── Handle tap → find nearest PR-mon ──
  const onSelect = useCallback((hitPose) => {
    if (!sceneRef.current || !onSelectPrmon) return;
    if (placedMapRef.current.size === 0) return;

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

      if (nearest && nearestDist < 0.4) {
        endSession();
        onSelectPrmon(nearest);
      }
    }
  }, [sceneRef, onSelectPrmon, endSession]);

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
          WebXR AR not available on this device.<br />
          <strong>Requires:</strong> Chrome on Android with ARCore.
        </p>
        <button style={styles.backBtn} onClick={onBack}>← Back</button>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.fallback}>
        <div style={{ fontSize: '3rem', marginBottom: 16 }}>⚠️</div>
        <p>Failed to start AR: {error}</p>
        <button style={styles.backBtn} onClick={onBack}>← Back</button>
      </div>
    );
  }

  if (isSupported === null) {
    return (
      <div style={styles.fallback}>
        <p>Checking AR support…</p>
      </div>
    );
  }

  return (
    <div ref={overlayRef} style={styles.container}>
      <canvas ref={canvasRef} style={styles.canvas} />

      <div style={styles.overlay}>
        <button style={styles.overlayBack} onClick={() => { endSession(); onBack?.(); }}>
          ← Back
        </button>

        <div style={styles.statusBar}>
          {placedCount === 0
            ? '📡 Scanning for PR-mons…'
            : `Found ${placedCount} PR-mon${placedCount > 1 ? 's' : ''}! Tap one to battle!`}
        </div>

        <div style={styles.radarContainer}>
          <div style={styles.radarDot} />
          <div style={styles.radarPulse} />
        </div>
      </div>

      <style>{pulseKeyframes}</style>
    </div>
  );
}

const pulseKeyframes = `
@keyframes ar-radar-pulse {
  0% { transform: scale(1); opacity: 0.7; }
  100% { transform: scale(3); opacity: 0; }
}
`;

const styles = {
  container: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
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
    top: 0, left: 0, right: 0, bottom: 0,
    pointerEvents: 'none',
    zIndex: 10,
  },
  overlayBack: {
    position: 'absolute',
    top: 16, left: 16,
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
    top: 20, right: 20,
    width: 24, height: 24,
  },
  radarDot: {
    position: 'absolute',
    top: '50%', left: '50%',
    width: 8, height: 8,
    marginTop: -4, marginLeft: -4,
    borderRadius: '50%',
    background: '#4FC3F7',
  },
  radarPulse: {
    position: 'absolute',
    top: '50%', left: '50%',
    width: 12, height: 12,
    marginTop: -6, marginLeft: -6,
    borderRadius: '50%',
    border: '2px solid #4FC3F7',
    animation: 'ar-radar-pulse 1.5s ease-out infinite',
  },
  fallback: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
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
