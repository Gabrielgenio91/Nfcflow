import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { env } from '@/lib/env';
import { handleQr, type QrPlaque } from '@/lib/qr-resolve';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * ROTA PERMANENTE DOS QR CODES (/q/:token) — NÃO MUDAR O CAMINHO.
 * É o endereço impresso nas plaquinhas. Resolve só pelo token (Supabase: resolve_qr) e não depende
 * do domínio do painel: a tela de ativação usa NEXT_PUBLIC_APP_URL (domínio atual do app).
 * A decisão (redirect / páginas) está em lib/qr-resolve.ts.
 */
export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  const supabase = createAdminClient();

  const outcome = await handleQr({
    token: params.token || '',
    urls: {
      appUrl: env.appUrl,
      qrBaseUrl: env.qrBaseUrl,
      requestOrigin: request.nextUrl.origin,
    },

    resolve: async (token) => {
      const { data, error } = await supabase.rpc('resolve_qr', { p_token: token }).maybeSingle();
      return { data: (data as QrPlaque | null) ?? null, error };
    },

    // Registra a leitura (1 linha em qr_scans por leitura; o trigger do banco soma +1 em plaques.scan_count).
    logScan: async (plaque) => {
      const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
      const ipHash = forwarded
        ? crypto.createHash('sha256').update(`${process.env.QR_IP_HASH_SALT || ''}${forwarded}`).digest('hex').slice(0, 32)
        : null;
      const { error: scanErr } = await supabase.from('qr_scans').insert({
        plaque_id: plaque.plaque_id,
        user_agent: (request.headers.get('user-agent') || '').slice(0, 300) || null,
        referer: (request.headers.get('referer') || '').slice(0, 300) || null,
        ip_hash: ipHash,
      });
      if (scanErr) console.error('qr_scans insert error:', scanErr.message);
    },

    // Fallback legado: link guardado no perfil vinculado à plaquinha.
    fallbackDestination: async (plaque) => {
      if (!plaque.plaque_id) return null;
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('link, destination_url, instagram, whatsapp')
          .eq('plaque_id', plaque.plaque_id)
          .maybeSingle();
        if (!profile) return null;
        return (profile as any).link || (profile as any).destination_url || null;
      } catch {
        return null;
      }
    },
  });

  if (outcome.kind === 'redirect') {
    const res = NextResponse.redirect(outcome.location, { status: outcome.status });
    res.headers.set('Cache-Control', 'no-store');
    return res;
  }
  return new NextResponse(outcome.html, {
    status: outcome.status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
