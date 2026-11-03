'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRightLeft, History, Loader2, PackagePlus, SlidersHorizontal, Warehouse } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { cn } from '@/lib/utils';
import { LOW_STOCK_THRESHOLD, stockLevel } from '@/lib/inventory';
import type { InventoryMovement, Reseller } from '@/lib/types';

interface Row { product_id: string; name: string; status: string; quantity: number; reserved_quantity: number; available_quantity: number; sold_online: number; sold_local: number; photo_url?: string | null; description?: string | null; sold_out?: boolean; price?: number | null }
type Action = 'ENTRADA' | 'AJUSTE' | 'TRANSFERENCIA';

const ACTIONS: { key: Action; label: string; icon: typeof PackagePlus; hint: string }[] = [
  { key: 'ENTRADA', label: 'Entrada', icon: PackagePlus, hint: 'Soma a quantidade informada ao estoque.' },
  { key: 'AJUSTE', label: 'Ajuste', icon: SlidersHorizontal, hint: 'Define a quantidade total em estoque (inclui unidades já reservadas por pedidos aguardando pagamento).' },
  { key: 'TRANSFERENCIA', label: 'Transferência', icon: ArrowRightLeft, hint: 'Estoque central → revendedor.' },
];

const MOVEMENT_LABEL: Record<string, string> = {
  ENTRADA: 'Entrada', SAIDA: 'Saída', TRANSFERENCIA: 'Transferência', AJUSTE: 'Ajuste',
  ATIVACAO: 'Ativação', RESERVA: 'Reserva', LIBERACAO: 'Liberação',
};

const ERR: Record<string, string> = {
  NEGATIVE_STOCK: 'O estoque não pode ficar negativo.',
  BELOW_RESERVED: 'A quantidade não pode ser menor que o estoque reservado por pedidos.',
  INSUFFICIENT_STOCK: 'Estoque disponível insuficiente para transferir.',
  INVALID_QUANTITY: 'Quantidade inválida.',
  RESELLER_NOT_FOUND: 'Revendedor não encontrado.',
  FORBIDDEN: 'Sem permissão.',
};

