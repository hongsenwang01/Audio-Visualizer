import { paletteFor } from "./palettes";
import type { StyleSettings, VisualSettings } from "./types";
import { clamp } from "./visualizers/math";

export const BIN_COUNT = 96;
export const STYLE_STORAGE_KEY = "audio-visualizer-style";
export const EDIT_MODE_STORAGE_KEY = "audio-visualizer-edit-mode";
export const POSITION_STORAGE_KEY = "audio-visualizer-position";
export const DEFAULT_EDIT_ENABLED = true;

export const DEFAULT_VISUAL_SETTINGS: VisualSettings = {
  showGlow: true,
  showMain: true,
  showFine: false,
  smoothing: true,
};

export const DEFAULT_STYLE_SETTINGS: StyleSettings = {
  displayMode: "wave",
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
      displayMode:
        parsed.displayMode === "bars" || parsed.displayMode === "particles"
          ? parsed.displayMode
          : DEFAULT_STYLE_SETTINGS.displayMode,
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

export function loadEditEnabled(): boolean {
  const stored = window.localStorage.getItem(EDIT_MODE_STORAGE_KEY);
  if (stored === "true" || stored === "false") {
    return stored === "true";
  }

  const legacyStyle = window.localStorage.getItem(STYLE_STORAGE_KEY);
  if (!legacyStyle) {
    return DEFAULT_EDIT_ENABLED;
  }

  try {
    const parsed = JSON.parse(legacyStyle) as Partial<{ allowDrag: boolean; allowEdit: boolean }>;
    if (typeof parsed.allowEdit === "boolean") {
      return parsed.allowEdit;
    }
    if (typeof parsed.allowDrag === "boolean") {
      return parsed.allowDrag;
    }
  } catch {
    return DEFAULT_EDIT_ENABLED;
  }

  return DEFAULT_EDIT_ENABLED;
}

function normalizeColors(colors: unknown[]): [string, string, string] {
  return [0, 1, 2].map((index) => {
    const color = colors[index];
    return typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)
      ? color
      : DEFAULT_STYLE_SETTINGS.colors[index];
  }) as [string, string, string];
}
