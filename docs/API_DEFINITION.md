# PR-mon GO — API Layer Definition

## Purpose
A REST API that acts as the **transition layer** between the backend game logic (battle engine, PR-mon generation, GitHub integration) and the frontend (AR world view + battle UI). It bridges two currently separate prototypes into a unified experience.

---

## Architecture Overview

```
┌─────────────────────────────┐
│  Frontend Clients           │
│  ┌───────────┐ ┌──────────┐│
│  │  AR View   │ │Battle UI ││
│  │(Three.js/  │ │(React +  ││
│  │ WebXR)     │ │GameBoy)  ││
│  └─────┬─────┘ └────┬─────┘│
└────────┼─────────────┼──────┘
         │   REST/WS   │
    ┌────▼─────────────▼────┐
    │     API Layer          │
    │  (Express + Socket.IO) │
    └────┬──────────┬───────┘
         │          │
    ┌────▼───┐ ┌───▼──────┐
    │ Game   │ │ GitHub   │
    │ Engine │ │ Service  │
    └────────┘ └──────────┘
```

---

## 1. Session & Player Management

### `POST /api/session`
Create a new player session. This is the identity that ties together the AR world and battle screens.

**Response:**
```json
{
  "sessionId": "uuid",
  "player": {
    "name": "REVIEWER",
    "level": 99,
    "hp": 200,
    "maxHp": 200,
    "caughtPrmons": [],
    "activeBattleId": null
  }
}
```

### `GET /api/session/:sessionId`
Get current session state (player HP, caught PR-mons, active battle, etc.)

### `DELETE /api/session/:sessionId`
End session and clean up resources.

---

## 2. World / PR-mon Discovery (feeds the AR view)

These endpoints feed the AR layer — they tell the frontend *which PR-mons exist* and provide the data needed to render them as 3D creatures in the AR scene.

### `GET /api/prmons`
List all wild (uncaught) PR-mons from the configured repo.

**Response:**
```json
[
  {
    "id": 42,
    "name": "BUGFIX-ASAUR",
    "level": 7,
    "hp": 120,
    "maxHp": 120,
    "defense": 15,
    "attack": 18,
    "speed": 40,
    "type": { "name": "FIRE", "color": "#f08030", "badge": "🔥" },
    "prTitle": "fix: resolve null pointer in auth",
    "prNumber": 42,
    "prUrl": "https://github.com/...",
    "authorAvatar": "https://...",
    "authorName": "octocat",
    "additions": 80,
    "deletions": 40,
    "changedFiles": 3,
    "repo": "owner/repo"
  }
]
```

### `GET /api/prmons/:id`
Get a single PR-mon's full stats. Used when the AR view focuses/selects a creature.

### `POST /api/prmons/refresh`
Force a re-fetch of PRs from GitHub. Returns the updated list.

### `POST /api/webhook`
GitHub webhook receiver. Auto-adds/removes PR-mons when PRs are opened, updated, or closed.

**Body:** GitHub `pull_request` webhook payload
**Actions handled:** `opened`, `synchronize`, `reopened`, `closed`

---

## 3. AR Encounter / Spatial Binding

These endpoints let the AR frontend register *where* a PR-mon is in the user's physical space, enabling the "walk up to it and tap to engage" flow.

### `POST /api/encounter`
Register that the player has encountered a PR-mon in AR (tapped/selected it in the AR view). This is the bridge from AR → battle.

**Body:**
```json
{
  "sessionId": "uuid",
  "prmonId": 42,
  "arPosition": { "x": 0.5, "y": 0.0, "z": -1.2 }
}
```

**Response:**
```json
{
  "encounterId": "enc-uuid",
  "prmon": { /* full PR-mon stats */ },
  "canBattle": true,
  "message": "A wild BUGFIX-ASAUR appeared!"
}
```

### `GET /api/encounter/:encounterId`
Get encounter details (used if the UI navigates between AR view and battle screen).

---

## 4. Battle System (feeds the battle UI)

### `POST /api/battle/:prmonId/start`
Start a battle with a specific PR-mon. Creates battle state on the server.

**Body (optional):**
```json
{ "sessionId": "uuid", "encounterId": "enc-uuid" }
```

**Response:**
```json
{
  "id": "battle-42-1711648000000",
  "prmon": { /* snapshot of PR-mon stats at battle start */ },
  "playerHp": 200,
  "playerMaxHp": 200,
  "turn": 1,
  "isEnraged": false,
  "dotEffect": null,
  "stunned": false,
  "status": "active",
  "log": ["A wild BUGFIX-ASAUR appeared! (Lv.7 🔥FIRE)"]
}
```

### `POST /api/battle/:battleId/attack`
Execute a player move. Server resolves player attack → DOT → enemy faint check → enemy counter-attack → player faint check, and returns the full updated battle state.

**Body:**
```json
{ "move": "lgtm" | "nitpick" | "request_changes" | "force_push" }
```