export default function AdminInventoryPage() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [resellers, setResellers] = useState<Pick<Reseller, 'id' | 'full_name'>[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<Action | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ product_id: '', quantity: '', reseller_id: '', notes: '' });

  const load = useCallback(async () => {
    const [o, r, m, pr] = await Promise.all([
      supabase.from('inventory_overview').select('*').order('name'),
      supabase.from('resellers').select('id, full_name').eq('status', 'ATIVO').order('full_name'),
      supabase.from('inventory_movements').select('*, product:products(name)').order('created_at', { ascending: false }).limit(60),
      // dados da loja (foto, descrição, preço, esgotado) para espelhar o que o revendedor vê
      supabase.from('products').select('id, description, photo_url, sold_out, product_price_tiers(min_quantity, unit_price)'),
    ]);
    const meta = new Map<string, { photo_url: string | null; description: string | null; sold_out: boolean; price: number | null }>();
    ((pr.data as any[]) || []).forEach((p) => {
      const tiers = ([...(p.product_price_tiers || [])] as { min_quantity: number; unit_price: number | string }[]).sort((a, b) => a.min_quantity - b.min_quantity);
      meta.set(p.id, { photo_url: p.photo_url, description: p.description, sold_out: !!p.sold_out, price: tiers.length ? Number(tiers[0].unit_price) : null });
    });
    if (o.error) toast.error('Erro ao carregar estoque');
    setRows(((o.data as Row[]) || []).map((x) => ({ ...x, quantity: Number(x.quantity), reserved_quantity: Number(x.reserved_quantity), available_quantity: Number(x.available_quantity), sold_online: Number(x.sold_online || 0), sold_local: Number(x.sold_local || 0), ...(meta.get(x.product_id) || {}) })));
    setResellers(r.data || []);
    setMovements((m.data as unknown as InventoryMovement[]) || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);
  // as quantidades acompanham as vendas: recarrega a cada 30s e ao voltar para a aba
  useEffect(() => {
    const t = setInterval(load, 30000);
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [load]);

  const totals = rows.reduce((t, r) => ({ q: t.q + r.quantity, r: t.r + r.reserved_quantity, a: t.a + r.available_quantity, s: t.s + r.sold_online }), { q: 0, r: 0, a: 0, s: 0 });

  const open = (a: Action, productId = '') => { setAction(a); setForm({ product_id: productId, quantity: '', reseller_id: '', notes: '' }); };

  const submit = async () => {
    const qty = parseInt(form.quantity, 10);
    if (!form.product_id) { toast.error('Selecione o produto'); return; }
    if (!Number.isInteger(qty) || qty < 0 || (action !== 'AJUSTE' && qty === 0)) { toast.error('Informe uma quantidade válida'); return; }
    if (action === 'TRANSFERENCIA' && !form.reseller_id) { toast.error('Selecione o revendedor'); return; }
    setSaving(true);
    const { error } = action === 'TRANSFERENCIA'
      ? await supabase.rpc('admin_transfer_stock', { p_product_id: form.product_id, p_reseller_id: form.reseller_id, p_quantity: qty, p_notes: form.notes })
      : await supabase.rpc('admin_adjust_inventory', { p_product_id: form.product_id, p_type: action, p_quantity: qty, p_notes: form.notes });
    setSaving(false);
    if (error) {
      const key = Object.keys(ERR).find((k) => error.message.includes(k));
      toast.error(key ? ERR[key] : 'Erro ao registrar movimentação');
      return;
    }
    toast.success('Movimentação registrada');
    setAction(null);
    load();
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const selectCls = 'h-12 w-full rounded-xl border border-input bg-white/[0.03] px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Estoque</h1>
          <p className="mt-1 text-sm text-muted-foreground">Quantidade em estoque e unidades vendidas na loja virtual (baixa automática a cada compra paga)</p>
        </div>
        <Button variant="outline" onClick={() => setShowHistory((v) => !v)} className="h-11"><History className="mr-2 h-4 w-4" />{showHistory ? 'Ocultar histórico' : 'Histórico'}</Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[['Em estoque', totals.a], ['Vendidas na loja virtual', totals.s]].map(([l, v]) => (
          <Card key={l as string} className="p-4"><p className="text-xs text-muted-foreground">{l}</p><p className="mt-1 text-2xl font-bold">{v}</p></Card>
        ))}
        {totals.r > 0 && <p className="col-span-2 text-xs text-muted-foreground">{totals.r} unidade(s) já descontadas do estoque por pedidos aguardando pagamento (voltam se o pedido expirar ou for cancelado).</p>}
      </div>

      {rows.filter((r) => r.status === 'ATIVO' && stockLevel(r.available_quantity) !== 'ok').length > 0 && (
        <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold text-warning"><AlertTriangle className="h-4 w-4" />Atenção: estoque acabando</p>
          <ul className="mt-2 space-y-1">
            {rows.filter((r) => r.status === 'ATIVO' && stockLevel(r.available_quantity) !== 'ok').map((r) => (
              <li key={r.product_id} className="flex justify-between gap-3">
                <span>{r.name}</span>
                <span className={stockLevel(r.available_quantity) === 'out' ? 'font-semibold text-destructive' : 'font-semibold text-warning'}>
                  {stockLevel(r.available_quantity) === 'out' ? 'Esgotado' : `Baixo: ${r.available_quantity} un.`}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">Alerta quando o disponível é de {LOW_STOCK_THRESHOLD} unidades ou menos.</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {ACTIONS.map((a) => (
          <Button key={a.key} onClick={() => open(a.key)} variant={action === a.key ? 'default' : 'outline'} className="h-11"><a.icon className="mr-2 h-4 w-4" />{a.label}</Button>
        ))}
      </div>

      {action && (
        <Card>
          <CardHeader><CardTitle className="text-base">{ACTIONS.find((a) => a.key === action)?.label}</CardTitle>
            <p className="text-sm text-muted-foreground">{ACTIONS.find((a) => a.key === action)?.hint}</p></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5"><Label>Produto</Label>
              <select className={selectCls} value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })}>
                <option value="">Selecione…</option>
                {rows.map((r) => <option key={r.product_id} value={r.product_id} className="bg-card">{r.name} (disp. {r.available_quantity})</option>)}
              </select></div>
            {action === 'TRANSFERENCIA' && (
              <div className="space-y-1.5"><Label>Revendedor</Label>
                <select className={selectCls} value={form.reseller_id} onChange={(e) => setForm({ ...form, reseller_id: e.target.value })}>
                  <option value="">Selecione…</option>
                  {resellers.map((r) => <option key={r.id} value={r.id} className="bg-card">{r.full_name}</option>)}
                </select></div>
            )}
            <div className="space-y-1.5"><Label>{action === 'AJUSTE' ? 'Nova quantidade total' : 'Quantidade'}</Label>
              <Input type="number" inputMode="numeric" min={0} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="h-12" /></div>
            <div className="space-y-1.5"><Label>Observações</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="h-12" maxLength={200} /></div>
            <div className="flex gap-2">
              <Button variant="outline" className="h-12 flex-1" onClick={() => setAction(null)} disabled={saving}>Cancelar</Button>
              <Button className="h-12 flex-1" onClick={submit} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar'}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {rows.length === 0 ? (
        <EmptyState icon={Warehouse} title="Nenhum produto cadastrado" description="Cadastre produtos para controlar o estoque." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
            <Card key={r.product_id} className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  {r.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.photo_url} alt="" className="h-10 w-10 flex-shrink-0 rounded-lg object-cover" />
                  ) : null}
                  <div className="min-w-0">
                    <h3 className="font-medium leading-tight">{r.name}</h3>
                    <p className="text-xs text-muted-foreground">{r.price != null ? `R$ ${r.price.toFixed(2).replace('.', ',')}` : 'Sem preço'}</p>
                  </div>
                </div>
                {r.status !== 'ATIVO' && <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">Inativo</Badge>}
                {r.status === 'ATIVO' && r.sold_out && <Badge variant="outline" className="border-destructive/40 text-destructive">Esgotado na loja</Badge>}
                {r.status === 'ATIVO' && !r.sold_out && stockLevel(r.available_quantity) === 'out' && <Badge variant="outline" className="border-destructive/40 text-destructive">Esgotado</Badge>}
                {r.status === 'ATIVO' && stockLevel(r.available_quantity) === 'low' && <Badge variant="outline" className="border-warning/40 text-warning">Estoque baixo</Badge>}
              </div>
              <div className="grid grid-cols-2 gap-2 text-center text-sm">
                <div className="rounded-xl bg-white/[0.04] p-2"><p className="text-xs text-muted-foreground">Em estoque</p><p className={cn('font-bold', r.available_quantity === 0 ? 'text-destructive' : 'text-success')}>{r.available_quantity}</p></div>
                <div className="rounded-xl bg-white/[0.04] p-2"><p className="text-xs text-muted-foreground">Vendidas (loja virtual)</p><p className="font-bold">{r.sold_online}</p></div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-10 flex-1" onClick={() => open('ENTRADA', r.product_id)}>Entrada</Button>
                <Button size="sm" variant="outline" className="h-10 flex-1" onClick={() => open('TRANSFERENCIA', r.product_id)}>Transferir</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showHistory && (
        <Card>
          <CardHeader><CardTitle className="text-base">Últimas movimentações</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {movements.length === 0 && <p className="text-sm text-muted-foreground">Sem movimentações.</p>}
            {movements.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 border-b border-white/[0.06] pb-2 text-sm last:border-0">
                <div className="min-w-0">
                  <p className="truncate font-medium">{(m as unknown as { product?: { name: string } }).product?.name || 'Produto'}</p>
                  <p className="truncate text-xs text-muted-foreground">{MOVEMENT_LABEL[m.movement_type] || m.movement_type} · {new Date(m.created_at).toLocaleString('pt-BR')}{m.notes ? ` · ${m.notes}` : ''}</p>
                </div>
                <span className={cn('font-bold', m.quantity >= 0 ? 'text-success' : 'text-destructive')}>{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
