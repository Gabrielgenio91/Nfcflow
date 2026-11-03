'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useStoreSettings, invalidateStoreSettings } from '@/hooks/use-store-settings';

export default function PromotionsPage() {
  const supabase = useMemo(() => createClient(), []);
  const settings = useStoreSettings();
  const [active, setActive] = useState(false);       // promo_active
  const [minQty, setMinQty] = useState('250');       // promo_min_qty
  const [text, setText] = useState('');              // promo_text
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings.loaded) {
      setActive(settings.freeShippingEnabled);
      setMinQty(String(settings.freeShippingMinQuantity));
      setText(settings.promoText);
    }
  }, [settings.loaded, settings.freeShippingEnabled, settings.freeShippingMinQuantity, settings.promoText]);

  const save = async () => {
    const q = parseInt(minQty, 10);
    if (!Number.isInteger(q) || q < 1) { toast.error('Informe uma quantidade mínima válida'); return; }
    setSaving(true);
    const { error } = await supabase.rpc('admin_set_promo', { p_active: active, p_min_qty: q, p_text: text });
    setSaving(false);
    if (error) { toast.error(error.message.includes('TEXT_TOO_LONG') ? 'Texto muito longo (máx. 300).' : 'Erro ao salvar a promoção'); return; }
    invalidateStoreSettings();
    await settings.reload();
    toast.success('Promoção salva');
  };

  if (!settings.loaded) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Promoções</h1>
        <p className="mt-1 text-sm text-muted-foreground">Configurações da loja. A regra fica no banco (store_settings) e é validada no servidor em cada pedido.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Truck className="h-4 w-4" /> Frete grátis por quantidade</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/[0.08] p-4">
            <span className="text-sm font-medium">{active ? 'Promoção ativada' : 'Promoção desativada'}</span>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-5 w-5 accent-[#8B5CF6]" />
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="min">Quantidade mínima de placas</Label>
            <Input id="min" type="number" inputMode="numeric" min={1} value={minQty} onChange={(e) => setMinQty(e.target.value)} className="h-12" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="txt">Texto do banner</Label>
            <Textarea id="txt" value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={300}
              placeholder="FRETE GRÁTIS para todo Brasil acima de 250 plaquinhas! Chamar no suporte" />
            <p className="text-xs text-muted-foreground">Aparece no painel do revendedor e na loja, com o botão “Chamar no suporte” (WhatsApp configurado em Suporte).</p>
          </div>
          <Button onClick={save} disabled={saving} className="h-12 w-full">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar promoção'}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
