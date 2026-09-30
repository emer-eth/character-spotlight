import { spriteFrame, type GenerationSprites, type SpriteFacing } from "@rarefriends/friendsdk/sprites";

export function drawSpotlightFriend(
  ctx: CanvasRenderingContext2D,
  sprites: GenerationSprites | null,
  x: number,
  y: number,
  facing: SpriteFacing = "right",
  walking: boolean = false,
  frame: number = 0,
  scale: number = 4,
  auraLevel: number = 1,
  auraColor: string = "#56c2d6"
) {
  ctx.save();

  // Draw Aura Glow if upgraded
  if (auraLevel > 1) {
    const pulse = Math.sin(Date.now() / 200) * 4;
    const auraRadius = (16 * scale) / 2 + (auraLevel - 1) * 3 + pulse;
    const gradient = ctx.createRadialGradient(x, y - (8 * scale), 4, x, y - (8 * scale), auraRadius);
    gradient.addColorStop(0, auraColor + "88");
    gradient.addColorStop(0.7, auraColor + "33");
    gradient.addColorStop(1, "transparent");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y - (8 * scale), auraRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.ellipse(x, y + 2, (10 * scale) / 2, (4 * scale) / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  if (sprites) {
    const rows = spriteFrame(sprites, facing, walking, frame, facing === "left" ? "left" : "right").frame.rows;
    const left = Math.round(x - (8 * scale));
    const top = Math.round(y - (16 * scale));

    // Outer white halo border
    ctx.fillStyle = "#ffffff";
    rows.forEach((row, rowY) => {
      [...row].forEach((pixel, colX) => {
        if (pixel === "#") {
          ctx.fillRect(left + colX * scale - 1, top + rowY * scale - 1, scale + 2, scale + 2);
        }
      });
    });

    // Character main pixels
    ctx.fillStyle = "#131313";
    rows.forEach((row, rowY) => {
      [...row].forEach((pixel, colX) => {
        if (pixel === "#") {
          ctx.fillRect(left + colX * scale, top + rowY * scale, scale, scale);
        }
      });
    });
  } else {
    // Fallback cute retro bot if sprites are loading
    const w = 14 * scale;
    const h = 14 * scale;
    ctx.fillStyle = "#fff";
    ctx.fillRect(x - w / 2, y - h, w, h);
    ctx.strokeStyle = "#131313";
    ctx.lineWidth = 2;
    ctx.strokeRect(x - w / 2, y - h, w, h);
    // Eyes
    ctx.fillStyle = "#131313";
    ctx.fillRect(x - 4, y - h + 8, 3, 5);
    ctx.fillRect(x + 2, y - h + 8, 3, 5);
  }

  ctx.restore();
}
