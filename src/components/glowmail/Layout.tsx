import React, { useState, ReactNode, DragEvent, useCallback, useRef, useEffect } from 'react';
import { Menu, Search, Edit3, Settings, Inbox, Send, File, AlertCircle, Trash2, Briefcase, Plus, RefreshCw, X, Clock, BookUser, ChevronDown, ChevronRight, Mail, LogOut, FolderIcon, FileText } from 'lucide-react';
import { useMail } from '../../store';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { SettingsModal } from './SettingsModal';
import { t, translateFolderName } from '@/lib/i18n';

const iconMap: Record<string, any> = {
  inbox: Inbox,
  send: Send,
  clock: Clock,
  file: File,
  'file-text': FileText,
  'alert-circle': AlertCircle,
  'trash-2': Trash2,
  briefcase: Briefcase,
  folder: FolderIcon,
};

export function Layout({ children, onCompose }: { children: ReactNode; onCompose: (prefill?: { to?: string }) => void }) {
  const { folders, currentFolder, setCurrentFolder, searchQuery, setSearchQuery, settings, fetchEmails, statusBanner } = useMail();
  const lang = settings.language;
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [statusNow, setStatusNow] = useState(() => Date.now());
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('glowmail_sidebar_width');
    return saved ? Number(saved) : 256;
  });
  const isResizing = useRef(false);

  useEffect(() => {
    if (!statusBanner) return;
    const timer = window.setInterval(() => setStatusNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [statusBanner]);

  const elapsedSeconds = statusBanner
    ? Math.max(0, Math.floor((statusNow - statusBanner.startedAt) / 1000))
    : 0;

  const progressPercent = statusBanner?.progress?.total
    ? Math.min(100, Math.round((statusBanner.progress.loaded / statusBanner.progress.total) * 100))
    : undefined;

  const formatMegabytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return null;
    return `${(bytes / (1024 * 1024)).toFixed(bytes > 1024 * 1024 ? 2 : 3)} MB`;
  };

  const phaseLabelMap: Record<string, string> = {
    refresh: lang === 'ru' ? 'Обновление' : 'Refresh',
    folders: lang === 'ru' ? 'Папки' : 'Folders',
    cache: lang === 'ru' ? 'Кэш' : 'Cache',
    network: lang === 'ru' ? 'Сервер' : 'Server',
    sync: lang === 'ru' ? 'Индекс' : 'Index',
    error: lang === 'ru' ? 'Ошибка' : 'Error',
  };

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = Math.min(Math.max(ev.clientX, 180), 400);
      setSidebarWidth(newWidth);
    };
    const onMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      setSidebarWidth(w => { localStorage.setItem('glowmail_sidebar_width', String(w)); return w; });
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  return (
    <div className="flex h-screen w-full bg-glow-primary text-glow-text-primary overflow-hidden font-sans">
      {/* Ambient background glow */}
      <div className="ambient-glow" />

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm"
              onClick={() => setIsSidebarOpen(false)}
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
              className="fixed inset-y-0 left-0 w-72 bg-glow-sidebar border-r border-glow-border-subtle z-50 flex flex-col md:hidden"
            >
              <SidebarContent
                folders={folders}
                currentFolder={currentFolder}
                setCurrentFolder={(id) => {
                  setCurrentFolder(id);
                  setIsSidebarOpen(false);
                }}
                onCompose={() => {
                  onCompose();
                  setIsSidebarOpen(false);
                }}
                lang={lang}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar - resizable */}
      <aside 
        className="hidden md:flex bg-glow-sidebar border-r border-glow-border-subtle flex-col relative"
        style={{ width: sidebarWidth, minWidth: 180, maxWidth: 400 }}
      >
        {/* Ambient glow at top of sidebar */}
        <div className="absolute top-0 left-0 right-0 h-[120px] bg-gradient-to-b from-[rgba(108,138,255,0.04)] to-transparent pointer-events-none" />
        
        <SidebarContent
          folders={folders}
          currentFolder={currentFolder}
          setCurrentFolder={setCurrentFolder}
          onCompose={onCompose}
          lang={lang}
        />
        {/* Resize handle */}
        <div
          onMouseDown={handleMouseDown}
          className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize group z-20 hover:bg-glow-accent/30 active:bg-glow-accent/40 transition-colors"
        />
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        {/* Header */}
        <header className="h-16 border-b border-glow-border-default flex items-center px-4 gap-4 bg-glow-primary/80 backdrop-blur-md z-10 sticky top-0">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 -ml-2 rounded-full hover:bg-glow-surface md:hidden transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <button
            onClick={() => fetchEmails()}
            className="p-2 rounded-full hover:bg-glow-surface md:hidden transition-colors"
            title={lang === 'ru' ? 'Получить письма' : 'Get mail'}
          >
            <RefreshCw className="w-5 h-5 text-glow-text-secondary" />
          </button>
          
          <div className="flex-1 max-w-2xl relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-glow-text-muted group-focus-within:text-glow-accent transition-colors" />
            <input
              type="text"
              placeholder={t('layout.searchPlaceholder', lang)}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-glow-input border border-glow-border-default rounded-full pl-10 pr-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-glow-accent/50 focus:border-glow-accent/50 transition-all placeholder:text-glow-text-muted"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-glow-surface text-glow-text-muted hover:text-glow-text-primary transition-colors"
                title={lang === 'ru' ? 'Сбросить поиск' : 'Clear search'}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <button 
            onClick={() => setIsSettingsOpen(true)} 
            className="p-2 rounded-full hover:bg-glow-surface transition-colors" 
            title={lang === 'ru' ? 'Настройки' : 'Settings'}
          >
            <Settings className="w-5 h-5 text-glow-accent font-bold" />
          </button>
          <button
            onClick={() => {
              import('@/lib/credentials').then(({ clearCredentials }) => {
                clearCredentials().finally(() => {
                  window.location.reload();
                });
              });
            }}
            className="p-2 rounded-full hover:bg-glow-surface transition-colors"
            title={lang === 'ru' ? 'Выйти' : 'Log out'}
          >
            <LogOut className="w-5 h-5 text-glow-text-secondary" />
          </button>
        </header>

        {/* Status Banner */}
        {statusBanner && (
          <div className={cn(
            "border-b px-4 py-3 shrink-0 relative overflow-hidden",
            statusBanner.tone === 'error'
              ? "border-glow-error/25 bg-gradient-to-br from-[rgba(80,14,18,0.92)] to-[rgba(28,8,12,0.96)] text-red-100"
              : "border-glow-accent/15 bg-gradient-to-br from-[rgba(14,20,35,0.96)] via-[rgba(18,26,45,0.96)] to-[rgba(14,20,35,0.98)]"
          )}>
            <div className="absolute inset-0 opacity-70 pointer-events-none" style={{
              backgroundImage: statusBanner.tone === 'error'
                ? 'radial-gradient(circle at 12% 50%, rgba(240,72,72,0.16), transparent 28%), radial-gradient(circle at 88% 20%, rgba(240,72,72,0.12), transparent 24%)'
                : 'radial-gradient(circle at 12% 50%, rgba(61,217,160,0.16), transparent 28%), radial-gradient(circle at 88% 20%, rgba(108,138,255,0.14), transparent 24%), linear-gradient(90deg, rgba(255,255,255,0.04), transparent 35%, rgba(255,255,255,0.02))'
            }} />
            <div className="relative flex items-start gap-3">
              <div className={cn(
                "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border backdrop-blur-md",
                statusBanner.tone === 'error'
                  ? "border-glow-error/25 bg-glow-error/10 shadow-[0_0_20px_rgba(240,72,72,0.18)]"
                  : "border-glow-accent/15 bg-white/5 shadow-[0_0_24px_rgba(108,138,255,0.12)]"
              )}>
                <RefreshCw className={cn("w-4 h-4", statusBanner.tone !== 'error' && "animate-spin text-glow-accent")} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold tracking-[0.01em] text-glow-text-primary">{statusBanner.text}</span>
                  {statusBanner.phase && (
                    <span className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.22em]",
                      statusBanner.tone === 'error'
                        ? "border-glow-error/30 bg-glow-error/10 text-red-200"
                        : "border-glow-accent/15 bg-white/5 text-glow-accent"
                    )}>
                      {phaseLabelMap[statusBanner.phase] || statusBanner.phase}
                    </span>
                  )}
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.22em] text-glow-text-secondary">
                    {elapsedSeconds}s
                  </span>
                  {statusBanner.diagnostics?.source && (
                    <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-glow-text-muted">
                      {statusBanner.diagnostics.source}
                    </span>
                  )}
                </div>
                {statusBanner.detail && (
                  <p className={cn(
                    "mt-1 text-xs",
                    statusBanner.tone === 'error' ? "text-red-200/80" : "text-glow-text-secondary/85"
                  )}>
                    {statusBanner.detail}
                  </p>
                )}
                {(statusBanner.progress || statusBanner.diagnostics?.durationMs) && (
                  <div className="mt-2 space-y-2">
                    {typeof progressPercent === 'number' && (
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-500",
                            statusBanner.tone === 'error'
                              ? "bg-gradient-to-r from-red-400 to-red-500 shadow-[0_0_16px_rgba(240,72,72,0.35)]"
                              : "bg-gradient-to-r from-glow-success to-glow-accent shadow-[0_0_18px_rgba(61,217,160,0.24)]"
                          )}
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 text-[11px]">
                      {statusBanner.progress && (
                        <>
                          <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-glow-text-primary">
                            {lang === 'ru' ? 'Загружено' : 'Loaded'}: <strong>{statusBanner.progress.loaded}</strong>
                          </span>
                          {typeof statusBanner.progress.total === 'number' && (
                            <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-glow-text-primary">
                              {lang === 'ru' ? 'Всего' : 'Total'}: <strong>{statusBanner.progress.total}</strong>
                            </span>
                          )}
                          {typeof statusBanner.progress.remaining === 'number' && (
                            <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-glow-text-primary">
                              {lang === 'ru' ? 'Осталось' : 'Left'}: <strong>{statusBanner.progress.remaining}</strong>
                            </span>
                          )}
                          {formatMegabytes(statusBanner.progress.loadedBytes) && (
                            <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-glow-text-primary">
                              {lang === 'ru' ? 'Объём' : 'Volume'}: <strong>{formatMegabytes(statusBanner.progress.loadedBytes)}</strong>
                            </span>
                          )}
                        </>
                      )}
                      {typeof statusBanner.diagnostics?.durationMs === 'number' && (
                        <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-glow-text-primary">
                          {lang === 'ru' ? 'Сеть' : 'Network'}: <strong>{statusBanner.diagnostics.durationMs} ms</strong>
                        </span>
                      )}
                      {statusBanner.diagnostics?.step && (
                        <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-glow-text-muted">
                          {statusBanner.diagnostics.step}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-hidden relative">
          {children}
        </div>

        {/* Floating Action Button (Mobile) */}
        <button
          onClick={() => onCompose()}
          className="md:hidden absolute bottom-6 right-6 w-14 h-14 bg-glow-accent rounded-full flex items-center justify-center text-white shadow-glow-button hover:shadow-glow-button-hover hover:scale-105 transition-all active:scale-95 z-30"
        >
          <Edit3 className="w-6 h-6" />
        </button>

        {/* Settings Modal */}
        <AnimatePresence>
          {isSettingsOpen && <SettingsModal onClose={() => setIsSettingsOpen(false)} />}
        </AnimatePresence>
      </main>
    </div>
  );
}

function SidebarContent({
  folders,
  currentFolder,
  setCurrentFolder,
  onCompose,
  lang,
}: {
  folders: any[];
  currentFolder: string;
  setCurrentFolder: (id: string) => void;
  onCompose?: (prefill?: { to?: string }) => void;
  lang: 'en' | 'ru';
}) {
  const { fetchEmails, addFolder, emails, contacts, addContact, moveEmailToFolder, settings: mailSettings, totalEmails } = useMail();
  const folderColors = mailSettings.folderColors || {};
  const [isFetching, setIsFetching] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({ INBOX: true });
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showAddressBook, setShowAddressBook] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);

  const handleFolderDragOver = (e: DragEvent, folderId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverFolder(folderId);
  };

  const handleFolderDragLeave = () => {
    setDragOverFolder(null);
  };

  const handleFolderDrop = (e: DragEvent, folderId: string) => {
    e.preventDefault();
    setDragOverFolder(null);
    const emailId = e.dataTransfer.getData('text/email-id');
    if (emailId && folderId !== currentFolder) {
      moveEmailToFolder(emailId, folderId);
    }
  };

  const getFolderCount = (folderId: string) => {
    const folderEmails = emails.filter(e => e.folderId === folderId);
    if (folderId === 'inbox' || folderId === 'spam') {
      return folderEmails.filter(e => !e.read).length;
    }
    return folderEmails.length;
  };

  const handleFetch = async () => {
    setIsFetching(true);
    await fetchEmails();
    setIsFetching(false);
  };

  const handleAddFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (newFolderName.trim()) {
      addFolder(newFolderName.trim());
      setNewFolderName('');
      setShowNewFolderModal(false);
    }
  };

  return (
    <>
      <div className="p-4 h-16 flex items-center border-b border-glow-border-subtle shrink-0">
        <h1 className="text-xl font-bold text-gradient-glow tracking-tight">
          {t('app.title', lang)}
        </h1>
      </div>
      
      {onCompose && (
        <div className="px-4 py-4 shrink-0 hidden md:flex flex-col gap-2">
          <button
            onClick={handleFetch}
            disabled={isFetching}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-glow-surface hover:bg-glow-elevated text-glow-text-secondary rounded-xl font-medium text-sm border border-glow-border-default transition-all disabled:opacity-50"
          >
            <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin text-glow-accent")} />
            {t('layout.getMail', lang)}
          </button>
          <button
            onClick={() => onCompose?.()}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-glow-accent text-white rounded-xl font-bold text-sm shadow-glow-button hover:shadow-glow-button-hover hover:-translate-y-0.5 transition-all"
          >
            <Edit3 className="w-4 h-4" />
            {t('layout.compose', lang)}
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-2 px-3 space-y-1">
        {/* Total email counter */}
        <div className="px-3 py-2 mb-1 flex items-center gap-2">
          <Mail className="w-3.5 h-3.5 text-glow-accent" />
          <span className="text-xs font-extrabold text-glow-accent tracking-wide">
            {totalEmails || emails.length} {lang === 'ru' ? 'писем' : 'emails'}
          </span>
        </div>
        
        <div className="flex items-center justify-between px-3 mt-1 mb-2">
          <span className="text-xs font-semibold text-glow-text-muted uppercase tracking-wider">{t('layout.folders', lang)}</span>
          <button 
            onClick={() => setShowNewFolderModal(true)} 
            className="p-1 hover:bg-glow-surface rounded text-glow-text-secondary hover:text-glow-text-primary transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        
        {folders.map((folder) => {
          const Icon = iconMap[folder.icon] || FolderIcon;
          const isActive = currentFolder === folder.id;
          const count = getFolderCount(folder.id);
          const hasChildren = folder.children && folder.children.length > 0;
          const isExpanded = expandedFolders[folder.id] ?? false;
          
          return (
            <div key={folder.id}>
              <div
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-glow-accent-muted text-glow-accent font-bold"
                    : "text-glow-text-secondary hover:bg-glow-surface hover:text-glow-text-primary",
                  dragOverFolder === folder.id && "ring-2 ring-glow-accent/50 bg-glow-accent/10"
                )}
              >
                {hasChildren && (
                  <span
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedFolders(prev => ({ ...prev, [folder.id]: !isExpanded }));
                    }}
                    className="p-0.5 -ml-1 hover:bg-glow-surface rounded transition-colors cursor-pointer"
                  >
                    {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  </span>
                )}
                <button
                  onClick={() => setCurrentFolder(folder.id)}
                  onDragOver={(e) => handleFolderDragOver(e, folder.id)}
                  onDragLeave={handleFolderDragLeave}
                  onDrop={(e) => handleFolderDrop(e, folder.id)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                >
                  <Icon className={cn("w-4 h-4", isActive ? "text-glow-accent" : "text-glow-text-muted")} />
                  <span className="flex-1 text-left">{translateFolderName(folder.id, folder.name, lang)}</span>
                  {count > 0 && (
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-xs font-extrabold",
                      isActive 
                        ? "bg-glow-accent/20 text-glow-accent shadow-[0_0_8px_rgba(108,138,255,0.3)]" 
                        : "bg-glow-surface text-glow-text-secondary"
                    )}>
                      {count}
                    </span>
                  )}
                </button>
              </div>
              
              {hasChildren && isExpanded && (
                <div className="ml-4 mt-0.5 space-y-0.5 border-l border-glow-border-subtle pl-2">
                  {folder.children!.map((child: any) => {
                    const ChildIcon = iconMap[child.icon] || FolderIcon;
                    const isChildActive = currentFolder === child.id;
                    const childCount = getFolderCount(child.id);
                    const childColor = folderColors[child.id];
                    
                    return (
                      <button
                        key={child.id}
                        onClick={() => setCurrentFolder(child.id)}
                        onDragOver={(e) => handleFolderDragOver(e, child.id)}
                        onDragLeave={handleFolderDragLeave}
                        onDrop={(e) => handleFolderDrop(e, child.id)}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200",
                          isChildActive
                            ? "bg-glow-accent/10 text-glow-accent"
                            : "text-glow-text-muted hover:bg-glow-surface hover:text-glow-text-secondary",
                          dragOverFolder === child.id && "ring-2 ring-glow-accent/50 bg-glow-accent/10"
                        )}
                      >
                        <ChildIcon className="w-3.5 h-3.5" style={childColor ? { color: childColor } : undefined} />
                        <span className="flex-1 text-left truncate" style={childColor && !isChildActive ? { color: childColor } : undefined}>
                          {translateFolderName(child.id, child.name, lang)}
                        </span>
                        {childCount > 0 && (
                          <span className={cn(
                            "px-1.5 py-0.5 rounded-full text-[10px] font-bold",
                            isChildActive ? "bg-glow-accent/20 text-glow-accent" : "bg-glow-surface text-glow-text-muted"
                          )}>
                            {childCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Address Book */}
      <div className="px-3 py-2 border-t border-glow-border-subtle">
        <button
          onClick={() => setShowAddressBook(!showAddressBook)}
          className="flex items-center gap-2 w-full px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors text-glow-accent/70 hover:text-glow-accent"
        >
          <BookUser className="w-3.5 h-3.5" />
          <span className="flex-1 text-left">{t('layout.addressBook', lang)}</span>
          {showAddressBook ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
        {showAddressBook && (
          <div className="mt-1 space-y-1 max-h-40 overflow-y-auto">
            {contacts.length === 0 && (
              <p className="px-3 py-2 text-xs text-glow-text-muted">{t('layout.noContacts', lang)}</p>
            )}
            {contacts.map(c => (
              <div key={c.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-glow-surface transition-colors group/contact">
                <div className="w-6 h-6 rounded-full bg-glow-surface flex items-center justify-center text-[10px] font-bold text-glow-text-muted shrink-0">
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-glow-text-secondary truncate">{c.name}</div>
                  <div className="text-[10px] text-glow-text-muted truncate">{c.email}</div>
                </div>
                <button
                  onClick={() => onCompose?.({ to: c.email })}
                  className="p-1 rounded hover:bg-glow-surface text-glow-text-muted hover:text-glow-accent transition-colors opacity-0 group-hover/contact:opacity-100"
                  title={lang === 'ru' ? 'Написать письмо' : 'Compose email'}
                >
                  <Mail className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <button
              onClick={() => setShowAddContact(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-glow-text-muted hover:text-glow-accent transition-colors w-full"
            >
              <Plus className="w-3 h-3" /> {t('layout.addContact', lang)}
            </button>
          </div>
        )}
      </div>

      {/* Add Contact Modal */}
      <AnimatePresence>
        {showAddContact && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm bg-glow-elevated border border-glow-border-default rounded-2xl shadow-glow-modal overflow-hidden"
            >
              <div className="p-4 border-b border-glow-border-subtle flex items-center justify-between">
                <h2 className="text-lg font-semibold text-glow-text-primary">{t('layout.addContact', lang)}</h2>
                <button 
                  onClick={() => setShowAddContact(false)} 
                  className="p-2 hover:bg-glow-surface rounded-full text-glow-text-secondary hover:text-glow-text-primary transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={(e) => {
                e.preventDefault();
                if (newContactName.trim() && newContactEmail.trim()) {
                  addContact({ id: `c${Date.now()}`, name: newContactName.trim(), email: newContactEmail.trim() });
                  setNewContactName('');
                  setNewContactEmail('');
                  setShowAddContact(false);
                }
              }} className="p-4 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-glow-text-secondary mb-1">{t('layout.contactName', lang)}</label>
                  <input 
                    type="text" 
                    value={newContactName} 
                    onChange={e => setNewContactName(e.target.value)}
                    className="w-full bg-glow-deep border border-glow-border-default rounded-xl px-4 py-2.5 text-glow-text-primary focus:outline-none focus:border-glow-accent/50 focus:ring-1 focus:ring-glow-accent/50 transition-all input-glow"
                    autoFocus 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-glow-text-secondary mb-1">{t('layout.contactEmail', lang)}</label>
                  <input 
                    type="email" 
                    value={newContactEmail} 
                    onChange={e => setNewContactEmail(e.target.value)}
                    className="w-full bg-glow-deep border border-glow-border-default rounded-xl px-4 py-2.5 text-glow-text-primary focus:outline-none focus:border-glow-accent/50 focus:ring-1 focus:ring-glow-accent/50 transition-all input-glow" 
                  />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button 
                    type="button" 
                    onClick={() => setShowAddContact(false)} 
                    className="px-4 py-2 text-sm font-medium text-glow-text-secondary hover:text-glow-text-primary transition-colors"
                  >
                    {t('layout.cancel', lang)}
                  </button>
                  <button 
                    type="submit" 
                    disabled={!newContactName.trim() || !newContactEmail.trim()}
                    className="px-4 py-2 bg-glow-accent hover:bg-glow-accent-secondary text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t('layout.create', lang)}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* New Folder Modal */}
      <AnimatePresence>
        {showNewFolderModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm bg-glow-elevated border border-glow-border-default rounded-2xl shadow-glow-modal overflow-hidden"
            >
              <div className="p-4 border-b border-glow-border-subtle flex items-center justify-between">
                <h2 className="text-lg font-semibold text-glow-text-primary">{t('layout.createFolder', lang)}</h2>
                <button
                  onClick={() => setShowNewFolderModal(false)}
                  className="p-2 hover:bg-glow-surface rounded-full text-glow-text-secondary hover:text-glow-text-primary transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleAddFolder} className="p-4">
                <div className="mb-4">
                  <label className="block text-sm font-medium text-glow-text-secondary mb-1.5">{t('layout.folderName', lang)}</label>
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    className="w-full bg-glow-deep border border-glow-border-default rounded-xl px-4 py-2.5 text-glow-text-primary focus:outline-none focus:border-glow-accent/50 focus:ring-1 focus:ring-glow-accent/50 transition-all input-glow"
                    placeholder={t('layout.folderPlaceholder', lang)}
                    autoFocus
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowNewFolderModal(false)}
                    className="px-4 py-2 text-sm font-medium text-glow-text-secondary hover:text-glow-text-primary transition-colors"
                  >
                    {t('layout.cancel', lang)}
                  </button>
                  <button
                    type="submit"
                    disabled={!newFolderName.trim()}
                    className="px-4 py-2 bg-glow-accent hover:bg-glow-accent-secondary text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t('layout.create', lang)}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
