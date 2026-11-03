/** Regra de frete grátis por quantidade (pura — usada no servidor e para exibição na loja). */
export interface FreeShippingRule {
  freeShippingEnabled: boolean;
  freeShippingMinQuantity: number;
}

export function freeShippingApplies(rule: FreeShippingRule, totalUnits: number): boolean {
  return rule.freeShippingEnabled && rule.freeShippingMinQuantity > 0 && totalUnits >= rule.freeShippingMinQuantity;
}

export function applyFreeShipping<T extends { name: string; price: number }>(options: T[], applies: boolean): T[] {
  if (!applies) return options;
  return options.map((o) => ({ ...o, price: 0, name: `${o.name} — Frete grátis` }));
}
