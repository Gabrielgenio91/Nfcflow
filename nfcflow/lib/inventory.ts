/** Limite para o alerta visual de estoque baixo no ADMIN (disponível = central − reservado). */
export const LOW_STOCK_THRESHOLD = 20;

export type StockLevel = 'out' | 'low' | 'ok';

export function stockLevel(available: number): StockLevel {
  if (available <= 0) return 'out';
  if (available <= LOW_STOCK_THRESHOLD) return 'low';
  return 'ok';
}
