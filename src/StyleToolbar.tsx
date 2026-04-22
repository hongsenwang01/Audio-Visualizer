import { PALETTES, paletteFor } from "./palettes";
import type { DisplayMode, PaletteId, StyleSettings } from "./types";

type StyleToolbarProps = {
  settings: StyleSettings;
  onChange: (settings: StyleSettings) => void;
  onClose: () => void;
};

export function StyleToolbar({ settings, onChange, onClose }: StyleToolbarProps) {
  const update = (patch: Partial<StyleSettings>) => {
    onChange({ ...settings, ...patch });
  };

  const updateColor = (index: number, color: string) => {
    const colors =
      settings.colorMode === "solid"
        ? ([color, color, color] as [string, string, string])
        : (([...settings.colors] as [string, string, string]).map((currentColor, currentIndex) =>
            currentIndex === index ? color : currentColor,
          ) as [string, string, string]);
    onChange({ ...settings, paletteId: "custom", colors });
  };

  const selectPalette = (paletteId: PaletteId) => {
    const palette = paletteFor(paletteId);
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
          <option value="particles">流光粒子</option>
        </select>
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
