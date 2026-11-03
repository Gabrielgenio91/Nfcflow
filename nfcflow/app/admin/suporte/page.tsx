'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, LifeBuoy, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MessageCircle } from 'lucide-react';
import { useStoreSettings, invalidateStoreSettings } from '@/hooks/use-store-settings';
import { whatsappUrl } from '@/components/shared/whatsapp';
import { EmptyState } from '@/components/shared/empty-state';
import { TICKET_STATUSES, TICKET_STATUS_CLASS, TICKET_STATUS_LABEL } from '@/lib/support';
import { cn } from '@/lib/utils';
import type { SupportMessage, SupportTicket, TicketStatus } from '@/lib/types';

export default function AdminSupportPage() {
  const { user } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [filter, setFilter] = useState<TicketStatus | 'TODOS'>('TODOS');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<SupportTicket | null>(null);
  const [thread, setThread] = useState<SupportMessage[]>([]);
  const [reply, setReply] = useState('');
  const [saving, setSaving] = useState(false);
  const settings = useStoreSettings();
  const [phone, setPhone] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
  useEffect(() => { if (settings.loaded) setPhone(settings.supportWhatsapp); }, [settings.loaded, settings.supportWhatsapp]);

  const savePhone = async () => {
    setSavingPhone(true);
    const { data, error } = await supabase.rpc('admin_set_support_whatsapp', { p_phone: phone });
    setSavingPhone(false);
    if (error) { toast.error(error.message.includes('INVALID_PHONE') ? 'Número inválido. Use DDD + número.' : 'Erro ao salvar o número'); return; }
    setPhone((data as string) || '');
    invalidateStoreSettings();
    await settings.reload();
    toast.success((data as string) ? 'WhatsApp do suporte atualizado' : 'WhatsApp do suporte removido');
  };

  const load = useCallback(async () => {
    const { data } = await supabase.from('support_tickets')
      .select('*, reseller:resellers(id, full_name, email)').order('updated_at', { ascending: false });
    setTickets((data as unknown as SupportTicket[]) || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const loadThread = useCallback(async (id: string) => {
    const { data } = await supabase.from('support_messages').select('*').eq('ticket_id', id).order('created_at', { ascending: true });
    setThread((data as SupportMessage[]) || []);
  }, [supabase]);

  const openTicket = (t: SupportTicket) => { setOpen(t); setThread([]); loadThread(t.id); };

  const setStatus = async (status: TicketStatus) => {
    if (!open) return;
    const { error } = await supabase.from('support_tickets').update({ status }).eq('id', open.id);
    if (error) { toast.error('Erro ao alterar status'); return; }
    setOpen({ ...open, status });
    load();
  };

  const send = async () => {
    if (!open || !user || !reply.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('support_messages')
      .insert({ ticket_id: open.id, author_id: user.id, author_role: 'admin', body: reply.trim() });
    if (!error && open.status === 'ABERTO') {
      await supabase.from('support_tickets').update({ status: 'EM_ATENDIMENTO' }).eq('id', open.id);
      setOpen({ ...open, status: 'EM_ATENDIMENTO' });
    }
    setSaving(false);
    if (error) { toast.error('Erro ao responder'); return; }
    setReply('');
    loadThread(open.id);
    load();
  };

  if (open) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <button onClick={() => { setOpen(null); load(); }} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Chamados
        </button>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold tracking-tight">{open.subject}</h1>
            <p className="text-sm text-muted-foreground">{open.reseller?.full_name} · {open.reseller?.email}</p>
          </div>
          <select value={open.status} onChange={(e) => setStatus(e.target.value as TicketStatus)}
            className="h-11 rounded-xl border border-input bg-white/[0.03] px-3 text-sm">
            {TICKET_STATUSES.map((s) => <option key={s} value={s} className="bg-card">{TICKET_STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          {thread.map((m) => (
            <div key={m.id} className={cn('max-w-[90%] rounded-2xl p-3 text-sm', m.author_role === 'admin' ? 'ml-auto bg-primary/15' : 'bg-white/[0.06]')}>
              <p className="mb-1 text-xs text-muted-foreground">{m.author_role === 'admin' ? 'Suporte' : open.reseller?.full_name} · {new Date(m.created_at).toLocaleString('pt-BR')}</p>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </div>
          ))}
        </div>
        {open.status !== 'FECHADO' && (
          <div className="space-y-2">
            <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} placeholder="Responder…" maxLength={4000} />
            <Button onClick={send} disabled={saving || !reply.trim()} className="h-12 w-full sm:w-auto">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="mr-2 h-4 w-4" />Responder</>}
            </Button>
          </div>
        )}
      </div>
    );
  }

  const list = tickets.filter((t) => filter === 'TODOS' || t.status === filter);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Suporte</h1>
        <p className="mt-1 text-sm text-muted-foreground">Chamados dos revendedores</p>
      </div>
      <Card className="space-y-3 p-4">
        <Label htmlFor="wpp" className="flex items-center gap-1.5"><MessageCircle className="h-4 w-4" /> Telefone / WhatsApp do suporte</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input id="wpp" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(00) 00000-0000" className="h-12" />
          <Button onClick={savePhone} disabled={savingPhone} className="h-12 sm:w-40">{savingPhone ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Usado automaticamente na landing, login, cadastro e painel do revendedor. Deixe vazio para ocultar os botões.
          {phone.replace(/\D/g, '').length >= 10 && <> <a className="text-primary hover:underline" href={whatsappUrl(phone.replace(/\D/g, '').length <= 11 ? '55' + phone.replace(/\D/g, '') : phone, 'Teste')} target="_blank" rel="noopener noreferrer">Testar link</a></>}
        </p>
      </Card>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {(['TODOS', ...TICKET_STATUSES] as const).map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={cn('whitespace-nowrap rounded-full border px-4 py-2 text-sm',
              filter === s ? 'border-primary/60 bg-primary/15' : 'border-white/[0.08] text-muted-foreground')}>
            {s === 'TODOS' ? 'Todos' : TICKET_STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : list.length === 0 ? (
        <EmptyState icon={LifeBuoy} title="Nenhum chamado" />
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {list.map((t) => (
            <button key={t.id} onClick={() => openTicket(t)} className="block text-left">
              <Card className="p-4 transition-colors hover:border-primary/40">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{t.subject}</p>
                  <Badge variant="outline" className={TICKET_STATUS_CLASS[t.status]}>{TICKET_STATUS_LABEL[t.status]}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t.reseller?.full_name} · {new Date(t.updated_at).toLocaleString('pt-BR')}</p>
              </Card>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
