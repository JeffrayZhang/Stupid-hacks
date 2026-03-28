const crypto = require('crypto');

const sessions = new Map();

function createSession() {
  const sessionId = crypto.randomUUID();
  const session = {
    sessionId,
    player: {
      name: 'REVIEWER',
      level: 99,
      hp: 200,
      maxHp: 200,
      caughtPrmons: [],
      activeBattleId: null,
    },
  };
  sessions.set(sessionId, session);
  return session;
}

function getSession(sessionId) {
  return sessions.get(sessionId) || null;
}

function deleteSession(sessionId) {
  return sessions.delete(sessionId);
}

function addCaughtPrmon(sessionId, prmon) {
  const session = sessions.get(sessionId);
  if (!session) return false;
  session.player.caughtPrmons.push(prmon);
  session.player.activeBattleId = null;
  return true;
}

function setActiveBattle(sessionId, battleId) {
  const session = sessions.get(sessionId);
  if (!session) return false;
  session.player.activeBattleId = battleId;
  return true;
}

module.exports = { createSession, getSession, deleteSession, addCaughtPrmon, setActiveBattle };
