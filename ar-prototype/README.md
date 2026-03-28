# 🔮 WebAR Prototype

A browser-based augmented reality app that uses your MacBook webcam to place 3D objects in the real world. No installs required — everything runs from CDN links.

## Quick Start

```bash
# Option 1: Python (built-in on macOS)
cd ar-prototype
python3 server.py

# Option 2: npx serve
npx serve ar-prototype

# Option 3: raw Python one-liner
cd ar-prototype && python3 -m http.server 8000
```

Then open **http://localhost:8000** in Chrome or Safari.

## Two AR Modes

### 📷 Marker Mode (A-Frame + AR.js)
- Uses a **Hiro fiducial marker** for precise 6-DOF tracking
- 3D objects are anchored on top of the marker and track it as you move
- **Setup:** Print `hiro-marker.png` or open `hiro-marker.html` on a second screen, then point your webcam at it
- Best for: stable, real-world-anchored AR

### ✋ Markerless Mode (Three.js + webcam)
- Uses a virtual ground plane overlaid on the live camera feed
- **Click anywhere** on the screen to place 3D objects
- Objects float, spin, and stay in position
- Best for: quick experimentation without a printed marker

## Controls

| Action | What it does |
|--------|-------------|
| Shape buttons (🟦🔴🟢🟡🟣) | Select which 3D object to place |
| Color dots | Change the object color |
| 🗑 Clear All | Remove all placed objects (markerless mode) |
| `Esc` key | Return to landing screen |
| Click on camera feed | Place an object (markerless mode) |

## Files

```
ar-prototype/
├── index.html          # Main entry point
├── app.js              # All application logic (marker + markerless)
├── styles.css          # UI styles
├── server.py           # Local dev server (Python)
├── hiro-marker.png     # Printable Hiro AR marker
├── hiro-marker.html    # Marker print page with instructions
└── README.md           # This file
```

## Tech Stack

- **Three.js** r128 (CDN) — 3D rendering for markerless mode
- **A-Frame** 1.4.2 (CDN) — WebXR framework for marker mode
- **AR.js** (CDN) — Marker detection and tracking
- **getUserMedia API** — Webcam access
- No npm, no build step — pure CDN + vanilla JS

## Browser Compatibility

| Browser | Status |
|---------|--------|
| Chrome (macOS) | ✅ Full support |
| Safari (macOS) | ✅ Works (may need to allow camera in preferences) |
| Firefox (macOS) | ✅ Works |

## Troubleshooting

- **Camera not working?** Make sure you're on `localhost` (not `file://`). Camera requires a secure context.
- **Marker not detected?** Ensure good lighting, hold the marker flat, and fill at least 1/4 of the camera view.
- **Safari blocks camera?** Go to Safari → Settings → Websites → Camera → Allow for localhost.
