import { NextRequest } from 'next/server';
import { requireUser, isAdminUser, handleError, ok, ApiError } from '@/lib/api';
import { trackingCodeSchema } from '@/lib/schemas';
import { getTracking, CorreiosError } from '@/services/correiosService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const { supabase, user } = await requireUser();
    const parsed = trackingCodeSchema.safeParse(req.nextUrl.searchParams.get('code') || '');
    if (!parsed.success) throw new ApiError(400, 'Código de rastreio inválido.');
    const code = parsed.data;

    if (!isAdminUser(user)) {
      // RLS: só encontra se o pedido for do próprio revendedor
      const { data } = await supabase.from('orders').select('id').eq('tracking_code', code).limit(1).maybeSingle();
      if (!data) throw new ApiError(404, 'Código não encontrado.');
    }
    try {
      return ok(await getTracking(code));
    } catch (e) {
      if (e instanceof CorreiosError) throw new ApiError(502, 'Não foi possível consultar o rastreamento agora.');
      throw e;
    }
  } catch (e) {
    return handleError(e);
  }
}
