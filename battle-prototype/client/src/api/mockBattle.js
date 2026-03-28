/**
 * Client-side mock of the server battle engine.
 * Logic mirrors battle-prototype/server/battle.js exactly.
 */

// ── Moves & Enemy Attacks (copied from server/battle.js) ──────────────────

export const MOVES = {
  lgtm: {
    name: 'LGTM',
    damage: 30,
    type: 'normal',
    description: 'A solid approval. Reliable and true.',
    messages: [
      '{player} used LGTM! Looks good to me!',
      '{player} stamps the PR with approval!',
      '{player} gives a confident thumbs up!',
      '{player} used LGTM! The code... it\'s beautiful.',
      '{player} approves with the wisdom of a thousand reviewers!',
    ],
  },
  nitpick: {
    name: 'NITPICK',
    damage: 10,
    type: 'poison',
    dot: { damage: 5, turns: 3 },
    description: 'Low damage but poisons with doubt.',
    messages: [
      '{player} used NITPICK! "Actually, this could be more idiomatic..."',
      '{player} leaves a passive-aggressive comment!',
      '{player} used NITPICK! The PR-mon is confused by pedantry!',
      '{player} points out a missing semicolon from 3 files ago!',
      '{player} used NITPICK! "Per the style guide, subsection 4.2.1..."',
    ],
  },
  request_changes: {
    name: 'REQUEST CHANGES',
    damage: 50,
    type: 'fighting',
    enrage: true,
    description: 'Heavy hit, but the PR-mon gets angry.',
    messages: [
      '{player} used REQUEST CHANGES! It\'s devastating!',
      '{player} demands a complete rewrite! Critical hit!',
      '{player} blocked the PR! The PR-mon is ENRAGED!',
      '{player} used REQUEST CHANGES! "This needs work."',
      '{player} slams the Changes Requested button!',
    ],
  },
  force_push: {
    name: 'FORCE PUSH',
    damage: 99,
    type: 'fire',
    recoil: 50,
    description: 'Massive damage, but hurts you too.',
    messages: [
      '{player} used FORCE PUSH! History was rewritten!',
      '{player} force-pushed to main! CHAOS ENSUES!',
      '{player} used FORCE PUSH! It\'s super effective but... wait, your HP!',
      '{player} obliterates the commit history! The recoil is immense!',
      '{player} used FORCE PUSH! "I\'ll deal with the consequences later!"',
    ],
  },
};

