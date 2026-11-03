import { NextRequest } from 'next/server';
import { requireAdmin, handleError, ok } from '@/lib/api';
import { createAdminClient } from '@/lib/supabase/admin';
import { statusAliases } from '@/lib/orders';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Lista de pedidos do admin. Lê com service_role (após validar que é admin/proprietário),
 * então não depende do claim app_metadata.role estar no JWT para a RLS liberar a leitura.
 * Filtro de status inclui os legados (PENDENTE = aguardando, APROVADO = pago).
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const sp = req.nextUrl.searchParams;
    const status = sp.get('status') || '';
    const resellerId = sp.get('reseller_id') || '';
    const from = sp.get('from') || '';
    const to = sp.get('to') || '';

    let q = createAdminClient()
      .from('orders')
      .select('*, reseller:resellers(id, full_name, email), order_items(*), payments(*)')
      .order('created_at', { ascending: false })
      .limit(300);
    if (status) q = q.in('status', statusAliases(status));
    if (resellerId && UUID.test(resellerId)) q = q.eq('reseller_id', resellerId);
    if (from && !isNaN(Date.parse(from))) q = q.gte('created_at', from);
    if (to && !isNaN(Date.parse(to))) q = q.lte('created_at', to);

    const { data, error } = await q;
    if (error) throw error;
    return ok({ orders: data || [] });
  } catch (e) {
    return handleError(e);
  }
}
