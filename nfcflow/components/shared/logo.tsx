import { QrCode } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Logo em texto: NFC (bold, gradiente roxo→azul) + FLOW (peso 300, branco). */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-baseline tracking-tight', className)}>
      <span className="bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] bg-clip-text font-bold text-transparent">
        NFC
      </span>
      <span className="font-light text-white">FLOW</span>
    </span>
  );
}

/** Ícone quadrado com gradiente da marca. */
export function LogoMark({ className, iconClassName }: { className?: string; iconClassName?: string }) {
  return (
    <div
      className={cn(
        'flex flex-shrink-0 items-center justify-center gradient-primary glow-primary',
        className
      )}
    >
      <QrCode className={cn('text-white', iconClassName)} />
    </div>
  );
}
