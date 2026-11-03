'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, KeyRound, Link2, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getPublicAppUrl } from '@/lib/app-url';

export default function SignupCodePage() {
  const supabase = useMemo(() => createClient(), []);
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_get_signup_code');
    if (error) toast.error('Não foi possível carregar o código');
    setCode((data as string) || null);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const link = code ? `${getPublicAppUrl()}/cadastro?codigo=${code}` : '';

  const copy = async (what: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(what === 'code' ? code! : link);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch { toast.error('Não foi possível copiar'); }
  };

  const reset = async () => {
    if (!confirm('Redefinir o código? O código e o link atuais deixam de funcionar IMEDIATAMENTE para novos cadastros. Quem já tem conta não é afetado.')) return;
    setResetting(true);
    const { data, error } = await supabase.rpc('admin_reset_signup_code');
    setResetting(false);
    if (error) { toast.error('Erro ao redefinir o código'); return; }
    setCode(data as string);
    toast.success('Novo código gerado. O anterior foi invalidado.');
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Código de Indicação</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Código global: libera o cadastro de novos revendedores enquanto estiver ativo. Ao redefinir, o anterior para de funcionar.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4" /> Código atual</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 text-center">
            <p className="break-all font-mono text-2xl font-bold tracking-widest sm:text-3xl">{code}</p>
          </div>
          <Button variant="outline" className="h-12 w-full" onClick={() => copy('code')}>
            {copied === 'code' ? <Check className="mr-2 h-4 w-4 text-success" /> : <Copy className="mr-2 h-4 w-4" />}
            {copied === 'code' ? 'Código copiado!' : 'Copiar código'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Link2 className="h-4 w-4" /> Link de convite</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="break-all rounded-xl bg-white/[0.04] p-3 font-mono text-xs">{link}</p>
          <p className="text-xs text-muted-foreground">Abre a tela de cadastro com o código já preenchido.</p>
          {!process.env.NEXT_PUBLIC_APP_URL && (
            <p className="text-xs text-warning">NEXT_PUBLIC_APP_URL não está configurada: o link usa o endereço atual do navegador.</p>
          )}
          <Button className="h-12 w-full" onClick={() => copy('link')}>
            {copied === 'link' ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
            {copied === 'link' ? 'Link copiado!' : 'Copiar link de convite'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="text-sm text-muted-foreground">Gera um novo código aleatório e invalida o atual na hora. Usuários já cadastrados continuam funcionando normalmente.</p>
          <Button variant="outline" className="h-12 w-full text-destructive" onClick={reset} disabled={resetting}>
            {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><RefreshCw className="mr-2 h-4 w-4" />Redefinir código</>}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
