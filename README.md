# 🏓 Ping Pong Online

A real-time multiplayer ping pong game playable between two mobile devices over the internet.

## Play it live
👉 https://YOUR_USERNAME.github.io/pingpong/

## How to play
1. **Player 1** opens the link and taps **"Create Game"** — gets a 6-letter room code
2. **Player 2** opens the same link, enters the code, taps **"Join Game"**
3. Game starts automatically with a 3-second countdown!

## Controls
- 📱 **Mobile:** Drag anywhere on screen to move your paddle
- 💻 **Desktop:** Arrow keys or W / S

## Tech Stack
- WebRTC (PeerJS) — peer-to-peer, no backend needed
- HTML5 Canvas — 60fps rendering
- Zero dependencies beyond PeerJS CDN

## Architecture
- Host runs authoritative game loop (ball physics, collision, scoring)
- Host streams normalized game state to guest every frame
- Guest only sends paddle Y position back to host
- Ball speed increases on each hit, capped at max speed
