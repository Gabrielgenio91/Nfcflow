'use client';

import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import { Loader2, ShoppingBag, Trash2, ArrowRight, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { QtyStepper } from '@/components/store/qty-stepper';
import { PriceTiers } from '@/components/store/price-tiers';
import { FreeShippingBanner } from '@/components/store/free-shipping-banner';
import { useStoreSettings } from '@/hooks/use-store-settings';
import { freeShippingApplies } from '@/lib/shipping-promo';
import { useCatalog } from '@/hooks/use-catalog';
import { useCart } from '@/components/providers/cart-provider';
import { formatBRL, round2 } from '@/lib/money';
import { lineTotal, minPurchasable, unitPriceFor } from '@/lib/pricing';

export default function CarrinhoPage() {
  const { products, loading, error, reload } = useCatalog();
  const { items, setQuantity, remove } = useCart();
  const settings = useStoreSettings();

  const lines = useMemo(
    () =>
      items.map((l) => {
        const p = products.find((x) => x.product_id === l.product_id);
        return { line: l, product: p };
      }),
    [items, products]
  );

  // Remove itens que não existem mais e ajusta quantidades acima do estoque / abaixo do mínimo
  useEffect(() => {
    if (loading || error) return;
    lines.forEach(({ line, product }) => {
      if (!product) { remove(line.product_id); return; }
      const min = minPurchasable(product.tiers);
      if (product.available < min) { remove(line.product_id); toast.error(`"${product.name}" ficou indisponível`); return; }
      if (line.quantity > product.available) {
        setQuantity(line.product_id, product.available);
        toast.info(`Quantidade de "${product.name}" ajustada ao estoque (${product.available})`);
      } else if (line.quantity < min) {
        setQuantity(line.product_id, min);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, error, products]);

  const valid = lines.filter((l) => l.product);
  const subtotal = round2(valid.reduce((s, { line, product }) => s + (lineTotal(product!.tiers, line.quantity) ?? 0), 0));
  const units = valid.reduce((s, { line }) => s + line.quantity, 0);
  const freeShipping = freeShippingApplies(settings, units);
  const allPriced = valid.every(({ line, product }) => unitPriceFor(product!.tiers, line.quantity) != null);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Carrinho</h1>
        <p className="mt-1 text-sm text-muted-foreground">Revise os itens antes de continuar.</p>
      </div>

      <FreeShippingBanner count={units} />

      {error ? (
        <EmptyState title="Erro ao carregar" description={error} action={<Button variant="outline" onClick={reload}>Tentar novamente</Button>} />
      ) : valid.length === 0 ? (
        <EmptyState icon={ShoppingBag} title="Seu carrinho está vazio" description="Escolha plaquinhas na loja."
          action={<Link href="/painel/comprar"><Button>Ir para a loja</Button></Link>} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-3">
            {valid.map(({ line, product }) => {
              const p = product!;
              const min = minPurchasable(p.tiers);
              const unit = unitPriceFor(p.tiers, line.quantity);
              return (
                <Card key={line.product_id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold leading-tight">{p.name}</h3>
                      <p className="text-xs text-muted-foreground">{p.available} em estoque</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-destructive"
                      onClick={() => remove(line.product_id)} aria-label="Remover">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <PriceTiers tiers={p.tiers} quantity={line.quantity} />
                  <div className="flex items-center justify-between gap-3">
                    <QtyStepper value={line.quantity} min={min} max={p.available}
                      onChange={(v) => setQuantity(line.product_id, v)} />
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">
                        {line.quantity} × {unit != null ? formatBRL(unit) : '—'}
                      </p>
                      <p className="text-lg font-bold">{formatBRL(lineTotal(p.tiers, line.quantity))}</p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          <Card className="h-fit space-y-3 p-4 lg:sticky lg:top-20">
            <h2 className="font-semibold">Resumo</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Quantidade</span><span>{units} un.</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatBRL(subtotal)}</span></div>
              <div className="flex justify-between">
                <span className="flex items-center gap-1 text-muted-foreground"><Truck className="h-3.5 w-3.5" /> Frete (Correios)</span>
                {freeShipping ? <span className="font-semibold text-success">Grátis</span> : <span className="text-muted-foreground">calculado no checkout</span>}
              </div>
            </div>
            <div className="flex justify-between border-t border-white/[0.08] pt-3 text-base font-bold">
              <span>Total parcial</span><span>{formatBRL(subtotal)}</span>
            </div>
            <Link href="/painel/checkout" className={!allPriced ? 'pointer-events-none opacity-50' : ''}>
              <Button className="h-12 w-full text-base">Continuar <ArrowRight className="ml-2 h-5 w-5" /></Button>
            </Link>
            <Link href="/painel/comprar" className="block text-center text-sm text-muted-foreground hover:text-foreground">
              Continuar comprando
            </Link>
          </Card>
        </div>
      )}
    </div>
  );
}
