'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Product } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Loader2, Pencil, Save, X, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ProductPhotoUpload } from '@/components/admin/product-photo-upload';

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [price, setPrice] = useState<number | null>(null);   // preço vigente (faixas de preço)
  const [stockQty, setStockQty] = useState<number>(0);          // estoque central atual
  const [stockReserved, setStockReserved] = useState<number>(0);
  const [editForm, setEditForm] = useState({
    name: '', description: '', photo_url: '', product_type: 'personalizada',
    width: '', height: '', unit: 'cm', status: 'ATIVO', price: '', stock: ''
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('products').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      const prod = data as any;
      setProduct(prod);
      // preço e estoque reais: faixas de preço (usadas pela loja) e estoque central
      const [tiersRes, invRes] = await Promise.all([
        supabase.from('product_price_tiers').select('min_quantity, unit_price').eq('product_id', id).order('min_quantity', { ascending: true }),
        supabase.from('inventory').select('quantity, reserved_quantity').eq('product_id', id).maybeSingle(),
      ]);
      const firstTier = (tiersRes.data as { min_quantity: number; unit_price: number | string }[] | null)?.[0];
      const curPrice = firstTier ? Number(firstTier.unit_price) : null;
      const curQty = Number((invRes.data as any)?.quantity ?? 0);
      setPrice(curPrice);
      setStockQty(curQty);
      setStockReserved(Number((invRes.data as any)?.reserved_quantity ?? 0));
      if (prod) {
        setEditForm({
          name: prod.name || '',
          description: prod.description||'',
          photo_url: prod.photo_url||'',
          product_type: prod.product_type || 'personalizada',
          width: prod.width?.toString()||'',
          height: prod.height?.toString()||'',
          unit: prod.unit||'cm',
          status: prod.status || 'ATIVO',
          price: curPrice != null ? String(curPrice) : '',
          stock: String(curQty)
        });
      }
    } catch {
      toast.error('Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, [supabase, id]);

  useEffect(()=>{fetchData()},[fetchData]);

  // Salva produto + preço (faixas de preço) + estoque. A loja do revendedor e a aba Estoque leem destas mesmas tabelas.
  const saveProduct = async () => {
    if (!product) return;
    if (!editForm.name.trim()) {
      toast.error('Nome obrigatório');
      return;
    }
    const newPrice = Number(String(editForm.price).replace(',', '.'));
    if (isNaN(newPrice) || newPrice <= 0) { toast.error('Preço inválido'); return; }
    const newStock = editForm.stock.trim() === '' ? stockQty : Number(editForm.stock);
    if (!Number.isInteger(newStock) || newStock < 0) { toast.error('Estoque inválido'); return; }
    if (newStock < stockReserved) { toast.error(`O estoque não pode ser menor que o reservado por pedidos (${stockReserved}).`); return; }

    setSavingProduct(true);
    try {
      const w = editForm.width ? Number(String(editForm.width).replace(',', '.')) : null;
      const h = editForm.height ? Number(String(editForm.height).replace(',', '.')) : null;

      const payload: any = {
        name: editForm.name.trim(),
        product_type: editForm.product_type || 'personalizada',
        status: editForm.status,
        unit: editForm.unit || 'cm',
        description: editForm.description.trim() || null,
        photo_url: editForm.photo_url.trim() || null,
      };
      if (w !== null && !isNaN(w)) payload.width = w;
      if (h !== null && !isNaN(h)) payload.height = h;

      const { error } = await supabase.from('products').update(payload).eq('id', product.id);
      if (error) throw error;

      // preço: atualiza as faixas existentes (sem apagar nenhuma); se não houver faixa, cria a faixa única 1+
      if (price == null) {
        const { error: tErr } = await supabase.from('product_price_tiers')
          .insert({ product_id: product.id, min_quantity: 1, max_quantity: null, unit_price: newPrice });
        if (tErr) throw tErr;
      } else if (newPrice !== price) {
        const { error: tErr } = await supabase.from('product_price_tiers')
          .update({ unit_price: newPrice }).eq('product_id', product.id);
        if (tErr) throw tErr;
      }

      // estoque central (RPC existente, com histórico de movimentação)
      if (newStock !== stockQty) {
        const { error: sErr } = await supabase.rpc('admin_adjust_inventory', {
          p_product_id: product.id, p_type: 'AJUSTE', p_quantity: newStock, p_notes: 'Ajuste pela edição do produto',
        });
        if (sErr) throw sErr;
      }

      toast.success('Produto salvo');
      setEditing(false);
      await fetchData();
    } catch (err:any){
      console.error(err);
      toast.error('Erro: '+ (err.message || 'desconhecido'));
    } finally{
      setSavingProduct(false);
    }
  };

  // Esgotado / Disponível: bloqueia/libera compras na loja (catálogo e create_order respeitam o flag)
  const toggleSoldOut = async () => {
    if (!product) return;
    const next = !product.sold_out;
    const { error } = await supabase.from('products').update({ sold_out: next }).eq('id', product.id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success(next ? 'Produto marcado como esgotado' : 'Produto disponível na loja');
    fetchData();
  };

  const deleteProduct = async () => {
    if (!product) return;
    if (!confirm(`Excluir "${product.name}"?`)) return;
    setDeleting(true);
    try {
      await supabase.from('product_price_tiers').delete().eq('product_id', product.id);
      const { error } = await supabase.from('products').delete().eq('id', product.id);
      if (error) throw error;
      toast.success('Excluído');
      router.push('/admin/produtos');
    } catch (err:any){
      toast.error(err.message);
      setDeleting(false);
    }
  };

  const toggleStatus = async () => {
    if (!product) return;
    const ns = product.status==='ATIVO'?'INATIVO':'ATIVO';
    const { error } = await supabase.from('products').update({ status: ns }).eq('id', product.id);
    if (error) { toast.error('Erro'); return; }
    toast.success(ns);
    fetchData();
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!product) return <div className="py-20 text-center"><p>Não encontrado</p><Link href="/admin/produtos"><Button variant="outline">Voltar</Button></Link></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/produtos"><Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button></Link>
        <div className="flex-1"><h1 className="text-2xl font-bold truncate">{product.name}</h1><Badge variant="outline">{product.status}</Badge>{product.sold_out && <Badge variant="outline" className="ml-2 border-destructive/40 text-destructive">Esgotado</Badge>}</div>
        <Button variant="outline" onClick={toggleSoldOut} className={product.sold_out ? '' : 'text-destructive'}>{product.sold_out ? 'Marcar disponível' : 'Marcar esgotado'}</Button>
        <Button variant="outline" onClick={toggleStatus}>{product.status==='ATIVO'?'Desativar':'Ativar'}</Button>
        <Button variant="outline" onClick={()=>setEditing(!editing)}>{editing?<X className="mr-2 h-4 w-4"/>:<Pencil className="mr-2 h-4 w-4"/>}{editing?'Cancelar':'Editar'}</Button>
        <Button variant="destructive" onClick={deleteProduct} disabled={deleting}>{deleting?<Loader2 className="h-4 w-4 animate-spin"/>:<Trash2 className="h-4 w-4"/>}</Button>
      </div>
      <Card><CardHeader><CardTitle className="text-base">{editing?'Editar produto':'Info'}</CardTitle></CardHeader>
        <CardContent>
          {editing?(
            <div className="space-y-4">
              <div className="space-y-2"><Label>Nome *</Label><Input value={editForm.name} onChange={e=>setEditForm({...editForm, name:e.target.value})} className="h-11"/></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Preço R$ *</Label><Input type="number" step="0.01" inputMode="decimal" value={editForm.price} onChange={e=>setEditForm({...editForm, price:e.target.value})} className="h-11 font-bold border-primary text-lg"/></div>
                <div className="space-y-2"><Label>Estoque (un.)</Label><Input type="number" min={0} inputMode="numeric" value={editForm.stock} onChange={e=>setEditForm({...editForm, stock:e.target.value})} className="h-11"/></div>
              </div>
              <div className="space-y-2"><Label>Tipo</Label><Input value={editForm.product_type} onChange={e=>setEditForm({...editForm, product_type:e.target.value})} className="h-11"/></div>
              <div className="space-y-2"><Label>Descrição</Label><Textarea value={editForm.description} onChange={e=>setEditForm({...editForm, description:e.target.value})} rows={3}/></div>
              <div className="space-y-2"><Label>Foto</Label><ProductPhotoUpload value={editForm.photo_url} onChange={url=>setEditForm({...editForm, photo_url:url})}/></div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2"><Label>Largura</Label><Input type="number" step="0.01" value={editForm.width} onChange={e=>setEditForm({...editForm, width:e.target.value})} className="h-11"/></div>
                <div className="space-y-2"><Label>Altura</Label><Input type="number" step="0.01" value={editForm.height} onChange={e=>setEditForm({...editForm, height:e.target.value})} className="h-11"/></div>
                <div className="space-y-2"><Label>Unidade</Label><Input value={editForm.unit} onChange={e=>setEditForm({...editForm, unit:e.target.value})} className="h-11"/></div>
              </div>
              <Button onClick={saveProduct} disabled={savingProduct} className="h-11 w-full text-base">{savingProduct?<Loader2 className="h-4 w-4 animate-spin"/>:<><Save className="mr-2 h-4 w-4"/>Salvar</>}</Button>
            </div>
          ):(
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center"><span className="text-muted-foreground">Preço</span><span className="font-bold text-primary text-xl">{price != null ? `R$ ${price.toFixed(2).replace('.', ',')}` : 'Sem preço'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Estoque</span><span>{stockQty} un.{stockReserved > 0 ? ` (${stockReserved} reservadas)` : ''}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tipo</span><span>{product.product_type}</span></div>
              {product.description && <p className="text-muted-foreground pt-2">{product.description}</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
      }
