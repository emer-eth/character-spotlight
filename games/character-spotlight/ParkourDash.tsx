import { useEffect, useRef, useState } from "react";
import type { CharacterState } from "./character.js";
import { drawSpotlightFriend } from "./renderer.js";
import type { GenerationSprites } from "@rarefriends/friendsdk/sprites";

interface ParkourDashProps {
  character: CharacterState;
  sprites: GenerationSprites | null;
  onReward: (points: number, parts: Record<string, number>) => void;
  onExit: () => void;
  reducedMotion: boolean;
}

interface Obstacle {
  x: number;
  y: number;
  width: number;
  height: number;
  type: "spike" | "barrier" | "low-laser";
}

interface Collectible {
  x: number;
  y: number;
  type: "coin" | "part";
  name?: string;
  collected: boolean;
}

export function ParkourDashGame({ character, sprites, onReward, onExit, reducedMotion }: ParkourDashProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [distance, setDistance] = useState(0);
  const [partsFound, setPartsFound] = useState<Record<string, number>>({});
  const [isGameOver, setIsGameOver] = useState(false);

  const gameState = useRef({
    playerY: 280,
    playerVy: 0,
    isGrounded: true,
    isSliding: false,
    speed: 300 + (character.upgrades.mobility - 1) * 35,
    obstacles: [] as Obstacle[],
    collectibles: [] as Collectible[],
    lastSpawn: 0,
    activeScore: 0,
    activeDistance: 0,
    activeParts: {} as Record<string, number>,
    lives: character.upgrades.armor, // Nano plating gives extra hit protection!
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let lastTime = performance.now();
    const FLOOR_Y = 280;
    const GRAVITY = 1100;
    const JUMP_FORCE = -480 - (character.upgrades.mobility - 1) * 25;

    function handleKeyDown(e: KeyboardEvent) {
      if (isGameOver) return;
      const key = e.key.toLowerCase();
      if ((key === "w" || key === "arrowup" || key === " ") && gameState.current.isGrounded) {
        gameState.current.playerVy = JUMP_FORCE;
        gameState.current.isGrounded = false;
      } else if (key === "s" || key === "arrowdown") {
        gameState.current.isSliding = true;
      }
    }

    function handleKeyUp(e: KeyboardEvent) {
      const key = e.key.toLowerCase();
      if (key === "s" || key === "arrowdown") {
        gameState.current.isSliding = false;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    function loop(now: number) {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      const state = gameState.current;

      // Update player physics
      if (!state.isGrounded) {
        state.playerVy += GRAVITY * dt;
        state.playerY += state.playerVy * dt;
        if (state.playerY >= FLOOR_Y) {
          state.playerY = FLOOR_Y;
          state.playerVy = 0;
          state.isGrounded = true;
        }
      }

      state.activeDistance += state.speed * dt;
      state.activeScore += Math.round(dt * 15 * character.upgrades.aura);

      // Spawn obstacles and pickups
      if (now - state.lastSpawn > 1400) {
        state.lastSpawn = now;
        const rand = Math.random();
        if (rand < 0.4) {
          // Low laser / barrier (need to jump)
          state.obstacles.push({ x: 800, y: FLOOR_Y - 26, width: 24, height: 26, type: "spike" });
        } else if (rand < 0.7) {
          // High hanging obstacle (need to slide)
          state.obstacles.push({ x: 800, y: FLOOR_Y - 60, width: 34, height: 28, type: "low-laser" });
        } else {
          // Tall barrier
          state.obstacles.push({ x: 800, y: FLOOR_Y - 45, width: 22, height: 45, type: "barrier" });
        }

        // Coin or part
        if (Math.random() < 0.6) {
          const isPart = Math.random() < 0.3 + (character.upgrades.visor * 0.05);
          state.collectibles.push({
            x: 840,
            y: FLOOR_Y - (Math.random() > 0.5 ? 65 : 20),
            type: isPart ? "part" : "coin",
            name: isPart ? "Jetpack Thruster" : undefined,
            collected: false,
          });
        }
      }

      // Move obstacles & collectibles
      state.obstacles.forEach(o => { o.x -= state.speed * dt; });
      state.collectibles.forEach(c => { c.x -= state.speed * dt; });

      // Clean off-screen
      state.obstacles = state.obstacles.filter(o => o.x > -50);
      state.collectibles = state.collectibles.filter(c => c.x > -50);

      // Collision detection
      const playerBox = {
        x: 120,
        y: state.isSliding ? state.playerY - 22 : state.playerY - 45,
        w: 30,
        h: state.isSliding ? 22 : 45,
      };

      // Collectibles
      state.collectibles.forEach(c => {
        if (!c.collected && Math.hypot(c.x - (playerBox.x + 15), c.y - (playerBox.y + 20)) < 28) {
          c.collected = true;
          if (c.type === "coin") {
            state.activeScore += 50 * character.upgrades.aura;
          } else {
            const pName = c.name || "Titanium Plate";
            state.activeParts[pName] = (state.activeParts[pName] || 0) + 1;
            state.activeScore += 150;
          }
        }
      });

      // Obstacles collision
      for (const obs of state.obstacles) {
        if (
          playerBox.x < obs.x + obs.width &&
          playerBox.x + playerBox.w > obs.x &&
          playerBox.y < obs.y + obs.height &&
          playerBox.y + playerBox.h > obs.y
        ) {
          state.lives--;
          state.obstacles = state.obstacles.filter(o => o !== obs);
          if (state.lives <= 0) {
            setIsGameOver(true);
            setScore(state.activeScore);
            setDistance(Math.round(state.activeDistance));
            setPartsFound({ ...state.activeParts });
            return;
          }
        }
      }

      // RENDER
      ctx.clearRect(0, 0, 620, 290);

      // Parallax Cityscape / Background
      ctx.fillStyle = "#dfe7d5";
      ctx.fillRect(0, 0, 640, 320);

      // Moving ground grid
      ctx.fillStyle = "#8fb45b";
      ctx.fillRect(0, FLOOR_Y, 640, 320 - FLOOR_Y);
      ctx.fillStyle = "#6e8e42";
      const groundOffset = (state.activeDistance % 40);
      for (let gx = -groundOffset; gx < 640; gx += 40) {
        ctx.fillRect(gx, FLOOR_Y, 3, 320 - FLOOR_Y);
      }
      ctx.strokeStyle = "#131313";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, FLOOR_Y);
      ctx.lineTo(640, FLOOR_Y);
      ctx.stroke();

      // Draw obstacles
      state.obstacles.forEach(o => {
        ctx.fillStyle = o.type === "spike" ? "#ef917d" : o.type === "low-laser" ? "#efd28a" : "#d87968";
        ctx.fillRect(o.x, o.y, o.width, o.height);
        ctx.strokeStyle = "#131313";
        ctx.strokeRect(o.x, o.y, o.width, o.height);
      });

      // Draw collectibles
      state.collectibles.forEach(c => {
        if (c.collected) return;
        ctx.save();
        if (c.type === "coin") {
          ctx.fillStyle = "#efd28a";
          ctx.beginPath();
          ctx.arc(c.x, c.y, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#131313";
          ctx.stroke();
        } else {
          ctx.fillStyle = "#56c2d6";
          ctx.fillRect(c.x - 7, c.y - 7, 14, 14);
          ctx.strokeStyle = "#131313";
          ctx.strokeRect(c.x - 7, c.y - 7, 14, 14);
        }
        ctx.restore();
      });

      // Draw player Friend
      const walkFrame = Math.floor(now / 100) % 8;
      drawSpotlightFriend(
        ctx,
        sprites,
        playerBox.x + 15,
        state.playerY,
        "right",
        state.isGrounded && !state.isSliding,
        walkFrame,
        3.5,
        character.upgrades.aura
      );

      setScore(state.activeScore);
      setDistance(Math.round(state.activeDistance));
      setPartsFound({ ...state.activeParts });

      animId = requestAnimationFrame(loop);
    }

    animId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [character, sprites, isGameOver]);

  function handleTouchJump() {
    if (gameState.current.isGrounded) {
      gameState.current.playerVy = -480 - (character.upgrades.mobility - 1) * 25;
      gameState.current.isGrounded = false;
    }
  }

  function handleTouchSlide(active: boolean) {
    gameState.current.isSliding = active;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", width: "100%", maxWidth: "660px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", width: "100%", padding: "0 4px", fontSize: "11px" }}>
        <div>
          <b>SCORE: {score}</b> · Distance: {distance}m
        </div>
        <div>
          <b>Shield HP:</b> {"♥ ".repeat(Math.max(0, gameState.current.lives))}
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
            background: "#dfe7d5",
            boxShadow: "3px 3px 0 #c5c2bb",
            display: "block",
            maxWidth: "100%",
          }}
        />

        {/* Mobile On-Screen Action Buttons */}
        <div style={{ position: "absolute", bottom: "12px", right: "12px", display: "flex", gap: "8px" }}>
          <button
            type="button"
            className="touch-btn"
            style={{ width: "52px", height: "48px", borderRadius: "8px", border: "2px solid #131313", boxShadow: "2px 2px 0 #131313" }}
            onPointerDown={handleTouchJump}
          >
            JUMP
          </button>
          <button
            type="button"
            className="touch-btn"
            style={{ width: "52px", height: "48px", borderRadius: "8px", border: "2px solid #131313", boxShadow: "2px 2px 0 #131313" }}
            onPointerDown={() => handleTouchSlide(true)}
            onPointerUp={() => handleTouchSlide(false)}
          >
            SLIDE
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
            <h2 style={{ margin: 0, letterSpacing: "0.08em", fontSize: "16px" }}>RUN COMPLETE!</h2>
            <p style={{ margin: 0, fontSize: "12px" }}>You survived {distance}m and accumulated {score} pts!</p>
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
        <span style={{ fontSize: "10px", color: "#666" }}>Controls: [W / Space / Up] Jump · [S / Down] Slide</span>
        <button className="btn-tactile" style={{ fontSize: "10px", padding: "3px 8px" }} onClick={onExit}>
          Quit to Hub
        </button>
      </div>
    </div>
  );
}
