import { useId } from 'react';

/**
 * Símbolo "N" da marca NFCFLOW (quatro faixas inclinadas), sempre em roxo.
 * Desenho redesenhado em SVG a partir do símbolo original da plaquinha.
 */
export function NfcMark({ className }: { className?: string }) {
  const gid = useId().replace(/:/g, '');
  return (
    <svg
      viewBox="140 160 990 620"
      className={className}
      role="img"
      aria-label="NFCFLOW"
      focusable="false"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#A47BFF" />
          <stop offset="1" stopColor="#7B4DFF" />
        </linearGradient>
      </defs>
      <g fill={`url(#${gid})`}>
        <path d="M296,240 Q300,230 310,240 L446,430 L376,718 Q366,762 322,762 L200,762 Q155,760 158,712 Z" />
        <path d="M335,215 Q335,190 365,188 L462,188 Q492,190 502,206 L808,746 L702,748 Q662,746 646,722 Z" />
        <path d="M514,194 L600,190 Q640,196 662,232 L797,486 L752,628 Z" />
        <path d="M965,168 L1085,168 Q1115,172 1108,215 L990,680 Q970,745 890,748 Q820,745 780,660 L925,200 Q935,170 965,168 Z" />
      </g>
    </svg>
  );
}

/** Marca completa: símbolo roxo + NFC branco + FLOW roxo. */
export function NfcBrand({ className }: { className?: string }) {
  return (
    <span className={`nf-brand ${className ?? ''}`}>
      <NfcMark className="nf-brand__mark" />
      <span className="nf-brand__word">
        <span className="nf-brand__nfc">FC</span>
        <span className="nf-brand__flow">FLOW</span>
      </span>
    </span>
  );
}
