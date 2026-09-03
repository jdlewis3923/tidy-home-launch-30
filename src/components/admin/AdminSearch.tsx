/**
 * AdminSearch — persistent global search bar shown on every /admin page.
 *
 * Opens on click, on "/" and on Cmd/Ctrl+K. The index is built from the live
 * tables at query time (nothing is hardcoded), so it stays accurate as content
 * is added. Empty query shows the full index alphabetically; typing switches to
 * a fuzzy-scored list grouped by type.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fuzzyScoreItem, buildSnippet } from "@/lib/fuzzy";
import { SERVICE_ZIPS } from "@/lib/serviceZips";

export type IndexType =
  | "Onboarding" | "SOP" | "Template" | "Customer"
  | "Pro" | "Job" | "Page" | "Rule" | "ZIP";

export type IndexItem = {
  key: string;
  type: IndexType;
  title: string;
  /** Single-line searchable body; snippet highlights map onto this string. */
  body: string;
  to: string;
};

const TYPE_ORDER: IndexType[] = [
  "Onboarding", "SOP", "Template", "Customer", "Pro", "Job", "Rule", "ZIP", "Page",
];

const oneLine = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();

/** Admin pages come from the nav definition, so new pages appear automatically. */
export function pagesToIndex(nav: { to: string; label: string }[]): IndexItem[] {
  return nav.map((n) => ({
    key: `page:${n.to}`,
    type: "Page" as const,
    title: `${n.label} — admin page`,
    body: `Admin page at ${n.to}`,
    to: n.to,
  }));
}

async function loadIndex(nav: { to: string; label: string }[]): Promise<IndexItem[]> {
  const sb = supabase as any;
  const [modules, docs, templates, customers, pros, jobs, rules] = await Promise.all([
    sb.from("onboarding_module").select("slug, section_number, title, body_md").order("sort_order"),
    sb.from("company_documents").select("id, filename, category, tags, searchable_text").is("archived_at", null).limit(500),
    sb.from("documenso_templates").select("doc_type, label, template_id").limit(200),
    sb.from("profiles").select("id, first_name, last_name, zip, city, phone").limit(1000),
    sb.from("applicants").select("id, first_name, last_name, email, service, zip, current_stage").limit(1000),
    sb.from("visits").select("id, service, visit_date, status, time_window").order("visit_date", { ascending: false }).limit(500),
    sb.from("alert_rule").select("code, title, condition_note, action_text, domain").limit(200),
  ]);

  const items: IndexItem[] = [];

  for (const m of modules.data ?? []) {
    items.push({
      key: `mod:${m.slug}`,
      type: "Onboarding",
      title: `${m.section_number}. ${m.title}`,
      body: oneLine(m.body_md),
      to: `/admin/onboarding?module=${encodeURIComponent(m.slug)}`,
    });
  }
  for (const d of docs.data ?? []) {
    items.push({
      key: `doc:${d.id}`,
      type: "SOP",
      title: oneLine(d.filename),
      body: oneLine(`${d.category ?? ""} ${(d.tags ?? []).join(" ")} ${d.searchable_text ?? ""}`),
      to: "/admin/documents",
    });
  }
  for (const t of templates.data ?? []) {
    items.push({
      key: `tpl:${t.doc_type}`,
      type: "Template",
      title: oneLine(t.label || t.doc_type),
      body: oneLine(`Template ${t.doc_type} ${t.template_id ?? ""}`),
      to: "/admin/documenso-templates",
    });
  }
  for (const c of customers.data ?? []) {
    const name = oneLine(`${c.first_name ?? ""} ${c.last_name ?? ""}`) || "Unnamed customer";
    items.push({
      key: `cus:${c.id}`,
      type: "Customer",
      title: name,
      body: oneLine(`Customer ${c.city ?? ""} ${c.zip ?? ""} ${c.phone ?? ""}`),
      to: "/admin/leads",
    });
  }
  for (const p of pros.data ?? []) {
    const name = oneLine(`${p.first_name ?? ""} ${p.last_name ?? ""}`) || "Unnamed Pro";
    items.push({
      key: `pro:${p.id}`,
      type: "Pro",
      title: name,
      body: oneLine(`Pro ${p.service ?? ""} ${p.zip ?? ""} ${p.current_stage ?? ""} ${p.email ?? ""}`),
      to: "/admin/applicants",
    });
  }
  for (const j of jobs.data ?? []) {
    items.push({
      key: `job:${j.id}`,
      type: "Job",
      title: oneLine(`${j.service ?? "Visit"} — ${j.visit_date ?? "unscheduled"}`),
      body: oneLine(`Job ${j.status ?? ""} ${j.time_window ?? ""}`),
      to: "/admin/schedule",
    });
  }
  for (const r of rules.data ?? []) {
    items.push({
      key: `rule:${r.code}`,
      type: "Rule",
      title: oneLine(r.title || r.code),
      body: oneLine(`${r.domain ?? ""} ${r.condition_note ?? ""} ${r.action_text ?? ""}`),
      to: "/admin/alert-rules",
    });
  }
  for (const z of SERVICE_ZIPS) {
    items.push({
      key: `zip:${z.zip}`,
      type: "ZIP",
      title: `${z.zip} — ${z.label ?? ""}`.trim(),
      body: oneLine(`Service ZIP ${z.zip} ${z.label ?? ""}`),
      to: "/admin/command",
    });
  }
  items.push(...pagesToIndex(nav));

  return items;
}

