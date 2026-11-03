'use client';

import { useEffect, useMemo, useState } from 'react';
import { GraduationCap, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { youtubeId } from '@/lib/youtube';
import type { Course } from '@/lib/types';

export default function CursoPage() {
  const supabase = useMemo(() => createClient(), []);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  // Cursos cadastrados pelo ADMIN (tabela courses; leitura liberada para usuários logados)
  useEffect(() => {
    supabase.from('courses').select('*').order('position').order('created_at')
      .then(({ data }) => { setCourses((data as Course[]) || []); setLoading(false); });
  }, [supabase]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Curso</h1>
        <p className="mt-1 text-sm text-muted-foreground">Aprenda a vender e instalar as plaquinhas</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : courses.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
              <GraduationCap className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold">Em breve</h2>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              O conteúdo do curso será disponibilizado em breve. Aguarde novidades!
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {courses.map((c, i) => {
            const id = youtubeId(c.youtube_url);
            return (
              <Card key={c.id} className="overflow-hidden">
                {id ? (
                  <div className="aspect-video w-full bg-black">
                    <iframe
                      src={`https://www.youtube-nocookie.com/embed/${id}`}
                      title={c.title}
                      className="h-full w-full"
                      loading="lazy"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                ) : (
                  <a href={c.youtube_url} target="_blank" rel="noopener noreferrer" className="block bg-secondary/50 p-6 text-center text-sm text-primary hover:underline">Abrir vídeo</a>
                )}
                <CardContent className="space-y-1 p-4">
                  <h2 className="font-semibold"><span className="mr-2 text-muted-foreground">{i + 1}.</span>{c.title}</h2>
                  {c.description && <p className="whitespace-pre-line text-sm text-muted-foreground">{c.description}</p>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
