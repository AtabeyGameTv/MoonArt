import React from 'react';
import {
  ArrowUpRight,
  Blend,
  Brush,
  Circle,
  Copy,
  Crop,
  Droplet,
  Eraser,
  FlipHorizontal2,
  FlipVertical2,
  Grid2x2,
  Heart,
  Hexagon,
  Highlighter,
  Lasso,
  Minus,
  MousePointer,
  Move,
  PaintBucket,
  Palette,
  Pen,
  Pencil,
  PenTool,
  Pipette,
  RotateCw,
  SlidersHorizontal,
  Sparkles,
  Spline,
  SprayCan,
  Square,
  Stamp,
  Star,
  Sun,
  Triangle,
  Type,
  Wand2,
  Waves,
  Wind,
  ZoomIn,
  Moon,
  Feather,
  Flame,
  Focus,
  LayoutGrid,
} from 'lucide-react';
import { ToolId } from '../types/editor';

export const MoonArtLogo: React.FC<{ className?: string }> = ({ className = 'w-7 h-7' }) => (
  <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <defs>
      <linearGradient id="moonart_grad" x1="4" y1="4" x2="32" y2="32" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#22D3EE" />
        <stop offset="55%" stopColor="#2DD4BF" />
        <stop offset="100%" stopColor="#0E7490" />
      </linearGradient>
    </defs>
    <rect x="1.5" y="1.5" width="33" height="33" rx="8" fill="#061826" stroke="url(#moonart_grad)" strokeWidth="1.5" />
    <path
      d="M21.5 8.5C16.2 9.1 12 13.6 12 19.1C12 24.9 16.7 29.5 22.5 29.5C24.7 29.5 26.8 28.8 28.5 27.6C25.5 28.1 22.2 26.9 20.1 24.3C17.5 21.1 17.7 16.2 20.6 12.6C21.8 11.1 23.3 9.9 25 9.1C23.9 8.6 22.7 8.4 21.5 8.5Z"
      fill="url(#moonart_grad)"
    />
    <path
      d="M25.2 10.5L27.5 12.8L19.6 20.7L16.7 21.3L17.3 18.4L25.2 10.5Z"
      fill="#E0F7FA"
      stroke="#04111D"
      strokeWidth="0.9"
      strokeLinejoin="round"
    />
  </svg>
);

export const ToolIcon: React.FC<{ id: ToolId; className?: string }> = ({ id, className = 'w-4 h-4' }) => {
  switch (id) {
    case 'vector':
      return <Spline className={className} />;
    case 'move':
      return <Move className={className} />;
    case 'selection':
      return <MousePointer className={className} />;
    case 'rectSelect':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2" className={className}>
          <rect x="4" y="4" width="16" height="16" rx="1" />
        </svg>
      );
    case 'ellipseSelect':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2" className={className}>
          <ellipse cx="12" cy="12" rx="8" ry="6" />
        </svg>
      );
    case 'lasso':
      return <Lasso className={className} />;
    case 'polygonLasso':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className}>
          <polygon points="5,6 16,4 20,14 11,20 4,15" strokeLinejoin="round" />
          <circle cx="5" cy="6" r="1.3" fill="currentColor" />
          <circle cx="16" cy="4" r="1.3" fill="currentColor" />
          <circle cx="20" cy="14" r="1.3" fill="currentColor" />
        </svg>
      );
    case 'magicWand':
      return <Wand2 className={className} />;

    case 'pencil':
      return <Pencil className={className} />;
    case 'brush':
      return <Brush className={className} />;
    case 'marker':
      return <Highlighter className={className} />;
    case 'pen':
      return <PenTool className={className} />;
    case 'ink':
      return <Feather className={className} />;
    case 'airbrush':
      return <Wind className={className} />;
    case 'spray':
      return <SprayCan className={className} />;
    case 'crayon':
      return <Pen className={className} />;
    case 'charcoal':
      return <Sparkles className={className} />;
    case 'watercolor':
      return <Waves className={className} />;
    case 'oilBrush':
      return <Palette className={className} />;

    case 'paintBucket':
      return <PaintBucket className={className} />;
    case 'gradient':
      return <Blend className={className} />;
    case 'colorPicker':
      return <Pipette className={className} />;
    case 'pattern':
      return <LayoutGrid className={className} />;

    case 'eraser':
      return <Eraser className={className} />;
    case 'softEraser':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className}>
          <path d="M7 21h10" strokeLinecap="round" strokeDasharray="2 2" />
          <path d="m14.5 5.5 4 4-8 8H6.5l-2-2 10-10Z" strokeLinejoin="round" />
        </svg>
      );
    case 'smudge':
      return <Droplet className={className} />;
    case 'blur':
      return <Focus className={className} />;
    case 'sharpen':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className}>
          <path d="M12 3L20 19H4L12 3Z" strokeLinejoin="round" />
          <path d="M12 9v5" strokeLinecap="round" />
        </svg>
      );
    case 'clone':
      return <Stamp className={className} />;
    case 'dodge':
      return <Sun className={className} />;
    case 'burn':
      return <Flame className={className} />;

    case 'rectangle':
      return <Square className={className} />;
    case 'roundedRect':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className}>
          <rect x="4" y="5" width="16" height="14" rx="4" />
        </svg>
      );
    case 'circle':
      return <Circle className={className} />;
    case 'ellipse':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className}>
          <ellipse cx="12" cy="12" rx="9" ry="5.5" />
        </svg>
      );
    case 'line':
      return <Minus className={`${className} -rotate-45`} />;
    case 'arrow':
      return <ArrowUpRight className={className} />;
    case 'polygon':
      return <Hexagon className={className} />;
    case 'star':
      return <Star className={className} />;
    case 'triangle':
      return <Triangle className={className} />;
    case 'heart':
      return <Heart className={className} />;
    case 'customShape':
      return <Moon className={className} />;

    case 'text':
      return <Type className={className} />;
    case 'frameDivider':
      return <Grid2x2 className={className} />;
    case 'filter':
      return <SlidersHorizontal className={className} />;
    case 'crop':
      return <Crop className={className} />;
    case 'rotateTool':
      return <RotateCw className={className} />;
    case 'flipH':
      return <FlipHorizontal2 className={className} />;
    case 'flipV':
      return <FlipVertical2 className={className} />;
    case 'zoom':
      return <ZoomIn className={className} />;
    default:
      return <Copy className={className} />;
  }
};
