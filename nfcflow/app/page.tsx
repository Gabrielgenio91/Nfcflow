'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { isOwner } from '@/lib/auth';
import { useAuth } from '@/components/providers/auth-provider';
import { LandingPage } from '@/components/landing/landing-page';

export default function Home() {
  const router = useRouter();
  const { user, profile, loading } = useAuth();

  // Usuário já logado vai direto para o painel correspondente (comportamento original).
  useEffect(() => {
    if (loading) return;

    if (user && profile) {
      router.replace(
        profile.role === 'admin' || isOwner(user)
          ? '/admin'
          : '/painel'
      );
    }
  }, [user, profile, loading, router]);

  if (loading || (user && profile)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return <LandingPage />;
}
