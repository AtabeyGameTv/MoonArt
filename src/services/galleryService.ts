import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';

export const SHARE_DURATION_MS = 24 * 60 * 60 * 1000;
const MAX_IMAGE_DATA_URL_LENGTH = 740_000;
const MAX_TITLE_LENGTH = 80;
const MAX_AUTHOR_NAME_LENGTH = 80;
const MAX_PHOTO_URL_LENGTH = 512;

export interface UserArtworkItem {
  id: string;
  ownerId: string;
  title: string;
  imageDataUrl: string;
  width: number;
  height: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface SharedArtworkItem {
  id: string;
  ownerId: string;
  authorName: string;
  authorPhotoUrl: string;
  sourceArtworkId: string;
  title: string;
  imageDataUrl: string;
  width: number;
  height: number;
  heartCount: number;
  editRevision: number;
  sharedAtMs: number;
  updatedAtMs: number;
  expiresAtMs: number;
}

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_\-]/g, '-').slice(0, 128);
  return cleaned.length > 0 ? cleaned : crypto.randomUUID();
}

export function sanitizeArtworkTitle(raw: string): string {
  const trimmed = raw.trim().slice(0, MAX_TITLE_LENGTH);
  return trimmed.length > 0 ? trimmed : 'MoonArt Artwork';
}

function sanitizeAuthorName(user: User): string {
  const raw = (user.displayName || user.email?.split('@')[0] || 'MoonArt Artist').trim();
  const clipped = raw.slice(0, MAX_AUTHOR_NAME_LENGTH);
  return clipped.length > 0 ? clipped : 'MoonArt Artist';
}

function sanitizePhotoUrl(user: User): string {
  const url = (user.photoURL || '').trim();
  return url.length <= MAX_PHOTO_URL_LENGTH ? url : '';
}

function timestampToMs(ts: unknown): number {
  if (ts instanceof Timestamp) return ts.toMillis();
  if (ts && typeof (ts as { toMillis?: () => number }).toMillis === 'function') {
    return (ts as { toMillis: () => number }).toMillis();
  }
  return Date.now();
}

/**
 * Compresses a rendered MoonArt canvas into a data URL strictly bounded below
 * Firestore's 1MB document ceiling and firebase-blueprint.json's 750KB string limit.
 */
export function encodeCanvasForFirestore(
  sourceCanvas: HTMLCanvasElement,
  docWidth: number,
  docHeight: number
): { imageDataUrl: string; width: number; height: number } {
  const safeW = Math.max(16, Math.min(8192, Math.round(docWidth || sourceCanvas.width || 800)));
  const safeH = Math.max(16, Math.min(8192, Math.round(docHeight || sourceCanvas.height || 600)));

  // 1. Try lossless PNG first if compact
  const pngUrl = sourceCanvas.toDataURL('image/png');
  if (pngUrl.length >= 22 && pngUrl.length <= MAX_IMAGE_DATA_URL_LENGTH) {
    return { imageDataUrl: pngUrl, width: safeW, height: safeH };
  }

  // 2. Try WebP at original dimensions (preserves transparency)
  for (const q of [0.9, 0.78, 0.65, 0.5]) {
    const webpUrl = sourceCanvas.toDataURL('image/webp', q);
    if (webpUrl.startsWith('data:image/webp') && webpUrl.length <= MAX_IMAGE_DATA_URL_LENGTH) {
      return { imageDataUrl: webpUrl, width: safeW, height: safeH };
    }
  }

  // 3. Proportionally downscale until strictly within blueprint bounds
  for (const maxDim of [1440, 1080, 820, 600, 420]) {
    const scale = Math.min(1, maxDim / Math.max(sourceCanvas.width, sourceCanvas.height));
    const tw = Math.max(16, Math.round(sourceCanvas.width * scale));
    const th = Math.max(16, Math.round(sourceCanvas.height * scale));
    const tmp = document.createElement('canvas');
    tmp.width = tw;
    tmp.height = th;
    const tctx = tmp.getContext('2d');
    if (tctx) {
      tctx.drawImage(sourceCanvas, 0, 0, tw, th);
      for (const q of [0.84, 0.7, 0.55]) {
        const wUrl = tmp.toDataURL('image/webp', q);
        if (wUrl.startsWith('data:image/webp') && wUrl.length <= MAX_IMAGE_DATA_URL_LENGTH) {
          return { imageDataUrl: wUrl, width: safeW, height: safeH };
        }
      }
      // JPEG fallback on dark ocean canvas if browser doesn't support WebP encoding
      tctx.globalCompositeOperation = 'destination-over';
      tctx.fillStyle = '#041524';
      tctx.fillRect(0, 0, tw, th);
      const jUrl = tmp.toDataURL('image/jpeg', 0.78);
      if (jUrl.length <= MAX_IMAGE_DATA_URL_LENGTH) {
        return { imageDataUrl: jUrl, width: safeW, height: safeH };
      }
    }
  }

  throw new Error('Artwork is too large to store in cloud gallery. Try smaller canvas dimensions.');
}

