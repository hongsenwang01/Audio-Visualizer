import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, PhysicalPosition } from "@tauri-apps/api/window";

type AudioFrame = {
  bins: number[];
  peak: number;
  rms: number;
  timestamp: number;
};

type VisualSettings = {
  showGlow: boolean;
  showMain: boolean;
  showFine: boolean;
  smoothing: boolean;
};

type DisplayMode = "wave" | "bars";
type PaletteId = "neon" | "ice" | "citrus" | "sakura" | "mint" | "custom";

type StyleSettings = {
  displayMode: DisplayMode;
  allowDrag: boolean;
  thickness: number;
  opacity: number;
  xScale: number;
  paletteId: PaletteId;
  colors: [string, string, string];
};

type Palette = {
  id: PaletteId;
  name: string;
  colors: [string, string, string];
};

const BIN_COUNT = 96;
const STYLE_STORAGE_KEY = "audio-visualizer-style";
const POSITION_STORAGE_KEY = "audio-visualizer-position";
const DEFAULT_VISUAL_SETTINGS: VisualSettings = {
  showGlow: true,
  showMain: true,
  showFine: false,
  smoothing: true,
};
const PALETTES: Palette[] = [
  { id: "neon", name: "霓虹渐变", colors: ["#56f5d4", "#ffe35c", "#ff6b6b"] },
  { id: "ice", name: "冰蓝", colors: ["#8be9fd", "#38bdf8", "#f8fbff"] },
  { id: "citrus", name: "橙金", colors: ["#ff7a90", "#ffd166", "#ff8a3d"] },
  { id: "sakura", name: "樱粉", colors: ["#ff9ed8", "#ff6f91", "#ffffff"] },
  { id: "mint", name: "青绿", colors: ["#a7fff0", "#45e39d", "#f5fffb"] },
  { id: "custom", name: "自定义", colors: ["#56f5d4", "#ffe35c", "#ff6b6b"] },
];
const DEFAULT_STYLE_SETTINGS: StyleSettings = {
  displayMode: "wave",
  allowDrag: true,
  thickness: 6.5,
  opacity: 1,
  xScale: 1.55,
  paletteId: "neon",
  colors: ["#56f5d4", "#ffe35c", "#ff6b6b"],
};

