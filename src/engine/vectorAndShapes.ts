import {
  FrameCell,
  FrameDividerData,
  ShapeSettings,
  TextLayerData,
  ToolId,
  VectorPathData,
} from '../types/editor';
import { clamp } from '../utils/colorUtils';

export function drawShapeOnContext(
  ctx: CanvasRenderingContext2D,
  tool: ToolId,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  settings: ShapeSettings,
  constrainShift = false
) {
  let sx0 = x0;
  let sy0 = y0;
  let sx1 = x1;
  let sy1 = y1;

  if (constrainShift && tool !== 'line' && tool !== 'arrow') {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const size = Math.max(Math.abs(dx), Math.abs(dy));
    sx1 = x0 + Math.sign(dx || 1) * size;
    sy1 = y0 + Math.sign(dy || 1) * size;
  }

  const left = Math.min(sx0, sx1);
  const top = Math.min(sy0, sy1);
  const w = Math.abs(sx1 - sx0);
  const h = Math.abs(sy1 - sy0);
  if (w < 1 && h < 1) return;

  ctx.save();
  ctx.globalAlpha = clamp(settings.opacity / 100, 0, 1);
  ctx.fillStyle = settings.fillColor;
  ctx.strokeStyle = settings.strokeColor;
  ctx.lineWidth = Math.max(1, settings.strokeWidth);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const cx = left + w / 2;
  const cy = top + h / 2;

  ctx.beginPath();
  let isOpenStrokeOnly = false;

  switch (tool) {
    case 'rectangle': {
      ctx.rect(left, top, w, h);
      break;
    }
    case 'roundedRect': {
      const r = clamp(settings.cornerRadius, 0, Math.min(w, h) / 2);
      ctx.roundRect(left, top, w, h, r);
      break;
    }
    case 'circle': {
      const rad = Math.max(w, h) / 2;
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      break;
    }
    case 'ellipse': {
      ctx.ellipse(cx, cy, Math.max(1, w / 2), Math.max(1, h / 2), 0, 0, Math.PI * 2);
      break;
    }
    case 'line': {
      isOpenStrokeOnly = true;
      ctx.moveTo(sx0, sy0);
      ctx.lineTo(sx1, sy1);
      break;
    }
    case 'arrow': {
      isOpenStrokeOnly = true;
      const headLen = Math.max(12, settings.strokeWidth * 3.5);
      const angle = Math.atan2(sy1 - sy0, sx1 - sy0);
      ctx.moveTo(sx0, sy0);
      ctx.lineTo(sx1, sy1);
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx1 - headLen * Math.cos(angle - Math.PI / 6), sy1 - headLen * Math.sin(angle - Math.PI / 6));
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx1 - headLen * Math.cos(angle + Math.PI / 6), sy1 - headLen * Math.sin(angle + Math.PI / 6));
      break;
    }
    case 'triangle': {
      ctx.moveTo(cx, top);
      ctx.lineTo(left + w, top + h);
      ctx.lineTo(left, top + h);
      ctx.closePath();
      break;
    }
    case 'polygon': {
      const sides = clamp(settings.polygonSides, 3, 16);
      const rx = w / 2;
      const ry = h / 2;
      for (let i = 0; i < sides; i++) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / sides;
        const px = cx + Math.cos(a) * rx;
        const py = cy + Math.sin(a) * ry;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    }
    case 'star': {
      const pts = clamp(settings.starPoints, 3, 16);
      const outerRx = w / 2;
      const outerRy = h / 2;
      const innerRx = outerRx * 0.44;
      const innerRy = outerRy * 0.44;
      for (let i = 0; i < pts * 2; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / pts;
        const rx = i % 2 === 0 ? outerRx : innerRx;
        const ry = i % 2 === 0 ? outerRy : innerRy;
        const px = cx + Math.cos(a) * rx;
        const py = cy + Math.sin(a) * ry;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    }
    case 'heart': {
      const topCurveHeight = h * 0.3;
      ctx.moveTo(cx, top + topCurveHeight);
      ctx.bezierCurveTo(cx, top, left, top, left, top + topCurveHeight);
      ctx.bezierCurveTo(left, top + (h + topCurveHeight) / 2, cx, top + (h + topCurveHeight) / 1.4, cx, top + h);
      ctx.bezierCurveTo(cx, top + (h + topCurveHeight) / 1.4, left + w, top + (h + topCurveHeight) / 2, left + w, top + topCurveHeight);
      ctx.bezierCurveTo(left + w, top, cx, top, cx, top + topCurveHeight);
      ctx.closePath();
      break;
    }
    case 'customShape': {
      drawCustomShapePath(ctx, settings.customShapeType, left, top, w, h);
      break;
    }
    default:
      ctx.rect(left, top, w, h);
  }

  if (!isOpenStrokeOnly && settings.fillEnabled) {
    ctx.fill();
  }
  if ((settings.strokeEnabled || isOpenStrokeOnly) && settings.strokeWidth > 0) {
    ctx.stroke();
  }

  ctx.restore();
}

