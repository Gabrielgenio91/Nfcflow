import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const admin = createAdminClient();
    
    const { data, error } = await admin.rpc('create_plaques_batch', {
      p_product_id: body.product_id,
      p_quantity: Number(body.quantity),
      p_actor: null
    });
    
    if (error) throw error;
    
    const tokens = (data as any[]).map(r => r.token);
    return NextResponse.json({ tokens, plaques: data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
