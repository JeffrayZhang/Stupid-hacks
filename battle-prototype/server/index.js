const express = require('express');
const cors = require('cors');
const { fetchPRs, approvePR, mergePR, postComment, postNitpick, fetchDiffChunk } = require('./github');
const { prToStats } = require('./prmon');
const { MOVES, executePlayerMove, executeEnemyMove } = require('./battle');

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

  // If GITHUB_REPO is a full URL, parse owner/repo from it
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

// Refresh PR-mons from GitHub
async function refreshPRmons() {
  try {
    const prs = await fetchPRs(REPO_OWNER, REPO_NAME);
    prmons.clear();
    for (const pr of prs) {
      const stats = prToStats(pr);
      prmons.set(stats.id, stats);
    }
    console.log(`\u{1f47e} Loaded ${prmons.size} wild PR-mons from ${REPO_OWNER}/${REPO_NAME}`);
  } catch (err) {
    console.error('Failed to fetch PRs:', err.message);
  }
}

// GET /api/prmons - List all wild PR-mons
app.get('/api/prmons', (req, res) => {
  res.json([...prmons.values()]);
});

// GET /api/prmons/:id - Get a single PR-mon
app.get('/api/prmons/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const prmon = prmons.get(id);
  if (!prmon) return res.status(404).json({ error: 'PR-mon not found' });
  res.json(prmon);
});

// POST /api/battle/:id/start - Start a battle
app.post('/api/battle/:id/start', (req, res) => {
  const id = parseInt(req.params.id);
  const prmon = prmons.get(id);
  if (!prmon) return res.status(404).json({ error: 'PR-mon not found' });

  const battleId = `battle-${id}-${Date.now()}`;
  const battle = {
    id: battleId,
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
  res.json(battle);
});

// POST /api/battle/:battleId/attack - Execute a move
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

  if (process.env.GITHUB_TOKEN) {
    const [owner, repo] = (battle.prmon.repo || `${REPO_OWNER}/${REPO_NAME}`).split('/');
    postComment(owner, repo, battle.prmon.prNumber,
      `\u{1f3c3} A reviewer encountered this PR-mon but ran away!\n\n_"I'll come back when I'm stronger..."_`
    ).catch(() => {});
  }

  res.json(battle);
});

// Webhook handler for new PRs
app.post('/api/webhook', (req, res) => {
  const { action, pull_request } = req.body;

  if (action === 'opened' || action === 'synchronize' || action === 'reopened') {
    if (pull_request) {
      const stats = prToStats(pull_request);
      prmons.set(stats.id, stats);
      console.log(`\u{1f195} Wild ${stats.name} appeared! (PR #${stats.prNumber})`);
    }
  }

  if (action === 'closed') {
    if (pull_request) {
      prmons.delete(pull_request.number);
      console.log(`\u{1f44b} PR #${pull_request.number} is gone!`);
    }
  }

  res.json({ ok: true });
});

// GET /api/moves - List available moves
app.get('/api/moves', (req, res) => {
  res.json(MOVES);
});

// Refresh on startup
refreshPRmons();

// Refresh every 2 minutes
setInterval(refreshPRmons, 2 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`\n\u{1f47e} PR-mon GO server running on port ${PORT}`);
  console.log(`\u{1f4e1} Watching ${REPO_OWNER}/${REPO_NAME} for wild PR-mons`);
  console.log(`\u26a1 ${process.env.GITHUB_TOKEN ? 'GitHub token configured' : 'No GitHub token - running in demo mode'}\n`);
});