function drawCustomShapePath(
  ctx: CanvasRenderingContext2D,
  kind: ShapeSettings['customShapeType'],
  left: number,
  top: number,
  w: number,
  h: number
) {
  const cx = left + w / 2;
  const cy = top + h / 2;

  if (kind === 'diamond') {
    ctx.moveTo(cx, top);
    ctx.lineTo(left + w, cy);
    ctx.lineTo(cx, top + h);
    ctx.lineTo(left, cy);
    ctx.closePath();
  } else if (kind === 'hexagon') {
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const px = cx + Math.cos(a) * (w / 2);
      const py = cy + Math.sin(a) * (h / 2);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else if (kind === 'speechBubble') {
    const bh = h * 0.8;
    const r = Math.min(18, w * 0.15, bh * 0.2);
    ctx.moveTo(left + r, top);
    ctx.lineTo(left + w - r, top);
    ctx.quadraticCurveTo(left + w, top, left + w, top + r);
    ctx.lineTo(left + w, top + bh - r);
    ctx.quadraticCurveTo(left + w, top + bh, left + w - r, top + bh);
    ctx.lineTo(left + w * 0.45, top + bh);
    ctx.lineTo(left + w * 0.22, top + h);
    ctx.lineTo(left + w * 0.28, top + bh);
    ctx.lineTo(left + r, top + bh);
    ctx.quadraticCurveTo(left, top + bh, left, top + bh - r);
    ctx.lineTo(left, top + r);
    ctx.quadraticCurveTo(left, top, left + r, top);
    ctx.closePath();
  } else if (kind === 'wave') {
    ctx.moveTo(left, top + h * 0.45);
    ctx.bezierCurveTo(left + w * 0.25, top, left + w * 0.45, top + h * 0.7, left + w * 0.7, top + h * 0.35);
    ctx.bezierCurveTo(left + w * 0.85, top + h * 0.15, left + w * 0.95, top + h * 0.4, left + w, top + h * 0.5);
    ctx.lineTo(left + w, top + h);
    ctx.lineTo(left, top + h);
    ctx.closePath();
  } else {
    // moon crescent
    const r = Math.min(w, h) / 2;
    ctx.arc(cx, cy, r, Math.PI * 0.28, Math.PI * 1.72, false);
    ctx.quadraticCurveTo(cx - r * 0.05, cy, cx + Math.cos(Math.PI * 0.28) * r, cy + Math.sin(Math.PI * 0.28) * r);
    ctx.closePath();
  }
}

export function renderTextLayer(ctx: CanvasRenderingContext2D, data: TextLayerData) {
  ctx.save();
  const weight = data.bold ? '700' : '400';
  const style = data.italic ? 'italic' : 'normal';
  ctx.font = `${style} ${weight} ${data.fontSize}px "${data.fontFamily}", sans-serif`;
  ctx.fillStyle = data.color;
  ctx.textBaseline = 'top';
  ctx.textAlign = data.align;
  if ('letterSpacing' in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${data.letterSpacing}px`;
  }

  const lines = data.text.split('\n');
  const lineHeight = data.fontSize * 1.25;
  const anchorX =
    data.align === 'center' ? data.x + data.width / 2 : data.align === 'right' ? data.x + data.width : data.x;

  lines.forEach((line, i) => {
    const ly = data.y + i * lineHeight;
    ctx.fillText(line, anchorX, ly);
    if (data.underline && line.length > 0) {
      const m = ctx.measureText(line);
      let ux = anchorX;
      if (data.align === 'center') ux = anchorX - m.width / 2;
      else if (data.align === 'right') ux = anchorX - m.width;
      ctx.strokeStyle = data.color;
      ctx.lineWidth = Math.max(1.5, data.fontSize * 0.06);
      ctx.beginPath();
      ctx.moveTo(ux, ly + data.fontSize * 1.02);
      ctx.lineTo(ux + m.width, ly + data.fontSize * 1.02);
      ctx.stroke();
    }
  });
  ctx.restore();
}

export function measureTextBox(data: TextLayerData): { width: number; height: number } {
  const off = document.createElement('canvas');
  const ctx = off.getContext('2d')!;
  const weight = data.bold ? '700' : '400';
  const style = data.italic ? 'italic' : 'normal';
  ctx.font = `${style} ${weight} ${data.fontSize}px "${data.fontFamily}", sans-serif`;
  const lines = data.text.split('\n');
  let maxW = 60;
  for (const l of lines) {
    const extra = Math.max(0, l.length - 1) * data.letterSpacing;
    maxW = Math.max(maxW, ctx.measureText(l).width + extra + 12);
  }
  const height = Math.max(data.fontSize * 1.3, lines.length * data.fontSize * 1.25 + 8);
  return { width: Math.ceil(maxW), height: Math.ceil(height) };
}

export function renderVectorPath(ctx: CanvasRenderingContext2D, v: VectorPathData) {
  if (v.points.length === 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(v.points[0].x, v.points[0].y);
  for (let i = 1; i < v.points.length; i++) {
    const prev = v.points[i - 1];
    const curr = v.points[i];
    if (prev.cx2 !== undefined && prev.cy2 !== undefined && curr.cx1 !== undefined && curr.cy1 !== undefined) {
      ctx.bezierCurveTo(prev.cx2, prev.cy2, curr.cx1, curr.cy1, curr.x, curr.y);
    } else if (curr.cx1 !== undefined && curr.cy1 !== undefined) {
      ctx.quadraticCurveTo(curr.cx1, curr.cy1, curr.x, curr.y);
    } else {
      ctx.lineTo(curr.x, curr.y);
    }
  }
  if (v.closed) {
    ctx.closePath();
    if (v.fillEnabled) {
      ctx.fillStyle = v.fillColor;
      ctx.fill();
    }
  }
  if (v.strokeEnabled && v.strokeWidth > 0) {
    ctx.strokeStyle = v.strokeColor;
    ctx.lineWidth = v.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  ctx.restore();
}

export function createFramePreset(
  preset: '2x2' | '2col' | '2row' | '3x2' | '1+2',
  docW: number,
  docH: number,
  gutter = 14
): FrameCell[] {
  const pad = gutter;
  const uw = docW - pad * 2;
  const uh = docH - pad * 2;
  const mk = (x: number, y: number, width: number, height: number): FrameCell => ({
    id: crypto.randomUUID(),
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  });

  if (preset === '2col') {
    const cw = (uw - gutter) / 2;
    return [mk(pad, pad, cw, uh), mk(pad + cw + gutter, pad, cw, uh)];
  }
  if (preset === '2row') {
    const ch = (uh - gutter) / 2;
    return [mk(pad, pad, uw, ch), mk(pad, pad + ch + gutter, uw, ch)];
  }
  if (preset === '3x2') {
    const cw = (uw - gutter * 2) / 3;
    const ch = (uh - gutter) / 2;
    return [
      mk(pad, pad, cw, ch),
      mk(pad + cw + gutter, pad, cw, ch),
      mk(pad + (cw + gutter) * 2, pad, cw, ch),
      mk(pad, pad + ch + gutter, cw, ch),
      mk(pad + cw + gutter, pad + ch + gutter, cw, ch),
      mk(pad + (cw + gutter) * 2, pad + ch + gutter, cw, ch),
    ];
  }
  if (preset === '1+2') {
    const topH = uh * 0.45 - gutter / 2;
    const botH = uh - topH - gutter;
    const cw = (uw - gutter) / 2;
    return [
      mk(pad, pad, uw, topH),
      mk(pad, pad + topH + gutter, cw, botH),
      mk(pad + cw + gutter, pad + topH + gutter, cw, botH),
    ];
  }
  // 2x2
  const cw = (uw - gutter) / 2;
  const ch = (uh - gutter) / 2;
  return [
    mk(pad, pad, cw, ch),
    mk(pad + cw + gutter, pad, cw, ch),
    mk(pad, pad + ch + gutter, cw, ch),
    mk(pad + cw + gutter, pad + ch + gutter, cw, ch),
  ];
}

export function renderFrameDivider(ctx: CanvasRenderingContext2D, frame: FrameDividerData, isInteractive: boolean) {
  ctx.save();
  for (const cell of frame.cells) {
    if (cell.fillColor) {
      ctx.fillStyle = cell.fillColor;
      ctx.fillRect(cell.x, cell.y, cell.width, cell.height);
    }
    ctx.strokeStyle = frame.borderColor;
    ctx.lineWidth = Math.max(1, frame.borderWidth);
    ctx.strokeRect(cell.x, cell.y, cell.width, cell.height);

    if (isInteractive && cell.id === frame.selectedCellId) {
      ctx.save();
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(cell.x - 2, cell.y - 2, cell.width + 4, cell.height + 4);
      ctx.restore();
    }
  }
  ctx.restore();
}
