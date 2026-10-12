/**
 * /admin/evidence-pack — "Build evidence pack" for a card dispute. One PDF with
 * the scope acceptance (time, IP), plan and price, every visit in the period with
 * GPS and before/after photos, redo and claim history, and every message sent.
 */
import { useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { jsPDF } from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { useHasRoleState } from "@/hooks/useHasRole";
import { toast } from "@/hooks/use-toast";

type J = Record<string, unknown>;
const d = (v: unknown) => (v ? new Date(String(v)).toLocaleString("en-US", { timeZone: "America/New_York" }) : "—");
const iso = (dt: Date) => dt.toISOString().slice(0, 10);

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const blob = await (await fetch(url)).blob();
    return await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(blob); });
  } catch { return null; }
}

export default function AdminEvidencePack() {
  const { hasRole, isLoading } = useHasRoleState("admin");
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [from, setFrom] = useState(iso(new Date(Date.now() - 90 * 864e5)));
  const [to, setTo] = useState(iso(new Date()));
  const [busy, setBusy] = useState(false);
  if (isLoading) return <main className="p-8 text-sm text-muted-foreground">Loading…</main>;
  if (!hasRole) return <Navigate to="/login" replace />;

  const build = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("admin_evidence_pack", { _email: email, _from: from, _to: to });
    if (error || !data) { setBusy(false); toast({ title: "Couldn't build", description: error?.message, variant: "destructive" }); return; }
    const p = data as J;
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const W = doc.internal.pageSize.getWidth(); const H = doc.internal.pageSize.getHeight(); const M = 48;
    let y = M;
    const need = (h: number) => { if (y + h > H - M) { doc.addPage(); y = M; } };
    const h1 = (t: string) => { need(30); doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.text(t, M, y); y += 20; };
    const line = (t: string) => { doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); for (const l of doc.splitTextToSize(t, W - 2 * M)) { need(13); doc.text(l, M, y); y += 13; } };
    const list = (k: string) => (p[k] as J[]) ?? [];

    doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.text("Tidy — dispute evidence pack", M, y); y += 22;
    line(`Customer: ${(p.profile as J | null)?.name ?? ""} <${p.email}>`);
    line(`Disputed period: ${p.from} to ${p.to} · Built ${d(p.built_at)} (Miami time)`); y += 6;

    h1("1. What the customer agreed to");
    if (!list("acceptances").length) line("No stored acceptance found.");
    for (const a of list("acceptances")) line(`${a.service} scope v${a.version} accepted ${d(a.accepted_at)} · IP ${a.ip ?? "—"} · ${a.language} · on ${a.surface}${a.water_consent ? " · water consent given" : ""}\nDevice: ${a.user_agent ?? "—"}\nCheckbox: ${typeof a.checkbox_text === "string" ? a.checkbox_text : JSON.stringify(a.checkbox_text ?? "")}`);

    h1("2. Plan and price");
    for (const s of list("plans")) line(`${(s.services as string[] | null)?.join(", ")} · ${s.cadence} · $${((Number(s.monthly_total_cents) || 0) / 100).toFixed(2)}/month · ${s.status} · started ${d(s.created_at)}`);

    h1("3. Visits in the period");
    if (!list("visits").length) line("No visits in this period.");
    for (const v of list("visits")) {
      line(`${d(v.scheduled)} · ${v.service}${v.kind ? ` (${v.kind})` : ""} · ${v.status}`);
      line(`  Check-in ${d(v.check_in_at)} at ${v.check_in_lat ?? "—"}, ${v.check_in_lng ?? "—"} · Check-out ${d(v.check_out_at)} at ${v.check_out_lat ?? "—"}, ${v.check_out_lng ?? "—"}`);
      const photos = (v.photos as J[]) ?? [];
      line(`  Photos: ${photos.filter((x) => x.kind === "before").length} before, ${photos.filter((x) => x.kind === "after").length} after`);
      const pick = [...photos.filter((x) => x.kind === "before").slice(0, 3), ...photos.filter((x) => x.kind === "after").slice(0, 3)];
      if (pick.length) {
        const { data: urls } = await supabase.storage.from("visit-photos").createSignedUrls(pick.map((x) => String(x.path)), 600);
        const size = (W - 2 * M - 20) / 3; let col = 0;
        for (let i = 0; i < pick.length; i++) {
          const u = urls?.[i]?.signedUrl; const img = u ? await toDataUrl(u) : null;
          if (!img) continue;
          if (col === 0) need(size + 16);
          try { doc.addImage(img, M + col * (size + 10), y, size, size * 0.75); } catch { /* skip unreadable */ }
          doc.setFontSize(7.5); doc.text(`${pick[i].kind} · ${d(pick[i].at)}`, M + col * (size + 10), y + size * 0.75 + 9);
          col += 1; if (col === 3) { col = 0; y += size * 0.75 + 16; }
        }
        if (col) y += size * 0.75 + 16;
      }
    }

    h1("4. Redo and damage claims");
    if (!list("redos").length && !list("damage_claims").length) line("None.");
    for (const r of list("redos")) line(`Redo ${d(r.requested_at)} · ${r.status} · ${r.note ?? ""}${r.missed_items ? ` · items: ${JSON.stringify(r.missed_items)}` : ""}`);
    for (const c of list("damage_claims")) line(`Damage claim ${d(c.reported_at)} · ${c.status} · ${c.description ?? ""}`);

    h1("5. Every message sent to the customer");
    for (const e of list("emails_texts")) line(`${d(e.at)} · ${e.channel} · ${e.template} · ${e.status}`);
    for (const s of list("sms")) line(`${d(s.at)} · text · ${s.type}${s.suppressed ? " (not sent)" : ""}`);
    for (const n of list("notifications")) line(`${d(n.at)} · account notice · ${n.title}: ${n.body}`);
    for (const m of list("messages")) line(`${d(m.at)} · ${m.direction} (${m.sender}) · ${m.body}`);

    doc.save(`tidy-evidence-${String(p.email).replace(/[^a-z0-9]/gi, "_")}-${p.from}-${p.to}.pdf`);
    setBusy(false);
  };

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <header>
        <Link to="/admin" className="text-sm text-muted-foreground hover:underline">← Admin</Link>
        <h1 className="mt-2 text-3xl font-bold text-foreground">Evidence pack</h1>
        <p className="mt-1 text-sm text-muted-foreground">For a card dispute. Downloads one PDF to upload to Stripe.</p>
      </header>
      <section className="space-y-3 rounded-xl border border-border bg-card p-5 text-sm">
        <label className="block font-medium text-foreground">Customer email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded border border-input bg-background p-2" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block font-medium text-foreground">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-full rounded border border-input bg-background p-2" /></label>
          <label className="block font-medium text-foreground">To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full rounded border border-input bg-background p-2" /></label>
        </div>
        <button type="button" disabled={busy || !email.includes("@")} onClick={() => void build()} className="rounded-lg bg-primary px-5 py-2.5 font-bold text-primary-foreground disabled:opacity-50">
          {busy ? "Building…" : "Build evidence pack"}
        </button>
      </section>
    </main>
  );
}
