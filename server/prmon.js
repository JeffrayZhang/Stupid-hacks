const SUFFIXES = [
  '-asaur', '-chu', '-izard', '-tle', '-pod', '-bat', '-dude',
  '-twig', '-bell', '-puff', '-eon', '-mite', '-dos', '-lee',
  '-chan', '-buzz', '-tar', '-don', '-king', '-duck',
];

const PREFIX_MAP = {
  fix: 'BUGFIX',
  bug: 'BUGFIX',
  feat: 'FEATURE',
  feature: 'FEATURE',
  refactor: 'REFACTOR',
  docs: 'DOCS',
  chore: 'CHORE',
  hotfix: 'HOTFIX',
  test: 'TEST',
  style: 'STYLE',
  perf: 'PERF',
  ci: 'CI',
  revert: 'REVERT',
  wip: 'WIP',
  dependabot: 'DEPEND',
};

const TYPES = {
  fire: { name: 'FIRE', color: '#f08030', badge: '\u{1f525}' },
  ghost: { name: 'GHOST', color: '#705898', badge: '\u{1f47b}' },
  normal: { name: 'NORMAL', color: '#a8a878', badge: '\u{2b50}' },
  water: { name: 'WATER', color: '#6890f0', badge: '\u{1f4a7}' },
  grass: { name: 'GRASS', color: '#78c850', badge: '\u{1f33f}' },
  electric: { name: 'ELECTRIC', color: '#f8d030', badge: '\u26a1' },
  poison: { name: 'POISON', color: '#a040a0', badge: '\u{1f480}' },
};

function generateName(pr) {
  const title = (pr.title || '').toLowerCase();
  let prefix = 'PR';

  for (const [key, val] of Object.entries(PREFIX_MAP)) {
    if (title.startsWith(key) || title.includes(`(${key})`) || title.includes(`[${key}]`)) {
      prefix = val;
      break;
    }
  }

  const hash = (pr.number || 0) + (pr.title || '').length;
  const suffix = SUFFIXES[hash % SUFFIXES.length];

  return `${prefix}${suffix}`.toUpperCase();
}

function determineType(pr) {
  if (pr.mergeable_state === 'dirty' || pr.mergeable === false) return TYPES.ghost;

  const labels = (pr.labels || []).map(l => (l.name || '').toLowerCase());
  if (labels.some(l => l.includes('bug') || l.includes('fix'))) return TYPES.fire;
  if (labels.some(l => l.includes('docs') || l.includes('documentation'))) return TYPES.grass;
  if (labels.some(l => l.includes('test'))) return TYPES.electric;
  if (labels.some(l => l.includes('wip') || l.includes('draft'))) return TYPES.water;
  if (labels.some(l => l.includes('breaking') || l.includes('danger'))) return TYPES.poison;

  if (pr.draft) return TYPES.water;

  const status = (pr.statuses || []);
  const hasFailing = status.some(s => s.state === 'failure' || s.state === 'error');
  if (hasFailing) return TYPES.fire;

  return TYPES.normal;
}

function prToStats(pr) {
  const linesChanged = (pr.additions || 0) + (pr.deletions || 0);
  const hp = Math.min(Math.max(linesChanged, 20), 500);
  const defense = Math.min((pr.changed_files || 1) * 5, 50);
  const daysOpen = Math.max(1, Math.floor(
    (Date.now() - new Date(pr.created_at).getTime()) / (1000 * 60 * 60 * 24)
  ));
  const level = Math.min(daysOpen, 50);
  const type = determineType(pr);

  return {
    id: pr.number,
    name: generateName(pr),
    level,
    hp,
    maxHp: hp,
    defense,
    type,
    attack: Math.min(10 + Math.floor(linesChanged / 10), 40),
    speed: Math.max(1, 50 - (pr.changed_files || 1)),
    prTitle: pr.title,
    prNumber: pr.number,
    prUrl: pr.html_url,
    authorAvatar: pr.user?.avatar_url || '',
    authorName: pr.user?.login || 'unknown',
    additions: pr.additions || 0,
    deletions: pr.deletions || 0,
    changedFiles: pr.changed_files || 0,
    repo: pr.base?.repo?.full_name || '',
    diff_url: pr.diff_url || '',
  };
}

module.exports = { prToStats, generateName, determineType, TYPES };
