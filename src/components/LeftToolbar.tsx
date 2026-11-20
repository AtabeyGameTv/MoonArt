import React, { useState } from 'react';
import { ArrowLeftRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { TOOLS } from '../constants/tools';
import { ToolCategory, ToolId } from '../types/editor';
import { ToolIcon } from './ToolIcons';

interface LeftToolbarProps {
  activeTool: ToolId;
  foregroundColor: string;
  backgroundColor: string;
  onSelectTool: (tool: ToolId) => void;
  onSwapColors: () => void;
  onOpenColorTab: (target: 'fg' | 'bg') => void;
}

const CATEGORIES: ToolCategory[] = [
  'Selection / Vector',
  'Drawing',
  'Painting',
  'Editing',
  'Shapes',
  'Text & Frame',
  'Image & View',
];

export const LeftToolbar: React.FC<LeftToolbarProps> = ({
  activeTool,
  foregroundColor,
  backgroundColor,
  onSelectTool,
  onSwapColors,
  onOpenColorTab,
}) => {
  const [compact, setCompact] = useState(false);

  return (
    <aside
      className={`shrink-0 bg-[#051522] border-r border-cyan-400/15 flex flex-col select-none transition-all duration-150 ${
        compact ? 'w-[54px]' : 'w-[152px]'
      }`}
    >
      {/* Toolbar Header + Compact Toggle */}
      <div className="h-8 px-2 border-b border-cyan-400/10 flex items-center justify-between shrink-0">
        {!compact && (
          <span className="text-[11px] font-semibold tracking-wide text-cyan-200/70">Tools</span>
        )}
        <button
          type="button"
          onClick={() => setCompact((v) => !v)}
          title={compact ? 'Expand Tool Labels' : 'Compact Icon Toolbar'}
          className="p-1 rounded text-cyan-200/70 hover:text-cyan-100 hover:bg-[#0d2c42] transition-colors ml-auto"
        >
          {compact ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Scrollable Vertical Tool List */}
      <div className="flex-1 overflow-y-auto px-1.5 py-2 space-y-2.5">
        {CATEGORIES.map((category) => {
          const catTools = TOOLS.filter((t) => t.category === category);
          return (
            <div key={category} className="space-y-0.5">
              {!compact && (
                <div className="px-1.5 pb-0.5 text-[10px] font-medium text-cyan-300/50 truncate">
                  {category}
                </div>
              )}
              {compact && <div className="border-t border-cyan-400/10 my-1" />}
              {catTools.map((tool) => {
                const isActive = activeTool === tool.id;
                const tooltipText = tool.shortcut
                  ? `${tool.name} (${tool.shortcut})`
                  : tool.name;

                return (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => onSelectTool(tool.id)}
                    title={`${tooltipText} — ${tool.description}`}
                    className={`w-full flex items-center gap-2 rounded-md transition-colors group ${
                      compact ? 'justify-center py-2 px-1' : 'px-2 py-1.5 text-left'
                    } ${
                      isActive
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/45 shadow-sm'
                        : 'text-slate-200 border border-transparent hover:bg-[#0b273b] hover:text-cyan-200'
                    }`}
                  >
                    <ToolIcon
                      id={tool.id}
                      className={`w-4 h-4 shrink-0 transition-colors ${
                        isActive ? 'text-cyan-300' : 'text-slate-300 group-hover:text-cyan-200'
                      }`}
                    />
                    {!compact && (
                      <span className="text-[11.5px] font-medium truncate flex-1 leading-tight">
                        {tool.name}
                      </span>
                    )}
                    {!compact && tool.shortcut && (
                      <span
                        className={`text-[10px] font-mono-tabular shrink-0 ${
                          isActive ? 'text-cyan-300/90' : 'text-slate-500 group-hover:text-cyan-300/60'
                        }`}
                      >
                        {tool.shortcut}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Pinned Foreground / Background Color Swatches */}
      <div className="shrink-0 border-t border-cyan-400/15 p-2 bg-[#04111d] flex items-center justify-center gap-2">
        <div className="relative w-10 h-9 shrink-0">
          <button
            type="button"
            onClick={() => onOpenColorTab('bg')}
            title={`Background Color: ${backgroundColor}`}
            style={{ backgroundColor }}
            className="absolute right-0 bottom-0 w-6 h-6 rounded border border-cyan-200/40 shadow-inner hover:scale-105 transition-transform"
          />
          <button
            type="button"
            onClick={() => onOpenColorTab('fg')}
            title={`Foreground Color: ${foregroundColor}`}
            style={{ backgroundColor: foregroundColor }}
            className="absolute left-0 top-0 w-6 h-6 rounded border-2 border-cyan-100 shadow-md hover:scale-105 transition-transform"
          />
        </div>
        {!compact && (
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <button
              type="button"
              onClick={onSwapColors}
              title="Swap Foreground & Background Colors (X)"
              className="flex items-center justify-center gap-1 px-2 py-1 text-[10px] font-medium rounded bg-[#092133] border border-cyan-400/20 text-cyan-200 hover:bg-[#0d4658] transition-colors"
            >
              <ArrowLeftRight className="w-3 h-3" />
              <span>Swap</span>
            </button>
            <span className="font-mono-tabular text-[10px] text-cyan-200/70 text-center truncate">
              {foregroundColor}
            </span>
          </div>
        )}
      </div>
    </aside>
  );
};
