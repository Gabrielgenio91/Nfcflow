import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, nome, cidadeUf, bairro } = body;

    // ============ BUSCA POR NOME (botão Buscar empresa) ============
    if (nome) {
      const query = `${nome} ${bairro? bairro + ' ' : ''} ${cidadeUf || ''}`.trim();
      const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

      // Se tiver chave do Google, vem nome e endereço perfeito igual do print
      if (apiKey) {
        const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.id'
          },
          body: JSON.stringify({ textQuery: query, languageCode: 'pt-BR', maxResultCount: 5 })
        });
        const data = await r.json();
        if (!r.ok) {
          return NextResponse.json({ error: data?.error?.message || 'Google Places recusou a busca. Verifique a chave da API.', candidates: [] }, { status: 502 });
        }
        const candidates = (data.places || []).map((p: any) => ({
          name: p.displayName?.text || nome,
          address: p.formattedAddress,
          cidadeUf,
          bairro: bairro || '',
          place_id: p.id,
          review_link: `https://search.google.com/local/writereview?placeid=${p.id}`,
        }));
        return NextResponse.json({ candidates });
      }

      // Sem chave não existe busca real: não inventamos resultado.
      return NextResponse.json({ error: 'Busca indisponível: configure GOOGLE_PLACES_API_KEY no servidor.', configured: false, candidates: [] }, { status: 503 });
    }

    // ============ SE FOR LINK (seu código original) ============
    if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 });

    if (url.includes('writereview') && url.includes('ChIJ')) {
      return NextResponse.json({ review_link: url, place_id: url.match(/ChIJ[^&]+/)?.[0], candidates: [{ name: 'Link já pronto', address: url, review_link: url, place_id: url.match(/ChIJ[^&]+/)?.[0] }] });
    }

    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' },
    });

    const finalUrl = res.url;
    const html = await res.text();
    const allText = finalUrl + ' ' + html;
    const match1 = allText.match(/!1s(ChIJ[a-zA-Z0-9_-]+)/);
    const match2 = allText.match(/(ChIJ[a-zA-Z0-9_-]{10,})/);
    const placeId = match1?.[1] || match2?.[1] || match2?.[0];

    if (placeId) {
      const reviewLink = `https://search.google.com/local/writereview?placeid=${placeId}`;
      return NextResponse.json({
        review_link: reviewLink,
        place_id: placeId,
        candidates: [{ name: 'Estabelecimento encontrado', address: finalUrl, review_link: reviewLink, place_id: placeId }],
      });
    }

    return NextResponse.json({ error: 'Não achei PlaceID', debug_final_url: finalUrl, candidates: [] }, { status: 404 });

  } catch (err: any) {
    return NextResponse.json({ error: err.message, candidates: [] }, { status: 500 });
  }
    }
