'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Keyboard, Loader2, ScanLine } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { QrScanner } from '@/components/shared/qr-scanner';
import { extractToken } from '@/lib/qr';

export default function AtivarPage() {
  const { user } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [token, setToken] = useState('');
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [telefoneOpcional, setTelefoneOpcional] = useState('');
  const [destino, setDestino] = useState('');
  const [valor, setValor] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'scan' | 'manual'>('manual');
  const [scanned, setScanned] = useState<string | null>(null);

  const lookupToken = async (cleanToken: string) => {
    const { data: lookup, error: lookupErr } = await supabase.rpc('lookup_plaque_for_activation', { p_token: cleanToken });
    if (lookupErr) throw lookupErr;
    const row = Array.isArray(lookup)? lookup[0] : lookup;
    if (!row || row.result === 'NOT_FOUND') throw new Error('Token não encontrado');
    if (row.result === 'NOT_YOURS') throw new Error('Essa plaquinha já pertence a outro revendedor');
    if (row.result === 'ACTIVE') throw new Error('Essa placa já está ativa');
    if (row.result === 'INACTIVE') throw new Error('Essa placa está inativa');
    return row;
  };

  const handleScan = async (text: string) => {
    const t = extractToken(text);
    if (!t) { toast.error('QR Code inválido para uma plaquinha NFCFLOW'); setMode('manual'); return; }
    setToken(t);
    setScanned(t);
    setMode('manual');
    try {
      await lookupToken(t);
      toast.success(`Plaquinha ${t} identificada`);
    } catch (e: any) {
      toast.error(e.message || 'Não foi possível validar a plaquinha');
    }
  };

  // Vindo do QR (/q/TOKEN -> ...?token=TOKEN): preenche e valida o token. Só lê; a ativação continua exigindo login e a RPC valida o dono.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('token');
    const t = fromUrl ? extractToken(fromUrl) : null;
    if (t) handleScan(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAtivar = async () => {
    if (!token ||!nome ||!telefone ||!destino ||!valor) {
      toast.error('Preencha nome, telefone, destino e valor');
      return;
    }
    setLoading(true);
    try {
      const cleanToken = extractToken(token)?? token.trim().toUpperCase().split('|')[0].trim().split(' ')[0].trim();
      const row = await lookupToken(cleanToken);
      const plaqueId = row.plaque_id;

      let v = valor.trim().replace(/R\$\s?/gi, '').trim();
      if (v.includes(',')) {
        v = v.replace(/\./g, '').replace(',', '.');
      }
      const sale = Number(v.replace(/[^0-9.]/g, ''));
      if (!sale || isNaN(sale) || sale <= 0 || sale > 100000) throw new Error('Valor inválido (0 a 100.000)');

      let url = destino.trim();
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

      // Limpa telefones só números
      const phoneMain = telefone.trim().replace(/\D/g, '');
      const phoneOpt = telefoneOpcional.trim().replace(/\D/g, '') || null;

      // 1. Ativa com nome + telefone principal
      const { error: actErr } = await supabase.rpc('activate_plaque', {
        p_plaque_id: plaqueId,
        p_customer_id: null,
        p_new_establishment: nome.trim(),
        p_new_phone: phoneMain,
        p_destination_url: url,
        p_sale_value: sale,
      });

      if (actErr) {
        if (actErr.message.includes('PLAQUE_TAKEN')) throw new Error('Alguém ativou essa placa antes de você');
        if (actErr.message.includes('ALREADY_ACTIVATED')) throw new Error('Essa placa já foi ativada');
        throw actErr;
      }

      // 2. Se tiver opcional, salva no customer / qr_destination que foi criado
      // A sua RPC cria o customer, então vamos atualizar ele
      if (phoneOpt) {
        // tenta achar o customer recém criado pelo plaque_id
        const { data: plaqueData } = await supabase.from('plaques').select('customer_id').eq('id', plaqueId).single();
        if (plaqueData?.customer_id) {
          await supabase.from('customers').update({
            phone_optional: phoneOpt,
            phone: phoneMain,
            establishment_name: nome.trim()
          }).eq('id', plaqueData.customer_id);
        }
      }

      toast.success(`Ativada! R$ ${sale.toLocaleString('pt-BR')} - ${nome.trim()}`);
      router.push('/painel/plaquinhas');
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'Erro ao ativar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-6 p-4">
      <h1 className="text-xl font-bold">Ativar Plaquinha</h1>
      <Card className="space-y-4 p-4">
        {mode === 'scan'? (
          <div className="space-y-3">
            <QrScanner active onResult={handleScan} />
            <p className="text-center text-sm text-muted-foreground">Aponte a câmera para o QR Code da plaquinha.</p>
            <Button type="button" variant="outline" className="h-12 w-full" onClick={() => setMode('manual')}><Keyboard className="mr-2 h-4 w-4" />Digitar o token manualmente</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Token *</Label><Input value={token} onChange={e=>{ setToken(e.target.value); setScanned(null); }} placeholder="AFDFB16423" className="h-12 uppercase" autoCapitalize="characters" />
              {scanned && <p className="text-xs text-green-600">Lido pela câmera: {scanned}</p>}</div>
            <Button type="button" variant="outline" className="h-12 w-full" onClick={() => setMode('scan')}><ScanLine className="mr-2 h-4 w-4" />Escanear placa com a câmera</Button>
          </div>
        )}
        <div className="space-y-1.5"><Label>Nome do estabelecimento *</Label><Input value={nome} onChange={e=>setNome(e.target.value)} placeholder="Ex: Bar do João" className="h-12" /></div>
        <div className="space-y-1.5"><Label>Telefone / WhatsApp *</Label><Input value={telefone} onChange={e=>setTelefone(e.target.value)} placeholder="(11) 99999-9999" className="h-12" /></div>
        <div className="space-y-1.5"><Label>Telefone opcional</Label><Input value={telefoneOpcional} onChange={e=>setTelefoneOpcional(e.target.value)} placeholder="(11) 99999-9999 (opcional)" className="h-12" /></div>
        <div className="space-y-1.5"><Label>Destino https:// *</Label><Input value={destino} onChange={e=>setDestino(e.target.value)} placeholder="https://instagram.com/empresa" className="h-12" /></div>
        <div className="space-y-1.5"><Label>Valor vendido R$ *</Label><Input value={valor} onChange={e=>setValor(e.target.value)} placeholder="20000" className="h-12" inputMode="decimal" /></div>
        <Button onClick={handleAtivar} disabled={loading} className="h-12 w-full">{loading? <Loader2 className="h-4 w-4 animate-spin" /> : 'Ativar'}</Button>
      </Card>
    </div>
  );
    }
