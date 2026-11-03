'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, Eye, Keyboard, Loader2, Pencil, Plus, ScanLine, ShoppingBag, Store, X } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/shared/empty-state';
import { QrScanner } from '@/components/shared/qr-scanner';
import { WhatsAppButton } from '@/components/shared/whatsapp';
import { ReviewLinkHelper } from '@/components/store/review-link-helper';
import { formatPhone } from '@/components/store/address-form';
import { extractToken } from '@/lib/qr';
import { isSafeHttpUrl } from '@/lib/schemas';
import { formatBRL } from '@/lib/money';
import { getQrBaseUrl } from '@/lib/app-url';

const DEFAULT_PRICE = '80';

interface Lookup {
  result: 'NOT_FOUND' | 'IN_RESELLER_STOCK' | 'AVAILABLE' | 'ACTIVE' | 'INACTIVE';
  plaque_id: string | null;
  product_name: string | null;
  product_photo_url: string | null;
}
interface Sale {
  id: string; plaque_id: string; customer_name: string; customer_phone: string | null; amount: number; created_at: string;
  plaque: { public_token: string, scan_count?: number, scans?: number } | null; product: { name: string } | null;
}

const ERRORS: Record<string, string> = {
  INVALID_URL: 'Destino inválido. Use um link começando com http:// ou https://',
  CUSTOMER_REQUIRED: 'Informe o nome da empresa ou do cliente.',
  INVALID_AMOUNT: 'Valor inválido.',
  ALREADY_ACTIVATED: 'Esta plaquinha já foi ativada.',
  IN_RESELLER_STOCK: 'Esta plaquinha está no estoque de um revendedor. Ela só pode ser ativada pelo painel dele.',
  INSUFFICIENT_STOCK: 'Estoque central insuficiente para este produto. Registre uma Entrada em Estoque e tente de novo.',
  PLAQUE_NOT_FOUND: 'Plaquinha não encontrada.',
  SALE_NOT_FOUND: 'Venda não encontrada.',
  FORBIDDEN: 'Sem permissão.',
};
const errMsg = (m: string) => ERRORS[Object.keys(ERRORS).find((k) => m.includes(k)) || ''] || 'Não foi possível concluir. Tente novamente.';