export function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const targetBinsRef = useRef<number[]>(Array.from({ length: BIN_COUNT }, () => 0));
  const displayBinsRef = useRef<number[]>(Array.from({ length: BIN_COUNT }, () => 0));
  const visualSettingsRef = useRef<VisualSettings>(DEFAULT_VISUAL_SETTINGS);
  const styleSettingsRef = useRef<StyleSettings>(loadStyleSettings());
  const [styleSettings, setStyleSettings] = useState<StyleSettings>(styleSettingsRef.current);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    let fallbackTimer: number | undefined;

    listen<AudioFrame>("audio-frame", (event) => {
      if (!mounted) {
        return;
      }

      targetBinsRef.current = shapeSpectrum(normalizeBins(event.payload.bins));
    }).catch(() => {
      fallbackTimer = window.setInterval(() => {
        targetBinsRef.current = shapeSpectrum(
          normalizeBins(makePreviewBins(performance.now() / 1000)),
        );
      }, 33);
    });

    const visualUnlisten = listen<VisualSettings>("visual-settings", (event) => {
      visualSettingsRef.current = event.payload;
    });
    const openSettingsUnlisten = listen("open-style-settings", () => {
      setSettingsOpen(true);
    });

    return () => {
      mounted = false;
      visualUnlisten.then((unlisten) => unlisten()).catch(() => {});
      openSettingsUnlisten.then((unlisten) => unlisten()).catch(() => {});
      if (fallbackTimer !== undefined) {
        window.clearInterval(fallbackTimer);
      }
    };
  }, []);

  useEffect(() => {
    const appWindow = getCurrentWindow();

    const applySavedPosition = async () => {
      const stored = window.localStorage.getItem(POSITION_STORAGE_KEY);
      if (!stored) {
        return;
      }

      try {
        const parsed = JSON.parse(stored) as Partial<{ x: number; y: number }>;
        if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
          await appWindow.setPosition(new PhysicalPosition(parsed.x!, parsed.y!));
        }
      } catch {
        window.localStorage.removeItem(POSITION_STORAGE_KEY);
      }
    };

    let unlistenMoved: (() => void) | undefined;

    applySavedPosition();
    appWindow
      .onMoved(({ payload }) => {
        window.localStorage.setItem(
          POSITION_STORAGE_KEY,
          JSON.stringify({ x: payload.x, y: payload.y }),
        );
      })
      .then((unlisten) => {
        unlistenMoved = unlisten;
      })
      .catch(() => {});

    return () => {
      unlistenMoved?.();
    };
  }, []);

  useEffect(() => {
    styleSettingsRef.current = styleSettings;
    window.localStorage.setItem(STYLE_STORAGE_KEY, JSON.stringify(styleSettings));
  }, [styleSettings]);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    const shouldIgnoreCursor = !settingsOpen && !styleSettings.allowDrag;
    appWindow.setIgnoreCursorEvents(shouldIgnoreCursor).catch(() => {});
  }, [settingsOpen, styleSettings.allowDrag]);

  useEffect(() => {
    let animationFrame = 0;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        animationFrame = window.requestAnimationFrame(render);
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        animationFrame = window.requestAnimationFrame(render);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const pixelWidth = Math.max(1, Math.floor(rect.width * dpr));
      const pixelHeight = Math.max(1, Math.floor(rect.height * dpr));

      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);

      const targetBins = targetBinsRef.current;
      const displayBins = displayBinsRef.current;
      const smoothing = visualSettingsRef.current.smoothing ? 0.115 : 0.34;

      for (let index = 0; index < displayBins.length; index += 1) {
        const target = noiseGate(targetBins[index] ?? 0);
        const speed = target > displayBins[index] ? smoothing * 1.34 : smoothing * 0.56;
        displayBins[index] += (target - displayBins[index]) * speed;
      }

      const visualSettings = visualSettingsRef.current;
      const currentStyle = styleSettingsRef.current;
      const smoothedBins = spatialSmooth(
        displayBins,
        currentStyle.displayMode === "bars" ? 0.24 : 0.42,
      );

      if (currentStyle.displayMode === "bars") {
        drawBars(ctx, smoothedBins, rect.width, rect.height, visualSettings, currentStyle);
      } else {
        drawWave(ctx, smoothedBins, rect.width, rect.height, visualSettings, currentStyle);
      }

      applyEdgeFade(ctx, rect.width, rect.height);

      animationFrame = window.requestAnimationFrame(render);
    };

    animationFrame = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(animationFrame);
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !styleSettingsRef.current.allowDrag) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest("[data-interactive='true']")) {
      return;
    }

    getCurrentWindow().startDragging().catch(() => {});
  };

  return (
    <main
      className={[
        "app-shell",
        settingsOpen ? "app-shell--with-settings" : "",
        styleSettings.allowDrag ? "" : "app-shell--locked",
      ].join(" ")}
      data-tauri-drag-region
      onPointerDown={handlePointerDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      {settingsOpen && (
        <StyleToolbar
          settings={styleSettings}
          onChange={setStyleSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      <canvas ref={canvasRef} className="spectrum" aria-label="音频频谱波浪" />
    </main>
  );
}

function StyleToolbar({
  settings,
  onChange,
  onClose,
}: {
  settings: StyleSettings;
  onChange: (settings: StyleSettings) => void;
  onClose: () => void;
}) {
  const update = (patch: Partial<StyleSettings>) => {
    onChange({ ...settings, ...patch });
  };

  const updateColor = (index: number, color: string) => {
    const colors = [...settings.colors] as [string, string, string];
    colors[index] = color;
    onChange({ ...settings, paletteId: "custom", colors });
  };

  const selectPalette = (paletteId: PaletteId) => {
    const palette = PALETTES.find((item) => item.id === paletteId) ?? PALETTES[0];
    onChange({
      ...settings,
      paletteId,
      colors: paletteId === "custom" ? settings.colors : palette.colors,
    });
  };

  return (
    <section className="style-toolbar" data-interactive="true">
      <label className="toolbar-field toolbar-field--compact">
        <span>显示</span>
        <select
          value={settings.displayMode}
          onChange={(event) => update({ displayMode: event.target.value as DisplayMode })}
        >
          <option value="wave">波浪条</option>
          <option value="bars">柱状图</option>
        </select>
      </label>

      <label className="toolbar-check">
        <input
          type="checkbox"
          checked={settings.allowDrag}
          onChange={(event) => update({ allowDrag: event.target.checked })}
        />
        <span>允许拖动</span>
      </label>

      <label>
        <span>线条粗细</span>
        <input
          type="range"
          min="2"
          max="12"
          step="0.5"
          value={settings.thickness}
          onChange={(event) => update({ thickness: Number(event.target.value) })}
        />
      </label>

      <label>
        <span>透明度</span>
        <input
          type="range"
          min="0.55"
          max="1"
          step="0.05"
          value={settings.opacity}
          onChange={(event) => update({ opacity: Number(event.target.value) })}
        />
      </label>

      <label>
        <span>X轴长度</span>
        <input
          type="range"
          min="0.7"
          max="2.5"
          step="0.05"
          value={settings.xScale}
          onChange={(event) => update({ xScale: Number(event.target.value) })}
        />
      </label>

      <label>
        <span>颜色预设</span>
        <select
          value={settings.paletteId}
          onChange={(event) => selectPalette(event.target.value as PaletteId)}
        >
          {PALETTES.map((palette) => (
            <option key={palette.id} value={palette.id}>
              {palette.name}
            </option>
          ))}
        </select>
      </label>

      <div className="color-row" aria-label="自定义渐变颜色">
        {settings.colors.map((color, index) => (
          <input
            key={`${index}-${color}`}
            type="color"
            value={color}
            title={`颜色 ${index + 1}`}
            onChange={(event) => updateColor(index, event.target.value)}
          />
        ))}
      </div>

      <button
        className="toolbar-close"
        type="button"
        aria-label="关闭设置"
        title="关闭设置"
        onClick={onClose}
      >
        ×
      </button>
    </section>
  );
}

function drawWave(
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

    ctx.shadowBlur = 0;
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

function drawBars(
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

function applyEdgeFade(ctx: CanvasRenderingContext2D, width: number, height: number) {
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

function loadStyleSettings(): StyleSettings {
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

function paletteFor(paletteId: PaletteId) {
  return PALETTES.find((palette) => palette.id === paletteId) ?? PALETTES[0];
}

function normalizeColors(colors: unknown[]): [string, string, string] {
  return [0, 1, 2].map((index) => {
    const color = colors[index];
    return typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)
      ? color
      : DEFAULT_STYLE_SETTINGS.colors[index];
  }) as [string, string, string];
}

function normalizeBins(bins: number[]) {
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

function shapeSpectrum(bins: number[]) {
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

function spatialSmooth(bins: number[], strength: number) {
  return bins.map((value, index) => {
    const previous = bins[Math.max(0, index - 1)];
    const next = bins[Math.min(bins.length - 1, index + 1)];
    const side = strength * 0.5;
    return previous * side + value * (1 - strength) + next * side;
  });
}

function noiseGate(value: number) {
  if (value < 0.026) {
    return 0;
  }

  return clamp01((value - 0.026) / 0.974);
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function withAlpha(hex: string, alpha: number) {
  const value = hex.replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${clamp01(alpha)})`;
}

function makePreviewBins(tick: number) {
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
