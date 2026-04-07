export type EmailIdentity = {
  id: string;
  folderId: string;
};

export function getEmailIdentityKey(email: EmailIdentity): string {
  const folderId = typeof email.folderId === 'string' && email.folderId.trim() ? email.folderId.trim() : 'unknown-folder';
  const id = typeof email.id === 'string' && email.id.trim() ? email.id.trim() : 'unknown-id';
  return `${folderId}::${id}`;
}

export function getEmailIdentityKeyFromParts(folderId: string, id: string): string {
  return getEmailIdentityKey({ folderId, id });
}

export function hasSameEmailIdentity(a: EmailIdentity | null | undefined, b: EmailIdentity | null | undefined): boolean {
  if (!a || !b) return false;
  return getEmailIdentityKey(a) === getEmailIdentityKey(b);
}
