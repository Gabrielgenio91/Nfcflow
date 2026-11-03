import { NextRequest } from 'next/server';
import { requireAdmin, handleError, ok, ApiError } from '@/lib/api';
import { syncOrderPayment } from '@/services/paymentService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Consulta o Mercado Pago e sincroniza o pedido (útil se um webhook foi perdido). */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(params.id)) throw new ApiError(400, 'Pedido inválido.');
    await requireAdmin();
    const outcome = await syncOrderPayment(params.id);
    return ok({ outcome: outcome ?? 'NO_PAYMENT_OR_NOT_CONFIGURED' });
  } catch (e) {
    return handleError(e);
  }
}
