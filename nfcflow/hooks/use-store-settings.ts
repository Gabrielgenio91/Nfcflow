'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface PublicSettings {
  supportWhatsapp: string; // somente dígitos, com DDI (ex.: 5511999999999) — vazio se não configurado
  freeShippingEnabled: boolean;
  freeShippingMinQuantity: number;
  promoText: string;
  qrBaseUrl: string; // URL base dos novos QRs (vazio = usar NEXT_PUBLIC_APP_URL)
  loaded: boolean;
}

const EMPTY: PublicSettings = { supportWhatsapp: '', freeShippingEnabled: false, freeShippingMinQuantity: 250, promoText: '', qrBaseUrl: '', loaded: false };
let cache: PublicSettings | null = null;
let inflight: Promise<PublicSettings> | null = null;

async function fetchSettings(force = false): Promise<PublicSettings> {
  if (cache && !force) return cache;
  if (inflight && !force) return inflight;
  inflight = (async () => {
    const { data } = await createClient().rpc('get_public_settings');
    const d = (data || {}) as { support_whatsapp?: string; promo_active?: boolean; promo_min_qty?: number; promo_text?: string; qr_base_url?: string };
    cache = {
      supportWhatsapp: (d.support_whatsapp || '').replace(/\D/g, ''),
      freeShippingEnabled: !!d.promo_active,
      freeShippingMinQuantity: Number(d.promo_min_qty) || 250,
      promoText: (d.promo_text || '').trim(),
      qrBaseUrl: (d.qr_base_url || '').trim(),
      loaded: true,
    };
    inflight = null;
    return cache;
  })();
  return inflight;
}

export function invalidateStoreSettings() {
  cache = null;
}

/** Configurações públicas definidas pelo ADMIN (WhatsApp do suporte e promoção de frete grátis). */
export function useStoreSettings(): PublicSettings & { reload: () => Promise<void> } {
  const [settings, setSettings] = useState<PublicSettings>(cache || EMPTY);
  useEffect(() => {
    let alive = true;
    fetchSettings().then((s) => { if (alive) setSettings(s); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const reload = async () => { const s = await fetchSettings(true); setSettings(s); };
  return { ...settings, reload };
}
