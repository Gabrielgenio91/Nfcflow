/**
 * mercadoPagoService — TODA comunicação com o Mercado Pago passa por aqui.
 * Server-side apenas. Credenciais vêm de variáveis de ambiente (nunca no código):
 *   MERCADO_PAGO_ACCESS_TOKEN, MERCADO_PAGO_WEBHOOK_SECRET
 * Documentação oficial: https://www.mercadopago.com.br/developers
 */
import crypto from 'crypto';
import { env } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';
import type { PaymentGateway } from '@/services/paymentTypes';

const MP_API = 'https://api.mercadopago.com';

export type NormalizedPaymentStatus =
  'PENDENTE' | 'APROVADO' | 'RECUSADO' | 'CANCELADO' | 'EXPIRADO' | 'REEMBOLSADO';

export class PaymentProviderError extends Error {
  constructor(message: string, public status?: number) { super(message); }
}

export function isConfigured(): boolean {
  return !!env.mpAccessToken;
}

function authHeaders(extra?: Record<string, string>) {
  if (!env.mpAccessToken) throw new PaymentProviderError('Mercado Pago não configurado.');
  return {
    Authorization: `Bearer ${env.mpAccessToken}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

/**
 * Status do Mercado Pago -> status interno. SOMENTE `approved` (confirmado pela API oficial) vira APROVADO,
 * que é o único valor que faz apply_payment_update marcar o pedido como PAGO.
 * pending, in_process, authorized, in_mediation, desconhecido ou ausente => PENDENTE (não paga nada).
 */
export function normalizeStatus(raw: string, detail?: string | null): NormalizedPaymentStatus {
  switch (typeof raw === 'string' ? raw.trim().toLowerCase() : '') {
    case 'approved': return 'APROVADO';
    case 'rejected': return 'RECUSADO';
    case 'cancelled': return detail === 'expired' ? 'EXPIRADO' : 'CANCELADO';
    case 'refunded':
    case 'charged_back': return 'REEMBOLSADO';
    default: return 'PENDENTE'; // pending, in_process, authorized...
  }
}

/** Data com offset -03:00 (formato aceito pelo Mercado Pago em date_of_expiration). */
function toBrOffsetIso(d: Date): string {
  const shifted = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  return shifted.toISOString().replace('Z', '-03:00');
}

export interface MpPayment {
  id: number | string;
  status: string;
  status_detail?: string | null;
  transaction_amount: number;
  payment_method_id?: string;
  external_reference?: string | null;
  date_of_expiration?: string | null;
  point_of_interaction?: {
    transaction_data?: { qr_code?: string; qr_code_base64?: string; ticket_url?: string };
  };
}

export interface CreatePaymentInput {
  orderId: string;
  amount: number;
  description: string;
  payerEmail: string;
  notificationUrl: string;
}

/** Cria um pagamento PIX. Idempotente por pedido (X-Idempotency-Key). */
export async function createPixPayment(input: CreatePaymentInput): Promise<{ payment: MpPayment; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + env.mpPixExpirationMinutes * 60 * 1000);
  const res = await fetch(`${MP_API}/v1/payments`, {
    method: 'POST',
    headers: authHeaders({ 'X-Idempotency-Key': `nfcflow-order-${input.orderId}` }),
    body: JSON.stringify({
      transaction_amount: input.amount,
      description: input.description,
      payment_method_id: 'pix',
      payer: { email: input.payerEmail },
      external_reference: input.orderId,
      notification_url: input.notificationUrl,
      date_of_expiration: toBrOffsetIso(expiresAt),
    }),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.id) {
    console.error('[mercadoPago] createPixPayment falhou', res.status, JSON.stringify(data)?.slice(0, 500));
    throw new PaymentProviderError('Não foi possível gerar o PIX agora.', res.status);
  }
  return { payment: data as MpPayment, expiresAt };
}

export async function getPayment(paymentId: string): Promise<MpPayment> {
  if (!/^\d{3,20}$/.test(paymentId)) throw new PaymentProviderError('ID de pagamento inválido.');
  const res = await fetch(`${MP_API}/v1/payments/${paymentId}`, { headers: authHeaders(), cache: 'no-store' });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.id) throw new PaymentProviderError('Pagamento não encontrado no provedor.', res.status);
  return data as MpPayment;
}

/**
 * Valida a assinatura do webhook (x-signature) conforme a documentação oficial:
 * manifest = "id:{data.id};request-id:{x-request-id};ts:{ts};" com HMAC-SHA256 e o segredo do webhook.
 */
export function verifyWebhookSignature(params: {
  xSignature: string | null; xRequestId: string | null; dataId: string | null;
}): boolean {
  const secret = env.mpWebhookSecret;
  if (!secret || !params.xSignature || !params.dataId) return false;
  let ts = ''; let v1 = '';
  for (const part of params.xSignature.split(',')) {
    const [k, v] = part.split('=').map((s) => s.trim());
    if (k === 'ts') ts = v; else if (k === 'v1') v1 = v;
  }
  if (!ts || !v1) return false;
  const id = /^[a-z0-9]+$/i.test(params.dataId) ? params.dataId.toLowerCase() : params.dataId;
  const manifest = `id:${id};request-id:${params.xRequestId ?? ''};ts:${ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  const a = Buffer.from(expected); const b = Buffer.from(v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Aplica no banco (função idempotente) o estado real do pagamento consultado no provedor. */
export async function applyProviderPayment(payment: MpPayment, expectedOrderId?: string): Promise<string> {
  const orderId = payment.external_reference;
  if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
    throw new PaymentProviderError('Pagamento sem referência de pedido.');
  }
  // O pagamento consultado precisa ser do pedido que estamos sincronizando
  if (expectedOrderId && orderId.toLowerCase() !== expectedOrderId.toLowerCase()) {
    throw new PaymentProviderError('Pagamento não pertence a este pedido.');
  }
  const admin = createAdminClient();
  // Se já existe registro desse pagamento, ele precisa ser do mesmo pedido
  const { data: known } = await admin.from('payments').select('order_id')
    .eq('provider', 'MERCADO_PAGO').eq('provider_payment_id', String(payment.id)).maybeSingle();
  if (known && known.order_id !== orderId) {
    throw new PaymentProviderError('Pagamento registrado em outro pedido.');
  }
  const { data, error } = await admin.rpc('apply_payment_update', {
    p_provider: 'MERCADO_PAGO',
    p_provider_payment_id: String(payment.id),
    p_order_id: orderId,
    p_status: normalizeStatus(payment.status, payment.status_detail),
    p_raw_status: `${payment.status}${payment.status_detail ? `/${payment.status_detail}` : ''}`,
    p_amount: Number(payment.transaction_amount),
    p_method: 'PIX',
  });
  if (error) throw error;
  return String(data);
}

export interface WebhookInput {
  url: URL;
  headers: Headers;
  body: unknown;
}

export type WebhookResult =
  | { ok: true; outcome: string }
  | { ok: false; status: number; error: string };

/**
 * processWebhook: valida autenticidade → deduplica → consulta o pagamento no Mercado Pago →
 * atualiza pedido/pagamento/estoque (idempotente).
 */
export async function processWebhook({ url, headers, body }: WebhookInput): Promise<WebhookResult> {
  if (!isConfigured()) return { ok: false, status: 503, error: 'Mercado Pago não configurado.' };
  if (!env.mpWebhookSecret) return { ok: false, status: 503, error: 'Segredo do webhook não configurado.' };

  const b = (body && typeof body === 'object' ? body : {}) as { type?: string; action?: string; data?: { id?: string | number } };
  const dataId = url.searchParams.get('data.id') || (b.data?.id != null ? String(b.data.id) : null);
  const type = url.searchParams.get('type') || url.searchParams.get('topic') || b.type || '';
  const xRequestId = headers.get('x-request-id');

  const valid = verifyWebhookSignature({ xSignature: headers.get('x-signature'), xRequestId, dataId: url.searchParams.get('data.id') || dataId });
  if (!valid) return { ok: false, status: 401, error: 'Assinatura inválida.' };

  if (type !== 'payment' || !dataId) return { ok: true, outcome: 'IGNORED' };

  const admin = createAdminClient();
  const eventKey = `payment:${dataId}:${xRequestId || b.action || 'n/a'}`;

  const { error: insErr } = await admin.from('webhook_events').insert({
    provider: 'MERCADO_PAGO', event_key: eventKey, payload: { type, action: b.action ?? null, data_id: dataId },
  });
  if (insErr) {
    if (insErr.code === '23505') {
      const { data: existing } = await admin.from('webhook_events').select('processed_at')
        .eq('provider', 'MERCADO_PAGO').eq('event_key', eventKey).maybeSingle();
      if (existing?.processed_at) return { ok: true, outcome: 'DUPLICATE' };
      // evento recebido mas não concluído: reprocessa
    } else {
      throw insErr;
    }
  }

  // Fonte da verdade: consulta o pagamento na API oficial (não confia no corpo da notificação)
  const payment = await getPayment(dataId);
  const outcome = await applyProviderPayment(payment);

  await admin.from('webhook_events').update({ processed_at: new Date().toISOString() })
    .eq('provider', 'MERCADO_PAGO').eq('event_key', eventKey);
  return { ok: true, outcome };
}

/** Implementação do contrato PaymentGateway para o Mercado Pago (PIX). */
export const gateway: PaymentGateway = {
  id: 'MERCADO_PAGO',
  label: 'Mercado Pago',
  webhookSlug: 'mercado-pago',
  supportedMethods: ['PIX'],
  isConfigured,
  async createPayment(p) {
    const { payment, expiresAt } = await createPixPayment({
      orderId: p.orderId,
      amount: p.amount,
      description: p.description,
      payerEmail: p.payerEmail,
      notificationUrl: p.notificationUrl,
    });
    const td = payment.point_of_interaction?.transaction_data;
    return {
      provider: 'MERCADO_PAGO',
      providerPaymentId: String(payment.id),
      method: 'PIX',
      rawStatus: payment.status,
      qrCode: td?.qr_code ?? null,
      qrCodeBase64: td?.qr_code_base64 ?? null,
      ticketUrl: td?.ticket_url ?? null,
      expiresAt,
    };
  },
  async syncPayment(providerPaymentId, expectedOrderId) {
    return applyProviderPayment(await getPayment(providerPaymentId), expectedOrderId);
  },
};
