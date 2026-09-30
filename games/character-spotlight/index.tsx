"use client";

import { useEffect, useRef, useState } from "react";
import type { GameComponentProps } from "@rarefriends/friendsdk/runtime";
import { formatGameAmount } from "@rarefriends/friendsdk/ui";
import { createFriendReader, type GenerationSprites, type SpriteFacing } from "@rarefriends/friendsdk/sprites";
import { createFriendSoundKit, type FriendSoundKit } from "@rarefriends/friendsdk/sounds";
import type { GameSnapshot, GamePlay } from "@rarefriends/friendsdk/game";

import {
  type CharacterState,
  type CharacterUpgrades,
  INITIAL_CHARACTER_STATE,
  UPGRADE_METADATA,
  getUpgradeCost,
  canAscendLevel,
} from "./character.js";
import { drawSpotlightFriend } from "./renderer.js";
import { BlockPuzzleGame } from "./BlockPuzzle.js";
import { ParkourDashGame } from "./ParkourDash.js";
import { BallRushGame } from "./BallRush.js";
import { FruitGame } from "./FruitGame.js";

import "./style.css";

type ActiveMode = "hub" | "block-puzzle" | "parkour-dash" | "ball-rush" | "fruit-game";
type ActiveModal = "character" | "forge" | "games-menu" | "settings" | null;

interface InteractiveStation {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  action: () => void;
  color: string;
}

