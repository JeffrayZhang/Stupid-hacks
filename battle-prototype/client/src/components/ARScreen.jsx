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

const MIN_SPACING = 1.0;
const PLACE_INTERVAL = 1200;
const INTERACT_DISTANCE = 1.5; // Max distance (meters) to tap a PR-mon

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

// ── Generate well-spaced positions in concentric rings ──
// Ensures PR-mons are far apart and distributed around the user
function generateSpreadPositions(count) {
  const positions = [];
  // Ring 1: 2.5m away, up to 4 positions (N, E, S, W)
  // Ring 2: 4.5m away, up to 6 positions (offset by 30°)
  // Ring 3: 7m away, up to 8 positions (offset by 22.5°)
  const rings = [
    { radius: 2.5, slots: 4, offsetAngle: 0 },
    { radius: 4.5, slots: 6, offsetAngle: Math.PI / 6 },
    { radius: 7.0, slots: 8, offsetAngle: Math.PI / 8 },
  ];
  const groundY = -0.3;

  for (const ring of rings) {
    for (let i = 0; i < ring.slots; i++) {
      const angle = ring.offsetAngle + (i / ring.slots) * Math.PI * 2;
      // Add slight random jitter (±0.3m) so they don't look perfectly geometric
      const jitterX = (Math.random() - 0.5) * 0.6;
      const jitterZ = (Math.random() - 0.5) * 0.6;
      positions.push(new THREE.Vector3(
        Math.sin(angle) * ring.radius + jitterX,
        groundY,
        -Math.cos(angle) * ring.radius + jitterZ
      ));
      if (positions.length >= count) return positions;
    }
  }

  // If we still need more, add extras at larger distances
  while (positions.length < count) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 5 + Math.random() * 5;
    positions.push(new THREE.Vector3(
      Math.sin(angle) * radius,
      groundY,
      -Math.cos(angle) * radius
    ));
  }

  return positions;
}

