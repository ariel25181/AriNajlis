# 🌌 Cosmic Pong

Real-time multiplayer ping pong between two mobile devices over the internet.

## 🎮 Play
👉 https://YOUR_USERNAME.github.io/pingpong/

## How to play
1. **Player 1** taps **"Create Game"** → gets a 6-letter room code
2. **Player 2** enters the code and taps **"Join Game"**
3. First to **10 points** wins!

## Features
- 🎵 **Space ambient music** — procedural Web Audio synthesizer, 5 themes cycling every 60s
- ☄️ **Asteroids** — spawn every 10 hits, bounce the ball with real physics
- 🚫 **Drag-only paddle** — no click-to-jump, smooth drag control only
- 🌌 **Nebula background** — animated starfield with twinkling + nebula glow
- ⚡ **Fast ball** — speed increases on every hit, capped at max

## Controls
- 📱 **Mobile:** Drag anywhere to move your paddle
- 💻 **Desktop:** Mouse move or Arrow keys / W S

## Tech
- WebRTC (PeerJS) — peer-to-peer, no server needed
- Web Audio API — all music synthesized in-browser
- HTML5 Canvas — 60fps rendering