export default function CharacterSpotlightGame({ friendId, client, paused }: GameComponentProps) {
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [sprites, setSprites] = useState<GenerationSprites | null>(null);
  const [character, setCharacter] = useState<CharacterState>(INITIAL_CHARACTER_STATE);
  const [mode, setMode] = useState<ActiveMode>("hub");
  const [modal, setModal] = useState<ActiveModal>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [soundMuted, setSoundMuted] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  // Settlement outcome from FriendSDK
  const [forgeResult, setForgeResult] = useState<GamePlay | null>(null);

  // Hub player position and controls
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hubPos = useRef({ x: 480, y: 320 });
  const keys = useRef(new Set<string>());
  const soundKit = useRef<FriendSoundKit | null>(null);

  const definition = client.definition;

  // Initialize Sound and Friend Data
  useEffect(() => {
    soundKit.current = createFriendSoundKit({ muted: true });
    void client.read().then(setSnapshot).catch(e => setError(e instanceof Error ? e.message : "Load error"));

    void createFriendReader()
      .read(friendId)
      .then(setSprites)
      .catch(() => console.warn("Using procedural sprite fallback"));

    return () => {
      soundKit.current?.dispose();
    };
  }, [friendId, client]);

  // Handle Rewards from Mini-games
  function handleGameReward(pointsWon: number, partsWon: Record<string, number>) {
    setCharacter(prev => {
      const updatedParts = { ...prev.parts };
      Object.entries(partsWon).forEach(([name, count]) => {
        updatedParts[name] = (updatedParts[name] || 0) + count;
      });
      return {
        ...prev,
        points: prev.points + pointsWon,
        parts: updatedParts,
      };
    });
    soundKit.current?.play("reward");
    setStatusMsg(`Trial Completed! +${pointsWon} Points banked.`);
  }

  // Handle Part Upgrades
  function handleUpgradePart(partKey: keyof CharacterUpgrades) {
    const currentTier = character.upgrades[partKey];
    const cost = getUpgradeCost(currentTier);

    if (character.points < cost.points) {
      setError(`Need ${cost.points} points for this upgrade!`);
      return;
    }
    const availablePartCount = character.parts[cost.partName] || 0;
    if (availablePartCount < cost.partCount) {
      setError(`Need ${cost.partCount}x ${cost.partName} to upgrade! Play games to find parts.`);
      return;
    }

    // Apply upgrade
    setCharacter(prev => ({
      ...prev,
      points: prev.points - cost.points,
      parts: {
        ...prev.parts,
        [cost.partName]: prev.parts[cost.partName] - cost.partCount,
      },
      upgrades: {
        ...prev.upgrades,
        [partKey]: prev.upgrades[partKey] + 1,
      },
    }));

    soundKit.current?.play("impact");
    setStatusMsg(`${UPGRADE_METADATA[partKey].name} upgraded to Tier ${currentTier + 1}!`);
  }

  // Handle Ascending Character to Next Level
  function handleAscendLevel() {
    if (!canAscendLevel(character.upgrades, character.level)) {
      setError("You must upgrade ALL 5 components before ascending to the next level!");
      return;
    }

    setCharacter(prev => ({
      ...prev,
      level: prev.level + 1,
      points: prev.points + 250, // Bonus ascension reward
    }));
    soundKit.current?.play("reveal-legendary");
    setStatusMsg(`ASCENSION ACHIEVED! Character is now Level ${character.level + 1}!`);
  }

  // FriendSDK Forge Action: Spend simulated RF / battery to forge rare artifacts
  async function handleForgeArtifact() {
    if (busy || paused) return;
    setBusy(true);
    setError("");
    void soundKit.current?.unlock();

    try {
      // 1. Buy battery if needed
      if (!snapshot || snapshot.consumables === 0n) {
        await client.buy(1n);
      }
      // 2. Play and settle with FriendSDK
      const play = (await client.play(1n))[0];
      const settled = await client.settle(play.id);
      setForgeResult(settled);

      const refreshed = await client.read();
      setSnapshot(refreshed);
      soundKit.current?.play("reveal-rare");

      // Give bonus parts based on outcome
      if (settled.outcomeId) {
        const outcome = definition.outcomes[settled.outcomeId - 1];
        setStatusMsg(`Forged: ${outcome.name}! (+Parts added)`);
        setCharacter(prev => ({
          ...prev,
          points: prev.points + 100,
          parts: {
            ...prev.parts,
            "Core Fragment": (prev.parts["Core Fragment"] || 0) + 1,
            "Visor Lens": (prev.parts["Visor Lens"] || 0) + 1,
          },
        }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Forge failed");
    } finally {
      setBusy(false);
    }
  }

  // Interactive stations in the central hub
  const stations: InteractiveStation[] = [
    {
      id: "upgrades",
      name: "CHARACTER UPGRADE MATRIX",
      x: 140,
      y: 180,
      w: 120,
      h: 80,
      color: "#b9dc7d",
      action: () => setModal("character"),
    },
    {
      id: "games",
      name: "TRAINING ARENA (4 GAMES)",
      x: 420,
      y: 140,
      w: 140,
      h: 80,
      color: "#efd28a",
      action: () => setModal("games-menu"),
    },
    {
      id: "forge",
      name: "ARTIFACT FORGE (SDK)",
      x: 720,
      y: 180,
      w: 120,
      h: 80,
      color: "#ef917d",
      action: () => setModal("forge"),
    },
  ];

  // Hub Loop
  useEffect(() => {
    if (mode !== "hub") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let last = performance.now();
    let facing: SpriteFacing = "right";

    function onKeyDown(e: KeyboardEvent) {
      if (modal !== null) return;
      keys.current.add(e.key.toLowerCase());
      if (e.key.toLowerCase() === "e") {
        // Interact with closest station
        const p = hubPos.current;
        const target = stations.find(s => Math.hypot(s.x + s.w / 2 - p.x, s.y + s.h / 2 - p.y) < 90);
        if (target) target.action();
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      keys.current.delete(e.key.toLowerCase());
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    function loop(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      // Move player in hub
      if (modal === null && !paused) {
        let dx = 0;
        let dy = 0;
        if (keys.current.has("w") || keys.current.has("arrowup")) dy -= 1;
        if (keys.current.has("s") || keys.current.has("arrowdown")) dy += 1;
        if (keys.current.has("a") || keys.current.has("arrowleft")) dx -= 1;
        if (keys.current.has("d") || keys.current.has("arrowright")) dx += 1;

        if (dx !== 0 || dy !== 0) {
          const speed = 220 + (character.upgrades.mobility - 1) * 20;
          hubPos.current.x = Math.max(50, Math.min(910, hubPos.current.x + dx * speed * dt));
          hubPos.current.y = Math.max(120, Math.min(560, hubPos.current.y + dy * speed * dt));
          facing = dx < 0 ? "left" : dx > 0 ? "right" : facing;
        }
      }

      // Render Hub
      ctx.clearRect(0, 0, 960, 600);

      // Floor Tiles (Isometric / Checkerboard feel)
      ctx.fillStyle = "#efefed";
      ctx.fillRect(0, 0, 960, 600);

      ctx.fillStyle = "#e5e5df";
      for (let x = 0; x < 960; x += 60) {
        for (let y = 0; y < 600; y += 60) {
          if ((x / 60 + y / 60) % 2 === 0) {
            ctx.fillRect(x, y, 60, 60);
          }
        }
      }

      // Draw Stations
      stations.forEach(s => {
        ctx.save();
        ctx.fillStyle = s.color;
        ctx.fillRect(s.x, s.y, s.w, s.h);
        ctx.strokeStyle = "#131313";
        ctx.lineWidth = 2.5;
        ctx.strokeRect(s.x, s.y, s.w, s.h);
        // Shadow
        ctx.fillStyle = "#c5c2bb";
        ctx.fillRect(s.x + 4, s.y + s.h, s.w, 4);

        // Station Label
        ctx.fillStyle = "#131313";
        ctx.font = "bold 11px monospace";
        ctx.textAlign = "center";
        ctx.fillText(s.name, s.x + s.w / 2, s.y + s.h / 2 + 4);

        // Indicator pulse
        const dist = Math.hypot(s.x + s.w / 2 - hubPos.current.x, s.y + s.h / 2 - hubPos.current.y);
        if (dist < 90) {
          ctx.fillStyle = "#2e7d32";
          ctx.font = "bold 12px monospace";
          ctx.fillText("PRESS [E] OR TAP", s.x + s.w / 2, s.y - 12);
        }
        ctx.restore();
      });

      // Draw Character in Hub
      const isWalking = keys.current.size > 0 && modal === null;
      drawSpotlightFriend(
        ctx,
        sprites,
        hubPos.current.x,
        hubPos.current.y,
        facing,
        isWalking,
        Math.floor(now / 110) % 8,
        4,
        character.upgrades.aura
      );

      animId = requestAnimationFrame(loop);
    }

    animId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [mode, modal, character, sprites, paused]);

  return (
    <div className="spotlight-app">
      {/* Top HUD */}
      <header className="spotlight-topbar">
        <div className="spotlight-stats">
          <div className="stat-chip">
            <span>LEVEL:</span>
            <b style={{ color: "#2e7d32" }}>{character.level}</b>
          </div>
          <div className="stat-chip">
            <span>POINTS:</span>
            <b style={{ color: "#e65100" }}>{character.points}</b>
          </div>
          <div className="stat-chip">
            <span>SDK BATTERIES:</span>
            <b>{snapshot?.consumables.toString() || "0"}</b>
          </div>
        </div>

        <nav className="spotlight-nav">
          <button className="btn-retro primary" onClick={() => setModal("character")}>
            Customizer & Upgrades
          </button>
          <button className="btn-retro gold" onClick={() => setModal("games-menu")}>
            Choose Mini-Game
          </button>
          <button className="btn-retro accent" onClick={() => setModal("forge")}>
            Artifact Forge
          </button>
          <button className="btn-retro" onClick={() => setModal("settings")}>
            Settings
          </button>
        </nav>
      </header>

      {/* Main Viewport */}
      <main className="spotlight-viewport">
        {mode === "hub" && (
          <>
            <canvas
              ref={canvasRef}
              width={960}
              height={600}
              className="game-canvas"
              onClick={e => {
                if (modal !== null) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const clickX = ((e.clientX - rect.left) / rect.width) * 960;
                const clickY = ((e.clientY - rect.top) / rect.height) * 600;
                // Move or interact
                const target = stations.find(
                  s => clickX >= s.x && clickX <= s.x + s.w && clickY >= s.y && clickY <= s.y + s.h
                );
                if (target) target.action();
                else {
                  hubPos.current = { x: clickX, y: clickY };
                }
              }}
            />

            {/* Character Spotlight Overlay Card */}
            <div className="character-badge">
              <div className="badge-icon">
                <span style={{ fontSize: "24px" }}>🤖</span>
              </div>
              <div className="badge-details">
                <b>Rare Friend #{friendId.toString()}</b>
                <span>Level {character.level} · Tier {character.upgrades.core} Frame</span>
              </div>
            </div>

            <div className="controls-hint">
              <span>[WASD / Arrow Keys] Walk · [E] / Tap Station to interact</span>
            </div>
          </>
        )}

        {/* 1. Block Puzzle */}
        {mode === "block-puzzle" && (
          <BlockPuzzleGame
            character={character}
            onReward={handleGameReward}
            onExit={() => setMode("hub")}
            reducedMotion={reducedMotion}
          />
        )}

        {/* 2. Parkour Dash */}
        {mode === "parkour-dash" && (
          <ParkourDashGame
            character={character}
            sprites={sprites}
            onReward={handleGameReward}
            onExit={() => setMode("hub")}
            reducedMotion={reducedMotion}
          />
        )}

        {/* 3. Obstacles Ball Rush */}
        {mode === "ball-rush" && (
          <BallRushGame
            character={character}
            sprites={sprites}
            onReward={handleGameReward}
            onExit={() => setMode("hub")}
            reducedMotion={reducedMotion}
          />
        )}

        {/* 4. Fruit Game */}
        {mode === "fruit-game" && (
          <FruitGame
            character={character}
            sprites={sprites}
            onReward={handleGameReward}
            onExit={() => setMode("hub")}
            reducedMotion={reducedMotion}
          />
        )}
      </main>

      {/* Modal 1: Character Customization & Modular Upgrades */}
      {modal === "character" && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="retro-window" onClick={e => e.stopPropagation()}>
            <div className="window-header">
              <span>Character Spotlight: Modular Upgrade Matrix</span>
              <button className="btn-retro" onClick={() => setModal(null)}>
                ✕
              </button>
            </div>
            <div className="window-body">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 style={{ margin: 0 }}>Current Level: {character.level}</h3>
                  <small style={{ color: "#666" }}>
                    Rule: All 5 components must be upgraded to Tier {character.level + 1} to ascend!
                  </small>
                </div>
                <button
                  className="btn-retro primary"
                  disabled={!canAscendLevel(character.upgrades, character.level)}
                  onClick={handleAscendLevel}
                >
                  Ascend to Level {character.level + 1}
                </button>
              </div>

              {/* Inventory of parts */}
              <div style={{ background: "#f5f5f2", padding: "10px", border: "1.5px solid #131313" }}>
                <b>Available Spare Parts Cache:</b>
                <div style={{ display: "flex", gap: "12px", marginTop: "6px", flexWrap: "wrap" }}>
                  {Object.entries(character.parts).map(([name, count]) => (
                    <span key={name} className="stat-chip">
                      {name}: <b>{count}</b>
                    </span>
                  ))}
                </div>
              </div>

              {/* 5 Upgrade Component Slots */}
              <div className="upgrades-grid">
                {(Object.keys(UPGRADE_METADATA) as (keyof CharacterUpgrades)[]).map(key => {
                  const meta = UPGRADE_METADATA[key];
                  const tier = character.upgrades[key];
                  const cost = getUpgradeCost(tier);
                  const canAfford =
                    character.points >= cost.points && (character.parts[cost.partName] || 0) >= cost.partCount;

                  return (
                    <div key={key} className={`upgrade-card ${tier > character.level ? "maxed" : ""}`}>
                      <div className="upgrade-header">
                        <span>{meta.name}</span>
                        <span className="upgrade-level">Tier {tier}</span>
                      </div>
                      <p style={{ margin: 0, fontSize: "11px", color: "#555" }}>{meta.desc}</p>
                      <div className="upgrade-progress-bar">
                        <div
                          className="upgrade-progress-fill"
                          style={{ width: `${Math.min(100, (tier / (character.level + 1)) * 100)}%` }}
                        />
                      </div>
                      <div className="upgrade-cost">
                        Cost: {cost.points} pts + {cost.partCount}x {cost.partName}
                      </div>
                      <button
                        className="btn-retro"
                        disabled={!canAfford}
                        onClick={() => handleUpgradePart(key)}
                      >
                        Upgrade Slot
                      </button>
                    </div>
                  );
                })}
              </div>

              {statusMsg && <div style={{ color: "#2e7d32", fontWeight: "bold" }}>{statusMsg}</div>}
              {error && <div style={{ color: "#c62828", fontWeight: "bold" }}>{error}</div>}
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Mini-Games Selector */}
      {modal === "games-menu" && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="retro-window" onClick={e => e.stopPropagation()}>
            <div className="window-header">
              <span>Choose Your Training Trial</span>
              <button className="btn-retro" onClick={() => setModal(null)}>
                ✕
              </button>
            </div>
            <div className="window-body">
              <div className="games-grid">
                <div
                  className="game-select-card"
                  onClick={() => {
                    setModal(null);
                    setMode("block-puzzle");
                  }}
                >
                  <h4>🧩 Block Puzzle</h4>
                  <p>Clear 8x8 spatial rows & columns. Earn high points and extract rare Core fragments.</p>
                  <button className="btn-retro primary">Play Block Puzzle</button>
                </div>

                <div
                  className="game-select-card"
                  onClick={() => {
                    setModal(null);
                    setMode("parkour-dash");
                  }}
                >
                  <h4>🏃 Parkour Dash</h4>
                  <p>Fast-paced side runner! Jump, slide, dodge lasers and collect Jetpack Thrusters.</p>
                  <button className="btn-retro primary">Play Parkour Dash</button>
                </div>

                <div
                  className="game-select-card"
                  onClick={() => {
                    setModal(null);
                    setMode("ball-rush");
                  }}
                >
                  <h4>⚡ Obstacles Ball Rush</h4>
                  <p>Dodge bouncing hazard orbs in a tight arena while gathering energy batteries.</p>
                  <button className="btn-retro primary">Play Ball Rush</button>
                </div>

                <div
                  className="game-select-card"
                  onClick={() => {
                    setModal(null);
                    setMode("fruit-game");
                  }}
                >
                  <h4>🍎 Fruit Game (Catch Frenzy)</h4>
                  <p>Catch falling cyber-fruits, build combo multipliers and dodge explosive bombs.</p>
                  <button className="btn-retro primary">Play Fruit Game</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: FriendSDK Artifact Forge */}
      {modal === "forge" && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="retro-window" onClick={e => e.stopPropagation()}>
            <div className="window-header">
              <span>FriendSDK Artifact Forge</span>
              <button className="btn-retro" onClick={() => setModal(null)}>
                ✕
              </button>
            </div>
            <div className="window-body">
              <p>
                Forge simulated RF artifacts directly through the <b>FriendSDK</b> settlement oracle.
                Revealing artifacts awards rare parts to upgrade your Character components!
              </p>

              <div style={{ background: "#faf9f6", border: "1.5px solid #131313", padding: "12px" }}>
                <b>Forge Odds & Redemption Value:</b>
                <table style={{ width: "100%", marginTop: "8px", borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                      <th>Artifact</th>
                      <th>Chance</th>
                      <th>RF Reward</th>
                    </tr>
                  </thead>
                  <tbody>
                    {definition.outcomes.map(o => (
                      <tr key={o.name} style={{ borderBottom: "1px dotted #e0ded8" }}>
                        <td>{o.name}</td>
                        <td>{o.chanceBps / 100}%</td>
                        <td>{formatGameAmount(o.reward, 18)} RF</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: "flex", gap: "12px", alignItems: "center", marginTop: "10px" }}>
                <button
                  className="btn-retro primary"
                  disabled={busy || paused}
                  onClick={handleForgeArtifact}
                >
                  {busy ? "Settling with SDK…" : "Forge Artifact (1 Battery)"}
                </button>
              </div>

              {forgeResult && forgeResult.outcomeId && (
                <div style={{ background: "#e8f5e9", border: "1.5px solid #2e7d32", padding: "12px" }}>
                  <b>Forged Outcome:</b> {definition.outcomes[forgeResult.outcomeId - 1].name}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: Settings */}
      {modal === "settings" && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="retro-window" onClick={e => e.stopPropagation()}>
            <div className="window-header">
              <span>Settings & Controls</span>
              <button className="btn-retro" onClick={() => setModal(null)}>
                ✕
              </button>
            </div>
            <div className="window-body">
              <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={!soundMuted}
                  onChange={e => {
                    setSoundMuted(!e.target.checked);
                    soundKit.current?.setMuted(!e.target.checked);
                  }}
                />
                Enable Retro Audio & Sound Cues
              </label>

              <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={reducedMotion}
                  onChange={e => setReducedMotion(e.target.checked)}
                />
                Reduce Motion & Visual Shakes
              </label>

              <p style={{ fontSize: "11px", color: "#666" }}>
                Built with <b>FriendSDK v0.1.4</b> for the Rare Friends Vibeathon. All token purchases &
                redemptions are simulated preview actions on Robinhood mainnet.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
