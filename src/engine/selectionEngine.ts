import { SelectionMask } from '../types/editor';

export function computeSelectionBounds(
  data: Uint8Array,
  width: number,
  height: number
): { x: number; y: number; width: number; height: number } | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (data[row + x] > 127) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export function createRectSelection(
  docWidth: number,
  docHeight: number,
  x: number,
  y: number,
  w: number,
  h: number
): SelectionMask | null {
  const rx = Math.max(0, Math.round(Math.min(x, x + w)));
  const ry = Math.max(0, Math.round(Math.min(y, y + h)));
  const rw = Math.min(docWidth - rx, Math.round(Math.abs(w)));
  const rh = Math.min(docHeight - ry, Math.round(Math.abs(h)));
  if (rw < 2 || rh < 2) return null;

  const data = new Uint8Array(docWidth * docHeight);
  for (let py = ry; py < ry + rh; py++) {
    const row = py * docWidth;
    data.fill(255, row + rx, row + rx + rw);
  }
  return {
    width: docWidth,
    height: docHeight,
    data,
    bounds: { x: rx, y: ry, width: rw, height: rh },
  };
}

export function createEllipseSelection(
  docWidth: number,
  docHeight: number,
  x: number,
  y: number,
  w: number,
  h: number
): SelectionMask | null {
  const rx0 = Math.min(x, x + w);
  const ry0 = Math.min(y, y + h);
  const rw = Math.abs(w);
  const rh = Math.abs(h);
  if (rw < 2 || rh < 2) return null;

  const cx = rx0 + rw / 2;
  const cy = ry0 + rh / 2;
  const radX = rw / 2;
  const radY = rh / 2;

  const minX = Math.max(0, Math.floor(rx0));
  const minY = Math.max(0, Math.floor(ry0));
  const maxX = Math.min(docWidth - 1, Math.ceil(rx0 + rw));
  const maxY = Math.min(docHeight - 1, Math.ceil(ry0 + rh));

  const data = new Uint8Array(docWidth * docHeight);
  for (let py = minY; py <= maxY; py++) {
    const dy = (py - cy) / radY;
    const dy2 = dy * dy;
    const row = py * docWidth;
    for (let px = minX; px <= maxX; px++) {
      const dx = (px - cx) / radX;
      if (dx * dx + dy2 <= 1) {
        data[row + px] = 255;
      }
    }
  }
  return {
    width: docWidth,
    height: docHeight,
    data,
    bounds: computeSelectionBounds(data, docWidth, docHeight),
  };
}

export function createPolygonSelection(
  docWidth: number,
  docHeight: number,
  points: { x: number; y: number }[]
): SelectionMask | null {
  if (points.length < 3) return null;
  const off = document.createElement('canvas');
  off.width = docWidth;
  off.height = docHeight;
  const ctx = off.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
  ctx.fill();

  const img = ctx.getImageData(0, 0, docWidth, docHeight).data;
  const data = new Uint8Array(docWidth * docHeight);
  for (let i = 0; i < data.length; i++) {
    data[i] = img[i * 4 + 3] > 127 ? 255 : 0;
  }
  const bounds = computeSelectionBounds(data, docWidth, docHeight);
  if (!bounds) return null;
  return { width: docWidth, height: docHeight, data, bounds };
}

export function createMagicWandSelection(
  sourceCanvas: HTMLCanvasElement,
  startX: number,
  startY: number,
  tolerance: number,
  contiguous: boolean
): SelectionMask | null {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const sx = Math.round(startX);
  const sy = Math.round(startY);
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) return null;

  const ctx = sourceCanvas.getContext('2d')!;
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const startIdx = (sy * width + sx) * 4;
  const tr = pixels[startIdx];
  const tg = pixels[startIdx + 1];
  const tb = pixels[startIdx + 2];
  const ta = pixels[startIdx + 3];

  const maxDistSq = tolerance * tolerance * 3.2;
  const data = new Uint8Array(width * height);

  const matches = (pIdx: number) => {
    const dr = pixels[pIdx] - tr;
    const dg = pixels[pIdx + 1] - tg;
    const db = pixels[pIdx + 2] - tb;
    const da = pixels[pIdx + 3] - ta;
    return dr * dr + dg * dg + db * db + da * da <= maxDistSq;
  };

  if (!contiguous) {
    for (let i = 0; i < width * height; i++) {
      if (matches(i * 4)) data[i] = 255;
    }
  } else {
    const visited = new Uint8Array(width * height);
    const stack = new Int32Array(width * height);
    let sp = 0;
    const startOffset = sy * width + sx;
    stack[sp++] = startOffset;
    visited[startOffset] = 1;

    while (sp > 0) {
      const pos = stack[--sp];
      data[pos] = 255;
      const x = pos % width;
      const y = (pos - x) / width;

      if (x > 0) {
        const n = pos - 1;
        if (!visited[n] && matches(n * 4)) {
          visited[n] = 1;
          stack[sp++] = n;
        }
      }
      if (x < width - 1) {
        const n = pos + 1;
        if (!visited[n] && matches(n * 4)) {
          visited[n] = 1;
          stack[sp++] = n;
        }
      }
      if (y > 0) {
        const n = pos - width;
        if (!visited[n] && matches(n * 4)) {
          visited[n] = 1;
          stack[sp++] = n;
        }
      }
      if (y < height - 1) {
        const n = pos + width;
        if (!visited[n] && matches(n * 4)) {
          visited[n] = 1;
          stack[sp++] = n;
        }
      }
    }
  }

  const bounds = computeSelectionBounds(data, width, height);
  if (!bounds) return null;
  return { width, height, data, bounds };
}

