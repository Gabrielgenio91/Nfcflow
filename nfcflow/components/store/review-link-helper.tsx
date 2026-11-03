'use client';

import { useState } from 'react';
import { Check, Copy, Loader2, Search, Star } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Candidate { placeId: string; name: string; address: string | null; review_link: string }

/**
 * Gera o link direto de avaliação do Google a partir do link do Google Maps.
 * Toda a lógica fica no servidor (/api/google/review-link → googlePlacesService).
 */
export function ReviewLinkHelper({ onUse }: { onUse?: (link: string) => void }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const search = async () => {
    setMessage(null);
    setCandidates([]);
    if (url.trim().length < 5) { toast.error('Cole o link do Google Maps'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/google/review-link', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.configured === false) { setMessage(data.message || 'Integração Google ainda não configurada.'); return; }
      if (!res.ok) { setMessage(data.error || 'Não foi possível gerar o link.'); return; }
      setCandidates(data.candidates || []);
    } catch {
      setMessage('Erro de conexão. Tente novamente.');
    } finally { setLoading(false); }
  };

  const copy = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(link);
      setTimeout(() => setCopied(null), 2000);
    } catch { toast.error('Não foi possível copiar'); }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5"><Star className="h-3.5 w-3.5" /> Link do estabelecimento no Google Maps</Label>
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://maps.app.goo.gl/..." className="h-12" inputMode="url" />
      </div>
      <Button type="button" onClick={search} disabled={loading} className="h-12 w-full">
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
        Gerar link de avaliação
      </Button>
      {message && <p className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">{message}</p>}
      {candidates.map((c) => (
        <div key={c.placeId} className="space-y-2 rounded-xl border border-white/[0.08] p-3 text-sm">
          <div>
            <p className="font-medium">{c.name}</p>
            {c.address && <p className="text-xs text-muted-foreground">{c.address}</p>}
          </div>
          <p className="break-all rounded-lg bg-white/[0.04] p-2 font-mono text-xs">{c.review_link}</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="h-11 flex-1" onClick={() => copy(c.review_link)}>
              {copied === c.review_link ? <Check className="mr-2 h-4 w-4 text-success" /> : <Copy className="mr-2 h-4 w-4" />}
              {copied === c.review_link ? 'Copiado' : 'Copiar'}
            </Button>
            {onUse && (
              <Button type="button" className="h-11 flex-1" onClick={() => { onUse(c.review_link); toast.success('Link aplicado ao destino'); }}>
                Usar como destino
              </Button>
            )}
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">Confira se o estabelecimento listado é o correto antes de usar o link.</p>
    </div>
  );
}
