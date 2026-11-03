/**
 * URL pública da aplicação. Usa NEXT_PUBLIC_APP_URL; sem ela, cai para a origem da requisição
 * (navegador ou request no servidor). Nada de localhost fixo.
 */
export function getPublicAppUrl(fallbackOrigin?: string): string {
  const fromEnv = (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');
  if (fromEnv) return fromEnv;
  if (typeof window !== 'undefined') return window.location.origin;
  return (fallbackOrigin || '').replace(/\/+$/, '');
}

/**
 * Domínio PERMANENTE dos QR Codes (o que fica impresso nas plaquinhas).
 * Usa NEXT_PUBLIC_QR_BASE_URL; se não existir, cai para NEXT_PUBLIC_APP_URL (comportamento antigo).
 * Assim o domínio do aplicativo pode mudar sem alterar o endereço dos QRs.
 */
export function getQrBaseUrl(fallbackOrigin?: string): string {
  const fromEnv = (process.env.NEXT_PUBLIC_QR_BASE_URL || '').trim().replace(/\/+$/, '');
  if (fromEnv) return fromEnv;
  return getPublicAppUrl(fallbackOrigin);
}

export function qrUrlForToken(token: string): string {
  return `${getQrBaseUrl()}/q/${token}`;
}
