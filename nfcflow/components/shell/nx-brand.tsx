import { NfcMark } from '@/components/landing/landing-logo';
import { cn } from '@/lib/utils';

/** Marca NFCFLOW (símbolo "N" + texto) no estilo da landing page. Somente visual. */
export function NxBrand({
  className,
  markClassName,
  textClassName,
}: {
  className?: string;
  markClassName?: string;
  textClassName?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <NfcMark
        className={cn('h-6 w-auto drop-shadow-[0_0_12px_rgba(123,77,255,0.65)]', markClassName)}
      />
      <span className={cn('text-xl font-extrabold leading-none tracking-tight', textClassName)}>
        <span className="text-white">FC</span>
        <span className="text-[#8b5cf6]">FLOW</span>
      </span>
    </span>
  );
}
