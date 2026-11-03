'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Plaque, Product, Reseller } from '@/lib/types';
import { getQrBaseUrl } from '@/lib/app-url';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { QrCode, Loader2, Plus, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';

export default function AdminPlaquesPage() {
  const supabase = createClient();
  const [plaques, setPlaques] = useState<Plaque[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [form, setForm] = useState({
    product_id: '',
    reseller_id: '',
    quantity: '1',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [p, prods, res] = await Promise.all([
        supabase
          .from('plaques')
          .select('*, product:products(*), reseller:resellers(*)')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase.from('products').select('*').eq('status', 'ATIVO').order('name'),
        supabase.from('resellers').select('*').eq('status', 'ATIVO').order('full_name'),
      ]);
      if (p.error) throw p.error;
      setPlaques((p.data as Plaque[]) || []);
      setProducts((prods.data as Product[]) || []);
      setResellers((res.data as Reseller[]) || []);
    } catch (err) {
      console.error('Error:', err);
      toast.error('Erro ao carregar plaquinhas');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const createPlaques = async () => {
    const qty = parseInt(form.quantity);
    if (!form.product_id || isNaN(qty) || qty < 1 || qty > 500) {
      toast.error('Selecione um produto e uma quantidade válida (1-500)');
      return;
    }
    setSaving(true);
    try {
      const inserts = Array.from({ length: qty }, () => ({
        product_id: form.product_id,
        reseller_id: form.reseller_id || null,
        status: 'DISPONIVEL',
      }));
      const { data, error } = await supabase.from('plaques').insert(inserts).select('public_token');
      if (error) throw error;
      toast.success(`${qty} plaquinha(s) criada(s)!`);
      setForm({ product_id: '', reseller_id: '', quantity: '1' });
      setShowForm(false);
      if (data && data.length === 1) {
        setQrToken(data[0].public_token);
      }
      fetchData();
    } catch (err) {
      console.error('Error:', err);
      toast.error('Erro ao criar plaquinhas');
    } finally {
      setSaving(false);
    }
  };

  const filtered = plaques.filter(
    (p) =>
      p.public_token.toLowerCase().includes(search.toLowerCase()) ||
      p.product?.name?.toLowerCase().includes(search.toLowerCase())
  );

  const siteUrl = getQrBaseUrl();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Plaquinhas</h1>
          <p className="mt-1 text-sm text-muted-foreground">Gerencie plaquinhas e QR Codes</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="gradient-primary text-primary-foreground hover:opacity-90">
          <Plus className="mr-2 h-4 w-4" />
          Criar plaquinhas
        </Button>
      </div>

      {showForm && (
        <Card className="p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-medium">Criar novas plaquinhas</h3>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowForm(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Produto *</Label>
              <select
                value={form.product_id}
                onChange={(e) => setForm({ ...form, product_id: e.target.value })}
                className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Selecione...</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Revendedor (opcional)</Label>
              <select
                value={form.reseller_id}
                onChange={(e) => setForm({ ...form, reseller_id: e.target.value })}
                className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Sem revendedor (estoque central)</option>
                {resellers.map((r) => (
                  <option key={r.id} value={r.id}>{r.full_name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Quantidade *</Label>
              <Input
                type="number"
                min="1"
                max="500"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                className="h-11"
              />
            </div>
            <Button onClick={createPlaques} disabled={saving} className="h-11 gradient-primary text-primary-foreground hover:opacity-90">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Criar plaquinhas'}
            </Button>
          </div>
        </Card>
      )}

      {qrToken && (
        <Card className="p-6">
          <div className="flex flex-col items-center gap-4">
            <h3 className="font-semibold">QR Code gerado</h3>
            <div className="rounded-xl bg-white p-4">
              <QRCodeSVG value={`${siteUrl}/q/${qrToken}`} size={200} />
            </div>
            <div className="text-center">
              <p className="font-mono text-sm text-muted-foreground">Token: {qrToken}</p>
              <p className="mt-1 text-xs text-muted-foreground">URL: {siteUrl}/q/{qrToken}</p>
            </div>
            <Button variant="outline" onClick={() => setQrToken(null)}>Fechar</Button>
          </div>
        </Card>
      )}

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por token ou produto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={QrCode}
          title="Nenhuma plaquinha encontrada"
          description="Crie plaquinhas para gerar QR Codes únicos"
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((plaque) => (
            <Card key={plaque.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-medium">{plaque.product?.name || 'Produto'}</h3>
                  <p className="font-mono text-xs text-muted-foreground">{plaque.public_token}</p>
                </div>
                <Badge variant="outline" className={
                  plaque.status === 'ATIVA' ? 'border-success/30 text-success' :
                  plaque.status === 'DISPONIVEL' ? 'border-warning/30 text-warning' :
                  'border-muted-foreground/30 text-muted-foreground'
                }>
                  {plaque.status}
                </Badge>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                {plaque.reseller ? (
                  <span>{plaque.reseller.full_name}</span>
                ) : (
                  <span>Sem revendedor</span>
                )}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="rounded bg-white p-1">
                  <QRCodeSVG value={`${siteUrl}/q/${plaque.public_token}`} size={48} />
                </div>
                <a
                  href={`${siteUrl}/q/${plaque.public_token}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  Abrir link
                </a>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
