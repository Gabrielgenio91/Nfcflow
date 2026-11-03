'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { StatCard } from '@/components/shared/stat-card';
import { RevenueChart, type SaleRow } from '@/components/charts/revenue-chart';
import { ReviewFinder } from '@/components/store/review-finder';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { QrCode, Store, ScanLine, CheckCircle2, Package } from 'lucide-react';
import type { Reseller } from '@/lib/types';
import { FreeShippingBanner } from '@/components/store/free-shipping-banner';
import { useCart } from '@/components/providers/cart-provider';
import { NX_CARD } from '@/components/shell/styles';

export default function ResellerDashboardPage() {
  const { user } = useAuth();
  const { count: cartCount } = useCart();
  const supabase = useMemo(() => createClient(), []);

  const [reseller, setReseller] = useState<Reseller | null>(null);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [stats, setStats] = useState({
    activePlaques: 0,
    customers: 0,
    scans: 0,
    inventoryItems: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    async function fetchData() {
      try {
        const { data: resellerData, error: resellerError } = await supabase
        .from('resellers')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();

        if (resellerError) {
          console.error('Erro reseller:', resellerError);
          setLoading(false);
          return;
        }

        if (!resellerData) {
          setLoading(false);
          return;
        }

        setReseller(resellerData as Reseller);
        const rid = resellerData.id;

        // Plaquinhas do revendedor (RLS): status, scans e valor vendido
        const [plaquesRes, inventory] = await Promise.all([
          supabase.from('plaques').select('status, scan_count, sale_value, sold_at').eq('reseller_id', rid),
          supabase.from('reseller_inventory').select('quantity').eq('reseller_id', rid),
        ]);

        if (plaquesRes.error) console.error('Erro plaques:', plaquesRes.error);

        const rows = (plaquesRes.data || []) as { status: string; scan_count: number | null; sale_value: number | string | null; sold_at: string | null }[];

        setSales(rows.filter((r) => r.sale_value!== null && r.sold_at) as SaleRow[]);
        // Clientes = quantidade de plaquinhas ativas (1 plaquinha ativa = 1 estabelecimento atendido)
        const activeCount = rows.filter((p) => p.status === 'ATIVA').length;
        setStats({
          activePlaques: activeCount,
          customers: activeCount,
          scans: rows.reduce((sum, p) => sum + (p.scan_count || 0), 0),
          inventoryItems: (inventory.data || []).reduce((s, i) => s + i.quantity, 0),
        });
      } catch (err) {
        console.error('Error dashboard:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [user, supabase]);

  return (
    <div className="space-y-6">
      <div className="nx-rise">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Olá, <span className="nx-gradient-text">{reseller?.full_name?.split(' ')[0] || 'Revendedor'}</span>!
        </h1>
        <p className="mt-1 text-sm text-[#a6a0c0]">Seu painel de controle</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard label="Ativas" value={stats.activePlaques} icon={CheckCircle2} accent="success" loading={loading} />
        <StatCard label="Clientes" value={stats.activePlaques} icon={Store} loading={loading} />
        <div className="col-span-2 lg:col-span-1"><StatCard label="Scans" value={stats.scans} icon={ScanLine} loading={loading} /></div>
      </div>

      {stats.inventoryItems > 0 && (
        <StatCard label="Itens em Estoque" value={stats.inventoryItems} icon={Package} accent="warning" loading={loading} />
      )}

      <FreeShippingBanner count={cartCount} />

      <RevenueChart sales={sales} loading={loading} />

      <ReviewFinder />

      <Card className={NX_CARD}>
        <CardHeader>
          <CardTitle className="text-base">Atalhos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <a href="/painel/plaquinhas" className="group flex items-center justify-between rounded-xl border border-[rgba(139,92,246,0.15)] bg-white/[0.03] px-4 py-3 text-sm transition-all hover:border-[rgba(139,92,246,0.45)] hover:bg-[rgba(123,77,255,0.12)]">
            <span className="flex items-center gap-2">
              <QrCode className="h-4 w-4 text-primary" />
              Minhas Plaquinhas
            </span>
            <span className="text-[#8c86a6] transition-transform group-hover:translate-x-0.5 group-hover:text-white">→</span>
          </a>
          <a href="/painel/mais/clientes" className="group flex items-center justify-between rounded-xl border border-[rgba(139,92,246,0.15)] bg-white/[0.03] px-4 py-3 text-sm transition-all hover:border-[rgba(139,92,246,0.45)] hover:bg-[rgba(123,77,255,0.12)]">
            <span className="flex items-center gap-2">
              <Store className="h-4 w-4 text-primary" />
              Meus Clientes
            </span>
            <span className="text-[#8c86a6] transition-transform group-hover:translate-x-0.5 group-hover:text-white">→</span>
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
