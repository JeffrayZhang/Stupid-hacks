const { Octokit } = require('@octokit/rest');
const { execSync } = require('child_process');

let octokit = null;

function getToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    return execSync('gh auth token', { encoding: 'utf8' }).trim();
  } catch {
    return undefined;
  }
}

function getOctokit() {
  if (!octokit) {
    octokit = new Octokit({
      auth: getToken(),
    });
  }
  return octokit;
}

async function fetchPRs(owner, repo) {
  const ok = getOctokit();
  const { data: prs } = await ok.pulls.list({
    owner,
    repo,
    state: 'open',
    per_page: 20,
  });

  const detailed = await Promise.all(
    prs.map(pr => ok.pulls.get({ owner, repo, pull_number: pr.number }).then(r => r.data))
  );

  return detailed;
}

async function approvePR(owner, repo, pullNumber) {
  const ok = getOctokit();
  await ok.pulls.createReview({
    owner,
    repo,
    pull_number: pullNumber,
    event: 'APPROVE',
    body: '\u{1f3c6} PR-mon was caught! LGTM - merged via PR-mon GO battle! \u26a1',
  });
}

async function mergePR(owner, repo, pullNumber) {
  const ok = getOctokit();
  await ok.pulls.merge({
    owner,
    repo,
    pull_number: pullNumber,
    merge_method: 'squash',
    commit_title: `\u{1f47e} Merged via PR-mon GO battle!`,
    commit_message: 'This PR was caught in battle and merged by PR-mon GO: Gotta Merge \'Em All!',
  });
}

async function postComment(owner, repo, pullNumber, body) {
  const ok = getOctokit();
  await ok.issues.createComment({
    owner,
    repo,
    issue_number: pullNumber,
    body,
  });
}

async function postNitpick(owner, repo, pullNumber) {
  const ok = getOctokit();
  try {
    const { data: files } = await ok.pulls.listFiles({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 10,
    });

    const patchFiles = files.filter(f => f.patch);
    if (patchFiles.length === 0) return null;

    const file = patchFiles[Math.floor(Math.random() * patchFiles.length)];
    const lines = file.patch.split('\n');
    const addedLines = [];
    let position = 0;
    for (const line of lines) {
      position++;
      if (line.startsWith('+') && !line.startsWith('+++')) {
        addedLines.push({ position, content: line });
      }
    }

    if (addedLines.length === 0) return null;
    const target = addedLines[Math.floor(Math.random() * addedLines.length)];

    const nitpicks = [
      'nit: could this be more \u2728 idiomatic \u2728?',
      'nit: have we considered the cosmic implications of this line?',
      'nit: my OCD is tingling',
      'nit: this line makes me feel emotions',
      'nit: technically correct (the best kind of correct)',
      'nit: *adjusts monocle* hmm, quite.',
      'nit: what would Kent Beck say about this?',
      'nit: I used NITPICK! It\'s super effective!',
    ];

    await ok.pulls.createReviewComment({
      owner,
      repo,
      pull_number: pullNumber,
      body: nitpicks[Math.floor(Math.random() * nitpicks.length)],
      path: file.filename,
      position: target.position,
      commit_id: (await ok.pulls.get({ owner, repo, pull_number: pullNumber })).data.head.sha,
    });

    return file.filename;
  } catch {
    return null;
  }
}

async function fetchDiffChunk(owner, repo, pullNumber) {
  const ok = getOctokit();
  try {
    const { data: files } = await ok.pulls.listFiles({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 5,
    });

    const patchFiles = files.filter(f => f.patch);
    if (patchFiles.length === 0) return { filename: '???', chunk: 'no changes found' };

    const file = patchFiles[Math.floor(Math.random() * patchFiles.length)];
    const patchLines = file.patch.split('\n').slice(0, 8).join('\n');
    return { filename: file.filename, chunk: patchLines };
  } catch {
    return { filename: '???', chunk: '// mysterious code appeared' };
  }
}

module.exports = { fetchPRs, approvePR, mergePR, postComment, postNitpick, fetchDiffChunk };
