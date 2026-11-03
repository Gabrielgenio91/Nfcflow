import { NextRequest } from 'next/server';
import { requireReseller, parseJson, handleError, ok, ApiError } from '@/lib/api';
import { createOrderSchema, type AddressInput } from '@/lib/schemas';
import { createAdminClient } from '@/lib/supabase/admin';
import { env } from '@/lib/env';
import { getPublicAppUrl } from '@/lib/app-url';
import { getStoreSettings } from '@/lib/store-settings';
import { applyFreeShipping, freeShippingApplies } from '@/lib/shipping-promo';
import { calculateShipping, CorreiosError } from '@/services/correiosService';
import { getGateway } from '@/services/paymentService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cria o pedido: preços e estoque são calculados/validados NO BANCO (create_order),
 * o frete é recalculado AQUI no servidor e o PIX é gerado via mercadoPagoService.
 * O pedido só vira PAGO pelo webhook/consulta oficial — nunca por ação do navegador.
 */
export async function POST(req: NextRequest) {
  try {
    const { supabase, user, reseller } = await requireReseller();
    const body = await parseJson(req, createOrderSchema);

    const gateway = getGateway();
    if (!gateway.isConfigured()) {
      throw new ApiError(503, 'Pagamentos ainda não configurados. Tente novamente mais tarde.', 'PAYMENTS_NOT_CONFIGURED');
    }

    const isRetirada = body.shipping_code === 'RETIRADA';

    // 1) Endereço (sempre do próprio revendedor) - RETIRADA não exige endereço completo
    let address: AddressInput;
    if (body.address_id) {
      const { data } = await supabase.from('addresses').select('*')
       .eq('id', body.address_id).eq('reseller_id', reseller.id).maybeSingle();
      if (!data) throw new ApiError(404, 'Endereço não encontrado.');
      address = {
        recipient_name: data.recipient_name, phone: data.phone, zip_code: data.zip_code, state: data.state,
        city: data.city, neighborhood: data.neighborhood, street: data.street, number: data.number,
        complement: data.complement,
      };
    } else {
      address = body.address as AddressInput;
      // Só salva endereço se não for retirada e se tiver zip
      if (body.save_address &&!isRetirada) {
        const { error } = await supabase.from('addresses').insert({...address, reseller_id: reseller.id });
        if (error) console.error('[orders] salvar endereço', error.message);
      }
    }

    // 2) Frete recalculado no servidor - RETIRADA bypassa Correios
    const totalUnits = body.items.reduce((s, i) => s + i.quantity, 0);
    let option: { price: number; name: string; days: number; isEstimate: boolean; code: string };

    if (isRetirada) {
      option = {
        price: 0,
        name: 'Retirada em Imperatriz - MA',
        code: 'RETIRADA',
        days: 0,
        isEstimate: false,
      };
    } else {
      // Para SEDEX/PAC precisa de CEP válido
      if (!address?.zip_code) {
        throw new ApiError(400, 'CEP é obrigatório para cálculo de frete.');
      }
      let quote;
      try {
        quote = await calculateShipping({ destinationZip: address.zip_code, totalUnits });
      } catch (e) {
        if (e instanceof CorreiosError) throw new ApiError(502, e.message);
        throw e;
      }
      // frete grátis por quantidade: decidido SOMENTE aqui, com a regra do banco
      const free = freeShippingApplies(await getStoreSettings(), totalUnits);
      const found = applyFreeShipping(quote.options, free).find((o) => o.code === body.shipping_code);
      if (!found) throw new ApiError(400, 'Opção de frete inválida. Recalcule o frete.');
      option = found;
    }

    // 3) Pedido + reserva atômica de estoque (service_role)
    const admin = createAdminClient();
    const { data: orderId, error: rpcErr } = await admin.rpc('create_order', {
      p_reseller_id: reseller.id,
      p_items: body.items,
      p_shipping_amount: option.price,
      p_shipping_service: option.name,
      p_shipping_days: option.days,
      p_shipping_is_estimate: option.isEstimate,
      p_address: address,
      p_expires_minutes: env.mpPixExpirationMinutes + 5,
    });
    if (rpcErr) {
      console.error('[orders] create_order rpc error', rpcErr);
      throw rpcErr;
    }

    const { data: order } = await admin.from('orders')
     .select('id, order_number, total').eq('id', orderId as string).single();
    if (!order) throw new ApiError(500, 'Falha ao criar o pedido.');

    // 4) Pagamento (PIX) pelo gateway ativo
    try {
      const origin = new URL(req.url).origin;
      const created = await gateway.createPayment({
        orderId: order.id,
        amount: Number(order.total),
        description: `NFCFLOW pedido #${String(order.order_number).padStart(6, '0')}`,
        payerEmail: user.email || reseller.email,
        notificationUrl: `${getPublicAppUrl(origin)}/api/webhooks/${gateway.webhookSlug}`,
        method: 'PIX',
      });
      const { error: payErr } = await admin.from('payments').insert({
        order_id: order.id,
        provider: created.provider,
        provider_payment_id: created.providerPaymentId,
        amount: Number(order.total),
        status: 'PENDENTE',
        payment_method: created.method,
        raw_status: created.rawStatus,
        pix_qr_code: created.qrCode,
        pix_qr_code_base64: created.qrCodeBase64,
        pix_ticket_url: created.ticketUrl,
        expires_at: created.expiresAt.toISOString(),
      });
      if (payErr) console.error('[orders] registrar pagamento', payErr.message);

      return ok({
        order_id: order.id,
        order_number: order.order_number,
        total: Number(order.total),
        payment: {
          status: 'PENDENTE',
          method: created.method,
          provider: created.provider,
          qr_code: created.qrCode,
          qr_code_base64: created.qrCodeBase64,
          ticket_url: created.ticketUrl,
          expires_at: created.expiresAt.toISOString(),
        },
      }, { status: 201 });
    } catch (payError) {
      // Falhou gerar o pagamento: cancela o pedido e devolve a reserva
      await admin.rpc('cancel_order', { p_order_id: order.id, p_actor: user.id, p_note: 'Falha ao gerar pagamento' });
      console.error('[orders] pagamento', payError);
      throw new ApiError(502, 'Não foi possível gerar o PIX agora. Seu estoque foi liberado; tente novamente.');
    }
  } catch (e) {
    return handleError(e);
  }
}
