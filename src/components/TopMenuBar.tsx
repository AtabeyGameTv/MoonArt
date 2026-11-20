import React, { useEffect, useRef, useState } from 'react';
import {
  Download,
  FolderOpen,
  Images,
  LogIn,
  LogOut,
  Maximize2,
  Redo2,
  Save,
  SlidersHorizontal,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { MoonArtLogo } from './ToolIcons';

interface TopMenuBarProps {
  hasDocument: boolean;
  documentName: string;
  unsaved: boolean;
  canUndo: boolean;
  canRedo: boolean;
  zoom: number;
  showGrid: boolean;
  onNewCanvas: () => void;
  onOpenFile: () => void;
  onImportAsLayer: () => void;
  onSaveProject: () => void;
  onSaveAsProject: () => void;
  onQuickExport: (format: 'png' | 'jpeg' | 'webp') => void;
  onOpenExport: () => void;
  onCloseDocument: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDeleteSelection: () => void;
  onSelectAll: () => void;
  onDeselect: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitScreen: () => void;
  onZoom100: () => void;
  onResetRotation: () => void;
  onToggleFullscreen: () => void;
  onToggleGrid: () => void;
  onOpenImageSize: () => void;
  onOpenCanvasSize: () => void;
  onRotate90: () => void;
  onFlipH: () => void;
  onFlipV: () => void;
  onSelectCrop: () => void;
  onOpenFilter: () => void;
  onNewLayer: () => void;
  onDuplicateLayer: () => void;
  onMergeDown: () => void;
  onDeleteLayer: () => void;
  onRenameLayerPrompt: () => void;
  authUser: User | null;
  authLoading: boolean;
  galleryCount: number;
  sharedCount: number;
  onOpenGallery: (tab?: 'personal' | 'shared') => void;
  onQuickSaveToGallery: () => void;
  onSignInGoogle: () => void;
  onSignOut: () => void;
}

interface MenuItem {
  label?: string;
  shortcut?: string;
  action?: () => void;
  disabled?: boolean;
  divider?: boolean;
}

export const TopMenuBar: React.FC<TopMenuBarProps> = (props) => {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, []);

  const menus: Record<string, MenuItem[]> = {
    File: [
      { label: 'New Canvas...', shortcut: 'Ctrl+N', action: props.onNewCanvas },
      { label: 'Open Image (PNG / JPG / WEBP)...', shortcut: 'Ctrl+O', action: props.onOpenFile },
      { label: 'Import Image as Layer...', action: props.onImportAsLayer, disabled: !props.hasDocument },
      { divider: true },
      { label: 'Save as PNG', shortcut: 'Ctrl+S', action: props.onSaveProject, disabled: !props.hasDocument },
      { label: 'Save As (PNG / JPEG / WEBP)...', shortcut: 'Ctrl+Shift+S', action: props.onSaveAsProject, disabled: !props.hasDocument },
      { divider: true },
      { label: 'Save as JPEG', action: () => props.onQuickExport('jpeg'), disabled: !props.hasDocument },
      { label: 'Save as WEBP', action: () => props.onQuickExport('webp'), disabled: !props.hasDocument },
      { label: 'Export Preview (PNG / JPG / WEBP)...', action: props.onOpenExport, disabled: !props.hasDocument },
      { divider: true },
      { label: 'Save to My Cloud Gallery', action: props.onQuickSaveToGallery, disabled: !props.hasDocument },
      { label: 'Open My Gallery & 24h Feed...', action: () => props.onOpenGallery('personal') },
      { divider: true },
      { label: 'Close Document', action: props.onCloseDocument, disabled: !props.hasDocument },
    ],
    Edit: [
      { label: 'Undo', shortcut: 'Ctrl+Z', action: props.onUndo, disabled: !props.canUndo },
      { label: 'Redo', shortcut: 'Ctrl+Y', action: props.onRedo, disabled: !props.canRedo },
      { divider: true },
      { label: 'Cut', shortcut: 'Ctrl+X', action: props.onCut, disabled: !props.hasDocument },
      { label: 'Copy', shortcut: 'Ctrl+C', action: props.onCopy, disabled: !props.hasDocument },
      { label: 'Paste', shortcut: 'Ctrl+V', action: props.onPaste, disabled: !props.hasDocument },
      { label: 'Delete', shortcut: 'Del', action: props.onDeleteSelection, disabled: !props.hasDocument },
      { divider: true },
      { label: 'Select All', shortcut: 'Ctrl+A', action: props.onSelectAll, disabled: !props.hasDocument },
      { label: 'Deselect', shortcut: 'Ctrl+D', action: props.onDeselect, disabled: !props.hasDocument },
    ],
    View: [
      { label: 'Zoom In', shortcut: 'Ctrl++', action: props.onZoomIn, disabled: !props.hasDocument },
      { label: 'Zoom Out', shortcut: 'Ctrl+-', action: props.onZoomOut, disabled: !props.hasDocument },
      { label: 'Fit Canvas to Screen', shortcut: 'Ctrl+0', action: props.onFitScreen, disabled: !props.hasDocument },
      { label: 'Actual Size (100%)', shortcut: 'Ctrl+1', action: props.onZoom100, disabled: !props.hasDocument },
      { divider: true },
      { label: 'Reset Canvas Rotation', action: props.onResetRotation, disabled: !props.hasDocument },
      { label: props.showGrid ? 'Hide Pixel Grid' : 'Show Pixel Grid', action: props.onToggleGrid, disabled: !props.hasDocument },
      { label: 'Toggle Fullscreen', shortcut: 'F11', action: props.onToggleFullscreen },
    ],
    Image: [
      { label: 'Image Size...', action: props.onOpenImageSize, disabled: !props.hasDocument },
      { label: 'Canvas Size...', action: props.onOpenCanvasSize, disabled: !props.hasDocument },
      { divider: true },
      { label: 'Rotate 90° Clockwise', action: props.onRotate90, disabled: !props.hasDocument },
      { label: 'Flip Horizontal', action: props.onFlipH, disabled: !props.hasDocument },
      { label: 'Flip Vertical', action: props.onFlipV, disabled: !props.hasDocument },
      { label: 'Crop Canvas', action: props.onSelectCrop, disabled: !props.hasDocument },
      { divider: true },
      { label: 'FX Filters & Adjustments...', action: props.onOpenFilter, disabled: !props.hasDocument },
    ],
    Layer: [
      { label: 'New Raster Layer', action: props.onNewLayer, disabled: !props.hasDocument },
      { label: 'Duplicate Active Layer', action: props.onDuplicateLayer, disabled: !props.hasDocument },
      { label: 'Merge Down', action: props.onMergeDown, disabled: !props.hasDocument },
      { label: 'Rename Active Layer', action: props.onRenameLayerPrompt, disabled: !props.hasDocument },
      { divider: true },
      { label: 'Delete Active Layer', action: props.onDeleteLayer, disabled: !props.hasDocument },
    ],
  };

  return (
    <header
      ref={barRef}
      className="h-11 shrink-0 bg-[#061826] border-b border-cyan-400/15 px-3 flex items-center justify-between gap-4 select-none z-40"
    >
      {/* Left: Logo + Menus */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2 shrink-0 pr-2 border-r border-cyan-400/15">
          <MoonArtLogo className="w-7 h-7" />
          <span className="font-display font-bold text-base tracking-tight text-cyan-50 whitespace-nowrap">
            Moon<span className="text-cyan-400">Art</span>
          </span>
        </div>

        <nav className="flex items-center gap-0.5">
          {Object.entries(menus).map(([menuName, items]) => {
            const isOpen = openMenu === menuName;
            return (
              <div key={menuName} className="relative">
                <button
                  type="button"
                  onClick={() => setOpenMenu(isOpen ? null : menuName)}
                  onMouseEnter={() => openMenu && setOpenMenu(menuName)}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    isOpen
                      ? 'bg-[#0d4658] text-cyan-200'
                      : 'text-slate-200 hover:bg-[#0d2c42] hover:text-cyan-200'
                  }`}
                >
                  {menuName}
                </button>
                {isOpen && (
                  <div className="absolute left-0 top-full mt-1 w-60 bg-[#071e2f] border border-cyan-400/25 rounded-lg shadow-2xl py-1.5 z-50">
                    {items.map((item, idx) =>
                      item.divider ? (
                        <div key={`div-${idx}`} className="my-1 border-t border-cyan-400/10" />
                      ) : (
                        <button
                          key={item.label}
                          type="button"
                          disabled={item.disabled}
                          onClick={() => {
                            if (!item.disabled && item.action) {
                              item.action();
                              setOpenMenu(null);
                            }
                          }}
                          className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between transition-colors ${
                            item.disabled
                              ? 'text-slate-500 cursor-not-allowed'
                              : 'text-slate-100 hover:bg-[#0d4658] hover:text-cyan-100'
                          }`}
                        >
                          <span className="truncate">{item.label}</span>
                          {item.shortcut && (
                            <span className="font-mono-tabular text-[11px] text-cyan-300/60 ml-3 shrink-0">
                              {item.shortcut}
                            </span>
                          )}
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {props.hasDocument && (
          <div className="hidden xl:flex items-center gap-1.5 pl-3 border-l border-cyan-400/15 text-xs text-cyan-100/80 truncate max-w-[220px]">
            <span className="truncate font-medium">{props.documentName}</span>
            {props.unsaved && (
              <span className="text-amber-300 font-bold" title="Unsaved changes">
                *
              </span>
            )}
          </div>
        )}
      </div>

      {/* Right: Essential Studio Quick Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        <div className="flex items-center bg-[#092133] border border-cyan-400/15 rounded-md p-0.5">
          <button
            type="button"
            disabled={!props.canUndo}
            onClick={props.onUndo}
            title="Undo (Ctrl+Z)"
            className="p-1.5 rounded text-slate-200 hover:bg-[#0d4658] hover:text-cyan-200 disabled:opacity-35 disabled:pointer-events-none transition-colors"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={!props.canRedo}
            onClick={props.onRedo}
            title="Redo (Ctrl+Y)"
            className="p-1.5 rounded text-slate-200 hover:bg-[#0d4658] hover:text-cyan-200 disabled:opacity-35 disabled:pointer-events-none transition-colors"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {props.hasDocument && (
          <>
            <div className="hidden md:flex items-center bg-[#092133] border border-cyan-400/15 rounded-md p-0.5">
              <button
                type="button"
                onClick={props.onZoomOut}
                title="Zoom Out"
                className="p-1.5 rounded text-slate-200 hover:bg-[#0d4658] hover:text-cyan-200 transition-colors"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={props.onZoom100}
                title="Click for 100%"
                className="px-2 py-0.5 text-xs font-mono-tabular text-cyan-200 hover:text-cyan-100 whitespace-nowrap"
              >
                {Math.round(props.zoom * 100)}%
              </button>
              <button
                type="button"
                onClick={props.onZoomIn}
                title="Zoom In"
                className="p-1.5 rounded text-slate-200 hover:bg-[#0d4658] hover:text-cyan-200 transition-colors"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={props.onFitScreen}
                title="Fit Canvas to Screen"
                className="p-1.5 rounded text-slate-200 hover:bg-[#0d4658] hover:text-cyan-200 transition-colors"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={props.onOpenFilter}
              title="FX Filters"
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-[#092133] border border-cyan-400/20 text-cyan-100 hover:bg-[#0d4658] hover:border-cyan-400/40 transition-colors whitespace-nowrap"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-300" />
              <span>FX Filter</span>
            </button>
          </>
        )}

        <button
          type="button"
          onClick={props.onOpenFile}
          title="Open Image — PNG, JPG, JPEG, WEBP, GIF, SVG (Ctrl+O)"
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-[#092133] border border-cyan-400/20 text-slate-100 hover:bg-[#0d4658] transition-colors whitespace-nowrap"
        >
          <FolderOpen className="w-3.5 h-3.5 text-cyan-300" />
          <span className="hidden sm:inline">Open</span>
        </button>

        {props.hasDocument && (
          <>
            <button
              type="button"
              onClick={props.onSaveProject}
              title="Save as PNG (Ctrl+S)"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-[#0d4658] border border-cyan-400/30 text-cyan-100 hover:bg-[#135d73] transition-colors whitespace-nowrap"
            >
              <Save className="w-3.5 h-3.5 text-cyan-300" />
              <span className="hidden md:inline">Save PNG</span>
            </button>

            <button
              type="button"
              onClick={props.onOpenExport}
              title="Export Image (PNG, JPG, WEBP)"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-cyan-500 text-[#03131f] hover:bg-cyan-400 transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
            </button>
          </>
        )}

        {/* Gallery & 24h Feed Button */}
        <button
          type="button"
          onClick={() => props.onOpenGallery('personal')}
          title="Qalereya və 24 saatlıq paylaşımlar"
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-[#092133] border border-cyan-400/30 text-cyan-100 hover:bg-[#0d4658] transition-colors whitespace-nowrap"
        >
          <Images className="w-3.5 h-3.5 text-cyan-300" />
          <span className="hidden sm:inline">Gallery</span>
          {props.authUser && (
            <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-200 font-mono-tabular text-[10px]">
              {props.galleryCount}
            </span>
          )}
        </button>

        {/* Google Auth User Chip / Sign In */}
        {props.authUser ? (
          <div className="flex items-center gap-1.5 pl-1.5 border-l border-cyan-400/15">
            {props.authUser.photoURL ? (
              <img
                src={props.authUser.photoURL}
                alt={props.authUser.displayName ?? 'User'}
                className="w-6 h-6 rounded-full border border-cyan-400/35 object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-cyan-500/25 border border-cyan-400/35 text-cyan-200 text-[11px] font-bold flex items-center justify-center">
                {(props.authUser.displayName || 'M')[0].toUpperCase()}
              </div>
            )}
            <button
              type="button"
              onClick={props.onSignOut}
              title={`Signed in as ${props.authUser.displayName ?? 'User'} — Click to sign out`}
              className="p-1.5 rounded-md bg-[#092133] border border-cyan-400/15 text-slate-300 hover:text-rose-200 hover:border-rose-400/40 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={props.authLoading}
            onClick={props.onSignInGoogle}
            title="Google ilə daxil ol"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md bg-emerald-500/20 border border-emerald-400/40 text-emerald-100 hover:bg-emerald-500/30 transition-colors whitespace-nowrap disabled:opacity-50"
          >
            <LogIn className="w-3.5 h-3.5 text-emerald-300" />
            <span className="hidden md:inline">{props.authLoading ? '...' : 'Sign In'}</span>
          </button>
        )}
      </div>
    </header>
  );
};
