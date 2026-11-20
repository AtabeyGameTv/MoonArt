import { BrushSettings, SelectionMask, ToolId } from '../types/editor';
import { clamp, hexToRgb } from '../utils/colorUtils';

export interface StrokePoint {
  x: number;
  y: number;
  pressure: number;
  t: number; // timestamp ms
}

export interface StrokeContextState {
  points: StrokePoint[];
  stabilizedX: number;
  stabilizedY: number;
  lastRawX: number;
  lastRawY: number;
  lastStampX: number;
  lastStampY: number;
  lastPressure: number;
  smoothedSpeed: number;
  totalLength: number;
  lastAngle: number;
  moved: boolean;
  loadedColor: { r: number; g: number; b: number };
  cloneSourceOffset: { dx: number; dy: number } | null;
  patternCanvas: HTMLCanvasElement | null;
  smudgeCarry: Float32Array | null;
  smudgeCarryDim: number;
  scratchCanvas: HTMLCanvasElement | null;
  baseSnapshot: ImageData | null;
  useScratchBuffer: boolean;
}

// Tools that render onto an offscreen scratch buffer first and composite cleanly at stroke opacity
export const SCRATCH_BUFFERED_TOOLS = new Set<ToolId>([
  'pencil',
  'brush',
  'marker',
  'pen',
  'ink',
  'airbrush',
  'spray',
  'crayon',
  'charcoal',
  'watercolor',
  'oilBrush',
  'pattern',
]);

// Reusable tiny scratch canvas for masked canvas-space paper tooth compositing
let reusableDabCanvas: HTMLCanvasElement | null = null;
function getReusableDabCanvas(dim: number): HTMLCanvasElement {
  if (!reusableDabCanvas) {
    reusableDabCanvas = document.createElement('canvas');
  }
  if (reusableDabCanvas.width < dim || reusableDabCanvas.height < dim) {
    reusableDabCanvas.width = Math.max(dim, reusableDabCanvas.width);
    reusableDabCanvas.height = Math.max(dim, reusableDabCanvas.height);
  }
  return reusableDabCanvas;
}

// Cache seamless 256x256 canvas-space paper tooth textures
const paperTileCache = new Map<string, HTMLCanvasElement>();

function getSeededRandom(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Generates seamless 256x256 tileable paper/grain masks anchored in canvas space.
 */
function getPaperGrainTile(kind: 'pencil' | 'crayon' | 'charcoal' | 'watercolor'): HTMLCanvasElement {
  const cached = paperTileCache.get(kind);
  if (cached) return cached;

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const data = img.data;
  const rand = getSeededRandom(kind.length * 1973 + 42);

  // Build coarse harmonic tooth grid for seamless wrapping
  const coarse = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    coarse[i] = rand();
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const n0 = coarse[idx];
      const nRight = coarse[y * size + ((x + 1) & 255)];
      const nDown = coarse[((y + 1) & 255) * size + x];
      const nDiag = coarse[((y + 2) & 255) * size + ((x + 2) & 255)];

      // Multi-frequency periodic paper weave
      const weave =
        0.5 +
        0.25 * Math.sin((x / size) * Math.PI * 2 * 24 + Math.cos((y / size) * Math.PI * 2 * 16)) +
        0.25 * Math.cos((y / size) * Math.PI * 2 * 28 - Math.sin((x / size) * Math.PI * 2 * 12));

      let alpha = 255;
      if (kind === 'pencil') {
        const tooth = (n0 * 0.45 + nRight * 0.25 + nDown * 0.3) * 0.65 + weave * 0.35;
        alpha = clamp((tooth - 0.12) * 290, 28, 255);
      } else if (kind === 'crayon') {
        const fiber = Math.sin((x / size) * Math.PI * 2 * 36) * 0.22 + weave * 0.45 + n0 * 0.33;
        alpha = fiber > 0.32 ? clamp((fiber - 0.18) * 320, 0, 255) : 12;
      } else if (kind === 'charcoal') {
        const pit = n0 * nDiag;
        const cluster = 0.45 * weave + 0.55 * ((n0 + nRight + nDown) / 3);
        alpha = clamp((cluster * 0.72 + pit * 0.55 - 0.15) * 310, 0, 255);
      } else {
        // Watercolor cotton cold-press grain
        const cotton = 0.6 + 0.4 * weave * (0.65 + n0 * 0.35);
        alpha = clamp(cotton * 245, 95, 255);
      }

      const p = idx * 4;
      data[p] = 255;
      data[p + 1] = 255;
      data[p + 2] = 255;
      data[p + 3] = Math.round(alpha);
    }
  }

  ctx.putImageData(img, 0, 0);
  paperTileCache.set(kind, canvas);
  return canvas;
}

function applyCanvasSpacePaperGrain(
  targetCtx: CanvasRenderingContext2D,
  dabCanvas: HTMLCanvasElement,
  dim: number,
  drawX: number,
  drawY: number,
  grainKind: 'pencil' | 'crayon' | 'charcoal' | 'watercolor',
  strength01: number
) {
  if (strength01 <= 0.02) {
    targetCtx.drawImage(dabCanvas, 0, 0, dim, dim, drawX, drawY, dim, dim);
    return;
  }
  const dCtx = dabCanvas.getContext('2d')!;
  const tile = getPaperGrainTile(grainKind);
  const pat = dCtx.createPattern(tile, 'repeat');
  if (pat) {
    dCtx.save();
    dCtx.globalCompositeOperation = 'destination-in';
    dCtx.globalAlpha = clamp(strength01, 0, 1);
    if (typeof pat.setTransform === 'function') {
      pat.setTransform(new DOMMatrix().translate(-drawX, -drawY));
    } else {
      dCtx.translate(-(drawX % 256), -(drawY % 256));
    }
    dCtx.fillStyle = pat;
    dCtx.fillRect(-256, -256, dim + 512, dim + 512);
    dCtx.restore();
  }
  targetCtx.drawImage(dabCanvas, 0, 0, dim, dim, drawX, drawY, dim, dim);
}

