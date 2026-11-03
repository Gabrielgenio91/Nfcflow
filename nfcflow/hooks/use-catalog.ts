'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { StoreProduct } from '@/lib/types';

/** Catálogo da loja (produtos ativos, disponibilidade e faixas) vindo da função get_store_catalog. */
export function useCatalog() {
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error: err } = await supabase.rpc('get_store_catalog');
    if (err) {
      console.error('catalog', err.message);
      setError('Não foi possível carregar os produtos.');
    } else {
      setProducts(
        ((data as StoreProduct[]) || []).map((p) => ({
          ...p,
          tiers: (p.tiers || []).map((t) => ({ ...t, unit_price: Number(t.unit_price) })),
        }))
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return { products, loading, error, reload };
}
