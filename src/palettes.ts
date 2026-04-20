import type { Palette, PaletteId } from "./types";

export const PALETTES: Palette[] = [
  { id: "neon", name: "霓虹渐变", colors: ["#56f5d4", "#ffe35c", "#ff6b6b"] },
  { id: "ice", name: "冰蓝", colors: ["#8be9fd", "#38bdf8", "#f8fbff"] },
  { id: "citrus", name: "橙金", colors: ["#ff7a90", "#ffd166", "#ff8a3d"] },
  { id: "sakura", name: "樱粉", colors: ["#ff9ed8", "#ff6f91", "#ffffff"] },
  { id: "mint", name: "青绿", colors: ["#a7fff0", "#45e39d", "#f5fffb"] },
  { id: "custom", name: "自定义", colors: ["#56f5d4", "#ffe35c", "#ff6b6b"] },
];

export function paletteFor(paletteId: PaletteId) {
  return PALETTES.find((palette) => palette.id === paletteId) ?? PALETTES[0];
}
