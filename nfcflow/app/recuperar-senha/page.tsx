'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, AlertCircle, ArrowLeft, ArrowRight, Mail, MailCheck } from 'lucide-react';
import { toast } from 'sonner';
import { getPublicAppUrl } from '@/lib/app-url';
import { AuthShell } from '@/components/shell/auth-shell';

export default function RecoverPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${getPublicAppUrl()}/login`,
      });

      if (resetError) throw resetError;
      setSent(true);
      toast.success('E-mail de recuperação enviado!');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar e-mail';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell tagline="Recuperar senha">
      {sent ? (
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-success/30 bg-success/10 shadow-[0_0_30px_-8px_hsl(var(--success))]">
            <MailCheck className="h-7 w-7 text-success" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Verifique seu e-mail</h2>
            <p className="mt-1 text-sm text-[#b7b2cc]">
              Enviamos um link de recuperação para <strong className="break-all text-white">{email}</strong>.
              Clique no link para redefinir sua senha.
            </p>
          </div>
          <Link href="/login" className="mt-2">
            <Button variant="outline" className="h-11 rounded-xl border-[rgba(139,92,246,0.35)] bg-white/[0.03] hover:border-[rgba(169,139,255,0.7)] hover:bg-[rgba(123,77,255,0.15)] hover:text-white">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar ao login
            </Button>
          </Link>
        </div>
      ) : (
        <>
          <h2 className="mb-1 text-2xl font-bold tracking-tight">Esqueceu sua senha?</h2>
          <p className="mb-6 text-sm text-[#b7b2cc]">
            Digite seu e-mail e enviaremos um link para redefinir sua senha
          </p>

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
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  disabled={loading}
                  autoComplete="email"
                  className="nx-field pl-10"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="nx-btn h-12 w-full rounded-xl text-base"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (<>Enviar link <ArrowRight className="ml-2 h-4 w-4" /></>)}
            </Button>
          </form>

          <div className="mt-6 border-t border-white/[0.07] pt-5 text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-sm font-medium text-[#a98bff] transition-colors hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar ao login
            </Link>
          </div>
        </>
      )}
    </AuthShell>
  );
}
