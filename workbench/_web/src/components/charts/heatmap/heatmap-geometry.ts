import { HeatmapRow } from "@/types/charts";
import { heatmapMargin as margin } from "../theming";

export interface CellDimensions {
  width: number;
  height: number;
}

// Calculate cell dimensions based on canvas size and data
const getCellDimensions = (canvasRef: React.RefObject<HTMLCanvasElement>, data: HeatmapRow[]) => {
  if (!canvasRef.current || !data.length || !data[0].data.length) {
    return null;
  }

  const canvas = canvasRef.current;
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;

  const gridWidth = width - margin.left - margin.right;
  const gridHeight = height - margin.top - margin.bottom;

  const numCols = data[0].data.length;
  const numRows = data.length;

  const cellWidth = gridWidth / numCols;
  const cellHeight = gridHeight / numRows;

  return {
    width: cellWidth,
    height: cellHeight,
  };
};

// Convert mouse position to cell indices
const getCellFromPosition = (
  canvasRef: React.RefObject<HTMLCanvasElement>,
  data: HeatmapRow[],
  x: number,
  y: number,
) => {
  const dims = getCellDimensions(canvasRef, data);
  if (!dims) return null;

  // Do not clamp to 0 here; we want to return null when hovering in the margins
  const gridX = x - margin.left;
  const gridY = y - margin.top;

  const gridWidth = dims.width * data[0].data.length;
  const gridHeight = dims.height * data.length;

  if (gridX < 0 || gridY < 0 || gridX >= gridWidth || gridY >= gridHeight) {
    return null;
  }

  const col = Math.floor(gridX / dims.width);
  const row = Math.floor(gridY / dims.height);

  const numCols = data[0].data.length;
  const numRows = data.length;

  if (col >= 0 && col < numCols && row >= 0 && row < numRows) {
    return { col, row };
  }

  return null;
};

export { getCellDimensions, getCellFromPosition };
