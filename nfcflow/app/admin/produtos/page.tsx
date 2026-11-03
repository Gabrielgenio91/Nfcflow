'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Product } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { Plus, Package, Loader2, Trash2 } from 'lucide-react';

// Preço exibido = o cadastrado nas faixas de preço (a mesma fonte usada pela loja e pelo create_order)
function priceLabel(tiers?: { min_quantity: number; unit_price: number | string }[] | null): string {
  if (!tiers || tiers.length === 0) return 'Sem preço';
  const first = [...tiers].sort((a, b) => a.min_quantity - b.min_quantity)[0];
  return `R$ ${Number(first.unit_price).toFixed(2).replace('.', ',')}`;
}

export default function AdminProductsPage() {
  const supabase = createClient();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
      .from('products')
      .select('*, product_price_tiers(min_quantity, unit_price)')
      .order('created_at', { ascending: false });
      if (error) throw error;
      setProducts((data as any[]) || []);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleDelete = async (e: React.MouseEvent, productId: string, productName: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Excluir "${productName}"?\nVai sumir do admin E da loja virtual.`)) return;
    setDeletingId(productId);
    try {
      await supabase.from('product_price_tiers').delete().eq('product_id', productId);
      const { error } = await supabase.from('products').delete().eq('id', productId);
      if (error) throw error;
      setProducts((prev) => prev.filter((p) => p.id!== productId));
    } catch (err: any) {
      alert('Erro ao excluir: ' + err.message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Produtos</h1>
          <p className="mt-1 text-sm text-muted-foreground">Gerencie o catálogo de plaquinhas</p>
        </div>
        <Link href="/admin/produtos/novo">
          <Button className="gradient-primary text-primary-foreground hover:opacity-90">
            <Plus className="mr-2 h-4 w-4" />
            Novo Produto
          </Button>
        </Link>
      </div>

      {loading? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : products.length === 0? (
        <EmptyState
          icon={Package}
          title="Nenhum produto cadastrado"
          description="Crie seu primeiro produto para começar"
          action={
            <Link href="/admin/produtos/novo">
              <Button className="gradient-primary text-primary-foreground hover:opacity-90">
                <Plus className="mr-2 h-4 w-4" />
                Criar produto
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <div key={product.id} className="relative">
              <Link href={`/admin/produtos/${product.id}`}>
                <Card className="group cursor-pointer p-4 transition-colors hover:border-primary/30">
                  <div className="mb-3 flex aspect-square items-center justify-center rounded-lg bg-secondary/50">
                    {product.photo_url? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.photo_url}
                        alt={product.name}
                        className="h-full w-full rounded-lg object-cover"
                      />
                    ) : (
                      <Package className="h-10 w-10 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-medium">{product.name}</h3>
                      <p className="text-xs text-muted-foreground">{product.product_type}</p>
                      <p className="text-sm font-bold text-primary">{priceLabel((product as any).product_price_tiers)}</p>
                      {product.width && product.height && (
                        <p className="text-xs text-muted-foreground">
                          {product.width} x {product.height} {product.unit || 'cm'}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                    <Badge
                      variant="outline"
                      className={
                        product.status === 'ATIVO'
                        ? 'border-success/30 text-success'
                          : 'border-muted-foreground/30 text-muted-foreground'
                      }
                    >
                      {product.status === 'ATIVO'? 'Ativo' : 'Inativo'}
                    </Badge>
                    {product.sold_out && <Badge variant="outline" className="border-destructive/40 text-destructive">Esgotado</Badge>}
                    </div>
                  </div>
                </Card>
              </Link>
              <Button
                variant="destructive"
                size="icon"
                className="absolute right-2 top-2 h-8 w-8"
                onClick={(e) => handleDelete(e, product.id, product.name)}
                disabled={deletingId === product.id}
              >
                {deletingId === product.id? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
                        }
