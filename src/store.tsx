import { createContext, useContext, useState, ReactNode, useMemo, useEffect, useCallback, useRef } from 'react';
import { Email, Folder, Contact, UserSettings, TagDef } from './types';
import * as mailApi from './lib/mail-api';
import * as desktopCache from './lib/desktop/cache';
import { getCredentialProfile } from './lib/credentials';
import { loadPersistedSettings, loadSecureSettings, persistSettings, persistSecureSettings } from './lib/settings-storage';
import { toast } from '@/hooks/use-toast';

/** Decode RFC 2047 MIME-encoded words (=?charset?encoding?text?=) */
function decodeMime(str: string): string {
  if (!str) return str;
  return str.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_match, charset, encoding, text) => {
    try {
      if (encoding.toUpperCase() === 'B') {
        // Base64 encoding
        const bytes = Uint8Array.from(atob(text), c => c.charCodeAt(0));
        return new TextDecoder(charset).decode(bytes);
      } else {
        // Q encoding: collect raw bytes, then decode as UTF-8
        const rawBytes: number[] = [];
        let i = 0;
        while (i < text.length) {
          if (text[i] === '_') {
            rawBytes.push(0x20); // underscore = space
            i++;
          } else if (text[i] === '=' && i + 2 < text.length) {
            const hex = text.substring(i + 1, i + 3);
            const byte = parseInt(hex, 16);
            if (!isNaN(byte)) {
              rawBytes.push(byte);
              i += 3;
            } else {
              rawBytes.push(text.charCodeAt(i));
              i++;
            }
          } else {
            rawBytes.push(text.charCodeAt(i));
            i++;
          }
        }
        const bytes = new Uint8Array(rawBytes);
        return new TextDecoder(charset).decode(bytes);
      }
    } catch { return text; }
  });
}

/** Decode IMAP modified UTF-7 folder names (e.g., &BCEEPwQwBDw- → Спам) */
function decodeModifiedUtf7(str: string): string {
  if (!str || !str.includes('&')) return str;
  return str.replace(/&([^-]*)-/g, (_, encoded) => {
    if (!encoded) return '&';
    try {
      const base64 = encoded.replace(/,/g, '/');
      const bytes = atob(base64);
      let result = '';
      for (let i = 0; i < bytes.length; i += 2) {
        result += String.fromCharCode((bytes.charCodeAt(i) << 8) | bytes.charCodeAt(i + 1));
      }
      return result;
    } catch { return encoded; }
  });
}

const MOCK_FOLDERS: Folder[] = [
  { id: 'inbox', name: 'Inbox', icon: 'inbox' },
  { id: 'sent', name: 'Sent', icon: 'send' },
  { id: 'outbox', name: 'Outbox', icon: 'clock' },
  { id: 'drafts', name: 'Drafts', icon: 'file' },
  { id: 'spam', name: 'Spam', icon: 'alert-circle' },
  { id: 'trash', name: 'Trash', icon: 'trash-2' },
  { id: 'work', name: 'Work', icon: 'briefcase' },
];

const MOCK_CONTACTS: Contact[] = [
  { id: 'c1', name: 'Alice Smith', email: 'alice@example.com' },
  { id: 'c2', name: 'Bob Jones', email: 'bob@example.com' },
  { id: 'c3', name: 'Charlie Brown', email: 'charlie@example.com' },
];

const MOCK_EMAILS: Email[] = [
  {
    id: 'e1',
    folderId: 'inbox',
    from: MOCK_CONTACTS[0],
    to: [{ id: 'me', name: 'Me', email: 'me@example.com' }],
    subject: 'Project Update: Q3 Goals',
    snippet: 'Hi team, just wanted to share the latest updates on our Q3 goals...',
    body: '<p>Hi team,</p><p>Just wanted to share the latest updates on our Q3 goals. We are currently on track to hit our targets.</p><p>Best,<br>Alice</p>',
    date: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    read: false,
    starred: true,
    tags: ['work', 'urgent'],
    attachments: [],
    headers: {
      messageId: '<12345@example.com>',
      returnPath: '<alice@example.com>',
    },
  },
  {
    id: 'e2',
    folderId: 'inbox',
    from: MOCK_CONTACTS[1],
    to: [{ id: 'me', name: 'Me', email: 'me@example.com' }],
    subject: 'Lunch tomorrow?',
    snippet: 'Are we still on for lunch tomorrow at 12:30?',
    body: '<p>Are we still on for lunch tomorrow at 12:30? Let me know if you need to reschedule.</p>',
    date: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    read: true,
    starred: false,
    tags: ['personal'],
    attachments: [],
    headers: {
      messageId: '<67890@example.com>',
    },
  },
  {
    id: 'e3',
    folderId: 'inbox',
    from: MOCK_CONTACTS[2],
    to: [{ id: 'me', name: 'Me', email: 'me@example.com' }],
    subject: 'Invoice #INV-2023-001',
    snippet: 'Please find attached the invoice for the recent consulting work.',
    body: '<p>Please find attached the invoice for the recent consulting work.</p>',
    date: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    read: false,
    starred: false,
    tags: ['finance'],
    attachments: [
      {
        id: 'a1',
        name: 'invoice.pdf',
        size: 1024 * 150,
        type: 'application/pdf',
        url: '#',
      },
    ],
    headers: {
      messageId: '<abcde@example.com>',
    },
  },
  {
    id: 'e4',
    folderId: 'drafts',
    from: { id: 'me', name: 'Me', email: 'me@example.com' },
    to: [{ id: 'c1', name: 'Alice Smith', email: 'alice@example.com' }],
    subject: 'Draft: Quarterly Review',
    snippet: 'Hi Alice, I am working on the quarterly review...',
    body: '<p>Hi Alice,</p><p>I am working on the quarterly review and will send it to you soon.</p>',
    date: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    read: true,
    starred: false,
    tags: ['work'],
    attachments: [],
    headers: {
      messageId: '<draft1@example.com>',
    },
  },
];

