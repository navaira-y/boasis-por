import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminSupabase } from "@/lib/supabase";
import { processRenewals } from "@/lib/renewals";

/**
 * Daily renewal run (reminders + expiry). Called by an external scheduler
 * (see docs/DEPLOY.md) with:  Authorization: Bearer <CRON_SECRET>
 * Fails closed: no secret configured → every call is unauthorized.
 */
export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const [scheme, token] = (request.headers.get("authorization") ?? "").split(" ");
  if (scheme !== "Bearer" || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const admin = await createAdminSupabase();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const result = await processRenewals(admin, { appUrl });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("renewals cron failed", e);
    return NextResponse.json({ error: "renewal run failed" }, { status: 500 });
  }
}
