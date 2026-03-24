import { useState, useEffect } from "react";

const agents = [
  {
    id: "paddle",
    name: "AI Paddle Agent",
    emoji: "🎮",
    color: "#6c63ff",
    border: "border-purple-500",
    bg: "bg-purple-900/30",
    role: "Opponent Controller",
    interval: "every 350ms",
    input: ["Ball position (x,y)", "Ball velocity (vx,vy)", "Both paddle positions", "Current score", "Difficulty level"],
    output: ["Target Y position (0.0–1.0)", "Human-like error margin applied", "Speed-capped smooth movement"],
    prompt: "Analyzes ball trajectory with wall-bounce prediction. Difficulty controls: reaction delay (0.08–0.55s), error range (±2%–18%), max paddle speed.",
    calls: 0,
  },
  {
    id: "master",
    name: "Game Master Agent",
    emoji: "🎲",
    color: "#00e676",
    border: "border-green-500",
    bg: "bg-green-900/30",
    role: "Dynamic Event Controller",
    interval: "every 8 seconds",
    input: ["Current score gap", "Total paddle hits", "Active asteroids & boxes", "Active power-ups", "Difficulty setting"],
    output: ["spawn_asteroid: true/false", "spawn_box: A|B|C|D type", "commentary: string", "reason: internal log"],
    prompt: "Monitors match flow for stagnation. Spawns obstacles and power-ups to keep the game balanced and exciting. Uses score gap to favor losing player.",
    calls: 0,
  },
  {
    id: "comm",
    name: "Commentator Agent",
    emoji: "🎙️",
    color: "#ff6584",
    border: "border-pink-500",
    bg: "bg-pink-900/30",
    role: "Live Commentary",
    interval: "on events (5s cooldown)",
    input: ["Event type (goal/asteroid/powerup/streak)", "Game context", "Player names", "Current score"],
    output: ["Punchy Spanish phrase (≤8 words)", "Argentine slang", "Redonditos de Ricota vibe"],
    prompt: "Generates excited Argentine Spanish commentary. Events: goal_human, goal_ai, asteroid, powerup, streak, game_start, game_over. Falls back to static phrases on error.",
    calls: 0,
  },
];

const flow = [
  { from: "Game State", to: "Orchestrator", label: "60fps shared state" },
  { from: "Orchestrator", to: "AI Paddle Agent", label: "350ms intervals" },
  { from: "Orchestrator", to: "Game Master Agent", label: "8s intervals" },
  { from: "Orchestrator", to: "Commentator Agent", label: "on events" },
  { from: "AI Paddle Agent", to: "Game Engine", label: "target Y (0–1)" },
  { from: "Game Master Agent", to: "Game Engine", label: "spawn commands" },
  { from: "Commentator Agent", to: "HUD Overlay", label: "Spanish text" },
];