export default function LocalSalesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [sales, setSales] = useState<Sale[]>([]);
  const [dest, setDest] = useState<Record<string, string>>({});
  const [scanMap, setScanMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const [flow, setFlow] = useState<'closed' | 'scan' | 'manual' | 'form' | 'done'>('closed');
  const [manual, setManual] = useState('');
  const [looking, setLooking] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [url, setUrl] = useState('');
  const [amount, setAmount] = useState(DEFAULT_PRICE);
  const [showGoogle, setShowGoogle] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState<Sale | null>(null);
  const [eName, setEName] = useState('');
  const [ePhone, setEPhone] = useState('');
  const [eUrl, setEUrl] = useState('');
  const [eGoogle, setEGoogle] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
     .from('local_sales')
     .select('id, plaque_id, customer_name, customer_phone, amount, created_at, plaque:plaques(public_token, scan_count, scans), product:products(name)')
     .order('created_at', { ascending: false }).limit(200);
    if (error) toast.error('Erro ao carregar as vendas locais');
    const list = ((data as unknown as Sale[]) || []).map((s) => ({...s, amount: Number(s.amount) }));
    setSales(list);

    if (list.length) {
      const plaqueIds = list.map((s) => s.plaque_id);

      // busca destinos
      const { data: d } = await supabase.from('qr_destinations').select('plaque_id, destination_url').eq('active', true).in('plaque_id', plaqueIds);
      const m: Record<string, string> = {};
      (d || []).forEach((x: { plaque_id: string; destination_url: string }) => { m[x.plaque_id] = x.destination_url; });
      setDest(m);

      // ADICIONADO: busca contagem de scans
      // tenta 2 tabelas possíveis: plaque_scans ou qr_scan_logs
      const { data: plaquesScan } = await supabase.from('plaques').select('id, scan_count, scans').in('id', plaqueIds);
      const sm: Record<string, number> = {};
      (plaquesScan || []).forEach((p: any) => {
        sm[p.id] = p.scan_count?? p.scans?? 0;
      });

      // se tiver tabela separada de scans, conta também
      try {
        const { data: scanLogs } = await supabase.from('plaque_scans').select('plaque_id').in('plaque_id', plaqueIds);
        if (scanLogs && scanLogs.length > 0) {
          const counts: Record<string, number> = {};
          scanLogs.forEach((s: any) => { counts[s.plaque_id] = (counts[s.plaque_id] || 0) + 1; });
          // mescla, prioriza o maior
          Object.keys(counts).forEach(k => { sm[k] = Math.max(sm[k] || 0, counts[k]); });
        }
      } catch {}

      setScanMap(sm);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const resetFlow = () => {
    setFlow('closed'); setToken(null); setLookup(null); setManual(''); setName(''); setPhone(''); setUrl(''); setAmount(DEFAULT_PRICE); setShowGoogle(false);
  };

  const doLookup = async (raw: string): Promise<boolean> => {
    const t = extractToken(raw);
    if (!t) { toast.error('QR Code inválido para uma plaquinha NFCFLOW'); return false; }
    setLooking(true);
    setToken(t);
    const { data, error } = await supabase.rpc('admin_lookup_plaque_for_local_sale', { p_token: t }).maybeSingle();
    setLooking(false);
    if (error ||!data) { toast.error('Erro ao validar a plaquinha'); setToken(null); return false; }
    setLookup(data as unknown as Lookup);
    setFlow('form');
    return true;
  };

  const register = async () => {
    if (!lookup?.plaque_id) return;
    const price = parseFloat(amount.replace(',', '.'));
    if (name.trim().length < 2) { toast.error('Informe o nome da empresa ou do cliente'); return; }
    if (!isSafeHttpUrl(url)) { toast.error('Destino inválido. Use http:// ou https://'); return; }
    if (!Number.isFinite(price) || price < 0) { toast.error('Valor inválido'); return; }
    setSaving(true);
    const { error } = await supabase.rpc('admin_register_local_sale', {
      p_plaque_id: lookup.plaque_id, p_customer_name: name.trim(), p_phone: phone.trim() || null,
      p_destination_url: url.trim(), p_amount: price,
    });
    setSaving(false);
    if (error) { toast.error(errMsg(error.message)); return; }
    toast.success('Venda registrada e plaquinha ativada! Estoque atualizado.');
    setFlow('done');
    load();
  };

  const openEdit = (s: Sale) => { setEditing(s); setEName(s.customer_name); setEPhone(s.customer_phone? formatPhone(s.customer_phone) : ''); setEUrl(dest[s.plaque_id] || ''); setEGoogle(false); };

  const saveEdit = async () => {
    if (!editing) return;
    if (eName.trim().length < 2) { toast.error('Informe o nome'); return; }
    if (!isSafeHttpUrl(eUrl)) { toast.error('Destino inválido. Use http:// ou https://'); return; }
    setSaving(true);
    const { error } = await supabase.rpc('admin_update_local_sale', {
      p_sale_id: editing.id, p_customer_name: eName.trim(), p_phone: ePhone.trim() || null, p_destination_url: eUrl.trim(),
    });
    setSaving(false);
    if (error) { toast.error(errMsg(error.message)); return; }
    toast.success('Atualizado! O mesmo QR físico agora leva ao novo destino.');
    setEditing(null);
    load();
  };

  const total = sales.reduce((s, x) => s + x.amount, 0);
  const totalScans = Object.values(scanMap).reduce((s, v) => s + v, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Venda Local</h1>
          <p className="mt-1 text-sm text-muted-foreground">Escaneie a plaquinha vendida, cadastre o cliente e ative. O QR físico é permanente; só o destino muda.</p>
        </div>
        {flow === 'closed' && (
          <Button className="h-12" onClick={() => setFlow('scan')}><Plus className="mr-2 h-4 w-4" />Nova Venda Local</Button>
        )}
      </div>

      {flow!== 'closed' && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Nova Venda Local</CardTitle>
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={resetFlow} aria-label="Fechar"><X className="h-4 w-4" /></Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {flow === 'scan' && (
              <>
                {looking? (
                  <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin" /></div>
                ) : (
                  <QrScanner active onResult={(text) => { doLookup(text).then((ok) => { if (!ok) setFlow('manual'); }); }} />
                )}
                <p className="text-center text-sm text-muted-foreground">Aponte a câmera para o QR Code da plaquinha.</p>
                <Button variant="outline" className="h-12 w-full" onClick={() => setFlow('manual')}><Keyboard className="mr-2 h-4 w-4" />Digitar o código manualmente</Button>
              </>
            )}

            {flow === 'manual' && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="tok">Código da plaquinha</Label>
                  <Input id="tok" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Ex.: A8F92KX7" autoCapitalize="characters" className="h-12 font-mono uppercase" />
                  <p className="text-xs text-muted-foreground">É o código no final do link do QR (…/q/CÓDIGO).</p>
                </div>
                <Button className="h-12 w-full" disabled={looking ||!manual.trim()} onClick={() => doLookup(manual)}>
                  {looking? <Loader2 className="h-4 w-4 animate-spin" /> : 'Validar plaquinha'}
                </Button>
                <Button variant="ghost" className="h-12 w-full" onClick={() => setFlow('scan')}><ScanLine className="mr-2 h-4 w-4" />Usar a câmera</Button>
              </>
            )}

            {flow === 'form' && lookup && lookup.result!== 'AVAILABLE' && (
              <div className="space-y-4 py-4 text-center">
                <AlertTriangle className={lookup.result === 'NOT_FOUND' || lookup.result === 'IN_RESELLER_STOCK'? 'mx-auto h-12 w-12 text-destructive' : 'mx-auto h-12 w-12 text-warning'} />
                <h2 className="text-lg font-semibold">
                  {lookup.result === 'NOT_FOUND' && 'Plaquinha não encontrada'}
                  {lookup.result === 'IN_RESELLER_STOCK' && 'Esta plaquinha está no estoque de um revendedor'}
                  {lookup.result === 'ACTIVE' && 'Esta plaquinha já está ativa'}
                  {lookup.result === 'INACTIVE' && 'Esta plaquinha já foi ativada (inativa)'}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {lookup.result === 'NOT_FOUND' && 'Confira o QR Code e tente novamente.'}
                  {lookup.result === 'IN_RESELLER_STOCK' && 'A Venda Local usa o estoque central. Esta plaquinha só pode ser ativada pelo revendedor dono dela.'}
                  {(lookup.result === 'ACTIVE' || lookup.result === 'INACTIVE') && 'Para mudar o destino, edite a venda na lista abaixo.'}
                </p>
                <Button variant="outline" className="h-12 w-full" onClick={() => { setLookup(null); setFlow('scan'); }}>Escanear outra</Button>
              </div>
            )}

            {flow === 'form' && lookup?.result === 'AVAILABLE' && (
              <>
                <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] p-3">
                  <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/[0.06]">
                    {lookup.product_photo_url? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={lookup.product_photo_url} alt="" className="h-full w-full object-cover" />
                    ) : <ShoppingBag className="h-6 w-6 text-muted-foreground" />}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{lookup.product_name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{token} · estoque central</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="n">Nome da empresa ou cliente *</Label>
                  <Input id="n" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Padaria São João" className="h-12" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="p">Telefone (opcional)</Label>
                    <Input id="p" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} placeholder="(00) 00000-0000" className="h-12" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="v">Valor da venda (R$)</Label>
                    <Input id="v" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-12" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="u">Link de destino do QR *</Label>
                  <Input id="u" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://instagram.com/empresa" className="h-12" />
                  <p className="text-xs text-muted-foreground">O QR físico continua apontando para /q/{token}; este link fica salvo no sistema e pode ser trocado depois.</p>
                </div>
                <Button type="button" variant="ghost" className="h-10 px-2 text-sm text-primary" onClick={() => setShowGoogle((v) =>!v)}>
                  {showGoogle? 'Ocultar' : 'Usar link de avaliação do Google'}
                </Button>
                {showGoogle && <div className="rounded-xl border border-white/[0.08] p-3"><ReviewLinkHelper onUse={(l) => { setUrl(l); setShowGoogle(false); }} /></div>}

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button variant="outline" className="h-12 flex-1" onClick={resetFlow} disabled={saving}>Cancelar</Button>
                  <Button className="h-12 flex-[2]" onClick={register} disabled={saving}>
                    {saving? <Loader2 className="h-4 w-4 animate-spin" /> : 'Registrar venda e ativar'}
                  </Button>
                </div>
              </>
            )}

            {flow === 'done' && (
              <div className="space-y-4 py-4 text-center">
                <CheckCircle2 className="mx-auto h-14 w-14 text-success" />
                <h2 className="text-xl font-bold">Plaquinha ativada!</h2>
                <p className="text-sm text-muted-foreground">O mesmo QR físico já leva ao destino informado.</p>
                <Button className="h-12 w-full" onClick={() => { resetFlow(); setFlow('scan'); }}>Nova venda</Button>
                <Button variant="outline" className="h-12 w-full" onClick={resetFlow}>Concluir</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Gerar link de avaliação do Google</CardTitle></CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">Cole o link do estabelecimento do cliente (Google Maps) e entregue o link direto para ele deixar uma avaliação.</p>
          <ReviewLinkHelper />
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4"><p className="text-xs text-muted-foreground">Vendas locais</p><p className="mt-1 text-2xl font-bold">{sales.length}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Faturamento local</p><p className="mt-1 text-xl font-bold">{formatBRL(total)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground flex items-center gap-1"><Eye className="h-3 w-3" />Scans total</p><p className="mt-1 text-2xl font-bold">{totalScans}</p></Card>
      </div>

      {loading? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : sales.length === 0? (
        <EmptyState icon={Store} title="Nenhuma venda local ainda" description="Toque em “Nova Venda Local” para registrar a primeira." />
      ) : (
        <div className="space-y-3">
          {sales.map((s) => {
            const scans = scanMap[s.plaque_id]?? s.plaque?.scan_count?? s.plaque?.scans?? 0;
            return (
              <Card key={s.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{s.customer_name}</p>
                    <p className="text-xs text-muted-foreground">{s.product?.name || 'Produto'} · <span className="font-mono">{s.plaque?.public_token}</span></p>
                    {s.customer_phone && <p className="text-xs text-muted-foreground">{formatPhone(s.customer_phone)}</p>}
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{formatBRL(s.amount)}</p>
                    <p className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString('pt-BR')}</p>
                  </div>
                </div>
                {dest[s.plaque_id] && (
                  <p className="mt-2 flex items-center gap-1 truncate text-xs text-muted-foreground"><ExternalLink className="h-3 w-3 flex-shrink-0" /><span className="truncate">{dest[s.plaque_id]}</span></p>
                )}
                {/* CONTADOR DE SCANS ADICIONADO */}
                <p className="mt-2 flex items-center gap-1 text-xs"><Eye className="h-3.5 w-3.5 text-primary" /><span className="font-semibold text-foreground">{scans}</span> <span className="text-muted-foreground">{scans === 1? 'escaneamento' : 'escaneamentos'}</span></p>

                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" className="h-10" onClick={() => openEdit(s)}><Pencil className="mr-1.5 h-3.5 w-3.5" />Editar</Button>
                  {s.plaque?.public_token && (
                    <a href={`${getQrBaseUrl()}/q/${s.plaque.public_token}`} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="ghost" className="h-10"><ExternalLink className="mr-1.5 h-3.5 w-3.5" />Testar QR</Button>
                    </a>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <WhatsAppButton message="Olá! Preciso de ajuda com uma Venda Local no NFCFLOW." className="h-11 text-sm" />

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" onClick={() => setEditing(null)}>
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-white/[0.08] bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Editar venda local</h2>
              <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setEditing(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">QR/token <span className="font-mono">{editing.plaque?.public_token}</span> — permanente. Só o destino muda.</p>
              <div className="space-y-1.5"><Label htmlFor="en">Empresa / cliente *</Label><Input id="en" value={eName} onChange={(e) => setEName(e.target.value)} className="h-12" /></div>
              <div className="space-y-1.5"><Label htmlFor="ep">Telefone</Label><Input id="ep" type="tel" inputMode="tel" value={ePhone} onChange={(e) => setEPhone(formatPhone(e.target.value))} className="h-12" /></div>
              <div className="space-y-1.5"><Label htmlFor="eu">Destino do QR *</Label><Input id="eu" type="url" inputMode="url" value={eUrl} onChange={(e) => setEUrl(e.target.value)} className="h-12" /></div>
              <Button type="button" variant="ghost" className="h-10 px-2 text-sm text-primary" onClick={() => setEGoogle((v) =>!v)}>{eGoogle? 'Ocultar' : 'Usar link de avaliação do Google'}</Button>
              {eGoogle && <div className="rounded-xl border border-white/[0.08] p-3"><ReviewLinkHelper onUse={(l) => { setEUrl(l); setEGoogle(false); }} /></div>}
              <Button onClick={saveEdit} disabled={saving} className="h-12 w-full">{saving? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar alterações'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
        }
