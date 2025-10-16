import { lineMargin as margin } from "../theming";
import { Range, SelectionBounds } from "@/types/charts";

const clear = (lineCanvasRef: React.RefObject<HTMLCanvasElement>) => {
  const canvas = lineCanvasRef.current;
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
};

const clearCrosshair = (crosshairCanvasRef: React.RefObject<HTMLCanvasElement>) => {
  const canvas = crosshairCanvasRef.current;
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
};

const drawRectPx = (
  lineCanvasRef: React.RefObject<HTMLCanvasElement>,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) => {
  const canvas = lineCanvasRef.current;
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;
  // clamp to inner plotting area defined by margins
  const innerMinX = margin.left;
  const innerMaxX = canvas.clientWidth - margin.right;
  const innerMinY = margin.top;
  const innerMaxY = canvas.clientHeight - margin.bottom;
  const minX = Math.max(innerMinX, Math.min(x0, x1));
  const maxX = Math.min(innerMaxX, Math.max(x0, x1));
  const minY = Math.max(innerMinY, Math.min(y0, y1));
  const maxY = Math.min(innerMaxY, Math.max(y0, y1));
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

  // Use dashed red style for selection rectangle
  ctx.save();
  ctx.strokeStyle = "#ef4444"; // red-500
  ctx.setLineDash([5, 5]);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(
    minX + 0.5,
    minY + 0.5,
    Math.max(0, maxX - minX - 1),
    Math.max(0, maxY - minY - 1),
  );
  ctx.restore();
};

const drawVerticalLinePx = (
  crosshairCanvasRef: React.RefObject<HTMLCanvasElement>,
  xPx: number,
) => {
  const canvas = crosshairCanvasRef.current;
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  ctx.save();
  ctx.strokeStyle = "#9ca3af"; // gray-400
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;
  const y0 = margin.top;
  const y1 = canvas.clientHeight - margin.bottom;
  ctx.beginPath();
  ctx.moveTo(xPx + 0.5, y0);
  ctx.lineTo(xPx + 0.5, y1);
  ctx.stroke();
  ctx.restore();
};

// Data <-> pixel helpers
const dataXToPx = (
  lineCanvasRef: React.RefObject<HTMLCanvasElement>,
  xRange: Range,
  x: number,
): number => {
  const canvas = lineCanvasRef.current;
  if (!canvas) return 0;
  const innerWidth = Math.max(1, canvas.clientWidth - margin.left - margin.right);
  const xDomainMin = xRange[0];
  const xDomainMax = xRange[1];
  const domainSpan = Math.max(1e-9, xDomainMax - xDomainMin);
  return margin.left + ((x - xDomainMin) / domainSpan) * innerWidth;
};

const dataYToPx = (
  lineCanvasRef: React.RefObject<HTMLCanvasElement>,
  yRange: Range,
  y: number,
): number => {
  const canvas = lineCanvasRef.current;
  if (!canvas) return 0;
  const innerHeight = Math.max(1, canvas.clientHeight - margin.top - margin.bottom);
  const yDomainMin = yRange[0];
  const yDomainMax = yRange[1];
  const domainSpan = Math.max(1e-9, yDomainMax - yDomainMin);
  const t = (y - yDomainMin) / domainSpan;
  return margin.top + (1 - t) * innerHeight;
};

const pxToDataY = (
  lineCanvasRef: React.RefObject<HTMLCanvasElement>,
  yRange: Range,
  py: number,
): number => {
  const canvas = lineCanvasRef.current;
  if (!canvas) return py;
  const innerHeight = Math.max(1, canvas.clientHeight - margin.top - margin.bottom);
  const yDomainMin = yRange[0];
  const yDomainMax = yRange[1];
  const t = 1 - (py - margin.top) / innerHeight;
  return yDomainMin + t * (yDomainMax - yDomainMin);
};

const selectionDataToPx = (
  lineCanvasRef: React.RefObject<HTMLCanvasElement>,
  xRange: Range,
  yRange: Range,
  sel: SelectionBounds,
): { x0: number; y0: number; x1: number; y1: number } => {
  const x0 = dataXToPx(lineCanvasRef, xRange, sel.xMin);
  const x1 = dataXToPx(lineCanvasRef, xRange, sel.xMax);
  const y0 = dataYToPx(lineCanvasRef, yRange, sel.yMin);
  const y1 = dataYToPx(lineCanvasRef, yRange, sel.yMax);
  return { x0, y0, x1, y1 };
};

const drawRectData = (
  lineCanvasRef: React.RefObject<HTMLCanvasElement>,
  sel: SelectionBounds,
  xRange: Range,
  yRange: Range,
) => {
  const { x0, y0, x1, y1 } = selectionDataToPx(lineCanvasRef, xRange, yRange, sel);
  drawRectPx(lineCanvasRef, x0, y0, x1, y1);
};

export {
  clear,
  clearCrosshair,
  drawRectPx,
  drawVerticalLinePx,
  dataXToPx,
  dataYToPx,
  pxToDataY,
  selectionDataToPx,
  drawRectData,
};
