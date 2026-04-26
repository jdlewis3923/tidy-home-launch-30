/**
 * /admin/setup-catalog — One-time Stripe catalog bootstrap.
 *
 * Phase 2 setup helper. Renders a single button that invokes the
 * `setup-stripe-catalog` edge function with the signed-in admin's JWT.
 * The function:
 *   1. Verifies caller has admin role
 *   2. Backfills 26 catalog rows into stripe_catalog
 *   3. Deletes any existing webhook endpoint at our URL and creates a fresh one
 *   4. Returns the new whsec_... signing secret ONCE
 *
 * After running once, copy the signing secret into Lovable secrets as
 * STRIPE_WEBHOOK_SECRET. This page can then be removed.
 */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface SetupResult {
  ok: boolean;
  catalog_rows_upserted?: number;
  webhook?: { id: string; url: string; events: string[]; rotated: boolean };
  webhook_signing_secret?: string;
  error?: string;
}

export default function AdminSetupCatalog() {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<SetupResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const run = async () => {
    setState("running");
    setErrorMsg("");
    setResult(null);

    // Sanity: require an authenticated session.
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) {
      setErrorMsg("You must be signed in as the admin user (jdlewis3923@gmail.com) to run this.");
      setState("error");
      return;
    }

    const { data, error } = await supabase.functions.invoke("setup-stripe-catalog", {
      body: {},
    });

    if (error) {
      setErrorMsg(error.message);
      setState("error");
      return;
    }
    if (!data?.ok) {
      setErrorMsg(data?.error ?? "Function returned ok=false");
      setResult(data);
      setState("error");
      return;
    }

    setResult(data);
    setState("done");
  };

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-black text-slate-900">Stripe catalog bootstrap</h1>
        <p className="mt-3 text-sm text-slate-600">
          One-time setup. Backfills the 26 live Stripe price IDs into{" "}
          <code className="rounded bg-slate-200 px-1.5 py-0.5 text-xs">stripe_catalog</code>{" "}
          and provisions the production webhook endpoint. Safe to re-run — the
          webhook will be rotated each time.
        </p>

        <button
          type="button"
          onClick={run}
          disabled={state === "running"}
          className="mt-8 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
        >
          {state === "running" ? "Running…" : "Run setup-stripe-catalog"}
        </button>

        {state === "error" && (
          <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <p className="font-semibold">Error</p>
            <p className="mt-1">{errorMsg}</p>
            {result && (
              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all text-xs">
                {JSON.stringify(result, null, 2)}
              </pre>
            )}
          </div>
        )}

        {state === "done" && result?.ok && (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              <p className="font-semibold">✓ Catalog backfilled</p>
              <p className="mt-1">
                {result.catalog_rows_upserted} rows upserted into{" "}
                <code>stripe_catalog</code>.
              </p>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              <p className="font-semibold">
                ✓ Webhook {result.webhook?.rotated ? "rotated" : "created"}
              </p>
              <p className="mt-1 break-all">URL: {result.webhook?.url}</p>
              <p className="mt-1">Endpoint ID: <code>{result.webhook?.id}</code></p>
              <p className="mt-1">Events: {result.webhook?.events.join(", ")}</p>
            </div>

            <div className="rounded-xl border border-amber-300 bg-amber-50 p-5">
              <p className="text-sm font-bold text-amber-900">
                Copy this signing secret into Lovable secrets as
                STRIPE_WEBHOOK_SECRET
              </p>
              <p className="mt-2 text-xs text-amber-800">
                Shown ONCE. Stripe does not allow retrieval of an existing
                signing secret — only on create. Re-run this page to rotate.
              </p>
              <div className="mt-3 rounded-lg border border-amber-300 bg-white p-3 font-mono text-sm break-all text-amber-950">
                {result.webhook_signing_secret}
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(result.webhook_signing_secret ?? "");
                }}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-900 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-800"
              >
                Copy to clipboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