**Response:** Full battle state object with updated HP, log entries, status.

**Side effects:**
- `nitpick` → Posts a random nitpick review comment on the actual PR
- Player defeat → Posts a defeat comment on the PR
- Diff chunks from the real PR are fetched and included in enemy attack flavor text

### `POST /api/battle/:battleId/catch`
Approve + merge the PR (only valid when `status === "won"`).

**Side effects:**
- Creates an APPROVE review on the GitHub PR
- Squash-merges the PR
- Removes the PR-mon from the wild pool
- Adds the PR-mon to the player's `caughtPrmons`

**Response:** Battle state with `status: "caught"`.

### `POST /api/battle/:battleId/run`
Flee from battle.

**Side effects:** Posts a "ran away" comment on the PR.

**Response:** Battle state with `status: "fled"`.

### `GET /api/battle/:battleId`
Get current battle state (for reconnection/refresh).

---

## 5. Moves & Game Data

### `GET /api/moves`
Return all available player moves with descriptions, damage, types, and effects.

**Response:**
```json
{
  "lgtm":            { "name": "LGTM",            "damage": 30, "type": "normal",   "description": "A solid approval. Reliable and true." },
  "nitpick":         { "name": "NITPICK",          "damage": 10, "type": "poison",   "dot": { "damage": 5, "turns": 3 }, "description": "Low damage but poisons with doubt." },
  "request_changes": { "name": "REQUEST CHANGES",  "damage": 50, "type": "fighting", "enrage": true, "description": "Heavy hit, but the PR-mon gets angry." },
  "force_push":      { "name": "FORCE PUSH",       "damage": 99, "type": "fire",     "recoil": 50, "description": "Massive damage, but hurts you too." }
}
```

### `GET /api/types`
Return all PR-mon types with colors and badges (for AR rendering).

**Response:**
```json
{
  "fire":     { "name": "FIRE",     "color": "#f08030", "badge": "🔥" },
  "ghost":    { "name": "GHOST",    "color": "#705898", "badge": "👻" },
  "normal":   { "name": "NORMAL",   "color": "#a8a878", "badge": "⭐" },
  "water":    { "name": "WATER",    "color": "#6890f0", "badge": "💧" },
  "grass":    { "name": "GRASS",    "color": "#78c850", "badge": "🌿" },
  "electric": { "name": "ELECTRIC", "color": "#f8d030", "badge": "⚡" },
  "poison":   { "name": "POISON",   "color": "#a040a0", "badge": "💀" }
}
```

---

## 6. Real-Time Events (WebSocket / SSE)

For live updates between the AR view and battle UI, and for multi-user scenarios.

### `WS /ws` or `GET /api/events` (SSE)

**Events emitted:**

| Event | Description | Payload |
|-------|-------------|---------|
| `prmon:appeared` | New PR opened → wild PR-mon spawns | `{ prmon }` |
| `prmon:disappeared` | PR closed/merged → PR-mon removed | `{ prmonId }` |
| `prmon:updated` | PR updated → stats recalculated | `{ prmon }` |
| `battle:started` | A battle began (for spectators/AR) | `{ battleId, prmonId }` |
| `battle:turnResult` | A turn resolved | `{ battleId, turnLog[], prmonHp, playerHp }` |
| `battle:ended` | Battle finished | `{ battleId, result: "won" \| "lost" \| "fled" \| "caught" }` |

These events let the AR view show visual indicators (e.g., a PR-mon shaking when it's being battled, disappearing when caught) without polling.

---

## 7. Cross-Concern Behaviors

### Error Format (all endpoints)
```json
{ "error": "Human-readable message" }
```
With appropriate HTTP status codes: `400` (bad input), `404` (not found), `409` (conflict, e.g., battle already active), `500` (server error).

### Battle Status State Machine
```
active → won → caught
active → lost
active → fled
```
Only valid transitions are allowed. Invalid actions for the current status return `400`.

### Rate Limiting
- GitHub API calls are cached/batched (PR list refreshes every 2 min)
- Attack endpoint should debounce to prevent spam during animations

### CORS
Enabled for all origins (dev), or configured per-environment in production.

---

## Summary: What the API Must Do

1. **Generate PR-mons** from real GitHub PRs (name, type, stats, visual data) and serve them to both the AR layer and battle UI
2. **Manage battle state** server-side (HP, DOT, stun, enrage, turn order) so the frontend is a pure display layer
3. **Execute real GitHub actions** as battle consequences (approve, merge, comment, nitpick)
4. **Bridge AR ↔ Battle** through encounter/session state so tapping a creature in AR seamlessly transitions to the battle screen, and catching it updates the AR world
5. **Push real-time updates** so the AR world stays in sync (new PRs spawn creatures, merged PRs remove them, active battles show visual feedback)
6. **Serve game metadata** (moves, types) so both frontends render consistently
