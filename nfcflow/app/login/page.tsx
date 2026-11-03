'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/providers/auth-provider';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, AlertCircle, Eye, EyeOff, Mail, Lock, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { AuthShell } from '@/components/shell/auth-shell';
import { isOwner } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && user && profile) {
      if (isOwner(user) || profile.role === 'admin') {
        router.replace('/admin');
      } else {
        router.replace('/painel');
      }
    }
  }, [user, profile, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) throw signInError;
      if (!data.user) throw new Error('Falha ao entrar');

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profileData) {
        if (isOwner(data.user)) {
          const { error: insertError } = await supabase
            .from('profiles')
            .insert({
              id: data.user.id,
              full_name: data.user.email,
              email: data.user.email,
              role: 'admin',
              is_active: true
            });
          
          if (insertError) console.error('Erro ao criar perfil', insertError);
          
          toast.success('Login de proprietário!');
          router.replace('/admin');
          return;
        }
        throw new Error('Perfil não encontrado. Contate o administrador.');
      }

      if (!profileData.is_active) {
        await supabase.auth.signOut();
        throw new Error('Sua conta está inativa. Contate o administrador.');
      }

      toast.success('Login realizado com sucesso!');
      if (isOwner(data.user) || profileData.role === 'admin') {
        router.replace('/admin');
      } else {
        router.replace('/painel');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao fazer login';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell tagline="Gestão de Plaquinhas com QR Code">
      <h2 className="mb-1 text-2xl font-bold tracking-tight">Entrar</h2>
      <p className="mb-6 text-sm text-[#b7b2cc]">Acesse sua conta para continuar</p>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-[#d9d4ee]">E-mail</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8c86a6]" />
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" required disabled={loading} autoComplete="email" className="nx-field pl-10" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="password" className="text-[#d9d4ee]">Senha</Label>
            <Link href="/recuperar-senha" className="text-xs font-medium text-[#a98bff] transition-colors hover:text-white">Esqueceu sua senha?</Link>
          </div>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8c86a6]" />
            <Input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Sua senha" required disabled={loading} autoComplete="current-password" className="nx-field px-10" />
            <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8c86a6] transition-colors hover:text-white">
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <Button type="submit" disabled={loading} className="nx-btn h-12 w-full rounded-xl text-base">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (<>Entrar <ArrowRight className="ml-2 h-4 w-4" /></>)}
        </Button>
      </form>

      <div className="mt-6 border-t border-white/[0.07] pt-5 text-center text-sm text-[#b7b2cc]">
        Não tem conta? <Link href="/cadastro" className="font-semibold text-[#a98bff] transition-colors hover:text-white">Cadastre-se</Link>
      </div>
    </AuthShell>
  );
}
