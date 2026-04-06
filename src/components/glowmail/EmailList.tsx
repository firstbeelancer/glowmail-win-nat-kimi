import { useState, useRef, useEffect, useCallback } from 'react';
import { useMail } from '../../store';
import { ChevronDown as ChevronDownIcon, Filter } from 'lucide-react';
import { Email } from '../../types';
import { formatDistanceToNow } from 'date-fns';
import { Star, Paperclip, Tag, Inbox, AlertTriangle, ArrowDownAZ, ArrowUpAZ, Calendar, User, Type, Trash2, MoreVertical, Download, Printer, ChevronDown, Mail, MailOpen, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { t } from '@/lib/i18n';

type FilterMode = 'all' | 'unread' | 'attachments' | 'to_me' | 'from_me';

export function EmailList({ onSelect, onEditDraft, selectedEmailId }: { onSelect: (email: Email) => void, onEditDraft?: (email: Email) => void, selectedEmailId?: string }) {
  const { emails, currentFolder, searchQuery, setSearchQuery, toggleStar, deleteEmail, settings, updateEmailTags, isLoading, isLoadingMore, hasMoreEmails, totalEmails, connectionError, fetchEmails, loadMoreEmails, markAsRead, markAsUnread, isSearching, isSearchActive, searchResultCount, hasMoreSearchResults, searchError } = useMail();
  const lang = settings.language;
  const [sortBy, setSortBy] = useState<'date' | 'sender' | 'subject' | 'tags' | 'unread'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [starredOnly, setStarredOnly] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [tagPickerOpenId, setTagPickerOpenId] = useState<string | null>(null);
  const prevFolderRef = useRef(currentFolder);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset sort when folder changes, unless keepFiltersAcrossFolders is on
  useEffect(() => {
    if (prevFolderRef.current !== currentFolder) {
      prevFolderRef.current = currentFolder;
      if (!settings.keepFiltersAcrossFolders) {
        setSortBy('date');
        setSortOrder('desc');
        setFilterMode('all');
        setStarredOnly(false);
      }
    }
  }, [currentFolder, settings.keepFiltersAcrossFolders]);

  const handleSort = (type: 'date' | 'sender' | 'subject' | 'tags' | 'unread') => {
    if (sortBy === type) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(type);
      setSortOrder(type === 'date' ? 'desc' : 'asc');
    }
  };

  const getTagColor = (tagName: string) => {
    const tagDef = settings.availableTags.find(t => t.name === tagName);
    return tagDef ? tagDef.color : '#6c8aff';
  };

  const toggleEmailTag = (emailId: string, tagName: string) => {
    const email = emails.find(e => e.id === emailId);
    if (!email) return;
    const newTags = email.tags.includes(tagName)
      ? email.tags.filter(t => t !== tagName)
      : [...email.tags, tagName];
    updateEmailTags(emailId, newTags);
  };

  const handleSaveEmail = (email: Email, e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpenId(null);
    const boundary = '----=_Part_' + Math.random().toString(36).slice(2);
    const dateStr = new Date(email.date).toUTCString();
    const lines: string[] = [];
    lines.push(`Message-ID: ${email.headers.messageId}`);
    if (email.headers.inReplyTo) lines.push(`In-Reply-To: ${email.headers.inReplyTo}`);
    if (email.headers.references) lines.push(`References: ${email.headers.references}`);
    if (email.headers.returnPath) lines.push(`Return-Path: ${email.headers.returnPath}`);
    if (email.headers.received) email.headers.received.forEach(r => lines.push(`Received: ${r}`));
    lines.push(`Date: ${dateStr}`);
    lines.push(`From: ${email.from.name} <${email.from.email}>`);
    lines.push(`To: ${email.to.map(t => `${t.name} <${t.email}>`).join(', ')}`);
    if (email.cc?.length) lines.push(`Cc: ${email.cc.map(c => `${c.name} <${c.email}>`).join(', ')}`);
    if (email.bcc?.length) lines.push(`Bcc: ${email.bcc.map(b => `${b.name} <${b.email}>`).join(', ')}`);
    lines.push(`Subject: ${email.subject}`);
    lines.push(`MIME-Version: 1.0`);
    lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    if (email.importance === 'high') lines.push(`Importance: high`);
    lines.push('');
    lines.push(`--${boundary}`);
    lines.push(`Content-Type: text/html; charset="UTF-8"`);
    lines.push(`Content-Transfer-Encoding: quoted-printable`);
    lines.push('');
    lines.push(email.body);
    lines.push('');
    lines.push(`--${boundary}--`);
    const emlContent = lines.join('\r\n');
    const blob = new Blob([emlContent], { type: 'message/rfc822' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${email.subject || 'email'}.eml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrintEmail = (email: Email, e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpenId(null);
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html><head><title>${email.subject}</title><style>body{font-family:sans-serif;padding:20px;color:#222;}h1{font-size:18px;}p{margin:4px 0;}.meta{color:#666;font-size:13px;}</style></head><body>
        <h1>${email.subject}</h1>
        <p class="meta">From: ${email.from.name} &lt;${email.from.email}&gt;</p>
        <p class="meta">To: ${email.to.map(t => `${t.name} &lt;${t.email}&gt;`).join(', ')}</p>
        <p class="meta">Date: ${new Date(email.date).toLocaleString()}</p>
        <hr/>${email.body}
        </body></html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const filteredEmails = emails.filter((email) => {
    // When search is active, server already filtered - show all results
    // When not searching, filter by current folder
    const matchesFolder = isSearchActive || email.folderId === currentFolder;
    return matchesFolder;
  })
  .filter(email => !starredOnly || email.starred)
  .filter(email => {
    if (filterMode === 'all') return true;
    if (filterMode === 'unread') return !email.read;
    if (filterMode === 'attachments') return email.attachments.length > 0;
    if (filterMode === 'to_me') return email.to.some(c => c.email === settings.account.email);
    if (filterMode === 'from_me') return email.from.email === settings.account.email;
    return true;
  });

  const sortedEmails = [...filteredEmails].sort((a, b) => {
    let comparison = 0;
    if (sortBy === 'date') {
      comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
    } else if (sortBy === 'sender') {
      comparison = a.from.name.localeCompare(b.from.name);
    } else if (sortBy === 'subject') {
      comparison = a.subject.localeCompare(b.subject);
    } else if (sortBy === 'tags') {
      const aTags = a.tags.join(',');
      const bTags = b.tags.join(',');
      comparison = aTags.localeCompare(bTags);
    } else if (sortBy === 'unread') {
      comparison = (a.read === b.read) ? 0 : a.read ? -1 : 1;
    }
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  // Group emails
  const groupBy = settings.groupBy || 'none';
  const groupedEmails: { label: string; emails: Email[] }[] = [];
  if (groupBy === 'none') {
    groupedEmails.push({ label: '', emails: sortedEmails });
  } else {
    const groups: Record<string, Email[]> = {};
    sortedEmails.forEach(email => {
      let key = '';
      if (groupBy === 'date') {
        const d = new Date(email.date);
        key = d.toLocaleDateString();
      } else if (groupBy === 'sender') {
        key = email.from.name || email.from.email;
      } else if (groupBy === 'tag') {
        key = email.tags.length > 0 ? email.tags[0] : (lang === 'ru' ? 'Без тега' : 'No tag');
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(email);
    });
    Object.entries(groups).forEach(([label, emails]) => groupedEmails.push({ label, emails }));
  }

  const canLoadMore = isSearchActive ? hasMoreSearchResults : hasMoreEmails;
  const shownCount = isSearchActive ? emails.length : emails.filter(e => e.folderId === currentFolder).length;
  const totalCount = isSearchActive ? searchResultCount : totalEmails;

  // Infinite scroll handler
  const handleScroll = useCallback(() => {
    if (!listRef.current || isLoadingMore || !canLoadMore) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    if (scrollHeight - scrollTop - clientHeight < 200) {
      loadMoreEmails();
    }
  }, [isLoadingMore, canLoadMore, loadMoreEmails]);

  const filterLabel = filterMode === 'all' ? '' :
    filterMode === 'unread' ? (lang === 'ru' ? 'Непрочитанные' : 'Unread') :
    filterMode === 'attachments' ? (lang === 'ru' ? 'С вложениями' : 'With attachments') :
    filterMode === 'to_me' ? (lang === 'ru' ? 'Мне' : 'To me') :
    filterMode === 'from_me' ? (lang === 'ru' ? 'От меня' : 'From me') : '';

  return (
    <div className="flex flex-col h-full bg-glow-primary">
      {/* Sort & Filter Toolbar */}
      <div className="px-4 py-2 border-b border-glow-border-default flex items-center justify-between shrink-0 bg-glow-primary">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-glow-text-muted">{t('emailList.sortBy', lang)}</span>
          {filterLabel && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-glow-accent/10 text-glow-accent border border-glow-accent/20 font-medium">
              {filterLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Filter dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowFilterMenu(!showFilterMenu)}
              className={cn("p-1.5 rounded-md text-glow-text-secondary hover:text-glow-text-primary transition-colors bg-glow-surface border border-glow-border-default", filterMode !== 'all' && "bg-glow-accent/10 text-glow-accent border-glow-accent/30")}
              title={lang === 'ru' ? 'Фильтр' : 'Filter'}
            >
              <Filter className="w-3.5 h-3.5" />
            </button>
            {showFilterMenu && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-glow-surface border border-glow-border-default rounded-xl shadow-glow-lg overflow-hidden z-50">
                <div className="p-1 flex flex-col">
                  {([
                    ['all', lang === 'ru' ? 'Все' : 'All', null],
                    ['unread', lang === 'ru' ? 'Непрочитанные' : 'Unread', Mail],
                    ['attachments', lang === 'ru' ? 'С вложениями' : 'With attachments', Paperclip],
                    ['to_me', lang === 'ru' ? 'Мне' : 'To me', Inbox],
                    ['from_me', lang === 'ru' ? 'От меня' : 'From me', User],
                  ] as [FilterMode, string, any][]).map(([mode, label, Icon]) => (
                    <button
                      key={mode}
                      onClick={() => { setFilterMode(mode); setShowFilterMenu(false); }}
                      className={cn(
                        "flex items-center gap-2 text-left px-3 py-2 text-sm rounded-lg transition-colors",
                        filterMode === mode ? "bg-glow-accent-muted text-glow-accent" : "text-glow-text-secondary hover:bg-glow-elevated hover:text-glow-text-primary"
                      )}
                    >
                      {Icon && <Icon className="w-3.5 h-3.5" />}
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex bg-glow-surface border border-glow-border-default rounded-lg p-0.5">
            <button
              onClick={() => handleSort('unread')}
              className={cn("p-1.5 rounded-md text-glow-text-secondary hover:text-glow-text-primary transition-colors", sortBy === 'unread' && "bg-glow-elevated text-glow-text-primary")}
              title={t('emailList.unreadFirst', lang)}
            >
              <Inbox className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleSort('date')}
              className={cn("p-1.5 rounded-md text-glow-text-secondary hover:text-glow-text-primary transition-colors", sortBy === 'date' && "bg-glow-elevated text-glow-text-primary")}
              title={t('emailList.date', lang)}
            >
              <Calendar className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleSort('sender')}
              className={cn("p-1.5 rounded-md text-glow-text-secondary hover:text-glow-text-primary transition-colors", sortBy === 'sender' && "bg-glow-elevated text-glow-text-primary")}
              title={t('emailList.sender', lang)}
            >
              <User className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleSort('subject')}
              className={cn("p-1.5 rounded-md text-glow-text-secondary hover:text-glow-text-primary transition-colors", sortBy === 'subject' && "bg-glow-elevated text-glow-text-primary")}
              title={t('emailList.subject', lang)}
            >
              <Type className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleSort('tags')}
              className={cn("p-1.5 rounded-md text-glow-text-secondary hover:text-glow-text-primary transition-colors", sortBy === 'tags' && "bg-glow-elevated text-glow-text-primary")}
              title={t('emailList.tags', lang)}
            >
            <Tag className="w-3.5 h-3.5" />
            </button>
          </div>
          <button
            onClick={() => setStarredOnly(prev => !prev)}
            className={cn("p-1.5 bg-glow-surface border border-glow-border-default rounded-lg text-glow-text-secondary hover:text-glow-text-primary hover:bg-glow-elevated transition-colors", starredOnly && "bg-glow-priority-medium/10 text-glow-priority-medium border-glow-priority-medium/30")}
            title={t('emailList.starredOnly', lang)}
          >
            <Star className={cn("w-3.5 h-3.5", starredOnly && "fill-glow-priority-medium")} />
          </button>
          <button
            onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
            className="p-1.5 bg-glow-surface border border-glow-border-default rounded-lg text-glow-text-secondary hover:text-glow-text-primary hover:bg-glow-elevated transition-colors"
            title={sortOrder === 'asc' ? t('emailList.ascending', lang) : t('emailList.descending', lang)}
          >
            {sortOrder === 'asc' ? <ArrowUpAZ className="w-3.5 h-3.5" /> : <ArrowDownAZ className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {isSearching && sortedEmails.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-glow-text-muted h-full">
          <svg className="w-8 h-8 animate-spin text-glow-accent mb-3" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <p>{lang === 'ru' ? 'Поиск писем...' : 'Searching emails...'}</p>
        </div>
      ) : isLoading && emails.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-glow-text-muted h-full">
          <svg className="w-8 h-8 animate-spin text-glow-accent mb-3" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <p>{lang === 'ru' ? 'Загрузка писем...' : 'Loading emails...'}</p>
        </div>
      ) : isSearchActive && searchError ? (
        <div className="flex-1 flex flex-col items-center justify-center text-glow-text-muted h-full px-6">
          <AlertTriangle className="w-8 h-8 text-glow-warning mb-3" />
          <p className="text-sm text-center mb-1">{lang === 'ru' ? 'Ошибка поиска' : 'Search failed'}</p>
          <p className="text-xs text-glow-text-muted text-center mb-3">{searchError}</p>
          <button onClick={() => setSearchQuery('')} className="text-xs text-glow-accent hover:underline">
            {lang === 'ru' ? 'Сбросить поиск' : 'Clear search'}
          </button>
        </div>
      ) : connectionError ? (
        <div className="flex-1 flex flex-col items-center justify-center text-glow-text-muted h-full px-6">
          <AlertTriangle className="w-8 h-8 text-glow-warning mb-3" />
          <p className="text-sm text-center mb-3">{connectionError}</p>
          <button onClick={() => fetchEmails()} className="text-xs text-glow-accent hover:underline">
            {lang === 'ru' ? 'Попробовать снова' : 'Try again'}
          </button>
        </div>
      ) : sortedEmails.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-glow-text-muted h-full">
          <div className="w-16 h-16 bg-glow-surface rounded-full flex items-center justify-center mb-4 shadow-glow">
            {isSearchActive ? <Search className="w-8 h-8 opacity-50" /> : <Inbox className="w-8 h-8 opacity-50" />}
          </div>
          <p>{isSearchActive
            ? (lang === 'ru' ? 'Ничего не найдено' : 'No results found')
            : t('emailList.noEmails', lang)
          }</p>
          {isSearchActive && (
            <button onClick={() => setSearchQuery('')} className="text-xs text-glow-accent hover:underline mt-2">
              {lang === 'ru' ? 'Сбросить поиск' : 'Clear search'}
            </button>
          )}
          {filterMode !== 'all' && !isSearchActive && (
            <button onClick={() => setFilterMode('all')} className="text-xs text-glow-accent hover:underline mt-2">
              {lang === 'ru' ? 'Сбросить фильтр' : 'Clear filter'}
            </button>
          )}
        </div>
      ) : (
        <div ref={listRef} className="flex-1 overflow-y-auto" onScroll={handleScroll}>
          {isSearchActive && (
            <div className="px-4 py-2 bg-glow-surface/50 border-b border-glow-border-subtle flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-glow-accent" />
              <span className="text-xs text-glow-text-secondary">
                {lang === 'ru'
                  ? `Найдено ${searchResultCount} ${searchResultCount === 1 ? 'письмо' : searchResultCount < 5 ? 'письма' : 'писем'}`
                  : `Found ${searchResultCount} ${searchResultCount === 1 ? 'email' : 'emails'}`
                }
              </span>
              {isSearching && (
                <svg className="w-3.5 h-3.5 animate-spin text-glow-accent ml-auto" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              )}
            </div>
          )}
          {groupedEmails.map((group, gi) => (
            <div key={gi}>
              {group.label && (
                <div className="px-4 py-2 bg-glow-surface/50 border-b border-glow-border-subtle sticky top-0 z-10">
                  <span className="text-xs font-bold text-glow-text-muted uppercase tracking-wider">{group.label}</span>
                </div>
              )}
              {group.emails.map((email, index) => (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index * 0.02, 0.5) }}
              key={email.id}
              draggable
              onDragStart={(e: any) => {
                e.dataTransfer.setData('text/email-id', email.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onClick={() => onSelect(email)}
              onDoubleClick={() => {
                if (email.folderId === 'drafts' && onEditDraft) {
                  onEditDraft(email);
                }
              }}
              className={cn(
                "group flex flex-col p-4 border-b border-glow-border-subtle cursor-grab transition-all hover:bg-glow-surface/50 relative active:cursor-grabbing",
                !email.read && "bg-glow-surface/20",
                email.starred && "bg-glow-priority-low/[0.03] shadow-[inset_0_0_25px_rgba(61,217,160,0.06)]",
                selectedEmailId === email.id && "ring-1 ring-glow-accent/50 bg-glow-accent/[0.06] border-l-2 border-l-glow-accent"
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  {/* Unread indicator dot */}
                  {!email.read && (
                    <span className="w-2 h-2 rounded-full bg-glow-accent shrink-0 shadow-[0_0_6px_rgba(108,138,255,0.6)]" />
                  )}
                  {email.importance === 'high' && (
                    <AlertTriangle className="w-3.5 h-3.5 text-glow-priority-high drop-shadow-[0_0_5px_rgba(240,122,58,0.5)]" />
                  )}
                  <span className={cn("font-semibold text-sm", !email.read ? "text-glow-text-primary" : "text-glow-text-secondary")}>
                    {email.from.name}
                  </span>
                  {/* Attachment indicator */}
                  {email.attachments.length > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-glow-text-muted" title={`${email.attachments.length} ${lang === 'ru' ? 'вложени' + (email.attachments.length === 1 ? 'е' : 'я') : 'attachment' + (email.attachments.length > 1 ? 's' : '')}`}>
                      <Paperclip className="w-3 h-3" />
                      {email.attachments.length > 1 && <span className="text-[10px]">{email.attachments.length}</span>}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-glow-text-muted" title={new Date(email.date).toLocaleString()}>
                    {(() => {
                      const d = new Date(email.date);
                      const now = new Date();
                      const isToday = d.toDateString() === now.toDateString();
                      const yesterday = new Date(now);
                      yesterday.setDate(yesterday.getDate() - 1);
                      const isYesterday = d.toDateString() === yesterday.toDateString();
                      const time = d.toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'en-US', { hour: '2-digit', minute: '2-digit' });
                      if (isToday) return time;
                      if (isYesterday) return `${lang === 'ru' ? 'Вчера' : 'Yesterday'} ${time}`;
                      return d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined }) + ' ' + time;
                    })()}
                  </span>
                  {/* Tag picker button */}
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setTagPickerOpenId(tagPickerOpenId === email.id ? null : email.id);
                        setMenuOpenId(null);
                      }}
                      className="p-1 -mr-1 rounded-full hover:bg-glow-surface text-glow-text-muted hover:text-glow-accent transition-colors opacity-0 group-hover:opacity-100"
                      title={t('emailList.addTag', lang)}
                    >
                      <Tag className="w-3.5 h-3.5" />
                    </button>
                    {tagPickerOpenId === email.id && (
                      <div
                        className="absolute right-0 top-full mt-1 w-44 bg-glow-surface border border-glow-border-default rounded-xl shadow-glow-lg overflow-hidden z-50"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="p-1.5 flex flex-col max-h-48 overflow-y-auto">
                          <span className="px-2 py-1 text-[10px] font-semibold text-glow-text-muted uppercase tracking-wider">{t('emailList.assignTags', lang)}</span>
                          {settings.availableTags.map(tag => {
                            const isActive = email.tags.includes(tag.name);
                            return (
                              <button
                                key={tag.id}
                                onClick={() => toggleEmailTag(email.id, tag.name)}
                                className={cn(
                                  "flex items-center gap-2 text-left px-3 py-1.5 text-xs rounded-lg transition-colors",
                                  isActive ? "bg-glow-elevated text-glow-text-primary" : "text-glow-text-secondary hover:bg-glow-elevated hover:text-glow-text-primary"
                                )}
                              >
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                                {tag.name}
                                {isActive && <span className="ml-auto text-glow-accent text-[10px]">✓</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleStar(email.id);
                    }}
                    className="p-1 -mr-1 rounded-full hover:bg-glow-surface transition-colors"
                  >
                    <Star
                      className={cn(
                        "w-4 h-4 transition-all",
                        email.starred ? "fill-glow-priority-medium text-glow-priority-medium drop-shadow-[0_0_8px_rgba(240,192,64,0.5)]" : "text-glow-text-muted"
                      )}
                    />
                  </button>
                  {/* Three-dot menu */}
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenId(menuOpenId === email.id ? null : email.id);
                        setTagPickerOpenId(null);
                      }}
                      className="p-1 -mr-1 rounded-full hover:bg-glow-surface text-glow-text-muted hover:text-glow-text-secondary transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                    {menuOpenId === email.id && (
                      <div
                        className="absolute right-0 top-full mt-1 w-44 bg-glow-surface border border-glow-border-default rounded-xl shadow-glow-lg overflow-hidden z-50"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="p-1 flex flex-col">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (email.read) {
                                markAsUnread(email.id);
                              } else {
                                markAsRead(email.id);
                              }
                              setMenuOpenId(null);
                            }}
                            className="flex items-center gap-2 text-left px-3 py-2 text-sm text-glow-text-secondary hover:bg-glow-elevated hover:text-glow-accent rounded-lg transition-colors"
                          >
                            {email.read ? <Mail className="w-4 h-4" /> : <MailOpen className="w-4 h-4" />}
                            {email.read ? (lang === 'ru' ? 'Непрочитанное' : 'Mark unread') : (lang === 'ru' ? 'Прочитанное' : 'Mark read')}
                          </button>
                          <button
                            onClick={(e) => handleSaveEmail(email, e)}
                            className="flex items-center gap-2 text-left px-3 py-2 text-sm text-glow-text-secondary hover:bg-glow-elevated hover:text-glow-accent rounded-lg transition-colors"
                          >
                            <Download className="w-4 h-4" />
                            {t('emailList.save', lang)}
                          </button>
                          <button
                            onClick={(e) => handlePrintEmail(email, e)}
                            className="flex items-center gap-2 text-left px-3 py-2 text-sm text-glow-text-secondary hover:bg-glow-elevated hover:text-glow-accent rounded-lg transition-colors"
                          >
                            <Printer className="w-4 h-4" />
                            {t('emailList.print', lang)}
                          </button>
                          <div className="h-px bg-glow-border-default my-1" />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteEmail(email.id);
                              setMenuOpenId(null);
                            }}
                            className="flex items-center gap-2 text-left px-3 py-2 text-sm text-glow-error hover:bg-glow-error/10 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                            {t('emailList.deleteEmail', lang)}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2 mb-1">
                <h3 className={cn(
                  "text-sm flex-1",
                  !email.read ? "font-bold text-glow-text-primary" : "font-medium text-glow-text-secondary",
                  email.starred && "font-bold text-glow-priority-low"
                )}>
                  {email.subject}
                </h3>
              </div>
              
              <p className="text-sm text-glow-text-muted truncate mb-2">
                {email.snippet}
              </p>

              {(email.tags.length > 0 || email.attachments.length > 0) && (
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {email.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-glow-surface/80 text-glow-text-secondary border border-glow-border-subtle"
                    >
                      <Tag className="w-2.5 h-2.5" style={{ color: getTagColor(tag) }} />
                      {tag}
                    </span>
                  ))}
                  {/* Show attachment names preview on desktop */}
                  {email.attachments.length > 0 && email.attachments.length <= 3 && (
                    <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-glow-surface/60 text-glow-text-muted border border-glow-border-subtle/30">
                      <Paperclip className="w-2.5 h-2.5" />
                      {email.attachments.map(a => a.name).join(', ')}
                    </span>
                  )}
                </div>
              )}
            </motion.div>
          ))}
            </div>
          ))}
          {/* Load more / infinite scroll indicator */}
          {canLoadMore && (
            <div className="p-4 flex flex-col items-center gap-1">
              {isLoadingMore ? (
                <div className="flex items-center gap-2 text-glow-text-muted text-sm py-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  {lang === 'ru' ? 'Загрузка...' : 'Loading...'}
                </div>
              ) : (
                <button
                  onClick={() => loadMoreEmails()}
                  className="w-full py-2.5 rounded-lg bg-glow-surface border border-glow-border-default text-glow-text-secondary text-sm font-medium hover:bg-glow-elevated hover:text-glow-text-primary transition-colors flex items-center justify-center gap-2"
                >
                  <ChevronDownIcon className="w-4 h-4" />
                  {isSearchActive
                    ? (lang === 'ru' ? `Показать ещё результаты (${shownCount} из ${totalCount})` : `Show more results (${shownCount} of ${totalCount})`)
                    : (lang === 'ru' ? `Загрузить ещё (${shownCount} из ${totalCount})` : `Load more (${shownCount} of ${totalCount})`)
                  }
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
