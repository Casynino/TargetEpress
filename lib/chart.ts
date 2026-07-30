/**
 * Chart geometry helpers.
 *
 * Charts here are hand-drawn SVG rather than a charting library. The dashboard
 * needs four shapes (area, bar, ring, sparkline); a library would ship far more
 * JavaScript than that is worth, and these render on the server.
 */

export type Point = { x: number; y: number };

/** Maps values into an SVG box, with padding so strokes are not clipped. */
export function scalePoints(
  values: number[],
  width: number,
  height: number,
  { padding = 2, min, max }: { padding?: number; min?: number; max?: number } = {}
): Point[] {
  if (values.length === 0) return [];

  const lo = min ?? Math.min(...values, 0);
  const hi = max ?? Math.max(...values, 1);
  const span = hi - lo || 1;
  const usable = height - padding * 2;
  const step = values.length > 1 ? width / (values.length - 1) : 0;

  return values.map((value, i) => ({
    x: values.length > 1 ? i * step : width / 2,
    y: padding + usable - ((value - lo) / span) * usable,
  }));
}

/**
 * Monotone cubic path — smooths the line without inventing peaks that are not
 * in the data, which a naive cardinal spline will happily do. In a business
 * chart that matters: an overshoot reads as a number nobody reported.
 */
export function smoothPath(points: Point[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const midX = (p0.x + p1.x) / 2;
    d += ` C ${midX} ${p0.y}, ${midX} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return d;
}

/** Closes a line path down to the baseline so it can be filled. */
export function areaPath(points: Point[], height: number): string {
  if (points.length === 0) return "";
  const line = smoothPath(points);
  const first = points[0];
  const last = points[points.length - 1];
  return `${line} L ${last.x} ${height} L ${first.x} ${height} Z`;
}

/** Circumference maths for ring/donut progress. */
export function ringGeometry(size: number, stroke: number) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return { radius, circumference, center: size / 2 };
}

export function clampPct(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}
