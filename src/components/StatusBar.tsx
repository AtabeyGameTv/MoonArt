import React from 'react';
import { TOOLS } from '../constants/tools';
import { DocumentState, ToolId } from '../types/editor';

interface StatusBarProps {
  doc: DocumentState | null;
  activeTool: ToolId;
  zoom: number;
  cursorPos: { x: number; y: number } | null;
  foregroundColor: string;
  backgroundColor: string;
  onChangeZoom: (z: number) => void;
  onFitScreen: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  doc,
  activeTool,
  zoom,
  cursorPos,
  foregroundColor,
  backgroundColor,
  onChangeZoom,
  onFitScreen,
}) => {
  const toolName = TOOLS.find((t) => t.id === activeTool)?.name ?? activeTool;

  return (
    <footer className="h-7 shrink-0 bg-[#04111d] border-t border-cyan-400/15 px-3 flex items-center justify-between gap-4 text-[11px] text-cyan-100/75 select-none">
      {/* Left Metadata */}
      <div className="flex items-center gap-3 min-w-0 truncate">
        <span className="font-medium text-cyan-200 truncate max-w-[200px]">
          {doc ? doc.name : 'No Document Open'}
          {doc?.unsaved && <span className="text-amber-300 ml-1 font-bold">*</span>}
        </span>

        {doc && (
          <>
            <span className="text-cyan-400/30">|</span>
            <span className="font-mono-tabular whitespace-nowrap">
              {doc.width} × {doc.height} px · {doc.resolution} dpi
            </span>
            <span className="text-cyan-400/30 hidden sm:inline">|</span>
            <span className="font-mono-tabular hidden sm:inline whitespace-nowrap">
              {doc.layers.length} {doc.layers.length === 1 ? 'Layer' : 'Layers'}
            </span>
          </>
        )}

        <span className="text-cyan-400/30">|</span>
        <span className="text-cyan-300 font-medium whitespace-nowrap">Tool: {toolName}</span>

        {doc && cursorPos && (
          <>
            <span className="text-cyan-400/30 hidden md:inline">|</span>
            <span className="font-mono-tabular hidden md:inline whitespace-nowrap">
              X: {cursorPos.x}, Y: {cursorPos.y}
            </span>
          </>
        )}
      </div>

      {/* Right: Colors & Zoom Slider */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="hidden lg:flex items-center gap-2 font-mono-tabular">
          <span className="flex items-center gap-1">
            <span
              className="w-2.5 h-2.5 rounded-xs border border-white/40 inline-block"
              style={{ backgroundColor: foregroundColor }}
            />
            <span>{foregroundColor}</span>
          </span>
          <span className="text-cyan-400/30">/</span>
          <span className="flex items-center gap-1">
            <span
              className="w-2.5 h-2.5 rounded-xs border border-white/40 inline-block"
              style={{ backgroundColor: backgroundColor }}
            />
            <span>{backgroundColor}</span>
          </span>
        </div>

        {doc && (
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={10}
              max={1000}
              value={Math.round(zoom * 100)}
              onChange={(e) => onChangeZoom(Number(e.target.value) / 100)}
              className="ocean-slider w-20 hidden sm:block"
              title="Zoom (10% - 1000%)"
            />
            <button
              type="button"
              onClick={onFitScreen}
              title="Fit Canvas to Screen"
              className="font-mono-tabular text-cyan-200 hover:text-cyan-100 whitespace-nowrap"
            >
              {Math.round(zoom * 100)}%
            </button>
          </div>
        )}
      </div>
    </footer>
  );
};
