import { FilterSettings, GradientSettings, SelectionMask } from '../types/editor';
import { clamp, hexToRgb, hexToRgbaString } from '../utils/colorUtils';
import { applySelectionClip } from './brushEngine';

/**
 * Flood-fills contiguous region on a raster canvas using BFS.
 */
export function floodFillCanvas(
  canvas: HTMLCanvasElement,
  startX: number,
  startY: number,
  fillHex: string,
  tolerance: number,
  opacityPercent: number,
  selection: SelectionMask | null
): boolean {
  const width = canvas.width;
  const height = canvas.height;
  const sx = Math.round(startX);
  const sy = Math.round(startY);
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) return false;
  if (selection && selection.data[sy * width + sx] <= 127) return false;

  const ctx = canvas.getContext('2d')!;
  const img = ctx.getImageData(0, 0, width, height);
  const pixels = img.data;
  const startIdx = (sy * width + sx) * 4;
  const tr = pixels[startIdx];
  const tg = pixels[startIdx + 1];
  const tb = pixels[startIdx + 2];
  const ta = pixels[startIdx + 3];

  const { r: fr, g: fg, b: fb } = hexToRgb(fillHex);
  const alpha = clamp(opacityPercent / 100, 0, 1);

  const maxDistSq = tolerance * tolerance * 3.2;
  const visited = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  let sp = 0;

  const startPos = sy * width + sx;
  stack[sp++] = startPos;
  visited[startPos] = 1;

  const matches = (pos: number) => {
    if (selection && selection.data[pos] <= 127) return false;
    const pIdx = pos * 4;
    const dr = pixels[pIdx] - tr;
    const dg = pixels[pIdx + 1] - tg;
    const db = pixels[pIdx + 2] - tb;
    const da = pixels[pIdx + 3] - ta;
    return dr * dr + dg * dg + db * db + da * da <= maxDistSq;
  };

  while (sp > 0) {
    const pos = stack[--sp];
    const pIdx = pos * 4;
    if (alpha >= 0.99) {
      pixels[pIdx] = fr;
      pixels[pIdx + 1] = fg;
      pixels[pIdx + 2] = fb;
      pixels[pIdx + 3] = 255;
    } else {
      const inv = 1 - alpha;
      pixels[pIdx] = Math.round(pixels[pIdx] * inv + fr * alpha);
      pixels[pIdx + 1] = Math.round(pixels[pIdx + 1] * inv + fg * alpha);
      pixels[pIdx + 2] = Math.round(pixels[pIdx + 2] * inv + fb * alpha);
      pixels[pIdx + 3] = clamp(Math.round(pixels[pIdx + 3] + (255 - pixels[pIdx + 3]) * alpha), 0, 255);
    }

    const x = pos % width;
    const y = (pos - x) / width;

    if (x > 0 && !visited[pos - 1] && matches(pos - 1)) {
      visited[pos - 1] = 1;
      stack[sp++] = pos - 1;
    }
    if (x < width - 1 && !visited[pos + 1] && matches(pos + 1)) {
      visited[pos + 1] = 1;
      stack[sp++] = pos + 1;
    }
    if (y > 0 && !visited[pos - width] && matches(pos - width)) {
      visited[pos - width] = 1;
      stack[sp++] = pos - width;
    }
    if (y < height - 1 && !visited[pos + width] && matches(pos + width)) {
      visited[pos + width] = 1;
      stack[sp++] = pos + width;
    }
  }

  ctx.putImageData(img, 0, 0);
  return true;
}

/**
 * Renders a linear or radial gradient onto a raster canvas.
 */
