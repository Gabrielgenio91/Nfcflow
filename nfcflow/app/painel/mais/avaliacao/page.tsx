'use client';

import { Card } from '@/components/ui/card';
import { ReviewLinkHelper } from '@/components/store/review-link-helper';

export default function AvaliacaoPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Avaliação Google</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cole o link do estabelecimento no Google Maps e gere o link direto para escrever uma avaliação.
        </p>
      </div>
      <Card className="p-4"><ReviewLinkHelper /></Card>
      <p className="text-xs text-muted-foreground">
        Para usar o link numa plaquinha, abra Plaquinhas → Editar destino (ou a ativação) e cole o link gerado.
      </p>
    </div>
  );
}
