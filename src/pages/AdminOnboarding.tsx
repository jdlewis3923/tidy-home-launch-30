/**
 * AdminOnboarding — the full Pro onboarding program rendered as live, readable
 * content (never a download link), sourced from `onboarding_module`.
 *
 * Also shows per-Pro completion, derived from `onboarding_progress`.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, BookOpen, Users } from "lucide-react";

type Module = {
  id: string;
  slug: string;
  section_number: number;
  title: string;
  body_md: string;
  service_scope: "all" | "house_clean" | "car_wash" | "car_detail";
  required: boolean;
  sort_order: number;
};

type Progress = { pro_id: string; module_slug: string; completed_at: string };

type Pro = { id: string; first_name: string | null; last_name: string | null; service: string | null; current_stage: string | null };

const SCOPES: { value: Module["service_scope"] | "any"; label: string }[] = [
  { value: "any", label: "All tracks" },
  { value: "all", label: "Everyone" },
  { value: "house_clean", label: "House cleaning" },
  { value: "car_wash", label: "Car wash" },
  { value: "car_detail", label: "Car detail" },
];

const SCOPE_LABEL: Record<Module["service_scope"], string> = {
  all: "Everyone",
  house_clean: "House cleaning",
  car_wash: "Car wash",
  car_detail: "Car detail",
};

export default function AdminOnboarding() {
  const [params, setParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [modules, setModules] = useState<Module[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [pros, setPros] = useState<Pro[]>([]);
  const [scope, setScope] = useState<Module["service_scope"] | "any">("any");

  const focusSlug = params.get("module");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = supabase as any;
      const [m, p, a] = await Promise.all([
        sb.from("onboarding_module").select("*").order("sort_order"),
        sb.from("onboarding_progress").select("pro_id, module_slug, completed_at"),
        sb.from("applicants").select("id, first_name, last_name, service, current_stage").order("created_at", { ascending: false }).limit(500),
      ]);
      if (cancelled) return;
      setModules((m.data ?? []) as Module[]);
      setProgress((p.data ?? []) as Progress[]);
      setPros((a.data ?? []) as Pro[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Scroll to a module deep-linked from global search.
  useEffect(() => {
    if (!focusSlug || loading) return;
    document.getElementById(`module-${focusSlug}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusSlug, loading]);

  const visible = useMemo(
    () => (scope === "any" ? modules : modules.filter((m) => m.service_scope === scope || m.service_scope === "all")),
    [modules, scope],
  );

  const requiredCount = useMemo(() => modules.filter((m) => m.required).length, [modules]);

  const perPro = useMemo(() => {
    const requiredSlugs = new Set(modules.filter((m) => m.required).map((m) => m.slug));
    const counts = new Map<string, number>();
    for (const row of progress) {
      if (!requiredSlugs.has(row.module_slug)) continue;
      counts.set(row.pro_id, (counts.get(row.pro_id) ?? 0) + 1);
    }
    return counts;
  }, [modules, progress]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" /> Pro onboarding program
        </h1>
        <p className="text-sm text-muted-foreground">
          {modules.length} sections · {requiredCount} required. Filter by track to see exactly what a Pro must read.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {SCOPES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setScope(s.value)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                scope === s.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </header>

      {/* ---- Program content ---- */}
      <section className="space-y-4">
        {visible.map((m) => (
          <article
            key={m.slug}
            id={`module-${m.slug}`}
            className={`rounded-2xl border border-border bg-card p-5 ${focusSlug === m.slug ? "ring-2 ring-primary" : ""}`}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-bold text-foreground">
                <span className="text-primary">{m.section_number}.</span> {m.title}
              </h2>
              <div className="flex shrink-0 gap-1">
                <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                  {SCOPE_LABEL[m.service_scope]}
                </span>
                {!m.required && (
                  <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Optional</span>
                )}
              </div>
            </div>
            <div className="prose prose-sm mt-3 max-w-none text-foreground dark:prose-invert">
              <ReactMarkdown>{m.body_md}</ReactMarkdown>
            </div>
          </article>
        ))}
        {visible.length === 0 && <p className="text-sm text-muted-foreground">— no data yet</p>}
      </section>

      {/* ---- Per-Pro completion ---- */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" /> Completion by Pro
        </h2>
        <div className="overflow-hidden rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Pro</th>
                <th className="px-4 py-2">Track</th>
                <th className="px-4 py-2">Stage</th>
                <th className="px-4 py-2">Modules complete</th>
              </tr>
            </thead>
            <tbody>
              {pros.map((p) => {
                const done = perPro.get(p.id) ?? 0;
                const complete = requiredCount > 0 && done >= requiredCount;
                return (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-4 py-2 font-medium text-foreground">
                      {[p.first_name, p.last_name].filter(Boolean).join(" ") || "Unnamed Pro"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{p.service ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{p.current_stage ?? "—"}</td>
                    <td className={`px-4 py-2 font-semibold ${complete ? "text-emerald-600" : "text-muted-foreground"}`}>
                      {requiredCount === 0 ? "— no data yet" : `${done} of ${requiredCount} modules complete`}
                    </td>
                  </tr>
                );
              })}
              {pros.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-3 text-muted-foreground">— no data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
