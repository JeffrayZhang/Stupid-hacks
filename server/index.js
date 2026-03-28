require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const http = require('http');
const express = require('express');
const cors = require('cors');
const { fetchPRs, approvePR, mergePR, postComment, postNitpick, fetchDiffChunk } = require('./github');
const { prToStats, TYPES } = require('./prmon');
const { MOVES, executePlayerMove, executeEnemyMove } = require('./battle');
const { createSession, getSession, deleteSession, addCaughtPrmon, setActiveBattle } = require('./session');
const { createEncounter, getEncounter, linkBattle } = require('./encounter');
const events = require('./events');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// In-memory store of active PR-mons
const prmons = new Map();
// Active battle sessions
const battles = new Map();

// Configure repo from env - handle full URLs like https://github.com/owner/repo.git
function parseRepo() {
  const rawOwner = process.env.GITHUB_OWNER || '';
  const rawRepo = process.env.GITHUB_REPO || '';

  const urlMatch = rawRepo.match(/github\.com\/([^/]+)\/([^/.]+)/);
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2] };
  }

  return {
    owner: rawOwner || 'JeffrayZhang',
    repo: rawRepo || 'Stupid-hacks',
  };
}

const { owner: REPO_OWNER, repo: REPO_NAME } = parseRepo();

// Refresh PR-mons from GitHub (delta-based to avoid false Socket.IO events)
async function refreshPRmons() {
  try {
    const prs = await fetchPRs(REPO_OWNER, REPO_NAME);
    const oldIds = new Set(prmons.keys());
    const newIds = new Set();

    for (const pr of prs) {
      const stats = prToStats(pr);
      newIds.add(stats.id);

      if (!prmons.has(stats.id)) {
        events.emit('prmon:appeared', { prmon: stats });
      } else {
        const old = prmons.get(stats.id);
        if (old.hp !== stats.hp || old.level !== stats.level) {
          events.emit('prmon:updated', { prmon: stats });
        }
      }
      prmons.set(stats.id, stats);
    }

    // Detect disappeared PR-mons
    for (const oldId of oldIds) {
      if (!newIds.has(oldId)) {
        prmons.delete(oldId);
        events.emit('prmon:disappeared', { prmonId: oldId });
      }
    }

    console.log(`\u{1f47e} Loaded ${prmons.size} wild PR-mons from ${REPO_OWNER}/${REPO_NAME}`);
  } catch (err) {
    console.error('Failed to fetch PRs:', err.message);
  }
}

// ─── Session endpoints ───

app.post('/api/session', (req, res) => {
  const session = createSession();
  res.json(session);
});

