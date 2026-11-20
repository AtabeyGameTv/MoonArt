import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, FilePlus2, Images, Upload, X } from 'lucide-react';
import {
  beginBrushStroke,
  continueBrushStroke,
  finishBrushStroke,
  renderBrushPreviewCurve,
  StrokeContextState,
} from '../engine/brushEngine';
import { applyFiltersToCanvas, applyGradientToCanvas, floodFillCanvas } from '../engine/filterEngine';
import {
  createEllipseSelection,
  createPolygonSelection,
  createRectSelection,
  createMagicWandSelection,
  renderSelectionOverlay,
} from '../engine/selectionEngine';
import {
  drawShapeOnContext,
  measureTextBox,
  renderFrameDivider,
  renderTextLayer,
  renderVectorPath,
} from '../engine/vectorAndShapes';
import {
  BrushSettings,
  CropRect,
  DocumentState,
  FilterSettings,
  FrameCell,
  GradientSettings,
  Layer,
  SelectionMask,
  SelectionSettings,
  ShapeSettings,
  TextLayerData,
  TextSettings,
  ToolId,
  VectorPoint,
} from '../types/editor';
import { clamp, rgbToHex } from '../utils/colorUtils';
import { MoonArtLogo } from './ToolIcons';

interface CanvasWorkspaceProps {
  doc: DocumentState | null;
  canvasMap: React.MutableRefObject<Map<string, HTMLCanvasElement>>;
  renderTick: number;
  activeTool: ToolId;
  zoom: number;
  pan: { x: number; y: number };
  canvasRotation: number;
  showGrid: boolean;
  spacePressed: boolean;
  foregroundColor: string;
  backgroundColor: string;
  brushSettings: BrushSettings;
  shapeSettings: ShapeSettings;
  textSettings: TextSettings;
  selectionSettings: SelectionSettings;
  gradientSettings: GradientSettings;
  filterSettings: FilterSettings;
  selectionMask: SelectionMask | null;
  cropRect: CropRect | null;
  cloneSource: { x: number; y: number } | null;
  onSetZoom: (z: number) => void;
  onSetPan: (p: { x: number; y: number }) => void;
  onCursorMove: (pos: { x: number; y: number } | null) => void;
  onOpenNewCanvas: () => void;
  onTriggerUpload: () => void;
  onDropFiles: (files: FileList | File[]) => void;
  onCommitHistory: (label: string) => void;
  onRequestRender: () => void;
  onSetSelectionMask: (mask: SelectionMask | null) => void;
  onSampleColor: (hex: string) => void;
  onSetCloneSource: (pt: { x: number; y: number }) => void;
  onUpdateLayer: (layerId: string, updater: (l: Layer) => Layer, commitLabel?: string) => void;
  onAddTextLayer: (data: TextLayerData) => void;
  onCreateFrameLayerWithRect: (rect: { x: number; y: number; width: number; height: number }) => void;
  onAddVectorLayer: (points: VectorPoint[], closed: boolean) => void;
  onUpdateCropRect: (rect: CropRect) => void;
  onApplyCrop: () => void;
  onCancelCrop: () => void;
  onChangeBrushSettings: (patch: Partial<BrushSettings>) => void;
  onNotifyError: (title: string, msg: string) => void;
  onOpenGallery?: (tab?: 'personal' | 'shared') => void;
}

const BRUSH_TOOL_SET = new Set<ToolId>([
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
  'eraser',
  'softEraser',
  'smudge',
  'blur',
  'sharpen',
  'clone',
  'dodge',
  'burn',
]);

const SHAPE_TOOL_SET = new Set<ToolId>([
  'rectangle',
  'roundedRect',
  'circle',
  'ellipse',
  'line',
  'arrow',
  'polygon',
  'star',
  'triangle',
  'heart',
  'customShape',
]);

