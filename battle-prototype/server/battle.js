const MOVES = {
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

const ENEMY_ATTACKS = [
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

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function executePlayerMove(moveId, prmon, playerHp) {
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

function executeEnemyMove(prmon, isEnraged) {
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

module.exports = { MOVES, ENEMY_ATTACKS, executePlayerMove, executeEnemyMove };
