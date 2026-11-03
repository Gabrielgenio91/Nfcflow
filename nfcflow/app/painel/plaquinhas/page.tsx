'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Eye, Loader2, Pencil, Power, QrCode, ScanLine, Search, X, Save } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { ReviewLinkHelper } from '@/components/store/review-link-helper';
import { isSafeHttpUrl } from '@/lib/schemas';
import { qrUrlForToken } from '@/lib/app-url';
import { cn } from '@/lib/utils';

type Filter = 'TODAS' | 'ATIVA' | 'INATIVA';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'ATIVA', label: 'Ativas' },
  { key: 'INATIVA', label: 'Inativas' },
  { key: 'TODAS', label: 'Todas' },
];
const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  ATIVA: { label: 'Ativa', cls: 'border-success/30 text-success' },
  DISPONIVEL: { label: 'Disponível', cls: 'border-warning/30 text-warning' },
  INATIVA: { label: 'Inativa', cls: 'border-muted-foreground/30 text-muted-foreground' },
};

export default function ResellerPlaquesPage() {
  const { user } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [plaques, setPlaques] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('ATIVA');
  const [viewing, setViewing] = useState<any>(null);
  const [editing, setEditing] = useState<any>(null);
  const [url, setUrl] = useState('');
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [telefoneOpcional, setTelefoneOpcional] = useState('');
  const [showGoogle, setShowGoogle] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: reseller } = await supabase.from('resellers').select('id').eq('user_id', user.id).maybeSingle();
    if (!reseller) { setPlaques([]); setLoading(false); return; }
    // pega placa + customer junto pra mostrar nome
    const { data, error } = await supabase.from('plaques').select('*, customers!left(establishment_name, phone, phone_optional)').eq('reseller_id', reseller.id).order('created_at', { ascending: false });
    if (error) toast.error(error.message);
    else setPlaques(data || []);
    setLoading(false);
  }, [user, supabase]);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => ({
    ATIVA: plaques.filter(p => p.status === 'ATIVA').length,
    INATIVA: plaques.filter(p => p.status === 'INATIVA').length,
    TODAS: plaques.length,
  }), [plaques]);

  const filtered = plaques.filter(p => {
    if (filter!== 'TODAS' && p.status!== filter) return false;
    const q = search.toLowerCase();
    const estName = p.customers?.establishment_name || p.establishment_name || '';
    return!q || p.public_token?.toLowerCase().includes(q) || p.product_name?.toLowerCase().includes(q) || p.code?.toLowerCase().includes(q) || estName.toLowerCase().includes(q);
  });

  const openEdit = (p: any) => {
    setEditing(p);
    setUrl(p.redirect_url || '');
    setNome(p.customers?.establishment_name || p.establishment_name || p.product_name || '');
    setTelefone(p.customers?.phone || p.phone || '');
    setTelefoneOpcional(p.customers?.phone_optional || p.phone_optional || '');
    setShowGoogle(false);
  };

  const saveDestination = async () => {
    if (!editing) return;
    if (!isSafeHttpUrl(url)) { toast.error('URL inválida'); return; }
    if (!nome.trim()) { toast.error('Nome do estabelecimento obrigatório'); return; }
    setSaving(true);
    try {
      // 1. atualiza link na placa
      const { error: plaqueErr } = await supabase.from('plaques').update({
        redirect_url: url.trim(),
        establishment_name: nome.trim(),
        phone: telefone.trim().replace(/\D/g,''),
        phone_optional: telefoneOpcional.trim().replace(/\D/g,'') || null
      }).eq('id', editing.id);
      if (plaqueErr) throw plaqueErr;

      // 2. atualiza customer se tiver
      if (editing.customer_id) {
        await supabase.from('customers').update({
          establishment_name: nome.trim(),
          phone: telefone.trim().replace(/\D/g,''),
          phone_optional: telefoneOpcional.trim().replace(/\D/g,'') || null
        }).eq('id', editing.customer_id);
      }

      toast.success('Atualizado com sucesso!');
      setEditing(null);
      load();
    } catch(e:any){
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (p: any) => {
    const next = p.status === 'ATIVA'? 'INATIVA' : 'ATIVA';
    if (next === 'INATIVA' &&!confirm('Desativar?')) return;
    const { error } = await supabase.from('plaques').update({ status: next, is_active: next === 'ATIVA' }).eq('id', p.id);
    if (error) { toast.error(error.message); return; }
    toast.success(next === 'ATIVA'? 'Ativada' : 'Desativada');
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Minhas Plaquinhas</h1><p className="mt-1 text-sm text-muted-foreground">{counts.ATIVA} ativas</p></div>
        <Link href="/painel/plaquinhas/ativar"><Button className="h-11"><ScanLine className="mr-2 h-4 w-4" />Ativar</Button></Link>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {FILTERS.map(f => (<button key={f.key} onClick={() => setFilter(f.key)} className={cn('whitespace-nowrap rounded-full border px-4 py-2 text-sm', filter === f.key? 'border-primary/60 bg-primary/15' : 'border-white/[0.08] text-muted-foreground')}>{f.label} <span className="ml-1 text-xs opacity-70">{counts[f.key]}</span></button>))}
      </div>
      <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Buscar por estabelecimento, código ou produto" value={search} onChange={e => setSearch(e.target.value)} className="h-12 pl-10" /></div>
      {loading? <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div> : filtered.length === 0? <EmptyState icon={QrCode} title="Nenhuma plaquinha" description="Nada neste filtro." /> : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map(p => {
            const st = STATUS_BADGE[p.status] || STATUS_BADGE['DISPONIVEL'];
            const establishment = p.customers?.establishment_name || p.establishment_name || p.product_name || 'Produto';
            return (
              <Card key={p.id} className="p-4">
                <div className="flex items-start gap-3">
                  <button onClick={() => setViewing(p)} className="flex-shrink-0 rounded-xl bg-white p-1.5"><QRCodeSVG value={qrUrlForToken(p.public_token)} size={64} /></button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate font-medium">{establishment}</h3><p className="font-mono text-xs text-muted-foreground">{p.public_token || p.code}</p></div><Badge variant="outline" className={st.cls}>{st.label}</Badge></div>
                    {p.redirect_url && <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground"><ExternalLink className="h-3 w-3" /><span className="truncate">{p.redirect_url}</span></p>}
                    {(p.customers?.phone || p.phone) && <p className="mt-0.5 text-xs text-muted-foreground">📞 {p.customers?.phone || p.phone} {p.customers?.phone_optional || p.phone_optional? ` / ${p.customers?.phone_optional || p.phone_optional}` : ''}</p>}
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><Eye className="h-3.5 w-3.5" /> {p.scan_count?? p.scans?? 0} scans</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="h-10" onClick={() => setViewing(p)}><Eye className="mr-1.5 h-3.5 w-3.5" />Ver QR</Button>
                  {p.status === 'DISPONIVEL'? <Link href="/painel/plaquinhas/ativar"><Button size="sm" className="h-10"><ScanLine className="mr-1.5 h-3.5 w-3.5" />Ativar</Button></Link> : <>
                    <Button size="sm" variant="outline" className="h-10" onClick={() => openEdit(p)}><Pencil className="mr-1.5 h-3.5 w-3.5" />Editar</Button>
                    <Button size="sm" variant="ghost" className="h-10" onClick={() => toggleStatus(p)}><Power className="mr-1.5 h-3.5 w-3.5" />{p.status === 'ATIVA'? 'Desativar' : 'Reativar'}</Button>
                  </>}
                </div>
              </Card>
            )
          })}
        </div>
      )}
      {viewing && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" onClick={() => setViewing(null)}><div className="w-full max-w-sm rounded-t-3xl border bg-card p-5 text-center sm:rounded-3xl" onClick={e => e.stopPropagation()}><div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">{viewing.customers?.establishment_name || viewing.establishment_name || viewing.product_name}</h2><Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setViewing(null)}><X className="h-4 w-4" /></Button></div><div className="mx-auto w-fit rounded-2xl bg-white p-4"><QRCodeSVG id="qr-large" value={qrUrlForToken(viewing.public_token)} size={220} /></div><p className="mt-3 break-all font-mono text-xs text-muted-foreground">{qrUrlForToken(viewing.public_token)}</p></div></div>}

      {/* MODAL EDITAR AGORA COM NOME + TELEFONE */}
      {editing && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" onClick={() => setEditing(null)}><div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl border bg-card p-5 sm:rounded-3xl" onClick={e => e.stopPropagation()}><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">Editar plaquinha</h2><Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setEditing(null)}><X className="h-4 w-4" /></Button></div><div className="space-y-4">
        <p className="text-sm text-muted-foreground">{editing.product_name} · <span className="font-mono">{editing.public_token}</span></p>

        <div className="space-y-1.5"><Label>Nome do estabelecimento *</Label><Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Bar do João" className="h-12" /></div>

        <div className="space-y-1.5"><Label>Telefone / WhatsApp *</Label><Input value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(11) 99999-9999" className="h-12" /></div>

        <div className="space-y-1.5"><Label>Telefone opcional</Label><Input value={telefoneOpcional} onChange={e => setTelefoneOpcional(e.target.value)} placeholder="(opcional)" className="h-12" /></div>

        <div className="space-y-1.5"><Label>Destino do QR *</Label><Input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://instagram.com/empresa" className="h-12" /></div>

        <Button type="button" variant="ghost" className="h-10 px-2 text-sm text-primary" onClick={() => setShowGoogle(v =>!v)}>{showGoogle? 'Ocultar' : 'Usar link de avaliação do Google'}</Button>{showGoogle && <div className="rounded-xl border p-3"><ReviewLinkHelper onUse={l => { setUrl(l); setShowGoogle(false); }} /></div>}

        <Button onClick={saveDestination} disabled={saving} className="h-12 w-full">{saving? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-2 h-4 w-4" />Salvar tudo</>}</Button>
      </div></div></div>}
    </div>
  );
      }
