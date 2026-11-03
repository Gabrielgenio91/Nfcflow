/**
 * Acesso centralizado às variáveis de ambiente
 * Compatível com Cloudflare Workers + Next.js - VERSÃO BLINDADA
 */
function read(name: string): string {
  // @ts-ignore - Cloudflare expõe em process.env
  const val = (process?.env?.[name] as string) || '';
  return val.trim();
}

export const env = {
  get appUrl() { return read('NEXT_PUBLIC_APP_URL').replace(/\/+$/, '') || read('NEXT_PUBLIC_SITE_URL').replace(/\/+$/, ''); },
  get qrBaseUrl() { return read('NEXT_PUBLIC_QR_BASE_URL').replace(/\/+$/, '') || this.appUrl; },
  get supabaseUrl() { return read('NEXT_PUBLIC_SUPABASE_URL'); },
  get supabaseAnonKey() { return read('NEXT_PUBLIC_SUPABASE_ANON_KEY'); },
  get supabaseServiceRoleKey() { return read('SUPABASE_SERVICE_ROLE_KEY'); },

  get ownerEmail() { return read('OWNER_EMAIL') || 'gtdadosfreeoficial'; },

  get mpAccessToken() { return read('MERCADO_PAGO_ACCESS_TOKEN'); },
  get mpPublicKey() { return read('MERCADO_PAGO_PUBLIC_KEY'); },
  get mpWebhookSecret() { return read('MERCADO_PAGO_WEBHOOK_SECRET'); },
  get mpPixExpirationMinutes() { return Math.min(Math.max(parseInt(read('MERCADO_PAGO_PIX_EXPIRATION_MINUTES') || '30', 10) || 30, 30), 1440); },

  get correiosToken() { return read('CORREIOS_API_TOKEN'); },
  get correiosUrl() { return read('CORREIOS_API_URL').replace(/\/+$/, ''); },
  get correiosOriginZip() { return read('CORREIOS_ORIGIN_ZIP').replace(/\D/g, '') || read('SHIPPING_ORIGIN_ZIP').replace(/\D/g, '') || '65907455'; },
  get correiosServiceCodes() {
    return (read('CORREIOS_SERVICE_CODES') || '03298,03220').split(',').map((s) => s.trim()).filter(Boolean);
  },
  get correiosUnitWeightGrams() { return Math.max(parseInt(read('CORREIOS_UNIT_WEIGHT_GRAMS') || '300', 10) || 300, 1); },
  get correiosPackage() {
    return {
      length: parseInt(read('CORREIOS_PACKAGE_LENGTH_CM') || '20', 10) || 20,
      width: parseInt(read('CORREIOS_PACKAGE_WIDTH_CM') || '16', 10) || 16,
      height: parseInt(read('CORREIOS_PACKAGE_HEIGHT_CM') || '10', 10) || 10,
    };
  },
  get shippingFallbackAmount() {
    const raw = read('SHIPPING_FALLBACK_AMOUNT');
    if (!raw) return 29.90; // SE NÃO TIVER CONFIGURADO, USA 29.90 AO INVÉS DE 0
    const n = parseFloat(raw.replace(',', '.'));
    return Number.isFinite(n) && n >= 0? Math.round(n * 100) / 100 : 29.90;
  },

  get googlePlacesKey() { return read('GOOGLE_PLACES_API_KEY'); },
  get googleMapsKey() { return read('GOOGLE_MAPS_API_KEY'); },

  get paymentProvider() { return (read('PAYMENT_PROVIDER') || 'MERCADO_PAGO').toUpperCase(); },
  get cronSecret() { return read('CRON_SECRET'); },
  get qrIpHashSalt() { return read('QR_IP_HASH_SALT'); },
};

export interface IntegrationStatus {
  mercadoPago: { configured: boolean; webhookSecretConfigured: boolean };
  correios: { configured: boolean };
  google: { configured: boolean };
  appUrlConfigured: boolean;
  cronConfigured: boolean;
}

export function getIntegrationStatus(): IntegrationStatus {
  return {
    mercadoPago: {
      configured:!!env.mpAccessToken,
      webhookSecretConfigured:!!env.mpWebhookSecret,
    },
    correios: { configured:!!(env.correiosToken && env.correiosUrl && env.correiosOriginZip) },
    google: { configured:!!env.googlePlacesKey },
    appUrlConfigured:!!env.appUrl,
    cronConfigured:!!env.cronSecret,
  };
  }
