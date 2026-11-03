'use client';

import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { NX_CARD, nxPill } from '@/components/shell/styles';

export interface SaleRow { sale_value: number | string | null; sold_at: string | null }
type Period = '7d' | '30d' | '90d' | '12m';

const PERIODS: { key: Period; label: string }[] = [
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: '90d', label: '90 dias' },
  { key: '12m', label: '12 meses' },
];
const PURPLE = '#8B5CF6';
const BLUE = '#3B82F6';
const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

/**
 * Faturamento do revendedor = SUM(plaques.sale_value) das plaquinhas dele (valor informado na ativação).
 * `sales` já vem filtrado pelo RLS (só as plaquinhas do próprio revendedor).
 */
export function RevenueChart({ sales, loading }: { sales: SaleRow[]; loading?: boolean }) {
  const [period, setPeriod] = useState<Period>('30d');

  const total = useMemo(() => sales.reduce((s, r) => s + Number(r.sale_value || 0), 0), [sales]);

  const data = useMemo(() => {
    const now = new Date();
    const monthly = period === '12m';
    const n = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 12;
    const buckets: { key: string; label: string; revenue: number }[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = monthly ? new Date(now.getFullYear(), now.getMonth() - i, 1) : new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      buckets.push({
        key: monthly ? monKey(d) : dayKey(d),
        label: monthly ? d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        revenue: 0,
      });
    }
    const idx = new Map(buckets.map((b) => [b.key, b]));
    for (const r of sales) {
      if (!r.sold_at) continue;
      const b = idx.get((monthly ? monKey : dayKey)(new Date(r.sold_at)));
      if (b) b.revenue += Number(r.sale_value || 0);
    }
    return buckets;
  }, [sales, period]);

  const periodTotal = data.reduce((s, b) => s + b.revenue, 0);
  const tick = { fill: '#8c86a6', fontSize: 11 };
  const interval = data.length > 14 ? Math.floor(data.length / 6) : 0;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Faturamento</h2>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={cn('rounded-full border px-3 py-1.5 text-xs transition-all', nxPill(period === p.key))}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <Card className={NX_CARD}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-[#b7b2cc]">Faturamento total</CardTitle>
          {loading ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          ) : (
            <p className="text-3xl font-bold tracking-tight">{formatBRL(total)}</p>
          )}
          {!loading && <p className="text-xs text-muted-foreground">{formatBRL(periodTotal)} no período selecionado</p>}
        </CardHeader>
        <CardContent className="h-56 pl-0 sm:h-64">
          {loading ? null : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ left: 0, right: 12, top: 8 }}>
                <defs>
                  <linearGradient id="rev-reseller" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={PURPLE} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={BLUE} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(139,92,246,0.12)" vertical={false} />
                <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} interval={interval} />
                <YAxis tick={tick} axisLine={false} tickLine={false} width={56} tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))} />
                <Tooltip
                  contentStyle={{ background: '#0d0920', border: '1px solid rgba(139,92,246,0.35)', borderRadius: 12, fontSize: 12, boxShadow: '0 10px 30px rgba(123,77,255,0.25)' }}
                  labelStyle={{ color: '#a6a0c0' }}
                  formatter={(v: unknown) => [formatBRL(Number(v)), 'Faturamento']}
                />
                <Area type="monotone" dataKey="revenue" stroke={PURPLE} strokeWidth={2} fill="url(#rev-reseller)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
