/**
 * correiosService - MÍNIMO 5 + ENVELOPE ATÉ 10 UNIDADES
 * 5 unidades = 40g cada = envelope 2x16x22
 */
import { env } from '@/lib/env';

export interface ShippingOption {
  code: string;
  name: string;
  price: number;
  days: number | null;
  isEstimate: boolean;
}

export interface ShippingQuote {
  configured: boolean;
  carrier: 'CORREIOS';
  options: ShippingOption[];
  message?: string;
}

export interface TrackingEvent { date: string | null; description: string; location: string | null }
export interface TrackingResult {
  configured: boolean;
  code: string;
  delivered: boolean;
  events: TrackingEvent[];
  message?: string;
}

export class CorreiosError extends Error {}

export function isConfigured(): boolean {
  return!!(process.env.SUPERFRETE_TOKEN || env.correiosToken);
}

export async function calculateShipping(params: { destinationZip: string; totalUnits: number }): Promise<ShippingQuote> {
  const zip = params.destinationZip.replace(/\D/g, '');
  if (zip.length!== 8) throw new CorreiosError('CEP inválido.');

  const token = process.env.SUPERFRETE_TOKEN;
  const originZip = (env as any).correiosOriginZip || "65900000";

  // --- SUA REGRA ---
  let qtd = params.totalUnits;
  if (qtd < 5) qtd = 5; // trava mínimo

  const pesoUnitario = 0.04;
  const pesoEmbalagem = qtd <= 10? 0.06 : 0.15; // envelope é mais leve que caixa
  let weight = (qtd * pesoUnitario) + pesoEmbalagem;
  if (weight < 0.3) weight = 0.3;

  // AQUI TÁ A MUDANÇA PRINCIPAL
  let height, width, length;
  if (qtd <= 10) {
    // ENVELOPE ATÉ 10 - fica barato
    height = 2;
    width = 16;
    length = 22;
  } else if (qtd < 50) {
    height = 5;
    width = 16;
    length = 22;
  } else if (qtd < 200) {
    height = 10;
    width = 20;
    length = 25;
  } else {
    height = 15;
    width = 25;
    length = 35;
  }

  let services = "1,3,17";
  if (weight >= 1) services = "1,3,4"; // Mini só até 1kg real
  if (weight >= 5) services = "1,3,4";

  try {
    if (!token) throw new Error("Sem token SuperFrete");

    const res = await fetch("https://api.superfrete.com/api/v0/calculator", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "User-Agent": "NFC FLOW"
      },
      body: JSON.stringify({
        from: { postal_code: originZip },
        to: { postal_code: zip },
        package: { height, width, length, weight },
        services
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || "Erro SuperFrete");

    const serviceList = Array.isArray(data)? data : [data];
    const validOptions = serviceList.filter((s: any) =>!s.has_error);

    if (validOptions.length > 0) {
      const sorted = validOptions.sort((a: any, b: any) => a.price - b.price).slice(0, 2);

      const options: ShippingOption[] = sorted.map((s: any) => {
        const isMini = s.service === 17;
        const isJadlogCom = s.service === 3;
        const nome = s.name || (isMini? "Mini Envios" : isJadlogCom? "Jadlog" : "Jadlog Package");

        // Margem menor pra envelope ficar competitivo
        const margem = qtd <= 10? (isMini? 4 : 5) : 8;
        const precoVenda = s.price + margem;

        return {
          // código ÚNICO por serviço (antes, serviços diferentes repetiam JADLOG_PACK e vários rádios ficavam marcados)
          code: isMini? 'MINI' : isJadlogCom? 'JADLOG_COM' : `SERVICO_${s.service}`,
          name: `${nome} - até ${s.delivery_time} dias úteis`,
          price: Number(precoVenda.toFixed(2)),
          days: s.delivery_time,
          isEstimate: false
        };
      });

      options.push({ code: 'RETIRADA', name: 'Retirada em Imperatriz - MA', price: 0, days: 0, isEstimate: false });
      return { configured: true, carrier: 'CORREIOS', options };
    }
    throw new Error("Nenhum frete disponível");

  } catch (e) {
    console.error("[superfrete] erro:", e, { qtd, weight, height, width, length, zip });
    const precoFallback = weight < 1? 19.90 : weight < 3? 34.90 : 59.90;
    return {
      configured: true,
      carrier: 'CORREIOS',
      options: [
        { code: 'JADLOG_COM', name: 'Jadlog - 6 dias úteis (estimado)', price: precoFallback, days: 6, isEstimate: true },
        { code: 'PAC', name: 'PAC - 8 dias úteis (estimado)', price: precoFallback + 5, days: 8, isEstimate: true },
        { code: 'RETIRADA', name: 'Retirada em Imperatriz - MA', price: 0, days: 0, isEstimate: false },
      ],
      message: 'Frete calculado com valor estimado.',
    };
  }
}

export async function getTracking(code: string): Promise<TrackingResult> {
  const clean = code.trim().toUpperCase();
  return { configured: false, code: clean, delivered: false, events: [], message: 'Rastreamento via SuperFrete.' };
                                            }
