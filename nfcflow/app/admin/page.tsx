'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, ChevronDown, DollarSign, PackageCheck, Warehouse } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { StatCard } from '@/components/shared/stat-card';
import { SalesCharts, type SalesChannel } from '@/components/charts/sales-charts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { isOwner } from '@/lib/auth';
import { formatBRL } from '@/lib/money';
import { LOW_STOCK_THRESHOLD, stockLevel } from '@/lib/inventory';
import { cn } from '@/lib/utils';
import { NX_CARD, nxPill } from '@/components/shell/styles';

const PAID = ['PAGO', 'EM_PREPARACAO', 'ENVIADO', 'EM_TRANSITO', 'ENTREGUE'];

const FILTERS: { key: SalesChannel; label: string }[] = [
  { key: 'ALL', label: 'Todos' },
  { key: 'RETAIL', label: 'Varejo (Local)' },
  { key: 'WHOLESALE', label: 'Atacado (Lojinha)' },
];

interface StockRow { product_id: string; name: string; status: string; available_quantity: number; sold_online: number; sold_local: number }

export default function AdminDashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { user, profile, loading: authLoading } = useAuth();
  const [channel, setChannel] = useState<SalesChannel>('ALL');
  const [openFilter, setOpenFilter] = useState(false);
  const [loading, setLoading] = useState(true);
  const [wholesale, setWholesale] = useState(0);
  const [retail, setRetail] = useState(0);
  const [wholesaleCount, setWholesaleCount] = useState(0);
  const [retailCount, setRetailCount] = useState(0);
  const [toProduce, setToProduce] = useState(0);
  const [stock, setStock] = useState<StockRow[]>([]);

  const isAdmin =!!user && (isOwner(user) || profile?.role === 'admin');

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/login'); return; }
    if (!isAdmin) { router.replace('/painel'); return; }

    let alive = true;
    (async () => {
      setLoading(true);
      const [orders, local, inv] = await Promise.all([
        supabase.from('orders').select('total, status').limit(10000),
        supabase.from('local_sales').select('amount').limit(10000),
        supabase.from('inventory_overview').select('product_id, name, status, available_quantity, sold_online, sold_local'),
      ]);
      if (!alive) return;
      const paid = ((orders.data as { total: number | string; status: string }[]) || []).filter((o) => PAID.includes(o.status));
      setWholesale(paid.reduce((s, o) => s + Number(o.total), 0));
      setWholesaleCount(paid.length);
      setToProduce(paid.filter((o) => o.status === 'PAGO').length);
      const loc = (local.data as { amount: number | string }[]) || [];
      setRetail(loc.reduce((s, l) => s + Number(l.amount), 0));
      setRetailCount(loc.length);
      setStock(((inv.data as StockRow[]) || []).map((r) => ({...r, available_quantity: Number(r.available_quantity), sold_online: Number(r.sold_online || 0), sold_local: Number(r.sold_local || 0) })));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [user, isAdmin, authLoading, router, supabase]);

  const faturamento = channel === 'ALL'? wholesale + retail : channel === 'RETAIL'? retail : wholesale;
  const vendas = channel === 'ALL'? wholesaleCount + retailCount : channel === 'RETAIL'? retailCount : wholesaleCount;
  const alerts = stock.filter((r) => r.status === 'ATIVO' && stockLevel(r.available_quantity)!== 'ok');
  const totalStock = stock.reduce((s, r) => s + r.available_quantity, 0);
  const soldOnline = stock.reduce((s, r) => s + r.sold_online, 0);
  const soldLocal = stock.reduce((s, r) => s + r.sold_local, 0);

  if (authLoading || loading) return <div className="p-6">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div className="nx-rise">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Dashboard <span className="nx-gradient-text">Admin</span></h1>
        <p className="mt-1 truncate text-sm text-[#a6a0c0]">Logado como {user?.email}</p>
      </div>

      {/* AQUI ESTÁ O AJUSTE - SÓ 1 BOTÃO TODOS COM DROPDOWN */}
      <div className="relative">
        <button
          onClick={() => setOpenFilter(!openFilter)}
          className={cn('flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-all', nxPill(true))}
        >
          {FILTERS.find(f => f.key === channel)?.label}
          <ChevronDown className={cn("h-4 w-4 transition-transform", openFilter && "rotate-180")} />
        </button>

        {openFilter && (
          <div className="absolute left-0 top-full mt-2 z-50 min-w-[180px] rounded-xl border border-[rgba(139,92,246,0.35)] bg-[#1a1628] p-1 shadow-xl">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => { setChannel(f.key); setOpenFilter(false); }}
                className={cn('w-full text-left rounded-lg px-3 py-2 text-sm', channel === f.key? 'bg-[rgba(123,77,255,0.2)] text-white' : 'text-[#a6a0c0] hover:bg-white/5 hover:text-white')}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <Card className={NX_CARD}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-[#b7b2cc]">
            Faturamento
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[rgba(139,92,246,0.35)] bg-[rgba(123,77,255,0.16)] text-[#b9a2ff] shadow-[0_0_22px_-6px_rgba(123,77,255,0.8)]"><DollarSign className="h-5 w-5" /></span>
            <span className="text-3xl font-bold tracking-tight sm:text-4xl">{formatBRL(faturamento)}</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{vendas} venda(s)</p>
        </CardContent>
      </Card>

      <SalesCharts mode="admin" channel={channel} />

      <Card className={NX_CARD}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-[#b7b2cc]"><Warehouse className="h-4 w-4" />Estoque</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div><p className="text-3xl font-bold">{totalStock}</p><p className="text-xs text-muted-foreground">unidades em estoque</p></div>
            <div className="text-right text-xs text-muted-foreground">
              <p>Vendidas — atacado (loja virtual): <span className="font-semibold text-foreground">{soldOnline}</span></p>
              <p>Vendidas — local: <span className="font-semibold text-foreground">{soldLocal}</span></p>
            </div>
          </div>
          <ul className="space-y-1.5 border-t border-[rgba(139,92,246,0.15)] pt-3 text-sm">
            {stock.filter((r) => r.status === 'ATIVO').map((r) => (
              <li key={r.product_id} className="flex justify-between gap-3">
                <span className="truncate">{r.name}</span>
                <span className={stockLevel(r.available_quantity) === 'out'? 'font-semibold text-destructive' : 'font-semibold'}>{r.available_quantity} un.</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {alerts.length > 0 && (
        <Link href="/admin/estoque" className="block">
          <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm shadow-[0_0_40px_-20px_hsl(var(--warning))] transition-colors hover:border-warning/50">
            <p className="flex items-center gap-2 font-semibold text-warning"><AlertTriangle className="h-4 w-4" />Estoque acabando</p>
            <ul className="mt-2 space-y-1">
              {alerts.slice(0, 5).map((r) => (
                <li key={r.product_id} className="flex justify-between gap-3">
                  <span>{r.name}</span>
                  <span className={stockLevel(r.available_quantity) === 'out'? 'font-semibold text-destructive' : 'font-semibold text-warning'}>
                    {stockLevel(r.available_quantity) === 'out'? 'Esgotado' : `${r.available_quantity} un.`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Link>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link href="/admin/pedidos">
          <StatCard label="Pra Produzir" value={toProduce} icon={PackageCheck} loading={loading} accent={toProduce > 0? 'warning' : undefined} />
        </Link>
        <Link href="/admin/estoque">
          <StatCard label="Estoque Baixo" value={alerts.length} icon={Warehouse} loading={loading} accent={alerts.length > 0? 'warning' : 'success'} />
        </Link>
      </div>

      <Card className={NX_CARD}>
        <CardContent className="p-3 text-xs text-[#8c86a6]">
          Estoque disponível total: {totalStock} unidades · alerta a partir de {LOW_STOCK_THRESHOLD} unidades por produto.
        </CardContent>
      </Card>
    </div>
  );
    }
