import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, PhysicalPosition } from "@tauri-apps/api/window";
import {
  makePreviewBins,
  noiseGate,
  normalizeBins,
  shapeSpectrum,
  spatialSmooth,
} from "./audioPreview";
import { StyleToolbar } from "./StyleToolbar";
import {
  BIN_COUNT,
  DEFAULT_VISUAL_SETTINGS,
  POSITION_STORAGE_KEY,
  STYLE_STORAGE_KEY,
  loadStyleSettings,
} from "./settings";
import type { AudioFrame, StyleSettings, VisualSettings } from "./types";
import { applyEdgeFade } from "./visualizers/colors";
import { drawBars } from "./visualizers/bars";
import { drawWave } from "./visualizers/wave";

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function App() {
  const tauriRuntime = isTauriRuntime();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const targetBinsRef = useRef<number[]>(Array.from({ length: BIN_COUNT }, () => 0));
  const displayBinsRef = useRef<number[]>(Array.from({ length: BIN_COUNT }, () => 0));
  const visualSettingsRef = useRef<VisualSettings>(DEFAULT_VISUAL_SETTINGS);
  const styleSettingsRef = useRef<StyleSettings>(loadStyleSettings());
  const [styleSettings, setStyleSettings] = useState<StyleSettings>(styleSettingsRef.current);
  const [settingsOpen, setSettingsOpen] = useState(!tauriRuntime);

  useEffect(() => {
    let mounted = true;
    let fallbackTimer: number | undefined;

    const startPreview = () => {
      if (fallbackTimer !== undefined) {
        return;
      }

      fallbackTimer = window.setInterval(() => {
        targetBinsRef.current = shapeSpectrum(
          normalizeBins(makePreviewBins(performance.now() / 1000)),
        );
      }, 33);
    };

    if (!tauriRuntime) {
      startPreview();
    } else {
      listen<AudioFrame>("audio-frame", (event) => {
        if (!mounted) {
          return;
        }

        targetBinsRef.current = shapeSpectrum(normalizeBins(event.payload.bins));
      }).catch(startPreview);

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
    }

    return () => {
      mounted = false;
      if (fallbackTimer !== undefined) {
        window.clearInterval(fallbackTimer);
      }
    };
  }, [tauriRuntime]);

  useEffect(() => {
    if (!tauriRuntime) {
      return;
    }

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
  }, [tauriRuntime]);

  useEffect(() => {
    styleSettingsRef.current = styleSettings;
    window.localStorage.setItem(STYLE_STORAGE_KEY, JSON.stringify(styleSettings));
  }, [styleSettings]);

  useEffect(() => {
    if (!tauriRuntime) {
      return;
    }

    const appWindow = getCurrentWindow();
    const shouldIgnoreCursor = !settingsOpen && !styleSettings.allowDrag;
    appWindow.setIgnoreCursorEvents(shouldIgnoreCursor).catch(() => {});
  }, [settingsOpen, styleSettings.allowDrag, tauriRuntime]);

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
    if (!tauriRuntime || event.button !== 0 || !styleSettingsRef.current.allowDrag) {
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
        tauriRuntime ? "" : "app-shell--debug",
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
