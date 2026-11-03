/** Classes Tailwind do cartão "vidro roxo neon" (sobrescreve o visual padrão do <Card> via tailwind-merge). */
export const NX_CARD =
  'border-[rgba(139,92,246,0.22)] bg-[linear-gradient(160deg,rgba(34,24,66,0.55),rgba(12,9,26,0.72))] shadow-[0_24px_60px_-24px_rgba(0,0,0,0.7),0_0_50px_-30px_rgba(123,77,255,0.55)] hover:border-[rgba(139,92,246,0.45)]';

/** Botão-pílula de filtro/período (ativo = roxo neon). */
export const nxPill = (active: boolean) =>
  active
    ? 'border-[rgba(169,139,255,0.7)] bg-[rgba(123,77,255,0.25)] text-white shadow-[0_0_18px_-4px_rgba(123,77,255,0.8)]'
    : 'border-[rgba(139,92,246,0.2)] bg-white/[0.02] text-[#a6a0c0] hover:border-[rgba(139,92,246,0.45)] hover:text-white';
