import { useEffect, useRef, useState, useCallback } from "react";
import type { CharacterState } from "./character.js";

interface BlockPuzzleProps {
  character: CharacterState;
  onReward: (points: number, parts: Record<string, number>) => void;
  onExit: () => void;
  reducedMotion: boolean;
}

const BOARD_COLS = 10;
const BOARD_ROWS = 18;
const CELL_SIZE = 22;

// Classic Tetromino definitions with vivid retro colors
// Matrices defined symmetrically so rotation centers accurately
const TETROMINOES = [
  // I (Cyan) - 4x4
  {
    shape: [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    color: "#56c2d6",
    name: "I",
  },
  // O (Gold / Bridge) - 2x2
  {
    shape: [
      [1, 1],
      [1, 1],
    ],
    color: "#efd28a",
    name: "O",
  },
  // T (Purple) - 3x3
  {
    shape: [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    color: "#9b72cf",
    name: "T",
  },
  // S (Grass / Green) - 3x3
  {
    shape: [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0],
    ],
    color: "#8fb45b",
    name: "S",
  },
  // Z (Coral / Red) - 3x3
  {
    shape: [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0],
    ],
    color: "#ef917d",
    name: "Z",
  },
  // J (Dark Blue) - 3x3
  {
    shape: [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    color: "#4a75a0",
    name: "J",
  },
  // L (Orange) - 3x3
  {
    shape: [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0],
    ],
    color: "#e67e22",
    name: "L",
  },
];

function createEmptyGrid() {
  return Array.from({ length: BOARD_ROWS }, () => Array(BOARD_COLS).fill(null as string | null));
}

function rotateMatrix(matrix: number[][]) {
  const N = matrix.length;
  const M = matrix[0].length;
  const result: number[][] = [];
  for (let c = 0; c < M; c++) {
    result[c] = [];
    for (let r = N - 1; r >= 0; r--) {
      result[c].push(matrix[r][c]);
    }
  }
  return result;
}