app.get('/api/session/:sessionId', (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

app.delete('/api/session/:sessionId', (req, res) => {
  const deleted = deleteSession(req.params.sessionId);
  if (!deleted) return res.status(404).json({ error: 'Session not found' });
  res.json({ ok: true });
});

// ─── PR-mon discovery ───

app.get('/api/prmons', (req, res) => {
  res.json([...prmons.values()]);
});

app.get('/api/prmons/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const prmon = prmons.get(id);
  if (!prmon) return res.status(404).json({ error: 'PR-mon not found' });
  res.json(prmon);
});

app.post('/api/prmons/refresh', async (req, res) => {
  await refreshPRmons();
  res.json([...prmons.values()]);
});

// ─── AR encounter ───

app.post('/api/encounter', (req, res) => {
  const { sessionId, prmonId, arPosition } = req.body;

  if (sessionId) {
    const session = getSession(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
  }

  const prmon = prmons.get(prmonId);
  if (!prmon) return res.status(404).json({ error: 'PR-mon not found' });

  const encounter = createEncounter(sessionId, prmonId, arPosition);

  res.json({
    encounterId: encounter.encounterId,
    prmon,
    canBattle: true,
    message: `A wild ${prmon.name} appeared!`,
  });
});

app.get('/api/encounter/:encounterId', (req, res) => {
  const encounter = getEncounter(req.params.encounterId);
  if (!encounter) return res.status(404).json({ error: 'Encounter not found' });

  const prmon = prmons.get(encounter.prmonId);
  res.json({
    ...encounter,
    prmon: prmon || null,
    canBattle: !!prmon && !encounter.battleId,
  });
});

// ─── Battle system ───

app.post('/api/battle/:id/start', (req, res) => {
  const id = parseInt(req.params.id);
  const prmon = prmons.get(id);
  if (!prmon) return res.status(404).json({ error: 'PR-mon not found' });

  const battleId = `battle-${id}-${Date.now()}`;
  const { sessionId, encounterId } = req.body || {};

  const battle = {
    id: battleId,
    sessionId: sessionId || null,
    encounterId: encounterId || null,
    prmon: { ...prmon },
    playerHp: 200,
    playerMaxHp: 200,
    turn: 1,
    isEnraged: false,
    dotEffect: null,
    stunned: false,
    log: [`A wild ${prmon.name} appeared! (Lv.${prmon.level} ${prmon.type.badge}${prmon.type.name})`],
    status: 'active',
  };
  battles.set(battleId, battle);

  if (sessionId) setActiveBattle(sessionId, battleId);
  if (encounterId) linkBattle(encounterId, battleId);

  events.emit('battle:started', { battleId, prmonId: id });

  res.json(battle);
});

app.get('/api/battle/:battleId', (req, res) => {
  const battle = battles.get(req.params.battleId);
  if (!battle) return res.status(404).json({ error: 'Battle not found' });
  res.json(battle);
});

app.post('/api/battle/:battleId/attack', async (req, res) => {
  const battle = battles.get(req.params.battleId);
  if (!battle) return res.status(404).json({ error: 'Battle not found' });
  if (battle.status !== 'active') return res.status(400).json({ error: 'Battle is over' });

  const { move } = req.body;
  if (!MOVES[move]) return res.status(400).json({ error: 'Unknown move' });

  const turnLog = [];

  // Check if stunned
  if (battle.stunned) {
    turnLog.push('You\'re frozen by a MERGE CONFLICT! Can\'t move this turn!');
    battle.stunned = false;
  } else {
    // Player attacks
    const playerResult = executePlayerMove(move, battle.prmon, battle.playerHp);
    battle.prmon.hp = Math.max(0, battle.prmon.hp - playerResult.damage);
    battle.playerHp = Math.max(0, battle.playerHp - playerResult.playerDamage);
    turnLog.push(playerResult.message);

    if (playerResult.damage > 0) {
      turnLog.push(`${battle.prmon.name} took ${playerResult.damage} damage!`);
    }
    if (playerResult.playerDamage > 0) {
      turnLog.push(`Recoil! You took ${playerResult.playerDamage} damage!`);
    }
    if (playerResult.dot) {
      battle.dotEffect = playerResult.dot;
      turnLog.push(`${battle.prmon.name} is poisoned by NITPICK! (${playerResult.dot.damage} dmg for ${playerResult.dot.turns} turns)`);
    }
    if (playerResult.enraged) {
      battle.isEnraged = true;
      turnLog.push(`${battle.prmon.name} is ENRAGED! Its attacks will hit harder!`);
    }

    // Nitpick side effect: actually post a nitpick comment
    if (move === 'nitpick' && process.env.GITHUB_TOKEN) {
      const [owner, repo] = (battle.prmon.repo || `${REPO_OWNER}/${REPO_NAME}`).split('/');
      postNitpick(owner, repo, battle.prmon.prNumber).catch(() => {});
    }
  }

  // Apply DOT
  if (battle.dotEffect && battle.dotEffect.turns > 0) {
    battle.prmon.hp = Math.max(0, battle.prmon.hp - battle.dotEffect.damage);
    battle.dotEffect.turns--;
    if (battle.dotEffect.turns > 0) {
      turnLog.push(`${battle.prmon.name} takes ${battle.dotEffect.damage} poison damage! (${battle.dotEffect.turns} turns left)`);
    } else {
      turnLog.push(`${battle.prmon.name} takes ${battle.dotEffect.damage} poison damage! The poison wore off.`);
      battle.dotEffect = null;
    }
  }

  // Check if PR-mon fainted
  if (battle.prmon.hp <= 0) {
    battle.status = 'won';
    turnLog.push(`${battle.prmon.name} fainted!`);
    turnLog.push(`PR #${battle.prmon.prNumber} is ready to be caught!`);
    battle.log.push(...turnLog);
    events.emit('battle:turnResult', { battleId: battle.id, turnLog, prmonHp: battle.prmon.hp, playerHp: battle.playerHp });
    events.emit('battle:ended', { battleId: battle.id, result: 'won' });
    return res.json(battle);
  }

  // Enemy attacks back with a diff chunk
  let diffChunk = null;
  try {
    const [owner, repo] = (battle.prmon.repo || `${REPO_OWNER}/${REPO_NAME}`).split('/');
    diffChunk = await fetchDiffChunk(owner, repo, battle.prmon.prNumber);
  } catch {
    diffChunk = { filename: '???', chunk: '// the code fights back' };
  }

  const enemyResult = executeEnemyMove(battle.prmon, battle.isEnraged);
  battle.playerHp = Math.max(0, battle.playerHp - enemyResult.damage);
  turnLog.push(`---`);
  turnLog.push(enemyResult.message);
  if (diffChunk) {
    turnLog.push(`[${diffChunk.filename}]`);
  }
  if (enemyResult.damage > 0) {
    turnLog.push(`You took ${enemyResult.damage} damage!`);
  }
  if (enemyResult.heal > 0) {
    battle.prmon.hp = Math.min(battle.prmon.maxHp, battle.prmon.hp + enemyResult.heal);
    turnLog.push(`${battle.prmon.name} healed ${enemyResult.heal} HP!`);
  }
  if (enemyResult.stun) {
    battle.stunned = true;
  }

  // Clear enrage after one enemy turn
  if (battle.isEnraged) {
    battle.isEnraged = false;
  }

  // Check if player fainted
  if (battle.playerHp <= 0) {
    battle.status = 'lost';
    turnLog.push('You blacked out! The PR-mon was too powerful...');
    battle.log.push(...turnLog);

    events.emit('battle:turnResult', { battleId: battle.id, turnLog, prmonHp: battle.prmon.hp, playerHp: battle.playerHp });
    events.emit('battle:ended', { battleId: battle.id, result: 'lost' });

    // Post defeat comment
    if (process.env.GITHUB_TOKEN) {
      const [owner, repo] = (battle.prmon.repo || `${REPO_OWNER}/${REPO_NAME}`).split('/');
      postComment(owner, repo, battle.prmon.prNumber,
        `\u{1f47e} A reviewer attempted to battle this PR-mon but was defeated!\n\n` +
        `**${battle.prmon.name}** (Lv.${battle.prmon.level}) proved too powerful.\n\n` +
        `_"This PR-mon can't be caught yet... it needs more review training."_`
      ).catch(() => {});
    }

    return res.json(battle);
  }

  battle.turn++;
  battle.log.push(...turnLog);
  events.emit('battle:turnResult', { battleId: battle.id, turnLog, prmonHp: battle.prmon.hp, playerHp: battle.playerHp });
  res.json(battle);
});

// POST /api/battle/:battleId/catch - Approve + merge (only when won)
app.post('/api/battle/:battleId/catch', async (req, res) => {
  const battle = battles.get(req.params.battleId);
  if (!battle) return res.status(404).json({ error: 'Battle not found' });
  if (battle.status !== 'won') return res.status(400).json({ error: 'Must defeat PR-mon first!' });

  const [owner, repo] = (battle.prmon.repo || `${REPO_OWNER}/${REPO_NAME}`).split('/');
  const prNumber = battle.prmon.prNumber;

  try {
    if (process.env.GITHUB_TOKEN) {
      await approvePR(owner, repo, prNumber);
      await mergePR(owner, repo, prNumber);
    }
    battle.status = 'caught';
    battle.log.push(`\u{1f389} Gotcha! ${battle.prmon.name} was caught!`);
    battle.log.push(`PR #${prNumber} has been merged!`);
    prmons.delete(battle.prmon.id);

    if (battle.sessionId) {
      addCaughtPrmon(battle.sessionId, { ...battle.prmon });
    }

    events.emit('battle:ended', { battleId: battle.id, result: 'caught' });
    events.emit('prmon:disappeared', { prmonId: battle.prmon.id });

    res.json(battle);
  } catch (err) {
    res.status(500).json({ error: `Merge failed: ${err.message}` });
  }
});

// POST /api/battle/:battleId/run - Run away
app.post('/api/battle/:battleId/run', async (req, res) => {
  const battle = battles.get(req.params.battleId);
  if (!battle) return res.status(404).json({ error: 'Battle not found' });

  battle.status = 'fled';
  battle.log.push('Got away safely!');

  events.emit('battle:ended', { battleId: battle.id, result: 'fled' });

  if (process.env.GITHUB_TOKEN) {
    const [owner, repo] = (battle.prmon.repo || `${REPO_OWNER}/${REPO_NAME}`).split('/');
    postComment(owner, repo, battle.prmon.prNumber,
      `\u{1f3c3} A reviewer encountered this PR-mon but ran away!\n\n_"I'll come back when I'm stronger..."_`
    ).catch(() => {});
  }

  res.json(battle);
});

// ─── Webhook ───

app.post('/api/webhook', (req, res) => {
  const { action, pull_request } = req.body;

  if (action === 'opened' || action === 'reopened') {
    if (pull_request) {
      const stats = prToStats(pull_request);
      prmons.set(stats.id, stats);
      console.log(`\u{1f195} Wild ${stats.name} appeared! (PR #${stats.prNumber})`);
      events.emit('prmon:appeared', { prmon: stats });
    }
  }

  if (action === 'synchronize') {
    if (pull_request) {
      const stats = prToStats(pull_request);
      prmons.set(stats.id, stats);
      console.log(`\u{1f504} PR-mon ${stats.name} updated! (PR #${stats.prNumber})`);
      events.emit('prmon:updated', { prmon: stats });
    }
  }

  if (action === 'closed') {
    if (pull_request) {
      prmons.delete(pull_request.number);
      console.log(`\u{1f44b} PR #${pull_request.number} is gone!`);
      events.emit('prmon:disappeared', { prmonId: pull_request.number });
    }
  }

  res.json({ ok: true });
});

// ─── Game data ───

app.get('/api/moves', (req, res) => {
  res.json(MOVES);
});

app.get('/api/types', (req, res) => {
  res.json(TYPES);
});

// ─── Start server ───

refreshPRmons();
setInterval(refreshPRmons, 2 * 60 * 1000);

const server = http.createServer(app);
events.init(server);

server.listen(PORT, () => {
  console.log(`\n\u{1f47e} PR-mon GO server running on port ${PORT}`);
  console.log(`\u{1f4e1} Watching ${REPO_OWNER}/${REPO_NAME} for wild PR-mons`);
  console.log(`\u{1f50c} Socket.IO ready for real-time events`);
  console.log(`\u26a1 ${process.env.GITHUB_TOKEN ? 'GitHub token configured' : 'No GitHub token - running in demo mode'}\n`);
});
