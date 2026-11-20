import React, { useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import {
  Check,
  Clock,
  Edit3,
  ExternalLink,
  Globe,
  Heart,
  ImagePlus,
  Lock,
  LogIn,
  LogOut,
  Paintbrush,
  RefreshCw,
  Save,
  Share2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { SharedArtworkItem, UserArtworkItem } from '../services/galleryService';

interface GalleryModalProps {
  open: boolean;
  initialTab?: 'personal' | 'shared';
  user: User | null;
  authLoading: boolean;
  hasDocument: boolean;
  currentDocName: string;
  activeGalleryArtworkId: string | null;
  userArtworks: UserArtworkItem[];
  sharedArtworks: SharedArtworkItem[];
  likedShareIds: Set<string>;
  onClose: () => void;
  onSignInGoogle: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onSaveCurrentToGallery: (title: string, overwriteId?: string) => Promise<void>;
  onShareCurrentCanvas24h: (title: string) => Promise<void>;
  onOpenUserArtworkInCanvas: (item: UserArtworkItem) => void;
  onShareUserArtwork24h: (item: UserArtworkItem) => Promise<void>;
  onRenameUserArtwork: (artworkId: string, newTitle: string) => Promise<void>;
  onDeleteUserArtwork: (artworkId: string) => Promise<void>;
  onToggleHeart: (item: SharedArtworkItem) => Promise<void>;
  onEditSharedTitleOrCanvas: (
    item: SharedArtworkItem,
    newTitle: string,
    useCurrentCanvas: boolean
  ) => Promise<void>;
  onOpenSharedInCanvasToEdit: (item: SharedArtworkItem) => void;
  onOpenSharedCopyInCanvas: (item: SharedArtworkItem) => void;
  onDeleteSharedArtwork: (shareId: string) => Promise<void>;
}

function formatRemaining24h(expiresAtMs: number, nowMs: number): string {
  const diff = Math.max(0, expiresAtMs - nowMs);
  if (diff <= 0) return 'Expired';
  const totalMinutes = Math.floor(diff / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${mins}m left`;
  const secs = Math.floor((diff % 60000) / 1000);
  return `${mins}m ${secs}s left`;
}

function formatDateShort(ms: number): string {
  try {
    return new Date(ms).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export const GalleryModal: React.FC<GalleryModalProps> = ({
  open,
  initialTab = 'personal',
  user,
  authLoading,
  hasDocument,
  currentDocName,
  activeGalleryArtworkId,
  userArtworks,
  sharedArtworks,
  likedShareIds,
  onClose,
  onSignInGoogle,
  onSignOut,
  onSaveCurrentToGallery,
  onShareCurrentCanvas24h,
  onOpenUserArtworkInCanvas,
  onShareUserArtwork24h,
  onRenameUserArtwork,
  onDeleteUserArtwork,
  onToggleHeart,
  onEditSharedTitleOrCanvas,
  onOpenSharedInCanvasToEdit,
  onOpenSharedCopyInCanvas,
  onDeleteSharedArtwork,
}) => {
  const [tab, setTab] = useState<'personal' | 'shared'>(initialTab);
  const [saveTitle, setSaveTitle] = useState(currentDocName || 'Untitled Artwork');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [editingSharedId, setEditingSharedId] = useState<string | null>(null);
  const [editSharedTitle, setEditSharedTitle] = useState('');
  const [lightboxItem, setLightboxItem] = useState<{ title: string; imageDataUrl: string } | null>(
    null
  );
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setSaveTitle(currentDocName || 'Untitled Artwork');
      setConfirmDeleteId(null);
      setRenamingId(null);
      setEditingSharedId(null);
      setNowMs(Date.now());
    }
  }, [open, initialTab, currentDocName]);

  // Live countdown & automatic 24h expiration filter
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setNowMs(Date.now()), 5000);
    return () => clearInterval(timer);
  }, [open]);

  const activeShared = useMemo(
    () => sharedArtworks.filter((item) => item.expiresAtMs > nowMs),
    [sharedArtworks, nowMs]
  );

  if (!open) return null;

  const runBusy = async (key: string, fn: () => Promise<void>) => {
    setBusyId(key);
    try {
      await fn();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#020a12]/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl max-h-[90vh] bg-[#061826] border border-cyan-400/25 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#04111d] border-b border-cyan-400/15 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center text-cyan-300">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-display text-sm sm:text-base font-bold text-cyan-50">
                MoonArt Cloud Gallery & 24h Community Feed
              </h2>
              <p className="text-[11px] text-cyan-200/65">
                Şəxsi rəsmləriniz yalnız sizə görünür · Paylaşılan rəsmlər 24 saat aktiv qalır
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {user && (
              <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#092133] border border-cyan-400/20">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName ?? 'User'}
                    className="w-5 h-5 rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-cyan-500/25 text-cyan-200 text-[10px] font-bold flex items-center justify-center">
                    {(user.displayName || 'M')[0].toUpperCase()}
                  </div>
                )}
                <span className="text-xs text-cyan-100 font-medium max-w-[130px] truncate">
                  {user.displayName || 'Artist'}
                </span>
                <button
                  type="button"
                  onClick={() => void onSignOut()}
                  title="Sign Out"
                  className="p-1 rounded text-cyan-300/70 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-300 hover:text-cyan-100 hover:bg-[#0d2c42] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Auth Gate if Signed Out */}
        {!user ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-md w-full bg-[#071e2f] border border-cyan-400/25 rounded-2xl p-7 text-center space-y-5 shadow-xl">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center text-cyan-300">
                <Lock className="w-7 h-7" />
              </div>
              <div className="space-y-2">
                <h3 className="font-display text-lg font-bold text-cyan-50">
                  Şəxsi Qalereyanız üçün Google ilə Daxil Olun
                </h3>
                <p className="text-xs text-cyan-200/75 leading-relaxed">
                  Hər istifadəçi yalnız öz çəkdiyi rəsmləri görür və yeni hesabda sıfırdan şəxsi
                  qalereya açılır. Rəsmlərinizi saxlayın, 24 saatlıq lentdə paylaşın və digər
                  rəssamların işlərinə ürək göndərin.
                </p>
              </div>
              <button
                type="button"
                disabled={authLoading}
                onClick={() => void onSignInGoogle()}
                className="w-full py-3 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-[#03131f] font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60 shadow-lg"
              >
                <LogIn className="w-4 h-4" />
                <span>{authLoading ? 'Bağlanır...' : 'Google ilə Daxil Ol (Sign in)'}</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Navigation Tabs */}
            <div className="px-5 pt-3 bg-[#061826] border-b border-cyan-400/15 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTab('personal')}
                  className={`px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 flex items-center gap-2 transition-colors ${
                    tab === 'personal'
                      ? 'border-cyan-400 text-cyan-100 bg-[#092336]'
                      : 'border-transparent text-slate-300 hover:text-cyan-200'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Mənim Qalereyam ({userArtworks.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTab('shared')}
                  className={`px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 flex items-center gap-2 transition-colors ${
                    tab === 'shared'
                      ? 'border-cyan-400 text-cyan-100 bg-[#092336]'
                      : 'border-transparent text-slate-300 hover:text-cyan-200'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Paylaşılanlar · 24 Saat ({activeShared.length})</span>
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-[#051420]">
              {tab === 'personal' ? (
                <>
                  {/* Save / Share Current Canvas Action Bar */}
                  <div className="p-4 rounded-xl bg-[#071e2f] border border-cyan-400/20 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    {hasDocument ? (
                      <>
                        <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-2.5">
                          <label className="text-xs font-medium text-cyan-200 shrink-0">
                            Rəsmin adı:
                          </label>
                          <input
                            type="text"
                            maxLength={80}
                            value={saveTitle}
                            onChange={(e) => setSaveTitle(e.target.value)}
                            placeholder="Rəsmin adını daxil edin..."
                            className="flex-1 bg-[#04111d] border border-cyan-400/25 rounded-lg px-3 py-1.5 text-xs text-cyan-50 outline-none focus:border-cyan-400"
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {activeGalleryArtworkId && (
                            <button
                              type="button"
                              disabled={busyId !== null}
                              onClick={() =>
                                void runBusy('update-saved', () =>
                                  onSaveCurrentToGallery(saveTitle, activeGalleryArtworkId)
                                )
                              }
                              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>
                                {busyId === 'update-saved' ? 'Yenilənir...' : 'Mövcudu Yenilə'}
                              </span>
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busyId !== null}
                            onClick={() =>
                              void runBusy('save-new', () => onSaveCurrentToGallery(saveTitle))
                            }
                            className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-[#03131f] flex items-center gap-1.5 transition-colors disabled:opacity-50"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>
                              {busyId === 'save-new'
                                ? 'Saxlanır...'
                                : activeGalleryArtworkId
                                ? 'Yeni Kimi Saxla'
                                : 'Qalereyaya Saxla'}
                            </span>
                          </button>
                          <button
                            type="button"
                            disabled={busyId !== null}
                            onClick={() =>
                              void runBusy('share-canvas', () =>
                                onShareCurrentCanvas24h(saveTitle).then(() => setTab('shared'))
                              )
                            }
                            className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#0d4658] hover:bg-[#135d73] border border-cyan-400/30 text-cyan-100 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                          >
                            <Share2 className="w-3.5 h-3.5 text-cyan-300" />
                            <span>
                              {busyId === 'share-canvas' ? 'Paylaşılır...' : '24 Saat Paylaş'}
                            </span>
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center justify-between w-full gap-3">
                        <p className="text-xs text-cyan-200/75">
                          Qalereyaya yeni rəsm əlavə etmək üçün əvvəlcə Canvas açın və ya aşağıdakı
                          rəsmlərdən birini redaktəyə açın.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Personal Artworks Grid */}
                  {userArtworks.length === 0 ? (
                    <div className="py-16 text-center rounded-2xl border border-dashed border-cyan-400/20 bg-[#071b2a]/50 space-y-2">
                      <ImagePlus className="w-10 h-10 mx-auto text-cyan-400/50" />
                      <div className="text-sm font-semibold text-cyan-100">
                        Şəxsi Qalereyanız Boşdur
                      </div>
                      <p className="text-xs text-cyan-200/65 max-w-sm mx-auto">
                        Bu qalereya yalnız sizin hesabınıza məxsusdur. Çəkdiyiniz rəsmləri saxladıqca
                        burada görünəcək.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {userArtworks.map((item) => {
                        const isRenaming = renamingId === item.id;
                        const isConfirmingDel = confirmDeleteId === `user-${item.id}`;
                        return (
                          <div
                            key={item.id}
                            className="bg-[#071e2f] border border-cyan-400/20 rounded-xl overflow-hidden flex flex-col shadow-lg"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setLightboxItem({ title: item.title, imageDataUrl: item.imageDataUrl })
                              }
                              className="relative aspect-[4/3] w-full bg-[#030e17] canvas-checkerboard overflow-hidden group"
                            >
                              <img
                                src={item.imageDataUrl}
                                alt={item.title}
                                className="w-full h-full object-contain transition-transform duration-200 group-hover:scale-[1.02]"
                              />
                              <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-[#030e17]/80 text-[10px] font-mono-tabular text-cyan-200 border border-cyan-400/20">
                                {item.width}×{item.height}
                              </span>
                            </button>

                            <div className="p-3.5 space-y-3 flex-1 flex flex-col justify-between">
                              <div>
                                {isRenaming ? (
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="text"
                                      maxLength={80}
                                      value={renameValue}
                                      onChange={(e) => setRenameValue(e.target.value)}
                                      className="flex-1 bg-[#04111d] border border-cyan-400 rounded px-2 py-1 text-xs text-cyan-50 outline-none"
                                      autoFocus
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void runBusy(`rename-${item.id}`, async () => {
                                          await onRenameUserArtwork(item.id, renameValue);
                                          setRenamingId(null);
                                        })
                                      }
                                      className="p-1.5 rounded bg-cyan-500 text-[#03131f]"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setRenamingId(null)}
                                      className="p-1.5 rounded bg-[#0d2c42] text-slate-300"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-between gap-2">
                                    <h4 className="text-xs font-bold text-cyan-50 truncate">
                                      {item.title}
                                    </h4>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setRenamingId(item.id);
                                        setRenameValue(item.title);
                                      }}
                                      title="Adını dəyiş"
                                      className="p-1 rounded text-cyan-300/60 hover:text-cyan-200 hover:bg-[#0d2c42]"
                                    >
                                      <Edit3 className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}
                                <div className="text-[11px] text-cyan-200/55 mt-0.5">
                                  Yeniləndi: {formatDateShort(item.updatedAtMs)}
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-cyan-400/10">
                                <button
                                  type="button"
                                  onClick={() => onOpenUserArtworkInCanvas(item)}
                                  className="flex-1 py-1.5 px-2.5 rounded-lg text-[11px] font-semibold bg-cyan-500 hover:bg-cyan-400 text-[#03131f] flex items-center justify-center gap-1 transition-colors"
                                >
                                  <Paintbrush className="w-3 h-3" />
                                  <span>Canvas-da Aç</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={busyId !== null}
                                  onClick={() =>
                                    void runBusy(`share-${item.id}`, () =>
                                      onShareUserArtwork24h(item).then(() => setTab('shared'))
                                    )
                                  }
                                  className="py-1.5 px-2.5 rounded-lg text-[11px] font-semibold bg-[#0d4658] hover:bg-[#135d73] border border-cyan-400/25 text-cyan-100 flex items-center gap-1 transition-colors disabled:opacity-50"
                                >
                                  <Share2 className="w-3 h-3 text-cyan-300" />
                                  <span>{busyId === `share-${item.id}` ? '...' : '24s Paylaş'}</span>
                                </button>
                                {isConfirmingDel ? (
                                  <button
                                    type="button"
                                    disabled={busyId !== null}
                                    onClick={() =>
                                      void runBusy(`del-${item.id}`, async () => {
                                        await onDeleteUserArtwork(item.id);
                                        setConfirmDeleteId(null);
                                      })
                                    }
                                    className="py-1.5 px-2 rounded-lg text-[11px] font-semibold bg-rose-500 hover:bg-rose-400 text-white"
                                  >
                                    Təsdiq Sil
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(`user-${item.id}`)}
                                    title="Sil"
                                    className="p-1.5 rounded-lg bg-[#092133] hover:bg-rose-500/20 border border-cyan-400/15 hover:border-rose-400/40 text-slate-300 hover:text-rose-200 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Quick Share Current Canvas Banner */}
                  {hasDocument && (
                    <div className="p-3.5 rounded-xl bg-[#071e2f] border border-cyan-400/20 flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs text-cyan-100">
                        Hazırkı rəsminizi (<span className="font-semibold text-cyan-300">{currentDocName}</span>) bütün istifadəçilərlə 24 saatlıq paylaşın.
                      </div>
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() =>
                          void runBusy('share-feed-top', () =>
                            onShareCurrentCanvas24h(currentDocName || 'MoonArt Artwork')
                          )
                        }
                        className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-[#03131f] flex items-center gap-1.5 transition-colors disabled:opacity-50"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        <span>
                          {busyId === 'share-feed-top' ? 'Paylaşılır...' : 'İndi 24 Saat Paylaş'}
                        </span>
                      </button>
                    </div>
                  )}

                  {/* 24-Hour Public Shared Grid */}
                  {activeShared.length === 0 ? (
                    <div className="py-16 text-center rounded-2xl border border-dashed border-cyan-400/20 bg-[#071b2a]/50 space-y-2">
                      <Globe className="w-10 h-10 mx-auto text-cyan-400/50" />
                      <div className="text-sm font-semibold text-cyan-100">
                        Hazırda Aktiv 24 Saatlıq Paylaşım Yoxdur
                      </div>
                      <p className="text-xs text-cyan-200/65 max-w-sm mx-auto">
                        İlk rəsmi paylaşın! Paylaşılan rəsmlər 24 saat ərzində bütün istifadəçilərə
                        görünür və ürəklər toplaya bilər.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {activeShared.map((item) => {
                        const isMine = item.ownerId === user.uid;
                        const isLiked = likedShareIds.has(item.id);
                        const isEditing = editingSharedId === item.id;
                        const isConfirmingDel = confirmDeleteId === `shared-${item.id}`;

                        return (
                          <div
                            key={item.id}
                            className="bg-[#071e2f] border border-cyan-400/20 rounded-xl overflow-hidden flex flex-col shadow-lg"
                          >
                            {/* Author + 24h Countdown Header */}
                            <div className="px-3.5 py-2.5 bg-[#04111d]/80 border-b border-cyan-400/10 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                {item.authorPhotoUrl ? (
                                  <img
                                    src={item.authorPhotoUrl}
                                    alt={item.authorName}
                                    className="w-6 h-6 rounded-full object-cover shrink-0"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <div className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-200 text-[11px] font-bold flex items-center justify-center shrink-0">
                                    {item.authorName[0]?.toUpperCase() || 'A'}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold text-cyan-50 truncate">
                                    {item.authorName}
                                    {isMine && (
                                      <span className="ml-1.5 text-[10px] text-cyan-300 font-normal">
                                        (Sən)
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-400/25 text-[10px] font-mono-tabular text-cyan-200 shrink-0">
                                <Clock className="w-3 h-3 text-cyan-300" />
                                <span>{formatRemaining24h(item.expiresAtMs, nowMs)}</span>
                              </div>
                            </div>

                            {/* Artwork Image */}
                            <button
                              type="button"
                              onClick={() =>
                                setLightboxItem({ title: item.title, imageDataUrl: item.imageDataUrl })
                              }
                              className="relative aspect-[4/3] w-full bg-[#030e17] canvas-checkerboard overflow-hidden group"
                            >
                              <img
                                src={item.imageDataUrl}
                                alt={item.title}
                                className="w-full h-full object-contain transition-transform duration-200 group-hover:scale-[1.02]"
                              />
                              {item.editRevision > 0 && (
                                <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/35 text-[10px] text-amber-200">
                                  Redaktə #{item.editRevision}
                                </span>
                              )}
                            </button>

                            {/* Card Body */}
                            <div className="p-3.5 space-y-3 flex-1 flex flex-col justify-between">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <h4 className="text-xs font-bold text-cyan-50 truncate">
                                    {item.title}
                                  </h4>
                                  <div className="text-[11px] text-cyan-200/55 mt-0.5">
                                    {item.width}×{item.height} px · {formatDateShort(item.updatedAtMs)}
                                  </div>
                                </div>

                                {/* Real Heart Button */}
                                <button
                                  type="button"
                                  disabled={busyId === `heart-${item.id}`}
                                  onClick={() =>
                                    void runBusy(`heart-${item.id}`, () => onToggleHeart(item))
                                  }
                                  className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono-tabular font-semibold flex items-center gap-1.5 transition-all shrink-0 ${
                                    isLiked
                                      ? 'bg-rose-500/20 border-rose-400/50 text-rose-200'
                                      : 'bg-[#092133] border-cyan-400/20 text-slate-200 hover:border-rose-400/40 hover:text-rose-200'
                                  }`}
                                >
                                  <Heart
                                    className={`w-3.5 h-3.5 ${
                                      isLiked ? 'fill-rose-400 text-rose-400' : ''
                                    }`}
                                  />
                                  <span>{item.heartCount}</span>
                                </button>
                              </div>

                              {/* Inline Owner Edit Drawer */}
                              {isEditing && isMine && (
                                <div className="p-2.5 rounded-lg bg-[#04111d] border border-amber-400/35 space-y-2">
                                  <div className="text-[11px] text-amber-200 leading-snug">
                                    Düzəliş etdikdə bu rəsmin topladığı{' '}
                                    <span className="font-bold">{item.heartCount}</span> ürək{' '}
                                    <span className="font-bold">0-a sıfırlanacaq</span>.
                                  </div>
                                  <input
                                    type="text"
                                    maxLength={80}
                                    value={editSharedTitle}
                                    onChange={(e) => setEditSharedTitle(e.target.value)}
                                    className="w-full bg-[#071e2f] border border-cyan-400/25 rounded px-2.5 py-1.5 text-xs text-cyan-50 outline-none focus:border-cyan-400"
                                    placeholder="Yeni başlıq..."
                                  />
                                  <div className="flex flex-wrap gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => onOpenSharedInCanvasToEdit(item)}
                                      className="flex-1 py-1.5 px-2 rounded bg-cyan-500 hover:bg-cyan-400 text-[#03131f] text-[11px] font-semibold flex items-center justify-center gap-1"
                                    >
                                      <Paintbrush className="w-3 h-3" />
                                      <span>Canvas-da Düzəlt</span>
                                    </button>
                                    {hasDocument && (
                                      <button
                                        type="button"
                                        disabled={busyId !== null}
                                        onClick={() =>
                                          void runBusy(`save-edit-${item.id}`, async () => {
                                            await onEditSharedTitleOrCanvas(
                                              item,
                                              editSharedTitle,
                                              true
                                            );
                                            setEditingSharedId(null);
                                          })
                                        }
                                        className="py-1.5 px-2 rounded bg-emerald-500/25 hover:bg-emerald-500/35 border border-emerald-400/40 text-emerald-200 text-[11px] font-semibold"
                                      >
                                        Hazırkı Canvas-ı Qoy
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      disabled={busyId !== null}
                                      onClick={() =>
                                        void runBusy(`save-title-${item.id}`, async () => {
                                          await onEditSharedTitleOrCanvas(
                                            item,
                                            editSharedTitle,
                                            false
                                          );
                                          setEditingSharedId(null);
                                        })
                                      }
                                      className="py-1.5 px-2 rounded bg-[#0d4658] hover:bg-[#135d73] text-cyan-100 text-[11px] font-semibold"
                                    >
                                      Yadda Saxla
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingSharedId(null)}
                                      className="py-1.5 px-2 rounded bg-[#092133] text-slate-300 text-[11px]"
                                    >
                                      Ləğv et
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Bottom Actions */}
                              <div className="flex items-center gap-1.5 pt-1 border-t border-cyan-400/10">
                                <button
                                  type="button"
                                  onClick={() => onOpenSharedCopyInCanvas(item)}
                                  className="flex-1 py-1.5 px-2.5 rounded-lg text-[11px] font-medium bg-[#092133] hover:bg-[#0d4658] border border-cyan-400/20 text-cyan-100 flex items-center justify-center gap-1 transition-colors"
                                >
                                  <ExternalLink className="w-3 h-3 text-cyan-300" />
                                  <span>Kopyasını Aç</span>
                                </button>

                                {isMine && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingSharedId(isEditing ? null : item.id);
                                        setEditSharedTitle(item.title);
                                      }}
                                      className="py-1.5 px-2.5 rounded-lg text-[11px] font-semibold bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/35 text-amber-200 flex items-center gap-1 transition-colors"
                                    >
                                      <Edit3 className="w-3 h-3" />
                                      <span>Düzəliş</span>
                                    </button>

                                    {isConfirmingDel ? (
                                      <button
                                        type="button"
                                        disabled={busyId !== null}
                                        onClick={() =>
                                          void runBusy(`del-share-${item.id}`, async () => {
                                            await onDeleteSharedArtwork(item.id);
                                            setConfirmDeleteId(null);
                                          })
                                        }
                                        className="py-1.5 px-2 rounded-lg text-[11px] font-semibold bg-rose-500 hover:bg-rose-400 text-white"
                                      >
                                        Təsdiq Sil
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteId(`shared-${item.id}`)}
                                        title="Paylaşımı Sil"
                                        className="p-1.5 rounded-lg bg-[#092133] hover:bg-rose-500/20 border border-cyan-400/15 hover:border-rose-400/40 text-slate-300 hover:text-rose-200 transition-colors"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Fullscreen Lightbox Preview */}
      {lightboxItem && (
        <div
          className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-6"
          onClick={(e) => {
            e.stopPropagation();
            setLightboxItem(null);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-4xl max-h-[90vh] flex flex-col items-center gap-3"
          >
            <div className="flex items-center justify-between w-full text-cyan-50 text-sm font-semibold">
              <span>{lightboxItem.title}</span>
              <button
                type="button"
                onClick={() => setLightboxItem(null)}
                className="p-1.5 rounded-lg bg-[#071e2f] border border-cyan-400/25 text-cyan-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <img
              src={lightboxItem.imageDataUrl}
              alt={lightboxItem.title}
              className="max-w-full max-h-[80vh] object-contain rounded-xl border border-cyan-400/25 canvas-checkerboard"
            />
          </div>
        </div>
      )}
    </div>
  );
};
