"use server";

import { revalidatePath } from "next/cache";
import { createAdminSupabase, createServerSupabase } from "@/lib/supabase";
import { getEntitlements, planLimitMessage } from "@/lib/entitlements";

export interface DemoState {
  ok: boolean;
  error?: string;
  message?: string;
}

/** Demo insert proving enforcement: entitlement check → RLS user insert → DB trigger. */
export async function demoAddCompany(
  _prev: DemoState,
  formData: FormData
): Promise<DemoState> {
  const licenceNumber = String(formData.get("licenceNumber") ?? "").trim();
  if (!licenceNumber) return { ok: false, error: "Licence number is required." };

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign up first." };

  const admin = await createAdminSupabase();
  const ent = await getEntitlements(admin, user.id);
  if (!ent.canAddCompany) {
    return { ok: false, error: planLimitMessage(ent.planId) };
  }

  // Insert via the USER client on purpose: proves RLS scoping works.
  const { error } = await supabase.from("companies").insert({
    owner_profile_id: user.id,
    authority_id: "ifza",
    licence_number: licenceNumber,
    name: `Demo company ${licenceNumber}`,
  });

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: "This company is already on Boasis. Ask its owner to invite you.",
      };
    }
    if (error.message.includes("plan company limit")) {
      return { ok: false, error: planLimitMessage(ent.planId) };
    }
    if (error.message.includes("subscription is not active")) {
      return { ok: false, error: "Your subscription is not active." };
    }
    return { ok: false, error: "Could not add the company. Please try again." };
  }

  revalidatePath("/onboarding");
  return { ok: true, message: `Company ${licenceNumber} added.` };
}
