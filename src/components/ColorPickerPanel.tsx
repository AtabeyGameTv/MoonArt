import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, Plus, Trash2 } from 'lucide-react';
import {
  clamp,
  hexToRgb,
  hsvToRgb,
  hslToRgb,
  normalizeHex,
  rgbToHex,
  rgbToHsl,
  rgbToHsv,
} from '../utils/colorUtils';

interface ColorPickerPanelProps {
  foregroundColor: string;
  backgroundColor: string;
  editingTarget: 'fg' | 'bg';
  palette: string[];
  onSetEditingTarget: (t: 'fg' | 'bg') => void;
  onChangeColor: (hex: string, target: 'fg' | 'bg') => void;
  onSwapColors: () => void;
  onAddPaletteColor: (hex: string) => void;
  onRemovePaletteColor: (hex: string) => void;
}

export const ColorPickerPanel: React.FC<ColorPickerPanelProps> = ({
  foregroundColor,
  backgroundColor,
  editingTarget,
  palette,
  onSetEditingTarget,
  onChangeColor,
  onSwapColors,
  onAddPaletteColor,
  onRemovePaletteColor,
}) => {
  const activeHex = editingTarget === 'fg' ? foregroundColor : backgroundColor;
  const rgb = hexToRgb(activeHex);
  const hsv = rgbToHsv(rgb);
  const hsl = rgbToHsl(rgb);

  const [hexInput, setHexInput] = useState(activeHex);
  const [sliderMode, setSliderMode] = useState<'rgb' | 'hsl'>('rgb');

  const wheelCanvasRef = useRef<HTMLCanvasElement>(null);
  const svCanvasRef = useRef<HTMLCanvasElement>(null);
  const draggingWheelRef = useRef(false);
  const draggingSvRef = useRef(false);

  useEffect(() => {
    setHexInput(activeHex);
  }, [activeHex]);

  // Draw HSV Color Wheel
  useEffect(() => {
    const canvas = wheelCanvasRef.current;
    if (!canvas) return;
    const size = canvas.width;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cx = size / 2;
    const cy = size / 2;
    const outerR = size / 2 - 4;
    const innerR = outerR - 18;

    ctx.clearRect(0, 0, size, size);

    // Draw hue ring
    for (let deg = 0; deg < 360; deg += 1) {
      const a0 = ((deg - 1) * Math.PI) / 180;
      const a1 = ((deg + 1) * Math.PI) / 180;
      ctx.beginPath();
      ctx.arc(cx, cy, (outerR + innerR) / 2, a0, a1);
      ctx.strokeStyle = `hsl(${deg}, 100%, 50%)`;
      ctx.lineWidth = outerR - innerR;
      ctx.stroke();
    }

    // Draw indicator on hue ring
    const hueRad = (hsv.h * Math.PI) / 180;
    const midR = (outerR + innerR) / 2;
    const hx = cx + Math.cos(hueRad) * midR;
    const hy = cy + Math.sin(hueRad) * midR;
    ctx.beginPath();
    ctx.arc(hx, hy, 5.5, 0, Math.PI * 2);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = '#04111d';
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [hsv.h]);

  // Draw Saturation / Brightness square
  useEffect(() => {
    const canvas = svCanvasRef.current;
    if (!canvas) return;
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const hueRgb = hsvToRgb({ h: hsv.h, s: 100, v: 100 });
    ctx.fillStyle = rgbToHex(hueRgb);
    ctx.fillRect(0, 0, w, h);

    const whiteGrad = ctx.createLinearGradient(0, 0, w, 0);
    whiteGrad.addColorStop(0, '#FFFFFF');
    whiteGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = whiteGrad;
    ctx.fillRect(0, 0, w, h);

    const blackGrad = ctx.createLinearGradient(0, 0, 0, h);
    blackGrad.addColorStop(0, 'rgba(0,0,0,0)');
    blackGrad.addColorStop(1, '#000000');
    ctx.fillStyle = blackGrad;
    ctx.fillRect(0, 0, w, h);

    // Draw SV indicator
    const px = (hsv.s / 100) * w;
    const py = (1 - hsv.v / 100) * h;
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px, py, 7, 0, Math.PI * 2);
    ctx.strokeStyle = '#04111d';
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [hsv.h, hsv.s, hsv.v]);

  const updateHueFromWheel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = wheelCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width - canvas.width / 2;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height - canvas.height / 2;
    let deg = (Math.atan2(y, x) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    const newHex = rgbToHex(hsvToRgb({ h: Math.round(deg), s: hsv.s, v: hsv.v }));
    onChangeColor(newHex, editingTarget);
  };

  const updateSvFromBox = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = svCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const s = clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100);
    const v = clamp((1 - (e.clientY - rect.top) / rect.height) * 100, 0, 100);
    const newHex = rgbToHex(hsvToRgb({ h: hsv.h, s: Math.round(s), v: Math.round(v) }));
    onChangeColor(newHex, editingTarget);
  };

  const commitHexInput = (val: string) => {
    setHexInput(val);
    const norm = normalizeHex(val);
    if (norm) {
      onChangeColor(norm, editingTarget);
    }
  };

  return (
    <div className="space-y-4">
      {/* FG / BG Target Selector + Swap */}
      <div className="flex items-center justify-between gap-2 bg-[#061826] p-2 rounded-lg border border-cyan-400/15">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSetEditingTarget('fg')}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium border transition-colors ${
              editingTarget === 'fg'
                ? 'bg-[#0d4658] border-cyan-400/50 text-cyan-100'
                : 'border-transparent text-slate-300 hover:bg-[#0b273b]'
            }`}
          >
            <span
              className="w-3.5 h-3.5 rounded-sm border border-white/40 shrink-0"
              style={{ backgroundColor: foregroundColor }}
            />
            <span>FG</span>
          </button>
          <button
            type="button"
            onClick={() => onSetEditingTarget('bg')}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium border transition-colors ${
              editingTarget === 'bg'
                ? 'bg-[#0d4658] border-cyan-400/50 text-cyan-100'
                : 'border-transparent text-slate-300 hover:bg-[#0b273b]'
            }`}
          >
            <span
              className="w-3.5 h-3.5 rounded-sm border border-white/40 shrink-0"
              style={{ backgroundColor: backgroundColor }}
            />
            <span>BG</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onSwapColors}
          title="Swap Foreground & Background (X)"
          className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-[#092133] border border-cyan-400/20 text-cyan-200 hover:bg-[#0d4658] transition-colors"
        >
          <ArrowLeftRight className="w-3 h-3" />
          <span>Swap</span>
        </button>
      </div>

      {/* Color Wheel + Center SB Square */}
      <div className="relative flex items-center justify-center py-1">
        <div className="relative w-[196px] h-[196px]">
          <canvas
            ref={wheelCanvasRef}
            width={196}
            height={196}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              draggingWheelRef.current = true;
              updateHueFromWheel(e);
            }}
            onPointerMove={(e) => {
              if (draggingWheelRef.current) updateHueFromWheel(e);
            }}
            onPointerUp={() => {
              draggingWheelRef.current = false;
            }}
            className="w-full h-full cursor-crosshair touch-none"
          />
          <canvas
            ref={svCanvasRef}
            width={106}
            height={106}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              draggingSvRef.current = true;
              updateSvFromBox(e);
            }}
            onPointerMove={(e) => {
              if (draggingSvRef.current) updateSvFromBox(e);
            }}
            onPointerUp={() => {
              draggingSvRef.current = false;
            }}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[106px] h-[106px] rounded border border-cyan-200/30 cursor-crosshair touch-none"
          />
        </div>
      </div>

      {/* HEX Input & Native Picker */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-cyan-200/70 font-medium shrink-0">HEX</label>
        <input
          type="text"
          value={hexInput}
          onChange={(e) => commitHexInput(e.target.value)}
          placeholder="#00FFFF"
          maxLength={7}
          className="flex-1 min-w-0 bg-[#04111d] border border-cyan-400/25 rounded px-2.5 py-1.5 text-xs font-mono-tabular text-cyan-100 focus:outline-none focus:border-cyan-400"
        />
        <input
          type="color"
          value={activeHex}
          onChange={(e) => onChangeColor(e.target.value.toUpperCase(), editingTarget)}
          title="System Color Picker"
          className="w-8 h-7 rounded bg-transparent border border-cyan-400/25 cursor-pointer p-0"
        />
      </div>

      {/* Mode Switch: RGB vs HSL + Hue/Sat/Bright sliders */}
      <div className="space-y-2.5 bg-[#061826] p-2.5 rounded-lg border border-cyan-400/15">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-cyan-200/75">Color Channels</span>
          <div className="flex items-center gap-1 bg-[#04111d] p-0.5 rounded border border-cyan-400/15">
            <button
              type="button"
              onClick={() => setSliderMode('rgb')}
              className={`px-2 py-0.5 text-[10px] font-semibold rounded ${
                sliderMode === 'rgb' ? 'bg-cyan-500/25 text-cyan-200' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              RGB
            </button>
            <button
              type="button"
              onClick={() => setSliderMode('hsl')}
              className={`px-2 py-0.5 text-[10px] font-semibold rounded ${
                sliderMode === 'hsl' ? 'bg-cyan-500/25 text-cyan-200' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              HSL
            </button>
          </div>
        </div>

        {sliderMode === 'rgb' ? (
          <div className="space-y-2">
            {(
              [
                { key: 'r', label: 'R', val: rgb.r, max: 255 },
                { key: 'g', label: 'G', val: rgb.g, max: 255 },
                { key: 'b', label: 'B', val: rgb.b, max: 255 },
              ] as const
            ).map((ch) => (
              <div key={ch.key} className="flex items-center gap-2">
                <span className="w-4 text-[11px] font-mono-tabular text-cyan-200/70">{ch.label}</span>
                <input
                  type="range"
                  min={0}
                  max={ch.max}
                  value={ch.val}
                  onChange={(e) => {
                    const next = { ...rgb, [ch.key]: Number(e.target.value) };
                    onChangeColor(rgbToHex(next), editingTarget);
                  }}
                  className="ocean-slider flex-1"
                />
                <span className="w-8 text-right text-[11px] font-mono-tabular text-cyan-100">{ch.val}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {(
              [
                { key: 'h', label: 'H', val: hsl.h, max: 360, unit: '°' },
                { key: 's', label: 'S', val: hsl.s, max: 100, unit: '%' },
                { key: 'l', label: 'L', val: hsl.l, max: 100, unit: '%' },
              ] as const
            ).map((ch) => (
              <div key={ch.key} className="flex items-center gap-2">
                <span className="w-4 text-[11px] font-mono-tabular text-cyan-200/70">{ch.label}</span>
                <input
                  type="range"
                  min={0}
                  max={ch.max}
                  value={ch.val}
                  onChange={(e) => {
                    const next = { ...hsl, [ch.key]: Number(e.target.value) };
                    onChangeColor(rgbToHex(hslToRgb(next)), editingTarget);
                  }}
                  className="ocean-slider flex-1"
                />
                <span className="w-9 text-right text-[11px] font-mono-tabular text-cyan-100">
                  {ch.val}
                  {ch.unit}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ocean & Custom Swatches */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-cyan-200/80">Ocean Palette</span>
          <button
            type="button"
            onClick={() => onAddPaletteColor(activeHex)}
            className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded bg-[#0d4658] text-cyan-100 hover:bg-[#135d73] transition-colors"
          >
            <Plus className="w-3 h-3" />
            <span>Add</span>
          </button>
        </div>

        <div className="grid grid-cols-8 gap-1.5">
          {palette.map((hex, idx) => {
            const selected = hex.toUpperCase() === activeHex.toUpperCase();
            return (
              <div key={`${hex}-${idx}`} className="relative group">
                <button
                  type="button"
                  onClick={() => onChangeColor(hex, editingTarget)}
                  title={hex}
                  style={{ backgroundColor: hex }}
                  className={`w-full aspect-square rounded border transition-transform hover:scale-110 ${
                    selected ? 'border-white ring-2 ring-cyan-400' : 'border-cyan-200/25'
                  }`}
                />
                {idx >= 16 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemovePaletteColor(hex);
                    }}
                    title="Remove Swatch"
                    className="hidden group-hover:flex absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-rose-600 text-white items-center justify-center shadow"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
