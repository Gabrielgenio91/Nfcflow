import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const OWNER_EMAILS = ['gtdadosfreeoficial@gmail.com'];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Se não tem env no Worker, não quebra com 500
  if (!supabaseUrl || !supabaseAnon) {
    console.error('Missing Supabase envs');
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  try {
    // NUNCA use getUser() no middleware no Cloudflare
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user ?? null;

    const pathname = request.nextUrl.pathname;
    const isAuthPage = ['/login','/register','/cadastro','/recuperar-senha'].includes(pathname);
    const isAdminRoute = pathname.startsWith('/admin');
    const isResellerRoute = pathname.startsWith('/painel');

    if (user && isAuthPage) {
      const role = (user.app_metadata as any)?.role;
      const isAdmin = OWNER_EMAILS.includes(user.email || '') || role === 'admin' || role === 'proprietario';
      return NextResponse.redirect(new URL(isAdmin ? '/admin' : '/painel', request.url));
    }

    if (!user && (isAdminRoute || isResellerRoute)) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    return supabaseResponse;
  } catch (e) {
    console.error('Middleware bypass:', e);
    return supabaseResponse; // nunca joga 500
  }
}
