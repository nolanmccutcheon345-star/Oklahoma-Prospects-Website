import type { BenchmarkKnot } from "./types";

export function interpolatePercentile(
  value: number,
  knots: readonly BenchmarkKnot[] | BenchmarkKnot[],
  lowerBetter = false,
): number | null {
  if (!knots.length) return null;
  const pts = [...knots].sort((a, b) => a[0] - b[0]);
  const series = pts.map(([p, v]) => [p, lowerBetter ? -v : v] as [number, number]);
  const x = lowerBetter ? -value : value;
  if (x <= series[0][1]) {
    if (series.length < 2 || series[1][1] === series[0][1]) return Math.max(1, series[0][0] - 10);
    const slope = (series[1][0] - series[0][0]) / (series[1][1] - series[0][1]);
    return Math.max(1, series[0][0] + (x - series[0][1]) * slope);
  }
  for (let i = 0; i < series.length - 1; i++) {
    const [p0, v0] = series[i];
    const [p1, v1] = series[i + 1];
    if (x <= v1) {
      if (v1 === v0) return p1;
      return p0 + ((x - v0) / (v1 - v0)) * (p1 - p0);
    }
  }
  const last = series[series.length - 1];
  const prev = series[series.length - 2] ?? last;
  if (last[1] === prev[1]) return Math.min(99, last[0]);
  const slope = (last[0] - prev[0]) / (last[1] - prev[1]);
  return Math.min(99, last[0] + (x - last[1]) * slope);
}

export function grade2080(percentile: number): number {
  const raw = 20 + 0.6 * percentile;
  const stepped = Math.round(raw / 5) * 5;
  return Math.max(20, Math.min(80, stepped));
}

export function gradeLabel(grade: number): string {
  if (grade >= 75) return "Elite";
  if (grade >= 70) return "Plus";
  if (grade >= 55) return "Above";
  if (grade === 50) return "Average";
  if (grade >= 40) return "Fringe";
  if (grade >= 30) return "Below";
  return "Well below";
}