export function applyGradientToCanvas(
  canvas: HTMLCanvasElement,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  fgHex: string,
  bgHex: string,
  settings: GradientSettings,
  selection: SelectionMask | null
) {
  const ctx = canvas.getContext('2d')!;
  const alpha = clamp(settings.opacity / 100, 0, 1);
  const startCol = hexToRgbaString(fgHex, alpha);
  const endCol = settings.mode === 'fg-transparent' ? hexToRgbaString(fgHex, 0) : hexToRgbaString(bgHex, alpha);

  let grad: CanvasGradient;
  if (settings.type === 'radial') {
    const r = Math.max(4, Math.hypot(x1 - x0, y1 - y0));
    grad = ctx.createRadialGradient(x0, y0, 0, x0, y0, r);
  } else {
    grad = ctx.createLinearGradient(x0, y0, x1, y1);
  }
  grad.addColorStop(0, startCol);
  grad.addColorStop(1, endCol);

  ctx.save();
  if (selection) {
    applySelectionClip(ctx, selection);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

/**
 * Applies full FX Filter pipeline cleanly onto target canvas from a pristine source canvas.
 */
export function applyFiltersToCanvas(
  source: HTMLCanvasElement,
  target: HTMLCanvasElement,
  filters: FilterSettings,
  selection: SelectionMask | null
) {
  const w = source.width;
  const h = source.height;
  target.width = w;
  target.height = h;
  const tCtx = target.getContext('2d')!;
  tCtx.clearRect(0, 0, w, h);

  // Step 1: Hardware-accelerated CSS filter pass (blur, hue, saturate, grayscale, sepia, invert, brightness, contrast)
  const temp = document.createElement('canvas');
  temp.width = w;
  temp.height = h;
  const tempCtx = temp.getContext('2d')!;

  const bPct = 100 + filters.brightness + filters.exposure * 0.8;
  const cPct = 100 + filters.contrast;
  const sPct = 100 + filters.saturation;

  tempCtx.filter = [
    `brightness(${clamp(bPct, 10, 300)}%)`,
    `contrast(${clamp(cPct, 10, 300)}%)`,
    `saturate(${clamp(sPct, 0, 300)}%)`,
    `hue-rotate(${filters.hue}deg)`,
    `grayscale(${clamp(filters.grayscale, 0, 100)}%)`,
    `sepia(${clamp(filters.sepia, 0, 100)}%)`,
    filters.invert ? 'invert(100%)' : 'invert(0%)',
    filters.blur > 0 ? `blur(${filters.blur}px)` : '',
  ]
    .filter(Boolean)
    .join(' ');

  tempCtx.drawImage(source, 0, 0);
  tempCtx.filter = 'none';

  // Step 2: Pixel pass for Temperature and Sharpen
  const needsTemp = filters.temperature !== 0;
  const needsSharpen = filters.sharpen > 0;

  if (needsTemp || needsSharpen) {
    const img = tempCtx.getImageData(0, 0, w, h);
    const data = img.data;

    if (needsTemp) {
      const tShift = filters.temperature * 0.65;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 0) continue;
        data[i] = clamp(data[i] + tShift, 0, 255);
        data[i + 2] = clamp(data[i + 2] - tShift, 0, 255);
      }
    }

    if (needsSharpen) {
      const amount = (filters.sharpen / 100) * 1.3;
      const copy = new Uint8ClampedArray(data);
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const idx = (y * w + x) * 4;
          if (copy[idx + 3] === 0) continue;
          const up = ((y - 1) * w + x) * 4;
          const dn = ((y + 1) * w + x) * 4;
          const lt = (y * w + (x - 1)) * 4;
          const rt = (y * w + (x + 1)) * 4;
          for (let c = 0; c < 3; c++) {
            const avg = (copy[up + c] + copy[dn + c] + copy[lt + c] + copy[rt + c]) * 0.25;
            data[idx + c] = clamp(copy[idx + c] + (copy[idx + c] - avg) * amount, 0, 255);
          }
        }
      }
    }
    tempCtx.putImageData(img, 0, 0);
  }

  if (selection && selection.bounds) {
    tCtx.drawImage(source, 0, 0);
    tCtx.save();
    applySelectionClip(tCtx, selection);
    tCtx.clearRect(0, 0, w, h);
    tCtx.drawImage(temp, 0, 0);
    tCtx.restore();
  } else {
    tCtx.drawImage(temp, 0, 0);
  }
}
