'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';

const BUCKET = 'products';
const MAX_MB = 5;
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

/**
 * Upload de foto do produto para o Supabase Storage (bucket "products").
 * Devolve a URL pública, que é salva no campo da foto do produto (products.photo_url — o campo que a loja já lê).
 */
export function ProductPhotoUpload({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const ext = EXT[file.type];
    if (!ext) { toast.error('Use uma imagem PNG, JPG ou WebP.'); return; }
    if (file.size > MAX_MB * 1024 * 1024) { toast.error(`A foto deve ter no máximo ${MAX_MB} MB.`); return; }
    setUploading(true);
    try {
      const supabase = createClient();
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, cacheControl: '31536000', upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      onChange(data.publicUrl);
      toast.success('Foto enviada');
    } catch (e) {
      console.error(e);
      toast.error('Não foi possível enviar a foto. O bucket "products" existe e o SQL de instruções foi executado?');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      {value ? (
        <div className="flex items-center gap-3 rounded-xl border border-white/10 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Foto do produto" className="h-20 w-20 flex-shrink-0 rounded-lg object-cover" />
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" className="h-10" disabled={uploading} onClick={() => inputRef.current?.click()}>
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />} Trocar foto
            </Button>
            <Button type="button" variant="outline" className="h-10 hover:text-destructive" disabled={uploading} onClick={() => onChange('')}>
              <Trash2 className="mr-2 h-4 w-4" /> Remover
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="flex h-28 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
        >
          {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImagePlus className="h-6 w-6" />}
          {uploading ? 'Enviando…' : 'Upload de foto (PNG, JPG ou WebP até 5 MB)'}
        </button>
      )}
    </div>
  );
}
