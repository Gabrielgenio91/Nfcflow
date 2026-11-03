import { NextRequest, NextResponse } from 'next/server';
import { processWebhook } from '@/services/mercadoPagoService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Webhook do Mercado Pago.
 * Fluxo: valida assinatura → deduplica → consulta o pagamento na API oficial → atualiza pedido/estoque.
 * Qualquer falha inesperada devolve 500 para o Mercado Pago tentar novamente (o processamento é idempotente).
 */
export async function POST(req: NextRequest) {
  let body: unknown = null;
  try { body = await req.json(); } catch { body = null; }
  try {
    const result = await processWebhook({ url: new URL(req.url), headers: req.headers, body });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ received: true, outcome: result.outcome }, { status: 200 });
  } catch (err) {
    console.error('[webhook mercado-pago]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 });
  }
}

// Algumas validações do painel do Mercado Pago fazem GET
export async function GET() {
  return NextResponse.json({ ok: true });
}
