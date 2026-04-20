import type { StyleSettings, VisualSettings } from "../types";
import { withAlpha } from "./colors";
import { clamp } from "./math";

export function drawBars(
  ctx: CanvasRenderingContext2D,
  bins: number[],
  width: number,
  height: number,
  visual: VisualSettings,
  style: StyleSettings,
) {
  const centerY = height * 0.64;
  const maxHeight = height * 0.52;
  const barCount = Math.max(24, Math.round(46 * style.xScale));
  const gap = clamp((width / barCount) * 0.38, 3.5, 8);
  const barWidth = clamp((width - gap * (barCount - 1)) / barCount, 3.2, 8.5);
  const totalWidth = barCount * barWidth + (barCount - 1) * gap;
  const startX = (width - totalWidth) * 0.5;
  const gradient = ctx.createLinearGradient(0, centerY - maxHeight, width, centerY);
  gradient.addColorStop(0, withAlpha(style.colors[0], style.opacity));
  gradient.addColorStop(0.58, withAlpha(style.colors[1], style.opacity));
  gradient.addColorStop(1, withAlpha(style.colors[2], style.opacity));

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (let index = 0; index < barCount; index += 1) {
    const progress = index / Math.max(1, barCount - 1);
    const sourceIndex = progress * (bins.length - 1);
    const left = Math.floor(sourceIndex);
    const right = Math.min(bins.length - 1, left + 1);
    const mix = sourceIndex - left;
    const rawValue = bins[left] * (1 - mix) + bins[right] * mix;
    const value = Math.pow(rawValue, 1.08);
    const edgeFocus = Math.sin(progress * Math.PI);
    const quietEdge = 0.08 + Math.pow(Math.max(0, edgeFocus), 0.82) * 0.92;
    const x = startX + index * (barWidth + gap) + barWidth * 0.5;
    const minDot = Math.max(2.2, style.thickness * 0.34);
    const lineHeight = minDot + value * maxHeight * quietEdge;
    const topY = centerY - lineHeight;

    if (visual.showGlow) {
      ctx.shadowColor = withAlpha(style.colors[0], 0.14 * style.opacity);
      ctx.shadowBlur = 8;
      ctx.strokeStyle = withAlpha(style.colors[0], 0.12 * style.opacity);
      ctx.lineWidth = barWidth + 3.2;
      ctx.beginPath();
      ctx.moveTo(x, centerY);
      ctx.lineTo(x, topY);
      ctx.stroke();
    }

    if (visual.showMain) {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = withAlpha("#020617", 0.38 * style.opacity);
      ctx.lineWidth = barWidth + 1.8;
      ctx.beginPath();
      ctx.moveTo(x, centerY);
      ctx.lineTo(x, topY);
      ctx.stroke();

      ctx.strokeStyle = gradient;
      ctx.lineWidth = barWidth;
      ctx.beginPath();
      ctx.moveTo(x, centerY);
      ctx.lineTo(x, topY);
      ctx.stroke();

      ctx.strokeStyle = withAlpha("#ffffff", 0.28 * style.opacity);
      ctx.lineWidth = Math.max(1, barWidth * 0.24);
      ctx.beginPath();
      ctx.moveTo(x, centerY - 1);
      ctx.lineTo(x, topY + 1);
      ctx.stroke();
    }

    if (visual.showFine && index % 2 === 0) {
      ctx.shadowBlur = 0;
      ctx.fillStyle = withAlpha("#ffffff", 0.38 * style.opacity);
      ctx.beginPath();
      ctx.arc(x, centerY + 8, Math.max(1.3, barWidth * 0.22), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