export default function ARScreen({ prmons = [], onSelectPrmon, onBack }) {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const radarCanvasRef = useRef(null);
  const { isSupported, isActive, startSession, endSession, sceneRef, hitPoseRef, cameraPoseRef } = useAR();

  const [placedCount, setPlacedCount] = useState(0);
  const [error, setError] = useState(null);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [tooFarMsg, setTooFarMsg] = useState(null);
  const tooFarTimerRef = useRef(null);

  const placedMapRef = useRef(new Map()); // id → { group, prmon }
  const placedGroupsRef = useRef([]);
  const nextPlaceIdx = useRef(0);
  const lastPlaceTime = useRef(performance.now());

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

  // ── Force-place first PR-mon right in front of camera after 1s ──
  const forceSpawnedRef = useRef(false);

  // ── Auto-place PR-mons at hit-test positions ──
  const onFrame = useCallback((time) => {
    const scene = sceneRef.current;
    if (!scene) return;

    const now = performance.now();

    // Force-spawn PR-mons spread in a ring around the user, staggered over time
    if (
      !forceSpawnedRef.current &&
      prmons.length > 0 &&
      now - (lastPlaceTime.current || now) > 1000
    ) {
      // Generate well-spaced positions in concentric rings around the user
      // so PR-mons don't cluster together
      const positions = generateSpreadPositions(prmons.length);
      // Stagger spawns: spawn one every 2 seconds
      const spawnDelay = 2000;
      const elapsed = now - (lastPlaceTime.current || now);
      const maxToSpawn = Math.min(Math.floor(elapsed / spawnDelay) + 1, prmons.length, positions.length);

      for (let i = nextPlaceIdx.current; i < maxToSpawn; i++) {
        const prmon = prmons[i];
        if (!placedMapRef.current.has(prmon.id)) {
          const grp = buildPrmonGroup(prmon);
          grp.position.copy(positions[i]);
          scene.add(grp);
          placedMapRef.current.set(prmon.id, { group: grp, prmon });
          placedGroupsRef.current.push(grp);
          nextPlaceIdx.current++;
          setPlacedCount(placedMapRef.current.size);
        }
      }

      if (nextPlaceIdx.current >= Math.min(prmons.length, positions.length)) {
        forceSpawnedRef.current = true;
      }
    }

    // Also place additional ones on detected surfaces
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

    // Animate: bob + rotate + pop-in + distance-based opacity
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

      // Distance-based opacity: fade out PR-mons that are too far to interact with
      const dist = Math.sqrt(
        group.position.x * group.position.x +
        group.position.z * group.position.z
      );
      const isClose = dist <= INTERACT_DISTANCE;
      const targetOpacity = isClose ? 1.0 : Math.max(0.25, 1.0 - (dist - INTERACT_DISTANCE) * 0.15);

      group.traverse((child) => {
        if (child.material) {
          child.material.transparent = true;
          child.material.opacity = targetOpacity;
          child.material.needsUpdate = true;
        }
      });
    }

    // ── Update radar minimap ──
    const radarCanvas = radarCanvasRef.current;
    if (radarCanvas && placedMapRef.current.size > 0) {
      const ctx = radarCanvas.getContext('2d');
      const size = 120;
      const cx = size / 2;
      const cy = size / 2;
      const scale = 7; // pixels per meter (wide view for spread-out PR-mons)

      ctx.clearRect(0, 0, size, size);

      // Background circle
      ctx.beginPath();
      ctx.arc(cx, cy, cx - 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 10, 20, 0.7)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(79, 195, 247, 0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Radar rings at 2.5m, 5m, 7.5m
      for (const r of [2.5, 5, 7.5]) {
        ctx.beginPath();
        ctx.arc(cx, cy, r * scale, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(79, 195, 247, 0.15)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // Cross hairs
      ctx.strokeStyle = 'rgba(79, 195, 247, 0.1)';
      ctx.beginPath();
      ctx.moveTo(cx, 4); ctx.lineTo(cx, size - 4);
      ctx.moveTo(4, cy); ctx.lineTo(size - 4, cy);
      ctx.stroke();

      // Get camera position and heading from the XR viewer pose
      const camPose = cameraPoseRef.current;
      let cameraY = camPose.heading;
      let camX = camPose.x, camZ = camPose.z;

      // Draw PR-mon dots
      for (const { group, prmon } of placedMapRef.current.values()) {
        const relX = (group.position.x - camX) * scale;
        const relZ = (group.position.z - camZ) * scale;

        // Rotate by camera heading (negate for radar)
        const rx = relX * Math.cos(cameraY) - relZ * Math.sin(cameraY);
        const ry = relX * Math.sin(cameraY) + relZ * Math.cos(cameraY);

        const dotX = cx + rx;
        const dotY = cy + ry;

        // Clamp to radar bounds
        const dist = Math.sqrt(rx * rx + ry * ry);
        if (dist > cx - 8) continue; // off radar

        const typeColor = prmon.type?.color || '#4FC3F7';
        const worldDist = Math.sqrt(
          Math.pow(group.position.x - camX, 2) +
          Math.pow(group.position.z - camZ, 2)
        );

        // Pulse effect when close
        if (worldDist < 0.5) {
          const pulseR = 6 + Math.sin(now * 0.008) * 3;
          ctx.beginPath();
          ctx.arc(dotX, dotY, pulseR, 0, Math.PI * 2);
          ctx.fillStyle = typeColor + '44';
          ctx.fill();
        }

        // Dot
        ctx.beginPath();
        ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
        ctx.fillStyle = typeColor;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // User triangle at center
      ctx.save();
      ctx.translate(cx, cy);
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(-4, 4);
      ctx.lineTo(4, 4);
      ctx.closePath();
      ctx.fillStyle = '#4FC3F7';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  }, [prmons, sceneRef, hitPoseRef, cameraPoseRef, buildPrmonGroup]);

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

      if (nearest && nearestDist < INTERACT_DISTANCE) {
        endSession();
        onSelectPrmon(nearest);
      } else if (nearest) {
        // Show "too far" feedback
        const distMeters = Math.round(nearestDist * 10) / 10;
        setTooFarMsg(`Too far! Walk ${distMeters}m closer to ${nearest.name}`);
        if (tooFarTimerRef.current) clearTimeout(tooFarTimerRef.current);
        tooFarTimerRef.current = setTimeout(() => setTooFarMsg(null), 2500);
      }
    }
  }, [sceneRef, onSelectPrmon, endSession]);

  // ── Start AR session on user tap (requires user activation) ──
  const handleStartAR = useCallback(async () => {
    try {
      await startSession(canvasRef.current, {
        overlayEl: overlayRef.current,
        onFrame,
        onSelect,
      });
      setSessionStarted(true);
    } catch (err) {
      setError(err.message);
    }
  }, [startSession, onFrame, onSelect]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      placedMapRef.current.clear();
      placedGroupsRef.current = [];
      nextPlaceIdx.current = 0;
      lastPlaceTime.current = 0;
      setPlacedCount(0);
    };
  }, []);

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
        <button style={styles.backBtn} onClick={() => { setError(null); setSessionStarted(false); }}>🔄 Try Again</button>
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

  // Show start button before session is active
  if (!sessionStarted) {
    return (
      <div ref={overlayRef} style={styles.container}>
        <canvas ref={canvasRef} style={{ ...styles.canvas, display: 'none' }} />
        <div style={styles.startOverlay}>
          <div style={styles.startIcon}>📡</div>
          <button style={styles.startBtn} onClick={handleStartAR}>
            TAP TO SCAN FOR PR-MONS
          </button>
          <button style={{ ...styles.backBtn, marginTop: 16 }} onClick={onBack}>← Back</button>
        </div>
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
          {tooFarMsg
            ? `🚶 ${tooFarMsg}`
            : placedCount === 0
              ? '📡 Scanning for PR-mons…'
              : `Found ${placedCount} PR-mon${placedCount > 1 ? 's' : ''}! Walk close & tap to battle!`}
        </div>

        {/* Minimap Radar */}
        <canvas
          ref={radarCanvasRef}
          width={120}
          height={120}
          style={styles.radarCanvas}
        />
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
  radarCanvas: {
    position: 'absolute',
    bottom: 80,
    right: 16,
    width: 120,
    height: 120,
    borderRadius: '50%',
    border: '2px solid rgba(79, 195, 247, 0.5)',
    pointerEvents: 'none',
    backdropFilter: 'blur(4px)',
    boxShadow: '0 0 12px rgba(79, 195, 247, 0.3), inset 0 0 20px rgba(0, 10, 20, 0.5)',
  },
  startOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)',
    zIndex: 20,
  },
  startIcon: {
    fontSize: '4rem',
    marginBottom: 24,
    animation: 'ar-radar-pulse 2s ease-in-out infinite alternate',
  },
  startBtn: {
    padding: '18px 40px',
    borderRadius: 16,
    background: 'linear-gradient(135deg, #4FC3F7, #2196F3)',
    border: '2px solid rgba(255,255,255,0.3)',
    color: '#fff',
    fontSize: '1.3rem',
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: 1,
    boxShadow: '0 4px 20px rgba(79, 195, 247, 0.4)',
    transition: 'transform 0.1s',
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
