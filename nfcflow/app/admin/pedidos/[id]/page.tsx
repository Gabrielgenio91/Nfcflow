'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Loader2, RefreshCw, Truck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OrderStatusBadge } from '@/components/store/order-status-badge';
import { formatBRL } from '@/lib/money';
import { Badge } from '@/components/ui/badge';
import { formatOrderNumber, formatShippingMode, NEXT_STATUS, orderPaymentState, ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL, correiosTrackingUrl, type OrderStatus } from '@/lib/orders';
import type { Order, OrderStatusHistory } from '@/lib/types';

async function patch(id: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/admin/orders/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erro ao atualizar');
  return data as { status?: string; plaques_missing?: number };
}

// FIX #59 - APROVADO = PAGO
const normalizeForFlow = (s: string) => s === 'APROVADO' ? 'PAGO' : s;

export default function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [history, setHistory] = useState<OrderStatusHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tracking, setTracking] = useState('');

  const load = useCallback(async () => {
    const supabase = createClient();
    const [o, h] = await Promise.all([
      supabase.from('orders').select('*, reseller:resellers(id, full_name, email), order_items(*), payments(*)').eq('id', id).maybeSingle(),
      supabase.from('order_status_history').select('*').eq('order_id', id).order('created_at', { ascending: true }),
    ]);
    const ord = (o.data as unknown as Order) || null;
    setOrder(ord);
    setTracking(ord?.tracking_code || '');
    setHistory((h.data as OrderStatusHistory[]) || []);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); await load(); } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro'); } finally { setBusy(false); }
  };

  const advance = (next: OrderStatus) => run(async () => {
    const r = await patch(id, { status: next, tracking_code: next === 'ENVIADO' ? tracking : undefined });
    toast.success(`Status: ${ORDER_STATUS_LABEL[next]}`);
    if (next === 'ENVIADO' && r.plaques_missing && r.plaques_missing > 0) {
      toast.warning(`${r.plaques_missing} plaquinha(s) não puderam ser atribuídas por falta de plaquinhas disponíveis. Crie mais em Plaquinhas e atribua ao revendedor.`, { duration: 10000 });
    }
  });

  const saveTracking = () => run(async () => { await patch(id, { tracking_code: tracking }); toast.success('Código salvo'); });

  const cancel = () => {
    if (!confirm('Cancelar o pedido? Se já estiver pago, o estoque volta ao central e o pagamento fica marcado para reembolso.')) return;
    return run(async () => { await patch(id, { status: 'CANCELADO' }); toast.success('Pedido cancelado'); });
  };

  const sync = () => run(async () => {
    const res = await fetch(`/api/admin/orders/${id}/sync-payment`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Erro ao sincronizar');
    toast.success(`Pagamento consultado: ${data.outcome}`);
  });

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!order) return <p className="text-muted-foreground">Pedido não encontrado.</p>;

  const effectiveStatus = normalizeForFlow(order.status) as OrderStatus;
  const next = NEXT_STATUS[effectiveStatus];
  const canShip = effectiveStatus === 'PAGO' || effectiveStatus === 'EM_PREPARACAO';
  const isPaid = effectiveStatus === 'PAGO';
  const isAwaiting = order.status === 'AGUARDANDO_PAGAMENTO' || order.status === 'PENDENTE' as any;
  const needsReview = order.payments?.filter((p) => p.needs_review) || [];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/admin/pedidos" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Pedidos</Link>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pedido {formatOrderNumber(order.order_number)}</h1>
          <p className="text-sm text-muted-foreground">{order.reseller?.full_name} · {order.reseller?.email}</p>
          <p className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleString('pt-BR')}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant="outline" className={orderPaymentState(order.status).cls}>{orderPaymentState(order.status).label}</Badge>
          <OrderStatusBadge status={effectiveStatus} />
        </div>
      </div>

      {needsReview.map((p) => (
        <div key={p.id} className="flex items-start gap-2 rounded-2xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" /><span>{p.review_note || 'Pagamento requer revisão manual.'}</span>
        </div>
      ))}

      <Card className="space-y-4 p-4">
        <h2 className="font-semibold">Fluxo do pedido</h2>
        {canShip && (
          <div className="space-y-1.5">
            <Label htmlFor="trk">Código de rastreamento (Correios)</Label>
            <Input id="trk" value={tracking} onChange={(e) => setTracking(e.target.value.toUpperCase())} placeholder="Ex.: AA123456789BR" className="h-12 font-mono" maxLength={20} />
            <p className="text-xs text-muted-foreground">Pagamento confirmado ({order.status}). Informe o código e marque como Enviado.</p>
          </div>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          {canShip && (
            <Button className="h-12 flex-1" disabled={busy || !tracking.trim()} onClick={() => advance('ENVIADO')}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Marcar como Enviado'}
            </Button>
          )}
          {isPaid && (
            <Button variant="outline" className="h-12 flex-1" disabled={busy} onClick={() => advance('EM_PREPARACAO')}>
              Marcar como {ORDER_STATUS_LABEL.EM_PREPARACAO}
            </Button>
          )}
          {next && !canShip && (
            <Button className="h-12 flex-1" disabled={busy} onClick={() => advance(next)}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : `Marcar como ${ORDER_STATUS_LABEL[next]}`}
            </Button>
          )}
          {isAwaiting && (
            <Button variant="outline" className="h-12 flex-1" disabled={busy} onClick={sync}><RefreshCw className="mr-2 h-4 w-4" />Verificar pagamento</Button>
          )}
          {['AGUARDANDO_PAGAMENTO', 'PAGO', 'EM_PREPARACAO', 'APROVADO'].includes(order.status) && (
            <Button variant="outline" className="h-12 flex-1 text-destructive" disabled={busy} onClick={cancel}><XCircle className="mr-2 h-4 w-4" />Cancelar pedido</Button>
          )}
        </div>
        {['ENVIADO', 'EM_TRANSITO', 'ENTREGUE'].includes(effectiveStatus) && (
          <div className="space-y-1.5">
            <Label htmlFor="trk2" className="flex items-center gap-1.5"><Truck className="h-3.5 w-3.5" /> Código de rastreamento</Label>
            <div className="flex gap-2">
              <Input id="trk2" value={tracking} onChange={(e) => setTracking(e.target.value.toUpperCase())} className="h-11 font-mono" maxLength={20} />
              <Button variant="outline" className="h-11" disabled={busy || !tracking.trim() || tracking === order.tracking_code} onClick={saveTracking}>Salvar</Button>
            </div>
            {order.tracking_code && <a className="text-xs text-primary hover:underline" href={correiosTrackingUrl(order.tracking_code)} target="_blank" rel="noopener noreferrer">Abrir no site dos Correios</a>}
          </div>
        )}
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="font-semibold">Produtos</h2>
        {(order.order_items || []).map((i) => (
          <div key={i.id} className="flex justify-between gap-3 text-sm">
            <span>{i.quantity} × {i.product_name} <span className="text-muted-foreground">({formatBRL(i.unit_price)})</span></span>
            <span className="font-medium">{formatBRL(i.line_total)}</span>
          </div>
        ))}
        <div className="space-y-1 border-t border-white/[0.08] pt-3 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatBRL(order.subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Frete ({order.shipping_service || order.shipping_carrier}){order.shipping_is_estimate ? ' — provisório' : ''}</span><span>{formatBRL(order.shipping_amount)}</span></div>
          <div className="flex justify-between text-base font-bold"><span>Total</span><span>{formatBRL(order.total)}</span></div>
        </div>
      </Card>

      <Card className="space-y-2 p-4 text-sm">
        <h2 className="mb-1 font-semibold">Pagamento</h2>
        {(order.payments || []).length === 0 && <p className="text-muted-foreground">Nenhum pagamento registrado.</p>}
        {(order.payments || []).map((p) => (
          <div key={p.id} className="flex flex-wrap justify-between gap-2 rounded-xl bg-white/[0.04] p-2.5">
            <span>{p.provider} · {p.payment_method} · <span className="font-mono text-xs">{p.provider_payment_id}</span></span>
            <span>{PAYMENT_STATUS_LABEL[p.status] || p.status} · {formatBRL(p.amount)}{p.raw_status ? <span className="text-xs text-muted-foreground"> ({p.raw_status})</span> : null}</span>
          </div>
        ))}
      </Card>

      <Card className="space-y-1 p-4 text-sm">
        <h2 className="mb-1 font-semibold">Entrega</h2>
        <p>{order.ship_recipient_name} · {order.ship_phone}</p>
        <p className="text-muted-foreground">{order.ship_street}, {order.ship_number}{order.ship_complement ? ` – ${order.ship_complement}` : ''} · {order.ship_neighborhood}<br />{order.ship_city}/{order.ship_state} · CEP {order.ship_zip_code}</p>
        <p className="flex items-center gap-1.5 pt-1"><Truck className="h-3.5 w-3.5" /> Modalidade de frete: <span className="font-medium">{formatShippingMode(order)}</span></p>
      </Card>

      <Card className="space-y-2 p-4">
        <h2 className="font-semibold">Histórico</h2>
        <ol className="space-y-2 text-sm">
          {history.map((h) => (
            <li key={h.id} className="flex justify-between gap-3">
              <span>{ORDER_STATUS_LABEL[h.to_status as OrderStatus] || h.to_status}{h.note ? <span className="text-muted-foreground"> — {h.note}</span> : null}</span>
              <span className="whitespace-nowrap text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString('pt-BR')}</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
        }
