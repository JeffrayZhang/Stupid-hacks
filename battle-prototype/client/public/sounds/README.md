# Sound Effects for PR-mon GO

Place `.mp3` sound files here for the game to use:

| File | When it plays |
|------|---------------|
| `select.mp3` | Menu selection / button press |
| `battle.mp3` | Battle starts |
| `hit.mp3` | Attack lands |
| `catch.mp3` | Catching a PR-mon |
| `victory.mp3` | Battle won |
| `defeat.mp3` | Battle lost |

## Tips
- Keep files small (< 100KB each) for fast loading
- 8-bit / chiptune style sounds fit the Game Boy aesthetic
- You can generate free retro sounds at:
  - https://sfxr.me/
  - https://www.bfxr.net/
  - https://freesound.org/ (search "8-bit")

## Audio Format
MP3 is recommended for broad browser support. Files are loaded via `new Audio('/sounds/{name}.mp3')`.
