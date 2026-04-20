import type { StyleSettings, VisualSettings } from "../types";
import { withAlpha } from "./colors";
import { clamp } from "./math";

function sampleBins(bins: number[], progress: number) {
  const sourceIndex = progress * (bins.length - 1);
  const left = Math.floor(sourceIndex);
  const right = Math.min(bins.length - 1, left + 1);
  const mix = sourceIndex - left;
  return bins[left] * (1 - mix) + bins[right] * mix;
}

function particleNoise(index: number, salt: number) {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

export function drawParticles(
  ctx: CanvasRenderingContext2D,
  bins: number[],
  width: number,
  height: number,
  visual: VisualSettings,
  style: StyleSettings,
) {
  const centerY = height * 0.52;
  const maxDrift = height * 0.36;
  const time = performance.now() * 0.001;
  const particleCount = Math.max(54, Math.round(104 * style.xScale));
  const particleSize = clamp(style.thickness * 0.45, 2, 5.8);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (let index = 0; index < particleCount; index += 1) {
    const progress = index / Math.max(1, particleCount - 1);
    const rawValue = sampleBins(bins, progress);
    const value = Math.pow(rawValue, 1.12);
    const edgeFocus = Math.sin(progress * Math.PI);
    const quietEdge = 0.08 + Math.pow(Math.max(0, edgeFocus), 0.88) * 0.92;
    const shimmer = Math.sin(time * 3.1 + index * 0.63) * 0.5 + 0.5;
    const side = particleNoise(index, 1) > 0.5 ? 1 : -1;
    const jitter = (particleNoise(index, 2) - 0.5) * maxDrift * 0.12;
    const x = progress * width + Math.sin(time * 0.9 + index * 0.37) * 2.4 * quietEdge;
    const y =
      centerY +
      side * (value * maxDrift * quietEdge * (0.32 + particleNoise(index, 3) * 0.68)) +
      jitter * value;
    const radius = particleSize * (0.5 + value * 0.82 + shimmer * 0.18);
    const alpha = (0.24 + value * 0.68 + shimmer * 0.12) * style.opacity * quietEdge;
    const color = style.colors[index % style.colors.length];

    if (visual.showGlow) {
      ctx.save();
      ctx.shadowColor = withAlpha(color, 0.28 * alpha);
      ctx.shadowBlur = 10 + value * 10;
      ctx.fillStyle = withAlpha(color, 0.2 * alpha);
      ctx.beginPath();
      ctx.arc(x, y, radius * 1.75, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (visual.showMain) {
      ctx.save();
      ctx.fillStyle = withAlpha(color, alpha);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = withAlpha("#ffffff", 0.32 * alpha);
      ctx.beginPath();
      ctx.arc(x - radius * 0.18, y - radius * 0.18, Math.max(0.8, radius * 0.32), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (visual.showFine && index % 3 === 0) {
      const tail = clamp(5 + value * style.thickness * 2.8, 5, 26);
      ctx.save();
      ctx.strokeStyle = withAlpha(color, 0.28 * alpha);
      ctx.lineWidth = Math.max(1, radius * 0.42);
      ctx.beginPath();
      ctx.moveTo(x - tail * 0.55, y);
      ctx.lineTo(x + tail * 0.45, y + side * radius * 0.18);
      ctx.stroke();
      ctx.restore();
    }
  }
}
