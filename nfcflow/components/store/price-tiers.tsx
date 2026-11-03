import { formatBRL } from '@/lib/money';
import { tierRangeLabel, pickTier, type PriceTier } from '@/lib/pricing';
import { cn } from '@/lib/utils';

/** Tabela de faixas de preço; destaca a faixa aplicada à quantidade atual. */
export function PriceTiers({ tiers, quantity }: { tiers: PriceTier[]; quantity?: number }) {
  if (!tiers.length) return <p className="text-xs text-muted-foreground">Preço ainda não definido.</p>;
  const active = quantity != null ? pickTier(tiers, quantity) : null;
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
      {tiers.map((t, i) => (
        <div key={t.id ?? i} className={cn(
          'rounded-xl border px-2.5 py-1.5 text-center text-xs transition-colors',
          active && (active.id ?? active.min_quantity) === (t.id ?? t.min_quantity)
            ? 'border-primary/60 bg-primary/10 text-foreground'
            : 'border-white/[0.08] bg-white/[0.02] text-muted-foreground'
        )}>
          <div className="font-medium">{tierRangeLabel(t)} un.</div>
          <div className="text-sm font-semibold text-foreground">{formatBRL(Number(t.unit_price))}</div>
        </div>
      ))}
    </div>
  );
}