export const CanvasWorkspace: React.FC<CanvasWorkspaceProps> = (props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const hudPreviewCanvasRef = useRef<HTMLCanvasElement>(null);
  const filterPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const filterSourceSnapshotRef = useRef<{ layerId: string; canvas: HTMLCanvasElement } | null>(null);

  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [cursorScreen, setCursorScreen] = useState<{ x: number; y: number } | null>(null);
  const [editingText, setEditingText] = useState<{
    layerId: string | null;
    x: number;
    y: number;
    value: string;
  } | null>(null);

  // Poly-lasso & Vector in-progress points
  const [polyPoints, setPolyPoints] = useState<{ x: number; y: number }[]>([]);
  const [vectorDraftPoints, setVectorDraftPoints] = useState<VectorPoint[]>([]);

  // Active pointer interaction ref
  const interactionRef = useRef<{
    mode:
      | 'none'
      | 'pan'
      | 'stroke'
      | 'shape'
      | 'gradient'
      | 'selectRect'
      | 'selectEllipse'
      | 'lasso'
      | 'transformMove'
      | 'transformResize'
      | 'transformRotate'
      | 'cropMove'
      | 'cropResize'
      | 'frameDrag'
      | 'frameMove'
      | 'frameResize';
    startScreenX: number;
    startScreenY: number;
    startPanX: number;
    startPanY: number;
    startDocX: number;
    startDocY: number;
    currDocX: number;
    currDocY: number;
    shiftKey: boolean;
    handle?: string;
    initialTransform?: Layer['transform'];
    initialCrop?: CropRect;
    initialCell?: FrameCell;
    lassoPoints?: { x: number; y: number }[];
    strokeState?: StrokeContextState;
  }>({
    mode: 'none',
    startScreenX: 0,
    startScreenY: 0,
    startPanX: 0,
    startPanY: 0,
    startDocX: 0,
    startDocY: 0,
    currDocX: 0,
    currDocY: 0,
    shiftKey: false,
  });

  // Reset draft states when tool changes
  useEffect(() => {
    setPolyPoints([]);
    setVectorDraftPoints([]);
    setEditingText(null);
  }, [props.activeTool]);

  // Render live mini stroke preview in Quick Drawing HUD
  useEffect(() => {
    if (!props.doc || !BRUSH_TOOL_SET.has(props.activeTool)) return;
    if (hudPreviewCanvasRef.current) {
      renderBrushPreviewCurve(
        hudPreviewCanvasRef.current,
        props.activeTool,
        props.brushSettings,
        props.foregroundColor,
        props.backgroundColor
      );
    }
  }, [props.doc, props.activeTool, props.brushSettings, props.foregroundColor, props.backgroundColor]);

  // Live FX Filter preview setup
  useEffect(() => {
    if (props.activeTool === 'filter' && props.doc) {
      const activeLayer = props.doc.layers.find((l) => l.id === props.doc?.activeLayerId);
      if (activeLayer && activeLayer.type === 'raster') {
        const src = props.canvasMap.current.get(activeLayer.id);
        if (src) {
          if (
            !filterSourceSnapshotRef.current ||
            filterSourceSnapshotRef.current.layerId !== activeLayer.id
          ) {
            const copy = document.createElement('canvas');
            copy.width = src.width;
            copy.height = src.height;
            copy.getContext('2d')?.drawImage(src, 0, 0);
            filterSourceSnapshotRef.current = { layerId: activeLayer.id, canvas: copy };
          }
          if (!filterPreviewCanvasRef.current) {
            filterPreviewCanvasRef.current = document.createElement('canvas');
          }
          applyFiltersToCanvas(
            filterSourceSnapshotRef.current.canvas,
            filterPreviewCanvasRef.current,
            props.filterSettings,
            props.selectionMask
          );
          props.onRequestRender();
        }
      }
    } else {
      filterSourceSnapshotRef.current = null;
      filterPreviewCanvasRef.current = null;
    }
  }, [props.activeTool, props.filterSettings, props.doc?.activeLayerId, props.selectionMask]);

  // Screen -> Document coordinate transformation (handles pan, zoom, and rotation)
  const screenToDoc = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      if (!containerRef.current || !props.doc) return { x: 0, y: 0 };
      const rect = containerRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2 + props.pan.x;
      const cy = rect.top + rect.height / 2 + props.pan.y;
      const dx = (clientX - cx) / props.zoom;
      const dy = (clientY - cy) / props.zoom;
      const rad = (-props.canvasRotation * Math.PI) / 180;
      const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
      const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
      return {
        x: rx + props.doc.width / 2,
        y: ry + props.doc.height / 2,
      };
    },
    [props.doc, props.zoom, props.pan, props.canvasRotation]
  );

  // Main Display Composite Renderer
  const renderMainCanvas = useCallback(() => {
    const canvas = displayCanvasRef.current;
    const doc = props.doc;
    if (!canvas || !doc) return;

    if (canvas.width !== doc.width || canvas.height !== doc.height) {
      canvas.width = doc.width;
      canvas.height = doc.height;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, doc.width, doc.height);

    // Document background
    if (doc.background !== 'transparent') {
      if (doc.background === 'white') ctx.fillStyle = '#FFFFFF';
      else if (doc.background === 'black') ctx.fillStyle = '#000000';
      else if (doc.background === 'ocean') ctx.fillStyle = '#041524';
      else ctx.fillStyle = doc.background;
      ctx.fillRect(0, 0, doc.width, doc.height);
    }

    // Draw layers bottom -> top
    for (let i = doc.layers.length - 1; i >= 0; i--) {
      const layer = doc.layers[i];
      if (!layer.visible) continue;

      ctx.save();
      ctx.globalAlpha = clamp(layer.opacity / 100, 0, 1);
      ctx.globalCompositeOperation = layer.blendMode;

      const { x, y, scaleX, scaleY, rotation } = layer.transform;
      const cx = doc.width / 2 + x;
      const cy = doc.height / 2 + y;
      ctx.translate(cx, cy);
      if (rotation !== 0) ctx.rotate((rotation * Math.PI) / 180);
      if (scaleX !== 1 || scaleY !== 1) ctx.scale(scaleX, scaleY);
      ctx.translate(-doc.width / 2, -doc.height / 2);

      if (layer.type === 'raster') {
        if (
          props.activeTool === 'filter' &&
          layer.id === doc.activeLayerId &&
          filterPreviewCanvasRef.current
        ) {
          ctx.drawImage(filterPreviewCanvasRef.current, 0, 0);
        } else {
          const lc = props.canvasMap.current.get(layer.id);
          if (lc) ctx.drawImage(lc, 0, 0);
          // Composite active scratch stroke buffer at true stroke opacity
          const activeStroke = interactionRef.current;
          if (
            activeStroke.mode === 'stroke' &&
            layer.id === doc.activeLayerId &&
            activeStroke.strokeState?.scratchCanvas
          ) {
            ctx.save();
            ctx.globalAlpha = clamp((layer.opacity / 100) * (props.brushSettings.opacity / 100), 0, 1);
            ctx.drawImage(activeStroke.strokeState.scratchCanvas, 0, 0);
            ctx.restore();
          }
        }
      } else if (layer.type === 'text' && layer.textData) {
        if (!(editingText && editingText.layerId === layer.id)) {
          renderTextLayer(ctx, layer.textData);
        }
      } else if (layer.type === 'frame' && layer.frameData) {
        renderFrameDivider(ctx, layer.frameData, props.activeTool === 'frameDivider');
      } else if (layer.type === 'vector' && layer.vectorData) {
        renderVectorPath(ctx, layer.vectorData);
      }

      ctx.restore();
    }
  }, [docOrNull(props.doc), props.renderTick, props.activeTool, editingText]);

  function docOrNull(d: DocumentState | null) {
    return d;
  }

  useEffect(() => {
    renderMainCanvas();
  }, [renderMainCanvas]);

  // Animated Overlay Renderer (Selection Marching Ants, Transform Handles, Crop, Draft Shapes, Vector, Frame Handles)
  useEffect(() => {
    if (!props.doc) return;
    let animId = 0;
    let offset = 0;

    const drawOverlay = () => {
      const ov = overlayCanvasRef.current;
      const doc = props.doc;
      if (!ov || !doc) return;
      if (ov.width !== doc.width || ov.height !== doc.height) {
        ov.width = doc.width;
        ov.height = doc.height;
      }
      const ctx = ov.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, doc.width, doc.height);

      // Pixel Grid when toggled
      if (props.showGrid && props.zoom >= 2) {
        ctx.save();
        ctx.strokeStyle = 'rgba(103, 232, 249, 0.14)';
        ctx.lineWidth = 1 / props.zoom;
        const step = props.zoom >= 8 ? 1 : 16;
        ctx.beginPath();
        for (let gx = 0; gx <= doc.width; gx += step) {
          ctx.moveTo(gx, 0);
          ctx.lineTo(gx, doc.height);
        }
        for (let gy = 0; gy <= doc.height; gy += step) {
          ctx.moveTo(0, gy);
          ctx.lineTo(doc.width, gy);
        }
        ctx.stroke();
        ctx.restore();
      }

      // Selection Marching Ants
      if (props.selectionMask) {
        renderSelectionOverlay(ctx, props.selectionMask, offset);
      }

      const inter = interactionRef.current;

      // Live Draft Shape Preview
      if (inter.mode === 'shape') {
        drawShapeOnContext(
          ctx,
          props.activeTool,
          inter.startDocX,
          inter.startDocY,
          inter.currDocX,
          inter.currDocY,
          props.shapeSettings,
          inter.shiftKey
        );
      }

      // Live Gradient Line
      if (inter.mode === 'gradient') {
        ctx.save();
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 2 / props.zoom;
        ctx.beginPath();
        ctx.moveTo(inter.startDocX, inter.startDocY);
        ctx.lineTo(inter.currDocX, inter.currDocY);
        ctx.stroke();
        ctx.fillStyle = '#22d3ee';
        ctx.beginPath();
        ctx.arc(inter.startDocX, inter.startDocY, 4 / props.zoom, 0, Math.PI * 2);
        ctx.arc(inter.currDocX, inter.currDocY, 4 / props.zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Live Selection Drag Preview
      if (inter.mode === 'selectRect') {
        ctx.save();
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 1.5 / props.zoom;
        ctx.setLineDash([5 / props.zoom, 5 / props.zoom]);
        ctx.strokeRect(
          inter.startDocX,
          inter.startDocY,
          inter.currDocX - inter.startDocX,
          inter.currDocY - inter.startDocY
        );
        ctx.restore();
      } else if (inter.mode === 'selectEllipse') {
        const x = Math.min(inter.startDocX, inter.currDocX);
        const y = Math.min(inter.startDocY, inter.currDocY);
        const w = Math.abs(inter.currDocX - inter.startDocX);
        const h = Math.abs(inter.currDocY - inter.startDocY);
        ctx.save();
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 1.5 / props.zoom;
        ctx.setLineDash([5 / props.zoom, 5 / props.zoom]);
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else if (inter.mode === 'lasso' && inter.lassoPoints && inter.lassoPoints.length > 1) {
        ctx.save();
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 1.5 / props.zoom;
        ctx.setLineDash([5 / props.zoom, 4 / props.zoom]);
        ctx.beginPath();
        ctx.moveTo(inter.lassoPoints[0].x, inter.lassoPoints[0].y);
        for (let i = 1; i < inter.lassoPoints.length; i++) {
          ctx.lineTo(inter.lassoPoints[i].x, inter.lassoPoints[i].y);
        }
        ctx.stroke();
        ctx.restore();
      }

      // Polygon Lasso in-progress points
      if (props.activeTool === 'polygonLasso' && polyPoints.length > 0) {
        ctx.save();
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 1.5 / props.zoom;
        ctx.beginPath();
        ctx.moveTo(polyPoints[0].x, polyPoints[0].y);
        for (let i = 1; i < polyPoints.length; i++) {
          ctx.lineTo(polyPoints[i].x, polyPoints[i].y);
        }
        ctx.stroke();
        for (const pt of polyPoints) {
          ctx.fillStyle = '#22d3ee';
          ctx.fillRect(pt.x - 3 / props.zoom, pt.y - 3 / props.zoom, 6 / props.zoom, 6 / props.zoom);
        }
        ctx.restore();
      }

      // Vector in-progress points
      if (props.activeTool === 'vector' && vectorDraftPoints.length > 0) {
        ctx.save();
        renderVectorPath(ctx, {
          points: vectorDraftPoints,
          closed: false,
          strokeColor: props.foregroundColor,
          strokeWidth: Math.max(2, props.shapeSettings.strokeWidth),
          fillColor: props.shapeSettings.fillColor,
          fillEnabled: false,
          strokeEnabled: true,
        });
        for (const pt of vectorDraftPoints) {
          ctx.fillStyle = '#04111d';
          ctx.strokeStyle = '#22d3ee';
          ctx.lineWidth = 1.5 / props.zoom;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 4.5 / props.zoom, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      }

      // Live ibisPaint Stabilizer Tether & Tip Ring during active stroke
      if (inter.mode === 'stroke' && inter.strokeState && props.brushSettings.stabilizer > 0) {
        const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
        if (activeLayer) {
          const tipDoc = layerLocalToDoc(
            inter.strokeState.stabilizedX,
            inter.strokeState.stabilizedY,
            activeLayer,
            doc
          );
          const tetherDist = Math.hypot(inter.currDocX - tipDoc.x, inter.currDocY - tipDoc.y);
          if (tetherDist > 1.5 / props.zoom) {
            ctx.save();
            ctx.strokeStyle = 'rgba(34, 211, 238, 0.72)';
            ctx.lineWidth = 1.4 / props.zoom;
            ctx.setLineDash([4 / props.zoom, 3 / props.zoom]);
            ctx.beginPath();
            ctx.moveTo(tipDoc.x, tipDoc.y);
            ctx.lineTo(inter.currDocX, inter.currDocY);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = '#22d3ee';
            ctx.beginPath();
            ctx.arc(tipDoc.x, tipDoc.y, 2.8 / props.zoom, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
      }

      // Frame drag preview
      if (inter.mode === 'frameDrag') {
        ctx.save();
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 2 / props.zoom;
        ctx.strokeRect(
          inter.startDocX,
          inter.startDocY,
          inter.currDocX - inter.startDocX,
          inter.currDocY - inter.startDocY
        );
        ctx.restore();
      }

      // Frame Divider Resize Handles on Selected Cell
      if (props.activeTool === 'frameDivider') {
        const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
        if (activeLayer?.type === 'frame' && activeLayer.frameData?.selectedCellId) {
          const cell = activeLayer.frameData.cells.find(
            (c) => c.id === activeLayer.frameData?.selectedCellId
          );
          if (cell) {
            const hs = 8 / props.zoom;
            ctx.save();
            ctx.fillStyle = '#22d3ee';
            ctx.strokeStyle = '#04111d';
            ctx.lineWidth = 1.5 / props.zoom;
            const corners = [
              [cell.x, cell.y],
              [cell.x + cell.width, cell.y],
              [cell.x, cell.y + cell.height],
              [cell.x + cell.width, cell.y + cell.height],
            ];
            for (const [hx, hy] of corners) {
              ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
              ctx.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs);
            }
            ctx.restore();
          }
        }
      }

      // Transform Bounding Box (Move / Transform tool)
      if (props.activeTool === 'move' || props.activeTool === 'selection') {
        const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
        if (activeLayer) {
          const box = getLayerTransformBox(doc, activeLayer);
          ctx.save();
          ctx.translate(box.cx, box.cy);
          ctx.rotate((activeLayer.transform.rotation * Math.PI) / 180);
          const hw = box.w / 2;
          const hh = box.h / 2;
          ctx.strokeStyle = '#22d3ee';
          ctx.lineWidth = 1.5 / props.zoom;
          ctx.strokeRect(-hw, -hh, box.w, box.h);

          // Rotation Stem & Knob
          const rotDist = 26 / props.zoom;
          ctx.beginPath();
          ctx.moveTo(0, -hh);
          ctx.lineTo(0, -hh - rotDist);
          ctx.stroke();
          ctx.fillStyle = '#22d3ee';
          ctx.beginPath();
          ctx.arc(0, -hh - rotDist, 5 / props.zoom, 0, Math.PI * 2);
          ctx.fill();

          // 8 Resize Handles
          const hs = 8 / props.zoom;
          ctx.fillStyle = '#E0F7FA';
          ctx.strokeStyle = '#04111d';
          const handles = [
            [-hw, -hh],
            [0, -hh],
            [hw, -hh],
            [hw, 0],
            [hw, hh],
            [0, hh],
            [-hw, hh],
            [-hw, 0],
          ];
          for (const [hx, hy] of handles) {
            ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
            ctx.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs);
          }
          ctx.restore();
        }
      }

      // Crop Overlay
      if (props.activeTool === 'crop' && props.cropRect) {
        const cr = props.cropRect;
        ctx.save();
        ctx.fillStyle = 'rgba(2, 10, 18, 0.65)';
        ctx.beginPath();
        ctx.rect(0, 0, doc.width, doc.height);
        ctx.rect(cr.x, cr.y, cr.width, cr.height);
        ctx.fill('evenodd');

        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 2 / props.zoom;
        ctx.strokeRect(cr.x, cr.y, cr.width, cr.height);

        // Rule of thirds
        ctx.strokeStyle = 'rgba(224, 247, 250, 0.35)';
        ctx.lineWidth = 1 / props.zoom;
        ctx.beginPath();
        ctx.moveTo(cr.x + cr.width / 3, cr.y);
        ctx.lineTo(cr.x + cr.width / 3, cr.y + cr.height);
        ctx.moveTo(cr.x + (cr.width * 2) / 3, cr.y);
        ctx.lineTo(cr.x + (cr.width * 2) / 3, cr.y + cr.height);
        ctx.moveTo(cr.x, cr.y + cr.height / 3);
        ctx.lineTo(cr.x + cr.width, cr.y + cr.height / 3);
        ctx.moveTo(cr.x, cr.y + (cr.height * 2) / 3);
        ctx.lineTo(cr.x + cr.width, cr.y + (cr.height * 2) / 3);
        ctx.stroke();

        // Corner handles
        const hs = 10 / props.zoom;
        ctx.fillStyle = '#22d3ee';
        for (const [hx, hy] of [
          [cr.x, cr.y],
          [cr.x + cr.width, cr.y],
          [cr.x, cr.y + cr.height],
          [cr.x + cr.width, cr.y + cr.height],
        ]) {
          ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
        }
        ctx.restore();
      }

      // Clone source marker
      if (props.activeTool === 'clone' && props.cloneSource) {
        const cs = props.cloneSource;
        const r = 8 / props.zoom;
        ctx.save();
        ctx.strokeStyle = '#2dd4bf';
        ctx.lineWidth = 1.5 / props.zoom;
        ctx.beginPath();
        ctx.moveTo(cs.x - r, cs.y);
        ctx.lineTo(cs.x + r, cs.y);
        ctx.moveTo(cs.x, cs.y - r);
        ctx.lineTo(cs.x, cs.y + r);
        ctx.arc(cs.x, cs.y, r * 0.7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      offset = (offset + 0.5) % 10;
      if (props.selectionMask) {
        animId = requestAnimationFrame(drawOverlay);
      }
    };

    drawOverlay();
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [
    props.doc,
    props.renderTick,
    props.selectionMask,
    props.activeTool,
    props.zoom,
    props.showGrid,
    props.cropRect,
    props.cloneSource,
    polyPoints,
    vectorDraftPoints,
    props.shapeSettings,
    props.foregroundColor,
  ]);

  function getLayerTransformBox(doc: DocumentState, layer: Layer) {
    const cx = doc.width / 2 + layer.transform.x;
    const cy = doc.height / 2 + layer.transform.y;
    const w = doc.width * Math.abs(layer.transform.scaleX);
    const h = doc.height * Math.abs(layer.transform.scaleY);
    return { cx, cy, w, h };
  }

  const getActiveRasterCanvas = (): HTMLCanvasElement | null => {
    if (!props.doc) return null;
    const activeLayer = props.doc.layers.find((l) => l.id === props.doc?.activeLayerId);
    if (!activeLayer) {
      props.onNotifyError('No Active Layer', 'Please select or create a layer first.');
      return null;
    }
    if (activeLayer.locked) {
      props.onNotifyError('Layer Locked', `"${activeLayer.name}" is locked. Unlock it in the Layers panel to edit.`);
      return null;
    }
    if (!activeLayer.visible) {
      props.onNotifyError('Layer Hidden', `"${activeLayer.name}" is currently hidden.`);
      return null;
    }
    if (activeLayer.type !== 'raster') {
      props.onNotifyError(
        'Non-Raster Layer',
        `"${activeLayer.name}" is a ${activeLayer.type} layer. Create or select a raster layer to use pixel brushes.`
      );
      return null;
    }
    return props.canvasMap.current.get(activeLayer.id) ?? null;
  };

  // Transform docPoint into layer-local pixels for painting on transformed raster layers
  const docToLayerLocal = (docX: number, docY: number, layer: Layer, doc: DocumentState) => {
    const cx = doc.width / 2 + layer.transform.x;
    const cy = doc.height / 2 + layer.transform.y;
    const dx = docX - cx;
    const dy = docY - cy;
    const rad = (-layer.transform.rotation * Math.PI) / 180;
    const rx = (dx * Math.cos(rad) - dy * Math.sin(rad)) / (layer.transform.scaleX || 1);
    const ry = (dx * Math.sin(rad) + dy * Math.cos(rad)) / (layer.transform.scaleY || 1);
    return {
      x: rx + doc.width / 2,
      y: ry + doc.height / 2,
    };
  };

  const layerLocalToDoc = (localX: number, localY: number, layer: Layer, doc: DocumentState) => {
    const rx = (localX - doc.width / 2) * (layer.transform.scaleX || 1);
    const ry = (localY - doc.height / 2) * (layer.transform.scaleY || 1);
    const rad = (layer.transform.rotation * Math.PI) / 180;
    const dx = rx * Math.cos(rad) - ry * Math.sin(rad);
    const dy = rx * Math.sin(rad) + ry * Math.cos(rad);
    return {
      x: dx + doc.width / 2 + layer.transform.x,
      y: dy + doc.height / 2 + layer.transform.y,
    };
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (!props.doc) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const nextZoom = clamp(props.zoom * factor, 0.1, 10);
    if (!containerRef.current) {
      props.onSetZoom(nextZoom);
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    const mx = e.clientX - (rect.left + rect.width / 2);
    const my = e.clientY - (rect.top + rect.height / 2);
    const scaleRatio = nextZoom / props.zoom;
    props.onSetPan({
      x: mx - (mx - props.pan.x) * scaleRatio,
      y: my - (my - props.pan.y) * scaleRatio,
    });
    props.onSetZoom(nextZoom);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!props.doc) return;
    const doc = props.doc;
    const isMiddle = e.button === 1;

    // Pan with Space + Drag or Middle mouse
    if (props.spacePressed || isMiddle) {
      e.currentTarget.setPointerCapture(e.pointerId);
      interactionRef.current = {
        ...interactionRef.current,
        mode: 'pan',
        startScreenX: e.clientX,
        startScreenY: e.clientY,
        startPanX: props.pan.x,
        startPanY: props.pan.y,
      };
      return;
    }

    if (e.button !== 0) return;

    const pt = screenToDoc(e.clientX, e.clientY);
    const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId) ?? null;

    // Zoom Tool
    if (props.activeTool === 'zoom') {
      const nextZoom = clamp(e.altKey ? props.zoom / 1.35 : props.zoom * 1.35, 0.1, 10);
      props.onSetZoom(nextZoom);
      return;
    }

    // Color Picker
    if (props.activeTool === 'colorPicker') {
      const disp = displayCanvasRef.current;
      if (disp) {
        const px = clamp(Math.round(pt.x), 0, disp.width - 1);
        const py = clamp(Math.round(pt.y), 0, disp.height - 1);
        const d = disp.getContext('2d')?.getImageData(px, py, 1, 1).data;
        if (d) {
          props.onSampleColor(rgbToHex({ r: d[0], g: d[1], b: d[2] }));
        }
      }
      return;
    }

    // Crop Tool
    if (props.activeTool === 'crop' && props.cropRect) {
      const cr = props.cropRect;
      const tol = 14 / props.zoom;
      const corners: [string, number, number][] = [
        ['nw', cr.x, cr.y],
        ['ne', cr.x + cr.width, cr.y],
        ['sw', cr.x, cr.y + cr.height],
        ['se', cr.x + cr.width, cr.y + cr.height],
      ];
      for (const [hName, hx, hy] of corners) {
        if (Math.hypot(pt.x - hx, pt.y - hy) <= tol) {
          e.currentTarget.setPointerCapture(e.pointerId);
          interactionRef.current = {
            ...interactionRef.current,
            mode: 'cropResize',
            handle: hName,
            startDocX: pt.x,
            startDocY: pt.y,
            currDocX: pt.x,
            currDocY: pt.y,
            initialCrop: { ...cr },
          };
          return;
        }
      }
      if (pt.x >= cr.x && pt.x <= cr.x + cr.width && pt.y >= cr.y && pt.y <= cr.y + cr.height) {
        e.currentTarget.setPointerCapture(e.pointerId);
        interactionRef.current = {
          ...interactionRef.current,
          mode: 'cropMove',
          startDocX: pt.x,
          startDocY: pt.y,
          currDocX: pt.x,
          currDocY: pt.y,
          initialCrop: { ...cr },
        };
      }
      return;
    }

    // Text Tool
    if (props.activeTool === 'text') {
      if (editingText) {
        commitTextEdit();
        return;
      }
      if (activeLayer?.type === 'text' && activeLayer.textData) {
        const td = activeLayer.textData;
        if (pt.x >= td.x - 10 && pt.x <= td.x + td.width + 10 && pt.y >= td.y - 10 && pt.y <= td.y + td.height + 10) {
          setEditingText({
            layerId: activeLayer.id,
            x: td.x,
            y: td.y,
            value: td.text,
          });
          return;
        }
      }
      setEditingText({
        layerId: null,
        x: Math.round(pt.x),
        y: Math.round(pt.y),
        value: 'MoonArt Text',
      });
      return;
    }

    // Vector Tool (Click points, double click or click start to finish)
    if (props.activeTool === 'vector') {
      if (vectorDraftPoints.length >= 2) {
        const first = vectorDraftPoints[0];
        if (Math.hypot(pt.x - first.x, pt.y - first.y) <= 12 / props.zoom) {
          props.onAddVectorLayer(vectorDraftPoints, true);
          setVectorDraftPoints([]);
          return;
        }
      }
      setVectorDraftPoints((prev) => [...prev, { x: pt.x, y: pt.y }]);
      return;
    }

    // Polygon Lasso
    if (props.activeTool === 'polygonLasso') {
      if (polyPoints.length >= 3) {
        const first = polyPoints[0];
        if (Math.hypot(pt.x - first.x, pt.y - first.y) <= 12 / props.zoom) {
          const mask = createPolygonSelection(doc.width, doc.height, polyPoints);
          props.onSetSelectionMask(mask);
          setPolyPoints([]);
          return;
        }
      }
      setPolyPoints((prev) => [...prev, pt]);
      return;
    }

    // Magic Wand
    if (props.activeTool === 'magicWand') {
      const targetCanvas =
        activeLayer?.type === 'raster'
          ? props.canvasMap.current.get(activeLayer.id) ?? displayCanvasRef.current
          : displayCanvasRef.current;
      if (targetCanvas) {
        const localPt = activeLayer ? docToLayerLocal(pt.x, pt.y, activeLayer, doc) : pt;
        const mask = createMagicWandSelection(
          targetCanvas,
          localPt.x,
          localPt.y,
          props.selectionSettings.tolerance,
          props.selectionSettings.contiguous
        );
        props.onSetSelectionMask(mask);
      }
      return;
    }

    // Paint Bucket
    if (props.activeTool === 'paintBucket') {
      const lc = getActiveRasterCanvas();
      if (!lc || !activeLayer) return;
      const localPt = docToLayerLocal(pt.x, pt.y, activeLayer, doc);
      const changed = floodFillCanvas(
        lc,
        localPt.x,
        localPt.y,
        props.foregroundColor,
        props.selectionSettings.tolerance,
        props.brushSettings.opacity,
        props.selectionMask
      );
      if (changed) {
        props.onRequestRender();
        props.onCommitHistory('Paint Bucket Fill');
      }
      return;
    }

    // Frame Divider Tool
    if (props.activeTool === 'frameDivider') {
      e.currentTarget.setPointerCapture(e.pointerId);
      if (activeLayer?.type === 'frame' && activeLayer.frameData) {
        const fd = activeLayer.frameData;
        const selCell = fd.cells.find((c) => c.id === fd.selectedCellId);
        const tol = 10 / props.zoom;
        if (selCell) {
          const corners: [string, number, number][] = [
            ['nw', selCell.x, selCell.y],
            ['ne', selCell.x + selCell.width, selCell.y],
            ['sw', selCell.x, selCell.y + selCell.height],
            ['se', selCell.x + selCell.width, selCell.y + selCell.height],
          ];
          for (const [hName, hx, hy] of corners) {
            if (Math.hypot(pt.x - hx, pt.y - hy) <= tol) {
              interactionRef.current = {
                ...interactionRef.current,
                mode: 'frameResize',
                handle: hName,
                startDocX: pt.x,
                startDocY: pt.y,
                currDocX: pt.x,
                currDocY: pt.y,
                initialCell: { ...selCell },
              };
              return;
            }
          }
        }
        // Check hit on any cell
        const hitCell = fd.cells.find(
          (c) => pt.x >= c.x && pt.x <= c.x + c.width && pt.y >= c.y && pt.y <= c.y + c.height
        );
        if (hitCell) {
          props.onUpdateLayer(activeLayer.id, (l) => ({
            ...l,
            frameData: l.frameData ? { ...l.frameData, selectedCellId: hitCell.id } : undefined,
          }));
          interactionRef.current = {
            ...interactionRef.current,
            mode: 'frameMove',
            startDocX: pt.x,
            startDocY: pt.y,
            currDocX: pt.x,
            currDocY: pt.y,
            initialCell: { ...hitCell },
          };
          return;
        }
      }

      interactionRef.current = {
        ...interactionRef.current,
        mode: 'frameDrag',
        startDocX: pt.x,
        startDocY: pt.y,
        currDocX: pt.x,
        currDocY: pt.y,
      };
      return;
    }

    // Move / Transform Tool
    if (props.activeTool === 'move' || props.activeTool === 'selection') {
      if (!activeLayer) return;
      if (activeLayer.locked) {
        props.onNotifyError('Layer Locked', `"${activeLayer.name}" is locked.`);
        return;
      }
      e.currentTarget.setPointerCapture(e.pointerId);
      const box = getLayerTransformBox(doc, activeLayer);
      const rad = (-activeLayer.transform.rotation * Math.PI) / 180;
      const dx = pt.x - box.cx;
      const dy = pt.y - box.cy;
      const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
      const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
      const hw = box.w / 2;
      const hh = box.h / 2;
      const tol = 14 / props.zoom;

      // Check rotation knob
      if (Math.hypot(lx, ly - (-hh - 26 / props.zoom)) <= tol) {
        interactionRef.current = {
          ...interactionRef.current,
          mode: 'transformRotate',
          startDocX: pt.x,
          startDocY: pt.y,
          currDocX: pt.x,
          currDocY: pt.y,
          initialTransform: { ...activeLayer.transform },
        };
        return;
      }

      // Check 8 handles
      const handles: [string, number, number][] = [
        ['nw', -hw, -hh],
        ['n', 0, -hh],
        ['ne', hw, -hh],
        ['e', hw, 0],
        ['se', hw, hh],
        ['s', 0, hh],
        ['sw', -hw, hh],
        ['w', -hw, 0],
      ];
      for (const [hName, hx, hy] of handles) {
        if (Math.hypot(lx - hx, ly - hy) <= tol) {
          interactionRef.current = {
            ...interactionRef.current,
            mode: 'transformResize',
            handle: hName,
            startDocX: pt.x,
            startDocY: pt.y,
            currDocX: pt.x,
            currDocY: pt.y,
            shiftKey: e.shiftKey,
            initialTransform: { ...activeLayer.transform },
          };
          return;
        }
      }

      interactionRef.current = {
        ...interactionRef.current,
        mode: 'transformMove',
        startDocX: pt.x,
        startDocY: pt.y,
        currDocX: pt.x,
        currDocY: pt.y,
        initialTransform: { ...activeLayer.transform },
      };
      return;
    }

    // Rectangle / Ellipse / Lasso Selection
    if (
      props.activeTool === 'rectSelect' ||
      props.activeTool === 'ellipseSelect' ||
      props.activeTool === 'lasso'
    ) {
      e.currentTarget.setPointerCapture(e.pointerId);
      interactionRef.current = {
        ...interactionRef.current,
        mode:
          props.activeTool === 'rectSelect'
            ? 'selectRect'
            : props.activeTool === 'ellipseSelect'
            ? 'selectEllipse'
            : 'lasso',
        startDocX: pt.x,
        startDocY: pt.y,
        currDocX: pt.x,
        currDocY: pt.y,
        shiftKey: e.shiftKey,
        lassoPoints: [pt],
      };
      return;
    }

    // Shape Tools
    if (SHAPE_TOOL_SET.has(props.activeTool)) {
      const lc = getActiveRasterCanvas();
      if (!lc) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      interactionRef.current = {
        ...interactionRef.current,
        mode: 'shape',
        startDocX: pt.x,
        startDocY: pt.y,
        currDocX: pt.x,
        currDocY: pt.y,
        shiftKey: e.shiftKey,
      };
      return;
    }

    // Gradient Tool
    if (props.activeTool === 'gradient') {
      const lc = getActiveRasterCanvas();
      if (!lc) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      interactionRef.current = {
        ...interactionRef.current,
        mode: 'gradient',
        startDocX: pt.x,
        startDocY: pt.y,
        currDocX: pt.x,
        currDocY: pt.y,
      };
      return;
    }

    // Drawing & Editing Brush Tools
    if (BRUSH_TOOL_SET.has(props.activeTool)) {
      const lc = getActiveRasterCanvas();
      if (!lc || !activeLayer) return;
      const localPt = docToLayerLocal(pt.x, pt.y, activeLayer, doc);

      // Clone Alt+Click sets source
      if (props.activeTool === 'clone' && e.altKey) {
        props.onSetCloneSource(localPt);
        return;
      }

      if (props.activeTool === 'clone' && !props.cloneSource) {
        props.onNotifyError('Clone Source Needed', 'Hold Alt + Click on the canvas first to set a clone source.');
        return;
      }

      e.currentTarget.setPointerCapture(e.pointerId);
      const strokeState = beginBrushStroke(
        lc,
        props.activeTool,
        localPt.x,
        localPt.y,
        e.pressure,
        props.brushSettings,
        props.foregroundColor,
        props.backgroundColor,
        props.selectionMask,
        props.cloneSource
      );

      interactionRef.current = {
        ...interactionRef.current,
        mode: 'stroke',
        startDocX: pt.x,
        startDocY: pt.y,
        currDocX: pt.x,
        currDocY: pt.y,
        strokeState,
      };
      props.onRequestRender();
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setCursorScreen({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }

    if (!props.doc) return;
    const doc = props.doc;
    const pt = screenToDoc(e.clientX, e.clientY);
    props.onCursorMove({ x: Math.round(pt.x), y: Math.round(pt.y) });

    const inter = interactionRef.current;
    if (inter.mode === 'none') return;

    inter.currDocX = pt.x;
    inter.currDocY = pt.y;
    inter.shiftKey = e.shiftKey;

    if (inter.mode === 'pan') {
      props.onSetPan({
        x: inter.startPanX + (e.clientX - inter.startScreenX),
        y: inter.startPanY + (e.clientY - inter.startScreenY),
      });
      return;
    }

    if (inter.mode === 'stroke' && inter.strokeState) {
      const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
      if (!activeLayer || activeLayer.type !== 'raster') return;
      const lc = props.canvasMap.current.get(activeLayer.id);
      if (!lc) return;
      const nativeEvt = e.nativeEvent as PointerEvent;
      const events =
        typeof nativeEvt.getCoalescedEvents === 'function'
          ? nativeEvt.getCoalescedEvents()
          : [nativeEvt];
      const list = events.length > 0 ? events : [nativeEvt];
      for (const cev of list) {
        const cpt = screenToDoc(cev.clientX, cev.clientY);
        const localPt = docToLayerLocal(cpt.x, cpt.y, activeLayer, doc);
        continueBrushStroke(
          lc,
          props.activeTool,
          localPt.x,
          localPt.y,
          cev.pressure ?? e.pressure,
          props.brushSettings,
          props.foregroundColor,
          props.backgroundColor,
          props.selectionMask,
          inter.strokeState,
          props.cloneSource
        );
      }
      props.onRequestRender();
      return;
    }

    if (inter.mode === 'lasso' && inter.lassoPoints) {
      inter.lassoPoints.push(pt);
      props.onRequestRender();
      return;
    }

    if (
      inter.mode === 'shape' ||
      inter.mode === 'gradient' ||
      inter.mode === 'selectRect' ||
      inter.mode === 'selectEllipse' ||
      inter.mode === 'frameDrag'
    ) {
      props.onRequestRender();
      return;
    }

    // Transform Move / Resize / Rotate
    const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (activeLayer && inter.initialTransform) {
      if (inter.mode === 'transformMove') {
        const dx = pt.x - inter.startDocX;
        const dy = pt.y - inter.startDocY;
        props.onUpdateLayer(activeLayer.id, (l) => ({
          ...l,
          transform: {
            ...l.transform,
            x: inter.initialTransform!.x + dx,
            y: inter.initialTransform!.y + dy,
          },
        }));
      } else if (inter.mode === 'transformRotate') {
        const cx = doc.width / 2 + inter.initialTransform.x;
        const cy = doc.height / 2 + inter.initialTransform.y;
        const a0 = Math.atan2(inter.startDocY - cy, inter.startDocX - cx);
        const a1 = Math.atan2(pt.y - cy, pt.x - cx);
        const deltaDeg = ((a1 - a0) * 180) / Math.PI;
        props.onUpdateLayer(activeLayer.id, (l) => ({
          ...l,
          transform: {
            ...l.transform,
            rotation: Math.round(inter.initialTransform!.rotation + deltaDeg),
          },
        }));
      } else if (inter.mode === 'transformResize') {
        const dx = pt.x - inter.startDocX;
        const dy = pt.y - inter.startDocY;
        const h = inter.handle ?? 'se';
        const signX = h.includes('w') ? -1 : h.includes('e') ? 1 : 0;
        const signY = h.includes('n') ? -1 : h.includes('s') ? 1 : 0;
        let sx = inter.initialTransform.scaleX + (signX * dx * 2) / doc.width;
        let sy = inter.initialTransform.scaleY + (signY * dy * 2) / doc.height;
        if (e.shiftKey) {
          const uniform = Math.abs(sx - inter.initialTransform.scaleX) > Math.abs(sy - inter.initialTransform.scaleY) ? sx : sy;
          sx = uniform;
          sy = uniform;
        }
        props.onUpdateLayer(activeLayer.id, (l) => ({
          ...l,
          transform: {
            ...l.transform,
            scaleX: clamp(sx, 0.05, 8),
            scaleY: clamp(sy, 0.05, 8),
          },
        }));
      }
    }

    // Frame Cell Move / Resize
    if (
      (inter.mode === 'frameMove' || inter.mode === 'frameResize') &&
      activeLayer?.type === 'frame' &&
      activeLayer.frameData &&
      inter.initialCell
    ) {
      const dx = pt.x - inter.startDocX;
      const dy = pt.y - inter.startDocY;
      const c0 = inter.initialCell;
      props.onUpdateLayer(activeLayer.id, (l) => {
        if (!l.frameData) return l;
        return {
          ...l,
          frameData: {
            ...l.frameData,
            cells: l.frameData.cells.map((cell) => {
              if (cell.id !== c0.id) return cell;
              if (inter.mode === 'frameMove') {
                return { ...cell, x: Math.round(c0.x + dx), y: Math.round(c0.y + dy) };
              }
              const h = inter.handle ?? 'se';
              let nx = c0.x;
              let ny = c0.y;
              let nw = c0.width;
              let nh = c0.height;
              if (h.includes('e')) nw = Math.max(20, c0.width + dx);
              if (h.includes('s')) nh = Math.max(20, c0.height + dy);
              if (h.includes('w')) {
                nw = Math.max(20, c0.width - dx);
                nx = c0.x + (c0.width - nw);
              }
              if (h.includes('n')) {
                nh = Math.max(20, c0.height - dy);
                ny = c0.y + (c0.height - nh);
              }
              return { ...cell, x: Math.round(nx), y: Math.round(ny), width: Math.round(nw), height: Math.round(nh) };
            }),
          },
        };
      });
    }

    // Crop Move / Resize
    if ((inter.mode === 'cropMove' || inter.mode === 'cropResize') && inter.initialCrop) {
      const c0 = inter.initialCrop;
      const dx = pt.x - inter.startDocX;
      const dy = pt.y - inter.startDocY;
      if (inter.mode === 'cropMove') {
        props.onUpdateCropRect({
          ...c0,
          x: clamp(Math.round(c0.x + dx), 0, doc.width - c0.width),
          y: clamp(Math.round(c0.y + dy), 0, doc.height - c0.height),
        });
      } else {
        const h = inter.handle ?? 'se';
        let nx = c0.x;
        let ny = c0.y;
        let nw = c0.width;
        let nh = c0.height;
        if (h.includes('e')) nw = clamp(c0.width + dx, 16, doc.width - c0.x);
        if (h.includes('s')) nh = clamp(c0.height + dy, 16, doc.height - c0.y);
        if (h.includes('w')) {
          nw = clamp(c0.width - dx, 16, c0.x + c0.width);
          nx = c0.x + (c0.width - nw);
        }
        if (h.includes('n')) {
          nh = clamp(c0.height - dy, 16, c0.y + c0.height);
          ny = c0.y + (c0.height - nh);
        }
        if (c0.aspect !== 'free') {
          const [rw, rh] =
            c0.aspect === '1:1'
              ? [1, 1]
              : c0.aspect === '4:3'
              ? [4, 3]
              : c0.aspect === '16:9'
              ? [16, 9]
              : [9, 16];
          nh = Math.max(16, Math.round((nw * rh) / rw));
        }
        props.onUpdateCropRect({
          ...c0,
          x: Math.round(nx),
          y: Math.round(ny),
          width: Math.round(nw),
          height: Math.round(nh),
        });
      }
    }
  };

  const handlePointerUp = () => {
    const inter = interactionRef.current;
    const doc = props.doc;
    if (inter.mode === 'none' || !doc) return;

    const mode = inter.mode;
    inter.mode = 'none';

    if (mode === 'stroke') {
      const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
      const lc = activeLayer ? props.canvasMap.current.get(activeLayer.id) : null;
      if (lc && inter.strokeState) {
        finishBrushStroke(
          lc,
          props.activeTool,
          props.brushSettings,
          props.foregroundColor,
          props.backgroundColor,
          props.selectionMask,
          inter.strokeState,
          props.cloneSource
        );
        inter.strokeState = undefined;
      }
      const toolName = props.activeTool.charAt(0).toUpperCase() + props.activeTool.slice(1);
      props.onCommitHistory(`${toolName} Stroke`);
      props.onRequestRender();
      return;
    }

    if (mode === 'shape') {
      const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
      if (activeLayer?.type === 'raster') {
        const lc = props.canvasMap.current.get(activeLayer.id);
        if (lc) {
          const p0 = docToLayerLocal(inter.startDocX, inter.startDocY, activeLayer, doc);
          const p1 = docToLayerLocal(inter.currDocX, inter.currDocY, activeLayer, doc);
          drawShapeOnContext(
            lc.getContext('2d')!,
            props.activeTool,
            p0.x,
            p0.y,
            p1.x,
            p1.y,
            props.shapeSettings,
            inter.shiftKey
          );
          props.onCommitHistory(`Draw ${props.activeTool}`);
          props.onRequestRender();
        }
      }
      return;
    }

    if (mode === 'gradient') {
      const activeLayer = doc.layers.find((l) => l.id === doc.activeLayerId);
      if (activeLayer?.type === 'raster') {
        const lc = props.canvasMap.current.get(activeLayer.id);
        if (lc) {
          const p0 = docToLayerLocal(inter.startDocX, inter.startDocY, activeLayer, doc);
          const p1 = docToLayerLocal(inter.currDocX, inter.currDocY, activeLayer, doc);
          applyGradientToCanvas(
            lc,
            p0.x,
            p0.y,
            p1.x,
            p1.y,
            props.foregroundColor,
            props.backgroundColor,
            props.gradientSettings,
            props.selectionMask
          );
          props.onCommitHistory('Apply Gradient');
          props.onRequestRender();
        }
      }
      return;
    }

    if (mode === 'selectRect') {
      const mask = createRectSelection(
        doc.width,
        doc.height,
        inter.startDocX,
        inter.startDocY,
        inter.currDocX - inter.startDocX,
        inter.currDocY - inter.startDocY
      );
      props.onSetSelectionMask(mask);
      props.onRequestRender();
      return;
    }

    if (mode === 'selectEllipse') {
      const mask = createEllipseSelection(
        doc.width,
        doc.height,
        inter.startDocX,
        inter.startDocY,
        inter.currDocX - inter.startDocX,
        inter.currDocY - inter.startDocY
      );
      props.onSetSelectionMask(mask);
      props.onRequestRender();
      return;
    }

    if (mode === 'lasso' && inter.lassoPoints) {
      const mask = createPolygonSelection(doc.width, doc.height, inter.lassoPoints);
      props.onSetSelectionMask(mask);
      props.onRequestRender();
      return;
    }

    if (mode === 'transformMove' || mode === 'transformResize' || mode === 'transformRotate') {
      props.onCommitHistory('Transform Layer');
      return;
    }

    if (mode === 'frameDrag') {
      const x = Math.round(Math.min(inter.startDocX, inter.currDocX));
      const y = Math.round(Math.min(inter.startDocY, inter.currDocY));
      const w = Math.round(Math.abs(inter.currDocX - inter.startDocX));
      const h = Math.round(Math.abs(inter.currDocY - inter.startDocY));
      if (w >= 20 && h >= 20) {
        props.onCreateFrameLayerWithRect({ x, y, width: w, height: h });
      }
      props.onRequestRender();
      return;
    }

    if (mode === 'frameMove' || mode === 'frameResize') {
      props.onCommitHistory('Adjust Frame Divider');
      props.onRequestRender();
    }
  };

  const handleDoubleClick = () => {
    if (!props.doc) return;
    if (props.activeTool === 'polygonLasso' && polyPoints.length >= 3) {
      const mask = createPolygonSelection(props.doc.width, props.doc.height, polyPoints);
      props.onSetSelectionMask(mask);
      setPolyPoints([]);
    }
    if (props.activeTool === 'vector' && vectorDraftPoints.length >= 2) {
      props.onAddVectorLayer(vectorDraftPoints, false);
      setVectorDraftPoints([]);
    }
  };

  const commitTextEdit = () => {
    if (!editingText) return;
    const trimmed = editingText.value.trim();
    if (!trimmed) {
      setEditingText(null);
      return;
    }
    const baseData: TextLayerData = {
      text: editingText.value,
      x: editingText.x,
      y: editingText.y,
      width: 100,
      height: 50,
      fontFamily: props.textSettings.fontFamily,
      fontSize: props.textSettings.fontSize,
      bold: props.textSettings.bold,
      italic: props.textSettings.italic,
      underline: props.textSettings.underline,
      align: props.textSettings.align,
      color: props.textSettings.color,
      letterSpacing: props.textSettings.letterSpacing,
    };
    const measured = measureTextBox(baseData);
    baseData.width = measured.width;
    baseData.height = measured.height;

    if (editingText.layerId) {
      props.onUpdateLayer(
        editingText.layerId,
        (l) => ({ ...l, textData: baseData }),
        'Edit Text Layer'
      );
    } else {
      props.onAddTextLayer(baseData);
    }
    setEditingText(null);
  };

  // Compute cursor style
  const showBrushRing =
    props.doc &&
    cursorScreen &&
    !props.spacePressed &&
    BRUSH_TOOL_SET.has(props.activeTool);

  const cursorClass = props.spacePressed
    ? 'cursor-grab active:cursor-grabbing'
    : props.activeTool === 'move'
    ? 'cursor-move'
    : props.activeTool === 'text'
    ? 'cursor-text'
    : props.activeTool === 'zoom'
    ? 'cursor-zoom-in'
    : 'cursor-crosshair';

  return (
    <main
      ref={containerRef}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => {
        setCursorScreen(null);
        props.onCursorMove(null);
      }}
      onDoubleClick={handleDoubleClick}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingFile(true);
      }}
      onDragLeave={() => setIsDraggingFile(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingFile(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          props.onDropFiles(e.dataTransfer.files);
        }
      }}
      className={`relative flex-1 bg-[#08131d] overflow-hidden flex items-center justify-center select-none touch-none ${
        props.doc ? cursorClass : ''
      }`}
    >
      {/* Empty Welcome Viewport */}
      {!props.doc && (
        <div className="max-w-md w-full mx-4 p-8 rounded-xl bg-[#071b2a] border border-cyan-400/20 shadow-2xl text-center space-y-6">
          <div className="flex flex-col items-center gap-3">
            <MoonArtLogo className="w-14 h-14" />
            <div>
              <h1 className="font-display text-2xl font-bold text-cyan-50 tracking-tight">
                Moon<span className="text-cyan-400">Art</span> Studio
              </h1>
              <p className="text-xs text-cyan-200/70 mt-1">
                Professional multi-layer digital painting, vector shapes, FX filters, and photo editing.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={props.onOpenNewCanvas}
              className="py-3 px-4 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-[#03131f] font-semibold text-xs flex items-center justify-center gap-2 transition-colors shadow-md"
            >
              <FilePlus2 className="w-4 h-4" />
              <span>Create New Canvas</span>
            </button>
            <button
              type="button"
              onClick={props.onTriggerUpload}
              className="py-3 px-4 rounded-lg bg-[#0d4658] hover:bg-[#135d73] border border-cyan-400/30 text-cyan-100 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
            >
              <Upload className="w-4 h-4" />
              <span>Open Image (PNG / JPG)</span>
            </button>
          </div>

          <div className="border border-dashed border-cyan-400/30 rounded-lg py-5 px-4 bg-[#04111d]/70 text-xs text-cyan-200/70">
            Drag & Drop your image here (<span className="font-mono-tabular text-cyan-300">PNG, JPG, JPEG, WEBP, GIF, SVG</span>)
          </div>

          {props.onOpenGallery && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => props.onOpenGallery?.('personal')}
                className="py-2.5 px-3 rounded-lg bg-[#092133] hover:bg-[#0d3b54] border border-cyan-400/20 text-cyan-100 text-xs font-medium flex items-center justify-center gap-2 transition-colors"
              >
                <Images className="w-3.5 h-3.5 text-cyan-300" />
                <span>Mənim Qalereyam</span>
              </button>
              <button
                type="button"
                onClick={() => props.onOpenGallery?.('shared')}
                className="py-2.5 px-3 rounded-lg bg-[#092133] hover:bg-[#0d3b54] border border-emerald-400/25 text-emerald-100 text-xs font-medium flex items-center justify-center gap-2 transition-colors"
              >
                <Images className="w-3.5 h-3.5 text-emerald-300" />
                <span>24s Paylaşımlar</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Active Document Canvas Stage */}
      {props.doc && (
        <div
          style={{
            transform: `translate(${props.pan.x}px, ${props.pan.y}px) rotate(${props.canvasRotation}deg) scale(${props.zoom})`,
            transformOrigin: 'center center',
            width: props.doc.width,
            height: props.doc.height,
          }}
          className="relative shrink-0 shadow-[0_20px_60px_rgba(0,0,0,0.65)] ring-1 ring-cyan-400/25 canvas-checkerboard"
        >
          <canvas
            ref={displayCanvasRef}
            width={props.doc.width}
            height={props.doc.height}
            className="block w-full h-full"
          />
          <canvas
            ref={overlayCanvasRef}
            width={props.doc.width}
            height={props.doc.height}
            className="absolute inset-0 w-full h-full pointer-events-none"
          />

          {/* Inline Text Editor Box */}
          {editingText && (
            <div
              style={{ left: editingText.x, top: editingText.y }}
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute z-30 min-w-[200px]"
            >
              <textarea
                autoFocus
                value={editingText.value}
                onChange={(e) => setEditingText({ ...editingText, value: e.target.value })}
                style={{
                  fontFamily: props.textSettings.fontFamily,
                  fontSize: `${props.textSettings.fontSize}px`,
                  fontWeight: props.textSettings.bold ? 700 : 400,
                  fontStyle: props.textSettings.italic ? 'italic' : 'normal',
                  textDecoration: props.textSettings.underline ? 'underline' : 'none',
                  textAlign: props.textSettings.align,
                  color: props.textSettings.color,
                  letterSpacing: `${props.textSettings.letterSpacing}px`,
                  lineHeight: 1.25,
                }}
                rows={Math.max(1, editingText.value.split('\n').length)}
                className="bg-[#04111d]/75 border border-cyan-400 rounded px-2 py-1 outline-none resize min-w-[220px]"
              />
              <div className="flex items-center gap-1 mt-1">
                <button
                  type="button"
                  onClick={commitTextEdit}
                  className="px-2 py-1 text-[11px] font-semibold rounded bg-cyan-500 text-[#03131f] flex items-center gap-1 shadow"
                >
                  <Check className="w-3 h-3" />
                  <span>Apply Text</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditingText(null)}
                  className="px-2 py-1 text-[11px] rounded bg-[#071b2a] border border-cyan-400/25 text-slate-200"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Floating Crop Quick Action Bar */}
      {props.doc && props.activeTool === 'crop' && props.cropRect && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-[#071b2a]/95 border border-cyan-400/35 rounded-lg px-3 py-1.5 flex items-center gap-3 shadow-xl text-xs"
        >
          <span className="font-mono-tabular text-cyan-200">
            Crop: {Math.round(props.cropRect.width)} × {Math.round(props.cropRect.height)}
          </span>
          <button
            type="button"
            onClick={props.onApplyCrop}
            className="px-2.5 py-1 rounded bg-cyan-500 text-[#03131f] font-semibold hover:bg-cyan-400 flex items-center gap-1"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Apply</span>
          </button>
          <button
            type="button"
            onClick={props.onCancelCrop}
            className="px-2.5 py-1 rounded bg-[#092133] border border-cyan-400/20 text-slate-200 hover:bg-[#0d4658]"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Vector / Polygon Lasso Finish Helper Pill */}
      {props.doc &&
        ((props.activeTool === 'vector' && vectorDraftPoints.length > 0) ||
          (props.activeTool === 'polygonLasso' && polyPoints.length > 0)) && (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-[#071b2a]/95 border border-cyan-400/35 rounded-lg px-3 py-1.5 flex items-center gap-3 shadow-xl text-xs"
          >
            <span className="text-cyan-200">
              {props.activeTool === 'vector'
                ? `${vectorDraftPoints.length} vector points — double-click or click Finish`
                : `${polyPoints.length} polygon points — double-click or click Finish`}
            </span>
            <button
              type="button"
              onClick={() => {
                if (props.activeTool === 'vector' && vectorDraftPoints.length >= 2) {
                  props.onAddVectorLayer(vectorDraftPoints, true);
                  setVectorDraftPoints([]);
                } else if (props.activeTool === 'polygonLasso' && polyPoints.length >= 3 && props.doc) {
                  props.onSetSelectionMask(createPolygonSelection(props.doc.width, props.doc.height, polyPoints));
                  setPolyPoints([]);
                }
              }}
              className="px-2.5 py-1 rounded bg-cyan-500 text-[#03131f] font-semibold"
            >
              Finish
            </button>
            <button
              type="button"
              onClick={() => {
                setVectorDraftPoints([]);
                setPolyPoints([]);
              }}
              className="px-2 py-1 rounded bg-[#092133] text-slate-200"
            >
              Cancel
            </button>
          </div>
        )}

      {/* ibisPaint-Style Quick Drawing HUD */}
      {props.doc && BRUSH_TOOL_SET.has(props.activeTool) && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-[#061826]/92 backdrop-blur-md border border-cyan-400/25 rounded-lg px-3 py-1.5 flex items-center gap-3 shadow-xl text-xs max-w-[95%]"
        >
          <div className="w-20 h-7 rounded bg-[#04111d] border border-cyan-400/20 overflow-hidden shrink-0 hidden sm:block">
            <canvas ref={hudPreviewCanvasRef} width={80} height={28} className="w-full h-full block" />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-cyan-200/80 font-medium">Size</span>
            <input
              type="range"
              min={1}
              max={500}
              value={props.brushSettings.size}
              onChange={(e) => props.onChangeBrushSettings({ size: Number(e.target.value) })}
              className="ocean-slider w-20 sm:w-24"
            />
            <span className="font-mono-tabular text-[11px] text-cyan-200 w-10">
              {props.brushSettings.size}px
            </span>
          </div>

          <div className="h-4 w-px bg-cyan-400/20 hidden md:block" />

          <div className="hidden md:flex items-center gap-2">
            <span className="text-[11px] text-cyan-200/80 font-medium">Opacity</span>
            <input
              type="range"
              min={1}
              max={100}
              value={props.brushSettings.opacity}
              onChange={(e) => props.onChangeBrushSettings({ opacity: Number(e.target.value) })}
              className="ocean-slider w-20"
            />
            <span className="font-mono-tabular text-[11px] text-cyan-200 w-8">
              {props.brushSettings.opacity}%
            </span>
          </div>

          <div className="h-4 w-px bg-cyan-400/20 hidden lg:block" />

          <div className="hidden lg:flex items-center gap-1.5">
            <span className="text-[11px] text-cyan-200/80 font-medium">Stabilizer</span>
            <input
              type="range"
              min={0}
              max={10}
              value={props.brushSettings.stabilizer}
              onChange={(e) => props.onChangeBrushSettings({ stabilizer: Number(e.target.value) })}
              className="ocean-slider w-14"
            />
            <span className="font-mono-tabular text-[11px] text-cyan-300 w-4 text-center">
              {props.brushSettings.stabilizer}
            </span>
          </div>

          <button
            type="button"
            onClick={() =>
              props.onChangeBrushSettings({
                taper: props.brushSettings.taper > 0 ? 0 : 60,
              })
            }
            title="Toggle Force Fade / Start-End Taper"
            className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
              props.brushSettings.taper > 0
                ? 'bg-[#0d4658] border-cyan-400/50 text-cyan-200'
                : 'bg-[#04111d] border-cyan-400/15 text-slate-400 hover:text-slate-200'
            }`}
          >
            Taper
          </button>

          <button
            type="button"
            onClick={() =>
              props.onChangeBrushSettings({
                colorMix: props.brushSettings.colorMix > 0 ? 0 : 60,
                wetness: props.brushSettings.colorMix > 0 ? 0 : 65,
              })
            }
            title="Toggle Wet Color Mixing with canvas pigment"
            className={`hidden xl:inline-flex px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
              props.brushSettings.colorMix > 0
                ? 'bg-[#0d4658] border-cyan-400/50 text-cyan-200'
                : 'bg-[#04111d] border-cyan-400/15 text-slate-400 hover:text-slate-200'
            }`}
          >
            Mix
          </button>
        </div>
      )}

      {/* Brush Cursor Preview Ring */}
      {showBrushRing && cursorScreen && (
        <div
          style={{
            left: cursorScreen.x,
            top: cursorScreen.y,
            width: Math.max(4, props.brushSettings.size * props.zoom),
            height: Math.max(4, props.brushSettings.size * props.zoom),
          }}
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/80 shadow-[0_0_0_1px_rgba(4,17,29,0.85)] z-20"
        />
      )}

      {/* Drag & Drop File Overlay */}
      {isDraggingFile && (
        <div className="absolute inset-0 z-40 bg-[#041524]/85 border-2 border-dashed border-cyan-400 flex items-center justify-center pointer-events-none">
          <div className="text-center space-y-2">
            <Upload className="w-10 h-10 text-cyan-300 mx-auto" />
            <div className="text-sm font-semibold text-cyan-100">Drop PNG, JPG, JPEG, WEBP, GIF, or SVG file to open</div>
          </div>
        </div>
      )}
    </main>
  );
};
