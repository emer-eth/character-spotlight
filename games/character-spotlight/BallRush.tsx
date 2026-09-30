import { useEffect, useRef, useState } from "react";
import type { CharacterState } from "./character.js";
import { drawSpotlightFriend } from "./renderer.js";
import type { GenerationSprites } from "@rarefriends/friendsdk/sprites";

interface BallRushProps {
  character: CharacterState;
  sprites: GenerationSprites | null;
  onReward: (points: number, parts: Record<string, number>) => void;
  onExit: () => void;
  reducedMotion: boolean;
}

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
}

interface EnergyBattery {
  x: number;
  y: number;
  type: "battery" | "part";
  name?: string;
}

export function BallRushGame({ character, sprites, onReward, onExit, reducedMotion }: BallRushProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(40);
  const [partsFound, setPartsFound] = useState<Record<string, number>>({});
  const [isGameOver, setIsGameOver] = useState(false);

  const gameState = useRef({
    px: 380,
    py: 180,
    speed: 220 + (character.upgrades.mobility - 1) * 30,
    balls: [] as Ball[],
    pickups: [] as EnergyBattery[],
    keys: new Set<string>(),
    lives: character.upgrades.armor,
    activeScore: 0,
    activeParts: {} as Record<string, number>,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let lastTime = performance.now();
    let ballSpawnTimer = 0;
    let pickupSpawnTimer = 0;
    let elapsedTimer = 0;

    // Initial bouncing hazards
    const balls: Ball[] = [
      { x: 100, y: 100, vx: 180, vy: 140, radius: 14, color: "#ef917d" },
      { x: 600, y: 120, vx: -160, vy: 200, radius: 16, color: "#d87968" },
      { x: 300, y: 280, vx: 210, vy: -150, radius: 15, color: "#ef917d" },
    ];
    gameState.current.balls = balls;

    function handleKeyDown(e: KeyboardEvent) {
      gameState.current.keys.add(e.key.toLowerCase());
    }
    function handleKeyUp(e: KeyboardEvent) {
      gameState.current.keys.delete(e.key.toLowerCase());
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    function loop(now: number) {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      const state = gameState.current;

      // Timer update
      elapsedTimer += dt;
      if (elapsedTimer >= 1) {
        elapsedTimer = 0;
        setTimeLeft(prev => {
          if (prev <= 1) {
            setIsGameOver(true);
            return 0;
          }
          return prev - 1;
        });
      }

      // Movement
      let dx = 0;
      let dy = 0;
      if (state.keys.has("w") || state.keys.has("arrowup")) dy -= 1;
      if (state.keys.has("s") || state.keys.has("arrowdown")) dy += 1;
      if (state.keys.has("a") || state.keys.has("arrowleft")) dx -= 1;
      if (state.keys.has("d") || state.keys.has("arrowright")) dx += 1;

      if (dx !== 0 && dy !== 0) {
        dx *= 0.7071;
        dy *= 0.7071;
      }

      state.px = Math.max(20, Math.min(740, state.px + dx * state.speed * dt));
      state.py = Math.max(30, Math.min(340, state.py + dy * state.speed * dt));

      // Spawn pickups
      pickupSpawnTimer += dt;
      if (pickupSpawnTimer > 1.8) {
        pickupSpawnTimer = 0;
        if (state.pickups.length < 6) {
          const isPart = Math.random() < 0.35 + character.upgrades.visor * 0.05;
          state.pickups.push({
            x: 40 + Math.random() * 680,
            y: 40 + Math.random() * 280,
            type: isPart ? "part" : "battery",
            name: isPart ? "Core Fragment" : undefined,
          });
        }
      }

      // Spawn additional hazard balls over time
      ballSpawnTimer += dt;
      if (ballSpawnTimer > 7 && state.balls.length < 8) {
        ballSpawnTimer = 0;
        state.balls.push({
          x: Math.random() > 0.5 ? 20 : 740,
          y: Math.random() * 320,
          vx: (Math.random() - 0.5) * 360,
          vy: (Math.random() - 0.5) * 360,
          radius: 12 + Math.random() * 8,
          color: "#ef917d",
        });
      }

      // Update balls
      for (const b of state.balls) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;

        // Bounce off walls
        if (b.x - b.radius < 0) { b.x = b.radius; b.vx *= -1; }
        if (b.x + b.radius > 760) { b.x = 760 - b.radius; b.vx *= -1; }
        if (b.y - b.radius < 0) { b.y = b.radius; b.vy *= -1; }
        if (b.y + b.radius > 360) { b.y = 360 - b.radius; b.vy *= -1; }

        // Check player collision
        const dist = Math.hypot(b.x - state.px, b.y - (state.py - 16));
        if (dist < b.radius + 14) {
          // Hit!
          state.lives--;
          // Push away
          b.vx *= -1.2;
          b.vy *= -1.2;
          if (state.lives <= 0) {
            setIsGameOver(true);
            setScore(state.activeScore);
            setPartsFound({ ...state.activeParts });
            return;
          }
        }
      }

      // Check Pickups
      for (let i = state.pickups.length - 1; i >= 0; i--) {
        const p = state.pickups[i];
        if (Math.hypot(p.x - state.px, p.y - (state.py - 16)) < 26) {
          state.pickups.splice(i, 1);
          if (p.type === "battery") {
            state.activeScore += 80 * character.upgrades.aura;
          } else {
            const pName = p.name || "Core Fragment";
            state.activeParts[pName] = (state.activeParts[pName] || 0) + 1;
            state.activeScore += 180;
          }
        }
      }

      // Passive survival points
      state.activeScore += Math.round(dt * 12 * character.upgrades.aura);

      // RENDER
      ctx.clearRect(0, 0, 760, 360);

      // Arena background
      ctx.fillStyle = "#efefed";
      ctx.fillRect(0, 0, 760, 360);

      // Arena boundary line
      ctx.strokeStyle = "#131313";
      ctx.lineWidth = 4;
      ctx.strokeRect(6, 6, 748, 348);

      // Draw grid lines
      ctx.strokeStyle = "#dedbcf";
      ctx.lineWidth = 1;
      for (let x = 40; x < 760; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 6); ctx.lineTo(x, 354); ctx.stroke();
      }
      for (let y = 40; y < 360; y += 40) {
        ctx.beginPath(); ctx.moveTo(6, y); ctx.lineTo(754, y); ctx.stroke();
      }

      // Draw Pickups
      for (const p of state.pickups) {
        ctx.save();
        if (p.type === "battery") {
          ctx.fillStyle = "#efd28a";
          ctx.fillRect(p.x - 8, p.y - 12, 16, 24);
          ctx.strokeStyle = "#131313";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(p.x - 8, p.y - 12, 16, 24);
          // Top connector
          ctx.fillStyle = "#131313";
          ctx.fillRect(p.x - 3, p.y - 15, 6, 3);
        } else {
          ctx.fillStyle = "#9b72cf";
          ctx.fillRect(p.x - 9, p.y - 9, 18, 18);
          ctx.strokeStyle = "#131313";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(p.x - 9, p.y - 9, 18, 18);
        }
        ctx.restore();
      }

      // Draw Bouncing Hazard Balls
      for (const b of state.balls) {
        ctx.save();
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#131313";
        ctx.lineWidth = 2;
        ctx.stroke();
        // Danger inner ring
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius * 0.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Draw Player
      const isWalking = dx !== 0 || dy !== 0;
      const facing = dx < 0 ? "left" : "right";
      drawSpotlightFriend(
        ctx,
        sprites,
        state.px,
        state.py,
        facing,
        isWalking,
        Math.floor(now / 110) % 8,
        3.5,
        character.upgrades.aura
      );

      setScore(state.activeScore);
      setPartsFound({ ...state.activeParts });

      animId = requestAnimationFrame(loop);
    }

    animId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [character, sprites]);

  // Touch Virtual Joystick for mobile
  function handleTouchDirection(dir: "up" | "down" | "left" | "right") {
    const s = gameState.current;
    if (dir === "up") s.py = Math.max(30, s.py - 30);
    if (dir === "down") s.py = Math.min(340, s.py + 30);
    if (dir === "left") s.px = Math.max(20, s.px - 30);
    if (dir === "right") s.px = Math.min(740, s.px + 30);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", width: "100%", maxWidth: "760px", padding: "0 8px" }}>
        <div>
          <b>SCORE: {score}</b> · Time Left: {timeLeft}s
        </div>
        <div>
          <b>Shields:</b> {"♥ ".repeat(Math.max(0, gameState.current.lives))}
        </div>
        <div style={{ color: "#2e7d32", fontSize: "12px" }}>
          Parts: {Object.entries(partsFound).map(([k, v]) => `${k} x${v}`).join(", ") || "None"}
        </div>
      </div>

      <div style={{ position: "relative" }}>
        <canvas
          ref={canvasRef}
          width={760}
          height={360}
          style={{
            border: "2px solid #131313",
            background: "#efefed",
            boxShadow: "4px 4px 0 #bbb",
            maxWidth: "100%",
          }}
        />

        {/* Mobile D-Pad */}
        <div className="mobile-dpad">
          <div />
          <button type="button" className="touch-btn" onClick={() => handleTouchDirection("up")}>▲</button>
          <div />
          <button type="button" className="touch-btn" onClick={() => handleTouchDirection("left")}>◀</button>
          <div />
          <button type="button" className="touch-btn" onClick={() => handleTouchDirection("right")}>▶</button>
          <div />
          <button type="button" className="touch-btn" onClick={() => handleTouchDirection("down")}>▼</button>
          <div />
        </div>

        {isGameOver && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.6)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              gap: "14px",
            }}
          >
            <h2 style={{ margin: 0, letterSpacing: "0.1em" }}>SURVIVAL TRIAL OVER!</h2>
            <p>Score: {score} pts · Parts Retrieved: {Object.values(partsFound).reduce((a, b) => a + b, 0)}</p>
            <button
              className="btn-retro primary"
              onClick={() => {
                onReward(score, partsFound);
                onExit();
              }}
            >
              Bank Points & Return
            </button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", width: "100%", maxWidth: "760px" }}>
        <span style={{ fontSize: "11px", color: "#666" }}>Controls: [W A S D / Arrow Keys] Move & Dodge</span>
        <button className="btn-retro" onClick={onExit}>
          Quit to Hub
        </button>
      </div>
    </div>
  );
}
