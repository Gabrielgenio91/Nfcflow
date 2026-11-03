'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, MapPin, ShoppingCart, Truck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/shared/empty-state';
import { OrderStatusBadge } from '@/components/store/order-status-badge';
import { formatBRL } from '@/lib/money';
import { Badge } from '@/components/ui/badge';
import { formatOrderNumber, formatShipAddress, formatShippingMode, orderPaymentState, ORDER_STATUSES, ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from '@/lib/orders';
import type { Order, Reseller } from '@/lib/types';

const selectCls = 'h-11 w-full rounded-xl border border-input bg-white/[0.03] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export default function AdminOrdersPage() {
  const supabase = useMemo(() => createClient(), []);
  const [orders, setOrders] = useState<Order[]>([]);
  const [resellers, setResellers] = useState<Pick<Reseller, 'id' | 'full_name'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [resellerId, setResellerId] = useState('');
  const [payment, setPayment] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const qs = new URLSearchParams();
      if (status) qs.set('status', status);
      if (resellerId) qs.set('reseller_id', resellerId);
      if (from) qs.set('from', new Date(`${from}T00:00:00`).toISOString());
      if (to) qs.set('to', new Date(`${to}T23:59:59`).toISOString());
      const res = await fetch(`/api/admin/orders?${qs.toString()}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar pedidos');
      setOrders((data.orders as Order[]) || []);
    } catch (e) {
      console.error('Erro admin orders:', e);
      setOrders([]);
      setLoadError(e instanceof Error ? e.message : 'Erro ao carregar pedidos');
    }
    setLoading(false);
  }, [status, resellerId, from, to]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    supabase.from('resellers').select('id, full_name').order('full_name').then(({ data }) => setResellers(data || []));
  }, [supabase]);

  const shown = orders.filter((o) =>!payment || orderPaymentState(o.status).key === payment);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pedidos</h1>
        <p className="mt-1 text-sm text-muted-foreground">{shown.length} pedido(s)</p>
      </div>

      <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1.5"><Label>Status</Label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
            <option value="">Todos</option>
            {ORDER_STATUSES.map((s) => <option key={s} value={s} className="bg-card">{ORDER_STATUS_LABEL[s]}</option>)}
          </select></div>
        <div className="space-y-1.5"><Label>Revendedor</Label>
          <select value={resellerId} onChange={(e) => setResellerId(e.target.value)} className={selectCls}>
            <option value="">Todos</option>
            {resellers.map((r) => <option key={r.id} value={r.id} className="bg-card">{r.full_name || r.id}</option>)}
          </select></div>
        <div className="space-y-1.5"><Label>Pagamento</Label>
          <select value={payment} onChange={(e) => setPayment(e.target.value)} className={selectCls}>
            <option value="">Todos</option>
            <option value="AGUARDANDO" className="bg-card">Aguardando pagamento</option>
            <option value="PAGO" className="bg-card">Pago</option>
            <option value="CANCELADO" className="bg-card">Cancelado</option>
          </select></div>
        <div className="space-y-1.5"><Label>De</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-11" /></div>
        <div className="space-y-1.5"><Label>Até</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-11" /></div>
      </Card>

      {loading? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : loadError? (
        <EmptyState icon={AlertTriangle} title="Erro ao carregar pedidos" description={loadError} />
      ) : shown.length === 0? (
        <EmptyState icon={ShoppingCart} title="Nenhum pedido encontrado" description="Nenhum pedido corresponde aos filtros selecionados." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {shown.map((o) => {
            const review = o.payments?.some((p) => (p as { needs_review?: boolean }).needs_review);
            const items = o.order_items || [];
            const qty = items.reduce((sum, i) => sum + (i.quantity || 0), 0);
            const resellerName = (o as any).reseller?.full_name || (o as any).reseller?.email || 'Revendedor';
            const pay = orderPaymentState(o.status);

            return (
              <Link key={o.id} href={`/admin/pedidos/${o.id}`} className="block">
                <Card className="space-y-2 p-4 transition-colors hover:border-primary/40">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{formatOrderNumber(o.order_number)} · {resellerName}</p>
                      <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString('pt-BR')}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant="outline" className={pay.cls}>{pay.label}</Badge>
                      <OrderStatusBadge status={o.status} />
                    </div>
                  </div>
                  <div className="space-y-0.5 text-sm">
                    <p className="font-medium">{qty} placa(s)</p>
                    {items.map((i) => (
                      <p key={i.id} className="truncate text-muted-foreground">{i.quantity}× {i.product_name}</p>
                    ))}
                  </div>
                  <div className="space-y-0.5 text-xs text-muted-foreground">
                    <p className="flex items-start gap-1"><MapPin className="mt-0.5 h-3 w-3 flex-shrink-0" /><span>{o.ship_recipient_name} · {formatShipAddress(o)}</span></p>
                    <p className="flex items-center gap-1"><Truck className="h-3 w-3" />{formatShippingMode(o)}{o.shipping_is_estimate? ' (provisório)' : ''}</p>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-xs text-muted-foreground">
                      {o.payment_method || 'PIX'}{o.payments?.[0]? ` · ${PAYMENT_STATUS_LABEL[o.payments[0].status] || o.payments[0].status}` : ''}
                    </span>
                    <span className="font-bold">{formatBRL(o.total)}</span>
                  </div>
                  {(o.tracking_code || review) && (
                    <div className="flex items-center justify-between text-xs">
                      {o.tracking_code? <span className="flex items-center gap-1 font-mono text-cyan-400"><Truck className="h-3 w-3" />{o.tracking_code}</span> : <span />}
                      {review && <span className="flex items-center gap-1 text-amber-400"><AlertTriangle className="h-3 w-3" />Revisar pagamento</span>}
                    </div>
                  )}
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
          }
