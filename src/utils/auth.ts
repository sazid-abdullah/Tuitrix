export function isOwnerEmail(email?: string | null): boolean {
  if (!email) return false;
  const ownerEmail = (import.meta.env.VITE_OWNER_EMAIL || 'abdullahsazid109@gmail.com').trim().toLowerCase();
  return email.trim().toLowerCase() === ownerEmail;
}
