import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { AlertCircle, CheckCircle2, Edit3, Info, Save, X } from 'lucide-react';
import { CanvasWorkspace } from './components/CanvasWorkspace';
import { GalleryModal } from './components/GalleryModal';
import { LeftToolbar } from './components/LeftToolbar';
import {
  ExportModal,
  NewCanvasModal,
  ResizeModal,
  RestorePromptBanner,
  SaveAsModal,
} from './components/Modals';
import { RightSidebar } from './components/RightSidebar';
import { StatusBar } from './components/StatusBar';
import { TopMenuBar } from './components/TopMenuBar';
import { auth, signInWithGoogle, signOutUser } from './firebase';
import {
  deleteSharedArtwork,
  deleteUserArtwork,
  editSharedArtworkAndResetHearts,
  fetchLikedShareIdsForRevision,
  renameUserArtwork,
  saveCanvasToUserGallery,
  shareCanvasFor24Hours,
  shareEncodedArtworkFor24Hours,
  SharedArtworkItem,
  subscribeSharedArtworks,
  subscribeUserArtworks,
  toggleSharedArtworkHeart,
  UserArtworkItem,
} from './services/galleryService';
import {
  DEFAULT_BRUSH_SETTINGS,
  DEFAULT_FILTER_SETTINGS,
  DEFAULT_GRADIENT_SETTINGS,
  DEFAULT_SELECTION_SETTINGS,
  DEFAULT_SHAPE_SETTINGS,
  DEFAULT_TEXT_SETTINGS,
  OCEAN_PALETTE,
  TOOL_BRUSH_PRESETS,
} from './constants/tools';
import { applyFiltersToCanvas } from './engine/filterEngine';
import {
  buildMoonArtProject,
  clearAutosaveProject,
  compositeDocumentToCanvas,
  deserializeLayers,
  embedMoonArtMetadataInPngBlob,
  extractMoonArtProjectFromPngFile,
  loadAutosaveProject,
  parseMoonArtProjectFile,
  readImageFileSafely,
  saveAutosaveProject,
  serializeLayers,
  triggerBlobDownload,
  trySniffMoonArtProject,
} from './engine/projectStorage';
import {
  createFullSelection,
  deleteSelectedPixels,
  extractSelectionToCanvas,
} from './engine/selectionEngine';
import { createFramePreset } from './engine/vectorAndShapes';
import {
  BlendMode,
  BrushSettings,
  CropRect,
  DocumentState,
  FilterSettings,
  FrameDividerData,
  GradientSettings,
  HistoryEntry,
  Layer,
  MoonArtProjectFile,
  RightPanelTab,
  SelectionMask,
  SelectionSettings,
  ShapeSettings,
  TextLayerData,
  TextSettings,
  ToastMessage,
  ToolId,
  UploadedFileItem,
  VectorPoint,
} from './types/editor';
import { clamp } from './utils/colorUtils';

const MAX_HISTORY = 35;

