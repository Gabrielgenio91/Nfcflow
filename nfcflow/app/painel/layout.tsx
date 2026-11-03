'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/providers/auth-provider';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Home,
  QrCode,
  ShoppingBag,
  MoreHorizontal,
  GraduationCap,
  Loader2,
  LogOut,
  User,
  Store,
  Package,
  Star,
  LifeBuoy,
  ChevronRight,
  X,
  RefreshCw,
  MapPin,
  ShoppingCart,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { isOwner } from '@/lib/auth';
import { NxBrand } from '@/components/shell/nx-brand';
import '@/components/shell/neon.css';
import { CartProvider, useCart } from '@/components/providers/cart-provider';
import { toast } from 'sonner';
import type { Reseller } from '@/lib/types';

const bottomNavItems = [
  { label: 'Início', href: '/painel', icon: Home },
  { label: 'Curso', href: '/painel/curso', icon: GraduationCap },
  { label: 'Plaquinhas', href: '/painel/plaquinhas', icon: QrCode },
  { label: 'Comprar', href: '/painel/comprar', icon: ShoppingBag },
  { label: 'Mais', href: '/painel/mais', icon: MoreHorizontal },
];

function CartButton() {
  const { count } = useCart();
  return (
    <Link href="/painel/carrinho" aria-label="Carrinho" className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-[rgba(139,92,246,0.22)] bg-white/[0.03] text-[#b7b2cc] transition-colors hover:border-[rgba(139,92,246,0.5)] hover:bg-[rgba(123,77,255,0.15)] hover:text-white">
      <ShoppingCart className="h-5 w-5" />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full gradient-primary px-1 text-[10px] font-bold text-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}

function ResellerShell({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [reseller, setReseller] = useState<Reseller | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    if (!loading && (!user || !profile)) {
      router.replace('/login');
      return;
    }
    if (!loading && profile && (profile.role === 'admin' || isOwner(user))) {
      router.replace('/admin');
    }
  }, [user, profile, loading, router]);

  useEffect(() => {
    if (user && profile && profile.role === 'reseller') {
      supabase
        .from('resellers')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setReseller(data as Reseller);
        });
    }
  }, [user, profile, supabase]);

  // Check if reseller is blocked
  useEffect(() => {
    if (reseller && reseller.status === 'BLOQUEADO') {
      // Allow only profile and support pages
      const allowed = ['/painel/mais/perfil', '/painel/mais/suporte'];
      if (!allowed.includes(pathname)) {
        toast.error('Sua conta está bloqueada. Contate o administrador.');
        router.replace('/painel/mais/perfil');
      }
    }
  }, [reseller, pathname, router]);

  if (loading || !user || !profile) {
    return (
      <div className="nx-root flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (profile.role === 'admin' || isOwner(user)) {
    return (
      <div className="nx-root flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const initials = profile.full_name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
  };

  const moreMenuItems = [
    { label: 'Clientes', href: '/painel/mais/clientes', icon: Store },
    { label: 'Meus Pedidos', href: '/painel/mais/pedidos', icon: Package },
    { label: 'Endereços', href: '/painel/mais/enderecos', icon: MapPin },
    { label: 'Avaliação Google', href: '/painel/mais/avaliacao', icon: Star },
    { label: 'Suporte', href: '/painel/mais/suporte', icon: LifeBuoy },
    { label: 'Perfil', href: '/painel/mais/perfil', icon: User },
  ];

  const isActiveHref = (href: string) =>
    href === '/painel' ? pathname === '/painel' : pathname.startsWith(href);
  const sideLinkClass = (active: boolean) =>
    cn(
      'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
      active ? 'nx-nav-active' : 'text-[#a6a0c0] hover:bg-white/[0.05] hover:text-white'
    );

  return (
    <div className="nx-root pb-24 text-[#f4f2fb] lg:pb-0">
      {/* Sidebar (desktop) — mesmos destinos do menu inferior + "Mais" */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col overflow-y-auto border-r border-[rgba(139,92,246,0.18)] bg-[linear-gradient(180deg,rgba(18,12,40,0.96),rgba(8,6,18,0.97))] shadow-[20px_0_60px_-30px_rgba(123,77,255,0.5)] backdrop-blur-xl lg:flex">
        <div className="flex h-16 flex-shrink-0 items-center border-b border-[rgba(139,92,246,0.15)] px-4">
          <div>
            <NxBrand markClassName="h-5" textClassName="text-lg" />
            <p className="mt-1 text-[11px] text-[#8c86a6]">Painel do revendedor</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {bottomNavItems.filter((i) => i.href !== '/painel/mais').map((item) => {
            const active = isActiveHref(item.href);
            return (
              <Link key={item.href} href={item.href} className={sideLinkClass(active)}>
                <item.icon className={cn('h-4 w-4 transition-colors', active ? 'text-[#c4b0ff]' : 'text-[#8c86a6] group-hover:text-[#a98bff]')} />
                {item.label}
              </Link>
            );
          })}
          <div className="my-2 border-t border-[rgba(139,92,246,0.15)]" />
          {moreMenuItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className={sideLinkClass(active)}>
                <item.icon className={cn('h-4 w-4 transition-colors', active ? 'text-[#c4b0ff]' : 'text-[#8c86a6] group-hover:text-[#a98bff]')} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="sticky bottom-0 border-t border-[rgba(139,92,246,0.15)] bg-[#0a0716]/95 p-3 backdrop-blur-xl">
          <div className="flex items-center gap-3 rounded-xl p-2">
            <Avatar className="h-9 w-9 border border-[rgba(139,92,246,0.4)]">
              <AvatarFallback className="bg-[rgba(123,77,255,0.2)] text-xs text-[#c4b0ff]">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{profile.full_name}</p>
              <p className="truncate text-xs text-[#8c86a6]">{user.email}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-[#a6a0c0] transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </aside>

      <div className="min-w-0 lg:pl-64">
        {/* Top header */}
        <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[rgba(139,92,246,0.18)] bg-[#06040e]/75 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl lg:h-16 lg:justify-end lg:px-8">
          <NxBrand className="lg:hidden" markClassName="h-5" textClassName="text-lg" />
          <div className="flex items-center gap-3">
            {reseller && (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
                  reseller.status === 'ATIVO'
                    ? 'border-success/30 bg-success/10 text-success'
                    : 'border-destructive/30 bg-destructive/10 text-destructive'
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', reseller.status === 'ATIVO' ? 'bg-success' : 'bg-destructive')} />
                {reseller.status === 'ATIVO' ? 'Ativo' : 'Bloqueado'}
              </span>
            )}
            <CartButton />
          </div>
        </div>

        {/* Main content */}
        <main className="nx-panel-content mx-auto w-full max-w-2xl px-4 py-6 md:max-w-3xl lg:max-w-6xl lg:px-8 lg:py-8">{children}</main>
        <footer className="mx-auto max-w-2xl px-4 pb-4 text-center text-xs text-[#6f6990]">
          © {new Date().getFullYear()} NFCFLOW
        </footer>
      </div>

      {/* Bottom navigation (celular/tablet) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[rgba(139,92,246,0.2)] bg-[#07050f]/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-2xl items-center justify-around px-2 py-1.5 md:max-w-3xl">
          {bottomNavItems.map((item) => {
            const isActive = isActiveHref(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'relative flex flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-xs transition-colors',
                  isActive ? 'text-[#c4b0ff]' : 'text-[#8c86a6] hover:text-white'
                )}
              >
                {isActive && <span className="absolute -top-1.5 h-0.5 w-8 rounded-full bg-gradient-to-r from-[#7b4dff] to-[#4f7dff] shadow-[0_0_12px_rgba(123,77,255,0.9)]" />}
                <item.icon className={cn('h-5 w-5', isActive && 'drop-shadow-[0_0_8px_rgba(169,139,255,0.8)]')} />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* "Mais" drawer */}
      {pathname.startsWith('/painel/mais') && !pathname.startsWith('/painel/mais/') && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm" onClick={() => router.push('/painel/mais')}>
          <div className="w-full max-w-2xl rounded-t-3xl border border-[rgba(139,92,246,0.25)] bg-[linear-gradient(180deg,rgba(24,16,52,0.98),rgba(10,7,22,0.99))] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-20px_60px_-20px_rgba(123,77,255,0.5)]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Mais opções</h2>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push('/painel')}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-1">
              {moreMenuItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center justify-between rounded-xl px-3 py-3 text-sm transition-colors hover:bg-[rgba(123,77,255,0.12)]"
                >
                  <div className="flex items-center gap-3">
                    <item.icon className="h-5 w-5 text-[#a98bff]" />
                    <span className="font-medium">{item.label}</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-[#8c86a6]" />
                </Link>
              ))}
              <div className="my-2 border-t border-[rgba(139,92,246,0.18)]" />
              <button
                onClick={handleSignOut}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-destructive transition-colors hover:bg-destructive/10"
              >
                <LogOut className="h-5 w-5" />
                <span className="font-medium">Sair</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ResellerLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <ResellerShell>{children}</ResellerShell>
    </CartProvider>
  );
}
