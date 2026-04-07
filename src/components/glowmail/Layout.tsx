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
    return saved ? Number(saved) : 300;
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
      const newWidth = Math.min(Math.max(ev.clientX, 200), 420);
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
              className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
              onClick={() => setIsSidebarOpen(false)}
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
              className="fixed inset-y-0 left-0 w-72 z-50 flex flex-col md:hidden"
              style={{ background: 'linear-gradient(180deg, #071B1A 0%, #0B2321 40%, #12312D 100%)' }}
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

      {/* Desktop Sidebar - dark emerald glass */}
      <aside 
        className="hidden md:flex flex-col relative overflow-hidden"
        style={{ 
          width: sidebarWidth, 
          minWidth: 200, 
          maxWidth: 420,
          background: 'linear-gradient(180deg, #071B1A 0%, #0B2321 40%, #12312D 100%)',
        }}
      >
        {/* Emerald glow at top of sidebar */}
        <div className="absolute top-0 left-0 right-0 h-[140px] pointer-events-none" style={{
          background: 'radial-gradient(ellipse at 50% 0%, rgba(31, 216, 160, 0.14) 0%, transparent 70%)'
        }} />
        {/* Depth shadow at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-[100px] pointer-events-none" style={{
          background: 'linear-gradient(0deg, rgba(0,0,0,0.18), transparent)'
        }} />
        
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
          className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize group z-20 hover:bg-[#1ED7A7]/20 active:bg-[#1ED7A7]/30 transition-colors"
        />
      </aside>

      {/* Main Content - light workspace */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        {/* Header - clean, light */}
        <header className="h-16 border-b border-[#E2ECE8] flex items-center px-5 gap-4 z-10 sticky top-0" style={{
          background: 'rgba(255,255,255,0.72)',
          backdropFilter: 'blur(10px)',
        }}>
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 -ml-2 rounded-full hover:bg-[#EDF7F3] md:hidden transition-colors"
          >
            <Menu className="w-5 h-5 text-[#5F7773]" />
          </button>
          <button
            onClick={() => fetchEmails()}
            className="p-2 rounded-full hover:bg-[#EDF7F3] md:hidden transition-colors"
            title={lang === 'ru' ? 'Получить письма' : 'Get mail'}
          >
            <RefreshCw className="w-5 h-5 text-[#708784]" />
          </button>
          
          {/* Search bar - large, soft, 20px radius */}
          <div className="flex-1 max-w-2xl relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#7AA49C] group-focus-within:text-[#10B98A] transition-colors" />
            <input
              type="text"
              placeholder={t('layout.searchPlaceholder', lang)}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#FBFDFC] border border-[#E2ECE8] rounded-[20px] pl-11 pr-10 py-3 text-sm text-[#243432] focus:outline-none focus:border-[rgba(22,201,150,0.55)] focus:ring-4 focus:ring-[rgba(22,201,150,0.10)] focus:bg-white transition-all placeholder:text-[#A1B1AF]"
              style={{ height: 52 }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-[#EDF7F3] text-[#A3B3B1] hover:text-[#455857] transition-colors"
                title={lang === 'ru' ? 'Сбросить поиск' : 'Clear search'}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Utility icons */}
          <button 
            onClick={() => setIsSettingsOpen(true)} 
            className="p-2.5 rounded-xl hover:bg-[#EDF7F3] transition-colors" 
            title={lang === 'ru' ? 'Настройки' : 'Settings'}
          >
            <Settings className="w-5 h-5 text-[#10B98A]" />
          </button>
          <button
            onClick={() => {
              import('@/lib/credentials').then(({ clearCredentials }) => {
                clearCredentials().finally(() => {
                  window.location.reload();
                });
              });
            }}
            className="p-2.5 rounded-xl hover:bg-[#EDF7F3] transition-colors"
            title={lang === 'ru' ? 'Выйти' : 'Log out'}
          >
            <LogOut className="w-5 h-5 text-[#708784]" />
          </button>
        </header>

        {/* Status Banner */}
        {statusBanner && (
          <div className={cn(
            "border-b px-5 py-3 shrink-0 relative overflow-hidden",
            statusBanner.tone === 'error'
              ? "border-[rgba(217,92,92,0.25)] bg-[#FCE8E8] text-[#8B2C2C]"
              : "border-[rgba(22,201,150,0.12)] bg-gradient-to-br from-[rgba(247,251,250,0.98)] via-[rgba(237,247,243,0.98)] to-[rgba(247,251,250,0.98)]"
          )}>
            <div className="relative flex items-start gap-3">
              <div className={cn(
                "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border",
                statusBanner.tone === 'error'
                  ? "border-[rgba(217,92,92,0.3)] bg-[rgba(217,92,92,0.1)]"
                  : "border-[rgba(22,201,150,0.2)] bg-[rgba(22,201,150,0.08)]"
              )}>
                <RefreshCw className={cn("w-4 h-4", statusBanner.tone !== 'error' && "animate-spin text-[#11C89A]")} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-[#1E2A29]">{statusBanner.text}</span>
                  {statusBanner.phase && (
                    <span className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.22em]",
                      statusBanner.tone === 'error'
                        ? "border-[rgba(217,92,92,0.3)] bg-[rgba(217,92,92,0.08)] text-[#8B2C2C]"
                        : "border-[rgba(22,201,150,0.2)] bg-[rgba(22,201,150,0.06)] text-[#0D8F69]"
                    )}>
                      {phaseLabelMap[statusBanner.phase] || statusBanner.phase}
                    </span>
                  )}
                  <span className="rounded-full border border-[#E2ECE8] bg-[#F2F8F6] px-2 py-0.5 text-[10px] uppercase tracking-[0.22em] text-[#728785]">
                    {elapsedSeconds}s
                  </span>
                </div>
                {statusBanner.detail && (
                  <p className={cn(
                    "mt-1 text-xs",
                    statusBanner.tone === 'error' ? "text-[#8B2C2C]/70" : "text-[#728785]"
                  )}>
                    {statusBanner.detail}
                  </p>
                )}
                {(statusBanner.progress || statusBanner.diagnostics?.durationMs) && (
                  <div className="mt-2 space-y-2">
                    {typeof progressPercent === 'number' && (
                      <div className="h-1.5 overflow-hidden rounded-full bg-[#E2ECE8]">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-500",
                            statusBanner.tone === 'error'
                              ? "bg-gradient-to-r from-[#D95C5C] to-[#C04040]"
                              : "bg-gradient-to-r from-[#11C89A] to-[#36D7C7]"
                          )}
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 text-[11px]">
                      {statusBanner.progress && (
                        <>
                          <span className="rounded-full border border-[#E2ECE8] bg-white px-2.5 py-1 text-[#1E2A29]">
                            {lang === 'ru' ? 'Загружено' : 'Loaded'}: <strong>{statusBanner.progress.loaded}</strong>
                          </span>
                          {typeof statusBanner.progress.total === 'number' && (
                            <span className="rounded-full border border-[#E2ECE8] bg-white px-2.5 py-1 text-[#1E2A29]">
                              {lang === 'ru' ? 'Всего' : 'Total'}: <strong>{statusBanner.progress.total}</strong>
                            </span>
                          )}
                          {formatMegabytes(statusBanner.progress.loadedBytes) && (
                            <span className="rounded-full border border-[#E2ECE8] bg-white px-2.5 py-1 text-[#1E2A29]">
                              {lang === 'ru' ? 'Объём' : 'Volume'}: <strong>{formatMegabytes(statusBanner.progress.loadedBytes)}</strong>
                            </span>
                          )}
                        </>
                      )}
                      {typeof statusBanner.diagnostics?.durationMs === 'number' && (
                        <span className="rounded-full border border-[#E2ECE8] bg-white px-2.5 py-1 text-[#1E2A29]">
                          {lang === 'ru' ? 'Сеть' : 'Network'}: <strong>{statusBanner.diagnostics.durationMs} ms</strong>
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

        {/* Floating Action Button (Mobile) - emerald gradient */}
        <button
          onClick={() => onCompose()}
          className="md:hidden absolute bottom-6 right-6 w-14 h-14 rounded-full flex items-center justify-center text-[#042F27] z-30 hover:scale-105 transition-all active:scale-95"
          style={{
            background: 'linear-gradient(135deg, #16C996, #35D5D2)',
            boxShadow: '0 10px 24px rgba(21, 201, 150, 0.22)',
          }}
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
      {/* Logo */}
      <div className="p-4 px-5 h-16 flex items-center shrink-0 relative z-10">
        <h1 className="text-xl font-bold tracking-tight" style={{
          background: 'linear-gradient(135deg, #EFFFFA, #C9FFF0)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          textShadow: '0 0 18px rgba(35, 225, 172, 0.12)',
          filter: 'drop-shadow(0 0 18px rgba(35, 225, 172, 0.12))',
        }}>
          {t('app.title', lang)}
        </h1>
      </div>
      
      {/* Action Buttons */}
      {onCompose && (
        <div className="px-4 py-3 shrink-0 hidden md:flex flex-col gap-2.5 relative z-10">
          {/* Secondary - Get Mail */}
          <button
            onClick={handleFetch}
            disabled={isFetching}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-[18px] font-medium text-sm transition-all duration-180 disabled:opacity-50"
            style={{
              background: 'transparent',
              border: '1px solid rgba(120, 237, 201, 0.24)',
              color: '#EFFFFA',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(36, 90, 78, 0.32)';
              e.currentTarget.style.borderColor = 'rgba(120, 237, 201, 0.40)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = 'rgba(120, 237, 201, 0.24)';
            }}
          >
            <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin", "text-[#C9FFF0]")} />
            {t('layout.getMail', lang)}
          </button>
          {/* Primary - Compose */}
          <button
            onClick={() => onCompose?.()}
            className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-[18px] font-bold text-sm transition-all duration-180 hover:brightness-110"
            style={{
              background: 'linear-gradient(135deg, #16C996, #35D5D2)',
              color: '#042F27',
              boxShadow: '0 10px 24px rgba(21, 201, 150, 0.22)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.boxShadow = '0 14px 32px rgba(21, 201, 150, 0.32)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.boxShadow = '0 10px 24px rgba(21, 201, 150, 0.22)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <Edit3 className="w-4 h-4" style={{ color: '#07362D' }} />
            {t('layout.compose', lang)}
          </button>
        </div>
      )}

      {/* Folder list */}
      <div className="flex-1 overflow-y-auto py-2 px-3 space-y-1 relative z-10">
        {/* Total email counter */}
        <div className="px-3 py-2 mb-1 flex items-center gap-2">
          <Mail className="w-3.5 h-3.5" style={{ color: '#87FFD9' }} />
          <span className="text-xs font-extrabold tracking-wide" style={{ color: '#87FFD9' }}>
            {totalEmails || emails.length} {lang === 'ru' ? 'писем' : 'emails'}
          </span>
        </div>
        
        {/* Section label */}
        <div className="flex items-center justify-between px-3 mt-1 mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: '#7FA39D' }}>
            {t('layout.folders', lang)}
          </span>
          <button 
            onClick={() => setShowNewFolderModal(true)} 
            className="p-1 rounded-lg hover:bg-[rgba(36,90,78,0.32)] transition-colors"
            style={{ color: '#8FB9B0' }}
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
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-[14px] text-sm font-medium transition-all duration-200",
                  isActive
                    ? "text-[#F2FFFB] font-semibold"
                    : "text-[#B8CCC8]",
                  dragOverFolder === folder.id && "ring-2 ring-[#1ED7A7]/50 bg-[rgba(30,215,167,0.1)]"
                )}
                style={isActive ? {
                  background: 'linear-gradient(135deg, rgba(20, 112, 86, 0.48), rgba(15, 75, 67, 0.58))',
                  border: '1px solid rgba(98, 241, 197, 0.16)',
                } : {}}
                onMouseEnter={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'rgba(36, 90, 78, 0.32)';
                    e.currentTarget.style.color = '#E6FFFA';
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = '#B8CCC8';
                  }
                }}
              >
                {hasChildren && (
                  <span
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedFolders(prev => ({ ...prev, [folder.id]: !isExpanded }));
                    }}
                    className="p-0.5 -ml-1 hover:bg-[rgba(36,90,78,0.32)] rounded transition-colors cursor-pointer"
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
                  <Icon className={cn("w-4 h-4", isActive ? "text-[#6BF0C9]" : "text-[#8FB9B0]")} />
                  <span className="flex-1 text-left">{translateFolderName(folder.id, folder.name, lang)}</span>
                  {count > 0 && (
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-xs font-extrabold",
                      isActive 
                        ? "bg-[rgba(43,228,182,0.22)] text-[#87FFD9]" 
                        : "bg-[rgba(43,228,182,0.12)] text-[#6BF0C9]"
                    )}
                    style={isActive ? {
                      boxShadow: '0 6px 14px rgba(30, 214, 167, 0.18)',
                      background: 'linear-gradient(135deg, #19D39D, #43E3C8)',
                      color: '#08372D',
                    } : {}}
                    >
                      {count}
                    </span>
                  )}
                </button>
              </div>
              
              {hasChildren && isExpanded && (
                <div className="ml-4 mt-0.5 space-y-0.5 border-l border-[rgba(210,255,241,0.08)] pl-2">
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
                            ? "bg-[rgba(22,201,150,0.15)] text-[#6BF0C9]"
                            : "text-[#8FB9B0] hover:bg-[rgba(36,90,78,0.24)] hover:text-[#B7FFE9]",
                          dragOverFolder === child.id && "ring-2 ring-[#1ED7A7]/50 bg-[rgba(30,215,167,0.1)]"
                        )}
                      >
                        <ChildIcon className="w-3.5 h-3.5" style={childColor ? { color: childColor } : undefined} />
                        <span className="flex-1 text-left truncate" style={childColor && !isChildActive ? { color: childColor } : undefined}>
                          {translateFolderName(child.id, child.name, lang)}
                        </span>
                        {childCount > 0 && (
                          <span className={cn(
                            "px-1.5 py-0.5 rounded-full text-[10px] font-bold",
                            isChildActive ? "bg-[rgba(22,201,150,0.2)] text-[#6BF0C9]" : "bg-[rgba(43,228,182,0.1)] text-[#6BF0C9]"
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
      <div className="px-3 py-2 border-t border-[rgba(210,255,241,0.08)] relative z-10">
        <button
          onClick={() => setShowAddressBook(!showAddressBook)}
          className="flex items-center gap-2 w-full px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors"
          style={{ color: 'rgba(135, 255, 217, 0.6)' }}
        >
          <BookUser className="w-3.5 h-3.5" />
          <span className="flex-1 text-left">{t('layout.addressBook', lang)}</span>
          {showAddressBook ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
        {showAddressBook && (
          <div className="mt-1 space-y-1 max-h-40 overflow-y-auto">
            {contacts.length === 0 && (
              <p className="px-3 py-2 text-xs" style={{ color: '#7FA39D' }}>{t('layout.noContacts', lang)}</p>
            )}
            {contacts.map(c => (
              <div key={c.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[rgba(36,90,78,0.24)] transition-colors group/contact">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{ background: 'rgba(36,90,78,0.4)', color: '#8FB9B0' }}>
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate" style={{ color: '#B8CCC8' }}>{c.name}</div>
                  <div className="text-[10px] truncate" style={{ color: '#7FA39D' }}>{c.email}</div>
                </div>
                <button
                  onClick={() => onCompose?.({ to: c.email })}
                  className="p-1 rounded hover:bg-[rgba(36,90,78,0.32)] transition-colors opacity-0 group-hover/contact:opacity-100"
                  style={{ color: '#8FB9B0' }}
                  title={lang === 'ru' ? 'Написать письмо' : 'Compose email'}
                >
                  <Mail className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <button
              onClick={() => setShowAddContact(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs transition-colors w-full"
              style={{ color: '#7FA39D' }}
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
              className="w-full max-w-sm bg-white border border-[#E2ECE8] rounded-2xl overflow-hidden"
              style={{ boxShadow: '0 24px 64px rgba(14, 39, 35, 0.12)' }}
            >
              <div className="p-4 border-b border-[#E2ECE8] flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[#1E2A29]">{t('layout.addContact', lang)}</h2>
                <button 
                  onClick={() => setShowAddContact(false)} 
                  className="p-2 hover:bg-[#EDF7F3] rounded-full text-[#728785] hover:text-[#1E2A29] transition-colors"
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
                  <label className="block text-sm font-medium text-[#455857] mb-1">{t('layout.contactName', lang)}</label>
                  <input 
                    type="text" 
                    value={newContactName} 
                    onChange={e => setNewContactName(e.target.value)}
                    className="w-full bg-[#F2F8F6] border border-[#E2ECE8] rounded-xl px-4 py-2.5 text-[#1E2A29] focus:outline-none focus:border-[rgba(22,201,150,0.55)] focus:ring-4 focus:ring-[rgba(22,201,150,0.10)] focus:bg-white transition-all"
                    autoFocus 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#455857] mb-1">{t('layout.contactEmail', lang)}</label>
                  <input 
                    type="email" 
                    value={newContactEmail} 
                    onChange={e => setNewContactEmail(e.target.value)}
                    className="w-full bg-[#F2F8F6] border border-[#E2ECE8] rounded-xl px-4 py-2.5 text-[#1E2A29] focus:outline-none focus:border-[rgba(22,201,150,0.55)] focus:ring-4 focus:ring-[rgba(22,201,150,0.10)] focus:bg-white transition-all" 
                  />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button 
                    type="button" 
                    onClick={() => setShowAddContact(false)} 
                    className="px-4 py-2 text-sm font-medium text-[#728785] hover:text-[#1E2A29] transition-colors"
                  >
                    {t('layout.cancel', lang)}
                  </button>
                  <button 
                    type="submit" 
                    disabled={!newContactName.trim() || !newContactEmail.trim()}
                    className="px-4 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      background: 'linear-gradient(135deg, #16C996, #35D5D2)',
                      color: '#042F27',
                    }}
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
              className="w-full max-w-sm bg-white border border-[#E2ECE8] rounded-2xl overflow-hidden"
              style={{ boxShadow: '0 24px 64px rgba(14, 39, 35, 0.12)' }}
            >
              <div className="p-4 border-b border-[#E2ECE8] flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[#1E2A29]">{t('layout.createFolder', lang)}</h2>
                <button
                  onClick={() => setShowNewFolderModal(false)}
                  className="p-2 hover:bg-[#EDF7F3] rounded-full text-[#728785] hover:text-[#1E2A29] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleAddFolder} className="p-4">
                <div className="mb-4">
                  <label className="block text-sm font-medium text-[#455857] mb-1.5">{t('layout.folderName', lang)}</label>
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    className="w-full bg-[#F2F8F6] border border-[#E2ECE8] rounded-xl px-4 py-2.5 text-[#1E2A29] focus:outline-none focus:border-[rgba(22,201,150,0.55)] focus:ring-4 focus:ring-[rgba(22,201,150,0.10)] focus:bg-white transition-all placeholder:text-[#A1B1AF]"
                    placeholder={t('layout.folderPlaceholder', lang)}
                    autoFocus
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowNewFolderModal(false)}
                    className="px-4 py-2 text-sm font-medium text-[#728785] hover:text-[#1E2A29] transition-colors"
                  >
                    {t('layout.cancel', lang)}
                  </button>
                  <button
                    type="submit"
                    disabled={!newFolderName.trim()}
                    className="px-4 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      background: 'linear-gradient(135deg, #16C996, #35D5D2)',
                      color: '#042F27',
                    }}
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
