// E2E test for the documenso-webhook edge function.
//
// Seeds a fake applicant, posts a `document.completed` event referencing the
// applicant's stored envelope id, and verifies that contracts_signed flips to
// true and current_stage advances to CONTRACTS_DONE.
//
// Run with:
//   deno test --allow-net --allow-env --allow-read supabase/functions/documenso-webhook/index.test.ts

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Capture the handler that index.ts registers via Deno.serve so we can invoke
// it directly with a synthetic Request — no listener bound, no port conflicts.
type Handler = (req: Request) => Response | Promise<Response>;
let captured: Handler | null = null;
const realServe = Deno.serve;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (handler: Handler) => {
  captured = handler;
  // Return a minimal stub matching Deno.HttpServer shape used in tests.
  return {
    finished: Promise.resolve(),
    shutdown: () => Promise.resolve(),
    ref: () => {},
    unref: () => {},
    addr: { transport: "tcp", hostname: "127.0.0.1", port: 0 },
  } as unknown as ReturnType<typeof realServe>;
};

await import("./index.ts");
// Restore so we don't pollute other tests in the same process.
// deno-lint-ignore no-explicit-any
(Deno as any).serve = realServe;

assert(captured, "documenso-webhook did not register a Deno.serve handler");
const handler = captured!;

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function uniqueDocId() {
  return `test-doc-${crypto.randomUUID()}`;
}

async function seedApplicant(docId: string) {
  const { data, error } = await sb
    .from("applicants")
    .insert({
      first_name: "Webhook",
      last_name: "Test",
      email: `webhook+${crypto.randomUUID()}@example.com`,
      service: "cleaning",
      current_stage: "offer_sent",
      contracts_signed: false,
      documenso_document_ids: { envelope: docId, service_role: "cleaning" },
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function cleanup(applicantId: string) {
  await sb.from("applicants").delete().eq("id", applicantId);
}

Deno.test("document.completed flips contracts_signed and current_stage", async () => {
  const docId = uniqueDocId();
  const applicantId = await seedApplicant(docId);
  try {
    const res = await handler(
      new Request("http://localhost/documenso-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "document.completed",
          payload: { id: docId },
        }),
      }),
    );
    const body = await res.json();
    assertEquals(res.status, 200);
    assertEquals(body.ok, true);
    assertEquals(body.applicant_id, applicantId);
    assertEquals(body.contracts_signed, true);

    const { data: row, error } = await sb
      .from("applicants")
      .select("contracts_signed, current_stage, contracts_signed_at")
      .eq("id", applicantId)
      .single();
    if (error) throw error;
    assertEquals(row.contracts_signed, true);
    assertEquals(row.current_stage, "CONTRACTS_DONE");
    assert(row.contracts_signed_at, "contracts_signed_at should be set");
  } finally {
    await cleanup(applicantId);
  }
});

Deno.test("ignores non-completed events", async () => {
  const res = await handler(
    new Request("http://localhost/documenso-webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "document.sent",
        payload: { id: "irrelevant" },
      }),
    }),
  );
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.ok, true);
  assertEquals(body.ignored, true);
});

Deno.test("returns no_match when document id is unknown", async () => {
  const res = await handler(
    new Request("http://localhost/documenso-webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "document.completed",
        payload: { id: `nonexistent-${crypto.randomUUID()}` },
      }),
    }),
  );
  const body = await res.json();
  assertEquals(res.status, 200);
  assertEquals(body.ok, true);
  assertEquals(body.no_match, true);
});

Deno.test("rejects non-POST methods", async () => {
  const res = await handler(
    new Request("http://localhost/documenso-webhook", { method: "GET" }),
  );
  await res.text();
  assertEquals(res.status, 405);
});
