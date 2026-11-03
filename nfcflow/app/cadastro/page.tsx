'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Lock, Mail, ShieldAlert, User } from 'lucide-react';
import { toast } from 'sonner';
import { isOwner } from '@/lib/auth';
import { useAuth } from '@/components/providers/auth-provider';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthShell } from '@/components/shell/auth-shell';
import { WhatsAppButton } from '@/components/shared/whatsapp';

type CodeState = 'empty' | 'checking' | 'valid' | 'invalid';

function CadastroForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, profile, loading: authLoading } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [code, setCode] = useState((params?.get('codigo') || '').toUpperCase());
  const [codeState, setCodeState] = useState<CodeState>(code ? 'checking' : 'empty');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && user && profile) {
      router.replace(profile.role === 'admin' || isOwner(user) ? '/admin' : '/painel');
    }
  }, [user, profile, authLoading, router]);

  // Validação no banco (a mesma regra é reforçada por trigger no momento do cadastro)
  useEffect(() => {
    const c = code.trim();
    if (!c) { setCodeState('empty'); return; }
    setCodeState('checking');
    let alive = true;
    const t = setTimeout(async () => {
      const { data, error: err } = await supabase.rpc('validate_signup_code', { p_code: c });
      if (!alive) return;
      setCodeState(!err && data === true ? 'valid' : 'invalid');
    }, 400);
    return () => { alive = false; clearTimeout(t); };
  }, [code, supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (codeState !== 'valid') { setError('Informe um código de indicação válido.'); return; }
    if (fullName.trim().length < 2) { setError('Informe seu nome.'); return; }
    if (password.length < 6) { setError('A senha deve ter no mínimo 6 caracteres'); return; }

    setLoading(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: fullName.trim(), signup_code: code.trim().toUpperCase() } },
      });
      if (signUpError) throw signUpError;
      if (!data.user) throw new Error('Falha ao cadastrar');
      toast.success('Cadastro realizado! Verifique seu e-mail se necessário.');
      router.push('/login');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao cadastrar';
      if (/database error|signup_code|INVALID_SIGNUP_CODE/i.test(msg)) {
        // o banco recusou: o código foi redefinido/está inválido
        setCodeState('invalid');
        setError('Código de indicação inválido ou expirado. Peça o código atual ao suporte.');
      } else if (/already registered|already been registered/i.test(msg)) {
        setError('Este e-mail já está cadastrado. Faça login.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const needsCode = codeState === 'empty' || codeState === 'invalid';

  return (
    <AuthShell tagline="Crie sua conta de revendedor">
      <h2 className="mb-1 text-2xl font-bold tracking-tight">Cadastrar</h2>
      <p className="mb-6 text-sm text-[#b7b2cc]">O cadastro é liberado com um código de indicação.</p>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" /><span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="code" className="flex items-center gap-1.5 text-[#d9d4ee]"><KeyRound className="h-3.5 w-3.5 text-[#a98bff]" /> Código de indicação</Label>
          <div className="relative">
            <Input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ''))}
              placeholder="Ex.: A1B2C3D4E5F6" autoCapitalize="characters" autoComplete="off" disabled={loading}
              className="nx-field pr-10 font-mono tracking-wider" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              {codeState === 'checking' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              {codeState === 'valid' && <CheckCircle2 className="h-4 w-4 text-success" />}
              {codeState === 'invalid' && <AlertCircle className="h-4 w-4 text-destructive" />}
            </span>
          </div>
          {codeState === 'valid' && <p className="text-xs text-success">Código válido.</p>}
          {codeState === 'invalid' && <p className="text-xs text-destructive">Código inválido ou expirado.</p>}
        </div>

        {needsCode && (
          <div className="space-y-3 rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm">
            <p className="flex items-start gap-2 text-warning">
              <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>Para criar uma conta é necessário um <strong>código de indicação</strong> válido. Fale com o nosso suporte para receber o seu.</span>
            </p>
            <WhatsAppButton message="Olá! Quero me cadastrar no NFCFLOW e preciso de um código de indicação.">
              Pedir meu código no WhatsApp
            </WhatsAppButton>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="fullName" className="text-[#d9d4ee]">Nome</Label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8c86a6]" />
            <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Seu nome" required autoComplete="name" disabled={loading || needsCode} className="nx-field pl-10" />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email" className="text-[#d9d4ee]">E-mail</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8c86a6]" />
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" required autoComplete="email" disabled={loading || needsCode} className="nx-field pl-10" />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password" className="text-[#d9d4ee]">Senha</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8c86a6]" />
            <Input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" required autoComplete="new-password" disabled={loading || needsCode} className="nx-field px-10" />
            <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label="Mostrar senha"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8c86a6] transition-colors hover:text-white">
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <Button type="submit" disabled={loading || codeState !== 'valid'} className="nx-btn h-12 w-full rounded-xl text-base">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (<>Confirmar cadastro <ArrowRight className="ml-2 h-4 w-4" /></>)}
        </Button>
      </form>

      <div className="mt-6 border-t border-white/[0.07] pt-5 text-center text-sm text-[#b7b2cc]">
        Já tem conta? <Link href="/login" className="font-semibold text-[#a98bff] transition-colors hover:text-white">Entrar</Link>
      </div>
    </AuthShell>
  );
}

export default function CadastroPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
      <CadastroForm />
    </Suspense>
  );
}
