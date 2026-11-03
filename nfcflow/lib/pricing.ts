import { round2 } from '@/lib/money';

export interface PriceTier {
  id?: string;
  min_quantity: number;
  max_quantity: number | null;
  unit_price: number | string;
}

/** Mesma regra do banco (create_order): faixa com min <= qtd e (max nulo ou >= qtd), a de maior min. */
export function pickTier<T extends PriceTier>(tiers: T[], qty: number): T | null {
  const matches = tiers
    .filter((t) => t.min_quantity <= qty && (t.max_quantity == null || t.max_quantity >= qty))
    .sort((a, b) => b.min_quantity - a.min_quantity);
  return matches[0] ?? null;
}

export function unitPriceFor(tiers: PriceTier[], qty: number): number | null {
  const t = pickTier(tiers, qty);
  return t ? Number(t.unit_price) : null;
}

export function lineTotal(tiers: PriceTier[], qty: number): number | null {
  const u = unitPriceFor(tiers, qty);
  return u == null ? null : round2(u * qty);
}

export function tierRangeLabel(t: PriceTier): string {
  return t.max_quantity == null ? `${t.min_quantity}+` : `${t.min_quantity}–${t.max_quantity}`;
}

/** Menor quantidade que o produto pode ser comprada (início da primeira faixa). */
export function minPurchasable(tiers: PriceTier[]): number {
  if (!tiers.length) return 1;
  return Math.max(1, Math.min(...tiers.map((t) => t.min_quantity)));
}
