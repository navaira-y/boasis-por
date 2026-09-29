import { redirect } from "next/navigation";
import { createAdminSupabase, createServerSupabase } from "@/lib/supabase";
import { getEntitlements } from "@/lib/entitlements";
import { DemoAddCompanyForm } from "./demo-form";

/**
 * Phase-1 placeholder. Middleware already guarantees an active subscription;
 * this page additionally renders live entitlements and a demo add-company
 * form that proves plan-limit enforcement end to end (Phase-2 replaces it
 * with the full Step 1–9 onboarding).
 */
export const dynamic = "force-dynamic";
export default async function OnboardingPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signup");

  const admin = await createAdminSupabase();
  const ent = await getEntitlements(admin, user.id);
  if (!ent.canAccessPortal) redirect("/billing/pending");

  return (
    <main className="wrap">
      <div className="card">
        <p className="muted small">BOASIS PORTAL · ONBOARDING (PHASE 2 PREVIEW)</p>
        <h1>Your companies</h1>
        <div className="notice">
          Plan: <strong>{ent.planId}</strong> · Companies:{" "}
          <strong>
            {ent.companyCount} / {ent.maxCompanies}
          </strong>
        </div>
        <h2>Demo: add a company</h2>
        <p className="muted small">
          Full Step 1–9 onboarding ships in Phase 2. This demo insert goes
          through the same entitlement check + database trigger the real flow
          will use — try exceeding your plan max.
        </p>
        <DemoAddCompanyForm canAdd={ent.canAddCompany} />
      </div>
    </main>
  );
}
