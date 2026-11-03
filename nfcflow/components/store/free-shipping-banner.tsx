'use client';

import { Truck } from 'lucide-react';
import { useStoreSettings } from '@/hooks/use-store-settings';
import { freeShippingApplies } from '@/lib/shipping-promo';
import { whatsappUrl } from '@/components/shared/whatsapp';
import { WhatsAppIcon } from '@/components/shared/whatsapp';

/**
 * Promoção de frete grátis por quantidade (regra do ADMIN → Promoções: promo_active/promo_min_qty/promo_text).
 * O botão abre o WhatsApp configurado em ADMIN → Suporte. A regra de frete é validada no servidor.
 */
export function FreeShippingBanner({ count }: { count: number }) {
  const s = useStoreSettings();
  if (!s.loaded || !s.freeShippingEnabled) return null;
  const min = s.freeShippingMinQuantity;
  const reached = freeShippingApplies(s, count);
  const pct = Math.min(100, Math.round((count / min) * 100));
  const text = s.promoText || `FRETE GRÁTIS acima de ${min} plaquinhas! Chamar no suporte`;
  return (
    <div className="rounded-2xl border border-success/30 bg-success/10 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-success/20 text-success">
          <Truck className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-success">{reached ? 'Frete grátis aplicado no seu pedido!' : text}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {reached ? 'Você paga somente as plaquinhas.' : `A partir de ${min} placas no pedido. Faltam ${Math.max(min - count, 0)}.`}
          </p>
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-success transition-all" style={{ width: `${pct}%` }} />
      </div>
      {s.supportWhatsapp && (
        <a
          href={whatsappUrl(s.supportWhatsapp, `Olá! Quero saber sobre o frete grátis (a partir de ${min} plaquinhas).`)}
          target="_blank" rel="noopener noreferrer"
          className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 text-sm font-semibold text-white transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <WhatsAppIcon className="h-4 w-4" /> Chamar no suporte
        </a>
      )}
    </div>
  );
}
