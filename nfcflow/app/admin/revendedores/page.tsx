'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Reseller } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import {
  Users,
  Search,
  Loader2,
  Ban,
  CheckCircle2,
  ChevronRight,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';

type Status = 'ATIVO' | 'BLOQUEADO' | 'PENDENTE' | 'pending' | 'active' | 'blocked';

export default function AdminResellersPage() {
  const supabase = createClient();
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'TODOS'|'PENDENTE'|'ATIVO'|'BLOQUEADO'>('TODOS');

  const fetchResellers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
       .from('resellers')
       .select('*')
       .order('created_at', { ascending: false });

      if (error) throw error;
      setResellers((data as Reseller[]) || []);
    } catch (err) {
      console.error('Error fetching resellers:', err);
      toast.error('Erro ao carregar revendedores');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { fetchResellers(); }, [fetchResellers]);

  const updateStatus = async (reseller: Reseller, newStatus: 'ATIVO'|'BLOQUEADO'|'PENDENTE') => {
    const { error } = await supabase.from('resellers').update({ status: newStatus }).eq('id', reseller.id);
    if (error) { toast.error('Erro ao alterar status: ' + error.message); return; }
    toast.success(newStatus === 'ATIVO'? 'Revendedor LIBERADO!' : newStatus === 'BLOQUEADO'? 'Revendedor bloqueado' : 'Marcado como pendente');
    fetchResellers();
  };

  const filtered = resellers.filter((r) => {
    const matchSearch = r.full_name.toLowerCase().includes(search.toLowerCase()) || r.email.toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (filter === 'TODOS') return true;
    // normaliza pending/active
    const s = (r.status as string)?.toUpperCase();
    if (filter === 'PENDENTE') return s === 'PENDENTE' || s === 'PENDING';
    if (filter === 'ATIVO') return s === 'ATIVO' || s === 'ACTIVE';
    if (filter === 'BLOQUEADO') return s === 'BLOQUEADO' || s === 'BLOCKED';
    return true;
  });

  const getBadge = (status: string) => {
    const s = status?.toUpperCase();
    if (s === 'ATIVO' || s === 'ACTIVE') return <Badge className="bg-success/15 text-success">Ativo</Badge>;
    if (s === 'BLOQUEADO' || s === 'BLOCKED') return <Badge variant="destructive">Bloqueado</Badge>;
    return <Badge variant="outline" className="border-amber-500/30 text-amber-500"><Clock className="mr-1 h-3 w-3"/>Pendente</Badge>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Revendedores</h1>
        <p className="mt-1 text-sm text-muted-foreground">Gerencie todos os revendedores cadastrados - libere o acesso aqui</p>
      </div>

      <div className="flex gap-2">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou e-mail..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
      </div>

      <div className="flex gap-2">
        {(['TODOS','PENDENTE','ATIVO','BLOQUEADO'] as const).map(f => (
          <Button key={f} size="sm" variant={filter===f?'default':'outline'} onClick={()=>setFilter(f)}>{f} {f!=='TODOS' && `(${resellers.filter(r=> r.status?.toUpperCase().includes(f[0]+f.slice(1,3)) || (f==='PENDENTE' && r.status?.toLowerCase().includes('pend'))).length})`}</Button>
        ))}
      </div>

      {loading? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0? (
        <EmptyState icon={Users} title="Nenhum revendedor encontrado" description={search? 'Tente outra busca' : filter === 'PENDENTE'? 'Nenhum pendente pra liberar' : 'Os revendedores aparecerão aqui'} />
      ) : (
        <div className="grid gap-3">
          {filtered.map((reseller) => {
            const s = reseller.status?.toUpperCase();
            const isPending = s === 'PENDENTE' || s === 'PENDING';
            const isActive = s === 'ATIVO' || s === 'ACTIVE';
            return (
              <Card key={reseller.id} className="flex items-center justify-between p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-medium">{reseller.full_name}</h3>
                    {getBadge(reseller.status)}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">{reseller.email}</p>
                  {reseller.phone && <p className="text-xs text-muted-foreground">{reseller.phone}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {isPending && (
                    <Button size="sm" className="bg-success hover:bg-success/90" onClick={() => updateStatus(reseller, 'ATIVO')}>
                      <CheckCircle2 className="mr-1 h-4 w-4"/> Liberar acesso
                    </Button>
                  )}
                  {isActive? (
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => updateStatus(reseller, 'BLOQUEADO')} title="Bloquear"><Ban className="h-4 w-4" /></Button>
                  ) :!isPending && (
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-success" onClick={() => updateStatus(reseller, 'ATIVO')} title="Ativar"><CheckCircle2 className="h-4 w-4" /></Button>
                  )}
                  <Link href={`/admin/revendedores/${reseller.id}`}>
                    <Button variant="ghost" size="icon" className="h-9 w-9"><ChevronRight className="h-5 w-5" /></Button>
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
    }
