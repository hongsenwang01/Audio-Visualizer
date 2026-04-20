import type { StyleSettings, VisualSettings } from "../types";
import { withAlpha } from "./colors";

export function drawWave(
  ctx: CanvasRenderingContext2D,
  bins: number[],
  width: number,
  height: number,
  visual: VisualSettings,
  style: StyleSettings,
) {
  const centerY = height * 0.5;
  const amplitude = height * 0.43;
  const points = Math.round(176 * style.xScale);
  const gradient = ctx.createLinearGradient(0, centerY, width, centerY);
  gradient.addColorStop(0, withAlpha(style.colors[0], style.opacity));
  gradient.addColorStop(0.58, withAlpha(style.colors[1], style.opacity));
  gradient.addColorStop(1, withAlpha(style.colors[2], style.opacity));

  const getValue = (progress: number) => {
    const sourceIndex = progress * (bins.length - 1);
    const left = Math.floor(sourceIndex);
    const right = Math.min(bins.length - 1, left + 1);
    const mix = sourceIndex - left;
    return bins[left] * (1 - mix) + bins[right] * mix;
  };

  const trace = (offset: number, scale: number) => {
    ctx.beginPath();

    let previousX = 0;
    let previousY = centerY;

    for (let index = 0; index < points; index += 1) {
      const progress = index / Math.max(1, points - 1);
      const x = progress * width;
      const value = Math.pow(getValue(progress), 1.08);
      const phase = progress * Math.PI * (10.6 + style.xScale * 2.2) + offset;
      const edgeFocus = Math.sin(progress * Math.PI);
      const quietEdge = 0.08 + Math.pow(Math.max(0, edgeFocus), 0.86) * 0.92;
      const y = centerY + Math.sin(phase) * value * amplitude * scale * quietEdge;

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        const midX = (previousX + x) * 0.5;
        const midY = (previousY + y) * 0.5;
        ctx.quadraticCurveTo(previousX, previousY, midX, midY);
      }

      previousX = x;
      previousY = y;
    }

    ctx.lineTo(width, previousY);
  };

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (visual.showGlow) {
    ctx.shadowColor = withAlpha(style.colors[0], 0.18 * style.opacity);
    ctx.shadowBlur = 10;
    ctx.strokeStyle = withAlpha(style.colors[0], 0.16 * style.opacity);
    ctx.lineWidth = style.thickness * 2.35;
    trace(0.32, 1.04);
    ctx.stroke();
  }

  if (visual.showMain) {
    ctx.shadowBlur = 0;
    ctx.strokeStyle = withAlpha("#020617", 0.42 * style.opacity);
    ctx.lineWidth = style.thickness + 2.2;
    trace(0, 1);
    ctx.stroke();

    ctx.strokeStyle = gradient;
    ctx.lineWidth = style.thickness;
    trace(0, 1);
    ctx.stroke();

    ctx.strokeStyle = withAlpha("#ffffff", 0.18 * style.opacity);
    ctx.lineWidth = Math.max(1.1, style.thickness * 0.24);
    trace(0, 1);
    ctx.stroke();
  }

  if (visual.showFine) {
    ctx.shadowBlur = 0;
    ctx.strokeStyle = withAlpha("#ffffff", 0.42 * style.opacity);
    ctx.lineWidth = Math.max(1, style.thickness * 0.22);
    trace(1.2, 0.48);
    ctx.stroke();
  }
}
