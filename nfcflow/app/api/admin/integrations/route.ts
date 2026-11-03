import { requireAdmin, handleError, ok } from '@/lib/api';
import { getIntegrationStatus } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Devolve apenas CONFIGURADO / NÃO CONFIGURADO — nunca valores de segredos. */
export async function GET() {
  try {
    await requireAdmin();
    return ok(getIntegrationStatus());
  } catch (e) {
    return handleError(e);
  }
}
