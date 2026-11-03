'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import type { Customer } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/shared/empty-state';
import { Store, Plus, Loader2, Pencil, Trash2, X, Phone, Mail, MapPin, Search, QrCode, Eye } from 'lucide-react';
import { toast } from 'sonner';

export default function ResellerCustomersPage() {
  const { user } = useAuth();
  const supabase = createClient();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plaqueCounts, setPlaqueCounts] = useState<Record<string, number>>({});
  const [scanCounts, setScanCounts] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    establishment_name: '',
    phone: '',
    email: '',
    address: '',
    notes: '',
  });

  const fetchCustomers = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setCustomers((data as Customer[]) || []);
      // RLS: só as plaquinhas deste revendedor. scan_count = leituras do QR de cada plaquinha
      const { data: pl } = await supabase.from('plaques').select('customer_id, scan_count').not('customer_id', 'is', null);
      const counts: Record<string, number> = {};
      const scans: Record<string, number> = {};
      (pl || []).forEach((x: { customer_id: string | null; scan_count: number | null }) => {
        if (x.customer_id) {
          counts[x.customer_id] = (counts[x.customer_id] || 0) + 1;
          scans[x.customer_id] = (scans[x.customer_id] || 0) + (x.scan_count || 0);
        }
      });
      setPlaqueCounts(counts);
      setScanCounts(scans);
    } catch (err) {
      console.error('Error:', err);
      toast.error('Erro ao carregar clientes');
    } finally {
      setLoading(false);
    }
  }, [user, supabase]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const openNew = () => {
    setEditing(null);
    setForm({ establishment_name: '', phone: '', email: '', address: '', notes: '' });
    setShowForm(true);
  };

  const openEdit = (customer: Customer) => {
    setEditing(customer);
    setForm({
      establishment_name: customer.establishment_name,
      phone: customer.phone || '',
      email: customer.email || '',
      address: customer.address || '',
      notes: customer.notes || '',
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.establishment_name.trim()) {
      toast.error('Nome do estabelecimento é obrigatório');
      return;
    }
    setSaving(true);
    try {
      const data = {
        establishment_name: form.establishment_name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
      };

      if (editing) {
        const { error } = await supabase.from('customers').update(data).eq('id', editing.id);
        if (error) throw error;
        toast.success('Cliente atualizado!');
      } else {
        const { data: resellerData } = await supabase
          .from('resellers')
          .select('id')
          .eq('user_id', user!.id)
          .maybeSingle();
        if (!resellerData) throw new Error('Revendedor não encontrado');
        const { error } = await supabase.from('customers').insert({
          ...data,
          reseller_id: resellerData.id,
        });
        if (error) throw error;
        toast.success('Cliente cadastrado!');
      }
      setShowForm(false);
      fetchCustomers();
    } catch (err) {
      console.error('Error:', err);
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (customer: Customer) => {
    const n = plaqueCounts[customer.id] || 0;
    const warn = n > 0 ? `\n\nAtenção: ${n} plaquinha(s) estão associadas a este cliente e ficarão sem cliente.` : '';
    if (!confirm(`Excluir o cliente "${customer.establishment_name}"?${warn}`)) return;
    const { error } = await supabase.from('customers').delete().eq('id', customer.id);
    if (error) {
      toast.error('Erro ao excluir');
      return;
    }
    toast.success('Cliente excluído');
    fetchCustomers();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
          <p className="mt-1 text-sm text-muted-foreground">Gerencie seus clientes</p>
        </div>
        <Button onClick={openNew} className="gradient-primary text-primary-foreground hover:opacity-90">
          <Plus className="mr-2 h-4 w-4" />
          Novo
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar por nome, telefone ou e-mail" value={search} onChange={(e) => setSearch(e.target.value)} className="h-12 pl-10" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : customers.length === 0 ? (
        <EmptyState
          icon={Store}
          title="Nenhum cliente"
          description="Cadastre seus clientes para associá-los às plaquinhas"
          action={
            <Button onClick={openNew} className="gradient-primary text-primary-foreground hover:opacity-90">
              <Plus className="mr-2 h-4 w-4" />
              Cadastrar cliente
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {customers.filter((c) => {
            const q = search.trim().toLowerCase();
            return !q || c.establishment_name.toLowerCase().includes(q) || (c.phone || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q);
          }).map((customer) => (
            <Card key={customer.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-medium">{customer.establishment_name}</h3>
                  {customer.phone && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3" /> {customer.phone}
                    </p>
                  )}
                  {customer.email && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <Mail className="h-3 w-3" /> {customer.email}
                    </p>
                  )}
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <QrCode className="h-3 w-3" /> {plaqueCounts[customer.id] || 0} plaquinha(s) · cadastrado em {new Date(customer.created_at).toLocaleDateString('pt-BR')}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <Eye className="h-3 w-3" /> {scanCounts[customer.id] || 0} scan(s)
                  </p>
                  {customer.notes && <p className="mt-1 line-clamp-2 text-xs italic text-muted-foreground">{customer.notes}</p>}
                  {customer.address && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" /> {customer.address}
                    </p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(customer)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => remove(customer)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-md rounded-t-2xl bg-card p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editing ? 'Editar Cliente' : 'Novo Cliente'}
              </h2>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowForm(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome do estabelecimento *</Label>
                <Input
                  value={form.establishment_name}
                  onChange={(e) => setForm({ ...form, establishment_name: e.target.value })}
                  placeholder="Ex: Padaria São João"
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="(00) 00000-0000"
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="email@empresa.com"
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label>Endereço</Label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Rua, número, cidade..."
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Notas sobre o cliente..."
                  rows={2}
                />
              </div>
              <Button onClick={save} disabled={saving} className="h-11 w-full gradient-primary text-primary-foreground hover:opacity-90">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
