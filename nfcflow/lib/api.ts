import { NextResponse } from 'next/server';
import type { z } from 'zod';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { isOwner } from '@/lib/auth';
import { ApiConfigError } from '@/lib/supabase/admin';
import type { Reseller } from '@/lib/types';

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

const DB_ERRORS: Record<string, { status: number; message: (arg?: string) => string }> = {
  INSUFFICIENT_STOCK: { status: 409, message: (a) => `Estoque insuficiente${a ? ` para "${a}"` : ''}. Reduza a quantidade.` },
  PRICE_NOT_FOUND: { status: 409, message: (a) => `Quantidade sem faixa de preço cadastrada${a ? ` para "${a}"` : ''}.` },
  PRODUCT_INACTIVE: { status: 409, message: (a) => `Produto indisponível${a ? `: "${a}"` : ''}.` },
  PRODUCT_NOT_FOUND: { status: 404, message: () => 'Produto não encontrado.' },
  RESELLER_BLOCKED: { status: 403, message: () => 'Sua conta está bloqueada. Contate o administrador.' },
  RESELLER_NOT_FOUND: { status: 403, message: () => 'Cadastro de revendedor não encontrado.' },
  EMPTY_CART: { status: 400, message: () => 'Carrinho vazio.' },
  INVALID_QUANTITY: { status: 400, message: () => 'Quantidade inválida.' },
  INVALID_TRANSITION: { status: 409, message: (a) => `Mudança de status não permitida${a ? ` (${a})` : ''}.` },
  TRACKING_REQUIRED: { status: 400, message: () => 'Informe o código de rastreamento antes de marcar como enviado.' },
  TRACKING_INVALID: { status: 400, message: () => 'Código de rastreamento inválido (8 a 20 letras/números).' },
  CANNOT_CANCEL_STATUS: { status: 409, message: () => 'Este pedido não pode mais ser cancelado.' },
  ORDER_NOT_FOUND: { status: 404, message: () => 'Pedido não encontrado.' },
  FORBIDDEN: { status: 403, message: () => 'Acesso negado.' },
};

export function handleError(err: unknown) {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
  }
  if (err instanceof ApiConfigError) {
    console.error('[config]', err.message);
    return NextResponse.json({ error: 'Servidor não configurado.', code: 'NOT_CONFIGURED' }, { status: 503 });
  }
  const msg = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : '';
  const key = Object.keys(DB_ERRORS).find((k) => msg.includes(k));
  if (key) {
    const arg = msg.split(`${key}:`)[1]?.split('\n')[0]?.trim();
    const e = DB_ERRORS[key];
    return NextResponse.json({ error: e.message(arg), code: key }, { status: e.status });
  }
  console.error('[api]', err);
  return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 });
}

export function isAdminUser(user: User): boolean {
  const role = user.app_metadata?.role as string | undefined;
  return isOwner(user) || role === 'admin' || role === 'proprietario';
}

export async function requireUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new ApiError(401, 'Faça login para continuar.');
  return { supabase, user };
}

export async function requireReseller() {
  const { supabase, user } = await requireUser();
  const { data: reseller } = await supabase
    .from('resellers').select('*').eq('user_id', user.id).maybeSingle();
  if (!reseller) throw new ApiError(403, 'Cadastro de revendedor não encontrado.');
  if ((reseller as Reseller).status !== 'ATIVO') throw new ApiError(403, 'Sua conta está bloqueada. Contate o administrador.');
  return { supabase, user, reseller: reseller as Reseller };
}

export async function requireAdmin() {
  const { supabase, user } = await requireUser();
  if (!isAdminUser(user)) throw new ApiError(403, 'Acesso restrito ao administrador.');
  return { supabase, user };
}

export async function parseJson<S extends z.ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try { body = await req.json(); } catch { throw new ApiError(400, 'Corpo da requisição inválido.'); }
  const r = schema.safeParse(body);
  if (!r.success) throw new ApiError(400, r.error.issues[0]?.message || 'Dados inválidos.');
  return r.data as z.infer<S>;
}
