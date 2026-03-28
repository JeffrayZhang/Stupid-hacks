// Placeholder — will be replaced by the API agent
// This is a stub so the app compiles. The real api client
// will be dropped in by another teammate.

export async function fetchPRmons() {
  const res = await fetch('/api/prmons');
  if (!res.ok) throw new Error('Failed to fetch PRmons');
  return res.json();
}

export async function startBattle(prmonId) {
  const res = await fetch(`/api/battle/${prmonId}/start`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to start battle');
  return res.json();
}

export async function attack(battleId, moveId) {
  const res = await fetch(`/api/battle/${battleId}/attack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ move: moveId }),
  });
  if (!res.ok) throw new Error('Attack failed');
  return res.json();
}

export async function catchPrmon(battleId) {
  const res = await fetch(`/api/battle/${battleId}/catch`, { method: 'POST' });
  if (!res.ok) throw new Error('Catch failed');
  return res.json();
}

export async function runAway(battleId) {
  const res = await fetch(`/api/battle/${battleId}/run`, { method: 'POST' });
  return res.json();
}

export async function fetchMoves(prmonId) {
  const res = await fetch(`/api/prmons/${prmonId}/moves`);
  if (!res.ok) throw new Error('Failed to fetch moves');
  return res.json();
}
