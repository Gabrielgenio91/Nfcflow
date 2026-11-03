export type OrderStatus =
  | 'AGUARDANDO_PAGAMENTO' | 'PAGO' | 'EM_PREPARACAO' | 'ENVIADO' | 'EM_TRANSITO' | 'ENTREGUE' | 'CANCELADO'
  // Legados / Mercado Pago
  | 'APROVADO' | 'PENDENTE' | 'PAGO_MAIUSCULO';

export const ORDER_STATUSES: OrderStatus[] = [
  'AGUARDANDO_PAGAMENTO', 'PAGO', 'EM_PREPARACAO', 'ENVIADO', 'EM_TRANSITO', 'ENTREGUE', 'CANCELADO',
];

export const ORDER_STATUS_LABEL: Record<string, string> = {
  AGUARDANDO_PAGAMENTO: 'AGUARDANDO PAGAMENTO',
  PENDENTE: 'AGUARDANDO PAGAMENTO',
  PAGO: 'PAGAMENTO CONFIRMADO',
  APROVADO: 'PAGAMENTO CONFIRMADO',
  EM_PREPARACAO: 'Em preparação',
  ENVIADO: 'Enviado',
  EM_TRANSITO: 'Em trânsito',
  ENTREGUE: 'Entregue',
  CANCELADO: 'PEDIDO CANCELADO',
};

export const ORDER_STATUS_CLASS: Record<string, string> = {
  AGUARDANDO_PAGAMENTO: 'border-warning/30 text-warning',
  PENDENTE: 'border-warning/30 text-warning',
  PAGO: 'border-blue-400/30 text-blue-400',
  APROVADO: 'border-blue-400/30 text-blue-400',
  EM_PREPARACAO: 'border-violet-400/30 text-violet-400',
  ENVIADO: 'border-cyan-400/30 text-cyan-400',
  EM_TRANSITO: 'border-cyan-400/30 text-cyan-400',
  ENTREGUE: 'border-success/30 text-success',
  CANCELADO: 'border-destructive/30 text-destructive',
};

/** Próximo passo do fluxo do admin. */
export const NEXT_STATUS: Partial<Record<string, string>> = {
  PAGO: 'EM_PREPARACAO',
  APROVADO: 'EM_PREPARACAO',
  EM_PREPARACAO: 'ENVIADO',
  ENVIADO: 'EM_TRANSITO',
  EM_TRANSITO: 'ENTREGUE',
};

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  PENDENTE: 'Pendente',
  APROVADO: 'Aprovado',
  RECUSADO: 'Recusado',
  CANCELADO: 'Cancelado',
  EXPIRADO: 'Expirado',
  REEMBOLSADO: 'Reembolsado',
};

export function formatOrderNumber(n: number | string): string {
  return `#${String(n).padStart(6, '0')}`;
}

export function correiosTrackingUrl(code: string): string {
  return `https://rastreamento.correios.com.br/app/index.php?objetos=${encodeURIComponent(code)}`;
}

/** Status de pedido que já tiveram o pagamento CONFIRMADO pelo provedor (Mercado Pago). */
export const PAID_ORDER_STATUSES = ['PAGO', 'APROVADO', 'EM_PREPARACAO', 'ENVIADO', 'EM_TRANSITO', 'ENTREGUE'];

export type OrderPaymentState = 'AGUARDANDO' | 'PAGO' | 'CANCELADO';

/** Normaliza qualquer status que vem do banco */
function normalizeOrderStatus(s: string): string {
  const up = s?.toUpperCase() || '';
  if (['APROVADO','PAGO','PAID','APPROVED'].includes(up)) return 'PAGO';
  if (['PENDENTE','AGUARDANDO','AGUARDANDO_PAGAMENTO'].includes(up)) return 'AGUARDANDO_PAGAMENTO';
  return up;
}

/** Situação do pagamento exibida ao admin/revendedor: Aguardando pagamento ou Pago (ou Cancelado). */
export function orderPaymentState(status: string): { key: OrderPaymentState; label: string; cls: string } {
  const norm = normalizeOrderStatus(status);
  if (PAID_ORDER_STATUSES.includes(norm) || PAID_ORDER_STATUSES.includes(status) || PAID_ORDER_STATUSES.includes(status?.toUpperCase())) {
    return { key: 'PAGO', label: 'Pago', cls: 'border-success/30 text-success' };
  }
  if (norm === 'CANCELADO' || status?.toUpperCase() === 'CANCELADO') {
    return { key: 'CANCELADO', label: 'Cancelado', cls: 'border-destructive/30 text-destructive' };
  }
  return { key: 'AGUARDANDO', label: 'Aguardando pagamento', cls: 'border-warning/30 text-warning' };
}

/** Endereço de entrega completo em uma linha (snapshot gravado no pedido). */
export function formatShipAddress(o: {
  ship_street: string; ship_number: string; ship_complement: string | null;
  ship_neighborhood: string; ship_city: string; ship_state: string; ship_zip_code: string;
}): string {
  return `${o.ship_street}, ${o.ship_number}${o.ship_complement ? ` – ${o.ship_complement}` : ''} · ${o.ship_neighborhood} · ${o.ship_city}/${o.ship_state} · CEP ${o.ship_zip_code}`;
}

/** Modalidade de frete: serviço + prazo (ex.: "PAC · até 7 dia(s) úteis"). */
export function formatShippingMode(o: { shipping_service: string | null; shipping_carrier: string; shipping_days: number | null }): string {
  const name = o.shipping_service || o.shipping_carrier;
  // o nome da modalidade já pode trazer o prazo (ex.: "Jadlog - até 6 dias úteis") e retirada tem prazo 0
  if (o.shipping_days == null || o.shipping_days <= 0 || /dias? úteis/i.test(name)) return name;
  return `${name} · até ${o.shipping_days} dia(s) úteis`;
}

/** Status gravados no banco que correspondem a um filtro do admin (inclui legados APROVADO/PENDENTE). */
export function statusAliases(status: string): string[] {
  if (status === 'AGUARDANDO_PAGAMENTO') return ['AGUARDANDO_PAGAMENTO', 'PENDENTE'];
  if (status === 'PAGO') return ['PAGO', 'APROVADO'];
  return [status];
}
