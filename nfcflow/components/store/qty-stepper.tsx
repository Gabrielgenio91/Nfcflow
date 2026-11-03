'use client';

import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
  step?: number;
}

export function QtyStepper({ value, min = 1, max = 100000, onChange, step = 1 }: Props) {
  const clamp = (n: number) => Math.min(Math.max(Number.isFinite(n) ? n : min, min), Math.max(max, min));
  return (
    <div className="flex items-center gap-1.5">
      <Button type="button" variant="outline" size="icon" className="h-11 w-11" aria-label="Diminuir"
        onClick={() => onChange(clamp(value - step))} disabled={value <= min}>
        <Minus className="h-4 w-4" />
      </Button>
      <input
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        onChange={(e) => onChange(clamp(parseInt(e.target.value.replace(/\D/g, ''), 10)))}
        className="h-11 w-16 rounded-xl border border-input bg-white/[0.03] text-center text-base font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Quantidade"
      />
      <Button type="button" variant="outline" size="icon" className="h-11 w-11" aria-label="Aumentar"
        onClick={() => onChange(clamp(value + step))} disabled={value >= max}>
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