export function BlockPuzzleGame({ character, onReward, onExit, reducedMotion }: BlockPuzzleProps) {
  const [grid, setGrid] = useState<(string | null)[][]>(createEmptyGrid);
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [level, setLevel] = useState(1);
  const [partsFound, setPartsFound] = useState<Record<string, number>>({});
  const [gameOver, setGameOver] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // Current active piece
  const [currentPiece, setCurrentPiece] = useState(() => getRandomPiece());
  const [piecePos, setPiecePos] = useState({ x: 3, y: 0 });
  const [nextPiece, setNextPiece] = useState(() => getRandomPiece());

  // Store live references for timer/callbacks to avoid stale state
  const stateRef = useRef({
    grid,
    currentPiece,
    piecePos,
    gameOver,
    isPaused,
  });
  stateRef.current = { grid, currentPiece, piecePos, gameOver, isPaused };

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nextCanvasRef = useRef<HTMLCanvasElement>(null);

  function getRandomPiece() {
    const p = TETROMINOES[Math.floor(Math.random() * TETROMINOES.length)];
    return {
      shape: p.shape.map(row => [...row]),
      color: p.color,
      name: p.name,
    };
  }

  // Check collision strictly against grid and boundaries
  const checkCollision = useCallback((shape: number[][], offset: { x: number; y: number }, currentGrid: (string | null)[][]) => {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c] !== 0) {
          const newX = offset.x + c;
          const newY = offset.y + r;
          // Boundary checks: must be within cols [0, BOARD_COLS - 1] and rows [0, BOARD_ROWS - 1]
          if (newX < 0 || newX >= BOARD_COLS || newY >= BOARD_ROWS) {
            return true;
          }
          if (newY >= 0 && currentGrid[newY][newX] !== null) {
            return true;
          }
        }
      }
    }
    return false;
  }, []);

  // Drop piece by 1 step or lock it
  const drop = useCallback(() => {
    const { grid: curGrid, currentPiece: curPiece, piecePos: curPos, gameOver: isOver, isPaused: isP } = stateRef.current;
    if (isOver || isP) return;

    if (!checkCollision(curPiece.shape, { x: curPos.x, y: curPos.y + 1 }, curGrid)) {
      setPiecePos(prev => ({ ...prev, y: prev.y + 1 }));
    } else {
      // Piece cannot go down further, lock onto grid!
      // If piece is locked above or at y <= 0, game over
      if (curPos.y <= 0) {
        setGameOver(true);
        return;
      }

      const newGrid = curGrid.map(row => [...row]);
      for (let r = 0; r < curPiece.shape.length; r++) {
        for (let c = 0; c < curPiece.shape[r].length; c++) {
          if (curPiece.shape[r][c] !== 0) {
            const gy = curPos.y + r;
            const gx = curPos.x + c;
            if (gy >= 0 && gy < BOARD_ROWS && gx >= 0 && gx < BOARD_COLS) {
              newGrid[gy][gx] = curPiece.color;
            }
          }
        }
      }

      // Check for full line clears
      let cleared = 0;
      const filteredGrid = newGrid.filter(row => {
        const isFull = row.every(cell => cell !== null);
        if (isFull) cleared++;
        return !isFull;
      });

      while (filteredGrid.length < BOARD_ROWS) {
        filteredGrid.unshift(Array(BOARD_COLS).fill(null));
      }

      if (cleared > 0) {
        const linePoints = [0, 100, 300, 500, 800][cleared] || 1000;
        const totalAward = linePoints * character.upgrades.aura;
        setScore(prev => prev + totalAward);
        setLines(prev => prev + cleared);
        setLevel(prev => Math.floor((lines + cleared) / 10) + 1);

        // Rare Part Drops based on lines cleared and Visor level!
        if (Math.random() < 0.5 + character.upgrades.visor * 0.08) {
          const dropItems = ["Core Fragment", "Visor Lens", "Titanium Plate"];
          const chosen = dropItems[Math.floor(Math.random() * dropItems.length)];
          setPartsFound(prev => ({ ...prev, [chosen]: (prev[chosen] || 0) + 1 }));
        }
      } else {
        setScore(prev => prev + 10);
      }

      setGrid(filteredGrid);
      setCurrentPiece(nextPiece);
      setPiecePos({ x: 3, y: 0 });
      setNextPiece(getRandomPiece());
    }
  }, [checkCollision, character.upgrades, lines, nextPiece]);

  // Hard drop: immediately drop to bottom and lock
  const hardDrop = useCallback(() => {
    const { grid: curGrid, currentPiece: curPiece, piecePos: curPos, gameOver: isOver, isPaused: isP } = stateRef.current;
    if (isOver || isP) return;

    let targetY = curPos.y;
    while (!checkCollision(curPiece.shape, { x: curPos.x, y: targetY + 1 }, curGrid)) {
      targetY++;
    }

    // Lock directly onto grid at targetY
    if (targetY <= 0) {
      setGameOver(true);
      return;
    }

    const newGrid = curGrid.map(row => [...row]);
    for (let r = 0; r < curPiece.shape.length; r++) {
      for (let c = 0; c < curPiece.shape[r].length; c++) {
        if (curPiece.shape[r][c] !== 0) {
          const gy = targetY + r;
          const gx = curPos.x + c;
          if (gy >= 0 && gy < BOARD_ROWS && gx >= 0 && gx < BOARD_COLS) {
            newGrid[gy][gx] = curPiece.color;
          }
        }
      }
    }

    let cleared = 0;
    const filteredGrid = newGrid.filter(row => {
      const isFull = row.every(cell => cell !== null);
      if (isFull) cleared++;
      return !isFull;
    });

    while (filteredGrid.length < BOARD_ROWS) {
      filteredGrid.unshift(Array(BOARD_COLS).fill(null));
    }

    if (cleared > 0) {
      const linePoints = [0, 100, 300, 500, 800][cleared] || 1000;
      const totalAward = linePoints * character.upgrades.aura;
      setScore(prev => prev + totalAward);
      setLines(prev => prev + cleared);
      setLevel(prev => Math.floor((lines + cleared) / 10) + 1);

      if (Math.random() < 0.5 + character.upgrades.visor * 0.08) {
        const dropItems = ["Core Fragment", "Visor Lens", "Titanium Plate"];
        const chosen = dropItems[Math.floor(Math.random() * dropItems.length)];
        setPartsFound(prev => ({ ...prev, [chosen]: (prev[chosen] || 0) + 1 }));
      }
    } else {
      setScore(prev => prev + 15);
    }

    setGrid(filteredGrid);
    setCurrentPiece(nextPiece);
    setPiecePos({ x: 3, y: 0 });
    setNextPiece(getRandomPiece());
  }, [checkCollision, character.upgrades, lines, nextPiece]);

  // Move horizontally with strict collision check
  const move = useCallback((dir: number) => {
    const { grid: curGrid, currentPiece: curPiece, piecePos: curPos, gameOver: isOver, isPaused: isP } = stateRef.current;
    if (isOver || isP) return;

    if (!checkCollision(curPiece.shape, { x: curPos.x + dir, y: curPos.y }, curGrid)) {
      setPiecePos(prev => ({ ...prev, x: prev.x + dir }));
    }
  }, [checkCollision]);

  // Rotate piece with SRS-style multi-step wall kick
  const rotate = useCallback(() => {
    const { grid: curGrid, currentPiece: curPiece, piecePos: curPos, gameOver: isOver, isPaused: isP } = stateRef.current;
    if (isOver || isP) return;

    const rotated = rotateMatrix(curPiece.shape);

    // Try standard offset 0, then wall kicks [-1, +1, -2, +2]
    const kicks = [0, -1, 1, -2, 2];
    for (const kick of kicks) {
      if (!checkCollision(rotated, { x: curPos.x + kick, y: curPos.y }, curGrid)) {
        setCurrentPiece(prev => ({ ...prev, shape: rotated }));
        if (kick !== 0) {
          setPiecePos(prev => ({ ...prev, x: prev.x + kick }));
        }
        return;
      }
    }
  }, [checkCollision]);

  // Keyboard controls
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (gameOver) return;
      const key = e.key.toLowerCase();
      if (key === "arrowleft" || key === "a") {
        e.preventDefault();
        move(-1);
      } else if (key === "arrowright" || key === "d") {
        e.preventDefault();
        move(1);
      } else if (key === "arrowdown" || key === "s") {
        e.preventDefault();
        drop();
      } else if (key === "arrowup" || key === "w" || key === "x") {
        e.preventDefault();
        rotate();
      } else if (key === " " || key === "spacebar") {
        e.preventDefault();
        hardDrop();
      } else if (key === "p") {
        e.preventDefault();
        setIsPaused(p => !p);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [drop, hardDrop, move, rotate, gameOver]);

  // Auto gravity drop timer
  useEffect(() => {
    if (gameOver || isPaused) return;
    const speed = Math.max(120, 650 - (level - 1) * 60);
    const interval = setInterval(drop, speed);
    return () => clearInterval(interval);
  }, [drop, gameOver, isPaused, level]);

  // Render main board canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Strictly clip drawing area to canvas bounding box so nothing can ever escape or bleed outside
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, canvas.height);
    ctx.clip();

    // Draw background
    ctx.fillStyle = "#efefed";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid lines
    ctx.strokeStyle = "#dedbcf";
    ctx.lineWidth = 1;
    for (let c = 0; c <= BOARD_COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * CELL_SIZE, 0);
      ctx.lineTo(c * CELL_SIZE, BOARD_ROWS * CELL_SIZE);
      ctx.stroke();
    }
    for (let r = 0; r <= BOARD_ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * CELL_SIZE);
      ctx.lineTo(BOARD_COLS * CELL_SIZE, r * CELL_SIZE);
      ctx.stroke();
    }

    // Draw locked blocks
    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let c = 0; c < BOARD_COLS; c++) {
        const cell = grid[r][c];
        if (cell) {
          drawBlock(ctx, c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, cell);
        }
      }
    }

    // Draw ghost projection (where piece will land)
    let ghostY = piecePos.y;
    while (!checkCollision(currentPiece.shape, { x: piecePos.x, y: ghostY + 1 }, grid)) {
      ghostY++;
    }
    for (let r = 0; r < currentPiece.shape.length; r++) {
      for (let c = 0; c < currentPiece.shape[r].length; c++) {
        if (currentPiece.shape[r][c] !== 0) {
          const gx = piecePos.x + c;
          const gy = ghostY + r;
          if (gx >= 0 && gx < BOARD_COLS && gy >= 0 && gy < BOARD_ROWS) {
            ctx.strokeStyle = currentPiece.color;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(gx * CELL_SIZE + 1, gy * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2);
          }
        }
      }
    }

    // Draw active falling piece (strictly bounded)
    for (let r = 0; r < currentPiece.shape.length; r++) {
      for (let c = 0; c < currentPiece.shape[r].length; c++) {
        if (currentPiece.shape[r][c] !== 0) {
          const px = piecePos.x + c;
          const py = piecePos.y + r;
          if (px >= 0 && px < BOARD_COLS && py >= 0 && py < BOARD_ROWS) {
            drawBlock(ctx, px * CELL_SIZE, py * CELL_SIZE, CELL_SIZE, currentPiece.color);
          }
        }
      }
    }

    ctx.restore();
  }, [grid, currentPiece, piecePos, checkCollision]);

  // Render Next Piece preview
  useEffect(() => {
    const canvas = nextCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const s = 12;
    const shape = nextPiece.shape;
    const offX = (canvas.width - shape[0].length * s) / 2;
    const offY = (canvas.height - shape.length * s) / 2;

    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c] !== 0) {
          drawBlock(ctx, offX + c * s, offY + r * s, s, nextPiece.color);
        }
      }
    }
  }, [nextPiece]);

  function drawBlock(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y + 1, size - 2, size - 2);

    // Bevel highlights & shadow
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillRect(x + 1, y + 1, size - 2, 2);
    ctx.fillRect(x + 1, y + 1, 2, size - 2);

    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(x + size - 3, y + 1, 2, size - 2);
    ctx.fillRect(x + 1, y + size - 3, size - 2, 2);

    // Border
    ctx.strokeStyle = "#131313";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, size, size);
  }

  function handleClaimPoints() {
    onReward(score, partsFound);
    onExit();
  }

  return (
    <div style={{ display: "flex", gap: "12px", alignItems: "center", justifyContent: "center", fontFamily: '"Courier New", monospace', height: "100%", width: "100%", boxSizing: "border-box" }}>
      {/* Left: Main Board */}
      <div style={{ position: "relative" }}>
        <canvas
          ref={canvasRef}
          width={BOARD_COLS * CELL_SIZE}
          height={BOARD_ROWS * CELL_SIZE}
          style={{
            border: "2px solid #131313",
            boxShadow: "3px 3px 0 #c5c2bb",
            background: "#efefed",
            display: "block",
          }}
        />

        {gameOver && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(19,19,19,0.85)",
              color: "#fff",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              padding: "10px",
              textAlign: "center",
            }}
          >
            <h3 style={{ margin: 0, letterSpacing: "0.08em", fontSize: "14px" }}>GAME OVER</h3>
            <p style={{ margin: 0, fontSize: "11px" }}>Score: {score} pts | Lines: {lines}</p>
            <button className="btn-tactile primary" style={{ fontSize: "10px", padding: "4px 8px" }} onClick={handleClaimPoints}>
              Bank Points & Exit
            </button>
          </div>
        )}
      </div>

      {/* Right: Info Panel & Controls */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", width: "145px" }}>
        {/* Next Block */}
        <div style={{ background: "#fff", border: "1.5px solid #131313", boxShadow: "2px 2px 0 #c5c2bb", padding: "4px 6px" }}>
          <div style={{ fontSize: "9px", fontWeight: "bold", textTransform: "uppercase", marginBottom: "2px" }}>
            Next Piece
          </div>
          <canvas ref={nextCanvasRef} width={64} height={48} style={{ display: "block", margin: "auto" }} />
        </div>

        {/* Stats */}
        <div style={{ background: "#fff", border: "1.5px solid #131313", boxShadow: "2px 2px 0 #c5c2bb", padding: "4px 6px", fontSize: "10px", display: "flex", flexDirection: "column", gap: "2px" }}>
          <div>SCORE: <b>{score}</b></div>
          <div>LINES: <b>{lines}</b></div>
          <div>LEVEL: <b>{level}</b></div>
          <div style={{ borderTop: "1px dotted #ccc", paddingTop: "2px", fontSize: "9px", color: "#2e7d32" }}>
            Parts: {Object.entries(partsFound).map(([k, v]) => `${k} x${v}`).join(", ") || "None"}
          </div>
        </div>

        {/* On-screen Tactile Controls for Mouse / Phone */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "3px" }}>
          <button className="btn-tactile" style={{ padding: "4px 2px", fontSize: "10px" }} onClick={() => move(-1)}>◀</button>
          <button className="btn-tactile" style={{ padding: "4px 2px", fontSize: "10px" }} onClick={rotate}>↻</button>
          <button className="btn-tactile" style={{ padding: "4px 2px", fontSize: "10px" }} onClick={() => move(1)}>▶</button>
          <button className="btn-tactile" style={{ gridColumn: "span 3", padding: "3px 4px", fontSize: "9px" }} onClick={drop}>▼ SOFT DROP</button>
          <button className="btn-tactile gold" style={{ gridColumn: "span 3", padding: "3px 4px", fontSize: "9px" }} onClick={hardDrop}>⚡ HARD DROP</button>
        </div>

        <button className="btn-tactile primary" style={{ marginTop: "2px", padding: "4px 8px", fontSize: "9px" }} onClick={handleClaimPoints}>
          Bank & Exit
        </button>
      </div>
    </div>
  );
}
