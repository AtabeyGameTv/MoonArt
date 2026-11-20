import {
  DocumentState,
  Layer,
  MoonArtProjectFile,
  SerializedLayer,
} from '../types/editor';
import { renderFrameDivider, renderTextLayer, renderVectorPath } from './vectorAndShapes';

const DB_NAME = 'MoonArtAutosaveDB';
const STORE_NAME = 'projects';
const AUTOSAVE_KEY = 'latest_session';

function openAutosaveDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveAutosaveProject(project: MoonArtProjectFile): Promise<void> {
  try {
    const db = await openAutosaveDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(project, AUTOSAVE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Silent fallback if IndexedDB unavailable
  }
}

export async function loadAutosaveProject(): Promise<MoonArtProjectFile | null> {
  try {
    const db = await openAutosaveDB();
    const result = await new Promise<MoonArtProjectFile | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(AUTOSAVE_KEY);
      req.onsuccess = () => resolve((req.result as MoonArtProjectFile) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (result && result.format === 'moonart-project' && result.document?.layers?.length > 0) {
      return result;
    }
    return null;
  } catch {
    return null;
  }
}

export async function clearAutosaveProject(): Promise<void> {
  try {
    const db = await openAutosaveDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(AUTOSAVE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore
  }
}

export function serializeLayers(
  layers: Layer[],
  canvasMap: Map<string, HTMLCanvasElement>
): SerializedLayer[] {
  return layers.map((layer) => {
    const clone: SerializedLayer = {
      ...layer,
      transform: { ...layer.transform },
      textData: layer.textData ? { ...layer.textData } : undefined,
      frameData: layer.frameData
        ? {
            ...layer.frameData,
            cells: layer.frameData.cells.map((c) => ({ ...c })),
          }
        : undefined,
      vectorData: layer.vectorData
        ? {
            ...layer.vectorData,
            points: layer.vectorData.points.map((p) => ({ ...p })),
          }
        : undefined,
    };
    if (layer.type === 'raster') {
      const c = canvasMap.get(layer.id);
      if (c) {
        clone.imageDataUrl = c.toDataURL('image/png');
      }
    }
    return clone;
  });
}

export async function deserializeLayers(
  serialized: SerializedLayer[],
  docWidth: number,
  docHeight: number
): Promise<{ layers: Layer[]; canvasMap: Map<string, HTMLCanvasElement> }> {
  const canvasMap = new Map<string, HTMLCanvasElement>();
  const layers: Layer[] = [];

  for (const item of serialized) {
    const { imageDataUrl, ...rest } = item;
    const layer: Layer = {
      ...rest,
      transform: rest.transform ?? { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    };

    if (layer.type === 'raster') {
      const c = document.createElement('canvas');
      c.width = docWidth;
      c.height = docHeight;
      if (imageDataUrl) {
        await new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            const ctx = c.getContext('2d');
            if (ctx) ctx.drawImage(img, 0, 0);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = imageDataUrl;
        });
      }
      canvasMap.set(layer.id, c);
    }
    layers.push(layer);
  }

  return { layers, canvasMap };
}

/**
 * Composites all visible layers onto a single flat HTMLCanvasElement for export or thumbnails.
 */
export function compositeDocumentToCanvas(
  doc: DocumentState,
  canvasMap: Map<string, HTMLCanvasElement>,
  includeBackground = true,
  fallbackWhiteIfTransparent = false
): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = doc.width;
  out.height = doc.height;
  const ctx = out.getContext('2d')!;

  if (includeBackground) {
    if (doc.background !== 'transparent') {
      if (doc.background === 'white') ctx.fillStyle = '#FFFFFF';
      else if (doc.background === 'black') ctx.fillStyle = '#000000';
      else if (doc.background === 'ocean') ctx.fillStyle = '#041524';
      else ctx.fillStyle = doc.background;
      ctx.fillRect(0, 0, doc.width, doc.height);
    } else if (fallbackWhiteIfTransparent) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, doc.width, doc.height);
    }
  }

  // Layers are ordered bottom-to-top in array? Let's define layers[0] = top-most in UI, so render reverse!
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const layer = doc.layers[i];
    if (!layer.visible) continue;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity / 100));
    ctx.globalCompositeOperation = layer.blendMode;

    const { x, y, scaleX, scaleY, rotation } = layer.transform;
    const cx = doc.width / 2 + x;
    const cy = doc.height / 2 + y;
    ctx.translate(cx, cy);
    if (rotation !== 0) ctx.rotate((rotation * Math.PI) / 180);
    if (scaleX !== 1 || scaleY !== 1) ctx.scale(scaleX, scaleY);
    ctx.translate(-doc.width / 2, -doc.height / 2);

    if (layer.type === 'raster') {
      const layerCanvas = canvasMap.get(layer.id);
      if (layerCanvas) {
        ctx.drawImage(layerCanvas, 0, 0);
      }
    } else if (layer.type === 'text' && layer.textData) {
      renderTextLayer(ctx, layer.textData);
    } else if (layer.type === 'frame' && layer.frameData) {
      renderFrameDivider(ctx, layer.frameData, false);
    } else if (layer.type === 'vector' && layer.vectorData) {
      renderVectorPath(ctx, layer.vectorData);
    }

    ctx.restore();
  }

  return out;
}

