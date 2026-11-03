'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Loader2, ShoppingCart, ShoppingBag, Ruler, PackageX } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { PriceTiers } from '@/components/store/price-tiers';
import { FreeShippingBanner } from '@/components/store/free-shipping-banner';
import { QtyStepper } from '@/components/store/qty-stepper';
import { useCatalog } from '@/hooks/use-catalog';
import { useCart } from '@/components/providers/cart-provider';
import { formatBRL } from '@/lib/money';
import { lineTotal, minPurchasable, unitPriceFor } from '@/lib/pricing';
import type { StoreProduct } from '@/lib/types';

function ProductCard({ product }: { product: StoreProduct }) {
  const { items, add } = useCart();
  const inCart = items.find((l) => l.product_id === product.product_id)?.quantity?? 0;

  // Preço SEMPRE vindo do cadastro do Admin (faixas de preço do banco). Sem faixa = sem preço (não vende).
  const tiers = product.tiers ?? [];

  const tierMin = minPurchasable(tiers);
  const adminMin = product.min_order_qty ?? tierMin;
  const adminMax = product.max_order_qty ?? Math.max(product.available, 1);

  const min = Math.max(tierMin, adminMin);
  const remaining = Math.max(product.available - inCart, 0);
  const max = Math.min(remaining, adminMax);
  const canBuy = !product.sold_out && tiers.length > 0 && remaining >= min && max >= min;

  const [qty, setQty] = useState(min);
  useEffect(() => { setQty(min); }, [min]);

  const q = Math.min(Math.max(qty, min), max);
  const unit = unitPriceFor(tiers, q);
  const total = lineTotal(tiers, q);

  const handleAdd = () => {
    if (!canBuy) { toast.error(product.sold_out ? 'Produto esgotado' : 'Estoque insuficiente'); return; }
    if (q < min) { toast.error(`Mínimo é ${min} unidades`); return; }
    if (q > adminMax) { toast.error(`Máximo é ${adminMax} unidades`); return; }
    if (q > remaining) { toast.error('Quantidade acima do estoque'); return; }
    if (unit == null) { toast.error('Sem preço'); return; }
    add(product.product_id, q);
    toast.success(`${q} × ${product.name} no carrinho`);
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex gap-3 p-4">
        <div className="flex h-24 w-24 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/[0.04]">
          {product.photo_url? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.photo_url} alt={product.name} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <ShoppingBag className="h-8 w-8 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-tight">{product.name}</h3>
          {product.description && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{product.description}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {product.width && product.height && (
              <span className="inline-flex items-center gap-1">
                <Ruler className="h-3 w-3" /> {product.width}×{product.height} {product.unit || 'cm'}
              </span>
            )}
            {product.available > 0? (
              <Badge variant="outline" className="border-success/30 text-success">{product.available} disponíveis • Máx {adminMax}</Badge>
            ) : (
              <Badge variant="outline" className="border-destructive/30 text-destructive">Esgotado</Badge>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3 border-t border-white/[0.06] p-4">
        <PriceTiers tiers={tiers} quantity={canBuy? q : undefined} />

        {canBuy? (
          <>
            <div className="flex items-center justify-between gap-3">
              <QtyStepper value={q} min={min} max={max} onChange={setQty} />
              <div className="text-right">
                <p className="text-xs text-muted-foreground">{unit!= null? `${formatBRL(unit)}/un.` : '—'}</p>
                <p className="text-lg font-bold">{total!= null? formatBRL(total) : '—'}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Pedido mínimo: {min} un. • máximo: {adminMax} un.</p>
            <Button onClick={handleAdd} className="h-12 w-full text-base">
              <ShoppingCart className="mr-2 h-5 w-5" /> Adicionar ao carrinho
            </Button>
          </>
        ) : (
          <div className="flex items-center gap-2 rounded-xl bg-white/[0.03] p-3 text-sm text-muted-foreground">
            <PackageX className="h-4 w-4" />
            {product.sold_out? 'Produto esgotado.' : tiers.length === 0? 'Produto sem preço.' : remaining === 0 && inCart > 0? 'Todo estoque já no carrinho.' : remaining < min? `Estoque (${product.available}) menor que mínimo (${min}).` : 'Estoque insuficiente.'}
          </div>
        )}
      </div>
    </Card>
  );
}

export default function ComprarPage() {
  const { products, loading, error, reload } = useCatalog();
  const { count } = useCart();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Loja</h1>
          <p className="mt-1 text-sm text-muted-foreground">Mínimo configurado por você no admin.</p>
        </div>
        <Link href="/painel/carrinho">
          <Button variant="outline" className="relative h-11">
            <ShoppingCart className="mr-2 h-5 w-5" /> Carrinho
            {count > 0 && (
              <span className="ml-2 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full gradient-primary px-1.5 text-xs font-semibold text-white">
                {count}
              </span>
            )}
          </Button>
        </Link>
      </div>

      <FreeShippingBanner count={count} />

      {loading? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : error? (
        <EmptyState title="Erro ao carregar" description={error}
          action={<Button onClick={reload} variant="outline">Tentar novamente</Button>} />
      ) : products.length === 0? (
        <EmptyState icon={ShoppingBag} title="Nenhum produto disponível" description="Volte em breve." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {products.map((p) => <ProductCard key={p.product_id} product={p} />)}
        </div>
      )}
    </div>
  );
        }
