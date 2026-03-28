const API = '/api';

export async function fetchPRmons() {
  const res = await fetch(`${API}/prmons`);
  return res.json();
}

export async function startBattle(prmonId) {
  const res = await fetch(`${API}/battle/${prmonId}/start`, { method: 'POST' });
  return res.json();
}

export async function attack(battleId, moveId) {
  const res = await fetch(`${API}/battle/${battleId}/attack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ move: moveId }),
  });
  return res.json();
}

export async function catchPrmon(battleId) {
  const res = await fetch(`${API}/battle/${battleId}/catch`, { method: 'POST' });
  return res.json();
}

export async function runAway(battleId) {
  const res = await fetch(`${API}/battle/${battleId}/run`, { method: 'POST' });
  return res.json();
}

export async function fetchMoves() {
  const res = await fetch(`${API}/moves`);
  return res.json();
}
