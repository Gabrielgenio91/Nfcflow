/**
 * paymentService — ponto único de entrada para pagamentos.
 * O restante do sistema fala com esta camada, nunca com um provedor específico.
 * Para adicionar outro gateway: implemente PaymentGateway, registre em `gateways` e crie
 * a rota /api/webhooks/{slug}. A escolha do provedor ativo vem de PAYMENT_PROVIDER.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { gateway as mercadoPagoGateway } from '@/services/mercadoPagoService';
import type { PaymentGateway } from '@/services/paymentTypes';

export type { PaymentGateway, CreatedPayment, CreatePaymentParams, PaymentMethod } from '@/services/paymentTypes';

const gateways: Record<string, PaymentGateway> = {
  [mercadoPagoGateway.id]: mercadoPagoGateway,
};

export const DEFAULT_PROVIDER = 'MERCADO_PAGO';

export function activeProviderId(): string {
  const wanted = (process.env.PAYMENT_PROVIDER || DEFAULT_PROVIDER).trim().toUpperCase();
  return gateways[wanted] ? wanted : DEFAULT_PROVIDER;
}

export function getGateway(id?: string): PaymentGateway {
  const g = gateways[(id || activeProviderId()).toUpperCase()];
  if (!g) throw new Error(`Gateway de pagamento desconhecido: ${id}`);
  return g;
}

export function listGateways(): PaymentGateway[] {
  return Object.values(gateways);
}

/** Sincroniza o pedido consultando o provedor que originou o pagamento mais recente. */
export async function syncOrderPayment(orderId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: pay } = await admin
    .from('payments')
    .select('provider, provider_payment_id')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!pay) return null;
  const g = gateways[pay.provider];
  if (!g || !g.isConfigured()) return null;
  return g.syncPayment(pay.provider_payment_id, orderId);
}
