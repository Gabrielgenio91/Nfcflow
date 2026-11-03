'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Copy, ExternalLink, Loader2, MapPin, RefreshCw, Truck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { OrderStatusBadge } from '@/components/store/order-status-badge';
import { PixPayment } from '@/components/store/pix-payment';
import { formatBRL } from '@/lib/money';
import { correiosTrackingUrl, formatOrderNumber, formatShippingMode, ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL, type OrderStatus } from '@/lib/orders';
import type { Order, OrderStatusHistory } from '@/lib/types';

interface TrackingResult {
  configured: boolean;
  events: { date: string | null; description: string; location: string | null }[];
  message?: string;
}

export default function PedidoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [history, setHistory] = useState<OrderStatusHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tracking, setTracking] = useState<TrackingResult | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [o, h] = await Promise.all([
      supabase.from('orders').select('*, order_items(*), payments(*)').eq('id', id).maybeSingle(),
      supabase.from('order_status_history').select('*').eq('order_id', id).order('created_at', { ascending: true }),
    ]);
    setOrder((o.data as unknown as Order) || null);
    setHistory((h.data as OrderStatusHistory[]) || []);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const refresh = async () => {
    setBusy(true);
    try {
      // consulta o backend, que confirma com o provedor de pagamento
      await fetch(`/api/orders/${id}/status`, { cache: 'no-store' });
      await load();
    } finally { setBusy(false); }
  };

  const cancel = async () => {
    if (!confirm('Cancelar este pedido? A reserva de estoque será liberada.')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${id}/cancel`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erro ao cancelar');
      toast.success('Pedido cancelado');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao cancelar');
    } finally { setBusy(false); }
  };

  // "RECEBI MINHA ENCOMENDA": marca o pedido como ENTREGUE (o Admin enxerga o mesmo status)
  const confirmReceived = async () => {
    if (!confirm('Confirmar que você recebeu esta encomenda?')) return;
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc('reseller_confirm_delivery', { p_order_id: id });
      if (error) throw error;
      toast.success('Entrega confirmada. Obrigado!');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao confirmar recebimento');
    } finally { setBusy(false); }
  };

  const track = async () => {
    if (!order?.tracking_code) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/tracking?code=${encodeURIComponent(order.tracking_code)}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro');
      setTracking(data as TrackingResult);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao consultar rastreamento');
    } finally { setBusy(false); }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!order) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Pedido não encontrado.</p>
        <Button variant="outline" onClick={() => router.push('/painel/mais/pedidos')}>Voltar</Button>
      </div>
    );
  }

  const pending = order.status === 'AGUARDANDO_PAGAMENTO';
  const pix = order.payments?.find((p) => p.status === 'PENDENTE' && (p.pix_qr_code || p.pix_qr_code_base64 || p.pix_ticket_url));
  const pay = order.payments?.[0];
  const canConfirmReceipt = order.status === 'ENVIADO' || order.status === 'EM_TRANSITO';

  return (
    <div className="space-y-5">
      <Link href="/painel/mais/pedidos" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Meus pedidos
      </Link>

      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pedido {formatOrderNumber(order.order_number)}</h1>
          <p className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleString('pt-BR')}</p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      {pending && (
        <Card className="space-y-4 p-4">
          <h2 className="font-semibold">Pagamento pendente</h2>
          {pix ? (
            <PixPayment qrCode={pix.pix_qr_code} qrCodeBase64={pix.pix_qr_code_base64} ticketUrl={pix.pix_ticket_url} expiresAt={pix.expires_at} />
          ) : (
            <p className="text-sm text-muted-foreground">Aguardando confirmação do pagamento.</p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="h-12 flex-1" onClick={refresh} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><RefreshCw className="mr-2 h-4 w-4" />Atualizar status</>}
            </Button>
            <Button variant="outline" className="h-12 flex-1 text-destructive" onClick={cancel} disabled={busy}>
              <XCircle className="mr-2 h-4 w-4" />Cancelar
            </Button>
          </div>
        </Card>
      )}

      <Card className="space-y-3 p-4">
        <h2 className="font-semibold">Produtos</h2>
        {(order.order_items || []).map((i) => (
          <div key={i.id} className="flex items-center justify-between gap-3 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium">{i.product_name}</p>
              <p className="text-xs text-muted-foreground">{i.quantity} × {formatBRL(i.unit_price)}</p>
            </div>
            <p className="font-semibold">{formatBRL(i.line_total)}</p>
          </div>
        ))}
        <div className="space-y-1.5 border-t border-white/[0.08] pt-3 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatBRL(order.subtotal)}</span></div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Frete ({order.shipping_service || order.shipping_carrier})</span>
            <span>{formatBRL(order.shipping_amount)}</span>
          </div>
          {Number(order.discount_amount) > 0 && (
            <div className="flex justify-between"><span className="text-muted-foreground">Desconto</span><span>-{formatBRL(order.discount_amount)}</span></div>
          )}
          <div className="flex justify-between text-base font-bold"><span>Total</span><span>{formatBRL(order.total)}</span></div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Pagamento: {order.payment_method}</span>
            <span>{pay ? PAYMENT_STATUS_LABEL[pay.status] || pay.status : '—'}</span>
          </div>
        </div>
      </Card>

      <Card className="space-y-2 p-4 text-sm">
        <h2 className="flex items-center gap-2 font-semibold"><MapPin className="h-4 w-4" /> Entrega</h2>
        <p>{order.ship_recipient_name} · {order.ship_phone}</p>
        <p className="text-muted-foreground">
          {order.ship_street}, {order.ship_number}{order.ship_complement ? ` – ${order.ship_complement}` : ''} · {order.ship_neighborhood}<br />
          {order.ship_city}/{order.ship_state} · CEP {order.ship_zip_code}
        </p>
        <p className="flex items-center gap-1.5 pt-1"><Truck className="h-3.5 w-3.5" /> Frete: <span className="font-medium">{formatShippingMode(order)}</span></p>
        {order.shipping_is_estimate && <p className="text-xs text-warning">Frete provisório — sujeito a confirmação.</p>}
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="flex items-center gap-2 font-semibold"><Truck className="h-4 w-4" /> Rastreamento (Correios)</h2>
        {order.tracking_code ? (
          <>
            <div className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.04] p-3">
              <span className="font-mono text-base font-semibold">{order.tracking_code}</span>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" className="h-10 w-10" aria-label="Copiar"
                  onClick={() => { navigator.clipboard?.writeText(order.tracking_code!); toast.success('Código copiado'); }}>
                  <Copy className="h-4 w-4" />
                </Button>
                <a href={correiosTrackingUrl(order.tracking_code)} target="_blank" rel="noopener noreferrer">
                  <Button size="icon" variant="ghost" className="h-10 w-10" aria-label="Abrir nos Correios"><ExternalLink className="h-4 w-4" /></Button>
                </a>
              </div>
            </div>
            <Button variant="outline" className="h-11 w-full" onClick={track} disabled={busy}>Consultar eventos</Button>
            {canConfirmReceipt && (
              <Button className="h-12 w-full" onClick={confirmReceived} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="mr-2 h-4 w-4" />RECEBI MINHA ENCOMENDA</>}
              </Button>
            )}
            {tracking && (
              tracking.configured && tracking.events.length ? (
                <ul className="space-y-2 text-sm">
                  {tracking.events.map((e, i) => (
                    <li key={i} className="rounded-xl border border-white/[0.08] p-2.5">
                      <p className="font-medium">{e.description}</p>
                      <p className="text-xs text-muted-foreground">{e.location}{e.date ? ` · ${new Date(e.date).toLocaleString('pt-BR')}` : ''}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{tracking.message || 'Sem eventos ainda. Use o link dos Correios acima.'}</p>
              )
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">O código aparece aqui assim que o pedido for enviado.</p>
        )}
        {canConfirmReceipt && !order.tracking_code && (
          <Button className="h-12 w-full" onClick={confirmReceived} disabled={busy}>
            <CheckCircle2 className="mr-2 h-4 w-4" />RECEBI MINHA ENCOMENDA
          </Button>
        )}
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
