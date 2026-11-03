/** Extrai o token de uma plaquinha a partir do conteúdo lido do QR (URL …/q/TOKEN) ou do código digitado. */
export function extractToken(text: string): string | null {
  const t = text.trim();
  const m = t.match(/\/q\/([A-Za-z0-9]{4,32})(?:[/?#]|$)/);
  if (m) return m[1].toUpperCase();
  if (/^[A-Za-z0-9]{4,32}$/.test(t)) return t.toUpperCase();
  return null;
}
