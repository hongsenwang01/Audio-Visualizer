export type AudioFrame = {
  bins: number[];
  peak: number;
  rms: number;
  timestamp: number;
};

export type VisualSettings = {
  showGlow: boolean;
  showMain: boolean;
  showFine: boolean;
  smoothing: boolean;
};

export type DisplayMode = "wave" | "bars" | "particles";
export type PaletteId = "neon" | "ice" | "citrus" | "sakura" | "mint" | "custom";

export type StyleSettings = {
  displayMode: DisplayMode;
  thickness: number;
  opacity: number;
  xScale: number;
  paletteId: PaletteId;
  colors: [string, string, string];
};

export type Palette = {
  id: PaletteId;
  name: string;
  colors: [string, string, string];
};
