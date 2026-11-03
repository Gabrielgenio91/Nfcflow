'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/auth-provider';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { ProductPhotoUpload } from '@/components/admin/product-photo-upload';

export default function NewProductPage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '', description: '', photo_url: '', product_type: 'instagram',
    width: '', height: '', unit: 'cm', status: 'ATIVO',
    unit_price: '15', available: '100', min_order_qty: '5', max_order_qty: '100',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const price = parseFloat(String(form.unit_price).replace(',', '.'));
      if (!form.name.trim()) throw new Error('Nome obrigatório');
      if (!Number.isFinite(price) || price <= 0) throw new Error('Preço inválido');
      const { data: prod, error } = await supabase.from('products').insert({
        name: form.name.trim(), description: form.description.trim() || null,
        photo_url: form.photo_url.trim() || null, product_type: form.product_type,
        width: form.width ? parseFloat(form.width) : null, height: form.height ? parseFloat(form.height) : null,
        unit: form.unit, status: form.status, created_by: user?.id || null,
        min_order_qty: parseInt(form.min_order_qty) || 5,
        max_order_qty: parseInt(form.max_order_qty) || 100,
      }).select('id').single();
      if (error) throw error;
      // preço = faixa de preço (mesma fonte da loja e do create_order); estoque = estoque central
      const { error: tErr } = await supabase.from('product_price_tiers')
        .insert({ product_id: prod.id, min_quantity: 1, max_quantity: null, unit_price: price });
      if (tErr) throw tErr;
      const stock = parseInt(form.available);
      if (Number.isInteger(stock) && stock > 0) {
        const { error: sErr } = await supabase.rpc('admin_adjust_inventory', {
          p_product_id: prod.id, p_type: 'ENTRADA', p_quantity: stock, p_notes: 'Estoque inicial do produto',
        });
        if (sErr) throw sErr;
      }
      toast.success('Criado!');
      router.push('/admin/produtos');
    } catch (err: any) { toast.error(err.message); } finally { setLoading(false); }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto p-4">
      <Link href="/admin/produtos"><Button variant="ghost" size="icon"><ArrowLeft/></Button></Link>
      <Card><CardHeader><CardTitle>Novo Produto</CardTitle></CardHeader><CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><Label>Nome *</Label><Input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="h-11"/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Preço R$ *</Label><Input type="number" step="0.01" value={form.unit_price} onChange={e=>setForm({...form,unit_price:e.target.value})} className="h-11 font-bold border-primary/50"/></div>
            <div><Label>Estoque</Label><Input type="number" value={form.available} onChange={e=>setForm({...form,available:e.target.value})} className="h-11"/></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Qtd. Mínima *</Label><Input type="number" value={form.min_order_qty} onChange={e=>setForm({...form,min_order_qty:e.target.value})} className="h-11" placeholder="5"/></div>
            <div><Label>Qtd. Máxima *</Label><Input type="number" value={form.max_order_qty} onChange={e=>setForm({...form,max_order_qty:e.target.value})} className="h-11" placeholder="100"/></div>
          </div>
          <p className="text-xs text-muted-foreground">Na loja do revendedor o - não deixa baixar de {form.min_order_qty} e o + não deixa passar de {form.max_order_qty}</p>
          <div><Label>Descrição</Label><Textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></div>
          <div><Label>Upload de foto</Label><ProductPhotoUpload value={form.photo_url} onChange={(url)=>setForm({...form,photo_url:url})}/></div>
          <Button type="submit" disabled={loading} className="w-full h-12 gradient-primary">{loading?<Loader2 className="animate-spin"/>:'Criar produto'}</Button>
        </form>
      </CardContent></Card>
    </div>
  );
                                     }
