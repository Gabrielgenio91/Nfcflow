'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Customer, Reseller } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { Store, Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

export default function AdminCustomersPage() {
  const supabase = createClient();
  const [customers, setCustomers] = useState<(Customer & { reseller?: Reseller })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*, reseller:resellers(*)')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      setCustomers((data as (Customer & { reseller?: Reseller })[]) || []);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const filtered = customers.filter(
    (c) =>
      c.establishment_name.toLowerCase().includes(search.toLowerCase()) ||
      c.reseller?.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
        <p className="mt-1 text-sm text-muted-foreground">Todos os clientes cadastrados pelos revendedores</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por estabelecimento ou revendedor..."
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
        <EmptyState icon={Store} title="Nenhum cliente" description="Os clientes aparecerão aqui" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((customer) => (
            <Card key={customer.id} className="p-4">
              <h3 className="truncate font-medium">{customer.establishment_name}</h3>
              {customer.phone && <p className="text-xs text-muted-foreground">{customer.phone}</p>}
              {customer.email && <p className="text-xs text-muted-foreground">{customer.email}</p>}
              <div className="mt-2">
                <Badge variant="secondary" className="text-xs">
                  {customer.reseller?.full_name || '—'}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
