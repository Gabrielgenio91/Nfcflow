'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, LifeBuoy, Mail, Plus, Send } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { WhatsAppButton } from '@/components/shared/whatsapp';
import { SUPPORT_EMAIL } from '@/lib/brand';
import { TICKET_STATUS_CLASS, TICKET_STATUS_LABEL } from '@/lib/support';
import { cn } from '@/lib/utils';
import type { SupportMessage, SupportTicket } from '@/lib/types';

export default function SuportePage() {
  const { user } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [resellerId, setResellerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<SupportTicket | null>(null);
  const [thread, setThread] = useState<SupportMessage[]>([]);
  const [reply, setReply] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: r }, { data: t }] = await Promise.all([
      supabase.from('resellers').select('id').eq('user_id', user.id).maybeSingle(),
      supabase.from('support_tickets').select('*').order('updated_at', { ascending: false }),
    ]);
    setResellerId(r?.id ?? null);
    setTickets((t as SupportTicket[]) || []);
    setLoading(false);
  }, [user, supabase]);

  useEffect(() => { load(); }, [load]);

  const loadThread = useCallback(async (id: string) => {
    const { data } = await supabase.from('support_messages').select('*').eq('ticket_id', id).order('created_at', { ascending: true });
    setThread((data as SupportMessage[]) || []);
  }, [supabase]);

  const openTicket = (t: SupportTicket) => { setOpen(t); setThread([]); loadThread(t.id); };

  const create = async () => {
    if (subject.trim().length < 3) { toast.error('Informe o assunto'); return; }
    if (!message.trim()) { toast.error('Escreva a mensagem'); return; }
    if (!resellerId || !user) return;
    setSaving(true);
    try {
      const { data: t, error } = await supabase.from('support_tickets')
        .insert({ reseller_id: resellerId, subject: subject.trim(), status: 'ABERTO' }).select('*').single();
      if (error) throw error;
      const { error: mErr } = await supabase.from('support_messages')
        .insert({ ticket_id: t.id, author_id: user.id, author_role: 'reseller', body: message.trim() });
      if (mErr) throw mErr;
      toast.success('Chamado aberto!');
      setCreating(false); setSubject(''); setMessage('');
      load();
    } catch (e) {
      console.error(e);
      toast.error('Erro ao abrir chamado');
    } finally { setSaving(false); }
  };

  const send = async () => {
    if (!open || !user || !reply.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('support_messages')
      .insert({ ticket_id: open.id, author_id: user.id, author_role: 'reseller', body: reply.trim() });
    setSaving(false);
    if (error) { toast.error('Erro ao enviar mensagem'); return; }
    setReply('');
    loadThread(open.id);
  };

  if (open) {
    const closed = open.status === 'FECHADO';
    return (
      <div className="space-y-4">
        <button onClick={() => { setOpen(null); load(); }} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Chamados
        </button>
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-xl font-bold tracking-tight">{open.subject}</h1>
          <Badge variant="outline" className={TICKET_STATUS_CLASS[open.status]}>{TICKET_STATUS_LABEL[open.status]}</Badge>
        </div>
        <div className="space-y-2">
          {thread.map((m) => (
            <div key={m.id} className={cn('max-w-[90%] rounded-2xl p-3 text-sm', m.author_role === 'admin' ? 'bg-primary/15' : 'ml-auto bg-white/[0.06]')}>
              <p className="mb-1 text-xs text-muted-foreground">{m.author_role === 'admin' ? 'Suporte NFCFLOW' : 'Você'} · {new Date(m.created_at).toLocaleString('pt-BR')}</p>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </div>
          ))}
        </div>
        {closed ? (
          <p className="text-center text-sm text-muted-foreground">Chamado fechado. Abra um novo se precisar.</p>
        ) : (
          <div className="space-y-2">
            <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} placeholder="Escreva sua mensagem…" maxLength={4000} />
            <Button onClick={send} disabled={saving || !reply.trim()} className="h-12 w-full">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="mr-2 h-4 w-4" />Enviar</>}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Suporte</h1>
          <p className="mt-1 text-sm text-muted-foreground">Abra um chamado e acompanhe a resposta.</p>
        </div>
        <Button onClick={() => setCreating(true)} className="h-11"><Plus className="mr-2 h-4 w-4" />Novo</Button>
      </div>

      {creating && (
        <Card className="space-y-3 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="subj">Assunto</Label>
            <Input id="subj" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} className="h-12" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="msg">Mensagem</Label>
            <Textarea id="msg" value={message} onChange={(e) => setMessage(e.target.value)} rows={4} maxLength={4000} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="h-12 flex-1" onClick={() => setCreating(false)} disabled={saving}>Cancelar</Button>
            <Button className="h-12 flex-1" onClick={create} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Abrir chamado'}</Button>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : tickets.length === 0 ? (
        <EmptyState icon={LifeBuoy} title="Nenhum chamado" description="Quando precisar de ajuda, abra um chamado." />
      ) : (
        <div className="space-y-2">
          {tickets.map((t) => (
            <button key={t.id} onClick={() => openTicket(t)} className="block w-full text-left">
              <Card className="p-4 transition-colors hover:border-primary/40">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{t.subject}</p>
                  <Badge variant="outline" className={TICKET_STATUS_CLASS[t.status]}>{TICKET_STATUS_LABEL[t.status]}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Atualizado em {new Date(t.updated_at).toLocaleString('pt-BR')}</p>
              </Card>
            </button>
          ))}
        </div>
      )}

      <WhatsAppButton message="Olá! Sou revendedor NFCFLOW e preciso de ajuda." />

      <a href={`mailto:${SUPPORT_EMAIL}`} className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <Mail className="h-4 w-4" /> {SUPPORT_EMAIL}
      </a>
    </div>
  );
}
