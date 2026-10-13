import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";

/**
 * This service is the portal app (future app.boasis.ae), not the marketing
 * site (boasis.ae) — so / opens straight at the entry flow, not a homepage.
 * Logged out → signup doors. Signed in → resume signup, or /signin which
 * routes logged-in users (paid → portal, unpaid → payment).
 */
export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect("/signup");
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  redirect(profile ? "/signin" : "/signup");
}
