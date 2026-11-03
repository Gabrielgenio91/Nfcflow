import { redirect } from 'next/navigation';

/** Rota antiga: o cadastro agora fica em /cadastro (mantém o ?codigo= do convite). */
export default function RegisterRedirect({ searchParams }: { searchParams: { [key: string]: string | string[] | undefined } }) {
  const codigo = typeof searchParams.codigo === 'string' ? searchParams.codigo : '';
  redirect(codigo ? `/cadastro?codigo=${encodeURIComponent(codigo)}` : '/cadastro');
}