export const ENEMY_ATTACKS = [
  {
    name: 'MERGE CONFLICT',
    damage: 0,
    stun: true,
    messages: [
      'PR-mon used MERGE CONFLICT! You\'re stunned for a turn!',
      'PR-mon created a MERGE CONFLICT! You can\'t move!',
      'PR-mon tangled the branches! MERGE CONFLICT!',
    ],
  },
  {
    name: 'SCOPE CREEP',
    damage: 0,
    heal: 30,
    messages: [
      'PR-mon used SCOPE CREEP! It healed 30 HP!',
      'PR-mon added 47 new features! SCOPE CREEP restored health!',
      'PR-mon used SCOPE CREEP! "While we\'re at it..."',
    ],
  },
  {
    name: 'SPAGHETTI CODE',
    damage: 25,
    messages: [
      'PR-mon used SPAGHETTI CODE! The indentation... it burns!',
      'PR-mon hurled SPAGHETTI CODE! You take damage from confusion!',
      'PR-mon used SPAGHETTI CODE! Your eyes can\'t follow the logic!',
    ],
  },
  {
    name: 'TECH DEBT',
    damage: 15,
    messages: [
      'PR-mon used TECH DEBT! It\'s been accumulating...',
      'PR-mon leveraged TECH DEBT! TODO comments rain down!',
      'PR-mon invoked TECH DEBT! "We\'ll fix it later" echoes...',
    ],
  },
  {
    name: 'PRODUCTION PUSH',
    damage: 30,
    messages: [
      'PR-mon used PRODUCTION PUSH! It deployed on a Friday!',
      'PR-mon pushed to PRODUCTION! The PagerDuty alarms blare!',
      'PR-mon used PRODUCTION PUSH! "It works on my machine!"',
    ],
  },
  {
    name: 'CIRCULAR IMPORT',
    damage: 20,
    messages: [
      'PR-mon used CIRCULAR IMPORT! It\'s dizzying!',
      'PR-mon created a CIRCULAR IMPORT! Module A needs B needs A needs...',
      'PR-mon used CIRCULAR IMPORT! Stack overflow imminent!',
    ],
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function executePlayerMove(moveId, prmon, playerHp) {
  const move = MOVES[moveId];
  if (!move) return { error: 'Unknown move' };

  const result = {
    move: move.name,
    message: pickRandom(move.messages).replace('{player}', 'REVIEWER'),
    damage: move.damage,
    playerDamage: 0,
    dot: null,
    enraged: false,
  };

  if (move.recoil) {
    result.playerDamage = move.recoil;
  }

  if (move.dot) {
    result.dot = { ...move.dot };
  }

  if (move.enrage) {
    result.enraged = true;
  }

  return result;
}

export function executeEnemyMove(prmon, isEnraged) {
  const attack = pickRandom(ENEMY_ATTACKS);
  const damageMultiplier = isEnraged ? 1.5 : 1;

  const result = {
    move: attack.name,
    message: pickRandom(attack.messages).replace('{prmon}', prmon.name),
    damage: Math.floor((attack.damage || 0) * damageMultiplier),
    heal: attack.heal || 0,
    stun: attack.stun || false,
  };

  if (!attack.damage && !attack.heal && !attack.stun) {
    result.damage = Math.floor((10 + Math.random() * 20) * damageMultiplier);
  }

  return result;
}

// ── Mock Battle API ───────────────────────────────────────────────────────

/**
 * Create a new battle state for the given PR-mon.
 * Mirrors POST /api/battle/:id/start on the server.
 */
export function createMockBattle(prmon) {
  return {
    id: `battle-${prmon.id}-${Date.now()}`,
    prmon: { ...prmon },
    playerHp: 200,
    playerMaxHp: 200,
    turn: 1,
    isEnraged: false,
    dotEffect: null,
    stunned: false,
    status: 'active',
    log: [
      `A wild ${prmon.name} appeared! (Lv.${prmon.level} ${prmon.type.badge}${prmon.type.name})`,
    ],
  };
}

/**
 * Process one attack turn.
 * Mirrors POST /api/battle/:battleId/attack on the server.
 * Returns the mutated battle state.
 */
export function processMockAttack(battle, moveId) {
  if (battle.status !== 'active') return battle;
  if (!MOVES[moveId]) return battle;

  const turnLog = [];

  // Check if stunned
  if (battle.stunned) {
    turnLog.push("You're frozen by a MERGE CONFLICT! Can't move this turn!");
    battle.stunned = false;
  } else {
    // Player attacks
    const playerResult = executePlayerMove(moveId, battle.prmon, battle.playerHp);
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
      turnLog.push(
        `${battle.prmon.name} is poisoned by NITPICK! (${playerResult.dot.damage} dmg for ${playerResult.dot.turns} turns)`
      );
    }
    if (playerResult.enraged) {
      battle.isEnraged = true;
      turnLog.push(`${battle.prmon.name} is ENRAGED! Its attacks will hit harder!`);
    }
  }

  // Apply DOT
  if (battle.dotEffect && battle.dotEffect.turns > 0) {
    battle.prmon.hp = Math.max(0, battle.prmon.hp - battle.dotEffect.damage);
    battle.dotEffect.turns--;
    if (battle.dotEffect.turns > 0) {
      turnLog.push(
        `${battle.prmon.name} takes ${battle.dotEffect.damage} poison damage! (${battle.dotEffect.turns} turns left)`
      );
    } else {
      turnLog.push(
        `${battle.prmon.name} takes ${battle.dotEffect.damage} poison damage! The poison wore off.`
      );
      battle.dotEffect = null;
    }
  }

  // Check if PR-mon fainted
  if (battle.prmon.hp <= 0) {
    battle.status = 'won';
    turnLog.push(`${battle.prmon.name} fainted!`);
    turnLog.push(`PR #${battle.prmon.prNumber} is ready to be caught!`);
    battle.log.push(...turnLog);
    return battle;
  }

  // Enemy attacks back
  const enemyResult = executeEnemyMove(battle.prmon, battle.isEnraged);
  battle.playerHp = Math.max(0, battle.playerHp - enemyResult.damage);
  turnLog.push('---');
  turnLog.push(enemyResult.message);

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
    return battle;
  }

  battle.turn++;
  battle.log.push(...turnLog);
  return battle;
}
