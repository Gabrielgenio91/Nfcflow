'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronRight, Copy, Loader2, Package, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/empty-state';
import { OrderStatusBadge } from '@/components/store/order-status-badge';
import { formatBRL } from '@/lib/money';
import { formatOrderNumber, orderPaymentState } from '@/lib/orders';
import { Badge } from '@/components/ui/badge';
import type { Order } from '@/lib/types';

export default function PedidosPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    // RLS: o revendedor só enxerga os próprios pedidos
    supabase
      .from('orders')
      .select('*, order_items(*), payments(status, payment_method)')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(async ({ data, error: err }) => {
        if (err) { setError(true); setLoading(false); return; }
        let list = (data as unknown as Order[]) || [];
        setOrders(list);
        setLoading(false);
        // Pedidos aguardando pagamento: o servidor confirma com o Mercado Pago e atualiza o status real
        const pending = list.filter((o) => o.status === 'AGUARDANDO_PAGAMENTO');
        if (pending.length > 0) {
          await Promise.all(pending.map((o) => fetch(`/api/orders/${o.id}/status`, { cache: 'no-store' }).catch(() => null)));
          const { data: fresh } = await supabase
            .from('orders')
            .select('*, order_items(*), payments(status, payment_method)')
            .order('created_at', { ascending: false })
            .limit(100);
          if (fresh) { list = fresh as unknown as Order[]; setOrders(list); }
        }
      });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Meus Pedidos</h1>
        <p className="mt-1 text-sm text-muted-foreground">Histórico de compras</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <EmptyState title="Erro ao carregar pedidos" description="Tente novamente em instantes." />
      ) : orders.length === 0 ? (
        <EmptyState icon={Package} title="Nenhum pedido ainda" description="Seus pedidos aparecerão aqui depois da primeira compra." />
      ) : (
        <div className="space-y-3">
          {orders.map((o) => {
            const qty = (o.order_items || []).reduce((s, i) => s + i.quantity, 0);
            const pay = o.payments?.[0];
            return (
              <Link key={o.id} href={`/painel/mais/pedidos/${o.id}`} className="block">
                <Card className="p-4 transition-colors hover:border-primary/40">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">Pedido {formatOrderNumber(o.order_number)}</p>
                      <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString('pt-BR')}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant="outline" className={orderPaymentState(o.status).cls}>{orderPaymentState(o.status).label}</Badge>
                      <OrderStatusBadge status={o.status} />
                    </div>
                  </div>
                  <p className="mt-2 truncate text-sm text-muted-foreground">
                    {(o.order_items || []).map((i) => `${i.quantity}× ${i.product_name}`).join(' · ')}
                  </p>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{qty} un. · Frete {formatBRL(o.shipping_amount)}</span>
                    <span className="font-bold">{formatBRL(o.total)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{o.payment_method}{pay ? ` · ${pay.status.toLowerCase()}` : ''}</span>
                    {o.tracking_code ? (
                      <span className="flex items-center gap-1 font-mono text-cyan-400">
                        <Truck className="h-3 w-3" />{o.tracking_code}
                        <button type="button" aria-label="Copiar código de rastreio" className="ml-1 rounded p-1 hover:bg-white/10"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigator.clipboard?.writeText(o.tracking_code!); toast.success('Código copiado'); }}>
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