export default function AgentArchitecture() {
  const [selected, setSelected] = useState(null);
  const [callCounts, setCallCounts] = useState({ paddle: 0, master: 0, comm: 0 });
  const [activeAgent, setActiveAgent] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setTick(t => t + 1);
      // Simulate agent activations for demo
      const r = Math.random();
      if (r < 0.15) {
        setActiveAgent("paddle");
        setCallCounts(c => ({ ...c, paddle: c.paddle + 1 }));
        setTimeout(() => setActiveAgent(null), 400);
      } else if (r < 0.05) {
        setActiveAgent("master");
        setCallCounts(c => ({ ...c, master: c.master + 1 }));
        setTimeout(() => setActiveAgent(null), 800);
      } else if (r < 0.03) {
        setActiveAgent("comm");
        setCallCounts(c => ({ ...c, comm: c.comm + 1 }));
        setTimeout(() => setActiveAgent(null), 600);
      }
    }, 350);
    return () => clearInterval(id);
  }, []);

  const sel = selected ? agents.find(a => a.id === selected) : null;

  return (
    <div style={{ background: "#050510", minHeight: "100vh", fontFamily: "system-ui, sans-serif", color: "#e8e8ff", padding: "20px" }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ fontSize: "clamp(1.4rem,5vw,2rem)", fontWeight: 900, background: "linear-gradient(135deg,#6c63ff,#ff6584)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          🌌 Cosmic Pong — Multi-Agent Architecture
        </div>
        <div style={{ color: "#7070aa", fontSize: "0.8rem", marginTop: 6, letterSpacing: 2, textTransform: "uppercase" }}>
          Claude-powered · 3 specialized agents · real-time orchestration
        </div>
      </div>

      {/* Architecture Flow */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginBottom: 28 }}>
        {/* Row 1: Input */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          {["Ball Physics", "Score", "Events", "Touch Input"].map(s => (
            <div key={s} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "6px 14px", fontSize: "0.75rem", color: "#aaa" }}>{s}</div>
          ))}
        </div>
        <div style={{ color: "#333", fontSize: "1.2rem" }}>↓</div>

        {/* Orchestrator */}
        <div style={{ background: "rgba(108,99,255,0.15)", border: "2px solid rgba(108,99,255,0.5)", borderRadius: 14, padding: "12px 28px", fontWeight: 700, fontSize: "0.95rem", letterSpacing: 1 }}>
          ⚙️ Orchestrator
          <div style={{ fontWeight: 400, fontSize: "0.7rem", color: "#7070aa", marginTop: 3 }}>coordinates agents · manages state · prevents API flooding</div>
        </div>
        <div style={{ color: "#333", fontSize: "1.2rem" }}>↓ ↓ ↓</div>

        {/* Agent Cards */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", width: "100%", maxWidth: 900 }}>
          {agents.map(agent => {
            const isActive = activeAgent === agent.id;
            const count = callCounts[agent.id];
            return (
              <div
                key={agent.id}
                onClick={() => setSelected(selected === agent.id ? null : agent.id)}
                style={{
                  background: isActive ? agent.color + "22" : "rgba(15,15,42,0.9)",
                  border: `2px solid ${isActive ? agent.color : agent.color + "44"}`,
                  borderRadius: 16, padding: 16, cursor: "pointer", flex: "1 1 200px", maxWidth: 280,
                  transition: "all 0.2s", boxShadow: isActive ? `0 0 20px ${agent.color}44` : "none",
                  transform: isActive ? "scale(1.03)" : "scale(1)"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: "1.4rem" }}>{agent.emoji}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "0.85rem" }}>{agent.name}</div>
                    <div style={{ color: "#7070aa", fontSize: "0.7rem" }}>{agent.role}</div>
                  </div>
                  {isActive && (
                    <div style={{ marginLeft: "auto", width: 10, height: 10, borderRadius: "50%", background: agent.color, boxShadow: `0 0 8px ${agent.color}`, animation: "pulse 0.5s infinite" }} />
                  )}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "#7070aa" }}>
                  <span>⏱ {agent.interval}</span>
                  <span style={{ color: agent.color, fontWeight: 700 }}>#{count} calls</span>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ color: "#333", fontSize: "1.2rem" }}>↓</div>

        {/* Output row */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          {[
            { label: "Paddle Y", color: "#6c63ff" },
            { label: "Spawn Events", color: "#00e676" },
            { label: "Commentary HUD", color: "#ff6584" },
          ].map(o => (
            <div key={o.label} style={{ background: o.color + "15", border: `1px solid ${o.color}44`, borderRadius: 8, padding: "6px 16px", fontSize: "0.75rem", color: o.color, fontWeight: 700 }}>
              {o.label}
            </div>
          ))}
        </div>
        <div style={{ color: "#333", fontSize: "1.2rem" }}>↓</div>
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "8px 24px", fontWeight: 700, fontSize: "0.85rem" }}>
          🎮 Game Engine (Canvas 60fps)
        </div>
      </div>

      {/* Detail panel */}
      {sel && (
        <div style={{ background: "rgba(15,15,42,0.95)", border: `2px solid ${sel.color}55`, borderRadius: 18, padding: 20, maxWidth: 640, margin: "0 auto 20px", animation: "fadeIn 0.2s" }}>
          <div style={{ fontSize: "1.1rem", fontWeight: 800, marginBottom: 12, color: sel.color }}>
            {sel.emoji} {sel.name}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: "0.7rem", color: "#7070aa", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Input</div>
              {sel.input.map(i => <div key={i} style={{ fontSize: "0.78rem", marginBottom: 3, color: "#ccc" }}>→ {i}</div>)}
            </div>
            <div>
              <div style={{ fontSize: "0.7rem", color: "#7070aa", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Output</div>
              {sel.output.map(o => <div key={o} style={{ fontSize: "0.78rem", marginBottom: 3, color: sel.color }}>← {o}</div>)}
            </div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "10px 14px", fontSize: "0.78rem", color: "#aaa", lineHeight: 1.6 }}>
            📋 {sel.prompt}
          </div>
        </div>
      )}

      {/* Stats bar */}
      <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", marginTop: 8 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "1.4rem", fontWeight: 900, color: "#6c63ff" }}>{callCounts.paddle}</div>
          <div style={{ fontSize: "0.65rem", color: "#7070aa", textTransform: "uppercase", letterSpacing: 1 }}>Paddle calls</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "1.4rem", fontWeight: 900, color: "#00e676" }}>{callCounts.master}</div>
          <div style={{ fontSize: "0.65rem", color: "#7070aa", textTransform: "uppercase", letterSpacing: 1 }}>Master calls</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "1.4rem", fontWeight: 900, color: "#ff6584" }}>{callCounts.comm}</div>
          <div style={{ fontSize: "0.65rem", color: "#7070aa", textTransform: "uppercase", letterSpacing: 1 }}>Commentary calls</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "1.4rem", fontWeight: 900, color: "#ffea00" }}>{callCounts.paddle + callCounts.master + callCounts.comm}</div>
          <div style={{ fontSize: "0.65rem", color: "#7070aa", textTransform: "uppercase", letterSpacing: 1 }}>Total API calls</div>
        </div>
      </div>

      <div style={{ textAlign: "center", marginTop: 20, color: "#7070aa", fontSize: "0.72rem" }}>
        Tap any agent card to see its full spec · Dots animate when agents are thinking
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.6)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  );
}
