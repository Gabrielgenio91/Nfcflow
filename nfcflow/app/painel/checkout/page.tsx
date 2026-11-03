'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Loader2, MapPin, QrCode, Truck, Clock, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/shared/empty-state';
import { AddressForm, EMPTY_ADDRESS, type AddressFields } from '@/components/store/address-form';
import { PixPayment } from '@/components/store/pix-payment';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { useCatalog } from '@/hooks/use-catalog';
import { useCart } from '@/components/providers/cart-provider';
import { addressSchema } from '@/lib/schemas';
import { formatBRL, round2 } from '@/lib/money';
import { lineTotal, unitPriceFor } from '@/lib/pricing';
import { formatOrderNumber } from '@/lib/orders';
import { cn } from '@/lib/utils';
import type { Address } from '@/lib/types';

type Step = 1 | 2 | 3 | 4 | 5;
const STEPS = ['Carrinho', 'Endereço', 'Frete', 'Pagamento', 'Confirmação'];

interface ShippingOption { code: string; name: string; price: number; days: number | null; isEstimate: boolean }
interface Quote { configured: boolean; options: ShippingOption[]; message?: string }
interface Created {
  order_id: string; order_number: number; total: number;
  payment: { method: string; qr_code: string | null; qr_code_base64: string | null; ticket_url: string | null; expires_at: string | null };
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || 'Erro na requisição');
  return data as T;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { products, loading } = useCatalog();
  const { items, clear } = useCart();
  const supabase = useMemo(() => createClient(), []);

  const [step, setStep] = useState<Step>(1);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addrLoading, setAddrLoading] = useState(true);
  const [addressId, setAddressId] = useState<string>('new');
  const [form, setForm] = useState<AddressFields>(EMPTY_ADDRESS);
  const [saveAddress, setSaveAddress] = useState(true);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [shippingCode, setShippingCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [paid, setPaid] = useState<'pending' | 'paid' | 'cancelled'>('pending');
  const itemsSnapshot = useRef(items);

  const lines = useMemo(
    () => items.map((l) => ({ line: l, product: products.find((p) => p.product_id === l.product_id) })).filter((x) => x.product),
    [items, products]
  );
  const subtotal = round2(lines.reduce((s, { line, product }) => s + (lineTotal(product!.tiers, line.quantity) ?? 0), 0));
  const units = lines.reduce((s, { line }) => s + line.quantity, 0);
  const shipping = quote?.options.find((o) => o.code === shippingCode) || null;
  const total = round2(subtotal + (shipping?.price ?? 0));

  const selectedAddress = addresses.find((a) => a.id === addressId);
  const zip = (selectedAddress ? selectedAddress.zip_code : form.zip_code).replace(/\D/g, '');

  useEffect(() => {
    if (!user) return;
    supabase.from('addresses').select('*').order('is_default', { ascending: false }).order('created_at', { ascending: false })
      .then(({ data }) => {
        const list = (data as Address[]) || [];
        setAddresses(list);
        if (list.length) setAddressId(list[0].id);
        setAddrLoading(false);
      });
  }, [user, supabase]);

  // Invalida o frete se o endereço mudar
  useEffect(() => { setQuote(null); setShippingCode(''); }, [zip]);

  const validateAddress = (): boolean => {
    if (addressId !== 'new') return true;
    const r = addressSchema.safeParse(form);
    if (!r.success) { toast.error(r.error.issues[0].message); return false; }
    return true;
  };

  const fetchQuote = useCallback(async () => {
    setQuoting(true);
    try {
      const q = await api<Quote>('/api/shipping/quote', {
        method: 'POST',
        body: JSON.stringify({ zip_code: zip, items: items.map((l) => ({ product_id: l.product_id, quantity: l.quantity })) }),
      });
      // defesa: nunca renderizar duas opções com o mesmo código (rádio = só uma modalidade)
      const seen = new Set<string>();
      const options = q.options.filter((o) => (seen.has(o.code) ? false : (seen.add(o.code), true)));
      setQuote({ ...q, options });
      setShippingCode(options[0]?.code || '');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao calcular frete');
    } finally {
      setQuoting(false);
    }
  }, [zip, items]);

  const goStep = async (next: Step) => {
    if (next === 3 && step === 2) {
      if (!validateAddress()) return;
      setStep(3);
      if (!quote) await fetchQuote();
      return;
    }
    setStep(next);
  };

  const placeOrder = async () => {
    if (!shipping) { toast.error('Escolha o frete'); return; }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        items: items.map((l) => ({ product_id: l.product_id, quantity: l.quantity })),
        shipping_code: shipping.code,
      };
      if (addressId !== 'new') payload.address_id = addressId;
      else { payload.address = form; payload.save_address = saveAddress; }
      itemsSnapshot.current = items;
      const res = await api<Created>('/api/orders', { method: 'POST', body: JSON.stringify(payload) });
      setCreated(res);
      clear();
      setStep(5);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao criar o pedido');
    } finally {
      setSubmitting(false);
    }
  };

  // Aguarda a confirmação REAL (backend/webhook) — nunca pelo retorno do navegador
  useEffect(() => {
    if (!created || paid !== 'pending') return;
    let stop = false;
    const poll = async () => {
      try {
        const r = await api<{ status: string; paid: boolean }>(`/api/orders/${created.order_id}/status`);
        if (stop) return;
        if (r.status === 'CANCELADO') setPaid('cancelled');
        else if (r.paid) setPaid('paid');
      } catch { /* tenta de novo */ }
    };
    const id = setInterval(poll, 5000);
    return () => { stop = true; clearInterval(id); };
  }, [created, paid]);

  if (loading || addrLoading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  if (!created && lines.length === 0) {
    return <EmptyState title="Seu carrinho está vazio" description="Adicione produtos antes de finalizar."
      action={<Link href="/painel/comprar"><Button>Ir para a loja</Button></Link>} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Finalizar compra</h1>
        <ol className="mt-4 flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {STEPS.map((label, i) => {
            const n = (i + 1) as Step;
            return (
              <li key={label} className={cn('flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5',
                n === step ? 'border-primary/60 bg-primary/15 text-foreground' : n < step ? 'border-success/30 text-success' : 'border-white/[0.08] text-muted-foreground')}>
                <span className="font-semibold">{n}</span> {label}
              </li>
            );
          })}
        </ol>
      </div>

      {step === 1 && (
        <Card className="space-y-3 p-4">
          {lines.map(({ line, product }) => (
            <div key={line.product_id} className="flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{product!.name}</p>
                <p className="text-xs text-muted-foreground">{line.quantity} × {formatBRL(unitPriceFor(product!.tiers, line.quantity))}</p>
              </div>
              <p className="font-semibold">{formatBRL(lineTotal(product!.tiers, line.quantity))}</p>
            </div>
          ))}
          <div className="flex justify-between border-t border-white/[0.08] pt-3 font-bold"><span>Subtotal ({units} un.)</span><span>{formatBRL(subtotal)}</span></div>
          <div className="flex gap-2">
            <Link href="/painel/carrinho" className="flex-1"><Button variant="outline" className="h-12 w-full"><ArrowLeft className="mr-2 h-4 w-4" />Carrinho</Button></Link>
            <Button className="h-12 flex-1" onClick={() => setStep(2)}>Endereço <ArrowRight className="ml-2 h-4 w-4" /></Button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card className="space-y-4 p-4">
          <h2 className="flex items-center gap-2 font-semibold"><MapPin className="h-4 w-4" /> Endereço de entrega</h2>
          {addresses.length > 0 && (
            <div className="space-y-2">
              {addresses.map((a) => (
                <label key={a.id} className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm',
                  addressId === a.id ? 'border-primary/60 bg-primary/10' : 'border-white/[0.08]')}>
                  <input type="radio" name="addr" checked={addressId === a.id} onChange={() => setAddressId(a.id)} className="mt-1 h-4 w-4 accent-[#8B5CF6]" />
                  <span>
                    <span className="block font-medium">{a.recipient_name}</span>
                    <span className="block text-muted-foreground">{a.street}, {a.number}{a.complement ? ` – ${a.complement}` : ''} · {a.neighborhood}</span>
                    <span className="block text-muted-foreground">{a.city}/{a.state} · CEP {a.zip_code}</span>
                  </span>
                </label>
              ))}
              <label className={cn('flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm',
                addressId === 'new' ? 'border-primary/60 bg-primary/10' : 'border-white/[0.08]')}>
                <input type="radio" name="addr" checked={addressId === 'new'} onChange={() => setAddressId('new')} className="h-4 w-4 accent-[#8B5CF6]" />
                Usar outro endereço
              </label>
            </div>
          )}
          {addressId === 'new' && (
            <>
              <AddressForm value={form} onChange={setForm} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} className="h-4 w-4 accent-[#8B5CF6]" />
                Salvar este endereço para compras futuras
              </label>
            </>
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="h-12 flex-1" onClick={() => setStep(1)}><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Button>
            <Button className="h-12 flex-1" onClick={() => goStep(3)}>Calcular frete <ArrowRight className="ml-2 h-4 w-4" /></Button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card className="space-y-4 p-4">
          <h2 className="flex items-center gap-2 font-semibold"><Truck className="h-4 w-4" /> Frete — Correios</h2>
          {quoting && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Calculando frete…</div>}
          {quote && !quote.configured && (
            <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>Integração com os Correios ainda não configurada. O valor abaixo é provisório e pode ser ajustado pelo administrador.</span>
            </div>
          )}
          {quote?.options.map((o) => (
            <label key={o.code} className={cn('flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 text-sm',
              shippingCode === o.code ? 'border-primary/60 bg-primary/10' : 'border-white/[0.08]')}>
              <span className="flex items-center gap-3">
                <input type="radio" name="ship" checked={shippingCode === o.code} onChange={() => setShippingCode(o.code)} className="h-4 w-4 accent-[#8B5CF6]" />
                <span>
                  <span className="block font-medium">{o.name}</span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" /> {o.days != null ? `até ${o.days} dia(s) úteis` : 'prazo a confirmar'}
                  </span>
                </span>
              </span>
              <span className={cn('font-semibold', o.price === 0 && 'text-success')}>{o.price === 0 ? 'Grátis' : formatBRL(o.price)}</span>
            </label>
          ))}
          {!quoting && !quote && <Button variant="outline" onClick={fetchQuote} className="h-12 w-full">Tentar novamente</Button>}
          <div className="flex gap-2">
            <Button variant="outline" className="h-12 flex-1" onClick={() => setStep(2)}><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Button>
            <Button className="h-12 flex-1" disabled={!shipping} onClick={() => setStep(4)}>Pagamento <ArrowRight className="ml-2 h-4 w-4" /></Button>
          </div>
        </Card>
      )}

      {step === 4 && (
        <Card className="space-y-4 p-4">
          <h2 className="flex items-center gap-2 font-semibold"><Wallet className="h-4 w-4" /> Pagamento</h2>
          <div className="flex items-center gap-3 rounded-xl border border-primary/60 bg-primary/10 p-3 text-sm">
            <QrCode className="h-5 w-5" />
            <div><p className="font-medium">PIX</p><p className="text-xs text-muted-foreground">Aprovação em instantes após o pagamento.</p></div>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal ({units} un.)</span><span>{formatBRL(subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Frete ({shipping?.name})</span><span>{shipping && shipping.price === 0 ? 'Grátis' : formatBRL(shipping?.price)}</span></div>
            <div className="flex justify-between border-t border-white/[0.08] pt-3 text-base font-bold"><span>Total</span><span>{formatBRL(total)}</span></div>
          </div>
          <p className="text-xs text-muted-foreground">O valor final é confirmado pelo servidor ao gerar o PIX. Seu estoque fica reservado enquanto o pagamento não expira.</p>
          <div className="flex gap-2">
            <Button variant="outline" className="h-12 flex-1" onClick={() => setStep(3)} disabled={submitting}><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Button>
            <Button className="h-12 flex-[2]" onClick={placeOrder} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Gerar PIX e finalizar'}
            </Button>
          </div>
        </Card>
      )}

      {step === 5 && created && (
        <Card className="space-y-5 p-4 text-center sm:p-6">
          {paid === 'paid' ? (
            <div className="space-y-3">
              <CheckCircle2 className="mx-auto h-14 w-14 text-success" />
              <h2 className="text-xl font-bold">Pagamento confirmado!</h2>
              <p className="text-sm text-muted-foreground">Pedido {formatOrderNumber(created.order_number)} · {formatBRL(created.total)}</p>
            </div>
          ) : paid === 'cancelled' ? (
            <div className="space-y-3">
              <AlertTriangle className="mx-auto h-14 w-14 text-destructive" />
              <h2 className="text-xl font-bold">Pedido cancelado</h2>
              <p className="text-sm text-muted-foreground">O pagamento não foi concluído e o estoque foi liberado.</p>
              <Link href="/painel/comprar"><Button className="h-12">Voltar à loja</Button></Link>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold">Pedido {formatOrderNumber(created.order_number)} criado</h2>
                <p className="mt-1 text-sm text-muted-foreground">Pague {formatBRL(created.total)} via PIX para confirmar.</p>
              </div>
              <PixPayment qrCode={created.payment.qr_code} qrCodeBase64={created.payment.qr_code_base64}
                ticketUrl={created.payment.ticket_url} expiresAt={created.payment.expires_at} />
              <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Aguardando confirmação do pagamento…
              </p>
            </div>
          )}
          <Button variant="outline" className="h-12 w-full" onClick={() => router.push(`/painel/mais/pedidos/${created.order_id}`)}>
            Ver detalhes do pedido
          </Button>
        </Card>
      )}
    </div>
  );
}
