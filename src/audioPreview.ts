import { BIN_COUNT } from "./settings";
import { clamp01 } from "./visualizers/math";

export function normalizeBins(bins: number[]) {
  if (bins.length === BIN_COUNT) {
    return bins.map((value) => clamp01(value));
  }

  return Array.from({ length: BIN_COUNT }, (_, index) => {
    const sourceIndex = (index / (BIN_COUNT - 1)) * (bins.length - 1);
    const left = Math.floor(sourceIndex);
    const right = Math.min(bins.length - 1, left + 1);
    const mix = sourceIndex - left;
    return clamp01((bins[left] ?? 0) * (1 - mix) + (bins[right] ?? 0) * mix);
  });
}

export function shapeSpectrum(bins: number[]) {
  const sorted = [...bins].sort((a, b) => a - b);
  const low = sorted[Math.floor(sorted.length * 0.34)] ?? 0;
  const high = sorted[Math.floor(sorted.length * 0.94)] ?? 0;
  const range = Math.max(0.001, high - low);

  return bins.map((value, index) => {
    const position = index / Math.max(1, bins.length - 1);
    const centerWeight = Math.pow(Math.max(0, Math.sin(position * Math.PI)), 0.76);
    const edgeAllowance = 0.08 + centerWeight * 0.92;
    const lifted = clamp01((value - low) / range);
    const contrast = Math.pow(lifted, 1.65);
    const localPeak = Math.max(
      bins[Math.max(0, index - 1)] ?? 0,
      value,
      bins[Math.min(bins.length - 1, index + 1)] ?? 0,
    );
    const peakAccent = Math.max(0, localPeak - low) / Math.max(0.001, range);

    return clamp01((contrast * 0.82 + peakAccent * 0.18) * edgeAllowance + value * 0.08);
  });
}

export function spatialSmooth(bins: number[], strength: number) {
  return bins.map((value, index) => {
    const previous = bins[Math.max(0, index - 1)];
    const next = bins[Math.min(bins.length - 1, index + 1)];
    const side = strength * 0.5;
    return previous * side + value * (1 - strength) + next * side;
  });
}

export function noiseGate(value: number) {
  if (value < 0.026) {
    return 0;
  }

  return clamp01((value - 0.026) / 0.974);
}

export function makePreviewBins(tick: number) {
  return Array.from({ length: BIN_COUNT }, (_, index) => {
    const position = index / BIN_COUNT;
    const center = Math.sin(position * Math.PI);
    const bass =
      Math.exp(-Math.pow((position - 0.28) / 0.055, 2)) * (0.54 + Math.sin(tick * 2.8) * 0.2);
    const vocal =
      Math.exp(-Math.pow((position - 0.46) / 0.09, 2)) * (0.38 + Math.cos(tick * 1.9) * 0.14);
    const hi =
      Math.exp(-Math.pow((position - 0.68) / 0.06, 2)) * (0.28 + Math.sin(tick * 3.7) * 0.12);
    const texture = (Math.sin(tick * 4.2 + position * Math.PI * 38) + 1) * 0.035;
    return clamp01((bass + vocal + hi + texture) * (0.12 + center * 0.88));
  });
}
