import { NextRequest } from 'next/server';
import { requireReseller, parseJson, handleError, ok, ApiError } from '@/lib/api';
import { shippingQuoteSchema } from '@/lib/schemas';
import { calculateShipping, CorreiosError } from '@/services/correiosService';
import { getStoreSettings } from '@/lib/store-settings';
import { applyFreeShipping, freeShippingApplies } from '@/lib/shipping-promo';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    await requireReseller();
    const body = await parseJson(req, shippingQuoteSchema);
    const totalUnits = body.items.reduce((s, i) => s + i.quantity, 0);
    try {
      const quote = await calculateShipping({ destinationZip: body.zip_code, totalUnits });
      // promoção validada no servidor, com a regra salva no banco
      const free = freeShippingApplies(await getStoreSettings(), totalUnits);
      return ok({ ...quote, options: applyFreeShipping(quote.options, free), free_shipping: free });
    } catch (e) {
      if (e instanceof CorreiosError) throw new ApiError(502, e.message);
      throw e;
    }
  } catch (e) {
    return handleError(e);
  }
}
