// Regra de OWNER: o e-mail abaixo é sempre tratado como proprietário (acesso total).
// O mesmo e-mail é promovido a admin no banco (trigger em supabase/migrations/..._005_owner_auto_admin.sql).
export const OWNER_EMAIL = (
  process.env.NEXT_PUBLIC_OWNER_EMAIL || 'gtdadosfreeoficial@gmail.com'
)
  .trim()
  .toLowerCase();

export function isOwnerEmail(email?: string | null): boolean {
  return !!email && email.trim().toLowerCase() === OWNER_EMAIL;
}

export function isOwner(user?: { email?: string | null } | null): boolean {
  return isOwnerEmail(user?.email);
}