export function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function buildMoonArtProject(
  doc: DocumentState,
  canvasMap: Map<string, HTMLCanvasElement>,
  palette: string[],
  foregroundColor: string,
  backgroundColor: string
): MoonArtProjectFile {
  return {
    format: 'moonart-project',
    version: 1,
    savedAt: new Date().toISOString(),
    document: {
      id: doc.id,
      name: doc.name,
      width: doc.width,
      height: doc.height,
      resolution: doc.resolution,
      background: doc.background,
      activeLayerId: doc.activeLayerId,
      layers: serializeLayers(doc.layers, canvasMap),
    },
    palette,
    foregroundColor,
    backgroundColor,
  };
}

const VALID_IMAGE_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.jfif',
  '.webp',
  '.gif',
  '.svg',
  '.bmp',
  '.avif',
  '.ico',
];

export function hasSupportedImageExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return VALID_IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function readImageFileSafely(
  file: File
): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const isImageMime = file.type.startsWith('image/');
    const hasValidExt = hasSupportedImageExtension(file.name);

    if (!isImageMime && !hasValidExt) {
      reject(
        new Error(
          `Unsupported file format "${file.name}". Supported formats: PNG, JPG, JPEG, WEBP, GIF, SVG, BMP, AVIF.`
        )
      );
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Failed to read file "${file.name}".`));
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || img.width || 800;
        const h = img.naturalHeight || img.height || 600;
        if (w <= 0 || h <= 0) {
          reject(new Error(`Image "${file.name}" has invalid dimensions.`));
          return;
        }
        resolve({ dataUrl, width: w, height: h });
      };
      img.onerror = () => reject(new Error(`Image "${file.name}" appears corrupted or unreadable.`));
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

function normalizeMoonArtProject(raw: unknown): MoonArtProjectFile | null {
  if (!raw || typeof raw !== 'object') return null;
  const parsed = raw as Partial<MoonArtProjectFile>;
  if (
    parsed.format !== 'moonart-project' ||
    !parsed.document ||
    !Array.isArray(parsed.document.layers) ||
    parsed.document.layers.length === 0
  ) {
    return null;
  }

  const docWidth = Math.max(16, Math.min(8192, Number(parsed.document.width) || 1920));
  const docHeight = Math.max(16, Math.min(8192, Number(parsed.document.height) || 1080));
  const normalizedLayers: SerializedLayer[] = parsed.document.layers.map((l, idx) => ({
    id: l.id || crypto.randomUUID(),
    name: l.name || `Layer ${idx + 1}`,
    type: l.type || 'raster',
    visible: l.visible !== false,
    locked: Boolean(l.locked),
    opacity: typeof l.opacity === 'number' ? Math.max(0, Math.min(100, l.opacity)) : 100,
    blendMode: l.blendMode || 'source-over',
    transform: l.transform ?? { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    textData: l.textData,
    frameData: l.frameData,
    vectorData: l.vectorData,
    imageDataUrl: l.imageDataUrl,
  }));

  return {
    format: 'moonart-project',
    version: 1,
    savedAt: parsed.savedAt || new Date().toISOString(),
    document: {
      id: parsed.document.id || crypto.randomUUID(),
      name: parsed.document.name || 'Untitled Artwork',
      width: docWidth,
      height: docHeight,
      resolution: Number(parsed.document.resolution) || 72,
      background: parsed.document.background || 'transparent',
      activeLayerId: parsed.document.activeLayerId ?? normalizedLayers[0]?.id ?? null,
      layers: normalizedLayers,
    },
    palette: Array.isArray(parsed.palette) ? parsed.palette : [],
    foregroundColor: parsed.foregroundColor || '#22D3EE',
    backgroundColor: parsed.backgroundColor || '#041524',
  };
}

export function parseMoonArtProjectFile(file: File): Promise<MoonArtProjectFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read "${file.name}".`));
    reader.onload = () => {
      try {
        const rawText = String(reader.result ?? '').replace(/^\uFEFF/, '').trim();
        const parsed = JSON.parse(rawText);
        const normalized = normalizeMoonArtProject(parsed);
        if (!normalized) {
          reject(new Error(`"${file.name}" is not a valid MoonArt project.`));
          return;
        }
        resolve(normalized);
      } catch {
        reject(new Error(`"${file.name}" is corrupted or unreadable.`));
      }
    };
    reader.readAsText(file, 'utf-8');
  });
}

