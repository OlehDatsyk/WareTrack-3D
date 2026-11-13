/**
 * Chart palette (validated with the dataviz validator, light surface):
 * slots in fixed order — never cycled. Slots 3–5 are below 3:1 contrast, so charts
 * that use them always carry a legend, tooltip values and a CSV/table export.
 */
export const SERIES = ["#2563eb", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"] as const;

export const CHART = {
  grid: "#eef1f6",
  axis: "#94a3b8",
  text: "#64748b",
  ink: "#172033",
  muted: "#cbd5e1",
  surface: "#ffffff",
  good: "#16a34a",
  bad: "#dc2626",
  warn: "#f59e0b",
};

export const axisTick = { fill: CHART.text, fontSize: 11.5 };
