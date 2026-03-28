# PR-mon GO: Gotta Merge 'Em All!

A GitHub App that turns Pull Requests into Pokemon-style creatures you battle with code review moves. Winning actually merges the PR via the GitHub API. The most over-engineered code review tool ever built.

**Stupid Hacks 2016 Theme**

## How It Works

1. Your open PRs become wild PR-mons with stats based on the PR metadata
2. Pick a PR-mon to battle from the encounter list
3. Use code review moves (LGTM, NITPICK, REQUEST CHANGES, FORCE PUSH) to defeat it
4. The PR-mon fights back with real diff chunks from the PR
5. Win the battle and the PR gets approved + merged on GitHub

## PR-mon Stats

| Stat | Source |
|------|--------|
| HP | Lines changed (capped at 500) |
| Defense | Files changed x 5 |
| Level | Days open (1-50) |
| Type | Based on CI status, labels, draft state |
| Name | PR type prefix + Pokemon suffix (e.g. BUGFIX-asaur) |

## Battle Moves

| Move | Damage | Side Effect |
|------|--------|-------------|
| LGTM | 30 HP | Basic reliable attack |
| NITPICK | 10 HP | Poison DOT (5 dmg/turn x 3 turns). Actually posts a nitpick comment on the PR! |
| REQUEST CHANGES | 50 HP | PR-mon gets enraged and hits harder next turn |
| FORCE PUSH | 99 HP | You take 50 recoil damage |

## Setup

### Prerequisites
- Node.js 18+
- A GitHub personal access token with `repo` scope

### Install

```bash
npm install
```

### Configure

```bash
export GITHUB_TOKEN=ghp_your_token_here
export GITHUB_OWNER=your-username
export GITHUB_REPO=your-repo
```

### Run

```bash
npm run dev
```

This starts both the Express server (port 3001) and Vite dev server (port 3000).

Open http://localhost:3000 and start battling!

### Webhooks (optional)

For real-time PR-mon spawning, set up a GitHub webhook pointing to your server's `/api/webhook` endpoint. Use [smee.io](https://smee.io) for local development.

## Demo Setup

Create a test repo with a few prepared PRs:
- PR #1: "fix: remove console.log" (Level 1, easy)
- PR #2: "feat: rewrite everything" (Level 50, boss)
- PR #3: "please work" with failing CI (Fire type)

## Tech Stack

- **Client**: React + Vite with Game Boy aesthetic (Press Start 2P font, green tint palette)
- **Server**: Express with GitHub API via Octokit
- **Style**: 100% retro Game Boy vibes
