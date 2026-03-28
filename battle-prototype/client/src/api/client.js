/**
 * Unified API client for PR-mon GO.
 *
 * When VITE_API_URL is set → hits the real backend.
 * Otherwise → runs everything locally with mock data + mock battle engine.
 */

import { MOCK_PRMONS } from './mockData.js';
import { MOVES, createMockBattle, processMockAttack } from './mockBattle.js';

/**
 * Mode detection:
 * - VITE_API_URL set         → always use real API at that URL
 * - VITE_API_URL not set     → try proxy (/api) first, fall back to mock if server unreachable
 */
const EXPLICIT_API = import.meta.env.VITE_API_URL;
const BASE = EXPLICIT_API || '';

let _mockMode = !!EXPLICIT_API ? false : null; // null = unknown, will probe

// ── Module-level state for mock mode ──────────────────────────────────────

/** @type {Map<string, object>} battleId → BattleState */
const activeBattles = new Map();

// ── Helpers ───────────────────────────────────────────────────────────────

/** Artificial network delay for mock mode (200-400ms). */
function mockDelay() {
  const ms = 200 + Math.random() * 200;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Deep-clone an object so callers can't mutate internal state. */
function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Probe the real API once (when no explicit URL is set).
 * Returns true if the server is reachable via the Vite proxy.
 */
async function probeApi() {
  if (_mockMode !== null) return !_mockMode;
  try {
    const res = await fetch(`${BASE}/api/types`, { signal: AbortSignal.timeout(1500) });
    if (res.ok) {
      _mockMode = false;
      console.log('[PR-mon] Real API detected via proxy — using live data');
      return true;
    }
  } catch {
    // server not running
  }
  _mockMode = true;
  console.log('[PR-mon] No API server detected — using mock data');
  return false;
}

/** Check if we should use mock mode (probes once if needed). */
async function shouldMock() {
  if (_mockMode !== null) return _mockMode;
  await probeApi();
  return _mockMode;
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error ${res.status}`);
  }
  return res.json();
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Fetch all wild PR-mons.
 * @returns {Promise<Array>}
 */
export async function fetchPRmons() {
  if (await shouldMock()) {
    await mockDelay();
    return clone(MOCK_PRMONS);
  }
  return apiFetch('/api/prmons');
}

/**
 * Start a battle against a PR-mon.
 * @param {number} prmonId
 * @returns {Promise<object>} BattleState
 */
export async function startBattle(prmonId) {
  if (await shouldMock()) {
    await mockDelay();
    const prmon = MOCK_PRMONS.find((p) => p.id === prmonId);
    if (!prmon) throw new Error('PR-mon not found');
    const battle = createMockBattle(clone(prmon));
    activeBattles.set(battle.id, battle);
    return clone(battle);
  }
  return apiFetch(`/api/battle/${prmonId}/start`, { method: 'POST' });
}

/**
 * Execute an attack move during a battle.
 * @param {string} battleId
 * @param {string} moveId  One of: lgtm, nitpick, request_changes, force_push
 * @returns {Promise<object>} Updated BattleState
 */
export async function attack(battleId, moveId) {
  if (await shouldMock()) {
    await mockDelay();
    const battle = activeBattles.get(battleId);
    if (!battle) throw new Error('Battle not found');
    processMockAttack(battle, moveId);
    return clone(battle);
  }
  return apiFetch(`/api/battle/${battleId}/attack`, {
    method: 'POST',
    body: JSON.stringify({ move: moveId }),
  });
}

/**
 * Catch a defeated PR-mon (approve + merge).
 * @param {string} battleId
 * @returns {Promise<object>} Updated BattleState
 */
export async function catchPrmon(battleId) {
  if (await shouldMock()) {
    await mockDelay();
    const battle = activeBattles.get(battleId);
    if (!battle) throw new Error('Battle not found');
    if (battle.status !== 'won') throw new Error('Must defeat PR-mon first!');
    battle.status = 'caught';
    battle.log.push(`🎉 Gotcha! ${battle.prmon.name} was caught!`);
    battle.log.push(`PR #${battle.prmon.prNumber} has been merged!`);
    return clone(battle);
  }
  return apiFetch(`/api/battle/${battleId}/catch`, { method: 'POST' });
}

/**
 * Run away from a battle.
 * @param {string} battleId
 * @returns {Promise<object>} Updated BattleState
 */
export async function runAway(battleId) {
  if (await shouldMock()) {
    await mockDelay();
    const battle = activeBattles.get(battleId);
    if (!battle) throw new Error('Battle not found');
    battle.status = 'fled';
    battle.log.push('Got away safely!');
    return clone(battle);
  }
  return apiFetch(`/api/battle/${battleId}/run`, { method: 'POST' });
}

/**
 * Fetch the available player moves.
 * @returns {Promise<object>} Map of moveId → move definition
 */
export async function fetchMoves() {
  if (await shouldMock()) {
    await mockDelay();
    return clone(MOVES);
  }
  return apiFetch('/api/moves');
}
