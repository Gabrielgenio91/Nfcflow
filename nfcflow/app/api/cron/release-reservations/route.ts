import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { env } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Libera reservas de pedidos não pagos. Chame periodicamente com: Authorization: Bearer $CRON_SECRET */
export async function GET(req: NextRequest) {
  const secret = env.cronSecret;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET não configurado.' }, { status: 503 });
  const given = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(given); const b = Buffer.from(secret);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { data, error } = await createAdminClient().rpc('release_expired_orders');
  if (error) {
    console.error('[cron] release', error.message);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
  return NextResponse.json({ released: data });
}
