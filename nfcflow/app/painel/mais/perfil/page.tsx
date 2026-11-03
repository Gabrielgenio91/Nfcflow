'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import type { Reseller } from '@/lib/types';

export default function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth();
  const supabase = createClient();
  const [reseller, setReseller] = useState<Reseller | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    document: '',
    address: '',
  });

  useEffect(() => {
    if (!user) return;
    supabase
      .from('resellers')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error('Error:', error);
          setLoading(false);
          return;
        }
        const r = data as Reseller | null;
        setReseller(r);
        if (r) {
          setForm({
            full_name: r.full_name,
            phone: r.phone || '',
            document: r.document || '',
            address: r.address || '',
          });
        }
        setLoading(false);
      });
  }, [user, supabase]);

  const save = async () => {
    if (!reseller || !user) return;
    setSaving(true);
    try {
      const { error: rError } = await supabase.rpc('update_my_reseller_profile', {
        p_full_name: form.full_name.trim(),
        p_phone: form.phone.trim() || null,
        p_document: form.document.trim() || null,
        p_address: form.address.trim() || null,
      });
      if (rError) throw rError;

      const { error: pError } = await supabase
        .from('profiles')
        .update({ full_name: form.full_name.trim(), phone: form.phone.trim() || null })
        .eq('id', user.id);
      if (pError) throw pError;

      await refreshProfile();
      toast.success('Perfil atualizado!');
    } catch (err) {
      console.error('Error:', err);
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const initials = (form.full_name || profile?.full_name || '?')
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Perfil</h1>
        <p className="mt-1 text-sm text-muted-foreground">Seus dados de revendedor</p>
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-16 w-16 border border-border">
            <AvatarFallback className="bg-primary/10 text-lg text-primary">{initials}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">{user?.email}</p>
            <p className="text-sm text-muted-foreground">
              {reseller?.status === 'ATIVO' ? 'Conta ativa' : 'Conta bloqueada'}
            </p>
            {reseller?.created_at && (
              <p className="text-xs text-muted-foreground">
                Cadastro em {new Date(reseller.created_at).toLocaleDateString('pt-BR')}
              </p>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados pessoais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Nome completo</Label>
            <Input
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
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
            <Label>Documento (CPF/CNPJ)</Label>
            <Input
              value={form.document}
              onChange={(e) => setForm({ ...form, document: e.target.value })}
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label>Endereço</Label>
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="h-11"
            />
          </div>
          <Button onClick={save} disabled={saving} className="h-11 w-full gradient-primary text-primary-foreground hover:opacity-90">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salvar alterações
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
