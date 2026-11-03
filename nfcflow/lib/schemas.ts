import { z } from 'zod';

const digits = (s: string) => s.replace(/\D/g, '');

export const addressSchema = z.object({
  recipient_name: z.string().trim().min(3, 'Informe o nome do destinatário').max(120),
  phone: z.string().transform(digits).refine((v) => v.length >= 10 && v.length <= 11, 'Telefone inválido'),
  zip_code: z.string().transform(digits).refine((v) => v.length === 8, 'CEP inválido'),
  state: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'UF inválida'),
  city: z.string().trim().min(2, 'Informe a cidade').max(80),
  neighborhood: z.string().trim().min(2, 'Informe o bairro').max(80),
  street: z.string().trim().min(2, 'Informe a rua').max(120),
  number: z.string().trim().min(1, 'Informe o número').max(10),
  complement: z.string().trim().max(80).optional().nullable().transform((v) => v || null),
});
export type AddressInput = z.infer<typeof addressSchema>;

export const cartItemsSchema = z
  .array(z.object({ product_id: z.string().uuid(), quantity: z.number().int().min(1).max(100000) }))
  .min(1, 'Carrinho vazio')
  .max(50);

export const shippingQuoteSchema = z.object({
  zip_code: z.string().transform(digits).refine((v) => v.length === 8, 'CEP inválido'),
  items: cartItemsSchema,
});

export const createOrderSchema = z.object({
  items: cartItemsSchema,
  address_id: z.string().uuid().optional(),
  address: addressSchema.optional(),
  save_address: z.boolean().optional(),
  shipping_code: z.string().min(1).max(40),
}).refine((v) => v.address_id || v.address, { message: 'Informe o endereço de entrega' });

export const adminOrderUpdateSchema = z.object({
  status: z.enum(['EM_PREPARACAO', 'ENVIADO', 'EM_TRANSITO', 'ENTREGUE', 'CANCELADO']).optional(),
  tracking_code: z.string().trim().max(30).optional(),
}).refine((v) => v.status || v.tracking_code, { message: 'Nada para atualizar' });

export const trackingCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{8,20}$/, 'Código de rastreio inválido');

export const googleLinkSchema = z.object({ url: z.string().trim().min(5).max(2048) });

export const generatePlaquesSchema = z.object({
  product_id: z.string().uuid('Selecione o produto'),
  quantity: z.number().int().min(1, 'Quantidade mínima: 1').max(500, 'Máximo de 500 por lote'),
});

export const SAFE_URL_RE = /^https?:\/\/[^\s]+$/i;
export function isSafeHttpUrl(value: string): boolean {
  const v = value.trim();
  if (!SAFE_URL_RE.test(v) || v.length > 2048) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
