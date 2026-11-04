export function isOwnerEmail(email?: string | null): boolean {
  if (!email) return false;
  const ownerEmail = (import.meta.env.VITE_OWNER_EMAIL || 'abdullahsazid109@gmail.com').trim().toLowerCase();
  return email.trim().toLowerCase() === ownerEmail;
}

export function sanitizePlaceholder(val?: string | null): string {
  if (!val) return '';
  const trimmed = val.trim();
  const lower = trimmed.toLowerCase();
  if (lower === 'none' || lower === 'null' || lower === 'undefined' || lower === 'n/a') {
    return '';
  }
  return trimmed;
}
