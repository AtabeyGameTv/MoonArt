import React, { useEffect, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  FileImage,
  FolderPlus,
  History,
  Italic,
  Layers as LayersIcon,
  Lock,
  Merge,
  Palette,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Redo2,
  RotateCcw,
  SlidersHorizontal,
  SplitSquareHorizontal,
  SplitSquareVertical,
  Trash2,
  Underline,
  Undo2,
  Unlock,
  Upload,
  X,
} from 'lucide-react';
import { FONT_FAMILIES, TOOLS } from '../constants/tools';
import {
  BLEND_MODE_OPTIONS,
  BlendMode,
  BrushSettings,
  CropRect,
  FilterSettings,
  FrameDividerData,
  GradientSettings,
  HistoryEntry,
  Layer,
  RightPanelTab,
  SelectionSettings,
  ShapeSettings,
  TextSettings,
  ToolId,
  UploadedFileItem,
} from '../types/editor';
import { renderBrushPreviewCurve } from '../engine/brushEngine';
import { ColorPickerPanel } from './ColorPickerPanel';

interface RightSidebarProps {
  collapsed: boolean;
  width: number;
  activeTab: RightPanelTab;
  activeTool: ToolId;
  hasDocument: boolean;
  layers: Layer[];
  activeLayerId: string | null;
  uploadedFiles: UploadedFileItem[];
  foregroundColor: string;
  backgroundColor: string;
  colorTarget: 'fg' | 'bg';
  palette: string[];
  brushSettings: BrushSettings;
  shapeSettings: ShapeSettings;
  textSettings: TextSettings;
  selectionSettings: SelectionSettings;
  gradientSettings: GradientSettings;
  filterSettings: FilterSettings;
  cropRect: CropRect | null;
  canvasRotation: number;
  history: HistoryEntry[];
  historyIndex: number;
  onToggleCollapse: () => void;
  onResizeWidth: (w: number) => void;
  onSetTab: (t: RightPanelTab) => void;
  // Layer actions
  onSelectLayer: (id: string) => void;
  onNewLayer: () => void;
  onDuplicateLayer: () => void;
  onDeleteLayer: (id?: string) => void;
  onMergeDown: () => void;
  onToggleLayerVisibility: (id: string) => void;
  onToggleLayerLock: (id: string) => void;
  onRenameLayer: (id: string, name: string) => void;
  onChangeLayerOpacity: (id: string, opacity: number) => void;
  onChangeLayerBlendMode: (id: string, mode: BlendMode) => void;
  onReorderLayers: (fromIndex: number, toIndex: number) => void;
  onResetLayerTransform: (id: string) => void;
  // Files actions
  onUploadFiles: (files: FileList | File[]) => void;
  onOpenUploadedFile: (item: UploadedFileItem) => void;
  onInsertUploadedAsLayer: (item: UploadedFileItem) => void;
  onDeleteUploadedFile: (id: string) => void;
  // Color actions
  onSetColorTarget: (t: 'fg' | 'bg') => void;
  onChangeColor: (hex: string, t: 'fg' | 'bg') => void;
  onSwapColors: () => void;
  onAddPaletteColor: (hex: string) => void;
  onRemovePaletteColor: (hex: string) => void;
  // Tool Settings actions
  onChangeBrushSettings: (patch: Partial<BrushSettings>) => void;
  onResetBrushPreset: () => void;
  onChangeShapeSettings: (patch: Partial<ShapeSettings>) => void;
  onChangeTextSettings: (patch: Partial<TextSettings>) => void;
  onChangeSelectionSettings: (patch: Partial<SelectionSettings>) => void;
  onChangeGradientSettings: (patch: Partial<GradientSettings>) => void;
  onChangeFilterSettings: (patch: Partial<FilterSettings>) => void;
  onApplyFilter: () => void;
  onResetFilter: () => void;
  onCancelFilter: () => void;
  onChangeCropAspect: (aspect: CropRect['aspect']) => void;
  onApplyCrop: () => void;
  onCancelCrop: () => void;
  onChangeCanvasRotation: (deg: number) => void;
  // Frame Divider actions
  onCreateFramePreset: (preset: '2x2' | '2col' | '2row' | '3x2' | '1+2') => void;
  onUpdateFrameSettings: (patch: Partial<FrameDividerData>) => void;
  onSplitFrameCell: (direction: 'h' | 'v') => void;
  onDeleteFrameCell: () => void;
  // History actions
  onUndo: () => void;
  onRedo: () => void;
  onJumpHistory: (idx: number) => void;
}

const BRUSH_TOOLS: ToolId[] = [
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
];

const SHAPE_TOOLS: ToolId[] = [
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
];

