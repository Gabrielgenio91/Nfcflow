'use client';

import { useEffect, useState } from 'react';
import { Copy, Check, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface Props {
  qrCode: string | null;
  qrCodeBase64: string | null;
  ticketUrl?: string | null;
  expiresAt: string | null;
}

function useCountdown(expiresAt: string | null) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setLeft(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return left;
}

/** Exibe o PIX real devolvido pelo gateway (nada é gerado/inventado no front). */
export function PixPayment({ qrCode, qrCodeBase64, ticketUrl, expiresAt }: Props) {
  const [copied, setCopied] = useState(false);
  const left = useCountdown(expiresAt);

  const copy = async () => {
    if (!qrCode) return;
    try {
      await navigator.clipboard.writeText(qrCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Não foi possível copiar. Selecione o código manualmente.');
    }
  };

  const mm = left != null ? String(Math.floor(left / 60)).padStart(2, '0') : '--';
  const ss = left != null ? String(left % 60).padStart(2, '0') : '--';

  return (
    <div className="space-y-4">
      {qrCodeBase64 && (
        <div className="mx-auto w-fit rounded-2xl bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`data:image/png;base64,${qrCodeBase64}`} alt="QR Code PIX" className="h-52 w-52" />
        </div>
      )}
      {qrCode && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">PIX copia e cola</p>
          <textarea readOnly value={qrCode} rows={3} onFocus={(e) => e.currentTarget.select()}
            className="w-full resize-none rounded-xl border border-input bg-white/[0.03] p-3 font-mono text-xs" />
          <Button onClick={copy} variant="outline" className="h-12 w-full">
            {copied ? <Check className="mr-2 h-4 w-4 text-success" /> : <Copy className="mr-2 h-4 w-4" />}
            {copied ? 'Código copiado!' : 'Copiar código PIX'}
          </Button>
        </div>
      )}
      {!qrCode && !qrCodeBase64 && ticketUrl && (
        <a href={ticketUrl} target="_blank" rel="noopener noreferrer">
          <Button className="h-12 w-full">Abrir página de pagamento</Button>
        </a>
      )}
      {expiresAt && (
        <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          {left === 0 ? 'Prazo de pagamento encerrado' : `Pague em ${mm}:${ss}`}
        </p>
      )}
    </div>
  );
}
