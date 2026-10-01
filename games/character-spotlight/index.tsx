"use client";

import { useEffect, useRef, useState } from "react";
import type { GameComponentProps } from "@rarefriends/friendsdk/runtime";
import { formatGameAmount } from "@rarefriends/friendsdk/ui";
import { createFriendReader, type GenerationSprites } from "@rarefriends/friendsdk/sprites";
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

type ActiveMode = "studio" | "block-puzzle" | "parkour-dash" | "ball-rush" | "fruit-game";
type ActiveModal = "forge" | "settings" | null;

export default function CharacterSpotlightGame({ friendId, client, paused }: GameComponentProps) {
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [sprites, setSprites] = useState<GenerationSprites | null>(null);
  const [character, setCharacter] = useState<CharacterState>(INITIAL_CHARACTER_STATE);
  const [mode, setMode] = useState<ActiveMode>("studio");
  const [modal, setModal] = useState<ActiveModal>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [soundMuted, setSoundMuted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  // FriendSDK Forge Outcome
  const [forgeResult, setForgeResult] = useState<GamePlay | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const soundKit = useRef<FriendSoundKit | null>(null);
  const definition = client.definition;

  // Sound and Sprite Setup
  useEffect(() => {
    soundKit.current = createFriendSoundKit({ muted: false });
    void client.read().then(setSnapshot).catch(e => setError(e instanceof Error ? e.message : "Load error"));

    void createFriendReader()
      .read(friendId)
      .then(setSprites)
      .catch(() => console.warn("Using procedural sprite fallback"));

    return () => {
      soundKit.current?.dispose();
    };
  }, [friendId, client]);

  // Animated Character Doll in Showcase Stage
  useEffect(() => {
    if (mode !== "studio") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    function render(now: number) {
      ctx.clearRect(0, 0, 110, 110);
      drawSpotlightFriend(
        ctx,
        sprites,
        55,
        90,
        "right",
        true,
        Math.floor(now / 110) % 8,
        4,
        character.upgrades.aura,
        "#8fb45b"
      );
      animId = requestAnimationFrame(render);
    }
    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [mode, sprites, character.upgrades.aura]);

  // Mini-Game Reward Handler
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

  // Component Upgrade Handler
  function handleUpgradePart(partKey: keyof CharacterUpgrades) {
    const currentTier = character.upgrades[partKey];
    const cost = getUpgradeCost(currentTier);

    if (character.points < cost.points) {
      setError(`Need ${cost.points} pts for upgrade!`);
      return;
    }
    const availablePartCount = character.parts[cost.partName] || 0;
    if (availablePartCount < cost.partCount) {
      setError(`Need ${cost.partCount}x ${cost.partName}!`);
      return;
    }

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
    setError("");
    setStatusMsg(`${UPGRADE_METADATA[partKey].name} upgraded to Tier ${currentTier + 1}!`);
  }

  // Level Ascension Handler
  function handleAscendLevel() {
    if (!canAscendLevel(character.upgrades, character.level)) {
      setError(`Upgrade ALL 5 parts to Tier ${character.level + 1} first!`);
      return;
    }

    setCharacter(prev => ({
      ...prev,
      level: prev.level + 1,
      points: prev.points + 250,
    }));
    soundKit.current?.play("reveal-legendary");
    setError("");
    setStatusMsg(`ASCENSION! Friend reached Level ${character.level + 1}!`);
  }

  // FriendSDK Forge Action
  async function handleForgeArtifact() {
    if (busy || paused) return;
    setBusy(true);
    setError("");
    void soundKit.current?.unlock();

    try {
      if (!snapshot || snapshot.consumables === 0n) {
        await client.buy(1n);
      }
      const play = (await client.play(1n))[0];
      const settled = await client.settle(play.id);
      setForgeResult(settled);

      const refreshed = await client.read();
      setSnapshot(refreshed);
      soundKit.current?.play("reveal-rare");

      if (settled.outcomeId) {
        const outcome = definition.outcomes[settled.outcomeId - 1];
        setStatusMsg(`Forged on-chain: ${outcome.name}! (+Bonus Parts)`);
        setCharacter(prev => ({
          ...prev,
          points: prev.points + 120,
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

  const isAscendable = canAscendLevel(character.upgrades, character.level);

  return (
    <div className="arcade-studio">
      {/* Top Header */}
      <header className="studio-header">
        <div className="studio-title-block">
          <span className="studio-tag">VIBEATHON</span>
          <h1 className="studio-title">Rare Friends · Character Spotlight Studio</h1>
        </div>

        <div className="studio-metrics">
          <div className="metric-badge highlight">
            <span>LVL</span>
            <b>{character.level}</b>
          </div>
          <div className="metric-badge">
            <span>PTS</span>
            <b>{character.points}</b>
          </div>
          <div className="metric-badge gold">
            <span>BATTERIES</span>
            <b>{snapshot?.consumables.toString() || "0"}</b>
          </div>
          <button className="btn-tactile gold" onClick={() => setModal("forge")}>
            Forge Artifact
          </button>
          <button className="btn-tactile" onClick={() => setModal("settings")}>
            Settings
          </button>
        </div>
      </header>

      {/* Main Studio Body */}
      <div className={`studio-body ${mode !== "studio" ? "in-game" : ""}`}>
        {/* Left Column: Character Spotlight Showcase (only visible in studio mode) */}
        {mode === "studio" && (
          <section className="showcase-column">
          <div className="character-card">
            <span className="character-level-badge">LVL {character.level} HERO</span>

            <div className="character-avatar-stage">
              <canvas ref={canvasRef} width={110} height={110} />
            </div>

            <h3 className="character-title">Rare Friend #{friendId.toString()}</h3>
            <span className="character-meta">Generations NFT · 5 Modular Slots</span>

            {/* Ascension Box */}
            <div className="ascend-box">
              <b>Level {character.level} → {character.level + 1} Ascension</b>
              <small>
                {isAscendable
                  ? "✓ All 5 slots maxed! Ready to ascend."
                  : `Must upgrade all 5 slots to Tier ${character.level + 1} to ascend.`}
              </small>
              <button
                className="btn-tactile primary"
                style={{ width: "100%", marginTop: "3px" }}
                disabled={!isAscendable}
                onClick={handleAscendLevel}
              >
                Ascend Level (+250 Pts)
              </button>
            </div>
          </div>

          {/* Parts Cache Box */}
          <div className="parts-cache-box">
            <span className="parts-cache-title">Spare Parts Cache</span>
            <div className="parts-tags-row">
              {Object.entries(character.parts).map(([name, count]) => (
                <span key={name} className="part-tag">
                  {name}: <b>{count}</b>
                </span>
              ))}
            </div>
          </div>

          {/* 5 Modular Upgrades List */}
          <div className="modules-list">
            {(Object.keys(UPGRADE_METADATA) as (keyof CharacterUpgrades)[]).map(key => {
              const meta = UPGRADE_METADATA[key];
              const tier = character.upgrades[key];
              const cost = getUpgradeCost(tier);
              const canAfford =
                character.points >= cost.points && (character.parts[cost.partName] || 0) >= cost.partCount;

              return (
                <div key={key} className={`module-card ${tier > character.level ? "ready" : ""}`}>
                  <div className="module-header">
                    <span>{meta.name}</span>
                    <span className="module-tier-tag">Tier {tier}</span>
                  </div>
                  <div className="module-bar-wrap">
                    <div
                      className="module-bar-fill"
                      style={{ width: `${Math.min(100, (tier / (character.level + 1)) * 100)}%` }}
                    />
                  </div>
                  <div className="module-footer">
                    <span>{cost.points} pts + {cost.partCount}x {cost.partName}</span>
                    <button
                      className="btn-tactile primary"
                      style={{ padding: "2px 8px", fontSize: "10px" }}
                      disabled={!canAfford}
                      onClick={() => handleUpgradePart(key)}
                    >
                      Upgrade
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {statusMsg && <div style={{ color: "#2e7d32", fontSize: "11px", fontWeight: "bold" }}>{statusMsg}</div>}
          {error && <div style={{ color: "#c62828", fontSize: "11px", fontWeight: "bold" }}>{error}</div>}
        </section>
        )}

        {/* Right Column: Cabinets Grid or Active Mini-Game */}
        <section className="stage-column">
          {mode === "studio" ? (
            <div className="cabinets-grid">
              {/* Cabinet 1: Block Puzzle */}
              <div className="cabinet-card" onClick={() => setMode("block-puzzle")}>
                <div>
                  <div className="cabinet-header">
                    <span className="cabinet-badge">ARCADE 01</span>
                    <span style={{ fontSize: "16px" }}>🧩</span>
                  </div>
                  <h3 className="cabinet-title">Block Puzzle</h3>
                  <p className="cabinet-desc">
                    Spatial placement on an 8x8 grid. Clear lines to score points and drop rare Core Fragments.
                  </p>
                </div>
                <div>
                  <span className="cabinet-loot-tag">Drops: Core Fragments</span>
                  <button className="btn-tactile primary" style={{ width: "100%" }}>
                    Play Block Puzzle →
                  </button>
                </div>
              </div>

              {/* Cabinet 2: Parkour Dash */}
              <div className="cabinet-card" onClick={() => setMode("parkour-dash")}>
                <div>
                  <div className="cabinet-header">
                    <span className="cabinet-badge">ARCADE 02</span>
                    <span style={{ fontSize: "16px" }}>🏃</span>
                  </div>
                  <h3 className="cabinet-title">Parkour Dash</h3>
                  <p className="cabinet-desc">
                    Side-scrolling obstacle run. Jump and slide to dodge laser spikes and grab Jetpack Thrusters.
                  </p>
                </div>
                <div>
                  <span className="cabinet-loot-tag">Drops: Jetpack Thrusters</span>
                  <button className="btn-tactile primary" style={{ width: "100%" }}>
                    Play Parkour Dash →
                  </button>
                </div>
              </div>

              {/* Cabinet 3: Obstacles Ball Rush */}
              <div className="cabinet-card" onClick={() => setMode("ball-rush")}>
                <div>
                  <div className="cabinet-header">
                    <span className="cabinet-badge">ARCADE 03</span>
                    <span style={{ fontSize: "16px" }}>⚡</span>
                  </div>
                  <h3 className="cabinet-title">Ball Rush</h3>
                  <p className="cabinet-desc">
                    Survival dodge arena. Weave past bouncing hazard orbs, gather batteries and survive the rush.
                  </p>
                </div>
                <div>
                  <span className="cabinet-loot-tag">Drops: Titanium Plates</span>
                  <button className="btn-tactile primary" style={{ width: "100%" }}>
                    Play Ball Rush →
                  </button>
                </div>
              </div>

              {/* Cabinet 4: Fruit Game */}
              <div className="cabinet-card" onClick={() => setMode("fruit-game")}>
                <div>
                  <div className="cabinet-header">
                    <span className="cabinet-badge">ARCADE 04</span>
                    <span style={{ fontSize: "16px" }}>🍎</span>
                  </div>
                  <h3 className="cabinet-title">Fruit Game</h3>
                  <p className="cabinet-desc">
                    Reflex arcade catcher. Catch falling fruits to build up combo multipliers while avoiding bombs.
                  </p>
                </div>
                <div>
                  <span className="cabinet-loot-tag">Drops: Visor Lenses</span>
                  <button className="btn-tactile primary" style={{ width: "100%" }}>
                    Play Fruit Game →
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="active-game-container">
              <div style={{ position: "absolute", top: "10px", right: "10px", zIndex: 30 }}>
                <button className="btn-tactile" onClick={() => setMode("studio")}>
                  ✕ Exit to Studio
                </button>
              </div>

              {mode === "block-puzzle" && (
                <BlockPuzzleGame
                  character={character}
                  onReward={handleGameReward}
                  onExit={() => setMode("studio")}
                  reducedMotion={reducedMotion}
                />
              )}

              {mode === "parkour-dash" && (
                <ParkourDashGame
                  character={character}
                  sprites={sprites}
                  onReward={handleGameReward}
                  onExit={() => setMode("studio")}
                  reducedMotion={reducedMotion}
                />
              )}

              {mode === "ball-rush" && (
                <BallRushGame
                  character={character}
                  sprites={sprites}
                  onReward={handleGameReward}
                  onExit={() => setMode("studio")}
                  reducedMotion={reducedMotion}
                />
              )}

              {mode === "fruit-game" && (
                <FruitGame
                  character={character}
                  sprites={sprites}
                  onReward={handleGameReward}
                  onExit={() => setMode("studio")}
                  reducedMotion={reducedMotion}
                />
              )}
            </div>
          )}
        </section>
      </div>

      {/* Modal: FriendSDK Artifact Forge */}
      {modal === "forge" && (
        <div className="tactile-modal-overlay" onClick={() => setModal(null)}>
          <div className="tactile-modal-window" onClick={e => e.stopPropagation()}>
            <div className="tactile-modal-header">
              <span>FriendSDK Artifact Forge</span>
              <button className="btn-tactile" style={{ padding: "2px 8px" }} onClick={() => setModal(null)}>
                ✕
              </button>
            </div>
            <div className="tactile-modal-body">
              <p style={{ margin: 0 }}>
                Spend simulated RF / Batteries to forge rare artifacts through <b>FriendSDK</b> settlement.
              </p>

              <table style={{ width: "100%", fontSize: "11px", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "2px solid #131313" }}>
                    <th>Artifact</th>
                    <th>Chance</th>
                    <th>Reward</th>
                  </tr>
                </thead>
                <tbody>
                  {definition.outcomes.map(o => (
                    <tr key={o.name} style={{ borderBottom: "1px dotted #ccc" }}>
                      <td style={{ padding: "4px 0" }}>{o.name}</td>
                      <td>{o.chanceBps / 100}%</td>
                      <td>{formatGameAmount(o.reward, 18)} RF</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ display: "flex", gap: "8px" }}>
                <button className="btn-tactile primary" disabled={busy || paused} onClick={handleForgeArtifact}>
                  {busy ? "Settling with SDK…" : "Forge Artifact (1 Battery)"}
                </button>
              </div>

              {forgeResult && forgeResult.outcomeId && (
                <div style={{ background: "#f1f8ed", border: "1.5px solid #2e7d32", padding: "8px" }}>
                  <b>Forged:</b> {definition.outcomes[forgeResult.outcomeId - 1].name} (+Bonus Parts added!)
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Settings */}
      {modal === "settings" && (
        <div className="tactile-modal-overlay" onClick={() => setModal(null)}>
          <div className="tactile-modal-window" onClick={e => e.stopPropagation()}>
            <div className="tactile-modal-header">
              <span>Settings</span>
              <button className="btn-tactile" style={{ padding: "2px 8px" }} onClick={() => setModal(null)}>
                ✕
              </button>
            </div>
            <div className="tactile-modal-body">
              <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={!soundMuted}
                  onChange={e => {
                    setSoundMuted(!e.target.checked);
                    soundKit.current?.setMuted(!e.target.checked);
                  }}
                />
                Enable Audio Effects
              </label>

              <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={reducedMotion}
                  onChange={e => setReducedMotion(e.target.checked)}
                />
                Reduce Motion
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
