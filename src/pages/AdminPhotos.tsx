/** Admin visit photo feed — /admin/photos. Live as Pros upload. Photos stay private (signed URLs). */
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { useHasRole } from "@/hooks/useHasRole";

type Row = { id: string; visit_id: string; kind: string; storage_path: string; uploaded_at: string; url?: string | null };
type VisitInfo = { id: string; service: string | null; service_type: string | null; visit_date: string | null; status: string | null };

export default function AdminPhotos() {
  const navigate = useNavigate();
  const role = useHasRole("admin") as unknown as { loading?: boolean; hasRole?: boolean } | boolean;
  const [rows, setRows] = useState<Row[] | null>(null);
  const [visits, setVisits] = useState<Record<string, VisitInfo>>({});
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    void (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { navigate("/login?next=/admin/photos"); return; }
      const { data } = await supabase.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
      setAuthed(!!data);
    })();
  }, [navigate]);
  void role;

  const load = useCallback(async () => {
    const { data } = await supabase.from("visit_photos").select("id, visit_id, kind, storage_path, uploaded_at")
      .order("uploaded_at", { ascending: false }).limit(120);
    const list = (data ?? []) as Row[];
    const paths = list.map((r) => r.storage_path);
    const signed = paths.length ? (await supabase.storage.from("visit-photos").createSignedUrls(paths, 3600)).data ?? [] : [];
    const byPath = new Map(signed.map((s) => [s.path, s.signedUrl]));
    setRows(list.map((r) => ({ ...r, url: byPath.get(r.storage_path) ?? null })));
    const ids = [...new Set(list.map((r) => r.visit_id))];
    if (ids.length) {
      const { data: v } = await supabase.from("visits").select("id, service, service_type, visit_date, status").in("id", ids);
      setVisits(Object.fromEntries(((v ?? []) as VisitInfo[]).map((x) => [x.id, x])));
    }
  }, []);

  useEffect(() => {
    if (!authed) return;
    void load();
    const ch = supabase.channel("admin_visit_photos")
      .on("postgres_changes", { event: "*", schema: "public", table: "visit_photos" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [authed, load]);

  if (authed === false) return <main className="p-8">Admins only.</main>;

  const groups = new Map<string, Row[]>();
  (rows ?? []).forEach((r) => groups.set(r.visit_id, [...(groups.get(r.visit_id) ?? []), r]));

  return (
    <main className="mx-auto max-w-6xl p-6">
      <Helmet><title>Visit photos · Tidy admin</title></Helmet>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Visit photos</h1>
        <Link to="/admin/inbox" className="text-sm font-semibold text-primary">Inbox →</Link>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Updates live as Pros upload. Before and after are required to complete a visit. Get member permission before using any photo publicly.</p>
      {rows === null && <p className="mt-6 text-muted-foreground">Loading…</p>}
      {rows?.length === 0 && <p className="mt-6 text-muted-foreground">No photos uploaded yet.</p>}
      <div className="mt-6 space-y-6">
        {[...groups.entries()].map(([vid, list]) => {
          const v = visits[vid];
          return (
            <section key={vid} className="rounded-lg border bg-card p-4">
              <p className="font-semibold">{v?.service ?? v?.service_type ?? "Visit"} · {v?.visit_date ?? ""} <span className="text-xs text-muted-foreground">({v?.status ?? "—"})</span></p>
              {(["before", "after"] as const).map((kind) => {
                const g = list.filter((r) => r.kind === kind);
                return (
                  <div key={kind} className="mt-3">
                    <p className="text-xs font-bold uppercase text-muted-foreground">{kind} · {g.length}</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {g.map((r) => r.url && (
                        <a key={r.id} href={r.url} target="_blank" rel="noreferrer">
                          <img src={r.url} alt={`${kind} photo`} className="h-32 w-32 rounded-md object-cover" />
                        </a>
                      ))}
                    </div>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </main>
  );
}
