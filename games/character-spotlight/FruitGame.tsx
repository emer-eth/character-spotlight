import { useEffect, useRef, useState } from "react";
import type { CharacterState } from "./character.js";
import { drawSpotlightFriend } from "./renderer.js";
import type { GenerationSprites } from "@rarefriends/friendsdk/sprites";

interface FruitGameProps {
  character: CharacterState;
  sprites: GenerationSprites | null;
  onReward: (points: number, parts: Record<string, number>) => void;
  onExit: () => void;
  reducedMotion: boolean;
}

interface FallingItem {
  x: number;
  y: number;
  vy: number;
  type: "apple" | "berry" | "golden-melon" | "bomb" | "part";
  name?: string;
  points: number;
  radius: number;
}

export function FruitGame({ character, sprites, onReward, onExit, reducedMotion }: FruitGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(1);
  const [timeLeft, setTimeLeft] = useState(35);
  const [partsFound, setPartsFound] = useState<Record<string, number>>({});
  const [isGameOver, setIsGameOver] = useState(false);

  const gameState = useRef({
    px: 380,
    speed: 380 + (character.upgrades.mobility - 1) * 35,
    items: [] as FallingItem[],
    keys: new Set<string>(),
    activeScore: 0,
    activeCombo: 1,
    activeParts: {} as Record<string, number>,
    lives: character.upgrades.armor,
    magnetRadius: 30 + character.upgrades.visor * 10,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let lastTime = performance.now();
    let spawnTimer = 0;
    let elapsedTimer = 0;

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

      // Timer
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

      // Horizontal player movement
      let dx = 0;
      if (state.keys.has("a") || state.keys.has("arrowleft")) dx -= 1;
      if (state.keys.has("d") || state.keys.has("arrowright")) dx += 1;
      state.px = Math.max(35, Math.min(605, state.px + dx * state.speed * dt));

      // Item spawning within [40, 600]
      spawnTimer += dt;
      if (spawnTimer > 0.45) {
        spawnTimer = 0;
        const r = Math.random();
        const spawnX = 40 + Math.random() * 560;
        if (r < 0.45) {
          // Normal Apple
          state.items.push({ x: spawnX, y: -20, vy: 160 + Math.random() * 80, type: "apple", points: 30, radius: 12 });
        } else if (r < 0.70) {
          // Cyber Berry
          state.items.push({ x: spawnX, y: -20, vy: 200 + Math.random() * 90, type: "berry", points: 60, radius: 10 });
        } else if (r < 0.82) {
          // Golden Melon
          state.items.push({ x: spawnX, y: -20, vy: 240 + Math.random() * 110, type: "golden-melon", points: 150, radius: 16 });
        } else if (r < 0.93) {
          // Hazard Bomb
          state.items.push({ x: spawnX, y: -20, vy: 180 + Math.random() * 70, type: "bomb", points: -50, radius: 14 });
        } else {
          // Part Drop!
          state.items.push({ x: spawnX, y: -20, vy: 140, type: "part", name: "Visor Lens", points: 100, radius: 14 });
        }
      }

      // Update falling items
      const basketY = 275;
      for (let i = state.items.length - 1; i >= 0; i--) {
        const item = state.items[i];
        item.y += item.vy * dt;

        // Visor Magnet pull effect
        const distToPlayer = Math.hypot(item.x - state.px, item.y - basketY);
        if (distToPlayer < state.magnetRadius && item.type !== "bomb") {
          item.x += (state.px - item.x) * 6 * dt;
        }

        // Check basket catcher collision
        if (item.y >= basketY - 15 && item.y <= basketY + 25 && Math.abs(item.x - state.px) < 36) {
          state.items.splice(i, 1);
          if (item.type === "bomb") {
            state.lives--;
            state.activeCombo = 1;
            setCombo(1);
            if (state.lives <= 0) {
              setIsGameOver(true);
              setScore(state.activeScore);
              setPartsFound({ ...state.activeParts });
              return;
            }
          } else if (item.type === "part") {
            const pName = item.name || "Visor Lens";
            state.activeParts[pName] = (state.activeParts[pName] || 0) + 1;
            state.activeScore += 200;
          } else {
            // Fruit caught!
            state.activeScore += item.points * state.activeCombo * character.upgrades.aura;
            state.activeCombo = Math.min(8, state.activeCombo + 1);
            setCombo(state.activeCombo);
          }
          continue;
        }

        // Off-screen ground collision
        if (item.y > 330) {
          if (item.type !== "bomb" && item.type !== "part") {
            state.activeCombo = 1; // Missed fruit resets combo
            setCombo(1);
          }
          state.items.splice(i, 1);
        }
      }

      // RENDER
      ctx.clearRect(0, 0, 640, 320);

      // Orchard Sky & Ground
      ctx.fillStyle = "#eaf2dd";
      ctx.fillRect(0, 0, 640, 275);
      ctx.fillStyle = "#8fb45b";
      ctx.fillRect(0, 275, 640, 45);
      ctx.strokeStyle = "#131313";
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 275, 640, 45);

      // Draw Falling Items
      for (const item of state.items) {
        ctx.save();
        if (item.type === "apple") {
          ctx.fillStyle = "#ef917d";
          ctx.beginPath();
          ctx.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#131313";
          ctx.stroke();
          // Stem
          ctx.fillStyle = "#766544";
          ctx.fillRect(item.x - 1, item.y - item.radius - 4, 3, 5);
        } else if (item.type === "berry") {
          ctx.fillStyle = "#9b72cf";
          ctx.beginPath();
          ctx.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#131313";
          ctx.stroke();
        } else if (item.type === "golden-melon") {
          ctx.fillStyle = "#efd28a";
          ctx.beginPath();
          ctx.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#131313";
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (item.type === "bomb") {
          ctx.fillStyle = "#131313";
          ctx.beginPath();
          ctx.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
          ctx.fill();
          // Wick
          ctx.strokeStyle = "#ef917d";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(item.x, item.y - item.radius);
          ctx.lineTo(item.x + 4, item.y - item.radius - 6);
          ctx.stroke();
        } else {
          // Part crate
          ctx.fillStyle = "#56c2d6";
          ctx.fillRect(item.x - 10, item.y - 10, 20, 20);
          ctx.strokeStyle = "#131313";
          ctx.strokeRect(item.x - 10, item.y - 10, 20, 20);
        }
        ctx.restore();
      }

      // Draw Catcher Basket on Player
      ctx.fillStyle = "#c9bc94";
      ctx.fillRect(state.px - 28, 255, 56, 12);
      ctx.strokeStyle = "#131313";
      ctx.lineWidth = 2;
      ctx.strokeRect(state.px - 28, 255, 56, 12);

      // Draw Player Friend
      const facing = dx < 0 ? "left" : "right";
      drawSpotlightFriend(
        ctx,
        sprites,
        state.px,
        295,
        facing,
        dx !== 0,
        Math.floor(now / 100) % 8,
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

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", width: "100%", maxWidth: "660px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", width: "100%", padding: "0 4px", fontSize: "11px" }}>
        <div>
          <b>SCORE: {score}</b> · Combo: <span style={{ color: "#e65100", fontWeight: "bold" }}>{combo}x</span>
        </div>
        <div>
          <b>Time: {timeLeft}s</b> · Shield: {"♥ ".repeat(Math.max(0, gameState.current.lives))}
        </div>
        <div style={{ color: "#2e7d32", fontWeight: "bold" }}>
          Parts: {Object.entries(partsFound).map(([k, v]) => `${k} x${v}`).join(", ") || "None"}
        </div>
      </div>

      <div style={{ position: "relative" }}>
        <canvas
          ref={canvasRef}
          width={640}
          height={320}
          style={{
            border: "2px solid #131313",
            background: "#eaf2dd",
            boxShadow: "3px 3px 0 #c5c2bb",
            display: "block",
            maxWidth: "100%",
          }}
        />

        {/* Mobile controls */}
        <div style={{ position: "absolute", bottom: "12px", left: "12px", display: "flex", gap: "10px" }}>
          <button
            type="button"
            className="touch-btn"
            style={{ width: "52px", height: "48px", borderRadius: "8px", border: "2px solid #131313", boxShadow: "2px 2px 0 #131313" }}
            onPointerDown={() => gameState.current.keys.add("arrowleft")}
            onPointerUp={() => gameState.current.keys.delete("arrowleft")}
          >
            ◀
          </button>
          <button
            type="button"
            className="touch-btn"
            style={{ width: "52px", height: "48px", borderRadius: "8px", border: "2px solid #131313", boxShadow: "2px 2px 0 #131313" }}
            onPointerDown={() => gameState.current.keys.add("arrowright")}
            onPointerUp={() => gameState.current.keys.delete("arrowright")}
          >
            ▶
          </button>
        </div>

        {isGameOver && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(19,19,19,0.85)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              gap: "10px",
              padding: "12px",
              textAlign: "center",
            }}
          >
            <h2 style={{ margin: 0, letterSpacing: "0.08em", fontSize: "16px" }}>HARVEST TRIAL OVER!</h2>
            <p style={{ margin: 0, fontSize: "12px" }}>Total Score: {score} pts · Parts Retrieved: {Object.values(partsFound).reduce((a, b) => a + b, 0)}</p>
            <button
              className="btn-tactile primary"
              style={{ fontSize: "11px", padding: "6px 14px" }}
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

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "0 4px" }}>
        <span style={{ fontSize: "10px", color: "#666" }}>Controls: [A / D or Arrow Keys] Catch Fruits · Avoid Bombs</span>
        <button className="btn-tactile" style={{ fontSize: "10px", padding: "3px 8px" }} onClick={onExit}>
          Quit to Hub
        </button>
      </div>
    </div>
  );
}
