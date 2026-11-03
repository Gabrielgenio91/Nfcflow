import { createAdminClient } from '@/lib/supabase/admin';

export interface StoreSettings {
  supportWhatsapp: string;
  freeShippingEnabled: boolean;   // store_settings.promo_active
  freeShippingMinQuantity: number; // store_settings.promo_min_qty
  promoText: string;               // store_settings.promo_text
}

/**
 * Lê as configurações NO SERVIDOR (service_role). A promoção de frete grátis vem de store_settings
 * (promo_active / promo_min_qty / promo_text); o WhatsApp do suporte vem de app_settings.
 * Em caso de falha de leitura, a promoção fica DESLIGADA (nunca concede frete grátis por engano).
 */
export async function getStoreSettings(): Promise<StoreSettings> {
  const admin = createAdminClient();
  const [store, app] = await Promise.all([
    admin.from('store_settings').select('promo_active, promo_min_qty, promo_text').limit(1).maybeSingle(),
    admin.from('app_settings').select('key, value').eq('key', 'support_whatsapp'),
  ]);
  const s = store.error ? null : store.data;
  const min = Number(s?.promo_min_qty);
  return {
    supportWhatsapp: (app.data?.[0]?.value as string) || '',
    freeShippingEnabled: !!s?.promo_active,
    freeShippingMinQuantity: Number.isFinite(min) && min > 0 ? min : 250,
    promoText: (s?.promo_text as string) || '',
  };
}