type MailContextType = {
  folders: Folder[];
  emails: Email[];
  contacts: Contact[];
  settings: UserSettings;
  currentFolder: string;
  setCurrentFolder: (id: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  markAsRead: (id: string) => void;
  markAsUnread: (id: string) => void;
  toggleStar: (id: string) => void;
  deleteEmail: (id: string) => void;
  moveEmailToFolder: (id: string, targetFolder: string) => void;
  copyEmailToFolder: (id: string, targetFolder: string) => void;
  sendEmail: (email: Partial<Email>) => void;
  saveDraft: (email: Partial<Email>) => void;
  addContact: (contact: Contact) => void;
  updateSettings: (settings: Partial<UserSettings>) => void;
  fetchEmails: () => Promise<void>;
  loadMoreEmails: () => Promise<void>;
  addFolder: (name: string) => void;
  updateEmailTags: (id: string, tags: string[]) => void;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMoreEmails: boolean;
  totalEmails: number;
  isConnected: boolean;
  connectionError: string | null;
  allFoldersFlat: Folder[];
  isSearching: boolean;
  isSearchActive: boolean;
  searchResultCount: number;
  hasMoreSearchResults: boolean;
  searchError: string | null;
  upsertLocalEmail: (email: Email) => void;
  statusBanner: MailStatusBanner | null;
};

type MailStatusBanner = {
  tone: 'loading' | 'syncing' | 'error';
  text: string;
  detail?: string;
  phase?: 'refresh' | 'folders' | 'cache' | 'network' | 'sync' | 'error';
  startedAt: number;
  progress?: {
    loaded: number;
    total?: number;
    remaining?: number;
    loadedBytes?: number;
  };
  diagnostics?: {
    source?: string;
    durationMs?: number;
    step?: string;
    folder?: string;
  };
};

const MailContext = createContext<MailContextType | undefined>(undefined);

export function MailProvider({ children }: { children: ReactNode }) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderEmails, setFolderEmails] = useState<Email[]>([]);
  const [searchResults, setSearchResults] = useState<Email[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string>('INBOX');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalEmails, setTotalEmails] = useState(0);
  const [hasMoreEmails, setHasMoreEmails] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchResultCount, setSearchResultCount] = useState(0);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<MailStatusBanner | null>(null);
  const [searchPage, setSearchPage] = useState(1);
  const [hasMoreSearchResults, setHasMoreSearchResults] = useState(false);
  const [isDesktopCacheReady, setIsDesktopCacheReady] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRequestIdRef = useRef(0);
  const knownEmailIdsRef = useRef<Set<string>>(new Set());
  const isFirstFetchRef = useRef(true);
  const backgroundSyncFoldersRef = useRef<Set<string>>(new Set());
  const backgroundSyncQueueRunningRef = useRef(false);
  const folderEmailsRef = useRef<Email[]>([]);
  const statusClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    desktopCache.isDesktopRuntime().then(setIsDesktopCacheReady).catch(() => setIsDesktopCacheReady(false));
  }, []);

  useEffect(() => {
    folderEmailsRef.current = folderEmails;
  }, [folderEmails]);

  const clearPendingStatusTimer = useCallback(() => {
    if (statusClearTimerRef.current) {
      clearTimeout(statusClearTimerRef.current);
      statusClearTimerRef.current = null;
    }
  }, []);

  const pushStatusBanner = useCallback((banner: MailStatusBanner | null) => {
    clearPendingStatusTimer();
    setStatusBanner(banner);
  }, [clearPendingStatusTimer]);

  const scheduleStatusBannerClear = useCallback((delayMs = 8000) => {
    clearPendingStatusTimer();
    statusClearTimerRef.current = setTimeout(() => {
      setStatusBanner(null);
      statusClearTimerRef.current = null;
    }, delayMs);
  }, [clearPendingStatusTimer]);

  useEffect(() => () => clearPendingStatusTimer(), [clearPendingStatusTimer]);

  // Derived: UI always reads from `emails`, which switches based on search mode
  const emails = isSearchActive ? searchResults : folderEmails;
  const [settings, setSettings] = useState<UserSettings>(() => {
    const parsedSettings = loadPersistedSettings();
    
    const defaultSignature = parsedSettings.signature || '<p><br>--<br>Sent from GlowMail AI</p>';
    const signatures = parsedSettings.signatures || [{ id: 'default', name: 'Default', content: defaultSignature }];
    const legacyLayout = localStorage.getItem('glowmail_layout');
    
    const generateGlowMailId = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let id = 'GM-';
      for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
      return id;
    };

    return {
      server: {
        imapHost: 'imap.example.com',
        imapPort: 993,
        smtpHost: 'smtp.example.com',
        smtpPort: 465,
        secure: true,
        authMethod: parsedSettings.server?.authMethod || 'password',
      },
      signature: defaultSignature,
      signatures,
      defaultSignatureId: parsedSettings.defaultSignatureId || signatures[0]?.id,
      theme: parsedSettings.theme || 'dark',
      emailBackground: parsedSettings.emailBackground || '#09090b',
      fontColor: parsedSettings.fontColor || '#e4e4e7',
      composerFont: parsedSettings.composerFont || 'Involve',
      customFonts: parsedSettings.customFonts || [],
      delayedSending: parsedSettings.delayedSending || 0,
      syncInterval: parsedSettings.syncInterval ?? 5,
      keepFiltersAcrossFolders: parsedSettings.keepFiltersAcrossFolders ?? false,
      groupBy: parsedSettings.groupBy || 'none',
      layoutMode: parsedSettings.layoutMode || (legacyLayout === 'horizontal' ? 'horizontal' : 'vertical'),
      markAsReadDelay: parsedSettings.markAsReadDelay ?? 0,
      language: parsedSettings.language || 'en',
      availableTags: parsedSettings.availableTags || [
        { id: '1', name: 'work', color: '#3b82f6' },
        { id: '2', name: 'urgent', color: '#ef4444' },
        { id: '3', name: 'personal', color: '#10b981' },
        { id: '4', name: 'finance', color: '#f59e0b' },
        { id: '5', name: 'project', color: '#8b5cf6' },
      ],
      aiEnabled: true,
      aiProvider: parsedSettings.aiProvider || 'openai',
      aiApiKey: '',
      aiModel:
        parsedSettings.aiModel ||
        (parsedSettings.aiProvider === 'gemini'
          ? 'gemini-2.5-flash'
          : 'gpt-4.1-mini'),
      aiBaseUrl: parsedSettings.aiBaseUrl || '',
      folderColors: {},
      tigerMediaHub: {
        enabled: false,
        projectUrl: '',
        apiKey: '',
        userId: '',
        defaultFolder: '',
      },
      cryptoKeys: {},
      cryptoSignOutgoing: false,
      cryptoEncryptOutgoing: false,
      cryptoPreferredType: 'smime' as const,
      ...parsedSettings,
      account: {
        name: 'Me',
        email: 'me@example.com',
        ...parsedSettings.account,
        glowMailId: parsedSettings.account?.glowMailId || generateGlowMailId(),
      },
    };
  });

  useEffect(() => {
    persistSettings(settings);
  }, [settings]);

  useEffect(() => {
    loadSecureSettings()
      .then((secureSettings) => {
        setSettings((prev) => ({
          ...prev,
          aiApiKey: secureSettings.aiApiKey || prev.aiApiKey,
          tigerMediaHub: {
            ...prev.tigerMediaHub,
            apiKey: secureSettings.tigerMediaHubApiKey || prev.tigerMediaHub.apiKey,
          },
          cryptoKeys: {
            ...prev.cryptoKeys,
            ...secureSettings.cryptoKeys,
          },
        }));
      })
      .catch((error) => console.error('Failed to load secure settings', error));
  }, []);

  useEffect(() => {
    persistSecureSettings(settings).catch((error) => {
      console.error('Failed to persist secure settings', error);
    });
  }, [settings]);

  // Map IMAP folder names to icons
  const folderIcon = (name: string): string => {
    const lower = name.toLowerCase();
    if (lower === 'inbox') return 'inbox';
    if (lower.includes('sent')) return 'send';
    if (lower.includes('draft')) return 'file';
    if (lower.includes('spam') || lower.includes('junk')) return 'alert-circle';
    if (lower.includes('trash') || lower.includes('deleted')) return 'trash-2';
    if (lower.includes('outbox')) return 'clock';
    return 'folder';
  };

  const getCurrentAccountEmail = useCallback(() => {
    return getCredentialProfile()?.email || settings.account.email;
  }, [settings.account.email]);

  const hydrateCachedFolderTree = useCallback((cachedFolders: Folder[]) => {
    if (cachedFolders.length === 0) return [];

    const topLevel: Folder[] = [];
    const childMap = new Map<string, Folder[]>();

    cachedFolders.forEach(folder => {
      if (folder.parent) {
        const siblings = childMap.get(folder.parent) || [];
        siblings.push(folder);
        childMap.set(folder.parent, siblings);
      } else if (folder.id.includes('/')) {
        const parent = folder.id.substring(0, folder.id.lastIndexOf('/'));
        const siblings = childMap.get(parent) || [];
        siblings.push({ ...folder, parent });
        childMap.set(parent, siblings);
      } else {
        topLevel.push(folder);
      }
    });

    topLevel.forEach(folder => {
      const children = childMap.get(folder.id);
      if (children?.length) {
        folder.children = children;
      }
    });

    return topLevel;
  }, []);

  const mapMessages = useCallback((data: any, folder: string): Email[] => {
    return (data.emails || [])
      .filter((msg: any) => msg.uid)
      .map((msg: any) => ({
        id: String(msg.uid),
        folderId: folder,
        from: { id: msg.from?.email || '', name: decodeMime(msg.from?.name || ''), email: msg.from?.email || '' },
        to: (msg.to || []).map((a: any) => ({ id: a.email, name: decodeMime(a.name), email: a.email })),
        cc: (msg.cc || []).map((a: any) => ({ id: a.email, name: decodeMime(a.name), email: a.email })),
        subject: decodeMime(msg.subject || '(No Subject)'),
        snippet: decodeMime(msg.subject || ''),
        body: '',
        date: msg.date || new Date().toISOString(),
        read: (msg.flags || []).some((f: string) => f === '\\Seen' || f === 'Seen'),
        starred: (msg.flags || []).some((f: string) => f === '\\Flagged' || f === 'Flagged'),
        tags: [],
        attachments: msg.hasAttachments
          ? [{ id: `att-${msg.uid}-0`, name: 'attachment', size: 0, type: 'application/octet-stream', url: '' }]
          : (msg.attachments || []).map((att: any, i: number) => ({
              id: `att-${msg.uid}-${i}`,
              name: decodeMime(att.name || 'unnamed'),
              size: att.size || 0,
              type: att.type || 'application/octet-stream',
              url: '',
            })),
        headers: { messageId: msg.messageId || '', inReplyTo: msg.inReplyTo || '' },
      }));
  }, []);

  const collectContacts = useCallback((mapped: Email[]) => {
    const newContacts: Contact[] = [];
    mapped.forEach(e => {
      [e.from, ...(e.to || []), ...(e.cc || [])].forEach(c => {
        if (c.email && !newContacts.find(x => x.email === c.email) && c.email !== settings.account.email) {
          newContacts.push(c);
        }
      });
    });
    setContacts(prev => {
      const merged = [...prev];
      newContacts.forEach(c => {
        if (!merged.find(x => x.email === c.email)) merged.push(c);
      });
      return merged;
    });
  }, [settings.account.email]);

  // Helper: update both folderEmails and searchResults for mutations (read/star/delete/tags)
  const updateBothEmailStates = useCallback((updater: (prev: Email[]) => Email[]) => {
    setFolderEmails(updater);
    setSearchResults(updater);
  }, []);

  const upsertLocalEmail = useCallback((email: Email) => {
    updateBothEmailStates((prev) => {
      const existingIndex = prev.findIndex((item) => item.id === email.id);
      if (existingIndex === -1) {
        return [email, ...prev];
      }

      const next = [...prev];
      next[existingIndex] = {
        ...next[existingIndex],
        ...email,
      };
      return next;
    });
  }, [updateBothEmailStates]);

  const mergeFetchedEmails = useCallback((incoming: Email[], preserved: Email[]) => {
    const preservedMap = new Map(preserved.map((email) => [email.id, email]));

    return incoming.map((email) => {
      const cached = preservedMap.get(email.id);
      if (!cached) return email;

      return {
        ...email,
        from: cached.from?.email || cached.from?.name ? cached.from : email.from,
        to: email.to.length > 0 ? email.to : cached.to,
        cc: (email.cc && email.cc.length > 0) ? email.cc : cached.cc,
        bcc: (email.bcc && email.bcc.length > 0) ? email.bcc : cached.bcc,
        snippet: email.snippet || cached.snippet,
        body: cached.body || email.body,
        read: cached.read || email.read,
        starred: cached.starred || email.starred,
        tags: cached.tags.length > 0 ? cached.tags : email.tags,
        attachments: cached.attachments.length > 0 ? cached.attachments : email.attachments,
        cryptoInfo: cached.cryptoInfo || email.cryptoInfo,
        headers: Object.keys(cached.headers || {}).length > 0 ? cached.headers : email.headers,
      };
    });
  }, []);

  const estimateEmailPayloadBytes = useCallback((emailsToMeasure: Email[]) => {
    return emailsToMeasure.reduce((total, email) => {
      const headerBytes = JSON.stringify(email.headers || {}).length;
      const recipientsBytes =
        JSON.stringify(email.to || []).length +
        JSON.stringify(email.cc || []).length +
        JSON.stringify(email.bcc || []).length;
      const attachmentBytes = JSON.stringify(email.attachments || []).length;

      return total +
        (email.subject?.length || 0) +
        (email.snippet?.length || 0) +
        (email.body?.length || 0) +
        (email.from?.name?.length || 0) +
        (email.from?.email?.length || 0) +
        headerBytes +
        recipientsBytes +
        attachmentBytes;
    }, 0);
  }, []);

  const readCachedFolderEmailsWithTimeout = useCallback(async (
    accountEmail: string,
    folderPath: string,
    limit: number,
    offset = 0,
    timeoutMs = 300,
  ): Promise<{ emails: Email[]; completed: boolean }> => {
    if (!isDesktopCacheReady) {
      return { emails: [], completed: true };
    }

    const cachePromise = desktopCache
      .getCachedFolderEmails(accountEmail, folderPath, limit, offset)
      .then((emails) => ({ emails, completed: true }))
      .catch(() => ({ emails: [], completed: true }));

    const timeoutPromise = new Promise<{ emails: Email[]; completed: boolean }>((resolve) => {
      window.setTimeout(() => resolve({ emails: [], completed: false }), timeoutMs);
    });

    return Promise.race([cachePromise, timeoutPromise]);
  }, [isDesktopCacheReady]);

  const PAGE_SIZE = 20;
  const SEARCH_PAGE_SIZE = 20;
  const BACKGROUND_SYNC_PAGE_LIMIT = 1;
  const BACKGROUND_SYNC_FOLDER_LIMIT = 1;

  const notifyNewEmails = useCallback((newEmails: Email[]) => {
    if (newEmails.length === 0) return;

    // In-app toast
    if (newEmails.length === 1) {
      const e = newEmails[0];
      toast({
        title: `📬 ${e.from.name || e.from.email}`,
        description: e.subject || '(No Subject)',
      });
    } else {
      toast({
        title: `📬 ${newEmails.length} new emails`,
        description: newEmails.slice(0, 3).map(e => e.from.name || e.from.email).join(', '),
      });
    }

    // Browser / system notification
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        if (newEmails.length === 1) {
          const e = newEmails[0];
          new Notification(e.from.name || e.from.email, {
            body: e.subject || '(No Subject)',
            icon: '/pwa-192x192.png',
            tag: `new-email-${e.id}`,
          });
        } else {
          new Notification(`${newEmails.length} new emails`, {
            body: newEmails.slice(0, 3).map(e => e.from.name || e.from.email).join(', '),
            icon: '/pwa-192x192.png',
            tag: 'new-emails-batch',
          });
        }
      } catch (err) {
        console.warn('Notification error:', err);
      }
    }
  }, []);

  const syncFolderPagesToCache = useCallback(async (
    folder: string,
    totalEmailsHint?: number,
    startingPage = 2,
    knownLastUid?: number | null,
  ) => {
    if (!isDesktopCacheReady) return;

    const lockKey = `${getCurrentAccountEmail()}::${folder}`;
    if (backgroundSyncFoldersRef.current.has(lockKey)) return;

    backgroundSyncFoldersRef.current.add(lockKey);

    try {
      const accountEmail = getCurrentAccountEmail();
      const syncStartedAt = Date.now();
      let loadedCount = 0;
      let loadedBytes = 0;

      pushStatusBanner({
        tone: 'syncing',
        text: settings.language === 'ru'
          ? `Получаю список писем для ${folder}...`
          : `Fetching message list for ${folder}...`,
        phase: 'sync',
        startedAt: syncStartedAt,
      });

      await desktopCache.markFolderSyncStarted(accountEmail, folder, knownLastUid);

      // Step 1: Get all UIDs + total count in one fast call
      let totalFromServer = totalEmailsHint || 0;
      let allUids: number[] = [];

      try {
        const uidData = await mailApi.fetchAllUids(folder);
        allUids = (uidData.uids || []).map(Number);
        totalFromServer = Number(uidData.total) || allUids.length || totalFromServer;
      } catch {
        // Fallback: use the hint or initial page total
        if (!totalFromServer) {
          const firstPageData = await mailApi.fetchEmailList(folder, 1, PAGE_SIZE);
          totalFromServer = Number(firstPageData.total) || 0;
        }
      }

      // Step 2: Get cached UIDs to skip already-indexed emails
      let cachedUids = new Set<number>();
      try {
        const cached = await desktopCache.getCachedFolderEmails(accountEmail, folder, 10000, 0);
        cachedUids = new Set(cached.map(e => Number(e.id)).filter(n => !Number.isNaN(n)));
      } catch { /* ignore */ }

      // Step 3: Determine which UIDs still need fetching
      const uidsToFetch = allUids.filter(uid => !cachedUids.has(uid));
      const totalToSync = uidsToFetch.length;

      if (totalToSync === 0) {
        pushStatusBanner({
          tone: 'loading',
          text: settings.language === 'ru'
            ? `${folder}: все ${totalFromServer} писем уже проиндексированы`
            : `${folder}: all ${totalFromServer} emails already indexed`,
          phase: 'sync',
          startedAt: syncStartedAt,
          progress: { loaded: totalFromServer, total: totalFromServer, remaining: 0, loadedBytes },
        });
        await desktopCache.markFolderSyncFinished(accountEmail, folder, allUids[0] || null, null);
        return;
      }

      pushStatusBanner({
        tone: 'syncing',
        text: settings.language === 'ru'
          ? `Индексирую ${folder}: ${cachedUids.size} из ${totalFromServer} писем`
          : `Indexing ${folder}: ${cachedUids.size} of ${totalFromServer} emails`,
        detail: settings.language === 'ru'
          ? `${totalToSync} новых писем для индексации • загружаю по одному`
          : `${totalToSync} new emails to index • loading one by one`,
        phase: 'sync',
        startedAt: syncStartedAt,
        progress: {
          loaded: cachedUids.size,
          total: totalFromServer,
          remaining: totalToSync,
          loadedBytes,
        },
      });

      // Step 4: Fetch headers one by one — caches each as it arrives
      let successCount = 0;
      const BATCH_CACHE_SIZE = 10;
      let batchBuffer: Email[] = [];

      for (let i = 0; i < uidsToFetch.length; i++) {
        const uid = uidsToFetch[i];

        try {
          const headerData = await mailApi.fetchSingleHeader(folder, uid);
          const mapped = mapMessages([headerData], folder);

          if (mapped.length > 0) {
            batchBuffer.push(mapped[0]);
            collectContacts(mapped);
            loadedCount++;
          }
        } catch {
          // Skip failed headers silently
        }

        // Cache in small batches to reduce DB roundtrips
        if (batchBuffer.length >= BATCH_CACHE_SIZE || i === uidsToFetch.length - 1) {
          if (batchBuffer.length > 0) {
            try {
              await desktopCache.cacheEmails(accountEmail, folder, batchBuffer);
            } catch { /* ignore cache errors */ }
            batchBuffer = [];
          }
        }

        // Update progress every 5 emails
        if ((i + 1) % 5 === 0 || i === uidsToFetch.length - 1) {
          const currentLoaded = cachedUids.size + loadedCount;
          successCount = currentLoaded;
          loadedBytes = currentLoaded * 2048; // rough estimate
          pushStatusBanner({
            tone: 'syncing',
            text: settings.language === 'ru'
              ? `Индексирую ${folder}: ${currentLoaded} из ${totalFromServer} писем`
              : `Indexing ${folder}: ${currentLoaded} of ${totalFromServer} emails`,
            detail: settings.language === 'ru'
              ? `${Math.max(totalFromServer - currentLoaded, 0)} осталось`
              : `${Math.max(totalFromServer - currentLoaded, 0)} left`,
            phase: 'sync',
            startedAt: syncStartedAt,
            progress: {
              loaded: currentLoaded,
              total: totalFromServer,
              remaining: Math.max(totalFromServer - currentLoaded, 0),
              loadedBytes,
            },
            diagnostics: {
              step: `sync-email-${i + 1}-of-${uidsToFetch.length}`,
              folder,
              source: 'imap-single',
            },
          });
        }

        // Small delay to avoid hammering the server
        await new Promise(r => setTimeout(r, 50));
      }

      await desktopCache.markFolderSyncFinished(accountEmail, folder, allUids[0] || null, null);
    } catch (error) {
      console.warn(`Background cache sync failed for folder ${folder}:`, error);
      pushStatusBanner({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Background sync failed',
        detail: settings.language === 'ru'
          ? `Фоновая индексация ${folder} упала`
          : `Background indexing for ${folder} failed`,
        phase: 'error',
        startedAt: Date.now(),
        diagnostics: {
          step: 'background-sync-error',
          folder,
          source: 'sqlite+imap',
        },
      });
      await desktopCache.markFolderSyncFinished(
        getCurrentAccountEmail(),
        folder,
        null,
        error instanceof Error ? error.message : 'Background sync failed',
      );
    } finally {
      backgroundSyncFoldersRef.current.delete(lockKey);
      if (backgroundSyncFoldersRef.current.size === 0 && !isLoading && !isSearching) {
        scheduleStatusBannerClear();
      }
    }
  }, [collectContacts, getCurrentAccountEmail, isDesktopCacheReady, isLoading, isSearching, mapMessages, settings.language, estimateEmailPayloadBytes, pushStatusBanner, scheduleStatusBannerClear]);

  const runBackgroundFolderQueue = useCallback(async (folderList: Folder[]) => {
    if (!isDesktopCacheReady || backgroundSyncQueueRunningRef.current || folderList.length === 0) {
      return;
    }

    backgroundSyncQueueRunningRef.current = true;

    try {
      const accountEmail = getCurrentAccountEmail();
      const syncStates = await desktopCache.getFolderSyncStates(accountEmail);
      const stateMap = new Map(syncStates.map((state) => [state.folderPath, state]));
      const scoreFolder = (folder: Folder) => {
        const id = folder.id.toUpperCase();
        if (id === 'INBOX') return 0;
        if (folder.icon === 'send') return 1;
        if (folder.icon === 'file' || folder.icon === 'file-text') return 2;
        if (folder.icon === 'alert-circle') return 4;
        if (folder.icon === 'trash-2') return 5;
        return 3;
      };

      const queue = [...folderList]
        .sort((a, b) => {
          const priorityDiff = scoreFolder(a) - scoreFolder(b);
          if (priorityDiff !== 0) return priorityDiff;

          const aSync = stateMap.get(a.id)?.lastSyncFinishedAt || '';
          const bSync = stateMap.get(b.id)?.lastSyncFinishedAt || '';
          return aSync.localeCompare(bSync);
        })
        .slice(0, BACKGROUND_SYNC_FOLDER_LIMIT);

      for (const folder of queue) {
        await syncFolderPagesToCache(folder.id, undefined, 2, stateMap.get(folder.id)?.lastUid ?? null);
      }
    } catch (error) {
      console.warn('Background folder sync queue failed:', error);
    } finally {
      backgroundSyncQueueRunningRef.current = false;
    }
  }, [getCurrentAccountEmail, isDesktopCacheReady, syncFolderPagesToCache]);

  const loadFolders = useCallback(async () => {
    try {
      const accountEmail = getCurrentAccountEmail();

      if (isDesktopCacheReady) {
        const cachedFolders = await desktopCache.getCachedFolders(accountEmail);
        const hydratedCached = hydrateCachedFolderTree(cachedFolders);
        if (hydratedCached.length > 0) {
          setFolders(hydratedCached);
        }
      }

      const remoteFolders = await mailApi.fetchFolders();

      const flat: Folder[] = remoteFolders.map((f: any) => {
        const flags = (f.flags || []).join(' ').toLowerCase();
        const path = f.path || f.name;
        let icon = 'folder';
        if (path === 'INBOX') icon = 'inbox';
        else if (flags.includes('sent')) icon = 'send';
        else if (flags.includes('drafts')) icon = 'file-text';
        else if (flags.includes('junk')) icon = 'alert-circle';
        else if (flags.includes('trash')) icon = 'trash-2';
        else icon = folderIcon(decodeModifiedUtf7(f.name));

        const isChild = path.includes('/');
        return {
          id: path,
          name: decodeModifiedUtf7((f.name.split('/').pop() || f.name)),
          icon: isChild ? 'folder' : icon,
          parent: isChild ? path.substring(0, path.lastIndexOf('/')) : undefined,
        };
      });

      const topLevel: Folder[] = [];
      const childMap = new Map<string, Folder[]>();

      flat.forEach(f => {
        if (f.parent) {
          const siblings = childMap.get(f.parent) || [];
          siblings.push(f);
          childMap.set(f.parent, siblings);
        } else {
          topLevel.push(f);
        }
      });

      topLevel.forEach(f => {
        const kids = childMap.get(f.id);
        if (kids && kids.length > 0) {
          f.children = kids;
        }
      });

      topLevel.sort((a, b) => {
        if (a.id === 'INBOX') return -1;
        if (b.id === 'INBOX') return 1;
        return a.name.localeCompare(b.name);
      });

      if (topLevel.length > 0) {
        setFolders(topLevel);
        if (isDesktopCacheReady) {
          desktopCache.cacheFolders(accountEmail, flat).catch(console.error);
          // Skip background folder queue on startup to prevent UI freeze
          // runBackgroundFolderQueue(flat).catch(console.error);
        }
      }
    } catch (e) {
      console.error('Failed to load folders:', e);
    }
  }, [getCurrentAccountEmail, hydrateCachedFolderTree, isDesktopCacheReady, runBackgroundFolderQueue]);

  const fetchEmails = useCallback(async () => {
    const requestStartedAt = Date.now();
    setIsLoading(true);
    setConnectionError(null);
    pushStatusBanner({
      tone: 'loading',
      text: settings.language === 'ru'
        ? `Обновляю ${currentFolder}...`
        : `Refreshing ${currentFolder}...`,
      phase: 'refresh',
      startedAt: requestStartedAt,
      diagnostics: {
        step: 'refresh',
        folder: currentFolder,
      },
    });
    try {
      const accountEmail = getCurrentAccountEmail();
      let cachedEmails: Email[] = [];
      let cachedEmailsPromise: Promise<Email[]> | null = null;

      if (folders.length === 0) {
        pushStatusBanner({
          tone: 'loading',
          text: settings.language === 'ru'
            ? 'Загружаю структуру папок...'
            : 'Loading folder structure...',
          phase: 'folders',
          startedAt: requestStartedAt,
          diagnostics: {
            step: 'folders',
            folder: currentFolder,
          },
        });
        await loadFolders();
      }

      if (isDesktopCacheReady) {
        pushStatusBanner({
          tone: 'loading',
          text: settings.language === 'ru'
            ? `Открываю локальный кэш ${currentFolder}...`
            : `Opening local cache for ${currentFolder}...`,
          phase: 'cache',
          startedAt: requestStartedAt,
          diagnostics: {
            step: 'cache',
            folder: currentFolder,
            source: 'sqlite',
          },
        });
        cachedEmailsPromise = desktopCache
          .getCachedFolderEmails(accountEmail, currentFolder, PAGE_SIZE, 0)
          .catch(() => []);
        const quickCache = await readCachedFolderEmailsWithTimeout(accountEmail, currentFolder, PAGE_SIZE, 0);
        cachedEmails = quickCache.emails;
        if (quickCache.completed && cachedEmails.length > 0) {
          const cachedBytes = estimateEmailPayloadBytes(cachedEmails);
          setFolderEmails(cachedEmails);
          setCurrentPage(1);
          setHasMoreEmails(cachedEmails.length >= PAGE_SIZE);
          collectContacts(cachedEmails);
          pushStatusBanner({
            tone: 'loading',
            text: settings.language === 'ru'
              ? `Локальный кэш ${currentFolder} открыт`
              : `Opened local cache for ${currentFolder}`,
            detail: settings.language === 'ru'
              ? `${cachedEmails.length} писем уже под рукой`
              : `${cachedEmails.length} cached emails ready`,
            phase: 'cache',
            startedAt: requestStartedAt,
            progress: {
              loaded: cachedEmails.length,
              loadedBytes: cachedBytes,
            },
            diagnostics: {
              step: 'cache-hit',
              folder: currentFolder,
              source: 'sqlite',
            },
          });
        }
      }

      pushStatusBanner({
        tone: 'loading',
        text: settings.language === 'ru'
          ? `Получаю новые письма для ${currentFolder}...`
          : `Fetching latest mail for ${currentFolder}...`,
        detail: settings.language === 'ru'
          ? 'Тяну первую пачку с сервера и считаю прогресс'
          : 'Fetching the first server batch and calculating progress',
        phase: 'network',
        startedAt: requestStartedAt,
        progress: cachedEmails.length > 0
          ? {
              loaded: cachedEmails.length,
              loadedBytes: estimateEmailPayloadBytes(cachedEmails),
            }
          : undefined,
        diagnostics: {
          step: 'network',
          folder: currentFolder,
          source: 'imap',
        },
      });
      const data = await mailApi.fetchEmailList(currentFolder, 1, PAGE_SIZE);
      if (cachedEmailsPromise) {
        cachedEmails = await cachedEmailsPromise;
      }
      const mapped = mergeFetchedEmails(
        mapMessages(data, currentFolder),
        [
          ...cachedEmails,
          ...folderEmailsRef.current.filter((email) => email.folderId === currentFolder),
        ],
      );

      // Detect new emails (only after first fetch, only for INBOX)
      if (!isFirstFetchRef.current && currentFolder === 'INBOX') {
        const newEmails = mapped.filter(e => !knownEmailIdsRef.current.has(e.id) && !e.read);
        notifyNewEmails(newEmails);
      }
      isFirstFetchRef.current = false;

      // Update known IDs
      mapped.forEach(e => knownEmailIdsRef.current.add(e.id));

      const total = data.total || 0;
      const diagnostics = (data as any)?.diagnostics || {};
      const loadedBytes = Number(diagnostics.bytesTransferred) || estimateEmailPayloadBytes(mapped);
      setFolderEmails(mapped);
      setCurrentPage(1);
      setTotalEmails(total);
      setHasMoreEmails(mapped.length < total);
      setIsConnected(true);

      collectContacts(mapped);
      pushStatusBanner({
        tone: total > mapped.length ? 'syncing' : 'loading',
        text: settings.language === 'ru'
          ? `Загружено ${mapped.length} из ${total || mapped.length} писем`
          : `Loaded ${mapped.length} of ${total || mapped.length} emails`,
        detail: settings.language === 'ru'
          ? `${Math.max((total || mapped.length) - mapped.length, 0)} осталось • первая пачка уже доступна для чтения`
          : `${Math.max((total || mapped.length) - mapped.length, 0)} left • the first batch is already readable`,
        phase: total > mapped.length ? 'sync' : 'network',
        startedAt: requestStartedAt,
        progress: {
          loaded: mapped.length,
          total: total || mapped.length,
          remaining: Math.max((total || mapped.length) - mapped.length, 0),
          loadedBytes,
        },
        diagnostics: {
          step: 'network-complete',
          folder: currentFolder,
          source: diagnostics.source || 'imap',
          durationMs: Number(diagnostics.durationMs) || (Date.now() - requestStartedAt),
        },
      });
      if (isDesktopCacheReady) {
        desktopCache.cacheEmails(accountEmail, currentFolder, mapped).catch(console.error);
        // Only background-sync remaining pages if total > loaded, start from page 2
        if (total > PAGE_SIZE) {
          syncFolderPagesToCache(currentFolder, total, 2).catch(console.error);
        }
      }
    } catch (e: any) {
      console.error('fetchEmails error:', e);
      setConnectionError(e.message || 'Connection failed');
      pushStatusBanner({
        tone: 'error',
        text: e.message || 'Connection failed',
        detail: settings.language === 'ru'
          ? 'Список писем не загрузился, смотри диагностику ниже'
          : 'Mailbox list did not load, see diagnostics below',
        phase: 'error',
        startedAt: requestStartedAt,
        diagnostics: {
          step: 'network-error',
          folder: currentFolder,
        },
      });
    } finally {
      setIsLoading(false);
      if (backgroundSyncFoldersRef.current.size === 0) {
        scheduleStatusBannerClear();
      }
    }
  }, [currentFolder, loadFolders, folders.length, mapMessages, mergeFetchedEmails, collectContacts, notifyNewEmails, getCurrentAccountEmail, isDesktopCacheReady, syncFolderPagesToCache, settings.language, readCachedFolderEmailsWithTimeout, estimateEmailPayloadBytes, pushStatusBanner, scheduleStatusBannerClear]);

  useEffect(() => {
    if (!isDesktopCacheReady || folderEmails.length === 0) return;
    if (!folderEmails.every((email) => email.folderId === currentFolder)) return;

    desktopCache
      .cacheEmails(getCurrentAccountEmail(), currentFolder, folderEmails)
      .catch(console.error);
  }, [folderEmails, currentFolder, getCurrentAccountEmail, isDesktopCacheReady]);

  const loadMoreEmails = useCallback(async () => {
    if (isSearchActive) {
      if (isLoadingMore || !hasMoreSearchResults || !searchQuery.trim()) return;

      setIsLoadingMore(true);
        setSearchError(null);
      try {
        const accountEmail = getCurrentAccountEmail();
        const nextPage = searchPage + 1;
        let mapped: Email[] = [];
        let total = 0;
        let hasMore = false;

        if (isDesktopCacheReady) {
          const cached = await desktopCache.searchCachedEmails(
            accountEmail,
            currentFolder,
            searchQuery.trim(),
            SEARCH_PAGE_SIZE,
            (nextPage - 1) * SEARCH_PAGE_SIZE,
          );
          mapped = cached.emails;
          total = cached.total;
          hasMore = cached.hasMore;
        } else {
          const data = await mailApi.searchEmails(currentFolder, searchQuery.trim(), nextPage, SEARCH_PAGE_SIZE);
          mapped = mapMessages(data, currentFolder);
          total = Number(data.total) || mapped.length;
          hasMore = !!data.hasMore;
        }

        setSearchResults(prev => {
          const existingIds = new Set(prev.map(e => e.id));
          const newEmails = mapped.filter(e => !existingIds.has(e.id));
          return [...prev, ...newEmails];
        });
        setSearchPage(nextPage);
        if (Number.isFinite(total) && total > 0) {
          setSearchResultCount(total);
        }
        setHasMoreSearchResults(hasMore);

        collectContacts(mapped);
      } catch (e: any) {
        console.error('Search load more error:', e);
        setSearchError(e.message || 'Search failed');
      } finally {
        setIsLoadingMore(false);
      }
      return;
    }

    if (isLoadingMore || !hasMoreEmails) return;
    setIsLoadingMore(true);
    try {
      const nextPage = currentPage + 1;
      const data = await mailApi.fetchEmailList(currentFolder, nextPage, PAGE_SIZE);
      const mapped = mergeFetchedEmails(mapMessages(data, currentFolder), folderEmailsRef.current);

      setFolderEmails(prev => {
        const existingIds = new Set(prev.map(e => e.id));
        const newEmails = mapped.filter(e => !existingIds.has(e.id));
        return [...prev, ...newEmails];
      });
      setCurrentPage(nextPage);
      const totalLoaded = currentPage * PAGE_SIZE + mapped.length;
      setHasMoreEmails(totalLoaded < (data.total || totalEmails));

      collectContacts(mapped);
      if (isDesktopCacheReady) {
        desktopCache.cacheEmails(getCurrentAccountEmail(), currentFolder, mapped).catch(console.error);
      }
    } catch (e: any) {
      console.error('loadMoreEmails error:', e);
    } finally {
      setIsLoadingMore(false);
    }
  }, [currentFolder, currentPage, isLoadingMore, hasMoreEmails, totalEmails, mapMessages, mergeFetchedEmails, collectContacts, isSearchActive, hasMoreSearchResults, searchQuery, searchPage, isDesktopCacheReady, getCurrentAccountEmail]);

  // Auto-fetch on mount and folder change
  useEffect(() => {
    const hasCreds = !!getCredentialProfile();
    if (hasCreds) {
      // Clear search when folder changes
      setSearchQuery('');
      setIsSearchActive(false);
      setSearchError(null);
      setSearchResultCount(0);
      setSearchPage(1);
      setHasMoreSearchResults(false);
      fetchEmails();
    }
  }, [currentFolder, fetchEmails]);

  // Server-side search with debounce (subject/from/to/cc and, when IMAP server supports it, TEXT/BODY)
  // NO dependency on `emails` or `isSearchActive` to prevent loops/overwrites
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) {
      setSearchError(null);
      setIsSearching(false);
      setIsSearchActive(false);
      setSearchResults([]);
      setSearchResultCount(0);
      setSearchPage(1);
      setHasMoreSearchResults(false);
      return;
    }

    searchTimerRef.current = setTimeout(async () => {
      const hasCreds = !!getCredentialProfile();
      if (!hasCreds) return;

      const requestId = ++searchRequestIdRef.current;
      const accountEmail = getCurrentAccountEmail();

      setIsSearching(true);
      setIsSearchActive(true);
      setSearchError(null);
      try {
        let mapped: Email[] = [];
        let total = 0;
        let hasMore = false;

        if (isDesktopCacheReady) {
          const cached = await desktopCache.searchCachedEmails(
            accountEmail,
            currentFolder,
            trimmedQuery,
            SEARCH_PAGE_SIZE,
            0,
          );
          mapped = cached.emails;
          total = cached.total;
          hasMore = cached.hasMore;
        } else {
          const data = await mailApi.searchEmails(currentFolder, trimmedQuery, 1, SEARCH_PAGE_SIZE);
          mapped = mapMessages(data, currentFolder);
          total = Number.isFinite(Number(data.total)) ? Number(data.total) : mapped.length;
          hasMore = !!data.hasMore;
        }

        if (searchRequestIdRef.current !== requestId) return;

        setSearchResults(mapped);
        setSearchPage(1);
        setSearchResultCount(total);
        setHasMoreSearchResults(hasMore);
      } catch (e: any) {
        if (searchRequestIdRef.current !== requestId) return;
        console.error('Search error:', e);
        setSearchResults([]);
        setSearchPage(1);
        setSearchResultCount(0);
        setHasMoreSearchResults(false);
        setSearchError(e.message || 'Search failed');
      } finally {
        if (searchRequestIdRef.current === requestId) {
          setIsSearching(false);
        }
      }
    }, 500);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery, currentFolder, mapMessages, getCurrentAccountEmail, isDesktopCacheReady]);

  // Auto-sync interval
  useEffect(() => {
    const interval = settings.syncInterval;
    if (interval <= 0) return;
    const timer = setInterval(() => {
      const hasCreds = !!getCredentialProfile();
      if (hasCreds && !isSearchActive) fetchEmails();
    }, interval * 60 * 1000);
    return () => clearInterval(timer);
  }, [settings.syncInterval, fetchEmails, isSearchActive]);

  const markAsRead = (id: string) => {
    const uid = Number(id);
    updateBothEmailStates((prev) =>
      prev.map((e) => {
        if (e.id === id && !e.read) {
          if (!isNaN(uid) && uid > 0) {
            mailApi.setEmailFlags(currentFolder, uid, ['\\Seen']).catch(console.error);
          }
          return { ...e, read: true };
        }
        return e;
      })
    );
  };

  const markAsUnread = (id: string) => {
    const uid = Number(id);
    updateBothEmailStates((prev) =>
      prev.map((e) => {
        if (e.id === id && e.read) {
          if (!isNaN(uid) && uid > 0) {
            mailApi.setEmailFlags(currentFolder, uid, undefined, ['\\Seen']).catch(console.error);
          }
          return { ...e, read: false };
        }
        return e;
      })
    );
  };

  const toggleStar = (id: string) => {
    updateBothEmailStates((prev) =>
      prev.map((e) => {
        if (e.id === id) {
          const newStarred = !e.starred;
          if (newStarred) {
            mailApi.setEmailFlags(currentFolder, Number(id), ['\\Flagged']).catch(console.error);
          } else {
            mailApi.setEmailFlags(currentFolder, Number(id), undefined, ['\\Flagged']).catch(console.error);
          }
          return { ...e, starred: newStarred };
        }
        return e;
      })
    );
  };

  const handleDeleteEmail = (id: string) => {
    // Move to Trash via IMAP
    const trashFolder = folders.find(f => f.icon === 'trash-2')?.id || 'Trash';
    if (currentFolder === trashFolder) {
      mailApi.deleteEmail(currentFolder, Number(id)).catch(console.error);
    } else {
      mailApi.moveEmail(currentFolder, Number(id), trashFolder).catch(console.error);
    }
    if (isDesktopCacheReady) {
      desktopCache.removeCachedEmail(getCurrentAccountEmail(), currentFolder, id).catch(console.error);
    }
    updateBothEmailStates((prev) => prev.filter((e) => e.id !== id));
  };

  const moveEmailToFolder = (id: string, targetFolder: string) => {
    const uid = Number(id);
    if (!isNaN(uid) && uid > 0) {
      mailApi.moveEmail(currentFolder, uid, targetFolder).catch(console.error);
    }
    if (isDesktopCacheReady) {
      desktopCache.removeCachedEmail(getCurrentAccountEmail(), currentFolder, id).catch(console.error);
    }
    updateBothEmailStates((prev) => prev.filter((e) => e.id !== id));
  };

  const copyEmailToFolder = (id: string, targetFolder: string) => {
    const uid = Number(id);
    if (!isNaN(uid) && uid > 0) {
      mailApi.copyEmail(currentFolder, uid, targetFolder).catch(console.error);
    }
  };

  // Flatten folder tree for folder pickers
  const allFoldersFlat = useMemo(() => {
    const result: Folder[] = [];
    const walk = (list: Folder[]) => {
      list.forEach(f => {
        result.push(f);
        if (f.children) walk(f.children);
      });
    };
    walk(folders);
    return result;
  }, [folders]);

  const handleSendEmail = async (email: Partial<Email>) => {
    try {
      const toList = (email.to || []).map(c => c.email);
      const ccList = (email.cc || []).map(c => c.email);
      const bccList = (email.bcc || []).map(c => c.email);
      const subj = email.subject || '(No Subject)';
      const htmlBody = email.body || '';

      await mailApi.sendEmail({
        to: toList,
        cc: ccList,
        bcc: bccList,
        subject: subj,
        html: htmlBody,
        inReplyTo: email.headers?.inReplyTo,
        references: email.headers?.references,
      });

      // Build RFC 822 message and append to Sent folder via IMAP
      try {
        const fromAddr = `${settings.account.name} <${settings.account.email}>`;
        const dateLine = new Date().toUTCString();
        const boundary = `----=_Part_${Date.now()}`;
        const lines: string[] = [
          `From: ${fromAddr}`,
          `To: ${toList.join(', ')}`,
        ];
        if (ccList.length) lines.push(`Cc: ${ccList.join(', ')}`);
        lines.push(`Subject: ${subj}`);
        lines.push(`Date: ${dateLine}`);
        lines.push(`MIME-Version: 1.0`);
        if (email.headers?.inReplyTo) lines.push(`In-Reply-To: ${email.headers.inReplyTo}`);
        if (email.headers?.references) lines.push(`References: ${email.headers.references}`);
        lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
        lines.push('');
        // plain text part
        const plainText = htmlBody.replace(/<[^>]*>/g, '');
        lines.push(`--${boundary}`);
        lines.push('Content-Type: text/plain; charset=UTF-8');
        lines.push('Content-Transfer-Encoding: 8bit');
        lines.push('');
        lines.push(plainText);
        lines.push('');
        // html part
        lines.push(`--${boundary}`);
        lines.push('Content-Type: text/html; charset=UTF-8');
        lines.push('Content-Transfer-Encoding: 8bit');
        lines.push('');
        lines.push(htmlBody);
        lines.push('');
        lines.push(`--${boundary}--`);
        const rawMessage = lines.join('\r\n');

        // Try common sent folder names
        const sentFolder = folders.find(f =>
          ['Sent', 'INBOX.Sent', 'Sent Items', 'Sent Messages', 'Отправленные'].some(n =>
            f.name.toLowerCase() === n.toLowerCase() || f.id.toLowerCase() === n.toLowerCase()
          )
        );
        if (sentFolder) {
          await mailApi.appendToFolder(sentFolder.id, rawMessage, ['\\Seen']);
        }
      } catch (appendErr) {
        console.warn('Failed to append to Sent folder:', appendErr);
      }

      // Add to local sent list
      const newEmail: Email = {
        id: `e${Date.now()}`,
        folderId: 'Sent',
        from: { id: 'me', name: settings.account.name, email: settings.account.email },
        to: email.to || [],
        cc: email.cc || [],
        bcc: email.bcc || [],
        subject: email.subject || '(No Subject)',
        body: email.body || '',
        snippet: (email.body || '').replace(/<[^>]*>?/gm, '').substring(0, 50),
        date: new Date().toISOString(),
        read: true,
        starred: false,
        tags: [],
        attachments: email.attachments || [],
        headers: { messageId: `<${Date.now()}@local>` },
      };
      updateBothEmailStates((prev) => {
        const updated = email.id ? prev.filter(e => e.id !== email.id) : prev;
        return [newEmail, ...updated];
      });

      email.to?.forEach(addContact);
      email.cc?.forEach(addContact);
      email.bcc?.forEach(addContact);
    } catch (e: any) {
      console.error('Send failed:', e);
      throw e; // Let the compose component handle the error
    }
  };

  const saveDraft = (email: Partial<Email>) => {
    const newEmail: Email = {
      id: email.id || `e${Date.now()}`,
      folderId: 'Drafts',
      from: { id: 'me', name: settings.account.name, email: settings.account.email },
      to: email.to || [],
      cc: email.cc || [],
      bcc: email.bcc || [],
      subject: email.subject || '',
      body: email.body || '',
      snippet: (email.body || '').replace(/<[^>]*>?/gm, '').substring(0, 50),
      date: new Date().toISOString(),
      read: true,
      starred: false,
      tags: email.tags || [],
      attachments: email.attachments || [],
      headers: { messageId: `<${Date.now()}@local>` },
    };
    updateBothEmailStates((prev) => {
      const updated = email.id ? prev.filter(e => e.id !== email.id) : prev;
      return [newEmail, ...updated];
    });
  };

  const addContact = (contact: Contact) => {
    setContacts((prev) => {
      if (!prev.find((c) => c.email === contact.email)) {
        return [...prev, contact];
      }
      return prev;
    });
  };

  const updateSettings = (newSettings: Partial<UserSettings>) => {
    const generateGlowMailId = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let id = 'GM-';
      for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
      return id;
    };

    setSettings((prev) => ({
      ...prev,
      ...newSettings,
      account: {
        ...prev.account,
        ...newSettings.account,
        glowMailId:
          newSettings.account?.glowMailId ||
          prev.account?.glowMailId ||
          generateGlowMailId(),
      },
      server: {
        ...prev.server,
        ...newSettings.server,
      },
      tigerMediaHub: {
        ...prev.tigerMediaHub,
        ...newSettings.tigerMediaHub,
      },
    }));
  };

  const addFolder = (name: string) => {
    const newFolder: Folder = {
      id: name.toLowerCase().replace(/\s+/g, '-'),
      name,
      icon: 'folder',
    };
    setFolders((prev) => [...prev, newFolder]);
  };

  const updateEmailTags = (id: string, tags: string[]) => {
    updateBothEmailStates((prev) =>
      prev.map((e) => (e.id === id ? { ...e, tags } : e))
    );
  };

  const value = useMemo(
    () => ({
      folders,
      emails,
      contacts,
      settings,
      currentFolder,
      setCurrentFolder,
      searchQuery,
      setSearchQuery,
      markAsRead,
      markAsUnread,
      toggleStar,
      deleteEmail: handleDeleteEmail,
      moveEmailToFolder,
      copyEmailToFolder,
      sendEmail: handleSendEmail,
      saveDraft,
      addContact,
      updateSettings,
      fetchEmails,
      loadMoreEmails,
      addFolder,
      updateEmailTags,
      isLoading,
      isLoadingMore,
      hasMoreEmails,
      totalEmails,
      isConnected,
      connectionError,
      allFoldersFlat,
      isSearching,
      isSearchActive,
      searchResultCount,
      hasMoreSearchResults,
      searchError,
      upsertLocalEmail,
      statusBanner,
    }),
    [folders, emails, contacts, settings, currentFolder, searchQuery, isLoading, isLoadingMore, hasMoreEmails, totalEmails, isConnected, connectionError, fetchEmails, loadMoreEmails, allFoldersFlat, isSearching, isSearchActive, searchResultCount, hasMoreSearchResults, searchError, upsertLocalEmail, statusBanner]
  );

  return <MailContext.Provider value={value}>{children}</MailContext.Provider>;
}

export const useMail = () => {
  const context = useContext(MailContext);
  if (context === undefined) {
    throw new Error('useMail must be used within a MailProvider');
  }
  return context;
};