export async function trySniffMoonArtProject(file: File): Promise<MoonArtProjectFile | null> {
  const lower = file.name.toLowerCase();
  if (file.type.startsWith('image/') && !lower.endsWith('.json')) {
    return null;
  }
  try {
    const text = (await file.text()).replace(/^\uFEFF/, '').trim();
    if (!text.startsWith('{') || !text.includes('moonart-project')) {
      return null;
    }
    const parsed = JSON.parse(text);
    return normalizeMoonArtProject(parsed);
  } catch {
    return null;
  }
}

/* ================= PNG EMBEDDED LAYER METADATA (tEXt CHUNK) ================= */
const PNG_META_KEYWORD = 'MoonArtProject';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function encodeUtf8Base64(text: string): string {
  const utf8 = new TextEncoder().encode(text);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < utf8.length; i += chunk) {
    binary += String.fromCharCode(...utf8.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function decodeUtf8Base64(b64: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * Embeds MoonArt layered project JSON inside a standard PNG tEXt chunk before IEND.
 * Any photo viewer opens the resulting .png normally, while MoonArt can also reopen all layers.
 */
export async function embedMoonArtMetadataInPngBlob(
  pngBlob: Blob,
  project: MoonArtProjectFile
): Promise<Blob> {
  try {
    const buffer = await pngBlob.arrayBuffer();
    const src = new Uint8Array(buffer);
    // Verify PNG header & trailing IEND (12 bytes)
    if (
      src.length < 24 ||
      src[0] !== 0x89 ||
      src[1] !== 0x50 ||
      src[2] !== 0x4e ||
      src[3] !== 0x47
    ) {
      return pngBlob;
    }

    const iendOffset = src.length - 12;
    if (
      src[iendOffset + 4] !== 0x49 ||
      src[iendOffset + 5] !== 0x45 ||
      src[iendOffset + 6] !== 0x4e ||
      src[iendOffset + 7] !== 0x44
    ) {
      return pngBlob;
    }

    const b64Payload = encodeUtf8Base64(JSON.stringify(project));
    const keyBytes = new TextEncoder().encode(PNG_META_KEYWORD);
    const valBytes = new TextEncoder().encode(b64Payload);
    const dataLen = keyBytes.length + 1 + valBytes.length;

    const chunk = new Uint8Array(12 + dataLen);
    const view = new DataView(chunk.buffer);
    view.setUint32(0, dataLen, false);
    // Type: tEXt
    chunk[4] = 0x74;
    chunk[5] = 0x45;
    chunk[6] = 0x58;
    chunk[7] = 0x74;
    chunk.set(keyBytes, 8);
    chunk[8 + keyBytes.length] = 0x00;
    chunk.set(valBytes, 9 + keyBytes.length);

    const crcVal = crc32(chunk.subarray(4, 8 + dataLen));
    view.setUint32(8 + dataLen, crcVal, false);

    const out = new Uint8Array(src.length + chunk.length);
    out.set(src.subarray(0, iendOffset), 0);
    out.set(chunk, iendOffset);
    out.set(src.subarray(iendOffset), iendOffset + chunk.length);

    return new Blob([out], { type: 'image/png' });
  } catch {
    return pngBlob;
  }
}

/**
 * Extracts embedded MoonArt layered project metadata from a PNG file if present.
 */
export async function extractMoonArtProjectFromPngFile(
  file: File
): Promise<MoonArtProjectFile | null> {
  try {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (
      bytes.length < 24 ||
      bytes[0] !== 0x89 ||
      bytes[1] !== 0x50 ||
      bytes[2] !== 0x4e ||
      bytes[3] !== 0x47
    ) {
      return null;
    }

    const view = new DataView(buffer);
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset, false);
      const type = String.fromCharCode(
        bytes[offset + 4],
        bytes[offset + 5],
        bytes[offset + 6],
        bytes[offset + 7]
      );
      const dataStart = offset + 8;
      const dataEnd = dataStart + length;
      if (dataEnd + 4 > bytes.length) break;

      if (type === 'tEXt') {
        const chunkData = bytes.subarray(dataStart, dataEnd);
        const nullIdx = chunkData.indexOf(0);
        if (nullIdx > 0) {
          const keyword = new TextDecoder('ascii').decode(chunkData.subarray(0, nullIdx));
          if (keyword === PNG_META_KEYWORD) {
            const b64 = new TextDecoder('ascii').decode(chunkData.subarray(nullIdx + 1));
            const jsonText = decodeUtf8Base64(b64);
            const parsed = JSON.parse(jsonText);
            return normalizeMoonArtProject(parsed);
          }
        }
      }

      if (type === 'IEND') break;
      offset = dataEnd + 4;
    }
    return null;
  } catch {
    return null;
  }
}