export default function App() {
  // Core Document & Layer Canvas Registry
  const [doc, setDoc] = useState<DocumentState | null>(null);
  const canvasMapRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const [renderTick, setRenderTick] = useState(0);
  const requestRender = useCallback(() => setRenderTick((t) => t + 1), []);

  // Viewport State
  const [activeTool, setActiveTool] = useState<ToolId>('brush');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [canvasRotation, setCanvasRotation] = useState(0);
  const [showGrid, setShowGrid] = useState(false);
  const [spacePressed, setSpacePressed] = useState(false);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  // Sidebar & Panels
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [rightWidth, setRightWidth] = useState(304);
  const [rightTab, setRightTab] = useState<RightPanelTab>('layers');

  // Colors & Palette
  const [foregroundColor, setForegroundColor] = useState('#22D3EE');
  const [backgroundColor, setBackgroundColor] = useState('#041524');
  const [colorTarget, setColorTarget] = useState<'fg' | 'bg'>('fg');
  const [palette, setPalette] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('moonart_palette');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return OCEAN_PALETTE;
  });

  // Tool Settings (per-tool remembered ibisPaint physics presets)
  const [brushPresetsByTool, setBrushPresetsByTool] = useState<Record<string, BrushSettings>>(() => {
    const initial: Record<string, BrushSettings> = {};
    for (const [toolKey, patch] of Object.entries(TOOL_BRUSH_PRESETS)) {
      initial[toolKey] = { ...DEFAULT_BRUSH_SETTINGS, ...patch };
    }
    return initial;
  });
  const brushSettings = useMemo<BrushSettings>(
    () =>
      brushPresetsByTool[activeTool] ?? {
        ...DEFAULT_BRUSH_SETTINGS,
        ...(TOOL_BRUSH_PRESETS[activeTool] ?? {}),
      },
    [activeTool, brushPresetsByTool]
  );
  const handleChangeBrushSettings = useCallback(
    (patch: Partial<BrushSettings>) => {
      setBrushPresetsByTool((prev) => {
        const cur =
          prev[activeTool] ?? {
            ...DEFAULT_BRUSH_SETTINGS,
            ...(TOOL_BRUSH_PRESETS[activeTool] ?? {}),
          };
        return { ...prev, [activeTool]: { ...cur, ...patch } };
      });
    },
    [activeTool]
  );
  const handleResetBrushPreset = useCallback(() => {
    setBrushPresetsByTool((prev) => ({
      ...prev,
      [activeTool]: {
        ...DEFAULT_BRUSH_SETTINGS,
        ...(TOOL_BRUSH_PRESETS[activeTool] ?? {}),
      },
    }));
  }, [activeTool]);

  const [shapeSettings, setShapeSettings] = useState<ShapeSettings>(DEFAULT_SHAPE_SETTINGS);
  const [textSettings, setTextSettings] = useState<TextSettings>(DEFAULT_TEXT_SETTINGS);
  const [selectionSettings, setSelectionSettings] = useState<SelectionSettings>(DEFAULT_SELECTION_SETTINGS);
  const [gradientSettings, setGradientSettings] = useState<GradientSettings>(DEFAULT_GRADIENT_SETTINGS);
  const [filterSettings, setFilterSettings] = useState<FilterSettings>(DEFAULT_FILTER_SETTINGS);

  // Selection, Clipboard, Crop, Clone
  const [selectionMask, setSelectionMask] = useState<SelectionMask | null>(null);
  const [clipboardCanvas, setClipboardCanvas] = useState<HTMLCanvasElement | null>(null);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [cloneSource, setCloneSource] = useState<{ x: number; y: number } | null>(null);

  // Uploaded Files Library
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileItem[]>([]);

  // Undo / Redo History
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Modals & Prompts
  const [showNewModal, setShowNewModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showSaveAsModal, setShowSaveAsModal] = useState(false);
  const [resizeModalMode, setResizeModalMode] = useState<'image' | 'canvas' | null>(null);
  const [autosaveCandidate, setAutosaveCandidate] = useState<MoonArtProjectFile | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Firebase Auth, Personal Gallery & 24h Shared Feed
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [showGalleryModal, setShowGalleryModal] = useState(false);
  const [galleryTab, setGalleryTab] = useState<'personal' | 'shared'>('personal');
  const [userArtworks, setUserArtworks] = useState<UserArtworkItem[]>([]);
  const [sharedArtworks, setSharedArtworks] = useState<SharedArtworkItem[]>([]);
  const [likedShareIds, setLikedShareIds] = useState<Set<string>>(new Set());
  const [activeGalleryArtworkId, setActiveGalleryArtworkId] = useState<string | null>(null);
  const [editingSharedPost, setEditingSharedPost] = useState<SharedArtworkItem | null>(null);
  const [savingSharedEdit, setSavingSharedEdit] = useState(false);
  const [fatalError, setFatalError] = useState<Error | null>(null);

  const globalFileInputRef = useRef<HTMLInputElement>(null);
  const importLayerInputRef = useRef<HTMLInputElement>(null);

  // Toast helper
  const notify = useCallback((type: ToastMessage['type'], title: string, message: string) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev.slice(-3), { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  // Persist custom palette
  useEffect(() => {
    try {
      localStorage.setItem('moonart_palette', JSON.stringify(palette));
    } catch {
      // ignore
    }
  }, [palette]);

  // Check IndexedDB autosave on mount
  useEffect(() => {
    loadAutosaveProject().then((proj) => {
      if (proj) setAutosaveCandidate(proj);
    });
  }, []);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
      if (!user) {
        setUserArtworks([]);
        setSharedArtworks([]);
        setLikedShareIds(new Set());
        setActiveGalleryArtworkId(null);
        setEditingSharedPost(null);
      }
    });
    return () => unsub();
  }, []);

  // Attach Firestore subscriptions ONLY once auth is ready & user is authenticated
  useEffect(() => {
    if (!authReady || !authUser) return;
    const unsubPersonal = subscribeUserArtworks(authUser.uid, setUserArtworks, setFatalError);
    const unsubShared = subscribeSharedArtworks(setSharedArtworks, setFatalError);
    return () => {
      unsubPersonal();
      unsubShared();
    };
  }, [authReady, authUser]);

  // Sync per-revision like status for active shared artworks
  useEffect(() => {
    if (!authReady || !authUser || sharedArtworks.length === 0) {
      setLikedShareIds(new Set());
      return;
    }
    let cancelled = false;
    fetchLikedShareIdsForRevision(sharedArtworks, authUser.uid)
      .then((set) => {
        if (!cancelled) setLikedShareIds(set);
      })
      .catch((err) => {
        if (!cancelled) setFatalError(err instanceof Error ? err : new Error(String(err)));
      });
    return () => {
      cancelled = true;
    };
  }, [authReady, authUser, sharedArtworks]);

  // Debounced IndexedDB Autosave
  useEffect(() => {
    if (!doc) return;
    const timer = setTimeout(() => {
      const proj = buildMoonArtProject(doc, canvasMapRef.current, palette, foregroundColor, backgroundColor);
      saveAutosaveProject(proj);
    }, 1500);
    return () => clearTimeout(timer);
  }, [doc, renderTick, palette, foregroundColor, backgroundColor]);

  // Fit Canvas to Screen calculation
  const fitCanvasToScreen = useCallback((width: number, height: number) => {
    const availW = Math.max(320, window.innerWidth - 520);
    const availH = Math.max(240, window.innerHeight - 140);
    const z = clamp(Math.min(availW / width, availH / height, 1), 0.1, 4);
    setZoom(Number(z.toFixed(2)));
    setPan({ x: 0, y: 0 });
    setCanvasRotation(0);
  }, []);

  // Push History Snapshot
  const pushHistory = useCallback(
    (label: string, targetDoc?: DocumentState | null) => {
      const currentDoc = targetDoc ?? doc;
      if (!currentDoc) return;
      const entry: HistoryEntry = {
        id: crypto.randomUUID(),
        label,
        timestamp: Date.now(),
        docWidth: currentDoc.width,
        docHeight: currentDoc.height,
        layers: serializeLayers(currentDoc.layers, canvasMapRef.current),
        activeLayerId: currentDoc.activeLayerId,
      };
      setHistory((prev) => {
        const sliced = prev.slice(0, historyIndex + 1);
        const next = [...sliced, entry];
        if (next.length > MAX_HISTORY) next.shift();
        setHistoryIndex(next.length - 1);
        return next;
      });
      setDoc((prev) => (prev ? { ...prev, unsaved: true } : prev));
    },
    [doc, historyIndex]
  );

  // Restore History Snapshot by Index
  const restoreHistoryIndex = useCallback(
    async (idx: number) => {
      if (idx < 0 || idx >= history.length || !doc) return;
      const entry = history[idx];
      const { layers, canvasMap } = await deserializeLayers(
        entry.layers,
        entry.docWidth,
        entry.docHeight
      );
      canvasMapRef.current = canvasMap;
      setDoc((prev) =>
        prev
          ? {
              ...prev,
              width: entry.docWidth,
              height: entry.docHeight,
              layers,
              activeLayerId: entry.activeLayerId,
              unsaved: true,
            }
          : null
      );
      setHistoryIndex(idx);
      setSelectionMask(null);
      requestRender();
    },
    [history, doc, requestRender]
  );

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) restoreHistoryIndex(historyIndex - 1);
  }, [historyIndex, restoreHistoryIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) restoreHistoryIndex(historyIndex + 1);
  }, [historyIndex, history.length, restoreHistoryIndex]);

  // Create New Document
  const handleCreateNewCanvas = useCallback(
    (opts: { name: string; width: number; height: number; resolution: number; background: string }) => {
      const layerId = crypto.randomUUID();
      const c = document.createElement('canvas');
      c.width = opts.width;
      c.height = opts.height;
      const newMap = new Map<string, HTMLCanvasElement>();
      newMap.set(layerId, c);
      canvasMapRef.current = newMap;

      const newDoc: DocumentState = {
        id: crypto.randomUUID(),
        name: opts.name,
        width: opts.width,
        height: opts.height,
        resolution: opts.resolution,
        background: opts.background,
        activeLayerId: layerId,
        unsaved: false,
        layers: [
          {
            id: layerId,
            name: 'Layer 1',
            type: 'raster',
            visible: true,
            locked: false,
            opacity: 100,
            blendMode: 'source-over',
            transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
          },
        ],
      };

      setDoc(newDoc);
      setSelectionMask(null);
      setCropRect(null);
      setFilterSettings(DEFAULT_FILTER_SETTINGS);
      fitCanvasToScreen(opts.width, opts.height);

      const initialEntry: HistoryEntry = {
        id: crypto.randomUUID(),
        label: 'New Canvas',
        timestamp: Date.now(),
        docWidth: newDoc.width,
        docHeight: newDoc.height,
        layers: serializeLayers(newDoc.layers, newMap),
        activeLayerId: layerId,
      };
      setHistory([initialEntry]);
      setHistoryIndex(0);
      requestRender();
      notify('success', 'Canvas Ready', `Created "${opts.name}" (${opts.width}×${opts.height})`);
    },
    [fitCanvasToScreen, notify, requestRender]
  );

  // Open Uploaded Image as New Document
  const openImageAsDocument = useCallback(
    (name: string, dataUrl: string, width: number, height: number) => {
      const img = new Image();
      img.onload = () => {
        const layerId = crypto.randomUUID();
        const c = document.createElement('canvas');
        c.width = width;
        c.height = height;
        c.getContext('2d')?.drawImage(img, 0, 0, width, height);

        const newMap = new Map<string, HTMLCanvasElement>();
        newMap.set(layerId, c);
        canvasMapRef.current = newMap;

        const cleanTitle = name.replace(/\.[^/.]+$/, '');
        const newDoc: DocumentState = {
          id: crypto.randomUUID(),
          name: cleanTitle,
          width,
          height,
          resolution: 72,
          background: 'transparent',
          activeLayerId: layerId,
          unsaved: false,
          layers: [
            {
              id: layerId,
              name: cleanTitle,
              type: 'raster',
              visible: true,
              locked: false,
              opacity: 100,
              blendMode: 'source-over',
              transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
            },
          ],
        };

        setDoc(newDoc);
        setSelectionMask(null);
        setCropRect(null);
        fitCanvasToScreen(width, height);

        const initHistory: HistoryEntry = {
          id: crypto.randomUUID(),
          label: `Open "${name}"`,
          timestamp: Date.now(),
          docWidth: width,
          docHeight: height,
          layers: serializeLayers(newDoc.layers, newMap),
          activeLayerId: layerId,
        };
        setHistory([initHistory]);
        setHistoryIndex(0);
        requestRender();
        notify('success', 'Image Opened', `Loaded "${name}" (${width}×${height} px)`);
      };
      img.onerror = () => notify('error', 'Load Error', `Could not decode image "${name}".`);
      img.src = dataUrl;
    },
    [fitCanvasToScreen, notify, requestRender]
  );

  // Insert Image as a New Layer into Current Document
  const insertImageAsLayer = useCallback(
    (name: string, dataUrl: string, imgW: number, imgH: number) => {
      if (!doc) {
        openImageAsDocument(name, dataUrl, imgW, imgH);
        return;
      }
      const img = new Image();
      img.onload = () => {
        const layerId = crypto.randomUUID();
        const c = document.createElement('canvas');
        c.width = doc.width;
        c.height = doc.height;
        const ctx = c.getContext('2d')!;

        // Fit inside document preserving aspect ratio if larger
        const scale = Math.min(1, doc.width / imgW, doc.height / imgH);
        const drawW = imgW * scale;
        const drawH = imgH * scale;
        const dx = (doc.width - drawW) / 2;
        const dy = (doc.height - drawH) / 2;
        ctx.drawImage(img, dx, dy, drawW, drawH);

        canvasMapRef.current.set(layerId, c);
        const newLayer: Layer = {
          id: layerId,
          name: name.replace(/\.[^/.]+$/, ''),
          type: 'raster',
          visible: true,
          locked: false,
          opacity: 100,
          blendMode: 'source-over',
          transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        };

        const updated: DocumentState = {
          ...doc,
          layers: [newLayer, ...doc.layers],
          activeLayerId: layerId,
          unsaved: true,
        };
        setDoc(updated);
        pushHistory(`Import "${name}"`, updated);
        requestRender();
        notify('success', 'Layer Added', `Inserted "${name}" as a new layer.`);
      };
      img.onerror = () => notify('error', 'Import Error', `Image "${name}" could not be decoded.`);
      img.src = dataUrl;
    },
    [doc, openImageAsDocument, pushHistory, requestRender, notify]
  );

  // Load .moonart Project Object
  const loadProjectObject = useCallback(
    async (project: MoonArtProjectFile) => {
      const { layers, canvasMap } = await deserializeLayers(
        project.document.layers,
        project.document.width,
        project.document.height
      );
      canvasMapRef.current = canvasMap;

      const restoredDoc: DocumentState = {
        id: project.document.id,
        name: project.document.name,
        width: project.document.width,
        height: project.document.height,
        resolution: project.document.resolution || 72,
        background: project.document.background || 'transparent',
        layers,
        activeLayerId: project.document.activeLayerId ?? layers[0]?.id ?? null,
        unsaved: false,
      };
      setDoc(restoredDoc);
      setSelectionMask(null);
      setCropRect(null);
      setFilterSettings(DEFAULT_FILTER_SETTINGS);
      setCloneSource(null);
      setRightTab('layers');
      if (project.palette?.length) setPalette(project.palette);
      if (project.foregroundColor) setForegroundColor(project.foregroundColor);
      if (project.backgroundColor) setBackgroundColor(project.backgroundColor);

      fitCanvasToScreen(restoredDoc.width, restoredDoc.height);
      const initHist: HistoryEntry = {
        id: crypto.randomUUID(),
        label: `Load "${restoredDoc.name}"`,
        timestamp: Date.now(),
        docWidth: restoredDoc.width,
        docHeight: restoredDoc.height,
        layers: serializeLayers(restoredDoc.layers, canvasMap),
        activeLayerId: restoredDoc.activeLayerId,
      };
      setHistory([initHist]);
      setHistoryIndex(0);
      requestRender();
      return { restoredDoc, canvasMap };
    },
    [fitCanvasToScreen, requestRender]
  );

  // Handle Multi-file Upload / Drop (PNG, JPG, JPEG, WEBP, GIF, SVG — plus layered PNG restoration)
  const handleFilesSelected = useCallback(
    async (fileList: FileList | File[], insertIntoCurrent = false) => {
      const files = Array.from(fileList);
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const lower = file.name.toLowerCase();
        const isExplicitLegacy = lower.endsWith('.moonart') || lower.endsWith('.moonart.json');
        const isPng = lower.endsWith('.png') || file.type === 'image/png';

        let detectedProject: MoonArtProjectFile | null = null;
        if (isExplicitLegacy) {
          try {
            detectedProject = await parseMoonArtProjectFile(file);
          } catch (err) {
            notify('error', 'Invalid Project', (err as Error).message);
            continue;
          }
        } else if (isPng && !insertIntoCurrent) {
          detectedProject = await extractMoonArtProjectFromPngFile(file);
        } else if (!file.type.startsWith('image/')) {
          detectedProject = await trySniffMoonArtProject(file);
        }

        if (detectedProject) {
          try {
            const { restoredDoc, canvasMap } = await loadProjectObject(detectedProject);
            const thumbCanvas = compositeDocumentToCanvas(restoredDoc, canvasMap, true);
            const thumbUrl = thumbCanvas.toDataURL('image/png');
            const projectItem: UploadedFileItem = {
              id: crypto.randomUUID(),
              name: file.name,
              type: file.type || 'image/png',
              size: file.size,
              width: restoredDoc.width,
              height: restoredDoc.height,
              dataUrl: thumbUrl,
              addedAt: Date.now(),
              projectData: detectedProject,
            };
            setUploadedFiles((prev) => [
              projectItem,
              ...prev.filter((item) => item.name !== file.name),
            ]);
            notify(
              'success',
              'Image Opened',
              `Loaded "${file.name}" (${restoredDoc.layers.length} layer${restoredDoc.layers.length > 1 ? 's' : ''})`
            );
          } catch (err) {
            notify('error', 'Open Failed', (err as Error).message);
          }
          continue;
        }

        try {
          const { dataUrl, width, height } = await readImageFileSafely(file);
          const item: UploadedFileItem = {
            id: crypto.randomUUID(),
            name: file.name,
            type: file.type || 'image/png',
            size: file.size,
            width,
            height,
            dataUrl,
            addedAt: Date.now(),
          };
          setUploadedFiles((prev) => [item, ...prev]);

          if (insertIntoCurrent && doc) {
            insertImageAsLayer(file.name, dataUrl, width, height);
          } else if (i === 0 && (!doc || !insertIntoCurrent)) {
            openImageAsDocument(file.name, dataUrl, width, height);
          }
        } catch (err) {
          notify('error', 'Upload Failed', (err as Error).message);
        }
      }
    },
    [doc, insertImageAsLayer, loadProjectObject, notify, openImageAsDocument]
  );

  // Layer Management Actions
  const handleNewLayer = useCallback(() => {
    if (!doc) return;
    const id = crypto.randomUUID();
    const c = document.createElement('canvas');
    c.width = doc.width;
    c.height = doc.height;
    canvasMapRef.current.set(id, c);

    const layer: Layer = {
      id,
      name: `Layer ${doc.layers.length + 1}`,
      type: 'raster',
      visible: true,
      locked: false,
      opacity: 100,
      blendMode: 'source-over',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    };
    const next = { ...doc, layers: [layer, ...doc.layers], activeLayerId: id, unsaved: true };
    setDoc(next);
    pushHistory('New Layer', next);
    requestRender();
  }, [doc, pushHistory, requestRender]);

  const handleDuplicateLayer = useCallback(() => {
    if (!doc || !doc.activeLayerId) return;
    const idx = doc.layers.findIndex((l) => l.id === doc.activeLayerId);
    if (idx === -1) return;
    const orig = doc.layers[idx];
    const newId = crypto.randomUUID();

    if (orig.type === 'raster') {
      const srcC = canvasMapRef.current.get(orig.id);
      const copyC = document.createElement('canvas');
      copyC.width = doc.width;
      copyC.height = doc.height;
      if (srcC) copyC.getContext('2d')?.drawImage(srcC, 0, 0);
      canvasMapRef.current.set(newId, copyC);
    }

    const dup: Layer = {
      ...orig,
      id: newId,
      name: `${orig.name} Copy`,
      transform: { ...orig.transform },
      textData: orig.textData ? { ...orig.textData } : undefined,
      frameData: orig.frameData
        ? { ...orig.frameData, cells: orig.frameData.cells.map((c) => ({ ...c, id: crypto.randomUUID() })) }
        : undefined,
      vectorData: orig.vectorData
        ? { ...orig.vectorData, points: orig.vectorData.points.map((p) => ({ ...p })) }
        : undefined,
    };

    const layers = [...doc.layers];
    layers.splice(idx, 0, dup);
    const next = { ...doc, layers, activeLayerId: newId, unsaved: true };
    setDoc(next);
    pushHistory('Duplicate Layer', next);
    requestRender();
  }, [doc, pushHistory, requestRender]);

  const handleDeleteLayer = useCallback(
    (targetId?: string) => {
      if (!doc || doc.layers.length <= 1) return;
      const idToRemove = targetId ?? doc.activeLayerId;
      if (!idToRemove) return;
      const layers = doc.layers.filter((l) => l.id !== idToRemove);
      canvasMapRef.current.delete(idToRemove);
      const nextActive = doc.activeLayerId === idToRemove ? layers[0]?.id ?? null : doc.activeLayerId;
      const next = { ...doc, layers, activeLayerId: nextActive, unsaved: true };
      setDoc(next);
      pushHistory('Delete Layer', next);
      requestRender();
    },
    [doc, pushHistory, requestRender]
  );

  const handleMergeDown = useCallback(() => {
    if (!doc || !doc.activeLayerId) return;
    const idx = doc.layers.findIndex((l) => l.id === doc.activeLayerId);
    if (idx === -1 || idx >= doc.layers.length - 1) return;

    const topLayer = doc.layers[idx];
    const bottomLayer = doc.layers[idx + 1];
    if (topLayer.type !== 'raster' || bottomLayer.type !== 'raster') {
      notify('warning', 'Cannot Merge', 'Merge Down currently requires two raster layers.');
      return;
    }

    const topC = canvasMapRef.current.get(topLayer.id);
    const botC = canvasMapRef.current.get(bottomLayer.id);
    if (topC && botC) {
      const ctx = botC.getContext('2d')!;
      ctx.save();
      ctx.globalAlpha = clamp(topLayer.opacity / 100, 0, 1);
      ctx.globalCompositeOperation = topLayer.blendMode;
      ctx.drawImage(topC, 0, 0);
      ctx.restore();
    }
    canvasMapRef.current.delete(topLayer.id);
    const layers = doc.layers.filter((l) => l.id !== topLayer.id);
    const next = { ...doc, layers, activeLayerId: bottomLayer.id, unsaved: true };
    setDoc(next);
    pushHistory('Merge Down', next);
    requestRender();
  }, [doc, notify, pushHistory, requestRender]);

  // Image Transform Actions (Rotate 90, Flip H, Flip V)
  const handleRotate90 = useCallback(() => {
    if (!doc) return;
    const newW = doc.height;
    const newH = doc.width;

    for (const layer of doc.layers) {
      if (layer.type === 'raster') {
        const oldC = canvasMapRef.current.get(layer.id);
        if (!oldC) continue;
        const newC = document.createElement('canvas');
        newC.width = newW;
        newC.height = newH;
        const ctx = newC.getContext('2d')!;
        ctx.translate(newW / 2, newH / 2);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(oldC, -doc.width / 2, -doc.height / 2);
        canvasMapRef.current.set(layer.id, newC);
      }
    }

    const next = { ...doc, width: newW, height: newH, unsaved: true };
    setDoc(next);
    setSelectionMask(null);
    pushHistory('Rotate 90° CW', next);
    requestRender();
  }, [doc, pushHistory, requestRender]);

  const handleFlip = useCallback(
    (axis: 'h' | 'v') => {
      if (!doc || !doc.activeLayerId) return;
      const layer = doc.layers.find((l) => l.id === doc.activeLayerId);
      if (!layer || layer.type !== 'raster') return;
      const c = canvasMapRef.current.get(layer.id);
      if (!c) return;
      const copy = document.createElement('canvas');
      copy.width = c.width;
      copy.height = c.height;
      copy.getContext('2d')?.drawImage(c, 0, 0);
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.save();
      ctx.translate(axis === 'h' ? c.width : 0, axis === 'v' ? c.height : 0);
      ctx.scale(axis === 'h' ? -1 : 1, axis === 'v' ? -1 : 1);
      ctx.drawImage(copy, 0, 0);
      ctx.restore();
      pushHistory(axis === 'h' ? 'Flip Horizontal' : 'Flip Vertical');
      requestRender();
    },
    [doc, pushHistory, requestRender]
  );

  // Tool Selection Handler (handles instant actions & special tool initialization)
  const handleSelectTool = useCallback(
    (tool: ToolId) => {
      if (tool === 'rotateTool') {
        handleRotate90();
        return;
      }
      if (tool === 'flipH') {
        handleFlip('h');
        return;
      }
      if (tool === 'flipV') {
        handleFlip('v');
        return;
      }
      if (tool === 'crop' && doc) {
        setCropRect({
          x: Math.round(doc.width * 0.1),
          y: Math.round(doc.height * 0.1),
          width: Math.round(doc.width * 0.8),
          height: Math.round(doc.height * 0.8),
          aspect: 'free',
        });
        setRightTab('properties');
        if (rightCollapsed) setRightCollapsed(false);
      } else if (tool === 'filter') {
        setFilterSettings(DEFAULT_FILTER_SETTINGS);
        setRightTab('properties');
        if (rightCollapsed) setRightCollapsed(false);
      } else if (
        tool === 'frameDivider' ||
        tool === 'text' ||
        tool === 'magicWand' ||
        tool === 'gradient'
      ) {
        setRightTab('properties');
      }
      setActiveTool(tool);
    },
    [doc, handleFlip, handleRotate90, rightCollapsed]
  );

  // Crop Apply
  const handleApplyCrop = useCallback(() => {
    if (!doc || !cropRect) return;
    const nw = Math.max(16, Math.round(cropRect.width));
    const nh = Math.max(16, Math.round(cropRect.height));
    const cx = Math.round(cropRect.x);
    const cy = Math.round(cropRect.y);

    for (const layer of doc.layers) {
      if (layer.type === 'raster') {
        const oldC = canvasMapRef.current.get(layer.id);
        if (!oldC) continue;
        const newC = document.createElement('canvas');
        newC.width = nw;
        newC.height = nh;
        newC.getContext('2d')?.drawImage(oldC, cx, cy, nw, nh, 0, 0, nw, nh);
        canvasMapRef.current.set(layer.id, newC);
      }
    }

    const updatedLayers = doc.layers.map((l) => {
      if (l.type === 'text' && l.textData) {
        return { ...l, textData: { ...l.textData, x: l.textData.x - cx, y: l.textData.y - cy } };
      }
      if (l.type === 'frame' && l.frameData) {
        return {
          ...l,
          frameData: {
            ...l.frameData,
            cells: l.frameData.cells.map((cell) => ({ ...cell, x: cell.x - cx, y: cell.y - cy })),
          },
        };
      }
      return l;
    });

    const next = { ...doc, width: nw, height: nh, layers: updatedLayers, unsaved: true };
    setDoc(next);
    setCropRect(null);
    setSelectionMask(null);
    setActiveTool('move');
    pushHistory('Crop Canvas', next);
    requestRender();
    notify('success', 'Cropped', `Canvas cropped to ${nw}×${nh} px.`);
  }, [cropRect, doc, notify, pushHistory, requestRender]);

  // Image / Canvas Resize Modal Handler
  const handleResizeApply = useCallback(
    (mode: 'image' | 'canvas', newW: number, newH: number) => {
      if (!doc) return;
      for (const layer of doc.layers) {
        if (layer.type === 'raster') {
          const oldC = canvasMapRef.current.get(layer.id);
          if (!oldC) continue;
          const newC = document.createElement('canvas');
          newC.width = newW;
          newC.height = newH;
          const ctx = newC.getContext('2d')!;
          if (mode === 'image') {
            ctx.drawImage(oldC, 0, 0, newW, newH);
          } else {
            const dx = Math.round((newW - doc.width) / 2);
            const dy = Math.round((newH - doc.height) / 2);
            ctx.drawImage(oldC, dx, dy);
          }
          canvasMapRef.current.set(layer.id, newC);
        }
      }
      const next = { ...doc, width: newW, height: newH, unsaved: true };
      setDoc(next);
      setSelectionMask(null);
      pushHistory(mode === 'image' ? 'Resize Image' : 'Resize Canvas', next);
      requestRender();
    },
    [doc, pushHistory, requestRender]
  );

  // FX Filter Apply
  const handleApplyFilter = useCallback(() => {
    if (!doc || !doc.activeLayerId) return;
    const layer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (!layer || layer.type !== 'raster') {
      notify('warning', 'Raster Layer Required', 'Select a raster image layer to apply FX Filters.');
      return;
    }
    const lc = canvasMapRef.current.get(layer.id);
    if (!lc) return;
    const temp = document.createElement('canvas');
    applyFiltersToCanvas(lc, temp, filterSettings, selectionMask);
    const ctx = lc.getContext('2d')!;
    ctx.clearRect(0, 0, lc.width, lc.height);
    ctx.drawImage(temp, 0, 0);

    setFilterSettings(DEFAULT_FILTER_SETTINGS);
    setActiveTool('brush');
    pushHistory('Apply FX Filter');
    requestRender();
    notify('success', 'FX Applied', 'Filters committed to active layer.');
  }, [doc, filterSettings, notify, pushHistory, requestRender, selectionMask]);

  // Cut / Copy / Paste / Delete Selection
  const handleCopy = useCallback(
    (isCut = false) => {
      if (!doc || !doc.activeLayerId) return;
      const layer = doc.layers.find((l) => l.id === doc.activeLayerId);
      if (!layer || layer.type !== 'raster') return;
      const lc = canvasMapRef.current.get(layer.id);
      if (!lc) return;

      const { canvas: extracted } = extractSelectionToCanvas(lc, selectionMask);
      setClipboardCanvas(extracted);

      if (isCut) {
        if (selectionMask) {
          deleteSelectedPixels(lc, selectionMask);
        } else {
          lc.getContext('2d')?.clearRect(0, 0, lc.width, lc.height);
        }
        pushHistory('Cut Selection');
        requestRender();
      } else {
        notify('info', 'Copied', 'Selection copied to MoonArt clipboard.');
      }
    },
    [doc, notify, pushHistory, requestRender, selectionMask]
  );

  const handlePaste = useCallback(() => {
    if (!doc || !clipboardCanvas) {
      notify('info', 'Clipboard Empty', 'Copy a selection or layer first (Ctrl+C).');
      return;
    }
    const id = crypto.randomUUID();
    const c = document.createElement('canvas');
    c.width = doc.width;
    c.height = doc.height;
    const dx = Math.round((doc.width - clipboardCanvas.width) / 2);
    const dy = Math.round((doc.height - clipboardCanvas.height) / 2);
    c.getContext('2d')?.drawImage(clipboardCanvas, dx, dy);
    canvasMapRef.current.set(id, c);

    const newLayer: Layer = {
      id,
      name: `Pasted Layer ${doc.layers.length + 1}`,
      type: 'raster',
      visible: true,
      locked: false,
      opacity: 100,
      blendMode: 'source-over',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    };
    const next = { ...doc, layers: [newLayer, ...doc.layers], activeLayerId: id, unsaved: true };
    setDoc(next);
    setActiveTool('move');
    pushHistory('Paste Layer', next);
    requestRender();
  }, [clipboardCanvas, doc, notify, pushHistory, requestRender]);

  const handleDeleteSelection = useCallback(() => {
    if (!doc || !doc.activeLayerId) return;
    const layer = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (!layer || layer.type !== 'raster') return;
    const lc = canvasMapRef.current.get(layer.id);
    if (!lc) return;

    if (selectionMask) {
      deleteSelectedPixels(lc, selectionMask);
      pushHistory('Delete Selection');
    } else {
      lc.getContext('2d')?.clearRect(0, 0, lc.width, lc.height);
      pushHistory('Clear Layer');
    }
    requestRender();
  }, [doc, pushHistory, requestRender, selectionMask]);

  // Save as PNG / JPEG / WEBP (PNG also embeds editable layer metadata inside standard tEXt chunk)
  const handleSaveAsFormat = useCallback(
    (
      customName?: string,
      format: 'png' | 'jpeg' | 'webp' = 'png',
      quality = 92,
      preserveTransparency = true
    ) => {
      if (!doc) return;
      const targetName = customName ?? doc.name;
      const clean =
        targetName.replace(/\.(png|jpe?g|webp|moonart|json)$/i, '').trim() || 'Untitled Artwork';
      const updatedDoc = { ...doc, name: clean, unsaved: false };
      setDoc(updatedDoc);

      const includeBg =
        format === 'png'
          ? preserveTransparency
            ? doc.background !== 'transparent'
            : true
          : true;
      const flat = compositeDocumentToCanvas(
        updatedDoc,
        canvasMapRef.current,
        includeBg,
        format === 'jpeg'
      );
      const mime = format === 'png' ? 'image/png' : format === 'jpeg' ? 'image/jpeg' : 'image/webp';
      const q = format === 'png' ? undefined : quality / 100;
      const ext = format === 'jpeg' ? 'jpg' : format;
      const filename = `${clean}.${ext}`;

      flat.toBlob(
        async (blob) => {
          if (!blob) return;
          let finalBlob = blob;
          if (format === 'png') {
            const proj = buildMoonArtProject(
              updatedDoc,
              canvasMapRef.current,
              palette,
              foregroundColor,
              backgroundColor
            );
            finalBlob = await embedMoonArtMetadataInPngBlob(blob, proj);
          }
          triggerBlobDownload(finalBlob, filename);
          notify('success', 'Image Saved', `Saved "${filename}"`);
        },
        mime,
        q
      );
    },
    [backgroundColor, doc, foregroundColor, notify, palette]
  );

  // Primary Save (Ctrl+S): saves as standard PNG with embedded layer metadata
  const handleSaveProject = useCallback(
    (customName?: string) => {
      handleSaveAsFormat(customName, 'png', 100, true);
    },
    [handleSaveAsFormat]
  );

  // Quick Save as PNG / JPEG / WEBP
  const handleQuickExport = useCallback(
    (format: 'png' | 'jpeg' | 'webp') => {
      handleSaveAsFormat(undefined, format, 92, true);
    },
    [handleSaveAsFormat]
  );

  // Firebase Auth Handlers
  const handleSignInGoogle = useCallback(async () => {
    setAuthLoading(true);
    try {
      const user = await signInWithGoogle();
      notify('success', 'Xoş gəldiniz!', `Google hesabı ilə daxil oldunuz: ${user.displayName ?? ''}`);
    } catch (err) {
      const msg = (err as Error)?.message ?? 'Sign in cancelled.';
      if (!msg.includes('popup-closed-by-user')) {
        notify('error', 'Giriş Xətası', msg);
      }
    } finally {
      setAuthLoading(false);
    }
  }, [notify]);

  const handleSignOut = useCallback(async () => {
    await signOutUser();
    notify('info', 'Çıxış Edildi', 'Hesabınızdan çıxış etdiniz.');
  }, [notify]);

  const handleOpenGallery = useCallback((tab: 'personal' | 'shared' = 'personal') => {
    setGalleryTab(tab);
    setShowGalleryModal(true);
  }, []);

  const renderCurrentComposite = useCallback(() => {
    if (!doc) return null;
    return compositeDocumentToCanvas(doc, canvasMapRef.current, true, false);
  }, [doc]);

  const handleCloudActionError = useCallback(
    (err: unknown, fallbackTitle: string) => {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      try {
        const parsed = JSON.parse(errorObj.message);
        if (parsed && parsed.operationType) {
          setFatalError(errorObj);
          return;
        }
      } catch {
        // Non-Firestore JSON error: show clean toast notification
      }
      notify('error', fallbackTitle, errorObj.message);
    },
    [notify]
  );

  const handleSaveCurrentToGallery = useCallback(
    async (title: string, overwriteId?: string) => {
      if (!authUser) {
        handleOpenGallery('personal');
        return;
      }
      if (!doc) return;
      const flat = renderCurrentComposite();
      if (!flat) return;
      try {
        const savedId = await saveCanvasToUserGallery({
          userId: authUser.uid,
          artworkId: overwriteId,
          title,
          renderedCanvas: flat,
          docWidth: doc.width,
          docHeight: doc.height,
        });
        setActiveGalleryArtworkId(savedId);
        setDoc((prev) =>
          prev ? { ...prev, name: title.trim() || prev.name, unsaved: false } : prev
        );
        notify(
          'success',
          overwriteId ? 'Qalereya Yeniləndi' : 'Qalereyaya Saxlandı',
          `"${title.trim() || doc.name}" şəxsi qalereyanıza yazıldı.`
        );
      } catch (err) {
        handleCloudActionError(err, 'Saxlama Xətası');
      }
    },
    [authUser, doc, handleCloudActionError, handleOpenGallery, notify, renderCurrentComposite]
  );

  const handleQuickSaveToGallery = useCallback(async () => {
    if (!doc) return;
    if (!authUser) {
      setGalleryTab('personal');
      setShowGalleryModal(true);
      notify('info', 'Giriş Tələb Olunur', 'Qalereyaya saxlamaq üçün Google ilə daxil olun.');
      return;
    }
    await handleSaveCurrentToGallery(doc.name, activeGalleryArtworkId ?? undefined);
  }, [activeGalleryArtworkId, authUser, doc, handleSaveCurrentToGallery, notify]);

  const handleShareCurrentCanvas24h = useCallback(
    async (title: string) => {
      if (!authUser || !doc) return;
      const flat = renderCurrentComposite();
      if (!flat) return;
      try {
        await shareCanvasFor24Hours({
          user: authUser,
          sourceArtworkId: activeGalleryArtworkId ?? doc.id,
          title,
          renderedCanvas: flat,
          docWidth: doc.width,
          docHeight: doc.height,
        });
        notify(
          'success',
          '24 Saatlıq Paylaşıldı',
          `"${title.trim() || doc.name}" 24 saat boyunca bütün istifadəçilərə görünəcək.`
        );
      } catch (err) {
        handleCloudActionError(err, 'Paylaşım Xətası');
      }
    },
    [activeGalleryArtworkId, authUser, doc, handleCloudActionError, notify, renderCurrentComposite]
  );

  const handleShareUserArtwork24h = useCallback(
    async (item: UserArtworkItem) => {
      if (!authUser) return;
      try {
        await shareEncodedArtworkFor24Hours({
          user: authUser,
          sourceArtworkId: item.id,
          title: item.title,
          imageDataUrl: item.imageDataUrl,
          width: item.width,
          height: item.height,
        });
        notify('success', 'Paylaşıldı (24 Saat)', `"${item.title}" icma lentində paylaşıldı.`);
      } catch (err) {
        handleCloudActionError(err, 'Paylaşım Xətası');
      }
    },
    [authUser, handleCloudActionError, notify]
  );

  const handleCommitEditingSharedPost = useCallback(async () => {
    if (!authUser || !doc || !editingSharedPost) return;
    const flat = renderCurrentComposite();
    if (!flat) return;
    setSavingSharedEdit(true);
    try {
      await editSharedArtworkAndResetHearts({
        shareId: editingSharedPost.id,
        currentEditRevision: editingSharedPost.editRevision,
        title: doc.name,
        renderedCanvas: flat,
        fallbackImageDataUrl: editingSharedPost.imageDataUrl,
        width: doc.width,
        height: doc.height,
      });
      setEditingSharedPost(null);
      setDoc((prev) => (prev ? { ...prev, unsaved: false } : prev));
      notify(
        'success',
        'Paylaşım Yeniləndi',
        'Rəsm yeniləndi və yığılmış ürək sayı 0-a sıfırlandı.'
      );
      setGalleryTab('shared');
      setShowGalleryModal(true);
    } catch (err) {
      handleCloudActionError(err, 'Redaktə Xətası');
    } finally {
      setSavingSharedEdit(false);
    }
  }, [authUser, doc, editingSharedPost, handleCloudActionError, notify, renderCurrentComposite]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditingInput =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');

      if (e.code === 'Space' && !isEditingInput) {
        e.preventDefault();
        setSpacePressed(true);
        return;
      }

      if (isEditingInput) return;

      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (ctrl && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((ctrl && key === 'y') || (ctrl && e.shiftKey && key === 'z')) {
        e.preventDefault();
        handleRedo();
      } else if (ctrl && key === 's' && e.shiftKey) {
        e.preventDefault();
        if (doc) setShowSaveAsModal(true);
      } else if (ctrl && key === 's') {
        e.preventDefault();
        handleSaveProject();
      } else if (ctrl && key === 'o') {
        e.preventDefault();
        globalFileInputRef.current?.click();
      } else if (ctrl && key === 'n') {
        e.preventDefault();
        setShowNewModal(true);
      } else if (ctrl && key === 'c') {
        e.preventDefault();
        handleCopy(false);
      } else if (ctrl && key === 'x') {
        e.preventDefault();
        handleCopy(true);
      } else if (ctrl && key === 'v') {
        e.preventDefault();
        handlePaste();
      } else if (ctrl && key === 'a' && doc) {
        e.preventDefault();
        setSelectionMask(createFullSelection(doc.width, doc.height));
      } else if (ctrl && key === 'd') {
        e.preventDefault();
        setSelectionMask(null);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectionMask) {
        e.preventDefault();
        handleDeleteSelection();
      } else if (!ctrl && !e.altKey) {
        if (key === 'b') handleSelectTool('brush');
        else if (key === 'p') handleSelectTool('pencil');
        else if (key === 'e') handleSelectTool(e.shiftKey ? 'softEraser' : 'eraser');
        else if (key === 'v' || key === 'm') handleSelectTool('move');
        else if (key === 't') handleSelectTool('text');
        else if (key === 'l') handleSelectTool(e.shiftKey ? 'polygonLasso' : 'lasso');
        else if (key === 'g') handleSelectTool('gradient');
        else if (key === 'f') handleSelectTool('paintBucket');
        else if (key === 'i') handleSelectTool('colorPicker');
        else if (key === 'z') handleSelectTool('zoom');
        else if (key === 'w') handleSelectTool('magicWand');
        else if (key === 'c') handleSelectTool('clone');
        else if (key === 'x') {
          setForegroundColor(backgroundColor);
          setBackgroundColor(foregroundColor);
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpacePressed(false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [
    backgroundColor,
    doc,
    foregroundColor,
    handleCopy,
    handleDeleteSelection,
    handlePaste,
    handleRedo,
    handleSaveProject,
    handleSelectTool,
    handleUndo,
    selectionMask,
  ]);

  // Text / Frame / Vector Layer Creation Handlers
  const handleAddTextLayer = (data: TextLayerData) => {
    if (!doc) return;
    const id = crypto.randomUUID();
    const layer: Layer = {
      id,
      name: `Text: ${data.text.slice(0, 14)}`,
      type: 'text',
      visible: true,
      locked: false,
      opacity: textSettings.opacity,
      blendMode: 'source-over',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      textData: data,
    };
    const next = { ...doc, layers: [layer, ...doc.layers], activeLayerId: id, unsaved: true };
    setDoc(next);
    pushHistory('Add Text Layer', next);
    requestRender();
  };

  const handleCreateFramePreset = (preset: '2x2' | '2col' | '2row' | '3x2' | '1+2') => {
    if (!doc) return;
    const cells = createFramePreset(preset, doc.width, doc.height, 16);
    const id = crypto.randomUUID();
    const layer: Layer = {
      id,
      name: `Frame Grid (${preset})`,
      type: 'frame',
      visible: true,
      locked: false,
      opacity: 100,
      blendMode: 'source-over',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      frameData: {
        cells,
        borderColor: '#22D3EE',
        borderWidth: 5,
        gutter: 16,
        selectedCellId: cells[0]?.id ?? null,
      },
    };
    const next = { ...doc, layers: [layer, ...doc.layers], activeLayerId: id, unsaved: true };
    setDoc(next);
    pushHistory(`Frame Preset ${preset}`, next);
    requestRender();
  };

  const handleCreateFrameWithRect = (rect: { x: number; y: number; width: number; height: number }) => {
    if (!doc) return;
    const active = doc.layers.find((l) => l.id === doc.activeLayerId);
    const newCellId = crypto.randomUUID();
    if (active?.type === 'frame' && active.frameData) {
      const updated: DocumentState = {
        ...doc,
        unsaved: true,
        layers: doc.layers.map((l) =>
          l.id === active.id && l.frameData
            ? {
                ...l,
                frameData: {
                  ...l.frameData,
                  cells: [...l.frameData.cells, { id: newCellId, ...rect }],
                  selectedCellId: newCellId,
                },
              }
            : l
        ),
      };
      setDoc(updated);
      pushHistory('Add Frame Panel', updated);
    } else {
      const id = crypto.randomUUID();
      const layer: Layer = {
        id,
        name: 'Frame Divider',
        type: 'frame',
        visible: true,
        locked: false,
        opacity: 100,
        blendMode: 'source-over',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        frameData: {
          cells: [{ id: newCellId, ...rect }],
          borderColor: '#22D3EE',
          borderWidth: 5,
          gutter: 14,
          selectedCellId: newCellId,
        },
      };
      const updated = { ...doc, layers: [layer, ...doc.layers], activeLayerId: id, unsaved: true };
      setDoc(updated);
      pushHistory('Create Frame Panel', updated);
    }
    requestRender();
  };

  const handleSplitFrameCell = (dir: 'h' | 'v') => {
    if (!doc) return;
    const active = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (!active?.frameData?.selectedCellId) return;
    const fd = active.frameData;
    const target = fd.cells.find((c) => c.id === fd.selectedCellId);
    if (!target) return;
    const g = fd.gutter;

    const newCells: FrameDividerData['cells'] = [];
    let firstId = target.id;
    for (const c of fd.cells) {
      if (c.id !== target.id) {
        newCells.push(c);
      } else if (dir === 'v') {
        const halfW = Math.max(12, Math.floor((c.width - g) / 2));
        const id1 = crypto.randomUUID();
        const id2 = crypto.randomUUID();
        firstId = id1;
        newCells.push({ id: id1, x: c.x, y: c.y, width: halfW, height: c.height });
        newCells.push({ id: id2, x: c.x + halfW + g, y: c.y, width: c.width - halfW - g, height: c.height });
      } else {
        const halfH = Math.max(12, Math.floor((c.height - g) / 2));
        const id1 = crypto.randomUUID();
        const id2 = crypto.randomUUID();
        firstId = id1;
        newCells.push({ id: id1, x: c.x, y: c.y, width: c.width, height: halfH });
        newCells.push({ id: id2, x: c.x, y: c.y + halfH + g, width: c.width, height: c.height - halfH - g });
      }
    }

    const updated = {
      ...doc,
      unsaved: true,
      layers: doc.layers.map((l) =>
        l.id === active.id && l.frameData
          ? { ...l, frameData: { ...l.frameData, cells: newCells, selectedCellId: firstId } }
          : l
      ),
    };
    setDoc(updated);
    pushHistory('Split Frame Panel', updated);
    requestRender();
  };

  const handleDeleteFrameCell = () => {
    if (!doc) return;
    const active = doc.layers.find((l) => l.id === doc.activeLayerId);
    if (!active?.frameData?.selectedCellId || active.frameData.cells.length <= 1) return;
    const remaining = active.frameData.cells.filter((c) => c.id !== active.frameData?.selectedCellId);
    const updated = {
      ...doc,
      unsaved: true,
      layers: doc.layers.map((l) =>
        l.id === active.id && l.frameData
          ? { ...l, frameData: { ...l.frameData, cells: remaining, selectedCellId: remaining[0]?.id ?? null } }
          : l
      ),
    };
    setDoc(updated);
    pushHistory('Delete Frame Panel', updated);
    requestRender();
  };

  const handleAddVectorLayer = (points: VectorPoint[], closed: boolean) => {
    if (!doc) return;
    const id = crypto.randomUUID();
    const layer: Layer = {
      id,
      name: `Vector Path ${doc.layers.length + 1}`,
      type: 'vector',
      visible: true,
      locked: false,
      opacity: 100,
      blendMode: 'source-over',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      vectorData: {
        points,
        closed,
        strokeColor: foregroundColor,
        strokeWidth: Math.max(2, shapeSettings.strokeWidth),
        fillColor: shapeSettings.fillColor,
        fillEnabled: closed && shapeSettings.fillEnabled,
        strokeEnabled: true,
      },
    };
    const next = { ...doc, layers: [layer, ...doc.layers], activeLayerId: id, unsaved: true };
    setDoc(next);
    pushHistory('Create Vector Path', next);
    requestRender();
  };

  if (fatalError) throw fatalError;

  return (
    <div className="h-screen w-screen flex flex-col bg-[#030e17] text-[#e2f5fa] overflow-hidden">
      {/* Hidden Global File Inputs */}
      <input
        ref={globalFileInputRef}
        type="file"
        multiple
        accept=".png,.jpg,.jpeg,.jfif,.webp,.gif,.svg,.bmp,.avif,image/*"
        onChange={(e) => {
          if (e.target.files?.length) {
            handleFilesSelected(e.target.files, false);
            e.target.value = '';
          }
        }}
        className="hidden"
      />
      <input
        ref={importLayerInputRef}
        type="file"
        multiple
        accept=".png,.jpg,.jpeg,.jfif,.webp,.gif,.svg,.bmp,.avif,image/*"
        onChange={(e) => {
          if (e.target.files?.length) {
            handleFilesSelected(e.target.files, true);
            e.target.value = '';
          }
        }}
        className="hidden"
      />

      {/* Top Menu Bar */}
      <TopMenuBar
        hasDocument={!!doc}
        documentName={doc?.name ?? ''}
        unsaved={doc?.unsaved ?? false}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        zoom={zoom}
        showGrid={showGrid}
        onNewCanvas={() => setShowNewModal(true)}
        onOpenFile={() => globalFileInputRef.current?.click()}
        onImportAsLayer={() => importLayerInputRef.current?.click()}
        onSaveProject={() => handleSaveProject()}
        onSaveAsProject={() => setShowSaveAsModal(true)}
        onQuickExport={handleQuickExport}
        onOpenExport={() => setShowExportModal(true)}
        onCloseDocument={() => {
          setDoc(null);
          canvasMapRef.current.clear();
          setHistory([]);
          setHistoryIndex(-1);
          setSelectionMask(null);
          setCropRect(null);
          setActiveGalleryArtworkId(null);
          setEditingSharedPost(null);
        }}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onCut={() => handleCopy(true)}
        onCopy={() => handleCopy(false)}
        onPaste={handlePaste}
        onDeleteSelection={handleDeleteSelection}
        onSelectAll={() => doc && setSelectionMask(createFullSelection(doc.width, doc.height))}
        onDeselect={() => setSelectionMask(null)}
        onZoomIn={() => setZoom((z) => clamp(Number((z * 1.25).toFixed(2)), 0.1, 10))}
        onZoomOut={() => setZoom((z) => clamp(Number((z / 1.25).toFixed(2)), 0.1, 10))}
        onFitScreen={() => doc && fitCanvasToScreen(doc.width, doc.height)}
        onZoom100={() => {
          setZoom(1);
          setPan({ x: 0, y: 0 });
        }}
        onResetRotation={() => setCanvasRotation(0)}
        onToggleFullscreen={() => {
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
          } else {
            document.exitFullscreen().catch(() => {});
          }
        }}
        onToggleGrid={() => setShowGrid((g) => !g)}
        onOpenImageSize={() => setResizeModalMode('image')}
        onOpenCanvasSize={() => setResizeModalMode('canvas')}
        onRotate90={handleRotate90}
        onFlipH={() => handleFlip('h')}
        onFlipV={() => handleFlip('v')}
        onSelectCrop={() => handleSelectTool('crop')}
        onOpenFilter={() => handleSelectTool('filter')}
        onNewLayer={handleNewLayer}
        onDuplicateLayer={handleDuplicateLayer}
        onMergeDown={handleMergeDown}
        onDeleteLayer={() => handleDeleteLayer()}
        onRenameLayerPrompt={() => {
          setRightTab('layers');
          if (rightCollapsed) setRightCollapsed(false);
          notify('info', 'Rename Layer', 'Double-click any layer name in the Layers panel to rename it.');
        }}
        authUser={authUser}
        authLoading={authLoading}
        galleryCount={userArtworks.length}
        sharedCount={sharedArtworks.length}
        onOpenGallery={handleOpenGallery}
        onQuickSaveToGallery={() => void handleQuickSaveToGallery()}
        onSignInGoogle={() => void handleSignInGoogle()}
        onSignOut={() => void handleSignOut()}
      />

      {/* Active Banner when Editing a 24h Shared Artwork on Canvas */}
      {editingSharedPost && (
        <div className="bg-amber-500/15 border-b border-amber-400/35 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-amber-100">
            <Edit3 className="w-4 h-4 text-amber-300 shrink-0" />
            <span>
              Paylaşılan rəsmi redaktə edirsiniz:{' '}
              <strong className="text-amber-200">{editingSharedPost.title}</strong> · Düzəlişi
              paylaşdıqda ürək sayı ({editingSharedPost.heartCount}) sıfırlanacaq.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={savingSharedEdit}
              onClick={() => void handleCommitEditingSharedPost()}
              className="px-3 py-1 rounded-md bg-cyan-500 hover:bg-cyan-400 text-[#03131f] font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savingSharedEdit ? 'Yenilənir...' : 'Düzəlişi Paylaş (Ürəklər = 0)'}</span>
            </button>
            <button
              type="button"
              onClick={() => setEditingSharedPost(null)}
              className="px-2.5 py-1 rounded-md bg-[#092133] hover:bg-[#0d2c42] text-slate-200 border border-cyan-400/20"
            >
              Ləğv et
            </button>
          </div>
        </div>
      )}

      {/* Autosave Restore Prompt */}
      {autosaveCandidate && (
        <RestorePromptBanner
          projectName={autosaveCandidate.document.name}
          savedAt={autosaveCandidate.savedAt}
          onRestore={async () => {
            await loadProjectObject(autosaveCandidate);
            setAutosaveCandidate(null);
            notify('success', 'Session Restored', 'Your previous MoonArt project has been restored.');
          }}
          onDiscard={() => {
            setAutosaveCandidate(null);
            clearAutosaveProject();
          }}
        />
      )}

      {/* Main 3-Column Studio Body */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Vertical Toolbar */}
        <LeftToolbar
          activeTool={activeTool}
          foregroundColor={foregroundColor}
          backgroundColor={backgroundColor}
          onSelectTool={handleSelectTool}
          onSwapColors={() => {
            setForegroundColor(backgroundColor);
            setBackgroundColor(foregroundColor);
          }}
          onOpenColorTab={(target) => {
            setColorTarget(target);
            setRightTab('color');
            if (rightCollapsed) setRightCollapsed(false);
          }}
        />

        {/* Center Canvas Workspace */}
        <CanvasWorkspace
          doc={doc}
          canvasMap={canvasMapRef}
          renderTick={renderTick}
          activeTool={activeTool}
          zoom={zoom}
          pan={pan}
          canvasRotation={canvasRotation}
          showGrid={showGrid}
          spacePressed={spacePressed}
          foregroundColor={foregroundColor}
          backgroundColor={backgroundColor}
          brushSettings={brushSettings}
          shapeSettings={shapeSettings}
          textSettings={textSettings}
          selectionSettings={selectionSettings}
          gradientSettings={gradientSettings}
          filterSettings={filterSettings}
          selectionMask={selectionMask}
          cropRect={cropRect}
          cloneSource={cloneSource}
          onSetZoom={setZoom}
          onSetPan={setPan}
          onCursorMove={setCursorPos}
          onOpenNewCanvas={() => setShowNewModal(true)}
          onTriggerUpload={() => globalFileInputRef.current?.click()}
          onDropFiles={(files) => handleFilesSelected(files, false)}
          onCommitHistory={(label) => pushHistory(label)}
          onRequestRender={requestRender}
          onSetSelectionMask={setSelectionMask}
          onSampleColor={(hex) => {
            if (colorTarget === 'fg') setForegroundColor(hex);
            else setBackgroundColor(hex);
            notify('info', 'Color Sampled', `Picked ${hex}`);
          }}
          onSetCloneSource={(pt) => {
            setCloneSource(pt);
            notify('info', 'Clone Source Set', `Origin set at (${Math.round(pt.x)}, ${Math.round(pt.y)})`);
          }}
          onUpdateLayer={(layerId, updater, commitLabel) => {
            setDoc((prev) => {
              if (!prev) return prev;
              const next: DocumentState = {
                ...prev,
                unsaved: true,
                layers: prev.layers.map((l) => (l.id === layerId ? updater(l) : l)),
              };
              if (commitLabel) pushHistory(commitLabel, next);
              return next;
            });
            requestRender();
          }}
          onAddTextLayer={handleAddTextLayer}
          onCreateFrameLayerWithRect={handleCreateFrameWithRect}
          onAddVectorLayer={handleAddVectorLayer}
          onUpdateCropRect={setCropRect}
          onApplyCrop={handleApplyCrop}
          onCancelCrop={() => {
            setCropRect(null);
            setActiveTool('move');
          }}
          onChangeBrushSettings={handleChangeBrushSettings}
          onNotifyError={(title, msg) => notify('warning', title, msg)}
          onOpenGallery={handleOpenGallery}
        />

        {/* Right Collapsible & Resizable Sidebar */}
        <RightSidebar
          collapsed={rightCollapsed}
          width={rightWidth}
          activeTab={rightTab}
          activeTool={activeTool}
          hasDocument={!!doc}
          layers={doc?.layers ?? []}
          activeLayerId={doc?.activeLayerId ?? null}
          uploadedFiles={uploadedFiles}
          foregroundColor={foregroundColor}
          backgroundColor={backgroundColor}
          colorTarget={colorTarget}
          palette={palette}
          brushSettings={brushSettings}
          shapeSettings={shapeSettings}
          textSettings={textSettings}
          selectionSettings={selectionSettings}
          gradientSettings={gradientSettings}
          filterSettings={filterSettings}
          cropRect={cropRect}
          canvasRotation={canvasRotation}
          history={history}
          historyIndex={historyIndex}
          onToggleCollapse={() => setRightCollapsed((c) => !c)}
          onResizeWidth={setRightWidth}
          onSetTab={setRightTab}
          onSelectLayer={(id) => setDoc((prev) => (prev ? { ...prev, activeLayerId: id } : prev))}
          onNewLayer={handleNewLayer}
          onDuplicateLayer={handleDuplicateLayer}
          onDeleteLayer={handleDeleteLayer}
          onMergeDown={handleMergeDown}
          onToggleLayerVisibility={(id) => {
            setDoc((prev) =>
              prev
                ? {
                    ...prev,
                    layers: prev.layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)),
                  }
                : prev
            );
            requestRender();
          }}
          onToggleLayerLock={(id) => {
            setDoc((prev) =>
              prev
                ? {
                    ...prev,
                    layers: prev.layers.map((l) => (l.id === id ? { ...l, locked: !l.locked } : l)),
                  }
                : prev
            );
          }}
          onRenameLayer={(id, name) => {
            setDoc((prev) =>
              prev
                ? {
                    ...prev,
                    unsaved: true,
                    layers: prev.layers.map((l) => (l.id === id ? { ...l, name } : l)),
                  }
                : prev
            );
          }}
          onChangeLayerOpacity={(id, opacity) => {
            setDoc((prev) =>
              prev
                ? {
                    ...prev,
                    unsaved: true,
                    layers: prev.layers.map((l) => (l.id === id ? { ...l, opacity } : l)),
                  }
                : prev
            );
            requestRender();
          }}
          onChangeLayerBlendMode={(id, blendMode: BlendMode) => {
            setDoc((prev) =>
              prev
                ? {
                    ...prev,
                    unsaved: true,
                    layers: prev.layers.map((l) => (l.id === id ? { ...l, blendMode } : l)),
                  }
                : prev
            );
            requestRender();
          }}
          onReorderLayers={(fromIndex, toIndex) => {
            if (!doc) return;
            const layers = [...doc.layers];
            const [moved] = layers.splice(fromIndex, 1);
            layers.splice(toIndex, 0, moved);
            const next = { ...doc, layers, unsaved: true };
            setDoc(next);
            pushHistory('Reorder Layers', next);
            requestRender();
          }}
          onResetLayerTransform={(id) => {
            setDoc((prev) =>
              prev
                ? {
                    ...prev,
                    unsaved: true,
                    layers: prev.layers.map((l) =>
                      l.id === id
                        ? { ...l, transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 } }
                        : l
                    ),
                  }
                : prev
            );
            requestRender();
          }}
          onUploadFiles={(files) => handleFilesSelected(files, false)}
          onOpenUploadedFile={async (item) => {
            if (item.projectData) {
              await loadProjectObject(item.projectData);
              notify('success', 'Project Loaded', `Opened "${item.name}"`);
            } else {
              openImageAsDocument(item.name, item.dataUrl, item.width, item.height);
            }
          }}
          onInsertUploadedAsLayer={(item) =>
            insertImageAsLayer(item.name, item.dataUrl, item.width, item.height)
          }
          onDeleteUploadedFile={(id) => setUploadedFiles((prev) => prev.filter((f) => f.id !== id))}
          onSetColorTarget={setColorTarget}
          onChangeColor={(hex, target) => {
            if (target === 'fg') setForegroundColor(hex);
            else setBackgroundColor(hex);
          }}
          onSwapColors={() => {
            setForegroundColor(backgroundColor);
            setBackgroundColor(foregroundColor);
          }}
          onAddPaletteColor={(hex) => {
            if (!palette.includes(hex)) {
              setPalette((prev) => [...prev, hex]);
            }
          }}
          onRemovePaletteColor={(hex) => setPalette((prev) => prev.filter((c) => c !== hex))}
          onChangeBrushSettings={handleChangeBrushSettings}
          onResetBrushPreset={handleResetBrushPreset}
          onChangeShapeSettings={(patch) => setShapeSettings((prev) => ({ ...prev, ...patch }))}
          onChangeTextSettings={(patch) => {
            setTextSettings((prev) => {
              const next = { ...prev, ...patch };
              // Also live-update active text layer if selected
              if (doc?.activeLayerId) {
                setDoc((d) => {
                  if (!d) return d;
                  const active = d.layers.find((l) => l.id === d.activeLayerId);
                  if (active?.type !== 'text' || !active.textData) return d;
                  return {
                    ...d,
                    unsaved: true,
                    layers: d.layers.map((l) =>
                      l.id === active.id && l.textData
                        ? {
                            ...l,
                            opacity: next.opacity,
                            textData: {
                              ...l.textData,
                              fontFamily: next.fontFamily,
                              fontSize: next.fontSize,
                              bold: next.bold,
                              italic: next.italic,
                              underline: next.underline,
                              align: next.align,
                              color: next.color,
                              letterSpacing: next.letterSpacing,
                            },
                          }
                        : l
                    ),
                  };
                });
                requestRender();
              }
              return next;
            });
          }}
          onChangeSelectionSettings={(patch) => setSelectionSettings((prev) => ({ ...prev, ...patch }))}
          onChangeGradientSettings={(patch) => setGradientSettings((prev) => ({ ...prev, ...patch }))}
          onChangeFilterSettings={(patch) => setFilterSettings((prev) => ({ ...prev, ...patch }))}
          onApplyFilter={handleApplyFilter}
          onResetFilter={() => setFilterSettings(DEFAULT_FILTER_SETTINGS)}
          onCancelFilter={() => {
            setFilterSettings(DEFAULT_FILTER_SETTINGS);
            setActiveTool('brush');
            requestRender();
          }}
          onChangeCropAspect={(aspect) => {
            if (!cropRect || !doc) return;
            if (aspect === 'free') {
              setCropRect({ ...cropRect, aspect });
              return;
            }
            const [rw, rh] =
              aspect === '1:1' ? [1, 1] : aspect === '4:3' ? [4, 3] : aspect === '16:9' ? [16, 9] : [9, 16];
            const w = cropRect.width;
            const h = Math.min(doc.height - cropRect.y, Math.max(16, Math.round((w * rh) / rw)));
            setCropRect({ ...cropRect, aspect, height: h });
          }}
          onApplyCrop={handleApplyCrop}
          onCancelCrop={() => {
            setCropRect(null);
            setActiveTool('move');
          }}
          onChangeCanvasRotation={setCanvasRotation}
          onCreateFramePreset={handleCreateFramePreset}
          onUpdateFrameSettings={(patch) => {
            if (!doc?.activeLayerId) return;
            setDoc((prev) =>
              prev
                ? {
                    ...prev,
                    unsaved: true,
                    layers: prev.layers.map((l) =>
                      l.id === prev.activeLayerId && l.frameData
                        ? { ...l, frameData: { ...l.frameData, ...patch } }
                        : l
                    ),
                  }
                : prev
            );
            requestRender();
          }}
          onSplitFrameCell={handleSplitFrameCell}
          onDeleteFrameCell={handleDeleteFrameCell}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onJumpHistory={restoreHistoryIndex}
        />
      </div>

      {/* Bottom Status Bar */}
      <StatusBar
        doc={doc}
        activeTool={activeTool}
        zoom={zoom}
        cursorPos={cursorPos}
        foregroundColor={foregroundColor}
        backgroundColor={backgroundColor}
        onChangeZoom={setZoom}
        onFitScreen={() => doc && fitCanvasToScreen(doc.width, doc.height)}
      />

      {/* Modals */}
      <NewCanvasModal
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreate={handleCreateNewCanvas}
      />

      <ExportModal
        open={showExportModal}
        doc={doc}
        canvasMap={canvasMapRef.current}
        onClose={() => setShowExportModal(false)}
        onExported={(filename) => notify('success', 'Export Complete', `Downloaded "${filename}"`)}
      />

      <SaveAsModal
        open={showSaveAsModal}
        currentName={doc?.name ?? 'Untitled Artwork'}
        onClose={() => setShowSaveAsModal(false)}
        onConfirm={(name, format, quality, preserveTransparency) =>
          handleSaveAsFormat(name, format, quality, preserveTransparency)
        }
      />

      <ResizeModal
        mode={resizeModalMode}
        currentWidth={doc?.width ?? 1920}
        currentHeight={doc?.height ?? 1080}
        onClose={() => setResizeModalMode(null)}
        onApply={handleResizeApply}
      />

      <GalleryModal
        open={showGalleryModal}
        initialTab={galleryTab}
        user={authUser}
        authLoading={authLoading}
        hasDocument={!!doc}
        currentDocName={doc?.name ?? 'Untitled Artwork'}
        activeGalleryArtworkId={activeGalleryArtworkId}
        userArtworks={userArtworks}
        sharedArtworks={sharedArtworks}
        likedShareIds={likedShareIds}
        onClose={() => setShowGalleryModal(false)}
        onSignInGoogle={handleSignInGoogle}
        onSignOut={handleSignOut}
        onSaveCurrentToGallery={handleSaveCurrentToGallery}
        onShareCurrentCanvas24h={handleShareCurrentCanvas24h}
        onOpenUserArtworkInCanvas={(item) => {
          setEditingSharedPost(null);
          setActiveGalleryArtworkId(item.id);
          openImageAsDocument(item.title, item.imageDataUrl, item.width, item.height);
          setShowGalleryModal(false);
        }}
        onShareUserArtwork24h={handleShareUserArtwork24h}
        onRenameUserArtwork={async (id, title) => {
          if (!authUser) return;
          try {
            await renameUserArtwork(authUser.uid, id, title);
            notify('success', 'Ad Dəyişdirildi', `Yeni ad: "${title}"`);
          } catch (err) {
            handleCloudActionError(err, 'Ad Dəyişdirmə Xətası');
          }
        }}
        onDeleteUserArtwork={async (id) => {
          if (!authUser) return;
          try {
            await deleteUserArtwork(authUser.uid, id);
            if (activeGalleryArtworkId === id) setActiveGalleryArtworkId(null);
            notify('info', 'Silindi', 'Rəsm şəxsi qalereyanızdan silindi.');
          } catch (err) {
            handleCloudActionError(err, 'Silmə Xətası');
          }
        }}
        onToggleHeart={async (item) => {
          if (!authUser) return;
          const currentlyLiked = likedShareIds.has(item.id);
          // Optimistic feedback while Firestore batch commits
          setLikedShareIds((prev) => {
            const next = new Set(prev);
            if (currentlyLiked) next.delete(item.id);
            else next.add(item.id);
            return next;
          });
          try {
            await toggleSharedArtworkHeart({
              artwork: item,
              userId: authUser.uid,
              currentlyLiked,
            });
          } catch (err) {
            // Revert optimistic UI and surface structured Firestore error to ErrorBoundary
            setLikedShareIds((prev) => {
              const reverted = new Set(prev);
              if (currentlyLiked) reverted.add(item.id);
              else reverted.delete(item.id);
              return reverted;
            });
            setFatalError(err instanceof Error ? err : new Error(String(err)));
          }
        }}
        onEditSharedTitleOrCanvas={async (item, newTitle, useCurrentCanvas) => {
          try {
            const flat = useCurrentCanvas ? renderCurrentComposite() ?? undefined : undefined;
            await editSharedArtworkAndResetHearts({
              shareId: item.id,
              currentEditRevision: item.editRevision,
              title: newTitle,
              renderedCanvas: flat,
              fallbackImageDataUrl: item.imageDataUrl,
              width: useCurrentCanvas && doc ? doc.width : item.width,
              height: useCurrentCanvas && doc ? doc.height : item.height,
            });
            notify(
              'success',
              'Paylaşım Redaktə Edildi',
              'Düzəliş tətbiq edildi və ürək sayı 0-a sıfırlandı.'
            );
          } catch (err) {
            handleCloudActionError(err, 'Redaktə Xətası');
          }
        }}
        onOpenSharedInCanvasToEdit={(item) => {
          setActiveGalleryArtworkId(null);
          setEditingSharedPost(item);
          openImageAsDocument(item.title, item.imageDataUrl, item.width, item.height);
          setShowGalleryModal(false);
          notify(
            'info',
            'Redaktə Rejimi',
            'Rəsm üzərində düzəliş edib yuxarıdakı "Düzəlişi Paylaş" düyməsinə klikləyin.'
          );
        }}
        onOpenSharedCopyInCanvas={(item) => {
          setEditingSharedPost(null);
          setActiveGalleryArtworkId(null);
          openImageAsDocument(`${item.title} (Copy)`, item.imageDataUrl, item.width, item.height);
          setShowGalleryModal(false);
        }}
        onDeleteSharedArtwork={async (shareId) => {
          try {
            await deleteSharedArtwork(shareId);
            if (editingSharedPost?.id === shareId) setEditingSharedPost(null);
            notify('info', 'Paylaşım Silindi', 'Paylaşılan rəsm 24 saatlıq lentdən silindi.');
          } catch (err) {
            handleCloudActionError(err, 'Silmə Xətası');
          }
        }}
      />

      {/* Non-blocking Toast Notifications */}
      <div className="fixed bottom-9 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg border shadow-2xl text-xs bg-[#071b2a]/95 backdrop-blur-xs ${
              t.type === 'error'
                ? 'border-rose-500/50 text-rose-100'
                : t.type === 'warning'
                ? 'border-amber-400/50 text-amber-100'
                : t.type === 'success'
                ? 'border-emerald-400/45 text-emerald-100'
                : 'border-cyan-400/40 text-cyan-100'
            }`}
          >
            {t.type === 'error' || t.type === 'warning' ? (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-300" />
            ) : t.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-300" />
            ) : (
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-cyan-300" />
            )}
            <div className="flex-1 min-w-0">
              <div className="font-semibold">{t.title}</div>
              <div className="text-[11px] opacity-85 mt-0.5">{t.message}</div>
            </div>
            <button
              type="button"
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="p-0.5 opacity-60 hover:opacity-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
