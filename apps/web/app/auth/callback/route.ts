import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/** Email-verification landing: exchange the code for a session, then continue. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.clone();
  const code = url.searchParams.get("code");
  // Default to /signup: it already routes profile-holders to payment and
  // profile-less link-clickers to the resume step. Defaulting to payment
  // stranded link-clickers in a signup↔payment bounce.
  const next = url.searchParams.get("next") ?? "/signup";

  // Only allow internal redirect targets (open-redirect guard).
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/signup";

  if (!code) {
    url.pathname = "/signup";
    url.search = "";
    return NextResponse.redirect(url);
  }

  let response = NextResponse.redirect(new URL(safeNext, request.url));
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
          response = NextResponse.redirect(new URL(safeNext, request.url));
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const retry = request.nextUrl.clone();
    retry.pathname = "/signup";
    retry.searchParams.set("error", "link-expired");
    return NextResponse.redirect(retry);
  }
  return response;
}
