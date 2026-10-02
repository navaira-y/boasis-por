import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Gate: session → verified email → active subscription.
 * Runs on billing + portal routes. Defense in depth: RLS + server checks
 * enforce the same rules even if this file is bypassed.
 */
export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setAll: (cookiesToSet: { name: string; value: string; options?: any }[]) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/signup";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (!user.email_confirmed_at) {
    const url = request.nextUrl.clone();
    url.pathname = "/signup";
    return NextResponse.redirect(url);
  }

  // Billing routes need session + verified email only (this IS the pay gate).
  if (path.startsWith("/billing")) return supabaseResponse;

  // Everything else behind the gate needs an ACTIVE subscription.
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (sub?.status !== "active") {
    const url = request.nextUrl.clone();
    url.pathname = "/billing/pending";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/billing/:path*", "/onboarding/:path*"],
};
