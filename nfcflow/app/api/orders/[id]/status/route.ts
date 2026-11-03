import { NextRequest } from 'next/server';
import { requireReseller, handleError, ok, ApiError } from '@/lib/api';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncOrderPayment } from '@/services/paymentService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UUID = /^[0-9a-f-]{36}$/i;

// Só estes status do pedido contam como pago. O status do pedido só chega aqui via apply_payment_update
// (webhook/consulta oficial com status `approved` no Mercado Pago); esta rota apenas LÊ, nunca grava.
const PAID_STATUSES = new Set(['PAGO', 'EM_PREPARACAO', 'ENVIADO', 'EM_TRANSITO', 'ENTREGUE']);

/** Polling do checkout: devolve o status REAL do pedido (confirmado pelo backend/provedor). */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!UUID.test(params.id)) throw new ApiError(400, 'Pedido inválido.');
    const { supabase } = await requireReseller();

    const read = () => supabase.from('orders').select('id, status, total, paid_at').eq('id', params.id).maybeSingle();
    let { data: order } = await read();
    if (!order) throw new ApiError(404, 'Pedido não encontrado.');

    if (order.status === 'AGUARDANDO_PAGAMENTO') {
      try {
        await createAdminClient().rpc('release_expired_orders');
        await syncOrderPayment(order.id); // consulta o Mercado Pago; pending/in_process/rejected NÃO pagam o pedido
      } catch (e) {
        console.error('[orders/status] sync', e instanceof Error ? e.message : e);
      }
      ({ data: order } = await read());
      if (!order) throw new ApiError(404, 'Pedido não encontrado.');
    }
    return ok({ 
      status: order.status, 
      paid: PAID_STATUSES.has(order.status), 
      paid_at: order.paid_at 
    });
  } catch (e) {
    return handleError(e);
  }
}
