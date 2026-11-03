import { NextRequest } from 'next/server';
import { requireAdmin, parseJson, handleError, ok, ApiError } from '@/lib/api';
import { adminOrderUpdateSchema } from '@/lib/schemas';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(params.id)) throw new ApiError(400, 'Pedido inválido.');
    const { user } = await requireAdmin();
    const body = await parseJson(req, adminOrderUpdateSchema);
    const admin = createAdminClient();

    if (body.tracking_code && body.status !== 'ENVIADO') {
      const { error } = await admin.rpc('admin_set_tracking_code', {
        p_order_id: params.id, p_tracking_code: body.tracking_code, p_actor: user.id,
      });
      if (error) throw error;
    }
    let result: unknown = { status: null };
    if (body.status) {
      const { data, error } = await admin.rpc('admin_update_order_status', {
        p_order_id: params.id, p_new_status: body.status, p_tracking_code: body.tracking_code ?? null, p_actor: user.id,
      });
      if (error) throw error;
      result = data;
    }
    return ok(result);
  } catch (e) {
    return handleError(e);
  }
}