export function createPatternTile(
  type: BrushSettings['patternType'],
  fgHex: string,
  bgHex: string
): HTMLCanvasElement {
  const tile = document.createElement('canvas');
  tile.width = 32;
  tile.height = 32;
  const ctx = tile.getContext('2d')!;
  ctx.clearRect(0, 0, 32, 32);

  if (type === 'checker') {
    ctx.fillStyle = fgHex;
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillRect(16, 16, 16, 16);
    ctx.fillStyle = bgHex;
    ctx.fillRect(16, 0, 16, 16);
    ctx.fillRect(0, 16, 16, 16);
  } else if (type === 'dots') {
    ctx.fillStyle = fgHex;
    ctx.beginPath();
    ctx.arc(8, 8, 4, 0, Math.PI * 2);
    ctx.arc(24, 24, 4, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'grid') {
    ctx.strokeStyle = fgHex;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(32, 0);
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 32);
    ctx.stroke();
  } else if (type === 'diagonal') {
    ctx.strokeStyle = fgHex;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-8, 32);
    ctx.lineTo(32, -8);
    ctx.moveTo(0, 40);
    ctx.lineTo(40, 0);
    ctx.stroke();
  } else {
    ctx.strokeStyle = fgHex;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, 10);
    ctx.quadraticCurveTo(8, 2, 16, 10);
    ctx.quadraticCurveTo(24, 18, 32, 10);
    ctx.moveTo(0, 26);
    ctx.quadraticCurveTo(8, 18, 16, 26);
    ctx.quadraticCurveTo(24, 34, 32, 26);
    ctx.stroke();
  }
  return tile;
}

function isPixelSelected(selection: SelectionMask | null, x: number, y: number): boolean {
  if (!selection) return true;
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= selection.width || yi >= selection.height) return false;
  return selection.data[yi * selection.width + xi] > 127;
}

export function applySelectionClip(ctx: CanvasRenderingContext2D, selection: SelectionMask | null) {
  if (!selection || !selection.bounds) return;
  const path = new Path2D();
  const { width, data, bounds } = selection;
  for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
    let runStart = -1;
    const rowOffset = y * width;
    for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
      const sel = data[rowOffset + x] > 127;
      if (sel && runStart === -1) {
        runStart = x;
      } else if (!sel && runStart !== -1) {
        path.rect(runStart, y, x - runStart, 1);
        runStart = -1;
      }
    }
    if (runStart !== -1) {
      path.rect(runStart, y, bounds.x + bounds.width - runStart, 1);
    }
  }
  ctx.clip(path);
}

/**
 * Samples average underlying canvas color under brush tip for wet pigment mixing.
 */
function sampleSnapshotColor(
  snapshot: ImageData | null,
  x: number,
  y: number,
  radius: number
): { r: number; g: number; b: number; a: number } | null {
  if (!snapshot) return null;
  const w = snapshot.width;
  const h = snapshot.height;
  const d = snapshot.data;
  const offset = Math.max(1, Math.round(radius * 0.4));
  const offsets: [number, number][] = [
    [0, 0],
    [-offset, 0],
    [offset, 0],
    [0, -offset],
    [0, offset],
  ];

  let sr = 0;
  let sg = 0;
  let sb = 0;
  let sa = 0;
  let count = 0;

  for (const [ox, oy] of offsets) {
    const px = Math.round(x + ox);
    const py = Math.round(y + oy);
    if (px < 0 || py < 0 || px >= w || py >= h) continue;
    const idx = (py * w + px) * 4;
    const pa = d[idx + 3];
    if (pa > 12) {
      sr += d[idx] * pa;
      sg += d[idx + 1] * pa;
      sb += d[idx + 2] * pa;
      sa += pa;
      count++;
    }
  }

  if (count === 0 || sa <= 16) return null;
  return {
    r: sr / sa,
    g: sg / sa,
    b: sb / sa,
    a: sa / count,
  };
}

function updateWetPigmentColor(
  state: StrokeContextState,
  x: number,
  y: number,
  radius: number,
  tool: ToolId,
  settings: BrushSettings,
  fgRgb: { r: number; g: number; b: number }
): { r: number; g: number; b: number } {
  const mixAmount = clamp((settings.colorMix ?? 0) / 100, 0, 1);
  if (mixAmount <= 0.01 || !state.baseSnapshot) {
    return fgRgb;
  }

  const sampled = sampleSnapshotColor(state.baseSnapshot, x, y, radius);
  const wetness = clamp((settings.wetness ?? 0) / 100, 0, 1);

  if (sampled) {
    const pickupRate = clamp(
      mixAmount * (tool === 'oilBrush' ? 0.34 : tool === 'watercolor' ? 0.28 : 0.22),
      0.02,
      0.55
    );
    state.loadedColor.r += (sampled.r - state.loadedColor.r) * pickupRate;
    state.loadedColor.g += (sampled.g - state.loadedColor.g) * pickupRate;
    state.loadedColor.b += (sampled.b - state.loadedColor.b) * pickupRate;

    // Gradual brush pigment reload back toward foreground color
    const reload = (1 - wetness * 0.85) * 0.07;
    state.loadedColor.r += (fgRgb.r - state.loadedColor.r) * reload;
    state.loadedColor.g += (fgRgb.g - state.loadedColor.g) * reload;
    state.loadedColor.b += (fgRgb.b - state.loadedColor.b) * reload;
  } else {
    // Clean dry/empty canvas reloads pure foreground pigment faster
    const reload = 0.18 * (1 - wetness * 0.5);
    state.loadedColor.r += (fgRgb.r - state.loadedColor.r) * reload;
    state.loadedColor.g += (fgRgb.g - state.loadedColor.g) * reload;
    state.loadedColor.b += (fgRgb.b - state.loadedColor.b) * reload;
  }

  return {
    r: Math.round(clamp(state.loadedColor.r, 0, 255)),
    g: Math.round(clamp(state.loadedColor.g, 0, 255)),
    b: Math.round(clamp(state.loadedColor.b, 0, 255)),
  };
}

