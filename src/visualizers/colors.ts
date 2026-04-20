import { clamp01 } from "./math";

export function withAlpha(hex: string, alpha: number) {
  const value = hex.replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${clamp01(alpha)})`;
}

export function applyEdgeFade(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.save();
  ctx.globalCompositeOperation = "destination-in";

  const fade = ctx.createLinearGradient(0, 0, width, 0);
  fade.addColorStop(0, "rgba(0, 0, 0, 0)");
  fade.addColorStop(0.14, "rgba(0, 0, 0, 1)");
  fade.addColorStop(0.86, "rgba(0, 0, 0, 1)");
  fade.addColorStop(1, "rgba(0, 0, 0, 0)");

  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
