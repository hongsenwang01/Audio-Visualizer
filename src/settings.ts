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

const MIN_X_SCALE = 0.7;
const MAX_X_SCALE = 2.5;
const MIN_X_AXIS_LENGTH = 20;
const MAX_X_AXIS_LENGTH = 100;
const MIN_BAR_WIDTH = 2;
const MAX_BAR_WIDTH = 24;

export const DEFAULT_STYLE_SETTINGS: StyleSettings = {
  displayMode: "wave",
  thickness: 6.5,
  opacity: 1,
  xScale: 1.55,
  colorMode: "gradient",
  xAxisLength: 58,
  barWidth: 6.5,
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
    const barWidth = clamp(
      Number(parsed.barWidth ?? parsed.thickness ?? DEFAULT_STYLE_SETTINGS.barWidth),
      MIN_BAR_WIDTH,
      MAX_BAR_WIDTH,
    );
    const xAxisLength = clamp(
      Number(
        parsed.xAxisLength ??
          xScaleToXAxisLength(Number(parsed.xScale ?? DEFAULT_STYLE_SETTINGS.xScale)),
      ),
      MIN_X_AXIS_LENGTH,
      MAX_X_AXIS_LENGTH,
    );
    const xScale = clamp(
      Number(parsed.xScale ?? xAxisLengthToXScale(xAxisLength)),
      MIN_X_SCALE,
      MAX_X_SCALE,
    );

    return {
      displayMode:
        parsed.displayMode === "bars" || parsed.displayMode === "particles"
          ? parsed.displayMode
          : DEFAULT_STYLE_SETTINGS.displayMode,
      thickness: barWidth,
      opacity: clamp(Number(parsed.opacity ?? DEFAULT_STYLE_SETTINGS.opacity), 0.55, 1),
      xScale,
      colorMode: normalizeColorMode(parsed.colorMode, paletteId, colors),
      xAxisLength,
      barWidth,
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

function normalizeColorMode(
  colorMode: unknown,
  paletteId: StyleSettings["paletteId"],
  colors: StyleSettings["colors"],
): StyleSettings["colorMode"] {
  if (colorMode === "solid" || colorMode === "gradient") {
    return colorMode;
  }

  if (paletteId !== "custom") {
    return "gradient";
  }

  return colors[0] === colors[1] && colors[1] === colors[2] ? "solid" : "gradient";
}

export function xScaleToXAxisLength(xScale: number) {
  const normalized = (clamp(xScale, MIN_X_SCALE, MAX_X_SCALE) - MIN_X_SCALE) /
    (MAX_X_SCALE - MIN_X_SCALE);
  return clamp(
    MIN_X_AXIS_LENGTH + normalized * (MAX_X_AXIS_LENGTH - MIN_X_AXIS_LENGTH),
    MIN_X_AXIS_LENGTH,
    MAX_X_AXIS_LENGTH,
  );
}

export function xAxisLengthToXScale(xAxisLength: number) {
  const normalized =
    (clamp(xAxisLength, MIN_X_AXIS_LENGTH, MAX_X_AXIS_LENGTH) - MIN_X_AXIS_LENGTH) /
    (MAX_X_AXIS_LENGTH - MIN_X_AXIS_LENGTH);
  return clamp(MIN_X_SCALE + normalized * (MAX_X_SCALE - MIN_X_SCALE), MIN_X_SCALE, MAX_X_SCALE);
}