export function invertSelectionMask(mask: SelectionMask): SelectionMask {
  const data = new Uint8Array(mask.data.length);
  for (let i = 0; i < data.length; i++) {
    data[i] = mask.data[i] > 127 ? 0 : 255;
  }
  return {
    width: mask.width,
    height: mask.height,
    data,
    bounds: computeSelectionBounds(data, mask.width, mask.height),
  };
}

export function createFullSelection(docWidth: number, docHeight: number): SelectionMask {
  const data = new Uint8Array(docWidth * docHeight);
  data.fill(255);
  return {
    width: docWidth,
    height: docHeight,
    data,
    bounds: { x: 0, y: 0, width: docWidth, height: docHeight },
  };
}

/**
 * Deletes pixels inside the selection mask on a raster canvas.
 */
export function deleteSelectedPixels(canvas: HTMLCanvasElement, mask: SelectionMask) {
  const ctx = canvas.getContext('2d')!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const w = Math.min(canvas.width, mask.width);
  const h = Math.min(canvas.height, mask.height);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask.data[y * mask.width + x] > 127) {
        const idx = (y * canvas.width + x) * 4;
        img.data[idx + 3] = 0;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Copies pixels inside the selection mask into a new trimmed canvas.
 */
export function extractSelectionToCanvas(
  sourceCanvas: HTMLCanvasElement,
  mask: SelectionMask | null
): { canvas: HTMLCanvasElement; x: number; y: number } {
  const bounds = mask?.bounds ?? { x: 0, y: 0, width: sourceCanvas.width, height: sourceCanvas.height };
  const out = document.createElement('canvas');
  out.width = bounds.width;
  out.height = bounds.height;
  const oCtx = out.getContext('2d')!;
  const sCtx = sourceCanvas.getContext('2d')!;
  const srcImg = sCtx.getImageData(bounds.x, bounds.y, bounds.width, bounds.height);

  if (mask) {
    for (let py = 0; py < bounds.height; py++) {
      for (let px = 0; px < bounds.width; px++) {
        const mx = bounds.x + px;
        const my = bounds.y + py;
        if (mask.data[my * mask.width + mx] <= 127) {
          srcImg.data[(py * bounds.width + px) * 4 + 3] = 0;
        }
      }
    }
  }
  oCtx.putImageData(srcImg, 0, 0);
  return { canvas: out, x: bounds.x, y: bounds.y };
}

/**
 * Renders animated marching-ants boundary for a SelectionMask on an overlay canvas.
 */
export function renderSelectionOverlay(
  ctx: CanvasRenderingContext2D,
  mask: SelectionMask,
  dashOffset: number
) {
  if (!mask.bounds) return;
  const { width, height, data, bounds } = mask;
  ctx.save();

  // Subtle cyan tint outside selection bounds or inside highlight
  ctx.strokeStyle = '#04111d';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 5]);
  ctx.lineDashOffset = dashOffset;

  const edgePath = new Path2D();
  const minX = bounds.x;
  const minY = bounds.y;
  const maxX = bounds.x + bounds.width - 1;
  const maxY = bounds.y + bounds.height - 1;

  for (let y = minY; y <= maxY; y++) {
    const row = y * width;
    for (let x = minX; x <= maxX; x++) {
      if (data[row + x] <= 127) continue;
      if (y === 0 || data[(y - 1) * width + x] <= 127) {
        edgePath.moveTo(x, y);
        edgePath.lineTo(x + 1, y);
      }
      if (y === height - 1 || data[(y + 1) * width + x] <= 127) {
        edgePath.moveTo(x, y + 1);
        edgePath.lineTo(x + 1, y + 1);
      }
      if (x === 0 || data[row + x - 1] <= 127) {
        edgePath.moveTo(x, y);
        edgePath.lineTo(x, y + 1);
      }
      if (x === width - 1 || data[row + x + 1] <= 127) {
        edgePath.moveTo(x + 1, y);
        edgePath.lineTo(x + 1, y + 1);
      }
    }
  }

  ctx.stroke(edgePath);
  ctx.strokeStyle = '#67e8f9';
  ctx.lineDashOffset = dashOffset + 5;
  ctx.stroke(edgePath);
  ctx.restore();
}
