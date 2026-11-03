'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  GraduationCap,
  LayoutDashboard,
  Users,
  Store,
  Package,
  Warehouse,
  QrCode,
  Settings,
  LogOut,
  Menu,
  X,
  Loader2,
  ShoppingCart,
  LifeBuoy,
  KeyRound,
  Percent,
  ImagePlus,
  DollarSign,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { isOwner } from '@/lib/auth';
import { NxBrand } from '@/components/shell/nx-brand';
import '@/components/shell/neon.css';
import { toast } from 'sonner';

const navItems = [
  { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { label: 'Revendedores', href: '/admin/revendedores', icon: Users },
  { label: 'Clientes', href: '/admin/clientes', icon: Store },
  { label: 'Pedidos', href: '/admin/pedidos', icon: ShoppingCart },
  { label: 'Venda Local', href: '/admin/venda-local', icon: DollarSign },
  { label: 'Produtos', href: '/admin/produtos', icon: Package },
  { label: 'Estoque', href: '/admin/estoque', icon: Warehouse },
  { label: 'Plaquinhas', href: '/admin/plaquinhas', icon: QrCode },
  { label: 'Gerar Plaquinhas', href: '/admin/gerar-plaquinhas', icon: ImagePlus },
  { label: 'Código de Indicação', href: '/admin/codigo-indicacao', icon: KeyRound },
  { label: 'Cursos', href: '/admin/cursos', icon: GraduationCap },
  { label: 'Promoções', href: '/admin/promocoes', icon: Percent },
  { label: 'Suporte', href: '/admin/suporte', icon: LifeBuoy },
  { label: 'Configurações', href: '/admin/configuracoes', icon: Settings },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && (!user || !profile)) {
      router.replace('/login');
      return;
    }
    if (!loading && user && profile && profile.role !== 'admin') {
      if (!isOwner(user)) {
        toast.error('Acesso negado. Apenas o proprietário pode acessar o painel administrativo.');
        router.replace('/painel');
        return;
      }
    }
  }, [user, profile, loading, router]);

  if (loading || !user || !profile) {
    return (
      <div className="nx-root flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (profile.role !== 'admin' && !isOwner(user)) {
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

  return (
    <div className="nx-root text-[#f4f2fb]">
      {/* Mobile / tablet header */}
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-[rgba(139,92,246,0.18)] bg-[#06040e]/75 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl lg:hidden">
        <NxBrand markClassName="h-5" textClassName="text-lg" />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen(true)}
          aria-label="Abrir menu"
          className="h-10 w-10 rounded-xl border border-[rgba(139,92,246,0.25)] bg-white/[0.03] hover:bg-[rgba(123,77,255,0.18)]"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[17rem] max-w-[85vw] transform flex-col overflow-y-auto border-r border-[rgba(139,92,246,0.18)] bg-[linear-gradient(180deg,rgba(18,12,40,0.96),rgba(8,6,18,0.97))] shadow-[20px_0_60px_-30px_rgba(123,77,255,0.5)] backdrop-blur-xl transition-transform duration-300 lg:w-64 lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 flex-shrink-0 items-center justify-between border-b border-[rgba(139,92,246,0.15)] px-4">
          <div className="min-w-0">
            <NxBrand markClassName="h-5" textClassName="text-lg" />
            <p className="mt-1 text-[11px] text-[#8c86a6]">Painel do proprietário</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Fechar menu"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3">
          {navItems.map((item) => {
            const isActive =
              item.href === '/admin'
                ? pathname === '/admin'
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'nx-nav-active'
                    : 'text-[#a6a0c0] hover:bg-white/[0.05] hover:text-white'
                )}
              >
                <item.icon className={cn('h-4 w-4 transition-colors', isActive ? 'text-[#c4b0ff]' : 'text-[#8c86a6] group-hover:text-[#a98bff]')} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="sticky bottom-0 left-0 right-0 mt-4 border-t border-[rgba(139,92,246,0.15)] bg-[#0a0716]/95 p-3 backdrop-blur-xl">
          <div className="flex items-center gap-3 rounded-xl p-2">
            <Avatar className="h-9 w-9 border border-[rgba(139,92,246,0.4)]">
              <AvatarFallback className="bg-[rgba(123,77,255,0.2)] text-xs text-[#c4b0ff]">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{profile.full_name}</p>
              <p className="truncate text-xs text-[#8c86a6]">{user.email}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="mt-2 w-full justify-start text-[#a6a0c0] hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="min-w-0 lg:pl-64">
        <main className="nx-panel-content mx-auto min-h-[calc(100vh-3rem)] w-full max-w-[1400px] p-4 sm:p-6 lg:p-8">{children}</main>
        <footer className="px-4 pb-6 text-center text-xs text-[#6f6990] sm:px-6 lg:px-8">
          © {new Date().getFullYear()} NFCFLOW
        </footer>
      </div>
    </div>
  );
}
