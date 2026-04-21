import React, { useEffect, useRef, useState } from "react";
import {
  Activity,
  BarChart3,
  Droplet,
  MoveHorizontal,
  Settings,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { xAxisLengthToXScale, xScaleToXAxisLength } from "./settings";
import type { StyleSettings } from "./types";

const PETAL_COLORS = [
  { hex: "#FF2D55", r: 40, a: -90 },
  { hex: "#FF375F", r: 40, a: -60 },
  { hex: "#AF52DE", r: 40, a: -30 },
  { hex: "#5856D6", r: 40, a: 0 },
  { hex: "#007AFF", r: 40, a: 30 },
  { hex: "#30B0C7", r: 40, a: 60 },
  { hex: "#00C7BE", r: 40, a: 90 },
  { hex: "#34C759", r: 40, a: 120 },
  { hex: "#A4E810", r: 40, a: 150 },
  { hex: "#FFCC00", r: 40, a: 180 },
  { hex: "#FF9500", r: 40, a: 210 },
  { hex: "#FF3B30", r: 40, a: 240 },
  { hex: "#FF99CC", r: 20, a: -90 },
  { hex: "#CC99FF", r: 20, a: -30 },
  { hex: "#99CCFF", r: 20, a: 30 },
  { hex: "#99FFCC", r: 20, a: 90 },
  { hex: "#FFFF99", r: 20, a: 150 },
  { hex: "#FFCC99", r: 20, a: 210 },
  { hex: "#FFFFFF", r: 0, a: 0 },
] as const;

type NavigationBarUiProps = {
  settings: StyleSettings;
  onSettingsChange: (settings: StyleSettings) => void;
};

type ChartType = "bar" | "wave" | "particle";

const DOCK_BOTTOM = 18;

const sliderThumbClasses =
  "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-transparent [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:bg-transparent [&::-moz-range-thumb]:border-0";

const getSliderFillStyle = (value: number, min: number, max: number) => {
  const percentage = ((value - min) / (max - min)) * 100;
  return {
    background: `linear-gradient(to right, #ffffff 0%, #ffffff ${percentage}%, rgba(255, 255, 255, 0.1) ${percentage}%, rgba(255, 255, 255, 0.1) 100%)`,
  };
};

function displayModeToChartType(displayMode: StyleSettings["displayMode"]): ChartType {
  if (displayMode === "bars") {
    return "bar";
  }

  if (displayMode === "particles") {
    return "particle";
  }

  return "wave";
}

function chartTypeToDisplayMode(chartType: ChartType): StyleSettings["displayMode"] {
  if (chartType === "bar") {
    return "bars";
  }

  if (chartType === "particle") {
    return "particles";
  }

  return "wave";
}

export default function NavigationBarUi({
  settings,
  onSettingsChange,
}: NavigationBarUiProps) {
  const [isHoveringArea, setIsHoveringArea] = useState(false);
  const [isDockOpen, setIsDockOpen] = useState(false);
  const [isSelectorHovered, setIsSelectorHovered] = useState(false);
  const [openWheelIndex, setOpenWheelIndex] = useState<number | null>(null);
  const [hoveredColorHex, setHoveredColorHex] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const chartType = displayModeToChartType(settings.displayMode);
  const colorMode = settings.colorMode;
  const colors = settings.colors;
  const xAxisLength = settings.xAxisLength ?? Math.round(xScaleToXAxisLength(settings.xScale));
  const barWidth = settings.barWidth ?? settings.thickness;

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
      }
    };

    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  const updateSettings = (patch: Partial<StyleSettings>) => {
    onSettingsChange({ ...settings, ...patch });
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) {
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    setMousePos({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  };

  const handleChartTypeChange = (nextChartType: ChartType) => {
    updateSettings({ displayMode: chartTypeToDisplayMode(nextChartType) });
  };

  const handleXAxisLengthChange = (value: number) => {
    updateSettings({
      xAxisLength: value,
      xScale: xAxisLengthToXScale(value),
    });
  };

  const handleBarWidthChange = (value: number) => {
    updateSettings({
      barWidth: value,
      thickness: value,
    });
  };

  const handleColorModeChange = (mode: StyleSettings["colorMode"]) => {
    updateSettings({ colorMode: mode });
    setOpenWheelIndex(null);
  };

  const handleColorChange = (index: number, color: string) => {
    const nextColors = [...colors] as [string, string, string];
    nextColors[index] = color;
    updateSettings({
      colors: nextColors,
      paletteId: "custom",
    });
    setOpenWheelIndex(null);
    setHoveredColorHex(null);
  };

  return (
    <div
      ref={containerRef}
      className="relative z-10 w-full max-w-4xl h-full flex flex-col items-center group overflow-visible"
      data-interactive="true"
      onMouseEnter={() => setIsHoveringArea(true)}
      onMouseLeave={() => {
        setIsHoveringArea(false);
        setIsSelectorHovered(false);
        setOpenWheelIndex(null);
        setHoveredColorHex(null);
      }}
      onMouseMove={handleMouseMove}
    >
        {isHoveringArea && !isDockOpen && containerSize.width > 0 && (
          <svg
            className="absolute z-0"
            style={{ top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }}
          >
            <polygon
              points={`${containerSize.width / 2 - 70},${containerSize.height - 74} ${containerSize.width / 2 + 70},${containerSize.height - 74} ${mousePos.x},${Math.max(22, Math.min(containerSize.height - 16, mousePos.y))}`}
              fill="rgba(239, 68, 68, 0.15)"
              stroke="rgba(239, 68, 68, 0.6)"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              className="transition-opacity duration-300"
            />
          </svg>
        )}

        <div
          className={`absolute left-1/2 -translate-x-1/2 flex items-center justify-center z-20 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] group/dock
            ${!isHoveringArea && !isDockOpen ? "opacity-0 -translate-y-4 pointer-events-none" : "opacity-100 translate-y-0 pointer-events-auto"}
            ${isDockOpen ? "w-full max-w-4xl h-[64px] px-6" : "w-[140px] h-[44px] cursor-pointer"}
          `}
          style={{ bottom: `${DOCK_BOTTOM}px` }}
          onClick={() => {
            if (!isDockOpen) {
              setIsDockOpen(true);
            }
          }}
        >
          <div
            className={`absolute inset-0 rounded-full backdrop-blur-2xl bg-black/60 border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] transition-all duration-500 z-[-1]
            ${!isDockOpen ? "group-hover/dock:bg-black/80 group-hover/dock:border-white/30" : ""}
          `}
          />

          <div
            className={`absolute inset-0 flex items-center justify-center gap-2 text-white transition-opacity duration-300 ${isDockOpen ? "opacity-0 pointer-events-none" : "opacity-100"}`}
          >
            <Settings size={16} className="animate-spin-slow" style={{ animationDuration: "3s" }} />
            <span className="font-medium text-sm tracking-wide">编辑样式</span>
          </div>

          <div
            className={`w-full h-full flex items-center justify-between text-white transition-opacity duration-300 delay-200 ${isDockOpen ? "opacity-100" : "opacity-0 pointer-events-none hidden"}`}
          >
            <div className="flex items-center gap-6 flex-1">
              <div
                className="relative h-[44px] rounded-full transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] overflow-hidden shrink-0"
                style={{
                  width: isSelectorHovered ? "132px" : "44px",
                  backgroundColor: isSelectorHovered ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.05)",
                  border: isSelectorHovered
                    ? "1px solid rgba(255,255,255,0.2)"
                    : "1px solid rgba(255,255,255,0.1)",
                }}
                onMouseEnter={() => setIsSelectorHovered(true)}
                onMouseLeave={() => setIsSelectorHovered(false)}
              >
                {[
                  { id: "bar", icon: BarChart3, label: "柱状图" },
                  { id: "wave", icon: Activity, label: "波形图" },
                  { id: "particle", icon: Sparkles, label: "粒子流光" },
                ].map((type, _, arr) => {
                  const isSelected = chartType === type.id;
                  let visualIndex = 0;

                  if (!isSelected) {
                    visualIndex =
                      arr.filter((item) => item.id !== chartType).findIndex((item) => item.id === type.id) + 1;
                  }

                  return (
                    <button
                      key={type.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleChartTypeChange(type.id as ChartType);
                      }}
                      title={type.label}
                      className={`absolute flex items-center justify-center w-9 h-9 rounded-full transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]
                        ${isSelected ? "bg-white/20 text-white shadow-[0_2px_10px_rgba(0,0,0,0.3)] z-10" : "bg-transparent text-gray-400 hover:text-white hover:bg-white/10 z-0"}
                      `}
                      style={{
                        top: "50%",
                        left: isSelectorHovered ? `calc(4px + ${visualIndex * 40}px)` : "3px",
                        opacity: isSelected || isSelectorHovered ? 1 : 0,
                        transform: `translateY(-50%) ${isSelected || isSelectorHovered ? "scale(1)" : "scale(0.5)"}`,
                        pointerEvents: isSelected || isSelectorHovered ? "auto" : "none",
                      }}
                    >
                      <type.icon size={18} />
                    </button>
                  );
                })}
              </div>

              <div className="w-[1px] h-6 bg-white/10 shrink-0" />

              <div
                className={`flex items-center flex-1 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isSelectorHovered ? "gap-3" : "gap-8"}`}
              >
                <div className="flex items-center group flex-1" title={`X轴范围: ${xAxisLength}%`}>
                  <MoveHorizontal
                    size={18}
                    className="text-gray-400 group-hover:text-white transition-colors shrink-0"
                  />
                  <div
                    className={`overflow-hidden flex items-center transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isSelectorHovered ? "max-w-0 opacity-0" : "max-w-[500px] w-full opacity-100"}`}
                  >
                    <input
                      type="range"
                      min="20"
                      max="100"
                      value={xAxisLength}
                      onChange={(event) => handleXAxisLengthChange(Number(event.target.value))}
                      onClick={(event) => event.stopPropagation()}
                      className={`w-full ml-4 h-1.5 rounded-full appearance-none cursor-pointer m-0 transition-opacity opacity-80 hover:opacity-100 ${sliderThumbClasses}`}
                      style={getSliderFillStyle(xAxisLength, 20, 100)}
                    />
                  </div>
                </div>

                <div className="flex items-center group flex-1" title={`元素粗细: ${barWidth}px`}>
                  <SlidersHorizontal
                    size={18}
                    className="text-gray-400 group-hover:text-white transition-colors shrink-0"
                  />
                  <div
                    className={`overflow-hidden flex items-center transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isSelectorHovered ? "max-w-0 opacity-0" : "max-w-[500px] w-full opacity-100"}`}
                  >
                    <input
                      type="range"
                      min="2"
                      max="24"
                      value={barWidth}
                      onChange={(event) => handleBarWidthChange(Number(event.target.value))}
                      onClick={(event) => event.stopPropagation()}
                      className={`w-full ml-4 h-1.5 rounded-full appearance-none cursor-pointer m-0 transition-opacity opacity-80 hover:opacity-100 ${sliderThumbClasses}`}
                      style={getSliderFillStyle(barWidth, 2, 24)}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-6 shrink-0 pl-6">
              <div className="w-[1px] h-6 bg-white/10" />

              <div className="flex items-center gap-4">
                <div className="flex items-center bg-black/40 rounded-full p-1 border border-white/10 shadow-inner">
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      handleColorModeChange("solid");
                    }}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition-all duration-300 ease-out focus:outline-none
                      ${colorMode === "solid" ? "bg-white/20 text-white shadow-[0_2px_8px_rgba(0,0,0,0.5)]" : "text-gray-400 hover:text-white"}
                    `}
                  >
                    单色
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      handleColorModeChange("gradient");
                    }}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition-all duration-300 ease-out focus:outline-none
                      ${colorMode === "gradient" ? "bg-white/20 text-white shadow-[0_2px_8px_rgba(0,0,0,0.5)]" : "text-gray-400 hover:text-white"}
                    `}
                  >
                    渐变
                  </button>
                </div>

                <div className="flex items-center">
                  {[0, 1, 2].map((index) => {
                    const isColorWheelOpen = openWheelIndex === index;
                    const selectedHex = colors[index];
                    const isActive = colorMode === "gradient" || index === 0;

                    return (
                      <div
                        key={index}
                        className={`relative flex items-center justify-center transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]
                          ${isActive ? "w-11 opacity-100 scale-100" : "w-0 opacity-0 scale-50 pointer-events-none"}
                          ${index > 0 && isActive ? "ml-2" : "ml-0"}
                        `}
                        onMouseLeave={() => {
                          if (isColorWheelOpen) {
                            setOpenWheelIndex(null);
                            setHoveredColorHex(null);
                          }
                        }}
                      >
                        <div className="relative flex items-center justify-center w-11 h-11 shrink-0">
                          {isColorWheelOpen && (
                            <div className="absolute bottom-1/2 left-1/2 -translate-x-1/2 w-[220px] h-[220px] z-20 bg-transparent" />
                          )}

                          <div
                            className={`absolute bottom-[105%] left-1/2 -translate-x-1/2 w-[140px] h-[140px] transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] origin-bottom z-30
                              ${isColorWheelOpen ? "scale-100 opacity-100 pointer-events-auto" : "scale-50 opacity-0 pointer-events-none"}
                            `}
                          >
                            <div
                              className="absolute inset-[-6px] rounded-full opacity-75 blur-[14px] z-0"
                              style={{
                                background: `conic-gradient(from 0deg, ${PETAL_COLORS.slice(0, 12)
                                  .map((petal) => petal.hex)
                                  .join(", ")}, ${PETAL_COLORS[0].hex})`,
                              }}
                            />

                            <div className="absolute inset-[2px] rounded-full bg-slate-900 border border-white/10 shadow-[inset_0_4px_12px_rgba(0,0,0,0.8)] z-10" />

                            <div className="absolute top-1/2 left-1/2 z-20">
                              {PETAL_COLORS.map((petal) => {
                                const rad = (petal.a * Math.PI) / 180;
                                let x = Math.cos(rad) * petal.r;
                                let y = Math.sin(rad) * petal.r;
                                const isSelected = selectedHex === petal.hex;

                                if (hoveredColorHex && hoveredColorHex !== petal.hex) {
                                  const hoveredPetal = PETAL_COLORS.find((item) => item.hex === hoveredColorHex);
                                  if (hoveredPetal) {
                                    const hoveredRad = (hoveredPetal.a * Math.PI) / 180;
                                    const hoveredX = Math.cos(hoveredRad) * hoveredPetal.r;
                                    const hoveredY = Math.sin(hoveredRad) * hoveredPetal.r;
                                    const dx = x - hoveredX;
                                    const dy = y - hoveredY;
                                    const dist = Math.sqrt(dx * dx + dy * dy);
                                    const threshold = 42;

                                    if (dist > 0 && dist < threshold) {
                                      const pushStrength = (threshold - dist) * 0.45;
                                      x += (dx / dist) * pushStrength;
                                      y += (dy / dist) * pushStrength;
                                    }
                                  }
                                }

                                return (
                                  <div
                                    key={petal.hex}
                                    className="absolute w-0 h-0 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
                                    style={{ transform: `translate(${x}px, ${y}px)` }}
                                  >
                                    <button
                                      onMouseEnter={() => setHoveredColorHex(petal.hex)}
                                      onMouseLeave={() => setHoveredColorHex(null)}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        handleColorChange(index, petal.hex);
                                      }}
                                      className={`absolute -ml-[18px] -mt-[18px] w-9 h-9 rounded-full transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] focus:outline-none 
                                        hover:scale-125 hover:border-[1.5px] hover:border-white hover:shadow-[0_0_20px_rgba(255,255,255,0.8)]
                                        ${isSelected ? "scale-110 border-[1.5px] border-white" : "scale-100 border-[0.5px] border-white/40"}
                                      `}
                                      style={{
                                        backgroundColor: petal.hex,
                                        boxShadow: isSelected
                                          ? `inset 0 4px 6px rgba(255,255,255,0.6), inset 0 -4px 6px rgba(0,0,0,0.1), 0 0 20px ${petal.hex}AA`
                                          : "0 4px 6px rgba(0,0,0,0.3), inset 0 3px 6px rgba(255,255,255,0.7), inset 0 -2px 4px rgba(0,0,0,0.1)",
                                      }}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              setOpenWheelIndex(isColorWheelOpen ? null : index);
                            }}
                            className={`relative z-30 w-11 h-11 rounded-full flex items-center justify-center border transition-all duration-300 overflow-hidden shrink-0
                              ${isColorWheelOpen ? "border-white/30 bg-black/60 shadow-[0_0_20px_rgba(255,255,255,0.15)] scale-110" : "border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20"}
                            `}
                          >
                            <div
                              className={`absolute inset-0 rounded-full opacity-70 blur-md transition-all duration-500 ease-out pointer-events-none
                                ${isColorWheelOpen ? "scale-[1.8] opacity-100" : "scale-100"}
                              `}
                              style={{ backgroundColor: selectedHex }}
                            />
                            <Droplet
                              size={18}
                              strokeWidth={2.5}
                              className={`relative z-40 text-white transition-all duration-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]
                                ${isColorWheelOpen ? "scale-90 opacity-100" : "scale-100 opacity-90"}
                              `}
                              fill={selectedHex}
                            />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={(event) => {
                  event.stopPropagation();
                  setIsDockOpen(false);
                  setOpenWheelIndex(null);
                  setHoveredColorHex(null);
                }}
                className="p-2 rounded-full bg-transparent hover:bg-white/10 transition-colors text-gray-400 hover:text-white shrink-0"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        </div>
    </div>
  );
}
