/**
 * Unified API client for PR-mon GO.
 *
 * When VITE_API_URL is set → hits the real backend.
 * Otherwise → runs everything locally with mock data + mock battle engine.
 */

import { MOCK_PRMONS } from './mockData.js';
import { MOVES, createMockBattle, processMockAttack } from './mockBattle.js';

const USE_MOCK = !import.meta.env.VITE_API_URL;
const BASE = import.meta.env.VITE_API_URL || '';

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
  if (USE_MOCK) {
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
  if (USE_MOCK) {
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
  if (USE_MOCK) {
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
  if (USE_MOCK) {
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
  if (USE_MOCK) {
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
  if (USE_MOCK) {
    await mockDelay();
    return clone(MOVES);
  }
  return apiFetch('/api/moves');
}
