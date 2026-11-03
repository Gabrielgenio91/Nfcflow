import { NextRequest } from 'next/server';
import { requireReseller, handleError, ok, ApiError } from '@/lib/api';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** O revendedor só pode cancelar o PRÓPRIO pedido ainda não pago. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(params.id)) throw new ApiError(400, 'Pedido inválido.');
    const { supabase, user } = await requireReseller();
    const { data: order } = await supabase.from('orders').select('id, status').eq('id', params.id).maybeSingle();
    if (!order) throw new ApiError(404, 'Pedido não encontrado.');
    if (order.status !== 'AGUARDANDO_PAGAMENTO') throw new ApiError(409, 'Apenas pedidos aguardando pagamento podem ser cancelados por você.');
    const { error } = await createAdminClient().rpc('cancel_order', {
      p_order_id: order.id, p_actor: user.id, p_note: 'Cancelado pelo revendedor',
    });
    if (error) throw error;
    return ok({ status: 'CANCELADO' });
  } catch (e) {
    return handleError(e);
  }
}
