'use client';

import { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { NX_CARD, nxPill } from '@/components/shell/styles';

type Mode = 'admin' | 'reseller';
export type SalesChannel = 'ALL' | 'RETAIL' | 'WHOLESALE'; // Todos | Varejo (Local) | Atacado (Lojinha)
type Period = '7d' | '30d' | '90d' | '12m';

const PERIODS: { key: Period; label: string }[] = [
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: '90d', label: '90 dias' },
  { key: '12m', label: '12 meses' },
];

const PURPLE = '#8B5CF6';
const BLUE = '#3B82F6';
const PAID = ['PAGO', 'EM_PREPARACAO', 'ENVIADO', 'EM_TRANSITO', 'ENTREGUE'];

interface OrderRow { created_at: string; paid_at: string | null; total: number | string; status: string; order_items: { quantity: number }[] | null }
interface Bucket { key: string; label: string; revenue: number; orders: number; plaques: number; activated: number }

function buildBuckets(period: Period): { buckets: Bucket[]; keyOf: (d: Date) => string } {
  const now = new Date();
  const monthly = period === '12m';
  const n = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 12;
  const buckets: Bucket[] = [];
  const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const monKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  for (let i = n - 1; i >= 0; i--) {
    const d = monthly ? new Date(now.getFullYear(), now.getMonth() - i, 1) : new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    buckets.push({
      key: monthly ? monKey(d) : dayKey(d),
      label: monthly ? d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      revenue: 0, orders: 0, plaques: 0, activated: 0,
    });
  }
  return { buckets, keyOf: monthly ? monKey : dayKey };
}

