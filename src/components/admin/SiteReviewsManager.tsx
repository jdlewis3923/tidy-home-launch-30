/**
 * Admin-entered Google reviews, pasted VERBATIM from the live listing.
 * Used on the site whenever the listing card below is filled in.
 * No field is ever rewritten — text is stored and shown exactly as pasted.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Row = {
  id: string; author_name: string; author_photo_url: string | null; rating: number; review_date: string;
  review_text: string; neighborhood: string | null; service: string | null; review_url: string | null;
  verified_at: string; is_published: boolean;
};
const today = () => new Date().toISOString().slice(0, 10);
const blank = { author_name: "", author_photo_url: "", rating: 5, review_date: today(), review_text: "", neighborhood: "", service: "", review_url: "" };
const input = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";

export default function SiteReviewsManager() {
  const db = supabase as any;
  const [rows, setRows] = useState<Row[]>([]);
  const [listing, setListing] = useState({ rating: "", total_count: "", listing_url: "", verified_at: "" });
  const [form, setForm] = useState({ ...blank });

  const load = useCallback(async () => {
    const [l, r] = await Promise.all([
      db.from("google_listing_manual").select("*").eq("id", "tidy").maybeSingle(),
      db.from("site_google_reviews").select("*").order("review_date", { ascending: false }),
    ]);
    if (l.data) setListing({ rating: String(l.data.rating), total_count: String(l.data.total_count), listing_url: l.data.listing_url, verified_at: l.data.verified_at });
    setRows(r.data ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const saveListing = async () => {
    const rating = Number(listing.rating), total = Number(listing.total_count);
    if (!(rating >= 1 && rating <= 5) || !(total >= 0) || !/^https:\/\//.test(listing.listing_url)) return toast.error("Rating 1–5, a count, and the https link to the live listing are required.");
    const { error } = await db.from("google_listing_manual").upsert({ id: "tidy", rating, total_count: total, listing_url: listing.listing_url.trim(), verified_at: today(), updated_at: new Date().toISOString() });
    if (error) return toast.error(error.message);
    toast.success("Listing verified today"); void load();
  };

  const addReview = async () => {
    if (!form.author_name.trim() || !form.review_text.trim()) return toast.error("Name and the verbatim review text are required.");
    const { error } = await db.from("site_google_reviews").insert({
      author_name: form.author_name.trim(), author_photo_url: form.author_photo_url.trim() || null, rating: Number(form.rating),
      review_date: form.review_date, review_text: form.review_text, neighborhood: form.neighborhood.trim() || null,
      service: form.service || null, review_url: form.review_url.trim() || null, verified_at: today(),
    });
    if (error) return toast.error(error.message);
    setForm({ ...blank }); toast.success("Review saved — verified today"); void load();
  };

  const reverify = async (id: string) => { await db.from("site_google_reviews").update({ verified_at: today() }).eq("id", id); void load(); };
  const toggle = async (r: Row) => { await db.from("site_google_reviews").update({ is_published: !r.is_published }).eq("id", r.id); void load(); };
  const remove = async (id: string) => { if (confirm("Delete this review from the site?")) { await db.from("site_google_reviews").delete().eq("id", id); void load(); } };

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-5">
      <div>
        <h2 className="text-lg font-bold text-foreground">Google reviews on the site</h2>
        <p className="text-xs text-muted-foreground">Paste each review exactly as it appears on Google. Never edit, shorten or write one. The site shows nothing until the listing and at least one review are saved.</p>
      </div>

      <div className="grid gap-2 md:grid-cols-4">
        <input className={input} placeholder="Rating on Google (e.g. 4.9)" value={listing.rating} onChange={(e) => setListing({ ...listing, rating: e.target.value })} />
        <input className={input} placeholder="Total review count" value={listing.total_count} onChange={(e) => setListing({ ...listing, total_count: e.target.value })} />
        <input className={`${input} md:col-span-2`} placeholder="https:// link to the live Google listing" value={listing.listing_url} onChange={(e) => setListing({ ...listing, listing_url: e.target.value })} />
        <div className="md:col-span-4 flex items-center gap-3">
          <button onClick={saveListing} className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">Save & mark verified today</button>
          {listing.verified_at && <span className="text-xs text-muted-foreground">Last verified {listing.verified_at}</span>}
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-4 border-t border-border pt-4">
        <input className={input} placeholder="Reviewer name (as on Google)" value={form.author_name} onChange={(e) => setForm({ ...form, author_name: e.target.value })} />
        <select className={input} value={form.rating} onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })}>
          {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} stars</option>)}
        </select>
        <input type="date" className={input} value={form.review_date} onChange={(e) => setForm({ ...form, review_date: e.target.value })} />
        <select className={input} value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })}>
          <option value="">Service (optional)</option><option value="cleaning">Cleaning</option><option value="lawn">Lawn</option><option value="car_care">Car Care</option>
        </select>
        <textarea className={`${input} md:col-span-4 min-h-[90px]`} placeholder="Review text — paste verbatim" value={form.review_text} onChange={(e) => setForm({ ...form, review_text: e.target.value })} />
        <input className={input} placeholder="Neighborhood (if known)" value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} />
        <input className={input} placeholder="Reviewer photo URL (optional)" value={form.author_photo_url} onChange={(e) => setForm({ ...form, author_photo_url: e.target.value })} />
        <input className={`${input} md:col-span-2`} placeholder="Link to this review on Google (optional)" value={form.review_url} onChange={(e) => setForm({ ...form, review_url: e.target.value })} />
        <button onClick={addReview} className="md:col-span-4 justify-self-start rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">Add review</button>
      </div>

      {rows.length > 0 && (
        <ul className="divide-y divide-border border-t border-border">
          {rows.map((r) => (
            <li key={r.id} className="py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{r.author_name}</span>
                <span className="text-muted-foreground">{r.rating}★ · {r.review_date}{r.neighborhood ? ` · ${r.neighborhood}` : ""}</span>
                <span className="text-xs text-muted-foreground">verified {r.verified_at}</span>
                {!r.is_published && <span className="rounded bg-muted px-1.5 text-xs">hidden</span>}
                <span className="ml-auto flex gap-2 text-xs">
                  <button onClick={() => reverify(r.id)} className="underline">Re-verify</button>
                  <button onClick={() => toggle(r)} className="underline">{r.is_published ? "Hide" : "Show"}</button>
                  <button onClick={() => remove(r.id)} className="underline text-destructive">Delete</button>
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-foreground/80">{r.review_text}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
