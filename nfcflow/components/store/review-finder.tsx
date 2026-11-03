'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, Loader2, MapPin, Search, Star } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NX_CARD } from '@/components/shell/styles';

interface Candidate { name: string; address: string | null; place_id: string; review_link: string }
interface SavedLink { id: string; place_id: string; name: string; address: string | null; review_link: string }

/**
 * Gerador de link de avaliação (empresa + cidade/UF [+ bairro]).
 * Usa SOMENTE POST /api/google/review-link (serviço Google já existente).
 */
export function ReviewFinder() {
  const supabase = useMemo(() => createClient(), []);
  const [nome, setNome] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');
  const [bairro, setBairro] = useState('');
  const [saved, setSaved] = useState<SavedLink[]>([]);
  const [savedOk, setSavedOk] = useState(false);
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Candidate | null>(null);
  const [copied, setCopied] = useState(false);

  const loadSaved = useCallback(async () => {
    const { data } = await supabase.from('review_links').select('id, place_id, name, address, review_link').order('created_at', { ascending: false }).limit(5);
    setSaved((data as SavedLink[]) || []);
  }, [supabase]);
  useEffect(() => { loadSaved(); }, [loadSaved]);

  // Confirmou a empresa: o link já é https://search.google.com/local/writereview?placeid=PLACE_ID — salva para o revendedor
  const confirm = async (c: Candidate) => {
    setChosen(c);
    setSavedOk(false);
    const { data: r } = await supabase.from('resellers').select('id').maybeSingle();
    if (!r) { toast.error('Não foi possível salvar o link (cadastro de revendedor não encontrado).'); return; }
    const link = `https://search.google.com/local/writereview?placeid=${encodeURIComponent(c.place_id)}`;
    const { error } = await supabase.from('review_links').upsert(
      { reseller_id: (r as { id: string }).id, place_id: c.place_id, name: c.name, address: c.address, review_link: link },
      { onConflict: 'reseller_id,place_id' },
    );
    if (error) { toast.error('Link gerado, mas não foi possível salvar. Rodou o SQL de instruções?'); return; }
    setSavedOk(true);
    loadSaved();
  };

  const search = async () => {
    setMessage(null);
    setChosen(null);
    setCandidates(null);
    if (nome.trim().length < 2) { toast.error('Informe o nome da empresa'); return; }
    if (cidade.trim().length < 2) { toast.error('Informe a cidade'); return; }
    if (estado.trim().length < 2) { toast.error('Informe o estado'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/google/review-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nome.trim(), cidadeUf: `${cidade.trim()} - ${estado.trim()}`, bairro: bairro.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMessage(data.error || 'Não foi possível buscar a empresa.'); return; }
      const list = (data.candidates || []) as Candidate[];
      if (list.length === 0) {
        setMessage('Nenhuma empresa encontrada. Confira o nome, a cidade e o estado ou tente incluir o bairro.');
        return;
      }
      setCandidates(list);
    } catch {
      setMessage('Erro de conexão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!chosen) return;
    try {
      await navigator.clipboard.writeText(chosen.review_link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { toast.error('Não foi possível copiar'); }
  };

  const reset = () => { setChosen(null); setCandidates(null); setMessage(null); };

  return (
    <Card className={NX_CARD}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Star className="h-4 w-4 text-warning" /> Gerador de link de avaliação</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {chosen ? (
          <div className="space-y-3">
            <p className="text-xs font-bold tracking-wider text-success">LINK DE AVALIAÇÃO PRONTO{savedOk ? ' · SALVO' : ''}</p>
            <div>
              <p className="font-medium">{chosen.name}</p>
              {chosen.address && <p className="text-xs text-muted-foreground">{chosen.address}</p>}
            </div>
            <p className="break-all rounded-lg bg-white/[0.04] p-3 font-mono text-xs">{chosen.review_link}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" className="h-12 flex-1" onClick={copy}>
                {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                {copied ? 'Copiado' : 'Copiar link'}
              </Button>
              <Button type="button" variant="outline" className="h-12 flex-1" onClick={reset}>Escolher outra empresa</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="rf-nome">Nome do estabelecimento *</Label>
              <Input id="rf-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Barbearia do João" className="h-12" />
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
              <div className="space-y-1.5">
                <Label htmlFor="rf-cidade">Cidade *</Label>
                <Input id="rf-cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Ex.: Imperatriz" className="h-12" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rf-estado">Estado *</Label>
                <Input id="rf-estado" value={estado} onChange={(e) => setEstado(e.target.value.toUpperCase())} placeholder="MA" maxLength={30} className="h-12" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rf-bairro">Bairro (opcional)</Label>
              <Input id="rf-bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} placeholder="Ex.: Centro" className="h-12" />
            </div>
            <Button type="button" onClick={search} disabled={loading} className="h-12 w-full">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Buscar empresa
            </Button>
            {message && <p className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">{message}</p>}
            {candidates && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Selecione a empresa correta:</p>
                {candidates.map((c) => (
                  <div key={c.place_id} className="flex flex-col gap-2 rounded-xl border border-white/[0.08] p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium">{c.name}</p>
                      {c.address && <p className="flex items-start gap-1 text-xs text-muted-foreground"><MapPin className="mt-0.5 h-3 w-3 flex-shrink-0" />{c.address}</p>}
                    </div>
                    <Button type="button" variant="outline" className="h-11 shrink-0" onClick={() => confirm(c)}>É esta empresa</Button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {saved.length > 0 && (
          <div className="space-y-2 border-t border-white/[0.08] pt-4">
            <p className="text-xs font-semibold text-muted-foreground">Links salvos</p>
            {saved.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.04] p-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{l.name}</p>
                  {l.address && <p className="truncate text-xs text-muted-foreground">{l.address}</p>}
                </div>
                <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={() => { navigator.clipboard.writeText(l.review_link).then(() => toast.success('Link copiado')).catch(() => toast.error('Não foi possível copiar')); }}>
                  <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
