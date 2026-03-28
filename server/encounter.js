const crypto = require('crypto');

const encounters = new Map();

function createEncounter(sessionId, prmonId, arPosition) {
  const encounterId = `enc-${crypto.randomUUID()}`;
  const encounter = {
    encounterId,
    sessionId: sessionId || null,
    prmonId,
    arPosition: arPosition || { x: 0, y: 0, z: 0 },
    createdAt: Date.now(),
    battleId: null,
  };
  encounters.set(encounterId, encounter);
  return encounter;
}

function getEncounter(encounterId) {
  return encounters.get(encounterId) || null;
}

function linkBattle(encounterId, battleId) {
  const encounter = encounters.get(encounterId);
  if (!encounter) return false;
  encounter.battleId = battleId;
  return true;
}

module.exports = { createEncounter, getEncounter, linkBattle };
