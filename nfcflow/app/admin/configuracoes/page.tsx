'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getPublicAppUrl } from '@/lib/app-url';

interface Status {
  mercadoPago: { configured: boolean; webhookSecretConfigured: boolean };
  correios: { configured: boolean };
  google: { configured: boolean };
  appUrlConfigured: boolean;
  cronConfigured: boolean;
}

function Flag({ ok, label }: { ok: boolean; label?: string }) {
  return (
    <Badge variant="outline" className={ok ? 'border-success/30 text-success' : 'border-warning/30 text-warning'}>
      {ok ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <XCircle className="mr-1 h-3 w-3" />}
      {label ?? (ok ? 'CONFIGURADO' : 'NÃO CONFIGURADO')}
    </Badge>
  );
}

function Row({ name, children, hint }: { name: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3 text-sm"><span>{name}</span>{children}</div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function AdminSettingsPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/api/admin/integrations', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setStatus)
      .catch(() => setError(true));
  }, []);

  const base = getPublicAppUrl();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="mt-1 text-sm text-muted-foreground">Status das integrações. As credenciais ficam nas variáveis de ambiente do servidor — nunca aparecem aqui.</p>
      </div>

      {!status && !error && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
      {error && <p className="text-sm text-destructive">Não foi possível carregar o status das integrações.</p>}

      {status && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Mercado Pago (PIX)</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Row name="Credenciais (MERCADO_PAGO_ACCESS_TOKEN)"><Flag ok={status.mercadoPago.configured} /></Row>
              <Row name="Assinatura do webhook (MERCADO_PAGO_WEBHOOK_SECRET)"
                hint={`URL do webhook para cadastrar no painel do Mercado Pago: ${base}/api/webhooks/mercado-pago`}>
                <Flag ok={status.mercadoPago.webhookSecretConfigured} />
              </Row>
              {!status.mercadoPago.configured && <p className="text-xs text-warning">Sem credenciais, o checkout não consegue gerar pagamentos.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Correios (frete e rastreamento)</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Row name="API (CORREIOS_API_TOKEN, CORREIOS_API_URL, CORREIOS_ORIGIN_ZIP)"><Flag ok={status.correios.configured} /></Row>
              {!status.correios.configured && <p className="text-xs text-warning">Modo preparado: o frete usa um valor provisório (SHIPPING_FALLBACK_AMOUNT) e o código de rastreio é informado manualmente.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Google (link de avaliação)</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Row name="Places API (GOOGLE_PLACES_API_KEY)"><Flag ok={status.google.configured} /></Row>
              {!status.google.configured && <p className="text-xs text-warning">Integração Google ainda não configurada.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Sistema</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Row name="URL pública (NEXT_PUBLIC_APP_URL)" hint="Usada nos QR Codes e no webhook."><Flag ok={status.appUrlConfigured} /></Row>
              <Row name="Liberação automática de reservas (CRON_SECRET)" hint={`Agende uma chamada periódica (ex.: a cada 5 min) a ${base}/api/cron/release-reservations com o header Authorization: Bearer <CRON_SECRET>.`}>
                <Flag ok={status.cronConfigured} />
              </Row>
              <Row name="Versão"><Badge variant="secondary">2.0.0</Badge></Row>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