function computePressureFromVelocity(
  smoothedSpeed: number,
  rawPressure: number,
  tool: ToolId,
  settings: BrushSettings
): number {
  if (!settings.pressureSim) return 1;
  // Native stylus / Apple Pencil / Wacom pressure when present
  if (rawPressure > 0 && rawPressure !== 0.5 && rawPressure <= 1) {
    return clamp(0.18 + Math.pow(rawPressure, 0.85) * 0.92, 0.14, 1.1);
  }
  // ibisPaint-style smooth velocity-pressure response curve
  const sensitivity =
    tool === 'pen' || tool === 'ink'
      ? 0.028
      : tool === 'pencil'
      ? 0.022
      : tool === 'watercolor' || tool === 'oilBrush'
      ? 0.014
      : 0.018;
  return clamp(1.06 - Math.pow(smoothedSpeed * sensitivity, 0.92) * 0.68, 0.22, 1.05);
}

/**
 * Stamps a single brush dab at (x, y) with sub-pixel anti-aliasing, wet pigment mixing,
 * and canvas-space paper tooth physics.
 */
export function stampToolDab(
  ctx: CanvasRenderingContext2D,
  tool: ToolId,
  x: number,
  y: number,
  angle: number,
  pressure: number,
  settings: BrushSettings,
  fgColor: string,
  bgColor: string,
  selection: SelectionMask | null,
  state: StrokeContextState,
  cloneSource: { x: number; y: number } | null,
  taperMultiplier = 1
) {
  const taperRatio = clamp((settings.taper ?? 0) / 100, 0, 1);
  const fadeInDist = Math.max(8, settings.size * (0.65 + taperRatio * 2.4));

  // Smooth easeOutCubic Force Fade In at start of stroke
  let startFade = 1;
  if (taperRatio > 0.01 && state.totalLength < fadeInDist) {
    const t = clamp(state.totalLength / fadeInDist, 0, 1);
    const eased = 1 - Math.pow(1 - t, 2.4);
    const minTip = 1 - taperRatio * 0.84;
    startFade = minTip + (1 - minTip) * eased;
  }

  const combinedTaper = clamp(startFade * taperMultiplier, 0.08, 1);
  const basePressure =
    tool === 'marker' ? clamp(0.75 + pressure * 0.25, 0.65, 1) : pressure * combinedTaper;

  // Apply subtle organic jitter when configured
  const jitterFrac = clamp((settings.jitter ?? 0) / 100, 0, 1);
  const sizeJitter = jitterFrac > 0 ? 1 + (Math.random() - 0.5) * jitterFrac * 0.42 : 1;
  const posJitter = jitterFrac > 0 ? settings.size * jitterFrac * 0.22 : 0;
  const jx = posJitter > 0 ? x + (Math.random() - 0.5) * posJitter : x;
  const jy = posJitter > 0 ? y + (Math.random() - 0.5) * posJitter : y;

  const size = Math.max(0.8, settings.size * basePressure * sizeJitter);
  const radius = size / 2;
  const flow = clamp(settings.flow / 100, 0.03, 1);
  const taperAlphaMod = combinedTaper < 0.45 ? clamp(0.45 + combinedTaper * 1.2, 0.35, 1) : 1;

  const hardness =
    tool === 'softEraser' || tool === 'airbrush'
      ? 0
      : tool === 'ink' || tool === 'pen'
      ? clamp(Math.max(0.92, settings.hardness / 100), 0.9, 1)
      : clamp(settings.hardness / 100, 0, 1);

  const fgRgb = hexToRgb(fgColor);

  // Pixel manipulation tools operate directly on target canvas
  if (tool === 'smudge' || tool === 'blur' || tool === 'sharpen' || tool === 'dodge' || tool === 'burn') {
    ctx.save();
    if (selection) applySelectionClip(ctx, selection);
    applyPixelEditDab(ctx, tool, jx, jy, radius, settings.strength / 100, selection, state);
    ctx.restore();
    return;
  }

  // Clone Stamp
  if (tool === 'clone') {
    if (!cloneSource || !state.baseSnapshot) return;
    if (!state.cloneSourceOffset) {
      state.cloneSourceOffset = { dx: cloneSource.x - jx, dy: cloneSource.y - jy };
    }
    const srcX = Math.round(jx + state.cloneSourceOffset.dx);
    const srcY = Math.round(jy + state.cloneSourceOffset.dy);
    const rInt = Math.max(2, Math.round(radius));
    const snap = state.baseSnapshot;
    const x0 = Math.max(0, Math.round(jx - rInt));
    const y0 = Math.max(0, Math.round(jy - rInt));
    const x1 = Math.min(ctx.canvas.width - 1, Math.round(jx + rInt));
    const y1 = Math.min(ctx.canvas.height - 1, Math.round(jy + rInt));
    if (x1 > x0 && y1 > y0) {
      const targetPatch = ctx.getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
      const pw = targetPatch.width;
      const ph = targetPatch.height;
      const opacity = clamp(settings.opacity / 100, 0, 1);
      for (let py = 0; py < ph; py++) {
        for (let px = 0; px < pw; px++) {
          const cx = x0 + px;
          const cy = y0 + py;
          if (!isPixelSelected(selection, cx, cy)) continue;
          const dist = Math.hypot(cx - jx, cy - jy);
          if (dist > rInt) continue;
          const sx = srcX + (cx - Math.round(jx));
          const sy = srcY + (cy - Math.round(jy));
          if (sx < 0 || sy < 0 || sx >= snap.width || sy >= snap.height) continue;
          const falloff =
            hardness >= 0.99 ? 1 : clamp(1 - Math.max(0, (dist / rInt - hardness) / Math.max(0.01, 1 - hardness)), 0, 1);
          const alpha = opacity * flow * falloff;
          const sIdx = (sy * snap.width + sx) * 4;
          const tIdx = (py * pw + px) * 4;
          targetPatch.data[tIdx] = Math.round(targetPatch.data[tIdx] * (1 - alpha) + snap.data[sIdx] * alpha);
          targetPatch.data[tIdx + 1] = Math.round(targetPatch.data[tIdx + 1] * (1 - alpha) + snap.data[sIdx + 1] * alpha);
          targetPatch.data[tIdx + 2] = Math.round(targetPatch.data[tIdx + 2] * (1 - alpha) + snap.data[sIdx + 2] * alpha);
          targetPatch.data[tIdx + 3] = Math.round(targetPatch.data[tIdx + 3] * (1 - alpha) + snap.data[sIdx + 3] * alpha);
        }
      }
      ctx.putImageData(targetPatch, x0, y0);
    }
    return;
  }

  // Eraser & Soft Eraser
  if (tool === 'eraser' || tool === 'softEraser') {
    ctx.save();
    if (selection) applySelectionClip(ctx, selection);
    ctx.globalCompositeOperation = 'destination-out';
    const alpha = clamp((settings.opacity / 100) * flow * taperAlphaMod, 0, 1);
    if (hardness >= 0.96) {
      ctx.fillStyle = `rgba(0,0,0,${alpha})`;
      ctx.beginPath();
      ctx.arc(jx, jy, radius, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const grad = ctx.createRadialGradient(jx, jy, radius * hardness * 0.85, jx, jy, radius);
      grad.addColorStop(0, `rgba(0,0,0,${alpha})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(jx, jy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  // Pattern Tool
  if (tool === 'pattern') {
    ctx.save();
    if (selection) applySelectionClip(ctx, selection);
    if (!state.patternCanvas) {
      state.patternCanvas = createPatternTile(settings.patternType, fgColor, bgColor);
    }
    const pat = ctx.createPattern(state.patternCanvas, 'repeat');
    if (pat) {
      ctx.globalAlpha = flow;
      ctx.fillStyle = pat;
      ctx.beginPath();
      ctx.arc(jx, jy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  // Compute dynamic wet-mixed pigment color
  const { r, g, b } = updateWetPigmentColor(state, jx, jy, radius, tool, settings, fgRgb);
  const texStrength = clamp((settings.textureStrength ?? 0) / 100, 0, 1);
  const wetness = clamp((settings.wetness ?? 0) / 100, 0, 1);

  ctx.save();
  if (selection) applySelectionClip(ctx, selection);

  // Spray Paint: velocity-reactive droplets
  if (tool === 'spray') {
    const count = Math.max(14, Math.round(size * (1.2 + jitterFrac * 1.4)));
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const dist = Math.pow(Math.random(), 0.72) * radius * 1.38;
      const px = jx + Math.cos(a) * dist;
      const py = jy + Math.sin(a) * dist;
      const dotR = Math.max(0.65, Math.random() * Math.max(1.3, size * 0.065));
      const mistAlpha = clamp((1 - dist / (radius * 1.55)) * flow * 0.78, 0.08, 0.92);
      ctx.fillStyle = `rgba(${r},${g},${b},${mistAlpha})`;
      ctx.beginPath();
      ctx.arc(px, py, dotR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  // Pen & Ink (Crisp anti-aliased sub-pixel vector calligraphy — zero integer stepping)
  if (tool === 'pen' || tool === 'ink') {
    const alpha = clamp(flow * taperAlphaMod, 0, 1);
    if (hardness >= 0.97) {
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.beginPath();
      ctx.arc(jx, jy, radius, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const inner = clamp(hardness * 0.88, 0.2, 0.95);
      const grad = ctx.createRadialGradient(jx, jy, radius * inner, jx, jy, radius);
      grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(jx, jy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  // Airbrush (Ultra-silky Gaussian mist)
  if (tool === 'airbrush') {
    const alpha = clamp(flow * 0.36 * taperAlphaMod, 0.03, 0.6);
    const grad = ctx.createRadialGradient(jx, jy, 0, jx, jy, radius);
    grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
    grad.addColorStop(0.35, `rgba(${r},${g},${b},${alpha * 0.56})`);
    grad.addColorStop(0.7, `rgba(${r},${g},${b},${alpha * 0.18})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(jx, jy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  // Marker (Chisel felt-tip nib with translucent ink sheen)
  if (tool === 'marker') {
    ctx.translate(jx, jy);
    ctx.rotate(-Math.PI / 5);
    const mw = size * 0.94;
    const mh = Math.max(2.5, size * 0.42);
    ctx.fillStyle = `rgba(${r},${g},${b},${clamp(flow * 0.9, 0.1, 0.96)})`;
    ctx.beginPath();
    ctx.roundRect(-mw / 2, -mh / 2, mw, mh, Math.min(mh / 2, 6));
    ctx.fill();
    ctx.restore();
    return;
  }

  // Oil Brush (Dynamic-angle multi-tine bristle impasto with highlight/shadow relief)
  if (tool === 'oilBrush') {
    const tines = Math.max(6, Math.min(22, Math.round(size * 0.42)));
    const phase = Math.floor(state.totalLength * 0.35);
    ctx.translate(jx, jy);
    ctx.rotate(angle);
    for (let i = 0; i < tines; i++) {
      const frac = i / (tines - 1 || 1);
      const ty = (frac - 0.5) * size * 0.86;
      const wave = Math.sin(i * 2.1 + phase * 0.25);
      const shade = Math.round(wave * 18);
      const rr = clamp(r + shade, 0, 255);
      const gg = clamp(g + shade, 0, 255);
      const bb = clamp(b + shade, 0, 255);
      const tineThick = Math.max(1.1, (size / tines) * (0.85 - texStrength * 0.2));
      const tineAlpha = clamp(flow * (0.72 + (wave * 0.5 + 0.5) * 0.25) * taperAlphaMod, 0.1, 1);
      ctx.fillStyle = `rgba(${rr},${gg},${bb},${tineAlpha})`;
      ctx.beginPath();
      ctx.ellipse(0, ty, radius * (0.72 + Math.abs(wave) * 0.25), tineThick * 0.68, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  // Watercolor (Wet-on-wet organic bleed + dark pigment pooling rim + cotton grain)
  if (tool === 'watercolor') {
    const dim = Math.max(12, Math.ceil(size * 1.4) + 8);
    const dab = getReusableDabCanvas(dim);
    const dCtx = dab.getContext('2d')!;
    dCtx.clearRect(0, 0, dim, dim);
    const cx = dim / 2;
    const cy = dim / 2;

    const rimBoost = 0.25 + wetness * 0.35;
    const centerAlpha = clamp(flow * (0.24 - wetness * 0.08) * taperAlphaMod, 0.05, 0.45);
    const rimAlpha = clamp(flow * rimBoost * taperAlphaMod, 0.1, 0.68);
    const darkRimR = clamp(Math.round(r * 0.82), 0, 255);
    const darkRimG = clamp(Math.round(g * 0.82), 0, 255);
    const darkRimB = clamp(Math.round(b * 0.82), 0, 255);

    const grad = dCtx.createRadialGradient(cx, cy, radius * 0.12, cx, cy, radius * 1.1);
    grad.addColorStop(0, `rgba(${r},${g},${b},${centerAlpha})`);
    grad.addColorStop(0.68, `rgba(${r},${g},${b},${centerAlpha * 1.15})`);
    grad.addColorStop(0.9, `rgba(${darkRimR},${darkRimG},${darkRimB},${rimAlpha})`);
    grad.addColorStop(1, `rgba(${darkRimR},${darkRimG},${darkRimB},0)`);

    dCtx.fillStyle = grad;
    dCtx.beginPath();
    const lobes = 16;
    const seedPhase = (state.totalLength * 0.07) % (Math.PI * 2);
    for (let i = 0; i <= lobes; i++) {
      const a = (i / lobes) * Math.PI * 2;
      const wobble =
        0.86 +
        0.16 * Math.sin(a * 3 + seedPhase) +
        0.09 * Math.cos(a * 5 - seedPhase * 0.7);
      const px = cx + Math.cos(a) * radius * wobble;
      const py = cy + Math.sin(a) * radius * wobble;
      if (i === 0) dCtx.moveTo(px, py);
      else dCtx.lineTo(px, py);
    }
    dCtx.closePath();
    dCtx.fill();

    applyCanvasSpacePaperGrain(ctx, dab, dim, jx - cx, jy - cy, 'watercolor', texStrength * 0.85);
    ctx.restore();
    return;
  }

  // Dry Textured Media (Pencil, Crayon, Charcoal) -> Canvas-Space Locked Paper Tooth
  if (tool === 'pencil' || tool === 'crayon' || tool === 'charcoal') {
    const dim = Math.max(8, Math.ceil(size) + 6);
    const dab = getReusableDabCanvas(dim);
    const dCtx = dab.getContext('2d')!;
    dCtx.clearRect(0, 0, dim, dim);
    const cx = dim / 2;
    const cy = dim / 2;

    const alpha = clamp(flow * taperAlphaMod, 0.06, 1);
    const inner = tool === 'pencil' ? clamp(hardness * 0.72, 0.35, 0.9) : tool === 'crayon' ? 0.5 : 0.15;
    const grad = dCtx.createRadialGradient(cx, cy, radius * inner, cx, cy, radius);
    grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    dCtx.fillStyle = grad;
    dCtx.beginPath();
    dCtx.arc(cx, cy, radius, 0, Math.PI * 2);
    dCtx.fill();

    applyCanvasSpacePaperGrain(ctx, dab, dim, jx - cx, jy - cy, tool, texStrength);
    ctx.restore();
    return;
  }

  // Standard Smooth Brush (supports optional subtle paper texture & wet color mix)
  if (texStrength > 0.12) {
    const dim = Math.max(8, Math.ceil(size) + 6);
    const dab = getReusableDabCanvas(dim);
    const dCtx = dab.getContext('2d')!;
    dCtx.clearRect(0, 0, dim, dim);
    const cx = dim / 2;
    const cy = dim / 2;
    const alpha = clamp(flow * taperAlphaMod, 0.04, 1);
    const inner = clamp(hardness * 0.84, 0, 0.92);
    const grad = dCtx.createRadialGradient(cx, cy, radius * inner, cx, cy, radius);
    grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
    grad.addColorStop(0.65 + hardness * 0.25, `rgba(${r},${g},${b},${alpha * 0.48})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    dCtx.fillStyle = grad;
    dCtx.beginPath();
    dCtx.arc(cx, cy, radius, 0, Math.PI * 2);
    dCtx.fill();

    applyCanvasSpacePaperGrain(ctx, dab, dim, jx - cx, jy - cy, 'watercolor', texStrength * 0.6);
  } else {
    const alpha = clamp(flow * taperAlphaMod, 0.04, 1);
    if (hardness >= 0.97) {
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.beginPath();
      ctx.arc(jx, jy, radius, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const inner = clamp(hardness * 0.85, 0, 0.92);
      const grad = ctx.createRadialGradient(jx, jy, radius * inner, jx, jy, radius);
      grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
      grad.addColorStop(0.65 + hardness * 0.25, `rgba(${r},${g},${b},${alpha * 0.45})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(jx, jy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * Pixel manipulation brushes (Silky pigment-carry Smudge, Blur, Sharpen, Dodge, Burn).
 */
function applyPixelEditDab(
  ctx: CanvasRenderingContext2D,
  tool: ToolId,
  x: number,
  y: number,
  radius: number,
  strength: number,
  selection: SelectionMask | null,
  state: StrokeContextState
) {
  const rInt = clamp(Math.round(radius), 2, 110);
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const x0 = Math.max(0, Math.round(x - rInt));
  const y0 = Math.max(0, Math.round(y - rInt));
  const x1 = Math.min(w - 1, Math.round(x + rInt));
  const y1 = Math.min(h - 1, Math.round(y + rInt));
  const pw = x1 - x0 + 1;
  const ph = y1 - y0 + 1;
  if (pw <= 2 || ph <= 2) return;

  const img = ctx.getImageData(x0, y0, pw, ph);
  const src = new Uint8ClampedArray(img.data);
  const out = img.data;

  if (tool === 'smudge') {
    const dim = rInt * 2 + 1;
    if (!state.smudgeCarry || state.smudgeCarryDim !== dim) {
      state.smudgeCarry = new Float32Array(dim * dim * 4);
      state.smudgeCarryDim = dim;
      for (let py = 0; py < ph; py++) {
        for (let px = 0; px < pw; px++) {
          const cx = x0 + px - Math.round(x) + rInt;
          const cy = y0 + py - Math.round(y) + rInt;
          if (cx < 0 || cy < 0 || cx >= dim || cy >= dim) continue;
          const sIdx = (py * pw + px) * 4;
          const cIdx = (cy * dim + cx) * 4;
          state.smudgeCarry[cIdx] = src[sIdx];
          state.smudgeCarry[cIdx + 1] = src[sIdx + 1];
          state.smudgeCarry[cIdx + 2] = src[sIdx + 2];
          state.smudgeCarry[cIdx + 3] = src[sIdx + 3];
        }
      }
      return;
    }

    const carry = state.smudgeCarry;
    const deposit = clamp(0.35 + strength * 0.58, 0.2, 0.94);
    const pickup = 1 - deposit * 0.65;

    for (let py = 0; py < ph; py++) {
      for (let px = 0; px < pw; px++) {
        const wx = x0 + px;
        const wy = y0 + py;
        if (!isPixelSelected(selection, wx, wy)) continue;
        const dx = wx - x;
        const dy = wy - y;
        const dist = Math.hypot(dx, dy);
        if (dist > rInt) continue;

        const cx = Math.round(dx) + rInt;
        const cy = Math.round(dy) + rInt;
        if (cx < 0 || cy < 0 || cx >= dim || cy >= dim) continue;

        const radial = Math.pow(1 - dist / rInt, 0.85);
        const wDep = deposit * radial;
        const sIdx = (py * pw + px) * 4;
        const cIdx = (cy * dim + cx) * 4;

        const nr = src[sIdx] * (1 - wDep) + carry[cIdx] * wDep;
        const ng = src[sIdx + 1] * (1 - wDep) + carry[cIdx + 1] * wDep;
        const nb = src[sIdx + 2] * (1 - wDep) + carry[cIdx + 2] * wDep;
        const na = src[sIdx + 3] * (1 - wDep) + carry[cIdx + 3] * wDep;

        out[sIdx] = Math.round(nr);
        out[sIdx + 1] = Math.round(ng);
        out[sIdx + 2] = Math.round(nb);
        out[sIdx + 3] = Math.round(na);

        // Update carry buffer smoothly with blended paint
        carry[cIdx] = carry[cIdx] * (1 - pickup * 0.4) + nr * (pickup * 0.4);
        carry[cIdx + 1] = carry[cIdx + 1] * (1 - pickup * 0.4) + ng * (pickup * 0.4);
        carry[cIdx + 2] = carry[cIdx + 2] * (1 - pickup * 0.4) + nb * (pickup * 0.4);
        carry[cIdx + 3] = carry[cIdx + 3] * (1 - pickup * 0.4) + na * (pickup * 0.4);
      }
    }

    ctx.putImageData(img, x0, y0);
    return;
  }

  for (let py = 1; py < ph - 1; py++) {
    for (let px = 1; px < pw - 1; px++) {
      const cx = x0 + px;
      const cy = y0 + py;
      if (!isPixelSelected(selection, cx, cy)) continue;
      const dist = Math.hypot(cx - x, cy - y);
      if (dist > rInt) continue;
      const falloff = (1 - dist / rInt) * strength;
      const idx = (py * pw + px) * 4;

      if (tool === 'dodge') {
        const boost = 1 + falloff * 0.25;
        out[idx] = clamp(src[idx] * boost + falloff * 14, 0, 255);
        out[idx + 1] = clamp(src[idx + 1] * boost + falloff * 14, 0, 255);
        out[idx + 2] = clamp(src[idx + 2] * boost + falloff * 14, 0, 255);
      } else if (tool === 'burn') {
        const dark = 1 - falloff * 0.22;
        out[idx] = clamp(src[idx] * dark, 0, 255);
        out[idx + 1] = clamp(src[idx + 1] * dark, 0, 255);
        out[idx + 2] = clamp(src[idx + 2] * dark, 0, 255);
      } else if (tool === 'blur' || tool === 'sharpen') {
        const nTop = ((py - 1) * pw + px) * 4;
        const nBot = ((py + 1) * pw + px) * 4;
        const nLeft = (py * pw + (px - 1)) * 4;
        const nRight = (py * pw + (px + 1)) * 4;

        for (let c = 0; c < 4; c++) {
          const avg = (src[nTop + c] + src[nBot + c] + src[nLeft + c] + src[nRight + c] + src[idx + c]) / 5;
          if (tool === 'blur') {
            out[idx + c] = clamp(src[idx + c] * (1 - falloff) + avg * falloff, 0, 255);
          } else {
            const sharp = src[idx + c] + (src[idx + c] - avg) * (falloff * 1.4);
            out[idx + c] = clamp(sharp, 0, 255);
          }
        }
      }
    }
  }

  ctx.putImageData(img, x0, y0);
}

/**
 * Begins a new stroke with offscreen scratch buffer, wet pigment loader, and tapered entry.
 */
export function beginBrushStroke(
  layerCanvas: HTMLCanvasElement,
  tool: ToolId,
  x: number,
  y: number,
  rawPressure: number,
  settings: BrushSettings,
  fgColor: string,
  bgColor: string,
  selection: SelectionMask | null,
  cloneSource: { x: number; y: number } | null
): StrokeContextState {
  const useScratchBuffer = SCRATCH_BUFFERED_TOOLS.has(tool);
  let scratchCanvas: HTMLCanvasElement | null = null;
  if (useScratchBuffer) {
    scratchCanvas = document.createElement('canvas');
    scratchCanvas.width = layerCanvas.width;
    scratchCanvas.height = layerCanvas.height;
  }

  const needsSnapshot =
    tool === 'clone' ||
    (settings.colorMix ?? 0) > 1 ||
    tool === 'watercolor' ||
    tool === 'oilBrush';

  const baseSnapshot = needsSnapshot
    ? layerCanvas.getContext('2d')!.getImageData(0, 0, layerCanvas.width, layerCanvas.height)
    : null;

  const initialP = settings.pressureSim
    ? rawPressure > 0 && rawPressure !== 0.5
      ? clamp(0.24 + rawPressure * 0.84, 0.16, 1.05)
      : settings.taper > 10
      ? 0.65
      : 0.9
    : 1;

  const fgRgb = hexToRgb(fgColor);

  const state: StrokeContextState = {
    points: [{ x, y, pressure: initialP, t: performance.now() }],
    stabilizedX: x,
    stabilizedY: y,
    lastRawX: x,
    lastRawY: y,
    lastStampX: x,
    lastStampY: y,
    lastPressure: initialP,
    smoothedSpeed: 0,
    totalLength: 0,
    lastAngle: 0,
    moved: false,
    loadedColor: { ...fgRgb },
    cloneSourceOffset: null,
    patternCanvas: null,
    smudgeCarry: null,
    smudgeCarryDim: 0,
    scratchCanvas,
    baseSnapshot,
    useScratchBuffer,
  };

  // Place fine tapered entry tip (if user taps without moving, finishBrushStroke fills full dot)
  const drawTargetCtx = (scratchCanvas ?? layerCanvas).getContext('2d')!;
  stampToolDab(
    drawTargetCtx,
    tool,
    x,
    y,
    0,
    initialP,
    settings,
    fgColor,
    bgColor,
    selection,
    state,
    cloneSource
  );

  return state;
}

/**
 * Interpolates smooth quadratic curves with ibisPaint-grade stabilizer, velocity smoothing, and dynamic physics.
 */
export function continueBrushStroke(
  layerCanvas: HTMLCanvasElement,
  tool: ToolId,
  rawX: number,
  rawY: number,
  rawPressure: number,
  settings: BrushSettings,
  fgColor: string,
  bgColor: string,
  selection: SelectionMask | null,
  state: StrokeContextState,
  cloneSource: { x: number; y: number } | null
) {
  state.lastRawX = rawX;
  state.lastRawY = rawY;

  // Combine Stabilizer (0..10) and Smoothing (0..100) into natural spring-damper lag
  const stabFactor = clamp((settings.stabilizer / 10) * 0.74 + (settings.smoothing / 100) * 0.16, 0, 0.89);
  const nextX = state.stabilizedX * stabFactor + rawX * (1 - stabFactor);
  const nextY = state.stabilizedY * stabFactor + rawY * (1 - stabFactor);

  const now = performance.now();
  const prevPt = state.points[state.points.length - 1];
  const dt = Math.max(4, now - prevPt.t);
  const segDist = Math.hypot(nextX - prevPt.x, nextY - prevPt.y);

  if (segDist < 0.35 && tool !== 'airbrush' && tool !== 'spray') {
    return;
  }

  state.moved = true;
  const instSpeed = (segDist / dt) * 16;
  state.smoothedSpeed = state.smoothedSpeed * 0.62 + instSpeed * 0.38;
  const targetP = computePressureFromVelocity(state.smoothedSpeed, rawPressure, tool, settings);
  const smoothP = state.lastPressure * 0.58 + targetP * 0.42;

  state.stabilizedX = nextX;
  state.stabilizedY = nextY;
  state.points.push({ x: nextX, y: nextY, pressure: smoothP, t: now });

  const drawCtx = (state.scratchCanvas ?? layerCanvas).getContext('2d')!;
  const spacingPx = Math.max(
    0.75,
    settings.size *
      clamp(settings.spacing / 100, 0.025, 1.5) *
      (tool === 'pen' || tool === 'ink' || tool === 'brush'
        ? 0.38
        : tool === 'watercolor' || tool === 'airbrush'
        ? 0.32
        : 0.58)
  );

  const n = state.points.length;
  const p2 = state.points[n - 1];
  const p1 = state.points[n - 2];

  if (n >= 3) {
    const p0 = state.points[n - 3];
    const mid0x = (p0.x + p1.x) / 2;
    const mid0y = (p0.y + p1.y) / 2;
    const mid1x = (p1.x + p2.x) / 2;
    const mid1y = (p1.y + p2.y) / 2;
    const curveLen = Math.hypot(p1.x - mid0x, p1.y - mid0y) + Math.hypot(mid1x - p1.x, mid1y - p1.y);
    const steps = Math.max(1, Math.ceil(curveLen / spacingPx));

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const omt = 1 - t;
      const ix = omt * omt * mid0x + 2 * omt * t * p1.x + t * t * mid1x;
      const iy = omt * omt * mid0y + 2 * omt * t * p1.y + t * t * mid1y;
      const ip = p0.pressure * (1 - t) + p2.pressure * t;
      const angle = Math.atan2(iy - state.lastStampY, ix - state.lastStampX);
      const stepDist = Math.hypot(ix - state.lastStampX, iy - state.lastStampY);
      state.totalLength += stepDist;
      if (stepDist > 0.2) state.lastAngle = angle;
      state.lastStampX = ix;
      state.lastStampY = iy;
      stampToolDab(drawCtx, tool, ix, iy, state.lastAngle, ip, settings, fgColor, bgColor, selection, state, cloneSource);
    }
  } else {
    const steps = Math.max(1, Math.ceil(segDist / spacingPx));
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const ix = p1.x + (p2.x - p1.x) * t;
      const iy = p1.y + (p2.y - p1.y) * t;
      const ip = p1.pressure + (p2.pressure - p1.pressure) * t;
      const stepDist = Math.hypot(ix - state.lastStampX, iy - state.lastStampY);
      state.totalLength += stepDist;
      if (stepDist > 0.2) state.lastAngle = angle;
      state.lastStampX = ix;
      state.lastStampY = iy;
      stampToolDab(drawCtx, tool, ix, iy, state.lastAngle, ip, settings, fgColor, bgColor, selection, state, cloneSource);
    }
  }

  state.lastPressure = smoothP;
}

/**
 * Completes stabilizer catch-up, renders curved Force Fade exit tail, and composites scratch buffer.
 */
export function finishBrushStroke(
  layerCanvas: HTMLCanvasElement,
  tool: ToolId,
  settings: BrushSettings,
  fgColor: string,
  bgColor: string,
  selection: SelectionMask | null,
  state: StrokeContextState,
  cloneSource: { x: number; y: number } | null
) {
  const drawCtx = (state.scratchCanvas ?? layerCanvas).getContext('2d')!;
  const spacingPx = Math.max(1, settings.size * clamp(settings.spacing / 100, 0.04, 1) * 0.42);

  // If user tapped a single dot without dragging, stamp full dot cleanly
  if (!state.moved || state.totalLength < 2) {
    stampToolDab(
      drawCtx,
      tool,
      state.lastRawX,
      state.lastRawY,
      0,
      1,
      { ...settings, taper: 0 },
      fgColor,
      bgColor,
      selection,
      state,
      cloneSource,
      1
    );
  } else {
    // 1. Pull remaining stabilizer lag smoothly toward pointer release coordinate
    const lagDist = Math.hypot(state.lastRawX - state.lastStampX, state.lastRawY - state.lastStampY);
    if (lagDist > 1.5) {
      const catchSteps = Math.max(2, Math.min(18, Math.ceil(lagDist / spacingPx)));
      const lagAngle = Math.atan2(state.lastRawY - state.lastStampY, state.lastRawX - state.lastStampX);
      const startX = state.lastStampX;
      const startY = state.lastStampY;
      for (let i = 1; i <= catchSteps; i++) {
        const frac = i / catchSteps;
        const ix = startX + (state.lastRawX - startX) * frac;
        const iy = startY + (state.lastRawY - startY) * frac;
        const taperMul = settings.taper > 0 ? 1 - frac * (settings.taper / 100) * 0.5 : 1;
        state.totalLength += Math.hypot(ix - state.lastStampX, iy - state.lastStampY);
        state.lastStampX = ix;
        state.lastStampY = iy;
        state.lastAngle = lagAngle;
        stampToolDab(
          drawCtx,
          tool,
          ix,
          iy,
          lagAngle,
          state.lastPressure,
          settings,
          fgColor,
          bgColor,
          selection,
          state,
          cloneSource,
          taperMul
        );
      }
    }

    // 2. Smooth multi-point tangent Force Fade exit tail
    if (settings.taper > 0 && state.totalLength > 6 && state.points.length >= 2) {
      const lookbackIdx = Math.max(0, state.points.length - 5);
      const tailRef = state.points[lookbackIdx];
      const tailEnd = state.points[state.points.length - 1];
      const exitAngle =
        Math.hypot(tailEnd.x - tailRef.x, tailEnd.y - tailRef.y) > 2
          ? Math.atan2(tailEnd.y - tailRef.y, tailEnd.x - tailRef.x)
          : state.lastAngle;

      const taperRatio = settings.taper / 100;
      const tailLen = clamp(taperRatio * Math.min(46, Math.max(10, settings.size * 1.45)), 4, 48);
      const tailSteps = Math.max(4, Math.min(28, Math.round(tailLen / Math.max(1, settings.size * 0.08))));
      const dx = Math.cos(exitAngle);
      const dy = Math.sin(exitAngle);

      for (let i = 1; i <= tailSteps; i++) {
        const frac = i / tailSteps;
        const ease = 1 - Math.pow(frac, 1.4);
        const ix = state.lastStampX + dx * (tailLen * frac);
        const iy = state.lastStampY + dy * (tailLen * frac);
        const taperMul = clamp((1 - taperRatio * 0.5) * ease + 0.06, 0.06, 1);
        stampToolDab(
          drawCtx,
          tool,
          ix,
          iy,
          exitAngle,
          state.lastPressure,
          settings,
          fgColor,
          bgColor,
          selection,
          state,
          cloneSource,
          taperMul
        );
      }
    }
  }

  // Composite offscreen scratch buffer cleanly at true stroke Opacity onto layer canvas
  if (state.scratchCanvas) {
    const lCtx = layerCanvas.getContext('2d')!;
    lCtx.save();
    lCtx.globalAlpha = clamp(settings.opacity / 100, 0, 1);
    lCtx.drawImage(state.scratchCanvas, 0, 0);
    lCtx.restore();
  }
}

/**
 * Renders a live ibisPaint-style S-curve brush stroke preview onto a UI preview canvas.
 */
export function renderBrushPreviewCurve(
  previewCanvas: HTMLCanvasElement,
  tool: ToolId,
  settings: BrushSettings,
  fgColor: string,
  bgColor: string
) {
  const w = previewCanvas.width;
  const h = previewCanvas.height;
  const ctx = previewCanvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, w, h);

  const previewSettings: BrushSettings = {
    ...settings,
    size: clamp(settings.size * 0.42, 3, h * 0.54),
    spacing: Math.min(settings.spacing, 12),
    taper: Math.max(settings.taper, 20),
    colorMix: 0, // Preview renders pure fg pigment cleanly
  };

  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const offCtx = off.getContext('2d')!;
  const fgRgb = hexToRgb(fgColor);

  const dummyState: StrokeContextState = {
    points: [],
    stabilizedX: 0,
    stabilizedY: 0,
    lastRawX: 0,
    lastRawY: 0,
    lastStampX: 0,
    lastStampY: 0,
    lastPressure: 1,
    smoothedSpeed: 0,
    totalLength: 0,
    lastAngle: 0,
    moved: true,
    loadedColor: { ...fgRgb },
    cloneSourceOffset: null,
    patternCanvas: null,
    smudgeCarry: null,
    smudgeCarryDim: 0,
    scratchCanvas: off,
    baseSnapshot: null,
    useScratchBuffer: true,
  };

  const steps = 76;
  const padX = 20;
  let prevX = padX;
  let prevY = h * 0.52;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = padX + (w - padX * 2) * t;
    const y = h * 0.52 - Math.sin(t * Math.PI * 2) * (h * 0.25);

    const envelope = Math.sin(t * Math.PI);
    const taperInfluence = clamp(settings.taper / 100, 0.2, 1);
    const p = clamp((1 - taperInfluence * 0.85) + envelope * taperInfluence * 0.95, 0.14, 1.05);
    const angle = Math.atan2(y - prevY, x - prevX);
    dummyState.totalLength += Math.hypot(x - prevX, y - prevY);

    stampToolDab(
      offCtx,
      tool === 'eraser' || tool === 'softEraser' ? 'brush' : tool,
      x,
      y,
      angle,
      p,
      previewSettings,
      tool === 'eraser' || tool === 'softEraser' ? '#94A3B8' : fgColor,
      bgColor,
      null,
      dummyState,
      null,
      1
    );
    prevX = x;
    prevY = y;
  }

  ctx.save();
  ctx.globalAlpha = clamp(settings.opacity / 100, 0.08, 1);
  ctx.drawImage(off, 0, 0);
  ctx.restore();
}