/* ==================== PERSONAL USER GALLERY ==================== */

export function subscribeUserArtworks(
  userId: string,
  onData: (items: UserArtworkItem[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = `users/${userId}/artworks`;
  const q = query(collection(db, path), orderBy('updatedAt', 'desc'), limit(80));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: UserArtworkItem[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ownerId: String(data.ownerId ?? userId),
          title: String(data.title ?? 'MoonArt Artwork'),
          imageDataUrl: String(data.imageDataUrl ?? ''),
          width: Number(data.width) || 800,
          height: Number(data.height) || 600,
          createdAtMs: timestampToMs(data.createdAt),
          updatedAtMs: timestampToMs(data.updatedAt),
        };
      });
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError) onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        else throw wrapped;
      }
    }
  );
}

export async function saveCanvasToUserGallery(params: {
  userId: string;
  artworkId?: string;
  title: string;
  renderedCanvas: HTMLCanvasElement;
  docWidth: number;
  docHeight: number;
}): Promise<string> {
  const cleanId = params.artworkId ? sanitizeId(params.artworkId) : crypto.randomUUID();
  const path = `users/${params.userId}/artworks/${cleanId}`;
  const { imageDataUrl, width, height } = encodeCanvasForFirestore(
    params.renderedCanvas,
    params.docWidth,
    params.docHeight
  );
  const cleanTitle = sanitizeArtworkTitle(params.title);

  try {
    const docRef = doc(db, path);
    if (params.artworkId) {
      await updateDoc(docRef, {
        title: cleanTitle,
        imageDataUrl,
        width,
        height,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(docRef, {
        ownerId: params.userId,
        title: cleanTitle,
        imageDataUrl,
        width,
        height,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return cleanId;
  } catch (error) {
    handleFirestoreError(error, params.artworkId ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function renameUserArtwork(
  userId: string,
  artworkId: string,
  newTitle: string
): Promise<void> {
  const path = `users/${userId}/artworks/${artworkId}`;
  try {
    await updateDoc(doc(db, path), {
      title: sanitizeArtworkTitle(newTitle),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteUserArtwork(userId: string, artworkId: string): Promise<void> {
  const path = `users/${userId}/artworks/${artworkId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/* ==================== PUBLIC 24-HOUR SHARED FEED ==================== */

export function subscribeSharedArtworks(
  onData: (items: SharedArtworkItem[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'sharedArtworks';
  const q = query(
    collection(db, path),
    where('expiresAt', '>', Timestamp.now()),
    orderBy('expiresAt', 'desc'),
    limit(60)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const now = Date.now();
      const items: SharedArtworkItem[] = snapshot.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ownerId: String(data.ownerId ?? ''),
            authorName: String(data.authorName ?? 'Artist'),
            authorPhotoUrl: String(data.authorPhotoUrl ?? ''),
            sourceArtworkId: String(data.sourceArtworkId ?? ''),
            title: String(data.title ?? 'MoonArt Artwork'),
            imageDataUrl: String(data.imageDataUrl ?? ''),
            width: Number(data.width) || 800,
            height: Number(data.height) || 600,
            heartCount: Number(data.heartCount) || 0,
            editRevision: Number(data.editRevision) || 0,
            sharedAtMs: timestampToMs(data.sharedAt),
            updatedAtMs: timestampToMs(data.updatedAt),
            expiresAtMs: timestampToMs(data.expiresAt),
          };
        })
        .filter((item) => item.expiresAtMs > now)
        .sort((a, b) => b.sharedAtMs - a.sharedAtMs);
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError) onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        else throw wrapped;
      }
    }
  );
}

export async function fetchLikedShareIdsForRevision(
  items: SharedArtworkItem[],
  userId: string
): Promise<Set<string>> {
  const liked = new Set<string>();
  await Promise.all(
    items.map(async (item) => {
      const likeId = `${userId}_${item.editRevision}`;
      const path = `sharedArtworks/${item.id}/likes/${likeId}`;
      try {
        const snap = await getDoc(doc(db, path));
        if (snap.exists()) {
          liked.add(item.id);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, path);
      }
    })
  );
  return liked;
}

export async function shareCanvasFor24Hours(params: {
  user: User;
  sourceArtworkId: string;
  title: string;
  renderedCanvas: HTMLCanvasElement;
  docWidth: number;
  docHeight: number;
}): Promise<string> {
  const { imageDataUrl, width, height } = encodeCanvasForFirestore(
    params.renderedCanvas,
    params.docWidth,
    params.docHeight
  );
  return shareEncodedArtworkFor24Hours({
    user: params.user,
    sourceArtworkId: params.sourceArtworkId,
    title: params.title,
    imageDataUrl,
    width,
    height,
  });
}

export async function shareEncodedArtworkFor24Hours(params: {
  user: User;
  sourceArtworkId: string;
  title: string;
  imageDataUrl: string;
  width: number;
  height: number;
}): Promise<string> {
  if (params.imageDataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) {
    throw new Error('Artwork payload exceeds maximum 740KB cloud limit.');
  }
  const shareId = crypto.randomUUID();
  const path = `sharedArtworks/${shareId}`;
  const expiresAt = Timestamp.fromMillis(Date.now() + SHARE_DURATION_MS);

  try {
    await setDoc(doc(db, path), {
      ownerId: params.user.uid,
      authorName: sanitizeAuthorName(params.user),
      authorPhotoUrl: sanitizePhotoUrl(params.user),
      sourceArtworkId: sanitizeId(params.sourceArtworkId),
      title: sanitizeArtworkTitle(params.title),
      imageDataUrl: params.imageDataUrl,
      width: Math.max(16, Math.min(8192, Math.round(params.width))),
      height: Math.max(16, Math.min(8192, Math.round(params.height))),
      heartCount: 0,
      editRevision: 0,
      sharedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      expiresAt,
    });
    return shareId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

/**
 * Updates a shared artwork's title and/or image AND resets collected heartCount back to 0
 * while incrementing editRevision by 1 (enforced by Firestore rules).
 */
export async function editSharedArtworkAndResetHearts(params: {
  shareId: string;
  currentEditRevision: number;
  title: string;
  renderedCanvas?: HTMLCanvasElement;
  fallbackImageDataUrl: string;
  width: number;
  height: number;
}): Promise<void> {
  const path = `sharedArtworks/${params.shareId}`;
  let imageDataUrl = params.fallbackImageDataUrl;
  let width = Math.max(16, Math.min(8192, Math.round(params.width)));
  let height = Math.max(16, Math.min(8192, Math.round(params.height)));

  if (params.renderedCanvas) {
    const encoded = encodeCanvasForFirestore(params.renderedCanvas, params.width, params.height);
    imageDataUrl = encoded.imageDataUrl;
    width = encoded.width;
    height = encoded.height;
  }

  try {
    await updateDoc(doc(db, path), {
      title: sanitizeArtworkTitle(params.title),
      imageDataUrl,
      width,
      height,
      updatedAt: serverTimestamp(),
      heartCount: 0,
      editRevision: params.currentEditRevision + 1,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteSharedArtwork(shareId: string): Promise<void> {
  const path = `sharedArtworks/${shareId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function toggleSharedArtworkHeart(params: {
  artwork: SharedArtworkItem;
  userId: string;
  currentlyLiked: boolean;
}): Promise<void> {
  const { artwork, userId, currentlyLiked } = params;
  const likeId = `${userId}_${artwork.editRevision}`;
  const sharePath = `sharedArtworks/${artwork.id}`;
  const likePath = `${sharePath}/likes/${likeId}`;
  const shareRef = doc(db, sharePath);
  const likeRef = doc(db, likePath);

  try {
    const batch = writeBatch(db);
    if (currentlyLiked) {
      batch.delete(likeRef);
      batch.update(shareRef, { heartCount: increment(-1) });
    } else {
      batch.set(likeRef, {
        userId,
        artworkId: artwork.id,
        editRevision: artwork.editRevision,
        createdAt: serverTimestamp(),
      });
      batch.update(shareRef, { heartCount: increment(1) });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, likePath);
  }
}
