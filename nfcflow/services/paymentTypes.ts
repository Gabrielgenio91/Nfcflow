/** Contrato comum de gateways de pagamento (permite adicionar outros além do Mercado Pago). */
export type PaymentMethod = 'PIX';

export interface CreatePaymentParams {
  orderId: string;
  amount: number;
  description: string;
  payerEmail: string;
  notificationUrl: string;
  method: PaymentMethod;
}

export interface CreatedPayment {
  provider: string;
  providerPaymentId: string;
  method: PaymentMethod;
  rawStatus: string;
  qrCode: string | null;
  qrCodeBase64: string | null;
  ticketUrl: string | null;
  expiresAt: Date;
}

export interface PaymentGateway {
  id: string;
  label: string;
  /** Final da rota de webhook: /api/webhooks/{webhookSlug} */
  webhookSlug: string;
  supportedMethods: PaymentMethod[];
  isConfigured(): boolean;
  createPayment(params: CreatePaymentParams): Promise<CreatedPayment>;
  /** Consulta o provedor e aplica o estado real no banco (idempotente). Retorna o resultado. */
  syncPayment(providerPaymentId: string, expectedOrderId?: string): Promise<string>;
}
