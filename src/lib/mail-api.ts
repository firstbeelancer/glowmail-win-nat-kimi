import { invokeBackendFunction } from "@/lib/backend/transport";
import {
  pgpDecryptMessage as localPgpDecryptMessage,
  pgpEncryptMessage as localPgpEncryptMessage,
  pgpSignMessage as localPgpSignMessage,
  pgpVerifySignature as localPgpVerifySignature,
  smimeCertInfo as localSmimeCertInfo,
} from "@/lib/crypto";
import { loadCredentials } from "./credentials";

export type MailCredentials = {
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  email: string;
  password: string;
};

async function getCredentials(): Promise<MailCredentials | null> {
  return loadCredentials();
}

const IMAP_TIMEOUT_MS = 45000; // 20s max per IMAP call
const IMAP_MAX_RETRIES = 3;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout: ${label} took longer than ${ms / 1000}s`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

async function callImapWithRetry(action: string, extra: Record<string, unknown> = {}) {
  let lastError: any;
  for (let attempt = 0; attempt <= IMAP_MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // Wait before retry: 1s, 2s
      await new Promise(r => setTimeout(r, attempt * 1000));
    }
    try {
      return await callImap(action, extra);
    } catch (e: any) {
      lastError = e;
      // Don't retry on auth errors
      if (e.message?.includes('LOGIN') || e.message?.includes('AUTH') || e.message?.includes('Not logged in')) {
        throw e;
      }
    }
  }
  throw lastError;
}

async function callImap(action: string, extra: Record<string, unknown> = {}) {
  const creds = await getCredentials();
  if (!creds) throw new Error("Not logged in");

  const data = await withTimeout(
    invokeBackendFunction("imap-proxy", {
      action,
      host: creds.imapHost,
      port: creds.imapPort,
      username: creds.email,
      password: creds.password,
      ...extra,
    }),
    IMAP_TIMEOUT_MS,
    `imap:${action}`
  );

  return data;
}

export async function fetchFolders() {
  const data = await callImapWithRetry("folders");
  return data.folders || [];
}

export async function fetchEmailList(folder = "INBOX", page = 1, pageSize = 20) {
  const data = await callImapWithRetry("list", { folder, page, pageSize });
  return data;
}

export async function fetchAllUids(folder = "INBOX") {
  const data = await callImapWithRetry("uid-list", { folder });
  return data;
}

export async function fetchSingleHeader(folder: string, uid: number) {
  const data = await callImap("fetch-single-header", { folder, uid });
  return data;
}

export async function fetchEmailBody(folder: string, uid: number) {
  const data = await callImap("fetch", { folder, uid, includeAttachmentContent: false });
  return data;
}

export async function setEmailFlags(folder: string, uid: number, addFlags?: string[], removeFlags?: string[]) {
  return callImap("flags", { folder, uid, addFlags, removeFlags });
}

export async function moveEmail(folder: string, uid: number, targetFolder: string) {
  return callImap("move", { folder, uid, targetFolder });
}

export async function copyEmail(folder: string, uid: number, targetFolder: string) {
  return callImap("copy", { folder, uid, targetFolder });
}

export async function deleteEmail(folder: string, uid: number) {
  return callImap("delete", { folder, uid });
}

export async function fetchAttachmentContent(folder: string, uid: number, attachmentIndex: number) {
  const data = await callImap("fetch-attachment", { folder, uid, attachmentIndex });
  return data;
}

export async function searchEmails(folder: string, query: string, page = 1, pageSize = 30) {
  const data = await callImap("search", { folder, query, page, pageSize });
  return data;
}

export async function reindexSearchCache(folder = "INBOX", limit = 50, cursor: number | null = null) {
  const data = await callImap("reindex-search-cache", { folder, limit, cursor });
  return data;
}

export async function appendToFolder(folder: string, rawMessage: string, flags?: string[]) {
  return callImap("append", { folder, rawMessage, flags });
}

export async function sendEmail(params: {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html?: string;
  text?: string;
  inReplyTo?: string;
  references?: string;
}) {
  const creds = await getCredentials();
  if (!creds) throw new Error("Not logged in");

  return invokeBackendFunction("smtp-proxy", {
    host: creds.smtpHost,
    port: creds.smtpPort,
    username: creds.email,
    password: creds.password,
    from: creds.email,
    ...params,
  });
}

export async function pgpVerifySignature(params: {
  armoredMessage?: string;
  cleartext?: string;
  publicKeyArmored: string;
}) {
  return localPgpVerifySignature(params);
}

export async function pgpDecryptMessage(params: {
  armoredMessage: string;
  privateKeyArmored: string;
  passphrase?: string;
}) {
  return localPgpDecryptMessage(params);
}

export async function pgpSignMessage(params: {
  text: string;
  privateKeyArmored: string;
  passphrase?: string;
}) {
  return localPgpSignMessage(params);
}

export async function pgpEncryptMessage(params: {
  text: string;
  recipientPublicKeys: string[];
  privateKeyArmored?: string;
  passphrase?: string;
}) {
  return localPgpEncryptMessage(params);
}

export async function smimeCertInfo(certPem: string) {
  return localSmimeCertInfo(certPem);
}

export async function sendToTigerMediaHub(params: {
  projectUrl: string;
  apiKey: string;
  userId: string;
  folder?: string;
  fileName: string;
  fileBase64: string;
  fileType: string;
  glowMailId?: string;
  glowMailEmail?: string;
}) {
  const response = await fetch(
    `${params.projectUrl.replace(/\/$/, "")}/functions/v1/external-upload`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify({
        userId: params.userId,
        folder: params.folder || "",
        fileName: params.fileName,
        fileBase64: params.fileBase64,
        fileType: params.fileType || "application/octet-stream",
        glowMailId: params.glowMailId || "",
        glowMailEmail: params.glowMailEmail || "",
      }),
    },
  );

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error || `TMH returned ${response.status}`);
  }

  return { success: true, ...data };
}
