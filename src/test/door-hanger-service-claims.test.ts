import { describe, expect, it } from "vitest";
import fs from "node:fs";
const read = (path: string) => fs.readFileSync(path, "utf8");

describe("door-hanger service claims", () => {
  it("keeps the Terms notice at 48 hours", () => {
    const terms = read("src/pages/Terms.tsx");
    expect(terms).toContain('t("Notify us within 48 hours of any service issue.")');
    expect(terms).not.toContain("within 24 hours of any service issue");
  });
  it("requires both photo kinds before completion", () => {
    const action = read("supabase/functions/pro-visit-action/index.ts");
    const migration = read("drizzle/migrations/0108_lock_completed_visit_photos.sql");
    expect(action).toContain("error: 'photos_required'");
    expect(action).toContain(".eq('kind', 'before')");
    expect(action).toContain(".eq('kind', 'after')");
    expect(migration).toContain("completed_visit_photo_record_locked");
  });
  it("serves private proof only after verifying customer ownership", () => {
    const endpoint = read("supabase/functions/customer-visit-photos/index.ts");
    expect(endpoint).toContain('.eq("user_id", userId)');
    expect(endpoint).toContain('.from("visit-photos").createSignedUrl');
    expect(endpoint).toContain('visit.status !== "complete"');
  });
  it("adds services to one existing subscription without proration", () => {
    const checkout = read("supabase/functions/stripe-create-checkout/index.ts");
    expect(checkout).toContain("add_to_existing");
    expect(checkout).toContain("stripe.subscriptions.update");
    expect(checkout).toContain('proration_behavior: "none"');
  });
  it("uses service-specific consistency wording", () => {
    const bundle = read("src/pages/Bundle.tsx");
    expect(bundle).toContain("the same pro for each service, every visit");
    expect(bundle).not.toContain("one bill, one Pro");
  });
});