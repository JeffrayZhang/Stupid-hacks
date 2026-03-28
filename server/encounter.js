const crypto = require('crypto');

const encounters = new Map();

function createEncounter(sessionId, prmonId, arPosition) {
  const encounterId = `enc-${crypto.randomUUID()}`;
  // Generate a spread-out default position if none provided
  const defaultPosition = (() => {
    const angle = Math.random() * Math.PI * 2;
    const radius = 2.5 + Math.random() * 4.5; // 2.5m–7m from origin
    return {
      x: Math.sin(angle) * radius,
      y: -0.3,
      z: -Math.cos(angle) * radius,
    };
  })();

  const encounter = {
    encounterId,
    sessionId: sessionId || null,
    prmonId,
    arPosition: arPosition || defaultPosition,
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
