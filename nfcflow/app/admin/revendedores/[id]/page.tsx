'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Reseller, Customer, Plaque, ResellerInventory, InventoryMovement } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/shared/stat-card';
import { ArrowLeft, Loader2, QrCode, Store, Package, Ban, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ResellerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();
  const [reseller, setReseller] = useState<Reseller | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plaques, setPlaques] = useState<Plaque[]>([]);
  const [inventory, setInventory] = useState<ResellerInventory[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [r, c, p, inv, mov] = await Promise.all([
        supabase.from('resellers').select('*').eq('id', id).maybeSingle(),
        supabase.from('customers').select('*').eq('reseller_id', id).order('created_at', { ascending: false }),
        supabase.from('plaques').select('*, product:products(*)').eq('reseller_id', id).order('created_at', { ascending: false }),
        supabase.from('reseller_inventory').select('*, product:products(*)').eq('reseller_id', id),
        supabase.from('inventory_movements').select('*, product:products(*)').eq('reseller_id', id).order('created_at', { ascending: false }).limit(20),
      ]);

      if (r.error) throw r.error;
      setReseller(r.data as Reseller);
      setCustomers((c.data as Customer[]) || []);
      setPlaques((p.data as Plaque[]) || []);
      setInventory((inv.data as ResellerInventory[]) || []);
      setMovements((mov.data as InventoryMovement[]) || []);
    } catch (err) {
      console.error('Error:', err);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, [supabase, id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleBlock = async () => {
    if (!reseller) return;
    const newStatus = reseller.status === 'ATIVO' ? 'BLOQUEADO' : 'ATIVO';
    const { error } = await supabase.from('resellers').update({ status: newStatus }).eq('id', reseller.id);
    if (error) {
      toast.error('Erro ao alterar status');
      return;
    }
    toast.success(newStatus === 'ATIVO' ? 'Revendedor ativado' : 'Revendedor bloqueado');
    fetchData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!reseller) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">Revendedor não encontrado</p>
        <Link href="/admin/revendedores" className="mt-4 inline-block">
          <Button variant="outline">Voltar</Button>
        </Link>
      </div>
    );
  }

  const activePlaques = plaques.filter((p) => p.status === 'ATIVA').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/revendedores">
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{reseller.full_name}</h1>
          <p className="text-sm text-muted-foreground">{reseller.email}</p>
        </div>
        <Button
          variant={reseller.status === 'ATIVO' ? 'destructive' : 'default'}
          onClick={toggleBlock}
        >
          {reseller.status === 'ATIVO' ? (
            <>
              <Ban className="mr-2 h-4 w-4" />
              Bloquear
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Ativar
            </>
          )}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Clientes" value={customers.length} icon={Store} />
        <StatCard label="Plaquinhas" value={plaques.length} icon={QrCode} />
        <StatCard label="Ativas" value={activePlaques} icon={CheckCircle2} accent="success" />
        <StatCard label="Itens em Estoque" value={inventory.reduce((s, i) => s + i.quantity, 0)} icon={Package} accent="warning" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados do Revendedor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Telefone</span>
              <span>{reseller.phone || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Documento</span>
              <span>{reseller.document || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Endereço</span>
              <span>{reseller.address || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge variant={reseller.status === 'ATIVO' ? 'default' : 'destructive'}
                className={reseller.status === 'ATIVO' ? 'bg-success/15 text-success hover:bg-success/20' : ''}>
                {reseller.status === 'ATIVO' ? 'Ativo' : 'Bloqueado'}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cadastro</span>
              <span>{new Date(reseller.created_at).toLocaleDateString('pt-BR')}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Estoque do Revendedor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {inventory.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem itens em estoque</p>
            ) : (
              inventory.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2 text-sm">
                  <span className="truncate">{item.product?.name || 'Produto'}</span>
                  <Badge variant="secondary">{item.quantity} un.</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plaquinhas</CardTitle>
        </CardHeader>
        <CardContent>
          {plaques.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma plaquinha atribuída</p>
          ) : (
            <div className="space-y-2">
              {plaques.slice(0, 10).map((plaque) => (
                <div key={plaque.id} className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2 text-sm">
                  <span className="truncate">{plaque.product?.name || 'Produto'}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{plaque.public_token}</span>
                    <Badge variant="outline" className={
                      plaque.status === 'ATIVA' ? 'border-success/30 text-success' :
                      plaque.status === 'DISPONIVEL' ? 'border-warning/30 text-warning' : ''
                    }>
                      {plaque.status}
                    </Badge>
                  </div>
                </div>
              ))}
              {plaques.length > 10 && (
                <p className="pt-2 text-xs text-muted-foreground">+ {plaques.length - 10} plaquinhas</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Movimentações Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {movements.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma movimentação</p>
          ) : (
            <div className="space-y-2">
              {movements.map((mov) => (
                <div key={mov.id} className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2 text-sm">
                  <div>
                    <span className="font-medium">{mov.movement_type}</span>
                    <span className="ml-2 text-muted-foreground">{mov.product?.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={mov.quantity > 0 ? 'text-success' : 'text-destructive'}>
                      {mov.quantity > 0 ? '+' : ''}{mov.quantity}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(mov.created_at).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
