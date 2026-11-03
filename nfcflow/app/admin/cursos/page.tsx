'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { GraduationCap, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/shared/empty-state';
import { youtubeId } from '@/lib/youtube';
import type { Course } from '@/lib/types';

interface Form { title: string; description: string; youtube_url: string; position: string }
const EMPTY: Form = { title: '', description: '', youtube_url: '', position: '0' };

export default function AdminCursosPage() {
  const supabase = useMemo(() => createClient(), []);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('courses').select('*').order('position').order('created_at');
    if (error) toast.error('Erro ao carregar cursos. Rodou a migration 013?');
    setCourses((data as Course[]) || []);
    setLoading(false);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    const next = courses.length ? Math.max(...courses.map((c) => c.position)) + 1 : 1;
    setForm({ ...EMPTY, position: String(next) });
    setEditingId('new');
  };
  const openEdit = (c: Course) => {
    setForm({ title: c.title, description: c.description || '', youtube_url: c.youtube_url, position: String(c.position) });
    setEditingId(c.id);
  };

  const save = async () => {
    if (form.title.trim().length < 2) { toast.error('Informe o título'); return; }
    if (!youtubeId(form.youtube_url)) { toast.error('Cole um link válido do YouTube'); return; }
    const position = parseInt(form.position, 10);
    if (!Number.isInteger(position)) { toast.error('Ordem inválida'); return; }
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      youtube_url: form.youtube_url.trim(),
      position,
    };
    const { error } = editingId === 'new'
      ? await supabase.from('courses').insert(payload)
      : await supabase.from('courses').update(payload).eq('id', editingId as string);
    setSaving(false);
    if (error) { toast.error('Não foi possível salvar o curso'); return; }
    toast.success(editingId === 'new' ? 'Curso criado' : 'Curso atualizado');
    setEditingId(null);
    load();
  };

  const remove = async (c: Course) => {
    if (!confirm(`Excluir o curso "${c.title}"?`)) return;
    const { error } = await supabase.from('courses').delete().eq('id', c.id);
    if (error) { toast.error('Não foi possível excluir'); return; }
    toast.success('Curso excluído');
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cursos</h1>
          <p className="mt-1 text-sm text-muted-foreground">Vídeos do YouTube exibidos na aba Curso dos revendedores.</p>
        </div>
        {editingId === null && (
          <Button onClick={openNew} className="h-11"><Plus className="mr-2 h-4 w-4" /> Novo curso</Button>
        )}
      </div>

      {editingId !== null && (
        <Card className="space-y-4 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{editingId === 'new' ? 'Novo curso' : 'Editar curso'}</h2>
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setEditingId(null)} aria-label="Cancelar"><X className="h-4 w-4" /></Button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-title">Título *</Label>
            <Input id="c-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="h-12" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-desc">Descrição</Label>
            <Textarea id="c-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
            <div className="space-y-1.5">
              <Label htmlFor="c-url">URL do YouTube *</Label>
              <Input id="c-url" type="url" inputMode="url" value={form.youtube_url} onChange={(e) => setForm({ ...form, youtube_url: e.target.value })} placeholder="https://youtu.be/..." className="h-12" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-pos">Ordem</Label>
              <Input id="c-pos" type="number" inputMode="numeric" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} className="h-12" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="h-12 flex-1" onClick={() => setEditingId(null)} disabled={saving}>Cancelar</Button>
            <Button className="h-12 flex-1" onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}</Button>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : courses.length === 0 ? (
        <EmptyState icon={GraduationCap} title="Nenhum curso cadastrado" description="Toque em “Novo curso” para adicionar o primeiro vídeo." />
      ) : (
        <div className="space-y-2">
          {courses.map((c) => (
            <Card key={c.id} className="flex items-center gap-3 p-4">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold">{c.position}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{c.title}</p>
                <p className="truncate text-xs text-muted-foreground">{c.youtube_url}</p>
              </div>
              <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => openEdit(c)} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>
              <Button variant="outline" size="icon" className="h-10 w-10 hover:text-destructive" onClick={() => remove(c)} aria-label="Excluir"><Trash2 className="h-4 w-4" /></Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
