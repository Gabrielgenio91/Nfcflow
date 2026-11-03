/**
 * googlePlacesService — TODA comunicação com o Google Places fica aqui. Server-side apenas.
 * FIX: agora aceita share.google
 */
import { env } from '@/lib/env';

export const GOOGLE_NOT_CONFIGURED_MESSAGE = 'Integração Google ainda não configurada.';

export class GoogleConfigError extends Error {}
export class GoogleLookupError extends Error {}

export interface PlaceCandidate {
  placeId: string;
  name: string;
  address: string | null;
}

export function isConfigured(): boolean {
  return!!env.googlePlacesKey;
}

// Hosts permitidos (evita SSRF)
const ALLOWED_HOSTS = new Set([
  'maps.app.goo.gl', 'goo.gl', 'g.co',
  'share.google', // <<< ADICIONADO
  'www.google.com', 'google.com', 'maps.google.com',
  'www.google.com.br', 'google.com.br',
]);

function assertAllowed(u: URL) {
  if (u.protocol!== 'https:' && u.protocol!== 'http:') throw new GoogleLookupError('Link inválido.');
  if (!ALLOWED_HOSTS.has(u.hostname.toLowerCase())) throw new GoogleLookupError('Informe um link do Google Maps.');
}

async function resolveUrl(input: string): Promise<URL> {
  let u: URL;
  try { u = new URL(input.trim()); } catch { throw new GoogleLookupError('Link inválido.'); }
  assertAllowed(u);

  for (let i = 0; i < 6; i++) {
    const isShort = u.hostname === 'maps.app.goo.gl' || u.hostname === 'goo.gl' || u.hostname === 'g.co' || u.hostname === 'share.google';
    if (!isShort) return u;

    // share.google retorna HTML com redirect via JS, precisa seguir manual + ler location
    const res = await fetch(u.toString(), { redirect: 'manual', cache: 'no-store', headers: { 'User-Agent': 'Mozilla/5.0 (iPhone)' } });
    const loc = res.headers.get('location');

    if (loc) {
      u = new URL(loc, u);
      assertAllowed(u);
      continue;
    }

    // Se não tem location header (caso share.google), lê o HTML e pega o link do maps dentro
    if (u.hostname === 'share.google') {
      try {
        const res2 = await fetch(u.toString(), { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' } });
        const finalUrl = res2.url;
        if (finalUrl && finalUrl!== u.toString()) {
          u = new URL(finalUrl);
          // pode ser google.com/maps/place... já é válido
          return u;
        }
        const html = await res2.text();
        // tenta achar ChIJ ou google.com/maps dentro do HTML
        const chij = html.match(/ChIJ[a-zA-Z0-9_-]{10,}/);
        if (chij) {
          // retorna URL fake mas com place_id pra parse funcionar
          return new URL(`https://www.google.com/maps/place/?q=place_id:${chij[0]}`);
        }
        const mapsLink = html.match(/https:\/\/www\.google\.com\/maps\/place\/[^"']+/);
        if (mapsLink) return new URL(mapsLink[0]);
      } catch {}
    }

    return u;
  }
  return u;
}

interface Parsed { placeId?: string; name?: string; lat?: number; lng?: number }

export function parseMapsUrl(u: URL): Parsed {
  const out: Parsed = {};
  const qPid = u.searchParams.get('place_id') || u.searchParams.get('placeid');
  const full = decodeURIComponent(u.toString());

  //!1sChIJ,!19sChIJ, place_id:ChIJ, q=place_id:ChIJ
  const idMatch = full.match(/!19s(ChIJ[\w-]+)/) || full.match(/!1s(ChIJ[\w-]+)/) || full.match(/ChIJ[\w-]{10,}/) || (qPid? [qPid, qPid] : null);
  if (idMatch) out.placeId = Array.isArray(idMatch)? idMatch[1] || idMatch[0] : idMatch;

  const nameMatch = u.pathname.match(/\/maps\/place\/([^/]+)/);
  if (nameMatch) out.name = decodeURIComponent(nameMatch[1].replace(/\+/g, ' ')).trim();
  else if (u.searchParams.get('q')) {
    const q = u.searchParams.get('q')!.trim();
    out.name = q.replace(/^place_id:/, '');
  }

  const coords = full.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || full.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (coords) { out.lat = parseFloat(coords[1]); out.lng = parseFloat(coords[2]); }
  return out;
}

export function buildReviewLink(placeId: string): string {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
}

export async function findPlace(mapsUrl: string): Promise<PlaceCandidate[]> {
  if (!isConfigured()) throw new GoogleConfigError(GOOGLE_NOT_CONFIGURED_MESSAGE);
  const u = await resolveUrl(mapsUrl);
  const parsed = parseMapsUrl(u);

  if (parsed.placeId &&!parsed.name) {
    return [{ placeId: parsed.placeId, name: 'Estabelecimento identificado pelo link', address: null }];
  }
  if (!parsed.name &&!parsed.placeId) throw new GoogleLookupError('Não foi possível identificar o estabelecimento a partir deste link. Tente usar o link completo do Maps.');

  // Se já tem placeId, valida direto
  if (parsed.placeId) {
    return [{ placeId: parsed.placeId, name: parsed.name || 'Estabelecimento identificado', address: null }];
  }

  const body: Record<string, unknown> = { textQuery: parsed.name, languageCode: 'pt-BR', maxResultCount: 3 };
  if (parsed.lat!= null && parsed.lng!= null) {
    body.locationBias = { circle: { center: { latitude: parsed.lat, longitude: parsed.lng }, radius: 500 } };
  }
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': env.googlePlacesKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) {
    console.error('[google] searchText falhou', res.status);
    throw new GoogleLookupError('O Google não respondeu. Verifique a chave/API e tente novamente.');
  }
  const data = await res.json();
  const candidates: PlaceCandidate[] = (data.places || []).map((p: any) => ({
    placeId: String(p.id), name: String(p.displayName?.text?? ''), address: p.formattedAddress?? null,
  }));
  if (!candidates.length) throw new GoogleLookupError('Nenhum estabelecimento encontrado para este link.');
  return candidates;
}

export function getReviewLink(placeId: string): string {
  if (!/^[\w-]{10,200}$/.test(placeId) &&!placeId.startsWith('ChIJ')) throw new GoogleLookupError('Place ID inválido.');
  return buildReviewLink(placeId);
    }