export const RightSidebar: React.FC<RightSidebarProps> = (props) => {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const brushPreviewCanvasRef = useRef<HTMLCanvasElement>(null);

  const activeLayer = props.layers.find((l) => l.id === props.activeLayerId) ?? null;
  const activeToolDef = TOOLS.find((t) => t.id === props.activeTool);

  useEffect(() => {
    if (
      props.activeTab === 'properties' &&
      BRUSH_TOOLS.includes(props.activeTool) &&
      brushPreviewCanvasRef.current
    ) {
      renderBrushPreviewCurve(
        brushPreviewCanvasRef.current,
        props.activeTool,
        props.brushSettings,
        props.foregroundColor,
        props.backgroundColor
      );
    }
  }, [
    props.activeTab,
    props.activeTool,
    props.brushSettings,
    props.foregroundColor,
    props.backgroundColor,
    props.collapsed,
  ]);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = props.width;
    const onMove = (ev: MouseEvent) => {
      const next = Math.max(260, Math.min(460, startW + (startX - ev.clientX)));
      props.onResizeWidth(next);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  if (props.collapsed) {
    return (
      <aside className="w-10 shrink-0 bg-[#051522] border-l border-cyan-400/15 flex flex-col items-center py-2 gap-2 select-none">
        <button
          type="button"
          onClick={props.onToggleCollapse}
          title="Expand Right Panel"
          className="p-1.5 rounded text-cyan-200 hover:bg-[#0d4658] transition-colors"
        >
          <PanelRightOpen className="w-4 h-4" />
        </button>
        {(
          [
            { id: 'layers', icon: LayersIcon, label: 'Layers' },
            { id: 'files', icon: FileImage, label: 'Files' },
            { id: 'color', icon: Palette, label: 'Color' },
            { id: 'properties', icon: SlidersHorizontal, label: 'Properties' },
            { id: 'history', icon: History, label: 'History' },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                props.onSetTab(tab.id);
                props.onToggleCollapse();
              }}
              title={tab.label}
              className={`p-1.5 rounded transition-colors ${
                props.activeTab === tab.id ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-cyan-200'
              }`}
            >
              <Icon className="w-4 h-4" />
            </button>
          );
        })}
      </aside>
    );
  }

  return (
    <aside
      style={{ width: props.width }}
      className="relative shrink-0 bg-[#051522] border-l border-cyan-400/15 flex flex-col select-none"
    >
      {/* Left Resize Handle */}
      <div
        onMouseDown={startResize}
        title="Drag to resize panel"
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-cyan-400/40 transition-colors z-20"
      />

      {/* Tab Bar */}
      <div className="h-9 shrink-0 bg-[#061826] border-b border-cyan-400/15 px-1.5 flex items-center justify-between gap-1">
        <div className="flex items-center gap-0.5 overflow-x-auto">
          {(
            [
              { id: 'layers', label: 'Layers' },
              { id: 'files', label: 'Files' },
              { id: 'color', label: 'Color' },
              { id: 'properties', label: 'Properties' },
              { id: 'history', label: 'History' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => props.onSetTab(tab.id)}
              className={`px-2 py-1 text-[11.5px] font-medium rounded transition-colors whitespace-nowrap ${
                props.activeTab === tab.id
                  ? 'bg-[#0d4658] text-cyan-200 border border-cyan-400/35'
                  : 'text-slate-300 hover:text-cyan-100 hover:bg-[#0b273b]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={props.onToggleCollapse}
          title="Collapse Sidebar"
          className="p-1 rounded text-cyan-200/70 hover:text-cyan-100 hover:bg-[#0d2c42] shrink-0"
        >
          <PanelRightClose className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Panel Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* ================= LAYERS TAB ================= */}
        {props.activeTab === 'layers' && (
          <>
            {!props.hasDocument ? (
              <div className="text-xs text-slate-400 py-8 text-center">
                Create or open a canvas to manage layers.
              </div>
            ) : (
              <div className="space-y-3">
                {/* Layer Controls Bar */}
                {activeLayer && (
                  <div className="bg-[#061826] border border-cyan-400/15 rounded-lg p-2.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[11px] text-cyan-200/75 font-medium">Blend</label>
                      <select
                        value={activeLayer.blendMode}
                        onChange={(e) => props.onChangeLayerBlendMode(activeLayer.id, e.target.value as BlendMode)}
                        className="flex-1 bg-[#04111d] border border-cyan-400/20 rounded px-2 py-1 text-xs text-cyan-100 focus:outline-none focus:border-cyan-400"
                      >
                        {BLEND_MODE_OPTIONS.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="text-[11px] text-cyan-200/75 font-medium shrink-0">Opacity</label>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={activeLayer.opacity}
                        onChange={(e) => props.onChangeLayerOpacity(activeLayer.id, Number(e.target.value))}
                        className="ocean-slider flex-1"
                      />
                      <span className="w-9 text-right text-[11px] font-mono-tabular text-cyan-200">
                        {activeLayer.opacity}%
                      </span>
                    </div>
                  </div>
                )}

                {/* Layer Stack Actions */}
                <div className="flex items-center justify-between gap-1">
                  <button
                    type="button"
                    onClick={props.onNewLayer}
                    title="New Raster Layer"
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 text-xs font-medium rounded bg-[#0d4658] text-cyan-100 hover:bg-[#135d73] transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New</span>
                  </button>
                  <button
                    type="button"
                    onClick={props.onDuplicateLayer}
                    disabled={!activeLayer}
                    title="Duplicate Layer"
                    className="p-1.5 rounded bg-[#092133] border border-cyan-400/15 text-slate-200 hover:bg-[#0d4658] disabled:opacity-40"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={props.onMergeDown}
                    disabled={props.layers.length < 2}
                    title="Merge Down"
                    className="p-1.5 rounded bg-[#092133] border border-cyan-400/15 text-slate-200 hover:bg-[#0d4658] disabled:opacity-40"
                  >
                    <Merge className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onDeleteLayer()}
                    disabled={props.layers.length <= 1}
                    title="Delete Active Layer"
                    className="p-1.5 rounded bg-[#092133] border border-cyan-400/15 text-rose-300 hover:bg-rose-950/60 disabled:opacity-40"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Draggable Layers List */}
                <div className="space-y-1">
                  {props.layers.map((layer, index) => {
                    const isSelected = layer.id === props.activeLayerId;
                    const isRenaming = renamingId === layer.id;

                    return (
                      <div
                        key={layer.id}
                        draggable={!isRenaming}
                        onDragStart={() => setDragIndex(index)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (dragIndex !== null && dragIndex !== index) {
                            props.onReorderLayers(dragIndex, index);
                          }
                          setDragIndex(null);
                        }}
                        onClick={() => props.onSelectLayer(layer.id)}
                        className={`flex items-center gap-2 px-2 py-2 rounded-md border cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-cyan-500/15 border-cyan-400/45 text-cyan-100'
                            : 'bg-[#061826] border-cyan-400/10 text-slate-200 hover:border-cyan-400/25'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            props.onToggleLayerVisibility(layer.id);
                          }}
                          title={layer.visible ? 'Hide Layer' : 'Show Layer'}
                          className="p-1 rounded text-cyan-200/80 hover:bg-[#0d4658]"
                        >
                          {layer.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
                        </button>

                        <span className="text-[10px] font-mono-tabular px-1.5 py-0.5 rounded bg-[#04111d] text-cyan-300/80 border border-cyan-400/15 uppercase shrink-0">
                          {layer.type === 'raster' ? 'IMG' : layer.type.slice(0, 3)}
                        </span>

                        <div className="flex-1 min-w-0">
                          {isRenaming ? (
                            <input
                              autoFocus
                              value={renameText}
                              onChange={(e) => setRenameText(e.target.value)}
                              onBlur={() => {
                                if (renameText.trim()) props.onRenameLayer(layer.id, renameText.trim());
                                setRenamingId(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  if (renameText.trim()) props.onRenameLayer(layer.id, renameText.trim());
                                  setRenamingId(null);
                                } else if (e.key === 'Escape') {
                                  setRenamingId(null);
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full bg-[#04111d] border border-cyan-400 rounded px-1.5 py-0.5 text-xs text-cyan-100 focus:outline-none"
                            />
                          ) : (
                            <div
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                setRenamingId(layer.id);
                                setRenameText(layer.name);
                              }}
                              title="Double-click to rename, drag to reorder"
                              className="text-xs font-medium truncate"
                            >
                              {layer.name}
                            </div>
                          )}
                          <div className="text-[10px] text-cyan-200/50 font-mono-tabular">
                            {layer.opacity}% · {BLEND_MODE_OPTIONS.find((b) => b.value === layer.blendMode)?.label ?? 'Normal'}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            props.onToggleLayerLock(layer.id);
                          }}
                          title={layer.locked ? 'Unlock Layer' : 'Lock Layer'}
                          className={`p-1 rounded hover:bg-[#0d4658] ${
                            layer.locked ? 'text-amber-300' : 'text-slate-500 hover:text-cyan-200'
                          }`}
                        >
                          {layer.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* ================= FILES TAB ================= */}
        {props.activeTab === 'files' && (
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".png,.jpg,.jpeg,.jfif,.webp,.gif,.svg,.bmp,.avif,image/*"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  props.onUploadFiles(e.target.files);
                  e.target.value = '';
                }
              }}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2.5 px-4 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-[#03131f] font-semibold text-xs flex items-center justify-center gap-2 transition-colors shadow-sm"
            >
              <Upload className="w-4 h-4" />
              <span>+ Upload Image (PNG / JPG)</span>
            </button>

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  props.onUploadFiles(e.dataTransfer.files);
                }
              }}
              className="border border-dashed border-cyan-400/30 rounded-lg p-3 text-center bg-[#061826]/70 text-[11px] text-cyan-200/70"
            >
              Drag & Drop PNG, JPG, JPEG, WEBP, GIF, or SVG images here
            </div>

            {props.uploadedFiles.length === 0 ? (
              <div className="text-xs text-slate-400 py-6 text-center">
                No uploaded images yet. Click + Upload above to open or add images to your canvas.
              </div>
            ) : (
              <div className="space-y-2">
                {props.uploadedFiles.map((file) => (
                  <div
                    key={file.id}
                    className="bg-[#061826] border border-cyan-400/15 rounded-lg p-2 flex items-center gap-2.5 hover:border-cyan-400/35 transition-colors"
                  >
                    <div
                      onClick={() => props.onOpenUploadedFile(file)}
                      className="w-14 h-14 rounded overflow-hidden canvas-checkerboard border border-cyan-400/20 shrink-0 cursor-pointer"
                    >
                      <img
                        src={file.dataUrl}
                        alt={file.name}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="text-xs font-medium text-cyan-100 truncate" title={file.name}>
                          {file.name}
                        </div>
                        {file.projectData && (
                          <span className="text-[9.5px] font-mono-tabular px-1 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 shrink-0">
                            LAYERED
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] font-mono-tabular text-cyan-200/60">
                        {file.width} × {file.height} px
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => props.onOpenUploadedFile(file)}
                          className="px-2 py-0.5 text-[10.5px] font-medium rounded bg-[#0d4658] text-cyan-100 hover:bg-[#135d73] transition-colors"
                        >
                          Open
                        </button>
                        {props.hasDocument && (
                          <button
                            type="button"
                            onClick={() => props.onInsertUploadedAsLayer(file)}
                            title="Insert into current canvas as a layer"
                            className="px-2 py-0.5 text-[10.5px] font-medium rounded bg-[#092133] border border-cyan-400/20 text-cyan-200 hover:bg-[#0d4658] transition-colors flex items-center gap-1"
                          >
                            <FolderPlus className="w-2.5 h-2.5" />
                            <span>Layer</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => props.onDeleteUploadedFile(file.id)}
                          title="Remove from Files"
                          className="p-1 rounded text-rose-300 hover:bg-rose-950/60 ml-auto"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================= COLOR TAB ================= */}
        {props.activeTab === 'color' && (
          <ColorPickerPanel
            foregroundColor={props.foregroundColor}
            backgroundColor={props.backgroundColor}
            editingTarget={props.colorTarget}
            palette={props.palette}
            onSetEditingTarget={props.onSetColorTarget}
            onChangeColor={props.onChangeColor}
            onSwapColors={props.onSwapColors}
            onAddPaletteColor={props.onAddPaletteColor}
            onRemovePaletteColor={props.onRemovePaletteColor}
          />
        )}

        {/* ================= PROPERTIES TAB ================= */}
        {props.activeTab === 'properties' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-cyan-400/15">
              <div>
                <div className="text-xs font-semibold text-cyan-200">{activeToolDef?.name ?? 'Properties'}</div>
                <div className="text-[11px] text-slate-400">{activeToolDef?.description}</div>
              </div>
            </div>

            {/* BRUSH & EDITING SETTINGS */}
            {BRUSH_TOOLS.includes(props.activeTool) && (
              <div className="space-y-3 bg-[#061826] p-3 rounded-lg border border-cyan-400/15">
                {props.activeTool === 'clone' && (
                  <div className="text-[11px] text-cyan-200 bg-cyan-500/10 border border-cyan-400/25 rounded p-2">
                    Hold <strong className="text-cyan-100">Alt + Click</strong> on the canvas to pick a clone source point, then paint.
                  </div>
                )}

                {/* Live ibisPaint-Style S-Curve Stroke Preview */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10.5px] text-cyan-200/70">
                    <span>Stroke Preview</span>
                    <span className="font-mono-tabular text-cyan-300">
                      {props.brushSettings.size}px · {props.brushSettings.opacity}%
                    </span>
                  </div>
                  <div className="h-16 rounded-md canvas-checkerboard border border-cyan-400/20 overflow-hidden">
                    <canvas
                      ref={brushPreviewCanvasRef}
                      width={260}
                      height={64}
                      className="w-full h-full block"
                    />
                  </div>
                </div>

                <SliderRow
                  label="Size"
                  value={props.brushSettings.size}
                  min={1}
                  max={500}
                  unit="px"
                  onChange={(v) => props.onChangeBrushSettings({ size: v })}
                />
                <SliderRow
                  label="Opacity"
                  value={props.brushSettings.opacity}
                  min={0}
                  max={100}
                  unit="%"
                  onChange={(v) => props.onChangeBrushSettings({ opacity: v })}
                />
                <SliderRow
                  label="Stabilizer (ibis-Style)"
                  value={props.brushSettings.stabilizer}
                  min={0}
                  max={10}
                  unit=""
                  onChange={(v) => props.onChangeBrushSettings({ stabilizer: v })}
                />
                <SliderRow
                  label="Force Fade / Taper"
                  value={props.brushSettings.taper}
                  min={0}
                  max={100}
                  unit="%"
                  onChange={(v) => props.onChangeBrushSettings({ taper: v })}
                />
                <SliderRow
                  label="Flow"
                  value={props.brushSettings.flow}
                  min={1}
                  max={100}
                  unit="%"
                  onChange={(v) => props.onChangeBrushSettings({ flow: v })}
                />
                <SliderRow
                  label="Hardness"
                  value={props.brushSettings.hardness}
                  min={0}
                  max={100}
                  unit="%"
                  onChange={(v) => props.onChangeBrushSettings({ hardness: v })}
                />
                <SliderRow
                  label="Spacing"
                  value={props.brushSettings.spacing}
                  min={1}
                  max={200}
                  unit="%"
                  onChange={(v) => props.onChangeBrushSettings({ spacing: v })}
                />
                <SliderRow
                  label="Smoothing"
                  value={props.brushSettings.smoothing}
                  min={0}
                  max={100}
                  unit="%"
                  onChange={(v) => props.onChangeBrushSettings({ smoothing: v })}
                />

                <div className="pt-2 border-t border-cyan-400/15 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10.5px] uppercase tracking-wider font-semibold text-cyan-300/80">
                      Brush Physics & Dynamics
                    </span>
                    <button
                      type="button"
                      onClick={props.onResetBrushPreset}
                      title="Reset current brush to default physics"
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] bg-[#04111d] border border-cyan-400/20 text-cyan-200/80 hover:bg-[#0d4658] hover:text-cyan-100"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      <span>Reset</span>
                    </button>
                  </div>

                  <SliderRow
                    label="Color Mixing"
                    value={props.brushSettings.colorMix}
                    min={0}
                    max={100}
                    unit="%"
                    onChange={(v) => props.onChangeBrushSettings({ colorMix: v })}
                  />
                  <SliderRow
                    label="Wetness / Dilution"
                    value={props.brushSettings.wetness}
                    min={0}
                    max={100}
                    unit="%"
                    onChange={(v) => props.onChangeBrushSettings({ wetness: v })}
                  />
                  <SliderRow
                    label="Paper Texture"
                    value={props.brushSettings.textureStrength}
                    min={0}
                    max={100}
                    unit="%"
                    onChange={(v) => props.onChangeBrushSettings({ textureStrength: v })}
                  />
                  <SliderRow
                    label="Scatter / Jitter"
                    value={props.brushSettings.jitter}
                    min={0}
                    max={100}
                    unit="%"
                    onChange={(v) => props.onChangeBrushSettings({ jitter: v })}
                  />
                </div>

                {['smudge', 'blur', 'sharpen', 'dodge', 'burn'].includes(props.activeTool) && (
                  <SliderRow
                    label="Strength"
                    value={props.brushSettings.strength}
                    min={1}
                    max={100}
                    unit="%"
                    onChange={(v) => props.onChangeBrushSettings({ strength: v })}
                  />
                )}

                {props.activeTool === 'pattern' && (
                  <div className="space-y-1">
                    <label className="text-[11px] text-cyan-200/75 font-medium">Pattern Motif</label>
                    <select
                      value={props.brushSettings.patternType}
                      onChange={(e) =>
                        props.onChangeBrushSettings({
                          patternType: e.target.value as BrushSettings['patternType'],
                        })
                      }
                      className="w-full bg-[#04111d] border border-cyan-400/20 rounded px-2 py-1.5 text-xs text-cyan-100"
                    >
                      <option value="oceanWaves">Ocean Waves</option>
                      <option value="dots">Polka Dots</option>
                      <option value="grid">Studio Grid</option>
                      <option value="diagonal">Diagonal Stripes</option>
                      <option value="checker">Checkerboard</option>
                    </select>
                  </div>
                )}

                <label className="flex items-center justify-between pt-1 cursor-pointer">
                  <span className="text-xs text-slate-200">Velocity / Stylus Pressure</span>
                  <input
                    type="checkbox"
                    checked={props.brushSettings.pressureSim}
                    onChange={(e) => props.onChangeBrushSettings({ pressureSim: e.target.checked })}
                    className="accent-cyan-400 w-4 h-4"
                  />
                </label>
              </div>
            )}

            {/* MAGIC WAND / PAINT BUCKET */}
            {(props.activeTool === 'magicWand' || props.activeTool === 'paintBucket') && (
              <div className="space-y-3 bg-[#061826] p-3 rounded-lg border border-cyan-400/15">
                <SliderRow
                  label="Tolerance"
                  value={props.selectionSettings.tolerance}
                  min={0}
                  max={255}
                  unit=""
                  onChange={(v) => props.onChangeSelectionSettings({ tolerance: v })}
                />
                {props.activeTool === 'magicWand' && (
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-xs text-slate-200">Contiguous Region</span>
                    <input
                      type="checkbox"
                      checked={props.selectionSettings.contiguous}
                      onChange={(e) => props.onChangeSelectionSettings({ contiguous: e.target.checked })}
                      className="accent-cyan-400 w-4 h-4"
                    />
                  </label>
                )}
              </div>
            )}

            {/* GRADIENT */}
            {props.activeTool === 'gradient' && (
              <div className="space-y-3 bg-[#061826] p-3 rounded-lg border border-cyan-400/15">
                <div className="space-y-1">
                  <label className="text-[11px] text-cyan-200/75 font-medium">Gradient Type</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['linear', 'radial'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => props.onChangeGradientSettings({ type: t })}
                        className={`py-1.5 text-xs font-medium rounded border capitalize ${
                          props.gradientSettings.type === t
                            ? 'bg-[#0d4658] border-cyan-400/50 text-cyan-100'
                            : 'bg-[#04111d] border-cyan-400/15 text-slate-300'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-cyan-200/75 font-medium">Color Stop Mode</label>
                  <select
                    value={props.gradientSettings.mode}
                    onChange={(e) =>
                      props.onChangeGradientSettings({ mode: e.target.value as GradientSettings['mode'] })
                    }
                    className="w-full bg-[#04111d] border border-cyan-400/20 rounded px-2 py-1.5 text-xs text-cyan-100"
                  >
                    <option value="fg-bg">Foreground → Background</option>
                    <option value="fg-transparent">Foreground → Transparent</option>
                  </select>
                </div>
                <SliderRow
                  label="Opacity"
                  value={props.gradientSettings.opacity}
                  min={0}
                  max={100}
                  unit="%"
                  onChange={(v) => props.onChangeGradientSettings({ opacity: v })}
                />
              </div>
            )}

            {/* SHAPE TOOLS */}
            {SHAPE_TOOLS.includes(props.activeTool) && (
              <div className="space-y-3 bg-[#061826] p-3 rounded-lg border border-cyan-400/15">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={props.shapeSettings.fillEnabled}
                      onChange={(e) => props.onChangeShapeSettings({ fillEnabled: e.target.checked })}
                      className="accent-cyan-400"
                    />
                    <span>Fill Color</span>
                  </label>
                  <input
                    type="color"
                    value={props.shapeSettings.fillColor}
                    onChange={(e) => props.onChangeShapeSettings({ fillColor: e.target.value.toUpperCase() })}
                    className="w-8 h-6 rounded border border-cyan-400/25 bg-transparent cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={props.shapeSettings.strokeEnabled}
                      onChange={(e) => props.onChangeShapeSettings({ strokeEnabled: e.target.checked })}
                      className="accent-cyan-400"
                    />
                    <span>Stroke Color</span>
                  </label>
                  <input
                    type="color"
                    value={props.shapeSettings.strokeColor}
                    onChange={(e) => props.onChangeShapeSettings({ strokeColor: e.target.value.toUpperCase() })}
                    className="w-8 h-6 rounded border border-cyan-400/25 bg-transparent cursor-pointer"
                  />
                </div>

                <SliderRow
                  label="Stroke Width"
                  value={props.shapeSettings.strokeWidth}
                  min={0}
                  max={60}
                  unit="px"
                  onChange={(v) => props.onChangeShapeSettings({ strokeWidth: v })}
                />
                <SliderRow
                  label="Opacity"
                  value={props.shapeSettings.opacity}
                  min={0}
                  max={100}
                  unit="%"
                  onChange={(v) => props.onChangeShapeSettings({ opacity: v })}
                />

                {props.activeTool === 'roundedRect' && (
                  <SliderRow
                    label="Corner Radius"
                    value={props.shapeSettings.cornerRadius}
                    min={0}
                    max={150}
                    unit="px"
                    onChange={(v) => props.onChangeShapeSettings({ cornerRadius: v })}
                  />
                )}
                {props.activeTool === 'polygon' && (
                  <SliderRow
                    label="Sides"
                    value={props.shapeSettings.polygonSides}
                    min={3}
                    max={12}
                    unit=""
                    onChange={(v) => props.onChangeShapeSettings({ polygonSides: v })}
                  />
                )}
                {props.activeTool === 'star' && (
                  <SliderRow
                    label="Star Points"
                    value={props.shapeSettings.starPoints}
                    min={3}
                    max={14}
                    unit=""
                    onChange={(v) => props.onChangeShapeSettings({ starPoints: v })}
                  />
                )}
                {props.activeTool === 'customShape' && (
                  <div className="space-y-1">
                    <label className="text-[11px] text-cyan-200/75 font-medium">Shape Motif</label>
                    <select
                      value={props.shapeSettings.customShapeType}
                      onChange={(e) =>
                        props.onChangeShapeSettings({
                          customShapeType: e.target.value as ShapeSettings['customShapeType'],
                        })
                      }
                      className="w-full bg-[#04111d] border border-cyan-400/20 rounded px-2 py-1.5 text-xs text-cyan-100"
                    >
                      <option value="moon">Crescent Moon</option>
                      <option value="wave">Ocean Wave</option>
                      <option value="diamond">Diamond</option>
                      <option value="hexagon">Hexagon</option>
                      <option value="speechBubble">Speech Bubble</option>
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* TEXT TOOL */}
            {props.activeTool === 'text' && (
              <div className="space-y-3 bg-[#061826] p-3 rounded-lg border border-cyan-400/15">
                <div className="text-[11px] text-cyan-200/80">
                  Click anywhere on canvas to place text, or double-click an existing Text layer to edit.
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-cyan-200/75 font-medium">Font Family</label>
                  <select
                    value={props.textSettings.fontFamily}
                    onChange={(e) => props.onChangeTextSettings({ fontFamily: e.target.value })}
                    className="w-full bg-[#04111d] border border-cyan-400/20 rounded px-2 py-1.5 text-xs text-cyan-100"
                  >
                    {FONT_FAMILIES.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>

                <SliderRow
                  label="Font Size"
                  value={props.textSettings.fontSize}
                  min={10}
                  max={240}
                  unit="px"
                  onChange={(v) => props.onChangeTextSettings({ fontSize: v })}
                />
                <SliderRow
                  label="Letter Spacing"
                  value={props.textSettings.letterSpacing}
                  min={-5}
                  max={40}
                  unit="px"
                  onChange={(v) => props.onChangeTextSettings({ letterSpacing: v })}
                />
                <SliderRow
                  label="Opacity"
                  value={props.textSettings.opacity}
                  min={0}
                  max={100}
                  unit="%"
                  onChange={(v) => props.onChangeTextSettings({ opacity: v })}
                />

                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => props.onChangeTextSettings({ bold: !props.textSettings.bold })}
                      className={`p-1.5 rounded border ${
                        props.textSettings.bold
                          ? 'bg-[#0d4658] border-cyan-400/50 text-cyan-100'
                          : 'bg-[#04111d] border-cyan-400/15 text-slate-300'
                      }`}
                    >
                      <Bold className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => props.onChangeTextSettings({ italic: !props.textSettings.italic })}
                      className={`p-1.5 rounded border ${
                        props.textSettings.italic
                          ? 'bg-[#0d4658] border-cyan-400/50 text-cyan-100'
                          : 'bg-[#04111d] border-cyan-400/15 text-slate-300'
                      }`}
                    >
                      <Italic className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => props.onChangeTextSettings({ underline: !props.textSettings.underline })}
                      className={`p-1.5 rounded border ${
                        props.textSettings.underline
                          ? 'bg-[#0d4658] border-cyan-400/50 text-cyan-100'
                          : 'bg-[#04111d] border-cyan-400/15 text-slate-300'
                      }`}
                    >
                      <Underline className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    {(
                      [
                        { id: 'left', icon: AlignLeft },
                        { id: 'center', icon: AlignCenter },
                        { id: 'right', icon: AlignRight },
                      ] as const
                    ).map((a) => {
                      const Icon = a.icon;
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => props.onChangeTextSettings({ align: a.id })}
                          className={`p-1.5 rounded border ${
                            props.textSettings.align === a.id
                              ? 'bg-[#0d4658] border-cyan-400/50 text-cyan-100'
                              : 'bg-[#04111d] border-cyan-400/15 text-slate-300'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-200">Text Color</span>
                  <input
                    type="color"
                    value={props.textSettings.color}
                    onChange={(e) => props.onChangeTextSettings({ color: e.target.value.toUpperCase() })}
                    className="w-9 h-7 rounded border border-cyan-400/25 bg-transparent cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* FRAME DIVIDER */}
            {props.activeTool === 'frameDivider' && (
              <div className="space-y-3 bg-[#061826] p-3 rounded-lg border border-cyan-400/15">
                <div className="text-xs font-medium text-cyan-200">Comic / Panel Grid Presets</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: '2x2', label: '2 × 2' },
                      { id: '2col', label: '2 Cols' },
                      { id: '2row', label: '2 Rows' },
                      { id: '3x2', label: '3 × 2' },
                      { id: '1+2', label: '1 + 2' },
                    ] as const
                  ).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => props.onCreateFramePreset(p.id)}
                      className="py-1.5 px-2 text-xs font-medium rounded bg-[#0d4658] text-cyan-100 hover:bg-[#135d73] transition-colors"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {activeLayer?.type === 'frame' && activeLayer.frameData ? (
                  <>
                    <div className="pt-2 border-t border-cyan-400/10 space-y-2">
                      <div className="text-[11px] text-cyan-200/75">
                        Click a frame panel on canvas to move/resize it, or split/delete below:
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={!activeLayer.frameData.selectedCellId}
                          onClick={() => props.onSplitFrameCell('v')}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 text-[11px] rounded bg-[#092133] border border-cyan-400/20 text-cyan-100 hover:bg-[#0d4658] disabled:opacity-40"
                        >
                          <SplitSquareVertical className="w-3.5 h-3.5" />
                          <span>Split V</span>
                        </button>
                        <button
                          type="button"
                          disabled={!activeLayer.frameData.selectedCellId}
                          onClick={() => props.onSplitFrameCell('h')}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 text-[11px] rounded bg-[#092133] border border-cyan-400/20 text-cyan-100 hover:bg-[#0d4658] disabled:opacity-40"
                        >
                          <SplitSquareHorizontal className="w-3.5 h-3.5" />
                          <span>Split H</span>
                        </button>
                        <button
                          type="button"
                          disabled={!activeLayer.frameData.selectedCellId || activeLayer.frameData.cells.length <= 1}
                          onClick={props.onDeleteFrameCell}
                          className="p-1.5 rounded bg-[#092133] border border-cyan-400/20 text-rose-300 hover:bg-rose-950/50 disabled:opacity-40"
                          title="Delete Selected Panel"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <SliderRow
                      label="Border Width"
                      value={activeLayer.frameData.borderWidth}
                      min={1}
                      max={30}
                      unit="px"
                      onChange={(v) => props.onUpdateFrameSettings({ borderWidth: v })}
                    />
                    <SliderRow
                      label="Gutter"
                      value={activeLayer.frameData.gutter}
                      min={0}
                      max={60}
                      unit="px"
                      onChange={(v) => props.onUpdateFrameSettings({ gutter: v })}
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-200">Border Color</span>
                      <input
                        type="color"
                        value={activeLayer.frameData.borderColor}
                        onChange={(e) => props.onUpdateFrameSettings({ borderColor: e.target.value.toUpperCase() })}
                        className="w-8 h-6 rounded border border-cyan-400/25 bg-transparent cursor-pointer"
                      />
                    </div>
                  </>
                ) : (
                  <div className="text-[11px] text-slate-400">
                    Or drag directly on canvas to draw a custom comic panel!
                  </div>
                )}
              </div>
            )}

            {/* CROP */}
            {props.activeTool === 'crop' && props.cropRect && (
              <div className="space-y-3 bg-[#061826] p-3 rounded-lg border border-cyan-400/15">
                <div className="text-xs font-medium text-cyan-200">Aspect Ratio</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['free', '1:1', '4:3', '16:9', '9:16'] as const).map((ratio) => (
                    <button
                      key={ratio}
                      type="button"
                      onClick={() => props.onChangeCropAspect(ratio)}
                      className={`py-1.5 text-xs font-medium rounded border capitalize ${
                        props.cropRect?.aspect === ratio
                          ? 'bg-[#0d4658] border-cyan-400/50 text-cyan-100'
                          : 'bg-[#04111d] border-cyan-400/15 text-slate-300'
                      }`}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
                <div className="text-[11px] font-mono-tabular text-cyan-200/75">
                  {Math.round(props.cropRect.width)} × {Math.round(props.cropRect.height)} px
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={props.onApplyCrop}
                    className="flex-1 py-1.5 px-3 text-xs font-semibold rounded bg-cyan-500 text-[#03131f] hover:bg-cyan-400 flex items-center justify-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Apply Crop</span>
                  </button>
                  <button
                    type="button"
                    onClick={props.onCancelCrop}
                    className="py-1.5 px-3 text-xs font-medium rounded bg-[#092133] border border-cyan-400/20 text-slate-200 hover:bg-[#0d4658]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* FX FILTER */}
            {props.activeTool === 'filter' && (
              <div className="space-y-2.5 bg-[#061826] p-3 rounded-lg border border-cyan-400/15">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-cyan-200">Live FX Filters</span>
                  <button
                    type="button"
                    onClick={props.onResetFilter}
                    className="text-[11px] text-cyan-300 hover:underline flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                </div>

                <SliderRow label="Brightness" value={props.filterSettings.brightness} min={-100} max={100} unit="" onChange={(v) => props.onChangeFilterSettings({ brightness: v })} />
                <SliderRow label="Contrast" value={props.filterSettings.contrast} min={-100} max={100} unit="" onChange={(v) => props.onChangeFilterSettings({ contrast: v })} />
                <SliderRow label="Saturation" value={props.filterSettings.saturation} min={-100} max={100} unit="" onChange={(v) => props.onChangeFilterSettings({ saturation: v })} />
                <SliderRow label="Hue" value={props.filterSettings.hue} min={-180} max={180} unit="°" onChange={(v) => props.onChangeFilterSettings({ hue: v })} />
                <SliderRow label="Exposure" value={props.filterSettings.exposure} min={-100} max={100} unit="" onChange={(v) => props.onChangeFilterSettings({ exposure: v })} />
                <SliderRow label="Temperature" value={props.filterSettings.temperature} min={-100} max={100} unit="" onChange={(v) => props.onChangeFilterSettings({ temperature: v })} />
                <SliderRow label="Blur" value={props.filterSettings.blur} min={0} max={40} unit="px" onChange={(v) => props.onChangeFilterSettings({ blur: v })} />
                <SliderRow label="Sharpen" value={props.filterSettings.sharpen} min={0} max={100} unit="%" onChange={(v) => props.onChangeFilterSettings({ sharpen: v })} />
                <SliderRow label="Grayscale" value={props.filterSettings.grayscale} min={0} max={100} unit="%" onChange={(v) => props.onChangeFilterSettings({ grayscale: v })} />
                <SliderRow label="Sepia" value={props.filterSettings.sepia} min={0} max={100} unit="%" onChange={(v) => props.onChangeFilterSettings({ sepia: v })} />

                <label className="flex items-center justify-between pt-1 cursor-pointer">
                  <span className="text-xs text-slate-200">Invert Colors</span>
                  <input
                    type="checkbox"
                    checked={props.filterSettings.invert}
                    onChange={(e) => props.onChangeFilterSettings({ invert: e.target.checked })}
                    className="accent-cyan-400 w-4 h-4"
                  />
                </label>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={props.onApplyFilter}
                    className="flex-1 py-1.5 px-3 text-xs font-semibold rounded bg-cyan-500 text-[#03131f] hover:bg-cyan-400 flex items-center justify-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Apply FX</span>
                  </button>
                  <button
                    type="button"
                    onClick={props.onCancelFilter}
                    className="py-1.5 px-3 text-xs font-medium rounded bg-[#092133] border border-cyan-400/20 text-slate-200 hover:bg-[#0d4658]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* MOVE / TRANSFORM / SELECTION */}
            {(props.activeTool === 'move' || props.activeTool === 'selection') && activeLayer && (
              <div className="space-y-3 bg-[#061826] p-3 rounded-lg border border-cyan-400/15">
                <div className="text-xs font-medium text-cyan-200">Layer Transform</div>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono-tabular">
                  <div className="bg-[#04111d] p-2 rounded border border-cyan-400/10">
                    <span className="text-cyan-300/60">X:</span> {Math.round(activeLayer.transform.x)}px
                  </div>
                  <div className="bg-[#04111d] p-2 rounded border border-cyan-400/10">
                    <span className="text-cyan-300/60">Y:</span> {Math.round(activeLayer.transform.y)}px
                  </div>
                  <div className="bg-[#04111d] p-2 rounded border border-cyan-400/10">
                    <span className="text-cyan-300/60">Scale:</span> {Math.round(activeLayer.transform.scaleX * 100)}%
                  </div>
                  <div className="bg-[#04111d] p-2 rounded border border-cyan-400/10">
                    <span className="text-cyan-300/60">Rot:</span> {Math.round(activeLayer.transform.rotation)}°
                  </div>
                </div>
                <div className="text-[11px] text-slate-400">
                  Drag handles on canvas to resize or rotate. Hold <strong className="text-cyan-200">Shift</strong> to keep proportions.
                </div>
                <button
                  type="button"
                  onClick={() => props.onResetLayerTransform(activeLayer.id)}
                  className="w-full py-1.5 px-3 text-xs font-medium rounded bg-[#092133] border border-cyan-400/20 text-cyan-100 hover:bg-[#0d4658]"
                >
                  Reset Layer Transform
                </button>
              </div>
            )}

            {/* CANVAS VIEW ROTATION */}
            {props.hasDocument && (
              <div className="space-y-2 bg-[#061826] p-3 rounded-lg border border-cyan-400/15">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-cyan-200/80">Canvas Rotation</span>
                  <button
                    type="button"
                    onClick={() => props.onChangeCanvasRotation(0)}
                    className="text-[11px] text-cyan-300 hover:underline"
                  >
                    Reset 0°
                  </button>
                </div>
                <SliderRow
                  label="Angle"
                  value={props.canvasRotation}
                  min={-180}
                  max={180}
                  unit="°"
                  onChange={props.onChangeCanvasRotation}
                />
              </div>
            )}
          </div>
        )}

        {/* ================= HISTORY TAB ================= */}
        {props.activeTab === 'history' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={props.historyIndex <= 0}
                onClick={props.onUndo}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-medium rounded bg-[#0d4658] text-cyan-100 hover:bg-[#135d73] disabled:opacity-40"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>Undo</span>
              </button>
              <button
                type="button"
                disabled={props.historyIndex >= props.history.length - 1}
                onClick={props.onRedo}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-medium rounded bg-[#0d4658] text-cyan-100 hover:bg-[#135d73] disabled:opacity-40"
              >
                <Redo2 className="w-3.5 h-3.5" />
                <span>Redo</span>
              </button>
            </div>

            {props.history.length === 0 ? (
              <div className="text-xs text-slate-400 py-8 text-center">No history snapshots yet.</div>
            ) : (
              <div className="space-y-1">
                {props.history.map((entry, idx) => {
                  const isCurrent = idx === props.historyIndex;
                  const isFuture = idx > props.historyIndex;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => props.onJumpHistory(idx)}
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded text-left text-xs border transition-colors ${
                        isCurrent
                          ? 'bg-cyan-500/20 border-cyan-400/45 text-cyan-100 font-medium'
                          : isFuture
                          ? 'bg-[#04111d] border-cyan-400/5 text-slate-500 hover:text-slate-300'
                          : 'bg-[#061826] border-cyan-400/10 text-slate-200 hover:border-cyan-400/30'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        {isCurrent && <ChevronRight className="w-3 h-3 text-cyan-300 shrink-0" />}
                        <span className="truncate">{entry.label}</span>
                      </span>
                      <span className="font-mono-tabular text-[10px] text-cyan-300/60 shrink-0 ml-2">
                        {new Date(entry.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};

const SliderRow: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (val: number) => void;
}> = ({ label, value, min, max, unit, onChange }) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-cyan-100/80 font-medium">{label}</span>
      <span className="font-mono-tabular text-cyan-300">
        {value}
        {unit}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="ocean-slider w-full"
    />
  </div>
);
