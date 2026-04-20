import { paletteFor } from "./palettes";
import type { StyleSettings, VisualSettings } from "./types";
import { clamp } from "./visualizers/math";

export const BIN_COUNT = 96;
export const STYLE_STORAGE_KEY = "audio-visualizer-style";
export const POSITION_STORAGE_KEY = "audio-visualizer-position";

export const DEFAULT_VISUAL_SETTINGS: VisualSettings = {
  showGlow: true,
  showMain: true,
  showFine: false,
  smoothing: true,
};

export const DEFAULT_STYLE_SETTINGS: StyleSettings = {
  displayMode: "wave",
  allowDrag: true,
  thickness: 6.5,
  opacity: 1,
  xScale: 1.55,
  paletteId: "neon",
  colors: ["#56f5d4", "#ffe35c", "#ff6b6b"],
};

export function loadStyleSettings(): StyleSettings {
  const stored = window.localStorage.getItem(STYLE_STORAGE_KEY);
  if (!stored) {
    return DEFAULT_STYLE_SETTINGS;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<StyleSettings>;
    const paletteId = parsed.paletteId ?? DEFAULT_STYLE_SETTINGS.paletteId;
    const colors = Array.isArray(parsed.colors)
      ? normalizeColors(parsed.colors)
      : paletteFor(paletteId).colors;

    return {
      displayMode: parsed.displayMode === "bars" ? "bars" : DEFAULT_STYLE_SETTINGS.displayMode,
      allowDrag:
        typeof parsed.allowDrag === "boolean"
          ? parsed.allowDrag
          : DEFAULT_STYLE_SETTINGS.allowDrag,
      thickness: clamp(Number(parsed.thickness ?? DEFAULT_STYLE_SETTINGS.thickness), 2, 12),
      opacity: clamp(Number(parsed.opacity ?? DEFAULT_STYLE_SETTINGS.opacity), 0.55, 1),
      xScale: clamp(Number(parsed.xScale ?? DEFAULT_STYLE_SETTINGS.xScale), 0.7, 2.5),
      paletteId,
      colors,
    };
  } catch {
    return DEFAULT_STYLE_SETTINGS;
  }
}

function normalizeColors(colors: unknown[]): [string, string, string] {
  return [0, 1, 2].map((index) => {
    const color = colors[index];
    return typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)
      ? color
      : DEFAULT_STYLE_SETTINGS.colors[index];
  }) as [string, string, string];
}
