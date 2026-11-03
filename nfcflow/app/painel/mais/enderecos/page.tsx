'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, MapPin, Pencil, Plus, Star, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { AddressForm, EMPTY_ADDRESS, formatPhone, formatZip, type AddressFields } from '@/components/store/address-form';
import { addressSchema } from '@/lib/schemas';
import type { Address } from '@/lib/types';

export default function EnderecosPage() {
  const { user } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [resellerId, setResellerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Address | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AddressFields>(EMPTY_ADDRESS);
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: r }, { data: a }] = await Promise.all([
      supabase.from('resellers').select('id').eq('user_id', user.id).maybeSingle(),
      supabase.from('addresses').select('*').order('is_default', { ascending: false }).order('created_at', { ascending: false }),
    ]);
    setResellerId(r?.id ?? null);
    setAddresses((a as Address[]) || []);
    setLoading(false);
  }, [user, supabase]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm(EMPTY_ADDRESS); setIsDefault(addresses.length === 0); setShowForm(true); };
  const openEdit = (a: Address) => {
    setEditing(a);
    setForm({
      recipient_name: a.recipient_name, phone: formatPhone(a.phone), zip_code: formatZip(a.zip_code), state: a.state,
      city: a.city, neighborhood: a.neighborhood, street: a.street, number: a.number, complement: a.complement || '',
    });
    setIsDefault(a.is_default);
    setShowForm(true);
  };

  const clearOtherDefaults = async (keepId?: string) => {
    let q = supabase.from('addresses').update({ is_default: false }).eq('is_default', true);
    if (keepId) q = q.neq('id', keepId);
    await q;
  };

  const save = async () => {
    const parsed = addressSchema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    if (!resellerId) { toast.error('Cadastro de revendedor não encontrado'); return; }
    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase.from('addresses').update({ ...parsed.data, is_default: isDefault }).eq('id', editing.id);
        if (error) throw error;
        if (isDefault) await clearOtherDefaults(editing.id);
      } else {
        const { data, error } = await supabase.from('addresses')
          .insert({ ...parsed.data, reseller_id: resellerId, is_default: isDefault }).select('id').single();
        if (error) throw error;
        if (isDefault && data) await clearOtherDefaults(data.id);
      }
      toast.success('Endereço salvo');
      setShowForm(false);
      load();
    } catch (e) {
      console.error(e);
      toast.error('Erro ao salvar endereço');
    } finally { setSaving(false); }
  };

  const remove = async (a: Address) => {
    if (!confirm('Excluir este endereço?')) return;
    const { error } = await supabase.from('addresses').delete().eq('id', a.id);
    if (error) { toast.error('Erro ao excluir'); return; }
    toast.success('Endereço excluído');
    load();
  };

  const makeDefault = async (a: Address) => {
    await supabase.from('addresses').update({ is_default: true }).eq('id', a.id);
    await clearOtherDefaults(a.id);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Endereços</h1>
          <p className="mt-1 text-sm text-muted-foreground">Usados na entrega dos pedidos</p>
        </div>
        <Button onClick={openNew} className="h-11"><Plus className="mr-2 h-4 w-4" />Novo</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : addresses.length === 0 ? (
        <EmptyState icon={MapPin} title="Nenhum endereço" description="Cadastre um endereço para agilizar suas compras."
          action={<Button onClick={openNew}>Cadastrar endereço</Button>} />
      ) : (
        <div className="space-y-3">
          {addresses.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 text-sm">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {a.recipient_name}
                    {a.is_default && <Badge variant="outline" className="border-primary/40 text-primary">Padrão</Badge>}
                  </p>
                  <p className="mt-1 text-muted-foreground">{a.street}, {a.number}{a.complement ? ` – ${a.complement}` : ''} · {a.neighborhood}</p>
                  <p className="text-muted-foreground">{a.city}/{a.state} · CEP {formatZip(a.zip_code)}</p>
                  <p className="text-xs text-muted-foreground">{formatPhone(a.phone)}</p>
                </div>
                <div className="flex flex-shrink-0">
                  {!a.is_default && (
                    <Button size="icon" variant="ghost" className="h-10 w-10" onClick={() => makeDefault(a)} aria-label="Tornar padrão"><Star className="h-4 w-4" /></Button>
                  )}
                  <Button size="icon" variant="ghost" className="h-10 w-10" onClick={() => openEdit(a)} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-10 w-10 hover:text-destructive" onClick={() => remove(a)} aria-label="Excluir"><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={() => setShowForm(false)}>
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/[0.08] bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{editing ? 'Editar endereço' : 'Novo endereço'}</h2>
              <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setShowForm(false)}><X className="h-4 w-4" /></Button>
            </div>
            <AddressForm value={form} onChange={setForm} disabled={saving} />
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="h-4 w-4 accent-[#8B5CF6]" />
              Definir como endereço padrão
            </label>
            <Button onClick={save} disabled={saving} className="mt-4 h-12 w-full">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar endereço'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
