import { useEffect, useRef, useState } from "react";
import type { CharacterState } from "./character.js";

interface BlockPuzzleProps {
  character: CharacterState;
  onReward: (points: number, parts: Record<string, number>) => void;
  onExit: () => void;
  reducedMotion: boolean;
}

const BOARD_SIZE = 8;
const CELL_SIZE = 38;

type Shape = number[][];

const SHAPES: { name: string; matrix: Shape; color: string }[] = [
  { name: "Single", matrix: [[1]], color: "#56c2d6" },
  { name: "Line2", matrix: [[1, 1]], color: "#b9dc7d" },
  { name: "Line3", matrix: [[1, 1, 1]], color: "#b9dc7d" },
  { name: "Line4", matrix: [[1, 1, 1, 1]], color: "#efd28a" },
  { name: "Square", matrix: [[1, 1], [1, 1]], color: "#ef917d" },
  { name: "L-shape", matrix: [[1, 0], [1, 0], [1, 1]], color: "#9b72cf" },
  { name: "T-shape", matrix: [[1, 1, 1], [0, 1, 0]], color: "#ef917d" },
  { name: "Corner", matrix: [[1, 1], [1, 0]], color: "#56c2d6" },
];

export function BlockPuzzleGame({ character, onReward, onExit, reducedMotion }: BlockPuzzleProps) {
  const [board, setBoard] = useState<(string | null)[][]>(() =>
    Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null))
  );
  const [availablePieces, setAvailablePieces] = useState<number[]>([0, 1, 2]);
  const [selectedPiece, setSelectedPiece] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [linesCleared, setLinesCleared] = useState(0);
  const [partsFound, setPartsFound] = useState<Record<string, number>>({});
  const [gameOver, setGameOver] = useState(false);

  function pickRandomShapes(): number[] {
    return [
      Math.floor(Math.random() * SHAPES.length),
      Math.floor(Math.random() * SHAPES.length),
      Math.floor(Math.random() * SHAPES.length),
    ];
  }

  function canPlace(b: (string | null)[][], shape: Shape, startR: number, startC: number): boolean {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c] === 1) {
          const br = startR + r;
          const bc = startC + c;
          if (br < 0 || br >= BOARD_SIZE || bc < 0 || bc >= BOARD_SIZE) return false;
          if (b[br][bc] !== null) return false;
        }
      }
    }
    return true;
  }

  function handleCellClick(targetR: number, targetC: number) {
    if (gameOver || selectedPiece === null) return;
    const shapeIndex = availablePieces[selectedPiece];
    if (shapeIndex === undefined) return;
    const piece = SHAPES[shapeIndex];

    if (!canPlace(board, piece.matrix, targetR, targetC)) {
      return;
    }

    // Place the piece
    const newBoard = board.map(row => [...row]);
    let placedCells = 0;
    for (let r = 0; r < piece.matrix.length; r++) {
      for (let c = 0; c < piece.matrix[r].length; c++) {
        if (piece.matrix[r][c] === 1) {
          newBoard[targetR + r][targetC + c] = piece.color;
          placedCells++;
        }
      }
    }

    let gainedPoints = placedCells * 10 * character.upgrades.aura;

    // Check full rows & columns
    const fullRows: number[] = [];
    const fullCols: number[] = [];

    for (let r = 0; r < BOARD_SIZE; r++) {
      if (newBoard[r].every(cell => cell !== null)) fullRows.push(r);
    }
    for (let c = 0; c < BOARD_SIZE; c++) {
      let isColFull = true;
      for (let r = 0; r < BOARD_SIZE; r++) {
        if (newBoard[r][c] === null) {
          isColFull = false;
          break;
        }
      }
      if (isColFull) fullCols.push(c);
    }

    // Clear lines
    fullRows.forEach(r => {
      for (let c = 0; c < BOARD_SIZE; c++) newBoard[r][c] = null;
    });
    fullCols.forEach(c => {
      for (let r = 0; r < BOARD_SIZE; r++) newBoard[r][c] = null;
    });

    const totalLines = fullRows.length + fullCols.length;
    if (totalLines > 0) {
      gainedPoints += totalLines * 100 * character.upgrades.aura;
      setLinesCleared(prev => prev + totalLines);

      // Part Drop Chance!
      if (Math.random() < 0.45 + character.upgrades.visor * 0.05) {
        const dropTypes = ["Core Fragment", "Visor Lens", "Titanium Plate"];
        const chosen = dropTypes[Math.floor(Math.random() * dropTypes.length)];
        setPartsFound(prev => ({ ...prev, [chosen]: (prev[chosen] || 0) + 1 }));
      }
    }

    setScore(prev => prev + gainedPoints);
    setBoard(newBoard);

    // Consume piece
    const newPieces = [...availablePieces];
    newPieces.splice(selectedPiece, 1);
    setSelectedPiece(null);

    if (newPieces.length === 0) {
      setAvailablePieces(pickRandomShapes());
    } else {
      setAvailablePieces(newPieces);
    }
  }

  function handleClaimAndFinish() {
    onReward(score, partsFound);
    onExit();
  }

  return (
    <div style={{ padding: "16px", display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", width: "100%", maxWidth: "440px" }}>
        <div>
          <b>POINTS: {score}</b>
          <div style={{ fontSize: "11px", color: "#666" }}>Lines Cleared: {linesCleared}</div>
        </div>
        <div style={{ textAlign: "right", fontSize: "12px" }}>
          <b>Parts Found:</b>
          <div style={{ fontSize: "11px", color: "#2e7d32" }}>
            {Object.entries(partsFound).map(([k, v]) => `${k} x${v}`).join(", ") || "None yet"}
          </div>
        </div>
      </div>

      {/* 8x8 Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${BOARD_SIZE}, ${CELL_SIZE}px)`,
          gridTemplateRows: `repeat(${BOARD_SIZE}, ${CELL_SIZE}px)`,
          gap: "2px",
          background: "#131313",
          border: "3px solid #131313",
          boxShadow: "4px 4px 0 #bbb",
        }}
      >
        {board.map((row, r) =>
          row.map((cell, c) => (
            <div
              key={`${r}-${c}`}
              onClick={() => handleCellClick(r, c)}
              style={{
                width: CELL_SIZE,
                height: CELL_SIZE,
                background: cell || "#f9f8f4",
                cursor: selectedPiece !== null ? "pointer" : "default",
                border: cell ? "1px solid rgba(0,0,0,0.2)" : "1px dashed #e4e2da",
                boxSizing: "border-box",
                transition: "background 0.1s ease",
              }}
            />
          ))
        )}
      </div>

      {/* Available Shapes selector */}
      <div style={{ display: "flex", gap: "16px", marginTop: "8px" }}>
        {availablePieces.map((shapeIdx, idx) => {
          const s = SHAPES[shapeIdx];
          const isSelected = selectedPiece === idx;
          return (
            <div
              key={idx}
              onClick={() => setSelectedPiece(isSelected ? null : idx)}
              style={{
                border: isSelected ? "2px solid #2e7d32" : "2px solid #131313",
                background: isSelected ? "#e8f5e9" : "#fff",
                padding: "8px",
                cursor: "pointer",
                boxShadow: isSelected ? "2px 2px 0 #2e7d32" : "3px 3px 0 #ccc",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "4px",
                minWidth: "70px",
              }}
            >
              <div style={{ fontSize: "10px", fontWeight: "bold" }}>{s.name}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                {s.matrix.map((row, r) => (
                  <div key={r} style={{ display: "flex", gap: "2px" }}>
                    {row.map((active, c) => (
                      <div
                        key={c}
                        style={{
                          width: "12px",
                          height: "12px",
                          background: active ? s.color : "transparent",
                          border: active ? "1px solid #131313" : "none",
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: "12px", marginTop: "10px" }}>
        <button className="btn-retro primary" onClick={handleClaimAndFinish}>
          Finish & Bank Points ({score} pts)
        </button>
        <button className="btn-retro" onClick={onExit}>
          Quit
        </button>
      </div>
    </div>
  );
}
