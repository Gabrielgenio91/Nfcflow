'use client';

import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { NX_CARD } from '@/components/shell/styles';
import { Loader2 } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: 'primary' | 'warning' | 'destructive' | 'success';
  loading?: boolean;
}

const accentClasses = {
  primary: 'border-[rgba(139,92,246,0.35)] bg-[rgba(123,77,255,0.16)] text-[#b9a2ff] shadow-[0_0_22px_-6px_rgba(123,77,255,0.8)]',
  warning: 'border-warning/30 bg-warning/10 text-warning shadow-[0_0_22px_-8px_hsl(var(--warning))]',
  destructive: 'border-destructive/30 bg-destructive/10 text-destructive shadow-[0_0_22px_-8px_hsl(var(--destructive))]',
  success: 'border-success/30 bg-success/10 text-success shadow-[0_0_22px_-8px_hsl(var(--success))]',
};

export function StatCard({ label, value, icon: Icon, accent = 'primary', loading }: StatCardProps) {
  return (
    <Card className={cn(NX_CARD, 'relative h-full overflow-hidden p-4 sm:p-5')}>
      <span aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[rgba(123,77,255,0.18)] blur-2xl" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-[#a6a0c0] sm:text-sm">{label}</p>
          {loading ? (
            <Loader2 className="mt-2 h-6 w-6 animate-spin text-muted-foreground" />
          ) : (
            <p className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{value}</p>
          )}
        </div>
        <div
          className={cn(
            'relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border sm:h-11 sm:w-11',
            accentClasses[accent]
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}