const BADGE: Record<IndexType, string> = {
  Onboarding: "admin-search__badge--onboarding",
  SOP: "admin-search__badge--sop",
  Template: "admin-search__badge--template",
  Customer: "admin-search__badge--customer",
  Pro: "admin-search__badge--pro",
  Job: "admin-search__badge--job",
  Page: "admin-search__badge--page",
  Rule: "admin-search__badge--rule",
  ZIP: "admin-search__badge--zip",
};

export default function AdminSearch() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<IndexItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const ensureIndex = useCallback(async (nav: { to: string; label: string }[]) => {
    if (items || loading) return;
    setLoading(true);
    try {
      setItems(await loadIndex(nav));
    } finally {
      setLoading(false);
    }
  }, [items, loading]);

  const openPanel = useCallback(() => {
    setOpen(true);
    // Nav labels are read from the rendered rail so pages stay in sync.
    const nav = Array.from(document.querySelectorAll<HTMLAnchorElement>(".admin-hud-rail__item"))
      .map((a) => ({ to: a.getAttribute("href") ?? "", label: a.textContent?.trim() ?? "" }))
      .filter((n) => n.to);
    void ensureIndex(nav);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [ensureIndex]);

  // "/" and Cmd/Ctrl+K open the bar from anywhere in admin.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        openPanel();
        return;
      }
      if (e.key === "/" && !typing) {
        e.preventDefault();
        openPanel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openPanel]);

  const alphabetical = useMemo(
    () => [...(items ?? [])].sort((a, b) => a.title.localeCompare(b.title, "en", { sensitivity: "base" })),
    [items],
  );

  type Row = IndexItem & { snippet: ReturnType<typeof buildSnippet> };

  const rows: Row[] = useMemo(() => {
    const q = query.trim();
    if (!items) return [];
    if (!q) {
      return alphabetical.map((i) => ({ ...i, snippet: buildSnippet(i.body, []) }));
    }
    const scored: { item: IndexItem; score: number; snippet: Row["snippet"] }[] = [];
    for (const i of items) {
      const hit = fuzzyScoreItem(q, i.title, i.body);
      if (!hit) continue;
      const snippet = hit.field === "title"
        ? buildSnippet(i.body, [])
        : buildSnippet(i.body, hit.indices);
      scored.push({ item: i, score: hit.score, snippet });
    }
    scored.sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title));
    // Grouped by type once a query exists.
    const byType = new Map<IndexType, typeof scored>();
    for (const s of scored) {
      if (!byType.has(s.item.type)) byType.set(s.item.type, []);
      byType.get(s.item.type)!.push(s);
    }
    const ordered = TYPE_ORDER.flatMap((t) => byType.get(t) ?? []);
    return ordered.slice(0, 120).map((s) => ({ ...s.item, snippet: s.snippet }));
  }, [items, alphabetical, query]);

  useEffect(() => setCursor(0), [query, open]);

  const close = () => { setOpen(false); setQuery(""); };

  const go = (row: IndexItem | undefined) => {
    if (!row) return;
    close();
    navigate(row.to);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(rows.length - 1, c + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
    if (e.key === "Enter") { e.preventDefault(); go(rows[cursor]); }
  };

  // Keep the highlighted row in view while arrowing.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${cursor}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const grouped = query.trim().length > 0;

  return (
    <>
      <button type="button" onClick={openPanel} className="admin-search-trigger" aria-label="Search everything">
        <Search className="h-3.5 w-3.5" />
        <span className="admin-search-trigger__text">Search everything</span>
        <kbd className="admin-search-trigger__kbd">/</kbd>
      </button>

      {open && (
        <div className="admin-search-overlay" role="dialog" aria-modal="true" aria-label="Global search">
          <button type="button" className="admin-search-backdrop" aria-label="Close search" onClick={close} />
          <div className="admin-search-panel" onKeyDown={onKeyDown}>
            <div className="admin-search-panel__field">
              <Search className="h-4 w-4 shrink-0 opacity-70" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search onboarding, documents, Pros, customers, jobs, ZIPs, rules, pages…"
                className="admin-search-panel__input"
                aria-label="Search query"
              />
              {loading && <Loader2 className="h-4 w-4 animate-spin opacity-70" />}
              <kbd className="admin-search-trigger__kbd">esc</kbd>
            </div>

            <div className="admin-search-panel__list" ref={listRef}>
              {loading && !items && <p className="admin-search-empty">Building index…</p>}
              {items && rows.length === 0 && <p className="admin-search-empty">No matches.</p>}
              {rows.map((r, i) => {
                const prev = rows[i - 1];
                const showHeader = grouped && (!prev || prev.type !== r.type);
                return (
                  <div key={r.key}>
                    {showHeader && <p className="admin-search-group">{r.type}</p>}
                    <button
                      type="button"
                      data-idx={i}
                      onMouseEnter={() => setCursor(i)}
                      onClick={() => go(r)}
                      className={`admin-search-row ${i === cursor ? "is-active" : ""}`}
                    >
                      <span className="admin-search-row__main">
                        <span className="admin-search-row__title">{r.title}</span>
                        <span className="admin-search-row__snippet">
                          {r.snippet.map((p, k) => (
                            p.hit ? <mark key={k} className="admin-search-mark">{p.text}</mark> : <span key={k}>{p.text}</span>
                          ))}
                        </span>
                      </span>
                      <span className={`admin-search__badge ${BADGE[r.type]}`}>{r.type}</span>
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="admin-search-panel__foot">
              <span>↑↓ move</span><span>↵ open</span><span>esc close</span>
              <span className="ml-auto">{rows.length} of {items?.length ?? 0} indexed</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
