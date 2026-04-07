import { useState, useEffect, useRef } from 'react';
import { MailProvider, useMail } from '../store';
import { Layout } from '../components/glowmail/Layout';
import { EmailList } from '../components/glowmail/EmailList';
import { EmailDetail } from '../components/glowmail/EmailDetail';
import { Compose } from '../components/glowmail/Compose';
import { Email } from '../types';
import { Toaster } from 'react-hot-toast';
import { AnimatePresence } from 'framer-motion';
import Login from './Login';
import * as mailApi from '../lib/mail-api';
import * as desktopCache from '../lib/desktop/cache';
import { saveCredentials, hasCredentials, loadCredentials } from '../lib/credentials';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';

const COMPOSE_CHANNEL_NAME = 'glowmail-compose-channel';

function parseRecipientEmails(value: string) {
  return value
    .split(/[,\n;]+/)
    .map((email) => email.trim())
    .filter(Boolean);
}

function MailApp() {
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [composeData, setComposeData] = useState<Partial<Email> | null>(null);
  const { markAsRead, settings, sendEmail, saveDraft, currentFolder, emails, upsertLocalEmail } = useMail();
  const emailLoadRequestIdRef = useRef(0);

  // Get sorted email list for next/prev navigation
  const folderEmails = emails.filter(e => e.folderId === currentFolder)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const selectedIdx = selectedEmail ? folderEmails.findIndex(e => e.id === selectedEmail.id) : -1;
  const hasPrev = selectedIdx > 0;
  const hasNext = selectedIdx >= 0 && selectedIdx < folderEmails.length - 1;
  const handleNextEmail = () => {
    if (hasNext) {
      const next = folderEmails[selectedIdx + 1];
      handleSelectEmail(next);
    }
  };
  const handlePrevEmail = () => {
    if (hasPrev) {
      const prev = folderEmails[selectedIdx - 1];
      handleSelectEmail(prev);
    }
  };

  // Listen for messages from detached composer window
  useEffect(() => {
    const handleComposePayload = (payload: any) => {
      if (payload?.type === 'glowmail-compose') {
        const { to, cc, bcc, subject, body } = payload;
        const toContacts = parseRecipientEmails(to || '').map((email: string) => ({
          id: email, name: email, email,
        }));
        const ccContacts = parseRecipientEmails(cc || '').map((email: string) => ({
          id: email, name: email, email,
        }));
        const bccContacts = parseRecipientEmails(bcc || '').map((email: string) => ({
          id: email, name: email, email,
        }));
        sendEmail({ to: toContacts, cc: ccContacts, bcc: bccContacts, subject, body });
      }
      if (payload?.type === 'glowmail-draft') {
        const { to, cc, bcc, subject, body } = payload;
        const toContacts = parseRecipientEmails(to || '').map((email) => ({ id: email, name: email, email }));
        const ccContacts = parseRecipientEmails(cc || '').map((email) => ({ id: email, name: email, email }));
        const bccContacts = parseRecipientEmails(bcc || '').map((email) => ({ id: email, name: email, email }));
        saveDraft({ to: toContacts, cc: ccContacts, bcc: bccContacts, subject, body });
      }
    };

    const handler = (event: MessageEvent) => {
      handleComposePayload(event.data);
    };

    window.addEventListener('message', handler);
    const broadcastChannel = typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel(COMPOSE_CHANNEL_NAME)
      : null;
    broadcastChannel?.addEventListener('message', (event) => {
      handleComposePayload(event.data);
    });

    return () => {
      window.removeEventListener('message', handler);
      broadcastChannel?.close();
    };
  }, [sendEmail, saveDraft]);

  useEffect(() => {
    if (settings.theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else if (settings.theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      if (window.matchMedia('(prefers-color-scheme: light)').matches) {
        document.documentElement.setAttribute('data-theme', 'light');
      } else {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    }
  }, [settings.theme]);

  useEffect(() => {
    const styleId = 'custom-fonts-style';
    let styleEl = document.getElementById(styleId);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }

    const fontFaces = settings.customFonts?.map(font => `
      @font-face {
        font-family: '${font.name}';
        src: url('${font.url}') format('woff2');
        font-weight: normal;
        font-style: normal;
      }
    `).join('\n') || '';

    styleEl.innerHTML = fontFaces;
  }, [settings.customFonts]);

  const escapeHtml = (value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  /** Convert plain text to rich HTML: auto-link URLs, format > quote chains as blockquotes */
  const formatPlainTextAsHtml = (text: string): string => {
    let html = escapeHtml(text);

    // Convert URLs to clickable links
    html = html.replace(
      /https?:\/\/[^\s<>&"')\]]+/g,
      url => `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#6c8aff">${url}</a>`
    );

    // Convert email addresses to mailto links
    html = html.replace(
      /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g,
      (email) => `<a href="mailto:${email}" style="color:#6c8aff">${email}</a>`
    );

    // Convert > quoted lines into styled blockquotes
    const lines = html.split('\n');
    const result: string[] = [];
    let currentDepth = 0;

    for (const line of lines) {
      // Count leading &gt; markers
      const match = line.match(/^((&gt;\s*)+)/);
      const depth = match ? (match[0].match(/&gt;/g) || []).length : 0;

      // Close/open blockquotes to match depth
      while (currentDepth > depth) {
        result.push('</blockquote>');
        currentDepth--;
      }
      while (currentDepth < depth) {
        result.push('<blockquote style="margin:4px 0;padding:0 12px;border-left:3px solid #6c8aff;color:#666">');
        currentDepth++;
      }

      const cleanLine = depth > 0 ? line.replace(/^(&gt;\s*)+/, '') : line;
      result.push(cleanLine);
    }

    while (currentDepth > 0) {
      result.push('</blockquote>');
      currentDepth--;
    }

    return `<div style="white-space:pre-wrap;line-height:1.55;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:14px">${result.join('\n')}</div>`;
  };

  const buildRenderableEmailBody = (full: any) => {
    const bodyHtml = typeof full?.bodyHtml === 'string' ? full.bodyHtml.trim() : '';
    const html = typeof full?.html === 'string' ? full.html.trim() : '';
    const bodyText = typeof full?.bodyText === 'string' ? full.bodyText.trim() : '';
    const text = typeof full?.text === 'string' ? full.text.trim() : '';

    // Prefer HTML from any available field
    const resolvedHtml = bodyHtml || html;
    const resolvedText = bodyText || text;
    const htmlHasTags = /<\/?[a-z][\s\S]*>/i.test(resolvedHtml);

    if (resolvedHtml && htmlHasTags) return resolvedHtml;

    // Check if text actually contains HTML (misclassified)
    if (resolvedText && /<\/?[a-z][\s\S]*>/i.test(resolvedText)) {
      return resolvedText;
    }

    // Pure plain text — format nicely with links and blockquotes
    if (resolvedText) {
      return formatPlainTextAsHtml(resolvedText);
    }

    return settings.language === 'ru'
      ? '<p style="opacity:0.7">Письмо загружается... Оставайтесь на связи</p>'
      : '<p style="opacity:0.7">Email is loading... Stay tuned</p>';
  };

  const normalizeRenderableEmail = (email: Email): Email => {
    const fromEmail = typeof email.from?.email === 'string' ? email.from.email.trim() : '';
    const fromName = typeof email.from?.name === 'string' ? email.from.name.trim() : '';
    const subject = typeof email.subject === 'string' ? email.subject.trim() : '';
    const snippet = typeof email.snippet === 'string' ? email.snippet : '';
    const body = typeof email.body === 'string' ? email.body : '';

    return {
      ...email,
      from: {
        ...email.from,
        id: fromEmail || fromName || 'unknown',
        name: fromName || fromEmail || '(Unknown)',
        email: fromEmail,
      },
      subject: subject || '(No Subject)',
      snippet,
      body,
    };
  };

  const handleSelectEmail = async (email: Email) => {
    const requestId = ++emailLoadRequestIdRef.current;
    const normalizedEmail = normalizeRenderableEmail(email);
    setSelectedEmail(normalizedEmail);
    const delay = settings.markAsReadDelay ?? 0;
    if (delay > 0) {
      setTimeout(() => markAsRead(email.id), delay * 1000);
    } else {
      markAsRead(email.id);
    }

    // Fetch full body from IMAP if not already loaded
    if (!normalizedEmail.body) {
      try {
        const creds = await loadCredentials();
        if (creds && await desktopCache.isDesktopRuntime()) {
          const cached = await desktopCache.getCachedEmailDetail(creds.email, currentFolder, email.id);
          if (cached?.body && emailLoadRequestIdRef.current === requestId) {
            const enrichedCached = normalizeRenderableEmail({
              ...normalizedEmail,
              ...cached,
              read: true,
            });
            upsertLocalEmail(enrichedCached);
            setSelectedEmail(enrichedCached);
            return;
          }
        }

        const full = await mailApi.fetchEmailBody(currentFolder, Number(email.id));
        if (emailLoadRequestIdRef.current !== requestId) {
          return;
        }
        
        // Map attachments from fetch response
        const fetchedAttachments = (full.attachments || []).map((att: any, i: number) => ({
          id: `att-${email.id}-${i}`,
          name: att.name || 'unnamed',
          size: att.size || 0,
          type: att.type || 'application/octet-stream',
          url: att.contentBase64 ? `data:${att.type || 'application/octet-stream'};base64,${att.contentBase64}` : '',
        }));

        const enriched = normalizeRenderableEmail({
          ...normalizedEmail,
          body: buildRenderableEmailBody(full),
          read: true,
          attachments: fetchedAttachments.length > 0 ? fetchedAttachments : normalizedEmail.attachments,
          cryptoInfo: full.cryptoInfo || undefined,
        });
        upsertLocalEmail(enriched);
        setSelectedEmail(enriched);
      } catch (e) {
        console.error('Failed to fetch email body:', e);
        if (emailLoadRequestIdRef.current === requestId) {
          setSelectedEmail((current) => {
            if (!current || current.id !== email.id || current.body) return current;
            return {
              ...current,
              body: settings.language === 'ru'
                ? '<p style="opacity:0.7">Не удалось загрузить письмо. Попробуй открыть его ещё раз.</p>'
                : '<p style="opacity:0.7">Failed to load email. Try opening it again.</p>',
            };
          });
        }
      }
    }
  };

  const handleReply = (type: 'reply' | 'replyAll' | 'forward', email: Email, quickReplyText?: string) => {
    const normalizedEmail = normalizeRenderableEmail(email);
    const myEmail = settings.account.email;
    let subject = normalizedEmail.subject;
    let to: any[] = [];
    let cc: any[] = [];

    const dateStr = new Date(normalizedEmail.date).toLocaleString();
    const fromStr = `${normalizedEmail.from.name} <${normalizedEmail.from.email}>`;
    const toStr = normalizedEmail.to.map(c => `${c.name} <${c.email}>`).join(', ');
    const ccStr = normalizedEmail.cc?.length ? normalizedEmail.cc.map(c => `${c.name} <${c.email}>`).join(', ') : '';

    let quoteHeader = `<p><b>${settings.language === 'ru' ? 'От' : 'From'}:</b> ${fromStr}<br>`;
    quoteHeader += `<b>${settings.language === 'ru' ? 'Кому' : 'To'}:</b> ${toStr}<br>`;
    if (ccStr) quoteHeader += `<b>${settings.language === 'ru' ? 'Копия' : 'Cc'}:</b> ${ccStr}<br>`;
    quoteHeader += `<b>${settings.language === 'ru' ? 'Дата' : 'Date'}:</b> ${dateStr}<br>`;
    quoteHeader += `<b>${settings.language === 'ru' ? 'Тема' : 'Subject'}:</b> ${normalizedEmail.subject}</p>`;

    const body = quickReplyText
      ? `<p>${quickReplyText}</p><br><br><hr>${quoteHeader}<blockquote>${normalizedEmail.body}</blockquote>`
      : `<br><br><hr>${quoteHeader}<blockquote>${normalizedEmail.body}</blockquote>`;

    if (type === 'reply') {
      subject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
      to = [normalizedEmail.from];
    } else if (type === 'replyAll') {
      subject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
      to = [normalizedEmail.from, ...normalizedEmail.to].filter(
        (c, index, self) => index === self.findIndex((t) => t.email === c.email) && c.email.toLowerCase() !== myEmail.toLowerCase()
      );
      cc = (normalizedEmail.cc || []).filter(c => c.email.toLowerCase() !== myEmail.toLowerCase());
    } else if (type === 'forward') {
      subject = subject.startsWith('Fwd:') ? subject : `Fwd: ${subject}`;
      to = [];
    }

    setComposeData({ to, cc, subject, body });
  };

  const handleEditDraft = (email: Email) => {
    setComposeData({
      to: email.to,
      cc: email.cc,
      bcc: email.bcc,
      subject: email.subject,
      body: email.body,
      id: email.id,
    });
  };

  const renderEmailDetail = () => (
    <AnimatePresence mode="wait">
      {selectedEmail ? (
         <EmailDetail
          key={selectedEmail.id}
          email={selectedEmail}
          onBack={() => setSelectedEmail(null)}
          onReply={handleReply}
          onEditDraft={handleEditDraft}
          onNext={handleNextEmail}
          onPrev={handlePrevEmail}
          hasNext={hasNext}
          hasPrev={hasPrev}
        />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center h-full" style={{ color: '#728785' }}>
          <div className="w-16 h-16 bg-[#EDF7F3] rounded-full flex items-center justify-center mb-4" style={{ boxShadow: '0 0 0 1px rgba(46, 226, 177, 0.24), 0 0 14px rgba(46, 226, 177, 0.18)' }}>
            <svg className="w-8 h-8 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <p>{settings.language === 'ru' ? 'Выберите письмо для чтения' : 'Select an email to read'}</p>
        </div>
      )}
    </AnimatePresence>
  );

  const layoutMode = settings.layoutMode || 'vertical';

  return (
    <Layout onCompose={(prefill) => {
      if (prefill?.to) {
        setComposeData({ to: [{ id: prefill.to, name: prefill.to.split('@')[0], email: prefill.to }] });
      } else {
        setComposeData({});
      }
    }}>
      <div className="flex h-full relative">
        {/* Desktop layout */}
        <div className="hidden lg:flex flex-1 min-w-0 relative">
          {layoutMode === 'vertical' ? (
            <ResizablePanelGroup direction="horizontal" className="h-full">
              <ResizablePanel defaultSize={35} minSize={25} maxSize={50}>
                <EmailList onSelect={handleSelectEmail} onEditDraft={handleEditDraft} selectedEmailId={selectedEmail?.id} />
              </ResizablePanel>
              <ResizableHandle withHandle className="bg-[#E2ECE8] hover:bg-[rgba(22,201,150,0.3)] transition-colors data-[resize-handle-active]:bg-[rgba(22,201,150,0.5)]" />
              <ResizablePanel defaultSize={65} minSize={40}>
                <div className="h-full flex flex-col relative" style={{ background: '#F7FBFA' }}>
                  {renderEmailDetail()}
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          ) : (
            <ResizablePanelGroup direction="vertical" className="h-full">
              <ResizablePanel defaultSize={40} minSize={20} maxSize={70}>
                <EmailList onSelect={handleSelectEmail} onEditDraft={handleEditDraft} selectedEmailId={selectedEmail?.id} />
              </ResizablePanel>
              <ResizableHandle withHandle className="bg-[#E2ECE8] hover:bg-[rgba(22,201,150,0.3)] transition-colors data-[resize-handle-active]:bg-[rgba(22,201,150,0.5)]" />
              <ResizablePanel defaultSize={60} minSize={25}>
                <div className="h-full flex flex-col relative" style={{ background: '#F7FBFA' }}>
                  {renderEmailDetail()}
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          )}
        </div>

        {/* Mobile: stacked */}
        <div className="lg:hidden flex-1 flex flex-col min-w-0">
          <EmailList onSelect={handleSelectEmail} onEditDraft={handleEditDraft} selectedEmailId={selectedEmail?.id} />
        </div>

        <div className="lg:hidden">
          <AnimatePresence>
            {selectedEmail && (
              <EmailDetail
                key={selectedEmail.id}
                email={selectedEmail}
                onBack={() => setSelectedEmail(null)}
                onReply={handleReply}
                onEditDraft={handleEditDraft}
                onNext={handleNextEmail}
                onPrev={handlePrevEmail}
                hasNext={hasNext}
                hasPrev={hasPrev}
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {composeData !== null && (
          <Compose
            initialData={composeData}
            onClose={() => setComposeData(null)}
          />
        )}
      </AnimatePresence>
    </Layout>
  );
}

const Index = () => {
  const [loggedIn, setLoggedIn] = useState(() => hasCredentials());

  if (!loggedIn) {
    return <Login onLogin={async (creds) => {
      await saveCredentials(creds);
      setLoggedIn(true);
    }} />;
  }

  return (
    <MailProvider>
      <MailAppWithCreds />
      <Toaster
        position="bottom-center"
        toastOptions={{
          style: {
            background: '#FFFFFF',
            color: '#1E2A29',
            border: '1px solid #E2ECE8',
            boxShadow: '0 24px 64px rgba(14, 39, 35, 0.12)',
          },
          success: {
            iconTheme: {
              primary: '#11C89A',
              secondary: '#FFFFFF',
            },
          },
        }}
      />
    </MailProvider>
  );
};

/** Wrapper that applies saved credentials to the store on mount */
function MailAppWithCreds() {
  const { updateSettings } = useMail();

  useEffect(() => {
    loadCredentials()
      .then((creds) => {
        if (!creds) return;
        updateSettings({
          account: { name: creds.name, email: creds.email },
          server: {
            imapHost: creds.imapHost,
            imapPort: creds.imapPort,
            smtpHost: creds.smtpHost,
            smtpPort: creds.smtpPort,
            secure: true,
            authMethod: 'app-password',
          },
        });
      })
      .catch((error) => console.error('Failed to load secure credentials', error));
  }, []);

  return <MailApp />;
}

export default Index;
