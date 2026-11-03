'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/auth-provider';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Store,
  Package,
  Star,
  LifeBuoy,
  User,
  ChevronRight,
  LogOut,
  RefreshCw,
  MapPin,
} from 'lucide-react';

const menuItems = [
  { label: 'Clientes', href: '/painel/mais/clientes', icon: Store, badge: null },
  { label: 'Meus Pedidos', href: '/painel/mais/pedidos', icon: Package, badge: null },
  { label: 'Endereços', href: '/painel/mais/enderecos', icon: MapPin, badge: null },
  { label: 'Avaliação Google', href: '/painel/mais/avaliacao', icon: Star, badge: null },
  { label: 'Suporte', href: '/painel/mais/suporte', icon: LifeBuoy, badge: null },
  { label: 'Perfil', href: '/painel/mais/perfil', icon: User, badge: null },
];

export default function MaisPage() {
  const { profile, user, signOut } = useAuth();
  const router = useRouter();

  const initials = profile?.full_name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
  };

  const checkUpdate = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mais</h1>
      </div>

      {/* Profile card */}
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12 border border-border">
            <AvatarFallback className="bg-primary/10 text-sm text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{profile?.full_name}</p>
            <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
          </div>
        </div>
      </Card>

      {/* Menu */}
      <div className="space-y-1">
        {menuItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-4 text-sm transition-colors hover:bg-white/[0.06]"
          >
            <div className="flex items-center gap-3">
              <item.icon className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">{item.label}</span>
              {item.badge && (
                <span className="rounded bg-warning/10 px-2 py-0.5 text-xs text-warning">{item.badge}</span>
              )}
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        ))}
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <Button variant="outline" className="w-full justify-start" onClick={checkUpdate}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Verificar atualização
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={handleSignOut}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sair
        </Button>
      </div>
    </div>
  );
}