const tooltipStyle = {
  contentStyle: { background: '#0d0920', border: '1px solid rgba(139,92,246,0.35)', borderRadius: 12, fontSize: 12, boxShadow: '0 10px 30px rgba(123,77,255,0.25)' },
  labelStyle: { color: '#a6a0c0' },
};

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className={NX_CARD}>
      <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-[#b7b2cc]">{title}</CardTitle></CardHeader>
      <CardContent className="h-56 pl-0 sm:h-64">
        <ResponsiveContainer width="100%" height="100%">{children as React.ReactElement}</ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

/** Gráficos responsivos (Recharts). ADMIN: faturamento/vendas/placas. REVENDEDOR: vendas (ativações)/pedidos/placas. */
export function SalesCharts({ mode, channel = 'ALL' }: { mode: Mode; channel?: SalesChannel }) {
  const supabase = useMemo(() => createClient(), []);
  const [period, setPeriod] = useState<Period>('30d');
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [activations, setActivations] = useState<string[]>([]);
  const [localSales, setLocalSales] = useState<{ created_at: string; amount: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const since = new Date();
      since.setMonth(since.getMonth() - 12);
      const iso = since.toISOString();
      // RLS já restringe: admin vê tudo; revendedor só os próprios dados
      const o = await supabase.from('orders').select('created_at, paid_at, total, status, order_items(quantity)')
        .gte('created_at', iso).neq('status', 'CANCELADO').order('created_at', { ascending: true }).limit(5000);
      let acts: string[] = [];
      if (mode === 'reseller') {
        const a = await supabase.from('plaques').select('activated_at').not('activated_at', 'is', null).gte('activated_at', iso).limit(10000);
        acts = ((a.data as { activated_at: string }[]) || []).map((x) => x.activated_at);
      }
      let locals: { created_at: string; amount: number }[] = [];
      if (mode === 'admin') {
        const l = await supabase.from('local_sales').select('created_at, amount').gte('created_at', iso).limit(5000);
        locals = ((l.data as { created_at: string; amount: number | string }[]) || []).map((x) => ({ created_at: x.created_at, amount: Number(x.amount) }));
      }
      if (!alive) return;
      setLocalSales(locals);
      setOrders((o.data as unknown as OrderRow[]) || []);
      setActivations(acts);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [supabase, mode]);

  const data = useMemo(() => {
    const { buckets, keyOf } = buildBuckets(period);
    const idx = new Map(buckets.map((b) => [b.key, b]));
    for (const o of orders) {
      if (mode === 'admin' && channel === 'RETAIL') break; // varejo = só vendas locais
      const qty = (o.order_items || []).reduce((s, i) => s + i.quantity, 0);
      if (mode === 'admin') {
        if (!PAID.includes(o.status)) continue; // vendas = pedidos pagos
        const b = idx.get(keyOf(new Date(o.paid_at || o.created_at)));
        if (b) { b.revenue += Number(o.total); b.orders += 1; b.plaques += qty; }
      } else {
        const b = idx.get(keyOf(new Date(o.created_at)));
        if (b) { b.revenue += Number(o.total); b.orders += 1; b.plaques += qty; }
      }
    }
    if (mode === 'admin' && channel !== 'WHOLESALE') {
      for (const l of localSales) {
        const b = idx.get(keyOf(new Date(l.created_at)));
        if (b) { b.revenue += l.amount; b.orders += 1; b.plaques += 1; }
      }
    }
    for (const a of activations) {
      const b = idx.get(keyOf(new Date(a)));
      if (b) b.activated += 1;
    }
    return buckets;
  }, [orders, activations, localSales, period, mode, channel]);

  const totals = data.reduce((t, b) => ({ revenue: t.revenue + b.revenue, orders: t.orders + b.orders, plaques: t.plaques + b.plaques, activated: t.activated + b.activated }), { revenue: 0, orders: 0, plaques: 0, activated: 0 });
  const tick = { fill: '#8c86a6', fontSize: 11 };
  const interval = data.length > 14 ? Math.floor(data.length / 6) : 0;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{mode === 'admin' ? 'Vendas e faturamento' : 'Meu desempenho'}</h2>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={cn('rounded-full border px-3 py-1.5 text-xs transition-all', nxPill(period === p.key))}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : mode === 'admin' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <ChartCard title={`Faturamento — ${formatBRL(totals.revenue)}`}>
              <AreaChart data={data} margin={{ left: 0, right: 12, top: 8 }}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={PURPLE} stopOpacity={0.5} /><stop offset="100%" stopColor={BLUE} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(139,92,246,0.12)" vertical={false} />
                <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} interval={interval} />
                <YAxis tick={tick} axisLine={false} tickLine={false} width={56} tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))} />
                <Tooltip {...tooltipStyle} formatter={(v: unknown) => [formatBRL(Number(v)), 'Faturamento']} />
                <Area type="monotone" dataKey="revenue" stroke={PURPLE} strokeWidth={2} fill="url(#rev)" />
              </AreaChart>
            </ChartCard>
          </div>
          <ChartCard title={`Vendas por período — ${totals.orders} pedido(s) pago(s)`}>
            <BarChart data={data} margin={{ left: 0, right: 12, top: 8 }}>
              <CartesianGrid stroke="rgba(139,92,246,0.12)" vertical={false} />
              <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} interval={interval} />
              <YAxis tick={tick} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
              <Tooltip {...tooltipStyle} formatter={(v: unknown) => [Number(v), 'Vendas']} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="orders" fill={PURPLE} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ChartCard>
          <ChartCard title={`Placas vendidas — ${totals.plaques}`}>
            <BarChart data={data} margin={{ left: 0, right: 12, top: 8 }}>
              <CartesianGrid stroke="rgba(139,92,246,0.12)" vertical={false} />
              <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} interval={interval} />
              <YAxis tick={tick} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
              <Tooltip {...tooltipStyle} formatter={(v: unknown) => [Number(v), 'Placas']} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="plaques" fill={BLUE} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ChartCard>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <ChartCard title={`Vendas por período — ${totals.activated} plaquinha(s) ativada(s) para clientes`}>
              <AreaChart data={data} margin={{ left: 0, right: 12, top: 8 }}>
                <defs>
                  <linearGradient id="act" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={BLUE} stopOpacity={0.5} /><stop offset="100%" stopColor={PURPLE} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(139,92,246,0.12)" vertical={false} />
                <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} interval={interval} />
                <YAxis tick={tick} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
                <Tooltip {...tooltipStyle} formatter={(v: unknown) => [Number(v), 'Vendas']} />
                <Area type="monotone" dataKey="activated" stroke={BLUE} strokeWidth={2} fill="url(#act)" />
              </AreaChart>
            </ChartCard>
          </div>
          <ChartCard title={`Pedidos — ${totals.orders} (${formatBRL(totals.revenue)})`}>
            <BarChart data={data} margin={{ left: 0, right: 12, top: 8 }}>
              <CartesianGrid stroke="rgba(139,92,246,0.12)" vertical={false} />
              <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} interval={interval} />
              <YAxis tick={tick} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
              <Tooltip {...tooltipStyle} formatter={(v: unknown) => [Number(v), 'Pedidos']} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="orders" fill={PURPLE} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ChartCard>
          <ChartCard title="Placas compradas × vendidas">
            <BarChart data={data} margin={{ left: 0, right: 12, top: 8 }}>
              <CartesianGrid stroke="rgba(139,92,246,0.12)" vertical={false} />
              <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} interval={interval} />
              <YAxis tick={tick} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
              <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#a6a0c0' }} />
              <Bar dataKey="plaques" name="Compradas" fill={PURPLE} radius={[6, 6, 0, 0]} />
              <Bar dataKey="activated" name="Vendidas (ativadas)" fill={BLUE} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ChartCard>
        </div>
      )}
    </section>
  );
}
