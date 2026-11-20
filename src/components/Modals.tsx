import React, { useEffect, useState } from 'react';
import { Download, RotateCcw, Sparkles, X } from 'lucide-react';
import { CANVAS_PRESETS } from '../constants/tools';
import { compositeDocumentToCanvas, triggerBlobDownload } from '../engine/projectStorage';
import { DocumentState } from '../types/editor';

/* ================= NEW CANVAS MODAL ================= */
export const NewCanvasModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onCreate: (opts: {
    name: string;
    width: number;
    height: number;
    resolution: number;
    background: string;
  }) => void;
}> = ({ open, onClose, onCreate }) => {
  const [name, setName] = useState('Untitled Artwork');
  const [presetIdx, setPresetIdx] = useState(0);
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [resolution, setResolution] = useState(72);
  const [background, setBackground] = useState<'transparent' | 'white' | 'black' | 'ocean'>('white');

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#071b2a] border border-cyan-400/25 rounded-xl shadow-2xl overflow-hidden">
        <div className="px-5 py-3.5 bg-[#061826] border-b border-cyan-400/15 flex items-center justify-between">
          <h2 className="font-display font-semibold text-sm text-cyan-100">Create New Canvas</h2>
          <button type="button" onClick={onClose} className="p-1 rounded text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          <div className="space-y-1.5">
            <label className="text-cyan-200/80 font-medium block">Document Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#04111d] border border-cyan-400/25 rounded-md px-3 py-2 text-cyan-100 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-cyan-200/80 font-medium block">Preset</label>
            <select
              value={presetIdx}
              onChange={(e) => {
                const idx = Number(e.target.value);
                setPresetIdx(idx);
                const p = CANVAS_PRESETS[idx];
                setWidth(p.width);
                setHeight(p.height);
                setResolution(p.resolution);
              }}
              className="w-full bg-[#04111d] border border-cyan-400/25 rounded-md px-3 py-2 text-cyan-100 focus:outline-none focus:border-cyan-400"
            >
              {CANVAS_PRESETS.map((p, idx) => (
                <option key={p.label} value={idx}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-cyan-200/80 font-medium block">Width (px)</label>
              <input
                type="number"
                min={16}
                max={8192}
                value={width}
                onChange={(e) => {
                  setPresetIdx(CANVAS_PRESETS.length - 1);
                  setWidth(Math.max(16, Math.min(8192, Number(e.target.value) || 16)));
                }}
                className="w-full bg-[#04111d] border border-cyan-400/25 rounded-md px-2.5 py-2 font-mono-tabular text-cyan-100"
              />
            </div>
            <div className="space-y-1">
              <label className="text-cyan-200/80 font-medium block">Height (px)</label>
              <input
                type="number"
                min={16}
                max={8192}
                value={height}
                onChange={(e) => {
                  setPresetIdx(CANVAS_PRESETS.length - 1);
                  setHeight(Math.max(16, Math.min(8192, Number(e.target.value) || 16)));
                }}
                className="w-full bg-[#04111d] border border-cyan-400/25 rounded-md px-2.5 py-2 font-mono-tabular text-cyan-100"
              />
            </div>
            <div className="space-y-1">
              <label className="text-cyan-200/80 font-medium block">DPI</label>
              <input
                type="number"
                min={72}
                max={600}
                value={resolution}
                onChange={(e) => setResolution(Math.max(72, Math.min(600, Number(e.target.value) || 72)))}
                className="w-full bg-[#04111d] border border-cyan-400/25 rounded-md px-2.5 py-2 font-mono-tabular text-cyan-100"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-cyan-200/80 font-medium block">Background</label>
            <div className="grid grid-cols-4 gap-2">
              {(
                [
                  { id: 'white', label: 'White' },
                  { id: 'transparent', label: 'Transparent' },
                  { id: 'black', label: 'Black' },
                  { id: 'ocean', label: 'Deep Ocean' },
                ] as const
              ).map((bg) => (
                <button
                  key={bg.id}
                  type="button"
                  onClick={() => setBackground(bg.id)}
                  className={`py-2 px-2 rounded-md border font-medium transition-colors ${
                    background === bg.id
                      ? 'bg-[#0d4658] border-cyan-400 text-cyan-100'
                      : 'bg-[#04111d] border-cyan-400/20 text-slate-300 hover:border-cyan-400/40'
                  }`}
                >
                  {bg.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 py-3.5 bg-[#061826] border-t border-cyan-400/15 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-md bg-[#092133] border border-cyan-400/20 text-slate-200 hover:bg-[#0d4658]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onCreate({
                name: name.trim() || 'Untitled Artwork',
                width,
                height,
                resolution,
                background,
              });
              onClose();
            }}
            className="px-5 py-2 text-xs font-semibold rounded-md bg-cyan-500 text-[#03131f] hover:bg-cyan-400"
          >
            Create Canvas
          </button>
        </div>
      </div>
    </div>
  );
};

/* ================= EXPORT MODAL ================= */
export const ExportModal: React.FC<{
  open: boolean;
  doc: DocumentState | null;
  canvasMap: Map<string, HTMLCanvasElement>;
  onClose: () => void;
  onExported: (filename: string) => void;
}> = ({ open, doc, canvasMap, onClose, onExported }) => {
  const [format, setFormat] = useState<'png' | 'jpeg' | 'webp'>('png');
  const [quality, setQuality] = useState(92);
  const [preserveTransparency, setPreserveTransparency] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [estBytes, setEstBytes] = useState<number>(0);

  useEffect(() => {
    if (!open || !doc) return;
    const flat = compositeDocumentToCanvas(
      doc,
      canvasMap,
      format === 'png' ? !preserveTransparency : true,
      format === 'jpeg'
    );
    const mime = format === 'png' ? 'image/png' : format === 'jpeg' ? 'image/jpeg' : 'image/webp';
    const q = format === 'png' ? undefined : quality / 100;
    flat.toBlob(
      (blob) => {
        if (!blob) return;
        setEstBytes(blob.size);
        const url = URL.createObjectURL(blob);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      },
      mime,
      q
    );
  }, [open, doc, canvasMap, format, quality, preserveTransparency]);

  if (!open || !doc) return null;

  const handleDownload = () => {
    const flat = compositeDocumentToCanvas(
      doc,
      canvasMap,
      format === 'png' ? !preserveTransparency : true,
      format === 'jpeg'
    );
    const mime = format === 'png' ? 'image/png' : format === 'jpeg' ? 'image/jpeg' : 'image/webp';
    const q = format === 'png' ? undefined : quality / 100;
    const ext = format === 'jpeg' ? 'jpg' : format;
    const cleanName = doc.name.replace(/\.[^/.]+$/, '');
    const filename = `${cleanName}.${ext}`;

    flat.toBlob(
      (blob) => {
        if (!blob) return;
        triggerBlobDownload(blob, filename);
        onExported(filename);
        onClose();
      },
      mime,
      q
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[#071b2a] border border-cyan-400/25 rounded-xl shadow-2xl overflow-hidden">
        <div className="px-5 py-3.5 bg-[#061826] border-b border-cyan-400/15 flex items-center justify-between">
          <h2 className="font-display font-semibold text-sm text-cyan-100">Export Image</h2>
          <button type="button" onClick={onClose} className="p-1 rounded text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          {/* Live Preview */}
          <div className="h-48 rounded-lg border border-cyan-400/20 canvas-checkerboard flex items-center justify-center overflow-hidden p-2">
            {previewUrl && (
              <img src={previewUrl} alt="Export Preview" className="max-w-full max-h-full object-contain shadow-lg" />
            )}
          </div>

          <div className="flex items-center justify-between font-mono-tabular text-cyan-200/80">
            <span>
              {doc.width} × {doc.height} px
            </span>
            <span>Estimated Size: {(estBytes / 1024).toFixed(1)} KB</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { id: 'png', label: 'PNG (Lossless)' },
                { id: 'jpeg', label: 'JPG (Compact)' },
                { id: 'webp', label: 'WEBP (Modern)' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFormat(f.id)}
                className={`py-2 px-3 rounded-md border font-medium transition-colors ${
                  format === f.id
                    ? 'bg-[#0d4658] border-cyan-400 text-cyan-100'
                    : 'bg-[#04111d] border-cyan-400/20 text-slate-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {format === 'png' ? (
            <label className="flex items-center justify-between bg-[#061826] p-3 rounded-lg border border-cyan-400/15 cursor-pointer">
              <span className="text-slate-200 font-medium">Preserve PNG Transparency</span>
              <input
                type="checkbox"
                checked={preserveTransparency}
                onChange={(e) => setPreserveTransparency(e.target.checked)}
                className="accent-cyan-400 w-4 h-4"
              />
            </label>
          ) : (
            <div className="bg-[#061826] p-3 rounded-lg border border-cyan-400/15 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-cyan-200/80 font-medium">Quality</span>
                <span className="font-mono-tabular text-cyan-300">{quality}%</span>
              </div>
              <input
                type="range"
                min={10}
                max={100}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                className="ocean-slider w-full"
              />
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 bg-[#061826] border-t border-cyan-400/15 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-md bg-[#092133] border border-cyan-400/20 text-slate-200 hover:bg-[#0d4658]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="px-5 py-2 text-xs font-semibold rounded-md bg-cyan-500 text-[#03131f] hover:bg-cyan-400 flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download {format.toUpperCase()}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

/* ================= IMAGE / CANVAS SIZE MODAL ================= */
export const ResizeModal: React.FC<{
  mode: 'image' | 'canvas' | null;
  currentWidth: number;
  currentHeight: number;
  onClose: () => void;
  onApply: (mode: 'image' | 'canvas', width: number, height: number) => void;
}> = ({ mode, currentWidth, currentHeight, onClose, onApply }) => {
  const [w, setW] = useState(currentWidth);
  const [h, setH] = useState(currentHeight);
  const [lockRatio, setLockRatio] = useState(true);

  useEffect(() => {
    setW(currentWidth);
    setH(currentHeight);
  }, [currentWidth, currentHeight, mode]);

  if (!mode) return null;

  const ratio = currentWidth / (currentHeight || 1);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#071b2a] border border-cyan-400/25 rounded-xl shadow-2xl overflow-hidden">
        <div className="px-5 py-3.5 bg-[#061826] border-b border-cyan-400/15 flex items-center justify-between">
          <h2 className="font-display font-semibold text-sm text-cyan-100">
            {mode === 'image' ? 'Resize Image (Scale)' : 'Resize Canvas (Crop / Extend)'}
          </h2>
          <button type="button" onClick={onClose} className="p-1 rounded text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-cyan-200/80 font-medium block">Width (px)</label>
              <input
                type="number"
                min={16}
                max={8192}
                value={w}
                onChange={(e) => {
                  const nextW = Math.max(16, Math.min(8192, Number(e.target.value) || 16));
                  setW(nextW);
                  if (lockRatio && mode === 'image') {
                    setH(Math.max(16, Math.round(nextW / ratio)));
                  }
                }}
                className="w-full bg-[#04111d] border border-cyan-400/25 rounded-md px-2.5 py-2 font-mono-tabular text-cyan-100"
              />
            </div>
            <div className="space-y-1">
              <label className="text-cyan-200/80 font-medium block">Height (px)</label>
              <input
                type="number"
                min={16}
                max={8192}
                value={h}
                onChange={(e) => {
                  const nextH = Math.max(16, Math.min(8192, Number(e.target.value) || 16));
                  setH(nextH);
                  if (lockRatio && mode === 'image') {
                    setW(Math.max(16, Math.round(nextH * ratio)));
                  }
                }}
                className="w-full bg-[#04111d] border border-cyan-400/25 rounded-md px-2.5 py-2 font-mono-tabular text-cyan-100"
              />
            </div>
          </div>

          {mode === 'image' && (
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-slate-200">Lock Aspect Ratio</span>
              <input
                type="checkbox"
                checked={lockRatio}
                onChange={(e) => setLockRatio(e.target.checked)}
                className="accent-cyan-400 w-4 h-4"
              />
            </label>
          )}
        </div>

        <div className="px-5 py-3.5 bg-[#061826] border-t border-cyan-400/15 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-md bg-[#092133] border border-cyan-400/20 text-slate-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(mode, w, h);
              onClose();
            }}
            className="px-4 py-2 text-xs font-semibold rounded-md bg-cyan-500 text-[#03131f] hover:bg-cyan-400"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

/* ================= SAVE AS MODAL (PNG / JPEG / WEBP) ================= */
export const SaveAsModal: React.FC<{
  open: boolean;
  currentName: string;
  onClose: () => void;
  onConfirm: (
    newName: string,
    format: 'png' | 'jpeg' | 'webp',
    quality: number,
    preserveTransparency: boolean
  ) => void;
}> = ({ open, currentName, onClose, onConfirm }) => {
  const [name, setName] = useState(currentName);
  const [format, setFormat] = useState<'png' | 'jpeg' | 'webp'>('png');
  const [quality, setQuality] = useState(92);
  const [preserveTransparency, setPreserveTransparency] = useState(true);

  useEffect(() => {
    setName(currentName.replace(/\.(png|jpe?g|webp|moonart|json)$/i, ''));
  }, [currentName, open]);

  if (!open) return null;

  const ext = format === 'jpeg' ? 'jpg' : format;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#071b2a] border border-cyan-400/25 rounded-xl shadow-2xl overflow-hidden">
        <div className="px-5 py-3.5 bg-[#061826] border-b border-cyan-400/15 flex items-center justify-between">
          <h2 className="font-display font-semibold text-sm text-cyan-100">Save Image As</h2>
          <button type="button" onClick={onClose} className="p-1 rounded text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          <div className="space-y-1.5">
            <label className="text-cyan-200/80 font-medium block">Filename</label>
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && name.trim()) {
                    onConfirm(name.trim(), format, quality, preserveTransparency);
                    onClose();
                  }
                }}
                className="flex-1 bg-[#04111d] border border-cyan-400/25 rounded-md px-3 py-2 text-cyan-100 focus:outline-none focus:border-cyan-400"
              />
              <span className="font-mono-tabular text-cyan-300/80">.{ext}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-cyan-200/80 font-medium block">Format</label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'png', label: 'PNG' },
                  { id: 'jpeg', label: 'JPEG' },
                  { id: 'webp', label: 'WEBP' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFormat(f.id)}
                  className={`py-2 px-3 rounded-md border font-semibold transition-colors ${
                    format === f.id
                      ? 'bg-[#0d4658] border-cyan-400 text-cyan-100'
                      : 'bg-[#04111d] border-cyan-400/20 text-slate-300 hover:border-cyan-400/40'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {format === 'png' ? (
            <label className="flex items-center justify-between bg-[#061826] p-3 rounded-lg border border-cyan-400/15 cursor-pointer">
              <span className="text-slate-200 font-medium">Preserve Transparency</span>
              <input
                type="checkbox"
                checked={preserveTransparency}
                onChange={(e) => setPreserveTransparency(e.target.checked)}
                className="accent-cyan-400 w-4 h-4"
              />
            </label>
          ) : (
            <div className="bg-[#061826] p-3 rounded-lg border border-cyan-400/15 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-cyan-200/80 font-medium">JPEG / WEBP Quality</span>
                <span className="font-mono-tabular text-cyan-300">{quality}%</span>
              </div>
              <input
                type="range"
                min={10}
                max={100}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                className="ocean-slider w-full"
              />
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 bg-[#061826] border-t border-cyan-400/15 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-md bg-[#092133] border border-cyan-400/20 text-slate-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (name.trim()) {
                onConfirm(name.trim(), format, quality, preserveTransparency);
                onClose();
              }
            }}
            className="px-4 py-2 text-xs font-semibold rounded-md bg-cyan-500 text-[#03131f] hover:bg-cyan-400"
          >
            Save .{ext}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ================= RESTORE AUTOSAVE BANNER ================= */
export const RestorePromptBanner: React.FC<{
  projectName: string;
  savedAt: string;
  onRestore: () => void;
  onDiscard: () => void;
}> = ({ projectName, savedAt, onRestore, onDiscard }) => (
  <div className="bg-[#09283c] border-b border-cyan-400/35 px-4 py-2 flex items-center justify-between gap-4 text-xs z-30 shrink-0">
    <div className="flex items-center gap-2.5 text-cyan-100">
      <Sparkles className="w-4 h-4 text-cyan-300 shrink-0" />
      <span>
        Autosaved project found: <strong>{projectName}</strong>{' '}
        <span className="text-cyan-200/70">
          ({new Date(savedAt).toLocaleString()})
        </span>{' '}
        — Restore previous project?
      </span>
    </div>
    <div className="flex items-center gap-2 shrink-0">
      <button
        type="button"
        onClick={onRestore}
        className="px-3 py-1 rounded bg-cyan-500 text-[#03131f] font-semibold hover:bg-cyan-400 flex items-center gap-1"
      >
        <RotateCcw className="w-3 h-3" />
        <span>Restore</span>
      </button>
      <button
        type="button"
        onClick={onDiscard}
        className="px-3 py-1 rounded bg-[#061826] border border-cyan-400/25 text-slate-200 hover:bg-[#0d4658]"
      >
        Dismiss
      </button>
    </div>
  </div>
);
