export type ToolId =
  // Selection / Vector
  | 'vector'
  | 'move'
  | 'selection'
  | 'rectSelect'
  | 'ellipseSelect'
  | 'lasso'
  | 'polygonLasso'
  | 'magicWand'
  // Drawing
  | 'pencil'
  | 'brush'
  | 'marker'
  | 'pen'
  | 'ink'
  | 'airbrush'
  | 'spray'
  | 'crayon'
  | 'charcoal'
  | 'watercolor'
  | 'oilBrush'
  // Painting
  | 'paintBucket'
  | 'gradient'
  | 'colorPicker'
  | 'pattern'
  // Editing
  | 'eraser'
  | 'softEraser'
  | 'smudge'
  | 'blur'
  | 'sharpen'
  | 'clone'
  | 'dodge'
  | 'burn'
  // Shapes
  | 'rectangle'
  | 'roundedRect'
  | 'circle'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'polygon'
  | 'star'
  | 'triangle'
  | 'heart'
  | 'customShape'
  // Text & Frame
  | 'text'
  | 'frameDivider'
  // Image & Navigation
  | 'crop'
  | 'rotateTool'
  | 'flipH'
  | 'flipV'
  | 'filter'
  | 'zoom';

export type ToolCategory =
  | 'Selection / Vector'
  | 'Drawing'
  | 'Painting'
  | 'Editing'
  | 'Shapes'
  | 'Text & Frame'
  | 'Image & View';

export interface ToolDefinition {
  id: ToolId;
  name: string;
  category: ToolCategory;
  shortcut?: string;
  description: string;
  isInstantAction?: boolean;
}

export type BlendMode =
  | 'source-over'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'difference'
  | 'hard-light'
  | 'soft-light';

export const BLEND_MODE_OPTIONS: { value: BlendMode; label: string }[] = [
  { value: 'source-over', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
  { value: 'color-dodge', label: 'Color Dodge' },
  { value: 'difference', label: 'Difference' },
  { value: 'hard-light', label: 'Hard Light' },
  { value: 'soft-light', label: 'Soft Light' },
];

export interface BrushSettings {
  size: number;            // 1 - 500 px
  opacity: number;         // 0 - 100 %
  flow: number;            // 1 - 100 %
  hardness: number;        // 0 - 100 %
  spacing: number;         // 1 - 200 %
  smoothing: number;       // 0 - 100 %
  stabilizer: number;      // 0 - 10 (ibisPaint-style stabilizer)
  taper: number;           // 0 - 100 % (start/end force fade taper)
  pressureSim: boolean;
  strength: number;        // 1 - 100 % (for smudge/blur/sharpen/dodge/burn)
  colorMix: number;        // 0 - 100 % (wet pigment mixing with canvas)
  wetness: number;         // 0 - 100 % (pigment dilution & wet bleed)
  textureStrength: number; // 0 - 100 % (canvas paper tooth / grain)
  jitter: number;          // 0 - 100 % (scatter & organic variation)
  patternType: 'oceanWaves' | 'dots' | 'grid' | 'diagonal' | 'checker';
}

export interface ShapeSettings {
  fillEnabled: boolean;
  fillColor: string;
  strokeEnabled: boolean;
  strokeColor: string;
  strokeWidth: number;
  opacity: number;     // 0 - 100 %
  cornerRadius: number;
  polygonSides: number;
  starPoints: number;
  customShapeType: 'moon' | 'wave' | 'diamond' | 'hexagon' | 'speechBubble';
}

export interface TextSettings {
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: 'left' | 'center' | 'right';
  color: string;
  opacity: number;
  letterSpacing: number;
}

export interface SelectionSettings {
  tolerance: number; // 0 - 255
  contiguous: boolean;
  feather: number;
}

export interface GradientSettings {
  type: 'linear' | 'radial';
  mode: 'fg-bg' | 'fg-transparent';
  opacity: number;
}

export interface FilterSettings {
  brightness: number;  // -100 to 100
  contrast: number;    // -100 to 100
  saturation: number;  // -100 to 100
  hue: number;         // -180 to 180
  blur: number;        // 0 to 40
  sharpen: number;     // 0 to 100
  grayscale: number;   // 0 to 100
  sepia: number;       // 0 to 100
  invert: boolean;
  exposure: number;    // -100 to 100
  temperature: number; // -100 to 100
}

export interface FrameCell {
  id: string;
  x: number; // normalized 0..1 or pixel coords within document
  y: number;
  width: number;
  height: number;
  fillColor?: string;
}

export interface FrameDividerData {
  cells: FrameCell[];
  borderColor: string;
  borderWidth: number;
  gutter: number;
  selectedCellId: string | null;
}

export interface TextLayerData {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: 'left' | 'center' | 'right';
  color: string;
  letterSpacing: number;
}

export interface VectorPoint {
  x: number;
  y: number;
  cx1?: number;
  cy1?: number;
  cx2?: number;
  cy2?: number;
}

export interface VectorPathData {
  points: VectorPoint[];
  closed: boolean;
  strokeColor: string;
  strokeWidth: number;
  fillColor: string;
  fillEnabled: boolean;
  strokeEnabled: boolean;
}

export type LayerType = 'raster' | 'text' | 'frame' | 'vector';

export interface LayerTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number; // degrees
}

export interface Layer {
  id: string;
  name: string;
  type: LayerType;
  visible: boolean;
  locked: boolean;
  opacity: number; // 0 - 100
  blendMode: BlendMode;
  transform: LayerTransform;
  textData?: TextLayerData;
  frameData?: FrameDividerData;
  vectorData?: VectorPathData;
}

export interface SerializedLayer extends Layer {
  imageDataUrl?: string; // base64 PNG for raster layers
}

export interface UploadedFileItem {
  id: string;
  name: string;
  type: string;
  size: number;
  width: number;
  height: number;
  dataUrl: string;
  addedAt: number;
  projectData?: MoonArtProjectFile;
}

export interface SelectionMask {
  width: number;
  height: number;
  data: Uint8Array; // 0 = unselected, 255 = selected
  bounds: { x: number; y: number; width: number; height: number } | null;
}

export interface HistoryEntry {
  id: string;
  label: string;
  timestamp: number;
  docWidth: number;
  docHeight: number;
  layers: SerializedLayer[];
  activeLayerId: string | null;
}

export interface DocumentState {
  id: string;
  name: string;
  width: number;
  height: number;
  resolution: number; // DPI
  background: 'transparent' | 'white' | 'black' | 'ocean' | string;
  layers: Layer[];
  activeLayerId: string | null;
  unsaved: boolean;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
  aspect: 'free' | '1:1' | '4:3' | '16:9' | '9:16';
}

export interface MoonArtProjectFile {
  format: 'moonart-project';
  version: 1;
  savedAt: string;
  document: {
    id: string;
    name: string;
    width: number;
    height: number;
    resolution: number;
    background: string;
    activeLayerId: string | null;
    layers: SerializedLayer[];
  };
  palette: string[];
  foregroundColor: string;
  backgroundColor: string;
}

export type RightPanelTab = 'layers' | 'files' | 'color' | 'properties' | 'history';

export interface ToastMessage {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
}
